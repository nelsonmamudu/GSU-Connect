// Read-only founder badge lookup. The account is decided by the protected
// phase1_private.app_owner row on the server; the client cannot choose it.
// If the public lookup has not been deployed or the call fails, no badge is
// shown and the account keeps its normal role label.
import { supabase } from '../lib/supabase';

let founderPromise: Promise<string | null> | null = null;

export function fetchFounderAccount(): Promise<string | null> {
  if (!founderPromise) {
    founderPromise = Promise.resolve(supabase.rpc('founder_account'))
      .then(({ data, error }) => {
        if (error) return null;
        return typeof data === 'string' && data ? data : null;
      })
      .catch(() => null);
  }
  return founderPromise ?? Promise.resolve(null);
}

/** True only when the existing server-side owner check succeeds for this session. */
export async function isCurrentUserFounder(): Promise<boolean> {
  const { data, error } = await supabase.rpc('elevated_workspace_access');
  return !error && data === true;
}

/** Test helper: forget a cached lookup (for example after signing out). */
export function resetFounderCache(): void {
  founderPromise = null;
}
