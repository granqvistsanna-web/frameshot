# Phase 4: Prepare Pipeline — Pattern Map

**Mapped:** 2026-05-22
**Files analyzed:** 7 (4 new modules + 1 CLI modification + 2 fixture extensions)
**Analogs found:** 7 / 7 (every new/modified file has a strong in-repo analog)

## Project Conventions (Established by Phases 1–3)

| Convention | Source | Apply to All Phase 4 Files |
|------------|--------|----------------------------|
| Module system | `package.json:5` (`"type": "module"`) | ESM only — `import`/`export`, no `require` |
| Module root | All Phase 3 source under `src/` | Phase 4 lives at `src/prepare/`, NOT `lib/` |
| File naming | `launcher.js`, `navigator.js`, `serve-smoke.js` | kebab-case file names; lowercase, no scopes |
| Function naming | `launchBrowser`, `navigateToPage`, `loadConfig`, `resolveTemplate` | camelCase verb-first function names |
| Export style | Named exports only (`export async function`, `export class`) | No default exports anywhere |
| File header comment | `launcher.js:1-11`, `navigator.js:1-16` | First lines = file path + 1-paragraph purpose + "NO console / NO process.exit / NO chalk/ora" reminder |
| JSDoc on exports | `launcher.js:14-20`, `navigator.js:21-35` | Every exported function gets a JSDoc block with `@param`, `@returns`, `@throws` |
| Library posture | "NO console output, NO process.exit, NO chalk/ora" (`launcher.js:5-7`, `navigator.js:5-8`) | `src/prepare/*` files MUST follow same posture |
| Error class style | `BrowserError extends Error` with `{ cause }` (`launcher.js:21-27`) | Phase 4 REUSES `BrowserError` — does not create a new error class |
| Path alias style | Relative paths only (`../browser/launcher.js`) | No tsconfig paths, no `@/` aliases |
| Lifecycle ownership | CLI owns try/finally; library code returns/throws (`cli.js:27-61`) | Phase 4 modules do NOT own browser/context lifecycle — only consume the handles the CLI passes them |
| Commit message style | `feat(04-01): ...`, `docs(04): ...`, `fix(NN-MM): ...` (git log) | Phase 4 commits use `feat(04-NN)` / `docs(04-NN)` |
| Zero new dependencies | Phase 3 SUMMARY + Phase 4 RESEARCH §Locked Decisions | No additions to `package.json`; only `playwright-chromium` |

## File Classification

| New/Modified File | Status | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|--------|------|-----------|----------------|---------------|
| `src/prepare/animations.js` | NEW | pre-navigation injector | event-driven (context.addInitScript fires on new-document) | `src/browser/launcher.js` | exact (both write context-level config, both pre-page, both throw BrowserError on Playwright failure) |
| `src/prepare/hide.js` | NEW | post-navigation DOM mutator | request-response (single page.evaluate, returns summary) | `src/browser/navigator.js` | role-match (post-nav page operation, async fn consuming a Playwright Page handle) |
| `src/prepare/scroll.js` | NEW | post-navigation DOM mutator + timer | request-response with side-effects | `src/browser/navigator.js` | role-match (loop of page.evaluate + waitForTimeout — same Playwright primitives navigator uses) |
| `src/prepare/index.js` | NEW | sub-module orchestrator + barrel | sequential function composition | `src/config/load.js` (re-export + orchestrate) and `src/browser/navigator.js` (step-by-step async) | role-match (orchestrator surface for the CLI to import) |
| `src/cli.js` | MODIFIED | CLI glue / lifecycle owner | orchestration | self (existing `cli.js:27-61` capture action body) | exact (insert two new lines in the existing try block) |
| `samples/serve-smoke.js` | MODIFIED | hermetic HTTP fixture | fixture / request-response | self (existing file at samples/serve-smoke.js) | exact (extend the HTML constant with PREP-* fixture elements) |
| `samples/smoke.yaml` | MODIFIED | fixture config | static data | self (existing file) | exact (add `hide:` entry, optionally set `extraDelay` for PREP-05 timing verification) |

## Pattern Assignments

---

### `src/prepare/animations.js` (pre-nav injector, PREP-01 + PREP-02)

**Closest analog:** `src/browser/launcher.js`
**Why this analog:** Both modules operate at the BrowserContext layer BEFORE any Page exists. `launcher.js` writes viewport/DPR/baseURL through `browser.newContext(...)`; `animations.js` writes init scripts through `context.addInitScript(...)`. Both are pre-page configuration with the same lifecycle posture, the same error class, the same JSDoc style.

**Imports pattern** (copy from `launcher.js:12, 17`, then navigator.js:17 for the BrowserError import-from-sibling pattern):
```javascript
// src/browser/launcher.js:12
import { chromium } from 'playwright-chromium';

// src/browser/navigator.js:17
import { BrowserError } from './launcher.js';
```
Apply: animations.js does NOT need `chromium` (no launch), but it MAY import `BrowserError` from `'../browser/launcher.js'` IF the planner decides to wrap addInitScript failures. **However**, RESEARCH.md §What NOT To Do #8 says "NO try/catch around `addInitScript` or `evaluate` in prepare modules. Let failures bubble." → animations.js should NOT import BrowserError and should NOT wrap. Confirm with planner.

**File header pattern** (copy from `launcher.js:1-11`):
```javascript
// src/browser/launcher.js
// Wave 1 of Phase 3: headless Chromium launcher + browser context creation.
// Exports: launchBrowser(config) and BrowserError.
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors throw BrowserError; the caller (src/cli.js, wired
// in 03-02) owns presentation, the try/finally lifecycle, and exit codes.
//
// Import shape locked by Phase 1 commit 95a1c70: ...
```
Apply: animations.js opens with `// src/prepare/animations.js` + a 1-paragraph "Pre-navigation guards for PREP-01 + PREP-02..." + the same NO-console/NO-exit/NO-chalk reminder + a reference to RESEARCH.md §Pattern 1 and §Pitfall 3.

**Function-signature + JSDoc pattern** (copy from `launcher.js:29-58`):
```javascript
/**
 * Launch headless Chromium and create a context configured for the v0.1
 * single-viewport/single-page model.
 * ...
 * @param {object} config - the validated config from Phase 2's loadConfig
 * @returns {Promise<{
 *   browser: import('playwright-chromium').Browser,
 *   context: import('playwright-chromium').BrowserContext
 * }>}
 * @throws {BrowserError} if Chromium fails to launch (e.g. binary missing)
 */
export async function launchBrowser(config) {
```
Apply: `export async function installAnimationGuards(context, prepareConfig)` with JSDoc that includes `@param {import('playwright-chromium').BrowserContext} context`, `@param {object} prepareConfig — the validated config.prepare sub-object`, `@returns {Promise<void>}`, and a multi-line `LIFECYCLE CONTRACT` block (same structure as `launcher.js:37-47`) explaining MUST-be-called-before-navigateToPage and citing §Pitfall 3 / §Pitfall 10.

**Conditional short-circuit pattern**: the file should follow PREP-01 + PREP-02's "single `animations` boolean controls both" (RESEARCH §Pitfall 12) — begin the function body with `if (!prepareConfig.animations) return;`. There is no in-repo analog for this exact "config gate at top" pattern, but it matches the spirit of `launcher.js:58-68` (try-launch-then-decide).

**Body shape** (from RESEARCH.md §Pattern 1, lines 265-361 in the research doc — verbatim usable):
- Two sequential `await context.addInitScript(() => { ... })` blocks.
- Guard 1 = IO shim (replace `window.IntersectionObserver` and also `globalThis.IntersectionObserver` per §Pitfall 11).
- Guard 2 = `<style data-framershot="animation-guards">` injection at `document.head ?? document.documentElement`, with the universal CSS rule from §Pattern 1.
- **Do not** try/catch around `addInitScript`. Per §What NOT To Do #8.

---

### `src/prepare/hide.js` (post-nav DOM mutator, PREP-03)

**Closest analog:** `src/browser/navigator.js`
**Why this analog:** Both are post-navigation operations on an existing Page. `navigator.js` uses `page.goto` + `page.waitForFunction`; `hide.js` uses `page.evaluate`. Both are single-Playwright-call operations with a return value. The "library returns data, CLI/Phase 6 owns presentation" posture is identical.

**File header pattern** (copy from `navigator.js:1-16`):
```javascript
// src/browser/navigator.js
// Wave 2 of Phase 3: page-level navigation + load-state wait + fonts.ready wait.
// Exports: navigateToPage(context, pageConfig) → Page.
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. ...
```
Apply: `// src/prepare/hide.js` + "Post-navigation element hiding for PREP-03. Exports: hideSelectors(page, selectors) → { matched, missed }." + the NO-console reminder + reference to RESEARCH §Pattern 2 / §Pitfall 5 (visibility:hidden vs display:none).

**JSDoc + signature pattern** (copy from `navigator.js:21-35`):
```javascript
/**
 * Open a new page in the context, navigate to `pageConfig.path` ...
 *
 * @param {import('playwright-chromium').BrowserContext} context — the context returned by launchBrowser
 * @param {{ path: string, name: string }} pageConfig — the `config.page` sub-object from Phase 2's validated config
 * @returns {Promise<import('playwright-chromium').Page>}
 * @throws {BrowserError} on non-TimeoutError navigation failure ...
 */
export async function navigateToPage(context, pageConfig) {
```
Apply: `export async function hideSelectors(page, selectors)` with `@param {import('playwright-chromium').Page} page`, `@param {string[]} selectors`, `@returns {Promise<{ matched: number, missed: string[] }>}`. NO `@throws` (RESEARCH §Pattern 2 — invalid selectors go into `missed`, not exceptions).

**Body shape** (from RESEARCH §Pattern 2, lines 390-423 — verbatim usable):
- Defensive empty-list short-circuit at top (`if (!Array.isArray(selectors) || selectors.length === 0) return { matched: 0, missed: [] };`).
- Single `page.evaluate((sels) => { ... }, selectors)` — pass the array as the `arg` (RESEARCH §Security: NOT inline template literal, prevents injection).
- Inside the page-context callback: try/catch around `document.querySelectorAll(sel)` to lump syntax errors with zero-match into `missed`.
- Apply `node.style.setProperty('visibility', 'hidden', 'important')` per node (the inline-important pattern beats author stylesheets).
- Return `{ matched, missed }` — the orchestrator passes it up.

---

### `src/prepare/scroll.js` (post-nav scroll prime + timer, PREP-04 + PREP-05)

**Closest analog:** `src/browser/navigator.js`
**Why this analog:** Navigator is the canonical example of "sequential page operations with timeouts." scroll.js is the same: a `page.evaluate` to read geometry, a loop of `page.evaluate` + `page.waitForTimeout`, a final `page.evaluate` for the reset. Both use the documented "library returns when the page is settled" boundary.

**Module-level constant pattern** (copy from `navigator.js:19`):
```javascript
const DEFAULT_NAV_TIMEOUT_MS = 15000;
```
Apply: `const INTER_STEP_WAIT_MS = 200;` (RESEARCH §Pattern 3 line 439 — already named identically).

**Two-export pattern**: RESEARCH §Pattern 3 names two exports: `scrollPrime(page)` and `extraDelay(page, ms)`. Navigator only has one export (`navigateToPage`), but the dual-export pattern is fine — `config/schema.js:36-54` exports both a `configSchema` and a `formatZodError` helper from one file. Apply the same posture: two cohesive, related exports.

**JSDoc + signature pattern** (mirror `navigator.js:21-35`):
- `scrollPrime(page)`: `@param {import('playwright-chromium').Page} page`, `@returns {Promise<void>}`.
- `extraDelay(page, ms)`: `@param {import('playwright-chromium').Page} page`, `@param {number} ms — non-negative integer milliseconds`, `@returns {Promise<void>}`.

**Body shape** (from RESEARCH §Pattern 3, lines 454-491):
- `scrollPrime`: read `innerHeight` + `scrollHeight` once via `page.evaluate(() => ({ ... }))`; then a `for` loop stepping by `innerHeight`, each iteration is `page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y)` followed by `page.waitForTimeout(INTER_STEP_WAIT_MS)`; final `page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))`.
- `extraDelay`: `if (ms <= 0) return; await page.waitForTimeout(ms);` — match the early-return-on-no-op posture used in `hide.js:391`.
- **NO** try/catch (per §What NOT To Do #8).
- **NO** `behavior: 'smooth'` (per §Pitfall 6).

---

### `src/prepare/index.js` (orchestrator / barrel)

**Closest analog:** `src/browser/navigator.js` (for the step-by-step async flow) + `src/config/schema.js` (for the dual-export-from-one-file barrel feel).

**Why these analogs:** `navigator.js` is the closest "orchestrate multiple Playwright operations sequentially, return a structured summary" example in the repo. `schema.js` is the closest "barrel-like file that re-exports related things" example. The Phase 4 orchestrator combines both: it re-exports `installAnimationGuards` from animations.js (for the CLI's pre-nav call) AND it composes hide.js + scroll.js into `runPreparePipeline` (for the CLI's post-nav call).

**Imports pattern** (mirror `navigator.js:17` for relative same-folder imports):
```javascript
// src/browser/navigator.js:17
import { BrowserError } from './launcher.js';
```
Apply (from RESEARCH §Pattern 4, lines 510-512):
```javascript
import { installAnimationGuards as _install } from './animations.js';
import { hideSelectors } from './hide.js';
import { scrollPrime, extraDelay } from './scroll.js';
```
**Drift note:** the RESEARCH-suggested `as _install` rename + a separate `export { installAnimationGuards } from './animations.js';` re-export is slightly awkward. Cleaner: drop the renamed import and use a single `export { installAnimationGuards } from './animations.js';` plus direct named imports of the post-nav helpers. The planner should make the call; either form is fine and follows existing conventions.

**Body shape** (from RESEARCH §Pattern 4, lines 517-543 — verbatim usable):
- `export async function runPreparePipeline(page, prepareConfig)` returning `{ hideSummary }`.
- Sequence: `hideSelectors` → `if (prepareConfig.scrollPrime) await scrollPrime(page)` → `await extraDelay(page, prepareConfig.extraDelay)`.
- JSDoc references PREP-03 / PREP-04 / PREP-05 explicitly so future readers can map the code back to requirements (this matches `schema.js:24,26,28,30` comment style — `// PREP-01:`, `// PREP-03:` etc.).

---

### `src/cli.js` (modification — wire prepare in)

**Closest analog:** itself — `src/cli.js:27-61` (the existing capture action body).
**Why this analog:** Phase 4 surgically inserts two lines into the existing try block. No new lifecycle, no new flag, no restructure.

**Existing pattern to extend** (`cli.js:1-5, 27-61`):
```javascript
// cli.js:1-5
import { Command } from 'commander';
import { loadConfig } from './config/load.js';
import { resolveTemplate } from './output/template.js';
import { launchBrowser } from './browser/launcher.js';
import { navigateToPage } from './browser/navigator.js';

// cli.js:27-61 (the try/finally body)
const { browser, context } = await launchBrowser(config);
try {
  const navigatedPage = await navigateToPage(context, config.page);
  if (opts.smoke) {
    // ...
    await navigatedPage.screenshot({ path: resolvedOutput, fullPage: false });
    console.log(`smoke screenshot written: ${resolvedOutput}`);
  } else {
    console.log(JSON.stringify({ ...config, _resolvedOutput: resolvedOutput, _navigated: navigatedPage.url() }, null, 2));
  }
} finally {
  await context.close();
  await browser.close();
}
```

**Modifications** (from RESEARCH §Pattern 5, lines 550-584):
1. Add import: `import { installAnimationGuards, runPreparePipeline } from './prepare/index.js';` (mirror the existing `./browser/...` import style on cli.js:4-5).
2. Insert pre-nav call between `launchBrowser` and `navigateToPage` (i.e. between `cli.js:27` and `cli.js:29`): `await installAnimationGuards(context, config.prepare);`.
3. Insert post-nav call between `navigateToPage` and the smoke branch (i.e. between `cli.js:29` and `cli.js:30`): `const { hideSummary } = await runPreparePipeline(navigatedPage, config.prepare);` — `hideSummary` is intentionally unused in Phase 4 (Phase 6 surfaces it).
4. Add `animations: 'disabled'` to the screenshot call on `cli.js:39`: `await navigatedPage.screenshot({ path: resolvedOutput, fullPage: false, animations: 'disabled' });` (RESEARCH §Pattern 5 + §Pitfall 4).
5. **Optional** (RESEARCH §Code Examples #2): wrap `runPreparePipeline` in `console.time('prepare')` / `console.timeEnd('prepare')` **only inside the `opts.smoke` branch** — never in production paths. This is the SC #4 evidence for PREP-05. Library code stays silent.

**Lifecycle invariant to preserve** (`cli.js:56-61`):
- `context.close()` BEFORE `browser.close()` in finally. Do not touch.
- `launchBrowser` outside try, navigation+prepare+screenshot inside try. Do not touch.

---

### `samples/serve-smoke.js` (modification — add PREP fixture elements)

**Closest analog:** itself — the existing `serve-smoke.js`.
**Why this analog:** The file is one ~50-line http server with a single `HTML` constant. The Phase 4 extension just grows the `HTML` template literal.

**Existing pattern** (`serve-smoke.js:20-32`):
```javascript
const HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; background: #c00; color: #fff; font-family: system-ui; }
    h1 { padding: 1rem; }
  </style>
</head>
<body>
  <h1>framershot phase 3 smoke</h1>
</body>
</html>`;
```

**Modifications** (from RESEARCH §Wave 0 Gaps + §Validation Architecture):
- Add `<div data-test="anim-target">` with a CSS keyframe animation that would visibly play if not killed (e.g. `@keyframes spin { ... } .anim-target { animation: spin 2s linear infinite; }`) — proves PREP-01 by post-prep `getComputedStyle(el).animationDuration === '0s'`.
- Add `<div data-test="io-target" style="opacity: 0">` plus an inline `<script>` that does `new IntersectionObserver(([entry]) => { if (entry.isIntersecting) entry.target.style.opacity = '1'; }).observe(target);` — proves PREP-02 by post-prep `getComputedStyle(el).opacity === '1'` (the shim makes IO fire immediately).
- Add `<div class="hidden-by-test">` — proves PREP-03 when `.hidden-by-test` is in `smoke.yaml`'s `hide:` array.
- Add a tall spacer + `<img loading="lazy" src="data:image/png;base64,..." data-test="lazy-img">` ~2000px down — proves PREP-04 by post-prep `img.complete && img.naturalWidth > 0`.

**Existing conventions to honor:**
- Pure Node `http`, no dependencies (`serve-smoke.js:17` — `import http from 'node:http';`).
- HTML stays inline as a tagged template (no separate `.html` file).
- Bind to `127.0.0.1:7357` (`serve-smoke.js:19, 39`) — do not change the port (smoke.yaml references it).
- Clean shutdown on signals (`serve-smoke.js:44-48`) — preserve.

---

### `samples/smoke.yaml` (modification — exercise prepare)

**Closest analog:** itself — existing `samples/smoke.yaml`.
**Why this analog:** Same file; Phase 4 just adds two keys.

**Existing pattern** (`smoke.yaml:25-39`):
```yaml
name: phase-03-smoke
baseUrl: http://127.0.0.1:7357
output: /tmp/framershot-smoke/{page}.png
deviceScaleFactor: 2
viewport:
  width: 800
  height: 600
  name: smoke
page:
  path: "/"
  name: home
prepare:
  animations: true
  scrollPrime: false
  extraDelay: 0
```

**Modifications**:
- Rename `name: phase-03-smoke` → `name: phase-04-smoke` (matches commit/phase scope; mirrors the Phase 3 naming convention seen here).
- Set `scrollPrime: true` so PREP-04 is exercised by the fixture's lazy-img element.
- Set `extraDelay: 1000` (or similar small non-zero value) so PREP-05's `console.time('prepare')` shows ≥ 1000 ms.
- Add `hide:` array containing `'.hidden-by-test'` to exercise PREP-03 against the fixture element added to `serve-smoke.js`.

**Existing conventions to honor:**
- Top-of-file comment block explaining hermetic fixture context and run command (`smoke.yaml:1-23`). Add a 2-3 line addendum noting Phase 4 additions (hide selector and extraDelay).
- Same baseUrl/output/viewport/page block — only `prepare:` changes.

---

## Shared Patterns (Cross-Cutting)

### Library posture (library code is silent)
**Source:** `src/browser/launcher.js:4-7`, `src/browser/navigator.js:5-8`
**Apply to:** All of `src/prepare/*.js`
```javascript
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors throw BrowserError; the caller (src/cli.js)
// owns presentation, the try/finally lifecycle, and exit codes.
```
This is the most-violated invariant under time pressure. Every prepare module must repeat the disclaimer at the top.

### Lifecycle owned by CLI, never by library modules
**Source:** `src/cli.js:27-61` (the `try { ... } finally { context.close(); browser.close(); }` block)
**Apply to:** Every Phase 4 module must accept `context` or `page` as a parameter and NEVER create or close them.
```javascript
// cli.js:27-61 (excerpt)
const { browser, context } = await launchBrowser(config);
try {
  const navigatedPage = await navigateToPage(context, config.page);
  // ... Phase 4 calls go here ...
} finally {
  await context.close();
  await browser.close();
}
```

### Error handling: let it bubble
**Source:** `src/browser/launcher.js:58-68` (wraps Playwright launch failure), `src/browser/navigator.js:46-62` (wraps non-timeout nav failures), AND RESEARCH §What NOT To Do #8 ("NO try/catch around `addInitScript` or `evaluate` in prepare modules").
**Apply to:**
- `animations.js`, `hide.js`, `scroll.js`, `index.js` → NO try/catch around Playwright calls.
- The existing `BrowserError` class (defined at `launcher.js:21-27`) is the only error type in the system; Phase 4 does NOT create a new one. If wrapping ever becomes necessary, import `BrowserError` from `'../browser/launcher.js'`.

### Defensive empty-input short-circuit
**Source:** RESEARCH §Pattern 2 line 391 + spirit of `launcher.js:58-61` (try-then-decide)
**Apply to:** `installAnimationGuards` (gate on `prepareConfig.animations`), `hideSelectors` (gate on empty array), `extraDelay` (gate on `ms <= 0`), `runPreparePipeline` (gate on `prepareConfig.scrollPrime`).
Pattern: `if (!cond) return earlyDefault;` at the top of each function body. Same posture as `cli.js`'s `if (opts.smoke) { ... } else { ... }` branching.

### JSDoc with Playwright type references
**Source:** `src/browser/navigator.js:31-32`
```javascript
 * @param {import('playwright-chromium').BrowserContext} context — the context returned by launchBrowser
 * @param {{ path: string, name: string }} pageConfig — the `config.page` sub-object from Phase 2's validated config
 * @returns {Promise<import('playwright-chromium').Page>}
```
**Apply to:** Every exported function in `src/prepare/*`. Use the `import('playwright-chromium').Page` / `.BrowserContext` form for Playwright handles. Use inline-object form (`{ matched: number, missed: string[] }`) for return shapes.

### Schema-shape consumption (config.prepare)
**Source:** `src/config/schema.js:22-34`
```javascript
const prepareSchema = z
  .object({
    animations: z.boolean().default(true),
    hide: z.array(z.string()).default([]),
    scrollPrime: z.boolean().default(true),
    extraDelay: z.number().int().min(0).default(0),
  })
  .default({});
```
**Apply to:** Phase 4 modules MUST consume this exact shape verbatim — no new keys (`disableFramerMotion`, `framerSpecific`, `intersectionObserverShim`, `prepareTimeoutMs`, etc. — all forbidden per RESEARCH §What NOT To Do #3 and §Pitfall 12). The single `animations: boolean` flag controls both PREP-01 and PREP-02 together.

### Commit message style
**Source:** git log (last 15 commits)
```
feat(03-02): wire launchBrowser+navigateToPage into capture action with --smoke
feat(03-02): add hermetic smoke fixture (localhost http instead of data: URL)
feat(03-02): add navigator with timeout-tolerant networkidle and fonts.ready
docs(03-02): complete navigator + CLI wiring plan
docs(03): verify Phase 3 Browser + Navigation — 4/4 criteria pass
```
**Apply to:** Phase 4 commits should use:
- `feat(04-NN): <imperative summary>` for implementation work
- `docs(04-NN): <summary>` for plan/summary docs
- `fix(04-NN): <summary>` for review-found fixes
- `feat(04): ...` or `docs(04): ...` for phase-level work spanning plans

---

## No Analog Found

None. Every Phase 4 file has at least a role-match analog in the existing codebase. Phase 4 is a strict extension of patterns Phases 1–3 already established — no new architectural primitives.

---

## Drift Risks (Planner — flag these explicitly in PLANs)

These are the failure modes most likely to surface if the planner doesn't anchor each prepare module to a specific existing analog. Each risk maps to a temptation to invent rather than reuse.

### Risk 1: Inventing a new error class for prepare failures
**Temptation:** Create `PrepareError extends Error` so prepare failures are distinguishable from browser failures.
**Why it would happen:** Symmetry with `BrowserError` and `ConfigError` (`launcher.js:21-27`).
**Why it's wrong:** RESEARCH §What NOT To Do #8 says let prepare failures bubble. Phase 6 owns error formatting. Adding a third error class increases surface for the same expressive power (the CLI's top-level catch can already discriminate via `err.message` or `err.cause`).
**Anchor:** Reuse `BrowserError` from `'../browser/launcher.js'` if any wrapping is ever needed. More likely: no wrapping at all.

### Risk 2: Introducing a class hierarchy (PreparePipeline, PrepareStep)
**Temptation:** Refactor `runPreparePipeline` into a `class PreparePipeline { register(step) { ... } async run() { ... } }` for "extensibility."
**Why it would happen:** OOP instinct, hooks-roadmap-anticipation, "what if v0.3 adds HOOK-01."
**Why it's wrong:** Phase 3 used plain async functions (`launchBrowser`, `navigateToPage`) — no classes outside `BrowserError`. RESEARCH §What NOT To Do is explicit about scope; v0.3 HOOK-01 is deferred. A 4-line orchestrator (RESEARCH §Pattern 4 line 529-541) is the right shape.
**Anchor:** Mirror `navigator.js:36-92`'s flat-function shape. If v0.3 needs hooks, refactor then.

### Risk 3: Introducing chalk/ora/console.log in `src/prepare/*`
**Temptation:** Print "🎬 disabling animations..." / "🙈 hiding selectors..." / "⏬ scroll prime..." in prepare modules.
**Why it would happen:** It's the visible payoff phase; instinct says "show what's happening."
**Why it's wrong:** `launcher.js:4-7` + `navigator.js:5-8` + RESEARCH §What NOT To Do #7 / #12. Phase 6 owns terminal UX. The smoke-branch `console.time('prepare')` is the SOLE exception, and it lives in `cli.js`, NOT in `src/prepare/*`.
**Anchor:** Re-read `navigator.js:50-52` comment ("We intentionally do NOT log here — Phase 6 owns terminal UX") before writing any prepare module.

### Risk 4: Adding new CLI flags (`--no-prepare`, `--prepare-debug`, `--headed`)
**Temptation:** Surface prepare's behavior for verification or debugging.
**Why it would happen:** Phase 3 added `--smoke`; instinct says "Phase 4 gets its own flag too."
**Why it's wrong:** RESEARCH §Locked Decisions: "Phase 3's `--smoke` is the verification seam. Phase 4 should not add a new CLI flag." Users disable prepare by writing `prepare: { animations: false, scrollPrime: false, hide: [], extraDelay: 0 }` in YAML.
**Anchor:** `cli.js:18` (single `--smoke` option). Phase 4 modifies the action body; the option list stays as-is.

### Risk 5: Adding new keys to `prepare` schema
**Temptation:** Expose `animations` as two toggles (`disableAnimationsCss`, `framerMotionIoShim`) or add a tuning knob (`scrollPrime.waitMs`, `scrollPrime.steps`).
**Why it would happen:** Implementation-as-config-surface anti-pattern.
**Why it's wrong:** RESEARCH §Pitfall 12 — coupling means two toggles create undefined intermediate states (animations frozen but elements stuck at `initial: { opacity: 0 }`, or vice versa). RESEARCH §What NOT To Do #3 forbids it.
**Anchor:** `src/config/schema.js:22-34` is the lock. Phase 4 consumes it verbatim. Any tuning knobs are v0.2 work.

### Risk 6: Inventing a new module location (`lib/prepare/`, `prepare/` at project root)
**Temptation:** "lib/" looks like a more conventional name than "src/" for utility modules.
**Why it would happen:** Phase 2 had a temporary `lib/` vs `src/` reconciliation moment (Phase 3 RESEARCH §171 — the "Phase 2 layout inconsistency note for the planner").
**Why it's wrong:** Phase 3 SUMMARY confirms `src/` won. Every existing module is under `src/`. STATE.md decisions log doesn't mention a re-relocation.
**Anchor:** `src/browser/`, `src/config/`, `src/output/` — Phase 4 is `src/prepare/`. Full stop.

### Risk 7: Using `page.addInitScript` instead of `context.addInitScript` for IO shim
**Temptation:** Pass the existing Page handle around; "everything else takes Page, why does this take Context?"
**Why it would happen:** The planner sees `navigateToPage(context, ...)` returns a Page, and tries to thread the Page through prepare.
**Why it's wrong:** RESEARCH §Pitfall 10 — addInitScript registered on a Page AFTER `context.newPage()` doesn't apply retroactively. The shim has to be on the CONTEXT, BEFORE `navigateToPage` creates the page. This is why §Architecture splits prepare into pre-nav (takes context) and post-nav (takes page).
**Anchor:** The CLI integration in RESEARCH §Pattern 5 lines 555-563 — `installAnimationGuards(context, ...)` BEFORE `navigateToPage`; `runPreparePipeline(navigatedPage, ...)` AFTER.

### Risk 8: Trying to set `window.MotionGlobalConfig.skipAnimations` or `window.__framer_motion_disabled`
**Temptation:** The brief mentions `window.__framer_motion_disabled` (PROJECT.md / REQUIREMENTS-adjacent material). It sounds canonical.
**Why it would happen:** Taking the user's brief literally without verifying Framer Motion's actual API.
**Why it's wrong:** RESEARCH §Pitfall 2 — `__framer_motion_disabled` is not a real Framer convention. `MotionGlobalConfig.skipAnimations` IS real (motion 10.17+), but it's package-scoped, not window-exposed. Assigning to `window.MotionGlobalConfig` does nothing.
**Anchor:** The IO shim (RESEARCH §Pattern 1, lines 279-312) is library-agnostic and the correct intervention.

### Risk 9: Adding a new dependency for IO shimming or DOM manipulation
**Temptation:** "The IntersectionObserver shim is delicate; let's use a polyfill."
**Why it would happen:** Polyfills feel more robust than hand-written shims.
**Why it's wrong:** RESEARCH §Alternatives Considered: polyfills implement IO CORRECTLY, but we want a shim that LIES (reports `isIntersecting: true` immediately). Different intent. Also: RESEARCH §Locked Decisions: "Zero new dependencies."
**Anchor:** `package.json` (no new dependencies). All shim/DOM code fits in inline page-context callbacks via `addInitScript` and `evaluate`.

### Risk 10: Breaking the lifecycle invariant by closing context/browser inside a prepare module
**Temptation:** "If addInitScript throws, let's clean up the context."
**Why it would happen:** Defensive programming.
**Why it's wrong:** `cli.js:27-61` owns the try/finally. The prepare module that closes the context would leave the CLI's `await context.close()` to throw on a closed context.
**Anchor:** `cli.js:56-61` is the SOLE owner of `context.close()` and `browser.close()`. Phase 4 modules NEVER call either.

### Risk 11: Using `display: none` instead of `visibility: hidden` in hide.js
**Temptation:** "Display none is more thorough — removes from layout AND visual stack."
**Why it would happen:** It's the more common CSS hide pattern; instinct picks it.
**Why it's wrong:** RESEARCH §Pitfall 5 — `display: none` removes from layout, shrinking `scrollHeight`, breaking Phase 5's scroll-stitch math.
**Anchor:** Verbatim use of `setProperty('visibility', 'hidden', 'important')` from RESEARCH §Pattern 2 line 417.

### Risk 12: Using `behavior: 'smooth'` in scroll prime
**Temptation:** "Smooth scrolling is the well-behaved default."
**Why it would happen:** Modern websites prefer smooth scroll for UX; muscle memory.
**Why it's wrong:** RESEARCH §Pitfall 6 — smooth animates over ~300ms, races with the 200ms inter-step wait. Lazy-load IO triggers fire at wrong positions.
**Anchor:** Verbatim `behavior: 'instant'` from RESEARCH §Pattern 3 line 469 / line 475.

### Risk 13: Adding instrumentation (console.time, performance.mark) inside prepare modules
**Temptation:** SC #4 requires "an observable pause before capture begins — verifiable by adding a console.time around the prepare step." Naive read: instrument inside the orchestrator.
**Why it would happen:** Putting the timing where the work happens feels obvious.
**Why it's wrong:** RESEARCH §Anti-Patterns line 597-598 and §Code Examples #2 — the `console.time('prepare')` lives in `cli.js` `--smoke` branch ONLY. Library code stays silent so production runs don't pay the cost.
**Anchor:** Place the `console.time` / `console.timeEnd` around the `runPreparePipeline` call IN `cli.js`, inside the `if (opts.smoke)` block.

---

## Metadata

**Analog search scope:**
- `/Users/sannagranqvist/Documents/App/screenshotter/src/browser/` (launcher.js, navigator.js)
- `/Users/sannagranqvist/Documents/App/screenshotter/src/config/` (schema.js, load.js)
- `/Users/sannagranqvist/Documents/App/screenshotter/src/cli.js`
- `/Users/sannagranqvist/Documents/App/screenshotter/samples/serve-smoke.js`
- `/Users/sannagranqvist/Documents/App/screenshotter/samples/smoke.yaml`
- `/Users/sannagranqvist/Documents/App/screenshotter/package.json`
- git log (last 15 commits) for message style

**Files read in full:** 6 (all small — within 100-line ceiling, no targeted reads needed)
**Project skills directories checked:** `./.claude/` (no skills subdir, only `worktrees/`) and `./.agents/` (does not exist). No project skills apply.
**Project instructions checked:** `./CLAUDE.md` does not exist; constraints come from `.planning/PROJECT.md` and locked decisions in `.planning/STATE.md` (per Phase 3/4 RESEARCH).
**Pattern extraction date:** 2026-05-22

## PATTERN MAPPING COMPLETE

**Phase:** 4 — Prepare Pipeline
**Files classified:** 7
**Analogs found:** 7 / 7

### Coverage
- Files with exact analog: 4 (animations.js → launcher.js; cli.js → self; serve-smoke.js → self; smoke.yaml → self)
- Files with role-match analog: 3 (hide.js, scroll.js, index.js → navigator.js / schema.js)
- Files with no analog: 0

### Key Patterns Identified
- All Phase 4 modules follow `src/browser/*` library-shape posture: NO console output, NO process.exit, NO chalk/ora; errors bubble to CLI.
- Phase 4 splits cleanly into pre-navigation (`installAnimationGuards(context, ...)` — mirrors `launchBrowser` lifecycle layer) and post-navigation (`runPreparePipeline(page, ...)` — mirrors `navigateToPage` lifecycle layer).
- The CLI in `cli.js:27-61` already owns the try/finally lifecycle; Phase 4 inserts two new lines inside the existing try block — no new lifecycle, no new flag, no new error class.

### File Created
`/Users/sannagranqvist/Documents/App/screenshotter/.planning/phases/04-prepare-pipeline/04-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns (with file paths + line numbers) in 04-NN-PLAN.md files. The Drift Risks section enumerates 13 specific failure modes the planner should pre-empt with explicit "do this not that" callouts in each plan's actions.
