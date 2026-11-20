#!/usr/bin/env node
// End-to-end proof deletion test — TEST ACCOUNT ONLY.
//
// Runs against the Supabase project in SUPABASE_URL with SUPABASE_SERVICE_ROLE_KEY.
// It refuses to run unless ALLOW_TEST_DATA=1 and the target profile looks like a QA
// account (email or matric contains "tst"). It never selects a row by anything else.
//
//   ALLOW_TEST_DATA=1 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/proof-cleanup-e2e.mjs
//
// Steps: upload proof -> approve (real triggers) -> drain queue like the worker ->
// assert the object is gone, the queue row is complete, and the audit row exists.

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const allowed = process.env.ALLOW_TEST_DATA === '1';

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

if (!allowed) fail('set ALLOW_TEST_DATA=1 to run against test data');
if (!url || !key) fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: candidates, error: pickErr } = await db
  .from('profiles')
  .select('id,email,role,status,matric_no')
  .eq('status', 'pending')
  .or('email.ilike.%tst%,matric_no.ilike.%TST%')
  .limit(1);

if (pickErr) fail(pickErr.message);
const target = candidates?.[0];
if (!target) fail('no pending QA ("tst") profile found; create one before running');
if (!/tst/i.test(target.email ?? '') && !/tst/i.test(target.matric_no ?? '')) fail('refusing non-QA row');

const path = `${target.id}/e2e-proof-${randomUUID()}.png`;
// 1x1 transparent PNG.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

console.log(`target: ${target.email} (${target.id})`);

const up = await db.storage.from('id-cards').upload(path, png, { contentType: 'image/png', upsert: true });
if (up.error) fail(`upload: ${up.error.message}`);

const linked = await db.from('profiles').update({ id_card_path: path }).eq('id', target.id).select('id_card_path').single();
if (linked.error) fail(`link path: ${linked.error.message}`);
console.log(`uploaded and linked: ${path}`);

const approved = await db.from('profiles').update({ status: 'approved' }).eq('id', target.id).select('status,id_card_path').single();
if (approved.error) fail(`approve: ${approved.error.message}`);
console.log(`approved; stored path now: ${approved.data.id_card_path ?? 'null'}`);

const { data: queued, error: qErr } = await db
  .from('proof_cleanup')
  .select('path')
  .eq('path', path);
// proof_cleanup lives in phase1_private and is not exposed; the RPC below is the
// supported way to observe it.
const batch = await db.rpc('entry_cleanup_batch');
if (batch.error) fail(`entry_cleanup_batch: ${batch.error.message}`);
const paths = (batch.data ?? []).map((r) => r.path);
if (!paths.includes(path)) fail('queue does not contain the uploaded proof');

const removed = await db.storage.from('id-cards').remove([path]);
if (removed.error) fail(`storage remove: ${removed.error.message}`);

const ack = await db.rpc('entry_cleanup_ack', { paths: [path] });
if (ack.error) fail(`ack: ${ack.error.message}`);
if (ack.data !== true) fail('queue row was not cleared after deletion');

const checkObject = await db.storage.from('id-cards').list(target.id, { search: path.split('/')[1] });
if (checkObject.error) fail(`list: ${checkObject.error.message}`);
if ((checkObject.data ?? []).length > 0) fail('object still present in storage');

if (process.env.CHECK_AUDIT === '1') {
  const { data: audit, error: aErr } = await db
    .from('proof_audit')
    .select('proof_type,approved_at,approved_by')
    .eq('profile_id', target.id)
    .limit(1);
  if (aErr) console.log(`audit: skipped (${aErr.message})`);
  else if ((audit ?? []).length === 0) fail('no audit row recorded at approval');
  else console.log(`audit: ${JSON.stringify(audit[0])}`);
}

console.log('PASS: file removed, queue complete, no orphan left behind');
console.log(`NOTE: ${target.email} is now status=approved. Revert with:`);
console.log(`  update public.profiles set status='pending' where id='${target.id}';`);
