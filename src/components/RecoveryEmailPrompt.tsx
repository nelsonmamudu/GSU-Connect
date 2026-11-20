import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTurnstile } from './Turnstile';
import { friendlyEntryError } from '../utils/entryErrors';
import { maskEmail } from '../utils/maskEmail';
import { fetchMyRecoveryStatus, requestRecoveryEmailVerification, isReauthRequired, functionsErrorCode, reauthRequiredError, signOutUser } from '../services/authService';
import { fetchOwnRecoveryEmail } from '../services/supabaseService';

// Shown to every signed-in account until the SERVER reports a verified
// binding for this account (my_recovery_status RPC; auth.uid() only, returns
// at most a masked address) or the user dismisses it with "Later" (snoozed
// 7 days). The client has no other source of truth about verified state;
// it does not keep a local "verified" flag. If the status RPC cannot be
// reached the card hides itself — an unreachable backend must produce no
// nudge rather than a broken one. After signup the typed inbox (stashed in
// sessionStorage) drives the card until the stash is cleared by a successful
// send.
const DISMISS_KEY = 'gsu_recovery_verify_dismissed_until';
const SIGNUP_KEY = 'gsu_signup_recovery';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[a-z0-9][a-z0-9._+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;
export const RECOVERY_VERIFIED_EVENT = 'gsu-recovery-verified';

function readSignupEmail(): string {
  try {
    return (sessionStorage.getItem(SIGNUP_KEY) || '').trim().toLowerCase();
  } catch {
    return '';
  }
}
function isSnoozed(): boolean {
  try { return Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now(); } catch { return false; }
}

export function RecoveryEmailPrompt() {
  const [signupEmail, setSignupEmail] = useState(readSignupEmail);
  const [mode, setMode] = useState<'hidden' | 'signup' | 'login' | 'change' | 'sent'>('hidden');
  const [status, setStatus] = useState<{ verified: boolean; maskedEmail: string | null } | null>(null);
  const [knownEmail, setKnownEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reauthRequired, setReauthRequired] = useState(false);
  const changeCheck = useTurnstile('recovery-change');
  const resendCheck = useTurnstile('recovery-resend');

  useEffect(() => {
    let active = true;
    const onVerified = () => setMode('hidden');
    window.addEventListener(RECOVERY_VERIFIED_EVENT, onVerified);
    fetchMyRecoveryStatus()
      .then((s) => {
        if (!active) return;
        setStatus(s);
        if (s.verified) { setMode('hidden'); return; }
        if (readSignupEmail()) { setMode('signup'); return; }
        if (isSnoozed()) { setMode('hidden'); return; }
        setMode('login');
      })
      .catch(() => {
        // Fail closed: no verified-state source, no nudge.
        if (active) {
          setStatus(null);
          setMode('hidden');
        }
      });
    fetchOwnRecoveryEmail()
      .then((email) => { if (active) setKnownEmail(email); })
      .catch(() => { /* display/resend fallback is optional */ });
    return () => {
      active = false;
      window.removeEventListener(RECOVERY_VERIFIED_EVENT, onVerified);
    };
  }, []);

  if (mode === 'hidden') return null;

  const snooze = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + SNOOZE_MS)); } catch { /* ignore */ }
    setMode('hidden');
  };
  const forgetSignupKey = () => {
    try { sessionStorage.removeItem(SIGNUP_KEY); } catch { /* ignore */ }
    setSignupEmail('');
  };
  const sent = (masked: string) => {
    // Clear the signup stash after a successful send: the address now lives
    // only in the pending challenge / verified binding server-side.
    forgetSignupKey();
    setMessage(`Verification link sent to ${masked}. It expires in 60 minutes — check your spam folder.`);
    setMode('sent');
    setPassword('');
    setNewEmail('');
  };

  // Where a resend goes: the freshly-stashed signup address, or the legacy
  // recovery address (the owner's own typed value). A verified masked_email
  // from the server is never a send target — it is display-only.
  const resendTarget = signupEmail || knownEmail;
  const shownMasked = signupEmail
    ? maskEmail(signupEmail)
    : status?.maskedEmail ?? (knownEmail ? maskEmail(knownEmail) : null);

  const resend = async () => {
    setBusy(true); setMessage('');
    try {
      if (!resendTarget) { setMessage('Enter the inbox to verify with “Add one now”.'); setBusy(false); return; }
      const token = resendCheck.consume();
      const { error } = await supabase.functions.invoke('recovery-email', {
        body: { action: 'send', email: resendTarget, captchaToken: token },
      });
      if (error) {
        const statusCode = (error as { context?: { status?: number } })?.context?.status;
        if (statusCode === 403 && (await functionsErrorCode(error)) === 'reauth_required') {
          throw reauthRequiredError();
        }
        throw new Error(statusCode === 429
          ? 'Too many verification requests. Please wait a few minutes and try again.'
          : 'Could not send the verification email. Please check your connection and try again.');
      }
      sent(maskEmail(resendTarget));
    } catch (err) {
      if (isReauthRequired(err)) { setReauthRequired(true); setMessage(''); }
      else setMessage(friendlyEntryError(err, 'Could not send the verification email.'));
    } finally {
      setBusy(false);
    }
  };
  const changeAddress = async () => {
    const clean = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(clean) || clean.length > 254) { setMessage('Please enter a valid email address.'); return; }
    if (!password) { setMessage('Please enter your current password.'); return; }
    setBusy(true); setMessage('');
    try {
      await requestRecoveryEmailVerification(clean, password, changeCheck.consume());
      sent(maskEmail(clean));
    } catch (err) {
      if (isReauthRequired(err)) { setReauthRequired(true); setMessage(''); }
      else setMessage(friendlyEntryError(err, 'Could not send the verification email.'));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'signup' ? 'Verify your recovery email' : 'Verify a recovery email';

  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,26rem)] rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-900 shadow-xl p-4 text-sm text-slate-700 dark:text-slate-200 space-y-2"
    >
      <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>

      {reauthRequired ? (
        <>
          <p role="alert" className="text-amber-800 dark:text-amber-300">
            For your security, sign in again before changing your verified recovery address — the current session is too old to make this change.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { void signOutUser('local'); }}
              className="min-h-[44px] px-4 rounded-xl bg-emerald-700 text-white font-semibold"
            >
              Sign in again
            </button>
            <button type="button" onClick={() => setReauthRequired(false)} className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 font-medium">
              Dismiss
            </button>
          </div>
        </>
      ) : mode === 'sent' ? (
        <>
          <p role="status" className="text-emerald-800 dark:text-emerald-300">{message}</p>
          <button type="button" onClick={() => { forgetSignupKey(); snooze(); }} className="min-h-[44px] px-4 rounded-xl bg-emerald-700 text-white font-semibold">Done</button>
        </>
      ) : mode === 'change' ? (
        <form onSubmit={(e) => { e.preventDefault(); void changeAddress(); }} className="space-y-2">
          <p>Use a different inbox. Your current recovery email stays active until you confirm the new one.</p>
          <input
            type="email"
            required
            aria-label="New recovery email"
            placeholder="you@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-sm focus:outline-none focus:border-emerald-600"
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            aria-label="Current password"
            placeholder="Your current password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-sm focus:outline-none focus:border-emerald-600"
          />
          {changeCheck.widget}
          {message && <p role="alert" className="text-red-600 dark:text-red-400">{message}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="min-h-[44px] px-4 rounded-xl bg-emerald-700 disabled:opacity-60 text-white font-semibold">
              {busy ? 'Sending…' : 'Send verification link'}
            </button>
            <button type="button" onClick={() => { setMode(signupEmail ? 'signup' : 'login'); setMessage(''); }} className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 font-medium">Back</button>
          </div>
        </form>
      ) : (
        <>
          <p>
            {shownMasked
              ? <>We sent a verification link to <span className="font-semibold">{shownMasked}</span>. Confirm it to make this your verified recovery inbox.</>
              : 'Add a verified recovery inbox so password reset links can reach you when that is enabled.'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Check your spam folder — the link expires in 60 minutes.</p>
          {resendCheck.widget}
          {message && <p role="alert" className="text-red-600 dark:text-red-400">{message}</p>}
          <div className="flex flex-wrap gap-2">
            {resendTarget && (
              <button type="button" onClick={resend} disabled={busy} className="min-h-[44px] px-4 rounded-xl bg-emerald-700 disabled:opacity-60 text-white font-semibold">
                {busy ? 'Sending…' : 'Resend link'}
              </button>
            )}
            <button type="button" onClick={() => { setMode('change'); setMessage(''); }} className="min-h-[44px] px-4 rounded-xl border border-emerald-700 dark:border-emerald-500 text-emerald-800 dark:text-emerald-300 font-semibold">
              {shownMasked ? 'Correct address' : 'Add one now'}
            </button>
            <button type="button" onClick={() => { forgetSignupKey(); snooze(); }} className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 font-medium">
              Later
            </button>
          </div>
        </>
      )}
    </div>
  );
}
