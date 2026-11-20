# Repo vs production schema — gap report (Batch 1, Task 1b)

Read-only audit, 2026-11-19. Nothing applied; no DDL executed.

## Headline

The repo does **not** contain a baseline. It has eight migration files, all hardening/Phase 1
(`20261116` … `20261123`). A database built from them cannot hold a single profile: `public.profiles`
itself is not in the repo.

The four objects you named are **already in the repo** — not missing:

| Object | Where in repo |
|---|---|
| `public.elevated_workspace_access()` | `supabase/migrations/20261122_owner_staff.sql:1738` |
| `phase1_private.evidence(profiles)` | `20261122_owner_staff.sql:1760` |
| `phase1_private.guard_staff_approval()` | `20261122_owner_staff.sql` |
| `phase1_private.rep_invites` table | `20261120_entry_flow.sql:1670` |

They are missing from **`main`**, which only has `20261116`–`20261118`. That is the merge problem in
Task 1a, not schema drift.

## What is genuinely missing (live, not in any repo migration)

Measured by comparing `pg_proc` / `pg_class` / `pg_policies` against object names parsed from every
`supabase/migrations/*.sql` at `origin/arena/4f501d54-gsu-connect` (60 functions, 15 tables, 31 policies,
15 triggers defined in the repo).

| Category | Live | In repo | Missing |
|---|---|---|---|
| Functions (`public` + `phase1_private`) | 129 | 60 | **69** |
| Tables (`public` + `phase1_private`) | 35 | 15 | **20** |
| Policies (`public` + `storage`) | 127 | 31 | **77** |
| Triggers (`public`) | 25 | 15 | **12** |

### Missing tables (20)

`public.account_recovery`, `public.announcements`, `public.app_settings`, `public.calls`,
`public.chat_members`, `public.chats`, `public.confessions`, `public.departments`, `public.events`,
`public.lecturer_radars`, `public.marketplace_listings`, `public.message_reports`, `public.messages`,
`public.polls`, `public.profiles`, `public.public_lookups`, `public.resources`, `public.rides_errands`,
`public.statuses`, `public.support_requests`.

### Missing functions (69)

Phase-1 wrappers: `phase1_private.set_role`, `set_recovery_email`, `resubmit_signup`,
`update_own_pending_details`, `verify_alumni_account`, `delete_own_account`, `admin_*`, `search_people`,
`start_dm`, `my_dms`, and the chat/confession RPC copies; public side: `handle_new_user`,
`sync_profile_cohort`, `guard_profile_update`, `guard_status_update`, `guard_call_update`,
`guard_confession_update`, `guard_poll_update`, `clear_id_card_on_approval`,
`anonymize_expired_accounts`, `resolve_password_reset_recovery_email`, `get_my_account_status`,
`dept_duration`, `grad_year_for`, `level_label`, `list_departments`, `my_role`, `norm_hash`,
`norm_phone`, `on_message_insert`, `prepare_message`, `add_creator_as_member`, `rls_auto_enable`,
`session_end_year`, `touch_updated_at`, plus the public wrappers of every `phase1_private` function.

The full machine-checked list:

```sql
-- functions live but not in repo
select n.nspname||'.'||p.proname
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','phase1_private') and p.prokind='f'
  and (n.nspname||'.'||p.proname) not in ( <names parsed from supabase/migrations> );
```

### Missing policies (77 of 127)

The 12 missing triggers are the ones attached to base tables that do not exist in the repo (`messages`, `calls`, `polls`, `confessions`, `statuses`, chat membership). Everything that governs the base tables — `chats`, `chat_members`, `messages`, `polls`, `calls`,
`resources`, `events`, `announcements`, `statuses`, `marketplace_listings`, `rides_errands`,
`departments`, `app_settings`, `message_reports` — plus the chat/avatar storage policies.
Only the Phase 1 additions (`workspace_gate`, `elevated_*`, `entry_proof_*`, `current_session_profile`,
`profiles read`) are in the repo.

## Why I did not hand-write the baseline migration

Function bodies can be reproduced exactly (`pg_get_functiondef`), but tables cannot be safely
reconstructed from `pg_catalog` by hand — column order, defaults, identity sequences, check
constraints, foreign-key actions and index definitions all have to match, and a subtly wrong
baseline is worse than none. The supported tool is a schema-only dump, which needs the direct
Postgres connection string; this sandbox has no `psql`, no `pg_dump`, no Supabase CLI and no DB
password, and the connector only offers SQL execution.

So the repo gets `scripts/capture-live-schema.sh`, which produces
`supabase/migrations/00000000000000_live_baseline.sql` from `pg_dump --schema-only` and is ordered
before every existing migration. Run it from a machine with `pg_dump` and the project's
`SUPABASE_DB_URL`, review the diff, commit.

**UNVERIFIED:** the script has not run (no `pg_dump` here), and "a fresh database equals production"
is therefore not proven. What *is* proven is the gap table above, by direct catalog queries.

## Rollback

The baseline migration is a new file with no dependants — delete it. `scripts/capture-live-schema.sh`
and this report are new files — delete them. No database object is created or altered by this task.
