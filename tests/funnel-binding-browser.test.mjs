// Exercises event-listener lifetime in a local browser; no real analytics network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';

test('funnel page lifecycle binding removes both listeners and stale cleanup is harmless',async t=>{
  const server=await createServer({define:{
    'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://fixture.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('fixture-only'),
  },server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});
  await server.listen(); t.after(()=>server.close());
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  t.after(()=>browser.close());
  const page=await browser.newPage({serviceWorkers:'block'}); t.after(()=>page.close());
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/launch-scope.html`);
  const results=await page.evaluate(async()=>{
    const originalWindowAdd=window.addEventListener.bind(window), originalWindowRemove=window.removeEventListener.bind(window);
    const originalDocAdd=document.addEventListener.bind(document), originalDocRemove=document.removeEventListener.bind(document);
    const win=new Set(), doc=new Set();
    window.addEventListener=(type,listener,options)=>{if(type==='pagehide')win.add(listener); return originalWindowAdd(type,listener,options)};
    window.removeEventListener=(type,listener,options)=>{if(type==='pagehide')win.delete(listener); return originalWindowRemove(type,listener,options)};
    document.addEventListener=(type,listener,options)=>{if(type==='visibilitychange')doc.add(listener); return originalDocAdd(type,listener,options)};
    document.removeEventListener=(type,listener,options)=>{if(type==='visibilitychange')doc.delete(listener); return originalDocRemove(type,listener,options)};
    const {bindFunnelFlush}=await import('/src/services/funnel.ts');
    const first=bindFunnelFlush(); const duplicate=bindFunnelFlush();
    const counts=[[win.size,doc.size]];
    duplicate(); first(); counts.push([win.size,doc.size]);
    const second=bindFunnelFlush(); first(); counts.push([win.size,doc.size]);
    second(); counts.push([win.size,doc.size]);
    return counts;
  });
  assert.deepEqual(results,[[1,1],[0,0],[1,1],[0,0]]);
});
