import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function testOwnerStaff(db){
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,sql=s=>db.exec(s),val=async q=>Object.values((await db.query(q)).rows[0])[0];
 async function as(n,aal=false){await sql(`reset role;set role authenticated;set request.jwt.claims='${JSON.stringify({sub:id(n),session_id:id(n+100),aal:aal?'aal2':'aal1',amr:[{method:aal?'totp':'password'}]})}'`);}
 const root=()=>sql('reset role'),owner=id(10);
 await root();await sql(`alter table storage.objects add metadata jsonb default '{"mimetype":"image/jpeg","size":500}'::jsonb`);await sql(`insert into auth.users values('${owner}','{}')`);
 await sql(readFileSync(new URL('../migrations/20261122_owner_staff.sql',import.meta.url),'utf8'));
 await assert.rejects(sql(`update profiles set role='student' where id='${owner}'`),/Protected/);
 await assert.rejects(sql(`delete from auth.users where id='${owner}'`),/foreign key/);
 await assert.rejects(sql(`insert into phase1_private.app_owner values(false,'${id(9)}')`));
 await assert.rejects(sql('truncate phase1_private.app_owner'),/Protected/);
 await assert.rejects(sql(`update profiles set role='founder' where id='${id(9)}'`));
 await as(10);assert.equal(await val('select elevated_workspace_access()'),false);await as(9,true);assert.equal(await val('select elevated_workspace_access()'),false);
 await as(10,true);assert.equal(await val('select elevated_workspace_access()'),true);assert.equal(await val('select count(*)::int from messages'),1); // no membership
 await root();for(const n of [60,61,62,63,64,65])await sql(`insert into profiles(id,full_name,status,role,level,staff_id,department) values('${id(n)}','Staff ${n}','pending','lecturer','Staff','S${n}','${n===64?'Arts':'CS'}');insert into auth.sessions values('${id(n+100)}','${id(n)}')`);
 await as(9,true);await assert.rejects(sql(`select administrative_decision('${id(60)}','approved','manual')`),/Not authorized/);
 await as(10,true);await assert.rejects(sql(`select administrative_decision('${id(60)}','approved','manual')`),/Proof of Staff Status/);
 await root();for(const [n,f] of [[60,'staff-id.jpg'],[64,'employment.pdf']]){await sql(`insert into storage.objects values('id-cards','${id(n)}/${n}_${f}');update profiles set id_card_path='${id(n)}/${n}_${f}' where id='${id(n)}'`);}
 for(const n of [5,7]){await as(n);assert.equal(await val(`select can_review('${id(60)}')`),false);await assert.rejects(sql(`select review_signup('${id(60)}','approved',null)`));}
 await as(9,true);await sql(`select review_signup('${id(60)}','approved',null);select review_signup('${id(64)}','approved',null)`);
 await root();await sql(`update storage.objects set metadata=jsonb_build_object('mimetype','application/pdf','size',500) where name='${id(64)}/64_employment.pdf'`);
 await as(61);assert.equal(await val('select count(*)::int from staff_vouch_candidates()'),1);await assert.rejects(sql(`select request_staff_vouch('${id(64)}')`));await assert.rejects(sql(`select request_staff_vouch('${id(61)}')`));await sql(`select request_staff_vouch('${id(60)}')`);
 await as(9,true);assert.equal(await val(`select can_review('${id(61)}')`),false);await as(60);const req=await val('select request_id from my_staff_vouches()');await as(64);await assert.rejects(sql(`select answer_staff_vouch('${req}',true)`));await as(60);await sql(`select answer_staff_vouch('${req}',true)`);await assert.rejects(sql(`select answer_staff_vouch('${req}',true)`));
 await as(9,true);assert.equal(await val(`select staff_review_method('${id(61)}')`),'Confirmed departmental vouch');await as(7);assert.equal(await val(`select can_review('${id(61)}')`),false);
 await as(63);await sql(`select request_staff_vouch('${id(60)}')`);await as(60);const next=await val('select request_id from my_staff_vouches()');await sql(`select answer_staff_vouch('${next}',true)`);
 await as(9,true);await sql(`select review_signup('${id(63)}','approved',null)`);
 await as(9,true);await sql(`select review_signup('${id(60)}','suspended','test')`);assert.equal(await val(`select can_review('${id(61)}')`),false);
 const h='a'.repeat(64);await as(62);await assert.rejects(sql(`select issue_staff_email('${id(62)}','a@gsu.edu.ng','${h}')`),/permission denied/);
 await root();await sql('set role service_role');await assert.rejects(sql(`select issue_staff_email('${id(62)}','a@gsu.edu.ng.example.org','${h}')`));await sql(`select issue_staff_email('${id(62)}','a@gsu.edu.ng','${h}')`);await assert.rejects(sql(`select issue_staff_email('${id(62)}','a@gsu.edu.ng','${h}')`),/limit/);await assert.rejects(sql(`select consume_staff_email('${id(63)}','${h}')`));await sql(`select consume_staff_email('${id(62)}','${h}')`);await assert.rejects(sql(`select consume_staff_email('${id(62)}','${h}')`));
 await as(62);assert.equal(await val("select check_own_entry()->>'proof_method'"),'Verified GSU staff email');assert.equal(await val("select check_own_entry()->>'status'"),'pending');await as(9);assert.equal(await val(`select can_review('${id(62)}')`),false);await as(10,true);await sql(`select review_signup('${id(62)}','approved',null)`);
 await as(10,true);await sql(`select administrative_decision('${id(51)}','approved','Independent manual decision')`);await root();assert.equal(await val(`select count(*)::int from phase1_private.account_overrides where target='${id(51)}'`),1);
 await sql(`set role service_role;select issue_staff_email('${id(65)}','another@gsu.edu.ng','${h}')`);await root();await sql(`update phase1_private.staff_email set expires=now()-interval '1 second' where account='${id(65)}';set role service_role`);await assert.rejects(sql(`select consume_staff_email('${id(65)}','${h}')`),/expired/);
 await root();console.log('Owner permanence, elevation, override, staff routing, file/email/vouch decisions and negative authorization checks passed.');
}
