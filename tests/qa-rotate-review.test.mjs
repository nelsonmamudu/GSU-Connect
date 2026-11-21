// Fake Auth/Profile API only: no network or live credential use.
import test from 'node:test';
import assert from 'node:assert/strict';
import {newRotation,validateRotation,rotate} from '../scripts/qa-rotate-review.mjs';
const PASS='synthetic-password-for-unit-tests-only';
function fakeDb({badMarkerAt=0, failedUpdateAt=0, duplicate=false}={}) {
  const plan=newRotation('0123456789abcdef'), users=new Map(), profiles=new Map(), updates=[];
  for (let i=0;i<6;i++) {
    const item=plan.targets[i], id=`00000000-0000-4000-8000-${String(duplicate?1:i+1).padStart(12,'0')}`;
    profiles.set(item.matric,{id,email:item.email,matric_no:item.matric});
    users.set(id,{id,email:item.email,app_metadata:{qa_fixture:i+1===badMarkerAt?'unexpected':item.marker}});
  }
  return {updates, auth:{admin:{
    async getUserById(id){return {data:{user:users.get(id)},error:null};},
    async updateUserById(id,data){updates.push({id,...data});return updates.length===failedUpdateAt?{error:{message:'ambiguous'}}:{data:{user:users.get(id)},error:null};},
  }},from(table){assert.equal(table,'profiles');return {select(){return {eq(column,value){assert.equal(column,'matric_no'); return {async maybeSingle(){return {data:profiles.get(value),error:null}}};}};}};}};
}
const saves=()=>{const snapshots=[];return {snapshots,save:async l=>snapshots.push(structuredClone(l))}};

test('rotation targets exactly six previously marked fixtures',()=>{
  const ledger=newRotation('0123456789abcdef'); validateRotation(ledger);
  assert.equal(ledger.targets.length,6);
  assert.equal(ledger.targets[0].matric,'UG25/QAT/9101');
  assert.equal(ledger.targets[5].matric,'UG25/QAT/9106');
  ledger.targets[0].email='other@example.test';
  assert.throws(()=>validateRotation(ledger),/does not match/);
});
test('preflights all fixtures, tracks each update and never saves the password in inventory',async()=>{
  const ledger=newRotation('0123456789abcdef'), db=fakeDb(), {snapshots,save}=saves();
  assert.equal(await rotate({db,ledger,password:PASS,save}),6);
  assert.equal(db.updates.length,6); assert.ok(db.updates.every(x=>x.password===PASS));
  assert.ok(snapshots[0].targets.every(x=>x.id && x.state==='planned'));
  assert.equal(snapshots[1].targets[0].state,'attempting');
  assert.ok(!JSON.stringify(ledger).includes(PASS));
  assert.equal(await rotate({db,ledger,password:PASS,save}),6); assert.equal(db.updates.length,6);
});
test('an unexpected fixture marker stops before any password update',async()=>{
  const ledger=newRotation('0123456789abcdef'), db=fakeDb({badMarkerAt:6}), {save}=saves();
  await assert.rejects(rotate({db,ledger,password:PASS,save}),/marker or identity/);
  assert.equal(db.updates.length,0);
});
test('an ambiguous update prevents retries instead of changing other accounts',async()=>{
  const ledger=newRotation('0123456789abcdef'), db=fakeDb({failedUpdateAt:2}), {save}=saves();
  await assert.rejects(rotate({db,ledger,password:PASS,save}),/outcome needs investigation/);
  assert.equal(ledger.targets[0].state,'rotated'); assert.equal(ledger.targets[1].state,'attempting');
  await assert.rejects(rotate({db,ledger,password:PASS,save}),/uncertain outcome/);
  assert.equal(db.updates.length,2);
});
