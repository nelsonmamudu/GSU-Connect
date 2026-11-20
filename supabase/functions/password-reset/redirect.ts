/** Accept only a configured HTTPS origin, not a pattern, credential or redirect path. */
export function resetOrigin(appUrl?: string, allowed?: string): string | null {
  function origin(value: string) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && url.href === url.origin + '/' ? url.origin : null;
    } catch { return null; }
  }
  const target = origin(appUrl || '');
  return target && allowed?.split(',').some(s => origin(s.trim()) === target) ? target + '/' : null;
}
