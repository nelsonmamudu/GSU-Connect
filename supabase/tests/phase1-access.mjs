// Isolated PostgreSQL engine, synthetic pre-migration tables/policies and JWT claims.
// Does not contact Supabase or exercise GoTrue, HTTP signing, Realtime or the UI.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite(), sql=s=>db.exec(s), id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(10), student=id(20), staff=id(21), chat=id(30);
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
for(let i=1;i<=10;i++) await sql(`insert into profiles(id,status,role,department,level) values('${id(i)}','${['pending','rejected','suspended'][i-1]||'approved'}','${roles[i-1]}','CS','200');insert into auth.sessions values('${id(i+100)}','${id(i)}');insert into auth.refresh_tokens values('${id(i+100)}');insert into chat_members values('${chat}','${id(i)}')`);
for(const [who,role] of [[student,'student'],[staff,'lecturer']])await sql(`insert into profiles(id,status,role,department,level,matric_no,staff_id,id_card_path,assigned_reviewer_id) values('${who}','pending','${role}','CS','200','m',${role==='student'?'null':"'staff1'"},'${who}/proof','${id(8)}');insert into storage.objects values('id-cards','${who}/proof')`);
const migration=readFileSync(new URL('../migrations/20261119_phase1_access.sql',import.meta.url),'utf8');
await assert.rejects(sql(migration),/confirm owner/);await sql('rollback');
await sql(`set gsu.verified_owner_id='${owner}'`);await sql(migration);
await sql(`insert into phase1_private.cohorts values('${student}','cs','200'),('${id(5)}','cs','100'),('${id(6)}','cs','200')`);
async function as(i){await sql(`set role authenticated;set request.jwt.claims='${JSON.stringify({sub:id(i),session_id:id(i+100),aal:i===10?'aal2':'aal1',amr:[{method:i===10?'totp':'password'}]})}'`)}
async function rows(q){return (await db.query(q)).rows.length>0}
async function approve(target){await sql('begin');try{await sql(`select review_signup('${target}','approved',null)`);return true}catch(e){if(!e.message.includes('Review not permitted'))throw e;return false}finally{await sql('rollback')}}
for(let i=1;i<=10;i++){
 await as(i);const member=i>=4,review=[6,7,10].includes(i);
 const actual=[await rows('select * from messages'),await rows("select * from storage.objects where bucket_id='chat-files'"),await rows(`select * from public_profiles where id='${student}'`),await approve(student),await approve(staff)];
 assert.deepEqual(actual,[member,member,review,review,i===10],`role ${i}`);
 assert.equal(await rows(`select * from public_profiles where id='${staff}'`),i===10);
 if(!member)await assert.rejects(sql('select * from my_dms()'),/Approved account required/);
 await sql('reset role');console.log(i, actual.map(x=>x?'allow':'deny').join(' '));
}
await as(10);await sql(`select review_signup('${id(4)}','suspended','moderation')`);await sql('reset role');assert.equal(await rows(`select from auth.sessions where user_id='${id(4)}'`),false);
assert.equal(await rows(`select from auth.refresh_tokens where session_id='${id(104)}'`),false);
await as(6);await assert.rejects(sql(`select review_signup('${student}','rejected','  ')`),/rejection reason/);await sql('reset role');
await sql(`delete from auth.sessions where user_id='${id(6)}'`);await as(6);assert.equal(await rows('select * from messages'),false);
await sql('reset role');await sql(`update profiles set department='Physics' where id='${student}'`);await as(7);
assert.equal(await rows(`select * from public_profiles where id='${student}'`),false);assert.equal(await approve(student),false);
await sql('reset role');await sql(`update profiles set department='CS',id_card_path=null where id='${student}'`);await as(10);
assert.equal(await rows(`select * from public_profiles where id='${student}'`),false);assert.equal(await approve(student),false);
await sql('reset role');await sql(`delete from chat_members where user_id='${owner}'`);await as(10);
assert.equal(await rows('select * from messages'),false);assert.equal(await rows("select * from storage.objects where bucket_id='chat-files'"),false);
console.log('50/50 matrix checks passed; staff visibility, enrollment guard, privileged RPC, suspension and stale-session checks passed.');
await (await import('./entry-flow.mjs')).testEntry(db);await (await import('./owner-staff.mjs')).testOwnerStaff(db);await (await import('./approval-scope.mjs')).testApprovalScope(db);await (await import('./recovery-email.mjs')).testRecoveryEmail(db);await db.close();
