// Local React component + real client, intercepted Storage/PostgREST requests only.
import assert from 'node:assert/strict';
import test from 'node:test';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';

test('mobile proof card states and transitions', async t => {
  const server = await createServer({define:{
    'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('http://fixture.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('local-only'),
  },server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});
  await server.listen(); t.after(()=>server.close());
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  t.after(()=>browser.close());
  for (const [state,status,attached] of [
    ['pending-attached','pending',true], ['pending-empty','pending',false],
    ['rejected-empty','rejected',false], ['rejected-attached','rejected',true],
  ]) await t.test(state, async t => {
    const page = await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
    t.after(()=>page.close());
    const id='00000000-0000-4000-8000-000000000076';
    const row={id,status,role:'student',level:'200',department:'QA Test',full_name:'QA Student',matric_no:'UG25/QAT/9104',
      rejection_reason:status==='rejected'?'Submit a replacement proof.':null,
      id_card_path:attached?`${id}/12345678-0000-4000-8000-000000000001_registration.pdf`:null};
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
    const photo=card.getByLabel('Choose photo'), pdf=card.getByLabel('Choose PDF');
    if(status==='pending') await page.getByRole('heading',{name:attached?'Waiting for Approval':'Finish Verification'}).waitFor();
    if(attached) await card.getByText('registration.pdf',{exact:true}).waitFor();
    if(status==='pending' && attached) {
      await replace.waitFor(); assert.equal(await card.locator('input').count(),0);
    } else { await photo.waitFor(); await pdf.waitFor(); assert.equal(await replace.count(),0); }
    if(status==='rejected' && attached) await card.getByText('Upload a replacement to resubmit').waitFor();
    if(process.env.PROOF_SCREENSHOTS && state!=='pending-empty') {
      await card.evaluate(el=>el.scrollIntoView({block:'center'}));
      await page.screenshot({path:`qa-screenshots/batch2d-${state}.png`});
    }
    if(status==='pending' && attached) {
      await replace.click(); await photo.waitFor(); await pdf.waitFor();
      await card.getByRole('button',{name:'Cancel'}).click(); await replace.waitFor();
      assert.equal(await card.locator('input').count(),0); assert.deepEqual(writes,[]);
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
    // State 4: every initial state converges on the compact pending card.
    await pdf.setInputFiles({name:'new-proof.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-test')});
    await page.getByText('Proof uploaded. Waiting for review.').waitFor();
    await card.getByText('Attached for reviewer verification').waitFor(); await replace.waitFor();
    assert.equal(await card.locator('input').count(),0);
    assert.deepEqual(writes,status==='rejected'?['upload','attach','submit']:['upload','attach']);
  });
});
