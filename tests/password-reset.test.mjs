import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

test('missing and bogus Turnstile tokens return after the floor without spending reset quota or looking up accounts', async t => {
  let handler;
  const rpcCalls = [], lookups = [], envReads = [];
  const api = {
    rpc(name) { rpcCalls.push(name); return {data:true}; },
    from(table) { lookups.push(table); throw Error('Unexpected lookup'); },
  };
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    return Response.json({success:false});
  });
  // Run the real Edge handler in Node, substituting only Deno and the JSR client.
  globalThis.resetTestClient = api;
  globalThis.Deno = {serve(fn){ handler = fn; }, env:{get(name){envReads.push(name);return 'fixture';}}};
  const hooks = registerHooks({resolve(specifier, context, next) {
    if (specifier === 'jsr:@supabase/supabase-js@2') return {url:'data:text/javascript,export const createClient=()=>globalThis.resetTestClient;',shortCircuit:true};
    return next(specifier,context);
  }});
  t.after(()=>{hooks.deregister();delete globalThis.Deno;delete globalThis.resetTestClient;});
  await import(new URL('../supabase/functions/password-reset/index.ts', import.meta.url).href);
  for (const captchaToken of ['bogus', undefined]) {
    const start = Date.now();
    const response = await handler(new Request('https://example.invalid/reset',{method:'POST',
      headers:{'x-forwarded-for':'192.0.2.1'},body:JSON.stringify({identifier:'qa@example.invalid',captchaToken})}));
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true});
    assert.ok(Date.now()-start >= 350);
  }
  assert.equal(fetch.mock.callCount(),1);
  assert.deepEqual(rpcCalls,[]);
  assert.deepEqual(lookups,[]);
  assert.deepEqual(envReads,['TURNSTILE_SECRET_KEY','TURNSTILE_SECRET_KEY']);
});
