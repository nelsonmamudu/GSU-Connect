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
//   - Rate limits live in the database (global daily cap, per-destination cap,
//     per-account cap) and are counted on NORMALIZED addresses.
//   - Identical generic failure message for expired, consumed, revoked,
//     cross-account and replayed links.

interface Dependencies {
  identify(jwt: string): Promise<string | null>;
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

const reply = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), { status, headers });

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
          'Recovery email confirmed. Password reset links will now go there.'
        );
      }

      // ---- send: issue a fresh challenge -----------------------------------
      if (input.action !== 'send') return reply(400, 'Unsupported action');
      const mail = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      if (mail.length > 254 || !EMAIL_RE.test(mail)) {
        return reply(400, 'Enter a valid email address');
      }

      const link = new URL('/', deps.appUrl());
      if (link.protocol !== 'https:') return reply(503, 'Email delivery unavailable');

      const token = hex(crypto.getRandomValues(new Uint8Array(32)));
      link.hash = `recovery-confirm=${token}`;

      const r = await deps.rpc('request_recovery_email', {
        u,
        mail,
        token_hash: await hash(token),
      });
      if (r.error) {
        const msg = String(r.error.message || '');
        if (msg.includes('limit') || msg.includes('Too many')) {
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
