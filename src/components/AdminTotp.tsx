import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function AdminTotp() {
  const [factor,setFactor]=useState(''), [qr,setQr]=useState(''), [code,setCode]=useState(''), [message,setMessage]=useState(''), [busy,setBusy]=useState(false);
  async function run() {
    setBusy(true); setMessage('');
    try {
      if (factor) {
        const {error}=await supabase.auth.mfa.challengeAndVerify({factorId:factor,code}); if(error) throw error;
        setQr(''); setFactor(''); setCode(''); location.reload(); return;
      }
      const list=await supabase.auth.mfa.listFactors(); if(list.error) throw list.error;
      const totp = list.data.all.filter(f => f.factor_type === 'totp');
      const existing = totp.find(f => f.status === 'verified');
      if(existing) {setFactor(existing.id);return;}
      for (const stale of totp.filter(f => f.status === 'unverified')) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: stale.id });
        if (error) throw error;
      }
      const res=await supabase.auth.mfa.enroll({factorType:'totp',issuer:'GSU Connect',friendlyName:`GSU Connect (${crypto.randomUUID()})`}); if(res.error) throw res.error;
      setFactor(res.data.id); setQr(res.data.totp.qr_code);
    } catch(e){setMessage(e instanceof Error?e.message:'Verification failed. Try again.');} finally {setBusy(false);}
  }
  return <section className="p-4 space-y-2 border rounded-xl"><h3>Admin two-factor verification</h3>
    {qr && <><p>Scan this code privately in your authenticator. Do not share it.</p><img src={qr} width="180" alt="Authenticator setup QR" /></>}
    {factor && <label>Authenticator code <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>}
    <button type="button" disabled={busy || (!!factor && code.length!==6)} onClick={run}>{factor?'Verify code':'Set up or verify authenticator'}</button>
    <p role="status">{message}</p></section>;
}
