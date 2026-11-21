-- Draft for reviewed rollout only: requires the reconciled current schema and
-- must be tested against real Auth/RLS before applying to any live project.
-- Restrict the legacy, unreasoned identity-lookup RPC and provide a replacement
-- that records each successful disclosure. This does NOT secure comments,
-- implement pilot eligibility, prevent privileged database access, or create
-- a complete abuse-monitoring/retention process.
begin;

create table phase1_private.confession_author_access_log (
  id bigint generated always as identity primary key,
  confession_id uuid not null,
  reviewer_id uuid not null,
  reason text not null check (reason in ('credible_threat', 'harassment_or_doxxing', 'minor_safety', 'other_serious_safety')),
  accessed_at timestamptz not null default now()
);
revoke all on phase1_private.confession_author_access_log from public, anon, authenticated;

-- Old clients must fail closed rather than retain an unaudited lookup path.
revoke execute on function public.confession_author(uuid) from public, anon, authenticated;
revoke execute on function phase1_private.confession_author(uuid) from public, anon, authenticated;

create function public.reveal_confession_author(cid uuid, safety_reason text)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare author uuid;
begin
  -- Current deployment's is_admin() checks an active approved account and MFA.
  -- Verify that implementation on the target before applying this migration.
  if not coalesce(public.is_admin(), false) then
    raise exception 'Authorized admin required' using errcode = '42501';
  end if;
  if safety_reason is null or safety_reason not in ('credible_threat', 'harassment_or_doxxing', 'minor_safety', 'other_serious_safety') then
    raise exception 'Select a serious safety reason' using errcode = '22023';
  end if;
  select c.author_id into author from public.confessions c where c.id = cid;
  if not found or author is null then return null; end if;
  insert into phase1_private.confession_author_access_log (confession_id, reviewer_id, reason)
  values (cid, auth.uid(), safety_reason);
  return author;
end;
$$;
revoke all on function public.reveal_confession_author(uuid,text) from public, anon, authenticated;
grant execute on function public.reveal_confession_author(uuid,text) to authenticated;
commit;
