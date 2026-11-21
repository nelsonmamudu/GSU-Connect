// Synthetic isolated database. No network, live schema or real identity data.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(), sql=s=>db.exec(s), query=(s,params)=>db.query(s,params);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
try {
  await sql(`create role anon; create role authenticated;
    create schema auth; create schema phase1_private;
    create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    create function public.is_admin() returns boolean language sql stable as $$
      select current_setting('request.jwt.claims',true)::jsonb->>'role'='admin'
        and current_setting('request.jwt.claims',true)::jsonb->>'aal'='aal2'
    $$;
    create table public.confessions(id uuid primary key, author_id uuid not null);
    create function phase1_private.confession_author(cid uuid) returns uuid language sql security definer set search_path='' as $$select author_id from public.confessions where id=cid$$;
    create function public.confession_author(cid uuid) returns uuid language sql security definer set search_path='' as $$select phase1_private.confession_author(cid)$$;
    grant execute on function public.confession_author(uuid) to authenticated;
    insert into public.confessions values ('${id(1)}','${id(2)}');`);
  await sql(readFileSync(new URL('../../docs/before-launch-checklist/drafts/20261126_confession_author_audit.sql',import.meta.url),'utf8'));
  const act=async(role,aal='aal1',who=3)=>sql(`reset role; set role authenticated; set request.jwt.claims='${JSON.stringify({sub:id(who),role,aal})}'`);
  const lookup=(reason)=>query(`select public.reveal_confession_author($1::uuid,$2::text) as author`,[id(1),reason]);
  await sql('set role anon');
  await assert.rejects(lookup('credible_threat'),/permission denied/);
  await act('student','aal2'); await assert.rejects(lookup('credible_threat'),/Authorized admin required/);
  await act('admin','aal1'); await assert.rejects(lookup('credible_threat'),/Authorized admin required/);
  await act('admin','aal2',4);
  for(const reason of [null,'','casual_curiosity','user names should not be logged']) await assert.rejects(lookup(reason),/Select a serious safety reason/);
  await assert.rejects(query('select public.confession_author($1::uuid)',[id(1)]),/permission denied/);
  await assert.rejects(sql('select * from phase1_private.confession_author_access_log'),/permission denied/);
  for(const reason of ['credible_threat','harassment_or_doxxing','minor_safety','other_serious_safety']) {
    assert.equal((await lookup(reason)).rows[0].author,id(2));
  }
  assert.equal((await query('select public.reveal_confession_author($1::uuid,$2::text) as author',[id(999),'credible_threat'])).rows[0].author,null);
  await sql('reset role');
  const entries=(await query('select confession_id,reviewer_id,reason from phase1_private.confession_author_access_log order by id')).rows;
  assert.equal(entries.length,4);
  assert.ok(entries.every(x=>x.confession_id===id(1)&&x.reviewer_id===id(4)));
  assert.deepEqual(entries.map(x=>x.reason),['credible_threat','harassment_or_doxxing','minor_safety','other_serious_safety']);
  // An audit write failure must not leak an identity.
  await sql('drop table phase1_private.confession_author_access_log');
  await act('admin','aal2',4); await assert.rejects(lookup('credible_threat'),/does not exist/);
  console.log('PASS synthetic confession identity disclosure checks: access, MFA stub, reasons, legacy denial, audit and fail-closed logging.');
} finally { await db.close(); }
