# Phase 3: Browser + Navigation — Research

**Researched:** 2026-05-19
**Domain:** Playwright Chromium launch, viewport + DPR emulation, navigation lifecycle, font readiness
**Confidence:** HIGH

## Summary

Phase 3 wires `playwright-chromium@1.60.0` into framershot to launch headless Chromium at a configured viewport + `deviceScaleFactor`, navigate to `baseUrl + page.path`, and block until the page is interactive AND fonts are swapped in. The library APIs are stable, the import shapes are locked (already debugged in Phase 1 commit `95a1c70`), and the canonical `BrowserContextOptions` shape matches the user's brief: viewport is `{ width, height }` only, `deviceScaleFactor` is a **sibling** top-level option, not nested.

The single non-obvious finding the planner must internalize: **`networkidle` is officially DISCOURAGED by Playwright upstream as of 1.x and the discouragement is in the live type definitions** (`node_modules/playwright-core/types/types.d.ts:3172`). It's not deprecated and it still works, but for Framer sites specifically — which use long-lived WebSocket connections to Framer's new Server API and run analytics beacons indefinitely — `networkidle` is the worst-fit option of the four. The requirement (CAP-03) names it anyway; this research surfaces the conflict so the planner can either honor the requirement verbatim with a timeout guard, or flag it back to the user for amendment. I recommend **honoring CAP-03 literally** with a 15s `goto({ waitUntil: 'networkidle', timeout: 15000 })` and treating a `networkidle` timeout as success-with-warning rather than failure — Phase 4's prepare pipeline (scroll prime, extraDelay) already provides redundant settling time, so a fall-through is graceful. Logging is Phase 6's job.

The second finding the planner needs: **Playwright already waits for `document.fonts.ready` internally on `page.screenshot()`** (confirmed via GitHub issue #35200 maintainer behavior — the timeout error message is "waiting for fonts to load..."). CAP-04's explicit pre-capture wait is still wanted because Phase 4 will mutate the DOM between navigation and capture (animations injection, element hiding, scroll prime) — we want fonts to be ready *before* prepare runs, not just before the screenshot. So this isn't redundant work; it's "fonts ready upstream so prepare's selectors don't fight a layout shift."

**Primary recommendation:** Two small modules in `lib/browser/`:
- `lib/browser/launcher.js` exporting `async function launchBrowser(config)` → `{ browser, context }`
- `lib/browser/navigator.js` exporting `async function navigateToPage(context, baseUrl, page)` → `page`

Context is created with `baseURL` set, so navigation passes only the path. One context per capture run (not per page) — viewports + DPR are fixed for a run. Phase 5 (`capture-loop`) and Phase 4 (`prepare-pipeline`) both consume the returned `page` object. Add a `--smoke` flag to the `capture` subcommand that runs launch → navigate → `page.screenshot({ path: 'smoke.png' })` → close → exit. This satisfies Phase 3's success criterion #4 ("screenshot at correct viewport size in output file dimensions") observably from the shell without committing the project to the full Phase 5 capture loop yet.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAP-01 | Browser launches Chromium headless with configured viewport width and height | Section 1 (launchBrowser pattern), Section 2 (viewport shape) |
| CAP-02 | Capture honors `deviceScaleFactor` for retina-quality output (2x or 3x) | Section 2 (deviceScaleFactor lives on context, NOT viewport), Section 7 (DSR=3 memory caveat) |
| CAP-03 | Browser navigates to `baseUrl + page.path` and waits for `networkidle` before proceeding | Section 3 (navigation waits + networkidle discouraged caveat, recommended fallback) |
| CAP-04 | Capture waits for `document.fonts.ready` so screenshots don't use fallback fonts | Section 4 (font readiness pattern, Framer `font-display: swap` confirms necessity) |
</phase_requirements>

## User Constraints (from PROJECT.md + ROADMAP.md + REQUIREMENTS.md)

No `CONTEXT.md` exists for Phase 3 (no `/gsd:discuss-phase` run). Constraints derive from project-level docs:

### Locked Decisions (from PROJECT.md)
- **Chromium only.** `playwright-chromium` not full `playwright`. No Firefox, no WebKit logic anywhere.
- **Headless default.** Headed mode is a debug-flag option only, NOT a config setting. Phase 3 does NOT add a debug flag — that's Phase 6's terminal UX scope.
- **Local only, personal tool.** No remote-debugging port, no `connectOverCDP`, no proxy infra.
- **Single page/viewport in v0.1.** Schema (Phase 2) enforces `viewport: object` and `page: object` (not arrays); Phase 3 launches one browser, one context, one page per run.
- **Locked stack.** No new dependencies in Phase 3. We only consume `playwright-chromium` (already installed by Phase 1).

### Claude's Discretion
- Module layout under `lib/` (the brief is silent on file names; recommendation in Section 5).
- Function signatures for launcher/navigator (recommendation in Section 5).
- Whether to add a `--smoke` flag for Phase 3 verification (recommendation in Section 6: **yes**, add it).
- Whether to wrap Playwright errors in a `BrowserError` class (recommendation: yes, mirroring 02-02's `ConfigError` pattern — Section 5).
- Exact navigation timeout value (recommendation: 15000 ms; Section 3).

### Deferred Ideas (OUT OF SCOPE — do not research)
- Headed mode flag (Phase 6 if at all).
- Auth / HTTP credentials (v0.3, AUTH-01).
- Cookie / consent banner handling (v0.3, HOOK-01).
- Pre-capture hooks (v0.3, HOOK-01).
- Cross-page session reuse (v0.2 MULTI-02 is a future planning concern, not Phase 3).
- The actual screenshot capture loop and stitch (Phase 5).
- Animation disable / element hiding / scroll prime (Phase 4).
- Spinners and step-by-step terminal output (Phase 6).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Chromium process spawning | Browser layer (`lib/browser/launcher.js`) | — | Single concern; `chromium.launch()` owns it |
| Browser context (viewport + DPR) | Browser layer (`lib/browser/launcher.js`) | — | Context options are launch-time decisions; co-locate with launch |
| URL composition (baseUrl + path) | Browser layer (via context `baseURL`) | — | `BrowserContextOptions.baseURL` handles this natively — no manual concat |
| Navigation + load-state wait | Browser layer (`lib/browser/navigator.js`) | — | Stateful page operation; lives next to but separate from launch (different lifecycle) |
| Font readiness wait | Browser layer (`lib/browser/navigator.js`) | — | Logically part of "page is ready"; called after `goto` |
| Lifecycle cleanup | CLI layer (`lib/cli.js`) | Browser layer | The CLI owns the try/finally; the browser modules just expose `close()` chained via the returned objects |
| Smoke screenshot (CAP-#4) | CLI layer (`--smoke` branch) | Browser layer | A throwaway test path; doesn't belong in the production navigator module |
| Error wrapping | Browser layer (`BrowserError` class) | CLI layer | Same pattern as 02-02's `ConfigError` — typed for the top-level catch |

## Standard Stack

### Core (already installed in Phase 1)
| Library | Version (verified 2026-05-19) | Purpose | Why Standard |
|---------|-------------------------------|---------|--------------|
| `playwright-chromium` | 1.60.0 [VERIFIED: npm registry, published 2026-05-11] | Headless Chromium automation, viewport/DPR emulation, navigation waits, screenshots | Microsoft-maintained; the canonical headless-browser library; thin re-export of `playwright-core` 1.60.0 |

### Verified Import Shape
**This was a Phase 1 bug, debugged in commit `95a1c70` ("fix(01-01): use named chromium import from playwright-chromium").** The DON'T form (`import chromium from 'playwright-chromium'`) returns the module namespace object, NOT the BrowserType — calling `.launch()` throws `TypeError: chromium.launch is not a function`. The correct form is the **named** import:

```javascript
import { chromium } from 'playwright-chromium';   // CORRECT — named import
// NOT: import chromium from 'playwright-chromium'  // WRONG — default returns namespace
```

Verified in source: `node_modules/playwright-core/index.mjs` lines 17-19 explicitly re-export `chromium`, `firefox`, `webkit` as named exports:
```javascript
export const chromium = playwright.chromium;
export const firefox = playwright.firefox;
export const webkit = playwright.webkit;
```

The Phase 1 SUMMARY's blanket claim that all packages use "default" import is wrong for `playwright-chromium`; the SUMMARY was written before the WR-01 review caught the bug. Phase 3 plans must use the named-import form.

### Supporting Libraries (no new installs)
None. Phase 3 introduces zero new packages. `chalk` and `ora` are *not* imported by browser modules — that's Phase 6's polish layer. `sharp` is not imported in Phase 3 — that's Phase 5.

### Alternatives Considered (and rejected)
| Instead of | Could Use | Why we don't |
|------------|-----------|------|
| `chromium.launch({ headless: true })` | `chromium.launch({ headless: false })` | PROJECT.md locks headless default; debug-flag is Phase 6 if at all |
| `chromium.launch({ channel: 'chromium' })` (opt-in new headless mode) | default headless | Default in 1.60 is the current headless implementation. Adding `channel: 'chromium'` opts into the "new headless mode" (= real Chrome browser engine instead of the headless shell). RECOMMENDATION below: leave off in v0.1 for predictability; revisit if Phase 5 stitched output shows rendering inconsistencies. [CITED: playwright.dev/docs/browsers#chromium-new-headless-mode] |
| `chromium.launchPersistentContext(userDataDir, opts)` | `launch` + `newContext` | Persistent contexts are for stateful repeat-use (cookies, localStorage). For one-shot captures, ephemeral context is cleaner. |
| Pre-built `devices['Desktop Chrome HiDPI']` | manual `viewport` + `deviceScaleFactor` | Device presets force `isMobile`, `hasTouch`, `userAgent` and other emulation flags we don't want for Framer desktop captures. |
| `page.setViewportSize()` after launch | viewport at context creation | The Playwright docs explicitly warn against post-creation resize: "A lot of websites don't expect phones to change size, so you should set the viewport size before navigating to the page." (types.d.ts:4481) — Framer's responsive logic listens to resize. |
| `playwright` (all browsers) | `playwright-chromium` (current) | PROJECT.md locks Chromium-only |

## Package Legitimacy Audit

slopcheck was unavailable in this environment. Per protocol, packages would normally be tagged `[ASSUMED]`. However — Phase 3 introduces **zero new packages**; it only consumes `playwright-chromium@1.60.0` already vetted by Phase 1's threat model (Microsoft-distributed, version-matched Chromium binary present at `~/Library/Caches/ms-playwright/chromium-1223/`).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| playwright-chromium | npm (1.60.0) | 5+ yrs | ~1.5M/wk | github.com/microsoft/playwright | unavailable | Approved (declared in Phase 1) |

**Packages removed:** none
**Packages flagged [SUS]:** none
**New packages introduced by Phase 3:** **NONE.**

## Architecture Patterns

### System Architecture Diagram

```
                         CLI layer (lib/cli.js capture action)
                                       │
                                       │ validated config (Phase 2)
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │ launchBrowser(config)                   │
                  │   ├─ chromium.launch({ headless: true })│
                  │   └─ browser.newContext({               │
                  │        viewport: { width, height },     │
                  │        deviceScaleFactor: N,            │
                  │        baseURL: config.baseUrl })       │
                  └────────────────────┬────────────────────┘
                                       │ { browser, context }
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │ navigateToPage(context, page)           │
                  │   ├─ const p = await context.newPage()  │
                  │   ├─ await p.goto(page.path, {          │
                  │   │     waitUntil: 'networkidle',       │
                  │   │     timeout: 15000 })               │
                  │   │   .catch(swallow-timeout-only)      │
                  │   └─ await p.waitForFunction(           │
                  │        () => document.fonts.ready)      │
                  └────────────────────┬────────────────────┘
                                       │ Page (ready for prepare/capture)
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │ (Phase 3 --smoke branch)                │
                  │   page.screenshot({ path: 'smoke.png' })│
                  │                                         │
                  │ (production path — Phases 4+5)          │
                  │   prepare(page) → captureLoop(page)     │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │ finally: await context.close()          │
                  │          await browser.close()          │
                  │ (CLI layer owns the lifecycle)          │
                  └─────────────────────────────────────────┘
```

### Recommended Project Structure

> **Phase 2 layout inconsistency note for the planner:** 02-01-PLAN.md and 02-03-PLAN.md establish `lib/` (lib/cli.js, lib/output-template.js), while 02-02-PLAN.md uses `src/config/` (src/config/schema.js, src/config/load.js). When Phase 2 executes, one of these is wrong — the file overlap on `lib/cli.js` makes `lib/` the de facto root, but 02-02's `src/config/` directory will land too. The user will need to reconcile this (likely by moving 02-02's outputs to `lib/config/`). **Phase 3 should commit to `lib/`** to match the CLI entry layout, and the planner should be ready to either (a) import from `lib/config/...` if reconciled, or (b) import from `src/config/...` if not, when wiring browser launch into the capture action.

Recommended for Phase 3:
```
lib/
├── cli.js                        (Phase 2 — capture action handler imports browser modules here)
├── config/        OR   src/config/   (Phase 2 — wherever it lands)
├── output-template.js            (Phase 2)
└── browser/
    ├── launcher.js               (Phase 3, plan 03-01) — exports launchBrowser
    └── navigator.js              (Phase 3, plan 03-02) — exports navigateToPage, BrowserError
```

Phase 4 will add `lib/prepare/` (one file per PREP-* requirement or one combined module). Phase 5 will add `lib/capture/` (loop + stitch).

### Pattern 1: launchBrowser — context-with-baseURL, single context per run

```javascript
// lib/browser/launcher.js
// Source: node_modules/playwright-core/types/types.d.ts (ViewportSize, BrowserContextOptions, LaunchOptions)
// Source: https://playwright.dev/docs/emulation (canonical viewport + deviceScaleFactor example) [CITED]
import { chromium } from 'playwright-chromium';

export class BrowserError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'BrowserError';
    if (cause) this.cause = cause;
  }
}

/**
 * Launch headless Chromium and create a browser context configured to the
 * v0.1 single-viewport/single-page model.
 *
 * @param {object} config - the validated config from Phase 2's loadConfig
 * @returns {Promise<{ browser: import('playwright-chromium').Browser,
 *                     context: import('playwright-chromium').BrowserContext }>}
 *
 * The caller MUST close both context and browser (in that order) in a
 * try/finally. Closing the browser without closing the context first leaks
 * memory (search result from playwright issue #6319 confirms this pattern
 * reduced RAM by 22% in independent benchmarks).
 */
export async function launchBrowser(config) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      // No `channel: 'chromium'` for v0.1 — see Section 7 "channel choice" below
    });
  } catch (err) {
    throw new BrowserError(
      `Failed to launch Chromium. Is the Playwright browser binary installed at ~/Library/Caches/ms-playwright/chromium-1223/? ` +
      `Original error: ${err.message}`,
      { cause: err },
    );
  }

  const context = await browser.newContext({
    viewport: {
      width: config.viewport.width,
      height: config.viewport.height,
    },
    deviceScaleFactor: config.deviceScaleFactor,  // sibling of viewport, NOT nested
    baseURL: config.baseUrl,                       // page.goto('/path') will resolve against this
  });

  return { browser, context };
}
```

### Pattern 2: navigateToPage — goto + networkidle (timeout-tolerant) + fonts.ready

```javascript
// lib/browser/navigator.js
// Source: types.d.ts (PageGoToOptions waitUntil; networkidle is upstream-DISCOURAGED but CAP-03 names it)
// Source: testautomationmastery.com on waitForFunction(() => document.fonts.ready) [CITED]
// Source: github.com/microsoft/playwright issue #35200 — Playwright internally awaits document.fonts.ready
//         on screenshot, so this pre-wait is for the Phase 4 prepare pipeline's benefit
import { BrowserError } from './launcher.js';

const DEFAULT_NAV_TIMEOUT_MS = 15000;

/**
 * Open a new page in the context, navigate to the given page.path (joined
 * against the context's baseURL), wait for network to settle (best-effort),
 * and wait for fonts to be ready. Returns the Page.
 *
 * Networkidle behavior is INTENTIONALLY timeout-tolerant: Framer sites run
 * a long-lived WebSocket to framerusercontent.com and analytics beacons
 * that may never let network truly idle. A timeout here is treated as
 * "good enough, move on" rather than a fatal error — Phase 4's scroll
 * prime + extraDelay provides redundant settling.
 *
 * @param {import('playwright-chromium').BrowserContext} context
 * @param {{ path: string, name: string }} pageConfig
 * @returns {Promise<import('playwright-chromium').Page>}
 */
export async function navigateToPage(context, pageConfig) {
  const page = await context.newPage();

  try {
    await page.goto(pageConfig.path, {
      waitUntil: 'networkidle',
      timeout: DEFAULT_NAV_TIMEOUT_MS,
    });
  } catch (err) {
    // Distinguish "page failed to load" (fatal) from "networkidle never
    // settled but DOM is up" (recoverable for Framer).
    if (err.name === 'TimeoutError') {
      // Page DID start loading (goto returned a Response, the timeout fired
      // on the post-load networkidle wait). Continue — fonts.ready below
      // is the real gate, and Phase 4 prepare adds further settling.
      //
      // We intentionally do NOT log here — Phase 6 owns terminal UX. If
      // Phase 6 wants to warn on networkidle timeout, it can wrap this call.
    } else {
      // SSL error, DNS failure, invalid URL, etc. — these are fatal.
      throw new BrowserError(
        `Failed to navigate to ${pageConfig.path} (resolved against context baseURL). ` +
        `Original error: ${err.message}`,
        { cause: err },
      );
    }
  }

  // Wait for fonts. Framer uses font-display: swap, so the initial render
  // shows fallback fonts (Arial/Helvetica) then swaps in the web font when
  // it loads. document.fonts.ready resolves AFTER all FontFace objects
  // have either loaded or failed. This catches the swap before any
  // screenshot is taken.
  //
  // waitForFunction is preferred over evaluate here because it polls and
  // applies the global navigation timeout — if a font never loads, we get
  // a clear timeout error rather than hanging indefinitely. (Playwright
  // also internally awaits this on screenshot, so this is belt-and-braces
  // protection for the Phase 4 prepare step that runs BEFORE screenshot.)
  try {
    await page.waitForFunction(() => document.fonts.ready, null, {
      timeout: DEFAULT_NAV_TIMEOUT_MS,
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      // Same posture as networkidle: don't fail the run. A 15s font wait
      // covers all reasonable cases; if it times out, fall through with
      // whatever the page has rendered so far.
    } else {
      throw new BrowserError(
        `Error waiting for fonts to be ready. Original error: ${err.message}`,
        { cause: err },
      );
    }
  }

  return page;
}
```

### Pattern 3: Wiring into the capture action (Phase 2's lib/cli.js)

Phase 3's wiring lives in the capture action body. The Phase 2 action ends with `console.log(JSON.stringify({ config, samplePath }, null, 2))` — Phase 3 replaces that with launch → navigate → (smoke branch) → close. Note: this pattern goes into Phase 3's plan-01 or plan-02 (the planner decides — likely a third plan 03-03, or folded into 03-02 as the "wiring" task).

```javascript
// lib/cli.js (modified by Phase 3 — sketch)
import { Command } from 'commander';
import { loadAndValidateConfig } from './config/load.js';   // or src/config/load.js
import { resolveOutputPath } from './output-template.js';
import { launchBrowser } from './browser/launcher.js';
import { navigateToPage } from './browser/navigator.js';

export function buildProgram() {
  const program = new Command();
  program.name('framershot').description('...').version('0.1.0', '-v, --version');

  program
    .command('capture <config>')
    .option('--smoke', 'Phase 3 verification: launch, navigate, take ONE screenshot, exit')
    .action(async (configArg, opts) => {
      const config = await loadAndValidateConfig(configArg);
      const samplePath = resolveOutputPath(config.output, { /* ... */ });

      const { browser, context } = await launchBrowser(config);
      try {
        const page = await navigateToPage(context, config.page);
        if (opts.smoke) {
          // Phase 3 success criterion #4: prove the viewport + DPR math
          await page.screenshot({ path: samplePath, fullPage: false });
          console.log(`smoke screenshot written: ${samplePath}`);
        } else {
          // Phase 3 boundary: Phase 4 (prepare) and Phase 5 (capture loop)
          // will replace this branch. For now, just confirm the page is up.
          console.log(JSON.stringify({ config, samplePath, navigated: page.url() }, null, 2));
        }
      } finally {
        // ORDER MATTERS: context first, then browser. Reversing leaks memory.
        await context.close();
        await browser.close();
      }
    });

  return program;
}
```

### Anti-Patterns to Avoid
- **Don't import the default export.** `import chromium from 'playwright-chromium'` returns the namespace object; `chromium.launch is not a function`. Use the named import. (Phase 1 commit `95a1c70` is the record.)
- **Don't nest `deviceScaleFactor` inside `viewport`.** The TypeScript `ViewportSize` interface (types.d.ts:24138) is `{ width, height }` only. `deviceScaleFactor` is a sibling on `BrowserContextOptions`.
- **Don't call `page.setViewportSize()` after the page has loaded.** Framer's responsive logic listens for resize and will re-layout, defeating the point. Set viewport at context creation.
- **Don't close the browser without closing the context first.** Documented memory-leak pattern (playwright issue #6319 → 22% RAM reduction by ordering correctly).
- **Don't omit the navigation timeout.** Default timeout is 30000 ms; for Framer's WebSocket-haunted `networkidle`, 30s is a long blind hang. Override to 15000 ms.
- **Don't throw on `networkidle` timeout for Framer sites.** Distinguish `TimeoutError` (recoverable — page is up but network won't idle) from other navigation errors (fatal). Pattern 2 shows the discriminator.
- **Don't `page.evaluate(() => document.fonts.ready)` when you mean to wait.** `evaluate` runs once and returns the resolved value; `waitForFunction` polls and respects the global timeout. Both happen to work for `document.fonts.ready` (which IS a Promise that resolves once), but `waitForFunction` is the documented-for-waiting form.
- **Don't add chalk/ora to browser modules.** Pure I/O; presentation is Phase 6's job.
- **Don't add `channel: 'chromium'` in v0.1.** The "new headless mode" produces subtly different rendering vs the default headless shell; for a screenshot tool we want predictability. Revisit if Phase 5 shows artifacts.
- **Don't create one context per page** in v0.1. Per ROADMAP, v0.1 is single-page-per-run anyway. v0.2's multi-page work can reuse one context across pages (faster, shared cookies if needed) — context-per-page is wasteful and only needed for cross-origin isolation that v0.1 doesn't have.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL composition (`baseUrl + path`) | `${config.baseUrl}${config.page.path}` | `newContext({ baseURL })` + `page.goto(path)` | Playwright uses the `URL()` constructor — handles trailing slashes, query strings, encoded paths; matches WHATWG semantics that `z.url()` in the schema already validated. |
| Waiting for network to settle | Custom `setInterval` on `page.on('request')` / `page.on('response')` counters | `goto({ waitUntil: 'networkidle' })` | Playwright maintains the in-flight-request counter internally; reimplementing is error-prone and doesn't catch WebSocket frames or service-worker fetches. |
| Waiting for fonts | Polling `document.fonts.size` and `document.fonts.status` | `page.waitForFunction(() => document.fonts.ready)` | `document.fonts.ready` is a single Promise that the spec guarantees resolves once all FontFace objects in `document.fonts` have either loaded or failed. Polling sizes/status races against in-flight loads. |
| Headless Chromium process management | `child_process.spawn('chromium', ...)` | `chromium.launch()` | Playwright handles binary lookup, --user-data-dir, /tmp cleanup, signal handling (SIGHUP/SIGINT/SIGTERM), and the WebSocket-over-pipe transport. |
| Viewport / DPR emulation | Custom CDP commands via `chromium.connect()` | `newContext({ viewport, deviceScaleFactor })` | Playwright sends the right CDP commands (`Emulation.setDeviceMetricsOverride`) and ensures consistent behavior across navigations. |
| Lifecycle cleanup hooks | `process.on('exit')` registering closes | `try/finally` around the capture flow | Playwright's `handleSIGHUP/SIGINT/SIGTERM` defaults already kill the browser subprocess on signal; we just need to release our Node-side handles. |

**Key insight:** Every Phase 3 requirement maps to a single Playwright API call. The original code is ~40 lines across two files: ~20 in launcher (one launch, one newContext, one error class), ~25 in navigator (newPage, goto, waitForFunction, two try/catches for timeout discrimination). Anything more means we're either bypassing the library or papering over a missing requirement.

## Runtime State Inventory

Not applicable — Phase 3 is greenfield code. No rename/refactor/migration. The Chromium browser binary at `~/Library/Caches/ms-playwright/chromium-1223/` is the only persistent OS state and it's already in place from Phase 1's `npm install` postinstall (verified by Phase 1 SUMMARY).

## Common Pitfalls

### Pitfall 1: Default-import for `chromium` (already bit Phase 1)
**What goes wrong:** `import chromium from 'playwright-chromium'` returns the module namespace object. Calling `chromium.launch()` throws `TypeError: chromium.launch is not a function`.
**Why it happens:** `playwright-chromium/index.mjs` re-exports both: `export * from 'playwright-core'` AND `export default playwright`. The default IS the namespace; the named `chromium` is the `BrowserType`.
**How to avoid:** Always `import { chromium } from 'playwright-chromium'`. The Phase 1 fix commit `95a1c70` and `01-REVIEW.md` (WR-01) document this exact failure.
**Warning signs:** `TypeError: chromium.launch is not a function` immediately on first invocation.

### Pitfall 2: `networkidle` never resolves on Framer sites
**What goes wrong:** `await page.goto(url, { waitUntil: 'networkidle' })` hangs until the default 30s timeout, then throws. The page loaded fine 2s in.
**Why it happens:** Framer's Server API uses stateful WebSocket channels (announced 2026-02 — search result confirms). WebSocket counts as a live network connection; analytics beacons also keep network "busy." With no 500ms idle window ever achieved, networkidle never fires.
**How to avoid:** Set an explicit `timeout: 15000`, and discriminate `TimeoutError` from real errors — treat the timeout as "network won't idle but DOM is up; move on." Pattern 2 above implements this.
**Warning signs:** Capture runs take exactly 30s every time; error message contains "Timeout 30000ms exceeded" with no useful detail.

### Pitfall 3: `deviceScaleFactor` nested inside `viewport`
**What goes wrong:** `newContext({ viewport: { width, height, deviceScaleFactor: 2 } })` silently ignores `deviceScaleFactor`. Output PNG is 1440×900 not 2880×1800.
**Why it happens:** The TypeScript interface allows extra properties (zod-style strict mode is not on `BrowserContextOptions`). The Phase 2 config schema correctly puts `deviceScaleFactor` at the top of the config (not under `viewport`) — but a developer reading the brief might "fix" this to "match" by nesting.
**How to avoid:** Keep `deviceScaleFactor` as a sibling of `viewport` everywhere — in the config, in the schema, in the `newContext` call. The shape mirrors the official Playwright emulation example verbatim.
**Warning signs:** Screenshot file dimensions equal the viewport CSS pixels (e.g. 1440×900) instead of the scaled physical pixels (e.g. 2880×1800).

### Pitfall 4: Fonts loaded after `goto` resolves
**What goes wrong:** Screenshot captures Arial/Helvetica fallback instead of the Framer-served web font.
**Why it happens:** Framer uses `font-display: swap` (Framer Help confirms). With swap, the browser shows the fallback IMMEDIATELY, then swaps to the web font when it loads. `load` and `domcontentloaded` and even `networkidle` can all fire before the swap completes (the swap is decoupled from the page lifecycle events).
**How to avoid:** Explicit `await page.waitForFunction(() => document.fonts.ready)` after navigation. Playwright also waits for this internally before `page.screenshot()` — but Phase 4's prepare pipeline modifies the DOM in between, so the explicit upstream wait protects prepare from doing layout work while fonts are still loading.
**Warning signs:** First Framer capture per cold cache uses fallback fonts; second and subsequent captures look right (because the browser cached the font on first load).

### Pitfall 5: Context closed before browser → no leak; browser closed before context → leak
**What goes wrong:** Memory consumption per capture grows over repeated runs.
**Why it happens:** `browser.close()` will eventually clean up contexts on shutdown, but if the context has live pages/network/storage, those handles can linger. Explicit context-first close releases them promptly.
**How to avoid:** Always `await context.close()` then `await browser.close()`. Use try/finally in the CLI layer (the modules don't own the lifecycle).
**Warning signs:** RSS memory of `node` process grows across many `framershot capture` runs in a tight loop — visible with `top` or `ps`.

### Pitfall 6: `page.evaluate(() => document.fonts.ready)` works but is the wrong tool
**What goes wrong:** Nothing functionally — `page.evaluate` awaits Promises and `document.fonts.ready` is a Promise, so it works.
**Why it's wrong:** `evaluate` is for getting values OUT of the page. `waitForFunction` is for waiting for a condition. Code-as-documentation matters: someone reading `evaluate(() => document.fonts.ready)` thinks "what value are we extracting?" The right form expresses intent and uses the global navigation timeout, not the (different) default action timeout.
**How to avoid:** Use `waitForFunction(() => document.fonts.ready)` with an explicit timeout. The Web API call is the same; the Playwright-level semantics communicate intent.
**Warning signs:** None functional; it's a code-clarity smell only.

### Pitfall 7: DSR=3 + tall Framer page → OOM crash in Phase 5
**What goes wrong:** At DSR=3 on a 5000px-tall Framer page captured fullPage, Chromium tries to allocate ~5000 × 3 × 1440 × 3 = ~65M pixels = ~260MB raw bitmap. Documented crashes (search result on `[BUG] Chromium crops the screenshot when deviceScaleFactor > 1`) show this hits SEGV_MAPERR.
**Why it happens:** Chromium's screenshot compositor exhausts memory at high DPR on long pages.
**How to avoid this for Phase 3:** Not a Phase 3 concern directly — Phase 3 only does viewport-sized screenshots in `--smoke` mode (which is bounded by viewport, not full page). **But Phase 5 needs to know:** because framershot scrolls and stitches viewport-sized slices (per ROADMAP "Stitch screenshots manually instead of Playwright `fullPage: true`"), this design naturally avoids the OOM at high DSR. Mention in the Phase 3 plan summary as "DSR=3 is safe in Phase 3 because we never screenshot full-page."
**Warning signs:** `Page crashed` errors from Playwright on tall pages at DSR=3 — only would surface if someone misused `page.screenshot({ fullPage: true })`.

## Code Examples

### Example: end-to-end happy path (the smoke flow)

```javascript
// What a single `framershot capture samples/sample.yaml --smoke` invocation does:
import { chromium } from 'playwright-chromium';
import { resolveOutputPath } from './lib/output-template.js';

// config = { name, baseUrl: 'https://pubq.se', deviceScaleFactor: 2,
//            viewport: { width: 1440, height: 900, name: 'desktop' },
//            page: { path: '/', name: 'home' }, ... }

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  baseURL: 'https://pubq.se',
});

try {
  const page = await context.newPage();
  try {
    await page.goto('/', { waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    if (e.name !== 'TimeoutError') throw e;  // tolerate networkidle never settling
  }
  await page.waitForFunction(() => document.fonts.ready, null, { timeout: 15000 });
  await page.screenshot({ path: './screenshots/2026-05-19/desktop/home.png' });
} finally {
  await context.close();
  await browser.close();
}

// Resulting file: ./screenshots/2026-05-19/desktop/home.png
// Dimensions: 2880 × 1800 (1440×900 viewport × DSR 2)
// Format: PNG, scale="device" (default), one pixel per device pixel
```

### Example: dimension math (CAP-01 + CAP-02 verification)

```bash
# After running the smoke flow above:
$ file ./screenshots/2026-05-19/desktop/home.png
./screenshots/2026-05-19/desktop/home.png: PNG image data, 2880 x 1800, 8-bit/color RGBA, non-interlaced

# Math:
#   viewport.width  = 1440 CSS pixels
#   viewport.height = 900  CSS pixels
#   deviceScaleFactor = 2
#   screenshot.scale (default) = "device" → 1 PNG pixel per device pixel
#   PNG width  = 1440 × 2 = 2880
#   PNG height = 900  × 2 = 1800
#
# At DSR=3 with the same viewport:
#   PNG width  = 1440 × 3 = 4320
#   PNG height = 900  × 3 = 2700
```

This is the Phase 3 success-criterion #4 verifiable check: `identify` or `file` on the output PNG should show exactly viewport×DSR dimensions.

### Example: viewport WITHOUT deviceScaleFactor (sanity check)

```javascript
// If a user sets deviceScaleFactor: 1 (or omits and gets the schema default 2):
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
// → PNG dimensions 1440 × 900 (no scaling)
```

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|-------------------------|--------------|--------|
| `page.goto(url, { waitUntil: 'networkidle' })` for tests | Web-first assertions on a real element + `goto({ waitUntil: 'load' })` | Always discouraged; types.d.ts comment is recent | For *tests*, switch. For *screenshot tools* like framershot, networkidle is still defensible IF we discriminate TimeoutError. |
| `chromium.launch({ headless: 'new' })` (Puppeteer-style) | `chromium.launch({ channel: 'chromium' })` to opt into new headless mode | Playwright 1.50+ | Don't use in v0.1 — predictability matters more than new-mode features for a personal screenshot tool. |
| `page.evaluate(() => document.fonts.ready)` | `page.waitForFunction(() => document.fonts.ready)` | Convention shift; both still work | waitForFunction is the intent-expressing form. |
| `page.screenshot({ fullPage: true })` | Manual scroll-and-stitch (framershot's design) | Project-level decision (PROJECT.md) | Avoids ghosted sticky elements AND the DSR=3 OOM crash. |
| `import chromium from 'playwright-chromium'` (default) | `import { chromium } from 'playwright-chromium'` (named) | Always; default returns namespace | Already debugged in Phase 1 commit `95a1c70`. |

**Deprecated but still works (don't use):**
- `chromium.launch({ headless: false })` as a *config* option in framershot — debug-flag only if at all (Phase 6).
- `page.setViewportSize()` after navigation — set at context creation instead.
- `browser.close()` without prior `context.close()` — works but leaks.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 2 will land before Phase 3 begins, exposing `loadAndValidateConfig` and a validated config with `viewport: { width, height, name? }`, `page: { path, name }`, `deviceScaleFactor: number`, `baseUrl: string` | Section 5, Pattern 3 | If Phase 2's shape differs (e.g. `name` becomes optional on page, or `deviceScaleFactor` gets nested), Phase 3 sketches need updating. Low risk — Phase 2's RESEARCH.md is explicit and the user has reviewed it. [ASSUMED] |
| A2 | Phase 2's module layout reconciles to `lib/` (matching 02-01's lib/cli.js choice) | Section 5 | If `src/config/` survives the wave-1 execution, Phase 3's imports need to read `from '../src/config/...'` instead of `from './config/...'`. Easy fix at plan-writing time once the user picks. [ASSUMED — flagged for the planner] |
| A3 | `networkidle` with `timeout: 15000` + TimeoutError-tolerant catch is the right Phase 3 reading of CAP-03 | Section 3 | If the user wanted a strict `networkidle` (no timeout tolerance), Phase 3's behavior is wrong on Framer sites (will fail every run). Mitigation: surface in the Phase 3 plan summary so the user can override during discuss-phase. [ASSUMED] |
| A4 | Phase 3 will satisfy success criterion #4 via a `--smoke` flag, not a separate test command | Section 6 | If the user prefers a separate `framershot smoke` subcommand, restructure. The `--smoke` flag is less surface area and lives within the existing capture action. [ASSUMED] |
| A5 | `lib/browser/` (subdirectory) is the right placement vs flat `lib/launcher.js` + `lib/navigator.js` | Section 5 | Subjective taste; the subdirectory anticipates Phase 4 (`lib/prepare/`) and Phase 5 (`lib/capture/`) needing their own. Flat is also fine. [ASSUMED] |
| A6 | Playwright 1.60.0's `page.screenshot()` internal `document.fonts.ready` wait is reliable enough that the explicit pre-capture wait is optional FROM A CORRECTNESS POV (it's still needed for prepare-pipeline-correctness) | Section 4 | If we ever skip the pre-capture wait, screenshots are still font-clean (Playwright handles it). The pre-capture wait's real job is to stabilize the DOM for Phase 4's mutations. [ASSUMED — derived from issue #35200 maintainer behavior, not stated in docs] |
| A7 | The Phase 1 SUMMARY's "default for playwright-chromium" claim is WRONG and the fix commit `95a1c70` is the canonical pattern | Section: Verified Import Shape | Confirmed by inspecting `node_modules/playwright-core/index.mjs` directly — no risk. [VERIFIED, not assumed] |
| A8 | `channel: 'chromium'` (new headless mode) is NOT worth using in v0.1 | Standard Stack > Alternatives | If new headless produces visually-cleaner Framer captures, this is a missed optimization. Mitigation: the launcher takes a config param easily extended to `channel` in v0.2 if needed. [ASSUMED] |

## Open Questions

1. **Should the navigation timeout be configurable in the YAML?**
   - What we know: 15000 ms is a safe default for Framer sites (their WS keeps networkidle from settling, but DOM is usually up in 2-5s).
   - What's unclear: For very slow staging Framer URLs or sites loading huge media, 15s might be tight.
   - Recommendation: Hardcode 15000 in Phase 3. Add `prepare.timeoutMs` or `navigationTimeoutMs` to the config schema in v0.2 if a real need surfaces. Premature config knob otherwise.

2. **Should `networkidle` timeout failures be visible to the user?**
   - What we know: Phase 6 owns CLI-02 (progress) and CLI-03 (errors). Silently swallowing the timeout is the current Phase 3 behavior.
   - What's unclear: Is a warning useful for debugging, or just noise?
   - Recommendation: Phase 3 stays silent. Phase 6 adds a warning if the user reports the silence is confusing. The smoke screenshot itself is observable evidence that capture worked.

3. **Should we add `--debug` (headed) to the capture subcommand in Phase 3?**
   - What we know: PROJECT.md says headed is debug-only, "if added."
   - What's unclear: Is Phase 3 the right phase, or Phase 6?
   - Recommendation: NOT in Phase 3. The `--smoke` flag is enough surface area for Phase 3. A `--debug` (headed) flag, if added, belongs in Phase 6's terminal UX work where its useful pair (`--verbose` logging) also lives.

4. **Should the `chromium` channel (new headless mode) be tested?**
   - What we know: Default headless shell is predictable. New headless mode is "the real Chrome browser."
   - What's unclear: Whether new headless renders Framer fonts/animations identically.
   - Recommendation: Defer to v0.2 or whenever Phase 5's stitched output shows artifacts that motivate it. Not Phase 3's job.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All Phase 3 code | ✓ | (per package.json `engines.node >= 20`; verified in Phase 1) | — |
| `playwright-chromium` npm package | launcher.js, navigator.js | ✓ | 1.60.0 (Phase 1 install confirmed) | — |
| Chromium browser binary | `chromium.launch()` | ✓ | chromium-1223 build at `~/Library/Caches/ms-playwright/chromium-1223/` (Phase 1 SUMMARY confirmed) | If missing, would need `npx playwright install chromium` |
| /tmp writable for Chromium user-data-dir | `chromium.launch()` | ✓ (assumed on macOS) | — | Set `TMPDIR` env var or `userDataDir` launch option if /tmp not writable |
| Network access to target Framer URL | `page.goto(baseUrl + path)` | runtime-only | — | If unreachable, navigation throws and `BrowserError` is raised |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

Phase 1's SUMMARY (lines 79-85) explicitly verified the Chromium binary at `~/Library/Caches/ms-playwright/chromium-1223/`. No additional install step is needed for Phase 3.

## Validation Architecture

> No explicit `nyquist_validation: false` in config — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node's built-in `node:test` + `node:assert/strict` (consistent with Phase 2's choice) |
| Config file | none — `node --test` discovers `*.test.js` |
| Quick run command | `node --test lib/browser/` |
| Full suite command | `node --test lib/` (covers all phases that have landed) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAP-01 | `launchBrowser(config)` returns `{ browser, context }` and the context's viewport reflects the input | unit | `node --test lib/browser/launcher.test.js` | ❌ Wave 0 |
| CAP-02 | A screenshot taken via `--smoke` has dimensions `viewport.width × DSR` by `viewport.height × DSR` | integration | `node --test lib/browser/launcher.integration.test.js` (uses `data:text/html,...` URL — no network needed) | ❌ Wave 0 |
| CAP-03 | `navigateToPage` resolves successfully against a `data:text/html,...` page (no actual network — proves the goto+waitUntil pipeline) | integration | same file as CAP-02 | ❌ Wave 0 |
| CAP-04 | `navigateToPage` does not return until `document.fonts.ready` resolves (test with a `data:text/html` page that uses `@font-face` to a delayed-resolve URL) | integration | same file | ❌ Wave 0 |
| (smoke) | End-to-end `framershot capture samples/sample.yaml --smoke` against `data:text/html` config produces a PNG of expected dimensions and exits 0 | smoke | `node index.js capture samples/smoke.yaml --smoke && file <output> | grep '2880 x 1800'` | ❌ Wave 0 |

**Note on network-dependent verification:** The full `pubq.se` Framer site capture is the *real* validation, but it requires network and a stable target. Wave 0 should include a `samples/smoke.yaml` pointing to a `data:text/html,...` URL so the test suite is hermetic. The live-Framer check is a manual gate the user runs before declaring the phase done.

### Sampling Rate
- **Per task commit:** `node --test lib/browser/`
- **Per wave merge:** `node --test lib/` + the smoke command above
- **Phase gate:** Full suite green + one live `framershot capture samples/sample.yaml --smoke` against `pubq.se` produces a 2880×1800 PNG with no fallback fonts

### Wave 0 Gaps
- [ ] `lib/browser/launcher.test.js` — unit-tests `launchBrowser` returns the right shape (mocks chromium.launch)
- [ ] `lib/browser/launcher.integration.test.js` — runs the real Chromium against `data:text/html` URLs to prove viewport + DSR + navigation + fonts work end-to-end without network
- [ ] `samples/smoke.yaml` — a hermetic test config with `baseUrl: data:text/html,...`
- [ ] No framework install needed (`node:test` is built in, per Phase 2's choice)

## Security Domain

> `security_enforcement` is not explicitly disabled — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 3 has no auth; AUTH-01 is deferred to v0.3 |
| V3 Session Management | no | Ephemeral context per run; no session persistence |
| V4 Access Control | no | Personal CLI, no multi-user model |
| V5 Input Validation | yes (inherited) | `baseUrl` was validated by Phase 2's `z.url()`; `page.path` was validated by `z.string().startsWith('/')` |
| V6 Cryptography | no | No secrets, no crypto |
| V8 Data Protection | yes (minor) | Captured screenshots may contain rendered private data if `baseUrl` points at staging; written to disk by Phase 5 |
| V10 Malicious Code | yes (minor) | Headless Chromium executes arbitrary JS from `baseUrl` — but that's the entire point of a screenshot tool, and the same trust boundary as a regular browser |
| V11 Business Logic | no | n/a |
| V12 Files & Resources | yes | The browser writes to a per-context temp directory; cleanup is automatic on `browser.close()` |

### Known Threat Patterns for Headless Chromium + Personal CLI

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Captured URL serves XSS payload that exfiltrates filesystem via fetch() | Information Disclosure | Headless Chromium runs with `chromiumSandbox: false` by default in Playwright; the JS in the page CANNOT directly read local files (no file:// access from a https origin). Network exfiltration to attacker-controlled URLs is possible but is the user's choice when they pointed framershot at the URL. [ACCEPTED — user threat boundary, PROJECT.md personal-tool model] |
| Memory exhaustion via massively-tall page at DSR=3 | DoS (self-inflicted) | Documented in Pitfall 7. Phase 3 only takes viewport-sized smoke screenshots, so not exposed. Phase 5's stitched approach is the architectural mitigation. [MITIGATED by Phase 5 design] |
| Browser process leak on uncaught exception | Resource exhaustion | try/finally in `lib/cli.js` around `launchBrowser`/`navigateToPage` (Pattern 3). The browser's own `handleSIGHUP/SIGINT/SIGTERM` defaults catch signal-based exits. [MITIGATED by pattern] |
| Browser binary not from Microsoft (supply chain) | Tampering | `playwright-chromium` postinstall downloaded the binary from Microsoft's CDN during Phase 1; Phase 3 only invokes the already-trusted binary. [MITIGATED — inherited from Phase 1's threat model] |
| `executablePath` override pointing at malicious binary | Tampering | Phase 3 does NOT pass `executablePath` — Playwright uses its bundled binary. No new attack surface. [N/A — not used] |
| Untrusted YAML's `baseUrl` causes navigation to malicious site | Information Disclosure | The user wrote the YAML. Same trust boundary as the user typing `framershot capture` at all. [ACCEPTED — user threat boundary] |

### Notes
- **No new network calls** beyond `page.goto(baseUrl + path)`, which is the explicit feature.
- **No new file writes** from Phase 3 except the `--smoke` screenshot path (which Phase 5 will own properly).
- **Chromium sandbox is OFF by default** (`chromiumSandbox: false` in LaunchOptions). This is Playwright's documented default and matches all common screenshot/scraping tool configurations. Enabling it on macOS personal-tool context is unnecessary and would only complicate the launch.

## Project Constraints (from PROJECT.md / Phase 2's CLAUDE.md analysis)

No `./CLAUDE.md` file present in the project root (confirmed by Phase 2's research). Constraints from `.planning/PROJECT.md`:

| Constraint | Source | How Phase 3 honors it |
|-----------|--------|------------------------|
| Tech stack locked — no new deps | PROJECT.md Constraints | Phase 3 imports only `playwright-chromium` (already installed). No additions to package.json. |
| Chromium only | PROJECT.md Constraints | `import { chromium }` only — never `{ firefox, webkit }` even though they're named exports. |
| Headless default | PROJECT.md Constraints, ROADMAP Phase 3 success criterion 1 | `chromium.launch({ headless: true })`. No headed option in Phase 3. |
| Personal tool, no polish | PROJECT.md Out of Scope | No chalk in browser modules; no detailed error messages beyond `BrowserError` wrapping; no help text beyond commander's defaults. |
| Local only | PROJECT.md Constraints | No `connectOverCDP`, no remote debugging port, no service-worker network bridge. |
| Single page/viewport in v0.1 | REQUIREMENTS.md v1 | One `launchBrowser` per run, one context, one page. Multi-context/multi-page reuse is v0.2 work. |

## What NOT To Do (re-stated for the planner)

1. **NO new dependencies.** Not `playwright-test`, not `playwright` (full), not any helper library. Use only what Phase 1 installed.
2. **NO Firefox/WebKit imports.** Even though `playwright-chromium` re-exports them as named exports, importing them is a violation of the Chromium-only constraint. Plans should `import { chromium }` only.
3. **NO `executablePath` overrides.** Playwright finds its bundled Chromium at `~/Library/Caches/ms-playwright/chromium-1223/` automatically.
4. **NO `channel: 'chromium'` (new headless mode) in v0.1.** Predictability over novelty for a screenshot tool. Revisit if Phase 5 surfaces issues.
5. **NO debug/headed flag in Phase 3.** The `--smoke` flag is the only Phase 3 CLI surface addition.
6. **NO chalk/ora in `lib/browser/*`.** Presentation belongs to the CLI layer; the browser modules expose typed errors and structured data.
7. **NO `page.screenshot({ fullPage: true })` anywhere.** PROJECT.md decision: manual scroll-and-stitch is THE differentiator. fullPage screenshots are forbidden for the production capture path (and unnecessary for `--smoke`, which takes a single viewport screenshot).
8. **NO try/catch around `page.evaluate` to gracefully degrade on JS errors.** If the page's JS context is broken, capture should fail loudly so the user can fix the page or their config.
9. **NO custom `--user-data-dir` or persistent context.** v0.1 is one-shot ephemeral captures.
10. **NO process.exit() inside browser modules.** Throw `BrowserError`; let the top-level catch in `lib/cli.js` exit.
11. **NO logging from browser modules.** Phase 6 owns observable output. Browser modules return data or throw — they don't print.

## Phase 3 Boundary

What Phase 3 produces:
- A `launchBrowser(config)` function that gives the CLI a `{ browser, context }` pair, with the context already at the right viewport + DSR + baseURL.
- A `navigateToPage(context, pageConfig)` function that returns a `Page` whose URL is `baseUrl + path`, networkidle-or-timeout settled, and fonts loaded.
- A `BrowserError` class (mirroring `ConfigError`) for typed error handling.
- A `--smoke` flag on the `capture` subcommand that runs the full pipeline + one `page.screenshot()` so success criterion #4 is shell-verifiable.
- Updated `lib/cli.js` (the capture action) to launch → navigate → (smoke screenshot OR pass-through) → close.

What Phase 3 does **not** do:
- Disable animations (Phase 4)
- Hide elements via selectors (Phase 4)
- Scroll-prime the page (Phase 4)
- Honor `extraDelay` (Phase 4)
- Capture multiple frames or stitch (Phase 5)
- Write to the templated output path for non-smoke runs (Phase 5)
- Show a spinner or formatted error messages (Phase 6)
- Handle missing-selector warnings (Phase 6)

Phase 4 will receive the `Page` returned from `navigateToPage` and apply the prepare pipeline. Phase 5 will receive the prepared `Page` and run the scroll-capture-stitch loop. The lifecycle (launch + close) stays owned by `lib/cli.js` throughout.

## Sources

### Primary (HIGH confidence)
- `node_modules/playwright-core/types/types.d.ts` (Playwright 1.60.0 type definitions) — direct source for `LaunchOptions`, `BrowserContextOptions`, `ViewportSize`, `PageScreenshotOptions`, `waitUntil` enum [VERIFIED — read directly]
- `node_modules/playwright-core/index.mjs` lines 17-19 — confirms named exports `chromium`, `firefox`, `webkit` [VERIFIED]
- `npm view playwright-chromium version` → 1.60.0 (published 2026-05-11) [VERIFIED]
- `npm view playwright-chromium time` → confirms 1.60.0 is latest [VERIFIED]
- git commit `95a1c70` — Phase 1's named-import fix; documents the exact failure mode [VERIFIED]
- https://playwright.dev/docs/api/class-page#page-goto — `waitUntil` options, `networkidle` discouraged [CITED]
- https://playwright.dev/docs/api/class-browser#browser-new-context — `BrowserContextOptions` shape, `baseURL`, `deviceScaleFactor` as sibling of viewport [CITED]
- https://playwright.dev/docs/emulation — canonical `newContext({ viewport, deviceScaleFactor })` example [CITED]
- https://playwright.dev/docs/api/class-browsertype#browser-type-launch — `headless: true` default, `channel: 'chromium'` opt-in [CITED]
- https://playwright.dev/docs/browsers#chromium-new-headless-mode — what new headless mode is and how to opt in [CITED]

### Secondary (MEDIUM confidence — verified against primary)
- https://github.com/microsoft/playwright/issues/35200 — Playwright internally awaits `document.fonts.ready` on screenshot; the timeout error message confirms this [CITED]
- https://momentic.ai/blog/playwright-pitfalls — `PW_TEST_SCREENSHOT_NO_FONTS_READY` env var bypass, networkidle flakiness on long-poll pages [CITED]
- https://testautomationmastery.com/how-to-wait-for-font-loading-to-ensure-complete-page-load-in-playwright-tests/ — recommends `page.waitForFunction(() => document.fonts.ready)` [CITED]
- https://www.framer.com/help/articles/how-are-fonts-optimized-in-framer/ — Framer uses `font-display: swap`, confirming CAP-04's necessity for first-render captures [CITED]
- https://www.framer.com/updates/server-api — Framer Server API runs over stateful WebSocket, explaining why `networkidle` is especially flaky for Framer [CITED]
- https://github.com/microsoft/playwright/issues/6188 — `deviceScaleFactor > 1` cropping bugs (informs DSR=3 cautions) [CITED]
- https://github.com/microsoft/playwright/issues/6319 — context-before-browser close order matters (22% RAM reduction) [CITED]

### Tertiary (LOW confidence — informational, not relied upon)
- Generic "How to Take Screenshots in Playwright" tutorials — used for cross-checking patterns; none cited as authoritative.

## Metadata

**Confidence breakdown:**
- Import shape: HIGH — confirmed by reading `playwright-core/index.mjs` AND by the Phase 1 fix commit AND by the live type declarations.
- Launch / context options: HIGH — verified directly against `types.d.ts` AND against live playwright.dev docs.
- `networkidle` discouragement: HIGH — verified in `types.d.ts:3172` comments AND on docs site.
- Framer-specific behavior (font-display: swap, WebSocket Server API): MEDIUM-HIGH — verified against Framer's own help docs and update announcement.
- `document.fonts.ready` internal wait by Playwright: MEDIUM — derived from GitHub issue #35200 user reports of the timeout error message; not stated in formal docs.
- DSR=3 memory caveat: MEDIUM — single bug report, not deeply load-tested by this researcher; flagged as a caution, not a blocker.
- Pitfalls section: HIGH — each pitfall sourced from either direct source inspection, GitHub issues, or upstream-documented behavior.

**Research date:** 2026-05-19
**Valid until:** 2026-06-19 (30 days — Playwright is stable; the `networkidle` discouragement won't reverse; only minor option shapes could shift, and the planner's `BrowserContextOptions` shape is interface-locked)

## Locked-Stack Compliance Confirmation

Nothing in this research contradicts the locked stack or PROJECT.md constraints. Zero new dependencies are introduced. All architectural choices stay within the boundaries set by PROJECT.md (Chromium-only honored, local-only honored, headless-default honored, personal-tool ethos honored, single page/viewport scope honored). The only divergence from the user's brief is the **caveat that `networkidle` is upstream-discouraged** — but CAP-03 names it explicitly, so this research recommends honoring the requirement literally with timeout tolerance, and flags the trade-off to the discuss-phase agent (if invoked) for confirmation.
