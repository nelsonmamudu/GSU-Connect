# Funnel analytics (`funnel_events`)

The auth and verification screens record a small set of product events so the
team can see where applicants drop off: `auth_view`, `signup_step_reached`,
`signup_step_completed`, `signup_proof_selected`, `signup_submitted`,
`auth_error`, `status_gate_view`, `proof_upload_started`,
`proof_upload_succeeded`, `proof_upload_failed`, `status_change`,
`recovery_prompt_shown`, `recovery_email_sent`, `recovery_email_confirmed`.

## Apply before relying on it

`supabase/migrations/20261128_funnel_events.sql` creates the table, its RLS
policy, grants and indexes. Until it is applied the client buffers events and
silently drops them after a failed insert — **the app keeps working**, there is
just no data. Apply it with the other migrations; `npm run test:funnel` verifies
the schema, policy and retention prune against an isolated PostgreSQL engine.

## What is stored

| column | meaning |
| --- | --- |
| `event` | one of the event names above |
| `user_id` | the signed-in account, or null for anonymous steps |
| `session_id` | an anonymous per-tab id from `sessionStorage` |
| `meta` | small JSON blob (step number, account type, file type/size, error text) |
| `created_at` | server timestamp |

No message content, no proof images, no matric numbers. `meta` is
free-form, so treat it as untrusted when querying.

## Access

- Clients can **insert only their own rows** (`user_id is null or user_id =
  auth.uid()`), and cannot read the table at all — there is no SELECT policy and
  no SELECT grant.
- `anon` cannot write.
- Read it with the service role, e.g.:

```sql
select event, count(*)::int as n
from funnel_events
where created_at > now() - interval '7 days'
group by event
order by n desc;
```

Signup completion and proof-upload success ratios are computed in
`summarizeFunnel` (`src/utils/funnel.ts`), which is unit-tested in
`tests/funnel.test.ts`.

## Client behaviour

`src/services/funnel.ts` owns a bounded in-memory buffer (50 events). It flushes
on `pagehide` and when the tab is hidden, and every `trackFunnel` call is
wrapped so analytics can never break the flow it measures. If you add a new
event, add it to the `FunnelEvent` union in `src/utils/funnel.ts` and record it
from the screen that owns the moment.
