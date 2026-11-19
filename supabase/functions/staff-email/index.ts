import { createClient } from 'jsr:@supabase/supabase-js@2';
import { staffEmailHandler } from './handler.ts';
const url=Deno.env.get('SUPABASE_URL')!;
const server=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
Deno.serve(staffEmailHandler({
 async identify(jwt){
  const caller=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${jwt}`}},auth:{persistSession:false}});
  const user=await caller.auth.getUser(jwt);if(user.error||!user.data.user)return null;
  const session=await caller.rpc('active_app_session');return !session.error&&session.data===true?user.data.user.id:null;
 },
 async rpc(name,args){return await server.rpc(name,args);},
 appUrl:()=>Deno.env.get('APP_URL'),
 async deliver(mail,link){const sender=Deno.env.get('BREVO_SENDER_EMAIL'),key=Deno.env.get('BREVO_API_KEY');if(!sender||!key)return false;
 const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':key,'Content-Type':'application/json'},body:JSON.stringify({sender:{email:sender},to:[{email:mail}],subject:'Confirm your GSU staff email',textContent:`Open this link and confirm while signed in to the GSU Connect account that requested it. It expires in 20 minutes. If you did not request it, ignore it.\n\n${link}`})});return response.ok;
 }
}));
