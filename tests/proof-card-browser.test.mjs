// Local React component + real client, intercepted Storage/PostgREST requests only.
import assert from 'node:assert/strict';
import test from 'node:test';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';

// Every status-gate state the owner can land in, including the transient
// "checking" state (hasIdCard === null) and the suspended gate.
const STATES = [
  ['pending-attached','pending',true],
  ['pending-empty','pending',false],
  ['rejected-empty','rejected',false],
  ['rejected-attached','rejected',true],
  ['suspended','suspended',false],
];

test('mobile proof card states and transitions', async t => {
  const server = await createServer({define:{
    'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('http://fixture.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('local-only'),
  },server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});
  await server.listen(); t.after(()=>server.close());
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  t.after(()=>browser.close());
  for (const [state,status,attached] of STATES) await t.test(state, async t => {
    const page = await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
    t.after(()=>page.close());
    const id='00000000-0000-4000-8000-000000000076';
    const row={id,status,role:'student',level:'200',department:'QA Test',full_name:'QA Student',matric_no:'UG25/QAT/9104',
      rejection_reason:status==='rejected'?'Submit a replacement proof.':null,
      id_card_path:attached===true?`${id}/12345678-0000-4000-8000-000000000001_registration.pdf`:null};
    await page.addInitScript(profile => {window.fixtureProfile=profile},row);
    const writes=[];
    await page.route('**/*', async route => {
      const path=new URL(route.request().url());
      if(path.hostname==='127.0.0.1') return route.continue();
      if(path.hostname!=='fixture.invalid') return route.abort();
      let data=null;
      if(path.pathname.endsWith('/check_own_entry')) data=row;
      else if(path.pathname.startsWith('/storage/v1/object/id-cards/')) { writes.push('upload'); data={Key:'fixture'}; }
      else if(path.pathname==='/rest/v1/profiles' && route.request().method()==='PATCH') {
        writes.push('attach'); row.id_card_path=route.request().postDataJSON().id_card_path; data={id};
      } else if(path.pathname.endsWith('/resubmit_signup')) {writes.push('submit'); row.status='pending';}
      await route.fulfill({json:data});
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/proof-card.html`);
    const card=page.getByRole('region',{name:'Verification proof'});
    const replace=card.getByRole('button',{name:'Replace file'});
    const choose=card.getByRole('button',{name:status==='rejected'?'Choose replacement':'Choose photo or PDF'});
    const fileInput=card.locator('input[type=file]');
    if(status==='pending') await page.getByRole('heading',{name:attached?'Waiting for Approval':'Finish Verification'}).waitFor();
    if(status==='suspended') {
      await page.getByRole('heading',{name:'Account Suspended'}).waitFor();
      assert.equal(await card.count(),0,'suspended owners get no upload UI');
      assert.equal(await page.getByRole('button',{name:'Check status'}).count(),1);
      return;
    }
    if(attached===true) await card.getByText('registration.pdf',{exact:true}).waitFor();
    if(status==='pending' && attached===true) {
      await replace.waitFor(); assert.equal(await fileInput.count(),0);
    } else if(attached===false) {
      await choose.waitFor(); assert.equal(await replace.count(),0);
    }
    if(status==='rejected' && attached===true) await card.getByText('Upload a replacement to resubmit').waitFor();
    if(status==='pending') {
      await page.getByText('Review timing depends on admin availability').waitFor();
      await page.getByText('Review decision',{exact:true}).waitFor();
    }
    if(process.env.PROOF_SCREENSHOTS && state!=='pending-empty') {
      await card.evaluate(el=>el.scrollIntoView({block:'center'}));
      await page.screenshot({path:`qa-screenshots/batch2d-${state}.png`});
    }
    if(status==='pending' && attached===true) {
      await replace.click(); await choose.waitFor();
      await card.getByRole('button',{name:'Cancel'}).click(); await replace.waitFor();
      assert.equal(await fileInput.count(),0); assert.deepEqual(writes,[]);
      await replace.click();
    }
    if(state==='pending-empty') {
      await page.getByRole('button',{name:'Edit details',exact:true}).last().click();
      const pw=page.getByLabel('Current password');
      await pw.waitFor();
      await page.getByLabel('Recovery email',{exact:true}).fill('qa@example.test');
      await page.getByRole('button',{name:'Save',exact:true}).click();
      assert.equal(await pw.evaluate(el=>el.validity.valueMissing),true);
      await pw.fill('demo-only');
      if(process.env.RECOVERY_SCREENSHOT) {
        await pw.evaluate(el=>el.closest('form').scrollIntoView({block:'center'}));
        await page.screenshot({path:process.env.RECOVERY_SCREENSHOT});
      }
      await page.getByRole('button',{name:'Cancel',exact:true}).click();
    }
    // Every initial state converges on the compact pending card after upload.
    await fileInput.setInputFiles({name:'new-proof.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-test')});
    await page.getByText(status==='rejected'
      ? 'Replacement submitted — your request is back in the review queue.'
      : 'Proof uploaded. Waiting for review.').waitFor();
    await card.getByText('Attached for reviewer verification').waitFor(); await replace.waitFor();
    assert.equal(await fileInput.count(),0);
    assert.deepEqual(writes,status==='rejected'?['upload','attach','submit']:['upload','attach']);
  });
});

test('status gate shows a checking state, not a wrong "Unconfirmed" flash', async t => {
  const server = await createServer({define:{
    'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('http://fixture.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('local-only'),
  },server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});
  await server.listen(); t.after(()=>server.close());
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  t.after(()=>browser.close());
  const page = await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  t.after(()=>page.close());
  const id='00000000-0000-4000-8000-000000000077';
  const row={id,status:'pending',role:'student',level:'200',department:'QA Test',full_name:'QA Student',matric_no:'UG25/QAT/9105'};
  await page.addInitScript(profile => {window.fixtureProfile=profile},row);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/*', async route => {
    const path=new URL(route.request().url());
    if(path.hostname==='127.0.0.1') return route.continue();
    if(path.hostname!=='fixture.invalid') return route.abort();
    if(path.pathname.endsWith('/check_own_entry')) { await gate; return route.fulfill({json:row}); }
    await route.fulfill({json:null});
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/proof-card.html`);
  await page.getByRole('heading',{name:'Checking your status…'}).waitFor();
  await page.getByText('Checking…',{exact:true}).waitFor();
  assert.equal(await page.getByText('Incomplete',{exact:true}).count(),0);
  release();
  await page.getByRole('heading',{name:'Finish Verification'}).waitFor();
  await page.getByText('Incomplete',{exact:true}).waitFor();
});
