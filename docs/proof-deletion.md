# Proof deletion — design and runbook (Batch 1)

Status: **prepared, not applied.** Nothing in this document has been run against production.

## Why deletion does not happen today

Three separate things are off, and all three must be fixed before a single file is deleted:

1. `api/proof-cleanup.js` (Vercel) returns **503** whenever `VERCEL_ENV === 'production'`, and
   `vercel.json` has `"crons": []`, so nothing ever calls it.
2. The queue trigger `phase1_private.notify_proof_worker` is **disabled** (`tgenabled = 'D'`).
3. There is no scheduler at all: `cron.job` contains only `anonymize-expired-daily`.

The queue *does* still fill at approval — `phase1_private.entry_changed` (trigger `entry_changed`,
enabled) inserts the approved account's `id-cards` objects into `phase1_private.proof_cleanup`,
and `clear_id_card_on_approval` (BEFORE UPDATE) blanks `profiles.id_card_path`. Net effect today:
the applicant loses the link, the object stays in storage forever, and the queue row sits there.

### Who added the 503 gate, and why

`git log -S "Proof cleanup is paused"` → **eaf0235**, `nelsonmamudu`, 2026-11-19 21:47 UTC,
"Ship live-data review polish with cleanup scheduling disabled" — 60 seconds after `d7f0ac4`
preserved the release docs. The reason is recorded in `docs/phase1-cutover-record.md`:

> Vault URL and random token provisioned. Hosted pg_net grants PUBLIC read access to its request
> queue; an attempted privilege restriction did not take effect and was rolled back. Follow-up
> migration `20261123` disabled the notification trigger and rotated the token. Proof jobs remain
> durable. Use the daily worker only after securely setting Vercel production CRON_SECRET…

So the freeze is a **deliberate security pause**: the approval-time dispatch went through `pg_net`,
whose `net.http_request_queue` is readable by `anon`/`authenticated` on hosted projects, and the
queue row carries the bearer token in its headers. Rather than leak a credential, they stopped
dispatching.

## Scheduler choice (Batch 1b)

**Vercel Cron, once daily** → `GET /api/proof-cleanup`, authenticated by `CRON_SECRET`.
Vercel Hobby allows **2 cron jobs, at most one run per day** (sub-daily schedules are rejected at
deploy), so the window is "within 24 hours", which the UI now states.

There is **no pg_net, no Edge Function and no token in the database**. The approval-time dispatch is
gone entirely: the queue holds paths only, and the single deletion path is the Vercel function.

## What the worker does

1. `entry_cleanup_batch_approved(100)` — queue rows joined to `profiles.status='approved'`, so a
   pending/rejected/suspended owner is never returned. `storage.remove()`, then
   `entry_cleanup_ack(paths)`, which deletes the row only when the object is genuinely gone.
2. `entry_orphan_batch(50)` — `id-cards` objects whose first path segment has no profile row.
3. Never touch `pending`, `rejected` or `suspended` accounts' files.
4. Running twice in a row is a no-op the second time; the response is counts only.

## Audit record

`phase1_private.proof_audit (profile_id, proof_type, approved_by, approved_at)` — no path, no
filename, no bytes. Populated by the `record_proof_audit` trigger at approval; failures are warned,
never allowed to block an approval.

## Provisioning

```sql
-- only the migration; nothing is scheduled in Postgres
-- \i supabase/migrations/20261124_proof_cleanup_worker.sql
```

In Vercel: add `CRON_SECRET` (Production) with a random value, then redeploy. Vercel attaches
`Authorization: Bearer $CRON_SECRET` to cron invocations of `/api/proof-cleanup`.

## Rollback

```sql
drop function if exists public.entry_cleanup_batch_approved(integer);
drop function if exists public.entry_orphan_batch(integer);
drop trigger if exists record_proof_audit on public.profiles;
drop function if exists phase1_private.record_proof_audit();
drop table if exists phase1_private.proof_audit;
```

Removing the `crons` entry from `vercel.json` stops the schedule immediately. No existing
object is dropped or altered by the migration, so rollback restores the current behaviour exactly
(queue fills, nothing deletes).

## Dry run (read-only, run 2026-11-19)

| owner_state | action | files | bytes |
|---|---|---|---|
| pending | KEEP | 2 | 90 B |

`queued_rows = 0`, `queued_but_missing = 0`, `approved_with_path = 0`.

So **nothing would be deleted today** — every file belongs to a pending account. The bucket holds
only 2 files total (both test uploads), which also means the E2E test below has no production
evidence to show yet.

## End-to-end test (test account only)

`scripts/proof-cleanup-e2e.mjs` uploads a 1×1 PNG to a QA profile (`status='pending'` and
email/matric containing `tst`), links it, approves the profile through the normal triggers, then
drains the queue and asserts: object gone, `entry_cleanup_ack` returns true, storage listing empty,
and (with `CHECK_AUDIT=1`) an audit row exists. It refuses to run without `ALLOW_TEST_DATA=1`.

**UNVERIFIED:** I could not execute it — the sandbox holds no service-role key or direct Postgres
connection, and the task forbids touching production until you approve.
