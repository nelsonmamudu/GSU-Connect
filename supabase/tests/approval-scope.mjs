// Disposable PostgreSQL fixture only; storage rows represent uploads, not file bytes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

export async function testApprovalScope(db) {
  const sql = s => db.exec(s);
  const val = async s => Object.values((await db.query(s)).rows[0])[0];
  const file = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const migration = file('../migrations/20261125_approval_scope.sql');
  const down = file('../rollback/20261125_approval_scope.sql');
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const actor = n => sql(`reset role; set role authenticated; set request.jwt.claims='${JSON.stringify({sub:id(n),session_id:id(n+100),aal:'aal1'})}'`);
  const status = n => val(`select status from profiles where id='${id(n)}'`);
  const queued = n => val(`select exists(select from entry_review_queue where id='${id(n)}')`);
  const confirm = (n,level) => sql(`select confirm_review_level('${id(n)}','${level}')`);
  const approve = n => sql(`select review_signup('${id(n)}','approved',null)`);
  const baseline = () => val(`select string_agg(pg_get_functiondef(oid),'|' order by oid) from pg_proc where oid in ('can_review(uuid)'::regprocedure,'confirm_review_level(uuid,text)'::regprocedure,'update_own_pending_details(text,text)'::regprocedure)`);
  await sql('reset role');
  const original = await baseline();
  await sql(migration.replace(/commit;\s*$/i,'rollback;'));
  assert.equal(await baseline(),original);
  assert.equal(await val("select to_regprocedure('phase1_private.guard_rejected_edit()') is null"),true);
  console.log('PASS migration BEGIN ... ROLLBACK: original definitions restored, no guard');
  await sql(migration);
  // Baseline objects not modelled by the earlier fixture: self-update policy,
  // and the two existing resubmit RPC bodies inspected on the hosted project.
  await sql(`alter table profiles enable row level security;
    create policy fixture_own_read on profiles for select to authenticated using(id=auth.uid());
    create policy fixture_own_edit on profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
    grant update on profiles to authenticated;
    create function phase1_private.resubmit_signup() returns void language plpgsql security definer set search_path='' as $$begin update public.profiles set status='pending',rejection_reason=null where id=auth.uid() and status='rejected' and id_card_path is not null; end$$;
    create function public.resubmit_signup() returns void language plpgsql security definer set search_path='' as $$begin if not public.active_app_session() then raise exception 'Approved account required';end if;perform phase1_private.resubmit_signup(); end$$;`);
  for (const [n,role,state,dept,level,proof] of [
    [70,'class_rep','approved','CS','200',false],[71,'dept_helper','approved','CS','100',false],
    [72,'student','pending','CS','200',true],[73,'student','pending','CS','300',true],
    [74,'student','pending','Arts','200',true],[75,'lecturer','pending','CS','Staff',true],
    [76,'student','rejected','Arts','100',true],[77,'student','pending','CS','200',false]]) {
    await sql(`insert into profiles(id,role,status,department,level,matric_no) values('${id(n)}','${role}','${state}','${dept}','${level}','TEST-${n}');insert into auth.sessions values('${id(n+100)}','${id(n)}')`);
    if(proof) await sql(`insert into storage.objects(bucket_id,name) values('id-cards','${id(n)}/first');update profiles set id_card_path='${id(n)}/first' where id='${id(n)}'`);
  }
  await actor(70);
  assert.equal(await queued(72),true); assert.equal(await queued(77),false);
  await assert.rejects(approve(72),/Confirm the student level/);
  await assert.rejects(confirm(72,'300'),/Not authorized/);
  await confirm(72,'200'); await approve(72);
  for(const n of [73,74,75]) {
    assert.equal(await queued(n),false); await assert.rejects(confirm(n,'200')); await assert.rejects(approve(n),/Review not permitted/);
  }
  await actor(71); await assert.rejects(confirm(74,'200'),/Not authorized/);
  await assert.rejects(approve(74),/Review not permitted/);
  await confirm(73,'300'); await approve(73);
  await sql('reset role'); assert.equal(await status(72),'approved'); assert.equal(await status(73),'approved');
  assert.equal(await status(74),'pending'); assert.equal(await status(75),'pending');
  console.log('PASS rep same dept+level; deny other level, department and staff; helper cross-level same dept; deny other dept; no proof hidden');
  await actor(76); await sql("select update_own_pending_details('CS','200')");
  assert.equal(await val(`select department||':'||level||':'||status from profiles where id='${id(76)}'`),'CS:200:rejected');
  for(const edit of ["full_name='changed'","role='admin'","status='approved'"]) await assert.rejects(sql(`update profiles set ${edit} where id='${id(76)}'`),/resubmission form/);
  await assert.rejects(approve(76),/Review not permitted/);
  await sql(`insert into storage.objects(bucket_id,name) values('id-cards','${id(76)}/replacement');update profiles set id_card_path='${id(76)}/replacement' where id='${id(76)}';select resubmit_signup()`);
  assert.equal(await status(76),'pending'); await actor(70); assert.equal(await queued(76),true);
  console.log('PASS rejected student edits only department/level, links replacement proof, resubmits to pending, enters rep queue; direct identity/role/status edits refused');
  await sql('reset role'); await sql(down.replace(/commit;\s*$/i,'rollback;')); await sql(down); assert.equal(await baseline(),original);
  assert.equal(await val("select to_regprocedure('phase1_private.guard_rejected_edit()') is null"),true);
  console.log('PASS rollback script restores all three function definitions and removes guard');
}
