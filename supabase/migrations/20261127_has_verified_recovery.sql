-- 20261127_has_verified_recovery.sql
-- has_verified_recovery(uuid) — service_role only. ADDITIVE. Read-only.
--
-- Returns true when the account currently holds a verified recovery binding.
-- Used solely by the recovery-email Edge Function to decide when replacing an
-- already-verified inbox requires a fresh sign-in (amr timestamp check).
-- Takes the account UUID as an argument because service_role calls carry no
-- auth.uid(); it leaks nothing beyond a boolean to its one authorised caller.
--
-- NOT included: no changes to Forgot Password, legacy reset, verified_recovery,
-- recovery_challenges or any client-visible object.
--
-- ROLLBACK:
--   drop function if exists public.has_verified_recovery(uuid);

begin;

create or replace function public.has_verified_recovery(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from phase1_private.verified_recovery where user_id = u)
$$;

revoke all on function public.has_verified_recovery(uuid) from public, anon, authenticated;
grant execute on function public.has_verified_recovery(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
