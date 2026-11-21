-- DRAFT ONLY: not an active migration.
-- The live database already contains phase1_private.app_owner (one protected row),
-- public.elevated_workspace_access(), protect_owner and the no_public_owner_role
-- check from 20261122_owner_staff.sql. This draft adds only a read-only,
-- server-derived public badge lookup. It does not grant any new authority and
-- does not change the owner's role (which stays 'admin' so existing guards work).
--
-- Before applying: confirm the target project has phase1_private.app_owner with
-- exactly one approved admin row, review the exposure (it reveals which account
-- is the founder to signed-in users, which the tag itself does), and obtain owner
-- approval for the deployment. Do not insert or edit app_owner here.
begin;

create function public.founder_account() returns uuid
language sql stable security definer set search_path = '' as $$
  select a.account
  from phase1_private.app_owner a
  join public.profiles p on p.id = a.account
  where p.role = 'admin'
    and p.status = 'approved'
    and p.expires_at is null
$$;

revoke all on function public.founder_account() from public, anon, authenticated;
grant execute on function public.founder_account() to authenticated;

commit;
