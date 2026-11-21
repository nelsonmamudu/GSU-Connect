// Mock-backed component tests, no live services, production data or real sessions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';

test('launch-scope hubs and profile actions on mobile and desktop', async t => {
  const server=await createServer({define:{
    'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://fixture.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('fixture-only'),
  },server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});
  await server.listen(); t.after(()=>server.close());
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  t.after(()=>browser.close());
  for (const [name,viewport] of [['mobile',{width:390,height:844}],['desktop',{width:1280,height:800}]]) {
    await t.test(name,async t=>{
      const page=await browser.newPage({viewport,serviceWorkers:'block'}); t.after(()=>page.close());
      await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/launch-scope.html`);
      await page.getByRole('heading',{name:'Life at GSU'}).waitFor();
      assert.equal(await page.getByRole('button',{name:/marketplace|rides|errands|confessions|gist/i}).count(),0);
      await page.getByRole('button',{name:/View updates/}).click();
      assert.equal(await page.getByLabel('Fixture result').innerText(),'statuses');
      await page.getByRole('button',{name:'Fixture Today'}).click();
      assert.equal(await page.getByText(/marketplace|rides|errands|messages, groups, and calls/i).count(),0);
      await page.getByRole('button',{name:'Open fixture profile'}).click();
      const dialog=page.getByRole('dialog',{name:'Test Classmate profile'});
      await dialog.waitFor();
      assert.equal(await dialog.getByRole('button',{name:'Voice Call'}).count(),0);
      await dialog.getByRole('button',{name:'Message',exact:true}).click();
      assert.equal(await page.getByLabel('Fixture result').innerText(),'message');
      await page.getByRole('button',{name:'Toggle test-only calling'}).click();
      await page.getByRole('button',{name:'Open fixture profile'}).click();
      await dialog.getByRole('button',{name:'Voice Call'}).click();
      assert.equal(await page.getByLabel('Fixture result').innerText(),'call');
      // The feed is only mounted in this synthetic fixture, not in the app shell.
      await page.getByRole('button',{name:'Fixture hidden feed'}).click();
      await page.getByRole('button',{name:'Post Anonymously'}).click();
      const composer=page.getByRole('dialog',{name:'Post Anonymously'});
      await composer.getByText(/Admins can identify you/).waitFor({state:'visible'});
      await composer.getByText(/What you write may also reveal who you are/).waitFor({state:'visible'});
      await page.getByRole('button',{name:'Close modal'}).click();
      const lookups=[]; let failLookup=false, legacyLookups=0;
      const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST, OPTIONS'};
      await page.route('**/rest/v1/rpc/confession_author',route=>{legacyLookups++; return route.fulfill({status:200,headers:cors,json:null});});
      await page.route('**/rest/v1/rpc/reveal_confession_author',route=>{
        if(route.request().method()==='POST') lookups.push(route.request().postDataJSON());
        if(failLookup && route.request().method()==='POST') return route.fulfill({status:404,headers:cors,json:{message:'Lookup unavailable'}});
        return route.fulfill({status:200,headers:cors,json:null});
      });
      await page.getByRole('button',{name:'Fixture admin feed'}).click();
      const lookup=page.getByRole('button',{name:'Look up author'});
      await lookup.waitFor();
      assert.equal(await lookup.isDisabled(),true);
      assert.equal(lookups.length,0);
      await page.getByLabel('Serious safety case (lookup is recorded)').selectOption('credible_threat');
      await lookup.click();
      await page.getByText('Author record is unavailable.').waitFor();
      assert.deepEqual(lookups,[{cid:'00000000-0000-4000-8000-000000000001',safety_reason:'credible_threat'}]);
      failLookup=true;
      await page.getByRole('button',{name:'Lookup again'}).click();
      await page.getByText('Lookup unavailable').waitFor();
      assert.equal(legacyLookups,0,'an unavailable audited lookup must never fall back to the legacy RPC');
    });
  }
});
