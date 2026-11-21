// Owner-operated production QA tool. Never run automatically or import into the app.
// It creates pending synthetic accounts only; it does not test signup or approve users.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, lstat, open, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';

const PROJECT = 'wctkyqydjoepgmlhfsiw';
const PREFIX = 'gsu-qa-additional-v1';
const ID = /^[a-f0-9]{16}$/;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const LEVELS = ['100', '200', '300', '400'];
class QAError extends Error {}
const fail = message => { throw new QAError(message); };

export function createPlan(campaign) {
  if (!ID.test(campaign)) fail('Invalid campaign ID.');
  return Array.from({length:100}, (_, index) => {
    const number = String(index + 1).padStart(3, '0');
    const matric = `QA${campaign.toUpperCase()}${number}`;
    return { number: index + 1, matric, email: `${matric.toLowerCase()}@gsuconnect.app`,
      marker: `${PREFIX}:${campaign}:${number}`, level: LEVELS[index % LEVELS.length], state: 'planned' };
  });
}

export function newLedger(campaign) {
  return { version: 1, project: PROJECT, campaign, department: `QA Campaign ${campaign}`, accounts: createPlan(campaign) };
}

export function validateLedger(ledger) {
  if (!ledger || ledger.version !== 1 || ledger.project !== PROJECT || !ID.test(ledger.campaign || '') ||
      ledger.department !== `QA Campaign ${ledger.campaign}` || !Array.isArray(ledger.accounts) || ledger.accounts.length !== 100) fail('Invalid campaign inventory. Stop.');
  const expected = createPlan(ledger.campaign);
  for (let i = 0; i < 100; i++) {
    const item = ledger.accounts[i];
    for (const key of ['number','matric','email','marker','level']) if (item?.[key] !== expected[i][key]) fail('Inventory does not match campaign plan. Stop.');
    if (!['planned','attempting','created','verified'].includes(item.state)) fail('Invalid inventory state. Stop.');
    if ((item.state === 'created' || item.state === 'verified') && !UUID.test(item.id || '')) fail('Missing user ID. Stop.');
  }
}

// Injected persistence makes the same code testable without network access.
export async function provision({db, ledger, password, save, mode}) {
  validateLedger(ledger);
  if (typeof password !== 'string' || password.length < 24) fail('Missing campaign password.');
  if (!['pilot','continue'].includes(mode)) fail('Invalid operation.');
  if (ledger.accounts.some(a => a.state === 'attempting' || a.state === 'created')) fail('An earlier attempt has an uncertain or unverified outcome. Stop and investigate; do not retry blindly.');
  if (mode === 'pilot' && ledger.accounts.some(a => a.state !== 'planned')) fail('Pilot already attempted. Stop.');
  if (mode === 'continue' && ledger.accounts[0].state !== 'verified') fail('Pilot must be verified before continuing.');

  const targets = mode === 'pilot' ? ledger.accounts.slice(0, 1) : ledger.accounts.slice(1);
  for (const item of targets) {
    if (item.state === 'verified') continue;
    const collision = await db.from('profiles').select('id').eq('matric_no', item.matric).limit(1);
    if (collision.error || !Array.isArray(collision.data)) fail(`Preflight failed for account ${item.number}. No account was attempted in this step.`);
    if (collision.data.length) fail(`Identifier collision for account ${item.number}. Stop.`);
    // Persist before the network call: on timeout the user must inspect, not rerun blindly.
    item.state = 'attempting';
    await save(ledger);
    const result = await db.auth.admin.createUser({email:item.email, password, email_confirm:true,
      app_metadata:{qa_fixture:item.marker}, user_metadata:{full_name:`QA Campaign ${item.number}`,
        matric_no:item.matric, id_number:item.matric, id_number_normalized:item.matric.toLowerCase(),
        account_type:'student', requested_role:'student', department:ledger.department, level:item.level,
        recovery_email:`qa-${ledger.campaign}-${String(item.number).padStart(3,'0')}@example.invalid`}});
    if (result.error || !UUID.test(result.data?.user?.id || '')) fail(`Account ${item.number}: creation outcome needs investigation. Do not retry blindly.`);
    item.id = result.data.user.id;
    item.state = 'created';
    await save(ledger);
    const identity = await db.auth.admin.getUserById(item.id);
    const user = identity.data?.user;
    if (identity.error || user?.id !== item.id || user.email !== item.email || user.app_metadata?.qa_fixture !== item.marker) fail(`Account ${item.number}: identity verification failed. Stop.`);
    const profile = await db.from('profiles').select('id,matric_no,role,status,department,level').eq('id',item.id).maybeSingle();
    const row = profile.data;
    if (profile.error || !row || row.id !== item.id || row.matric_no !== item.matric || row.role !== 'student' || row.status !== 'pending' || row.department !== ledger.department || row.level !== item.level) fail(`Account ${item.number}: profile verification failed. Stop.`);
    item.state = 'verified';
    await save(ledger);
  }
  return ledger.accounts.filter(a => a.state === 'verified').length;
}

export async function checkPrivate(path, kind) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || (kind === 'directory' ? !info.isDirectory() : !info.isFile()) ||
      (info.mode & 0o077) !== 0 || (typeof process.getuid === 'function' && info.uid !== process.getuid())) {
    fail('Campaign files must be private, owned by this user, and not symlinks. Stop.');
  }
}
export async function privateRoot() {
  const root = join(homedir(), '.gsu-qa-campaigns');
  await mkdir(root, {recursive:true,mode:0o700});
  await checkPrivate(root,'directory');
  return root;
}
export async function saveLedger(path, ledger) {
  const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(tmp, `${JSON.stringify(ledger,null,2)}\n`, {mode:0o600,flag:'wx'});
  await rename(tmp,path);
}
export async function secretInput(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) fail('Use a private interactive terminal.');
  return new Promise((resolve,reject) => {
    let secret = '';
    const finish = (err) => {
      process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener('data', onData);
      process.stdout.write('\n'); err ? reject(err) : resolve(secret);
    };
    const onData = chunk => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\u0003') return finish(new Error('Cancelled.'));
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\u007f' || ch === '\b') secret = secret.slice(0,-1);
        else if (ch >= ' ') secret += ch;
      }
    };
    process.stdin.setRawMode(true); process.stdin.on('data',onData); process.stdin.resume();
    process.stdout.write(question);
  });
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) fail('Use a private interactive terminal.');
  const [mode, campaign, ...extra] = process.argv.slice(2);
  if (extra.length || !['--init','--pilot','--continue'].includes(mode) || (mode === '--init' ? campaign !== undefined : !ID.test(campaign || ''))) fail('Usage: node scripts/qa-additional-users.mjs --init | --pilot CAMPAIGN | --continue CAMPAIGN');
  const root = await privateRoot();
  if (mode === '--init') {
    const id = randomBytes(8).toString('hex'), dir = join(root,id);
    await mkdir(dir,{mode:0o700});
    await writeFile(join(dir,'password.txt'), `${randomBytes(32).toString('base64url')}aA1!\n`, {mode:0o600,flag:'wx'});
    await saveLedger(join(dir,'inventory.json'),newLedger(id));
    console.log(`Initialized local-only campaign ${id}. No network request made.`);
    console.log('A strong shared password and inventory are stored in your private campaign directory. Do not share or screenshot them.');
    return;
  }
  const dir = join(root,campaign);
  const ledgerPath = join(dir,'inventory.json');
  const passwordPath = join(dir,'password.txt');
  await checkPrivate(dir,'directory');
  const lockPath = join(dir,'running.lock');
  let lock;
  try { lock = await open(lockPath,'wx',0o600); }
  catch { fail('Campaign is locked or the lock cannot be created. Stop and investigate before retrying.'); }
  try {
  await checkPrivate(ledgerPath,'file');
  await checkPrivate(passwordPath,'file');
  const ledger = JSON.parse(await readFile(ledgerPath,'utf8'));
  validateLedger(ledger);
  if (ledger.campaign !== campaign) fail('Campaign mismatch.');
  const password = (await readFile(passwordPath,'utf8')).trim();
  if (!/^[A-Za-z0-9_-]{43}aA1!$/.test(password)) fail('Invalid campaign password file. Stop.');
  console.log(mode === '--pilot' ? 'LIVE project: create ONE additional pending synthetic account.' : 'LIVE project: create up to 99 remaining additional pending synthetic accounts.');
  console.log('No other accounts will be intentionally modified. This does not exercise real signup, email, or full-app scenarios.');
  if (mode === '--continue') console.log('Continue only after independently reviewing the pilot, its side effects, and the inventory.');
  const rl = createInterface({input:process.stdin,output:process.stdout});
  const answer = await rl.question(`Type ${mode === '--pilot' ? 'CREATE ONE' : 'CREATE 99'} to confirm: `);
  rl.close();
  if (answer !== (mode === '--pilot' ? 'CREATE ONE' : 'CREATE 99')) fail('Cancelled; no network request made.');
  const key = await secretInput('Supabase secret key (input hidden; never share it): ');
  if (!key || key.length < 20) fail('Invalid key; no network request made.');
  const db = createClient(`https://${PROJECT}.supabase.co`,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const count = await provision({db,ledger,password,save: next => saveLedger(ledgerPath,next),mode:mode.slice(2)});
  console.log(`Verified ${count} of 100 campaign accounts. Inventory is stored privately on this device.`);
  console.log('No existing accounts were intentionally changed. Keep the password and inventory private.');
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(err => {
  // Never print arbitrary SDK, filesystem, or network errors: they may contain sensitive data.
  console.error(`Stopped: ${err instanceof QAError ? err.message : 'Unexpected error. Inspect the private inventory before any retry.'}`);
  process.exitCode=1;
});
