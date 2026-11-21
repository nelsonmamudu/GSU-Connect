# GSU Connect — honest mobile product and UX review

**Review date:** 21 November 2026
**Audience:** Product owner, designer and development team
**Verdict:** Promising campus product; not yet a coherent, trustworthy, mobile-first experience across the whole journey.

## 1. What I reviewed — and what I could not verify

I reviewed the project’s mobile entry and account-status screenshots, the React/Capacitor app shell, component layouts, user-facing copy and relevant service code. The screenshots are of real components but use fixture data and simulated network responses, as described in `qa-screenshots/README.md`. I visually inspected sign-in, dark mode, student proof, account creation, pending and rejected states. I assessed the signed-in screens and their behavior from source code, **not** from a complete interactive session with real student accounts.

I did **not** test a production account, real university records, a real approval queue, live notifications, calls, payments, mobile hardware, screen readers, poor networks, or store releases. I cannot confirm live backend configuration, actual data access, legal compliance, adoption, feature reliability, or device-specific bugs from the repository alone. Recommendations below are product judgments; code observations are not a security audit.

## 2. Executive verdict

GSU Connect has a real product idea: a verified Gombe State University community where students can communicate and access relevant academic information. That is much more meaningful than another generic social feed. Its green-and-warm-neutral visual language, readable entry screens, thoughtful recovery flow and campus-specific language are a good start.

The brutal part: **the product currently feels like several apps competing for attention rather than one app solving one urgent campus problem exceptionally well.** It contains messaging, calls, a directory, notices, academic resources, calendar, GPA calculator, student updates, an anonymous feed, marketplace, rides and errands, plus administration. Each is a separate promise to maintain and moderate. If students cannot reliably find a class group, see a relevant notice and send a message, the extra features will not save it.

The most concerning trust issues are not aesthetic:

1. **Notification controls appear disconnected.** Profile settings save preferences locally, but the reviewed code contains no other reader of those preferences; the interface promises badges and sound behavior that needs to be wired up and tested, or removed. I also found no apparent native push integration in the reviewed project. This does not prove a deployment cannot use an external service. (`ProfileView.tsx`, notification settings; `App.tsx`.)
2. **“Anonymous” needs a much clearer explanation.** The community UI says names and matric numbers are not displayed, but an admin has an author lookup. That can be a legitimate safety measure; it must be disclosed clearly *before posting*. Anonymous to other students is not the same as anonymous to the platform. (`ConfessionsView.tsx`.)
3. **Home can mislead.** Its schedule and counts are calculated from currently loaded arrays, while workspace data is paginated; calendar data is initially fetched by creation date. Consequently the nearest upcoming event may be outside the loaded page, and counts can be partial. “Your calendar is clear” should not be shown as an authoritative conclusion until loading and coverage are known. (`WorkspaceHomeViews.tsx`, `supabaseService.ts`.)
4. **Mobile readability is too often sacrificed.** The bottom navigation labels use 9.5–10px, and multiple secondary actions and labels across the product use 10–11px or touch areas below 44px. The visual design can be polished and still be tiring or difficult to use. (`App.tsx`, `WorkspaceHomeViews.tsx`, feature components.)
5. **Verification creates a wait before value.** This may be necessary for safety, but the app asks for sensitive proof and offers no fixed review deadline. A long or unclear wait can kill adoption before the user experiences the benefit. (`AuthScreen.tsx`, `StatusGateScreen.tsx`.)

### My qualitative scorecard

These are directional design judgments, **not measured usability scores**:

| Area | Assessment | Why |
|---|---|---|
| Product opportunity | Strong | Specific university, useful local needs and verified community. |
| Entry-screen visual design | Good foundation | Consistent palette, legible hierarchy and clear primary actions. |
| Product focus | Weak | Too many unrelated destinations and overlapping hubs. |
| Navigation | Mixed | Five understandable tabs, but useful features are distributed across hubs and a drawer. |
| Everyday usefulness | Promising, unproven | Messaging, notices and materials could be valuable if they are accurate, populated and reliable. |
| Trust and safety | Needs urgent work | Disclosure, reporting coverage and operational promises need verification. |
| Mobile accessibility | Needs work | Small text and controls appear throughout the source. |
| Launch readiness | Not established | No end-to-end live/device review was possible; several important UX risks remain. |

## 3. Product positioning: decide what GSU Connect is

The sign-in screen describes the product as **campus messaging**. The signed-in app also looks like an academic portal, social network, classifieds site and ride board. That disconnect sets the wrong expectation.

**Recommended promise:** “Your verified GSU community: class conversations, trusted notices and study materials in one place.” Validate this with students; do not describe it as university-official unless that relationship is real and documented. Clearly name the operator and whether the university endorses or runs it.

### Define the primary users and their jobs

- **Student:** Find my class or department group; know what changed; ask classmates; find notes or past questions.
- **Class representative:** Reach the right cohort, post a useful update and know where to correct mistakes.
- **Lecturer/staff:** Share authoritative information with the right audience without being impersonated.
- **Reviewer/moderator:** Verify identity safely, resolve reports quickly and leave an understandable audit trail.
- **New or returning member:** Understand eligibility, access and what happens if verification fails.

A strong first version should win at the first three jobs before adding more surface area.

## 4. The journey, from first open to daily use

### A. First impression and sign-in

**What works:** The logo, restrained emerald and warm white feel calm and more credible than a generic neon campus app. The sign-in form is easy to locate. Password visibility, a helpful error, and dark mode are present in the captured states. The recovery note distinguishes sign-in ID from phone number.

**What needs improvement:** The top branding and introductory copy take substantial vertical space before the form. “Class reps, departmental helpers” is internal jargon rather than a benefit. New users have no immediate way to judge who runs the app, why their university ID is requested or what they will get after joining. The cap icon is polished but generic; the app needs a more distinctive GSU personality without copying official university marks or implying endorsement.

**Recommendations:**
- Shorten the intro to a benefit and explain who is eligible in one line.
- Put “Who runs this?”, Privacy and Help within reach **before** requesting personal data. Link to real, maintained policy pages and a reachable support channel.
- Keep matric/staff ID sign-in if necessary, but demonstrate the exact ID format and offer a plain explanation of recovery email versus optional phone.
- Test autofill, password managers, paste, keyboard type, return key and recovery on real devices. Do not assume the screenshot proves these work.

### B. Registration and verification

**What works:** Proof → Details → Account breaks the task into meaningful steps. A student can continue without uploading proof immediately; the proof control tells users about file types and redaction. OCR is described as on-device in the implementation, with a manual alternative. Staff have different verification paths.

**What hurts:** Starting with “Proof” means asking for a sensitive document before the user has experienced value. For a student, “optional now” can easily sound like “optional altogether,” while the later gate requires it to enter review. The form is tall and repeats the review explanation. Staff and student paths carry different rules, which users may not understand. The screenshots show multiple dense instructions and small helper text. Do not let nice form styling disguise the friction.

**Recommendations:**
1. State upfront: “Create an account first; upload proof before an authorized reviewer can approve access.” Only say this where it matches the selected path.
2. Before upload, show exactly which documents are accepted, what may be redacted, who can view them, when each type is deleted, and how to get help. Verify these promises against live behavior.
3. Show a concrete review target only if the team can actually meet it. Otherwise give an honest range or “No guaranteed review time” and an escalation route.
4. Preserve progress and explain what happens if the user leaves, loses connection or changes device. Test rather than assuming persistence.
5. Make camera/file-picker choices mobile-friendly; keep paste and drag-and-drop as secondary affordances on phones.
6. Confirm eligibility and minimum-age rules with the operator; show the relevant terms and policy before submission, not only inside the signed-in profile.
7. Use password guidance that matches actual validation. Support password managers and paste; avoid forcing arbitrary complexity beyond the actual policy.

### C. Pending, rejection, suspension and recovery

**What works:** The pending screen says whether proof is needed; rejection provides a reason and replacement path. The app has recovery and status states rather than a generic dead end. The screenshot explicitly says review has no fixed deadline, which is more honest than inventing one.

**What hurts:** The pending screenshot is very long. It places “Check status” above the required upload, while the most important next action is further down. Rejection shows “Check status” before the reason and corrective action. “Finish Verification,” “proof,” “review queue,” “status” and “account created” are understandable separately but make a simple situation feel procedural. Users need to know whether a file is attached, whether the application is submitted and what they need to do next.

**Recommendations:** Put the current state, one required action and its explanation above everything else. Suggested structure: **“Upload proof to request review” → Choose photo or PDF → What happens next → Your details → Help/sign out.** For rejection: **reason → fix → resubmit → appeal/help**. Make “Check status” secondary if automatic refresh is actually working. Test uploading, failure, resubmission, abandonment and recovery as separate states.

Give suspended users a clear appeal path and reasonable expectations, without exposing another person’s report. Support details must be current and monitored; a personal-looking email address in the screenshot can undermine confidence even if it works.

### D. First approved session and activation

Today is the default landing tab. It contains a greeting, schedule, notices and shortcuts. This is welcoming, but a new user’s first visit should not look like a dashboard of zeros.

**Recommendation:** Give new members a short, dismissible setup tailored to their role: confirm department/cohort → find or request their class group → open the latest relevant notice → find a resource. Make the first useful action visible above decorative welcome copy. Never silently add people to sensitive groups, publish their profile or imply a notice is official without verifying its source.

### E. Navigation and information architecture

The current mobile bar is **Today / Chats / Study / Campus / Profile**; a hamburger drawer also exposes calendar, repository, announcements, updates, people, marketplace, rides and community. Study and Campus introduce additional cards that lead to destinations also available in the drawer. This is not inherently wrong, but it makes the user learn several routes to the same feature and adds taps.

**My view:** Keep five tabs at most, but choose them from real frequency data. A sensible hypothesis is **Home / Chats / Study / Notices / More**. Put profile, marketplace, rides and experimental social features under More; put Calendar and Resources directly in Study. If notices are not sufficiently frequent, retain Campus instead. Test two structures with students before changing it.

- Increase bottom labels to roughly 11–12px and preserve a generous touch area.
- Use consistent labels everywhere: “Student updates” vs “Community” vs “Confessions & Gist” is hard to map mentally. Pick clear, distinct names.
- Ensure the selected tab is clear on every destination; provide a predictable back path and Android back behavior.
- Avoid a new dashboard for every category. On phones, a direct list of actionable items often beats tall cards with repeated descriptions.
- Test safe areas, system navigation, keyboard overlap, orientation and the chat composer on actual Android devices.

### F. Today, Study and Campus hubs

The home greeting and contextual upcoming events are a good idea. The problem is **space and credibility**. A large greeting card, separate count cards and repeated shortcuts can push useful information below the fold. A count from only loaded records can look definitive when it is not; the next event selection has the same issue.

**Redesign the home around:**
1. Important, relevant notice with verified source and date.
2. Next class/exam with time, venue, scope and last updated time, when data is reliable.
3. Unread conversations with direct links.
4. One or two context-aware actions, not a grid of everything.

If there is no data, say “No events loaded yet” or “No upcoming events found” only when that is true, and offer an appropriate next action. Use backend aggregates or scoped queries for complete counts and upcoming events; otherwise label them as loaded items. Treat an error differently from an empty state. Reduce count cards that do not lead anywhere or support a decision.

### G. Chats, groups and calls

This should be the most polished part of the product if messaging is the promise. The code includes group and direct chats, search, attachments, voice notes, reporting/blocking and voice calls. That breadth is impressive, but it raises the quality bar: each behavior must work under poor connections and on inexpensive phones.

**Recommendations:**
- Prioritize fast conversation loading, clear sender identity, message timestamps, delivery/failure states, retry without duplication, unread position, search and understandable group membership.
- Make the composer’s primary action obvious and avoid crowding it with rarely used icons. Test long messages, attachments, microphone denial, keyboard opening and large system text.
- Make reporting and blocking easy to find, explain what blocking does and show confirmation. Keep evidence/report outcomes appropriately private.
- Test calls separately for microphone permission, dropped connections, interruptions, handset switching and mobile/campus NATs. The project describes TURN as optional; deployment and call reliability must be verified. Do not market calls as dependable until tested.
- Clearly disclose that chats are access-controlled, **not end-to-end encrypted**, and that authorized moderation is possible. This is already stated in the in-app privacy copy, but users need to see the essential context when it matters.
- Be explicit about notification reality: implement and test push if it is required for the product, including consent and quiet controls. Until then, never imply that closed-app delivery exists.

### H. Announcements

Relevant, reliable notices could be the app’s strongest reason to return. “Official” is a trust claim, not a visual style. Today labels its section “Official updates”; ensure each author really has authority and that the notice’s scope and provenance are verified.

Show author/role, department or university scope, date, last edited time, and an obvious correction or withdrawal state. Keep student discussion visually separate. Avoid notifying everyone for every update. Ask class reps and staff whether they can keep information accurate before promising that students can rely on it.

### I. Calendar and timetable

A timetable only earns trust if it is right. Today pulls upcoming items from loaded records; the initial event query orders by creation time, so a future event may not be in that set. There is also a local-date versus UTC-date difference between Today and the Study count. These are concrete reasons to test date boundaries and pagination.

Show event type, date, start/end, venue, scope, source and last updated time. Make cancelled or changed classes prominent, not silently edited. Allow a user to distinguish a university event from a personal/class item. Test time zones, past/future boundaries and events with missing times. Reminder/export ideas come later, after correctness.

### J. Repository and academic resources

Past questions, lecture notes and guides are high-value, local reasons to use the app. Existing search and filters are a useful foundation. The risks are stale files, unclear ownership and a blank library.

Show course code, department, level, session/year, contributor, upload date, file type and size before download. Give a clear view/download action and mobile preview where supported. Label unverified student submissions. Add a way to report a broken, inappropriate or copyright-sensitive file and handle takedowns. Do not imply that a resource is endorsed by a lecturer unless it is. Seed the library with permission and real materials, not fake examples.

### K. People and profiles

A campus directory can help students find classmates, but it can also enable unwanted contact. Search, department/level filters and profile information should be deliberate opt-ins, not an assumption that every student wants to be discoverable.

Let users understand what peers see, choose discoverability and control contact where practical. Avoid exposing matric numbers, recovery data, phone numbers or online presence unnecessarily; verify actual permissions and rendering across roles. Provide block/report paths and test blocked-user behavior. Profile settings are currently a long collection of functions; group them as **Profile, Privacy & safety, Notifications, Security, Help and About**, with dangerous actions visually separated.

The GPA calculator is a potentially useful local feature, but it is buried in Profile. Its grade scales, class thresholds and advice need confirmation with current university rules and relevant faculties. Present it as an estimate, show assumptions, avoid promising an official result, and explain that its data is stored on the device and may be lost when storage is cleared or the device changes.

### L. Student updates and anonymous community

Student updates are 24-hour story-like posts; community is a separate moderated anonymous feed. Both compete for users and moderator attention. “Student updates,” “Community,” “Confessions” and “Gist” should not blur into one vague social area.

**My advice:** De-emphasize both during the core launch until there is a moderation plan. If retained, choose a clear purpose for each and make safety actions reachable on the item. For anonymous posts, say prominently: **“Your name is hidden from other students. Authorized admins can identify the author for safety and moderation.”** Verify the exact policy and access scope before using this wording. Explain review, retention, author lookup, appeals, and limits of anonymity, including self-identifying content. The current code includes pre-publication moderation and an admin author lookup; do not claim full anonymity.

Provide report categories, a staffed queue, escalation for serious threats, audit of identity access and appropriate support resources. Do not gamify harmful rumors through popularity sorting without safeguards. The source inspection did not establish a general report flow for each public-content type; verify it before launch.

### M. Marketplace, rides and errands

These are attractive ideas, but they introduce scams, harassment, physical safety and support work. The marketplace already has categories, search, sorting and seller contact; rides have routes and cost fields. Those controls do not by themselves make a transaction or meeting safe.

**Recommendation:** Hide or pilot them with a limited group until the core academic product works and a team can handle abuse. If launched, add clear item-level reporting, prohibited listings, seller identity context appropriate to privacy, safe-meetup guidance, expiry, sold/closed status and a scam response process. For rides: show trip date/time, route, capacity and cost clearly; discourage exposing sensitive locations and avoid implying drivers or vehicles are vetted unless they truly are. No in-app guarantee of payment, refunds or personal safety should be implied without an actual process.

### N. Moderation and admin experience

Review and moderation are part of the user experience even though students do not see the queue. Slow or inconsistent decisions hurt the entire product. Give reviewers scoped access, a clear queue, document preview, reason templates, notes, escalation, search, audit history, workload indicators and protections against duplicate decisions. Track queue age and rejection/resubmission rates. Explain access rights and keep sensitive documents out of unnecessary interfaces.

Do not assume the admin UI alone proves secure access, logging, proof deletion or compliance. Verify those end to end, including failed jobs and the actual support process. Protect moderators with clear policies and a plan for distressing content.

## 5. Visual and interaction design system

### Keep

- Deep green, warm neutrals and restrained use of color.
- Clear primary buttons, consistent icons and the dark-mode option.
- Explicit status text rather than relying on color alone.
- The generally calm tone of the entry screens.

### Change

1. **Typography:** Aim for 14–16px body and form text where feasible; keep secondary functional text readable, generally at least 12–13px. Replace 9.5px navigation labels and audit 10–11px controls. Test contrast in both themes and with actual font scaling; no single fixed size guarantees accessibility.
2. **Touch targets:** Target at least 44×44 CSS pixels for interactive controls, even when the visual icon is smaller. Check spacing between adjacent targets. The existing UX notes already flag many smaller controls; count actual rendered areas rather than relying on source-token counts.
3. **Hierarchy:** Each screen should answer “Where am I?”, “What matters?” and “What can I do?” in that order. Use one primary action per context. Reduce repeating headings, intro copy, cards and icon tiles.
4. **Density:** The current rounded cards and padding make the app feel friendly, but nested sections and large hub cards can waste precious mobile height. Use dividers and well-spaced rows for lists; reserve large cards for genuinely important actions.
5. **Consistency:** Standardize page headers, form labels, button treatments, chips, error banners, empty states and modals using shared components. Keep selected states obvious without relying only on green.
6. **Copy:** Prefer plain verbs and outcomes: “Upload proof,” “Request review,” “Message seller.” Avoid internal words such as “scope” or “queue” without explanation. Use consistent capitalization and names.
7. **Accessibility:** Check visible focus, meaningful labels, dynamic type/browser zoom, screen-reader order, modal focus and escape, reduced motion, image descriptions and contrast. These require actual testing; source review is not a substitute.
8. **Mobile behavior:** Test 320–360px widths as well as 390px, Android system back, safe-area insets, keyboard resizing, camera/file pickers and landscape. Avoid hover-only controls.

## 6. Reliability, privacy and user trust

- **Offline:** There is an offline state/banner in the app. That is positive, but test what happens to every important action when connectivity is slow, lost mid-send or restored. Explain whether data is cached, whether a message is queued and whether the user must retry. The Capacitor configuration points to a hosted site; test first launch and later launches without connectivity rather than assuming the bundled `dist` works offline.
- **Notifications:** Fix or remove the settings that appear to save locally without affecting other reviewed code. Add a real push plan only if the product and team can support it.
- **Loading and errors:** Make loading, no results, no access, offline and server failure visibly different. Provide a next action, not a permanent spinner or a misleading empty screen.
- **Privacy:** Surface the key facts at collection and posting time. Ensure public policy, actual access controls, retention/deletion jobs and support practice agree. “Deleted within 24 hours” is a specific promise: monitor it and explain failures and exceptions. Have a qualified local professional review NDPA claims; this review does not establish legal compliance.
- **Age and safeguarding:** The policy references users aged 16 and above. If minors can use the app, assess interactions with adults, anonymous content, marketplace and rides, and implement appropriate safeguarding and escalation before launch.
- **Account deletion:** The profile has a deletion flow and a manual fallback. Test both, set expectations about retained records and backups, and provide confirmation and support. Do not promise complete deletion unless the implementation and policy actually support it.
- **Performance/data cost:** Measure cold start, list scrolling, image/file sizes, OCR initialization, upload and retry on lower-end Android and weak mobile data. Allow users to understand file sizes before downloading and avoid unnecessary background activity.

## 7. What to keep, add, defer and remove

| Decision | Features | Reason |
|---|---|---|
| **Keep and strengthen** | Verification, chats/groups, scoped announcements, academic resources, calendar, recovery, moderation | Together these support the clearest campus job. |
| **Keep, simplify** | Today, Study, Campus, People, Profile, GPA calculator | Useful if navigation, privacy, correctness and empty states improve. |
| **Add first** | Honest privacy/identity disclosures, real connected notification controls or removal, item-level safety reporting where missing, accurate event/count queries, reliable retry states, support/appeals | Fix trust and everyday usability before increasing scope. |
| **Pilot or defer** | Marketplace, rides/errands, anonymous community, student stories, voice calls | They need substantial activity, moderation or reliability to justify their complexity. Do not delete existing user data to simplify the interface. |
| **Remove or hide** | Any setting or CTA that does not do what it promises; redundant dashboard tiles; misleading authoritative counts; unsupported “official” or “anonymous” claims | A smaller honest app is better than a large confusing one. |
| **Do not add yet** | Payments, AI assistant, public social feed, recommendation algorithm, streaks, advertising | None addresses the biggest current trust and activation risks; each brings new operational costs. |

## 8. Prioritized action plan

### P0 — before inviting a broad student audience

1. **Tell the truth about the product:** identify the operator/endorsement; make privacy, non-E2E chats and anonymous-author access clear at the point of use.
2. **Fix false affordances:** connect or remove notification preferences; validate all labels and actions against real behavior.
3. **Make verification workable:** state the mandatory next step, actual review expectations, recovery and appeal paths. Confirm the team can process applications and delete proof as promised.
4. **Protect users:** establish reporting and moderation coverage for each enabled social/marketplace/ride surface; verify actual permissions and document access.
5. **Fix misleading home data:** query upcoming events and counts correctly or label their limited scope; separate empty from loading/error.
6. **Test core journeys end to end:** real accounts, roles, messages, notices, resources, calendar, review, recovery and deletion on real Android hardware and poor networks.

### P1 — next iteration

1. Redesign the first approved session around one class group and one relevant notice/resource.
2. Simplify navigation and make the most frequent actions reachable without traversing duplicate hubs.
3. Fix small text, small touch areas, focus and mobile keyboard/safe-area issues.
4. Make notification delivery, preferences and quiet behavior real and testable; implement push only when operationally ready.
5. Improve notice provenance, calendar corrections, resource metadata and stale-content handling.

### P2 — after the core is demonstrably useful

Pilot social/community, marketplace, rides and calls independently with clear success and safety criteria. Expand only where there is real participation and an owner for moderation and support. Evaluate lightweight export/reminders, saved materials and class-specific onboarding once their foundations are accurate.

## 9. How to validate this review with actual users

Recruit a small, diverse pilot: new and returning students across departments and levels, class reps, staff and reviewers, including users with lower-end devices and accessibility needs. Ask them to perform tasks without coaching:

1. Understand what the app is and who runs it.
2. Register, understand proof requirements and find help after a rejection.
3. Find the correct class group and send a message.
4. Find a relevant notice, its author and whether it is official.
5. Find a specific past question or a timetable change.
6. Explain who can see an anonymous post and who can identify its author.
7. Report or block an inappropriate interaction.
8. Recover an account and locate deletion/privacy information.

Record task success, time, wrong turns, comprehension, accessibility blockers and the exact words users use. Do not treat a participant’s failure as their fault. Repeat after changes.

Track a small set of privacy-respecting product indicators: signup-to-proof submission; proof-to-approval and time in review; approved users who find a relevant group and consume a notice or resource; successful message send/retry; return use; moderation response time; report resolution; and crash/error rates. Define events and denominators, avoid sensitive content in analytics, and use a baseline before setting targets. Existing funnel instrumentation covers parts of entry; verify what is actually deployed before relying on it.

## 10. Final word

There is real care in this project. The entry screens are not amateurish, and the campus context is stronger than a generic social-app template. But visual polish is not the same as product maturity.

**My strongest advice:** become the most dependable way for a GSU student to find their people, receive relevant information and access study materials. Make identity, privacy and moderation unusually clear. Earn trust with correct data and reliable messaging. Then expand into community, commerce and rides only when the students and the team are ready.

### Evidence map

- Entry visuals and fixture limitations: `qa-screenshots/README.md` and the `auth-`, `signup-` and `status-` images.
- Navigation, offline states, workspace subscriptions and pagination: `src/App.tsx`.
- Home/hub composition and computed counts: `src/components/WorkspaceHomeViews.tsx`.
- Event/resource query ordering and paging: `src/services/supabaseService.ts`.
- Registration, verification and recovery: `src/components/AuthScreen.tsx`, `StatusGateScreen.tsx`, `ProofDropzone.tsx`.
- Chat safety/calls: `src/components/ChatsView.tsx`, `VoiceCallModal.tsx`.
- Anonymous author lookup and pre-approval: `src/components/ConfessionsView.tsx`.
- Notification preferences, privacy and deletion copy: `src/components/ProfileView.tsx`.
- Academic, community and commerce layouts: `RepositoryView.tsx`, `CalendarView.tsx`, `AnnouncementsView.tsx`, `PeopleView.tsx`, `StatusView.tsx`, `MarketplaceView.tsx`, `RidesErrandsView.tsx`, `GpaCalculatorScreen.tsx`.
- Theme tokens and mobile wrapper: `src/index.css`, `capacitor.config.ts`.
