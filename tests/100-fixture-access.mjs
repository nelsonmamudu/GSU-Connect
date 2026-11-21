// 100 synthetic actors in an isolated in-memory database, NOT Supabase Auth accounts.
// This only tests a synthetic phase-1 schema and migration. No network, UI, or live data.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite(), sql=s=>db.exec(s), id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1010), student=id(9001), staff=id(9002), chat=id(9003);
const extras='polls calls message_reports confessions confession_upvotes events announcements lecturer_radars resources statuses marketplace_listings rides_errands'.split(' ');
await sql(`create role authenticated;create role anon;create schema auth;create schema storage;
create table auth.sessions(id uuid primary key,user_id uuid);create table auth.refresh_tokens(session_id uuid references auth.sessions(id) on delete cascade);create table auth.mfa_factors(user_id uuid,factor_type text,status text);
create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
create table public.profiles(id uuid primary key,role text,status text,department text,level text,expires_at timestamptz,matric_no text,staff_id text,id_card_path text,rejection_reason text,assigned_reviewer_id uuid,updated_at timestamptz,full_name text,photo_url text,avatar_id text,last_seen timestamptz,study_courses text[],study_bio text,is_alumni boolean,is_exempt boolean,verify_deadline timestamptz,alumni_verified_at timestamptz,created_at timestamptz);
create table public.chats(id uuid);create table public.chat_members(chat_id uuid,user_id uuid);create table public.messages(chat_id uuid,media_url text);
create table storage.objects(bucket_id text,name text); create table storage.buckets(id text,public boolean);
create function public.can_access_chat(cid uuid) returns boolean language sql stable security definer as $$select exists(select from public.chat_members where chat_id=cid and user_id=auth.uid())$$;
create function public.can_review(target uuid) returns boolean language sql as $$select false$$;
create view public.public_profiles as select id from public.profiles where id=auth.uid() or can_review(id);
create function public.my_dms() returns table(chat_id uuid) language sql security definer as $$select chat_id from public.chat_members where user_id=auth.uid()$$;
create policy chat_read on public.messages for select using (can_access_chat(chat_id));
alter table storage.objects enable row level security;
create policy chat_file_read on storage.objects for select using(case when bucket_id='chat-files' then can_access_chat(split_part(name,'/',1)::uuid) else false end);
${extras.map(t=>`create table public.${t}(id uuid);`).join('')}
grant usage on schema auth,storage to authenticated;grant select on public.messages,public.public_profiles,storage.objects,public.profiles to authenticated;
insert into public.messages values('${chat}','${chat}/note'); insert into storage.objects values ('chat-files','${chat}/note');
insert into auth.mfa_factors values('${owner}','totp','verified');`);

const roles=['student','student','student','student','class_rep','class_rep','dept_helper','student','admin','admin'];
for(let i=1;i<=100;i++) {
  const kind=(i-1)%10, uid=id(1000+i), session=id(2000+i);
  const status=['pending','rejected','suspended'][kind] || 'approved';
  await sql(`insert into profiles(id,status,role,department,level) values('${uid}','${status}','${roles[kind]}','CS','200');
    insert into auth.sessions values('${session}','${uid}');
    insert into auth.refresh_tokens values('${session}');`);
  if(kind!==7) await sql(`insert into chat_members values('${chat}','${uid}')`);
}
for(const [who,role] of [[student,'student'],[staff,'lecturer']]) await sql(`insert into profiles(id,status,role,department,level,matric_no,staff_id,id_card_path) values('${who}','pending','${role}','CS','200','m',${role==='student'?'null':"'staff1'"},'${who}/proof'); insert into storage.objects values('id-cards','${who}/proof')`);
const migration=readFileSync(new URL('../supabase/migrations/20261119_phase1_access.sql',import.meta.url),'utf8');
await sql(`set gsu.verified_owner_id='${owner}'`); await sql(migration);
await sql(`insert into phase1_private.cohorts values('${student}','cs','200')`);
for(let i=1;i<=100;i++) {
  const kind=(i-1)%10;
  if(kind===4 || kind===5) await sql(`insert into phase1_private.cohorts values('${id(1000+i)}','cs','${kind===4?'100':'200'}')`);
}
async function rows(q){return (await db.query(q)).rows.length>0}
async function approve(target){await sql('begin'); try { await sql(`select review_signup('${target}','approved',null)`); return true; } catch(e) { if(!e.message.includes('Review not permitted')) throw e; return false; } finally { await sql('rollback'); }}
let checks=0;
for(let i=1;i<=100;i++) {
  const kind=(i-1)%10, uid=id(1000+i), session=id(2000+i);
  const claim={sub:uid,session_id:session,aal:kind===9?'aal2':'aal1',amr:[{method:kind===9?'totp':'password'}]};
  await sql(`set role authenticated; set request.jwt.claims='${JSON.stringify(claim)}'`);
  const member=kind>=3 && kind!==7, reviewer=[5,6,9].includes(kind), admin=kind===9;
  const actual=[await rows('select * from messages'),await rows("select * from storage.objects where bucket_id='chat-files'"),await rows(`select * from public_profiles where id='${student}'`),await approve(student),await approve(staff),await rows(`select * from public_profiles where id='${staff}'`)];
  assert.deepEqual(actual,[member,member,reviewer,reviewer,admin,admin],`actor ${i}, category ${kind+1}`);
  checks+=actual.length;
  await sql('reset role');
}
console.log(`PASS: 100 synthetic actor profiles, 10 repeated categories, ${checks} access checks; in-memory phase-1 schema/migration only.`);
await db.close();
