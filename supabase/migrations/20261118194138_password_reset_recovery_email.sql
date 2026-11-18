-- Let the Edge Function resolve a recovery address without exposing the
-- recovery table or Auth identities to unauthenticated clients.
create index if not exists account_recovery_normalized_email_idx
  on public.account_recovery (lower(btrim(email)));

create or replace function public.resolve_password_reset_recovery_email(p_email text)
returns table (auth_email text, recovery_email text)
language sql
stable
security definer
set search_path = ''
as $$
  with matches as (
    select a.user_id, a.email
      from public.account_recovery a
     where lower(btrim(a.email)) = lower(btrim(p_email))
       and char_length(btrim(p_email)) between 5 and 120
     limit 2
  )
  select u.email::text, btrim(m.email)
    from matches m
    join auth.users u on u.id = m.user_id
   where (select count(*) from matches) = 1
     and nullif(btrim(u.email), '') is not null;
$$;

revoke all on function public.resolve_password_reset_recovery_email(text)
  from public, anon, authenticated;
grant execute on function public.resolve_password_reset_recovery_email(text)
  to service_role;
