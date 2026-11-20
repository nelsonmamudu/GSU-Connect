import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Reads #recovery-confirm=<64-hex-token> from the hash, keeps the token in
// sessionStorage so it survives a sign-in round trip, and lets the signed-in
// user confirm the inbox they opened the link from. GET/navigation never
// consumes anything; the confirm fires only on this explicit button press.
const HASH_RE = /^#recovery-confirm=([a-f0-9]{64})$/;
const STORAGE_KEY = 'gsu_recovery_confirm';

function readToken(): string {
  const fromHash = HASH_RE.exec(window.location.hash)?.[1];
  if (fromHash) {
    try {
      sessionStorage.setItem(STORAGE_KEY, fromHash);
    } catch {
      // Storage unavailable — the hash alone is still the source of truth.
    }
    return fromHash;
  }
  try {
    return sessionStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function RecoveryEmailConfirm() {
  const [token, setToken] = useState(readToken);
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const read = () => setToken(readToken());
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  if (!token && status === 'idle') return null;

  const discard = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setToken('');
    setStatus('idle');
    setMessage('');
  };

  const confirm = async () => {
    setStatus('busy');
    const t = token;
    try {
      const { error } = await supabase.functions.invoke('recovery-email', {
        body: { action: 'confirm', token: t },
      });
      if (error) throw error;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      setToken('');
      setStatus('done');
      setMessage('Recovery email confirmed. Password reset links will go there from now on.');
    } catch {
      setStatus('error');
      setMessage('This link is invalid, expired or already used. Request a fresh link from Profile.');
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Confirm recovery email"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,26rem)] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-4 text-sm text-slate-700 dark:text-slate-200 space-y-3"
    >
      <p className="font-semibold text-slate-900 dark:text-slate-100">Confirm your recovery email</p>
      {status === 'done' ? (
        <>
          <p role="status" className="text-emerald-700 dark:text-emerald-400 font-medium">{message}</p>
          <button type="button" onClick={discard} className="min-h-[44px] px-4 rounded-xl bg-emerald-700 text-white font-semibold">Done</button>
        </>
      ) : (
        <>
          <p>Tap confirm to link this inbox to your account. Your current recovery email stays active until this succeeds.</p>
          {status === 'error' && <p role="alert" className="text-red-600 dark:text-red-400">{message}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={status === 'busy'}
              className="min-h-[44px] px-4 rounded-xl bg-emerald-700 disabled:opacity-60 text-white font-semibold"
            >
              {status === 'busy' ? 'Confirming…' : 'Confirm recovery email'}
            </button>
            <button type="button" onClick={discard} className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 font-medium">Not now</button>
          </div>
        </>
      )}
    </div>
  );
}
