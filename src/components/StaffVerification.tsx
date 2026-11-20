import {useState,useEffect} from 'react';
import {supabase} from '../lib/supabase';

export const staffPaths = {email:'GSU staff email', document:'Employment document', id:'Staff ID photo', vouch:'Colleague vouch'} as const;
export type StaffPath=keyof typeof staffPaths;
export function StaffPathPicker({value,onChange}:{value:StaffPath;onChange:(p:StaffPath)=>void}) {
 return <fieldset className="min-w-0 space-y-2 text-left"><legend className="font-semibold">Proof of Staff Status</legend>
 <p className="text-xs">One verified method is required for admin review. Do not upload payslips.</p>
 <select aria-label="Staff verification method" className="w-full min-w-0 min-h-[44px] rounded-lg p-2 border text-sm" value={value} onChange={e=>onChange(e.target.value as StaffPath)}>{Object.entries(staffPaths).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select>
 <p className="text-xs">{value==='id'?'Upload a clear staff ID photo (3 MB maximum).':value==='document'?'Upload an appointment letter or course allocation sheet showing your name and department (3 MB maximum). Redact unrelated information.':value==='email'?'Confirm a link sent to your @gsu.edu.ng inbox after sign-in. This does not change your recovery email.':'After sign-in, ask a verified staff member in your department to confirm your affiliation.'}</p></fieldset>;
}
export function StaffProofAction({path,onUpdate,state}:{path:StaffPath;onUpdate:()=>void;state:string}){
 const [email,setEmail]=useState(''),[choices,setChoices]=useState<{id:string;full_name:string}[]>([]),[w,setW]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 const [token,setToken]=useState(()=>/^#staff-confirm=([a-f0-9]{64})$/.exec(location.hash)?.[1]||'');
 useEffect(()=>{const read=()=>setToken(/^#staff-confirm=([a-f0-9]{64})$/.exec(location.hash)?.[1]||'');window.addEventListener('hashchange',read);return()=>window.removeEventListener('hashchange',read);},[]);
 useEffect(()=>{let active=true;setMsg('');if(path==='vouch')void supabase.rpc('staff_vouch_candidates').then(({data,error})=>{if(active){setChoices(data||[]);if(error)setMsg('Could not load eligible staff. Try another method or return later.');}});return ()=>{active=false};},[path]);
 async function act(){setBusy(true);setMsg('');try{
  if(path==='vouch'){const r=await supabase.rpc('request_staff_vouch',{w});if(r.error)throw r.error;setMsg('Request delivered to the staff member’s in-app inbox.');}
  else {const r=await supabase.functions.invoke('staff-email',{body:token?{action:'confirm',token}:{action:'send',email}});if(r.error){const detail=await r.error.context?.json?.().catch(()=>null);throw new Error(detail?.message||'Could not verify the staff email. Please try again.');}setMsg(r.data.message);if(token){history.replaceState(null,'',location.pathname+location.search);setToken('');}}
  onUpdate();
 }catch(e){setMsg(e && typeof e==='object' && 'message' in e ? String(e.message):'Request failed.');}finally{setBusy(false);}}
 if(path!=='email' && path!=='vouch')return null;
 return <section className="space-y-2 p-3 border rounded-xl text-left">{path==='email' ? !token && <label>GSU staff email<input className="block w-full border p-2" type="email" autoComplete="email" placeholder="name@gsu.edu.ng" value={email} onChange={e=>setEmail(e.target.value)}/></label> : <><p>Request status: {state||'Not requested'}</p><select className="w-full border p-2" aria-label="Verified staff member" value={w} onChange={e=>setW(e.target.value)}><option value="">Choose verified staff</option>{choices.map(c=><option value={c.id} key={c.id}>{c.full_name}</option>)}</select>{!choices.length&&<p className="text-xs">No eligible colleague listed? Use email or a document instead.</p>}</>}
 <button type="button" className="min-h-[44px] font-semibold" disabled={busy||(path==='vouch'?!w:!token&&!email.trim())} onClick={act}>{path==='vouch'?'Request vouch':token?'Confirm my staff email':'Send confirmation link'}</button>{path==='email'&&token&&<button type="button" onClick={()=>{history.replaceState(null,'',location.pathname+location.search);setToken('');setMsg('');}}>Use a fresh link</button>}<p role="status">{msg}</p></section>;
}
export function StaffVouchInbox(){const [rows,setRows]=useState<{request_id:string;applicant_name:string;department:string}[]>([]),[msg,setMsg]=useState('');
 useEffect(()=>{let active=true;const load=async()=>{if(document.hidden)return;const {data,error}=await supabase.rpc('my_staff_vouches');if(active&&!error)setRows(data||[]);};void load();const timer=setInterval(load,30000);window.addEventListener('focus',load);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load)};},[]);
 async function answer(id:string,confirm:boolean){const {error}=await supabase.rpc('answer_staff_vouch',{request:id,confirm});if(!error)setRows(r=>r.filter(x=>x.request_id!==id));setMsg(error?'This request could not be updated.':confirm?'Affiliation confirmed. An admin makes the final decision.':'Vouch declined.');}
 return rows.length||msg?<aside className="p-4 mb-3 rounded-xl border space-y-2"><h2>Staff vouch requests</h2>{rows.map(r=><div key={r.request_id}><p>Can you personally confirm that {r.applicant_name} works in {r.department}?</p><button className="mr-4 min-h-[44px]" onClick={()=>answer(r.request_id,true)}>Confirm affiliation</button><button onClick={()=>answer(r.request_id,false)}>Decline</button></div>)}<p role="status">{msg}</p></aside>:null;}
