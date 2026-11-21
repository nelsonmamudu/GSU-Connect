// The backing SQL is currently a reviewed-rollout draft, not deployed.
// These functions are not an authorization boundary; every RPC must enforce it.
import {supabase} from '../lib/supabase';
import type {ConfessionSafetyReason} from './supabaseService';

export type AnonymousCommentStatus = 'pending' | 'approved' | 'rejected' | 'removed';
export type AnonymousReportReason = 'harassment' | 'doxxing' | 'threat' | 'other';
export type AnonymousReviewDecision = 'approve' | 'reject' | 'remove' | 'dismiss_reports';
export interface AnonymousComment {
  id: string;
  body: string;
  status: AnonymousCommentStatus;
  createdAt: string;
}
export interface AnonymousReviewComment extends AnonymousComment {
  postId: string;
  openReports: number;
  reportReasons: string[];
}

function mapComment(row: Record<string, unknown>): AnonymousComment {
  return {
    id: String(row.id), body: String(row.body), status: row.status as AnonymousCommentStatus,
    createdAt: String(row.created_at),
  };
}

/** Whether this account is in the server-side pilot allowlist. Fails closed. */
export async function canUseAnonymousPilot(): Promise<boolean> {
  const {data,error}=await supabase.rpc('can_use_anonymous_pilot');
  if(error) return false;
  return data===true;
}

export async function listAnonymousComments(postId: string, before?: {time:string; id:string}): Promise<AnonymousComment[]> {
  const {data,error} = await supabase.rpc('list_anonymous_comments', {
    p_post:postId, p_before_time:before?.time ?? null, p_before_id:before?.id ?? null,
  });
  if(error) throw new Error('Could not load comments. Please try again.');
  return (Array.isArray(data) ? data : []).map(mapComment);
}

export async function submitAnonymousComment(postId:string, body:string): Promise<void> {
  const {error}=await supabase.rpc('submit_anonymous_comment',{p_post:postId,p_body:body});
  if(error) throw new Error('Could not submit your comment. Check its length or try again later.');
}

export async function reportAnonymousComment(commentId:string, reason:AnonymousReportReason): Promise<void> {
  const {error}=await supabase.rpc('report_anonymous_comment',{p_comment:commentId,p_reason:reason});
  if(error) throw new Error('Could not send your report. Please try again.');
}

export async function listAnonymousCommentReview(): Promise<AnonymousReviewComment[]> {
  const {data,error}=await supabase.rpc('list_anonymous_comment_review',{p_post:null});
  if(error) throw new Error('Could not load comment review. Please try again.');
  return (Array.isArray(data)?data:[]).map((row:Record<string,unknown>)=>({
    ...mapComment(row), postId:String(row.post_id), openReports:Number(row.open_reports) || 0,
    reportReasons:Array.isArray(row.report_reasons) ? row.report_reasons.map(String) : [],
  }));
}

export async function reviewAnonymousComment(commentId:string, decision:AnonymousReviewDecision): Promise<void> {
  const {error}=await supabase.rpc('review_anonymous_comment',{p_comment:commentId,p_decision:decision});
  if(error) throw new Error('Could not review this comment. Please refresh and try again.');
}

export async function revealAnonymousCommentAuthor(commentId:string, reason:ConfessionSafetyReason): Promise<string | null> {
  const {data,error}=await supabase.rpc('reveal_anonymous_comment_author',{p_comment:commentId,p_reason:reason});
  if(error) throw new Error('Could not look up this author.');
  return typeof data==='string' ? data : null;
}
