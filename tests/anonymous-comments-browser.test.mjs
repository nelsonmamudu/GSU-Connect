// Synthetic component/browser tests. Every RPC is intercepted; no live service.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';
const post='00000000-0000-4000-8000-000000000010';
const comment='00000000-0000-4000-8000-000000000011';
const account='00000000-0000-4000-8000-000000000012';

test('anonymous comment and moderation workflows use privacy-safe RPCs',async t=>{
  const server=await createServer({define:{
    'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://fixture.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('fixture-only'),
  },server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});
  await server.listen();t.after(()=>server.close());
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});t.after(()=>browser.close());
  for(const isAdmin of [false,true]) await t.test(isAdmin?'moderator':'student',async t=>{
    const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});t.after(()=>page.close());
    const requests=[];let submitted=false,reportSent=false,reviewed=false;
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='127.0.0.1')return route.continue();
      if(url.hostname!=='fixture.invalid')return route.abort();
      const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST, OPTIONS'};
      if(route.request().method()==='OPTIONS')return route.fulfill({status:200,headers,json:null});
      const rpc=url.pathname.split('/').pop();let result=null;
      if(route.request().method()==='POST') requests.push({rpc,body:route.request().postDataJSON()});
      if(rpc==='can_use_anonymous_pilot')result=!page.url().includes('pilot=denied');
      if(rpc==='my_confessions')result=[];
      if(rpc==='list_anonymous_comments')result=[{id:comment,body:'Hello classmates',status:'approved',created_at:'2026-11-21T00:00:00Z',author_id:account,full_name:'Hidden Fixture Identity'},...(submitted?[{id:'00000000-0000-4000-8000-000000000013',body:'My anonymous reply',status:'pending',created_at:'2026-11-21T01:00:00Z'}]:[])];
      if(rpc==='submit_anonymous_comment'){submitted=true;result='00000000-0000-4000-8000-000000000013';}
      if(rpc==='report_anonymous_comment'){reportSent=true;}
      if(rpc==='list_anonymous_comment_review')result=reviewed?[]:[{id:comment,post_id:post,body:'Needs review',status:'pending',created_at:'2026-11-21T00:00:00Z',open_reports:0,report_reasons:[]}];
      if(rpc==='review_anonymous_comment')reviewed=true;
      if(rpc==='reveal_anonymous_comment_author')result=account;
      return route.fulfill({status:200,headers,json:result});
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/anonymous-comments.html${isAdmin?'?admin':''}`);
    await page.getByRole('button',{name:'Comments',exact:true}).click();
    const section=page.getByRole('region',{name:'Anonymous comments'});
    await section.getByText('Hello classmates').waitFor();
    assert.equal(await section.getByText('Hidden Fixture Identity').count(),0);
    assert.equal(await section.getByText(account).count(),0);
    assert.match(await section.innerText(),/Admins can identify authors/);
    if(!isAdmin){
      await section.getByLabel('Add an anonymous comment').fill('My anonymous reply');
      await section.getByRole('button',{name:'Submit for review'}).click();
      await section.getByText('Comment submitted for review. Only you can see it while it is pending.').waitFor();
      await section.getByText('My anonymous reply').waitFor();
      assert.equal(submitted,true);
      assert.ok(requests.some(x=>x.rpc==='submit_anonymous_comment'&&x.body.p_post===post&&x.body.p_body==='My anonymous reply'));
      await section.getByLabel('Report comment').selectOption('threat');
      await section.getByRole('button',{name:'Send report'}).click();
      await section.getByText('Report sent for review.').waitFor();
      assert.equal(reportSent,true);
      assert.ok(requests.some(x=>x.rpc==='report_anonymous_comment'&&x.body.p_comment===comment&&x.body.p_reason==='threat'));
      assert.equal(await page.getByRole('button',{name:'Open comment moderation'}).count(),0);
    } else {
      await page.getByRole('button',{name:'Open comment moderation'}).click();
      const review=page.getByRole('region',{name:'Comment moderation'});
      await review.getByText('Needs review').waitFor();
      const reveal=review.getByRole('button',{name:'Look up commenter'});
      assert.equal(await reveal.isDisabled(),true);
      await review.getByLabel('Serious safety case (lookup is recorded)').selectOption('credible_threat');
      await reveal.click();
      await review.getByText(`Account reference: ${account}`).waitFor();
      assert.ok(requests.some(x=>x.rpc==='reveal_anonymous_comment_author'&&x.body.p_reason==='credible_threat'));
      await review.getByRole('button',{name:'Approve',exact:true}).click();
      await review.getByText('No pending or reported comments.').waitFor();
      assert.ok(requests.some(x=>x.rpc==='review_anonymous_comment'&&x.body.p_decision==='approve'));
    }

  await t.test('a non-pilot account sees no comments and cannot submit',async t=>{
    const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});t.after(()=>page.close());
    const requests=[];
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='127.0.0.1')return route.continue();
      if(url.hostname!=='fixture.invalid')return route.abort();
      const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST, OPTIONS'};
      if(route.request().method()==='OPTIONS')return route.fulfill({status:200,headers,json:null});
      const rpc=url.pathname.split('/').pop();
      if(route.request().method()==='POST')requests.push(rpc);
      const result=rpc==='can_use_anonymous_pilot'?false:rpc==='my_confessions'?[]:null;
      return route.fulfill({status:200,headers,json:result});
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/anonymous-comments.html`);
    await page.getByRole('button',{name:'Comments',exact:true}).click();
    const section=page.getByRole('region',{name:'Anonymous comments'});
    await section.getByText('Comments are limited to invited pilot participants').waitFor();
    assert.equal(await section.getByLabel('Add an anonymous comment').count(),0);
    assert.equal(requests.includes('list_anonymous_comments'),false);
    assert.equal(requests.includes('submit_anonymous_comment'),false);
  });
  });
});
