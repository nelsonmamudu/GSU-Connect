import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {staffEmailHandler} from '../supabase/functions/staff-email/handler';
test('staff link is account-bound, server-generated, HTTPS, and not consumed by a GET',async()=>{
 const calls:{name:string;args:Record<string,string>}[]=[];let sent='';
 const handle=staffEmailHandler({identify:async jwt=>jwt==='valid'?'authenticated-applicant':null,
  rpc:async(name,args)=>{calls.push({name,args});return {error:null}},appUrl:()=>'https://campus.example',deliver:async(address,link)=>{assert.equal(address,'lecturer@gsu.edu.ng');sent=link;return true}});
 const post=(input:unknown,jwt='valid')=>handle(new Request('https://fn.example',{method:'POST',headers:{Authorization:`Bearer ${jwt}`},body:JSON.stringify(input)}));
 assert.equal((await handle(new Request('https://fn.example'))).status,405);
 assert.equal((await post({action:'send',email:'lecturer@gsu.edu.ng'},'bad')).status,401);
 assert.equal((await post({action:'send',email:'lecturer@gsu.edu.ng.other'})).status,400);
 assert.equal((await post({action:'send',email:'a'.repeat(1200)})).status,400);assert.equal(calls.length,0);
 const reply=await post({action:'send',email:'Lecturer@gsu.edu.ng',u:'other',redirect:'https://other.example',token_hash:'chosen'});
 assert.equal(reply.status,200);const link=new URL(sent);const token=link.hash.split('=')[1];assert.equal(link.origin,'https://campus.example');assert.match(token,/^[0-9a-f]{64}$/);assert.ok(!(await reply.text()).includes(token));
 const digest=createHash('sha256').update(token).digest('hex');assert.deepEqual(calls[0],{name:'issue_staff_email',args:{u:'authenticated-applicant',mail:'lecturer@gsu.edu.ng',token_hash:digest}});
 assert.equal((await post({action:'confirm',token,u:'other'})).status,200);assert.deepEqual(calls[1],{name:'consume_staff_email',args:{u:'authenticated-applicant',token_hash:digest}});
});
