-- 20261125_verified_recovery_email.sql
-- Verified recovery email — STEP 1 MIGRATION ONLY. ADDITIVE. No behaviour change.
--
-- Adds:
--   1. phase1_private.recovery_challenges   — one active 60-minute, single-use
--      token per account. Digests only, never raw tokens.
--   2. phase1_private.verified_recovery     — at most one verified address per
--      account (PK user_id) and one account per normalized recovery KEY
--      (UNIQUE email_key; UNIQUE email of the stored address as well). The
--      key is Gmail-insensitive: gmail.com/googlemail.com addresses compare
--      equal ignoring dots and +tags. This is the table Forgot Password
--      would consult AFTER a later, separately-authorised rollout. Legacy
--      unverified reset is untouched.
--   3. phase1_private.recovery_mail_limits  — send ledger counted on the
--      recovery KEY (the destination column stores the key, not the raw
--      address) enforcing a global daily cap (100), a per-destination cap (3),
--      a per-IP cap (20) and a per-account cap (4/day, 1/minute).
--   4. public.request_recovery_email(u, mail, token_hash) — validates, takes
--      advisory locks in a FIXED order (global, then per-account, then
--      per-destination key) BEFORE any count, caps, revokes prior outstanding
--      challenges, issues a fresh digest. service_role.
--   5. public.confirm_recovery_email(u, token_hash) — atomic claim: verifies
--      the digest is unused/unexpired FOR THE CALLING ACCOUNT, serializes
--      concurrent claims per recovery key, binds or rebinds the caller's
--      verified inbox, consumes the challenge. The OLD verified inbox stays
--      bound until the caller's new one is confirmed in the same transaction.
--      Returns jsonb {previous, current} so the caller can notify the old
--      inbox. service_role.
--   6. phase1_private.recovery_email_key(text) — trim + lowercase everywhere;
--      for gmail.com and googlemail.com ALSO strip dots and any +tag from the
--      local part and map the domain to gmail.com. Every other domain: lowercase
--      only (plus-addresses stay distinct). Used for the per-destination cap,
--      the already-linked check and verified_recovery.email_key. Raw addresses
--      are never keyed — only this function's output.
--
-- ip_hash is an HMAC-SHA256 hex of the client IP (domain-separated
-- 'recovery-ip:', keyed by the TURNSTILE_SECRET_KEY function secret), NOT a
-- bare SHA-256 of the IP. It is used only for equality counts and is never
-- exposed. ('' when the client IP is unknown.)
--
-- NOT included: no backfill, no adoption phase, no change to Forgot Password,
-- login, legacy reset, Auth CAPTCHA, proof review or approval rules.
--
-- ROLLBACK (drop in reverse dependency order):
--   drop function if exists public.confirm_recovery_email(uuid,text);
--   drop function if exists public.request_recovery_email(uuid,text,text,text);
--   drop function if exists phase1_private.normalize_recovery_email(text);
--   drop function if exists phase1_private.recovery_email_key(text);
--   drop table if exists phase1_private.recovery_mail_limits;
--   drop table if exists phase1_private.verified_recovery;
--   drop table if exists phase1_private.recovery_challenges;

begin;

-- 1. Challenges: single-use, 60-minute, account-bound.
create table phase1_private.recovery_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token_digest text not null check (token_digest ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index recovery_challenges_user_idx on phase1_private.recovery_challenges (user_id, consumed_at);
alter table phase1_private.recovery_challenges enable row level security;
revoke all on phase1_private.recovery_challenges from public, anon, authenticated;

-- 2. Verified bindings: one address per account, one account per address.
-- email_key is the recovery_email_key() of email; the real address in email is
-- kept for sending (notifyChange) and is never used for equality decisions.
create table phase1_private.verified_recovery (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  email_key text not null unique,
  challenge_id uuid references phase1_private.recovery_challenges(id) on delete set null,
  verified_at timestamptz not null default now()
);
create index verified_recovery_email_idx on phase1_private.verified_recovery (email);
create index verified_recovery_email_key_idx on phase1_private.verified_recovery (email_key);
alter table phase1_private.verified_recovery enable row level security;
revoke all on phase1_private.verified_recovery from public, anon, authenticated;

-- 3. Send ledger: counted on the recovery KEY (destination stores the key).
create table phase1_private.recovery_mail_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  destination text not null,
  ip_hash text not null default '',
  sent_at timestamptz not null default now()
);
comment on column phase1_private.recovery_mail_limits.destination is
  'The recovery_email_key() of the requested address — NOT the raw address. Gmail variants of one inbox share a key.';
create index recovery_mail_limits_sent_idx on phase1_private.recovery_mail_limits (sent_at);
create index recovery_mail_limits_destination_idx on phase1_private.recovery_mail_limits (destination, sent_at);
create index recovery_mail_limits_user_idx on phase1_private.recovery_mail_limits (user_id, sent_at);
create index recovery_mail_limits_ip_idx on phase1_private.recovery_mail_limits (ip_hash, sent_at);
alter table phase1_private.recovery_mail_limits enable row level security;
revoke all on phase1_private.recovery_mail_limits from public, anon, authenticated;

-- Normalizer: single source of truth for trim/case used before storing the
-- real address. The KEY function below applies on top of this.
create function phase1_private.normalize_recovery_email(mail text) returns text
language sql immutable set search_path = '' as $$
  select lower(btrim(coalesce(mail, '')))
$$;

-- Recovery key: trim + lowercase everywhere; gmail.com and googlemail.com
-- also ignore dots and any +tag in the local part and are mapped onto
-- gmail.com; every other domain is lowercased only. Deterministic and
-- injective for all inputs the validator accepts (empty stripped locals fall
-- back to the trimmed address rather than colliding on a shared empty key).
create function phase1_private.recovery_email_key(mail text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  m text := lower(btrim(coalesce(mail, '')));
  at_pos int;
  local_part text;
  domain text;
  plus_pos int;
begin
  at_pos := position('@' in m);
  if at_pos < 2 then
    return m; -- format is validated by the callers; never count unvalidated input
  end if;
  local_part := substring(m from 1 for at_pos - 1);
  domain := substring(m from at_pos + 1);
  if domain in ('gmail.com', 'googlemail.com') then
    plus_pos := position('+' in local_part);
    if plus_pos > 0 then
      local_part := substring(local_part from 1 for plus_pos - 1);
    end if;
    local_part := replace(local_part, '.', '');
    if local_part = '' then
      return m;
    end if;
    return local_part || '@gmail.com';
  end if;
  return local_part || '@' || domain;
end $$;

-- 4. Issue a challenge. Caps are enforced here, not in the handler, so they
-- hold for every caller and every retry. Destinations are normalized BEFORE
-- any count or comparison (via recovery_email_key), so case/whitespace/Gmail
-- variants cannot dodge a cap. ip_hash is the HMAC-SHA256 hex of the client IP
-- (or '' when unknown); it is used only for equality counts and is never exposed.
--
-- Advisory locks are taken in a FIXED order before any count:
--   1) recovery-global            2) recovery-user:<uuid>          3) recovery-mail:<key>
-- Every other path in this migration takes no more than the destination key
-- lock, so there is no cross-function lock-order inversion.
create function public.request_recovery_email(u uuid, mail text, token_hash text, ip_hash text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare m text; k text; ip text;
begin
  m := phase1_private.normalize_recovery_email(mail);
  if length(m) > 254 or m !~ '^[a-z0-9][a-z0-9._+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$' then
    raise exception 'Invalid email address';
  end if;
  if token_hash is null or token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid token';
  end if;
  k := phase1_private.recovery_email_key(m);
  ip := lower(btrim(coalesce(ip_hash, '')));
  if length(ip) > 64 then
    raise exception 'Invalid request';
  end if;

  -- Fixed lock order, BEFORE any count.
  perform pg_advisory_xact_lock(hashtext('recovery-global'));
  perform pg_advisory_xact_lock(hashtext('recovery-user:' || u::text));
  perform pg_advisory_xact_lock(hashtext('recovery-mail:' || k));

  delete from phase1_private.recovery_mail_limits where sent_at < now() - interval '1 day';

  if (select count(*) from phase1_private.recovery_mail_limits
        where sent_at > now() - interval '1 day') >= 100 then
    raise exception 'Verification mail limit reached';
  end if;
  if (select count(*) from phase1_private.recovery_mail_limits
        where destination = k and sent_at > now() - interval '1 day') >= 3 then
    raise exception 'Too many verification requests for this address';
  end if;
  if ip <> '' and (select count(*) from phase1_private.recovery_mail_limits l
                     where l.ip_hash = ip and l.sent_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many verification requests from this network';
  end if;
  if exists(select from phase1_private.recovery_mail_limits
              where user_id = u and sent_at > now() - interval '1 minute')
     or (select count(*) from phase1_private.recovery_mail_limits
           where user_id = u and sent_at > now() - interval '1 day') >= 4 then
    raise exception 'Email request limit reached';
  end if;

  insert into phase1_private.recovery_mail_limits (user_id, destination, ip_hash) values (u, k, ip);

  -- One active challenge per account: outstanding unconsumed challenges die here.
  update phase1_private.recovery_challenges set consumed_at = now()
    where user_id = u and consumed_at is null;

  insert into phase1_private.recovery_challenges (user_id, email, token_digest, expires_at)
    values (u, m, token_hash, now() + interval '60 minutes');
end $$;

-- 5. Atomic claim. Runs for the AUTHENTICATED CALLING account only: the digest
-- is looked up scoped to that account, so cross-account replay fails closed.
-- Expiry, consumption and revocation are enforced by the row state, not by the
-- handler. Concurrent claims of one recovery key serialize on the advisory
-- lock and the unique constraint, and the loser fails closed. The caller's OLD
-- verified inbox is replaced only inside this transaction — until this
-- returns, the old binding remains authoritative. The already-linked check
-- and the binding are both keyed on recovery_email_key(), so two Gmail
-- spellings of one inbox can never be bound to two accounts.
create function public.confirm_recovery_email(u uuid, token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c phase1_private.recovery_challenges; prev text; k text;
begin
  if token_hash is null or token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Link invalid or expired';
  end if;

  select * into c from phase1_private.recovery_challenges
   where user_id = u and token_digest = token_hash
   for update;

  if not found or c.consumed_at is not null or c.expires_at <= now() then
    raise exception 'Link invalid or expired';
  end if;

  k := phase1_private.recovery_email_key(c.email);

  perform pg_advisory_xact_lock(hashtext('recovery-bind:' || k));

  if exists(select 1 from phase1_private.verified_recovery
              where email_key = k and user_id <> u) then
    raise exception 'Address already linked to another account';
  end if;

  select email into prev from phase1_private.verified_recovery where user_id = u;

  insert into phase1_private.verified_recovery (user_id, email, email_key, challenge_id)
    values (u, c.email, k, c.id)
    on conflict (user_id) do update
      set email = excluded.email, email_key = excluded.email_key,
          verified_at = now(), challenge_id = excluded.challenge_id;

  update phase1_private.recovery_challenges set consumed_at = now()
    where user_id = u and consumed_at is null;

  return jsonb_build_object('previous', prev, 'current', c.email);
end $$;

revoke all on function phase1_private.normalize_recovery_email(text),
              phase1_private.recovery_email_key(text)
  from public, anon, authenticated;
revoke all on function public.request_recovery_email(uuid, text, text, text),
              public.confirm_recovery_email(uuid, text)
  from public, anon, authenticated;
grant execute on function public.request_recovery_email(uuid, text, text, text),
                          public.confirm_recovery_email(uuid, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
