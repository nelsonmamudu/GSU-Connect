// Run npm run test:signin with Playwright Chromium installed, or set CHROMIUM_PATH.
// The real form and SDK run in Chromium; the only Auth server is a local test double.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer as httpServer} from 'node:http';
import {once} from 'node:events';
import {chromium} from 'playwright-core';
import {createServer as viteServer} from 'vite';

test('Sign In submits a six-character password to Auth without browser validation blocking it', async t => {
  const received = [];
  const auth = httpServer(async (req,res) => {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    res.setHeader('Content-Type','application/json');
    if (req.method === 'POST' && req.url === '/auth/v1/token?grant_type=password') {
      let body = ''; for await (const part of req) body += part;
      received.push(JSON.parse(body));
      return res.writeHead(400).end(JSON.stringify({message:'Invalid login credentials'}));
    }
    if (req.url === '/rest/v1/rpc/resolve_login') return res.end(JSON.stringify('legacy-mapping@example.test'));
    res.end('null');
  });
  auth.listen(0,'127.0.0.1'); await once(auth,'listening');
  t.after(()=>auth.close());
  const server = await viteServer({define:{
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(`http://127.0.0.1:${auth.address().port}`),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only'),
  }, server:{port:0,host:'127.0.0.1',hmr:false},logLevel:'error'});
  await server.listen(); t.after(()=>server.close());
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  t.after(()=>browser.close());
  const page = await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  await page.route('**/*',route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  const pw = page.locator('#password');
  await page.getByLabel('Matric number or staff ID').fill('08031234567');
  await pw.fill('123456');
  await page.locator('form button[type=submit]').click();
  await page.getByRole('alert').filter({hasText:'Please enter a valid matric number'}).waitFor();
  assert.equal(received.length,0);
  await page.reload();
  await page.locator('#idNumber').fill('UG25/QAT/9101');
  assert.equal(await pw.getAttribute('minlength'),null);
  assert.equal(await pw.evaluate(el=>el.required),true);
  if (process.env.SIGNIN_SCREENSHOT) {
    await pw.fill('1234567');
    await page.screenshot({path:process.env.SIGNIN_SCREENSHOT});
  }
  await pw.fill('123456');
  await page.locator('form button[type=submit]').click();
  await page.getByRole('alert').filter({hasText:/incorrect/i}).waitFor();
  assert.equal(received.length,1);
  assert.equal(received[0].email,'legacy-mapping@example.test');
  assert.equal(received[0].password,'123456');
});
