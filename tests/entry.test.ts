import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from "node:fs";
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

import {validateGraduate, graduateError, passwordError, chooseLevelMessage, clearLevelWarning, levelDifference} from '../src/utils/entryRules';
import {levelsForDuration} from '../src/types';

test('only Class of 2026 is graduate; 500 is available only for sufficiently long programmes', () => {
  validateGraduate('student','Class of 2026',true,2026);
  validateGraduate('student','500',false);
  for (const args of [['Class of 2025',true,2025],['Class of 2026',false,undefined],['500',true,2026]] as const) {
    assert.throws(()=>validateGraduate('student',args[0],args[1],args[2]),{message:graduateError});
  }
  assert.equal(levelsForDuration(4).includes('500'),false);
  assert.equal(levelsForDuration(5).includes('500'),true);
});
test('signup and reset password policy rejects seven and accepts eight characters', () => {
  assert.equal(passwordError('1234567'),'Password must be at least 8 characters.');
  assert.equal(passwordError('12345678'),'');
});
test('choosing a level clears only that card’s level warning and flags a changed level', () => {
  const warning={uid:'student',text:chooseLevelMessage};
  assert.equal(clearLevelWarning(warning,'student','300'),null);
  assert.equal(clearLevelWarning(warning,'other','300'),warning);
  assert.equal(clearLevelWarning(warning,'student',''),warning);
  assert.equal(levelDifference('200','300'),'Differs from requested level 200');
  assert.equal(levelDifference('200','200'),'');
});

import {proofFileName} from '../src/utils/proof';
test('proof viewer displays only the filename without the storage UUID prefix', () => {
  assert.equal(proofFileName('owner/12345678-1234-1234-1234-123456789abc_registration_form.pdf'),'registration_form.pdf');
  assert.equal(proofFileName('owner/document.pdf'),'document.pdf');
});

import {resetOrigin} from '../supabase/functions/password-reset/redirect';
import {friendlyEntryError, formatAuthError} from '../src/utils/entryErrors';
test('reset mail requires an exact configured HTTPS origin', () => {
  const allowed = 'https://one.example, https://two.example';
  assert.equal(resetOrigin('https://two.example/',allowed),'https://two.example/');
  for (const url of ['http://one.example','https://one.example.other','https://user@one.example','https://one.example/path','bad']) assert.equal(resetOrigin(url,allowed),null);
  assert.equal(resetOrigin('https://one.example',undefined),null);
});
test('entry feedback never echoes backend diagnostics, even alongside familiar keywords', () => {
  for(const message of ['SQLSTATE owner/private-document.pdf','Please wait 3 seconds owner/private-document.pdf','duplicate owner/private-document.pdf']) {
    assert.doesNotMatch(formatAuthError(new Error(message)),/owner|SQLSTATE/);
    assert.equal(friendlyEntryError(new Error(message),'Could not submit.'),'Could not submit.');
  }
});

test('password-reset generates recovery links through the Auth admin API', () => {
  const source = readFileSync(new URL('../supabase/functions/password-reset/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.auth\s*\.generateLink\s*\(/);
  assert.match(source, /\.auth\s*\.admin\s*\.generateLink\s*\(/);
});
