---
phase: 03-browser-navigation
plan: 01
subsystem: browser
tags: [playwright, chromium, headless, viewport, devicepixelratio, browsercontext, esm]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: playwright-chromium@1.60.0 installed; Chromium 1223 binary at ~/Library/Caches/ms-playwright/chromium-1223/; named-import shape locked by commit 95a1c70
  - phase: 02-config
    provides: validated config shape ({ baseUrl, deviceScaleFactor, viewport: { width, height }, page: { path, name }, ... }) and the ConfigError typed-Error pattern this module mirrors
provides:
  - "src/browser/launcher.js — launchBrowser(config) returning { browser, context }"
  - "BrowserError class (Error subclass with .cause support) — importable from src/browser/launcher.js, to be re-used by 03-02's navigator.js for navigation failures"
  - "Headless Chromium subprocess management with viewport, deviceScaleFactor, and baseURL applied at context creation (CAP-01 + CAP-02 wired end-to-end)"
affects: [03-02 (navigator + CLI wiring imports launchBrowser and BrowserError), 04-prepare (consumes the Page that 03-02 will return), 05-capture (consumes the prepared Page), 06-terminal-ux (top-level catch in src/cli.js will format BrowserError messages)]

# Tech tracking
tech-stack:
  added: []  # Zero new dependencies (RESEARCH.md §Package Legitimacy Audit confirmed)
  patterns:
    - "Named-import shape for playwright-chromium: import { chromium } from 'playwright-chromium' (default returns namespace — locked by Phase 1 commit 95a1c70)"
    - "Typed Error subclasses per layer (BrowserError mirrors ConfigError) with cause-preservation, so the top-level catch in src/cli.js can distinguish layers for Phase 6's error formatting"
    - "Browser layer is library-shaped: no console.*, no process.exit, no chalk/ora; caller owns presentation and lifecycle"
    - "BrowserContext options: viewport.{width,height} is for CSS pixels only; deviceScaleFactor and baseURL are SIBLINGS, NOT nested (RESEARCH.md §Pitfall 3)"
    - "Close-order contract documented in JSDoc: context.close() BEFORE browser.close() in try/finally (Playwright issue #6319, ~22% RAM reduction)"

key-files:
  created:
    - src/browser/launcher.js
  modified: []

key-decisions:
  - "Headless explicit (headless: true) — not relying on the v1.60 default — for code-as-documentation; matches ROADMAP Phase 3 SC #1"
  - "Did NOT pass channel: 'chromium' (new headless mode) — predictability over novelty for v0.1; RESEARCH.md §What NOT To Do #4. Revisit if Phase 5's stitched output shows artifacts."
  - "Did NOT pass executablePath — Playwright finds its bundled binary at ~/Library/Caches/ms-playwright/chromium-1223/ automatically (Phase 1 confirmed)"
  - "Did NOT pass chromiumSandbox — Playwright's documented default matches macOS personal-tool context"
  - "Did NOT wrap browser.newContext in its own try/catch — failures there are programmer errors (invalid viewport shape, etc.) and should bubble; only chromium.launch is wrapped in BrowserError because launch failures are user-fixable (binary missing)"
  - "BrowserError exported from launcher.js (not a separate errors module) so 03-02's navigator.js can re-use it via import from './launcher.js' — RESEARCH.md §Pattern 2"

patterns-established:
  - "src/browser/ subdirectory as the home for browser-layer modules (anticipates 03-02's navigator.js); matches Phase 2's src/{config,output}/ convention"
  - "Module-root contract: src/ is the uniform root across Phases 2 and 3. No lib/ directory in this project."

requirements-completed: [CAP-01, CAP-02]

# Metrics
duration: 12 min
completed: 2026-05-20
---

# Phase 3 Plan 01: Chromium Launcher Summary

**Headless Chromium launcher exporting `launchBrowser(config) → { browser, context }` and `BrowserError`, with viewport/DSR/baseURL applied as sibling options on `browser.newContext()` — wires CAP-01 and CAP-02 in a 80-line pure-library module.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-20T08:38:52Z
- **Completed:** 2026-05-20T08:51:39Z
- **Tasks:** 1 (autonomous, single-task plan)
- **Files modified:** 1 created, 0 modified

## Accomplishments

- `src/browser/launcher.js` exists at the canonical path (matches Phase 2's `src/` module root).
- Two named ESM exports: `BrowserError` (Error subclass with `cause` support, mirroring Phase 2's `ConfigError`) and `async launchBrowser(config)`.
- `chromium.launch({ headless: true })` — no `channel`, no `executablePath`, no `chromiumSandbox` overrides; relies on Playwright defaults (RESEARCH.md §What NOT To Do #2/#3/#4 honored).
- `browser.newContext({ viewport: { width, height }, deviceScaleFactor, baseURL })` — deviceScaleFactor and baseURL are SIBLINGS of viewport, NOT nested (RESEARCH.md §Pitfall 3 avoided).
- Launch failures wrapped in `BrowserError` with a `.message` that names the Playwright Chromium binary cache path so the user has an actionable hint; original Playwright error preserved on `.cause`.
- JSDoc on `launchBrowser` documents the close-order contract verbatim (context BEFORE browser, in try/finally) per Playwright issue #6319.
- Library-shaped: no `console.*`, no `process.exit`, no `chalk`/`ora` imports — verified by grep against non-comment lines.

## Resolved `playwright-chromium` Version

`package-lock.json` resolves `playwright-chromium` to **1.60.0** (declared as `^1` in `package.json`). The v1.60-shaped `BrowserContextOptions`/`LaunchOptions` API documented in RESEARCH.md still applies — no API drift since Phase 1.

## Exported API Surface

### `BrowserError`

```javascript
export class BrowserError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'BrowserError';
    if (cause) this.cause = cause;
  }
}
```

- Shape verified: `new BrowserError('x', { cause: new Error('y') })` produces an instance with `name === 'BrowserError'` and `cause.message === 'y'`.

### `launchBrowser(config)`

```javascript
/**
 * Launch headless Chromium and create a context configured for the v0.1
 * single-viewport/single-page model.
 *
 * The returned context already has viewport.{width,height}, deviceScaleFactor,
 * and baseURL applied — downstream `page.goto(path)` resolves against baseURL
 * and rendering happens at the configured CSS pixel size scaled by DSR.
 *
 * LIFECYCLE CONTRACT — the caller MUST close `context` BEFORE `browser` in a
 * try/finally:
 *
 *     const { browser, context } = await launchBrowser(config);
 *     try {
 *       // ... use context ...
 *     } finally {
 *       await context.close();
 *       await browser.close();
 *     }
 *
 * Reversed order leaks memory: Playwright issue #6319 documents a ~22% RAM
 * reduction when context.close() runs before browser.close().
 *
 * @param {object} config - the validated config from Phase 2's loadConfig
 * @returns {Promise<{
 *   browser: import('playwright-chromium').Browser,
 *   context: import('playwright-chromium').BrowserContext
 * }>}
 * @throws {BrowserError} if Chromium fails to launch (e.g. binary missing)
 */
export async function launchBrowser(config)
```

JSDoc lifecycle note verbatim (the language the file ships with): *"The caller MUST close `context` BEFORE `browser` in a try/finally"* and *"Reversed order leaks memory: Playwright issue #6319 documents a ~22% RAM reduction when context.close() runs before browser.close()."*

## Verification Results

All six checks from the plan's `<verification>` block pass:

| # | Check | Result |
|---|-------|--------|
| 1 | `test -f src/browser/launcher.js` | `file-ok` |
| 2 | `grep` for named `{ chromium }` import | `named-import-ok` |
| 3 | `grep` for absence of `firefox`/`webkit` | `chromium-only-ok` |
| 4 | `grep` for `deviceScaleFactor` AND `baseURL` | `context-options-ok` |
| 5 | End-to-end DSR=2 page.evaluate | `{"w":1440,"h":900,"dpr":2}` |
| 6 | End-to-end DSR=3 devicePixelRatio | `3` |

The plan's task `<verify>` block additionally asserts `BrowserError` shape (`name === 'BrowserError'`, `cause` preserved), the launchBrowser return shape (`browser` + `context` objects, `context.pages()` is an array), and exact dim/DPR match in a single Node one-liner that runs real Chromium. That composite check exited 0 with `ok`.

**Verbatim verification step 5 output (CAP-01 + CAP-02 evidence):**

```
{"w":1440,"h":900,"dpr":2}
```

**Verbatim verification step 6 output (DSR=3 safety check):**

```
3
```

These outputs prove that viewport and deviceScaleFactor both reached the rendering pipeline as siblings — a nested `deviceScaleFactor` inside `viewport` would silently drop and report `dpr: 1` (the Pitfall 3 failure mode).

## Files Created/Modified

- **`src/browser/launcher.js`** (created, 80 lines including JSDoc) — Chromium launch + context creation with viewport/DSR/baseURL siblings; BrowserError class; library-shaped (no I/O beyond Chromium subprocess spawn).

## Decisions Made

The plan's task `<action>` block prescribed nearly every line. Concretely confirmed during execution:

1. **Headless is explicit (`headless: true`)** not relying on Playwright's v1.60 default. Makes intent unmissable for the reader and matches ROADMAP Phase 3 SC #1's "launches headless Chromium" wording.
2. **No `try/catch` around `newContext`** — failures there indicate a malformed config (e.g. zero width) that Phase 2's zod schema should already block. Letting it bubble surfaces real bugs instead of papering over them with a generic BrowserError. Only `chromium.launch` is wrapped because that's the user-fixable failure (binary missing).
3. **Return shape `{ browser, context }`** (both, even though the caller could read `context.browser()`) — keeps the close-order obvious at the call site: `await context.close(); await browser.close();`. Mirrors RESEARCH.md §Pattern 1 verbatim.
4. **BrowserError lives in `launcher.js`, not a separate errors module** — 03-02's `navigator.js` will re-use it via `import { BrowserError } from './launcher.js'` (note for 03-02 below).

## Deviations from Plan

None — plan executed exactly as written. No Rule 1 bugs surfaced, no Rule 2 missing-critical functionality, no Rule 3 blockers, no Rule 4 architectural questions. The plan's task `<action>` block transcribed the RESEARCH.md §Pattern 1 sketch with line-level precision; the launcher matches that sketch.

## Issues Encountered

None.

## Authentication Gates

None. Local-only personal-tool scope; no network credentials, no service accounts, no env vars. Playwright's bundled Chromium binary at `~/Library/Caches/ms-playwright/chromium-1223/` was installed by Phase 1's `npm install` postinstall and verified by Phase 1's SUMMARY.

## Threat Surface Confirmation

The plan's `<threat_model>` was honored:

- **T-03-01-SC (npm supply chain — mitigate):** Zero new dependencies introduced. Only the named-import re-export of `playwright-chromium@1.60.0` (vetted in Phase 1's threat model). Confirmed via `git diff --stat`: only `src/browser/launcher.js` changed.
- **T-03-01-EE (Chromium privilege — accept):** No `chromiumSandbox` override, no privileged-port use. Inherited from Phase 1.
- **T-03-01-T (binary integrity — accept):** No `executablePath` override; Playwright resolves its bundled binary automatically.
- **T-03-01-IY (BrowserError contents — mitigate):** Error message wraps the original `err.message` plus a hard-coded hint about the binary cache path. No `process.env`, no other filesystem paths, no user data interpolated in.
- **T-03-01-RC (browser process leak — mitigate):** Lifecycle contract documented in JSDoc. Actual try/finally lives in `src/cli.js` (wired by 03-02).

No new threat surface introduced beyond what the plan modeled.

## Constraints Confirmed

- **Named import preserved** (commit 95a1c70's regression guard): `import { chromium } from 'playwright-chromium'` — verified by grep, default-import variant verified absent.
- **No `firefox` or `webkit` imports** — verified by grep (no `\bfirefox\b` or `\bwebkit\b` matches in `launcher.js`).
- **No `channel`, `executablePath`, or `chromiumSandbox` options passed to `chromium.launch`** — only `headless: true`. Confirmed by reading the file.
- **No new dependencies in `package.json`** — `git status` showed only `src/browser/launcher.js` as the staged change before the commit.

## User Setup Required

None — no external service configuration needed.

## Next Phase Readiness

**Ready for 03-02 (Wave 2: navigator + CLI wiring).** The launcher module is in place, exports the two symbols 03-02's `src/browser/navigator.js` and `src/cli.js` will consume:

- **`launchBrowser(config)`** — call this from `src/cli.js`'s capture action, before the navigator.
- **`BrowserError`** — `src/browser/navigator.js` should `import { BrowserError } from './launcher.js'` and re-use the class for navigation failures (per RESEARCH.md §Pattern 2). Do NOT redefine a second `BrowserError` in navigator.js — the top-level catch in `src/cli.js` should see one consistent typed error for the whole browser layer.

03-02's job: add `src/browser/navigator.js` (goto + networkidle-timeout-tolerant + fonts.ready), wire `--smoke` into the capture action in `src/cli.js`, and verify the full pipeline produces a PNG at viewport × DSR dimensions. The launcher delivered here is the foundation that wiring layers on top of.

## Commits

| Commit | Task | Type | Summary |
|---|---|---|---|
| `060befd` | 1 | feat | add Chromium launcher with viewport/DSR/baseURL context |

## Self-Check: PASSED

- `src/browser/launcher.js`: FOUND (80 lines, mode 100644)
- Commit `060befd`: FOUND in `git log --oneline --all`
- Verification step 1 (file exists): `file-ok`
- Verification step 2 (named import): `named-import-ok`
- Verification step 3 (no firefox/webkit): `chromium-only-ok`
- Verification step 4 (DSR + baseURL siblings): `context-options-ok`
- Verification step 5 (CAP-01 + CAP-02 end-to-end): `{"w":1440,"h":900,"dpr":2}`
- Verification step 6 (DSR=3 sanity): `3`
- Task `<verify>` block (composite static + dynamic check): exited 0 with `ok`
- `BrowserError` shape: `name === 'BrowserError'`, `cause.message === 'y'`
- No console.*/process.exit/require/chalk/ora in non-comment code (grep count = 0)
- All 12 `<success_criteria>` items satisfied

---
*Phase: 03-browser-navigation*
*Completed: 2026-05-20*
