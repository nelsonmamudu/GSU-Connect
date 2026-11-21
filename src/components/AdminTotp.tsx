import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Input } from './ui/Input';

/**
 * Admin two-factor setup. Rendered inside the Profile settings column, so it
 * uses the same section shell as every other block there.
 */
export function AdminTotp() {
  const [factor, setFactor] = useState('');
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setMessage('');
    try {
      if (factor) {
        const { error } = await supabase.auth.mfa.challengeAndVerify({
          factorId: factor,
          code,
        });
        if (error) throw error;
        setQr('');
        setFactor('');
        setCode('');
        location.reload();
        return;
      }
      const list = await supabase.auth.mfa.listFactors();
      if (list.error) throw list.error;
      const totp = list.data.all.filter((f) => f.factor_type === 'totp');
      const existing = totp.find((f) => f.status === 'verified');
      if (existing) {
        setFactor(existing.id);
        return;
      }
      for (const stale of totp.filter((f) => f.status === 'unverified')) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: stale.id });
        if (error) throw error;
      }
      const res = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'GSU Connect',
        friendlyName: `GSU Connect (${crypto.randomUUID()})`,
      });
      if (res.error) throw res.error;
      setFactor(res.data.id);
      setQr(res.data.totp.qr_code);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Verification failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const needsCode = Boolean(factor);

  return (
    <section className="bg-surface rounded-3xl border border-line/80 dark:border-line p-5 sm:p-6 space-y-3">
      <h3 className="text-sm font-bold text-ink flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-brand" />
        <span>Admin two-factor verification</span>
      </h3>

      {qr && (
        <div className="space-y-2">
          <p className="text-xs text-ink-body dark:text-ink-soft leading-relaxed">
            Scan this code privately in your authenticator. Do not share it.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            width="180"
            alt="Authenticator setup QR"
            className="rounded-xl border border-line bg-surface p-2"
          />
        </div>
      )}

      {needsCode && (
        <Field label="Authenticator code" hint="Six digits from your authenticator app.">
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
      )}

      <Button
        type="button"
        variant={needsCode ? 'primary' : 'secondary'}
        loading={busy}
        loadingLabel={needsCode ? 'Verifying…' : 'Setting up…'}
        disabled={needsCode && code.length !== 6}
        onClick={run}
        className="w-full"
      >
        {needsCode ? 'Verify code' : 'Set up or verify authenticator'}
      </Button>

      {message && (
        <p role="alert" className="text-xs font-medium text-danger">
          {message}
        </p>
      )}
    </section>
  );
}
