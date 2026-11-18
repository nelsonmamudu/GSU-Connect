-- =============================================================================
-- GSU Connect — Production Launch Hardening Migration (Idempotent)
-- Safe to run multiple times; does not drop tables or delete user data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A1. Confession anonymity
-- -----------------------------------------------------------------------------
revoke select on public.confessions from anon, authenticated;
grant select (id, content, status, upvotes, created_at) on public.confessions to authenticated;

do $$
declare
  v_id_type text;
  v_content_type text;
  v_status_type text;
  v_upvotes_type text;
  v_created_at_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into v_id_type
  from pg_attribute a
  where a.attrelid = 'public.confessions'::regclass and a.attname = 'id' and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod) into v_content_type
  from pg_attribute a
  where a.attrelid = 'public.confessions'::regclass and a.attname = 'content' and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod) into v_status_type
  from pg_attribute a
  where a.attrelid = 'public.confessions'::regclass and a.attname = 'status' and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod) into v_upvotes_type
  from pg_attribute a
  where a.attrelid = 'public.confessions'::regclass and a.attname = 'upvotes' and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod) into v_created_at_type
  from pg_attribute a
  where a.attrelid = 'public.confessions'::regclass and a.attname = 'created_at' and not a.attisdropped;

  execute 'drop function if exists public.my_confessions()';

  execute format($fn$
    create or replace function public.my_confessions()
    returns table (
      id %s,
      content %s,
      status %s,
      upvotes %s,
      created_at %s
    )
    language sql
    stable
    security definer
    set search_path to ''
    as $body$
      select c.id, c.content, c.status, c.upvotes, c.created_at
      from public.confessions c
      where c.author_id = (select auth.uid())
        and public.is_approved()
      order by c.created_at desc;
    $body$;
  $fn$, v_id_type, v_content_type, v_status_type, v_upvotes_type, v_created_at_type);
end $$;

revoke all on function public.my_confessions() from public, anon;
grant execute on function public.my_confessions() to authenticated;

-- -----------------------------------------------------------------------------
-- A2. Lock a user's department (students must not self-change it)
-- Note: `level` intentionally remains editable by the user.
-- -----------------------------------------------------------------------------
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.rejection_reason is distinct from old.rejection_reason
       or new.assigned_reviewer_id is distinct from old.assigned_reviewer_id
       or new.matric_no is distinct from old.matric_no
       or new.staff_id is distinct from old.staff_id
       or new.department is distinct from old.department
    then
      raise exception 'Protected profile fields cannot be modified directly';
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- A3. Reviewers cannot touch approved accounts
-- -----------------------------------------------------------------------------
create or replace function public.review_signup(
  target uuid,
  new_status text,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_caller_role text;
  v_caller_status text;
  v_caller_dept text;
  v_target_status text;
  v_target_role text;
  v_target_dept text;
  v_is_admin boolean := coalesce(public.is_admin(), false);
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  if target is null then
    raise exception 'Target user ID is required';
  end if;

  if new_status not in ('approved', 'rejected', 'suspended', 'pending') then
    raise exception 'Invalid account status: %', new_status;
  end if;

  select p.role, p.status, p.department
  into v_caller_role, v_caller_status, v_caller_dept
  from public.profiles p
  where p.id = v_caller_id;

  if not found or v_caller_status <> 'approved' then
    raise exception 'Only approved reviewers can review accounts';
  end if;

  select p.status, p.role, p.department
  into v_target_status, v_target_role, v_target_dept
  from public.profiles p
  where p.id = target;

  if not found then
    raise exception 'Target profile not found';
  end if;

  if not v_is_admin then
    if v_caller_role not in ('class_rep', 'dept_helper') then
      raise exception 'Insufficient permissions to review accounts';
    end if;

    if nullif(btrim(coalesce(v_caller_dept, '')), '') is null
       or lower(btrim(coalesce(v_target_dept, ''))) <> lower(btrim(v_caller_dept))
    then
      raise exception 'Reviewers can only manage accounts in their own department';
    end if;

    if v_target_role <> 'student' then
      raise exception 'Only admins can review non-student accounts';
    end if;

    if new_status not in ('approved', 'rejected') then
      raise exception 'Only admins can set status to %', new_status;
    end if;

    if v_target_status not in ('pending', 'rejected') then
      raise exception 'Only admins can change an approved account';
    end if;
  end if;

  update public.profiles
  set status = new_status,
      rejection_reason = case
        when new_status in ('rejected', 'suspended') then nullif(btrim(reason), '')
        else null
      end,
      assigned_reviewer_id = v_caller_id,
      updated_at = now()
  where id = target;
end;
$$;

revoke all on function public.review_signup(uuid, text, text) from public, anon;
grant execute on function public.review_signup(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- A4. Foreign-key and query indexes
-- -----------------------------------------------------------------------------
create index if not exists idx_calls_caller_id on public.calls (caller_id);
create index if not exists idx_calls_receiver_id on public.calls (receiver_id);
create index if not exists idx_chat_members_user_id on public.chat_members (user_id);
create index if not exists idx_chats_created_by on public.chats (created_by);
create index if not exists idx_confessions_author_id on public.confessions (author_id);
create index if not exists idx_events_created_by on public.events (created_by);
create index if not exists idx_lecturer_radars_chat_id on public.lecturer_radars (chat_id);
create index if not exists idx_lecturer_radars_updated_by on public.lecturer_radars (updated_by);
create index if not exists idx_marketplace_listings_seller_id on public.marketplace_listings (seller_id);
create index if not exists idx_messages_chat_id_created_at_desc on public.messages (chat_id, created_at desc);
create index if not exists idx_messages_reply_to_id on public.messages (reply_to_id);
create index if not exists idx_messages_sender_id on public.messages (sender_id);
create index if not exists idx_polls_chat_id on public.polls (chat_id);
create index if not exists idx_polls_created_by on public.polls (created_by);
create index if not exists idx_polls_message_id on public.polls (message_id);
create index if not exists idx_profiles_assigned_reviewer_id on public.profiles (assigned_reviewer_id);
create index if not exists idx_public_lookups_owner_id on public.public_lookups (owner_id);
create index if not exists idx_resources_uploaded_by on public.resources (uploaded_by);
create index if not exists idx_rides_errands_posted_by on public.rides_errands (posted_by);
create index if not exists idx_statuses_user_id on public.statuses (user_id);

-- -----------------------------------------------------------------------------
-- A5. Level group chats
-- -----------------------------------------------------------------------------
do $$
declare
  v_500_level text;
  v_stray_id uuid;
begin
  -- Detect exact format stored in profiles.level for 500-level students (e.g. '500')
  select p.level
  into v_500_level
  from public.profiles p
  where btrim(coalesce(p.level, '')) ~ '^500L?$'
  limit 1;

  if v_500_level is null then
    v_500_level := '500';
  end if;

  for v_stray_id in
    select c.id
    from public.chats c
    where c.name = 'Science Laboratory Technology · 500L'
      and c.group_type is null
      and not exists (select 1 from public.messages m where m.chat_id = c.id)
  loop
    if exists (
      select 1
      from public.chats other
      where other.id <> v_stray_id
        and other.group_type = 'level'
        and lower(btrim(coalesce(other.department, ''))) = 'science laboratory technology'
        and other.level = v_500_level
    ) then
      delete from public.chats where id = v_stray_id;
    else
      update public.chats
      set group_type = 'level',
          is_group = true,
          department = 'Science Laboratory Technology',
          level = v_500_level
      where id = v_stray_id;
    end if;
  end loop;
end $$;

create unique index if not exists chats_level_unique_idx
  on public.chats (lower(btrim(department)), level)
  where group_type = 'level';

create or replace function public.ensure_dept_chat()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_dept text;
  v_level text;
begin
  if new.status <> 'approved' then
    return new;
  end if;

  v_dept := nullif(btrim(coalesce(new.department, '')), '');
  if v_dept is null then
    return new;
  end if;

  -- Preserve existing department chat auto-creation
  insert into public.chats (name, is_group, group_type, department)
  select v_dept, true, 'department', v_dept
  where not exists (
    select 1
    from public.chats c
    where c.group_type = 'department'
      and lower(btrim(coalesce(c.department, ''))) = lower(v_dept)
  )
  on conflict do nothing;

  -- Auto-create student level chat using exact profiles.level value unchanged
  v_level := nullif(btrim(coalesce(new.level, '')), '');
  if v_level is not null and lower(v_level) <> 'staff' then
    insert into public.chats (name, is_group, group_type, department, level)
    values (v_dept || ' · ' || v_level, true, 'level', v_dept, v_level)
    on conflict (lower(btrim(department)), level) where group_type = 'level'
    do nothing;
  end if;

  return new;
end;
$$;

-- Backfill level chats for existing approved student profiles
insert into public.chats (name, is_group, group_type, department, level)
select distinct
  btrim(p.department) || ' · ' || btrim(p.level),
  true,
  'level',
  btrim(p.department),
  btrim(p.level)
from public.profiles p
where p.status = 'approved'
  and nullif(btrim(coalesce(p.department, '')), '') is not null
  and nullif(btrim(coalesce(p.level, '')), '') is not null
  and lower(btrim(p.level)) <> 'staff'
on conflict (lower(btrim(department)), level) where group_type = 'level'
do nothing;

-- -----------------------------------------------------------------------------
-- A6. Realtime load reduction
-- Keep: messages, chat_members, calls, announcements, events, message_reports,
--       statuses, polls, lecturer_radars, departments, app_settings
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime drop table public.profiles;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chats'
  ) then
    alter publication supabase_realtime drop table public.chats;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- A7. RLS and storage polish
-- -----------------------------------------------------------------------------
drop policy if exists "Privileged users can post announcements" on public.announcements;
create policy "Privileged users can post announcements"
  on public.announcements
  for insert
  to authenticated
  with check (
    public.is_approved()
    and author_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.status = 'approved'
        and p.role in ('admin', 'class_rep', 'dept_helper', 'lecturer', 'staff')
    )
  );

drop policy if exists "Admins or authors can delete announcements" on public.announcements;
create policy "Admins or authors can delete announcements"
  on public.announcements
  for delete
  to authenticated
  using (
    public.is_admin()
    or (public.is_approved() and author_id = (select auth.uid()))
  );

drop policy if exists "Approved users can file reports" on public.message_reports;
create policy "Approved users can file reports"
  on public.message_reports
  for insert
  to authenticated
  with check (
    public.is_approved()
    and reporter_id = (select auth.uid())
  );

drop policy if exists "upload own chat media" on storage.objects;
create policy "upload own chat media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and public.is_approved()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "upload own avatar" on storage.objects;
create policy "upload own avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and public.is_approved()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- -----------------------------------------------------------------------------
-- A8. Verification queries (uncomment and run selectively to verify)
-- -----------------------------------------------------------------------------
-- 1. Confessions column privileges for authenticated:
-- select grantee, privilege_type, column_name
-- from information_schema.column_privileges
-- where table_schema = 'public' and table_name = 'confessions' and grantee = 'authenticated'
-- order by column_name;

-- 2. Body of guard_profile_update and review_signup:
-- select proname, pg_get_functiondef(oid)
-- from pg_proc
-- where pronamespace = 'public'::regnamespace
--   and proname in ('guard_profile_update', 'review_signup');

-- 3. Index list on public schema:
-- select tablename, indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public'
-- order by tablename, indexname;

-- 4. Auto-created and backfilled level chats:
-- select id, name, group_type, department, level, is_group, created_at
-- from public.chats
-- where group_type = 'level'
-- order by department, level;
