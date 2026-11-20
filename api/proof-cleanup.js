// Daily proof cleanup — Vercel Cron -> /api/proof-cleanup
//
// History: this endpoint was frozen in eaf0235 (503 when VERCEL_ENV=production)
// because the approval-time dispatch ran through pg_net, whose request queue was
// readable by anon/authenticated on hosted Supabase and carried the bearer token.
// That gate is gone: nothing is dispatched from the database any more (no pg_net,
// no token in Vault), the queue only holds paths, and this handler is the single
// place that deletes. Authentication is CRON_SECRET only.
//
// Contract:
//   * rejects anything without the exact "Bearer <CRON_SECRET>" (401)
//   * takes NO input: query string, body and headers are ignored
//   * deletes only (a) queued paths whose owner is approved, (b) verified orphans
//   * running it twice is safe (ack only clears rows whose object is gone)
//   * reports counts on success, stage and code on failure — never paths, names or file ids
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

const bearerOk = (header) => {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(header || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return Boolean(secret) && supplied.length === expected.length && timingSafeEqual(supplied, expected);
};

// Diagnostic hints only: an unverified JWT claim is not evidence of authorization.
function invalidKeyDiag(keyEnv, urlEnv, key, url) {
  let keyType = 'unknown';
  let keyRef = null;
  let urlRef = null;
  try {
    urlRef = /^([a-z0-9-]+)\.supabase\.co$/.exec(new URL(url).hostname)?.[1] ?? null;
  } catch { /* Not a project URL. */ }
  if (key.startsWith('sb_secret_')) keyType = 'sb_secret';
  else if (key.startsWith('sb_publishable_')) keyType = 'sb_publishable';
  else {
    const payload = /^[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/.exec(key)?.[1];
    if (payload) {
      try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (claims && typeof claims === 'object' && !Array.isArray(claims)) {
          keyType = claims.role === 'service_role' ? 'jwt_service_role' : claims.role === 'anon' ? 'jwt_anon' : 'jwt_other';
          if (typeof claims.ref === 'string' && /^[a-z0-9-]{1,63}$/.test(claims.ref)) keyRef = claims.ref;
        }
      } catch { /* Malformed payload: leave the type unknown. */ }
    }
  }
  return { keyEnv, urlEnv, keyType, keyRef, urlRef, refMatch: keyRef === null ? null : keyRef === urlRef };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Vercel Cron calls with GET + the Authorization header; manual runs use the same
  // header. Nothing else is read from the request.
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!bearerOk(req.headers.authorization)) return res.status(401).json({ error: 'Unauthorized' });

  const urlEnv = process.env.VITE_SUPABASE_URL ? 'VITE_SUPABASE_URL' : 'SUPABASE_URL';
  const url = process.env[urlEnv];
  const keyEnv = process.env.GSU_SUPABASE_SECRET_KEY ? 'GSU_SUPABASE_SECRET_KEY' : 'SUPABASE_SERVICE_ROLE_KEY';
  const key = process.env[keyEnv];
  if (!url || !key) return res.status(500).json({ error: 'Server not configured' });

  const diag = invalidKeyDiag(keyEnv, urlEnv, key, url);
  if (diag.keyType.startsWith('jwt_') && diag.refMatch !== true) {
    return res.status(503).json({ error: 'Cleanup incomplete; queued objects remain', stage: 'init', code: null, kind: 'config_mismatch' });
  }

  let stage = 'init';
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    let approved = 0;
    let orphans = 0;

    // 1. Queued proofs whose owner is approved. The RPC re-checks the owner at read
    //    time, so a path is never removed for a pending/rejected/suspended account.
    for (let i = 0; i < 5; i++) {
      stage = 'batch_rpc';
      const { data, error } = await db.rpc('entry_cleanup_batch_approved', { p_limit: 100 });
      if (error) throw error;
      const paths = (data ?? []).map((row) => row.path);
      if (paths.length === 0) break;

      stage = 'storage_remove';
      const removed = await db.storage.from('id-cards').remove(paths);
      if (removed.error) throw removed.error;

      stage = 'ack';
      const ack = await db.rpc('entry_cleanup_ack', { paths });
      if (ack.error) throw ack.error;
      if (ack.data !== true) throw new Error();
      approved += paths.length;
    }

    // 2. Verified orphans: objects whose first path segment has no profile row at all.
    for (let i = 0; i < 2; i++) {
      stage = 'orphan_rpc';
      const { data, error } = await db.rpc('entry_orphan_batch', { p_limit: 50 });
      if (error) throw error;
      const paths = data ?? [];
      if (paths.length === 0) break;

      stage = 'orphan_remove';
      const removed = await db.storage.from('id-cards').remove(paths);
      if (removed.error) throw removed.error;
      orphans += paths.length;
    }

    return res.status(200).json({ deleted: approved + orphans, approved, orphans });
  } catch (error) {
    const code = [error?.code, error?.status].find(value =>
      Number.isSafeInteger(value) || (typeof value === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(value))
    ) ?? null;
    const message = typeof error?.message === 'string' ? error.message : '';
    let kind = 'other';
    if (/invalid api key|jwt|apikey/i.test(message)) kind = 'invalid_key';
    else if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(message)) kind = 'network';
    else if (error?.code === '42501' || /permission denied/i.test(message)) kind = 'permission';
    else if (error?.code === '42883' || error?.code === 'PGRST202') kind = 'missing_function';
    const details = { stage, code, kind };
    if (kind === 'invalid_key') details.diag = diag;
    console.error(JSON.stringify(details));
    return res.status(503).json({ error: 'Cleanup incomplete; queued objects remain', ...details });
  }
}
