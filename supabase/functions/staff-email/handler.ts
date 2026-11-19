// HTTP boundary shared by the deployed function and isolated tests. The requester
// supplies neither the profile ID, the digest to issue, nor a redirect URL.
interface Dependencies {
  identify(jwt: string): Promise<string | null>;
  rpc(name: string, args: Record<string, string>): Promise<{error: {message:string} | null}>;
  appUrl(): string | undefined;
  deliver(address: string, link: string): Promise<boolean>;
}
const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Content-Type':'application/json'};
const reply=(status:number,message:string)=>new Response(JSON.stringify({message}),{status,headers});
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const hash=async(s:string)=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
async function smallJson(req:Request){
 const reader=req.body?.getReader();if(!reader)throw Error();let bytes=0;let text='';const decoder=new TextDecoder();
 for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1024){await reader.cancel();throw Error();}text+=decoder.decode(value,{stream:true});}
 return JSON.parse(text+decoder.decode());
}
export function staffEmailHandler(deps:Dependencies){return async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return reply(405,'POST required');
 try{
  const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))return reply(401,'Sign in required');
  const u=await deps.identify(auth.slice(7));if(!u)return reply(401,'Sign in again');
  const input=await smallJson(req);
  if(input.action==='confirm' && typeof input.token==='string' && /^[0-9a-f]{64}$/.test(input.token)){
   const r=await deps.rpc('consume_staff_email',{u,token_hash:await hash(input.token)});
   return r.error?reply(400,'Link invalid, expired or already used. Request a fresh link.'):reply(200,'Staff email confirmed. Admin review is still required.');
  }
  const mail=typeof input.email==='string'?input.email.trim().toLowerCase():'';
  if(input.action!=='send'||mail.length>120||!(/^[a-z0-9][a-z0-9._+-]*@gsu\.edu\.ng$/).test(mail))return reply(400,'Use a GSU staff email address');
  const link=new URL('/',deps.appUrl());if(link.protocol!=='https:')return reply(503,'Email delivery unavailable');
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));link.hash='staff-confirm='+token;
  const r=await deps.rpc('issue_staff_email',{u,mail,token_hash:await hash(token)});
  if(r.error)return r.error.message.includes('limit')?reply(429,'Please wait before requesting another link (four per day).'):reply(400,'Cannot send now. Check your application.');
  return await deps.deliver(mail,link.href)?reply(200,'Check your GSU inbox. The link expires in 20 minutes.'):reply(503,'Delivery failed. Try again later.');
 }catch{return reply(400,'Could not complete verification request');}
};}
