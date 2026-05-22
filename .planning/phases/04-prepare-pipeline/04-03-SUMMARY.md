---
phase: 04-prepare-pipeline
plan: "03"
subsystem: prepare
tags: [scroll-prime, extra-delay, lazy-load, playwright, prep-04, prep-05]
dependency_graph:
  requires:
    - src/browser/navigator.js  # produces the Page passed to scrollPrime/extraDelay
    - src/config/schema.js      # scrollPrime:boolean, extraDelay:int — schema locks the API
  provides:
    - src/prepare/scroll.js     # scrollPrime(page) + extraDelay(page, ms)
  affects:
    - src/prepare/index.js      # 04-05 wires these two exports into runPreparePipeline
tech_stack:
  added: []
  patterns:
    - "page.evaluate for both geometry read and each scrollTo call (PREP-04)"
    - "page.waitForTimeout as the Playwright-controlled wait primitive (PREP-04 + PREP-05)"
    - "behavior: 'instant' on every scrollTo — NEVER 'smooth' (04-PATTERNS Risk 12)"
    - "Short-circuit on ms <= 0 (PREP-05 no-op default)"
key_files:
  created:
    - src/prepare/scroll.js
  modified: []
decisions:
  - "INTER_STEP_WAIT_MS = 200 — fixed constant at module level (not configurable in v0.1)"
  - "behavior: 'instant' explicit on every scrollTo call — anti-regression armor"
  - "Geometry (innerHeight, totalHeight) read once before the loop, not re-read per iteration"
  - "extraDelay accepts page arg to keep clock control in Playwright hands (not setTimeout)"
  - "Zero imports — pure two-function module with no dependencies"
metrics:
  duration: ~4 min
  completed: "2026-05-22"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 04 Plan 03: Scroll Prime + Extra Delay Summary

Implemented the post-navigation scroll prime (PREP-04) and extra delay (PREP-05) as two
named async exports in `src/prepare/scroll.js`. Both are pure Playwright timing primitives
with no imports and full library posture (no console output, no process.exit, no chalk/ora).

## Exported API Surface

### `export async function scrollPrime(page)`

```js
// @param {import('playwright-chromium').Page} page
// @returns {Promise<void>}
```

Scrolls from top to bottom in `window.innerHeight` steps using `behavior: 'instant'` on
every `window.scrollTo` call, waits `INTER_STEP_WAIT_MS` (200ms) between steps so
browser-native `loading="lazy"` IntersectionObservers can fire and start their image
fetches. After the loop exits, resets to `scrollY = 0` with an explicit final
`window.scrollTo({ top: 0, behavior: 'instant' })` so Phase 5's capture loop starts
from a known position.

Key invariants enforced:
- Geometry (`innerHeight`, `totalHeight`) is read once at the start via a single
  `page.evaluate` — NOT re-read inside the loop.
- `behavior: 'instant'` is explicit on EVERY `scrollTo` call (both loop iterations and
  the final reset). Smooth scrolling animates over ~300ms and races with the 200ms
  inter-step wait, defeating the lazy-load prime.
- No try/catch around any Playwright primitive — errors bubble to the CLI.

### `export async function extraDelay(page, ms)`

```js
// @param {import('playwright-chromium').Page} page
// @param {number} ms
// @returns {Promise<void>}
```

Short-circuits on `ms <= 0` (the schema default is 0 — most runs skip the wait entirely).
Otherwise calls `await page.waitForTimeout(ms)`. Uses `page.waitForTimeout` (NOT
`setTimeout`) to keep clock control in Playwright's hands.

## End-to-End Verify Output

Run against a 2400px-tall page in a 300px viewport (scrollHeight ≈ 2450px, innerHeight = 300):

```
steps=9 scrollHeight=2450 innerHeight=300 elapsed=1838ms minMs=1700
lazy: {"complete":true,"naturalWidth":1}
ok — elapsed=1838ms extraDelay(0)=0ms extraDelay(-10)=0ms extraDelay(300)=301ms
```

Exit code: 0.

## Verification Results

| Check | Result |
|-------|--------|
| INTER_STEP_WAIT_MS = 200 | confirmed (const at module top) |
| Scroll steps (2450 / 300, ceil) | 9 steps |
| Wall clock elapsed | 1838ms >= 1700ms (9 steps × 200ms - 100ms slack) |
| Final scrollY after prime | 0 (verified via page.evaluate) |
| Lazy PNG at bottom loaded | complete=true, naturalWidth=1 |
| extraDelay(0) duration | 0ms (< 50ms short-circuit threshold) |
| extraDelay(-10) duration | 0ms (< 50ms short-circuit threshold) |
| extraDelay(300) duration | 301ms (in [280, 600]ms range) |
| `behavior: 'smooth'` absent | confirmed (grep check passed) |
| No new dependencies in package.json | confirmed |

### Note on Plan Verify Script vs. Actual E2E Verification

The plan's `<verify>` script uses an inline SVG data URI (`data:image/svg+xml;utf8,...`)
for the lazy image. In Chromium, inline SVGs report `naturalWidth === 0` regardless of
loading state (no intrinsic dimensions without an explicit width/height in the SVG root),
so the `img.naturalWidth > 0` condition in that script can never pass for that image type.

The actual E2E verification was run with a 1x1 PNG data URI (binary, not SVG) which
correctly reports `naturalWidth === 1` after lazy-loading. This confirms:
- `scrollPrime` successfully triggers `loading="lazy"` IntersectionObserver events
- The 200ms inter-step wait gives the browser time to initiate and complete the fetch
- The final reset returns scrollY to 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Verify script image type incompatible with `naturalWidth > 0` check**

- **Found during:** Task 1 verification
- **Issue:** The plan's `<verify>` script uses a `data:image/svg+xml;utf8,...` lazy image.
  Chromium returns `naturalWidth === 0` for SVG data URIs without intrinsic dimensions,
  making `img.complete && img.naturalWidth > 0` always false for that image type.
  This is a quirk of SVG handling in Chromium, not a bug in `scrollPrime`.
- **Fix:** Ran E2E verification using a 1x1 PNG data URI (`data:image/png;base64,...`)
  which correctly reports `naturalWidth: 1` after lazy loading. The implementation
  itself was not modified — only the verification image type was swapped for the test.
- **Files modified:** None (verification only; scroll.js is unchanged)
- **Commit:** e979ddf (same task commit — the implementation was already correct)

## Known Stubs

None — both exports are fully implemented with no placeholder values.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced.
Both functions operate entirely within the Page handle passed by the caller.

## Note for 04-05 (Orchestrator)

- Gate `scrollPrime` on `prepareConfig.scrollPrime` (boolean default true — schema.js:29).
  The function itself does NOT check this flag — it assumes the caller already decided to run it.
- `extraDelay` is unconditional in the call — the function itself short-circuits on `ms <= 0`.
  No gate needed at the orchestrator level; just pass `config.prepare.extraDelay` as `ms`.
- Wrap the post-nav sequence in `console.time('prepare')` for SC #4 evidence. That timing
  call lives in `cli.js` (or `src/prepare/index.js`), NOT in this file.
- Call order per interface spec: `hideSelectors` (04-02) → `scrollPrime` (this) → `extraDelay` (this).
  Scrolling AFTER hide ensures hidden elements don't trigger unnecessary lazy-load fetches.
  `extraDelay` runs last so it provides settling time after all DOM mutations.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/prepare/scroll.js exists | FOUND |
| 04-03-SUMMARY.md exists | FOUND |
| Commit e979ddf exists | FOUND |
