import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, createHmac } from 'node:crypto';
import {recoveryEmailHandler} from '../supabase/functions/recovery-email/handler';

const sha256 = s => createHash('sha256').update(s).digest('hex');
const hmacSha256 = (secret, message) =>
  createHmac('sha256', secret).update(message).digest('hex');

const VALID = 'valid-captcha-token';

// Craft a pre-signed-shape JWT (the handler inspects claims; signature is irrelevant here).
const jwtWith = payload =>
  `${Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.testsig`;
const nowSec = () => Math.floor(Date.now() / 1000);
const verifiedBinding = { rpcImpl: async () => ({ data: true, error: null }) };

function mockCaptcha(t, success) {
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    return Response.json({success});
  });
}

function harness(overrides = {}) {
  const calls = [];
  const state = {
    notifyCalls: [],
    deliverCalls: [],
    rpcImpl: overrides.rpcImpl || (async () => ({data: null, error: null})),
  };
  const handle = recoveryEmailHandler({
    identify: async jwt => {
    if (jwt === 'valid-a') return 'user-a';
    if (jwt === 'valid-b') return 'user-b';
    try {
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
      return payload?.sub === 'user-a' ? 'user-a' : payload?.sub === 'user-b' ? 'user-b' : null;
    } catch { return null; }
  },
    turnstileSecret: () => 'test-secret',
    rpc: async (name, args) => { calls.push({name, args}); return state.rpcImpl(name, args); },
    appUrl: () => 'https://campus.example',
    deliver: async (address, link) => { state.deliverCalls.push({address, link}); return true; },
    notifyChange: async (previous, current) => { state.notifyCalls.push({previous, current}); return true; },
  });
  const post = (input, jwt = 'valid-a', headers = {}) =>
    handle(new Request('https://fn.example', {method: 'POST', headers: {Authorization: `Bearer ${jwt}`, ...headers}, body: JSON.stringify(input)}));
  return {handle, post, calls, state};
}

test('GET never consumes, never mails, never reaches the RPC layer', async () => {
  const {handle, calls} = harness();
  const res = await handle(new Request('https://fn.example/?token=recovery-confirm=' + 'a'.repeat(64)));
  assert.equal(res.status, 405);
  assert.equal(calls.length, 0);
});

test('unauthenticated requests are rejected before Turnstile or RPC', async (t) => {
  mockCaptcha(t, true);
  const {post, calls} = harness();
  assert.equal((await post({action: 'send', email: 'a@example.com', captchaToken: VALID}, 'bogus')).status, 401);
  assert.equal((await post({action: 'confirm', token: 'a'.repeat(64)}, 'bogus')).status, 401);
  assert.equal(calls.length, 0);
  assert.equal(fetch.mock.callCount(), 0);
});

test('missing or bogus Turnstile tokens return the generic 200, charge no quota and call no RPC', async (t) => {
  mockCaptcha(t, false);
  for (const captchaToken of [undefined, 'bogus']) {
    const {post, calls, state} = harness();
    const start = Date.now();
    const res = await post({action: 'send', email: 'a@example.com', captchaToken});
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {message: 'Check your inbox. The link expires in 60 minutes.'});
    assert.ok(Date.now() - start >= 350, 'timing floor applies');
    assert.equal(calls.length, 0, 'no RPC, no quota charge');
    assert.equal(state.deliverCalls.length, 0, 'nothing sent');
  }
});

test('send validates input and issues a normalized, server-side token', async (t) => {
  mockCaptcha(t, true);
  const {post, calls, state} = harness();
  assert.equal((await post({action: 'send', email: 'not-an-email', captchaToken: VALID})).status, 400);
  assert.equal((await post({action: 'send', email: `${'a'.repeat(260)}@x.com`, captchaToken: VALID})).status, 400);
  assert.equal(calls.length, 0);

  const res = await post({action: 'send', email: '  Mixed.Case@Example.COM ', captchaToken: VALID});
  assert.equal(res.status, 200);
  assert.deepEqual(calls.map(c => c.name), ['has_verified_recovery', 'request_recovery_email']);
  assert.equal(calls[1].name, 'request_recovery_email');
  assert.equal(calls[1].args.mail, 'mixed.case@example.com');
  assert.match(calls[1].args.token_hash, /^[a-f0-9]{64}$/);
  assert.equal(calls[1].args.ip_hash, '');

  assert.equal(state.deliverCalls.length, 1);
  const link = new URL(state.deliverCalls[0].link);
  assert.equal(link.origin, 'https://campus.example');
  const token = /^#recovery-confirm=([0-9a-f]{64})$/.exec(link.hash)?.[1];
  assert.ok(token, 'link carries a 256-bit recovery-confirm token');
  assert.equal(calls[1].args.token_hash, sha256(token), 'only the digest reaches the database');
});

test('the client IP is salted (HMAC, keyed by the Turnstile secret) before it reaches the database; the raw IP never does', async (t) => {
  mockCaptcha(t, true);
  const {post, calls} = harness();
  const res = await post({action: 'send', email: 'a@example.com', captchaToken: VALID}, 'valid-a', {'x-forwarded-for': '203.0.113.9, 10.0.0.1'});
  assert.equal(res.status, 200);
  // Salted with the existing TURNSTILE_SECRET_KEY ('test-secret' here), domain-separated.
  assert.equal(calls[1].args.ip_hash, hmacSha256('test-secret', 'recovery-ip:203.0.113.9'));
  assert.notEqual(calls[1].args.ip_hash, sha256('203.0.113.9'));
  assert.ok(!JSON.stringify(calls[1]).includes('203.0.113.9'));
});

test('database cap errors (including per-IP) map to a generic 429', async (t) => {
  mockCaptcha(t, true);
  for (const message of ['Verification mail limit reached', 'Too many verification requests for this address', 'Email request limit reached', 'Too many verification requests from this network']) {
    const {post} = harness({rpcImpl: async (name) => name === 'has_verified_recovery' ? {data: false, error: null} : ({data: null, error: {message}})});
    const res = await post({action: 'send', email: 'user@example.com', captchaToken: VALID});
    assert.equal(res.status, 429, message);
    assert.match(await res.text(), /wait before requesting/i);
  }
});

test('expired, consumed, revoked, cross-account and replayed links share one generic failure', async (t) => {
  mockCaptcha(t, true);
  const {post} = harness({rpcImpl: async () => ({data: null, error: {message: 'Link invalid or expired'}})});
  const res = await post({action: 'confirm', token: 'b'.repeat(64)});
  assert.equal(res.status, 400);
  assert.match(await res.text(), /invalid, expired or already used/i);
});

test('confirm is bound to the calling account — a second account with the same token gets the generic failure', async () => {
  const seen = [];
  const {post} = harness({
    rpcImpl: async (name, args) => {
      seen.push(args.u);
      return args.u === 'user-a'
        ? {data: {previous: null, current: 'a@example.com'}, error: null}
        : {data: null, error: {message: 'Link invalid or expired'}};
    },
  });
  const token = 'c'.repeat(64);
  assert.equal((await post({action: 'confirm', token}, 'valid-b')).status, 400);
  assert.equal((await post({action: 'confirm', token}, 'valid-a')).status, 200);
  assert.deepEqual(seen, ['user-b', 'user-a']);
});

test('a replayed confirm is single-use: second call hits the database as consumed', async () => {
  let confirmed = false;
  const {post} = harness({
    rpcImpl: async (name, args) => {
      if (!confirmed) { confirmed = true; return {data: {previous: null, current: 'a@example.com'}, error: null}; }
      return {data: null, error: {message: 'Link invalid or expired'}};
    },
  });
  const token = 'd'.repeat(64);
  assert.equal((await post({action: 'confirm', token})).status, 200);
  assert.equal((await post({action: 'confirm', token})).status, 400);
});

test('concurrent claim of one address: the loser gets 409, the winner 200', async () => {
  let claimed = false;
  const {post} = harness({
    rpcImpl: async (name, args) => {
      if (!claimed) { claimed = true; return {data: {previous: null, current: 'shared@example.com'}, error: null}; }
      return {data: null, error: {message: 'Address already linked to another account'}};
    },
  });
  assert.equal((await post({action: 'confirm', token: 'e'.repeat(64)}, 'valid-a')).status, 200);
  const loser = await post({action: 'confirm', token: 'f'.repeat(64)}, 'valid-b');
  assert.equal(loser.status, 409);
  assert.match(await loser.text(), /already linked to another account/i);
});

test('confirm notifies the previous inbox only when the binding actually changes', async () => {
  const replaced = harness({rpcImpl: async () => ({data: {previous: 'old@example.com', current: 'new@example.com'}, error: null})});
  assert.equal((await replaced.post({action: 'confirm', token: '1'.repeat(64)})).status, 200);
  assert.deepEqual(replaced.state.notifyCalls, [{previous: 'old@example.com', current: 'new@example.com'}]);

  const fresh = harness({rpcImpl: async () => ({data: {previous: null, current: 'new@example.com'}, error: null})});
  assert.equal((await fresh.post({action: 'confirm', token: '2'.repeat(64)})).status, 200);
  assert.equal(fresh.state.notifyCalls.length, 0);

  const same = harness({rpcImpl: async () => ({data: {previous: 'same@example.com', current: 'same@example.com'}, error: null})});
  assert.equal((await same.post({action: 'confirm', token: '3'.repeat(64)})).status, 200);
  assert.equal(same.state.notifyCalls.length, 0);

  const h = recoveryEmailHandler({
    identify: async () => 'user-a',
    turnstileSecret: () => 'test-secret',
    rpc: async () => ({data: {previous: 'old@example.com', current: 'new@example.com'}, error: null}),
    appUrl: () => 'https://campus.example',
    deliver: async () => true,
    notifyChange: async () => { throw new Error('brevo down'); },
  });
  const res = await h(new Request('https://fn.example', {method: 'POST', headers: {Authorization: 'Bearer whatever'}, body: JSON.stringify({action: 'confirm', token: '4'.repeat(64)})}));
  assert.equal(res.status, 200);
});

test('unsupported actions and oversized bodies are rejected without RPC', async (t) => {
  mockCaptcha(t, true);
  const {post, calls} = harness();
  assert.equal((await post({action: 'delete', captchaToken: VALID})).status, 400);
  assert.equal(calls.length, 0);
  const big = await post({action: 'send', email: 'a@example.com', captchaToken: VALID, pad: 'x'.repeat(5000)});
  assert.equal(big.status, 400);
  assert.equal(calls.length, 0);
});

test('send fails closed when the app URL is not https', async (t) => {
  mockCaptcha(t, true);
  const h = recoveryEmailHandler({
    identify: async () => 'user-a',
    turnstileSecret: () => 'test-secret',
    rpc: async () => ({data: null, error: null}),
    appUrl: () => 'http://localhost:3000',
    deliver: async () => { throw new Error('should not be called'); },
  });
  const res = await h(new Request('https://fn.example', {method: 'POST', headers: {Authorization: 'Bearer x'}, body: JSON.stringify({action: 'send', email: 'a@example.com', captchaToken: VALID})}));
  assert.equal(res.status, 503);
});

test('missing amr with an existing verified binding: 403 reauth_required, nothing sent or counted', async (t) => {
  mockCaptcha(t, true);
  const calls = [];
  const h = recoveryEmailHandler({
    identify: async () => 'user-a',
    turnstileSecret: () => 'test-secret',
    rpc: async (name, args) => { calls.push({ name, args }); return { data: true, error: null }; },
    appUrl: () => 'https://campus.example',
    deliver: async () => { throw new Error('must not deliver'); },
  });
  const res = await h(new Request('https://fn.example', { method: 'POST', headers: { Authorization: `Bearer ${jwtWith({ sub: 'user-a' })}` }, body: JSON.stringify({ action: 'send', email: 'a@example.com', captchaToken: VALID }) }));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { message: 'Sign in again to change your verified recovery address.', code: 'reauth_required' });
  assert.deepEqual(calls.map(c => c.name), ['has_verified_recovery'], 'request_recovery_email must not run');
});

test('refreshed token with an old amr is refused (amr timestamps do not change on refresh)', async (t) => {
  mockCaptcha(t, true);
  const calls = [];
  const h = recoveryEmailHandler({
    identify: async () => 'user-a',
    turnstileSecret: () => 'test-secret',
    rpc: async (name, args) => { calls.push({ name, args }); return { data: true, error: null }; },
    appUrl: () => 'https://campus.example',
    deliver: async () => { throw new Error('must not deliver'); },
  });
  const staleAmr = [{ method: 'password', timestamp: nowSec() - 3600 }]; // signed in an hour ago, refreshed since
  const res = await h(new Request('https://fn.example', { method: 'POST', headers: { Authorization: `Bearer ${jwtWith({ sub: 'user-a', amr: staleAmr })}` }, body: JSON.stringify({ action: 'send', email: 'a@example.com', captchaToken: VALID }) }));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { message: 'Sign in again to change your verified recovery address.', code: 'reauth_required' });
  assert.deepEqual(calls.map(c => c.name), ['has_verified_recovery']);
});

test('fresh amr passes the gate and the send proceeds normally', async (t) => {
  mockCaptcha(t, true);
  const calls = [];
  const h = recoveryEmailHandler({
    identify: async () => 'user-a',
    turnstileSecret: () => 'test-secret',
    rpc: async (name, args) => { calls.push({ name, args }); return name === 'has_verified_recovery' ? { data: true, error: null } : { data: null, error: null }; },
    appUrl: () => 'https://campus.example',
    deliver: async () => true,
  });
  const freshAmr = [{ method: 'password', timestamp: nowSec() - 60 }];
  const res = await h(new Request('https://fn.example', { method: 'POST', headers: { Authorization: `Bearer ${jwtWith({ sub: 'user-a', amr: freshAmr })}` }, body: JSON.stringify({ action: 'send', email: 'a@example.com', captchaToken: VALID }) }));
  assert.equal(res.status, 200);
  assert.deepEqual(calls.map(c => c.name), ['has_verified_recovery', 'request_recovery_email']);
});

test('malformed amr fails closed with reauth_required', async (t) => {
  mockCaptcha(t, true);
  for (const amr of [
    [],
    [{ method: 'password' }],
    [{ method: 'password', timestamp: 'soon' }],
    [{ method: '', timestamp: nowSec() }],
    [{ timestamp: nowSec() }],
    ['password'],
  ]) {
    const calls = [];
    const h = recoveryEmailHandler({
      identify: async () => 'user-a',
      turnstileSecret: () => 'test-secret',
      rpc: async (name) => { calls.push(name); return { data: true, error: null }; },
      appUrl: () => 'https://campus.example',
      deliver: async () => { throw new Error('must not deliver'); },
    });
    const res = await h(new Request('https://fn.example', { method: 'POST', headers: { Authorization: `Bearer ${jwtWith({ sub: 'user-a', amr })}` }, body: JSON.stringify({ action: 'send', email: 'a@example.com', captchaToken: VALID }) }));
    assert.equal(res.status, 403, JSON.stringify(amr));
    assert.deepEqual(await res.json(), { message: 'Sign in again to change your verified recovery address.', code: 'reauth_required' });
    assert.deepEqual(calls, ['has_verified_recovery']);
  }
});

test('no verified binding: bootstrap send works even with no amr (gate is for CHANGES)', async (t) => {
  mockCaptcha(t, true);
  const calls = [];
  const h = recoveryEmailHandler({
    identify: async () => 'user-a',
    turnstileSecret: () => 'test-secret',
    rpc: async (name) => { calls.push(name); return { data: false, error: null }; },
    appUrl: () => 'https://campus.example',
    deliver: async () => true,
  });
  const res = await h(new Request('https://fn.example', { method: 'POST', headers: { Authorization: `Bearer ${jwtWith({ sub: 'user-a' })}` }, body: JSON.stringify({ action: 'send', email: 'a@example.com', captchaToken: VALID }) }));
  assert.equal(res.status, 200);
  assert.deepEqual(calls, ['has_verified_recovery', 'request_recovery_email']);
});

test('has_verified_recovery failure fails closed with 503 and no side effects', async (t) => {
  mockCaptcha(t, true);
  const calls = [];
  const h = recoveryEmailHandler({
    identify: async () => 'user-a',
    turnstileSecret: () => 'test-secret',
    rpc: async (name) => { calls.push(name); return { data: null, error: { message: 'db down' } }; },
    appUrl: () => 'https://campus.example',
    deliver: async () => { throw new Error('must not deliver'); },
  });
  const res = await h(new Request('https://fn.example', { method: 'POST', headers: { Authorization: `Bearer ${jwtWith({ sub: 'user-a', amr: [{ method: 'password', timestamp: nowSec() - 60 }] })}` }, body: JSON.stringify({ action: 'send', email: 'a@example.com', captchaToken: VALID }) }));
  assert.equal(res.status, 503);
  assert.deepEqual(calls, ['has_verified_recovery']);
});

test('confirm action is NOT gated on fresh amr', async (t) => {
  const calls = [];
  const staleAmr = [{ method: 'password', timestamp: nowSec() - 7200 }];
  const h = recoveryEmailHandler({
    identify: async () => 'user-a',
    turnstileSecret: () => 'test-secret',
    rpc: async (name) => { calls.push(name); return name === 'has_verified_recovery' ? { data: true, error: null } : { data: { previous: null, current: 'a@example.com' }, error: null }; },
    appUrl: () => 'https://campus.example',
    deliver: async () => { throw new Error('must not deliver'); },
  });
  const res = await h(new Request('https://fn.example', { method: 'POST', headers: { Authorization: `Bearer ${jwtWith({ sub: 'user-a', amr: staleAmr })}` }, body: JSON.stringify({ action: 'confirm', token: 'f'.repeat(64) }) }));
  assert.equal(res.status, 200);
  assert.deepEqual(calls, ['confirm_recovery_email'], 'has_verified_recovery must not run on confirm');
});
