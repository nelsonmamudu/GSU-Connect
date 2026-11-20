/**
 * Pure funnel instrumentation primitives: a bounded in-memory buffer and an
 * aggregator. Kept free of Supabase/DOM imports so the logic is unit-testable
 * and can be reused outside the browser.
 */

export type FunnelEvent =
  | 'auth_view'
  | 'signup_step_reached'
  | 'signup_step_completed'
  | 'signup_proof_selected'
  | 'signup_submitted'
  | 'auth_error'
  | 'status_gate_view'
  | 'proof_upload_started'
  | 'proof_upload_succeeded'
  | 'proof_upload_failed'
  | 'status_change'
  | 'recovery_prompt_shown'
  | 'recovery_email_sent'
  | 'recovery_email_confirmed';

export interface FunnelEventRecord {
  event: FunnelEvent;
  subject?: string | null;
  sessionId?: string;
  meta?: Record<string, unknown>;
  at?: number;
}

export interface FunnelBuffer {
  push: (event: FunnelEvent, meta?: Record<string, unknown>, subject?: string | null) => void;
  size: () => number;
  peek: () => FunnelEventRecord[];
  clear: () => void;
  flush: () => Promise<FunnelEventRecord[]>;
}

export interface FunnelBufferOptions {
  send?: (batch: FunnelEventRecord[]) => Promise<void> | void;
  maxBufferSize?: number;
  sessionId?: string;
  now?: () => number;
}

export function createFunnelBuffer(options: FunnelBufferOptions = {}): FunnelBuffer {
  const { send, maxBufferSize = 50, sessionId = '', now = () => Date.now() } = options;
  let queue: FunnelEventRecord[] = [];

  return {
    push(event, meta = {}, subject = null) {
      queue.push({ event, subject, sessionId, meta, at: now() });
      if (queue.length > maxBufferSize) {
        // Drop the oldest: a bounded buffer beats an unbounded memory leak.
        queue = queue.slice(queue.length - maxBufferSize);
      }
    },
    size: () => queue.length,
    peek: () => queue.slice(),
    clear: () => {
      queue = [];
    },
    async flush() {
      if (!queue.length || !send) return [];
      const batch = queue;
      try {
        await send(batch);
        queue = [];
        return batch;
      } catch {
        // Keep the batch for a later flush rather than losing the events.
        queue = batch.slice(-maxBufferSize);
        return [];
      }
    },
  };
}

export interface FunnelRates {
  signupCompletion: number | null;
  proofUploadSuccess: number | null;
}

export interface FunnelSummary {
  counts: Record<string, number>;
  total: number;
  rates: FunnelRates;
}

function safeRatio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}

/** Aggregate a batch of events into counts and conversion ratios. */
export function summarizeFunnel(events: FunnelEventRecord[]): FunnelSummary {
  const counts: Record<string, number> = {};
  for (const event of events) {
    counts[event.event] = (counts[event.event] || 0) + 1;
  }
  return {
    counts,
    total: events.length,
    rates: {
      signupCompletion: safeRatio(counts.signup_submitted || 0, counts.signup_step_reached || 0),
      proofUploadSuccess: safeRatio(
        counts.proof_upload_succeeded || 0,
        counts.proof_upload_started || 0,
      ),
    },
  };
}
