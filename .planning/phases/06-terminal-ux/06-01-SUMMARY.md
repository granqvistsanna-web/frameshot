---
phase: 06-terminal-ux
plan: 01
subsystem: cli
tags: [ora, chalk, spinner, progress, terminal-ux, onProgress, callback]

# Dependency graph
requires:
  - phase: 05-scroll-stitch-output
    provides: captureFullPage in src/capture/index.js + captureFrames in src/capture/frames.js (patched to accept onProgress)
  - phase: 04-prepare-pipeline
    provides: runPreparePipeline returning { hideSummary } with hideSummary.missed[] as selector-warning data source
  - phase: 03-browser-lifecycle
    provides: launchBrowser, navigateToPage, browser/context lifecycle
  - phase: 02-config-schema
    provides: loadConfig, resolveTemplate
provides:
  - src/cli/format.js with makeProgress() (ora factory) and printSelectorWarnings(hideSummary) (yellow warning emitter)
  - onProgress callback contract threaded through captureFullPage → captureFrames; invokes callback?.(i+1, total) per frame
  - spinner wired across 7 step boundaries in src/cli.js: Loading config → Launching Chromium → Installing animation guards → Navigating to <url> → Running prepare pipeline → Capturing frame N/M → screenshot written
  - module-level currentSpinner + getCurrentSpinner() export for 06-02 catch wiring
  - selector-warning sandwich in cli.js (spinner.stop / printSelectorWarnings / spinner.start) between prepare and capture
  - samples/smoke.yaml updated with .does-not-exist to exercise the selector-warning path on every smoke run
affects: [06-02, index.js (catch wiring for getCurrentSpinner + formatError)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "makeProgress() ora factory: no args, returns ora({ color: 'cyan', stream: process.stderr }); caller sets text via spinner.start('...')"
    - "Selector-warning sandwich: spinner.stop() → printSelectorWarnings(hideSummary) → spinner.start() — prevents spinner repaint colliding with console.warn output"
    - "onProgress callback option: optional (current, total) => void on captureFullPage/captureFrames; library calls it after each frame, CLI displays; silent-library posture preserved"
    - "Module-level currentSpinner ref + getCurrentSpinner() export: lets index.js catch call spinner.fail() without passing the spinner through commander"
    - "Smoke branch gets spinner.stop() + currentSpinner = null FIRST before any smoke output — spinner never appears in hermetic smoke output"

key-files:
  created:
    - src/cli/format.js
  modified:
    - src/cli.js
    - src/capture/index.js
    - src/capture/frames.js
    - samples/smoke.yaml

key-decisions:
  - "Silent-library posture maintained: no chalk/ora in src/{browser,prepare,capture}/; onProgress callback is the bridge"
  - "selector warnings print in BOTH smoke and non-smoke (user-config feedback); spinner stays stopped for smoke branch"
  - "Module-level currentSpinner (not passed through commander) is the canonical approach for index.js catch to reach the spinner"
  - "console.log duplicate to stdout after spinner.succeed() preserves pipe-capturable result line (stderr=chatter, stdout=data)"

patterns-established:
  - "CLI presentation helpers live exclusively in src/cli/format.js; library tree must not import from it"
  - "All seven CLI step boundaries map 1:1 to spinner.text updates — no new flags, no manual TTY checks, ora auto-disables"

requirements-completed: [CLI-02]

# Metrics
duration: 4min
completed: 2026-05-22
---

# Phase 6 Plan 01: Terminal UX Progress Wiring Summary

**ora spinner wired across 7 step boundaries in cli.js via makeProgress() factory in src/cli/format.js, with onProgress callback contract threaded through captureFullPage → captureFrames for per-frame "Capturing N/M" updates and yellow selector warnings after runPreparePipeline**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-22T14:02:15Z
- **Completed:** 2026-05-22T14:06:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Created `src/cli/format.js` with `makeProgress()` (ora factory, cyan, stderr) and `printSelectorWarnings(hideSummary)` (chalk.yellow per missed selector via console.warn)
- Patched `src/capture/index.js` and `src/capture/frames.js` to accept and thread `onProgress` callback — invoked `onProgress?.(i + 1, total)` after each frame resolves in the capture loop; backward-compatible; silent-library posture preserved
- Wired all 7 step boundaries in `src/cli.js` with spinner text updates; module-level `currentSpinner` + `getCurrentSpinner()` export for 06-02's catch wiring; selector-warning sandwich prevents repaint collision; smoke branch stops spinner before existing console output
- Updated `samples/smoke.yaml` to include `.does-not-exist` in `prepare.hide` so the selector-warning path is exercised on every smoke run

## Task Commits

1. **Task 1: Create src/cli/format.js** - `4aec469` (feat)
2. **Task 2: Add onProgress to captureFullPage + captureFrames** - `d9c9bd9` (feat)
3. **Task 3: Wire spinner into cli.js + update smoke.yaml** - `000f223` (feat)

## Files Created/Modified

- `src/cli/format.js` — CLI-only presentation helpers: `makeProgress()` ora factory and `printSelectorWarnings(hideSummary)` yellow warning emitter; Phase 6 owned, library tree must not import this
- `src/cli.js` — spinner wired across 7 step boundaries; module-level `currentSpinner` + `getCurrentSpinner()` export; selector-warning sandwich; captureFullPage called with onProgress callback; smoke branch stops spinner first
- `src/capture/index.js` — `captureFullPage(page, outputPath, options={})` accepts `{ onProgress }` and threads it to `captureFrames`
- `src/capture/frames.js` — `captureFrames(page, options={})` invokes `onProgress?.(i + 1, total)` after each frame resolves; index-based loop
- `samples/smoke.yaml` — added `.does-not-exist` selector to `prepare.hide` with explanatory comment

## Decisions Made

- Used module-level `currentSpinner` reference (not passing through commander) so `index.js`'s catch can call `spinner.fail()` without restructuring the commander integration
- `printSelectorWarnings` uses `console.warn` with `chalk.yellow(entire line)` — full yellow line matches "non-fatal but worth attention" semantics; prefix-only coloring is the rule for errors only
- Duplicate `console.log` to stdout after `spinner.succeed()` preserves a pipe-capturable result line (stderr = chatter, stdout = data)
- Selector warnings print in both smoke and non-smoke modes because they reflect user-config quality; only the spinner is suppressed in smoke mode

## Deviations from Plan

None — plan executed exactly as written. Phase 5 was confirmed complete (patch scenario); all three tasks followed the specified action steps.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- 06-01 complete. `getCurrentSpinner()` is exported and ready for `index.js` catch wiring in 06-02.
- `formatError` function (CLI-03) needs to be appended to `src/cli/format.js` in 06-02.
- `index.js` catch needs to be replaced with `formatError` + `spinner.fail()` logic in 06-02.
- All plan-level verifications passed: smoke suite end-to-end, silent-library grep check.

## Self-Check

**Files created:**
- `src/cli/format.js` exists: FOUND
- `.planning/phases/06-terminal-ux/06-01-SUMMARY.md`: (this file)

**Commits:**
- `4aec469` (Task 1): FOUND
- `d9c9bd9` (Task 2): FOUND
- `000f223` (Task 3): FOUND

**Plan-level verification:**
- Smoke suite: EXIT 0, contains `smoke screenshot written` and `⚠ hide selector ".does-not-exist"`, zero ora spinner frames — PASS
- Silent-library invariant: `grep -rE "^import .*(chalk|ora)" src/browser/ src/prepare/ src/capture/` → 0 — PASS

## Self-Check: PASSED

---
*Phase: 06-terminal-ux*
*Completed: 2026-05-22*
