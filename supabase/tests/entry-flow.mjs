// Extends the Phase 1 PostgreSQL fixture; no network, GoTrue or real objects.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
export async function testEntry(db) {
  const sql = (s) => db.exec(s),
    val = async (s) => Object.values((await db.query(s)).rows[0])[0];
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const acting = async (i, aal = false) =>
    sql(
      `reset role;set role authenticated;set request.jwt.claims='${JSON.stringify({ sub: id(i), session_id: id(i + 100), aal: aal ? 'aal2' : 'aal1', amr: [{ method: aal ? 'totp' : 'password' }] })}'`,
    );
  const student = id(50),
    other = id(51),
    rep = id(5);
  await sql(`reset role;create role service_role;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create publication supabase_realtime;
 alter table storage.buckets add file_size_limit bigint,add allowed_mime_types text[];
 create table public.departments(name text,duration_years integer);insert into departments values ('CS',4),('Medicine',6);
 alter table public.profiles add grad_year integer;
 create function public.handle_new_user() returns trigger language plpgsql as $$declare v_grad_year int:=new.grad_year; v_role text:=new.role;begin if v_grad_year < 2005 or v_grad_year >= public.session_end_year() then raise exception 'Invalid';end if;return new;end$$;
 create function public.sync_profile_cohort() returns trigger language plpgsql as $$declare v_dur int;v_dept text;v_level text:=new.level;begin v_dur := public.dept_duration(v_dept); return new;end$$;
 insert into public.profiles(id,role,status,department,level,matric_no) values('${student}','student','pending','CS','200','UG22/1'),('${other}','student','pending','CS','200','UG22/2');
 insert into auth.sessions values('${id(150)}','${student}');
 create policy fixture_insert_proof on storage.objects for insert to authenticated with check(bucket_id='id-cards' and split_part(name,'/',1)=auth.uid()::text);
 create policy fixture_read_proof on storage.objects for select to authenticated using(bucket_id='id-cards' and (split_part(name,'/',1)=auth.uid()::text or can_review(split_part(name,'/',1)::uuid)));
 grant insert on storage.objects to authenticated;`);
  await sql(
    readFileSync(new URL('../migrations/20261120_entry_flow.sql', import.meta.url), 'utf8'),
  );
  // The graduate-specific trigger paths must not call either session_end_year or dept_duration.
  // Those functions intentionally do not exist in this fixture.
  await sql(`create table graduate_fixture(role text,level text,grad_year integer);
    create trigger a_signup before insert on graduate_fixture for each row execute function public.handle_new_user();
    create trigger b_cohort before insert on graduate_fixture for each row execute function public.sync_profile_cohort();
    insert into graduate_fixture values('student','Class of 2026',2026)`);
  assert.equal(await val('select grad_year from graduate_fixture'), 2026);
  await assert.rejects(
    sql("insert into graduate_fixture values('student','Class of 2099',2099)"),
    /Invalid/,
  );
  // Only transport and Vault are fakes. Execute the actual dispatch trigger and transition-table logic.
  await sql(`create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);
    create schema net;create table net.test_calls(url text);
    create function net.http_post(url text,headers jsonb,body jsonb) returns bigint language plpgsql as $$begin insert into net.test_calls values(url);return 1;end$$;`);
  const dispatch = readFileSync(
    new URL('../migrations/20261121_proof_cleanup_dispatch.sql', import.meta.url),
    'utf8',
  ).replace('create extension if not exists pg_net;', '');
  await assert.rejects(sql(dispatch), /Configure and verify/);
  await sql('rollback');
  await sql(
    `insert into vault.decrypted_secrets values('entry_cleanup_url','https://fixture.test/api/proof-cleanup'),('entry_cleanup_token',repeat('x',32))`,
  );
  await sql(dispatch);
  await acting(50);
  assert.equal(await val("select check_own_entry()->>'id_card_path'"), null);
  await assert.rejects(sql('select issue_entry_invite()'), /class rep required/);
  await acting(5);
  const token = await val('select issue_entry_invite()');
  assert.equal(await val(`select entry_invite_department('${token}')`), 'CS');
  // The live auth.users trigger creates profiles. Recreate that insertion boundary with metadata.
  await sql(
    `reset role;delete from profiles where id='${student}';insert into auth.users values('${student}',jsonb_build_object('entry_invite','${token}'));insert into profiles(id,role,status,department,level,matric_no) values('${student}','student','pending','CS','200','UG22/1')`,
  );
  await acting(50);
  await sql(
    `insert into storage.objects values ('id-cards','${student}/first'),('id-cards','${student}/second')`,
  );
  await assert.rejects(
    sql(`insert into storage.objects values ('id-cards','${other}/foreign')`),
    /security policy/,
  );
  await acting(7);
  assert.equal(await val(`select count(*)::int from entry_review_queue where id='${student}'`), 0);
  await sql(
    `reset role;update profiles set id_card_path='${student}/second' where id='${student}';insert into storage.objects values('id-cards','${other}/keep')`,
  );
  await acting(50);
  assert.equal(await val("select check_own_entry()->>'id_card_path'"), `${student}/second`);
  await assert.rejects(sql("select update_own_pending_details('CS','500')"), /duration/);
  await assert.rejects(sql("select update_own_pending_details('CS','staff')"), /Invalid level/);
  await acting(7);
  assert.equal(await val(`select invited from entry_review_queue where id='${student}'`), true);
  assert.equal(
    await val(`select count(*)::int from storage.objects where name like '${student}/%'`),
    1,
  );
  await sql(`select confirm_review_level('${student}','200')`);
  await acting(5);
  assert.equal(await val(`select count(*)::int from entry_review_queue where id='${student}'`), 0); // wrong confirmed level
  await acting(50);
  await sql("select update_own_pending_details('Medicine','Class of 2026')");
  await sql('reset role');
  assert.equal(
    await val(`select count(*)::int from phase1_private.cohorts where user_id='${student}'`),
    0,
  );
  assert.equal(
    await val(
      `select count(*)::int from phase1_private.entry_referrals where applicant='${student}'`,
    ),
    0,
  );
  await acting(7);
  assert.equal(await val(`select count(*)::int from entry_review_queue where id='${student}'`), 0);
  await acting(10, true);
  await sql(
    `select confirm_review_level('${student}','Class of 2026');select review_signup('${student}','approved',null)`,
  );
  await assert.rejects(sql('select * from entry_cleanup_batch()'), /permission denied/);
  await acting(50);
  assert.equal(await val("select check_own_entry()->>'status'"), 'approved');
  await assert.rejects(
    sql(`insert into storage.objects values('id-cards','${student}/late')`),
    /security policy/,
  );
  await sql('reset role');
  assert.equal(await val('select count(*)::int from net.test_calls'), 1);
  await sql('reset role;set role service_role');
  const rows = (await db.query('select * from entry_cleanup_batch()')).rows;
  assert.deepEqual(rows.map((r) => r.path).sort(), [`${student}/first`, `${student}/second`]);
  await sql(`select entry_cleanup_ack(array['${student}/first'])`);
  assert.equal((await db.query('select * from entry_cleanup_batch()')).rows.length, 2);
  // Simulate the Storage API having removed the bytes/metadata. Never do this in production SQL.
  await sql(
    `reset role;delete from storage.objects where name like '${student}/%';set role service_role;select entry_cleanup_ack(array['${student}/first','${student}/second'])`,
  );
  assert.equal((await db.query('select * from entry_cleanup_batch()')).rows.length, 0);
  await sql('reset role');
  assert.equal(
    await val(`select count(*)::int from storage.objects where name='${other}/keep'`),
    1,
  );
  console.log(
    'Entry SQL passed: private proof, scope, fresh status, pending edits, graduate confirmation, referral priority, and two-file cleanup queue.',
  );
}
