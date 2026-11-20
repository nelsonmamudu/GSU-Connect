# UI/UX notes

A working reference for the auth, status-gate and admin-queue screens. Built from the
`ux-patterns-master` library (112 patterns), 17 short reel transcripts, and one 2026
design-trends guide, absorbed 2026-11-20. Nothing here has been applied to the code yet —
this is the spec we will build from, and the shortlist we agreed to keep to.

> **Sources.** Pattern teaching is @designmotionhq's; the library is
> `YourFutureSiteDev/ux-patterns`, whose own components are their implementation of the
> ideas (not a copy of the reels). Per-pattern source links live in that repo's
> `catalog.json`. The reels referenced in `all_transcripts.txt` are also @designmotionhq.
> If any of this is shown publicly, credit the pattern by name and link the reel.

---

## 0. The one rule

**Pick the best few patterns for the module, never all of them.** A settings page gets
four or five patterns, not forty. "Best" means: the most specific pattern for that module
first, and when two overlap, the newer *"X is a system"* reel beats the older one-liner
(`data-table-system` over `data-table`, `border-radius-system` over `border-radius`,
`dark-mode-surfaces` over `dark-mode`).

Agreed discipline for this repo: **roughly six patterns per screen**, and before building,
list what was picked and what was deliberately left out.

---

## 1. Every app must have (per-app, not per-module)

`kit/README.md` states points 1-9 and 12 as non-optional: nothing ships to a stranger
without them.

| # | Must have | Pattern / kit | Proof |
|---|---|---|---|
| 1 | Boot guard: a script that fails to load never leaves a blank page | `app-guard.js` | block the main script, see one retry then the panel |
| 2 | Error screen for any uncaught error or failed screen load, with Reload and a way home | `app-guard.js`, `error-states` | throw on purpose, see the panel |
| 3 | Offline banner and primary buttons held while offline | `app-guard.js` | toggle offline in devtools |
| 4 | Session expired lands on a sign-in with a reason, not a silent 401 | `error-states`, sign-in row | expire the token, click a tab |
| 5 | Cache-safe publish: html no-cache, assets versioned by content hash, CDN invalidated | publish tooling | headers on the live URLs |
| 6 | Every screen has loading, empty and error states with a next action | `loading-states-system`, `empty-states`, `error-states` | screenshots of each |
| 7 | Every button that sends cannot double-fire and shows pending, done or failed | `double-submit-guard`, `behind-the-button` | two fast clicks, one request |
| 8 | Destructive actions name the verb, sit off the primary spot, and offer undo where the API allows | `destructive-actions`, `undo-ux` | dialog copy |
| 9 | Success is confirmed in the user's words (toast or inline), errors say what to do | `toast-notifications`, `microcopy` | screenshots |
| 10 | A 404 page in the app's own look, with a way home | `error-states` | open a wrong URL |
| 11 | Unsaved changes warn before leaving | `autosave-ux` (status) or a `beforeunload` guard | edit, then navigate |
| 12 | Works at 390 wide: 44px targets, 16px inputs, no sideways scroll, primary action reachable | `fitts-law`, `hover-trap`, `responsive-table` | 390 screenshots |
| 13 | Keyboard: visible focus, Tab order, Enter submits, Escape closes | `focus-states` | tab through |
| 14 | A "?" or help page in plain words, per screen, linked from where people get stuck | `tooltip-design`, `microcopy` | help links resolve |
| 15 | Numbers formatted with units and tabular figures; status as a word plus a colour | `number-formatting`, `color-accessibility` | screenshots |

---

## 2. Routing for our modules

### 2a. Auth — sign-up / sign-in / set password

Primary: `password-field-ux`, `form-validation-timing`, `form-field-states`, `microcopy`,
`double-submit-guard`.
Secondary (only because the element exists): `otp-input` (recovery code / invite token),
`focus-states`, `error-states`.
Long-form rules also apply to the 3-step signup: `stepper-wizard`, `zeigarnik-effect`,
`peak-end-rule`.

**Password (`password-field-ux`)**
- Score strength as **entropy, not a checkbox tally**. A longer passphrase beats a
  mandatory symbol: `P@ssw0rd!` is 28 bits and cracks in 2 hours;
  `wrong-mango-battery-sky` is 73 bits and takes 3 centuries.
- Show the requirements checklist **while typing** and tick each rule green before submit.
  Never reveal the rules only after a failed attempt.
- A live meter coaches; post-submit errors only punish. A growing bar says "almost".
- Eye toggle to unmask. Masked dots cause silent typos.
- **Never block paste.** Password managers fill longer, stronger passwords than anyone
  types. (`onpaste` must not be prevented.)
- Strongest pattern: offer a **generated password** as the default path — one tap, unique,
  saved, never reused.
- Meter + checklist belong on the **create-password** field only. On login fields keep the
  eye toggle and paste, drop the meter.

**Validation timing (`form-validation-timing`) — the rule is blur-then-live**
- Validate on **blur**, the moment focus leaves the field. Not on submit (too late: a wall
  of errors), not on every keystroke (too early: flags a half-typed word).
- Once a field has errored, switch **that field** to live validation so the message clears
  the instant it is fixed.
- **Confirm correct fields with a green check.** Silence "feels judged".
- Applies to email, password, phone, card number, usernames. Not to search boxes or free
  text where nothing can be wrong.

**Field states (`form-field-states`) — six, all designed**
1. default — label outside the field, helper below; placeholder is not a label
2. focus — ring of at least 3:1 contrast; a soft glow fails accessibility
3. error — **colour + icon + message together**; border-only red is invisible to ~12%
4. success — confirm inside the field, where attention already is (not a toast)
5. disabled — grayscale fill, not-allowed cursor; never fake it with `opacity: 0.5`
   (that reads as loading)
6. loading — in-field spinner, input blocked, prevents double submits

**Microcopy (`microcopy`)**
- Button labels name the **reward**, not the mechanic: "Create my free account" over
  "Submit".
- Turn errors into a next step: "That email's taken — want to log in?" over "Invalid input".
- Empty states are onboarding: show the first action, not "No data".
- Keep a persistent label; placeholder text vanishes on the first keystroke.
- Write like a helpful colleague. No "operation failed".

**Submitting (`double-submit-guard`)**
- Disable on the **first** tap, before the request leaves.
- Swap the label for a spinner **in place and lock the width** — a shrinking button
  reflows the layout underneath.
- Guard the handler too (`if (inFlight) return`), and send an `Idempotency-Key`; UI-off
  alone is not enough.
- Resolve **on the button**: check + "Payment confirmed", or "Card declined — nothing was
  charged".
- Re-enable on the **response**, never on a `setTimeout`.

**Disabled vs busy (`disabled-buttons`)**
- Keep submit **live**; validate on click, light up the blocking fields, move focus to the
  first one, and name the blocker in reachable text.
- A disabled button drops out of the tab order, so keyboard users skip it and screen
  readers stay silent; pointer events are dead, so a tooltip explaining it never fires;
  greyed-out labels routinely land near 1.9:1 contrast.
- Loading is **not** disabled: hold focus, spinner, `aria-busy="true"`.

**Stepper (`stepper-wizard`)** — applies to our 3-step signup
- Chunk by **meaning**, not by count (Personal / Shipping / Payment / Review).
- Show progress; pick one indicator (bar, numbered dots, or labels).
- **Validate inside each step** so a step-one email error never surfaces on step four.
  Block Next while the step is invalid.
- **Persist every field** on step change so Back and Refresh never lose the form.

**Flow psychology**
- `zeigarnik-effect`: leave a visible gap tied to an outcome the user wants; a meter stuck
  at 80% pulls people back. Only fires for outcomes they actually care about — never
  manufacture progress on chores.
- `peak-end-rule`: memory keeps the **peak** and the **end**, not the average. Plant one
  deliberate peak; end on a high note. A broken final step tanks the memory of an
  otherwise smooth flow.

### 2b. Status gate — pending / rejected / suspended

Primary: `loading-states-system`, `skeleton-loading`, `empty-states`, `error-states`,
`toast-notifications`, `perceived-performance`.
Secondary: `optimistic-ui` (only for reversible actions here), `peak-end-rule`,
`zeigarnik-effect`.

**Choose the loading pattern from what you know about the wait**
| You know | Pattern |
|---|---|
| content shape, wait > ~300ms | skeleton |
| short, unknown duration (< ~3s) | spinner |
| percentage, wait > ~3s | progress bar + real meta (time left, rate) |
| reversible action | optimistic UI |
| anything < ~300ms | **show nothing** — a loading flash feels more broken than a delay |

- Never stretch a spinner across a whole-page load: an endless spinner reads as frozen.
- Skeleton rules: **mirror the final layout** (a skeleton that jumps on load is worse than
  a spinner), shimmer **in the reading direction** (left→right), hold under ~2s, and skip
  loading states entirely for actions the user just performed.
- Perceived speed: skeleton + optimistic + a **fast-start progress bar** (race to ~80%
  early, ease into the last stretch, still land on the true finish — never lie about
  completion).

**Empty states (`empty-states`)** — four kinds, each with its own copy and CTA
first run · no results · error · filtered-out.
- One icon so it reads as intentional rather than broken.
- Human line in the brand's voice, not "ERROR 404 — Result set empty."
- **One primary CTA** that is the real next step, not "Try refreshing".
- Ghost preview of a real item teaches the feature before the first item exists.
- Not for loading (use a skeleton) or destructive confirms.

**Errors (`error-states`)**
- Match the surface to the type: validation → inline; network → toast/banner; server or
  permission → its own prominent surface.
- Severity drives space: minor inline, transient toast, blocking modal. Most apps overuse
  modals.
- **Every error needs an exit**: Retry, Contact support, or an expandable "What happened?".
  Never a lone "OK".
- Copy says what broke, why, and what to do next. No raw codes.

**Toasts (`toast-notifications`)**
- Bottom-right on desktop, **top edge on mobile**. Never the centre — it covers the work.
- Timing by severity: ~4s info, ~7s warning, errors **until acknowledged**.
- Max 3 visible; newest at the bottom, older float up and out, the rest queue.
- Always dismissible: close button on desktop, swipe on mobile, and **pause the timer on
  hover**.
- Colour is never the only signal: pair each type with an icon and an accent border.

### 2c. Admin — Pending Sign-ups queue

Primary: `data-table-system`, `filter-chips`, `text-truncation`, `number-formatting`,
`tabs-system`, `empty-states`.
Secondary: `bulk-actions`, `search-experience-system`, `inline-editing`, `context-menu`,
`pagination`.

**Table (`data-table-system`) — six decisions**
- **Align:** numbers right + `tabular-nums`; text left. A column should read like a receipt.
- **Rows:** no zebra striping on a narrow table — one hairline and a hover tint do the work.
  Stripes only earn 12+ columns.
- **Density:** row height is a token, not a default — compact 40px, default 48px,
  comfortable 56px.
- **Sticky:** pin the identity columns (`left: 0`) and the header (`top: 0`).
- **Cells:** missing value gets a dash, never blank; long text truncates with a tooltip;
  numbers never truncate; one line per row.
- **Actions:** an action column is noise. Reveal on hover/focus, kebab on touch, sort arrow
  on the active column only.

**Filters (`filter-chips`)**
- Three unmistakable states: idle (surface + border), active (filled + check), disabled
  (dimmed, no results behind it). If active looks like idle, the filter feels broken.
- Combination logic must be legible: **OR within a group** widens, **AND across groups**
  narrows.
- **The result count must change on the same frame as the tap** — if it doesn't move, users
  tap twice.
- One **clear-all** reset, always.
- Overflowing chips: one horizontal scrolling row with a right-edge fade. Never wrap into a
  multi-row wall that buries the results.
- Pin the active set in a sticky summary bar so people can see why the list shrank.

**Text (`text-truncation`)** — four CSS fixes
- `min-width: 0` on any flex child that must shrink, or `text-overflow: ellipsis` never
  fires and the action button gets pushed out of the card.
- Truncate filenames / emails / paths in the **middle** so both ends survive
  (`quarterly_rep…nal_v3.pdf`, `bartholomew.v…@northwind.io`).
- `font-variant-numeric: tabular-nums` on anything that updates live.
- `overflow-wrap: anywhere` for URLs and IDs. Not `word-break: break-all` — that chops
  ordinary words too.
- Test every text component with three fixtures: **empty, one character, forty characters
  plus an emoji.**

**Numbers (`number-formatting`)**
- `tabular-nums` on every column of figures; right-align numbers, left-align labels.
- Compact abbreviation in tiles (1K / 3.4M) with the exact value one hover away.
- Relative time under 24h ("2h ago"), absolute after ("Mar 3").
- Pin the currency symbol left, right-align the amount, decimals in one line.

**Tabs (`tabs-system`)**
- The active indicator **slides on a spring** (damping 22, stiffness 200), never teleports.
- Overflow: scroll horizontally with edge fades and desktop chevrons. Never wrap.
- Keyboard: arrows move, Home first, End last, Tab exits.
- **Focus ring and active state must never share a colour.**
- Content switch: fade out 80ms → pause 80ms → fade in 80ms, with matched panel heights.
- Mobile: segmented control under 5 tabs, bottom sheet over 5. Never a shrunk desktop bar.
  Touch targets ≥ 44px, thumb zone first.

**"Make it feel engineered" (`reverse-engineered-linear`)** — the polish pass
- Density reads as competence: 13px text, 32px rows, letter spacing pulled in ~1%.
- Depth from **value, not blur**: kill shadows, stack three background values separated by a
  1px border at 8% white; hover changes the surface value, not the elevation.
- **One colour, used twice** (selected row + primary button). Status is a grey icon, not a
  coloured pill.
- Every action shows its shortcut; hover feedback ~80ms, transitions under 150ms, no bounce
  or overshoot.
- A 4px grid: labels left, numbers and dates right, icons centred on the text line.

---

## 3. Design-system rules

**Typography (`typography-system`) — seven decisions, one font**
- Five sizes on one ratio: 13, 16, 20, 25, 32 (×1.25). Stop adding sizes.
- **Three inks**, not ten sizes: primary for what you scan for, secondary for the id, muted
  for the date. Colour ranks within a line; size ranks between blocks.
- **Two weights:** 400 reads, 600 scans. No 700.
- **Leading moves against size:** body 16 at 1.5, heading 32 at 1.1 (1.50 / 1.50 / 1.35 /
  1.20 / 1.10). "1.4 everywhere" is the mistake.
- **Tracking:** big tightens (titles > 24px get −0.02em), body stays 0, uppercase labels
  below 16px get +0.05em.
- Cap the **measure**, not the box: paragraph ≤ 66ch (45-75 comfort band) inside any
  container width.
- `font-variant-numeric: tabular-nums` on figures.

**Hierarchy (`visual-hierarchy`)** — size, colour, contrast, whitespace and weight stack to
one focal point. Headline ≈ 2× body. **One accent colour**, spent only where it matters.
Give the hero more padding than anything else. Weight (800 / 400 / 300) builds reading
order without changing size.

**Whitespace (`whitespace-types`)** — micro = padding inside elements; macro = margins
between sections; active = deliberate emptiness that makes one element pop. Same content
at 40px padding / 22px gaps reads premium; at 16px / 8px it reads cramped.

**Proximity (`proximity-rule`)** — the gap **inside** a group must be smaller than the gap
**between** groups. Spacing does the grouping; borders and dividers become optional.
Forms: ~12px within a section, ~40px between sections, zero dividers.

**Gestalt (`gestalt-laws`)** — closure, similarity, continuity, figure-ground, common
region. Pre-attentive: the brain groups and completes automatically.

**Optical corrections (`optical-corrections`)** — the eye wins over the math
- Play triangle: shift right ~8% of its box so the visual centroid centres.
- Circles read small next to squares of the "same" size: make them ~**1.13×**.
- Nested radius: **inner = outer − padding** (32 outer, 14 gap, 18 inner) so curves stay
  concentric.
- **Dark mode: drop one font weight** (light text on dark bleeds outward).
- Centre text on **cap height**, not the line box: nudge up ~2px.

**Radius (`border-radius-system`)** — one scale: 4 / 8 / 12 / 16 / full.
Chips 4, buttons and inputs 8, cards 12, modals and sheets 16, avatars and toggles full.
Nested = outer − padding. Rings = inner + gap. **Zero any corner that touches a screen
edge.** `9999` is a shape for one-line elements only — a multi-line card becomes an
ellipse. Let the card clip the image (`overflow: hidden`), don't round the image itself.

**Elevation (`shadow-elevation`)** — three stacked shadows: tight contact (~`0 1px 3px`),
mid-distance, wide soft spread. Tint the glow to the brand accent. Elevation is a
hierarchy signal: strongest on the element that matters most.

**Icons (`icon-design-rules`)** — one system, not a pile of drawings
- Round/organic shapes 5-8% **larger** than squares to read as the same size.
- Snap to a 24px grid (16px dense UI) — sub-pixel drift blurs edges.
- One **2px stroke** across the set. Mixed weights look like four libraries.
- Fixed bounding box for every icon (28px container).
- **Fill or outline is a set-wide commitment.** Outline everywhere, fill reserved for the
  active state.

**Colour (`color-accessibility`)**
- Contrast is a ratio: **4.5:1 body**, **3:1 large**, 7:1 for critical UI.
- Most failures hide in "decorative" muted grays — nav links, card labels, secondary
  headings at 1.5-2:1.
- **Never encode meaning with colour alone** (~8% colour vision deficiency). Pair every cue
  with an icon, label or pattern.
- Test in a colour-blindness simulator before shipping.

**Tokens (`design-tokens`)**
- Name by **role**, not value: `color-primary` survives a rebrand; `color-blue-500` becomes
  a lie.
- Three layers: primitive → semantic → component, each referencing the layer above. Change
  one primitive and it cascades.
- **Snap every value to a scale.** A stray 13px padding collapses to 12.
- **Dark mode is swapping a token set, not inverting colours.**

**Focus (`focus-states`)**
- `outline: none` without a replacement is an accessibility failure.
- Replace with 2px thickness, 2px offset, ≥3:1 contrast on light and dark.
- Use **`:focus-visible`** — mouse clicks get no ring, keyboard tabs do.
- **DOM order must equal visual order**, or Tab teleports.
- Modals: trap focus, wrap around, Escape closes and returns focus to the trigger.
- Skip link first on the page, invisible until focused.

**Motion (`animation-timing`)** — five numbers cover almost everything
- Entrances: **200-300ms**, ease-out.
- Exits: **~40% faster** than their entrance.
- Press/tap feedback: **under 100ms** (Doherty threshold).
- Attention-grabbing: 500-800ms with bounce/overshoot.
- Stagger list items: **~50ms** apart (30ms blurs into one blob, 100ms crawls).

**Easing (`easing-curves`)** — `spring > ease > linear`. Always.
- Linear: mechanical and cheap. Reserve for continuous motion (spinners, marquees).
- Ease-out: the default for anything entering the screen.
- Spring: presses, modals, confirmations. A little overshoot sells premium; too much feels
  broken.

**Touch (`hover-trap`, `fitts-law`)**
- Touch has no hover. Gate hover styles on `@media (hover: hover)`; grow targets on
  `@media (pointer: coarse)`.
- **Never bury a primary action behind hover.** Hover surfaces extras only, and those extras
  need a touch-reachable home (in the card, behind a swipe, in a sheet).
- Tap targets **≥ 44px** with the glyph kept small (~20px). 20-32px icon buttons are too
  small for thumbs.
- Primary mobile action belongs at the **bottom**, in thumb reach (12% tap rate at the top
  vs 34% at the bottom in the reel's example).
- Menus and editors open **where the pointer already is**.

**Overlays (`modal-hierarchy`)** — ask one question: **does it block the user?**
- Yes → modal, full scrim, one decision. Reserve for critical or destructive choices.
- No → bottom sheet (mobile-first, drag handle, snap points), drawer (navigation, edge
  anchored, app alive behind), popover (anchored to its trigger, ~200px, lightweight).
- Never reach for a modal when a popover would do.

**Destructive (`destructive-actions`, `undo-ux`)**
- **Undo beats confirmation.** "Are you sure?" punishes everyone for one mistake.
- Soft delete: the row leaves the screen, not the database. Trash for 30 days, then purge.
- Heavy friction (type the name to confirm) is for genuinely irreversible actions only.
- Name the verb on the button ("Delete project" / "Keep project"), never "Yes".
- Move destructive actions **off the primary spot**; bury them in a bordered danger zone at
  the bottom. Red is a budget — spend it on destruction only.
- Show the undo countdown; pause-on-read; one undo is a toast, a stack is a time machine.

**Optimistic (`optimistic-ui`, `behind-the-button`)**
- Update the UI the instant the user acts; reconcile in the background; roll back cleanly on
  failure. Anything under **400ms** reads as instant.
- Reserve for **reversible, low-stakes** actions. Never for payments, transfers or deletes.
- Client validation is for **speed**; the server re-runs every check for **trust**, and
  recomputes values from its own source of truth. Repaint with server truth.

**Upload (`file-upload-ux`)** — five signals
- The dropzone **answers back on drag** (border + glow + copy change) before the drop.
- Honest progress: percent, time left, rate. A spinner hides the truth.
- Failure gets an **inline retry that resumes** — never make them re-select at 90%.
- Success shows a **preview** (thumbnail, type, size). A filename is not feedback.
- Every file in a queue gets its own lane; one failure never blocks the other nine.

**"This looks AI-made" (`de-ai-landing-hero`, `de-ai-dashboard`)**
- Adjective headline → name the outcome and the audience.
- Purple blob → one accent, zero blobs; put the colour on the product and the primary button.
- Two equal buttons → one primary, the second a text link (~90/10 visual weight).
- Fake social proof ("Trusted by 10,000+") → one quote with a name, a role and a result with
  a unit.
- Icon-in-a-circle feature row with one-word labels → one product screenshot with
  annotations pointing at real UI.

---

## 4. Divergences from our current code (found while reading, not yet fixed)

These are the gaps worth closing first. Nothing here has been changed.

1. **Validation timing.** We validate per step on Continue. The rule is **blur → then live**.
   Different model, and the rule is right for the email / matric / staff-ID fields.
2. **Busy vs disabled — partly there.** Verified 2026-11-20: `ui/Button.tsx` does
   `aria-busy={loading}`, swaps in a `Spinner`, and replaces the label with `loadingLabel`
   ("Creating account…", "Signing in…", "Confirming…", "Saving…"). That is most of the
   `double-submit-guard` requirement. Two gaps:
   - It also sets `disabled={disabled || loading}`, which drops the button from the tab
     order and **loses focus** mid-request. The rule is busy, not disabled: hold focus,
     spin, announce.
   - The busy label is longer than the idle label, and only the four auth-screen buttons are
     `full` width. Every non-full button (`StatusGateScreen` lines 627/760/817,
     `RecoveryEmailPrompt` 212/232, `RecoveryEmailConfirm` 105) will **change width** when
     the label swaps — the exact reflow `double-submit-guard` warns about. Fix is a locked
     min-width or a short busy label.
3. **Tokens.** `src/components/ui/` primitives are hand-rolled per component rather than
   driven by a primitive → semantic → component token layer. Also need to confirm our dark
   mode is a **token swap** rather than an inversion (`src/index.css`).
4. **The "24–48 hours" ETA copy** on the status gate. Under `microcopy` / `error-states`,
   copy should tell the user what to *do*, not make a promise we cannot keep.
5. **Breadth discipline.** About six patterns per screen, not all of the above.
6. **Shadows and gradients have no scale.** Verified 2026-11-20: `shadow-2xs` ×32,
   `shadow-2xl` ×22, `shadow-xl` ×20, `shadow-lg` ×13, plus ad-hoc coloured shadows
   (`shadow-emerald`, `shadow-violet`, `shadow-sky`, `shadow-indigo`, `shadow-amber`) and
   nine gradients, against a `ui/` layer that uses a single `shadow-2xs`. There is no semantic
   elevation token, so "how elevated is this?" is answered by whichever utility the author
   happened to reach for. `shadow-elevation` and §5.7 point the same way: soft, layered,
   defined once — never a hard default, and never per component.

---

## 5. Secondary sources — trends and commentary (use with care)

Source: "Top 2026 App Design Trends" (Codex Community, `youtu.be/VNDq1Q_W1Bs`). The
retrieved transcript is truncated partway through the second topic, carries no timecodes,
and the narrator's claims cannot be verified from what we have. Treat this as a
**secondary** layer: §2-§3 are principle-level and durable; trends are season-level and
decay. Take the durable mechanics, ignore the year label.

### 5.1 Top 2026 app design trends

**Emotionally intelligent design is a UX approach, not a visual trend.**
- Use personality or character only where it supports the product's purpose. We have no
  mascot and should not add one for its own sake.
- **Tie expressive states to truthful product events** — a completed milestone, a real
  status change. Never fabricate progress. Same rule as `zeigarnik-effect`: manufactured
  progress on chores creates zero pull.
- Keep emotional feedback **supportive**. No guilt, no pressure, no manipulative reaction to
  inactivity. Duolingo's Duo is the reference — including its worst behaviour: the
  distressed → angry → worried → frozen escalation on a user's absence is exactly the
  pattern to avoid, not to imitate.
- **Provide accessible equivalents** for anything conveyed by colour, animation or facial
  expression. If a character's mood carries meaning, a word must carry it too.

**Where this bites us:** the status gate is an emotional surface. An applicant waiting on
verification, or reading a rejection, is not in a neutral state. Supportive and truthful
copy matters more there than anywhere else in the app — which is why §4.4 (the "24–48
hours" ETA) is a real problem and not a wording nit.

**Chat / streaming** (relevant: this repo has a chat schema and `ChatsView`).
- Text entry and image attachment are part of the conversation, not extras.
- Streaming responses should communicate arrival without getting in the way. Motion signals
  progress; it never decorates.
- Design how a user attaches or amends a message. The source cuts off here; the specifics
  were not recoverable.

### 5.2 The peak-end rule, restated (secondary — largely a duplicate)

Source: "The Tiny Design Rule Behind Top 1% Apps" (Tim Gabe, `youtu.be/11h4H3TAGkM`).
Truncated during the first example; the promised checklist was not in the retrieved
excerpt, so the six points below are the guide's own interpretation, not the video's.

**This mostly restates `peak-end-rule` in §2a/§3.** The pattern library's version is richer —
it carries the reverse case, where a payment failure on the final step drops remembered
satisfaction from 85 to 22 — and that is the one to build from. Only the increments are
recorded here.

- **Attribution.** The mechanism is Daniel Kahneman's peak-end rule. Worth knowing because
  it is a *memory* effect, not a satisfaction effect: it describes what people recall, not
  what they experienced moment to moment. Do not use it to justify making the present
  moment worse.
- **Friction in the middle is survivable.** The Disney example — long waits in the sun,
  walking between attractions, expensive food, still remembered fondly because the peaks and
  the ending were engineered. The lesson is about *where to spend effort*, not permission
  to be sloppy. Effort spread evenly across every step is wasted next to one real peak and
  one real ending.
- **Guardrails (the genuinely useful part):**
  - Choose a peak that delivers **real user value** — a completed task, a useful outcome.
    Do not manufacture an artificial reward.
  - End by confirming the result, explaining **what happens next**, and giving one clear,
    low-friction next action.
  - **Peak-end is not an excuse to add avoidable friction** or to conceal poor usability.
  - Validate the chosen peak and ending with real users; do not assume they matter to
    everyone.

**Applied to our flows.** The peak of sign-up is not the form — it is the moment the
applicant learns they are *in* and what happens next. The end of the pending gate is the
approval or rejection screen, and that is what gets remembered. The rejection path is where
the peak-end risk is highest: a hostile or cryptic rejection is the last thing a user takes
away from the whole application.

### 5.3 Signifiers, card hierarchy, and directional cues (secondary, partial overlap)

Source: "Every UI/UX Concept Explained in Under 10 Minutes" (Kole Jain,
`youtu.be/EcbgbKtOELY`). Truncated during the visual-design discussion; no timecodes, no
frames.

**Overlap:** the card-hierarchy half restates `visual-hierarchy` (§3) and `number-formatting`
(§2c) — size/position/colour for emphasis, price right-aligned, metadata de-emphasised. The
increments are below.

**Signifiers** — a named concept worth adding to the vocabulary.
A signifier is anything visible that communicates what an element does, without written
instructions: button press states, a highlight on the active nav item, a hover state, a
tooltip. Rules that come with it:
- Group related controls with a consistent container or spacing.
- Make the **current selection visually distinct** from the alternatives.
- Style unavailable/inactive options differently **and make the behaviour match the
  appearance**. A greyed control that still works, or an active-looking control that does
  nothing, is a broken signifier.
- Ship visible hover, pressed and active states where relevant.
- Use a concise tooltip for an affordance that still needs explaining, and **never rely on
  hover-only cues for essential information on touch devices** (same rule as `hover-trap`).

**Card hierarchy as a comparison tool.** A repeated card that reads like a spreadsheet has
failed. Primary item largest, boldest, nearest the top; supporting metadata (time, date,
location) smaller and lower; accent colour reserved for meaningful emphasis. Keep repeated
cards **consistent**, so users can compare them quickly — variance between cards costs more
than variance within one.

**Direction and alternatives.** Icons plus alignment can carry a relationship (origin →
destination) without spelling out "from" and "to". Two caveats: an icon is not universally
understood, so keep an accessible label or equivalent text; and hierarchy is a set of
principles, not one mandatory arrangement — pick the layout that fits the content.

### 5.4 A six-stage design process (secondary — process claim only, no stage detail)

Source: "Our World Class App Design Formula" (Tim Gabe, `youtu.be/wmTkiF23GRQ`). The
transcript covers only the introduction, names the six stages, then cuts off during the
onboarding discussion. The guide itself flags that its per-stage descriptions are
interpretation, not transcription. **No method, spec or technique is recoverable from it.**

What is recordable is the ordering claim:

> Onboarding → Discovery → UX → UI → Emotional integration → Delivery

- **Foundation before finishes.** The analogy is building a house: establish the foundation
  before adding the finishes. Do not jump into visual design early.
- Two named failure modes: researching endlessly without ever testing in practice, and
  skipping research altogether. Both produce rework and "flat" products.
- Emotional integration is a distinct stage rather than an afterthought — that is §5.1's
  subject.

**Why this is recorded at all:** it is a process claim, not a design rule, and its value
here is confirmatory. We are currently in the Discovery/UX stage — building the spec before
touching the UI — which is the order it argues for. Nothing in it changes §2 or §3.

### 5.5 Mobile navigation (secondary — largely already satisfied here)

Source: "Everything you need to know about Mobile App UI's in 8 minutes" (Kole Jain,
`youtu.be/Gfsd8NNuD9g`). Truncated during the first discussion of fitting content on screen.

**The two approaches**
- **A — Bottom navigation.** Consolidate the desktop destinations into a few key icons; a
  bottom bar, often floating; keep the important action visually separate from routine nav;
  **3-4 destinations is ideal, 5 is the upper limit**; touch targets over 44px; the actions
  may be contextual to the current screen.
- **B — Navigation as a page.** When there are too many important destinations for a bottom
  bar, make the navigation a full page (Notion's pattern): recent items near the top, actions
  and counts on the right, leaving the bottom free for one prominent search or action.
- **Contextual top-bar actions.** A notification bell and an overflow menu near the top,
  showing only what is relevant to the current page.
- **Do not shrink desktop onto mobile.** Do not compress everything to fit; give each screen
  one clear primary purpose.

**Verified against `src/App.tsx` on 2026-11-20 — we already do most of this.**
- Mobile bottom bar exists (`hideMobileBottomBar`, rendered at ~line 1705) with **5** core
  destinations: Today, Chats, Study, Campus, Profile.
- The remaining 9-10 destinations live in a sliding hamburger drawer.
- The bar is hidden when a chat is open, so the conversation gets the full screen.

**Two flags.**
1. **Five is the stated ceiling, not a target.** We are exactly at it, with nine further
   destinations one tap into a drawer. That is defensible today, but it is the first thing to
   revisit if more destinations appear — approach B is the named alternative.
2. **No global top-bar notification or overflow entry point.** Search exists per view, but
   there is no app-shell bell or overflow menu. Whether that is a gap depends on whether a
   global notification surface is actually needed; nothing currently demands one.

### 5.6 Smart defaults and decision fatigue (secondary — principle 2 truncated)

Source: "The UX Psychology Behind Apps People Can't Stop Using" (uxpeak,
`youtu.be/2TlIg3VokY8`). Promised six principles; the transcript completes only the first and
cuts off during the second's example. Principle 2 is recorded below as a lead, not a rule.

**Smart defaults.** The failure mode is decision fatigue / choice overload: five blank fields
is five decisions, and too many simultaneous choices produces inaction. (The narrator cites a
jam-aisle study; the figures are unverified.) The fix is not necessarily fewer fields — it is
**pre-filled common choices**:
- Review every required field; pre-select a safe, common value where one exists.
- Default only where it causes no harmful or costly outcome.
- Make it obvious the value was preselected and easy to change. Never hide it.
- Button copy states the **result** ("See 12 results"), not the mechanic ("Search") — same
  rule as `microcopy`.
- Defaults reduce effort; they must not pressure the user into an unintended choice.

**Already in our code.** The invite link pre-fills the department (`inviteDept`) and carries
the token — exactly this pattern. Worth extending to any other field with a dominant common
value.

**Choice overload / Hick's law.** Decision time rises with the number and complexity of the
choices offered. Bears on the admin queue's filters and on any future settings screen: fewer,
grouped options beat a long flat list.

**Principle 2 (truncated lead).** The narrator begins a car-wash loyalty-card study — a card
with eight empty stamps — and the transcript ends before the comparison condition or the
principle is named. *This is my inference, not from the source:* the study is almost
certainly the **endowed progress** effect (Nunes & Drèze, 2006), where customers given a
two-stamp head start on an eight-stamp card completed at a far higher rate than those given
an empty eight-stamp card. The head start does not reduce the work; it changes where it
starts.

**Tension worth holding.** `zeigarnik-effect` (§3) says do not manufacture progress on chores;
endowed progress says a real head start lifts completion. They are compatible, and the line is
**earned versus fabricated**: a head start the user was genuinely given is honest; a bar that
starts at 80% for no reason is not. Do not use the psychological finding as an excuse for the
fabrication.

### 5.7 User-flow escape hatches and effect discipline (secondary — 5 of 7 unavailable)

Source: "7 UI/UX Mistakes That SCREAM You're a Beginner" (Kole Jain, `youtu.be/AH_ugxmLeUM`).
A recipe-app redesign. The transcript covers mistake 1 fully and cuts off during mistake 2;
mistakes 3-7 are not available.

**Mistake 1 — user flow. The escape-hatch rule.**
The example is an allergy screen with six presets and two missing paths: **no search for an
allergy that is not listed, and no skip for a user with none.** Generalised:
- Sketch the whole journey before polishing screens.
- Every choice screen needs an **unlisted / custom** path.
- Every choice screen needs a **none / skip** path *where the question may not apply*.
- Check the small stuff: filter affordance, a save action, navigation links, hidden states,
  and hover / micro-interaction feedback.
- Review each screen **in its states**, not only the static default view.

**Verified against our code.** `DepartmentPicker.tsx` already does this well — it has search
plus "Other (Type your department)" as the unlisted path, and it syncs to a non-catalog value
on load. The escape-hatch rule is satisfied there; the same audit is worth running on the
level picker and any future choice screen. A skip/none path is *not* applicable to department
or to proof — both genuinely always apply.

**Mistake 2 — overusing effects.**
- Too many shadows, glows and gradients read as cluttered and amateur.
- If a gradient stays, keep it **within one hue family** (lighter and darker variants of one
  colour). No gradient is usually the cleaner choice.
- Harsh default drop shadows: **lighten the shadow colour and increase the blur**, or remove
  it. Not merely lower the opacity.

**Tension with `shadow-elevation` (§3), and how to hold it.** That pattern says build depth
from three stacked shadows and tint the glow to the brand accent; this says light grey, more
blur, or nothing. They are not really opposed — both reject the hard black default. The
synthesis: **soft, layered and deliberate, never a hard opaque default**, and any tint is a
system decision rather than per-component decoration.

**Verified against our code — see §4.6.** The app has no elevation scale at all.

### 5.8 Videos 8-18 (secondary — consolidated pass; most excerpts truncated)

Source: `youtube-guides-01-18-combined.txt`, which merges the individual guides for videos
1-7 (already covered in §5.1-§5.7) with a first pass over 8-18. Video 14 returned no usable
narration (music only); video 18 returned non-contiguous fragments from a long beginner
course. Nothing below is a complete account of any of them.

**Increments worth keeping**

- **First-view quality beats quantity above the fold** (#9). The critique: 56px food photos
  too small to create appetite; cramming six restaurants above the fold is not the goal;
  filters and sort buried in two dropdowns holding 17 options; card text in near-identical
  small grey so nothing has hierarchy. The first screen should make the user *want to
  continue*, because they will scroll. Bears directly on the admin queue and on any list.
- **Accurate action labels** (#15). The beginner example's button claimed the user would
  earn tokens when the action actually claimed voting rewards — the label must match the
  result. Same reel: a clear, simple graph beats a fancy one that is hard to read. Clarity
  over effect.
- **Role-based colour, built with HSL** (#12). Neutrals for structure (backgrounds, text,
  borders), one brand colour for actions and character, semantic colours for states. Build
  shades by varying lightness; saturation zero gives neutrals regardless of hue; check every
  pair for contrast. Same conclusion as `design-tokens` / `color-accessibility`, but with a
  method attached.
- **Personalization by stage** (#16). The fitness example gives distinct screens to new,
  repeat and highly engaged users. Keep it controllable, do not overwhelm newcomers, and do
  not infer sensitive traits. We already segment by role (student / staff / admin) and by
  lifecycle (applicant / pending / approved / rejected / suspended) — worth checking that
  those screens actually differ usefully rather than only by what they hide.
- **Niche depth** (#8). Design for a specific group's real needs instead of copying the
  category template; the outlier example replaced text rows and checkboxes with coloured
  time blocks and pictures for neurodivergent users. The caution is symmetrical: do not
  apply a niche pattern to everyone without evidence.
- **Premium is evidence, not polish** (#11). Looking polished and feeling premium are
  different; users judge from evidence that the product is good. The three places that
  evidence lives were not in the excerpt.
- **Gestures need indicators and a non-gesture route** (#17). Within-page, between-page and
  free swipe, with visible indicators that respond fluidly, natural easing and bounce, never
  linear. A gesture must never be the only way to do something — same rule as `hover-trap`.
- **Constraints are scaffolding, not a ban** (#18). Limit typefaces and colours while
  learning so attention stays on usability, readability and device fit. The numbers in that
  course (16-unit internal gap / 24-unit group gap, 8-unit radius, 12pt secondary text,
  24×24 icon placeholders) are examples, not universal requirements — but they sit close to
  `proximity-rule` (§3).

**Verified against our code.** Safe area is already handled: `index.html` sets
`viewport-fit=cover`, and `src/index.css:31` applies `padding-bottom:
env(safe-area-inset-bottom)`. So #18's safe-area point is satisfied.

**On the consolidated checklists.** The file's 10-point checklists largely restate §1's kit
table and add nothing new. §7 is the distilled pre-flight.

---

## 6. How to use this later

1. Name the module being changed.
2. Take its primary set from §2, plus secondary only if that element actually exists.
3. List the patterns picked and the ones deliberately left out — one line each.
4. Check every state the pattern names before calling it done: loading, empty, error,
   disabled, focus, hover-on-touch, destructive confirm, rollback. A missing named state is
   the most common miss.
5. Verify at 390px, and re-run the browser suites (see the PR #26 notes: the proof-card
   assertions were rewritten and have never been executed).

---

## 7. Pre-flight checklist (consolidated, for when we apply)

1. Name the module and its **six-or-fewer** patterns; list what was deliberately left out.
2. Map the journey and its edge cases: none, skip, custom, error, completion.
3. Every screen: loading, empty (**which of the four kinds?**), error (**with an exit**).
4. Every field state designed: default, focus, error, success, disabled, loading.
5. First view: one clear primary purpose, key controls discoverable, nothing crammed in.
6. Targets ≥ 44px; safe area respected; no sideways scroll at 390.
7. Colour: 4.5:1 body / 3:1 large; never colour alone.
8. Copy: labels name the outcome, errors hand over the next step, no promises we cannot keep.
9. Motion: 200-300ms entrances, exits ~40% faster, feedback under 100ms; nothing linear
   except spinners.
10. Then run the browser suites — the proof-card assertions have never been executed.

---

## 8. Applied in code (2026-11-20, branch `arena/c3fb226e-gsu-connect`)

Recorded so the next pass — the palette — knows what is already done and what was
deliberately left.

**Commits:** `74c71d5` (system + validation + gate copy), `f8d6c8b` (contrast),
`a7e6118` (admin queue + double-submit).

### 8.1 The shared layer (`src/components/ui/`)

- `styles.ts` is now the single home of the class tokens: one radius scale
  (4 / 8 / 12 / 16), one three-step `elevation` scale, one `focusRing`, and the
  input/label/hint/error text classes. Nothing in the primitives hardcodes a
  radius or a shadow any more.
- Inputs and selects are **16px**. Anything smaller makes iOS Safari zoom the
  page on focus — this was a live bug on every field in the app.
- `Button` no longer sets `disabled` while busy. It keeps focus, sets
  `aria-busy`/`aria-disabled`, and ignores presses. Both labels occupy the same
  grid cell so a longer busy label cannot change the button's width.
- New `Chip` / `ChipRow`: three distinct states, `aria-pressed`, tabular counts,
  one scrolling row with an edge fade.
- `Alert` pairs every tone with an icon; `Badge`, `Card`, `EmptyState`,
  `Select`, `Stepper` and `Tabs` pick up the tokens, 44px targets and tabular
  counts. `EmptyState` keeps a single slot for the next action.

### 8.2 Behaviour

- **Blur, then live** (§4.1). `AuthScreen` and `SetPasswordScreen` judge a field
  on blur, then re-judge it live while it is touched or errored. Typing no longer
  clears a message on every keystroke, and an untouched field stays quiet.
- **Double-submit** is guarded by an `inFlight` ref on both auth submits, so a
  second Enter or a double tap cannot file the request twice.
- **Honest gate copy** (§4.4). The "24–48 hours" promise is gone; the page now
  says review timing depends on admin availability and tells the user what to do.
- **Admin queue**: truncated identity shows on hover, a missing recovery email
  renders as a dash instead of disappearing, the acting row keeps focus while its
  decision is in flight, and "load more" keeps its width.
- **Admin empty states** all use `EmptyState` and each offers a next action
  (clear search, create a group, review approved accounts).

### 8.3 Keyboard focus

421 hand-rolled `<button>`s had no focus style of their own — keyboard users could
not see where they were. `index.css` now supplies a 2px ring to any button, link,
summary, input, select or textarea that does not already carry a Tailwind ring,
driven by a `--color-focus` variable that swaps under `.dark`.

### 8.4 Contrast sweep

`text-slate-400` in light mode (~3.0:1 on white) and `dark:text-slate-500`
(~3.2:1 on slate-900) both failed the 4.5:1 body bar. 127 and 81 sites moved one
step. Placeholders were left alone. Decorative `text-slate-300` icons and
separators were left alone — they carry no information.

### 8.5 Deliberately not done

- **The token layer and the palette.** §3 asks for tokens by role with dark mode
  as a token swap. That is one job with the palette choice, not two — doing it
  now would be reworked the moment the colours change. `styles.ts` is the seam.
- **Mobile bottom navigation.** Five tabs is the stated ceiling, so it passes,
  but §5.5 prefers 3–4. Restructuring it is a product decision, not a styling
  one — needs the user's call.
- **390px / no-sideways-scroll verification.** Needs a browser; this sandbox has
  no Chromium and `playwright-core` cannot download one. Static checks only.
- **`tests/proof-card-browser.test.mjs`.** Updated for the new gate copy but
  still never executed — it needs the user's Chromium.
