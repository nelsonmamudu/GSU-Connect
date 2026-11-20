-- Anonymous-by-default funnel instrumentation for the auth and pending flows.
-- Events carry no message content and no proof data: an event name, an
-- optional account id, a session id and a small JSON blob.

create table if not exists public.funnel_events (
  id bigint generated always as identity primary key,
  event text not null,
  user_id uuid,
  session_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.funnel_events is
  'Product analytics for the signup and verification funnel. No message or proof content.';

alter table public.funnel_events enable row level security;

-- Authenticated users may record their own events only; the anon key cannot
-- write, and no client can read the table back (service role bypasses RLS).
create policy funnel_events_insert_own
  on public.funnel_events
  for insert
  to authenticated
  with check (user_id is null or user_id = auth.uid());

grant insert on public.funnel_events to authenticated;
grant usage on sequence public.funnel_events_id_seq to authenticated;

create index if not exists funnel_events_created_at_idx
  on public.funnel_events (created_at desc);

create index if not exists funnel_events_event_idx
  on public.funnel_events (event);

-- Retention: the table is intentionally small, but prune anything older than
-- 12 months so it cannot grow without bound.
delete from public.funnel_events where created_at < now() - interval '12 months';
