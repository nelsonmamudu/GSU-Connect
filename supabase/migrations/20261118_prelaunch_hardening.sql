-- =============================================================================
-- GSU Connect — Pre-Launch Hardening Migration (Idempotent)
-- Review carefully before applying to the live Supabase database.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Confessions anonymity & confession_upvote_counts view
-- -----------------------------------------------------------------------------
-- Lock down confessions column/table privileges so author_id is never readable
-- by anon or authenticated callers via direct table queries.
revoke all on public.confessions from public, anon;
revoke select on public.confessions from authenticated;
grant select (id, content, status, created_at) on public.confessions to authenticated;
grant insert, update, delete on public.confessions to authenticated;

-- Switch confession_upvote_counts to security_invoker = true so it respects
-- the caller's privileges and RLS policies on confession_upvotes.
create or replace view public.confession_upvote_counts
with (security_invoker = true) as
select u.confession_id, count(*)::bigint as upvote_count
from public.confession_upvotes u
join public.confessions c
  on c.id = u.confession_id and c.status = 'approved'
group by u.confession_id;

revoke all on public.confession_upvote_counts from public, anon, authenticated;
grant select on public.confession_upvote_counts to authenticated;

-- Aggregate-only upvote counts RPC for approved users.
-- Because confession_upvotes RLS restricts SELECT to own rows and the view
-- now uses security_invoker = true, this SECURITY DEFINER function returns
-- total counts per approved confession without exposing any voter user_id
-- or confession author_id.
create or replace function public.get_confession_upvote_counts(
  p_confession_ids uuid[] default null
)
returns table(confession_id uuid, upvote_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select u.confession_id, count(*)::bigint as upvote_count
  from public.confession_upvotes u
  join public.confessions c
    on c.id = u.confession_id
   and c.status = 'approved'
  where public.is_approved()
    and (p_confession_ids is null or u.confession_id = any(p_confession_ids))
  group by u.confession_id;
$$;

revoke all on function public.get_confession_upvote_counts(uuid[]) from public, anon;
grant execute on function public.get_confession_upvote_counts(uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Admin RPC audit & privilege revocations
-- -----------------------------------------------------------------------------
-- Normalize admin_set_department search_path to '' to match all other
-- SECURITY DEFINER functions (body still checks public.is_admin()).
create or replace function public.admin_set_department(target uuid, new_department text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dept text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change a member''s department';
  end if;

  v_dept := trim(coalesce(new_department, ''));
  if char_length(v_dept) < 2 or char_length(v_dept) > 80 then
    raise exception 'Department name must be between 2 and 80 characters';
  end if;

  update public.profiles
     set department = v_dept,
         updated_at = now()
   where id = target;

  if not found then
    raise exception 'Target profile not found';
  end if;
end;
$$;

-- Explicitly revoke EXECUTE from public and anon on all admin & moderation RPCs.
revoke execute on function public.set_role(uuid, text) from public, anon;
grant execute on function public.set_role(uuid, text) to authenticated;

revoke execute on function public.admin_expire_user(uuid) from public, anon;
grant execute on function public.admin_expire_user(uuid) to authenticated;

revoke execute on function public.admin_set_department(uuid, text) from public, anon;
grant execute on function public.admin_set_department(uuid, text) to authenticated;

revoke execute on function public.admin_set_session(integer) from public, anon;
grant execute on function public.admin_set_session(integer) to authenticated;

revoke execute on function public.admin_set_alumni_exempt(uuid, boolean) from public, anon;
grant execute on function public.admin_set_alumni_exempt(uuid, boolean) to authenticated;

revoke execute on function public.review_signup(uuid, text, text) from public, anon;
grant execute on function public.review_signup(uuid, text, text) to authenticated;

revoke execute on function public.confession_author(uuid) from public, anon;
grant execute on function public.confession_author(uuid) to authenticated;

revoke execute on function public.anonymize_expired_accounts() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Password-reset edge function durable rate limiting
-- -----------------------------------------------------------------------------
create table if not exists public.password_reset_rate_limits (
  key text primary key,
  request_count integer not null default 1,
  window_start timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.password_reset_rate_limits enable row level security;
revoke all on public.password_reset_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.password_reset_rate_limits to service_role;

create or replace function public.consume_password_reset_rate_limit(
  p_ip_hash text,
  p_identifier_hash text,
  p_window_seconds integer default 900,
  p_ip_max integer default 10,
  p_identifier_max integer default 3
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_window interval := make_interval(secs => greatest(60, least(86400, coalesce(p_window_seconds, 900))));
  v_ip_count integer;
  v_id_count integer;
begin
  -- Opportunistic cleanup of expired rate-limit windows older than 1 day
  delete from public.password_reset_rate_limits
   where window_start < v_now - interval '1 day';

  if nullif(btrim(coalesce(p_ip_hash, '')), '') is not null then
    insert into public.password_reset_rate_limits (key, request_count, window_start, updated_at)
    values ('ip:' || p_ip_hash, 1, v_now, v_now)
    on conflict (key) do update
      set request_count = case
            when public.password_reset_rate_limits.window_start + v_window <= v_now then 1
            else public.password_reset_rate_limits.request_count + 1
          end,
          window_start = case
            when public.password_reset_rate_limits.window_start + v_window <= v_now then v_now
            else public.password_reset_rate_limits.window_start
          end,
          updated_at = v_now
    returning request_count into v_ip_count;

    if v_ip_count > greatest(1, coalesce(p_ip_max, 10)) then
      return false;
    end if;
  end if;

  if nullif(btrim(coalesce(p_identifier_hash, '')), '') is not null then
    insert into public.password_reset_rate_limits (key, request_count, window_start, updated_at)
    values ('id:' || p_identifier_hash, 1, v_now, v_now)
    on conflict (key) do update
      set request_count = case
            when public.password_reset_rate_limits.window_start + v_window <= v_now then 1
            else public.password_reset_rate_limits.request_count + 1
          end,
          window_start = case
            when public.password_reset_rate_limits.window_start + v_window <= v_now then v_now
            else public.password_reset_rate_limits.window_start
          end,
          updated_at = v_now
    returning request_count into v_id_count;

    if v_id_count > greatest(1, coalesce(p_identifier_max, 3)) then
      return false;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.consume_password_reset_rate_limit(text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_password_reset_rate_limit(text, text, integer, integer, integer)
  to service_role;

-- -----------------------------------------------------------------------------
-- 4. Login & signup enumeration RPC hardening
-- -----------------------------------------------------------------------------
-- Restrict identifier_available to matric/staff_id lookups with valid length.
create or replace function public.identifier_available(lookup_type text, value text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_clean text := btrim(coalesce(value, ''));
begin
  if identifier_available.lookup_type not in ('matric', 'staff_id') then
    raise exception 'Invalid lookup type';
  end if;

  if char_length(v_clean) < 3 or char_length(v_clean) > 120 then
    return false;
  end if;

  return not exists (
    select 1
    from public.public_lookups l
    where l.hash_id = public.norm_hash(v_clean)
      and l.lookup_type = identifier_available.lookup_type
  );
end;
$$;

revoke all on function public.identifier_available(text, text) from public;
grant execute on function public.identifier_available(text, text) to anon, authenticated;

-- Validate identifier bounds in resolve_login and continue returning only
-- the minimum auth_email string.
create or replace function public.resolve_login(identifier text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_clean text := btrim(coalesce(identifier, ''));
  v_email text;
begin
  if char_length(v_clean) < 3 or char_length(v_clean) > 120 then
    return null;
  end if;

  select l.auth_email
    into v_email
    from public.public_lookups l
   where l.hash_id in (
     public.norm_hash(v_clean),
     public.norm_hash(public.norm_phone(v_clean))
   )
   limit 1;

  return v_email;
end;
$$;

revoke all on function public.resolve_login(text) from public;
grant execute on function public.resolve_login(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Performance: RLS auth.uid() initplan wrapping, index, duplicate SELECT merge
-- -----------------------------------------------------------------------------
-- Missing index on confession_upvotes(user_id)
create index if not exists idx_confession_upvotes_user_id
  on public.confession_upvotes (user_id);

-- Wrap auth.uid() as (select auth.uid()) on confession_upvotes
drop policy if exists "own confession upvote read" on public.confession_upvotes;
create policy "own confession upvote read"
  on public.confession_upvotes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Wrap auth.uid() as (select auth.uid()) on confessions
drop policy if exists "confessions submit" on public.confessions;
create policy "confessions submit"
  on public.confessions
  for insert
  to authenticated
  with check (
    public.is_approved()
    and author_id = (select auth.uid())
    and status = 'pending'
  );

drop policy if exists "confessions read" on public.confessions;
create policy "confessions read"
  on public.confessions
  for select
  to authenticated
  using (
    public.is_approved()
    and ((status = 'approved') or public.is_admin())
  );

drop policy if exists "confessions update" on public.confessions;
create policy "confessions update"
  on public.confessions
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "confessions delete" on public.confessions;
create policy "confessions delete"
  on public.confessions
  for delete
  to authenticated
  using (public.is_admin());

-- Wrap auth.uid() as (select auth.uid()) on messages update policy
-- (messages read, send, delete already wrap auth.uid() or delegate to helper RPCs)
drop policy if exists "messages update" on public.messages;
create policy "messages update"
  on public.messages
  for update
  to authenticated
  using (sender_id = (select auth.uid()) or public.is_admin())
  with check (sender_id = (select auth.uid()) or public.is_admin());

-- Merge duplicate permissive SELECT policies on app_settings
-- ("Admins manage app settings" was FOR ALL, overlapping "Everyone can read app settings")
drop policy if exists "Admins manage app settings" on public.app_settings;
drop policy if exists "Everyone can read app settings" on public.app_settings;
drop policy if exists "Admins insert app settings" on public.app_settings;
drop policy if exists "Admins update app settings" on public.app_settings;
drop policy if exists "Admins delete app settings" on public.app_settings;

create policy "Everyone can read app settings"
  on public.app_settings
  for select
  to anon, authenticated
  using (true);

create policy "Admins insert app settings"
  on public.app_settings
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins update app settings"
  on public.app_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins delete app settings"
  on public.app_settings
  for delete
  to authenticated
  using (public.is_admin());

-- Merge duplicate permissive SELECT policies on departments
-- ("Admins manage departments" was FOR ALL, overlapping "Approved users can view departments")
drop policy if exists "Admins manage departments" on public.departments;
drop policy if exists "Approved users can view departments" on public.departments;
drop policy if exists "Admins insert departments" on public.departments;
drop policy if exists "Admins update departments" on public.departments;
drop policy if exists "Admins delete departments" on public.departments;

create policy "Approved users can view departments"
  on public.departments
  for select
  to authenticated
  using (public.is_approved() or public.is_admin());

create policy "Admins insert departments"
  on public.departments
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins update departments"
  on public.departments
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins delete departments"
  on public.departments
  for delete
  to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 6. Storage bucket hardening (prevent HTML/SVG/script uploads to public bucket)
-- -----------------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array[
     'application/pdf',
     'image/jpeg',
     'image/png',
     'image/webp',
     'text/plain',
     'application/msword',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-powerpoint',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'application/vnd.ms-excel',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/zip',
     'application/x-zip-compressed',
     'application/octet-stream'
   ]
   where id = 'resources';

-- -----------------------------------------------------------------------------
-- 7. Profiles column-level privacy isolation
-- -----------------------------------------------------------------------------
-- Direct reads on public.profiles are restricted to the row owner so that
-- sensitive columns (email, phone, blocked_users, id_card_path, etc.) are
-- never readable on other users' rows via the PostgREST API.
-- Public/directory reads use the public.public_profiles view below, which
-- projects only non-sensitive profile columns and preserves the exact
-- visibility rules (own row, assigned/dept reviewer, or approved member).
create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles a
      join public.profiles b on b.id = p_b
     where a.id = p_a
       and (
         p_b = any(coalesce(a.blocked_users, '{}'::uuid[]))
         or p_a = any(coalesce(b.blocked_users, '{}'::uuid[]))
       )
  );
$$;

revoke all on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

drop policy if exists "calls start" on public.calls;
create policy "calls start"
  on public.calls
  for insert
  to authenticated
  with check (
    caller_id = (select auth.uid())
    and receiver_id <> (select auth.uid())
    and public.is_approved()
    and not public.is_blocked_between(caller_id, receiver_id)
  );

create or replace view public.public_profiles
with (security_barrier = true) as
select
  p.id,
  p.full_name,
  p.role,
  p.status,
  p.matric_no,
  p.staff_id,
  p.department,
  p.level,
  p.photo_url,
  p.avatar_id,
  p.last_seen,
  p.study_courses,
  p.study_bio,
  p.is_alumni,
  p.is_exempt,
  p.verify_deadline,
  p.alumni_verified_at,
  p.expires_at,
  p.created_at
from public.profiles p
where p.id = (select auth.uid())
   or public.can_review(p.id)
   or (public.is_approved() and p.status = 'approved');

revoke all on public.public_profiles from public, anon;
grant select on public.public_profiles to authenticated;

revoke all on public.profiles from public, anon;
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));
