import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {recoveryEmailHandler} from '../supabase/functions/recovery-email/handler';

const sha256 = s => createHash('sha256').update(s).digest('hex');

function harness(overrides = {}) {
  const calls = [];
  const state = {
    notifyCalls: [],
    deliverCalls: [],
    rpcImpl: overrides.rpcImpl || (async () => ({data: null, error: null})),
  };
  const handle = recoveryEmailHandler({
    identify: async jwt => (jwt === 'valid-a' ? 'user-a' : jwt === 'valid-b' ? 'user-b' : null),
    rpc: async (name, args) => { calls.push({name, args}); return state.rpcImpl(name, args); },
    appUrl: () => 'https://campus.example',
    deliver: async (address, link) => { state.deliverCalls.push({address, link}); return true; },
    notifyChange: async (previous, current) => { state.notifyCalls.push({previous, current}); return true; },
  });
  const post = (input, jwt = 'valid-a') =>
    handle(new Request('https://fn.example', {method: 'POST', headers: {Authorization: `Bearer ${jwt}`}, body: JSON.stringify(input)}));
  return {handle, post, calls, state};
}


test('GET never consumes, never mails, never reaches the RPC layer', async () => {
  const {handle, calls} = harness();
  const res = await handle(new Request('https://fn.example/?token=recovery-confirm=' + 'a'.repeat(64)));
  assert.equal(res.status, 405);
  assert.equal(calls.length, 0);
});

test('unauthenticated requests are rejected before any RPC', async () => {
  const {post, calls} = harness();
  assert.equal((await post({action: 'send', email: 'a@example.com'}, 'bogus')).status, 401);
  assert.equal((await post({action: 'confirm', token: 'a'.repeat(64)}, 'bogus')).status, 401);
  assert.equal(calls.length, 0);
});

test('send validates input and issues a normalized, server-side token', async () => {
  const {post, calls, state} = harness();
  assert.equal((await post({action: 'send', email: 'not-an-email'})).status, 400);
  assert.equal((await post({action: 'send', email: `${'a'.repeat(260)}@x.com`})).status, 400);
  assert.equal(calls.length, 0);

  const res = await post({action: 'send', email: '  Mixed.Case@Example.COM '});
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'request_recovery_email');
  assert.equal(calls[0].args.mail, 'mixed.case@example.com');
  assert.match(calls[0].args.token_hash, /^[a-f0-9]{64}$/);

  assert.equal(state.deliverCalls.length, 1);
  assert.equal(state.deliverCalls[0].address, 'mixed.case@example.com');
  const link = new URL(state.deliverCalls[0].link);
  assert.equal(link.origin, 'https://campus.example');
  const token = /^#recovery-confirm=([0-9a-f]{64})$/.exec(link.hash)?.[1];
  assert.ok(token, 'link carries a 256-bit recovery-confirm token');
  assert.equal(calls[0].args.token_hash, sha256(token), 'only the digest reaches the database');
});

test('database cap errors map to 429 without revealing which cap tripped', async () => {
  for (const message of ['Verification mail limit reached', 'Too many verification requests for this address', 'Email request limit reached']) {
    const {post} = harness({rpcImpl: async () => ({data: null, error: {message}})});
    const res = await post({action: 'send', email: 'user@example.com'});
    assert.equal(res.status, 429, message);
    assert.match(await res.text(), /wait before requesting/i);
  }
});

test('expired, consumed, revoked, cross-account and replayed links share one generic failure', async () => {
  // The SQL layer reports all of these identically; the handler must not distinguish them.
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
      // The digest only matches challenges owned by user-a; user-b fails closed in SQL.
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
  // Case 1: replacing a different old inbox — notify the old one.
  const replaced = harness({rpcImpl: async () => ({data: {previous: 'old@example.com', current: 'new@example.com'}, error: null})});
  assert.equal((await replaced.post({action: 'confirm', token: '1'.repeat(64)})).status, 200);
  assert.deepEqual(replaced.state.notifyCalls, [{previous: 'old@example.com', current: 'new@example.com'}]);

  // Case 2: first-time binding — no old inbox, no notification.
  const fresh = harness({rpcImpl: async () => ({data: {previous: null, current: 'new@example.com'}, error: null})});
  assert.equal((await fresh.post({action: 'confirm', token: '2'.repeat(64)})).status, 200);
  assert.equal(fresh.state.notifyCalls.length, 0);

  // Case 3: re-confirming the same address — unchanged binding, no notification.
  const same = harness({rpcImpl: async () => ({data: {previous: 'same@example.com', current: 'same@example.com'}, error: null})});
  assert.equal((await same.post({action: 'confirm', token: '3'.repeat(64)})).status, 200);
  assert.equal(same.state.notifyCalls.length, 0);

  // Case 4: a failing notification must not fail the confirm.
  const flaky = harness({rpcImpl: async () => ({data: {previous: 'old@example.com', current: 'new@example.com'}, error: null})});
  const original = flaky.state;
  void original;
  // Re-wire notifyChange to throw and confirm still succeeds.
  const h = recoveryEmailHandler({
    identify: async () => 'user-a',
    rpc: async () => ({data: {previous: 'old@example.com', current: 'new@example.com'}, error: null}),
    appUrl: () => 'https://campus.example',
    deliver: async () => true,
    notifyChange: async () => { throw new Error('brevo down'); },
  });
  const res = await h(new Request('https://fn.example', {method: 'POST', headers: {Authorization: 'Bearer whatever'}, body: JSON.stringify({action: 'confirm', token: '4'.repeat(64)})}));
  assert.equal(res.status, 200);
});

test('unsupported actions and oversized bodies are rejected without RPC', async () => {
  const {post, calls} = harness();
  assert.equal((await post({action: 'delete'})).status, 400);
  assert.equal(calls.length, 0);
  const big = await post({action: 'send', email: 'a@example.com', pad: 'x'.repeat(5000)});
  assert.equal(big.status, 400);
  assert.equal(calls.length, 0);
});

test('send fails closed when the app URL is not https', async () => {
  const h = recoveryEmailHandler({
    identify: async () => 'user-a',
    rpc: async () => ({data: null, error: null}),
    appUrl: () => 'http://localhost:3000',
    deliver: async () => { throw new Error('should not be called'); },
  });
  const res = await h(new Request('https://fn.example', {method: 'POST', headers: {Authorization: 'Bearer x'}, body: JSON.stringify({action: 'send', email: 'a@example.com'})}));
  assert.equal(res.status, 503);
});
