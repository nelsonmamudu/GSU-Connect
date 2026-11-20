import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/proof-cleanup.js';

test('worker is authenticated and retries failed Storage API deletion before acknowledgement', async () => {
  const prior = globalThis.fetch;
  const paths = ['user/first', 'user/replaced'];
  let ack = false,
    fail = true,
    requests = 0;
  process.env.VITE_SUPABASE_URL = 'https://fixture.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-server-only';
  process.env.CRON_SECRET = 'fixture-secret';
  globalThis.fetch = async (input, init) => {
    requests++;
    const url = String(input);
    if (url.endsWith('/rpc/entry_cleanup_batch'))
      return Response.json(ack ? [] : paths.map((path) => ({ path })));
    if (url.endsWith('/storage/v1/object/id-cards')) {
      assert.equal(init.method, 'DELETE');
      assert.deepEqual(JSON.parse(init.body).prefixes, paths);
      return Response.json(fail ? { message: 'offline' } : [], { status: fail ? 503 : 200 });
    }
    if (url.endsWith('/rpc/entry_cleanup_ack')) {
      assert.deepEqual(JSON.parse(init.body).paths, paths);
      ack = true;
      return Response.json(true);
    }
    throw Error('Unexpected request');
  };
  const run = async (token) => {
    const res = {
      setHeader() {},
      status(n) {
        this.code = n;
        return this;
      },
      end() {},
      json() {},
    };
    await handler({ headers: { authorization: `Bearer ${token}` } }, res);
    return res.code;
  };
  try {
    assert.equal(await run('wrong'), 401);
    assert.equal(requests, 0);
    process.env.ENABLE_PROOF_CLEANUP = 'true';
    process.env.VERCEL_ENV = 'production';
    assert.equal(await run('fixture-secret'), 503);
    assert.equal(requests, 0);
    process.env.VERCEL_ENV = 'development';
    assert.equal(await run('fixture-secret'), 503);
    assert.equal(ack, false);
    fail = false;
    assert.equal(await run('fixture-secret'), 200);
    assert.equal(ack, true);
  } finally {
    globalThis.fetch = prior;
  }
});
