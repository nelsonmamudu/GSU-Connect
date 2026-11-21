import { supabase } from '../lib/supabase';
import {
  createFunnelBuffer,
  sanitizeFunnelEvents,
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
const PENDING_KEY = 'gsu_funnel_pending_v1';

function loadPendingEvents(): FunnelEventRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    return raw ? sanitizeFunnelEvents(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function savePendingEvents(pending: FunnelEventRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (pending.length === 0) window.localStorage.removeItem(PENDING_KEY);
    else window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Private browsing or a full quota: keep the in-memory queue working.
  }
}

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

/**
 * Events are also written to local storage until the server acknowledges them.
 * That covers a page closing or reloading before a request finishes. It is
 * at-least-once, not exactly-once: if the server accepted a batch but the
 * response was lost, the next load may resend it. Server-side de-duplication is
 * still required for exact counts.
 */
export const funnel: FunnelBuffer = createFunnelBuffer({
  sessionId: typeof window === 'undefined' ? '' : getSessionId(),
  persist: {
    load: loadPendingEvents,
    save: savePendingEvents,
  },
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
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  const onOnline = () => flush();
  window.addEventListener('pagehide', flush);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisibilityChange);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    window.removeEventListener('pagehide', flush);
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    flushBound = false;
  };
}
