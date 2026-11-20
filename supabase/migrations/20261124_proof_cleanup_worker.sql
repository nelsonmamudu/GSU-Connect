-- 20261124_proof_cleanup_worker.sql
-- Batch 1 / Task 2. ADDITIVE ONLY. No pg_net, no Vault token, no scheduler.
--
-- Adds:
--   1. phase1_private.proof_audit        — approval audit trail (no file, no path)
--   2. trigger record_proof_audit        — writes that row at approval
--   3. public.entry_cleanup_batch_approved(limit) — queued paths whose owner is approved
--   4. public.entry_orphan_batch(limit)  — id-cards objects with no owning profile
--
-- Deletion itself runs once a day from Vercel: GET /api/proof-cleanup with the
-- CRON_SECRET bearer (see vercel.json "crons" and docs/proof-deletion.md).
--
-- ROLLBACK:
--   drop trigger if exists record_proof_audit on public.profiles;
--   drop function if exists phase1_private.record_proof_audit();
--   drop function if exists public.entry_cleanup_batch_approved(integer);
--   drop function if exists public.entry_orphan_batch(integer);
--   drop table if exists phase1_private.proof_audit;
--   (no scheduling, extension or Vault change to undo)

begin;

-- ---------------------------------------------------------------------------
-- 1. Audit trail: who approved, when, which kind of proof. No path, no filename,
--    no bytes, so it survives the file itself.
-- ---------------------------------------------------------------------------
create table if not exists phase1_private.proof_audit (
  id bigserial primary key,
  profile_id uuid references public.profiles(id) on delete set null,
  proof_type text not null check (proof_type in ('uploaded_document','staff_id','staff_email','vouch')),
  approved_by uuid,
  approved_at timestamptz not null default now()
);
revoke all on phase1_private.proof_audit from public, anon, authenticated;
create index if not exists proof_audit_profile_idx on phase1_private.proof_audit (profile_id, approved_at desc);

create or replace function phase1_private.record_proof_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_type text;
begin
  -- Runs AFTER the status change; OLD still holds the path that
  -- clear_id_card_on_approval (BEFORE trigger) blanks for the new row.
  if old.id_card_path is not null and split_part(old.id_card_path,'/',1)=old.id::text then
    v_type := case when phase1_private.staff(old) then 'staff_id' else 'uploaded_document' end;
  elsif phase1_private.staff(old) then
    v_type := case when exists (
        select 1 from phase1_private.staff_email e
        where e.account = old.id
          and e.department = lower(trim(old.department))
          and e.confirmed
      ) then 'staff_email' else 'vouch' end;
  else
    return null; -- nothing was on file; no audit row
  end if;

  insert into phase1_private.proof_audit (profile_id, proof_type, approved_by)
  values (old.id, v_type, auth.uid());
  return null;
exception when others then
  raise warning 'proof audit insert failed for %', old.id;
  return null;
end $$;
revoke all on function phase1_private.record_proof_audit() from public, anon, authenticated;

drop trigger if exists record_proof_audit on public.profiles;
create trigger record_proof_audit
  after update of status on public.profiles
  for each row
  when (new.status = 'approved' and old.status is distinct from 'approved')
  execute function phase1_private.record_proof_audit();

-- ---------------------------------------------------------------------------
-- 2. Approved-only queue batch. Service role only; re-checks the owner at read
--    time so a path can never be handed out for a pending/rejected/suspended user.
-- ---------------------------------------------------------------------------
create or replace function public.entry_cleanup_batch_approved(p_limit integer default 100)
returns table (path text) language sql stable security definer set search_path = '' as $$
  select q.path
  from phase1_private.proof_cleanup q
  join public.profiles p on p.id::text = split_part(q.path, '/', 1)
  where p.status = 'approved'
  order by q.queued_at, q.path
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
revoke all on function public.entry_cleanup_batch_approved(integer) from public, anon, authenticated;
grant execute on function public.entry_cleanup_batch_approved(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Verified orphans: first path segment is not a profile id.
-- ---------------------------------------------------------------------------
create or replace function public.entry_orphan_batch(p_limit integer default 100)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(o.name order by o.name), '{}'::text[])
  from (
    select name
    from storage.objects
    where bucket_id = 'id-cards'
      and (
        split_part(name,'/',1) !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        or not exists (select 1 from public.profiles p where p.id::text = split_part(name,'/',1))
      )
    order by name
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) o;
$$;
revoke all on function public.entry_orphan_batch(integer) from public, anon, authenticated;
grant execute on function public.entry_orphan_batch(integer) to service_role;

commit;
