-- Launch security hardening (page-review decisions, 2026-11-17)
--
-- 1) Confession upvotes move to a dedicated table toggled via RPC.
--    Direct writes to any vote count are gone; one person = one vote,
--    enforced by the primary key (confession_id, user_id).
-- 2) messages UPDATE is restricted to the sender editing the text of
--    their own message. Reactions, stars, delete-for-everyone,
--    view-once open and poll votes all go through security-definer
--    RPCs that perform their own authorization checks.
-- 3) Events department scope. School-wide events (department NULL or
--    'All GSU') stay open to anyone the events insert policy lets
--    through (is_privileged: admin/class_rep/dept_helper/lecturer).
--    A specific department must match the poster's own department;
--    admins are unrestricted.
--
-- Decisions locked in by the owner:
--  - Confessions moderation stays admin-only (guard trigger unchanged).
--  - Orphaned storage cleanup (marketplace photos) is post-launch work.

-- ============ 1) Confession upvotes table ============
create table if not exists public.confession_upvotes (
  confession_id uuid not null references public.confessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (confession_id, user_id)
);

alter table public.confession_upvotes enable row level security;

-- Backfill existing votes, skipping any dangling profile references.
insert into public.confession_upvotes (confession_id, user_id)
select distinct c.id, v.uid
from public.confessions c
cross join lateral unnest(c.upvotes) as v(uid)
where v.uid is not null
  and exists (select 1 from public.profiles p where p.id = v.uid)
on conflict do nothing;

-- Aggregates-only view so voters' identities stay private.
create or replace view public.confession_upvote_counts
with (security_invoker = false) as
select confession_id, count(*)::bigint as upvote_count
from public.confession_upvotes
group by confession_id;

revoke all on public.confession_upvotes from anon, authenticated;
grant select on public.confession_upvotes to authenticated;

create policy "own confession upvote read"
  on public.confession_upvotes for select
  using (auth.uid() = user_id);

grant select on public.confession_upvote_counts to authenticated;

create or replace function public.toggle_confession_upvote(p_confession_id uuid)
returns table(upvoted boolean, upvote_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_voted boolean;
  v_count bigint;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if not public.is_approved() then
    raise exception 'Account not approved';
  end if;
  if not exists (
    select 1 from public.confessions c
    where c.id = p_confession_id and c.status = 'approved'
  ) then
    raise exception 'Confession not found';
  end if;

  delete from public.confession_upvotes u
  where u.confession_id = p_confession_id and u.user_id = v_uid;
  if found then
    v_voted := false;
  else
    insert into public.confession_upvotes (confession_id, user_id)
    values (p_confession_id, v_uid);
    v_voted := true;
  end if;

  select count(*) into v_count
  from public.confession_upvotes
  where confession_id = p_confession_id;
  return query select v_voted, v_count;
end;
$$;
revoke all on function public.toggle_confession_upvote(uuid) from public, anon;
grant execute on function public.toggle_confession_upvote(uuid) to authenticated;

-- my_confessions: the returned shape changes (upvotes column is dropped),
-- so the function must be dropped and recreated rather than replaced.
drop function if exists public.my_confessions();
create function public.my_confessions()
returns table(id uuid, content text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.content, c.status, c.created_at
  from public.confessions c
  where c.author_id = (select auth.uid()) and public.is_approved()
  order by c.created_at desc;
$$;
revoke all on function public.my_confessions() from public, anon;
grant execute on function public.my_confessions() to authenticated;

-- Rebuild the dependent write policies first (they reference the old
-- upvotes column), then drop the array column.
drop policy if exists "confessions submit" on public.confessions;
drop policy if exists "confessions update" on public.confessions;

alter table public.confessions drop column if exists upvotes;

create policy "confessions submit" on public.confessions for insert
  with check (is_approved() and author_id = auth.uid() and status = 'pending');

create policy "confessions update" on public.confessions for update
  using (is_admin()) with check (is_admin());

-- ============ 2) messages hardening ============
drop policy if exists "messages update" on public.messages;
create policy "messages update" on public.messages for update
  using (sender_id = auth.uid() or is_admin())
  with check (sender_id = auth.uid() or is_admin());

-- Non-admin direct updates may only touch the edit path (content, is_edited).
-- Everything else must go through the RPCs below (or an admin).
create or replace function public.guard_message_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if new.id is distinct from old.id
       or new.chat_id is distinct from old.chat_id
       or new.sender_id is distinct from old.sender_id
       or new.created_at is distinct from old.created_at
       or new.media_url is distinct from old.media_url
       or new.media_type is distinct from old.media_type
       or new.file_name is distinct from old.file_name
       or new.is_view_once is distinct from old.is_view_once
       or new.viewed_by is distinct from old.viewed_by
       or new.reply_to_id is distinct from old.reply_to_id
       or new.starred_by is distinct from old.starred_by
       or new.reactions is distinct from old.reactions
       or new.is_deleted is distinct from old.is_deleted then
      raise exception 'Direct message updates are limited to editing the text of your own message';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before update on public.messages
  for each row execute function public.guard_message_update();

create or replace function public.toggle_message_reaction(p_message_id uuid, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  m public.messages%rowtype;
  v_current jsonb;
  v_next jsonb;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if p_emoji is null or char_length(p_emoji) < 1 or char_length(p_emoji) > 16 then
    raise exception 'Invalid reaction';
  end if;
  select * into m from public.messages where id = p_message_id;
  if not found then
    raise exception 'Message not found';
  end if;
  if not public.can_access_chat(m.chat_id) then
    raise exception 'You do not have access to this chat';
  end if;

  v_current := case
    when m.reactions is null or jsonb_typeof(m.reactions) <> 'object' then '{}'::jsonb
    else m.reactions
  end;
  if v_current ->> v_uid::text = p_emoji then
    v_next := v_current - v_uid::text;
  else
    v_next := jsonb_set(v_current, array[v_uid::text], to_jsonb(p_emoji), true);
  end if;
  update public.messages set reactions = v_next where id = p_message_id;
  return v_next;
end;
$$;
revoke all on function public.toggle_message_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_message_reaction(uuid, text) to authenticated;

create or replace function public.toggle_message_star(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  m public.messages%rowtype;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select * into m from public.messages where id = p_message_id;
  if not found then
    raise exception 'Message not found';
  end if;
  if not public.can_access_chat(m.chat_id) then
    raise exception 'You do not have access to this chat';
  end if;

  if v_uid = any(coalesce(m.starred_by, '{}'::uuid[])) then
    update public.messages
       set starred_by = array_remove(starred_by, v_uid)
     where id = p_message_id;
    return false;
  end if;
  update public.messages
     set starred_by = array_append(coalesce(starred_by, '{}'::uuid[]), v_uid)
   where id = p_message_id;
  return true;
end;
$$;
revoke all on function public.toggle_message_star(uuid) from public, anon;
grant execute on function public.toggle_message_star(uuid) to authenticated;

create or replace function public.delete_message_for_everyone(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  m public.messages%rowtype;
  c public.chats%rowtype;
  v_meta jsonb;
  v_name text;
  v_now text;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if not public.is_approved() then
    raise exception 'Account not approved';
  end if;
  select * into m from public.messages where id = p_message_id;
  if not found then
    raise exception 'Message not found';
  end if;
  select * into c from public.chats where id = m.chat_id;

  if v_uid <> m.sender_id then
    -- Moderators may only delete in group chats, mirroring the client gate.
    if not coalesce(c.is_group, false) then
      raise exception 'Only the sender can delete messages in a direct conversation';
    end if;
    if not (public.is_admin() or public.is_privileged()) then
      raise exception 'You cannot delete this message';
    end if;
    if not public.can_access_chat(m.chat_id) then
      raise exception 'You do not have access to this chat';
    end if;
  end if;

  begin
    v_meta := m.content::jsonb;
    if jsonb_typeof(v_meta) is distinct from 'object' then
      v_meta := '{}'::jsonb;
    end if;
  exception when others then
    v_meta := '{}'::jsonb;
  end;

  select full_name into v_name from public.profiles where id = v_uid;
  v_now := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_meta := v_meta || jsonb_build_object(
    '__gsu', 1,
    'text', 'This message was deleted',
    'messageType', 'text',
    'deletedAt', v_now,
    'deletedBy', v_uid::text,
    'deletedByName', left(coalesce(v_name, 'A member'), 50)
  );

  update public.messages
     set content = v_meta::text,
         is_deleted = true,
         reactions = '{}'::jsonb,
         media_url = null,
         file_name = null,
         is_view_once = false
   where id = p_message_id;
end;
$$;
revoke all on function public.delete_message_for_everyone(uuid) from public, anon;
grant execute on function public.delete_message_for_everyone(uuid) to authenticated;

create or replace function public.open_view_once_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  m public.messages%rowtype;
  v_meta jsonb;
  v_now text;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select * into m from public.messages where id = p_message_id;
  if not found then
    raise exception 'Message not found';
  end if;
  if not public.can_access_chat(m.chat_id) then
    raise exception 'You do not have access to this chat';
  end if;
  if not m.is_view_once then
    raise exception 'Not a view-once message';
  end if;
  if v_uid = m.sender_id then
    raise exception 'The sender cannot open a view-once message';
  end if;

  begin
    v_meta := m.content::jsonb;
    if jsonb_typeof(v_meta) is distinct from 'object' then
      v_meta := '{}'::jsonb;
    end if;
  exception when others then
    v_meta := '{}'::jsonb;
  end;

  v_now := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_meta := v_meta || jsonb_build_object(
    '__gsu', 1,
    'text', 'Opened',
    'viewOnceOpenedAt', v_now,
    'viewOnceOpenedBy', v_uid::text
  );

  update public.messages
     set content = v_meta::text,
         media_url = null,
         file_name = null,
         viewed_by = case
           when v_uid = any(coalesce(viewed_by, '{}'::uuid[])) then viewed_by
           else array_append(coalesce(viewed_by, '{}'::uuid[]), v_uid)
         end
   where id = p_message_id;
end;
$$;
revoke all on function public.open_view_once_message(uuid) from public, anon;
grant execute on function public.open_view_once_message(uuid) to authenticated;

create or replace function public.vote_on_poll(p_message_id uuid, p_option_index integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  m public.messages%rowtype;
  v_meta jsonb;
  v_votes jsonb;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select * into m from public.messages where id = p_message_id;
  if not found then
    raise exception 'Message not found';
  end if;
  if not public.can_access_chat(m.chat_id) then
    raise exception 'You do not have access to this chat';
  end if;

  begin
    v_meta := m.content::jsonb;
    if jsonb_typeof(v_meta) is distinct from 'object' then
      raise exception 'poll';
    end if;
  exception when others then
    raise exception 'This message is not a poll';
  end;
  if jsonb_typeof(v_meta -> 'pollOptions') <> 'array'
     or jsonb_array_length(v_meta -> 'pollOptions') = 0 then
    raise exception 'This message is not a poll';
  end if;
  if p_option_index < 0 or p_option_index >= jsonb_array_length(v_meta -> 'pollOptions') then
    raise exception 'Invalid poll option';
  end if;

  v_votes := case
    when jsonb_typeof(v_meta -> 'pollVotes') <> 'object' then '{}'::jsonb
    else v_meta -> 'pollVotes'
  end;
  v_votes := v_votes || jsonb_build_object(v_uid::text, p_option_index);
  v_meta := v_meta || jsonb_build_object('__gsu', 1, 'pollVotes', v_votes);
  update public.messages set content = v_meta::text where id = p_message_id;
end;
$$;
revoke all on function public.vote_on_poll(uuid, integer) from public, anon;
grant execute on function public.vote_on_poll(uuid, integer) to authenticated;

-- ============ 3) events department scope ============
create or replace function public.guard_event_department()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    -- School-wide events (no department, or the 'All GSU' sentinel the
    -- client uses for university-wide) are allowed for anyone the
    -- events INSERT policy lets through; only is_privileged roles can
    -- post events at all, so this stays open to reps/helpers/lecturers
    -- and closed to students.
    if new.department is null or lower(btrim(new.department)) = 'all gsu' then
      return new;
    end if;
    if new.department is distinct from (
      select p.department from public.profiles p where p.id = auth.uid()
    ) then
      raise exception 'You can only post events for your own department or for all of GSU';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists events_department_guard on public.events;
create trigger events_department_guard before insert or update on public.events
  for each row execute function public.guard_event_department();

-- Keep confession_upvote_counts live for other connected devices
-- (the client also refreshes on its own sync broadcast). No-op when
-- the realtime publication is missing or already covers the table.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'confession_upvotes'
     ) then
    alter publication supabase_realtime add table public.confession_upvotes;
  end if;
end $$;
