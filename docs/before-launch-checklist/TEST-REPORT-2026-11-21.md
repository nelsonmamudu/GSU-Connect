# Test report 01 — local baseline and 100 simulated actors

**Date:** 21 November 2026
**Status:** Initial testing only. The requested full-app, end-to-end 100-account campaign is **not complete**.

## Scope and safety

The connected Supabase account listed one project named GSU Connect. Its only listed database branch was marked `is_default: true` and reported `MIGRATIONS_FAILED`; the project itself was reported healthy. The name/status of a branch is not enough to prove that it is isolated or that production migrations are currently failing. We did not create or alter a Supabase branch or write to that project. Further investigation and a confirmed non-production environment are required.

**In the initial local-only round, no actual Supabase Auth accounts were created.** No emails, messages, posts, reports or proof documents were sent to real people in that round. It used source checks and an in-memory synthetic database. The 100 simulated actors described below are database fixtures, not real login accounts, and do not fulfill the requested 100-account end-to-end campaign. The later live-account campaign is recorded separately below.

## Results

| Check | Result | What it really means |
|---|---|---|
| `npm ci --no-audit --no-fund` | Passed | Installed dependencies from the lockfile. |
| `npm run lint` | Passed | TypeScript accepted the current source. This is not a full UX or security audit. |
| `npm run build` | Passed | Vite produced a production bundle locally; it does not establish live deployment health. |
| `npm run test:entry` | Passed | 44 Node tests passed, followed by isolated funnel, phase-1 permission, entry, approval and recovery SQL checks. Network/live behavior was not tested. |
| `node supabase/tests/graduation-class.mjs` | Passed | Isolated graduation-class configuration checks passed; not proof of production configuration. |
| `npm run test:fixture-access` | Passed | 100 simulated actors across 10 repeated scenario categories; 600 database permission assertions passed in PGlite. See scope below. |
| `CHROMIUM_PATH=/tmp/chromium npm run test:browser` | Blocked / failed to start | Chromium could not start because the environment lacks `libnspr4.so`, `libnss3.so` and `libnssutil3.so`. The four listed tests did **not** execute their application assertions. This is a test-environment failure, not evidence of an app defect or success. |

The lockfile install was repeated after temporarily installing browser tooling, and the local lint, build and entry suite were rerun. No browser dependencies were added to the lockfile.

## Follow-up: browser run and revised owner direction

After the initial blocked run above, temporary NSPR/NSS libraries were extracted from the published `@sparticuz/chromium` npm package into `/tmp` and the existing `/tmp/chromium` was run with `LD_LIBRARY_PATH=/tmp/gsu-browser-libs/lib CHROMIUM_PATH=/tmp/chromium npm run test:browser`. Chromium started. Node reported 4 passing tests/subtests and 5 failures: the parent proof-card test failed because 4 of its 5 subtests timed out; its suspended subtest passed. The separate checking-state, sign-in and Turnstile tests passed. The four timed-out proof cases use local mocked services, not the live backend.

For `pending-attached`, the test expects a heading named `Review decision`, while source renders that text as a timeline label, not a heading. For `pending-empty`, the test expects `Choose replacement`, while the source selects `Choose photo or PDF` for pending. The two rejected cases timed out on expected text after setup or upload. These observations suggest at least some stale test expectations, but do not explain every failure or establish an actual production defect. P75 remains open; P82 tracks full triage and retesting. Temporary browser components are not a repeatable provisioned environment and are not committed.

The owner has since explicitly chosen testing on the live site, where they say accounts other than their own are test accounts, and agreed to a strong randomly generated shared password instead of the previously proposed weak password. No live accounts have yet been created or existing accounts deleted. The original isolated-environment recommendation and P74 remain open as safety work; the owner's live-testing choice supersedes the earlier proposed campaign target, not the need for a controlled account inventory, cleanup, side-effect review and authorization checks. A secure executable route to the Auth API and live browser remains to be established; do not insert directly into managed Auth tables.

## Browser proof-card failures investigated and retested

The four failed mocked scenarios were traced to test expectations, not confirmed product defects. `pending-attached` expected a heading where `Review decision` is a timeline label; `pending-empty` expected `Choose replacement` where pending uses `Choose photo or PDF`; `rejected-empty` expected an attached-file-only text even though there was no file; `rejected-attached` expected the pending upload message rather than the rejected replacement/resubmission success message. The test expectations were corrected without changing application code; the checks on the mocked Storage upload, profile attachment and rejected resubmission requests remain in place.

Reinstalled dependencies with `npm ci`, extracted Chromium and NSPR/NSS libraries from `@sparticuz/chromium@143.0.4` to `/tmp`, and reran `LD_LIBRARY_PATH=/tmp/gsu-browser-libs/lib:/tmp/gsu-browser-libs CHROMIUM_PATH=/tmp/gsu-browser-libs/chromium npm run test:browser`. All **9 tests/subtests passed**, including the proof-card parent and all five states. This is local mock-backed evidence only; it does not test live Auth, Storage or real Android devices. P82 is complete for the specified local test-triage scope; P75 remains open pending a repeatable supported browser setup.

## Follow-up: first real live pilot

The owner operated the phone kit and reported one of the 100 additional campaign accounts verified. A separate read-only aggregate query found one corresponding marked Supabase Auth user and one matching profile, with pending student status and no proof. Bounded read-only checks found no chats created by this pilot or in its synthetic department, no chat membership, no messages sent, no owned Storage objects and no entry-change row at the time of checking. These checks do not cover all possible side effects. The owner then shared phone screenshots showing the same synthetic profile at the live site's **Finish Verification** screen with proof required and status **Incomplete**, consistent with a successful sign-in and a pending account with no proof. This is one real phone journey, not full sign-in coverage or a verification test. The screen also shows a claim that proof is deleted within 24 hours after approval; its operational truth remains unverified under P15/P62. The generated recovery address uses `.invalid` and cannot receive email; recovery delivery is not tested. Normal signup was bypassed by Auth admin creation. The other 99 additional accounts and the full-app campaign remain uncompleted.

## Follow-up: 100 additional live accounts provisioned

The owner reports the phone tool verified 100 of 100 campaign accounts. An independent read-only aggregate on the live Supabase project found **100** marked Auth users with **100 distinct markers and 100 matching profiles**: all pending students in the campaign department, 25 at each of levels 100, 200, 300 and 400, with no linked proof. Six pre-existing review fixtures were still present. A bounded read-only check found no campaign-related chats, chat memberships, sent messages, owned Storage objects or entry-change rows at that moment; it did not assess all possible side effects. The aggregate does not prove every account can sign in. The owner's phone screenshots show a successful sign-in for the pilot only.

These are real accounts, but not 100 different end-to-end scenarios. Auth admin creation preconfirmed their internal addresses and bypassed normal signup. All share a strong generated password stored on the owner's phone; recovery addresses are intentionally undeliverable. No proof uploads, approvals, recovery emails, full-app feature tests, representative role/state tests, cleanup or independent session revocation have been verified. P83 is checked only for provisioning; broad journey, authorization and cleanup checklist items remain open.

## Follow-up: live proof upload on the pilot

The owner uploaded an image using the first campaign account and provided mobile screenshots showing `Proof uploaded. Waiting for review.` and `Waiting for Approval`. A scoped read-only database check confirmed the pilot remains pending and its proof path matches an existing object in the `id-cards` bucket. We did not read the file or its path. The screenshot's image preview appears black; whether that is the source image or a preview problem is unconfirmed. The owner confirmed that the file is test material and contains no password or real personal information. This is one successful upload/attachment observation, not proof of image readability, authorization, reviewer queue behavior, review decisions, cleanup, or all supported file types. The object is a live test artifact to track for cleanup.

## Follow-up: live account consistency checks

A scoped read-only aggregate check of the 100 marked live Auth users and profiles found: 100/100 internal Auth emails marked confirmed by admin creation; 100/100 internal Auth emails match the profile matric normalization; 100/100 profile matric numbers match signup metadata; 100/100 are pending students in the campaign department with one of the four selected levels; 100/100 have deliberately undeliverable `.invalid` recovery-address metadata; and one profile has a proof path. These are live database consistency observations, not real sign-in attempts, signup validation, recovery delivery, authorization tests, browser tests or proof that 100 different scenarios work. No credentials, password hashes or individual rows were returned, and no database writes were made by this check.

## What the 100-fixture access test actually covers

`tests/100-fixture-access.mjs` creates 100 synthetic actor profiles and sessions in an isolated PGlite database, plus two target profiles for review tests. There are **10 categories repeated 10 times**, not 100 unique scenarios:

1. Pending student.
2. Rejected student.
3. Suspended student.
4. Approved student and chat member.
5. Class representative with mismatched confirmed level.
6. Class representative with matching confirmed level.
7. Department helper.
8. Approved student who is not a chat member.
9. Admin without the required second-factor claim.
10. Admin with a simulated second-factor claim.

Each actor is checked against six expected outcomes: reading a chat message, reading a chat file, seeing a pending student’s profile, approving that student, approving a staff applicant and seeing the staff applicant’s profile. **600/600 assertions passed** against the synthetic setup.

**Important limitations:** This test applies the `20261119_phase1_access.sql` migration to a minimal fixture schema. It does not apply every later migration, test actual Supabase Auth, verify real JWT signatures or MFA, test real storage/Realtime/Edge Functions, access production, render the app, test browser sessions, or prove the deployed database has the same policies. The existing phase-1 suite separately tests additional synthetic cases, including stale sessions and suspension. These results are useful regression evidence, not proof of complete security.

## Findings and follow-up

1. **No verified isolated live test environment — blocker for the requested account campaign.** Choose a dedicated staging project or a separately confirmed non-production environment. Never seed 100 accounts into an unconfirmed or live environment. Checklist **P74**.
2. **Browser test environment missing libraries — test infrastructure blocker.** Provision a supported browser/runtime and rerun the browser suite; investigate any actual test failures separately. Checklist **P75**.
3. **Database branch reports `MIGRATIONS_FAILED` — investigation required.** Determine which environment and migration this refers to without resetting or changing the default branch. Do not assume production is broken from this metadata alone. Checklist **P76**.
4. **Access matrix only covers a minimal historical migration — coverage gap.** Test the complete current staging schema with real test identities and actual APIs before treating authorization as verified. Checklist **P77**.
5. **Prior-review items remain open.** Notification controls, anonymity disclosure, home pagination/accuracy, mobile readability, operational proof deletion and other P-items have not been fully validated by this round. No existing broad checklist item is ticked based solely on partial local evidence.

## Proposed next campaign, after a safe environment is confirmed

- Agree target environment, scope, spend/plan implications, test identifiers, permissions and cleanup before any write. Use clearly marked synthetic identities and non-deliverable test addresses; do not email or contact real users.
- Inventory and preflight the environment: verify it is not production, validate schema/functions/storage/config, and establish a safe test-only cleanup method. Do not reset, merge or alter an unrelated branch.
- Provision 100 individually identifiable test accounts in the isolated environment, across relevant states, departments, roles and cohorts. Use secure, ephemeral credentials; never commit or publish them. Record an inventory sufficient for safe, scoped cleanup.
- Execute entry, approval, recovery, profile, permissions and cross-user isolation tests; then exercise messaging, notices, calendar, resources, enabled social/commerce features, moderation and offline/error cases.
- Test at representative mobile sizes, weak networks and actual Android devices. Realtime, calls, notifications, email delivery, accessibility and device permissions require their own appropriate environments; do not label mocked results as live.
- Record each scenario’s expected/actual result, impact, reproducibility and evidence without storing personal information. Add new issues to the checklist and tick only items whose full criteria have been met.
- Remove only explicitly marked test fixtures after the campaign, subject to the agreed retention and cleanup plan; confirm no real data is affected.

## Checklist changes this round

- Added **P74–P77** for the staging environment, browser runtime, reported branch status and full-schema authorization coverage.
- **No prior checklist item was marked complete.** P10 includes available tests and failure triage; the browser suite remains blocked. Other items require broader live, device or operational evidence.
