/**
 * Builds qa-screenshots/index.html and prints it to a PDF.
 *
 * ImageMagick's PDF coder is disabled by the sandbox security policy, so the
 * PDF is produced by Chromium instead.
 *
 * Usage: node scripts/make-shot-pdf.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHOTS = path.join(ROOT, 'qa-screenshots');
const BASE = (process.env.CAPTURE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const PDF = process.env.SHOT_PDF || path.join(ROOT, 'GSU-Connect-auth-and-pending-screenshots.pdf');

/** What each captured state actually is. */
const CAPTIONS = {
  'auth-01-login': 'Sign-in, empty',
  'auth-02-login-filled': 'Sign-in, filled',
  'auth-03-login-validation': 'Sign-in, blur validation',
  'auth-04-login-error': 'Sign-in, wrong credentials',
  'auth-05-login-busy': 'Sign-in, submitting',
  'auth-06-login-dark': 'Sign-in, dark theme',
  'auth-07-login-desktop': 'Sign-in, desktop',
  'signup-01-proof-student': 'Create account · step 1, student',
  'signup-02-proof-staff-paths': 'Create account · step 1, staff paths',
  'signup-03-details-empty': 'Create account · step 2, empty',
  'signup-04-department-picker': 'Create account · step 2, department picker',
  'signup-05-details-filled-nolevel': 'Create account · step 2, level not chosen',
  'signup-06-details-level-error': 'Create account · step 2, level validation',
  'signup-07-details-filled': 'Create account · step 2, complete',
  'signup-08-account-empty': 'Create account · step 3, empty',
  'signup-09-account-filled': 'Create account · step 3, complete',
  'signup-10-account-dark': 'Create account · step 3, dark theme',
  'signup-11-account-desktop': 'Create account · step 3, desktop',
  'forgot-01-form': 'Forgot password, form',
  'forgot-02-sent': 'Forgot password, link sent',
  'status-pending-student': 'Pending student',
  'status-pending-student-dark': 'Pending student, dark theme',
  'status-rejected-student': 'Rejected, with reason',
  'status-rejected-student-dark': 'Rejected, dark theme',
  'status-suspended-student': 'Suspended',
  'status-suspended-student-dark': 'Suspended, dark theme',
  'status-pending-edit-details': 'Pending, editing department and level',
  'status-pending-desktop': 'Pending student, desktop',
};

const GROUP_ORDER = [
  ['Sign in', (f) => f.startsWith('auth-')],
  ['Create account', (f) => f.startsWith('signup-')],
  ['Forgot password', (f) => f.startsWith('forgot-')],
  ['Account status (pending / rejected / suspended)', (f) => f.startsWith('status-')],
];

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

async function buildIndex() {
  const files = (await readdir(SHOTS))
    .filter((f) => f.endsWith('.png') && !f.startsWith('00-'))
    .sort();

  let included = 0;
  const sections = GROUP_ORDER.map(([title, match]) => {
    const items = files.filter(match);
    included += items.length;
    if (!items.length) return '';
    const cards = items
      .map((f) => {
        const key = f.replace(/\.png$/, '');
        const caption = CAPTIONS[key] ?? key;
        return `      <figure>
        <img src="/qa-screenshots/${f}" alt="${escapeHtml(caption)}" />
        <figcaption>${escapeHtml(caption)}</figcaption>
      </figure>`;
      })
      .join('\n');
    return `    <section>\n      <h2>${escapeHtml(title)}</h2>\n      <div class="grid">\n${cards}\n      </div>\n    </section>`;
  }).join('\n');
  console.log(`index covers ${included} of ${files.length} screenshots`);

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>GSU Connect — Auth &amp; pending screenshots</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; padding: 28px; background: #f8f7f4; color: #1d1b17;
             font-family: "DM Sans", ui-sans-serif, system-ui, sans-serif; }
      h1 { font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
           font-size: 24px; margin: 0 0 4px; }
      .sub { color: #57534b; font-size: 13px; margin: 0 0 22px; }
      section { break-before: page; }
      section:first-of-type { break-before: auto; }
      h2 { font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
           font-size: 16px; margin: 0 0 12px; padding-bottom: 6px;
           border-bottom: 1px solid #e6e3da; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
      figure { margin: 0; }
      img { width: 100%; height: auto; display: block; background: #fff;
            border: 1px solid #e6e3da; border-radius: 8px; }
      figcaption { font-size: 12px; color: #57534b; margin-top: 6px; }
      @media print { body { padding: 0; } }
    </style>
  </head>
  <body>
    <h1>GSU Connect — Auth &amp; account-status screenshots</h1>
    <p class="sub">Captured from the real components in headless Chromium. Supabase was answered by a
      local double, so the states are the app's own but the data is sample data.</p>
${sections}
  </body>
</html>
`;
  await writeFile(path.join(ROOT, 'qa-screenshots', 'index.html'), html);
  return files.length;
}

await buildIndex();

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  headless: true,
  args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  defaultViewport: null,
});
const page = await browser.newPage();
await page.goto(`${BASE}/qa-screenshots/index.html`, { waitUntil: 'networkidle0', timeout: 60_000 });
await page.evaluateHandle('document.fonts.ready');
await page.pdf({ path: PDF, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
await browser.close();
console.log(`wrote ${PDF}`);
