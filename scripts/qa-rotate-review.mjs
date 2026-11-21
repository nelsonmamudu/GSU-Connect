// Draft owner-operated production tool. Never run automatically or import into the app.
// Only rotates the six exact, previously marked review fixtures. No deletion or role change.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { privateRoot, checkPrivate, saveLedger, secretInput } from './qa-additional-users.mjs';

const PROJECT = 'wctkyqydjoepgmlhfsiw';
const MARKER = 'gsu-qa-review-v1';
const CAMPAIGN = /^[a-f0-9]{16}$/;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
class RotationError extends Error {}
const fail = message => {throw new RotationError(message)};

export function newRotation(id) {
  if (!CAMPAIGN.test(id)) fail('Invalid rotation ID.');
  return {version:1, project:PROJECT, id, targets:Array.from({length:6},(_,i)=> {
    const matric=`UG25/QAT/${9101+i}`;
    return {matric, email:`${matric.toLowerCase().replace(/[^a-z0-9]/g,'')}@gsuconnect.app`,
      marker:`${MARKER}:${matric}`, state:'planned'};
  })};
}
export function validateRotation(ledger) {
  if (!ledger || ledger.version !== 1 || ledger.project !== PROJECT || !CAMPAIGN.test(ledger.id || '') || !Array.isArray(ledger.targets) || ledger.targets.length !== 6) fail('Invalid rotation inventory.');
  const expected=newRotation(ledger.id);
  for (let i=0;i<6;i++) {
    const item=ledger.targets[i], plan=expected.targets[i];
    for (const key of ['matric','email','marker']) if (item?.[key] !== plan[key]) fail('Rotation inventory does not match the six-fixture plan.');
    if (!['planned','attempting','rotated'].includes(item.state)) fail('Invalid rotation state.');
    if (item.id !== undefined && !UUID.test(item.id)) fail('Invalid fixture ID.');
    if (item.state !== 'planned' && !UUID.test(item.id || '')) fail('Missing fixture ID.');
  }
}
async function identify(db,item) {
  const result=await db.from('profiles').select('id,email,matric_no').eq('matric_no',item.matric).maybeSingle();
  const profile=result.data;
  if (result.error || !profile || !UUID.test(profile.id || '') || profile.matric_no !== item.matric || profile.email !== item.email) fail('Fixture profile missing or unexpected. Stop.');
  const identity=await db.auth.admin.getUserById(profile.id), user=identity.data?.user;
  if (identity.error || user?.id !== profile.id || user.email !== item.email || user.app_metadata?.qa_fixture !== item.marker) fail('Fixture Auth marker or identity did not match. Stop.');
  if (item.id && item.id !== user.id) fail('Fixture identity changed. Stop.');
  return user.id;
}
export async function rotate({db,ledger,password,save}) {
  validateRotation(ledger);
  if (typeof password !== 'string' || password.length < 24) fail('Invalid replacement password.');
  if (ledger.targets.some(item=>item.state==='attempting')) fail('A previous rotation attempt has an uncertain outcome. Investigate before retrying.');
  // Verify every target, including previously rotated targets, before any update.
  const ids=[];
  for (const item of ledger.targets) ids.push(await identify(db,item));
  if (new Set(ids).size !== 6) fail('Fixture IDs are not distinct. Stop.');
  for (let i=0;i<6;i++) if (ledger.targets[i].id && ledger.targets[i].id!==ids[i]) fail('Fixture identity changed. Stop.');
  for (let i=0;i<6;i++) ledger.targets[i].id=ids[i];
  await save(ledger);
  for (const item of ledger.targets) {
    if (item.state==='rotated') continue;
    await identify(db,item);
    item.state='attempting';
    await save(ledger);
    const result=await db.auth.admin.updateUserById(item.id,{password});
    if (result.error || result.data?.user?.id !== item.id) fail('Password update outcome needs investigation; do not retry blindly.');
    item.state='rotated';
    await save(ledger);
  }
  return ledger.targets.filter(item=>item.state==='rotated').length;
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) fail('Use a private interactive terminal.');
  const [mode,id,...extra]=process.argv.slice(2);
  if (extra.length || !['--init','--rotate'].includes(mode) || (mode==='--init' ? id!==undefined : !CAMPAIGN.test(id || ''))) fail('Usage: node scripts/qa-rotate-review.mjs --init | --rotate ROTATION_ID');
  const root=await privateRoot();
  if (mode==='--init') {
    const rotation=randomBytes(8).toString('hex'), dir=join(root,`rotation-${rotation}`);
    await mkdir(dir,{mode:0o700});
    await writeFile(join(dir,'password.txt'),`${randomBytes(32).toString('base64url')}aA1!\n`,{mode:0o600,flag:'wx'});
    await saveLedger(join(dir,'inventory.json'),newRotation(rotation));
    console.log(`Initialized local-only rotation ${rotation}. No network request made.`);
    console.log('The new password and inventory are private on this device. Do not share or screenshot them.');
    return;
  }
  const dir=join(root,`rotation-${id}`), ledgerPath=join(dir,'inventory.json'), passwordPath=join(dir,'password.txt');
  await checkPrivate(dir,'directory');
  const lockPath=join(dir,'running.lock');
  let lock;
  try { lock=await open(lockPath,'wx',0o600); }
  catch { fail('Rotation is locked or its lock cannot be created. Stop and investigate.'); }
  try {
    await checkPrivate(ledgerPath,'file'); await checkPrivate(passwordPath,'file');
    const ledger=JSON.parse(await readFile(ledgerPath,'utf8')); validateRotation(ledger);
    if (ledger.id!==id) fail('Rotation ID mismatch.');
    const password=(await readFile(passwordPath,'utf8')).trim();
    if (!/^[A-Za-z0-9_-]{43}aA1!$/.test(password)) fail('Invalid password file.');
    console.log('LIVE project: change the password for only the six exact marked QA review accounts.');
    console.log('This does not guarantee existing sessions are revoked, and does not cover any other account using the exposed password.');
    const rl=createInterface({input:process.stdin,output:process.stdout});
    const answer=await rl.question('Type ROTATE SIX to confirm: '); rl.close();
    if (answer!=='ROTATE SIX') fail('Cancelled; no network request made.');
    const key=await secretInput('Supabase secret key (input hidden; never share it): ');
    if (!key || key.length<20) fail('Invalid key; no network request made.');
    const db=createClient(`https://${PROJECT}.supabase.co`,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const count=await rotate({db,ledger,password,save:next=>saveLedger(ledgerPath,next)});
    console.log(`Password update acknowledged for ${count} marked fixtures. Keep the new password and inventory private.`);
  } finally { await lock.close(); await unlink(lockPath); }
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(err=> {
  console.error(`Stopped: ${err instanceof RotationError ? err.message : 'Unexpected error. Inspect the private inventory before any retry.'}`);
  process.exitCode=1;
});
