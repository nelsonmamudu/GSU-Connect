-- CREATE OR REPLACE preserves ownership and EXECUTE grants.
create or replace function public.resolve_login(identifier text)
returns text language sql stable security definer set search_path = '' as $$
  select l.auth_email from public.public_lookups l
  where length(btrim(identifier)) between 3 and 120
    and l.lookup_type in ('matric', 'staff_id')
    and l.hash_id = public.norm_hash(btrim(identifier))
  limit 1
$$;
