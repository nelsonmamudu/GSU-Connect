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
