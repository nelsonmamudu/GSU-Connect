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
const marker = 'gsu-qa-review-v1';
let password;
const created = [];
const checked = (result, stage) => {
  if (result.error) throw new Error(`${stage} failed (status ${Number(result.error.status) || 'unknown'}).`);
  return result.data;
};
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const safeFile = /^(?:qa-placeholder\.png|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}_verification\.(?:jpeg|png|webp|pdf))$/;

async function inventory(db, suffix) {
  const matric = `UG25/QAT/${suffix}`;
  const email = `ug25qat${suffix}@gsuconnect.app`;
  const row = checked(await db.from('profiles').select('id,email,matric_no,role,staff_id').eq('matric_no', matric).maybeSingle(), 'Find QA profile');
  if (!row) return null;
  if (!uuid.test(row.id) || row.email !== email || row.matric_no !== matric || row.staff_id || !['student','class_rep','dept_helper'].includes(row.role)) throw Error(`Unexpected profile for ${matric}`);
  const {user} = checked(await db.auth.admin.getUserById(row.id), 'Verify Auth identity');
  // app_metadata is server-controlled (unlike user_metadata). Never adopt an old/unmarked account.
  if (user?.id !== row.id || user.email !== email || user.app_metadata?.qa_fixture !== `${marker}:${matric}`) throw Error(`Unmarked or mismatched identity: ${matric}`);
  const paths = [];
  for (let offset = 0; ; offset += 100) {
    const page = checked(await db.storage.from('id-cards').list(row.id, {limit:100,offset,sortBy:{column:'name',order:'asc'}}), 'List QA proof');
    for (const item of page) {
      if (!item.id || !safeFile.test(item.name)) throw Error(`Unexpected file or subfolder for ${matric}; refusing deletion`);
      paths.push(`${row.id}/${item.name}`);
    }
    if (page.length < 100) break;
  }
  return {matric,id:row.id,paths};
}

async function removeFixtures(db, plan) {
  const targets = [];
  // Delete students before the accounts referenced as their assigned reviewers.
  for (const [suffix] of [...fixtures.slice(2), ...fixtures.slice(0,2)]) {
    const target = await inventory(db, suffix);
    if (!target) { console.log(`Skip UG25/QAT/${suffix}: no matching profile`); continue; }
    targets.push({suffix,...target});
  }
  for (const t of targets) {
    const refs = checked(await db.from('profiles').select('id').eq('assigned_reviewer_id',t.id)
      .not('id','in',`(${targets.map(x=>x.id).join(',')})`).limit(1), 'Check reviewer references');
    if (refs.length) throw Error(`Non-fixture profile references ${t.matric}; refusing deletion`);
    for (const path of t.paths) console.log(`Remove id-cards/${path}`);
    console.log(`Delete Auth user ${t.id} (${t.matric}); profile ${t.id} cascades`);
  }
  if (plan) return;
  for (const {suffix,matric,id,paths} of targets) {
    const current = await inventory(db,suffix);
    if (current?.id !== id || JSON.stringify(current.paths) !== JSON.stringify(paths)) throw Error(`Inventory changed: ${matric}`);
    for (let i=0;i<paths.length;i+=100) checked(await db.storage.from('id-cards').remove(paths.slice(i,i+100)), 'Remove QA proof');
    const remaining = await inventory(db,suffix);
    if (remaining?.id !== id || remaining.paths.length) throw Error(`Proof removal not confirmed: ${matric}`);
    checked(await db.auth.admin.deleteUser(id), 'Delete QA Auth user');
    if (checked(await db.from('profiles').select('id').eq('id',id).maybeSingle(), 'Verify profile cascade')) throw Error(`Profile still present: ${matric}`);
  }
}

async function main() {
  const args = process.argv.slice(2), plan = args.includes('--plan');
  const modes = args.filter(arg => arg !== '--plan');
  if (modes.length !== 1 || args.length !== 1 + Number(plan) || ![`--create=${ref}`,`--delete=${ref}`].includes(modes[0])) throw Error(`Specify --create=${ref} or --delete=${ref}, optionally with --plan`);
  if (!plan && !process.stdout.isTTY) throw Error('Use a private interactive terminal for writes.');
  const key = process.env.GSU_SUPABASE_SECRET_KEY;
  if (!key) throw new Error('Set GSU_SUPABASE_SECRET_KEY in your local environment.');
  const db = createClient(`https://${ref}.supabase.co`, key, { auth: { persistSession: false, autoRefreshToken: false } });
  if (modes[0] === `--delete=${ref}`) return removeFixtures(db,plan);
  // Do not put privileged throwaway accounts in a department already used by others.
  const { count, error } = await db.from('profiles').select('id', { count: 'exact', head: true }).ilike('department', department);
  if (error || count !== 0) throw new Error('Cannot confirm QA Test is empty; refusing to create accounts.');
  const conflicts = checked(await db.from('profiles').select('id').in('matric_no',fixtures.map(([s])=>`UG25/QAT/${s}`)).limit(1), 'Check matric collisions');
  if (conflicts.length) throw Error('Reserved QA matric already exists.');
  if (!plan) password = randomBytes(18).toString('base64url') + 'aA1!';
  for (const [suffix, label, level, role, status, proof] of fixtures) {
    const matric = `UG25/QAT/${suffix}`;
    const normalized = matric.toLowerCase().replace(/[^a-z0-9]/g, '');
    console.log(`Create Auth ${normalized}@gsuconnect.app (${matric}); signup profile QA ${label}, ${department}, level ${level}; set ${role}/${status}${status === 'rejected' ? ' with QA rejection reason' : ''}${proof ? '; upload and link id-cards/<new user UUID>/qa-placeholder.png' : '; no proof'}`);
    if (plan) continue;
    const {user} = checked(await db.auth.admin.createUser({
      email: `${normalized}@gsuconnect.app`, password, email_confirm: true, app_metadata: {qa_fixture: `${marker}:${matric}`},
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
