-- scripts/proof-cleanup-dry-run.sql — READ ONLY. Deletes nothing.
-- Run in the Supabase SQL editor or:  psql "$DATABASE_URL" -f scripts/proof-cleanup-dry-run.sql
--
-- Reports, for the id-cards bucket:
--   * files owned by approved accounts        -> the queue would delete these
--   * orphan files (owner profile gone)       -> the worker would delete these
--   * files owned by pending / rejected users -> must NOT be deleted
-- plus the current queue state and any legacy approved profile that still holds a path.

with owned as (
  select o.name,
         split_part(o.name, '/', 1) as owner_segment,
         p.id is not null           as has_profile,
         p.status                   as owner_status,
         coalesce((o.metadata->>'size')::bigint, 0) as bytes
  from storage.objects o
  left join public.profiles p on p.id::text = split_part(o.name, '/', 1)
  where o.bucket_id = 'id-cards'
),
classified as (
  select *,
    case
      when not has_profile then 'orphan'
      when owner_status = 'approved' then 'approved'
      when owner_status in ('pending','rejected') then owner_status
      when owner_status = 'suspended' then 'suspended'
      else 'unexpected'
    end as bucket
  from owned
)
select bucket                                            as owner_state,
       case bucket when 'approved' then 'DELETE'
                   when 'orphan'   then 'DELETE'
                   else 'KEEP' end                       as action,
       count(*)                                          as files,
       pg_size_pretty(sum(bytes))                        as total_bytes
from classified
group by bucket
order by action desc, bucket;

-- Queue state (should equal the approved-file count once approvals happen).
select (select count(*) from phase1_private.proof_cleanup)                        as queued_rows,
       (select count(*) from phase1_private.proof_cleanup q
         where not exists (select 1 from storage.objects o
                            where o.bucket_id = 'id-cards' and o.name = q.path))   as queued_but_missing;

-- Legacy approvals that still carry a storage path (should be zero:
-- clear_id_card_on_approval blanks it before the row is committed).
select count(*) as approved_with_path
from public.profiles
where status = 'approved' and id_card_path is not null;
