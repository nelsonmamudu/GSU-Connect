// Expected-behavior regressions discovered during the 2026-11-21 audit.
// These tests currently FAIL against the checked-in code; run separately with:
//   npx tsx --test tests/audit-regressions.test.ts
// They use only local fakes, with no live database or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createFunnelBuffer, type FunnelEventRecord} from '../src/utils/funnel';
import {downloadCalendarEventIcs} from '../src/utils/fileHelpers';

test('funnel keeps events added while an earlier batch is sending', async () => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const delivered: string[][] = [];
  const buffer = createFunnelBuffer({send: async (batch: FunnelEventRecord[]) => {
    delivered.push(batch.map(event => event.event));
    await waiting;
  }});
  buffer.push('auth_view');
  const flushing = buffer.flush();
  buffer.push('signup_step_reached');
  release();
  await flushing;
  assert.deepEqual(delivered,[['auth_view']]);
  assert.deepEqual(buffer.peek().map(e=>e.event),['signup_step_reached'],
    'a later event should remain queued until it is sent');
});

test('simultaneous funnel flushes do not send the same batch twice', async () => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const buffer = createFunnelBuffer({send:async () => { calls++; await waiting; }});
  buffer.push('auth_view');
  const one=buffer.flush(), two=buffer.flush();
  release();
  await Promise.all([one,two]);
  assert.equal(calls,1,'the same in-flight batch should not be sent twice');
});

test('calendar export gives a one-hour default duration across midnight', async () => {
  let saved: Blob | undefined;
  const originalCreate=URL.createObjectURL;
  const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  try {
    URL.createObjectURL=((blob: Blob) => {saved=blob; return 'blob:fixture';}) as typeof URL.createObjectURL;
    const link={href:'',download:'',click:()=>{}};
    Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>link,body:{appendChild:()=>{},removeChild:()=>{}}}});
    Object.defineProperty(globalThis,'window',{configurable:true,value:{setTimeout:()=>0}});
    downloadCalendarEventIcs({id:'fixture',title:'Late event',date:'2030-01-30',startTime:'23:30'});
    assert.ok(saved);
    const content=await saved.text();
    assert.match(content,/DTSTART:20300130T233000/);
    assert.match(content,/DTEND:20300131T003000/,
      'an event without an end time should end one hour later, on the next date');
  } finally {
    URL.createObjectURL=originalCreate;
    if(oldDocument) Object.defineProperty(globalThis,'document',oldDocument); else Reflect.deleteProperty(globalThis,'document');
    if(oldWindow) Object.defineProperty(globalThis,'window',oldWindow); else Reflect.deleteProperty(globalThis,'window');
  }
});
