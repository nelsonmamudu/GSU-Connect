// Recovery-email verification Edge Function — request + confirm only.
//
// Flow: an authenticated user requests a verification link for a candidate
// inbox. We mail a single-use, 60-minute https link carrying a 256-bit token
// in the URL hash. The GSU Connect app (not this function) keeps the token in
// the hash across any login redirect and POSTs action:'confirm' while signed
// in as the same account. The database binds the address atomically — the old
// verified inbox stays active until the new one confirms.
//
// Security properties:
//   - POST-only; GET (and any other verb) never consumes a token, never mails,
//     never reaches the RPC layer.
//   - Requester supplies neither the digest to issue nor the account to bind:
//     the account comes from the verified session, the digest is generated here.
//   - The send action verifies Turnstile before any RPC or quota charge;
//     missing/invalid tokens return the same generic 200 body as success,
//     after the same timing floor, and nothing is counted or sent.
//   - Rate limits live in the database (global daily cap, per-destination cap,
//     per-IP cap, per-account cap) and are counted on NORMALIZED addresses.
//   - Identical generic failure message for expired, consumed, revoked,
//     cross-account and replayed links.

import {verifyTurnstile} from './turnstile.ts';

interface Dependencies {
  identify(jwt: string): Promise<string | null>;
  /** Turnstile secret; the secret never leaves the index wrapper. */
  turnstileSecret(): string | undefined;
  rpc(
    name: string,
    args: Record<string, string>
  ): Promise<{ data?: unknown; error: { message?: string } | null }>;
  appUrl(): string | undefined;
  deliver(address: string, link: string): Promise<boolean>;
  /** Best-effort notice to the OLD inbox after a successful change. Never gates the confirm. */
  notifyChange?(previous: string, current: string): Promise<boolean>;
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

const RESPONSE_FLOOR_MS = 350;

async function waitResponseFloor(startedAt: number): Promise<void> {
  const jitter = Math.floor(Math.random() * 75);
  const targetMs = RESPONSE_FLOOR_MS + jitter;
  const elapsed = Date.now() - startedAt;
  if (elapsed < targetMs) {
    await new Promise((resolve) => setTimeout(resolve, targetMs - elapsed));
  }
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

const AMR_FRESH_MS = 15 * 60 * 1000;       // amr timestamps are Unix SECONDS
const AMR_SKEW_MS = 5 * 60 * 1000;        // tolerate clock skew between client and auth server

/** Decode the (already-authenticated) JWT payload for claim inspection only. */
const decodeJwtPayload = (jwt: string): Record<string, unknown> | null => {
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(pad);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/**
 * Fresh-authentication check for REPLACING an existing verified inbox.
 * Reads the token's `amr` claim — Authentication Method References — whose
 * timestamps are the times of the actual authentication events (Unix seconds,
 * most-recent first). A plain token REFRESH does NOT bump these (verified
 * against supabase/auth source: refresh re-issues the access token from the
 * session's stored AMRClaims rows; only issue-time/MFA-verify call
 * AddClaimToSession, which sets the row's updated_at). So an old `amr` means
 * the user authenticated a while ago; a fresh `amr` means they just did —
 * hijacked long-lived sessions fail this check.
 *
 * Fail closed: missing payload, missing/empty amr, any malformed entry, or a
 * newest timestamp older than the window => not fresh.
 */
const hasFreshAuthentication = (jwt: string, nowMs: number = Date.now()): boolean => {
  const payload = decodeJwtPayload(jwt);
  const amr = payload?.amr;
  if (!Array.isArray(amr) || amr.length === 0) return false;
  let newest = Number.NEGATIVE_INFINITY;
  for (const entry of amr) {
    if (!entry || typeof entry !== 'object') return false;
    const method = (entry as { method?: unknown }).method;
    const ts = Number((entry as { timestamp?: unknown }).timestamp);
    if (typeof method !== 'string' || method.trim() === '' || !Number.isFinite(ts) || ts <= 0) {
      return false;
    }
    if (ts * 1000 > newest) newest = ts * 1000;
  }
  const ageMs = nowMs - newest;
  return ageMs <= AMR_FRESH_MS && -ageMs <= AMR_SKEW_MS;
};

/**
 * ip_hash is an HMAC-SHA256 of the client IP, keyed by an existing function
 * secret (TURNSTILE_SECRET_KEY — the one secret guaranteed present whenever a
 * send proceeds, since Turnstile is verified first) and domain-separated by
 * the 'recovery-ip:' prefix. It is NEVER a bare SHA-256 of the IP (an
 * IPv4 address is only ~32 bits of entropy and would be trivially
 * reversible from a leaked ledger) and never the raw IP.
 */
const hmacSha256 = async (secret: string, message: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return hex(new Uint8Array(signature));
};

const reply = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), { status, headers });

/** Distinct machine-readable code so the client can route to a sign-in screen. */
const replyWithCode = (status: number, message: string, code: string) =>
  new Response(JSON.stringify({ message, code }), { status, headers });

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const hash = async (s: string) =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));

async function smallJson(req: Request): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) throw Error('empty body');
  let bytes = 0;
  let text = '';
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 2048) {
      await reader.cancel();
      throw Error('payload too large');
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}

// Deliberately identical for expired, consumed, revoked, cross-account and replayed links.
const INVALID_LINK = 'Link invalid, expired or already used. Request a fresh link.';

const EMAIL_RE = /^[a-z0-9][a-z0-9._+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;

export function recoveryEmailHandler(deps: Dependencies) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers });
    if (req.method !== 'POST') return reply(405, 'Method not allowed.');

    const startedAt = Date.now();
    try {
      const auth = req.headers.get('Authorization') || '';
      if (!auth.startsWith('Bearer ')) return reply(401, 'Sign in required');
      const u = await deps.identify(auth.slice(7));
      if (!u) return reply(401, 'Sign in again');

      const input = (await smallJson(req)) as Record<string, unknown>;

      // ---- confirm: consume a token for the calling account ----------------
      if (input.action === 'confirm') {
        const token = typeof input.token === 'string' ? input.token.trim() : '';
        if (!/^[0-9a-f]{64}$/.test(token)) return reply(400, INVALID_LINK);
        const r = await deps.rpc('confirm_recovery_email', { u, token_hash: await hash(token) });
        if (r.error) {
          const msg = String(r.error.message || '');
          if (msg.includes('already linked')) {
            return reply(409, 'That address is already linked to another account.');
          }
          return reply(400, INVALID_LINK);
        }
        const bound = (r.data ?? {}) as { previous?: string | null; current?: string | null };
        // Best-effort notice to the inbox being replaced; never fails the confirm.
        if (
          typeof bound.previous === 'string' &&
          bound.previous &&
          bound.previous !== bound.current &&
          deps.notifyChange
        ) {
          try {
            await deps.notifyChange(bound.previous, bound.current ?? '');
          } catch {
            console.error('recovery-email: change notification failed');
          }
        }
        return reply(
          200,
          'This inbox is now your verified recovery address.'
        );
      }

      // ---- send: issue a fresh challenge -----------------------------------
      if (input.action !== 'send') return reply(400, 'Unsupported action');
      const mail = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      if (mail.length > 254 || !EMAIL_RE.test(mail)) {
        return reply(400, 'Enter a valid email address');
      }

      // Turnstile BEFORE any RPC or quota charge — same generic-failure shape
      // and timing floor as password-reset. Failure returns the same 200 body
      // as success: nothing is sent, counted or looked up.
      if (!await verifyTurnstile((input as {captchaToken?:unknown}).captchaToken, deps.turnstileSecret())) {
        await waitResponseFloor(startedAt);
        return reply(200, 'Check your inbox. The link expires in 60 minutes.');
      }

      // ---- fresh-authentication gate for CHANGING a verified inbox ----------
      // Runs after Turnstile (no RPC happens before it) and only for sends.
      // Confirm is deliberately not gated: a link can only exist after a send
      // passed this check, and the confirmation link expires in 60 minutes.
      const binding = await deps.rpc('has_verified_recovery', { u });
      if (binding.error) {
        // Fail closed: we cannot learn binding state, so we cannot safely
        // relax the freshness requirement.
        return reply(503, 'Could not complete recovery email request');
      }
      if (binding.data === true && !hasFreshAuthentication(auth.slice(7))) {
        return replyWithCode(
          403,
          'Sign in again to change your verified recovery address.',
          'reauth_required'
        );
      }

      const link = new URL('/', deps.appUrl());
      if (link.protocol !== 'https:') return reply(503, 'Email delivery unavailable');

      const token = hex(crypto.getRandomValues(new Uint8Array(32)));
      link.hash = `recovery-confirm=${token}`;

      const clientIp = extractClientIp(req);
      const pepper = deps.turnstileSecret()?.trim();
      // Turnstile has already passed at this point, so the pepper exists;
      // if it somehow does not, fail closed: skip the per-IP ledger instead
      // of storing an unsalted or empty-keyed hash.
      const ipHash = clientIp && pepper ? await hmacSha256(pepper, `recovery-ip:${clientIp}`) : '';
      const r = await deps.rpc('request_recovery_email', {
        u,
        mail,
        token_hash: await hash(token),
        ip_hash: ipHash,
      });
      if (r.error) {
        const msg = String(r.error.message || '');
        if (msg.includes('limit') || msg.includes('Too many') || msg.includes('network')) {
          return reply(
            429,
            'Please wait before requesting another verification link.'
          );
        }
        if (msg.includes('Invalid email')) return reply(400, 'Enter a valid email address');
        return reply(400, 'Cannot send a verification link now. Try again later.');
      }

      return (await deps.deliver(mail, link.href))
        ? reply(200, 'Check your inbox. The link expires in 60 minutes.')
        : reply(503, 'Delivery failed. Try again later.');
    } catch {
      return reply(400, 'Could not complete recovery email request');
    }
  };
}
