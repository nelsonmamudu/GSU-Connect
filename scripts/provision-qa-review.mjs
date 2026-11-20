// One-time LOCAL operator tool. Never import into the app or run in CI.
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const ref = 'wctkyqydjoepgmlhfsiw';
const department = 'QA Test';
const fixtures = [
  ['9101', 'Class Rep', '200', 'class_rep', 'approved'],
  ['9102', 'Department Helper', '200', 'dept_helper', 'approved'],
  ['9103', 'Pending Without Proof', '200', 'student', 'pending'],
  ['9104', 'Rejected Student', '100', 'student', 'rejected'],
  ['9105', 'Same Level With Proof', '200', 'student', 'pending', true],
  ['9106', 'Other Level With Proof', '300', 'student', 'pending', true],
];
const password = randomBytes(18).toString('base64url') + 'aA1!';
const created = [];
const checked = (result, stage) => {
  if (result.error) throw new Error(`${stage} failed (status ${Number(result.error.status) || 'unknown'}).`);
  return result.data;
};
async function main() {
  if (process.argv[2] !== `--create=${ref}` || !process.stdout.isTTY) throw new Error('Run explicitly from a private interactive terminal.');
  const key = process.env.GSU_SUPABASE_SECRET_KEY;
  if (!key) throw new Error('Set GSU_SUPABASE_SECRET_KEY in your local environment.');
  const db = createClient(`https://${ref}.supabase.co`, key, { auth: { persistSession: false, autoRefreshToken: false } });
  // Do not put privileged throwaway accounts in a department already used by others.
  const { count, error } = await db.from('profiles').select('id', { count: 'exact', head: true }).ilike('department', department);
  if (error || count !== 0) throw new Error('Cannot confirm QA Test is empty; refusing to create accounts.');
  for (const [suffix, label, level, role, status, proof] of fixtures) {
    const matric = `UG25/QAT/${suffix}`;
    const normalized = matric.toLowerCase().replace(/[^a-z0-9]/g, '');
    const {user} = checked(await db.auth.admin.createUser({
      email: `${normalized}@gsuconnect.app`, password, email_confirm: true,
      user_metadata: { full_name: `QA ${label}`, matric_no: matric, id_number: matric, id_number_normalized: normalized,
        account_type: 'student', requested_role: 'student', department, level, recovery_email: `${normalized}@example.invalid` },
    }), `Create ${matric}`);
    created.push([label, matric, user.id]);
    const patch = { role, status };
    if (status === 'rejected') patch.rejection_reason = 'QA fixture: edit details and upload replacement proof.';
    if (proof) {
      const path = `${user.id}/qa-placeholder.png`;
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=', 'base64');
      checked(await db.storage.from('id-cards').upload(path, png, { contentType: 'image/png', upsert: false }), `Upload ${matric}`);
      patch.id_card_path = path;
    }
    const row = checked(await db.from('profiles').update(patch).eq('id', user.id).eq('matric_no', matric)
      .eq('department', department).eq('level', level).eq('role', 'student').eq('status','pending')
      .select('role,status,id_card_path').single(), `Configure ${matric}`);
    if (row.role !== role || row.status !== status || (row.id_card_path ?? null) !== (patch.id_card_path ?? null)) throw new Error(`Unexpected profile state: ${matric}`);
  }
}
try { await main(); }
catch (err) { console.error(err.message); process.exitCode = 1; }
finally {
  if (created.length) {
    console.log(process.exitCode ? 'Partial creation; inspect these accounts before retrying:' : 'Created QA accounts:');
    for (const [label, matric, uid] of created) console.log(`${label}: ${matric} (${uid})`);
    console.log(`Shared throwaway password: ${password}`);
  }
}
