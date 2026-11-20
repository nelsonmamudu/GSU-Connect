import {resetOrigin} from './redirect.ts';
// GSU Connect — Password Reset Edge Function (Hardened)
// Resolves a Matric Number / Staff ID / Phone Number / GSU email to an account,
// looks up the recovery email on file, generates a Supabase recovery link, and
// emails it via Brevo.
//
// Security properties:
//   - Strict POST-only & input validation (before any DB lookup)
//   - Per-IP and per-identifier rate limiting (durable Postgres RPC + in-memory fallback)
//   - Identical response body, status, headers, and timing floor whether or not the account exists
//   - Zero logging of secrets, service-role keys, tokens, reset URLs, or PII
//
// Required secrets:
//   BREVO_API_KEY       — Brevo transactional API key
//   BREVO_SENDER_EMAIL  — a sender address verified in Brevo
//   ALLOWED_APP_ORIGINS — comma-separated exact HTTPS origins (no wildcards or paths)
//   APP_URL             — the deployed app URL (used as the reset redirect)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BODY_BYTES = 4096;
const WINDOW_SECONDS = 900; // 15 minutes
const WINDOW_MS = WINDOW_SECONDS * 1000;
const IP_MAX_REQUESTS = 10;
const IDENTIFIER_MAX_REQUESTS = 3;
const RESPONSE_FLOOR_MS = 350;

// In-memory fallback sliding-window limiter (used if DB rate-limit RPC is unavailable)
const memoryBuckets = new Map<string, number[]>();

function checkMemoryRateLimit(key: string, maxRequests: number, nowMs: number): boolean {
  const cutoff = nowMs - WINDOW_MS;
  const recent = (memoryBuckets.get(key) ?? []).filter((ts) => ts > cutoff);
  if (recent.length >= maxRequests) {
    memoryBuckets.set(key, recent);
    return false;
  }
  recent.push(nowMs);
  memoryBuckets.set(key, recent);

  // Bound map size to prevent unbounded memory growth across long-lived isolates
  if (memoryBuckets.size > 5000) {
    for (const [k, times] of memoryBuckets.entries()) {
      const alive = times.filter((ts) => ts > cutoff);
      if (alive.length === 0) memoryBuckets.delete(k);
      else memoryBuckets.set(k, alive);
    }
  }
  return true;
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

// Mirrors public.norm_hash: hex(sha256(lower(btrim(txt))))
async function normHash(txt: string): Promise<string> {
  const data = new TextEncoder().encode(txt.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Mirrors public.norm_phone: digits-only, leading 0 -> 234...
function normPhone(txt: string): string {
  const digits = txt.trim().replace(/\D/g, '');
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  return digits;
}

function extractClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first && first.length <= 64) return first;
  }
  const cfIp = req.headers.get('cf-connecting-ip')?.trim();
  if (cfIp && cfIp.length <= 64) return cfIp;
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp && realIp.length <= 64) return realIp;
  return '';
}

function validateIdentifier(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Reject control characters and newlines before trimming
  if (/[\x00-\x1F\x7F]/.test(raw)) return null;
  const trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 120) return null;

  if (trimmed.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return null;
    return trimmed;
  }

  if (!/^[a-zA-Z0-9._+\-/()\s]{3,120}$/.test(trimmed)) return null;
  const alnumCount = trimmed.replace(/[^a-zA-Z0-9]/g, '').length;
  if (alnumCount < 3) return null;
  return trimmed;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function waitResponseFloor(startedAt: number): Promise<void> {
  const jitter = Math.floor(Math.random() * 75);
  const targetMs = RESPONSE_FLOOR_MS + jitter;
  const elapsed = Date.now() - startedAt;
  if (elapsed < targetMs) {
    await new Promise((resolve) => setTimeout(resolve, targetMs - elapsed));
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const startedAt = Date.now();
  const genericSuccess = () => json({ ok: true }, 200);

  try {
    const contentLengthHeader = req.headers.get('content-length');
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_BODY_BYTES) {
      return json({ error: 'Request payload is too large.' }, 413);
    }

    const rawText = await req.text();
    if (new TextEncoder().encode(rawText).length > MAX_BODY_BYTES) {
      return json({ error: 'Request payload is too large.' }, 413);
    }

    let parsedBody: unknown;
    try {
      parsedBody = rawText ? JSON.parse(rawText) : {};
    } catch {
      return json({ error: 'Invalid JSON request body.' }, 400);
    }

    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return json({ error: 'Invalid request payload.' }, 400);
    }

    const identifier = validateIdentifier((parsedBody as { identifier?: unknown }).identifier);
    if (!identifier) {
      return json(
        { error: 'Please enter a valid Matric Number, Staff ID, phone number, or email.' },
        400
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const brevoKey = Deno.env.get('BREVO_API_KEY');
    const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
    const appUrl = Deno.env.get('APP_URL');

    const clientIp = extractClientIp(req);
    const ipHash = clientIp ? await normHash(clientIp) : '';

    const normalizedPhone = !identifier.includes('@') ? normPhone(identifier) : '';
    const canonicalForRateLimit =
      normalizedPhone.length >= 7 && !/[a-zA-Z]/.test(identifier)
        ? normalizedPhone
        : identifier.toLowerCase();
    const identifierRateHash = await normHash(canonicalForRateLimit);

    // Enforce rate limit BEFORE checking secrets or looking up any account.
    if (supabaseUrl && serviceKey) {
      const admin = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      let allowed = true;
      const { data: rpcAllowed, error: rateErr } = await admin.rpc(
        'consume_password_reset_rate_limit',
        {
          p_ip_hash: ipHash,
          p_identifier_hash: identifierRateHash,
          p_window_seconds: WINDOW_SECONDS,
          p_ip_max: IP_MAX_REQUESTS,
          p_identifier_max: IDENTIFIER_MAX_REQUESTS,
        }
      );

      if (!rateErr && typeof rpcAllowed === 'boolean') {
        allowed = rpcAllowed;
      } else {
        const nowMs = Date.now();
        const ipOk = ipHash
          ? checkMemoryRateLimit(`ip:${ipHash}`, IP_MAX_REQUESTS, nowMs)
          : true;
        const idOk = checkMemoryRateLimit(
          `id:${identifierRateHash}`,
          IDENTIFIER_MAX_REQUESTS,
          nowMs
        );
        allowed = ipOk && idOk;
      }

      if (!allowed) {
        await waitResponseFloor(startedAt);
        return json(
          { error: 'Too many password reset requests. Please try again later.' },
          429,
          { 'Retry-After': String(WINDOW_SECONDS) }
        );
      }

      if (!brevoKey || !senderEmail || !appUrl) {
        console.error('password-reset: missing email or app configuration');
        await waitResponseFloor(startedAt);
        return genericSuccess();
      }

      const safeAppUrl = resetOrigin(appUrl, Deno.env.get('ALLOWED_APP_ORIGINS'));
      if (!safeAppUrl) {
        console.error('password-reset: invalid APP_URL configuration');
        await waitResponseFloor(startedAt);
        return genericSuccess();
      }

      // 1. Resolve the identifier to an account via public_lookups hashes.
      const lookupHashes = [await normHash(identifier)];
      if (normalizedPhone.length >= 7) {
        const phoneHash = await normHash(normalizedPhone);
        if (!lookupHashes.includes(phoneHash)) lookupHashes.push(phoneHash);
      }

      const { data: lookup } = await admin
        .from('public_lookups')
        .select('auth_email, owner_id')
        .in('hash_id', lookupHashes)
        .limit(1)
        .maybeSingle();

      if (!lookup?.auth_email || !lookup?.owner_id) {
        await waitResponseFloor(startedAt);
        return genericSuccess();
      }

      // 2. Get the recovery email stored for this account.
      const { data: recovery } = await admin
        .from('account_recovery')
        .select('email')
        .eq('user_id', lookup.owner_id)
        .maybeSingle();
      const toEmail = recovery?.email;
      if (!toEmail) {
        await waitResponseFloor(startedAt);
        return genericSuccess();
      }

      // 3. Generate a Supabase password-recovery link for the auth account.
      const { data: linkData, error: linkError } = await admin.auth.generateLink({
        type: 'recovery',
        email: lookup.auth_email,
        options: { redirectTo: safeAppUrl },
      });
      if (linkError || !linkData?.properties?.hashed_token) {
        console.error('password-reset: generateLink failed', linkError?.status ?? 'unknown');
        await waitResponseFloor(startedAt);
        return genericSuccess();
      }

      const resetUrl =
        `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(linkData.properties.hashed_token)}` +
        `&type=recovery&redirect_to=${encodeURIComponent(safeAppUrl)}`;

      // 4. Email the link to the recovery address via Brevo.
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { email: senderEmail, name: 'GSU Connect' },
          to: [{ email: toEmail }],
          subject: 'Reset your GSU Connect password',
          htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
              <h2 style="color: #047857;">Reset your GSU Connect password</h2>
              <p>We received a request to reset the password for your GSU Connect account.
              Click the button below to choose a new password. This link expires in 1 hour.</p>
              <p style="margin: 24px 0;">
                <a href="${escapeHtmlAttr(resetUrl)}"
                   style="background: #047857; color: #ffffff; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: bold;">
                  Set New Password
                </a>
              </p>
              <p style="color: #666666; font-size: 13px;">If you did not request this, you can safely ignore this email. Your password will not change.</p>
            </div>`,
        }),
      });
      if (!brevoRes.ok) {
        // Log only HTTP status code — never response body, headers, keys, or recipient email.
        console.error('password-reset: email provider returned status', brevoRes.status);
      }

      await waitResponseFloor(startedAt);
      return genericSuccess();
    }

    // Missing Supabase config: still apply memory rate limit & return generic response
    const nowMs = Date.now();
    const ipOk = ipHash ? checkMemoryRateLimit(`ip:${ipHash}`, IP_MAX_REQUESTS, nowMs) : true;
    const idOk = checkMemoryRateLimit(
      `id:${identifierRateHash}`,
      IDENTIFIER_MAX_REQUESTS,
      nowMs
    );
    if (!ipOk || !idOk) {
      await waitResponseFloor(startedAt);
      return json(
        { error: 'Too many password reset requests. Please try again later.' },
        429,
        { 'Retry-After': String(WINDOW_SECONDS) }
      );
    }

    console.error('password-reset: missing required Supabase configuration');
    await waitResponseFloor(startedAt);
    return genericSuccess();
  } catch (err) {
    // Never log raw error objects that could carry request/header metadata.
    const errName = err instanceof Error ? err.name : 'UnknownError';
    console.error('password-reset: unexpected failure', errName);
    await waitResponseFloor(startedAt);
    return genericSuccess();
  }
});
