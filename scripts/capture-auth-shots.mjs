/**
 * Screenshot harness for the Auth and account-status ("pending") surfaces.
 *
 * Drives the real app in headless Chromium, so the output is the real
 * components, real copy, real validation and real layout — not a rebuilt mock.
 *
 * The sandbox cannot reach the live Supabase project, so the harness answers
 * Supabase requests itself: request interception fulfils `/rest/v1/**` and
 * `/auth/v1/**` with the same shapes the real server returns (departments,
 * entry_config, session_end_year, and a sign-in that rejects unknown
 * identifiers). Anything that would reach the network is aborted.
 *
 * Account-status states cannot be reached through the UI without creating real
 * users, so StatusGateScreen is mounted directly with fixture users via
 * qa-harness/status-gate.tsx.
 *
 * Usage:
 *   npm run capture:auth                                          # dev server :3000
 *   CAPTURE_BASE_URL=http://127.0.0.1:4173 npm run capture:auth    # preview build
 *   CAPTURE_ONLY=login npm run capture:auth
 */
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = (process.env.CAPTURE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const OUT = process.env.CAPTURE_OUT || 'qa-screenshots';
const ONLY = process.env.CAPTURE_ONLY || '';
const MOBILE_W = Number(process.env.CAPTURE_MOBILE_W || 390);
const DESKTOP_W = Number(process.env.CAPTURE_DESKTOP_W || 1280);
const STATUS_HARNESS = '/qa-harness/status-gate.html';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const note = (s) => log.push(s);

/** Departments the real `list_departments` RPC returns for this project. */
const DEPARTMENTS = [
  { id: 'env-mgt', name: 'Environmental Management', faculty: 'Science', durationYears: 4 },
  { id: 'cs', name: 'Computer Science', faculty: 'Science', durationYears: 4 },
  { id: 'law', name: 'Law', faculty: 'Arts and Social Sciences', durationYears: 5 },
  { id: 'masscom', name: 'Mass Communication', faculty: 'Arts and Social Sciences', durationYears: 4 },
];

/* ------------------------------------------------------------------ *
 * Local Supabase double
 * ------------------------------------------------------------------ */

/** puppeteer 25 dropped `page.route`; interception is the request-event API. */
function respond(req, { status = 200, body }) {
  req.respond({
    status,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Answers with the shapes the app reads. Returns true when handled. */
async function handleSupabase(req) {
  const url = new URL(req.url());
  if (url.pathname.startsWith('/functions/v1/')) {
    // Edge functions (password-reset, cleanup). An empty 200 is success.
    respond(req, { status: 200, body: {} });
    return true;
  }
  if (!url.pathname.startsWith('/rest/v1/') && !url.pathname.startsWith('/auth/v1/')) return false;
  const send = (body, status = 200) => {
    respond(req, { status, body });
    return true;
  };

  if (url.pathname === '/rest/v1/app_settings') {
    return send([
      { key: 'allowed_email_domain', value: 'gsu.edu.ng' },
      { key: 'current_session_end_year', value: '2027' },
      { key: 'graduation_class_year', value: '2026' },
    ]);
  }
  if (url.pathname === '/rest/v1/rpc/entry_config') {
    return send({ graduationClassYear: 2026, sessionEndYear: 2027, sessionLabel: '2026/2027' });
  }
  if (url.pathname === '/rest/v1/rpc/session_end_year') return send(2027);
  if (url.pathname === '/rest/v1/rpc/list_departments') return send(DEPARTMENTS);
  if (url.pathname === '/rest/v1/rpc/identifier_available') return send(true);
  if (url.pathname === '/rest/v1/rpc/resolve_login') return send(null);
  if (url.pathname === '/rest/v1/rpc/check_own_entry') {
    // The real RPC returns the caller's own profile row. Mirroring it lets the
    // status gate resolve past its "Checking your status…" first paint.
    return send({
      id: 'qa-fixture-uid',
      full_name: 'Amina Bello Musa',
      matric_no: 'UG25/QAT/9101',
      staff_id: null,
      department: 'Environmental Management',
      level: '200',
      role: 'student',
      email: 'ug25qat9101@gsu.edu.ng',
      status: 'pending',
      rejection_reason: null,
      id_card_path: null,
      proof_method: null,
      vouch_state: null,
      created_at: null,
      updated_at: null,
      last_seen: null,
    });
  }
  if (url.pathname === '/rest/v1/account_recovery') return send(null);
  if (url.pathname === '/rest/v1/rpc/graduation_class_year') return send(2026);
  if (url.pathname === '/auth/v1/token') {
    // A real Auth round trip takes a moment; without this the "Signing in…"
    // state is gone before a screenshot can catch it.
    await sleep(1400);
    return send({ message: 'Invalid login credentials' }, 400);
  }
  if (url.pathname === '/auth/v1/user') return send(null, 401);
  if (url.pathname === '/auth/v1/signup') {
    return send({
      id: 'qa-fixture-uid',
      email: 'qa-fixture@gsu.edu.ng',
      aud: 'authenticated',
      role: 'authenticated',
      created_at: new Date().toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
    });
  }
  if (url.pathname === '/auth/v1/recover') return send({});
  if (url.pathname.startsWith('/functions/v1/')) return send({});
  if (url.pathname === '/auth/v1/logout') return send({});
  note(`[mock] unhandled ${req.method()} ${url.pathname}`);
  return send([]);
}

async function installMock(page) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    void (async () => {
      const url = req.url();
      try {
        if (url.startsWith(BASE)) return void req.continue();
        if (req.resourceType() === 'websocket') {
          // Supabase Realtime is not needed for these screens.
          return void (url.includes('supabase.co') ? req.abort() : req.continue());
        }
        if (url.includes('supabase.co')) {
          const handled = await handleSupabase(req);
          if (handled) return;
          note(`[mock] falling through ${url}`);
          return void req.abort();
        }
        if (/fonts\.(googleapis|gstatic)\.com/.test(url)) {
          // Self-hosted faces cover every weight the app uses.
          return void req.abort();
        }
        return void req.abort();
      } catch (err) {
        note(`[route] ${url} -> ${err?.message}`);
        try {
          req.abort();
        } catch {
          /* already settled */
        }
      }
    })();
  });
}

/* ------------------------------------------------------------------ *
 * Page helpers
 * ------------------------------------------------------------------ */

function attach(page, label) {
  page.on('console', (m) => {
    const t = m.text();
    if (/favicon|Manifest/.test(t)) return;
    if (m.type() === 'debug' || m.type() === 'info') return;
    note(`[${label}] ${m.type()}: ${t}`);
  });
  page.on('pageerror', (e) => note(`[${label}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    if (/favicon/.test(r.url())) return;
    note(`[${label}] requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`);
  });
}

async function shot(page, file) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  console.log(`  wrote ${file}`);
}

/** Real key input — `locator.fill('')` does not dispatch React's `input`. */
async function typeInto(page, selector, text) {
  await page.locator(selector).click();
  if (text) await page.keyboard.type(text);
}

async function clearInput(page, selector) {
  await page.locator(selector).click();
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    const root = document.documentElement;
    if (t === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, theme);
  await sleep(500);
}

async function boot(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#idNumber', { timeout: 60_000 });
  await page.waitForSelector('form button[type=submit]', { timeout: 60_000 });
  await sleep(800);
}

/** First button whose label contains `text`, as an ElementHandle. */
async function findButton(page, text) {
  const handles = await page.$$('button');
  for (const handle of handles) {
    const label = await handle.evaluate((el) => el.innerText.trim()).catch(() => '');
    if (label.includes(text)) return handle;
  }
  return null;
}

async function clickButton(page, label, text) {
  const handle = await findButton(page, text);
  if (!handle) {
    note(`[${label}] button not found: ${text}`);
    return false;
  }
  await handle.click();
  return true;
}

/** Force-load every self-hosted face so nothing renders a fallback. */
async function fontCheck(page, label) {
  const missing = await page.evaluate(async () => {
    const want = [
      ['DM Sans', 400],
      ['DM Sans', 500],
      ['DM Sans', 600],
      ['DM Sans', 700],
      ['DM Sans', 800],
      ['Plus Jakarta Sans', 500],
      ['Plus Jakarta Sans', 600],
      ['Plus Jakarta Sans', 700],
      ['Plus Jakarta Sans', 800],
      ['JetBrains Mono', 400],
      ['JetBrains Mono', 500],
      ['JetBrains Mono', 600],
    ];
    const out = [];
    for (const [family, weight] of want) {
      try {
        const loaded = await document.fonts.load(`${weight} 16px "${family}"`);
        if (!loaded.length) out.push(`${family} ${weight}`);
      } catch {
        out.push(`${family} ${weight}`);
      }
    }
    return out;
  });
  note(missing.length ? `[${label}] FONTS MISSING: ${missing.join(', ')}` : `[${label}] fonts ok`);
  return missing.length === 0;
}

/** Nothing may spill past the viewport — the failure a 390 px shot hides. */
async function overflowCheck(page, label) {
  const offenders = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.right > vw + 1 || r.left < -1) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '').slice(0, 50)}`);
      }
    }
    return out.slice(0, 5);
  });
  if (offenders.length) note(`[${label}] OVERFLOW: ${offenders.join(' | ')}`);
  return offenders.length === 0;
}

/** Assert an input actually holds the typed value (innerText skips inputs). */
async function expectValue(page, label, selector, expected) {
  const actual = await page.$eval(selector, (e) => e.value).catch(() => null);
  if (actual !== expected) note(`[${label}] ${selector} value = ${JSON.stringify(actual)}`);
  return actual === expected;
}

/** Assert the dark theme is actually applied to <html>. */
async function expectDark(page, label) {
  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  if (!dark) note(`[${label}] dark class missing on <html>`);
  return dark;
}

function expectedTitle(status) {
  if (status === 'rejected') return 'Registration Not Approved';
  if (status === 'suspended') return 'Account Suspended';
  return 'Finish Verification';
}

/** Assert the screen rendered the expected copy. */
async function expectText(page, label, needles) {
  const text = await page.evaluate(() => document.body.innerText);
  const missing = needles.filter((n) => !text.includes(n));
  if (missing.length) note(`[${label}] MISSING TEXT: ${JSON.stringify(missing)}`);
  return missing.length === 0;
}

async function waitForText(page, text, timeout = 20_000) {
  try {
    await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Groups
 * ------------------------------------------------------------------ */

const login = async (browser) => {
  const page = await browser.newPage();
  const label = 'login';
  attach(page, label);
  await installMock(page);
  await page.setViewport({ width: MOBILE_W, height: 844, deviceScaleFactor: 1 });
  await boot(page);
  console.log('login');
  await fontCheck(page, label);
  await expectText(page, label, ['Sign In', 'Create Account', 'Forgot your password?']);
  await overflowCheck(page, label);
  await shot(page, 'auth-01-login.png');

  await typeInto(page, '#idNumber', 'UG25/QAT/9101');
  await typeInto(page, '#password', 'Campus123');
  await sleep(400);
  await shot(page, 'auth-02-login-filled.png');

  // Blur-then-live validation.
  await clearInput(page, '#idNumber');
  await page.locator('#password').click();
  await sleep(700);
  await expectText(page, label, ['Enter your Matric Number or Staff ID.']);
  await shot(page, 'auth-03-login-validation.png');

  // Wrong credentials, answered by the local Auth double.
  await typeInto(page, '#idNumber', 'UG25/QAT/9999');
  await typeInto(page, '#password', 'WrongPass1');
  await page.locator('form button[type=submit]').click();
  if (!(await waitForText(page, 'Incorrect Matric Number, Staff ID, or password.'))) {
    note('[login] wrong-credentials alert never appeared');
  }
  await sleep(600);
  await shot(page, 'auth-04-login-error.png');

  // Busy state while the request is in flight.
  await page.locator('form button[type=submit]').click();
  await sleep(220);
  await expectText(page, label, ['Signing in…']);
  await shot(page, 'auth-05-login-busy.png');
  await sleep(2600);

  await setTheme(page, 'dark');
  await expectDark(page, label);
  await shot(page, 'auth-06-login-dark.png');
  await setTheme(page, 'light');

  await page.setViewport({ width: DESKTOP_W, height: 900, deviceScaleFactor: 1 });
  await sleep(600);
  await overflowCheck(page, label);
  await shot(page, 'auth-07-login-desktop.png');
  await page.close();
};

const signup = async (browser) => {
  const page = await browser.newPage();
  const label = 'signup';
  attach(page, label);
  await installMock(page);
  await page.setViewport({ width: MOBILE_W, height: 844, deviceScaleFactor: 1 });
  await boot(page);
  console.log('signup');
  await fontCheck(page, label);

  await clickButton(page, label, 'Create Account');
  await sleep(500);
  await expectText(page, label, ['Proof', 'Details', 'Account']);
  await expectText(page, label, ['Student', 'Lecturer or Staff']);
  await shot(page, 'signup-01-proof-student.png');

  await clickButton(page, label, 'Lecturer or Staff');
  await sleep(500);
  await expectText(page, label, ['Proof of Staff Status', 'GSU staff email', 'Colleague vouch']);
  await shot(page, 'signup-02-proof-staff-paths.png');

  await clickButton(page, label, 'Student');
  await sleep(300);
  await clickButton(page, label, 'Continue');
  await sleep(600);
  await shot(page, 'signup-03-details-empty.png');

  await typeInto(page, '#fullName', 'Amina Bello Musa');
  await typeInto(page, '#idNumber', 'UG25/QAT/9101');
  await page.locator('#department-picker').click();
  await sleep(500);
  await shot(page, 'signup-04-department-picker.png');
  await (await page.$('[role=option]')).click();
  await sleep(400);
  await overflowCheck(page, label);
  await expectValue(page, label, '#fullName', 'Amina Bello Musa');
  await expectText(page, label, ['Student level']);
  await shot(page, 'signup-05-details-filled-nolevel.png');

  // Level validation: name, ID and department are valid; level is not chosen.
  // (A radio cannot be unchecked by clicking, so the empty level is captured
  // before the level is ever selected.)
  await clickButton(page, label, 'Continue');
  await sleep(600);
  await expectText(page, label, ['Please select your level.']);
  await shot(page, 'signup-06-details-level-error.png');

  await (await page.$('input[name=student-level]')).click();
  await sleep(400);
  await overflowCheck(page, label);
  await shot(page, 'signup-07-details-filled.png');
  await clickButton(page, label, 'Continue');
  await sleep(600);
  await expectText(page, label, ['Recovery email', 'Confirm Password']);
  await shot(page, 'signup-08-account-empty.png');

  await typeInto(page, '#email', 'amina.bello@gmail.com');
  await typeInto(page, '#phone', '08031234567');
  await typeInto(page, '#password', 'Campus123');
  await typeInto(page, '#confirmPassword', 'Campus123');
  await sleep(500);
  await overflowCheck(page, label);
  await shot(page, 'signup-09-account-filled.png');

  await setTheme(page, 'dark');
  await expectDark(page, label);
  await shot(page, 'signup-10-account-dark.png');
  await setTheme(page, 'light');

  await page.setViewport({ width: DESKTOP_W, height: 900, deviceScaleFactor: 1 });
  await sleep(600);
  await overflowCheck(page, label);
  await shot(page, 'signup-11-account-desktop.png');
  await page.close();
};

const forgot = async (browser) => {
  const page = await browser.newPage();
  const label = 'forgot';
  attach(page, label);
  await installMock(page);
  await page.setViewport({ width: MOBILE_W, height: 844, deviceScaleFactor: 1 });
  await boot(page);
  console.log('forgot');

  await clickButton(page, label, 'Forgot your password?');
  await sleep(500);
  await expectText(page, label, ['Reset your password', 'Send Reset Link']);
  await shot(page, 'forgot-01-form.png');

  await typeInto(page, '#forgotIdentifier', 'UG25/QAT/9101');
  await clickButton(page, label, 'Send Reset Link');
  if (!(await waitForText(page, 'Check your inbox'))) note('[forgot] sent confirmation never appeared');
  await sleep(700);
  await expectText(page, label, ['Check your inbox', 'expires in 1 hour']);
  await shot(page, 'forgot-02-sent.png');
  await page.close();
};

const statusGates = async (browser) => {
  const page = await browser.newPage();
  const label = 'status';
  attach(page, label);
  await installMock(page);
  await page.setViewport({ width: MOBILE_W, height: 844, deviceScaleFactor: 1 });
  await page.goto(BASE + STATUS_HARNESS, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1', { timeout: 60_000 });
  await sleep(900);
  console.log('status');
  await fontCheck(page, label);

  const fixtures = [
    ['pending-student', 'pending'],
    ['rejected-student', 'rejected'],
    ['suspended-student', 'suspended'],
  ];

  for (const [name, status] of fixtures) {
    await page.evaluate((s) => window.__setGateUser?.(s), status);
    await sleep(800);
    await overflowCheck(page, label);
    await expectText(page, label, [expectedTitle(status)]);
    await shot(page, `status-${name}.png`);
    await setTheme(page, 'dark');
    await expectDark(page, label);
    await shot(page, `status-${name}-dark.png`);
    await setTheme(page, 'light');
  }

  await page.evaluate(() => window.__setGateUser?.('pending'));
  await sleep(700);
  await expectText(page, label, ['Finish Verification', 'What happens next']);
  await clickButton(page, label, 'Edit details');
  await sleep(600);
  await shot(page, 'status-pending-edit-details.png');

  await page.setViewport({ width: DESKTOP_W, height: 900, deviceScaleFactor: 1 });
  await sleep(600);
  await shot(page, 'status-pending-desktop.png');
  await page.close();
};

/* ------------------------------------------------------------------ */

const main = async () => {
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: [
      ...chromium.args,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
    ],
    defaultViewport: null,
  });
  const groups = { login, signup, forgot, status: statusGates };
  for (const [key, fn] of Object.entries(groups)) {
    if (ONLY && ONLY !== key) continue;
    try {
      await fn(browser);
    } catch (err) {
      note(`[${key}] FAILED: ${err?.stack || err}`);
      console.error(`  ${key} failed:`, err?.message);
    }
  }
  await browser.close();

  console.log('\n--- capture log ---');
  const seen = new Set();
  let failures = 0;
  for (const line of log) {
    const key = line.replace(/wss:\/\/[^']+/, 'wss').replace(/@1\d{12}/, '@t');
    if (seen.has(key)) continue;
    seen.add(key);
    if (
      /^\[[a-z]+\] FAILED:/.test(line) ||
      /MISSING TEXT|OVERFLOW:|FONTS MISSING|pageerror:|alert never|never appeared|button not found/.test(line)
    ) {
      failures += 1;
    }
    console.log(line);
  }
  console.log(`\ncapture issues: ${failures}`);
};

await main();
