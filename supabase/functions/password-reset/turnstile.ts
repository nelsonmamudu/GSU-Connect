// Failure is deliberately indistinguishable from an unknown recovery account.
export async function verifyTurnstile(token: unknown, secret: string | undefined, send = fetch): Promise<boolean> {
  if (!secret?.trim() || typeof token !== 'string' || !token.trim() || token.length > 2048) return false;
  try {
    const result = await send('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method:'POST', body:new URLSearchParams({secret,response:token}), signal:AbortSignal.timeout(8000),
    });
    return result.ok && (await result.json()).success === true;
  } catch { return false; }
}
