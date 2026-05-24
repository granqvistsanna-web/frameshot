#!/usr/bin/env node
// samples/verify-region-capture.js — Phase 8 Plan 02 hermetic capture verifier.
//
// Project posture (PROJECT.md "Out of Scope: Unit test suite", 08-VALIDATION.md
// "Framework: None — hermetic smoke fixture"): no jest/vitest/node:test
// scaffolding. This file IS the test for 08-02 Task 1 — it asserts every
// behavior bullet from 08-02-PLAN.md's Task 1 <behavior> block AGAINST A LIVE
// PLAYWRIGHT PAGE and prints CAPTURE OK on success, exiting non-zero on the
// first failed assertion. Maps 1:1 to the inline <verify><automated> block in
// 08-02-PLAN.md plus end-to-end Playwright proofs.
//
// Run:  node samples/verify-region-capture.js
//
// Stands up its own ephemeral HTTP server on port 7358 (NOT 7357 — avoids
// collision with samples/serve-smoke.js sibling fixture) hosting region-shaped
// HTML; launches a real Chromium; exercises captureRegion in both selector and
// anchor modes; validates PNGs land on disk with non-zero size and parent dirs
// auto-created.

import http from 'node:http';
import { chromium } from 'playwright-chromium';
import { stat, rm, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 1. Import surface — static contract: module exposes captureRegion + RegionError
// ---------------------------------------------------------------------------
const mod = await import('../src/capture/region.js');

function fail(label, detail) {
  console.error(`FAIL ${label}`);
  if (detail !== undefined) console.error(detail);
  process.exit(1);
}

if (typeof mod.captureRegion !== 'function') fail('captureRegion-not-a-function', typeof mod.captureRegion);
if (typeof mod.RegionError !== 'function') fail('RegionError-not-a-class', typeof mod.RegionError);

// 2. RegionError shape mirrors BrowserError
const e1 = new mod.RegionError('msg-x', { cause: new Error('inner-y') });
if (e1.name !== 'RegionError') fail('RegionError-name', e1.name);
if (e1.message !== 'msg-x') fail('RegionError-message', e1.message);
if (!(e1 instanceof Error)) fail('RegionError-instanceof');
if (!e1.cause || e1.cause.message !== 'inner-y') fail('RegionError-cause', e1.cause);
const e2 = new mod.RegionError('no-cause');
if (e2.cause !== undefined) fail('RegionError-no-cause-leak', e2.cause);

// 3. captureRegion arity check
if (mod.captureRegion.length < 3) fail('captureRegion-arity', mod.captureRegion.length);

// ---------------------------------------------------------------------------
// 4. Stand up a tiny HTTP fixture with region-shaped sections
// ---------------------------------------------------------------------------
const PORT = 7358;
// Hermetic fixture HTML. All capture targets sized to FIT WITHIN the 600px
// viewport so the verifier exercises module contract correctness without
// hitting Playwright's clip-cannot-exceed-viewport limitation that the
// 08-02 plan defers to Plan 04 for end-to-end resolution.
const HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; background: #036; color: #fff; font-family: system-ui; }
    [data-test="region-hero"] { margin: 1rem; padding: 1rem; background: #036; color: #fff; width: 300px; height: 80px; }
    [data-test="region-from"] { margin: 1rem; padding: 0.5rem; background: #063; color: #fff; width: 200px; height: 40px; }
    [data-test="region-to"] { margin: 1rem; padding: 0.5rem; background: #630; color: #fff; width: 200px; height: 40px; }
    [data-test="hidden"] { display: none; }
  </style>
</head>
<body>
  <h1>region capture fixture</h1>
  <section data-test="region-hero">hero (selector capture target)</section>
  <div data-test="hidden">hidden via display:none</div>
  <div data-test="region-from">anchor: from (top)</div>
  <div data-test="region-to">anchor: to (bottom)</div>
</body>
</html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(PORT, '127.0.0.1', resolve);
});

const TMP_ROOT = '/tmp/framershot-region-verify';
await rm(TMP_ROOT, { recursive: true, force: true });

let exitCode = 0;
let browser, context, page;
try {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 800, height: 600 },
    deviceScaleFactor: 2,
    baseURL: `http://127.0.0.1:${PORT}`,
  });
  page = await context.newPage();
  await page.goto('/', { waitUntil: 'networkidle' });

  // PNG signature for buffer validation
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  async function assertPng(filePath, label) {
    const s = await stat(filePath);
    if (!s.isFile() || s.size === 0) fail(`${label}: file missing/empty`, filePath);
    const buf = await readFile(filePath);
    if (buf.subarray(0, 8).compare(PNG_SIG) !== 0) fail(`${label}: not a PNG`, filePath);
    // Parse IHDR (bytes 16-23: width + height as big-endian uint32).
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height, size: s.size };
  }

  // -------------------------------------------------------------------------
  // 5. SELECTOR MODE — happy path, no padding
  // -------------------------------------------------------------------------
  {
    const outPath = path.join(TMP_ROOT, 'sel-nopad', 'hero.png');
    let stepEvent;
    await mod.captureRegion(
      page,
      { name: 'hero', selector: '[data-test="region-hero"]', padding: 0 },
      outPath,
      { onProgress: (ev) => { if (!stepEvent) stepEvent = ev; } },
    );
    const { width, height } = await assertPng(outPath, 'sel-nopad');
    // hero box at deviceScaleFactor=2: width should be > 100 physical px
    if (width < 100 || height < 50) fail('sel-nopad-dimensions', { width, height });

    // onProgress contract
    if (!stepEvent) fail('sel-nopad-onProgress-not-called');
    if (stepEvent.type !== 'step') fail('sel-nopad-onProgress-type', stepEvent);
    if (!stepEvent.label.includes("hero")) fail('sel-nopad-onProgress-label', stepEvent);
  }

  // -------------------------------------------------------------------------
  // 6. SELECTOR MODE — with padding (clamped against doc edges)
  // -------------------------------------------------------------------------
  {
    const outPathNoPad = path.join(TMP_ROOT, 'sel-pad', 'hero-nopad.png');
    const outPathPadded = path.join(TMP_ROOT, 'sel-pad', 'hero-padded.png');
    await mod.captureRegion(page, { name: 'hero', selector: '[data-test="region-hero"]', padding: 0 }, outPathNoPad);
    await mod.captureRegion(page, { name: 'hero', selector: '[data-test="region-hero"]', padding: 20 }, outPathPadded);
    const baseline = await assertPng(outPathNoPad, 'sel-pad-baseline');
    const padded = await assertPng(outPathPadded, 'sel-pad-padded');
    // 20px CSS padding on each side at dsr=2 → 80px additional width AND height (40px CSS × 2)
    // Allow clamping near doc edges to shrink the gain; just assert "strictly larger"
    if (padded.width <= baseline.width || padded.height <= baseline.height) {
      fail('sel-pad-no-growth', { baseline, padded });
    }
  }

  // -------------------------------------------------------------------------
  // 7. SELECTOR MODE — selector matches 0 → RegionError with name+selector+phrase
  // -------------------------------------------------------------------------
  {
    let caught;
    try {
      await mod.captureRegion(page, { name: 'hero', selector: '.does-not-exist' }, path.join(TMP_ROOT, 'unused.png'));
    } catch (err) {
      caught = err;
    }
    if (!caught) fail('sel-missing-no-throw');
    if (!(caught instanceof mod.RegionError)) fail('sel-missing-wrong-error', caught.constructor.name);
    if (!caught.message.includes('hero')) fail('sel-missing-no-name', caught.message);
    if (!caught.message.includes('.does-not-exist')) fail('sel-missing-no-selector', caught.message);
    if (!caught.message.includes('matched no elements')) fail('sel-missing-no-phrase', caught.message);
  }

  // -------------------------------------------------------------------------
  // 8. SELECTOR MODE — display:none element → RegionError mentioning bounding box
  // -------------------------------------------------------------------------
  {
    let caught;
    try {
      await mod.captureRegion(page, { name: 'hero', selector: '[data-test="hidden"]' }, path.join(TMP_ROOT, 'unused.png'));
    } catch (err) {
      caught = err;
    }
    if (!caught) fail('sel-hidden-no-throw');
    if (!(caught instanceof mod.RegionError)) fail('sel-hidden-wrong-error', caught.constructor.name);
    if (!caught.message.includes('hero')) fail('sel-hidden-no-name', caught.message);
    if (!caught.message.toLowerCase().includes('bounding box')) fail('sel-hidden-no-bbox', caught.message);
  }

  // -------------------------------------------------------------------------
  // 9. ANCHOR MODE — happy path with padding
  // -------------------------------------------------------------------------
  {
    const outPath = path.join(TMP_ROOT, 'anc/cards.png');
    await mod.captureRegion(
      page,
      {
        name: 'cards',
        from: '[data-test="region-from"]',
        to: '[data-test="region-to"]',
        padding: 10,
      },
      outPath,
    );
    const { width, height } = await assertPng(outPath, 'anc-happy');
    // anchor union spans both elements (both in viewport for this fixture);
    // height should be larger than a single anchor's ~80px CSS (~160 physical
    // at dsr=2) and width should be > 0.
    if (height < 100 || width < 100) fail('anc-dimensions-too-small', { width, height });
  }

  // -------------------------------------------------------------------------
  // 10. ANCHOR MODE — missing 'from' → RegionError mentioning 'from' selector
  // -------------------------------------------------------------------------
  {
    let caught;
    try {
      await mod.captureRegion(
        page,
        { name: 'cards', from: '.no-from-here', to: '[data-test="region-to"]' },
        path.join(TMP_ROOT, 'unused.png'),
      );
    } catch (err) {
      caught = err;
    }
    if (!caught) fail('anc-missing-from-no-throw');
    if (!(caught instanceof mod.RegionError)) fail('anc-missing-from-wrong-error', caught.constructor.name);
    if (!caught.message.includes('cards')) fail('anc-missing-from-no-name', caught.message);
    if (!caught.message.includes("'from'") || !caught.message.includes('selector')) {
      fail('anc-missing-from-no-from-mention', caught.message);
    }
  }

  // -------------------------------------------------------------------------
  // 11. ANCHOR MODE — missing 'to' → RegionError mentioning 'to' selector
  // -------------------------------------------------------------------------
  {
    let caught;
    try {
      await mod.captureRegion(
        page,
        { name: 'cards', from: '[data-test="region-from"]', to: '.no-to-here' },
        path.join(TMP_ROOT, 'unused.png'),
      );
    } catch (err) {
      caught = err;
    }
    if (!caught) fail('anc-missing-to-no-throw');
    if (!(caught instanceof mod.RegionError)) fail('anc-missing-to-wrong-error', caught.constructor.name);
    if (!caught.message.includes('cards')) fail('anc-missing-to-no-name', caught.message);
    if (!caught.message.includes("'to'") || !caught.message.includes('selector')) {
      fail('anc-missing-to-no-to-mention', caught.message);
    }
  }

  // -------------------------------------------------------------------------
  // 12. PARENT DIRECTORY auto-creation — deeply-nested path
  // -------------------------------------------------------------------------
  {
    const nested = path.join(TMP_ROOT, 'a/b/c/d/deep.png');
    await mod.captureRegion(page, { name: 'hero', selector: '[data-test="region-hero"]' }, nested);
    await assertPng(nested, 'parent-dir-autocreate');
  }
} finally {
  if (page) await page.close().catch(() => {});
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await new Promise((r) => server.close(() => r()));
}

console.log('CAPTURE OK');
process.exit(exitCode);
