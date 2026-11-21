import { useEffect, useState } from 'react';
import { fetchFounderAccount, isCurrentUserFounder } from '../services/founder';

/** Server-derived founder account for a public tag. Null until known or on failure. */
export function useFounderAccount(enabled = true): string | null {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetchFounderAccount().then((value) => {
      if (alive) setUid(value);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return uid;
}

/** Whether the signed-in account is the protected owner. No client choice. */
export function useIsCurrentUserFounder(enabled = true): boolean {
  const [isFounder, setIsFounder] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void isCurrentUserFounder().then((value) => {
      if (alive) setIsFounder(value);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return isFounder;
}
