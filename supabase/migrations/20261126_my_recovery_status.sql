-- 20261126_my_recovery_status.sql
-- my_recovery_status() — authenticated, caller-scoped recovery status for the
-- "Verify a recovery email" card and Profile. ADDITIVE. No behaviour change
-- to login, Forgot Password, legacy reset, or the recovery-email function.
--
-- Adds:
--   1. phase1_private.stub_recovery_part(text) — masking helper (2-char stub).
--   2. phase1_private.mask_recovery_email(text) — masks local part and host,
--      keeps the TLD. Never returns more than a 2-char prefix per part.
--   3. public.my_recovery_status() — security definer, auth.uid() ONLY (no
--      caller-supplied arguments), stable. Returns jsonb
--      {verified: boolean, masked_email: text|null}.
--        verified = true  -> masked_email is the caller's OWN verified inbox, masked.
--        verified = false -> masked_email is null. The raw address of anyone,
--                            or the caller's own unverified address, is never returned.
--      granted to authenticated; revoked from public and anon.
--   4. Re-documents recovery_mail_limits.ip_hash: values written by the
--      recovery-email function are HMAC-SHA256 (domain-separated
--      'recovery-ip:'), keyed by the TURNSTILE_SECRET_KEY function secret —
--      not a bare SHA-256 of the IP.
--
-- NOT included: no backfill, no change to legacy reset, no grant of any kind
-- to anon/public, no access to phase1_private tables for API roles.
--
-- ROLLBACK (drop in reverse dependency order):
--   drop function if exists public.my_recovery_status();
--   drop function if exists phase1_private.mask_recovery_email(text);
--   drop function if exists phase1_private.stub_recovery_part(text);
--   -- comment is cosmetic; no data migration is required either way.

begin;

-- 1. Stub one part (local or host) of an email address.
create or replace function phase1_private.stub_recovery_part(part text) returns text
language sql immutable set search_path = '' as $$
  select case
    when part is null or part = '' then '***'
    when length(part) <= 2 then left(part, 1) || '***'
    else left(part, 2) || '***'
  end
$$;

-- 2. Mask an email for display. Mirrors the client-side maskEmail() so the
-- card and Profile render identical strings regardless of source. Raw input
-- is never returned; output exposes at most 2 chars of local part and host,
-- plus the TLD.
create or replace function phase1_private.mask_recovery_email(mail text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  m text := lower(btrim(coalesce(mail, '')));
  at_pos int;
  local_part text;
  domain text;
  labels text[];
  host text;
  tld text;
begin
  at_pos := position('@' in m);
  if at_pos < 2 then
    return '***';
  end if;
  local_part := substring(m from 1 for at_pos - 1);
  domain := substring(m from at_pos + 1);
  labels := string_to_array(domain, '.');
  if labels is not null and array_length(labels, 1) > 1 then
    tld := '.' || labels[array_length(labels, 1)];
    host := array_to_string(labels[1:array_length(labels, 1) - 1], '.');
  else
    tld := '';
    host := domain;
  end if;
  return phase1_private.stub_recovery_part(local_part)
      || '@' || phase1_private.stub_recovery_part(host) || tld;
end $$;

revoke all on function phase1_private.stub_recovery_part(text) from public, anon, authenticated;
revoke all on function phase1_private.mask_recovery_email(text) from public, anon, authenticated;

-- 3. Caller-scoped status. SECURITY DEFINER so it can read the private
-- verified_recovery table, but it takes NO arguments beyond what auth.uid()
-- yields, so it can only ever describe the calling account.
create or replace function public.my_recovery_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (
      select jsonb_build_object(
        'verified', true,
        'masked_email', phase1_private.mask_recovery_email(v.email)
      )
      from phase1_private.verified_recovery v
      where v.user_id = (select auth.uid())
    ),
    jsonb_build_object('verified', false, 'masked_email', null)
  )
$$;

revoke all on function public.my_recovery_status() from public, anon;
grant execute on function public.my_recovery_status() to authenticated;

-- 4. Keep the ledger honest about how ip_hash is produced.
comment on column phase1_private.recovery_mail_limits.ip_hash is
  'HMAC-SHA256 hex of the client IP (domain separation: "recovery-ip:" || ip), keyed by the TURNSTILE_SECRET_KEY function secret. Equality-count only; never logged, displayed or exposed. Not a bare SHA-256 of the IP.';

notify pgrst, 'reload schema';
commit;
