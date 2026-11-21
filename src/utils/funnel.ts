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

export const FUNNEL_EVENT_NAMES: readonly FunnelEvent[] = [
  'auth_view',
  'signup_step_reached',
  'signup_step_completed',
  'signup_proof_selected',
  'signup_submitted',
  'auth_error',
  'status_gate_view',
  'proof_upload_started',
  'proof_upload_succeeded',
  'proof_upload_failed',
  'status_change',
  'recovery_prompt_shown',
  'recovery_email_sent',
  'recovery_email_confirmed',
];

export interface FunnelBuffer {
  push: (event: FunnelEvent, meta?: Record<string, unknown>, subject?: string | null) => void;
  size: () => number;
  peek: () => FunnelEventRecord[];
  clear: () => void;
  flush: () => Promise<FunnelEventRecord[]>;
}

export interface FunnelPersistence {
  /** Previously persisted events that were not acknowledged before the page closed. */
  load?: () => FunnelEventRecord[] | null;
  /** Called with everything still unacknowledged, including an in-flight batch. */
  save?: (pending: FunnelEventRecord[]) => void;
}

export interface FunnelBufferOptions {
  send?: (batch: FunnelEventRecord[]) => Promise<void> | void;
  maxBufferSize?: number;
  sessionId?: string;
  now?: () => number;
  persist?: FunnelPersistence;
}

/**
 * Stored data can be stale, malformed or from an older build. Keep only records
 * that still look like funnel events so a bad value cannot break tracking.
 */
export function sanitizeFunnelEvents(value: unknown): FunnelEventRecord[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(FUNNEL_EVENT_NAMES);
  const clean: FunnelEventRecord[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.event !== 'string' || !allowed.has(row.event)) continue;
    clean.push({
      event: row.event as FunnelEvent,
      subject: typeof row.subject === 'string' ? row.subject : null,
      sessionId: typeof row.sessionId === 'string' ? row.sessionId : '',
      meta:
        row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
          ? (row.meta as Record<string, unknown>)
          : {},
      at: typeof row.at === 'number' && Number.isFinite(row.at) ? row.at : Date.now(),
    });
  }
  return clean;
}

export function createFunnelBuffer(options: FunnelBufferOptions = {}): FunnelBuffer {
  const { send, sessionId = '', now = () => Date.now(), persist } = options;
  const maxBufferSize = options.maxBufferSize ?? 50;
  if (!Number.isSafeInteger(maxBufferSize) || maxBufferSize < 0) {
    throw new RangeError('maxBufferSize must be a non-negative safe integer');
  }
  let queue: FunnelEventRecord[] = [];
  let inFlight: Promise<FunnelEventRecord[]> | null = null;
  let inFlightBatch: FunnelEventRecord[] = [];
  let clearGeneration = 0;
  const bounded = (events: FunnelEventRecord[]) =>
    maxBufferSize === 0 ? [] : events.slice(-maxBufferSize);

  // Restore unsent events from a previous page load before anything new arrives.
  if (persist?.load) {
    try {
      queue = bounded(sanitizeFunnelEvents(persist.load()));
    } catch {
      queue = [];
    }
  }

  /** Save the queue plus any batch in flight so a closed page does not lose it. */
  const savePending = () => {
    if (!persist?.save) return;
    try {
      persist.save(bounded([...inFlightBatch, ...queue]));
    } catch {
      // Storage can be unavailable (private mode/quota); tracking must not throw.
    }
  };

  const flush = (): Promise<FunnelEventRecord[]> => {
    if (inFlight) {
      // A flush requested for newer events waits for the current send. Do not
      // immediately retry a failed batch; leave it queued for a later trigger.
      return queue.length ? inFlight.then((sent) => sent.length ? flush() : []) : inFlight;
    }
    if (!queue.length || !send) return Promise.resolve([]);
    const batch = queue;
    queue = [];
    inFlightBatch = batch;
    const generation = clearGeneration;
    savePending();
    // Defer invoking send until inFlight is set, even for a synchronous sender.
    inFlight = Promise.resolve()
      .then(() => send(batch))
      .then(
        () => {
          inFlightBatch = [];
          savePending();
          return batch;
        },
        () => {
          if (generation === clearGeneration) queue = bounded([...batch, ...queue]);
          inFlightBatch = [];
          savePending();
          return [];
        },
      )
      .finally(() => { inFlight = null; });
    return inFlight;
  };

  return {
    push(event, meta = {}, subject = null) {
      queue = bounded([...queue, { event, subject, sessionId, meta, at: now() }]);
      savePending();
    },
    size: () => queue.length,
    peek: () => queue.slice(),
    clear: () => {
      queue = [];
      // A failed in-flight batch must not resurrect events intentionally cleared.
      clearGeneration += 1;
      savePending();
    },
    flush,
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
