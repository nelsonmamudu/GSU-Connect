import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFunnelBuffer,
  summarizeFunnel,
  type FunnelEventRecord,
} from '../src/utils/funnel';
import {
  filterPending,
  summarizePending,
  type PendingFilter,
} from '../src/utils/pendingQueue';
import { AppTimestamp, type AppUser } from '../src/types';

function user(overrides: Partial<AppUser>): AppUser {
  return {
    uid: 'u1',
    fullName: 'Amina Bello',
    idNumber: 'UG21/CS/1001',
    idNumberNormalized: 'ug21cs1001',
    accountType: 'student',
    department: 'Computer Science',
    level: '200',
    role: 'student',
    status: 'pending',
    ...overrides,
  };
}

test('password strength is advisory and never blocks the 8-character minimum', async () => {
  const { passwordStrength, passwordError } = await import('../src/utils/entryRules');
  assert.equal(passwordError('1234567'), 'Password must be at least 8 characters.');
  assert.equal(passwordError('12345678'), '');
  assert.equal(passwordStrength('').score, 0);
  assert.equal(passwordStrength('abcdefgh').score, 1);
  assert.equal(passwordStrength('Password1!').score, 4);
  assert.equal(passwordStrength('password').score, 0);
});

test('pending queue search matches name, id, email and department', () => {
  const users = [
    user({ uid: 'a', fullName: 'Amina Bello', idNumber: 'UG21/CS/1001', email: 'amina@example.test' }),
    user({ uid: 'b', fullName: 'John Okafor', idNumber: 'UG22/MT/2002', department: 'Mech Eng' }),
  ];
  assert.deepEqual(filterPending(users, { query: 'amina' }).map((u) => u.uid), ['a']);
  assert.deepEqual(filterPending(users, { query: 'UG22/MT' }).map((u) => u.uid), ['b']);
  assert.deepEqual(filterPending(users, { query: 'mech' }).map((u) => u.uid), ['b']);
  assert.equal(filterPending(users, { query: '   ' }).length, 2);
});

test('pending queue filters by role, invite and proof evidence', () => {
  const users = [
    user({ uid: 'student', accountType: 'student' }),
    user({ uid: 'staff', accountType: 'staff' }),
    user({ uid: 'invited', invited: true }),
    user({ uid: 'proof', proofMethod: 'Uploaded document' }),
  ];
  const ids = (filter: PendingFilter) => filterPending(users, { filter }).map((u) => u.uid).sort();
  assert.deepEqual(ids('all'), ['invited', 'proof', 'staff', 'student']);
  assert.deepEqual(ids('students'), ['invited', 'proof', 'student']);
  assert.deepEqual(ids('staff'), ['staff']);
  assert.deepEqual(ids('invited'), ['invited']);
  assert.deepEqual(ids('no-proof'), ['invited', 'staff', 'student']);
});

test('pending queue sorts by recency, name and department', () => {
  const users = [
    user({ uid: 'new', fullName: 'Zara', department: 'Zoo', createdAt: AppTimestamp.fromMillis(3000) }),
    user({ uid: 'old', fullName: 'Amina', department: 'Apple', createdAt: AppTimestamp.fromMillis(1000) }),
  ];
  assert.deepEqual(filterPending(users, { sort: 'newest' }).map((u) => u.uid), ['new', 'old']);
  assert.deepEqual(filterPending(users, { sort: 'oldest' }).map((u) => u.uid), ['old', 'new']);
  assert.deepEqual(filterPending(users, { sort: 'name' }).map((u) => u.uid), ['old', 'new']);
  assert.deepEqual(filterPending(users, { sort: 'department' }).map((u) => u.uid), ['old', 'new']);
});

test('pending summary counts the queue and the oldest wait', () => {
  const summary = summarizePending([
    user({ uid: 'a', accountType: 'student', createdAt: AppTimestamp.fromMillis(Date.now() - 2 * 3_600_000) }),
    user({ uid: 'b', accountType: 'staff', createdAt: AppTimestamp.fromMillis(Date.now() - 5 * 3_600_000) }),
    user({ uid: 'c', invited: true, proofMethod: 'Staff ID photo' }),
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.students, 2);
  assert.equal(summary.staff, 1);
  assert.equal(summary.invited, 1);
  assert.equal(summary.withoutProof, 2);
  assert.equal(summary.oldestWaitingHours, 5);
});

test('funnel buffer is bounded and drops the oldest events', () => {
  const buffer = createFunnelBuffer({ maxBufferSize: 3, now: () => 0 });
  buffer.push('auth_view');
  buffer.push('signup_step_reached');
  buffer.push('signup_submitted');
  buffer.push('status_gate_view');
  assert.equal(buffer.size(), 3);
  assert.deepEqual(buffer.peek().map((e) => e.event), [
    'signup_step_reached',
    'signup_submitted',
    'status_gate_view',
  ]);
});

test('funnel flush clears on success and keeps the batch on failure', async () => {
  let received: FunnelEventRecord[] = [];
  const ok = createFunnelBuffer({ send: async (batch) => { received = batch; } });
  ok.push('auth_view');
  ok.push('auth_error', { message: 'nope' });
  const flushed = await ok.flush();
  assert.equal(flushed.length, 2);
  assert.equal(ok.size(), 0);
  assert.equal(received.length, 2);

  const failing = createFunnelBuffer({ send: async () => { throw new Error('offline'); } });
  failing.push('auth_view');
  assert.deepEqual(await failing.flush(), []);
  assert.equal(failing.size(), 1, 'failed batch is retained for a later flush');
});

test('funnel summary derives conversion ratios without dividing by zero', () => {
  const summary = summarizeFunnel([
    { event: 'signup_step_reached' },
    { event: 'signup_step_reached' },
    { event: 'signup_submitted' },
    { event: 'proof_upload_started' },
    { event: 'proof_upload_succeeded' },
    { event: 'proof_upload_started' },
  ]);
  assert.equal(summary.total, 6);
  assert.equal(summary.counts.signup_step_reached, 2);
  assert.equal(summary.rates.signupCompletion, 0.5);
  assert.equal(summary.rates.proofUploadSuccess, 0.5);
  assert.equal(summarizeFunnel([]).rates.signupCompletion, null);
});
