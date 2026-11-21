import React, {useCallback, useEffect, useState} from 'react';
import {
  canUseAnonymousPilot, listAnonymousComments, listAnonymousCommentReview, reportAnonymousComment,
  revealAnonymousCommentAuthor, reviewAnonymousComment, submitAnonymousComment,
  type AnonymousComment, type AnonymousReportReason, type AnonymousReviewComment, type AnonymousReviewDecision,
} from '../services/anonymousComments';
import type {ConfessionSafetyReason} from '../services/supabaseService';
import {formatShortTime} from '../types';

const safetyOptions = <>
  <option value="">Select safety reason</option>
  <option value="credible_threat">Credible threat</option>
  <option value="harassment_or_doxxing">Harassment or doxxing</option>
  <option value="minor_safety">Minor safety</option>
  <option value="other_serious_safety">Other serious safety issue</option>
</>;

/** The parent feed stays hidden until the pilot and real backend are reviewed. */
export function AnonymousComments({postId}:{postId:string}) {
  const [pilot,setPilot]=useState<'checking' | 'allowed' | 'denied'>('checking');
  const [rows,setRows]=useState<AnonymousComment[]>([]);
  const [loading,setLoading]=useState(true);
  const [more,setMore]=useState(false);
  const [text,setText]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [reasons,setReasons]=useState<Record<string,AnonymousReportReason | ''>>({});
  const [reporting,setReporting]=useState<string | null>(null);
  const load=useCallback(async (append=false, cursor?:{time:string;id:string})=>{
    setLoading(true);setError('');
    try {
      const result=await listAnonymousComments(postId,cursor);
      setRows(previous=>append ? [...previous,...result] : result);
      setMore(result.length===50);
    } catch (err) { setError(err instanceof Error?err.message:'Could not load comments.'); }
    finally {setLoading(false);}
  },[postId]);
  useEffect(()=>{
    let alive=true;
    void canUseAnonymousPilot().then(allowed=>{if(alive)setPilot(allowed?'allowed':'denied');});
    return ()=>{alive=false;};
  },[]);
  useEffect(()=>{if(pilot==='allowed')void load();},[pilot,load]);
  async function submit(event:React.FormEvent) {
    event.preventDefault(); if(busy || !text.trim()) return;
    setBusy(true);setError('');setNotice('');
    try {await submitAnonymousComment(postId,text);setText('');await load();setNotice('Comment submitted for review. Only you can see it while it is pending.');}
    catch(err){setError(err instanceof Error?err.message:'Could not submit your comment.');}
    finally{setBusy(false);}
  }
  async function report(id:string) {
    const reason=reasons[id]; if(!reason||reporting) return;
    setReporting(id);setError('');setNotice('');
    try {await reportAnonymousComment(id,reason);setNotice('Report sent for review.');}
    catch(err){setError(err instanceof Error?err.message:'Could not send your report.');}
    finally{setReporting(null);}
  }
  return <section className="space-y-3 border-t border-line pt-3" aria-label="Anonymous comments">
    <h4 className="text-sm font-bold text-ink">Comments</h4>
    <p className="text-xs text-ink-muted">Your name and photo are not shown here. Admins can identify authors; what you write may identify you.</p>
    {pilot==='checking' && <p className="text-xs text-ink-muted">Checking comment access…</p>}
    {pilot==='denied' && <p className="text-xs text-ink-muted">Comments are limited to invited pilot participants while this feature is being reviewed.</p>}
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    {notice && <p role="status" aria-live="polite" className="text-xs text-brand">{notice}</p>}
    {pilot==='allowed' && loading && rows.length===0 && <p className="text-xs text-ink-muted">Loading comments…</p>}
    {pilot==='allowed' && !loading && rows.length===0 && !error && <p className="text-xs text-ink-muted">No comments yet. Start the conversation.</p>}
    <ul className="space-y-2">
      {rows.map(row=><li key={row.id} className="rounded-xl bg-sunken p-3 text-sm text-ink">
        <div className="flex justify-between gap-2"><span className="font-semibold">Anonymous</span><span className="text-xs text-ink-muted">{formatShortTime(row.createdAt)}</span></div>
        <p className="mt-1 whitespace-pre-wrap break-words">{row.body}</p>
        {row.status!=='approved' && <p className="mt-1 text-xs text-ink-muted">{row.status==='pending'?'Pending review — only you can see this.':'Not approved — only you can see this.'}</p>}
        {row.status==='approved' && <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-xs text-ink-muted" htmlFor={`report-${row.id}`}>Report comment</label>
          <select id={`report-${row.id}`} value={reasons[row.id]||''} onChange={e=>setReasons(previous=>({...previous,[row.id]:e.target.value as AnonymousReportReason | ''}))} className="min-h-[44px] rounded-lg border border-line bg-surface px-2 text-xs">
            <option value="">Select reason</option><option value="harassment">Harassment</option><option value="doxxing">Personal information</option><option value="threat">Threat</option><option value="other">Other</option>
          </select>
          <button type="button" disabled={!reasons[row.id]||Boolean(reporting)} onClick={()=>void report(row.id)} className="min-h-[44px] rounded-lg border border-line px-3 text-xs disabled:opacity-50">{reporting===row.id?'Sending…':'Send report'}</button>
        </div>}
      </li>)}
    </ul>
    {pilot==='allowed' && more && <button type="button" disabled={loading} onClick={()=>{const last=rows[rows.length-1];if(last) void load(true,{time:last.createdAt,id:last.id});}} className="min-h-[44px] rounded-lg border border-line px-3 text-xs disabled:opacity-50">{loading?'Loading…':'Load older comments'}</button>}
    {pilot==='allowed' && <form onSubmit={submit} className="space-y-2">
      <label htmlFor={`comment-${postId}`} className="block text-xs font-semibold">Add an anonymous comment</label>
      <textarea id={`comment-${postId}`} value={text} onChange={e=>setText(e.target.value)} maxLength={500} required rows={2} aria-describedby={`comment-count-${postId}`} className="w-full rounded-xl border border-line bg-surface p-2 text-sm" />
      <p id={`comment-count-${postId}`} className="text-[11px] text-ink-muted">{text.length}/500 characters. Comments wait for review before others see them.</p>
      <button disabled={busy||!text.trim()} type="submit" className="min-h-[44px] rounded-xl bg-brand px-4 text-xs font-semibold text-on-brand disabled:opacity-50">{busy?'Submitting…':'Submit for review'}</button>
    </form>}
  </section>;
}

export function AnonymousCommentReview() {
  const [rows,setRows]=useState<AnonymousReviewComment[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string | null>(null);
  const [error,setError]=useState('');
  const [reasons,setReasons]=useState<Record<string,ConfessionSafetyReason | ''>>({});
  const [authors,setAuthors]=useState<Record<string,string | null>>({});
  const load=useCallback(async ()=>{
    setLoading(true);setError('');
    try {setRows(await listAnonymousCommentReview());}
    catch(err){setError(err instanceof Error?err.message:'Could not load review queue.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  async function review(id:string,decision:AnonymousReviewDecision) {
    if(busy) return;setBusy(id);setError('');
    try {await reviewAnonymousComment(id,decision);await load();}
    catch(err){setError(err instanceof Error?err.message:'Could not review comment.');}
    finally{setBusy(null);}
  }
  async function reveal(id:string) {
    const reason=reasons[id];if(busy||!reason) return;setBusy(id);setError('');
    try {const author=await revealAnonymousCommentAuthor(id,reason);setAuthors(previous=>({...previous,[id]:author}));}
    catch(err){setError(err instanceof Error?err.message:'Could not look up author.');}
    finally{setBusy(null);}
  }
  return <section aria-label="Comment moderation" className="space-y-3 rounded-2xl border border-line bg-surface p-4">
    <h3 className="font-bold text-ink">Comment moderation</h3>
    <p className="text-xs text-ink-muted">Pending and reported comments, oldest first. Review up to 100 at a time; refresh after decisions.</p>
    <button type="button" disabled={loading} onClick={()=>void load()} className="min-h-[44px] rounded-lg border border-line px-3 text-xs">Refresh</button>
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    {loading && <p className="text-xs text-ink-muted">Loading moderation queue…</p>}
    {!loading&&!rows.length&&!error&&<p className="text-xs text-ink-muted">No pending or reported comments.</p>}
    <ul className="space-y-3">{rows.map(row=><li key={row.id} className="rounded-xl border border-line p-3">
      <p className="text-sm whitespace-pre-wrap break-words">{row.body}</p>
      <p className="text-xs text-ink-muted">{row.status} · {row.openReports} open reports {row.reportReasons.length>0?`(${row.reportReasons.join(', ')})`:''}</p>
      <p className="text-xs text-ink-muted">Post reference: {row.postId}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {row.status==='pending' && <><button disabled={Boolean(busy)} onClick={()=>void review(row.id,'approve')} className="min-h-[44px] rounded-lg border border-line px-3 text-xs">Approve</button><button disabled={Boolean(busy)} onClick={()=>void review(row.id,'reject')} className="min-h-[44px] rounded-lg border border-line px-3 text-xs">Reject</button></>}
        {row.status==='approved' && row.openReports>0 && <><button disabled={Boolean(busy)} onClick={()=>void review(row.id,'remove')} className="min-h-[44px] rounded-lg border border-line px-3 text-xs">Remove comment</button><button disabled={Boolean(busy)} onClick={()=>void review(row.id,'dismiss_reports')} className="min-h-[44px] rounded-lg border border-line px-3 text-xs">Dismiss reports</button></>}
      </div>
      <label htmlFor={`comment-safety-${row.id}`} className="mt-2 block text-xs text-ink-muted">Serious safety case (lookup is recorded)</label>
      <div className="flex flex-wrap gap-2"><select id={`comment-safety-${row.id}`} value={reasons[row.id]||''} onChange={e=>setReasons(previous=>({...previous,[row.id]:e.target.value as ConfessionSafetyReason | ''}))} className="min-h-[44px] rounded-lg border border-line bg-surface px-2 text-xs">{safetyOptions}</select>
        <button disabled={Boolean(busy)||!reasons[row.id]} onClick={()=>void reveal(row.id)} className="min-h-[44px] rounded-lg border border-line px-3 text-xs disabled:opacity-50">Look up commenter</button></div>
      {Object.prototype.hasOwnProperty.call(authors,row.id) && <p className="mt-2 break-all text-xs">{authors[row.id] ? `Account reference: ${authors[row.id]}` : 'Author record is unavailable.'}</p>}
    </li>)}</ul>
  </section>;
}
