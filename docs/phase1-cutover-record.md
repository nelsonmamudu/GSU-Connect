# Production cutover check — 2026-11-19 20:27 UTC

Decision: HOLD before migration 20261119. Read-only check; no production changes.

| Gate | Result | Evidence needed before proceeding |
|---|---|---|
| Intended approved, non-expiring admin; verified TOTP and current AAL2/TOTP session | Pass at check time | One verified factor and one matching session in production Auth. Recheck at cutover; no re-enrollment. |
| Database restore | Not verified | Backup reference/time and successful isolated restore including Auth, grants, triggers, policies and Storage metadata. |
| Storage bytes restore | Not verified | Matching backup reference/time and reconciliation of restored objects against manifest (counts and checksums). |
| Isolated rehearsal | Not verified | Four migrations in order, access and recovery checks, synthetic two-file cleanup, unrelated file preserved, retry succeeds. |
| Offline owner recovery | Not confirmed | Responsible operator confirms an independent identity check and recovery procedure is available if the authenticator is lost. Keep actual instructions and credentials offline. |

Phase 1 schema and both cleanup Vault entries were absent at check time. No binding, cleanup or deployment was initiated. Record only non-secret evidence references here; never attach database dumps, object paths or bytes, codes, tokens or session identifiers. Follow `entry-rollout.md` for release order.

## Operator execution check — 2026-11-19

Stopped before export: no authenticated backup/rehearsal runner available here. The shell has no Supabase CLI, PostgreSQL client tools, Docker/Podman or default Docker socket, and no production DB connection was provisioned in the checked environment. Management connector access is not a database dump, an object-byte mirror, or a durable encrypted backup destination. No backup reference issued; no restore, migration rehearsal, cleanup retry or production promotion claimed.

### Lost authenticator — operator procedure (not a completed drill)

1. From independent, secured project administration access, open a private incident record. Verify the claimant through an established offline identity check and a second authorized reviewer. Do not rely on possession of an app session or matric number. If identity or operator access is uncertain, stop and use the provider's account recovery process.
2. Read-only: match the existing Auth UUID to the approved non-expiring profile and, after cutover, the singleton binding. Preserve a protected backup before mutation. Do not edit the binding, change roles, delete the user, disable RLS, restore sessions, or mark a factor verified in SQL.
3. In a trusted admin environment, list the user's factors via the supported Auth admin MFA API. Remove only the confirmed lost factor by ID. Use the supported Auth session revocation process for the account and secure the primary sign-in credential if compromise is suspected. Restrict the recovery window; issued tokens may persist until expiry.
4. Owner signs in to the same account and enrolls a new authenticator via Profile. Independently verify the factor and a fresh TOTP AAL2 session from a second browser, then test an authorized admin action. Close the incident with timestamps and approval references only. Store custody contacts and independent project-access recovery material offline. Rehearse on a disposable identity before relying on this procedure.

## Revised release decision

The release owner deferred the isolated database and Storage backup/rehearsal runner to [backlog issue #6](https://github.com/nelsonmamudu/GSU-Connect/issues/6). This is a deferral, not a successful restore or rehearsal. No snapshot has been certified.

## Production result (supersedes initial hold)

All four checksum-verified migration bodies from `4827330` were applied in order in one transaction under the recorded migration `phase1_entry_cleanup_owner_cutover`. Owner binding, review queue and email RPC verified. Do not replay the individual files with an unattended `db push`; reconcile history before future CLI migrations. Vercel promoted `dpl_4VfwQQV524t5esjwHwKocB5u7UWK`; production root returned 200 and the cleanup endpoint without a bearer returned 401. Staff-email v1 active, APP_URL set; inbox delivery not tested.

Vault URL and random token provisioned. Hosted pg_net grants PUBLIC read access to its request queue; an attempted privilege restriction did not take effect and was rolled back. Follow-up migration `pause_cleanup_dispatch_on_readable_net_queue` (repository equivalent 20261123) disabled the notification trigger and rotated the token. Proof jobs remain durable. Use the daily worker only after securely setting Vercel production CRON_SECRET to the rotated Vault value and verifying SUPABASE_SERVICE_ROLE_KEY. Redeploy the released client after updating variables. Do not re-enable immediate dispatch until the extension owner restricts request headers and effective privileges are retested. No real proof deletion or inbox delivery was used as a smoke test.
