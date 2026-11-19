// Called by Vercel Cron. Never accepts a bucket, applicant, or path from the caller.
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET,
    supplied = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return res.status(401).end();
  try {
    const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let removed = 0;
    for (let i = 0; i < 10; i++) {
      const { data, error } = await db.rpc('entry_cleanup_batch');
      if (error) throw error;
      const paths = data.map((row) => row.path);
      if (!paths.length) break;
      const result = await db.storage.from('id-cards').remove(paths);
      if (result.error) throw result.error;
      const ack = await db.rpc('entry_cleanup_ack', { paths });
      if (ack.error || ack.data !== true) throw Error('Objects still queued');
      removed += paths.length;
    }
    return res.status(200).json({ processed: removed });
  } catch {
    return res
      .status(503)
      .json({ error: 'Cleanup incomplete; outstanding objects remain queued.' });
  }
}
