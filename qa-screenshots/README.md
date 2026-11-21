# GSU Connect — Auth & account-status screenshots

Every reachable state of the sign-in, registration, password-recovery and
account-status (pending / rejected / suspended) surfaces.

**Start here:** the four contact sheets (`00-auth-`, `00-signup-`, `00-forgot-`,
`00-status-`), or `index.html` for the labelled set. A print-ready PDF of all of
them is at the repository root:
`GSU-Connect-auth-and-pending-screenshots.pdf`.

## How these were captured

`npm run capture:auth` drives the **real app** in headless Chromium against the
Vite dev server — the real `AuthScreen`, `StatusGateScreen`, `App` shell, real
copy, real validation, real layout, real fonts. Nothing here is a rebuilt mock.

Two things stand in for the network, because this sandbox cannot reach the live
Supabase project:

- **Supabase is answered locally.** `scripts/capture-auth-shots.mjs` intercepts
  `/rest/v1/**`, `/auth/v1/**` and `/functions/v1/**` and replies with the same
  shapes the real server returns: the real department list, `entry_config`
  (cohort 2026, session 2026/2027), `session_end_year`, and a sign-in that
  rejects an unknown identifier with `Invalid login credentials`. Every request
  that would leave the machine is aborted.
- **The status gate is mounted with fixture users.** `qa-harness/status-gate.tsx`
  renders the genuine `StatusGateScreen` with a pending, a rejected and a
  suspended fixture, because reaching those states through the UI would mean
  creating real accounts in the live project.

So: **real components, sample data.** Names, matric numbers and departments in
the shots are fixtures.

The capture asserts as it goes — each state's expected copy, that the dark
switches really carry `html.dark`, that every self-hosted font resolved, and
that nothing overflows the viewport at 390 px. A run that ends with
`capture issues: 0` has passed all of them.

## Sign in (`auth-01`–`auth-07`)

| File | State |
|---|---|
| `auth-01-login` | Default sign-in, 390 px |
| `auth-02-login-filled` | Identifier and password entered |
| `auth-03-login-validation` | Blur validation on an emptied identifier |
| `auth-04-login-error` | "Incorrect Matric Number, Staff ID, or password." |
| `auth-05-login-busy` | "Signing in…" while the request is in flight |
| `auth-06-login-dark` | Dark theme |
| `auth-07-login-desktop` | Desktop two-column layout |

## Create account (`signup-01`–`signup-11`)

The three-step stepper: **Proof → Details → Account**.

| File | State |
|---|---|
| `signup-01-proof-student` | Step 1, student |
| `signup-02-proof-staff-paths` | Step 1, lecturer/staff verification methods |
| `signup-03-details-empty` | Step 2, empty |
| `signup-04-department-picker` | Step 2, department combo box open |
| `signup-05-details-filled-nolevel` | Step 2, name/ID/department filled, level not chosen |
| `signup-06-details-level-error` | Step 2, "Please select your level." |
| `signup-07-details-filled` | Step 2, complete |
| `signup-08-account-empty` | Step 3, empty |
| `signup-09-account-filled` | Step 3, complete |
| `signup-10-account-dark` | Step 3, dark theme |
| `signup-11-account-desktop` | Step 3, desktop |

## Forgot password (`forgot-01`–`forgot-02`)

| File | State |
|---|---|
| `forgot-01-form` | Reset form |
| `forgot-02-sent` | "Check your inbox" confirmation |

The set-new-password screen (`SetPasswordScreen`) is reached from a reset link
and is not part of this batch; it was captured in the earlier
`GSU-Connect-auth-screenshots` set.

## Account status (`status-01`–`status-08`)

| File | State |
|---|---|
| `status-pending-student` | "Finish Verification" — no proof attached yet |
| `status-pending-student-dark` | Pending, dark theme |
| `status-rejected-student` | "Registration Not Approved" with a reason |
| `status-rejected-student-dark` | Rejected, dark theme |
| `status-suspended-student` | "Account Suspended" |
| `status-suspended-student-dark` | Suspended, dark theme |
| `status-pending-edit-details` | Inline department/level editor |
| `status-pending-desktop` | Pending, desktop |

## Re-running

```sh
npm ci --no-audit --no-fund
npm i --no-save @sparticuz/chromium puppeteer-core   # Chromium for the harness
npm run dev                                           # on :3000
npm run capture:auth
node scripts/make-shot-pdf.mjs                        # rebuild the PDF
```

The four contact sheets are an ImageMagick `montage` of the same files, three
to a row, mobile shots at their native 390 px and desktop shots scaled down to
fit:

```sh
for g in auth signup forgot status; do
  montage -font DejaVu-Sans -label '%f' -tile 3x -geometry 390x>+6+24 \
    -background white -fill '#1d1b17' \
    qa-screenshots/$g-*.png qa-screenshots/00-$g-contact-sheet.png
done
```

`-font DejaVu-Sans` is required in this sandbox: the default `helvetica` is not
readable, and `montage` fails with it.

`CAPTURE_BASE_URL` points the harness at a `vite preview` server instead, and
`CAPTURE_ONLY=login|signup|forgot|status` captures one group.

Fonts are self-hosted from `public/fonts/` (DM Sans, Plus Jakarta Sans,
JetBrains Mono), so the capture does not depend on Google Fonts.
