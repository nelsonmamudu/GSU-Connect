import test from 'node:test';
import assert from 'node:assert/strict';
import {createFunnelBuffer, sanitizeFunnelEvents, type FunnelEventRecord} from '../src/utils/funnel';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {resolve=yes; reject=no;});
  return {promise,resolve,reject};
}
const names = (rows:FunnelEventRecord[]) => rows.map(row => row.event);

test('failure restores unsent events in order without discarding later additions', async () => {
  const gate=deferred(); let sends=0; const delivered:string[][]=[];
  const b=createFunnelBuffer({send:batch=>{sends++; delivered.push(names(batch)); return sends===1?gate.promise:Promise.resolve();}});
  b.push('auth_view'); const first=b.flush();
  await Promise.resolve();
  b.push('signup_step_reached');
  const second=b.flush();
  assert.equal(sends,1);
  gate.reject(new Error('offline'));
  assert.deepEqual(await first,[]); assert.deepEqual(await second,[]);
  assert.deepEqual(names(b.peek()),['auth_view','signup_step_reached']);
  assert.deepEqual(names(await b.flush()),['auth_view','signup_step_reached']);
  assert.deepEqual(delivered,[['auth_view'],['auth_view','signup_step_reached']]);
  assert.equal(b.size(),0);
});

test('failed batch and concurrent events are bounded together, newest first retained', async () => {
  const gate=deferred();
  const b=createFunnelBuffer({maxBufferSize:2,send:()=>gate.promise});
  b.push('auth_view'); b.push('auth_error');
  const f=b.flush(); await Promise.resolve();
  b.push('signup_step_reached'); b.push('signup_submitted');
  gate.reject(new Error('offline')); await f;
  assert.deepEqual(names(b.peek()),['signup_step_reached','signup_submitted']);
});

test('clear during a failed send does not resurrect cleared events',async () => {
  const gate=deferred(); const b=createFunnelBuffer({send:()=>gate.promise});
  b.push('auth_view'); const f=b.flush(); await Promise.resolve();
  b.clear(); b.push('signup_submitted'); gate.reject(new Error('offline')); await f;
  assert.deepEqual(names(b.peek()),['signup_submitted']);
});

test('synchronous errors retain data and zero capacity stays empty',async () => {
  const b=createFunnelBuffer({send:()=>{throw new Error('offline');}});
  b.push('auth_view'); assert.deepEqual(await b.flush(),[]); assert.equal(b.size(),1);
  const empty=createFunnelBuffer({maxBufferSize:0,send:()=>{throw new Error('must not send');}});
  empty.push('auth_view'); assert.equal(empty.size(),0); assert.deepEqual(await empty.flush(),[]);
  assert.throws(()=>createFunnelBuffer({maxBufferSize:-1}),RangeError);
  assert.throws(()=>createFunnelBuffer({maxBufferSize:1.5}),RangeError);
});

test('an overlapping flush drains newer events after a successful send',async () => {
  const gate=deferred(); let calls=0; const sent:string[][]=[];
  const b=createFunnelBuffer({send:batch=>{sent.push(names(batch)); calls++; return calls===1?gate.promise:Promise.resolve();}});
  b.push('auth_view'); const one=b.flush(); await Promise.resolve();
  b.push('signup_submitted'); const overlap=b.flush();
  gate.resolve(); await Promise.all([one,overlap]);
  assert.deepEqual(names(b.peek()),[]);
  assert.deepEqual(sent,[['auth_view'],['signup_submitted']]);
});

test('events persist across a reload and are restored before sending', async () => {
  let stored: FunnelEventRecord[] = [];
  const first = createFunnelBuffer({persist:{save:pending=>{stored=pending;}},send:()=>{throw new Error('offline');}});
  first.push('auth_view'); first.push('signup_submitted');
  assert.deepEqual(names(stored),['auth_view','signup_submitted']);
  assert.deepEqual(await first.flush(),[]);
  assert.deepEqual(names(stored),['auth_view','signup_submitted'],'a failed batch stays persisted');
  const sent: string[][] = [];
  const second = createFunnelBuffer({persist:{load:()=>stored,save:pending=>{stored=pending;}},send:batch=>{sent.push(names(batch));}});
  assert.deepEqual(names(second.peek()),['auth_view','signup_submitted']);
  await second.flush();
  assert.deepEqual(sent,[['auth_view','signup_submitted']]);
  assert.deepEqual(stored,[],'acknowledged events are removed from storage');
});

test('an in-flight batch is still persisted while the request is outstanding', async () => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let stored: FunnelEventRecord[] = [];
  const b = createFunnelBuffer({persist:{save:pending=>{stored=pending;}},send:()=>waiting});
  b.push('auth_view');
  const flushing = b.flush();
  assert.deepEqual(names(stored),['auth_view'],'the batch must survive a page close mid-request');
  assert.equal(b.size(),0);
  release();
  await flushing;
  assert.deepEqual(stored,[]);
});

test('malformed or unknown persisted events are discarded', () => {
  const restored = sanitizeFunnelEvents([
    {event:'auth_view',at:1},
    {event:'not_a_real_event',at:2},
    {nope:true},
    null,
    'text',
    {event:'signup_submitted',at:'later',meta:[1,2]},
  ]);
  assert.deepEqual(restored.map(row=>row.event),['auth_view','signup_submitted']);
  const second = restored[1];
  assert.ok(second);
  assert.equal(typeof second.at === 'number' && second.at > 0,true);
  assert.deepEqual(second.meta,{});
  assert.equal(second.subject,null);
});
