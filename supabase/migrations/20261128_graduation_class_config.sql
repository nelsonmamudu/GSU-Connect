-- Apply AFTER 20261120_entry_flow.sql (and after the owner/staff migration).
--
-- The graduate cohort was hard-coded as "Class of 2026" in five function bodies
-- and in the client. This moves the year into one service-role setting and
-- rewrites only the inspected literals, leaving every other statement, grant
-- and function OID untouched. Baseline drift fails the migration closed.
begin;

-- ============ 1) Settings ============
-- app_settings already existed on this deployment with a deliberate public read
-- policy (`allowed_email_domain`, `current_session_end_year`), so this migration
-- adds no new grants and only seeds a non-sensitive key. Writes stay admin-only
-- through the existing is_admin() policies.
create table if not exists public.app_settings(
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
comment on table public.app_settings is
  'Deployment settings. Existing rows are intentionally readable by anon/authenticated; writes are admin-only. The graduation cohort is read by clients through entry_config(), never by reading this table.';

-- Seed the value this deployment already behaves as. Changing the cohort is a
-- deliberate later step: update this row, never the function bodies.
insert into public.app_settings(key, value) values ('graduation_class_year', '2026')
on conflict (key) do nothing;

-- ============ 2) Single source of truth ============
-- Deliberately does NOT call session_end_year(): the signup and cohort
-- triggers must keep working on databases where that helper is absent.
create or replace function public.graduation_class_year() returns integer
language sql stable security definer set search_path='' as $$
  select coalesce(
    nullif(current_setting('gsu.graduation_class_year', true), '')::int,
    (select value::int from public.app_settings where key = 'graduation_class_year'),
    2026
  )
$$;
revoke all on function public.graduation_class_year() from public, anon;
grant execute on function public.graduation_class_year() to authenticated;

create or replace function public.graduate_level_label() returns text
language sql stable security definer set search_path='' as $$
  select 'Class of '||public.graduation_class_year()
$$;
revoke all on function public.graduate_level_label() from public, anon;
grant execute on function public.graduate_level_label() to authenticated;

-- Client-facing config. Never expose app_settings itself.
create or replace function public.entry_config() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  class_year int := public.graduation_class_year();
  end_year int;
begin
  -- Keep the existing session label when a deployment defines that helper;
  -- otherwise derive it so fresh installs still show a sensible hint.
  if to_regprocedure('public.session_end_year()') is not null then
    end_year := public.session_end_year();
  else
    end_year := class_year + 1;
  end if;
  return jsonb_build_object(
    'graduationClassYear', class_year,
    'sessionEndYear', end_year,
    'sessionLabel', (end_year - 1)||'/'||end_year
  );
end $$;
revoke all on function public.entry_config() from public, anon;
grant execute on function public.entry_config() to authenticated;

-- ============ 3) Rewrite the inspected literals ============
do $patch$
declare
  def text;
begin
  -- 3a. Signup trigger: the only accepted graduation year is the configured one.
  def := pg_get_functiondef('public.handle_new_user()'::regprocedure);
  if array_length(string_to_array(def, $lit$v_grad_year <> 2026 or v_role <> 'student'$lit$), 1) <> 2 then
    raise exception 'Unexpected signup trigger; review baseline before applying graduation config';
  end if;
  execute replace(def, $lit$v_grad_year <> 2026 or v_role <> 'student'$lit$,
                      $lit$v_grad_year <> public.graduation_class_year() or v_role <> 'student'$lit$);

  -- 3b. Cohort trigger: a graduate applicant keeps their class year.
  def := pg_get_functiondef('public.sync_profile_cohort()'::regprocedure);
  if array_length(string_to_array(def, $lit$if v_level = 'Class of 2026' then new.grad_year := 2026; return new; end if; $lit$), 1) <> 2 then
    raise exception 'Unexpected cohort trigger; review baseline before applying graduation config';
  end if;
  execute replace(def, $lit$if v_level = 'Class of 2026' then new.grad_year := 2026; return new; end if; $lit$,
                      $lit$if v_level = public.graduate_level_label() then new.grad_year := public.graduation_class_year(); return new; end if; $lit$);

  -- 3c. Level confirmation: accept the numeric levels plus the configured cohort.
  def := pg_get_functiondef('public.confirm_review_level(uuid,text)'::regprocedure);
  if array_length(string_to_array(def, $lit$confirmed_level not in ('100','200','300','400','500','600','Class of 2026')$lit$), 1) <> 2
     or array_length(string_to_array(def, $lit$(confirmed_level='Class of 2026') <> (t.level='Class of 2026')$lit$), 1) <> 2 then
    raise exception 'Unexpected confirm_review_level; review baseline before applying graduation config';
  end if;
  -- Both edits target the same function, so chain them: `replace` returns a
  -- new string and never mutates `def`.
  def := replace(def, $lit$confirmed_level not in ('100','200','300','400','500','600','Class of 2026')$lit$,
                      $lit$(confirmed_level <> public.graduate_level_label() and confirmed_level !~ '^[1-6]00$')$lit$);
  execute replace(def, $lit$(confirmed_level='Class of 2026') <> (t.level='Class of 2026')$lit$,
                      $lit$(confirmed_level=public.graduate_level_label()) <> (t.level=public.graduate_level_label())$lit$);

  -- 3d. Review scope: a class rep may only review the cohort they belong to.
  -- Leaving this literal behind would lock review rights to the old class year.
  def := pg_get_functiondef('public.can_review(uuid)'::regprocedure);
  if array_length(string_to_array(def, $lit$me.level in ('100','200','300','400','500','600','Class of 2026')$lit$), 1) <> 2 then
    raise exception 'Unexpected can_review; review baseline before applying graduation config';
  end if;
  execute replace(def, $lit$me.level in ('100','200','300','400','500','600','Class of 2026')$lit$,
                      $lit$me.level in ('100','200','300','400','500','600') or me.level=public.graduate_level_label()$lit$);

  -- 3e. Pending-details edit: the cohort label is data, not a literal.
  def := pg_get_functiondef('public.update_own_pending_details(text,text)'::regprocedure);
  if array_length(string_to_array(def, $lit$if p_level is distinct from 'Class of 2026' then$lit$), 1) <> 2 then
    raise exception 'Unexpected update_own_pending_details; review baseline before applying graduation config';
  end if;
  execute replace(def, $lit$if p_level is distinct from 'Class of 2026' then$lit$,
                      $lit$if p_level is distinct from public.graduate_level_label() then$lit$);
end $patch$;

commit;
