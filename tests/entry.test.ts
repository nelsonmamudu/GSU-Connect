import test from 'node:test';
import assert from 'node:assert/strict';
import { extractProofFields } from '../src/utils/proof';

test('only labelled identity fields, no levels/sessions or guesses from course lists', () => {
  const dept = ['Computer Science'];
  assert.deepEqual(
    extractProofFields(
      'Full Name: Amina Bello Musa\nRegistration Number: UG21/CS/1001\nDepartment: Computer Science\nLevel: 500\nSession: 2018/2019',
      dept,
    ),
    { name: 'Amina Bello Musa', matric: 'UG21/CS/1001', department: 'Computer Science' },
  );
  for (const text of [
    'Courses: Computer Science',
    'Department: Computer Science or Mathematics',
    'Programme of study: Computing',
    'Level: 400',
    'Faculty: Science',
  ])
    assert.equal(extractProofFields(text, dept).department, undefined);
});

import {prepareReviewProof, noFileMessage} from '../src/utils/prepareReviewProof';
test('missing file and oversized PDF give actionable errors without compressing a PDF', async () => {
  await assert.rejects(prepareReviewProof(), {message:noFileMessage});
  const pdf = new File([new Uint8Array(3*1024*1024+1)],'large.pdf',{type:'application/pdf'});
  await assert.rejects(prepareReviewProof(pdf), /PDF exceeds the 3 MB limit/);
  const small = new File(['pdf'],'small.pdf',{type:'application/pdf'});
  assert.equal(await prepareReviewProof(small),small);
});
test('oversized phone image is compressed before the server size check; reject an oversized result', async () => {
  const photo = new File([new Uint8Array(4*1024*1024)],'large.jpg',{type:'image/jpeg'});
  const compressed = new File(['jpeg'],'proof.jpg',{type:'image/jpeg'});
  assert.equal(await prepareReviewProof(photo, async () => compressed),compressed);
  await assert.rejects(prepareReviewProof(photo, async () => photo), /under 1 MB/);
});
