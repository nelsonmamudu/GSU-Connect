// Isolated PostgreSQL engine with synthetic roles and JWT claims.
// Does not contact Supabase or exercise the UI.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const sql = (s) => db.exec(s);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(10);
const other = id(99);

await sql(`create role authenticated;create role anon;create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
grant usage on schema auth to authenticated, anon;`);

const migration = readFileSync(
  new URL('../migrations/20261128_funnel_events.sql', import.meta.url),
  'utf8',
);
await sql(migration);

const columns = (
  await db.query(
    `select column_name from information_schema.columns where table_schema='public' and table_name='funnel_events' order by ordinal_position`,
  )
).rows.map((row) => row.column_name);
assert.deepEqual(columns, ['id', 'event', 'user_id', 'session_id', 'meta', 'created_at']);

const rls = (
  await db.query(`select relrowsecurity as on from pg_class where oid='public.funnel_events'::regclass`)
).rows[0];
assert.equal(rls.on, true, 'funnel_events must enable row level security');

const policies = (
  await db.query(`select polname, polcmd from pg_policy where polrelid='public.funnel_events'::regclass`)
).rows;
assert.equal(policies.length, 1);
assert.equal(policies[0].polname, 'funnel_events_insert_own');
assert.equal(policies[0].polcmd, 'a');

const indexes = (
  await db.query(
    `select indexname from pg_indexes where schemaname='public' and tablename='funnel_events' order by indexname`,
  )
).rows.map((row) => row.indexname);
assert.ok(indexes.includes('funnel_events_created_at_idx'), 'retention index present');
assert.ok(indexes.includes('funnel_events_event_idx'), 'event index present');

// Owner (service role equivalent) can write.
await sql(
  `insert into funnel_events(event,user_id,session_id,meta) values('auth_view','${owner}','s1','{"mode":"login"}')`,
);
assert.equal((await db.query(`select count(*)::int n from funnel_events`)).rows[0].n, 1);

// An authenticated user may record their own events, including anonymous ones.
await sql(`set role authenticated;set request.jwt.claims='${JSON.stringify({ sub: owner })}'`);
await sql(`insert into funnel_events(event,user_id) values('signup_submitted','${owner}')`);
await sql(`insert into funnel_events(event) values('auth_error')`);

// …but not somebody else's.
await assert.rejects(
  sql(`insert into funnel_events(event,user_id) values('signup_submitted','${other}')`),
  /row-level security/i,
);

// The table is write-only for clients: no SELECT privilege and no read policy.
await assert.rejects(
  sql(`select count(*)::int n from funnel_events`),
  /permission denied/i,
);
await sql(`reset role`);

// The anon key cannot write at all.
await sql(`set role anon`);
await assert.rejects(
  sql(`insert into funnel_events(event) values('auth_view')`),
  /permission denied|row-level security/i,
);
await sql(`reset role`);

// Retention prune keeps recent rows and removes stale ones.
await sql(
  `insert into funnel_events(event,created_at) values('auth_view', now() - interval '13 months')`,
);
await sql(`delete from funnel_events where created_at < now() - interval '12 months'`);
const remaining = (await db.query(`select count(*)::int n from funnel_events`)).rows[0].n;
assert.equal(remaining, 3, 'only the stale row is pruned');

console.log(
  'Funnel events passed: schema, RLS, own-account insert, cross-account denial, read denial, anon denial, indexes and retention prune.',
);
