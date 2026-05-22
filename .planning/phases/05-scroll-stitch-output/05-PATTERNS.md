# Phase 5: Scroll-Stitch Output — Pattern Map

**Mapped:** 2026-05-22
**Files analyzed:** 4 (3 new modules + 1 CLI modification)
**Analogs found:** 4 / 4 (every new/modified file has a strong in-repo analog)

## Project Conventions (Established by Phases 1–4 — Inherit Verbatim)

| Convention | Source | Apply to All Phase 5 Files |
|------------|--------|----------------------------|
| Module system | `package.json:5` (`"type": "module"`) | ESM only — `import`/`export`, no `require` |
| Module root | All Phase 1–4 source under `src/` | Phase 5 lives at `src/capture/`, NOT `lib/` |
| File naming | `launcher.js`, `navigator.js`, `animations.js`, `scroll.js`, `hide.js` | kebab/lowercase file names; Phase 5 uses `frames.js`, `stitch.js`, `index.js` |
| Function naming | `launchBrowser`, `navigateToPage`, `installAnimationGuards`, `scrollPrime`, `runPreparePipeline` | camelCase verb-first — Phase 5: `captureFrames`, `stitchFrames`, `captureFullPage` |
| Export style | Named exports only — every Phase 1–4 module | No default exports anywhere |
| File header comment | `launcher.js:1-11`, `navigator.js:1-16`, `scroll.js:1-19`, `animations.js:1-22` | First lines = file path + 1-paragraph purpose + "NO console / NO process.exit / NO chalk/ora" reminder + reference to RESEARCH §Pattern/§Pitfall |
| JSDoc on exports | `launcher.js:29-57`, `navigator.js:21-35`, `scroll.js:22-43`, `animations.js:23-39` | Every exported function gets a JSDoc block with `@param`, `@returns`; `@throws` only when an error class is thrown |
| Library posture | `launcher.js:5-7`, `navigator.js:5-8`, `scroll.js:5-8`, `animations.js:6-10`, `hide.js:5-7`, `prepare/index.js:10-15` | `src/capture/*` files MUST follow same posture — silent, throw, no presentation |
| Error class | Phase 3 introduced `BrowserError extends Error` with `{ cause }` (`launcher.js:21-27`); Phase 4 REUSED it; Phase 5 REUSES it too if any wrapping is needed | Do NOT invent a `CaptureError`. Per RESEARCH §Anti-Patterns line 579 + §Architectural Responsibility Map "errors bubble" — for Phase 5 the recommendation is even stronger: **do NOT wrap at all** (let Playwright/sharp/fs errors bubble unchanged; Phase 6 owns formatting) |
| Path style | Relative imports (`../browser/launcher.js`, `./animations.js`) | No `@/` aliases, no tsconfig paths. Phase 5 uses `./frames.js`, `./stitch.js` |
| Lifecycle ownership | CLI owns try/finally (`cli.js:28-68`); library returns/throws | Phase 5 modules MUST accept `Page` as a parameter and NEVER create or close pages, contexts, browsers, or streams |
| Commit message style | `feat(NN-MM): …`, `docs(NN-MM): …`, `fix(NN-MM): …` (git log) | Phase 5 commits use `feat(05-NN)` / `docs(05-NN)` / `fix(05-NN)` |
| Zero new dependencies | Phase 4 SUMMARY + Phase 5 RESEARCH §Package Legitimacy Audit | No additions to `package.json`. sharp 0.33.5 and playwright-chromium 1.60.0 already present |
| ESM `node:` prefix | `cli.js:43-44` (`import('node:fs/promises')`, `import('node:path')`) | Builtins use `node:` prefix consistently — Phase 5 uses `import { mkdir, writeFile } from 'node:fs/promises'` and `import { dirname } from 'node:path'` |

## File Classification

| New/Modified File | Status | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|--------|------|-----------|----------------|---------------|
| `src/capture/frames.js` | NEW | post-nav capture (browser-layer scroll loop + page.screenshot) | sequential request-response (loop of page.evaluate + page.screenshot) | `src/prepare/scroll.js` (scroll-loop primitive); secondary `src/browser/navigator.js` (Playwright Page handle + JSDoc shape) | exact (scroll-loop body is structurally identical to `scroll.js:44-61`) |
| `src/capture/stitch.js` | NEW | io / image-manipulation (sharp composite, pure CPU) | request-response (Buffer[] in → Buffer out) | `src/output/template.js` (pure data transform, zero I/O, single export) | role-match (pure transform from in-memory inputs to in-memory output; not a strong code analog — sharp is unique in the codebase, so RESEARCH §Pattern 2 + §Example 4 are the verbatim source) |
| `src/capture/index.js` | NEW | orchestrator / barrel + only fs touchpoint (mkdir + writeFile) | sequential function composition | `src/prepare/index.js` (orchestrator + barrel that the CLI imports) | exact (same role: single import surface for the CLI, composes peer modules, single async orchestrator function) |
| `src/cli.js` | MODIFIED | CLI glue / lifecycle owner | orchestration (insert two lines in existing try block) | self (existing `cli.js:48-62` else-branch) | exact (replace placeholder JSON dump with `captureFullPage` call + confirmation log; mirror smoke branch's `cli.js:43-47`) |

## Pattern Assignments

---

### `src/capture/frames.js` (NEW — OUT-01, scroll-capture loop)

**Closest analog:** `src/prepare/scroll.js`
**Why this analog:** `scroll.js`'s `scrollPrime` is structurally the same algorithm as `captureFrames`: read geometry once via `page.evaluate`, run a for-loop that scrolls in viewport-height steps, with a per-step wait. The differences are: (a) Phase 5 also reads `devicePixelRatio` in the same evaluate; (b) Phase 5 uses an rAF roundtrip instead of `waitForTimeout(200)`; (c) Phase 5 calls `page.screenshot({ clip, … })` per step and collects buffers; (d) Phase 5 has a clamp-last-frame rule. Every other line maps 1:1.

**File header pattern** (copy from `scroll.js:1-19` verbatim shape — adapt content for Phase 5):
```javascript
// src/prepare/scroll.js
// Phase 4 wave 1: post-navigation scroll prime (PREP-04) and extra delay
// (PREP-05). Exports: scrollPrime(page) and extraDelay(page, ms).
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors from Playwright primitives bubble; the caller
// (src/cli.js via src/prepare/index.js) owns presentation, the try/finally
// lifecycle, and exit codes.
//
// Scroll behavior is ALWAYS 'instant' — NEVER 'smooth' (RESEARCH §Pitfall 6, …
```
Apply to `frames.js`: open with `// src/capture/frames.js` + 1-paragraph "Phase 5 wave 1: scroll-capture loop for OUT-01. Exports: captureFrames(page) → { frames, geometry }." + NO-console/NO-exit/NO-chalk reminder + reference to RESEARCH §Pattern 1 + §Pitfall 1 (last-frame overlap) + §Pitfall 4 (CSS vs physical pixel boundary).

**Module-level constants pattern** (copy from `scroll.js:20`):
```javascript
// scroll.js:20
const INTER_STEP_WAIT_MS = 200;
```
Apply: `frames.js` likely needs no module-level constant (RESEARCH recommends rAF roundtrip, not a fixed timeout). If the planner decides to add a fallback timeout, name it `POST_SCROLL_RAF_TIMEOUT_MS` or similar SCREAMING_SNAKE_CASE.

**JSDoc + signature pattern** (mirror `scroll.js:22-43` for the post-nav-page-consumer shape):
```javascript
// scroll.js:22-43
/**
 * Scroll the page from top to bottom in viewport-height steps, pausing
 * INTER_STEP_WAIT_MS between steps so browser-native lazy-load triggers fire
 * and start their image fetches. After reaching the bottom, scrolls back to
 * the top so Phase 5's capture loop starts from a known scrollY=0 position.
 *
 * @param {import('playwright-chromium').Page} page — a Page already navigated
 *   by navigateToPage (DOM is loaded, fonts ready, animations frozen by
 *   04-01's guards).
 * @returns {Promise<void>}
 *
 * @note Uses `behavior: 'instant'` (the default) on EVERY scrollTo call —
 *   smooth scrolling would animate over ~300ms and race with the 200ms
 *   inter-step wait, causing lazy-load IO triggers to fire at wrong scroll
 *   positions. RESEARCH §Pitfall 6, 04-PATTERNS §Risk 12.
 *
 * @note Geometry (innerHeight, scrollHeight) is read ONCE at the start, not
 *   re-read in the loop. …
 */
export async function scrollPrime(page) {
```
Apply: `export async function captureFrames(page)` with JSDoc that includes `@param {import('playwright-chromium').Page} page — a Page already prepared by Phase 4 (animations frozen, IO triggers fired, hidden selectors removed, scroll-primed; scrollY=0 at entry).` and a structured `@returns` clause matching the inline-object form used in `hide.js:33-37`:
```javascript
 * @returns {Promise<{
 *   frames: Buffer[],
 *   geometry: {
 *     viewportWidth: number,      // CSS pixels
 *     viewportHeight: number,     // CSS pixels
 *     totalHeight: number,        // CSS pixels
 *     frameYOffsets: number[],    // CSS pixels per frame index
 *     deviceScaleFactor: number,  // physical:CSS pixel ratio
 *   }
 * }>}
```
Add `@note` blocks (matching `scroll.js:33-42`'s style) for: (a) `behavior: 'instant'` (RESEARCH §Pitfall 6 — same rule as scroll.js); (b) geometry read ONCE not in loop (RESEARCH §Pitfall 5); (c) last-frame overlap rationale (RESEARCH §Pattern 1 + §Pitfall 1).

**Body shape — geometry read** (mirror `scroll.js:45-48` verbatim, extended with DSR):
```javascript
// scroll.js:45-48
const { innerHeight, totalHeight } = await page.evaluate(() => ({
  innerHeight: window.innerHeight,
  totalHeight: document.documentElement.scrollHeight,
}));
```
Apply (RESEARCH §Pattern 1 lines 309-314 — verbatim usable):
```javascript
const { viewportWidth, viewportHeight, totalHeight, deviceScaleFactor } = await page.evaluate(() => ({
  viewportWidth: window.innerWidth,
  viewportHeight: window.innerHeight,
  totalHeight: document.documentElement.scrollHeight,
  deviceScaleFactor: window.devicePixelRatio,
}));
```

**Body shape — scroll loop step** (mirror `scroll.js:50-55` — same primitive, replace the timeout with rAF + add screenshot):
```javascript
// scroll.js:50-55
for (let y = 0; y < totalHeight; y += innerHeight) {
  await page.evaluate((targetY) => {
    window.scrollTo({ top: targetY, behavior: 'instant' });
  }, y);
  await page.waitForTimeout(INTER_STEP_WAIT_MS);
}
```
Apply (RESEARCH §Pattern 1 lines 337-367 — verbatim usable, but iterate over a pre-computed `frameYOffsets` array rather than the scroll.js for-by-step style so the clamp-last-frame rule fits cleanly):
```javascript
for (const y of frameYOffsets) {
  await page.evaluate((targetY) => {
    window.scrollTo({ top: targetY, behavior: 'instant' });
  }, y);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  const buf = await page.screenshot({
    clip: { x: 0, y, width: viewportWidth, height: viewportHeight },
    animations: 'disabled',
    scale: 'device',
    type: 'png',
  });
  frames.push(buf);
}
```

**Body shape — last-frame clamp** (RESEARCH §Pattern 1 lines 316-333 — no in-repo analog, but the early-empty-input short-circuit posture at `hide.js:45-47` is the closest defensive-branching analog):
```javascript
// hide.js:45-47 — defensive short-circuit at the top
if (!Array.isArray(selectors) || selectors.length === 0) {
  return { matched: 0, missed: [] };
}
```
Apply: defensive single-frame fast path at the top of the geometry section, then full-frames + remainder logic for the multi-frame case:
```javascript
const frameYOffsets = [];
if (totalHeight <= viewportHeight) {
  frameYOffsets.push(0);
} else {
  const nFull = Math.floor(totalHeight / viewportHeight);
  for (let i = 0; i < nFull; i++) frameYOffsets.push(i * viewportHeight);
  if (totalHeight % viewportHeight > 0) frameYOffsets.push(totalHeight - viewportHeight);
}
```

**Error handling pattern — NONE** (let bubble): `scroll.js` has NO try/catch — neither does `hide.js` around the per-selector loop's outer scope (only inside the page-context callback for SyntaxError tolerance). `frames.js` should have NO try/catch around `page.evaluate` or `page.screenshot`. Playwright errors bubble; Phase 6 owns formatting. Same posture as RESEARCH §Anti-Patterns line 580.

**Imports pattern** (mirror `scroll.js` which has ZERO imports — pure Playwright-Page-consumer):
```javascript
// scroll.js — ZERO imports
const INTER_STEP_WAIT_MS = 200;
export async function scrollPrime(page) { ... }
```
Apply: `frames.js` should also have ZERO imports (no `playwright-chromium` import needed — the Page is a parameter; the JSDoc references `import('playwright-chromium').Page` as a type only).

---

### `src/capture/stitch.js` (NEW — OUT-02, sharp composite)

**Closest analog:** `src/output/template.js` (for the pure-data-transform posture)
**Why this analog:** Both are pure, zero-I/O functions that transform an input to an output. `template.js` is a string→string transform; `stitch.js` is a `Buffer[]→Buffer` transform. Both have ZERO external state, zero side effects, no Playwright handles, no fs calls. The "pure transform" shape is the closest match in the codebase. However, sharp is unique to this module — RESEARCH §Pattern 2 (lines 411-466) + §Example 4 (lines 887-922) are the **verbatim** source for the sharp call shape; index.d.ts citations are baked into both.

**File header pattern** (copy from `template.js:1-7` for the pure-transform comment style):
```javascript
// src/output/template.js
// Pure output-path template resolver — zero dependencies, no I/O.
// Callers compute the date string before passing it:
//   new Date().toISOString().slice(0, 10)  // ISO date YYYY-MM-DD — path-safe, locale-invariant. Do not change to toLocaleDateString.
//
// Unknown placeholders (e.g. {foo}) are left literal — typos surface visibly
// in the output path rather than silently being dropped.
```
Apply: open with `// src/capture/stitch.js` + 1-paragraph "Phase 5 wave 1: pure-CPU sharp composite of viewport frames into one full-page PNG buffer. Exports: stitchFrames(frames, geometry) → Buffer." + the standard NO-console/NO-exit/NO-chalk reminder (mirror `scroll.js:5-8`) + a "Pixel dimensions:" + "Last-frame correctness:" comment block (RESEARCH §Pattern 2 lines 398-409 has the verbatim content).

**Imports pattern** (sharp is a third-party package import; closest analog is `launcher.js:12` for the third-party Playwright import):
```javascript
// launcher.js:12 — named import from third-party
import { chromium } from 'playwright-chromium';
```
Apply (sharp uses default export per `node_modules/sharp/lib/index.d.ts:929`):
```javascript
import sharp from 'sharp';
```
**Note:** This is the ONLY default import in the codebase. It is unavoidable — sharp's package exports a default. Document this in the file header comment so future maintainers don't try to "fix" it to a named import.

**JSDoc + signature pattern** (mirror `template.js:27` for the multi-param + return-shape JSDoc minimalism, plus add the rich type info from `hide.js:39`-style returns):

`template.js` has minimal JSDoc; the closer match for rich return-type JSDoc is `hide.js:17-38` and `scroll.js:22-43`. Use those for the verbose form:
```javascript
/**
 * Compose an ordered array of viewport-sized PNG frame buffers into ONE
 * full-page PNG buffer using sharp.composite. The canvas dimensions are
 * derived from the geometry object captureFrames produced.
 *
 * @param {Buffer[]} frames — ordered array of viewport-sized PNG buffers
 *   (each is `viewportWidth · DSR × viewportHeight · DSR` physical pixels).
 *   Order MUST match `geometry.frameYOffsets` (this is the contract
 *   captureFrames upholds).
 * @param {{
 *   viewportWidth: number,
 *   viewportHeight: number,
 *   totalHeight: number,
 *   frameYOffsets: number[],
 *   deviceScaleFactor: number
 * }} geometry — the geometry payload from captureFrames.
 * @returns {Promise<Buffer>} — a PNG buffer of dimensions
 *   `viewportWidth · DSR × totalHeight · DSR` physical pixels.
 */
export async function stitchFrames(frames, geometry) {
```
Verbatim from RESEARCH §Pattern 2 lines 413-432.

**Body shape — destructure + math** (no exact in-repo analog; use RESEARCH §Pattern 2 lines 433-448 verbatim):
```javascript
const { viewportWidth, totalHeight, frameYOffsets, deviceScaleFactor } = geometry;
const canvasWidth = Math.round(viewportWidth * deviceScaleFactor);
const canvasHeight = Math.round(totalHeight * deviceScaleFactor);
const overlays = frames.map((input, i) => ({
  input,
  top: Math.round(frameYOffsets[i] * deviceScaleFactor),
  left: 0,
}));
```
**Math rounding rule** (RESEARCH §Pitfall 8 line 717): use `Math.round` for ALL pixel dimensions. For fractional DSR (rare — 1.25, 1.5), the planner may prefer `Math.ceil` on canvas height so frames never exceed canvas size; verify the chosen rule against the verified failure mode at RESEARCH §Pitfall 8 line 718-720.

**Body shape — sharp pipeline** (no exact in-repo analog; use RESEARCH §Pattern 2 lines 455-465 + §Example 4 verbatim):
```javascript
return sharp({
  create: {
    width: canvasWidth,
    height: canvasHeight,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(overlays)
  .png()
  .toBuffer();
```

**Error handling pattern — NONE** (let bubble): same posture as everywhere else in the project. RESEARCH §Anti-Patterns line 579: "Don't catch sharp errors in `stitch.js` and rewrap them. Let them bubble. Phase 6 formats."

---

### `src/capture/index.js` (NEW — OUT-03, orchestrator + fs write)

**Closest analog:** `src/prepare/index.js`
**Why this analog:** Both are sub-module barrels that the CLI imports from. Both compose 2+ peer modules into one async pipeline function. Both have the "single import surface" property — `cli.js:6` imports `{ installAnimationGuards, runPreparePipeline }` from `./prepare/index.js`; Phase 5 should mirror this with `cli.js` importing `{ captureFullPage }` from `./capture/index.js`. The CLI does NOT import directly from `frames.js` or `stitch.js`.

**File header pattern** (copy from `prepare/index.js:1-21` verbatim shape):
```javascript
// src/prepare/index.js
// Phase 4 wave 1: prepare-pipeline orchestrator + barrel. Single import
// surface for src/cli.js — the CLI imports BOTH lifecycle halves from
// here (no direct import from animations.js / hide.js / scroll.js).
//
// Exports:
//   - installAnimationGuards (re-export from ./animations.js) — pre-nav
//   - runPreparePipeline(page, prepareConfig) → { hideSummary } — post-nav
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors from composed calls bubble; the caller
// (src/cli.js, wired in 04-05) owns presentation, the try/finally lifecycle,
// and exit codes. NO try/catch around the composed calls. NO instrumentation
// (timing instrumentation lives in cli.js per 04-05 — RESEARCH §Anti-Patterns
// line 597, 04-PATTERNS §Risk 13).
//
// Step order is fixed (RESEARCH §Pattern 4 lines 529-541):
//   1. hideSelectors  — hides elements before they trigger any lazy fetches
//   2. scrollPrime    — gated on prepareConfig.scrollPrime (schema.js:29)
//   3. extraDelay     — unconditional call; function short-circuits on ms<=0
```
Apply to `capture/index.js`: open with `// src/capture/index.js` + 1-paragraph "Phase 5 orchestrator + barrel. Single import surface for src/cli.js. Exports: captureFullPage(page, outputPath) — composes captureFrames → stitchFrames → mkdir + writeFile." + NO-console/NO-exit/NO-chalk reminder + reference to RESEARCH §Pattern 3 + §Pitfall 7 (mkdir on dirname, NOT outputPath itself) + §Pitfall 11 (do NOT re-run prepare) + §Pitfall 12 (do NOT close anything).

**Imports pattern** (mirror `prepare/index.js:22-24` for same-folder peer imports + the existing `cli.js:43-44` for `node:fs/promises` + `node:path` builtins):
```javascript
// prepare/index.js:22-24
import { hideSelectors } from './hide.js';
import { scrollPrime, extraDelay } from './scroll.js';
export { installAnimationGuards } from './animations.js';

// cli.js:43-44 (smoke branch — dynamic import; Phase 5 uses static at top)
const { mkdir } = await import('node:fs/promises');
const { dirname } = await import('node:path');
```
Apply (RESEARCH §Pattern 3 lines 491-494 — verbatim usable):
```javascript
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { captureFrames } from './frames.js';
import { stitchFrames } from './stitch.js';
```
**Drift note:** `cli.js:43-44` uses DYNAMIC import inside the action callback. The Phase 5 orchestrator should use STATIC top-of-file import — modules at the library layer use static imports (`launcher.js:12`, `navigator.js:17`, `prepare/*.js`). The dynamic import in `cli.js` is a Phase 3 quirk that the planner should NOT propagate.

**JSDoc + signature pattern** (mirror `prepare/index.js:26-39`):
```javascript
// prepare/index.js:26-39
/**
 * Run the post-navigation prep pipeline: hideSelectors → scrollPrime → extraDelay.
 * Animation guards (PREP-01 + PREP-02) are installed separately by installAnimationGuards
 * BEFORE navigation; this function does NOT touch them.
 *
 * @param {import('playwright-chromium').Page} page — a Page already returned by navigateToPage.
 * @param {{ animations: boolean, hide: string[], scrollPrime: boolean, extraDelay: number }} prepareConfig
 *   The validated config.prepare sub-object. Reads `prepareConfig.hide` (PREP-03),
 *   `prepareConfig.scrollPrime` (PREP-04 gate), `prepareConfig.extraDelay` (PREP-05).
 *   The `animations` boolean is NOT read — its scope is the pre-nav guards which run elsewhere.
 * @returns {Promise<{ hideSummary: { matched: number, missed: string[] } }>}
 *   Informational pass-through. Phase 4 ignores; Phase 6 (CLI-03) will surface
 *   hideSummary.missed as warnings.
 */
export async function runPreparePipeline(page, prepareConfig) {
```
Apply (RESEARCH §Pattern 3 lines 496-507):
```javascript
/**
 * Full-page capture orchestrator. Scroll-and-stitch a prepared page into one
 * PNG file at the resolved output path, creating parent directories as needed.
 *
 * @param {import('playwright-chromium').Page} page — a Page already prepared by
 *   Phase 4 (animations frozen, IO triggers fired, hidden selectors removed,
 *   scroll-primed; scrollY=0 at entry).
 * @param {string} outputPath — absolute or relative resolved path (Phase 2's
 *   `resolveTemplate` already substituted {date}, {viewport}, {page}). Parent
 *   directories will be created with { recursive: true } if missing.
 * @returns {Promise<void>}
 */
export async function captureFullPage(page, outputPath) {
```

**Body shape — three-step orchestration** (mirror `prepare/index.js:40-53` for the comment+step style):
```javascript
// prepare/index.js:40-53
export async function runPreparePipeline(page, prepareConfig) {
  // PREP-03 — hide selectors. Empty list is a no-op (hide.js short-circuits).
  const hideSummary = await hideSelectors(page, prepareConfig.hide);
  // PREP-04 — scroll prime. Gated by config; defaults to true.
  if (prepareConfig.scrollPrime) {
    await scrollPrime(page);
  }
  // PREP-05 — extra delay. Defaults to 0; the helper short-circuits on <=0.
  await extraDelay(page, prepareConfig.extraDelay);
  return { hideSummary };
}
```
Apply (RESEARCH §Pattern 3 lines 508-519 — verbatim usable):
```javascript
export async function captureFullPage(page, outputPath) {
  // Step 1 — OUT-01: scroll + per-viewport screenshots → ordered PNG Buffers + geometry.
  const { frames, geometry } = await captureFrames(page);
  // Step 2 — OUT-02: sharp composite → one full-page PNG Buffer.
  const pngBuffer = await stitchFrames(frames, geometry);
  // Step 3 — OUT-03: mkdir parent + writeFile. Same fs/promises pattern
  // cli.js:43-45 uses for the smoke screenshot's parent dir.
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, pngBuffer);
}
```

**fs/promises mkdir + writeFile pattern** (copy from `cli.js:43-45` — the canonical in-repo precedent):
```javascript
// cli.js:43-45 (smoke branch)
const { mkdir } = await import('node:fs/promises');
const { dirname } = await import('node:path');
await mkdir(dirname(resolvedOutput), { recursive: true });
await navigatedPage.screenshot({ path: resolvedOutput, fullPage: false, animations: 'disabled' });
```
**Key invariant** (RESEARCH §Pitfall 7): always `mkdir(dirname(outputPath), { recursive: true })` — NEVER `mkdir(outputPath, …)`. The cli.js smoke branch already does this correctly; Phase 5 mirrors it exactly.

**Error handling pattern — NONE** (let bubble): same posture as `prepare/index.js` — no try/catch around any of the three composed steps. If `captureFrames` throws, the user sees the underlying Playwright error. If `stitchFrames` throws, the sharp error. If `mkdir`/`writeFile` throws, the Node fs error. Phase 6 formats all three.

---

### `src/cli.js` (MODIFIED — wire captureFullPage into else-branch)

**Closest analog:** itself — `src/cli.js:48-62` (the existing placeholder else-branch).
**Why this analog:** Phase 5 surgically replaces the placeholder JSON dump with the new `captureFullPage` call. No new flag, no lifecycle change, no new try/catch. The smoke branch stays untouched.

**Existing pattern to extend** (`cli.js:1-6, 28-68`):
```javascript
// cli.js:1-6
import { Command } from 'commander';
import { loadConfig } from './config/load.js';
import { resolveTemplate } from './output/template.js';
import { launchBrowser } from './browser/launcher.js';
import { navigateToPage } from './browser/navigator.js';
import { installAnimationGuards, runPreparePipeline } from './prepare/index.js';

// cli.js:28-68 (try/finally body)
const { browser, context } = await launchBrowser(config);
try {
  await installAnimationGuards(context, config.prepare);
  const navigatedPage = await navigateToPage(context, config.page);
  if (opts.smoke) console.time('prepare');
  const { hideSummary } = await runPreparePipeline(navigatedPage, config.prepare);
  if (opts.smoke) console.timeEnd('prepare');
  if (opts.smoke) {
    const { mkdir } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    await mkdir(dirname(resolvedOutput), { recursive: true });
    await navigatedPage.screenshot({ path: resolvedOutput, fullPage: false, animations: 'disabled' });
    console.log(`smoke screenshot written: ${resolvedOutput}`);
  } else {
    // Phase 3 boundary: Phase 4 (prepare) and Phase 5 (capture loop)
    // will replace this branch. For now, confirm the page is up.
    console.log(JSON.stringify({ ...config, _resolvedOutput: resolvedOutput, _navigated: navigatedPage.url() }, null, 2));
  }
} finally {
  await context.close();
  await browser.close();
}
```

**Modifications** (RESEARCH §Pattern 4 lines 522-571):

1. **Add import** at `cli.js:6` (after the `./prepare/index.js` line — extend the existing block):
   ```javascript
   import { captureFullPage } from './capture/index.js';
   ```
   Mirrors the `./browser/...` and `./prepare/...` import style. Same-pattern import lines are alphabetized loosely by depth; planner may keep this at the bottom of the import block since it's the last layer in the lifecycle order.

2. **Replace the else-branch body** at `cli.js:48-62`. Swap the `console.log(JSON.stringify(...))` placeholder with the production capture path:
   ```javascript
   } else {
     // Phase 5: full-page scroll-and-stitch capture writes the PNG.
     // captureFullPage owns the mkdir + writeFile internally — the CLI
     // does NOT need a parallel mkdir call (unlike the smoke branch).
     await captureFullPage(navigatedPage, resolvedOutput);
     console.log(`screenshot written: ${resolvedOutput}`);
   }
   ```
   Confirmation log style mirrors the smoke branch's `cli.js:47` (`smoke screenshot written: ${resolvedOutput}`). Use the same backtick template string, same lowercase phrasing, same `${resolvedOutput}` interpolation.

3. **Do NOT touch the `--smoke` branch** (`cli.js:37-47`). It stays semantically as "ONE viewport screenshot." RESEARCH §Pitfall 9 documents exactly this anti-pattern: do not collapse smoke and production into the same call.

4. **Do NOT touch the try/finally lifecycle** (`cli.js:28, 63-67`). `context.close()` BEFORE `browser.close()` — Phase 3 invariant. `launchBrowser` outside try, navigation+prepare+capture inside try. Do not touch.

5. **Do NOT touch the `console.time('prepare')` instrumentation** (`cli.js:32, 36`). It belongs to Phase 4; Phase 5 does not add or remove timing.

**Lifecycle invariant to preserve** (cli.js:63-67):
```javascript
} finally {
  await context.close();
  await browser.close();
}
```
Phase 5 must NOT add cleanup logic to this block. Phase 5 must NOT throw to skip it. `captureFullPage` failing leaves cli.js's finally block intact; context+browser still close cleanly. Verified by Phase 3's RESEARCH and 04-PATTERNS §Shared Patterns "Lifecycle owned by CLI."

---

## Shared Patterns (Cross-Cutting)

### Library posture (library code is silent)
**Source:** `src/browser/launcher.js:5-7`, `src/browser/navigator.js:5-8`, `src/prepare/scroll.js:5-8`, `src/prepare/animations.js:6-10`, `src/prepare/hide.js:5-7`, `src/prepare/index.js:10-15`
**Apply to:** All of `src/capture/*.js`
```javascript
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors from [Playwright primitives | sharp | fs/promises]
// bubble; the caller (src/cli.js [via src/capture/index.js]) owns presentation,
// the try/finally lifecycle, and exit codes.
```
The single most-violated invariant under time pressure. Every capture module must repeat the disclaimer at the top of the file. RESEARCH §Anti-Patterns line 580: "Don't log progress from `src/capture/*` — Phase 6 (CLI-02) owns spinner output."

### Lifecycle owned by CLI, never by library modules
**Source:** `src/cli.js:28-68` (the try/finally block)
**Apply to:** Every Phase 5 module must accept `page` and `outputPath` as parameters; NEVER create, close, or replace them. Same posture as `installAnimationGuards`/`runPreparePipeline` from Phase 4. RESEARCH §Pitfall 12 documents the failure mode (close-twice → "Context already closed").

### Error handling: let it bubble (no wrap)
**Source:** `src/prepare/scroll.js` (NO try/catch); `src/prepare/animations.js` (NO try/catch); `src/prepare/index.js` (NO try/catch). Compare to `src/browser/launcher.js:58-68` and `src/browser/navigator.js:46-62` which DO wrap into `BrowserError` because those are the network/binary-dependency boundaries.
**Apply to:**
- `frames.js`, `stitch.js`, `index.js` (capture orchestrator) → NO try/catch.
- Phase 5 does NOT introduce a `CaptureError` class. RESEARCH §Architectural Responsibility Map: "Phase 5 throws with `cause` preserved; Phase 6 formats. Same posture as `BrowserError` from Phase 3." — read this as "if any wrapping is ever needed, reuse `BrowserError` from `'../browser/launcher.js'`." For v0.1 the recommendation is even stronger: do NOT wrap at all.

### Defensive empty-input / fast-path short-circuit
**Source:** `src/prepare/hide.js:45-47` (`if (!Array.isArray(selectors) || selectors.length === 0) return …`), `src/prepare/scroll.js:78` (`if (ms <= 0) return;`), `src/prepare/animations.js:44` (`if (!prepareConfig.animations) return;`)
**Apply to:**
- `frames.js`: single-frame fast path when `totalHeight <= viewportHeight` (RESEARCH §Pattern 1 lines 318-321).
- `stitch.js`: NOT applicable as a guard (frames is always non-empty after captureFrames returns; the math handles single-frame and multi-frame uniformly).
- `index.js` (orchestrator): NOT applicable (no inputs that warrant a guard; Phase 4 prepare contract guarantees the Page state).
Pattern: `if (!cond) return earlyDefault;` at the top of each function body that benefits.

### JSDoc with Playwright type references
**Source:** `src/browser/navigator.js:31-33`, `src/prepare/scroll.js:28-30`, `src/prepare/animations.js:27`, `src/prepare/hide.js:28-29`, `src/prepare/index.js:31`
```javascript
 * @param {import('playwright-chromium').Page} page — a Page already returned by navigateToPage.
 * @returns {Promise<import('playwright-chromium').Page>}
```
**Apply to:** Every exported function in `src/capture/*` that takes or returns a Playwright handle. Use the `import('playwright-chromium').Page` form. Use inline-object form (`{ frames: Buffer[], geometry: { ... } }`) for return shapes. Do NOT import the actual Page class for typing — JSDoc-only references avoid runtime imports.

### CLI-owned mkdir-then-write pattern
**Source:** `src/cli.js:43-46` (smoke branch — the canonical in-repo precedent)
```javascript
const { mkdir } = await import('node:fs/promises');
const { dirname } = await import('node:path');
await mkdir(dirname(resolvedOutput), { recursive: true });
await navigatedPage.screenshot({ path: resolvedOutput, fullPage: false, animations: 'disabled' });
```
**Apply to:** `src/capture/index.js`'s mkdir+writeFile pair. **One change vs. the smoke precedent:** use STATIC top-of-file imports (not dynamic), per the convention every other library module follows. The smoke branch's dynamic import is a Phase 3 wave-2 quirk, not a pattern to propagate.

### Commit message style
**Source:** git log (last 15 commits)
```
feat(05-NN): <imperative summary>     — implementation work
docs(05-NN): <summary>                — plan / summary docs
fix(05-NN): <summary>                 — review-found fixes
feat(05): / docs(05):                 — phase-level work spanning plans
```
**Apply to:** Phase 5 commits. Plans map to: 05-01 = `frames.js`, 05-02 = `stitch.js`, 05-03 = `index.js` + CLI wiring (per RESEARCH lines 28-31).

### Schema-shape consumption (no new keys; nothing read from config in capture)
**Source:** Phase 4 consumed `config.prepare.{animations, hide, scrollPrime, extraDelay}`. Phase 5 consumes NOTHING from config — `captureFullPage(page, outputPath)` takes only a Page and an already-resolved string.
**Apply to:** No Phase 5 module imports from `src/config/schema.js`. No Phase 5 module reads `config.*` properties. The Page is opaque from the config layer's perspective; the outputPath is a string from the template resolver. RESEARCH §Locked Decisions: "No schema changes. No new `output.*` or `stitch.*` keys."

---

## Drift Risks (Planner — flag these explicitly in each PLAN)

These are the failure modes most likely to surface if the planner doesn't anchor each capture module to a specific existing analog. Each risk maps to a temptation to invent rather than reuse, and each is enumerated in RESEARCH §Anti-Patterns or §Pitfalls.

### Risk 1: Using `page.screenshot({ fullPage: true })` anywhere in `src/capture/*`
**Temptation:** "Why hand-roll scroll-and-stitch when Playwright has fullPage?"
**Why it would happen:** A skim of Playwright docs surfaces fullPage as the obvious primitive.
**Why it's wrong:** PROJECT.md Key Decisions table: "Manual scroll-and-stitch with sharp lets us hide once and assemble cleanly." Native fullPage re-renders sticky elements per pass. This is the WHOLE REASON the project exists. Phase 3 added the gate `! grep -rq 'fullPage: true' src/`; Phase 4 reinforced it (04-PATTERNS §What NOT To Do #13). Phase 5 must NOT break it.
**Anchor:** RESEARCH §Anti-Patterns line 575 + PROJECT.md:63.

### Risk 2: Inventing a `CaptureError` class
**Temptation:** Symmetry with `BrowserError` from Phase 3.
**Why it would happen:** Phase 3 has `BrowserError`; Phase 4 reuses it; "Phase 5 should have its own."
**Why it's wrong:** RESEARCH §Architectural Responsibility Map: "Phase 5 throws with `cause` preserved; Phase 6 formats. Same posture as `BrowserError` from Phase 3." The recommendation is to let errors bubble UNWRAPPED. Phase 6 owns formatting; an error class just adds surface for the same expressive power. 04-PATTERNS §Risk 1 documents the same temptation for Phase 4 and rejects it; same rule applies here.
**Anchor:** Reuse `BrowserError` from `'../browser/launcher.js'` IF wrapping is ever needed. Default: don't wrap.

### Risk 3: Adding `console.log` / `chalk` / `ora` to `src/capture/*`
**Temptation:** This is the "money shot" phase — capture loops show visible progress that users want feedback on.
**Why it would happen:** Phase 5 is the most user-facing work; instinct says show what's happening.
**Why it's wrong:** RESEARCH §Anti-Patterns line 580: "Don't log progress from `src/capture/*` — Phase 6 (CLI-02) owns spinner output. Library code stays silent." The single confirmation line lives in `cli.js` AFTER the await, not inside the library. Phase 4 had the same temptation (04-PATTERNS §Risk 3).
**Anchor:** `navigator.js:50-52` comment ("We intentionally do NOT log here — Phase 6 owns terminal UX").

### Risk 4: Re-running prepare inside `captureFullPage`
**Temptation:** "Defense in depth — let's make sure the page is settled before capture."
**Why it would happen:** Tendency to harden each function against its callers.
**Why it's wrong:** RESEARCH §Pitfall 11 — Phase 4 already prepared the page. Re-running hide+scrollPrime+extraDelay would re-trigger Framer Motion appear-effects (IO shim fires AGAIN on every observe-call), degrade performance, and possibly change correctness. Phase 5 modules NEVER import from `src/prepare/*`.
**Anchor:** Inspect `src/capture/*` for any `import … from '../prepare/...'` line in PR review. Reject on sight.

### Risk 5: Closing context/browser inside Phase 5
**Temptation:** "If captureFrames throws, let's at least try to clean up."
**Why it would happen:** Defensive cleanup instinct.
**Why it's wrong:** RESEARCH §Pitfall 12 — `cli.js:63-67` is the sole owner of context.close() and browser.close(). A double-close from inside Phase 5 + the finally block produces "Context already closed." This is the same rule 04-PATTERNS §Risk 10 documents for Phase 4.
**Anchor:** `src/capture/*` files MUST NOT contain `context.close()` or `browser.close()`. Page handle is consumed; never closed.

### Risk 6: Reading `scrollHeight` inside the capture loop
**Temptation:** "What if the page extends during capture? Better re-measure each iteration."
**Why it would happen:** Defensive instinct.
**Why it's wrong:** RESEARCH §Pitfall 5 — Phase 4's scrollPrime already triggered lazy-load IOs; the geometry is stable at capture time. Re-reading per iteration creates infinite-loop risk and inconsistent canvas math.
**Anchor:** `scroll.js:45-48` reads geometry ONCE at the start; mirror the same posture. RESEARCH §Pattern 1 line 308.

### Risk 7: Using `behavior: 'smooth'` for scrollTo
**Temptation:** Modern websites prefer smooth scrolling for UX.
**Why it would happen:** Muscle memory from frontend development.
**Why it's wrong:** RESEARCH §Anti-Patterns line 576 + Phase 4's exact same lesson (04-PATTERNS §Risk 12). Smooth scrolling animates over ~300ms and races with the rAF wait; sticky elements end up at wrong positions in the screenshot.
**Anchor:** `scroll.js:52, 59` use `behavior: 'instant'`; mirror verbatim.

### Risk 8: `page.waitForTimeout(N)` between scroll and screenshot
**Temptation:** Fixed delays "feel safer" than rAF.
**Why it would happen:** Phase 4's scrollPrime uses `INTER_STEP_WAIT_MS = 200`; surface-pattern-matching says "Phase 5 should do the same."
**Why it's wrong:** RESEARCH §Pitfall 3 + §Anti-Patterns line 577. Phase 4's 200ms was for lazy-load IO firing (a different concern). Phase 5's "wait for paint" is exactly what rAF guarantees — and it's faster (~16ms vs 200ms). Per-frame difference adds up across 10+ frames.
**Anchor:** RESEARCH §Pattern 1 line 352 — `await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));`.

### Risk 9: Hard-coding `deviceScaleFactor = 2`
**Temptation:** "Retina is always 2x, right?"
**Why it would happen:** macOS bias — most dev machines are DSR=2.
**Why it's wrong:** RESEARCH §Don't Hand-Roll table line 596 + §Pitfall 4. DSR can be 1, 1.5, 2, 3, or fractional. The config schema accepts any value; CAP-02 explicitly mentions "2 or 3 for retina." Hard-coding breaks any non-2 case silently. Read from `window.devicePixelRatio` at capture time.
**Anchor:** `frames.js` evaluate block: `deviceScaleFactor: window.devicePixelRatio`.

### Risk 10: Capturing the last frame past page-bottom (Pitfall 1)
**Temptation:** "Just iterate y = 0, vh, 2vh, … until we hit the end."
**Why it would happen:** Natural fixed-step iteration.
**Why it's wrong:** RESEARCH §Pitfall 1 — Playwright clip throws when the rect doesn't intersect the viewport, OR the bottom of the page is undefined-pixel-padded (white/black/transparent). Three failure modes documented; overlap-and-trust-composite is the canonical solution.
**Anchor:** RESEARCH §Pattern 1 lines 327-332. Clamp last frame to `totalHeight - viewportHeight`; rely on sharp's composite-order for the overlap region.

### Risk 11: `mkdir(outputPath, { recursive: true })` instead of `mkdir(dirname(outputPath), …)`
**Temptation:** "ensure the path exists" reads as "mkdir the path."
**Why it would happen:** Quick fingers.
**Why it's wrong:** RESEARCH §Pitfall 7 — `mkdir('foo.png', { recursive: true })` creates a DIRECTORY named `foo.png`, and then `writeFile('foo.png', buf)` fails with EISDIR. `cli.js:43-45` does this CORRECTLY for the smoke branch — copy the pattern.
**Anchor:** `cli.js:44` literally: `await mkdir(dirname(resolvedOutput), { recursive: true });`.

### Risk 12: `mkdir` + `writeFile` via dynamic import (mirroring cli.js smoke quirk)
**Temptation:** `cli.js:43-44` uses dynamic import for `node:fs/promises`; "copy what the codebase does."
**Why it would happen:** Surface-pattern-matching without understanding it.
**Why it's wrong:** The dynamic-import in `cli.js:43-44` is a Phase 3 wave-2 quirk. Every other module in the codebase uses STATIC top-of-file imports for Node builtins (e.g. none currently — Phase 5 is the first library module to use `node:fs/promises`, so it sets the precedent). Static imports are correct: predictable bundling, no runtime import cost per call, clearer dependency graph.
**Anchor:** `frames.js`/`stitch.js`/`index.js` use static `import` statements at the top.

### Risk 13: Adding a CLI flag for Phase 5 (`--full-page`, `--no-stitch`, `--quality`)
**Temptation:** "Phase 5 is significant; it should have its own flag like Phase 3's `--smoke`."
**Why it would happen:** Phase 3 added `--smoke`; Phase 4 considered (and rejected) adding one; Phase 5 might fall for the same trap.
**Why it's wrong:** RESEARCH §Locked Decisions: "No CLI flags added in Phase 5. The non-`--smoke` branch (currently a `JSON.stringify` placeholder at `cli.js:48-61`) BECOMES the call to `captureFullPage`." There is no alternative production behavior to toggle. Tuning knobs (PNG compression, max page height) are deferred per §Open Questions.
**Anchor:** `cli.js:19` keeps the single `--smoke` option. Phase 5 modifies the action body only.

### Risk 14: Using sharp 0.34 (latest) instead of 0.33 (pinned)
**Temptation:** "Update to current."
**Why it would happen:** `npm view sharp version` shows a newer version; instinct says upgrade.
**Why it's wrong:** RESEARCH §Standard Stack: "project pin `\"^0.33\"` keeps us on 0.33.x and there's no Phase-5 capability gap." Bumping is a separate decision. The composite/create/png APIs needed for Phase 5 are fully sufficient in 0.33.5.
**Anchor:** `package.json:19` (`"sharp": "^0.33"`). Do not touch in Phase 5.

### Risk 15: Adding `sharp.cache(false)` or `sharp.concurrency(N)` calls
**Temptation:** Tuning for performance.
**Why it would happen:** Sharp's docs surface these knobs prominently.
**Why it's wrong:** RESEARCH §Anti-Patterns line 583 — defaults are appropriate for v0.1's personal-tool scale. Premature tuning. Personal tool, infrequent runs; PNG file size is not the bottleneck.
**Anchor:** `stitch.js` calls `sharp({ create }).composite().png().toBuffer()` — nothing more.

### Risk 16: Using `omitBackground: true` on `page.screenshot`
**Temptation:** "Transparent canvas + transparent screenshots = clean composite."
**Why it would happen:** The sharp canvas is `channels: 4, background: rgba(0,0,0,0)`; consistency instinct.
**Why it's wrong:** RESEARCH §Claude's Discretion (Phase 5 discretion area for omitBackground): "Solid pages should keep their background. The blank canvas under the composite IS transparent but every pixel is overwritten by the first composite anyway. Setting omitBackground: true on the per-frame screenshots would produce transparent areas where the page background is absent (e.g. corners during scroll bounce), and there is no benefit."
**Anchor:** RESEARCH §Pattern 1 line 364: "omitBackground intentionally not set — the page's own background is wanted."

### Risk 17: Changing `scale: 'device'` to `'css'`
**Temptation:** "css mode is simpler — pixels are pixels."
**Why it would happen:** Misunderstanding what DSR does.
**Why it's wrong:** RESEARCH §Anti-Patterns line 588: "Defeats deviceScaleFactor, breaks CAP-02 (retina quality)." The whole Phase 3 viewport+DSR work is undone if we screenshot in CSS mode.
**Anchor:** RESEARCH §Pattern 1 line 363 — `scale: 'device'`. Document the choice explicitly.

### Risk 18: Moving sticky-element handling into Phase 5
**Temptation:** OUT-02 SC #3 says "Sticky navigation elements appear exactly once at the top." Naive read: "Phase 5 must detect sticky elements."
**Why it would happen:** Reading the SC literally.
**Why it's wrong:** RESEARCH §Pitfall 2 — Phase 4's `hide` list owns sticky-handling. If the user adds `nav.sticky` to `prepare.hide`, Phase 4 hides it with `visibility: hidden !important` (preserves layout, scrollHeight unchanged). Phase 5 then captures cleanly. If the user forgets, the ghosting is a config bug, not a Phase 5 bug.
**Anchor:** RESEARCH §Locked Decisions: "Sticky elements are already hidden by Phase 4's `hide` list. Phase 5 does NOT have to do additional sticky-detection."

### Risk 19: Hand-rolling PNG manipulation (chunk concatenation, sharp-bypass)
**Temptation:** "PNG is just bytes; let's avoid the sharp dependency."
**Why it would happen:** Anti-dependency instinct.
**Why it's wrong:** RESEARCH §Don't Hand-Roll line 595 — "PNG chunk concatenation is non-trivial (IHDR width/height must match, IDAT chunks must be re-deflated, CRC32 must be recomputed). sharp handles all of this via libvips natively." Also: sharp is ALREADY a dependency from Phase 1.
**Anchor:** `package.json:19` — sharp is approved. Use it.

### Risk 20: Decoding each frame buffer with `sharp(buf)` before composite
**Temptation:** "Sharp composite expects raw RGBA, doesn't it?"
**Why it would happen:** Misreading the API.
**Why it's wrong:** RESEARCH §Anti-Patterns line 586: "sharp's composite accepts PNG buffers directly as overlays. Pre-loading each is wasted decode+re-encode work." Verified at sharp index.d.ts:1487 — `input?: string | Buffer | { create: Create } | …`.
**Anchor:** `stitch.js` builds `overlays = frames.map(input => ({ input, top, left }))` — pass the Buffer directly, no `sharp(buf)` wrapper.

---

## No Analog Found

None. Every Phase 5 file has at least a role-match analog in the existing codebase. `frames.js` mirrors `scroll.js`'s scroll-loop almost verbatim. `index.js` mirrors `prepare/index.js`'s orchestrator-barrel role exactly. `cli.js` modification is a self-analog (extend the existing else-branch). The one outlier is `stitch.js` — sharp is unique to this module and has no prior codebase use — but RESEARCH §Pattern 2 and §Example 4 provide the verbatim sharp call shape (with index.d.ts line numbers cited), so the planner's `<read_first>` list for the 05-02 task can include `node_modules/sharp/lib/index.d.ts` excerpts as the substitute analog.

---

## Metadata

**Analog search scope:**
- `/Users/sannagranqvist/Documents/App/screenshotter/src/browser/` (launcher.js, navigator.js)
- `/Users/sannagranqvist/Documents/App/screenshotter/src/prepare/` (animations.js, hide.js, scroll.js, index.js — all four read in full)
- `/Users/sannagranqvist/Documents/App/screenshotter/src/output/` (template.js)
- `/Users/sannagranqvist/Documents/App/screenshotter/src/config/` (load.js, schema.js — listed, not read in full)
- `/Users/sannagranqvist/Documents/App/screenshotter/src/cli.js` (read in full)
- `/Users/sannagranqvist/Documents/App/screenshotter/package.json`
- `/Users/sannagranqvist/Documents/App/screenshotter/.planning/PROJECT.md`
- `/Users/sannagranqvist/Documents/App/screenshotter/.planning/REQUIREMENTS.md`
- `/Users/sannagranqvist/Documents/App/screenshotter/.planning/phases/04-prepare-pipeline/04-PATTERNS.md`
- `/Users/sannagranqvist/Documents/App/screenshotter/.planning/phases/05-scroll-stitch-output/05-RESEARCH.md`
- git log (last 20 commits) for message style

**Files read in full:** 8 (cli.js, launcher.js, navigator.js, scroll.js, hide.js, animations.js, prepare/index.js, output/template.js — all ≤ 130 lines)
**Files partially read:** 05-RESEARCH.md (read pages covering §Summary, §Architectural Responsibility Map, §Standard Stack, §Architecture Patterns, §Anti-Patterns, §Don't Hand-Roll, §Common Pitfalls 1–12, §Code Examples 1–5). PATTERNS-relevant content is concentrated in §Pattern 1–4 and §Anti-Patterns; all cited line ranges verified.
**Project skills directories checked:** `./.claude/` (no skills subdir, only `worktrees/`); `./.agents/` (does not exist). No project skills apply to Phase 5.
**Project instructions checked:** `./CLAUDE.md` does not exist; conventions come from `.planning/PROJECT.md` and locked decisions in Phase 1–4 SUMMARYs.
**Pattern extraction date:** 2026-05-22

## PATTERN MAPPING COMPLETE

**Phase:** 5 — Scroll-Stitch Output
**Files classified:** 4 (3 new + 1 modified)
**Analogs found:** 4 / 4

### Coverage
- Files with exact analog: 3 (`frames.js` → `prepare/scroll.js`; `index.js` → `prepare/index.js`; `cli.js` → self)
- Files with role-match analog: 1 (`stitch.js` → `output/template.js` for pure-transform posture; sharp specifics from RESEARCH §Pattern 2 + index.d.ts)
- Files with no analog: 0

### Key Patterns Identified
- All Phase 5 modules follow the `src/browser/*` + `src/prepare/*` library-shape posture: NO console output, NO process.exit, NO chalk/ora, NO try/catch around Playwright/sharp/fs calls; errors bubble to CLI; Phase 6 owns formatting.
- Phase 5 splits cleanly into capture (`frames.js` — mirrors `scroll.js`'s scroll-loop primitive), stitch (`stitch.js` — pure transform), and orchestrator (`index.js` — mirrors `prepare/index.js`'s barrel role for the CLI to consume).
- The CLI in `cli.js:28-68` already owns the try/finally lifecycle; Phase 5 replaces the placeholder else-branch with `await captureFullPage(navigatedPage, resolvedOutput)` + one confirmation log line. No new flag, no new error class, no lifecycle change.
- Sharp is the only "new" primitive in Phase 5 (first real use; declared in package.json since Phase 1) — RESEARCH §Pattern 2 and §Example 4 provide verbatim usable call shapes with index.d.ts citations, so the planner can author 05-02 without needing additional sharp research.

### File Created
`/Users/sannagranqvist/Documents/App/screenshotter/.planning/phases/05-scroll-stitch-output/05-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns (with file paths + line numbers) in 05-NN-PLAN.md files. The Drift Risks section enumerates 20 specific failure modes the planner should pre-empt with explicit "do this not that" callouts in each plan's actions — every risk is anchored to a verified RESEARCH section, file/line, or prior PATTERNS doc.
