#!/usr/bin/env node
// samples/verify-cli-region.js — Phase 8 Wave 4 (Plan 04 Task 2) hermetic verifier.
//
// Asserts every <behavior> bullet from 08-04-PLAN.md Task 2 against the live
// CLI and source files:
//   - src/cli/format.js Guard 4 (RegionError instanceof branch)
//   - src/cli.js --only <region-name> option (commander required-value)
//   - src/cli.js --smoke / --only mutex guard (throws RegionError before either branch)
//   - src/cli.js non-smoke branch passes only: opts.only to runCapture
//   - src/cli.js labels per-result lines with region 'X' vs full page
//
// Pure Node. No subprocess `grep`. Source-text assertions use comment-stripped
// substring counts so module-header documentation cannot produce false positives
// (mirrors 08-03's verifier pattern).
//
// Runs against the hermetic samples/serve-smoke.js fixture (starts/stops it
// internally) for the live CLI tests. Same isolation contract as Wave 3.

import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import http from 'node:http';

const CLI_PATH = new URL('../src/cli.js', import.meta.url).pathname;
const FORMAT_PATH = new URL('../src/cli/format.js', import.meta.url).pathname;
const INDEX_PATH = new URL('../index.js', import.meta.url).pathname;
const SERVE_SCRIPT = new URL('./serve-smoke.js', import.meta.url).pathname;
const FIXTURE_YAML = new URL('./smoke-regions.yaml', import.meta.url).pathname;

let failed = 0;
let passed = 0;

function assert(label, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
  }
}

// Strip // line-comments and /* */ block-comments before counting active code.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // /* ... */
    .replace(/\/\/.*$/gm, '');         // // ...
}

function countOccurrences(haystack, needle) {
  let n = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n += 1;
    i += needle.length;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Section 1 — src/cli/format.js source-text assertions
// ---------------------------------------------------------------------------
console.log('\n[1/4] src/cli/format.js source-text checks');
{
  const raw = await readFile(FORMAT_PATH, 'utf8');
  const code = stripComments(raw);

  assert(
    "imports RegionError from '../capture/region.js'",
    countOccurrences(raw, "import { RegionError } from '../capture/region.js'") === 1,
  );
  assert(
    'contains `if (err instanceof RegionError)` branch',
    countOccurrences(code, 'if (err instanceof RegionError)') === 1,
  );
  assert(
    'Guard 1 (!(err instanceof Error)) still present',
    countOccurrences(code, '!(err instanceof Error)') === 1,
  );
  assert(
    'Guard 2 (ConfigError) still present',
    countOccurrences(code, 'if (err instanceof ConfigError)') === 1,
  );
  assert(
    'Guard 3 (BrowserError) still present',
    countOccurrences(code, 'if (err instanceof BrowserError)') === 1,
  );
}

// ---------------------------------------------------------------------------
// Section 2 — src/cli.js source-text assertions
// ---------------------------------------------------------------------------
console.log('\n[2/4] src/cli.js source-text checks');
{
  const raw = await readFile(CLI_PATH, 'utf8');
  const code = stripComments(raw);

  assert(
    "imports RegionError from './capture/region.js'",
    countOccurrences(raw, "import { RegionError } from './capture/region.js'") === 1,
  );
  assert(
    'declares --only <region-name> option (commander required-value form)',
    countOccurrences(code, '--only <region-name>') === 1,
  );
  assert(
    'contains mutex guard predicate `opts.smoke && opts.only`',
    countOccurrences(code, 'opts.smoke && opts.only') === 1,
  );
  assert(
    'passes `only: opts.only` to runCapture',
    countOccurrences(code, 'only: opts.only') === 1,
  );
  assert(
    'result iteration uses `r.regionName ?` ternary for labeling',
    countOccurrences(code, 'r.regionName ?') === 1,
  );
}

// ---------------------------------------------------------------------------
// Section 3 — formatError unit test (in-process import)
// ---------------------------------------------------------------------------
console.log('\n[3/4] formatError unit test for RegionError');
{
  const { formatError } = await import('../src/cli/format.js');
  const { RegionError } = await import('../src/capture/region.js');
  const out = formatError(new RegionError('test message X'));
  assert('output contains Error: prefix', out.includes('Error:'), JSON.stringify(out));
  assert('output contains the message body', out.includes('test message X'), JSON.stringify(out));
  assert(
    'output does NOT fall through to default branch (no "Unexpected error:")',
    !out.includes('Unexpected error:'),
    JSON.stringify(out),
  );
  assert(
    'output is single-line (no stack trace)',
    out.split('\n').length === 1,
    `lines=${out.split('\n').length}`,
  );

  // BrowserError + ConfigError unchanged (regression check)
  const { ConfigError } = await import('../src/config/load.js');
  const { BrowserError } = await import('../src/browser/launcher.js');
  const cfgOut = formatError(new ConfigError('cfg-msg'));
  const brOut = formatError(new BrowserError('br-msg'));
  assert('ConfigError still formats with Error: prefix', cfgOut.includes('Error:') && cfgOut.includes('cfg-msg'));
  assert('BrowserError still formats with Error: prefix', brOut.includes('Error:') && brOut.includes('br-msg'));
}

// ---------------------------------------------------------------------------
// Section 4 — Live CLI behaviors against the hermetic server
// ---------------------------------------------------------------------------
console.log('\n[4/4] live CLI checks against samples/serve-smoke.js');
async function startServer() {
  const child = spawn(process.execPath, [SERVE_SCRIPT], { stdio: 'ignore' });
  for (let i = 0; i < 30; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get('http://127.0.0.1:7357/', (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else reject(new Error('status ' + res.statusCode));
        });
        req.on('error', reject);
        req.setTimeout(500, () => req.destroy(new Error('connect timeout')));
      });
      return child;
    } catch {
      await sleep(100);
    }
  }
  throw new Error('fixture server did not come up within 3s');
}

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [INDEX_PATH, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => { stdout += b.toString(); });
    child.stderr.on('data', (b) => { stderr += b.toString(); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const server = await startServer();
try {
  // 4.1 — --help lists --only
  const help = await runCli(['capture', '--help']);
  assert(
    '`framershot capture --help` lists --only option',
    help.code === 0 && help.stdout.includes('--only'),
    `code=${help.code}; stdout has --only? ${help.stdout.includes('--only')}`,
  );

  // 4.2 — --smoke + --only mutex
  const mutex = await runCli(['capture', FIXTURE_YAML, '--smoke', '--only=hero']);
  assert(
    '--smoke + --only exits non-zero',
    mutex.code !== 0,
    `code=${mutex.code}; stderr=${mutex.stderr.slice(0, 200)}`,
  );
  assert(
    '--smoke + --only message contains "mutually exclusive"',
    mutex.stderr.includes('mutually exclusive') || mutex.stdout.includes('mutually exclusive'),
    `stderr=${mutex.stderr.slice(0, 300)}`,
  );
  assert(
    '--smoke + --only message has clean Error: prefix (no Unexpected error:)',
    (mutex.stderr.includes('Error:') || mutex.stdout.includes('Error:')) &&
      !mutex.stderr.includes('Unexpected error:') &&
      !mutex.stdout.includes('Unexpected error:'),
    `stderr=${mutex.stderr.slice(0, 300)}`,
  );

  // 4.3 — --only=nonexistent
  const unknown = await runCli(['capture', FIXTURE_YAML, '--only=nonexistent']);
  assert(
    '--only=nonexistent exits non-zero',
    unknown.code !== 0,
    `code=${unknown.code}`,
  );
  assert(
    "--only=nonexistent message contains \"Unknown --only region 'nonexistent'\"",
    unknown.stderr.includes("Unknown --only region 'nonexistent'") ||
      unknown.stdout.includes("Unknown --only region 'nonexistent'"),
    `stderr=${unknown.stderr.slice(0, 300)}`,
  );
  assert(
    '--only=nonexistent lists declared regions in the message',
    (unknown.stderr.includes("'hero'") || unknown.stdout.includes("'hero'")) &&
      (unknown.stderr.includes("'cards'") || unknown.stdout.includes("'cards'")),
    `stderr=${unknown.stderr.slice(0, 300)}`,
  );
  assert(
    '--only=nonexistent error has clean Error: prefix (no Unexpected error: or stack)',
    (unknown.stderr.includes('Error:') || unknown.stdout.includes('Error:')) &&
      !unknown.stderr.includes('Unexpected error:') &&
      !unknown.stdout.includes('Unexpected error:') &&
      !unknown.stderr.includes('    at ') &&
      !unknown.stdout.includes('    at '),
    `stderr=${unknown.stderr.slice(0, 400)}`,
  );

  // 4.4 — missing-value: --only with no value should fail
  const missingVal = await runCli(['capture', FIXTURE_YAML, '--only']);
  assert(
    '`--only` without value exits non-zero (commander required-value)',
    missingVal.code !== 0,
    `code=${missingVal.code}; stderr=${missingVal.stderr.slice(0, 200)}`,
  );
} finally {
  server.kill('SIGTERM');
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed · ${failed} failed`);
if (failed > 0) {
  console.error('CLI WIRING FAIL');
  process.exit(1);
}
console.log('CLI WIRING OK');
