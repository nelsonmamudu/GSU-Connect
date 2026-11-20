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
2. **Busy vs disabled.** Need to check whether submit buttons go `disabled` during a
   request. Should be busy: spinner, focus held, `aria-busy`.
3. **Tokens.** `src/components/ui/` primitives are hand-rolled per component rather than
   driven by a primitive → semantic → component token layer. Also need to confirm our dark
   mode is a **token swap** rather than an inversion (`src/index.css`).
4. **The "24–48 hours" ETA copy** on the status gate. Under `microcopy` / `error-states`,
   copy should tell the user what to *do*, not make a promise we cannot keep.
5. **Breadth discipline.** About six patterns per screen, not all of the above.

---

## 5. Trends layer (secondary — use with care)

Source: "Top 2026 App Design Trends" (Codex Community, `youtu.be/VNDq1Q_W1Bs`). The
retrieved transcript is truncated partway through the second topic, carries no timecodes,
and the narrator's claims cannot be verified from what we have. Treat this as a
**secondary** layer: §2-§3 are principle-level and durable; trends are season-level and
decay. Take the durable mechanics, ignore the year label.

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
