// Pure call-state regressions: labels must not claim audio before it exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeCallConnection, isCallAudioLive } from '../src/utils/callStatus';

const base = { isCaller: true, accepting: false, offerPublished: true };

test('an accepted signalling row is not shown as a connected call', () => {
  assert.equal(describeCallConnection('accepted', 'connecting', base), 'Connecting audio...');
  assert.equal(describeCallConnection('accepted', 'idle', base), 'Connecting audio...');
  assert.equal(describeCallConnection('accepted', 'connected', base), 'Connected');
});

test('failures and drops are described truthfully', () => {
  assert.equal(describeCallConnection('accepted', 'failed', base), 'Audio connection failed');
  assert.equal(describeCallConnection('accepted', 'disconnected', base), 'Audio disconnected');
  assert.equal(describeCallConnection('ringing', 'failed', base), 'Call connection failed');
  assert.equal(describeCallConnection('ringing', 'idle', { ...base, offerPublished: false }), 'Calling...');
  assert.equal(describeCallConnection('ringing', 'idle', base), 'Ringing...');
  assert.equal(
    describeCallConnection('ringing', 'idle', { ...base, isCaller: false }),
    'Incoming voice call...'
  );
  assert.equal(
    describeCallConnection('ringing', 'idle', { ...base, accepting: true }),
    'Connecting...'
  );
  assert.equal(describeCallConnection('declined', 'idle', base), 'Call declined');
  assert.equal(describeCallConnection('missed', 'idle', base), 'No answer');
  assert.equal(describeCallConnection('ended', 'idle', base), 'Call ended');
});

test('only accepted audio with a live peer connection counts as connected time', () => {
  assert.equal(isCallAudioLive('accepted', 'connected'), true);
  assert.equal(isCallAudioLive('accepted', 'connecting'), false);
  assert.equal(isCallAudioLive('accepted', 'failed'), false);
  assert.equal(isCallAudioLive('ringing', 'connected'), false);
  assert.equal(isCallAudioLive('ended', 'connected'), false);
});
