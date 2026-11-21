# Implementation status — 21 November 2026

This is the verification sheet for the latest implementation pass. It is deliberately explicit about what is local-only.

**Frontend deployed:** Vercel reports the production deployment for this branch as `READY` and `PROMOTED`; the production alias served the GSU Connect landing page after deployment. This does not mean the staged database drafts were applied or that authenticated journeys were live-tested. Supabase access remained read-only; no account, proof, message or content was changed or deleted.

## 1. What is implemented

### Anonymous posts and comments (pilot, still hidden)
- Draft SQL: `drafts/20261127_anonymous_comments.sql`.
  - Private pilot allowlist (`anonymous_pilot_members`), no client write endpoint.
  - Pending-review comments with approved / own-pending / own-rejected visibility.
  - Report reasons, duplicate-report handling, review decisions (`approve`, `reject`, `remove`, `dismiss_reports`) and a review log.
  - Serious-safety reason required before a commenter's account is revealed, with an access log written in the same transaction.
  - Input-length validation, per-user submission/report rate limits and cursor pagination with a stable tie-break.
  - Public rows never return `author_id`.
- Local UI: `src/components/AnonymousComments.tsx`, `src/services/anonymousComments.ts`, embedded in the hidden feed.
  - Calls the server-side pilot check and fails closed with an invitation-only message for non-pilot accounts.
  - No comment list or form is rendered for non-pilot accounts.
  - Student submission, pending-state explanation, reporting; admin queue, decisions and reason-gated lookup.
  - 44px minimum targets on the new controls.
- Hidden from the app shell; the anonymous feed remains disabled in `src/config/launchScope.ts`.

### Voice calls (pilot, still hidden)
- `src/utils/callStatus.ts` defines the only “Connected” state: an accepted call row plus a live peer connection.
- Duration starts only after audio connects.
- Caller offer failure now cleans up and reports an error instead of claiming success or publishing an offer.
- Receiver answer failure no longer marks the call accepted and allows a retry.
- Malformed SDP, failed/disconnected audio and slow connection show truthful states.
- Ending a call that was accepted but never connected audio is logged as missed, not completed.
- The old “Speaker” button only changed volume. It is now a playback-volume control with an accurate label; the app does not claim to switch the phone's audio route.
- Calls remain hidden; no incoming-call UI is attached.

### Deferred scope
- `src/config/launchScope.ts`: marketplace, rides/errands, anonymous feed/comments and voice calls are `false`.
- The workspace service no longer loads or subscribes to marketplace, rides, anonymous posts or incoming calls while those flags are false. Navigation and screens were already removed.
- **This is client-side only.** It does not revoke database privileges or stop older clients. Tracked as P95.

### Affiliation and trust copy
- `index.html`: removed “the official student messenger”; metadata now says independent, student-built and not affiliated with or endorsed by GSU.
- Entry screen: adds the same independent-operation statement.
- Terms/privacy: states who operates the app, that GSU does not operate or endorse it, and that in-app notices are not official university communications unless a verified source is shown.
- Home, campus, announcements and chat labels changed from “Official notices/updates” to “Campus notices”, with a disclaimer.
- Proof-deletion wording changed from “are deleted” to “are scheduled for deletion”, because deletion is not independently verified.
- View-once media no longer says it is deleted from the chat; it says it is hidden after opening and cannot guarantee server erasure or prevent screenshots.

### Notification settings
- The three visible notification switches were only written to device storage and never read by any alerting code.
- They were removed and replaced with a truthful statement: unread indicators are in-app only, there are no push/background/sound alerts, and the app must not be relied on for urgent messages.
- The theme switch remains functional.

### Analytics delivery
- Unsent funnel events, including a batch in flight, are persisted to device storage and restored after reload with shape validation.
- Flushes run on page hide, visibility change and reconnect.
- Delivery is **at-least-once**, not exactly-once. A lost server response can resend a batch. The live `funnel_events` table has no client-event/idempotency column, so exact de-duplication needs a server change.

### Founder tag
- `RoleBadge` renders “Founder” only when a server-derived flag is true; the role type and labels do not include a client-settable founder role.
- Own profile uses the existing live `elevated_workspace_access()` check. Profile modal and people list use the proposed `founder_account()` lookup.
- Draft SQL `drafts/20261130_founder_badge.sql` adds only the read-only lookup. It grants no authority and does not change the owner's role.
- **Live read-only finding:** `phase1_private.app_owner` already exists with exactly one eligible approved admin row; the immutable binding, owner-protection trigger, owner check and the no-public-founder-role constraint are present, and clients have no table privileges. `public.founder_account()` is **not** deployed, so other students will not see the badge until that draft is reviewed and applied.

## 2. Test evidence (local only)

| Check | Result |
| --- | --- |
| `npm run test:all` (lint + entry + author audit + launch scope + fixture access) | pass |
| `npm run lint` (`tsc --noEmit`) | pass |
| `npm run build` | pass |
| `npm run test:entry` | 60/60 Node tests plus all SQL suites pass |
| `npm run test:author-audit` | 3 synthetic PGlite suites pass (author audit, comments, Founder) |
| `npm run test:browser` (temporary Chromium) | 9/9 mocked tests pass |
| `npm run test:launch-scope:browser` | 9/9 mocked tests pass, including non-pilot denial and student/moderator comment flows |
| `npm run test:launch-scope` | 8/8 render/source tests pass, including the unofficial GPA estimate disclaimer |
| `npm run test:fixture-access` | 100 synthetic actors / 600 checks pass |
| `npm run test:calls` / funnel suites | pass (call state, persistence, reload, malformed storage, concurrency) |
| `git diff --check` | clean |

Browser tests required temporary Chromium at `/tmp/gsu-audit-chromium` with `LD_LIBRARY_PATH` and `CHROMIUM_PATH`. `/tmp` is not persistent, so this setup is not reproducible from the repository alone (P75 remains open).

## 3. What is not done and cannot be claimed

- No real Auth/RLS/MFA or signed-in production journey was tested. The Vercel deployment and public landing-page check only verify the frontend deployment path.
- No real Auth/RLS/MFA test of the comment or Founder SQL. PGlite uses stubbed `auth.uid()`/JWT claims.
- The anonymous comments draft is outside `supabase/migrations`. It protects only the new comment RPCs; the existing post APIs are not behind the pilot check.
- No real reviewer has operated comment moderation. Appeals, escalation, retention and audit review are unwritten.
- No physical-device, mobile-network, background, interruption or TURN-capacity call test. TURN credentials and relay cost are unassessed.
- No live Founder badge check; the public lookup is not deployed. Authority, transfer/recovery and exact label remain owner decisions.
- The GPA screen now clearly calls the output an estimate, not an official GSU result or transcript; the grading scale has still not been verified against current departmental rules.
- No server-side enforcement of deferred features (P95).
- No exactly-once analytics guarantee.
- Live test access (P86) and the 100-scenario campaign (P87) are still blocked: this workspace cannot reach the live app/Auth, and privileged SQL is not a signed-in session.
- Existing test accounts, proofs and their cleanup are untouched (P89).

## 4. Safe rollout order (requires owner approval)

1. Review the three drafts and this document.
2. Reconcile the live schema/migration history (P78) and verify the intended environment (P80).
3. Test the drafts in an isolated environment with real Auth/RLS/MFA and the 100 synthetic scenarios.
4. Decide the Founder label/authority/recovery policy and the notification/push scope.
5. Apply the author-audit draft first (it closes the unaudited legacy lookup), then the anonymous-comments draft, then the Founder lookup.
6. Deploy the frontend only after the RPCs exist; keep the feature flags false until moderation capacity and TURN are verified.
7. Run a live cross-role check and record it before ticking any checklist item.

## 5. Owner decisions still needed

- **Founder:** final label, exact additional authority beyond the existing elevated admin access, recovery and any transfer policy.
- **Push notifications:** is real push in scope before launch, or is in-app-only acceptable for the first release?
- **Pilot access:** who is invited to anonymous posts/comments and calls, and who moderates comments.
- **TURN:** provider, budget and short-lived credential approach for calls.
- **Live testing:** authorize a safe runner or another route for real signed-in journeys.
- **Deferred APIs:** approve server-side restriction or explicitly accept the client-only gate.
