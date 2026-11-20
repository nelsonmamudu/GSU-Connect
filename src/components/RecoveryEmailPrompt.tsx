import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTurnstile } from './Turnstile';
import { friendlyEntryError } from '../utils/entryErrors';
import { maskEmail } from '../utils/maskEmail';
import { requestRecoveryEmailVerification } from '../services/authService';
import { fetchOwnRecoveryEmail } from '../services/supabaseService';

// Shown to every signed-in account until either a verified binding exists
// (set locally on confirm success) or the user dismisses it with "Later"
// (snoozed for 7 days). Honest by construction: the client cannot query
// verified_recovery, so the card nudges rather than claims a state it
// cannot see. After signup it additionally knows the address typed.
const VERIFIED_KEY = 'gsu_recovery_verified_at';
const DISMISS_KEY = 'gsu_recovery_verify_dismissed_until';
const SIGNUP_KEY = 'gsu_signup_recovery';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[a-z0-9][a-z0-9._+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;

function readSignupEmail(): string {
  try {
    return (sessionStorage.getItem(SIGNUP_KEY) || '').trim().toLowerCase();
  } catch {
    return '';
  }
}
function isVerifiedLocally(): boolean {
  try { return Number(localStorage.getItem(VERIFIED_KEY) || 0) > 0; } catch { return false; }
}
function isSnoozed(): boolean {
  try { return Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now(); } catch { return false; }
}
export function markRecoveryEmailVerified(): void {
  try { localStorage.setItem(VERIFIED_KEY, String(Date.now())); } catch { /* ignore */ }
}

export function RecoveryEmailPrompt() {
  const [signupEmail, setSignupEmail] = useState(readSignupEmail);
  const [mode, setMode] = useState<'hidden' | 'signup' | 'login' | 'change' | 'sent'>('hidden');
  const [knownEmail, setKnownEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const changeCheck = useTurnstile('recovery-change');
  const resendCheck = useTurnstile('recovery-resend');

  useEffect(() => {
    if (isVerifiedLocally()) { setMode('hidden'); return; }
    if (signupEmail) { setMode('signup'); return; }
    if (isSnoozed()) { setMode('hidden'); return; }
    let active = true;
    fetchOwnRecoveryEmail()
      .then((email) => { if (active) setKnownEmail(email); })
      .catch(() => { /* display is optional */ })
      .finally(() => { if (active) setMode('login'); });
    return () => { active = false; };
  }, [signupEmail]);

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
    setMessage(`Verification link sent to ${masked}. It expires in 60 minutes — check your spam folder.`);
    setMode('sent');
    setPassword('');
    setNewEmail('');
  };
  const resend = async () => {
    setBusy(true); setMessage('');
    try {
      const token = resendCheck.consume();
      const { error } = await supabase.functions.invoke('recovery-email', {
        body: { action: 'send', email: signupEmail || knownEmail, captchaToken: token },
      });
      if (error) {
        const status = (error as { context?: { status?: number } })?.context?.status;
        throw new Error(status === 429
          ? 'Too many verification requests. Please wait a few minutes and try again.'
          : 'Could not send the verification email. Please check your connection and try again.');
      }
      sent(maskEmail(signupEmail || knownEmail));
    } catch (err) {
      setMessage(friendlyEntryError(err, 'Could not send the verification email.'));
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
      forgetSignupKey();
      sent(maskEmail(clean));
    } catch (err) {
      setMessage(friendlyEntryError(err, 'Could not send the verification email.'));
    } finally {
      setBusy(false);
    }
  };

  const shown = signupEmail || knownEmail;
  const title = mode === 'signup' ? 'Verify your recovery email' : 'Verify a recovery email';

  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,26rem)] rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-900 shadow-xl p-4 text-sm text-slate-700 dark:text-slate-200 space-y-2"
    >
      <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>

      {mode === 'sent' ? (
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
            {shown
              ? <>We sent a verification link to <span className="font-semibold">{maskEmail(shown)}</span>. Password reset links will go there once you confirm it.</>
              : 'Add a verified recovery inbox so password reset links reach you even if you forget your sign-in password.'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Check your spam folder — the link expires in 60 minutes.</p>
          {resendCheck.widget}
          {message && <p role="alert" className="text-red-600 dark:text-red-400">{message}</p>}
          <div className="flex flex-wrap gap-2">
            {shown && (
              <button type="button" onClick={resend} disabled={busy} className="min-h-[44px] px-4 rounded-xl bg-emerald-700 disabled:opacity-60 text-white font-semibold">
                {busy ? 'Sending…' : 'Resend link'}
              </button>
            )}
            <button type="button" onClick={() => { setMode('change'); setMessage(''); }} className="min-h-[44px] px-4 rounded-xl border border-emerald-700 dark:border-emerald-500 text-emerald-800 dark:text-emerald-300 font-semibold">
              {shown ? 'Correct address' : 'Add one now'}
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
