import { supabase } from '../lib/supabase';
import {
  createFunnelBuffer,
  type FunnelBuffer,
  type FunnelEvent,
  type FunnelEventRecord,
} from '../utils/funnel';

export type {
  FunnelBuffer,
  FunnelEvent,
  FunnelEventRecord,
  FunnelBufferOptions,
  FunnelSummary,
} from '../utils/funnel';
export { createFunnelBuffer, summarizeFunnel } from '../utils/funnel';

const SESSION_KEY = 'gsu_funnel_session';

export function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return '';
  }
}

function toRow(record: FunnelEventRecord) {
  return {
    event: record.event,
    user_id: record.subject ?? null,
    session_id: record.sessionId || null,
    meta: record.meta ?? {},
  };
}

export const funnel: FunnelBuffer = createFunnelBuffer({
  sessionId: typeof window === 'undefined' ? '' : getSessionId(),
  send: async (batch) => {
    const { error } = await supabase.from('funnel_events').insert(batch.map(toRow));
    if (error) throw error;
  },
});

/** Fire-and-forget tracking. Never throws. */
export function trackFunnel(
  event: FunnelEvent,
  meta: Record<string, unknown> = {},
  subject?: string | null,
): void {
  try {
    funnel.push(event, meta, subject);
  } catch {
    // Analytics must not affect the flow it measures.
  }
}

let flushBound = false;

/** Flush on navigation away / tab hide. Safe to call more than once. */
export function bindFunnelFlush(): () => void {
  if (flushBound || typeof window === 'undefined') return () => undefined;
  flushBound = true;
  const flush = () => {
    void funnel.flush();
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  return () => {
    window.removeEventListener('pagehide', flush);
    flushBound = false;
  };
}
