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
4. Test the result. **Tick `[x]` only when its acceptance criterion is met and there is evidence**; a code change or discussion alone does not prove a live deployment or real-world test passed.
5. Record the item ID, date, summary, evidence, and remaining limitations in `PROGRESS.md`. Never put private user data, passwords, keys, tokens, or sensitive test documents in this repository.
6. Add new work as unchecked items in the right phase. Give each a new unique ID; do not reuse or renumber existing IDs. If an item is too large, split it into numbered subitems and keep the parent open until they are done.
7. If the owner chooses to **defer** or exclude an optional feature, record the decision and how it is hidden or disabled. Do not tick safety checks as passed just because a feature was deferred. Reopen them before enabling that feature.
8. If new evidence disproves a completed item, reopen it and explain why in `PROGRESS.md`.

**Legend:** `[ ]` not yet confirmed complete; `[x]` completed with evidence.
**Scope labels:** **Launch gate** = required for the agreed first release; **Conditional** = required if that feature is enabled; **Later** = improvement to consider after the core launch. Final scope is the owner’s decision, not an assumption.

---

## Phase 0 — Decide what we are launching

**Why first:** It is impossible to know what “ready” means until we agree on the app’s purpose, audience and enabled features.

- [ ] **P01 — Agree the first-release promise and audience** (**Launch gate**). Define who the app serves and the main problem it solves. **Done when:** the owner approves a short product statement and names the initial users.
- [ ] **P02 — Decide the first-release feature list** (**Launch gate**). Review chats, notices, resources, calendar, profiles, GPA, student updates, community, marketplace, rides and calls. **Done when:** every feature is marked launch, limited pilot, hidden/deferred, or later, with an owner-approved reason.
- [ ] **P03 — Identify who operates and endorses the app** (**Launch gate**). **Done when:** the operator and any actual GSU relationship are confirmed and user-facing claims match the evidence.
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

- [ ] **P45 — Decide student-update scope and safeguards** (**Conditional**). **Done when:** visibility, expiry, reporting, distinction from official notices and moderation are agreed and tested. If deferred, record the decision without ticking this item.
- [ ] **P46 — Disclose anonymous-community limitations** (**Conditional**). **Done when:** users see accurate author-visibility and admin-lookup information before posting, and the feature’s policy matches actual access.
- [ ] **P47 — Prepare anonymous-community moderation** (**Conditional**). **Done when:** review, reporting, author-lookup audit, escalation, appeals and moderator support are operational and tested.
- [ ] **P48 — Prepare marketplace safety** (**Conditional**). **Done when:** prohibited listings, item reporting, expiry, sold states, scam guidance and complaint handling are ready and tested.
- [ ] **P49 — Prepare rides and errands safety** (**Conditional**). **Done when:** trip details, reporting, privacy, safety guidance and any vetting claims are accurate and tested.
- [ ] **P50 — Validate voice calls** (**Conditional**). **Done when:** permissions, interruptions, failure recovery and real mobile/campus network connectivity are tested; any TURN deployment needs are resolved.

## Phase 7 — Notifications, mobile design and accessibility

**Why:** An app can look polished and still be difficult to read, tap, navigate or trust.

- [ ] **P51 — Audit notification settings** (**Launch gate**). **Done when:** every visible preference is tested against actual behavior and controls that do nothing are connected or removed.
- [ ] **P52 — Decide and implement the notification plan** (**Launch gate**). **Done when:** in-app alerts and any real push capability, permissions, quiet controls and limitations are accurately documented and tested on supported devices.
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

Add new checkboxes to the most relevant phase using the next unused ID, starting at **P86**. Include a plain-language title, scope label and “Done when” criterion. Record the source of the finding in `PROGRESS.md`. For a large new area, add a new phase without renumbering existing items.

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

- [ ] **P84 — Prevent analytics events from being lost or duplicated during flush** (**Launch gate**). Local tests reproduce an event added while a request is in flight being discarded and overlapping flushes sending the same batch twice. **Done when:** concurrent additions, overlapping flushes, failures and buffer limits are safely handled and independently retested; distinguish local evidence from live measurement.
- [ ] **P85 — Correct calendar exports near midnight** (**Launch gate**). A local export for an event starting at 23:30 with no end time creates an end equal to the start instead of the next-day default. **Done when:** default end times, date rollover and relevant calendar imports are checked and retested, including real mobile calendars.

### Example for discussing an item

**P01 — Agree the first-release promise and audience**

- **What:** Decide exactly who the first release is for and the main things it helps them do.
- **Why:** This determines which features and screens deserve priority.
- **My honest opinion:** Verified class communication, relevant notices and study materials are the strongest starting point; trying to launch every social and marketplace idea at the same time is likely to dilute the experience and increase risk. This is a recommendation, not an owner decision.
- **Next step:** Review a short proposed statement together and record the owner’s decision.
