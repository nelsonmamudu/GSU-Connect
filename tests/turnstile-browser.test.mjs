// Uses a clearly labelled widget stand-in and local HTTP mocks, not live credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';

test('mobile entry challenges retry, renew consumed tokens and submit to the correct service',async t=>{
  const server=await createServer({define:{'import.meta.env.VITE_TURNSTILE_SITE_KEY':'"fixture"','import.meta.env.VITE_SUPABASE_URL':'"http://auth.invalid"','import.meta.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});
  await server.listen();t.after(()=>server.close());
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  let loads=0;const calls=[];
  await page.route('**/*',async route=>{
    const req=route.request(), url=new URL(req.url());
    if(url.hostname==='127.0.0.1')return route.continue();
    if(url.hostname==='challenges.cloudflare.com'){
      if(++loads===1)return route.abort();
      return route.fulfill({contentType:'application/javascript',body:`let n=0;window.turnstile={render(el,opts){const id=String(++n);el.dataset.testwidget=id;el.style.cssText='max-width:150px;border:1px solid #888;padding:12px;border-radius:4px';el.textContent='Security check · test widget';opts.callback('test-token-'+id);return id;},remove(){}};`});
    }
    if(url.hostname==='auth.invalid'){
      if(req.method()==='POST')calls.push({path:url.pathname,data:req.postDataJSON()});
      if(url.pathname==='/auth/v1/signup')return route.fulfill({status:400,json:{message:'test signup refused'}});
      if(url.pathname==='/auth/v1/token')return route.fulfill({status:400,json:{message:'Invalid login credentials'}});
      return route.fulfill({json:url.pathname.endsWith('password-reset')?{ok:true}:null});
    }
    return route.abort();
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.locator('#idNumber').fill('qa@example.test');await page.locator('#password').fill('1234567');
  await page.getByRole('button',{name:'try again',exact:true}).click();
  const widget=page.locator('[data-testwidget]');
  const capture=async name=>{await widget.waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);await widget.scrollIntoViewIfNeeded();if(process.env.TURNSTILE_SCREENSHOTS)await page.screenshot({path:`qa-screenshots/batch3c-${name}.png`});};
  await capture('signin');
  const first=await widget.getAttribute('data-testwidget');
  await page.locator('form button[type=submit]').click();await page.getByRole('alert').filter({hasText:/incorrect/i}).waitFor();
  assert.equal(calls.find(c=>c.path==='/auth/v1/token').data.gotrue_meta_security.captcha_token,'test-token-'+first);
  assert.notEqual(await widget.getAttribute('data-testwidget'),first);
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  await page.getByRole('button',{name:'Create Account',exact:true}).first().click();
  await page.getByRole('button',{name:'Lecturer or Staff'}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.locator('#fullName').fill('QA Tester'); await page.locator('#idNumber').fill('STAFF/QA/01');
  await page.locator('#department-picker').click(); await page.getByRole('button',{name:/Other \(Type/}).click();
  await page.getByPlaceholder(/e.g. Registry/).fill('Registry');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.locator('#email').fill('qa@example.test');
  await page.locator('#password').fill('fixture-password');
  await page.locator('#confirmPassword').fill('fixture-password');
  await widget.waitFor(); await widget.scrollIntoViewIfNeeded();
  if(process.env.TURNSTILE_SCREENSHOTS) await page.screenshot({path:'qa-screenshots/batch3c-signup.png'});
  const signup=await widget.getAttribute('data-testwidget'); await page.locator('form button[type=submit]').click();
  await page.getByRole('alert').waitFor(); assert.equal(calls.find(c=>c.path==='/auth/v1/signup').data.gotrue_meta_security.captcha_token,'test-token-'+signup);
  await page.getByRole('button',{name:'Sign In',exact:true}).first().click();await page.getByRole('button',{name:/Forgot your password/}).click();
  await capture('forgot');const last=await widget.getAttribute('data-testwidget');
  await page.locator('#forgotIdentifier').fill('qa@example.test');await page.getByRole('button',{name:'Send Reset Link'}).click();await page.getByText('Check your inbox',{exact:true}).waitFor();
  assert.equal(calls.find(c=>c.path.endsWith('password-reset')).data.captchaToken,'test-token-'+last);
});
