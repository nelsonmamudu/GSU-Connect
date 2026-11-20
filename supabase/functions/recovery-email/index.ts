import { createClient } from 'jsr:@supabase/supabase-js@2';
import { recoveryEmailHandler } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const server = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const brevo = async (
  to: string,
  subject: string,
  textContent: string
): Promise<boolean> => {
  const sender = Deno.env.get('BREVO_SENDER_EMAIL');
  const key = Deno.env.get('BREVO_API_KEY');
  if (!sender || !key) return false;
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: { email: sender }, to: [{ email: to }], subject, textContent }),
    signal: AbortSignal.timeout(8000),
  });
  return response.ok;
};

Deno.serve(
  recoveryEmailHandler({
    turnstileSecret: () => Deno.env.get('TURNSTILE_SECRET_KEY'),
    async identify(jwt: string) {
      const caller = createClient(
        url,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } }
      );
      const user = await caller.auth.getUser(jwt);
      if (user.error || !user.data.user) return null;
      const session = await caller.rpc('active_app_session');
      return !session.error && session.data === true ? user.data.user.id : null;
    },
    async rpc(name: string, args: Record<string, string>) {
      return (await server.rpc(name, args)) as {
        data?: unknown;
        error: { message?: string } | null;
      };
    },
    appUrl: () => Deno.env.get('APP_URL'),
    deliver: (mail: string, link: string) =>
      brevo(
        mail,
        'Confirm your GSU Connect recovery email',
        `Open this link while signed in to the GSU Connect account that requested it. It expires in 60 minutes. If you did not request it, ignore it.\n\n${link}`
      ),
    notifyChange: (previous: string, _current: string) =>
      brevo(
        previous,
        'Your GSU Connect recovery email changed',
        'The recovery email on your GSU Connect account was just changed to a different inbox. If this was not you, sign in with your matric number or staff ID, replace the recovery email immediately, and contact support.'
      ),
  })
);
