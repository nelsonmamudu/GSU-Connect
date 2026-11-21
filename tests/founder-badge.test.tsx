// Local-only checks for the Founder tag. No live RPC or profile data is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoleBadge } from '../src/components/RoleBadge';

test('the founder tag replaces the admin label and cannot be a user role', () => {
  const founder = renderToStaticMarkup(<RoleBadge role="admin" founder />);
  assert.match(founder, />Founder</);
  assert.doesNotMatch(founder, />Admin</);
  const types = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');
  assert.match(types, /export type UserRole = 'admin' \| 'classRep' \| 'deptHelper' \| 'lecturer' \| 'student';/);
  assert.match(types, /admin: 'Admin',/);
  assert.doesNotMatch(types, /founder:\s*'Founder'/);
});

test('founder identity comes only from server checks and fails closed', () => {
  const service = readFileSync(new URL('../src/services/founder.ts', import.meta.url), 'utf8');
  assert.match(service, /rpc\('founder_account'\)/);
  assert.match(service, /rpc\('elevated_workspace_access'\)/);
  assert.match(service, /if \(error\) return null/);
  const sql = readFileSync(
    new URL('../docs/before-launch-checklist/drafts/20261130_founder_badge.sql', import.meta.url),
    'utf8'
  );
  assert.match(sql, /revoke all on function public\.founder_account\(\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.founder_account\(\) to authenticated/);
  assert.doesNotMatch(sql, /insert into phase1_private\.app_owner/i);
  for (const file of ['ProfileView', 'UserProfileModal', 'PeopleView']) {
    const source = readFileSync(new URL(`../src/components/${file}.tsx`, import.meta.url), 'utf8');
    assert.match(source, /founder=/, `${file} should render the server-derived tag`);
    assert.doesNotMatch(source, /localStorage[^\n]*founder/i);
  }
});
