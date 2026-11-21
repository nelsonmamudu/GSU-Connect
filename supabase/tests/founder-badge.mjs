// Disposable PGlite fixture for the draft founder badge lookup.
// It does not test production grants, Auth, MFA or the deployed schema.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite(), exec=s=>db.exec(s), query=(s,args=[])=>db.query(s,args);
const owner='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
try {
  await exec(`create role anon;create role authenticated;create schema auth;create schema phase1_private;
    create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    create table public.profiles(id uuid primary key, role text not null, status text not null, expires_at timestamptz);
    insert into public.profiles values('${owner}','admin','approved',null),('${other}','student','approved',null);
    create table phase1_private.app_owner(singleton boolean primary key default true check(singleton), account uuid unique not null references public.profiles(id) on delete restrict);
    insert into phase1_private.app_owner(account) values('${owner}');
    revoke all on phase1_private.app_owner from public,anon,authenticated;`);
  await exec(readFileSync(new URL('../../docs/before-launch-checklist/drafts/20261130_founder_badge.sql',import.meta.url),'utf8'));
  const act=async who=>exec(`reset role;set role authenticated;set request.jwt.claims='${JSON.stringify({sub:who,role:'admin',aal:'aal2'})}'`);
  await exec('set role anon');
  await assert.rejects(query('select * from public.founder_account()'),/permission denied/);
  await act(other);
  assert.equal((await query('select public.founder_account() as id')).rows[0].id,owner,'any signed-in user sees the same server-derived badge');
  await assert.rejects(query('select * from phase1_private.app_owner'),/permission denied/,'the owner table itself stays private');
  await exec('reset role');
  await query("update public.profiles set status='suspended' where id=$1",[owner]);
  await act(other);
  assert.equal((await query('select public.founder_account() as id')).rows[0].id,null,'a suspended account loses the badge');
  await exec('reset role');
  await query("update public.profiles set status='approved', role='student' where id=$1",[owner]);
  await act(other);
  assert.equal((await query('select public.founder_account() as id')).rows[0].id,null,'the badge requires the protected admin role');
  await exec('reset role');
  await assert.rejects(query('insert into phase1_private.app_owner(account) values($1)',[other]),/duplicate key/,'only one founder row can exist');
  await act(other);
  await assert.rejects(query('update phase1_private.app_owner set account=$1',[other]),/permission denied/,'authenticated cannot rebind the founder');
  await exec('reset role');
  console.log('PASS founder badge fixture: authenticated-only read, single protected row, server-derived identity, suspension/role loss removes badge.');
} finally { await db.close(); }
