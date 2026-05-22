---
phase: 05-scroll-stitch-output
plan: 01
subsystem: capture
tags: [playwright, screenshot, scroll, clip, devicePixelRatio, node]

# Dependency graph
requires:
  - phase: 04-prepare-pipeline
    provides: Prepared Page handle (animations frozen, selectors hidden, scroll-primed to y=0)
provides:
  - "src/capture/frames.js — captureFrames(page) → { frames: Buffer[], geometry } (OUT-01)"
  - "src/capture/ directory established as the Phase 5 module root"
affects:
  - 05-02-stitch (consumes frames + geometry from this module)
  - 05-03-index-cli (orchestrator calls captureFrames, passes result to stitchFrames)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "geometry-once invariant: read viewportWidth/viewportHeight/totalHeight/deviceScaleFactor in single page.evaluate before loop"
    - "pre-computed frameYOffsets array with clamped last-frame for overlap-and-trust-composite"
    - "rAF roundtrip wait between scroll and screenshot (not fixed timeout)"
    - "clip.y always 0 (viewport-relative coordinates) after instant scroll to target position"

key-files:
  created:
    - src/capture/frames.js
  modified: []

key-decisions:
  - "clip.y is 0 (viewport-relative), not the document-y scroll offset — Playwright page.screenshot clip coords are local to the current viewport, not absolute document coordinates"
  - "rAF roundtrip via page.evaluate is sufficient wait between scroll and screenshot (Phase 4 scrollPrime owned lazy-load triggering)"
  - "ZERO imports in frames.js — Page is a parameter, JSDoc uses import() type-only annotation"

patterns-established:
  - "src/capture/ module uses same library-posture as src/prepare/ and src/browser/: no console, no chalk/ora, no process.exit, errors bubble"
  - "Frame capture loop iterates over pre-computed frameYOffsets, not a for-y+=vh pattern (cleaner last-frame clamp)"

requirements-completed:
  - OUT-01

# Metrics
duration: 15min
completed: 2026-05-22
---

# Phase 5 Plan 01: captureFrames Scroll-Capture Loop Summary

**Viewport-height scroll loop with pre-computed frameYOffsets, rAF wait, and overlap-and-trust-composite last-frame strategy returning ordered PNG buffers plus geometry for the stitcher**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-22T00:00:00Z
- **Completed:** 2026-05-22
- **Tasks:** 1
- **Files modified:** 1 (new)

## Accomplishments

- Created `src/capture/` directory and `src/capture/frames.js` with the `captureFrames(page)` export
- Geometry (viewportWidth, viewportHeight, totalHeight, deviceScaleFactor) read once in a single page.evaluate — never re-read in the loop
- Pre-computed `frameYOffsets` array: single-frame `[0]` fast path when totalHeight <= viewportHeight; else nFull entries at `i * viewportHeight` plus clamped last frame at `totalHeight - viewportHeight` when remainder exists
- Per-frame body: instant scroll, single rAF roundtrip wait, `page.screenshot({ clip: { x:0, y:0, w, h }, animations:'disabled', scale:'device', type:'png' })`
- All 3 end-to-end runtime cases verified: Case A (exact multiple → 8 frames), Case B (remainder → 9 frames, last clamped to 2150), Case C (short page → 1 frame)

## API Surface

```javascript
// src/capture/frames.js
export async function captureFrames(page)
// Returns:
{
  frames: Buffer[],          // ordered PNG buffers, one per frameYOffset
  geometry: {
    viewportWidth: number,      // CSS pixels (innerWidth)
    viewportHeight: number,     // CSS pixels (innerHeight)
    totalHeight: number,        // CSS pixels (scrollHeight at start)
    frameYOffsets: number[],    // CSS-pixel y offset per frame; order matches frames[]
    deviceScaleFactor: number,  // physical:CSS pixel ratio from window.devicePixelRatio
  }
}
// Contract: frames.length === geometry.frameYOffsets.length
// Each frames[i] is a PNG Buffer of physical size (viewportWidth·DSR × viewportHeight·DSR)
```

## Task Commits

1. **Task 1: Implement src/capture/frames.js** - `8b29be4` (feat)

**Plan metadata:** [committed after SUMMARY — see final commit]

## Files Created/Modified

- `src/capture/frames.js` — captureFrames(page) → { frames, geometry }; ZERO imports; library posture (no console/chalk/ora/process.exit); errors bubble to CLI

## Static Verification Gates (all passed)

```
dir-ok              src/capture/ directory exists
file-ok             src/capture/frames.js exists
export-ok           export async function captureFrames present
zero-imports-ok     grep -cE '^[[:space:]]*import\s' = 0
innerWidth-ok       window.innerWidth present
innerHeight-ok      window.innerHeight present
scrollHeight-ok     document.documentElement.scrollHeight present
dpr-ok              window.devicePixelRatio present
raf-ok              requestAnimationFrame present
no-waitForTimeout-ok page.waitForTimeout absent
instant-ok          behavior: 'instant' present
no-smooth-ok        behavior: 'smooth' absent
scale-device-ok     scale: 'device' present
no-scale-css-ok     scale: 'css' absent
animations-disabled-ok animations: 'disabled' present
type-png-ok         type: 'png' present
no-omitBackground-ok omitBackground absent
no-fullPage-ok      fullPage absent
no-fullpage-true-ok ! grep -rq 'fullPage: true' src/ passes
no-banned-apis-ok   scrollIntoView / waitForLoadState absent
no-error-wrap-ok    BrowserError / CaptureError absent
no-class-ok         class keyword absent
no-lifecycle-ok     context.close / browser.close absent
library-shape-ok    console.*/process.exit/chalk/ora absent in non-comment lines
deps-ok             package.json dependency count still 7 (no new deps)
```

## End-to-End Runtime Cases

**Case A — exact multiple (2400px page, 300px viewport, DSR=2):**
- Frames: 8
- frameYOffsets: `[0, 300, 600, 900, 1200, 1500, 1800, 2100]`
- Every frame: valid PNG (magic bytes `89 50 4E 47 0D 0A 1A 0A`)
- geometry.deviceScaleFactor: 2 (read from window.devicePixelRatio at runtime, not hard-coded)

**Case B — remainder present (2450px page, 300px viewport, overlap-and-trust-composite contract):**
- Frames: 9
- frameYOffsets[7]: 2100 (last full step)
- frameYOffsets[8]: 2150 (clamped to totalHeight - viewportHeight = 2450 - 300)
- frameYOffsets[8] (2150) is strictly between frameYOffsets[7] (2100) and 2100+300 (2400) — overlap confirmed

**Case C — single-frame fast path (200px page, 300px viewport):**
- Frames: 1
- frameYOffsets: `[0]`
- geometry.deviceScaleFactor: 2

## Decisions Made

**clip.y is always 0 (viewport-relative coordinates)**
Playwright's `page.screenshot({ clip })` takes coordinates relative to the current visible viewport, not absolute document coordinates. After scrolling to `y` via `window.scrollTo({ top: y })`, the clip rect for capturing the full visible area is always `{ x: 0, y: 0, width: viewportWidth, height: viewportHeight }`. The plan's instruction template used `y` (document offset) in the clip rect, which Playwright rejects with "Clipped area is either empty or outside the resulting image" for any scroll position beyond y=0. The `frameYOffsets` array still drives `scrollTo` correctly; only the clip rect uses y=0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] clip.y fixed to 0 (viewport-relative) instead of document-y offset**
- **Found during:** Task 1 (end-to-end runtime verification, Case A)
- **Issue:** The plan's action template specified `clip: { x: 0, y, width: viewportWidth, height: viewportHeight }` where `y` is the scroll offset. Playwright's `clip` coordinates are relative to the current viewport (not the document), so passing `y=300` after scrolling to 300 causes Playwright to reject the screenshot because the clip rect starts at CSS y=300 inside a 300px viewport (outside bounds).
- **Fix:** Changed `clip.y` from `y` (scroll offset) to `0` (always top of visible viewport). The `frameYOffsets` value is still used as the `scrollTo` target; the clip always captures from the top of the scrolled-to position.
- **Files modified:** `src/capture/frames.js`
- **Verification:** All three end-to-end cases pass; Playwright no longer throws; buffer content is correct viewport capture
- **Committed in:** `8b29be4` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Essential correctness fix. Clip coordinate semantics were wrong in the plan template; runtime testing caught it immediately. No scope creep.

## Stitch Contract (note for 05-02)

- `frames.length === geometry.frameYOffsets.length` is guaranteed
- Each `frames[i]` is a PNG Buffer of physical size `(viewportWidth · DSR) × (viewportHeight · DSR)`
- The stitcher multiplies CSS-pixel offsets by DSR for canvas math: `top = frameYOffsets[i] * deviceScaleFactor`
- The last frame's `frameYOffsets[i]` may equal `totalHeight - viewportHeight` (clamped) — this OVERLAPS the prior frame's region. Sharp composite-order in 05-02 paints later overlays on top; the last frame wins, overwriting the overlapped region cleanly

## Orchestrator Contract (note for 05-03)

- Consume `{ frames, geometry }` from `captureFrames(page)` and pass directly to `stitchFrames(frames, geometry)`
- The orchestrator does NOT inspect or transform the geometry
- `captureFrames` does NOT close page, context, or browser — the CLI's try/finally owns lifecycle

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes. The module performs read-only browser interactions (page.evaluate + page.screenshot) and returns Buffers in-process. No new trust boundaries introduced beyond what is documented in the plan's threat model.

## Known Stubs

None — `captureFrames` returns real PNG buffers from live Playwright evaluation. No placeholder data.

## Self-Check: PASSED

- `src/capture/frames.js` exists: FOUND
- Commit `8b29be4` exists: FOUND
- All 25 static checks: PASSED
- End-to-end runtime (3 cases): PASSED

## Next Phase Readiness

- `captureFrames(page)` is ready for 05-02 (`stitchFrames`) to consume
- `src/capture/` directory established for 05-02's `stitch.js` and 05-03's `index.js`
- The geometry contract (`viewportWidth`, `viewportHeight`, `totalHeight`, `frameYOffsets`, `deviceScaleFactor`) is locked

---
*Phase: 05-scroll-stitch-output*
*Completed: 2026-05-22*
