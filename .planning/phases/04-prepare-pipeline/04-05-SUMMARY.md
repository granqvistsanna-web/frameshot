---
phase: 04-prepare-pipeline
plan: "05"
subsystem: cli-prepare-integration
tags: [cli, prepare, PREP-01, PREP-02, PREP-03, PREP-04, PREP-05, smoke, integration]
dependency_graph:
  requires:
    - src/prepare/index.js (04-04 — installAnimationGuards + runPreparePipeline)
    - src/browser/launcher.js (launchBrowser — context for installAnimationGuards)
    - src/browser/navigator.js (navigateToPage — page for runPreparePipeline)
    - samples/serve-smoke.js (Phase 3 fixture server — extended with PREP-evidence elements)
    - samples/smoke.yaml (Phase 3 fixture config — extended with hide/scrollPrime/extraDelay)
  provides:
    - src/cli.js (wired capture action: installAnimationGuards pre-nav, runPreparePipeline post-nav)
    - samples/serve-smoke.js (extended with four PREP-evidence fixture elements)
    - samples/smoke.yaml (phase-04-smoke: hide, scrollPrime, extraDelay configured)
  affects:
    - Phase 5 (scroll-stitch capture): builds on the prepared Page that runPreparePipeline leaves behind
tech_stack:
  added: []
  patterns:
    - Two-seam lifecycle: installAnimationGuards (pre-nav context-level), runPreparePipeline (post-nav page-level)
    - console.time/timeEnd gated on opts.smoke — instrumentation at CLI layer, silent in library
    - Playwright animations:'disabled' screenshot option (WAAPI fast-forward, belt-and-braces)
    - Hermetic fixture server pattern (dep-free Node http, 127.0.0.1:7357, SIGTERM cleanup)
key_files:
  created: []
  modified:
    - src/cli.js
    - samples/serve-smoke.js
    - samples/smoke.yaml
decisions:
  - console.time lives in cli.js (smoke-only gate) not in src/prepare/* — per 04-PATTERNS Risk 13
  - animations:disabled screenshot option is belt-and-braces over CSS injection (WAAPI not coverable by CSS)
  - hideSummary captured but intentionally unused in Phase 4 — Phase 6 (CLI-03) surfaces missed selectors
  - Four fixture elements each carry data-test="..." attribute for deterministic E2E query
  - No new CLI flags (users opt-out via YAML prepare: block) — per RESEARCH Locked Decisions
metrics:
  duration: "~5 minutes"
  completed_date: "2026-05-22"
  tasks_completed: 4
  tasks_total: 4
  files_created: 0
  files_modified: 3
---

# Phase 4 Plan 05: CLI Wiring + End-to-End Integration Summary

Phase 4 prepare-pipeline wired into the capture action in one import + two call sites; all five PREP-* requirements proved with one hermetic smoke run producing on-disk evidence.

## What Was Built

Three files modified to complete the Phase 4 integration:

1. **`src/cli.js`** — ONE new import line from `./prepare/index.js`; two new call sites (`installAnimationGuards` pre-nav, `runPreparePipeline` post-nav); `animations: 'disabled'` on the smoke screenshot; `console.time/timeEnd` around runPreparePipeline gated inside the `if (opts.smoke)` branch.

2. **`samples/serve-smoke.js`** — HTML constant extended with four PREP-evidence fixture elements, each with `data-test="..."` attribute; page renamed to "framershot phase 4 smoke". Server architecture (port 7357, dep-free, signal handlers) unchanged.

3. **`samples/smoke.yaml`** — Renamed to `phase-04-smoke`; `prepare.hide: ['.hidden-by-test']`; `prepare.scrollPrime: true`; `prepare.extraDelay: 1000`. Comment block extended with Phase 4 additions explanation.

## src/cli.js Diff

### New import line (after line 5):
```js
import { installAnimationGuards, runPreparePipeline } from './prepare/index.js';
```

### Pre-nav call (between launchBrowser and navigateToPage — was lines 27-29):
```js
const { browser, context } = await launchBrowser(config);
try {
  await installAnimationGuards(context, config.prepare);   // ★ NEW — pre-nav (04-01)
  const navigatedPage = await navigateToPage(context, config.page);
```

### Post-nav call (after navigateToPage, before if (opts.smoke)):
```js
  if (opts.smoke) console.time('prepare');                 // ★ NEW — smoke-only timing
  const { hideSummary } = await runPreparePipeline(navigatedPage, config.prepare); // ★ NEW
  // hideSummary is intentionally unused in Phase 4 — Phase 6 (CLI-03)
  // will surface hideSummary.missed as warnings if any hide: selector matched 0 elements.
  if (opts.smoke) console.timeEnd('prepare');              // ★ NEW — smoke-only timing
```

### Smoke screenshot option added:
```js
  await navigatedPage.screenshot({ path: resolvedOutput, fullPage: false, animations: 'disabled' });
```

## samples/serve-smoke.js Diff

Four new fixture elements added to the HTML constant (inside `<body>`):

| Fixture | data-test | Purpose |
|---------|-----------|---------|
| `.anim-target` div + `@keyframes spin` + `animation: spin 2s linear infinite` | `"anim-target"` | PREP-01: CSS animation freeze evidence |
| `.io-target` div at `opacity: 0` + inline IIFE with `new IntersectionObserver` | `"io-target"` | PREP-02: IO shim fires, opacity flips to 1 |
| `.hidden-by-test` div with visible background text | `"hidden-by-test"` | PREP-03: hide: selector match target |
| 2000px linear-gradient spacer + `<img loading="lazy">` with inline SVG data: URI | `"lazy-img"` | PREP-04: lazy-load triggered by scrollPrime |

No `@font-face` rules added (hermetic boundary preserved from Phase 3).

## samples/smoke.yaml Diff

| Field | Before | After |
|-------|--------|-------|
| `name` | `phase-03-smoke` | `phase-04-smoke` |
| `prepare.hide` | (absent — defaults to []) | `['.hidden-by-test']` |
| `prepare.scrollPrime` | `false` | `true` |
| `prepare.extraDelay` | `0` | `1000` |

All other fields unchanged: `baseUrl`, `output`, `deviceScaleFactor`, `viewport`, `page`.

## End-to-End Smoke Run Output

### Step 2 — capture --smoke stdout/stderr:
```
prepare: 2.031s
smoke screenshot written: /tmp/framershot-smoke/home.png
```

Note: Node's `console.timeEnd` outputs `X.XXXs` (not `NNNNms`) for durations >= 1 second. `2.031s` = 2031ms, which is well above the 1000ms PREP-05 floor.

### Step 3 — PNG dimensions:
```
1600x1200  (viewport 800×600 × DSR 2 — preserves Phase 3 geometry proof)
```

### Step 4 — Inline Node E2E script output:
```
PREP-01..05 all pass. anim:0s io:1 hide:hidden lazy:true(100) extraDelay+:2048ms hide.matched:1
```

## PREP-* Requirements Evidence

| Requirement | Assertion | Result | Evidence |
|-------------|-----------|--------|----------|
| PREP-01 (CSS animation freeze) | `getComputedStyle(.anim-target).animationDuration === '0s'` | **PASS** | `anim:0s` |
| PREP-02 (IO shim fires) | `getComputedStyle(.io-target).opacity === '1'` | **PASS** | `io:1` |
| PREP-03 (selector hide) | `getComputedStyle(.hidden-by-test).visibility === 'hidden'` | **PASS** | `hide:hidden` |
| PREP-04 (scroll prime lazy-load) | `img.complete && img.naturalWidth === 100` | **PASS** | `lazy:true(100)` |
| PREP-05 (extraDelay honored) | `elapsed >= 1000ms` (measured 2048ms) | **PASS** | `extraDelay+:2048ms` |
| Integration: animation-guards style | `style[data-framershot="animation-guards"]` in DOM | **PASS** | (confirmed) |
| Integration: hideSummary.matched | `hideSummary.matched === 1` | **PASS** | `hide.matched:1` |

## Phase 3 Lifecycle Invariant Preserved

```
context.close() BEFORE browser.close() in finally
```
Verified via Node position check: `context.close()` at position 3038, `browser.close()` at position 3069.

## Non-Smoke Pass-Through Preserved

Non-smoke runs still emit JSON containing both `_resolvedOutput` AND `_navigated` (Phase 3 contract):
```
_resolvedOutput: OK
_navigated: OK
```

## No New CLI Flags

`node index.js capture --help` reports 1 flag (`--smoke`). No new flags added.

## No New Dependencies

Package.json dependency count: 7 (unchanged from Phase 3).

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend serve-smoke.js with four PREP-evidence fixture elements | c87349c | samples/serve-smoke.js |
| 2 | Update smoke.yaml for phase-04 | 26ba467 | samples/smoke.yaml |
| 3 | Wire Phase 4 prepare pipeline into capture action | 0126404 | src/cli.js |
| 4 | End-to-end smoke verify (no files) | (no commit — verify-only task) | — |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment in serve-smoke.js contained literal "@font-face" string**
- **Found during:** Task 1 verification
- **Issue:** The inherited Phase 3 file comment included "The page declares NO @font-face rules" — this literal string contains `@font-face`, which triggered the acceptance criteria's `! grep -q "@font-face"` guard.
- **Fix:** Rephrased the comment to "The page declares no custom font rules" — semantic meaning identical, no `@font-face` literal in the file. Same fix pattern as 04-02's deviation.
- **Files modified:** `samples/serve-smoke.js` (comment only, no functional change)
- **Commit:** c87349c (same task commit)

**2. [Rule 1 - Note] console.timeEnd outputs "X.XXXs" not "NNNNms" for durations >= 1s**
- **Found during:** Task 4 verification
- **Issue:** The plan's Task 4 verify regex `grep -qE "prepare: [0-9]+(\.[0-9]+)?ms"` assumes Node prints `NNNNms` format. Node.js `console.timeEnd` uses seconds format (`2.031s`) for durations >= 1000ms.
- **Impact:** The plan's grep check would fail, but the underlying PREP-05 requirement is satisfied — `2.031s` = 2031ms >= 1000ms. The E2E script measures elapsed independently and asserts `elapsed >= 1000` which passes.
- **No code change needed:** Implementation is correct. The plan's verify script has an overly-specific regex. The SC #4 requirement is observably met.

**3. [Note] macOS ugrep grep -Pzo multiline pattern behavior**
- **Found during:** Task 3 verification
- **Issue:** `grep -Pzo "(?s)..."` multiline patterns in the plan's verify block did not work as expected on macOS ugrep. The ordering was verified instead via a Node.js position-check script.
- **Impact:** None — the code ordering is correct (verified positionally). The plan's verify patterns assume GNU grep behavior.

## Phase 5 Readiness

Phase 4 is complete. Phase 5 (scroll-stitch output) can now build on the prepared `Page` that `runPreparePipeline` leaves behind:

- All animations frozen (PREP-01) — no mid-flight tween in stitch frames
- All IO-triggered in-view effects fired (PREP-02) — content revealed before stitching
- Sticky elements hidden (PREP-03) — no ghosted navs in any stitch frame
- Lazy images loaded (PREP-04) — no blank placeholders in the stitched output
- Extra settling delay honored (PREP-05) — page fully stable before Phase 5 captures

## Known Stubs

None — all five PREP-* requirements are fully implemented and E2E-verified.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. The fixture server remains loopback-only (127.0.0.1:7357). The `console.time` output goes to stderr and contains no user data. The `hideSummary` variable is captured but never logged in Phase 4. All threats from the plan's `<threat_model>` are addressed.

## Self-Check: PASSED

- `src/cli.js` exists: FOUND
- `samples/serve-smoke.js` exists: FOUND
- `samples/smoke.yaml` exists: FOUND
- Task 1 commit `c87349c` exists: FOUND
- Task 2 commit `26ba467` exists: FOUND
- Task 3 commit `0126404` exists: FOUND
- PNG at `/tmp/framershot-smoke/home.png` with dimensions 1600x1200: CONFIRMED
- PREP-01 (anim:0s): PASS
- PREP-02 (io:1): PASS
- PREP-03 (hide:hidden): PASS
- PREP-04 (lazy:true(100)): PASS
- PREP-05 (elapsed:2048ms >= 1000ms): PASS
- hideSummary.matched === 1: CONFIRMED
- animation-guards style in DOM: CONFIRMED
- No new dependencies: CONFIRMED (count: 7)
- No new CLI flags: CONFIRMED (count: 1)
- Phase 3 lifecycle invariant preserved: CONFIRMED
- Non-smoke JSON pass-through preserved: CONFIRMED
