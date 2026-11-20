# Admin recovery runbook — verified recovery email

Scope: the project owner (Nelson) restoring access for the approval-capable
admin account(s) when the verified recovery inbox is lost. This is the
break-glass path. It must not be the normal way to reset a password.

Preconditions before the legacy (unverified) reset path is ever removed:
1. Every privileged account holds a **verified** row in
   `phase1_private.verified_recovery` (`verified_at IS NOT NULL`), created via
   the verification flow — never backfilled by hand.
2. At least two people (or the owner plus a documented off-device procedure)
   can perform this runbook. One admin who loses both password and inbox
   access, with only one person holding the keys, can permanently brick the
   approval capability.
3. This runbook has been rehearsed once with a throwaway admin test account.

## Normal case: password remembered, inbox lost
No owner action needed. Admin signs in with matric/staff ID + password,
replaces the recovery email through the app's change-address flow (fresh
password check + verification to the new inbox), and confirms the new link.
The old binding is replaced only when the new inbox confirms.

Note — 15-minute sign-in rule for changing a verified address: replacing an
already-verified recovery inbox via the app additionally requires a recent
authentication. The Edge Function decodes the JWT's `amr` claim (the
authentication-method timestamps Supabase writes at sign-in / MFA step-up;
these are NOT bumped by token refresh, unlike `iat`) and refuses the send
with HTTP 403 `reauth_required` when no `amr` entry is within 15 minutes.
A hijacked session therefore cannot swap the recovery inbox without a fresh
sign-in. The client signs the user out locally and re-offers the change
after they authenticate again. The `confirm` action is not gated (a link can
only exist via a gated send and expires in 60 minutes).

Custom Access Token Hook caveat: if the project ever enables a Supabase Auth
Custom Access Token Hook that rewrites the JWT, the `amr` claim is only as
trustworthy as that hook — the function checks shape and freshness only,
never method legitimacy. If the hook drops or stale-dates `amr`, verified
users will be locked out of changing recovery addresses (fail closed, no
data leak) until the hook is fixed. Do not enable such a hook without
preserving `amr` verbatim from the original token.

## Break-glass: password AND inbox both lost
1. Verify the requester out-of-band first (in person, a call on a known
   number, or another verified channel). Never act on emailed support requests.
2. Supabase Dashboard → project `wctkyqydjoepgmlhfsiw` → SQL Editor (runs as
   the database owner; bypasses RLS):
   `select user_id, email, verified_at from phase1_private.verified_recovery;`
   Match the admin by joining against profiles:
   `select p.id, p.full_name, p.staff_id, v.email, v.verified_at
      from public.profiles p join phase1_private.verified_recovery v on v.user_id = p.id
     where p.role in ('admin','founder');`
3. `delete from phase1_private.verified_recovery where user_id = '<admin-uuid>';`
   (This is reversible: the admin simply re-verifies a new inbox afterwards.)
4. Generate a recovery link for the admin's internal auth email using the
   service-role key from your own secret store (Vercel env / local `.env`,
   never the repo). One-off script, run from your machine, not committed:
   `admin.auth.admin.generateLink({ type: 'recovery', email: '<internal-auth-email>',
     options: { redirectTo: '<APP_URL>' } })`
   Deliver the resulting `action_link` / token to the admin out-of-band, on the
   same verified channel you used in step 1.
5. Admin opens the link, sets a new password, signs in with matric/staff ID.
6. Admin immediately re-verifies a working recovery inbox from Profile.
7. Audit note: record date, reason, who approved, and which channel verified
   identity. If the service-role key left its normal storage at any point,
   rotate it in Vercel and Supabase afterwards.
8. Re-check: `select count(*) from phase1_private.verified_recovery where user_id = '<admin-uuid>';`
   must be 1 with a fresh `verified_at`.

## What not to do
- Do not disable Turnstile, Auth CAPTCHA, or any limiter to "help" the admin.
- Do not re-bind `verified_recovery` to an inbox without the admin confirming
  it through the normal confirm flow.
- Do not email the generated link; out-of-band delivery only.
- Do not leave a temporary password in chat, email or tickets. If one must be
  used, force an immediate change after restore and say so in the audit note.
