// src/capture/index.js
// Phase 5 wave 2: scroll-stitch orchestrator + barrel. Single import surface
// for src/cli.js — the CLI imports captureFullPage from HERE (no direct
// import from frames.js or stitch.js).
//
// Exports:
//   - captureFullPage(page, outputPath, options?) → void — composes captureFrames →
//     stitchFrames → mkdir + writeFile.
//     options.onProgress: (current: number, total: number) => void  ← Phase 6 contract
//     (06-RESEARCH.md §Pattern 2). Optional; backward-compatible. The library calls
//     the callback; the CLI displays. Silent library posture intact.
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors from composed calls bubble; the caller
// (src/cli.js) owns presentation, the try/finally lifecycle, and exit codes.
// NO try/catch around the composed calls.
//
// Lifecycle: takes a prepared Page (Phase 4 already ran) and a resolved output
// path (Phase 2 already resolved). Produces a PNG file on disk. Does NOT close
// the page, context, or browser — the CLI owns lifecycle (Phase 3 invariant;
// cli.js:63-67 owns teardown in finally; Risk 5, Pitfall 12). Does NOT re-run
// any prepare step — Phase 4 (04-04 / 04-05) already prepared the Page;
// Risk 4 + Pitfall 11.
//
// fs invariant (Risk 11, Pitfall 7): mkdir uses dirname(outputPath), NOT
// outputPath itself — mkdir('foo.png', { recursive }) creates a DIRECTORY
// named foo.png and writeFile then fails with EISDIR. cli.js:43-45's smoke
// branch already does this correctly; mirror the pattern with STATIC imports
// (Risk 12 — the cli.js dynamic-import is a Phase 3 quirk; library modules
// use static top-of-file imports).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { captureFrames } from './frames.js';
import { stitchFrames } from './stitch.js';

/**
 * Full-page capture orchestrator. Scroll-and-stitch a prepared page into one
 * PNG file at the resolved output path, creating parent directories as needed.
 *
 * @param {import('playwright-chromium').Page} page — a Page already prepared
 *   by Phase 4 (animations frozen, IO triggers fired, hidden selectors removed,
 *   scroll-primed; scrollY=0 at entry).
 * @param {string} outputPath — absolute or relative resolved path (Phase 2's
 *   `resolveTemplate` already substituted {date}, {viewport}, {page}). Parent
 *   directories will be created with `{ recursive: true }` if missing.
 * @param {{ onProgress?: (current: number, total: number) => void }} [options={}]
 *   Optional options bag. Phase 6 owns this contract — see
 *   .planning/phases/06-terminal-ux/06-RESEARCH.md §Pattern 2.
 *   - onProgress: optional callback invoked by captureFrames once per captured
 *     frame, AFTER the screenshot resolves, with (current, total) where current
 *     is 1-indexed and total is the precomputed frame count. The library does NOT
 *     import ora or chalk; the callback is the bridge. Backward compatible:
 *     omitting options is identical to passing { onProgress: undefined } which
 *     silently no-ops via optional chaining (onProgress?.()).
 * @returns {Promise<void>}
 */
export async function captureFullPage(page, outputPath, options = {}) {
  const { onProgress, hideStickyAfterFirstFrame } = options;

  // Step 1 — OUT-01: scroll + per-viewport screenshots → ordered PNG Buffers + geometry.
  const { frames, geometry } = await captureFrames(page, { onProgress, hideStickyAfterFirstFrame });

  // Step 2 — OUT-02: sharp composite → one full-page PNG Buffer.
  const pngBuffer = await stitchFrames(frames, geometry);

  // Step 3 — OUT-03: mkdir parent + writeFile. Same fs/promises pattern
  // cli.js:43-45 uses for the smoke screenshot's parent dir. mkdir on
  // dirname, NOT outputPath itself (Risk 11, Pitfall 7).
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, pngBuffer);
}
