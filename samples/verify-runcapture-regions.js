#!/usr/bin/env node
// samples/verify-runcapture-regions.js — Phase 8 Plan 03 hermetic verifier.
//
// Project posture (PROJECT.md "Out of Scope: Unit test suite",
// 08-VALIDATION.md "Framework: None — hermetic smoke fixture"): no jest/vitest/
// node:test scaffolding. This file IS the test for 08-03 Task 1 — it asserts
// every <behavior> bullet from 08-03-PLAN.md's Task 1 AGAINST THE LIVE
// runCapture function and prints `RUNCAPTURE OK` on success, exiting non-zero
// on the first failed assertion.
//
// Run:  node samples/verify-runcapture-regions.js
//
// What this verifies (per 08-03-PLAN.md Task 1 <behavior>):
//   (a) Module import surface — runCapture is a function, accepts opts.only
//   (b) Module-level resolveRegions helper exists in src/capture/runCapture.js
//       (verified via source-text grep — it is module-private, not exported)
//   (c) --only=<unknown> throws RegionError BEFORE any browser launch (no
//       fixture server running on port 7359 — connection would refuse if
//       browser launched and navigated)
//   (d) --only with config.regions === undefined throws RegionError with the
//       sentinel `<no regions declared>` in the message
//   (e) RegionError import — the thrown error is instanceof the SAME class
//       exported from src/capture/region.js
//   (f) Source-shape assertions: import line present, opts destructure
//       includes `only`, captureRegion invoked inside the region loop, no
//       presentation imports, no config mutation

import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const RUNCAPTURE_PATH = path.join(REPO_ROOT, 'src/capture/runCapture.js');

function fail(label, detail) {
  console.error(`FAIL ${label}`);
  if (detail !== undefined) console.error(detail);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Source-text shape assertions — module surface contract from 08-03-PLAN
//    <action> + <acceptance_criteria>.
// ---------------------------------------------------------------------------
const src = await readFile(RUNCAPTURE_PATH, 'utf8');

// Strip line comments and block comments so substring counts measure
// active code, not documentation. This mirrors the 08-02-PLAN approach
// where module-header text was rewritten to avoid grep false positives.
function stripComments(text) {
  return text
    // Strip /* ... */ block comments (non-greedy, multiline)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Strip // ... line comments (to end of line)
    .replace(/\/\/.*$/gm, '');
}
const code = stripComments(src);

function assertContainsCount(haystack, needle, expected, label) {
  // Count non-overlapping substring occurrences.
  let n = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    n += 1;
    idx += needle.length;
  }
  if (n !== expected) {
    fail(`${label}: expected ${expected} occurrences of '${needle}', got ${n}`);
  }
}

// (1a) Import statement: captureRegion + RegionError from ./region.js
assertContainsCount(
  code,
  "import { captureRegion, RegionError } from './region.js'",
  1,
  'src-import-region',
);

// (1b) resolveRegions helper declared (module-level function)
assertContainsCount(code, 'function resolveRegions', 1, 'src-resolveRegions-decl');

// (1c) runCapture export
assertContainsCount(code, 'export async function runCapture', 1, 'src-runCapture-export');

// (1d) opts destructure includes only
assertContainsCount(code, 'only } = {}', 1, 'src-only-in-destructure');

// (1e) captureRegion invoked once inside the region loop
assertContainsCount(code, 'captureRegion(navigatedPage', 1, 'src-captureRegion-callsite');

// (1f) Per-region path resolution uses region.name
assertContainsCount(code, 'region: region.name', 1, 'src-region-name-in-template');

// (1g) Per-region result accumulator
assertContainsCount(code, 'regionName: region.name', 1, 'src-regionName-accumulator');

// (1h) Upfront + per-viewport resolveRegions calls
assertContainsCount(code, 'resolveRegions(config.regions, only)', 2, 'src-resolveRegions-calls');

// (1i) Presentation-free contract preserved
assertContainsCount(code, 'console.', 0, 'src-no-console');
assertContainsCount(code, 'process.exit', 0, 'src-no-process-exit');
assertContainsCount(code, "from 'chalk'", 0, 'src-no-chalk');
assertContainsCount(code, "from 'ora'", 0, 'src-no-ora');

// (1j) Config-mutation anti-pattern absent
//      Should not contain an assignment like `config.regions = ...`
if (/config\.regions\s*=/.test(code)) {
  fail('src-config-regions-mutation', 'forbidden config.regions assignment present');
}

// ---------------------------------------------------------------------------
// 2. Module import surface — dynamic import must succeed; exports preserved.
// ---------------------------------------------------------------------------
const runCaptureMod = await import('../src/capture/runCapture.js');
if (typeof runCaptureMod.runCapture !== 'function') {
  fail('runCapture-not-a-function', typeof runCaptureMod.runCapture);
}
const regionMod = await import('../src/capture/region.js');
if (typeof regionMod.RegionError !== 'function') {
  fail('RegionError-not-importable', typeof regionMod.RegionError);
}

// runCapture.length tracks the declared positional arity of the function.
// Both before and after this plan, runCapture takes (config, opts = {}),
// where opts is destructured. Per 08-03-PLAN Task 1 <behavior>:
//   "runCapture signature declared arity (runCapture.length) is still 1
//    (rest in destructured opts) — no breaking change to the caller surface"
if (runCaptureMod.runCapture.length !== 1) {
  fail('runCapture-arity-changed', runCaptureMod.runCapture.length);
}

// ---------------------------------------------------------------------------
// 3. Upfront --only validation: unknown region name throws RegionError BEFORE
//    any browser launch. The test config points at an unused port so that if
//    runCapture actually attempted to launch Chromium and navigate, it would
//    either hang or throw a connection error (NOT a RegionError).
// ---------------------------------------------------------------------------
const UNUSED_PORT = 7359; // distinct from serve-smoke (7357) and verify-region (7358)
const minimalConfig = {
  name: 'p8-w3-only-validation',
  baseUrl: `http://127.0.0.1:${UNUSED_PORT}`,
  output: '/tmp/framershot-p8-w3-discard/{region}-{page}.png',
  deviceScaleFactor: 2,
  viewports: [{ name: 'd', width: 800, height: 600 }],
  page: { path: '/', name: 'home' },
  prepare: { animations: true, hide: [], scrollPrime: false, extraDelay: 0 },
  regions: [{ name: 'hero', selector: '.x', padding: 0 }],
};

{
  // 3a. --only=nonexistent with declared regions → RegionError that names the
  //     unknown flag and lists the declared region names.
  let caught;
  const t0 = Date.now();
  try {
    await runCaptureMod.runCapture(minimalConfig, {
      onProgress: () => {},
      only: 'nonexistent',
    });
  } catch (err) {
    caught = err;
  }
  const elapsed = Date.now() - t0;
  if (!caught) fail('only-unknown-no-throw');
  if (!(caught instanceof regionMod.RegionError)) {
    fail('only-unknown-not-RegionError', `name=${caught?.name} msg=${caught?.message}`);
  }
  if (!caught.message.includes("Unknown --only region 'nonexistent'")) {
    fail('only-unknown-missing-phrase', caught.message);
  }
  if (!caught.message.includes("'hero'")) {
    fail('only-unknown-missing-declared-name', caught.message);
  }
  // Sanity bound: validation must fire BEFORE browser launch. Browser launch +
  // navigation takes >1s typically. A pure throw from resolveRegions should
  // complete in well under 500ms (closer to single-digit ms).
  if (elapsed > 1000) {
    fail('only-unknown-too-slow-likely-launched-browser', `${elapsed}ms — expected <1000ms`);
  }
}

{
  // 3b. --only=anything with regions: undefined → RegionError with the
  //     '<no regions declared>' sentinel.
  const noRegionsConfig = {
    ...minimalConfig,
    output: '/tmp/framershot-p8-w3-discard/{page}.png',
    regions: undefined,
  };
  let caught;
  const t0 = Date.now();
  try {
    await runCaptureMod.runCapture(noRegionsConfig, {
      onProgress: () => {},
      only: 'anything',
    });
  } catch (err) {
    caught = err;
  }
  const elapsed = Date.now() - t0;
  if (!caught) fail('only-no-regions-no-throw');
  if (!(caught instanceof regionMod.RegionError)) {
    fail('only-no-regions-not-RegionError', `name=${caught?.name} msg=${caught?.message}`);
  }
  if (!caught.message.includes('<no regions declared>')) {
    fail('only-no-regions-missing-sentinel', caught.message);
  }
  if (elapsed > 1000) {
    fail('only-no-regions-too-slow', `${elapsed}ms`);
  }
}

console.log('RUNCAPTURE OK');
