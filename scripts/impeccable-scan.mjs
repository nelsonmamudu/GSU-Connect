/**
 * Run the Impeccable design detector over the app.
 *
 * URL scanning needs a Chromium executable; the sandbox keeps one at /tmp/chromium
 * (extracted from @sparticuz/chromium) plus its NSS libs. Not part of the app build.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const CHROME = process.env.IMPECCABLE_BROWSER || '/tmp/chromium';
const LIBS = '/tmp/chromium-libs/lib';
const BASE = process.env.IMPECCABLE_BASE_URL || 'http://localhost:3000';
const paths = process.env.IMPECCABLE_PATHS
  ? process.env.IMPECCABLE_PATHS.split(',')
  : ['/', '/qa-harness/status-gate.html'];

if (!existsSync(CHROME)) {
  console.error(`no chromium at ${CHROME} (extract @sparticuz/chromium first)`);
  process.exit(1);
}

const all = [];
for (const p of paths) {
  const url = p.startsWith('http') ? p : `${BASE}${p}`;
  const res = spawnSync(
    'npx',
    ['--yes', 'impeccable@latest', 'detect', url, '--json'],
    {
      cwd: process.cwd(),
      env: { ...process.env, LD_LIBRARY_PATH: LIBS, IMPECCABLE_BROWSER: CHROME },
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const out = String(res.stdout || '').trim();
  const start = out.indexOf('[');
  if (start === -1) {
    console.error(`${url}: no json\n${String(res.stderr || '').slice(0, 800)}`);
    continue;
  }
  let findings = [];
  try {
    findings = JSON.parse(out.slice(start));
  } catch {
    console.error(`${url}: unparseable json`);
    continue;
  }
  console.log(`\n### ${url} — ${findings.length} finding(s)`);
  for (const f of findings) {
    console.log(
      `[${f.severity}] ${f.antipattern.padEnd(30)} ${(f.selector || '').padEnd(42)} ${f.snippet || ''}`,
    );
  }
  all.push(...findings.map((f) => ({ ...f, url })));
}

console.log(`\nTOTAL: ${all.length}`);
