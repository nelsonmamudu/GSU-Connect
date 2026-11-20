import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { trackFunnel } from '../services/funnel';

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
      // Storage unavailable — keep the token in the hash alone.
    }
    // Drop the token from the address bar immediately: hashes can be shared,
    // screenshotted or synced; sessionStorage survives the sign-in redirect.
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {
      // ignore — the token remains only in sessionStorage / this closure
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
      window.dispatchEvent(new Event('gsu-recovery-verified'));
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      trackFunnel('recovery_email_confirmed');
      setToken('');
      setStatus('done');
      setMessage('Recovery email confirmed. This inbox is now your verified recovery address.');
    } catch {
      setStatus('error');
      setMessage('This link is invalid, expired or already used. Request a fresh link from Profile.');
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Confirm recovery email"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,26rem)] rounded-2xl border border-line bg-surface shadow-xl p-4 text-sm text-ink-soft space-y-3"
    >
      <p className="font-semibold text-ink">Confirm your recovery email</p>
      {status === 'done' ? (
        <>
          <Alert variant="success">{message}</Alert>
          <Button type="button" onClick={discard}>Done</Button>
        </>
      ) : (
        <>
          <p>Tap confirm to link this inbox to your account. Your current recovery email stays active until this succeeds.</p>
          {status === 'error' && <Alert variant="error">{message}</Alert>}
          <div className="flex gap-2">
            <Button type="button" onClick={confirm} loading={status === 'busy'} loadingLabel="Confirming…">
              Confirm recovery email
            </Button>
            <Button type="button" variant="outline" onClick={discard}>Not now</Button>
          </div>
        </>
      )}
    </div>
  );
}
