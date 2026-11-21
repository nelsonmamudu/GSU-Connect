# GSU Connect — Before Launch Checklist

A living, ordered launch plan based on the GSU Connect product and UX review. Start at Phase 0 and work down. We can add new findings from tests at any time.

**Current status:** Planning and verification. All items start unchecked; an unchecked item means it has not been evidenced here, not necessarily that it is broken or absent.
**Source:** `REVIEW.md` in this folder contains the full review and its limitations.
**Last initialized:** 21 November 2026.

> **This is not a claim that the app, its live deployment, security, legal compliance, or store readiness has been fully tested.** Many findings came from screenshots and source-code review. Check the live system and real devices before reaching a conclusion.

## How we use this checklist

1. **Choose an item by ID**, for example: “Let’s work on P01.” Unless you choose another, propose the next unchecked item in order.
2. Before changing anything, explain in everyday words: **what it is, why it matters, my honest opinion, what we will check or change, and any trade-offs or decisions needed.** Be honest about what has and has not been verified.
3. Agree on the scope and carry out the work. Ask for a decision before making a product, safety, privacy, cost, or deployment choice that requires the owner’s approval.
4. Implement the agreed work and test the result. **Tick `[x]` only when the full acceptance criterion is met and there is evidence**; a decision, a code change alone, or a local test does not prove a live deployment or real-world test passed. Record any final-release checks separately; do not claim completion merely because a later item exists.
5. Record the item ID, date, summary, evidence, and remaining limitations in `PROGRESS.md`. Never put private user data, passwords, keys, tokens, or sensitive test documents in this repository.
6. Add new work as unchecked items in the right phase. Give each a new unique ID; do not reuse or renumber existing IDs. If an item is too large, split it into numbered subitems and keep the parent open until they are done.
7. If the owner chooses to **defer** or exclude an optional feature, record the decision and how it is hidden or disabled. Do not tick safety checks as passed just because a feature was deferred. Reopen them before enabling that feature.
8. If new evidence disproves a completed item, reopen it and explain why in `PROGRESS.md`.

**Legend:** `[ ]` not yet confirmed complete; `[x]` completed with evidence.
**Scope labels:** **Launch gate** = required for the agreed first release; **Conditional** = required if that feature is enabled; **Later** = improvement to consider after the core launch. Final scope is the owner’s decision, not an assumption.

---

## Phase 0 — Decide what we are launching

**Why first:** It is impossible to know what “ready” means until we agree on the app’s purpose, audience and enabled features.

- [ ] **P01 — Implement the first-release promise and audience** (**Launch gate; decision agreed, implementation in progress**). The owner approved: “GSU Connect helps GSU students communicate with their classmates and find relevant notices and study materials.” The initial audience is GSU students. The entry-screen copy now reflects this in the working branch. **Done when:** the agreed promise is accurately presented and its core journeys have been implemented and verified; the release itself is verified in the final run. This does not imply university endorsement; see P03 and `PROGRESS.md`.
- [ ] **P02 — Implement the first-release feature scope** (**Launch gate; decision agreed, implementation in progress**). The owner described a school-focused social app and delegated the final feature-scope decision. **Target launch:** verified entry, profiles, chats, notices, resources, calendar, GPA calculator and 24-hour student updates. **Limited pilot:** anonymous posting and comments, and one-to-one voice-only calls. **Hidden/deferred:** marketplace and rides/errands. **Done when:** launch features and pilot safeguards meet their applicable checks, the planned pilot access is implemented and verified, and deferred features are hidden and verified. The working branch removes marketplace, rides and the unready pilot features from normal interface entry points and adds `src/config/launchScope.ts`, which also stops their tables and call subscription from being loaded by the workspace service. That is still a client-side restriction, not a database/API revocation, and it is not deployed; selective pilot access and the remaining safeguards are not fully implemented. See P44–P47, P50, P90 and `PROGRESS.md`.
- [ ] **P03 — Identify who operates and endorses the app** (**Launch gate**). The owner confirmed that they operate GSU Connect independently and it has no official relationship with GSU. This confirms the relationship. The working branch now states independent operation in the entry screen, legal/privacy text and page metadata and removes unsupported “official” notice labels. The deployed release is still unverified. **Done when:** the operator and relationship are accurately stated and user-facing claims match the evidence; see P11 and P91.
- [ ] **P04 — Assign responsibility for launch operations** (**Launch gate**). **Done when:** named owners or a documented responsible team cover development, verification, support, moderation, privacy and incident escalation.
- [ ] **P05 — Define a launch decision and release environments** (**Launch gate**). **Done when:** agreed device/network test scope, staging/production targets, approval authority and rollback expectations are recorded without exposing secrets.

## Phase 1 — Establish the real baseline

**Why:** The review is a starting point, not proof of the live app’s behavior. Check what exists before changing or deleting anything.

- [ ] **P06 — Inventory the live and local app** (**Launch gate**). **Done when:** enabled features, roles, deployment targets and relevant versions are recorded, with differences identified.
- [ ] **P07 — Capture a representative mobile screen inventory** (**Launch gate**). **Done when:** first-use, main feature, loading, empty, error, light and dark states are documented for the agreed device sizes, using non-sensitive test data.
- [ ] **P08 — Map core user journeys** (**Launch gate**). **Done when:** student, staff, reviewer and admin routes from entry through everyday use are documented, including failure and recovery paths.
- [ ] **P09 — Record current problems without guessing** (**Launch gate**). **Done when:** each observed issue has reproduction steps, environment, severity and evidence; unverified risks are explicitly labelled.
- [ ] **P10 — Establish baseline build and automated checks** (**Launch gate**). **Done when:** applicable build, type checks and available tests are run, outcomes recorded, and failures triaged; no test is described as passed if it was not run.

## Phase 2 — Trust, privacy and safety foundations

**Why:** Students may share personal details and rely on the community. Trust must be designed before growth.

- [ ] **P11 — Explain the operator and university relationship** (**Launch gate**). **Done when:** entry, About and relevant notices accurately state who runs the app and any verified endorsement.
- [ ] **P12 — Make policies and support available before signup** (**Launch gate**). **Done when:** working, maintained privacy, terms and support routes are accessible before users submit personal information.
- [ ] **P13 — Confirm eligibility and safeguarding** (**Launch gate**). **Done when:** age and eligibility rules, any protections for minors, and escalation responsibilities are agreed and accurately presented.
- [ ] **P14 — Explain chat privacy in context** (**Launch gate**). **Done when:** messaging users can understand the actual encryption and moderation model; confirm the live behavior before making claims.
- [ ] **P15 — Explain proof-document handling before upload** (**Launch gate**). **Done when:** accepted documents, permitted redactions, access, retention, deletion and support are explained and checked against actual practice.
- [ ] **P16 — Verify document access and deletion** (**Launch gate**). **Done when:** appropriate role access, deletion timing, failed-job handling and operational monitoring are tested end to end without exposing real documents.
- [ ] **P17 — Review personal-data visibility and discoverability** (**Launch gate**). **Done when:** a role-by-role test confirms what profiles, IDs, contact details and presence are visible; unnecessary exposure is corrected or intentionally documented.
- [ ] **P18 — Check account deletion and fallback** (**Launch gate**). **Done when:** automated and manual paths, confirmation, retention exceptions, backups and support expectations are tested and described accurately.
- [ ] **P19 — Obtain appropriate legal and policy review** (**Launch gate**). **Done when:** a qualified reviewer has assessed applicable privacy, age, content and retention obligations and the team records required actions. This checklist does not certify legal compliance.
- [ ] **P20 — Establish reporting and incident handling** (**Launch gate**). **Done when:** reporting routes, responsible responders, escalation for serious harm, response expectations and appeal paths are documented and tested for enabled features.

## Phase 3 — Entry, signup and verification

**Why:** Students cannot benefit from the app if getting in is confusing or review is unmanageable.

- [ ] **P21 — Simplify sign-in and explain its value** (**Launch gate**). **Done when:** users can identify the app, operator, sign-in ID, recovery route and help without unnecessary scrolling or jargon.
- [ ] **P22 — Verify sign-in usability** (**Launch gate**). **Done when:** real-device tests cover valid/invalid credentials, autofill, password managers, paste, keyboard behavior, loading and errors.
- [ ] **P23 — Clarify the registration sequence** (**Launch gate**). **Done when:** student and staff users understand which proof is optional now, which is required for review, and what happens next for their chosen path.
- [ ] **P24 — Test proof upload and verification paths** (**Launch gate**). **Done when:** supported file types, camera/file picker, size limits, OCR/manual entry, error/retry and staff alternatives are tested on agreed devices.
- [ ] **P25 — Simplify pending and rejected screens** (**Launch gate**). **Done when:** the current state, reason and most important next action are visible and tested, with resubmission and support easy to find.
- [ ] **P26 — Establish review capacity and expectations** (**Launch gate**). **Done when:** review ownership, queue coverage, escalation and honest user-facing timing are documented and trialled; do not promise a deadline without capacity.
- [ ] **P27 — Test recovery, suspension and appeals** (**Launch gate**). **Done when:** relevant sign-in recovery, email/phone paths, suspension explanations and appeal/support routes work in the agreed live or staging setup.
- [ ] **P28 — Test progress, interruptions and double submission** (**Launch gate**). **Done when:** leaving, reconnecting, repeated taps and failed requests do not mislead users or lose critical information without warning.

## Phase 4 — First-use experience and navigation

**Why:** After approval, the app must quickly help a student do something useful.

- [ ] **P29 — Design first approved-session guidance** (**Launch gate**). **Done when:** a new user can confirm their context, find the right group and reach a relevant notice or resource without unnecessary steps.
- [ ] **P30 — Simplify mobile navigation** (**Launch gate**). **Done when:** an owner-approved navigation structure is tested with users, frequent actions are easy to find, and duplicate hubs do not add unnecessary steps.
- [ ] **P31 — Standardize feature names and back behavior** (**Launch gate**). **Done when:** labels are consistent across tabs, hubs and menus and Android/back navigation has been tested.
- [ ] **P32 — Make the home screen actionable** (**Launch gate**). **Done when:** relevant notices, upcoming events and unread conversations are prioritized over decorative or redundant content.
- [ ] **P33 — Correct home and hub data coverage** (**Launch gate**). **Done when:** upcoming events and counts are complete for their stated scope or explicitly labelled as partial, including pagination and date-boundary tests.
- [ ] **P34 — Separate empty, loading, offline and error states** (**Launch gate**). **Done when:** the core screens show truthful, distinct states with a useful next action.

## Phase 5 — Core communication and academic features

**Why:** These are the likely reasons a student will return. They must be reliable before expansion.

- [ ] **P35 — Test direct and group messaging** (**Launch gate**). **Done when:** sending, receiving, unread state, group membership, message ordering and basic search pass agreed end-to-end tests.
- [ ] **P36 — Test message failure and retry** (**Launch gate**). **Done when:** weak connection, failed sends, reconnect and repeated attempts give clear outcomes without unintended duplicate sends.
- [ ] **P37 — Test chat attachments and voice notes** (**Conditional**). **Done when:** each enabled format handles permissions, upload/download, file limits and failures on agreed devices.
- [ ] **P38 — Verify block and message reporting** (**Launch gate**). **Done when:** users can find, complete and understand the actions, and moderators can handle test reports appropriately.
- [ ] **P39 — Make notices trustworthy** (**Launch gate**). **Done when:** source, author/role, audience, date, edits, corrections and withdrawals are shown accurately; official status is verified.
- [ ] **P40 — Make timetable data dependable** (**Launch gate**). **Done when:** scope, date/time, venue, updates, cancellation, pagination and date-boundary behavior are tested with representative events.
- [ ] **P41 — Improve academic resource discovery** (**Launch gate**). **Done when:** search and filters work and useful metadata, file type and size are shown before download.
- [ ] **P42 — Establish resource quality and takedowns** (**Launch gate**). **Done when:** permitted seed content, attribution, broken-file reports and inappropriate/copyright-sensitive content handling have owners and a tested process.
- [ ] **P43 — Review directory and profile controls** (**Launch gate**). **Done when:** discoverability, contact controls and visible data match the approved privacy model and are tested across roles.
- [ ] **P44 — Verify GPA calculator claims and storage** (**Conditional**). **Done when:** grading rules are confirmed for the intended audience, results are labelled as estimates and local-only storage is explained and tested.

## Phase 6 — Optional social and commerce features

**Why:** Only do the relevant items if the owner includes or pilots the feature. Otherwise record that it is hidden/deferred and revisit before enabling it.

- [ ] **P45 — Prepare WhatsApp-style student updates** (**Launch gate**). The owner's vision is a lively 24-hour status feature, separate from official notices. The reviewed source has text/photo updates, viewing and replies; actual live behavior is unverified. **Done when:** the allowed audience, blocking, reporting, deletion, 24-hour visibility, actual media retention/cleanup, mobile creation and viewing, replies and moderation are established and tested. Do not imply that expiring from the feed deletes stored media without evidence; video is not promised.
- [ ] **P46 — Define and disclose anonymous-feed privacy** (**Conditional: pilot**). The owner wants a fun Twitter-like posting feature, not a separate community: neither posts nor comments should reveal the participant's name, profile photo, registration ID or other identifying details to other students. The owner accepted restricted, accountable identity access for serious safety cases, disclosed to users. Exact roles, safeguards, access process and retention remain to be defined and verified. The working branch adds a private pilot allowlist, a reason-gated audited comment-author RPC, an audited post-author draft and fail-closed comment access checks; none of that SQL is deployed or proves live anonymity. **Done when:** the detailed policy, real access and retention match the decision; anonymity limitations and privileged lookup are explained before posting/commenting; and server/API access and audit are tested—not just hidden in the interface. Never promise complete anonymity without evidence.
- [ ] **P47 — Prepare anonymous-feed interaction and moderation** (**Conditional: pilot**). **Done when:** the pilot's anonymous posts, anonymous comments and reactions are scoped and tested, and report/takedown, review capacity, any author-lookup audit, escalation, appeals and moderator support are operational. The working branch now includes a draft pending-review anonymous comments backend and local comment/report/moderation UI with mocked and synthetic-database tests. The draft is not deployed, moderation is untested with real reviewers, and comments stay hidden from students. A lively feed must not imply that comments or live behavior already work. See P92.
- [ ] **P48 — Prepare marketplace safety** (**Conditional**). **Done when:** prohibited listings, item reporting, expiry, sold states, scam guidance and complaint handling are ready and tested.
- [ ] **P49 — Prepare rides and errands safety** (**Conditional**). **Done when:** trip details, reporting, privacy, safety guidance and any vetting claims are accurate and tested.
- [ ] **P50 — Validate one-to-one voice calls** (**Conditional: pilot**). Voice calls use internet data or Wi-Fi, not cellular voice minutes; they are not a promise of free data. Source uses WebRTC with STUN and optional TURN; deployed configuration and reliability are unverified. **Done when:** incoming and outgoing calls, microphone permission, audio routing, interruptions, background behavior, blocked users, failure recovery and real mobile/campus network connectivity are tested; TURN capacity, costs and safe short-lived credentials are assessed, and the UX accurately reflects supported behavior. The working branch no longer treats an accepted call row as connected audio: the duration and “Connected” label require a live peer connection, failed offer/answer steps surface an error instead of publishing a false success, slow connections get a truthful hint, and the former “Speaker” control is now labelled as playback volume because web audio cannot reliably switch the phone's audio route. Pure state tests pass. This is still local-only; Vite client environment values are exposed in the client, so do not embed long-lived relay secrets.

## Phase 7 — Notifications, mobile design and accessibility

**Why:** An app can look polished and still be difficult to read, tap, navigate or trust.

- [ ] **P51 — Audit notification settings** (**Launch gate**). Finding: the three visible notification switches were only saved to device storage and were never read by any alerting code, so they did nothing. The working branch removes those switches and replaces them with a truthful in-app-only notice; the theme switch remains functional. Source and render checks pass. **Done when:** the release is checked so no non-functional preference remains and any future preference is connected and tested.
- [ ] **P52 — Decide and implement the notification plan** (**Launch gate**). The working branch now tells users that only in-app unread indicators exist, that there are no push, background or sound alerts, and not to rely on the app for urgent messages. No push capability was added. **Done when:** the owner decides whether push is in scope, and in-app or push behavior, permissions, quiet controls and limitations are tested on supported devices.
- [ ] **P53 — Improve text size and readability** (**Launch gate**). **Done when:** bottom navigation, labels, helpers and critical content are readable at agreed widths and larger text settings in both themes.
- [ ] **P54 — Audit touch targets** (**Launch gate**). **Done when:** interactive targets meet the agreed mobile target size and spacing, including icon buttons and filters, verified in rendered screens.
- [ ] **P55 — Standardize the visual system** (**Launch gate**). **Done when:** buttons, forms, headers, cards, filters, errors and empty states follow an agreed consistent system without unnecessary nested cards.
- [ ] **P56 — Test mobile layout and controls** (**Launch gate**). **Done when:** small widths, safe areas, keyboard overlap, scrolling, camera/file pickers, system back and orientation are tested on agreed Android devices.
- [ ] **P57 — Test accessibility** (**Launch gate**). **Done when:** screen-reader labels and order, focus, contrast, text scaling, modal behavior and reduced motion are tested and significant blockers addressed.
- [ ] **P58 — Review tone and copy** (**Launch gate**). **Done when:** core screens use consistent names, clear actions and understandable errors without unnecessary jargon or unsupported claims.

## Phase 8 — Reliability, operations and measurement

**Why:** A feature is not ready merely because it looks finished when the network is perfect.

- [ ] **P59 — Test offline and recovery behavior** (**Launch gate**). **Done when:** first and repeat launches, lost connectivity, reconnect, queued or failed actions and user guidance are tested and described accurately.
- [ ] **P60 — Measure performance and data use** (**Launch gate**). **Done when:** cold start, scrolling, media, OCR, uploads and downloads are measured on representative low-end devices and slow networks, with major issues addressed.
- [ ] **P61 — Verify notification and call interruptions** (**Conditional**). **Done when:** enabled alerts and calls are tested during backgrounding, interruptions, permissions denial and reconnection.
- [ ] **P62 — Test operational monitoring and recovery** (**Launch gate**). **Done when:** errors, verification queues, deletion failures, incident ownership, backups and restoration/rollback are checked with recorded evidence.
- [ ] **P63 — Establish privacy-respecting metrics** (**Launch gate**). **Done when:** entry, approval, activation, message reliability, return use and moderation measures have defined events, denominators and privacy safeguards; sensitive content is excluded.
- [ ] **P64 — Verify support routes and response process** (**Launch gate**). **Done when:** support contacts work, ownership and realistic expectations are documented, and common stuck-user scenarios are rehearsed.

## Phase 9 — Real-user testing and release decision

**Why:** The app is for students, not just developers. Watch real people use it before declaring it ready.

- [ ] **P65 — Recruit a representative pilot** (**Launch gate**). **Done when:** the agreed sample includes new and returning students, relevant departments, staff/reviewers, lower-end devices and accessibility needs where feasible.
- [ ] **P66 — Run unassisted core journey tests** (**Launch gate**). **Done when:** participants attempt signup, review, group messaging, notice and resource discovery, reporting, recovery and privacy tasks; results are recorded without sensitive data.
- [ ] **P67 — Fix and retest significant findings** (**Launch gate**). **Done when:** serious usability, safety and reliability problems have been resolved or explicitly deferred by the owner with a documented mitigation.
- [ ] **P68 — Confirm release and store readiness** (**Conditional**). **Done when:** the actual intended web/Android distribution, permissions, policy listings, package/version and store requirements are checked for the chosen release; do not claim iOS support without a verified build.
- [ ] **P69 — Hold the go/no-go review** (**Launch gate**). **Done when:** the owner reviews all applicable gates, remaining risks, operations, support and rollback plan and records an explicit release decision.
- [ ] **P70 — Monitor the initial release** (**Launch gate**). **Done when:** an agreed early-release monitoring period, responsible owners and escalation triggers are in place and initial observations are recorded. This is an operational launch step, not a claim that release has already occurred.

## Phase 10 — Improvements after a stable core launch

**Why later:** Nice additions should follow demonstrated student needs, not distract from safety and reliability.

- [ ] **P71 — Evaluate saved materials and reminders** (**Later**). **Done when:** user demand, accessibility, delivery behavior and maintenance cost are assessed before a build decision.
- [ ] **P72 — Reassess optional features using evidence** (**Later**). **Done when:** usage, moderation burden, safety and support capacity inform whether to expand, change or retire pilots.
- [ ] **P73 — Review requests for new features** (**Later**). **Done when:** each proposal has a user problem, expected value, risk, owner and a decision; do not add AI, payments, ads or algorithms just because competitors have them.

---

## New findings and future additions

Add new checkboxes to the most relevant phase using the next unused ID, starting at **P96**. Include a plain-language title, scope label and “Done when” criterion. Record the source of the finding in `PROGRESS.md`. For a large new area, add a new phase without renumbering existing items.

- [ ] **P74 — Establish an isolated 100-account test environment** (**Launch gate**). Confirm staging is separate from production, agree its cost and cleanup, then create clearly marked synthetic test accounts. **Done when:** isolation and a scoped cleanup plan are verified and the agreed test identities are available without affecting real users.
- [ ] **P75 — Repair and run the browser test environment** (**Launch gate**). Chromium ran using temporary NSPR/NSS libraries and the corrected suite passed; see P82. **Done when:** a supported browser runs the existing suite and failures are investigated and recorded, with a repeatable setup.
- [ ] **P76 — Investigate reported database branch migration failure** (**Launch gate**). The connector listed a default branch reporting `MIGRATIONS_FAILED`; its impact is not established. **Done when:** the affected environment, failed migration and current status are identified safely, and an owner-approved remedy or documented risk exists. Do not reset or merge the default branch.
- [ ] **P77 — Validate authorization on the complete staging schema** (**Launch gate**). The 100-actor local matrix covers only a minimal historical migration, not the current deployed schema. **Done when:** representative roles, account states, resources and cross-user denials are tested against the full current schema and actual staging APIs, with evidence.
- [ ] **P78 — Reconcile the database baseline and migration history** (**Launch gate**). The repository lacks the baseline documented in `docs/schema-gap.md`, and live migration versions differ from local files. **Done when:** an approved, complete staging schema and replay strategy are independently verified, including RLS, grants, Storage and history; do not blindly replay a current dump and historical migrations.
- [ ] **P79 — Investigate recovery-email function deployment** (**Launch gate**). The current source invokes `recovery-email`, but the connected project's function list did not include it. **Done when:** the deployed client/function versions and verified-recovery flow are checked in the intended release environment and any mismatch is resolved or explicitly mitigated.
- [ ] **P80 — Verify staging frontend and integrations cannot reach production** (**Launch gate**). Preview and production share some variable scopes; the Android config points at the live site and the app defines a cleanup cron. **Done when:** backend, server functions, schedules, mail, secrets and device builds are independently confirmed to target only isolated resources before test writes.
- [ ] **P81 — Reproduce and test managed-service dependencies safely** (**Launch gate**). A production Auth trigger is attached to `auth.users`, outside the existing schema-only script's selected schemas; Storage policies, grants and other managed settings also need separate review. **Done when:** a reviewed isolated setup includes required Auth, Storage and other managed dependencies, and signup, authorization and file-access behavior are verified with synthetic accounts without touching production.

- [x] **P82 — Investigate proof-card browser test failures** (**Launch gate**, local/mock scope). The four timeouts came from stale expectations for labels, markup or success messages. Updated the local test to match the current component and reran the suite; all cases passed, including mocked upload/resubmission requests. This does not establish live behavior. See `PROGRESS.md` for evidence.

- [x] **P83 — Provision 100 additional marked live test accounts** (**Completed, narrow scope**). The owner ran the Termux tool and a read-only live aggregate confirmed 100 distinct marked Auth accounts with 100 pending student profiles, 25 at each of four levels. One pilot signed in on the owner's phone. These are in addition to six previous fixtures; this item does **not** certify signup, diverse account states, the full testing campaign, cleanup or security. See the test report.

- [ ] **P84 — Prevent analytics events from being lost or duplicated during flush** (**Launch gate**). The working branch now separates in-flight batches, coordinates overlapping flushes, restores failed sends within a bounded queue, persists unacknowledged events (including an in-flight batch) to device storage and restores them on the next load with shape validation. Failures, reloads, malformed stored data and overlapping flushes are covered by local tests. Delivery is now at-least-once, not exactly-once: a lost server response can cause a resend, and storage can be unavailable. Server-side de-duplication, retention and a live measurement check remain outstanding. **Done when:** delivery/retry semantics and those remaining failure modes are addressed or explicitly accepted with safeguards, the intended release is tested, and local evidence is distinguished from live measurement.
- [ ] **P85 — Correct calendar exports near midnight** (**Launch gate**). A local export for an event starting at 23:30 with no end time previously created an end equal to the start. The working branch now calculates the next-day default and local tests cover ordinary, month, year and leap-day rollover plus an explicit end. **Done when:** relevant calendar imports and intended release are checked and retested, including real mobile calendars.

- [ ] **P86 — Establish safe authenticated live-test access** (**Launch gate**). The assistant's workspace cannot directly reach the live app; privileged database queries and mocked browsers are not real signed-in sessions. A manually started GitHub Actions browser runner is one possible approach, but workflow execution, permissions, network access and safe secret handling have not been verified. **Done when:** a reviewed, authorized runner can reach the intended app and sign in as a limited test account, secrets and sensitive outputs are protected, production side effects and costs are controlled, and the access method is documented without credentials. Do not bypass CAPTCHA, rate limits or security controls.
- [ ] **P87 — Complete the live test-account journey campaign** (**Launch gate**). The 100 additional accounts were provisioned as pending students; only one live phone sign-in and proof upload have been observed, not 100 distinct journeys. **Done when:** a documented plan exercises 100 meaningful scenarios using appropriately scoped test identities, including successful and denied access across relevant roles and states, and records actual outcomes, failures, skipped cases, side effects and retests. This complements P17, P22–P28, P35–P50 and P66; account counts or database consistency alone do not satisfy it.
- [ ] **P88 — Verify remaining real entry and review flows** (**Launch gate**). Normal signup, real email/recovery delivery, reviewer proof visibility and readability, approval, rejection and resubmission, and proof retention/deletion were not established by the pilot. The campaign's `.invalid` recovery addresses cannot receive mail. **Done when:** these paths and their failures are tested with suitable synthetic data, authorized reviewer roles and controlled deliverable test addresses, with evidence and safely handled artifacts; relate results to P15–P16, P24–P27, P62 and P79.
- [ ] **P89 — Reconcile and safely clean up live test artifacts** (**Launch gate**). The 100 marked campaign accounts, six earlier marked fixtures and at least one pilot proof need an agreed disposition; the owner has not authorized their deletion. **Done when:** a scoped inventory and owner-approved cleanup/retention plan covers test accounts, proofs and any other created records, execution is limited to approved marked artifacts, and results and leftovers are verified without exposing private data. Do not delete unrelated or real users.

- [ ] **P90 — Hide deferred marketplace and rides/errands** (**Launch gate**). P02 defers both features. The working branch removes their navigation, hub cards and rendered screens and gates their workspace loads/subscriptions behind `src/config/launchScope.ts`, with local render/source tests. This does not disable backend APIs, stop existing clients, revoke database privileges, or change production. **Done when:** the agreed release no longer offers these features to students, including navigation and supported entry points; the change is reviewed and tested on the intended release without deleting existing user data; and the handling of existing clients and backend access is explicitly reviewed. Reassess safety and authorization before any future re-enablement.

- [ ] **P91 — Correct unsupported official-affiliation claims** (**Launch gate**). The owner confirmed no official GSU relationship. The working branch removes “the official student messenger” from `index.html`, adds an independent-operation statement to metadata, entry and legal/privacy text, and replaces unsupported “Official notices” labels with “Campus notices” plus an explicit disclaimer. Local source checks pass. **Done when:** metadata, entry, About, notices and other applicable surfaces accurately describe independent operation and only label notices official when supported, and the deployed release is checked. Source observations are not proof of the exact current live page.
- [ ] **P92 — Build and verify anonymous posting and commenting** (**Conditional: pilot**). The owner wants the feel of a Twitter-like feed, not an entire separate social network; both posters and commenters should appear anonymous to other students. **Done when:** agreed posts and comments, neutral visual identity, interactions and reporting work and are tested; other students cannot retrieve identifying profile details through UI or applicable APIs; privileged-access policy and retention are implemented and disclosed per P46; and users are warned that content itself can identify them. The working branch adds draft comment tables/RPCs, report and moderation flows, a private pilot allowlist and local student/moderator tests; the draft is not deployed, the feed is hidden and existing post APIs are not covered by the pilot check. Live anonymity and comments remain unestablished.

- [ ] **P93 — Review a unique Founder tag and protected authority** (**Launch gate: review later**). The owner wants their account alone to have a Founder tag instead of Admin, with more authority than admin accounts; no other account should be able to obtain that tag. **Live read-only finding:** the connected project already contains `phase1_private.app_owner` with exactly one eligible approved admin row, an immutable one-row binding, a trigger protecting the owner's role/status, `public.elevated_workspace_access()` and a check blocking a public `founder` role; those objects are not readable by clients. The working branch adds a server-derived Founder badge (no client-chosen role) using the existing owner check for the signed-in account and a new read-only `founder_account()` lookup for other viewers, plus local render and synthetic-database tests. `founder_account()` is an undeployed draft and the badge is not live. Authority, recovery/transfer, exact label and the remaining owner decision are still open; no permission, role or account was changed. **Done when:** the owner approves the label and authority model, the public lookup is reviewed and deployed with the intended release, exclusivity/protection are tested across roles with MFA and audit, and recovery/transfer is documented.

- [ ] **P94 — Restrict and audit existing anonymous-author lookup** (**Launch gate**). Read-only inspection of the connected live database found that the legacy `public.confession_author(uuid)` wrapper requires only an approved session and delegates to a private function that checks admin and MFA status; it does not itself require a stated safety reason or write an audit record. The authenticated role lacks direct SELECT privilege on `confessions.author_id`; catalog evidence is not an end-to-end authorization test and does not exclude other paths or logging. A draft audited RPC and legacy-RPC revocation are locally tested in a synthetic database; the draft is not an active migration and is not deployed. A reason code cannot prove the truth of the stated reason; audit review, retention and access rules remain necessary. **Done when:** all lookup paths are inventoried, appropriately limited to serious safety cases, audited, tested for allowed and denied roles against the actual schema, operationally monitored and transparently disclosed before anonymous features are enabled. A frontend-only hide is not enforcement.

- [ ] **P95 — Enforce the deferred/limited scope at the server layer** (**Launch gate**). The working branch hides deferred features and stops the normal client from loading their tables, but database privileges and APIs still allow enabled/older clients to read or write marketplace, rides, anonymous posts/comments and call rows. A client flag is not an authorization boundary. **Done when:** the intended release has reviewed server-side restrictions (roles/policies/RPC revocation or equivalent) for deferred features and the anonymous/voice pilots, tested against the actual schema and older clients, with an owner-approved rollout and rollback; do not delete existing data as part of this. This complements P02, P90, P92, P94 and P50.

### Example for discussing an item

**P01 — Agree the first-release promise and audience**

- **What:** Decide exactly who the first release is for and the main things it helps them do.
- **Why:** This determines which features and screens deserve priority.
- **My honest opinion:** Verified class communication, relevant notices and study materials are the strongest starting point; trying to launch every social and marketplace idea at the same time is likely to dilute the experience and increase risk. This is a recommendation, not an owner decision.
- **Next step:** Review a short proposed statement together and record the owner’s decision.
