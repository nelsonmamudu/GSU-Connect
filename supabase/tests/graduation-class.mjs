// Isolated PostgreSQL engine with the pre-migration baseline definitions.
// Does not contact Supabase or exercise the UI.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const sql = (s) => db.exec(s);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const applicant = id(50);

// ---- Baseline: exactly the definitions the live entry-flow migration left ----
await sql(`
create role authenticated;
create role anon;
create schema auth;
create schema phase1_private;
create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
create table public.profiles(id uuid primary key, role text, status text, department text, level text,
  grad_year integer, matric_no text, staff_id text, full_name text, updated_at timestamptz);
create table public.departments(name text, duration_years integer);
insert into public.departments values ('CS',4);
create table phase1_private.cohorts(user_id uuid primary key, department text, level text);
create function public.dept_duration(d text) returns integer language sql as $$select 4$$;
create function public.is_admin() returns boolean language sql stable as $$select coalesce(current_setting('fixture.is_admin',true),'true')::boolean$$;
create function public.elevated_workspace_access() returns boolean language sql stable as $$select true$$;
create function public.is_approved() returns boolean language sql stable as $$select true$$;
create function phase1_private.evidence(p public.profiles) returns text language sql stable as $$select null$$;
create function phase1_private.staff(p public.profiles) returns boolean language sql stable as $$select false$$;
create function public.can_review(target uuid) returns boolean language sql stable security definer set search_path='' as $$
select public.is_approved() and exists(select from public.profiles p join public.profiles me on me.id=auth.uid()
 where p.id=target and p.id<>me.id and p.status='pending'
 and (public.elevated_workspace_access() or phase1_private.evidence(p) is not null)
 and (public.is_admin() or (not phase1_private.staff(p) and p.role='student' and p.matric_no is not null
   and nullif(lower(trim(me.department)),'')=lower(trim(p.department))
   and (me.role='dept_helper' or (me.role='class_rep' and me.level=p.level and me.level in ('100','200','300','400','500','600','Class of 2026'))))))
$$;
create function public.active_app_session() returns boolean language sql stable as $$select true$$;
create function public.session_end_year() returns integer language sql stable as $$select 2027$$;

create function public.handle_new_user() returns trigger language plpgsql as $$
declare v_grad_year int:=new.grad_year; v_role text:=new.role;
begin if v_grad_year <> 2026 or v_role <> 'student' then raise exception 'Invalid graduation year'; end if; return new; end $$;

create function public.sync_profile_cohort() returns trigger language plpgsql as $$
declare v_dur int; v_dept text; v_level text:=new.level;
begin if v_level = 'Class of 2026' then new.grad_year := 2026; return new; end if; v_dur := public.dept_duration(v_dept); return new; end $$;

create or replace function public.confirm_review_level(target uuid, confirmed_level text) returns void language plpgsql security definer set search_path='' as $$
declare t public.profiles; begin
 select * into strict t from public.profiles where id=target for update;
 if target=auth.uid() or confirmed_level is null or confirmed_level not in ('100','200','300','400','500','600','Class of 2026') then raise exception 'Invalid cohort'; end if;
 if (confirmed_level='Class of 2026') <> (t.level='Class of 2026') then raise exception 'Applicant must select their actual graduate status'; end if;
 if not (public.is_admin() or (public.can_review(target) and exists(select from public.profiles where id=auth.uid() and (role='dept_helper' or (role='class_rep' and level=confirmed_level and level=t.level))))) then raise exception 'Not authorized'; end if;
 update public.profiles set level=confirmed_level where id=target;
 insert into phase1_private.cohorts values(target,lower(trim(t.department)),confirmed_level) on conflict(user_id) do update set department=excluded.department,level=excluded.level;
end $$;

create function public.update_own_pending_details(p_department text,p_level text) returns void language plpgsql security definer set search_path='' as $$
declare d text:=btrim(p_department); duration integer;
begin
 if not public.active_app_session() or d is null or length(d) not between 2 and 80 or d ~ '[[:cntrl:]]' then raise exception 'Invalid department'; end if;
 if p_level is distinct from 'Class of 2026' then
 select duration_years into duration from public.departments where lower(btrim(name))=lower(d) limit 1;
 if p_level is null or p_level !~ '^[1-6]00$' then raise exception 'Invalid level'; end if;
 if p_level::int>100*greatest(1,least(6,coalesce(nullif(duration,0),4))) then raise exception 'Level exceeds programme duration'; end if;
 end if;
 update public.profiles set department=d,level=p_level,updated_at=now() where id=auth.uid() and status in ('pending','rejected') and role='student' and not phase1_private.staff(profiles);
 if not found then raise exception 'Only a pending or rejected student'; end if;
end $$;

insert into public.profiles(id,role,status,department,level,matric_no) values('${applicant}','student','pending','CS','Class of 2026','UG22/1');
`);

const migration = readFileSync(
  new URL('../migrations/20261128_graduation_class_config.sql', import.meta.url),
  'utf8',
);
await sql(migration);

// ---- Config surface ----
assert.equal((await db.query(`select public.graduation_class_year()`)).rows[0].graduation_class_year, 2026);
assert.equal((await db.query(`select public.graduate_level_label()`)).rows[0].graduate_level_label, 'Class of 2026');
const config = (await db.query(`select public.entry_config() as c`)).rows[0].c;
assert.equal(config.graduationClassYear, 2026);
assert.equal(config.sessionEndYear, 2027, 'existing session_end_year helper is honoured');
assert.equal(config.sessionLabel, '2026/2027');

// Clients cannot read the settings table, only call the derived RPCs.
await sql(`set role authenticated;set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'`);
await assert.rejects(sql(`select * from public.app_settings`), /permission denied|relation does not exist/i);
await sql(`reset role`);

// ---- Signup trigger follows the configuration ----
await sql(`create table grad_fixture(role text, level text, grad_year integer);
  create trigger g_signup before insert on grad_fixture for each row execute function public.handle_new_user();
  create trigger g_cohort before insert on grad_fixture for each row execute function public.sync_profile_cohort();`);
await sql(`insert into grad_fixture values('student','Class of 2026',2026)`);
assert.equal((await db.query(`select grad_year from grad_fixture`)).rows[0].grad_year, 2026);
await assert.rejects(sql(`insert into grad_fixture values('student','Class of 2027',2027)`), /Invalid graduation year/);
await assert.rejects(sql(`insert into grad_fixture values('staff','Class of 2026',2026)`), /Invalid graduation year/);

// Changing the cohort is a data change, not a code change.
await sql(`update public.app_settings set value='2027' where key='graduation_class_year'`);
assert.equal((await db.query(`select public.graduation_class_year()`)).rows[0].graduation_class_year, 2027);
await sql(`delete from grad_fixture`);
await assert.rejects(sql(`insert into grad_fixture values('student','Class of 2026',2026)`), /Invalid graduation year/);
await sql(`insert into grad_fixture values('student','Class of 2027',2099)`);
assert.equal((await db.query(`select grad_year from grad_fixture`)).rows[0].grad_year, 2027, 'cohort trigger overwrites the claimed year with the configured one');
await sql(`update public.app_settings set value='2026' where key='graduation_class_year'`);

// ---- Level confirmation ----
const asAuth = (who) =>
  sql(`set role authenticated;set request.jwt.claims='${JSON.stringify({ sub: who })}'`);
const levelOf = async () =>
  (await db.query(`select level from public.profiles where id='${applicant}'`)).rows[0].level;

await asAuth();
await sql(`select public.confirm_review_level('${applicant}','Class of 2026')`);
await sql(`reset role`);
assert.equal(await levelOf(), 'Class of 2026');
await asAuth();
await assert.rejects(sql(`select public.confirm_review_level('${applicant}','Class of 2027')`), /Invalid cohort/);
await assert.rejects(sql(`select public.confirm_review_level('${applicant}','')`), /Invalid cohort/);
await sql(`reset role`);
// A level that contradicts the stored graduate status is refused.
await sql(`update public.profiles set level='200' where id='${applicant}'`);
await asAuth();
await assert.rejects(sql(`select public.confirm_review_level('${applicant}','Class of 2026')`), /actual graduate status/);
await sql(`reset role`);

// ---- Pending-details edit ----
await sql(`update public.profiles set level='Class of 2026' where id='${applicant}'`);
await asAuth(applicant);
await sql(`select public.update_own_pending_details('CS','Class of 2026')`);
await sql(`reset role`);
assert.equal(await levelOf(), 'Class of 2026');
await asAuth(applicant);
await assert.rejects(sql(`select public.update_own_pending_details('CS','Class of 2025')`), /Invalid level/);
await sql(`reset role`);

// ---- Review scope follows the configured cohort ----
await sql(`insert into public.profiles(id,role,status,department,level,matric_no)
values ('${id(2)}','class_rep','approved','CS','Class of 2026','UG21/9'),
       ('${id(3)}','class_rep','approved','CS','200','UG21/8')`);
const canReviewAs = async (who, target) => {
  await asAuth(who);
  const v = (await db.query(`select public.can_review('${target}') as v`)).rows[0].v;
  await sql(`reset role`);
  return v;
};
await sql(`set fixture.is_admin='false'`);
assert.equal(await canReviewAs(id(2), applicant), true, 'class rep of the configured cohort may review');
assert.equal(await canReviewAs(id(3), applicant), false, 'a numeric-level rep cannot review a graduate applicant');
// Move the cohort: the previous rep loses scope, the new rep gains it.
await sql(`update public.app_settings set value='2027' where key='graduation_class_year'`);
assert.equal(await canReviewAs(id(2), applicant), false, 'stale cohort rep loses review scope');
await sql(`update public.profiles set level='Class of 2027' where id in ('${id(2)}','${applicant}')`);
assert.equal(await canReviewAs(id(2), applicant), true, 'the new cohort rep gains review scope');
await sql(`set fixture.is_admin='true'`);
await sql(`update public.app_settings set value='2026' where key='graduation_class_year'`);

// ---- Without session_end_year the label is derived, never an error ----
await sql(`drop function public.session_end_year()`);
const derived = (await db.query(`select public.entry_config() as c`)).rows[0].c;
assert.equal(derived.sessionEndYear, 2027);
assert.equal(derived.sessionLabel, '2026/2027');

// ---- Baseline drift fails closed ----
const patchedSignup = (
  await db.query(`select pg_get_functiondef('public.handle_new_user()'::regprocedure) as d`)
).rows[0].d;
await sql(`create or replace function public.handle_new_user() returns trigger language plpgsql as $$
begin return new; end $$`);
await assert.rejects(sql(migration), /Unexpected signup trigger/);
await sql(`rollback`);
await sql(patchedSignup);

// ---- Rollback restores the literals ----
await sql(readFileSync(new URL('../rollback/20261128_graduation_class_config.sql', import.meta.url), 'utf8'));
const restored = (await db.query(`select pg_get_functiondef('public.handle_new_user()'::regprocedure) as d`)).rows[0].d;
assert.ok(restored.includes(`v_grad_year <> 2026 or v_role <> 'student'`), 'literal restored');
const restoredScope = (
  await db.query(`select pg_get_functiondef('public.can_review(uuid)'::regprocedure) as d`)
).rows[0].d;
assert.ok(
  restoredScope.includes(`me.level in ('100','200','300','400','500','600','Class of 2026')`),
  'review-scope literal restored',
);
assert.equal((await db.query(`select to_regprocedure('public.graduation_class_year()') is null as gone`)).rows[0].gone, true);
assert.equal((await db.query(`select to_regprocedure('public.entry_config()') is null as gone`)).rows[0].gone, true);
// The settings table survives a rollback so an operator's configured cohort is not lost.
assert.equal((await db.query(`select value from public.app_settings where key='graduation_class_year'`)).rows[0].value, '2026');

console.log(
  'Graduation class config passed: seeded default, entry_config, signup/cohort triggers, review scope, level confirmation, pending edit, no-session-helper fallback, drift guard and rollback.',
);
