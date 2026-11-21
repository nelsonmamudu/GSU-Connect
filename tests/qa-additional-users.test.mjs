// No network: fake Supabase service exercises planning, sequencing and failure safety.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlan,newLedger,validateLedger,provision} from '../scripts/qa-additional-users.mjs';

const password = 'synthetic-password-for-unit-test-only';
function fakeDb({collision = false, createError = false, wrongMarker = false, wrongStatus = false} = {}) {
  const users = new Map(), profiles = new Map(), created = [];
  return { created, auth:{admin:{
    async createUser(input) {
      created.push(input);
      if (createError) return {error:{message:'fake network error'}};
      const id = `00000000-0000-4000-8000-${String(created.length).padStart(12,'0')}`;
      const user = {id,email:input.email,app_metadata:input.app_metadata};
      users.set(id,user);
      profiles.set(id,{id,matric_no:input.user_metadata.matric_no,role:'student',status:wrongStatus?'approved':'pending',department:input.user_metadata.department,level:input.user_metadata.level});
      return {data:{user},error:null};
    },
    async getUserById(id) {
      const user=users.get(id);
      return {data:{user:wrongMarker?{...user,app_metadata:{qa_fixture:'unexpected'}}:user},error:null};
    },
  }},from(table) {
    assert.equal(table,'profiles');
    return {select() { return {eq(column,value) { return {
      async limit() { assert.equal(column,'matric_no'); return {data:collision?[{id:'collision'}]:[],error:null}; },
      async maybeSingle() { assert.equal(column,'id'); return {data:profiles.get(value),error:null}; },
    }; }}; }};
  }};
}
const saveSnapshots = () => {const snapshots=[]; return {snapshots, save:async ledger=>snapshots.push(structuredClone(ledger))};};

test('plans 100 unique marked identities, separate from existing six', () => {
  const plan=createPlan('0123456789abcdef');
  assert.equal(plan.length,100);
  for (const key of ['matric','email','marker']) assert.equal(new Set(plan.map(x=>x[key])).size,100);
  assert.ok(plan.every(x=>x.state==='planned' && !x.marker.startsWith('gsu-qa-review-v1')));
  assert.throws(()=>createPlan('bad'),/Invalid campaign/);
});

test('pilot creates one pending account, continuation creates 99; inventory records progress without password',async () => {
  const ledger=newLedger('0123456789abcdef'), db=fakeDb(), {save,snapshots}=saveSnapshots();
  assert.equal(await provision({db,ledger,password,save,mode:'pilot'}),1);
  assert.equal(db.created.length,1);
  assert.equal(snapshots[0].accounts[0].state,'attempting');
  assert.equal(snapshots[1].accounts[0].state,'created');
  assert.equal(snapshots[2].accounts[0].state,'verified');
  assert.equal(await provision({db,ledger,password,save,mode:'continue'}),100);
  assert.equal(db.created.length,100);
  assert.ok(db.created.every(x=>x.password===password && x.email_confirm && x.user_metadata.requested_role==='student'));
  assert.ok(db.created.every(x=>x.user_metadata.recovery_email.endsWith('@example.invalid')));
  assert.ok(ledger.accounts.every(x=>x.state==='verified'));
  assert.ok(!JSON.stringify(ledger).includes(password));
  assert.equal(await provision({db,ledger,password,save,mode:'continue'}),100);
  assert.equal(db.created.length,100);
});

test('a collision stops before any account write',async () => {
  const ledger=newLedger('0123456789abcdef'), db=fakeDb({collision:true}), {save,snapshots}=saveSnapshots();
  await assert.rejects(provision({db,ledger,password,save,mode:'pilot'}),/collision/);
  assert.equal(db.created.length,0); assert.equal(snapshots.length,0);
});

test('ambiguous creation stops and prevents retry',async () => {
  const ledger=newLedger('0123456789abcdef'), db=fakeDb({createError:true}), {save,snapshots}=saveSnapshots();
  await assert.rejects(provision({db,ledger,password,save,mode:'pilot'}),/outcome needs investigation/);
  assert.equal(ledger.accounts[0].state,'attempting'); assert.equal(snapshots.length,1);
  await assert.rejects(provision({db,ledger,password,save,mode:'pilot'}),/uncertain/);
  assert.equal(db.created.length,1);
});

test('unexpected identity or profile stops after recording created ID',async () => {
  for (const config of [{wrongMarker:true},{wrongStatus:true}]) {
    const ledger=newLedger('0123456789abcdef'), db=fakeDb(config), {save}=saveSnapshots();
    await assert.rejects(provision({db,ledger,password,save,mode:'pilot'}),/verification failed/);
    assert.equal(ledger.accounts[0].state,'created');
    assert.match(ledger.accounts[0].id,/^[0-9a-f-]{36}$/);
    await assert.rejects(provision({db,ledger,password,save,mode:'continue'}),/unverified/);
  }
});

test('continue requires a verified pilot; modified plans are rejected',async () => {
  const ledger=newLedger('0123456789abcdef'), db=fakeDb(), {save}=saveSnapshots();
  await assert.rejects(provision({db,ledger,password,save,mode:'continue'}),/Pilot must be verified/);
  ledger.accounts[0].email='someone@example.com';
  assert.throws(()=>validateLedger(ledger),/does not match/);
  assert.equal(db.created.length,0);
});
