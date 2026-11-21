// Expected-behavior regressions discovered during the 2026-11-21 audit.
// Run separately with: npx tsx --test tests/audit-regressions.test.ts
// Regressions for funnel concurrency and calendar midnight rollover.
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
  const saved: Blob[] = [];
  const originalCreate=URL.createObjectURL;
  const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  try {
    URL.createObjectURL=((blob: Blob) => {saved.push(blob); return 'blob:fixture';}) as typeof URL.createObjectURL;
    const link={href:'',download:'',click:()=>{}};
    Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>link,body:{appendChild:()=>{},removeChild:()=>{}}}});
    Object.defineProperty(globalThis,'window',{configurable:true,value:{setTimeout:()=>0}});
    for (const [date, startTime, expectedStart, expectedEnd] of [
      ['2030-01-30', '23:30', '20300130T233000', '20300131T003000'],
      ['2030-01-31', '23:30', '20300131T233000', '20300201T003000'],
      ['2030-12-31', '23:15', '20301231T231500', '20310101T001500'],
      ['2028-02-28', '23:59', '20280228T235900', '20280229T005900'],
      ['2030-01-30', '09:15', '20300130T091500', '20300130T101500'],
    ]) {
      downloadCalendarEventIcs({id:'fixture',title:'Event',date,startTime});
      const blob=saved.pop();
      assert.ok(blob);
      const content=await blob.text();
      assert.ok(content.includes(`DTSTART:${expectedStart}\r\n`));
      assert.ok(content.includes(`DTEND:${expectedEnd}\r\n`), `wrong default end for ${date} ${startTime}`);
    }
    downloadCalendarEventIcs({id:'fixture',title:'Explicit end',date:'2030-01-30',startTime:'09:15',endTime:'11:30'});
    const explicitEnd=saved.pop();
    assert.ok(explicitEnd);
    assert.match(await explicitEnd.text(),/DTEND:20300130T113000/);
  } finally {
    URL.createObjectURL=originalCreate;
    if(oldDocument) Object.defineProperty(globalThis,'document',oldDocument); else Reflect.deleteProperty(globalThis,'document');
    if(oldWindow) Object.defineProperty(globalThis,'window',oldWindow); else Reflect.deleteProperty(globalThis,'window');
  }
});
