-- Preserve existing SELECT grants; do not grant anonymous profile access.
revoke insert, update, delete, truncate, references, trigger, maintain
on table public.public_profiles, public.entry_review_queue
from public, anon, authenticated;
