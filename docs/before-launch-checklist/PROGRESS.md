# GSU Connect checklist — progress and decision log

Use this log to record completed work, tests, owner decisions, deferrals, added findings and reopened items. Do not include credentials, private user data or real sensitive documents.

## 21 November 2026 — Checklist initialized

- The initial checklist was organized from the product and UX review in `REVIEW.md`.
- No checklist item has been marked complete. The original review relied on entry screenshots and source inspection; it did not establish that production or physical-device tests passed.
- GitHub repository creation was attempted for `nelsonmamudu/before-launch-checklist` as a private repository. GitHub returned `HTTP 403: Resource not accessible by integration`. The separate GitHub repository was **not created**; the files currently live in the GSU Connect working tree.
- Next step: restore or grant the GitHub connection permission to create repositories, then create the private repository and upload these files. Verify the repository and links before calling this done.

## 21 November 2026 — P10 / P74–P77 — Initial test baseline

- Status: **in progress**; no checklist items completed.
- What was done: ran local type checking, build, entry tests and isolated database tests; added a repeatable 100-simulated-actor, 600-assertion permission matrix. It uses synthetic profiles, not actual Auth accounts.
- Evidence: `TEST-REPORT-2026-11-21.md` and `tests/100-fixture-access.mjs`. The browser suite could not start because the sandbox lacks required Chromium libraries.
- Environment: local Node/PGlite. The Supabase connector was used read-only to list project/branch metadata. No live accounts or data were created.
- Limitations: the requested full-app campaign remains outstanding; one listed branch was marked default and migration-failed, so it must not be assumed to be an isolated test target. Four new follow-up items P74–P77 were added.

## 21 November 2026 — P74 / P76–P80 — Staging investigation

- Status: **in progress**; no checklist items completed.
- What was done: investigated connected project, branch and migration metadata, Vercel project/team settings, repository schema notes, deployment docs and pricing information. All connected-service operations were read-only.
- Evidence: `STAGING-INVESTIGATION-2026-11-21.md`; local `docs/schema-gap.md`, `docs/step2-restore-drill.md`, `vercel.json` and `capacitor.config.ts`.
- Findings: no verified isolated project listed; missing checked-in schema baseline/history alignment; recovery-email deployment needs checking; Preview/backend/device/schedule isolation unproven. Added P78–P80. Provider branch status responses are inconclusive.
- Costs and next decision: actual Supabase plan, free quota and staging costs are unconfirmed. No project, branch, deployment, account or secret was created or modified.

## 21 November 2026 — P74 — Owner supplied Supabase plan screenshots

- Status: **in progress**; no checklist items completed.
- Evidence: owner-supplied dashboard screenshots show the GSU Connect organization on the Free plan and two Free-plan organizations with one project each.
- Limitations: the second project's active/paused status and whether another free project is available are not established; the connected Supabase account listed only the GSU Connect project. No project was created, paused or deleted.

## 21 November 2026 — P74 — Second project identified by owner

- Status: **in progress**; no checklist items completed.
- Evidence: the owner's screenshots show `supabase-fuchsia-dog` reported Healthy, on a Free plan, with no migrations or GitHub repository connected; its organization says billing/access are managed in Vercel. GSU Connect is separately reported Healthy.
- Limitations: the second project was not listed by the connected Supabase account. No migration history, GitHub connection, or monthly active users does not prove it is unused or safe to repurpose. Its purpose, owner approval and integration isolation remain unverified. No changes or test accounts made.

## 21 November 2026 — P74 — Second project dashboard inspection

- Status: **in progress**; no checklist items completed.
- Evidence: owner screenshots for `supabase-fuchsia-dog` show no listed tables in the `public` schema and no signed-up users. The overview shows 19 requests in the last 60 minutes; their source is unknown and may be dashboard or infrastructure activity.
- Limitations: other schemas, storage, integrations, external usage and isolation have not been verified. The connected Supabase account did not list this project; explicit owner approval and a safe access/inspection plan are needed before using or modifying it. No accounts were created and no connected-service settings were changed.

## 21 November 2026 — P74 — Edge Functions dashboard

- Status: **in progress**; no checklist items completed.
- Evidence: the owner shared `supabase-fuchsia-dog` Edge Functions screenshots showing an onboarding prompt to deploy the first function, suggesting none are currently deployed.
- Limitations: storage and external connections remain unverified. The owner reports the Supabase connector is not showing anything for selection; the last connector project listing exposed only GSU Connect. No service settings or accounts changed.

## 21 November 2026 — P74 — Storage dashboard

- Status: **in progress**; no checklist items completed.
- Evidence: an owner screenshot of `supabase-fuchsia-dog` Storage Files / Buckets shows a prompt to create a file bucket and no listed file buckets.
- Limitations: this does not prove the project has no other storage types, external connections or dependencies. Vercel's connected-project details and safe isolation remain unverified. No services or accounts were changed.

## 21 November 2026 — P74/P80 — Vercel resource association

- Status: **in progress**; no checklist items completed.
- Evidence: the owner's Vercel Storage screenshot shows the Supabase resource `supabase-fuchsia-dog` as Available with a `gsu-connect` project badge.
- Limitations: this indicates an integration association, not proof that a particular environment or deployed app actively uses the resource. The connection configuration, effective app backend, external dependencies and isolation remain unverified. Do not repurpose or disconnect the resource without investigation and informed approval. No service settings or accounts were changed.

## 21 November 2026 — P74/P80 — Connected project confirmed

- Status: **in progress**; no checklist items completed.
- Evidence: the owner's Vercel resource detail screenshot explicitly lists `gsu-connect` under Connected Projects for `supabase-fuchsia-dog`.
- Limitations: integration association alone does not prove the effective backend of any deployment or reveal environment scope. Do not change or repurpose either project until isolation and dependencies are verified and the owner approves. No services or accounts were changed.

## 21 November 2026 — P74/P80 — All-environment integration

- Status: **in progress**; no checklist items completed.
- Evidence: the owner screenshot labels the `supabase-fuchsia-dog` connection to `gsu-connect` as **All Environments**. Read-only Vercel environment metadata shows `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` targeted to production, preview and development; their encrypted values were not verified, and the response was truncated. The checked-in browser client uses the Vite variables and the cleanup API can fall back to `SUPABASE_URL`.
- Limitations: the integration's scope does not prove the effective backend used by any specific deployed app or job. Preserve the resource, deployment and environment settings; do not populate it, disconnect it or run tests against it until dependencies and isolation are verified and the owner approves. No connected services or accounts were changed.

## 21 November 2026 — P74/P80 — Owner's URL comparison

- Status: **in progress**; no checklist items completed.
- Evidence: the owner reports that the Vercel `VITE_SUPABASE_URL` value they checked does not match the Supabase ID shown on the `supabase-fuchsia-dog` resource. No value was shared.
- Limitations: the comparison's environment and whether the URL refers to GSU Connect remain to be confirmed. Current settings do not prove the backend baked into any existing deployment or used by other jobs. The `supabase-fuchsia-dog` integration remains connected to all environments; do not repurpose, disconnect or test against it without further investigation and approval. No services or accounts were changed.

## 21 November 2026 — P74/P80 — Owner environment-variable screenshot

- Status: **in progress**; no checklist items completed.
- Evidence: the owner shared a Vercel edit form for `VITE_SUPABASE_URL` with its value obscured and the environment selector showing All Environments. Earlier read-only metadata also listed this variable for production, preview and development. The owner previously said the value they checked did not match the `supabase-fuchsia-dog` ID.
- Limitations: the screenshot is an edit form, not proof any edits were saved, nor proof of the backend of existing deployments. Whether the value matches GSU Connect has not yet been confirmed; branch-specific overrides and other jobs remain unverified. No changes have been made by the agent to connected services.

## 21 November 2026 — P74/P80 — Owner identifies Vite URL target

- Status: **in progress**; no checklist items completed.
- Evidence: the owner reports the `VITE_SUPABASE_URL` value they checked matches the GSU Connect project ID, not `supabase-fuchsia-dog`; the earlier edit-form screenshot showed All Environments selected and read-only metadata listed production, preview and development.
- Limitations: this is an owner comparison of a current setting, not proof about already-built deployments, overrides, other variables or all jobs. The second project remains connected to all environments. Do not use or disconnect it without investigating dependencies, verifying isolation and obtaining informed approval. The agent has not changed connected services or created accounts.

## 21 November 2026 — P74 — Project origins uncertain

- Status: **in progress**; no checklist items completed.
- Evidence: the owner thinks they may have started with `supabase-fuchsia-dog` before building the app, but is unsure. Their screenshots show separate project dashboards: GSU Connect lists its GitHub repository and a migration, while `supabase-fuchsia-dog` lists no GitHub repository or migrations. This does not establish how either project was created or a branch/parent relationship.
- Limitations: the projects' history and dependency isolation remain unconfirmed. A recent-branch summary is not a complete branch inventory. No accounts or connected-service settings changed by the agent.

## 21 November 2026 — P74 — Supabase connector reconnected

- Status: **in progress**; no checklist items completed.
- Evidence: after the owner reconnected Supabase in Arena, `list_projects` listed `supabase-fuchsia-dog` only, not GSU Connect. Read-only calls for the second project found no recorded migrations and no Edge Functions; services reported healthy.
- Limitations: the connector does not currently demonstrate simultaneous access to both projects. Health and empty lists do not establish safety, isolation or lack of external dependencies. No test accounts, projects or configuration changes were made by the agent.

## 21 November 2026 — P74/P77/P78 — Read-only production structure inventory

- Status: **in progress**; no checklist items completed.
- Evidence: the owner reconnected the GSU Connect organization; `list_projects` confirmed GSU Connect. Read-only catalog queries reported 24 ordinary public tables, 3 views, 1 sequence, 88 public functions, 27 non-internal public-relation triggers, 105 public policies and 23 storage policies. All 24 public tables have RLS enabled; `password_reset_rate_limits` and `public_lookups` have zero policies, which may be intentional deny-by-default. Counts include possible extension objects and do not demonstrate permission behavior or a complete baseline.
- Limitations: no live user data or secrets were read and no database or connected-service settings changed. This inventory cannot safely be replayed as a baseline; exports, service configuration, grants, deployed behavior, staging isolation and owner approval remain outstanding. No real test accounts were created.

## 21 November 2026 — P78/P81 — Managed-service dependencies

- Status: **in progress**; P81 added unchecked; no checklist items completed.
- Evidence: read-only catalog queries found 13 ordinary `phase1_private` tables, 2 sequences, 48 functions, one non-internal Auth trigger and 11 non-internal Storage triggers (which may include managed-system triggers). `on_auth_user_created` on `auth.users` invokes `public.handle_new_user`, outside the schema selections in the existing capture script. Read-only extension metadata includes `pg_cron`, `pg_net`, `pgcrypto`, `supabase_vault` and `uuid-ossp`.
- Findings: the script excludes managed schemas and privileges and is not a complete baseline. `bash -n` fails on both the current file and the original checked-in script; the syntax issue remains unfixed so an unsafe export script is not accidentally made executable. It also suggested a PostgreSQL 16 client for a 17 server; comments were corrected and warnings added to the script and historical gap report. No export or restore was attempted. This sandbox currently lacks `pg_dump`, `psql`, Supabase CLI and container runtimes on PATH; the connector does not provide a full schema dump operation.
- Limitations: no live records or secrets were queried. Required trigger behavior, Storage, grants, migration history, schedules and integrations require further verified staging work. No connected services or test accounts changed.

## 21 November 2026 — P74/P78 — Phone-only constraint and export alternative

- Status: **in progress**; no checklist items completed.
- Evidence: the owner says they have only a phone. Reviewed official Supabase CLI dump and GitHub Actions backup documentation. A manual, schema-only hosted job may be possible but has not been built or run; the documented full-backup example includes production data and is not appropriate for this task as-is.
- Limitations: read-only `gh api repos/nelsonmamudu/GSU-Connect/actions/permissions` returned HTTP 403, `Resource not accessible by integration`; Actions availability and permissions are therefore unconfirmed. Cost, credential handling, sensitive metadata, artifact retention, managed-service gaps and staging isolation also require investigation. No secrets requested, workflow created or remote settings changed.

## 21 November 2026 — P74/P78 — GitHub Actions screenshot

- Status: **in progress**; no checklist items completed.
- Evidence: owner screenshot shows recent successful Pages workflow runs; `gh api .../actions/workflows` lists Android APK and Pages workflows active. `gh repo view` confirms GSU-Connect is public. GitHub documentation says manually dispatched workflows require a workflow file on the default branch; the session must work only on its current branch. GitHub states users with read access can download artifacts. Existing workflows running do not establish permission to run an export, its cost, or safe storage.
- Limitations: do not put schema dumps or sensitive logs into public workflow artifacts; no new workflow, credential or export was created. Actions permission settings query remains inaccessible (HTTP 403).

## 21 November 2026 — Owner requests live test accounts

- Status: **not started**; no new accounts created and no checklist items completed.
- The owner changed direction from investigating staging and authorized creation of 100 test accounts on the live site, noting that aside from their own account, the existing accounts are test accounts intended for eventual deletion. They requested the same `12345678` password for all 100. This is not authorization to delete existing accounts now.
- Safety and feasibility: the live service is publicly reachable, the requested password is trivially guessable and shared across accounts, and the source's password-strength indicator labels it too weak (though the visible signup validator only requires eight characters). Creating privileged or approved fixtures with that password could expose live app functions. The Supabase connector has no Auth admin-user creation tool; direct SQL insertion into managed Auth tables is not an appropriate substitute for the Auth API. Browser access to the live app from this sandbox has not been established. Need agreement on safer credentials and a viable creation/testing path, plus fixture inventory and scoped cleanup planning before live writes. No secret values requested or accessed.

## 21 November 2026 — Live campaign consent and browser suite follow-up

- Status: **in progress**; owner agreed to a strong randomly generated shared password for the requested 100 live test accounts. No password was generated, no accounts created, and no existing accounts deleted.
- Evidence: extracted NSPR/NSS libraries from the published `@sparticuz/chromium@143.0.4` npm package to `/tmp`. With `LD_LIBRARY_PATH=/tmp/gsu-browser-libs/lib CHROMIUM_PATH=/tmp/chromium npm run test:browser`, Chromium started; 4 tests/subtests passed and 5 failed (four proof-card subtest timeouts plus their parent). Tests use local mocks. Source inspection identifies mismatches for at least two expectations: `Review decision` is a timeline label rather than a heading, and pending uses `Choose photo or PDF` rather than `Choose replacement`. The other failures remain unexplained; none establish a live app defect. Details recorded in the test report; added P82 and updated P75. No item was checked.
- Limitations: browser libraries are temporary, not a reproducible setup. The sandbox's outbound host restrictions prevent direct live-site/API access, and the Supabase connector has no Auth-user-creation operation. Do not create Auth rows using raw SQL or disclose credentials. A secure executable route, side-effect containment and scoped inventory/cleanup remain to be planned before live writes.

## 21 November 2026 — Owner-created private repository

- Status: **access unresolved**. Owner screenshots show `nelsonmamudu/before-launch-checklist` was created as a private, empty GitHub repository.
- Evidence: the current GitHub integration's read-only `gh repo view nelsonmamudu/before-launch-checklist` returned `Resource not accessible by integration`. A listing of accessible installation repositories also returned HTTP 403. The screenshot establishes the owner's view, not this integration's permission.
- Owner's next screenshot shows the Arena AI Coding Agent installation set to **All repositories**, including current and future repositories. A subsequent `gh repo view` still returned `Resource not accessible by integration`. Installation-wide selection and this session's effective access can differ; the cause has not been established. Do not ask the owner to unnecessarily change or suspend this installation.
- Limitations: no files, workflow, secrets or test accounts added; no GitHub settings changed. This session must remain on its existing GSU-Connect working branch; do not push it to a different repository or branch. Private repository permissions, Actions, billing and a safe execution route are not yet verified.

## 21 November 2026 — Public-visibility access comparison

- Status: **access and private testing route unresolved**. At the owner's explicit request, they changed `nelsonmamudu/before-launch-checklist` from private to public for an access check. Do not infer permission to publish sensitive content or leave it public indefinitely.
- Evidence: read-only `gh api repos/nelsonmamudu/before-launch-checklist` now returns its metadata with `private:false`; the contents endpoint says the repository is empty, and the Actions workflow list reports zero. GitHub reports permissions metadata including push, but no write access was tested, and the Actions permissions settings endpoint still returns HTTP 403. The private-to-public comparison shows public visibility changed what metadata this session can read, not why private access failed or whether any write/workflow access works.
- Limitations: no files, workflows, secrets or accounts created. The repository is currently public; do not publish sensitive output there. This session may only commit and push the current GSU-Connect branch to origin, not publish to the other repository. Recommend returning the empty repo to private per the original request, with owner action/approval, and resolve scoped access separately.

## 21 November 2026 — Repository visibility decision and P82 browser triage

- Owner chose to leave `before-launch-checklist` public for now, with the intention of making it private after launch. Respect that decision; do not place secrets, sensitive metadata, user data or test credentials in the public repository or workflow logs. Publication and any secure live test execution remain unresolved.
- P82: **completed within its local/mock scope**. Corrected four stale expectations in `tests/proof-card-browser.test.mjs`: timeline text was not a heading, pending picker has a different label, missing rejected proof has no attached-file message, and rejected upload shows a resubmission success message. The tests retain mock Storage upload, profile attachment and resubmission assertions. With pinned temporary `@sparticuz/chromium@143.0.4` binaries and libraries and `npm ci`, `npm run test:browser` passed all 9 tests/subtests. No app code was changed. P75 remains open until setup is repeatable/supported; mock tests do not prove live behavior.
- No accounts, workflows or secrets created and no data deleted. The user's live-account decision and strong shared-password approval remain in effect; the Supabase connector offers no Auth admin creation operation and workspace outbound policy prevents direct access to the live endpoints. No direct writes to managed Auth tables.

## 21 November 2026 — Owner-provided evidence of existing test accounts

- The owner shared a screenshot of an earlier Termux session showing test identities created using the existing local production-targeted tool. The screenshot disclosed the shared test-account password; never reproduce or store it in these records. Recommend rotating it for all accounts sharing it, especially elevated accounts. The screenshot does not show the service-key value, and `unset` only removes the shell variable, not the key itself.
- A read-only aggregate query against the connected GSU Connect project found **6** Auth users with the tool's `gsu-qa-review-v1` marker and matching profiles: **5 approved, 1 pending, 0 rejected, 2 reviewer roles** at query time. The old screenshot labels do not establish current states. No individual account record, credential or secret was retrieved, and no account or remote setting was changed. This corrects any impression that there were no previously existing test accounts: earlier reports referred to accounts created in this session.
- Termux is a possible owner-operated execution route. The existing six-account tool targets production, refuses creation when its QA department is occupied, and prints the shared password. Do not rerun it blindly; a reviewed, collision-safe approach and secure password handling are needed. This assistant cannot directly operate the owner's phone or contact live endpoints from this sandbox.

## 21 November 2026 — Additional-account scope and signup triggers

- Owner clarified the request is for **100 additional** live test accounts, not 100 including the six existing marked accounts. No accounts created or credentials changed in this turn.
- Read-only catalog inventory identified the Auth user creation trigger and profile triggers; pattern-only function checks show `ensure_dept_chat` may create chats and references approved status. This does not prove when it fires or that pending signups create chats. Trigger side effects and collision-free identity/cleanup still need review before provisioning; don't assume account creation affects only Auth.
- No actual signup, recovery, proof or full-app testing occurred. Previously exposed shared password still needs rotation; the user has not authorized a particular rotation operation. Termux is a candidate operator-run route, not an environment the assistant can operate remotely.

## 21 November 2026 — Termux provisioning draft and local safety tests

- Prepared `scripts/qa-additional-users.mjs` and local mock tests `tests/qa-additional-users.test.mjs` for **100 additional**, not existing, accounts. A local-only initialization generates a unique campaign, strong shared password and private file inventory. An explicitly confirmed pilot creates one pending student through the supported Auth admin API, with a separate continuation for the remaining 99. The draft does not alter roles or delete accounts, and tracks attempting/created/verified states to stop on ambiguous failures. Secret-key input is hidden and the key is not saved by the script; no password is printed. It does not run actual signup or app journeys.
- `node --test tests/qa-additional-users.test.mjs`: 6/6 passed against fake Supabase APIs, including collision, uncertain outcome, verification failures and pilot gating. `node --check` passed. A temporary-home, pseudo-terminal initialization verified private file modes, 100 planned fixtures and no printed password, with no network. This is not proof of Termux compatibility, live Auth behavior, cleanup, full-app testing or safe production side effects. Do not run the draft against production before review.
- Further read-only catalog checks: `profiles_dept_chat` fires on profile INSERT and UPDATE; the function contains an apparent not-approved guard and a chat insert, but pattern checks do not prove exact control flow or side effects. No production write was made and no additional accounts created. The previously exposed test password still needs rotation.

## 21 November 2026 — Phone kit, exposed-password rotation draft, preview deployment

- Prepared `scripts/qa-rotate-review.mjs` to rotate the six original marked fixtures using supported Auth APIs, with matching profile/Auth/marker checks before any write, a locally generated private replacement password, per-account progress and stop-on-ambiguity behavior. It does not change roles or delete users. `tests/qa-rotate-review.test.mjs` and the 100-account script tests pass **10/10** with mocked APIs. Pseudo-terminal tests confirmed local-only initialization and hidden fake-key input; an early test exposed a prompt/TTY echo race, which was fixed by enabling raw mode before displaying the prompt. These tests do not verify Termux, actual session invalidation, production API behavior, or that other accounts don't use the exposed password.
- A read-only aggregate query matched all six original fixture identities against both profile email and the expected Auth marker; six distinct Auth users matched. No password or secret values queried. No accounts created, changed or deleted; the exposed password has NOT yet been rotated.
- Committed and pushed only the two script files and their mock tests to the current GSU Connect branch (`d462bb6f1519b5f083718420224ba844f8bd9d2b`) so the phone can eventually fetch them. The push **automatically triggered an unintended Vercel preview deployment** `dpl_5mGhN2GSxz45B4ad3QT7nMaJKYhT`; it is READY, staged, target null, with preview OIDC claims. The deployment lists the proof-cleanup cron in metadata and environment variable names, but no values were read. Actual preview backend, cron execution, access restrictions and costs are not verified; do not use it for testing. Production deployment remains listed separately on main. No direct deployment/settings/cron action was taken. Inform the owner and do not create further deployments without considering this consequence.
- Do not execute the drafts against production yet: a safe phone transfer and real-device preflight, remaining side-effect review, and owner's understanding of rotation/partial failures are still needed. Admin-created accounts do not establish actual signup or full-app test coverage.

## 21 November 2026 — Phone kit transferred

- Owner reported that the public current-branch scripts were fetched successfully to their Termux device, with the terminal displaying `Phone kit downloaded`. No script execution or live change was reported.
- The owner subsequently reported successful local-only initialization and supplied a non-secret rotation ID. A pseudo-terminal test of the published rotation CLI's confirmation followed by hidden input passed using a short fake key; the CLI stopped before network use. A separate explicit action is still required to actually rotate. The generated password file is private by filesystem permissions, not encrypted; never request its contents or the service key in chat. Rotation does not establish revocation of existing sessions and does not cover unrelated accounts that may share the exposed password.

## 21 November 2026 — Owner-reported six-fixture password rotation

- Owner reports the Termux rotation tool printed `Password update acknowledged for 6 marked fixtures.` No password or key was shared in chat. The supported Auth admin updates were performed by the owner on the phone, not by this assistant's connector.
- This is evidence of the tool's reported API acknowledgements, not independent proof of successful sign-in or session revocation. Existing sessions may remain active. Other accounts, if any, that used the exposed password are outside the six-fixture scope and still require attention. The 100 additional accounts remain uncreated.

## 21 November 2026 — Owner initialized 100-account campaign locally

- Owner reports local-only initialization of a new campaign; no additional Auth accounts were created by this initialization. Password and private inventory were not shared in chat.
- A pseudo-terminal test of the phone kit's pilot confirmation and secret prompt passed locally with a short fake key; the fake key was not echoed and failed before any network call. Mock tests remain the only provisioning coverage. Owner must explicitly run the pilot and report its outcome before checking live side effects or considering the other 99.

## 21 November 2026 — One live additional-account pilot

- Owner ran the Termux provisioning pilot and reported `Verified 1 of 100 campaign accounts.` A separate read-only aggregate query confirmed **1** Auth user with the campaign marker, **1** matching profile, a pending student role/status and no linked proof. It does not validate sign-in, normal signup, email delivery or full-app behavior.
- A bounded, read-only check scoped to the pilot found **0** chats created by the pilot or in its synthetic department, **0** chat memberships, **0** messages sent, **0** owned Storage objects and **0** entry-change rows at query time. This does not rule out other side effects, scheduled work, emails or future changes. No account creation or mutation was performed by the assistant's connector.
- Hold the remaining 99 until pilot sign-in and pending-screen behavior are checked and any errors or unintended effects investigated. The local password is sensitive; don't request its value or screenshots containing it in chat.

## 21 November 2026 — Owner's live phone pilot sign-in

- The owner shared screenshots of the pilot on the live site showing `Finish Verification`, proof required, the campaign identity, and `Incomplete` status. This is consistent with a successful sign-in for the one pending, no-proof synthetic student. No proof upload, normal signup, rejection/approval, email delivery, or full-app behavior was verified.
- The screenshots show a promise that verification files are deleted within 24 hours after approval. Operational enforcement is not established; retain P15/P62 unchecked. The campaign's `.invalid` recovery addresses cannot receive mail and must not be used as evidence that recovery works (P27/P79). The 99 remaining accounts are not yet created; all planned initial accounts are pending students with varying levels, not 100 completed scenarios.

## 21 November 2026 — 100 additional live accounts confirmed (P83)

- Owner reports `Verified 100 of 100 campaign accounts` after running the phone tool. Independent read-only aggregate queries found 100 marked Auth users, 100 distinct markers and 100 matching profiles, all pending students in the campaign department: 25 each at 100/200/300/400 level, zero with linked proof. The six earlier marked review users remain present. The aggregate does not prove that existing users were otherwise unaffected or that all 100 can sign in.
- Bounded checks at query time found zero campaign-related chats, memberships, sent messages, owned Storage objects or entry-change rows; other side effects and later changes are not excluded. Only the pilot's phone sign-in has been observed. Admin provisioning bypasses signup and all recovery addresses are intentionally undeliverable.
- Added and checked **P83** for the narrowly evidenced provisioning step only; next ID P84. No broad sign-in, cleanup, security, app journey or staging check was ticked. Campaign inventory and password remain on the owner's device; no secret or user record values were requested.

## 21 November 2026 — Owner's live pilot proof upload

- The owner used the first campaign account on the live phone site. Their screenshots show `Proof uploaded. Waiting for review.`, `Waiting for Approval`, a submitted-proof step, and a `Replace file` control. A scoped read-only aggregate independently confirmed one matching marked pilot profile, still pending, with a proof path and a matching `id-cards` Storage object. No file contents or paths were retrieved and no account was approved by the assistant.
- The screenshot's preview thumbnail appears black; whether the uploaded image itself is black or the preview is faulty is not established. The owner confirmed the uploaded image contains only test material, with no password or real personal information. Proof readability, reviewer access, permissions, actual queue visibility, rejection, approval and deletion remain untested; P24/P15/P62 stay unchecked. The live file is a test artifact requiring scoped cleanup later.

## 21 November 2026 — Live account consistency and ownership of testing

- At the user's request for the assistant to perform the tests, ran a scoped read-only aggregate against the 100 marked live accounts: 100 admin-confirmed internal emails; 100 profile matric-to-internal-email matches; 100 metadata/profile matric matches; 100 pending student profiles in the synthetic department; 100 selected levels; and 100 `.invalid` recovery-address metadata values. One profile had proof attached. These are database consistency checks, not 100 sign-ins or real end-to-end scenarios. No credential values or individual rows were retrieved, and no writes were made.
- The owner reasonably expected the assistant to perform testing rather than guide repeated manual actions. The workspace cannot contact the live website/Auth endpoint or control the phone; the Supabase connector can run scoped database checks but is not an interactive app browser. Automation on the phone or a hosted runner might cover some live API journeys, subject to actual security checks/rate limits, but is not yet built or proven. Never claim a full live end-to-end campaign was run, bypass CAPTCHA, or ask the user to share passwords, keys or tokens. Reduce owner interaction and distinguish what the assistant, phone-run automation and owner did.

## Log template

Copy this section for each meaningful update:

```text
## YYYY-MM-DD — P00 — Short title
- Status: completed / in progress / deferred / reopened / new finding
- What was done or decided:
- Why / owner's decision (if applicable):
- Evidence: test command and outcome, screenshot, PR/commit, or other non-sensitive reference
- Environment: local / staging / production / device details, as applicable
- Limitations or follow-up:
```

### 2026-11-21 — Expanded local audit and scoped live recheck

Re-ran clean install, lint, build, entry and graduation suites, 100-actor synthetic access matrix, QA tool unit tests and mock-backed Chromium browser tests; all passed. Added three deterministic expected-behavior regression tests: **all three currently fail**, reproducing two funnel buffer concurrency defects and a midnight calendar-export defect. Added open P84 and P85; no production code changed or deployed as part of these findings. See `TEST-REPORT-02-2026-11-21.md` for commands, evidence and limitations.

A fresh scoped, read-only campaign aggregate showed 100 marked pending students, one proof link and matching object, zero broken links and zero unexpected staff IDs. This is not an authenticated 100-account journey or evidence about actual reviewer visibility. No account, proof or other live data was modified in this recheck.
