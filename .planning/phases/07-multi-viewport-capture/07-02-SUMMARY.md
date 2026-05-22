---
phase: 07-multi-viewport-capture
plan: 02
subsystem: capture-core
tags: [playwright, multi-viewport, per-viewport-loop, lifecycle, event-scoping]

# Dependency graph
requires:
  - phase: 07-01
    provides: config.viewports[] normalized array (name required, schema-enforced)
  - phase: 06-terminal-ux
    provides: onProgress seam contract, 06-RESEARCH §Pitfall 5 lifecycle invariant
provides:
  - runCapture returns Array<{ outputPath, hideSummary, viewportName }> (one entry per viewport)
  - launchBrowser(config, viewportEntry) two-arg signature
  - per-viewport-scoped onProgress events: every event carries viewport: <name>
  - per-iteration try/finally lifecycle: context.close() before browser.close() per viewport
affects:
  - 07-03 (cli + server wiring — consumes array return shape and viewport-scoped events)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "for (const vp of config.viewports) loop in runCapture — callers stay dumb adapters (D-03)"
    - "per-iteration launchBrowser(config, vp) — fresh browser+context per viewport, no cross-viewport reuse"
    - "per-iteration finally { context.close(); browser.close(); } — lifecycle invariant preserved per viewport"
    - "onProgress({ type, viewport: vp.name, ...rest }) — all event types carry viewport scoping"
    - "results.push({ outputPath, hideSummary, viewportName: vp.name }) → return results"

key-files:
  created: []
  modified:
    - src/browser/launcher.js
    - src/capture/runCapture.js

key-decisions:
  - "launchBrowser(config, viewportEntry) — second param separates per-viewport dimensions from top-level DSR+baseURL (D-04)"
  - "Loop lives in runCapture, not in callers — D-03 keeps CLI and server as dumb adapters"
  - "viewportEntry.width/height used in newContext; config.deviceScaleFactor and config.baseUrl still from top-level config"
  - "Fail-fast preserved: if iteration N throws, its finally still closes context+browser, throw propagates; no partial results returned"
  - "date computed once outside loop (shared across viewports for output template consistency within a single run)"

# Metrics
duration: 18min
completed: 2026-05-22
---

# Phase 7 Plan 02: runCapture Loop + launchBrowser Signature Summary

**Per-viewport loop pushed into runCapture with fresh browser+context per iteration, viewport-scoped progress events, and array return shape — callers stay dumb adapters**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-05-22T19:30:00Z
- **Completed:** 2026-05-22T19:48:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Refactored `launchBrowser(config)` to `launchBrowser(config, viewportEntry)` — viewport dimensions now read from the per-viewport entry; `deviceScaleFactor` and `baseURL` remain top-level per D-04
- Wrapped `runCapture`'s single-flow body in `for (const vp of config.viewports)` loop with per-iteration lifecycle and event scoping
- Every `onProgress` event now carries `viewport: vp.name` — step, frame, and warning events alike
- Return shape changed from `{ outputPath, hideSummary }` to `Array<{ outputPath, hideSummary, viewportName }>`
- Per-iteration `finally { await context.close(); await browser.close(); }` preserves the 06-RESEARCH §Pitfall 5 lifecycle invariant per viewport
- Hermetic 2-viewport E2E produces 2 distinct PNGs at template-resolved paths (`{viewport}/{page}.png`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor launchBrowser to accept a per-viewport entry parameter** - `a2bf9df` (refactor)
2. **Task 2: Wrap runCapture in per-viewport loop with lifecycle, scoped events, array return** - `24cd249` (feat)

## Files Created/Modified

- `src/browser/launcher.js` — Signature changed from `launchBrowser(config)` to `launchBrowser(config, viewportEntry)`. `browser.newContext` now reads `{ width, height }` from `viewportEntry` instead of `config.viewport`. `BrowserError`, chromium import, and lifecycle JSDoc invariant unchanged. JSDoc updated with new `@param viewportEntry`.
- `src/capture/runCapture.js` — Entire single-flow body wrapped in `for (const vp of config.viewports)` loop. `outputPath` resolved per-iteration via `resolveTemplate(config.output, { date, viewport: vp.name, page })`. All `onProgress` calls gain `viewport: vp.name`. `launchBrowser(config, vp)` called per iteration. `results.push({ outputPath, hideSummary, viewportName: vp.name })` accumulates; `return results` after loop. Per-iteration `finally` preserves lifecycle ordering. Removed `config.viewport.` (singular) and `?? 'default'` fallback.

## New Return Shape

```javascript
// Before:
// Promise<{ outputPath: string, hideSummary: { matched: number, missed: string[] } }>

// After:
// Promise<Array<{ outputPath: string, hideSummary: { matched: number, missed: string[] }, viewportName: string }>>
```

## Event Scoping Pattern

Every `onProgress` event emitted from inside the loop carries `viewport: vp.name`:

```javascript
onProgress({ type: 'step', viewport: vp.name, label: 'Launching Chromium' });
onProgress({ type: 'step', viewport: vp.name, label: 'Installing animation guards' });
onProgress({ type: 'warning', viewport: vp.name, kind: 'hide-missed', selectors: [...] });
onProgress({ type: 'frame', viewport: vp.name, current, total });
```

## Lifecycle Invariant (Per Viewport)

The `finally` block is scoped inside the loop — each viewport closes its own context before its browser:

```javascript
for (const vp of config.viewports) {
  const { browser, context } = await launchBrowser(config, vp);
  try {
    // ... pipeline ...
  } finally {
    // ORDER MATTERS: context first, then browser. (06-RESEARCH §Pitfall 5)
    await context.close();
    await browser.close();
  }
}
```

## Decisions Made

- **Loop in runCapture (D-03):** Per-viewport iteration is owned by `runCapture`, not by CLI or server. Callers receive the array result and consume it — no lifecycle duplication across adapters.
- **viewportEntry second param (D-04):** Separates per-viewport geometry from top-level config fields (deviceScaleFactor, baseURL). The CLI's `--smoke` path still calls `launchBrowser(config)` (one-arg) — Wave 3 will update it to `launchBrowser(config, config.viewports[0])`.
- **date computed once:** `const date = new Date().toISOString().slice(0, 10)` is outside the loop so all viewports in a single run share the same date prefix in their output paths.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Surface Scan

T-07-03 (Information Disclosure — per-viewport browser state): Mitigated. Each iteration calls `launchBrowser(config, vp)` which runs `chromium.launch()` and `browser.newContext()` fresh — no cookies, localStorage, or animation-shim state can leak from viewport N to viewport N+1.

T-07-04 (Denial of Service — resource leak via reversed close order): Mitigated. The `finally { context.close(); browser.close(); }` block is inside the loop, applied per iteration, with context-before-browser ordering preserved exactly as in v0.1.

## Known Stubs

None.

## Self-Check

- [x] `src/browser/launcher.js` exists and exports `launchBrowser` (2-arg) and `BrowserError`
- [x] `src/capture/runCapture.js` contains `for (const vp of config.viewports)` (exactly once)
- [x] `src/capture/runCapture.js` contains `launchBrowser(config, vp)` (not single-arg)
- [x] `src/capture/runCapture.js` contains `viewportName: vp.name`
- [x] Zero `config.viewport.` (singular) references in non-comment lines of both files
- [x] Hermetic 2-viewport E2E: `RUNCAPTURE OK`, `desktop/home.png` and `mobile/home.png` both present
- [x] Plan-level E2E: `PHASE 7 WAVE 2 E2E: ok`, both `a/home.png` and `b/home.png` present
- [x] Commits `a2bf9df` (refactor) and `24cd249` (feat) exist

## Self-Check: PASSED
