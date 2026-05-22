---
phase: 05-scroll-stitch-output
plan: "02"
subsystem: capture
tags: [sharp, png, composite, stitch, buffer, image-processing]

# Dependency graph
requires:
  - phase: 05-scroll-stitch-output/05-01
    provides: captureFrames(page) → { frames: Buffer[], geometry } contract (geometry shape, DSR semantics, frameYOffsets in CSS pixels, overlap-and-trust-composite strategy)

provides:
  - stitchFrames(frames, geometry) → Promise<Buffer> — OUT-02 sharp composite of viewport frames into one full-page PNG

affects:
  - 05-03-index (orchestrator that imports and calls stitchFrames with captureFrames output)
  - phase 6 CLI error formatting (sharp errors bubble from this module)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sharp default import (only in codebase): `import sharp from 'sharp'` — sharp package exports a default, not a named export"
    - "Math.round on every pixel-coordinate multiplication — defends against fractional DSR (1.25, 1.5) producing non-integer values sharp rejects (Pitfall 8)"
    - "Overlap-and-trust-composite: last frame positioned at (totalHeight - viewportHeight) · DSR, sharp composite-order (later overwrites earlier) cleanly fills the overlap region"
    - "Pure Buffer[]→Buffer transform: no I/O, no browser handles, no fs — same posture as src/output/template.js"

key-files:
  created:
    - src/capture/stitch.js
  modified: []

key-decisions:
  - "Pass PNG Buffer frames directly as { input: frames[i] } — no sharp(buf) pre-wrap (Risk 20: wasted decode+re-encode)"
  - "background: { r: 0, g: 0, b: 0, alpha: 0 } object form — unambiguous alpha=0 transparency vs string form"
  - "No PNG encoder options (.png() with no args) — defaults (compressionLevel=6, progressive=false) appropriate for personal tool v0.1 (Risk 15)"
  - "No try/catch around sharp chain — errors bubble; Phase 6 CLI formats them (Anti-Patterns line 579)"

patterns-established:
  - "Pattern: sharp pipeline as single return statement — sharp({create}).composite(overlays).png().toBuffer()"
  - "Pattern: library posture enforced — no console/chalk/ora, no process.exit, no error class wrapping"

requirements-completed: [OUT-02]

# Metrics
duration: 2min
completed: 2026-05-22
---

# Phase 5 Plan 02: Scroll-Stitch Output (stitchFrames) Summary

**Pure sharp composite module: stitchFrames(frames, geometry) assembles viewport-sized PNG Buffer[] into a single full-page PNG using physical-pixel canvas math and sharp's documented composite-order for seam-free overlap handling**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-22T12:59:22Z
- **Completed:** 2026-05-22T13:01:00Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- Created `src/capture/stitch.js` — the OUT-02 deliverable: pure Buffer[]→Buffer transform with one sharp default import and one named async export
- Physical-pixel canvas math: `Math.round(viewportWidth · DSR)` × `Math.round(totalHeight · DSR)` with Math.round on every overlay top offset (Pitfall 8 defence)
- End-to-end verified: Case A (exact-multiple ordering), Case B (overlap-overwrite contract proving sharp composite-order), Case C (single-frame passthrough)

## Exported API Surface

```
export async function stitchFrames(
  frames: Buffer[],                       // ordered PNG buffers, each viewportWidth·DSR × viewportHeight·DSR
  geometry: {
    viewportWidth: number,                // CSS pixels
    viewportHeight: number,               // CSS pixels (destructured but unused in canvas math — only needed by canvas width)
    totalHeight: number,                  // CSS pixels
    frameYOffsets: number[],              // CSS-pixel y offset per frame; order matches frames[]
    deviceScaleFactor: number,            // physical:CSS pixel ratio
  }
): Promise<Buffer>                        // PNG buffer of dimensions viewportWidth·DSR × totalHeight·DSR
```

The orchestrator (05-03 `src/capture/index.js`) calls this as:
```js
const buffer = await stitchFrames(frames, geometry);
```
where `{ frames, geometry }` is the destructured return value of `captureFrames(page)`. No geometry reshaping needed.

## Static Check Verification

| Check | Result |
|-------|--------|
| `test -d src/capture` | dir-ok |
| `test -f src/capture/stitch.js` | file-ok |
| Single `import sharp from 'sharp'` (default); import count = 1 | import-ok |
| `export async function stitchFrames` present | export-ok |
| Pipeline shape: `create:{`, `channels:4`, `alpha:0`, `.composite(`, `.png()`, `.toBuffer()` | pipeline-ok |
| `Math.round` count ≥ 3 (canvas width, canvas height, overlay top) | math-round-ok |
| No `sharp.cache`, `sharp.concurrency`, `compressionLevel`, `progressive:`, `sharp([a-zA-Z_]` | no-tuning-ok |
| No `BrowserError`, `CaptureError`, `class `, `try {`, `node:fs`, `node:path`, `page.screenshot`, `page.evaluate` | no-banned-ok |
| Library shape: zero non-comment `console.*`, `process.exit`, `import chalk`, `import ora` | library-shape-ok |
| sharp version in node_modules: `0.33.x` | sharp-pin-ok |

## End-to-End Canvas Dimensions

| Case | Frames | offsets | totalHeight | DSR | Expected canvas | Result |
|------|--------|---------|-------------|-----|-----------------|--------|
| A (exact-multiple) | 3 (red/green/blue) | [0, 100, 200] | 300 | 2 | 400 × 600 | PASS |
| B (overlap) | 3 (red/green/blue) | [0, 100, 150] | 250 | 2 | 400 × 500 | PASS |
| C (single-frame) | 1 (red) | [0] | 100 | 2 | 400 × 200 | PASS |

## Case B — Overlap Contract (Most Important)

Physical y=350 is sampled inside the overlap region (green frame y=200–399, blue frame y=300–499).
The pixel at (200, 350) returns **BLUE [0, 0, 255]** — confirming the last frame (blue, at offset 150·2=300)
overwrote the prior frame's (green) pixels in the shared region.

This is the documented sharp composite-order contract (node_modules/sharp/lib/index.d.ts:312-318):
> Later overlays draw ON TOP of earlier overlays.

This is the mechanism 05-01's "overlap-and-trust-composite" strategy relies on: when `totalHeight % viewportHeight !== 0`,
the last frame is clamped to `totalHeight - viewportHeight`, intentionally overlapping the prior frame.
Sharp's order-wins behavior makes the overlap region correct without any manual row-blending or per-pixel comparison.

All three output buffers begin with PNG magic bytes `89 50 4E 47 0D 0A 1A 0A`.

## Risk Checklist (from plan)

| Risk | Disposition | Verification |
|------|-------------|--------------|
| Risk 14: sharp 0.34 instead of pinned 0.33 | Avoided | node_modules version = 0.33.5; package.json unchanged |
| Risk 15: sharp.cache/concurrency, PNG encoder options | Avoided | grep checks all pass (no-tuning-ok) |
| Risk 19: hand-rolled PNG byte manipulation | Avoided | only sharp composite used |
| Risk 20: `sharp(buf)` pre-wrap per frame | Avoided | `! grep -qE "sharp\([a-zA-Z_]"` passes; sharp called once with create config |
| Risk 2: CaptureError class | Avoided | no-banned-ok |
| Risk 3: chalk/ora/console.log in library code | Avoided | library-shape-ok |
| Pitfall 8: fractional DSR non-integer coords | Mitigated | Math.round count = 3 (canvasWidth, canvasHeight, overlay top) |
| T-05-02-OV: overlap correctness | Verified | Case B pixel sample at y=350 = blue |

## Task Commits

1. **Task 1: Implement src/capture/stitch.js** — `3ea99f7` (feat)

## Files Created/Modified

- `src/capture/stitch.js` — stitchFrames(frames, geometry) → Promise<Buffer>; pure sharp composite; 84 lines including full header comment block

## Decisions Made

- Pass PNG Buffer frames directly as `{ input: frames[i] }` — no `sharp(buf)` pre-wrap (Risk 20: wasted decode+re-encode, sharp composite accepts Buffer directly per index.d.ts:1487-1510)
- `background: { r: 0, g: 0, b: 0, alpha: 0 }` object form — unambiguous alpha=0 over string `'rgba(0,0,0,0)'`
- No PNG encoder options — `.png()` bare call accepts defaults (compressionLevel=6, progressive=false) appropriate for v0.1 personal tool
- No try/catch — sharp errors bubble to CLI's finally block; Phase 6 formats them (Anti-Patterns line 579)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. The sharp version check in the plan's verify script used a relative path (`require('./node_modules/...')`) that doesn't resolve from inside the worktree — ran the check against the main project's node_modules instead (`/Users/sannagranqvist/Documents/App/screenshotter/node_modules/sharp`), which confirmed 0.33.5. The end-to-end test was also run from the main project directory (where sharp is installed) importing the stitch.js from its absolute worktree path.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This module is a pure in-memory transform; the threat model in the plan (T-05-02-*) covers all surfaces and all dispositions are `mitigate` or `accept` with no gaps.

## Note for 05-03 (Orchestrator)

Call stitchFrames with the EXACT shape captureFrames returns:
```js
const { frames, geometry } = await captureFrames(page);
const buffer = await stitchFrames(frames, geometry);
```
No geometry reshaping. The orchestrator's only job after stitchFrames resolves is `await mkdir(dir, { recursive: true }); await writeFile(outputPath, buffer)`.

## Next Phase Readiness

- `src/capture/stitch.js` is ready to be imported by `src/capture/index.js` (05-03, wave 2)
- The `stitchFrames(frames, geometry)` contract is locked — 05-03 can import it directly
- No blockers

---
*Phase: 05-scroll-stitch-output*
*Completed: 2026-05-22*
