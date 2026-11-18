import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const SUPABASE_URL = 'https://supabase.example.invalid';
const APP_URL = 'https://app.example.invalid/';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/password-reset`;
const SERVICE_KEY = 'test-service-role';
const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const AUTH_EMAIL = 'login@example.invalid';
const RECOVERY_EMAIL = 'recovery@example.invalid';
const LOOKUP = [{ auth_email: AUTH_EMAIL, owner_id: OWNER_ID }];
const RECOVERY = [{ email: RECOVERY_EMAIL }];

// Capture Deno.serve's handler while loading the actual deployed entry point.
let handle: (req: Request) => Promise<Response>;
const serve = Deno.serve;
Deno.serve = ((handler: typeof handle) => {
  handle = handler;
}) as typeof serve;
try {
  await import('./index.ts');
} finally {
  Deno.serve = serve;
}

function post(identifier: string): Request {
  return new Request(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '192.0.2.15',
    },
    body: JSON.stringify({ identifier }),
  });
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function exercise(req: Request, replies: (Response | Error)[] = []) {
  const originalFetch = globalThis.fetch;
  const originalEnvGet = Deno.env.get;
  const env = new Map([
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SERVICE_KEY],
    ['APP_URL', APP_URL],
    ['BREVO_API_KEY', 'test-brevo-key'],
    ['BREVO_SENDER_EMAIL', 'sender@example.invalid'],
  ]);
  Deno.env.get = (name) => env.get(name);
  const calls: Request[] = [];
  globalThis.fetch = async (input, init) => {
    const reply = replies[calls.length];
    calls.push(new Request(input, init));
    if (reply instanceof Error) throw reply;
    if (!reply) throw new Error('Unexpected fetch');
    return reply;
  };
  try {
    const response = await handle(req);
    assert.equal(calls.length, replies.length);
    return { response, calls };
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.get = originalEnvGet;
  }
}

async function assertGenericSuccess(response: Response) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(await response.json(), { ok: true });
}

Deno.test('boots, handles browser preflight, and rejects invalid requests before calling Supabase', async () => {
  const { response: preflight } = await exercise(
    new Request(FUNCTION_URL, { method: 'OPTIONS' }),
  );
  assert.equal(preflight.status, 200);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(
    preflight.headers.get('Access-Control-Allow-Methods'),
    'POST, OPTIONS',
  );
  assert.equal(
    preflight.headers.get('Access-Control-Allow-Headers'),
    'authorization, x-client-info, apikey, content-type',
  );
  const { response: get } = await exercise(new Request(FUNCTION_URL));
  assert.equal(get.status, 405);
  const { response: badInput } = await exercise(post(''));
  assert.equal(badInput.status, 400);
});

Deno.test('rate-limits, resolves a phone lookup, and sends the generated link only to the stored recovery address', async () => {
  const phone = '0800 000 0000';
  const token = 'test/token?&+';
  const { response, calls: [rpc, lookup, recovery, auth, mail] } =
    await exercise(post(phone), [
      Response.json(true),
      Response.json(LOOKUP),
      Response.json(RECOVERY),
      Response.json({ hashed_token: token }),
      new Response(null, { status: 201 }),
    ]);
  const phoneHash = sha256('2348000000000');
  assert.equal(
    rpc.url,
    `${SUPABASE_URL}/rest/v1/rpc/consume_password_reset_rate_limit`,
  );
  assert.equal(rpc.method, 'POST');
  assert.deepEqual(await rpc.json(), {
    p_ip_hash: sha256('192.0.2.15'),
    p_identifier_hash: phoneHash,
    p_window_seconds: 900,
    p_ip_max: 10,
    p_identifier_max: 3,
  });
  const lookupUrl = new URL(lookup.url);
  assert.equal(lookup.method, 'GET');
  assert.equal(lookupUrl.pathname, '/rest/v1/public_lookups');
  assert.equal(
    lookupUrl.searchParams.get('hash_id'),
    `in.(${sha256(phone)},${phoneHash})`,
  );
  const recoveryUrl = new URL(recovery.url);
  assert.equal(recoveryUrl.pathname, '/rest/v1/account_recovery');
  assert.equal(recoveryUrl.searchParams.get('user_id'), `eq.${OWNER_ID}`);
  const authUrl = new URL(auth.url);
  assert.equal(authUrl.pathname, '/auth/v1/admin/generate_link');
  assert.equal(authUrl.searchParams.get('redirect_to'), APP_URL);
  assert.equal(auth.method, 'POST');
  assert.deepEqual(await auth.json(), { type: 'recovery', email: AUTH_EMAIL });
  for (const call of [rpc, lookup, recovery, auth]) {
    assert.equal(new URL(call.url).origin, SUPABASE_URL);
    assert.equal(call.headers.get('Authorization'), `Bearer ${SERVICE_KEY}`);
    assert.equal(call.headers.get('apikey'), SERVICE_KEY);
    assert.equal(call.redirect, 'error');
  }
  assert.equal(mail.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(mail.headers.get('Authorization'), null);
  assert.equal(mail.headers.get('apikey'), null);
  assert.equal(mail.headers.get('api-key'), 'test-brevo-key');
  const { to, htmlContent } = await mail.json();
  assert.deepEqual(to, [{ email: RECOVERY_EMAIL }]);
  const href = /href="([^"]+)"/.exec(htmlContent)?.[1];
  assert.ok(href);
  assert.ok(href.includes('&amp;type=recovery'));
  const reset = new URL(href.replaceAll('&amp;', '&'));
  assert.equal(reset.origin, SUPABASE_URL);
  assert.equal(reset.pathname, '/auth/v1/verify');
  assert.equal(reset.searchParams.get('token'), token);
  assert.equal(reset.searchParams.get('type'), 'recovery');
  assert.equal(reset.searchParams.get('redirect_to'), APP_URL);
  await assertGenericSuccess(response);
});

Deno.test('gives the same generic response for no match, no recovery address, or an Auth error', async () => {
  const request = () => post('TEST/000000');
  const scenarios = [
    [Response.json(true), Response.json([])],
    [Response.json(true), Response.json(LOOKUP), Response.json([])],
    [
      Response.json(true),
      Response.json(LOOKUP),
      Response.json(RECOVERY),
      new Response(null, { status: 500 }),
    ],
  ];
  for (const replies of scenarios) {
    const { response } = await exercise(request(), replies);
    await assertGenericSuccess(response);
  }
});

Deno.test('honors a durable denial and falls back to the in-memory limit on a network error', async () => {
  const request = () => post('TEST/FALLBACK');
  const { response: denied } = await exercise(request(), [
    Response.json(false),
  ]);
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get('Retry-After'), '900');
  for (let i = 0; i < 3; i++) {
    const { response } = await exercise(request(), [
      new TypeError('Offline'),
      Response.json([]),
    ]);
    await assertGenericSuccess(response);
  }
  const { response } = await exercise(request(), [new TypeError('Offline')]);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '900');
});
