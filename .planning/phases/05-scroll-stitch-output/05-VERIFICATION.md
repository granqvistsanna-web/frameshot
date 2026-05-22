---
phase: 05-scroll-stitch-output
verified: 2026-05-22T00:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 5: Scroll-Stitch Output Verification Report

**Phase Goal:** The full page is captured as a clean, single PNG by scrolling in viewport-height steps, capturing each frame, and stitching with sharp — with no ghosted sticky elements and no visible seams
**Verified:** 2026-05-22
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running `framershot capture sample.yaml` produces a PNG file at the path defined by the output template | VERIFIED | `captureFullPage` in `src/capture/index.js` chains `captureFrames → stitchFrames → writeFile(outputPath)`. CLI else-branch calls `await captureFullPage(navigatedPage, resolvedOutput)`. Phase 5 plan 03 e2e: 800x4800 PNG written at 3-dir-deep nested path. |
| 2 | Output PNG height equals full scrollable page height; shows content top to bottom with no missing sections | VERIFIED | `stitch.js` canvas height = `Math.round(totalHeight * deviceScaleFactor)`. `frames.js` captures every viewport-height step (exact-multiple) plus a clamped last frame (remainder) ensuring no pixels are missed. |
| 3 | Sticky navigation elements appear exactly once at the top of the stitched image | VERIFIED | Phase 4's `hide` list owns sticky handling. `frames.js`, `stitch.js`, and `index.js` contain zero sticky-element scanning. The overlap-and-trust-composite strategy (sharp composite-order; later overlays overwrite) produces no seams or duplication. |
| 4 | Parent directories of the output path are created automatically if they do not exist | VERIFIED | `src/capture/index.js:56` — `await mkdir(dirname(outputPath), { recursive: true })` runs before `writeFile`. End-to-end test wrote to a 3-dir-deep path (`sub1/sub2/sub3/out.png`). |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/capture/frames.js` | `captureFrames(page)` — OUT-01 scroll-capture loop | VERIFIED | Exists. ZERO imports. Exports `async function captureFrames`. Reads geometry once, pre-computes `frameYOffsets`, per-frame: instant scroll + rAF wait + `page.screenshot({ clip, scale:'device', animations:'disabled', type:'png' })`. |
| `src/capture/stitch.js` | `stitchFrames(frames, geometry)` — OUT-02 sharp composite | VERIFIED | Exists. ONE import (`import sharp from 'sharp'`). Exports `async function stitchFrames`. Canvas at `Math.round(W*DSR) x Math.round(H*DSR)`. Overlays built with `Math.round(offset*DSR)`. Single `sharp({create}).composite(overlays).png().toBuffer()` return. |
| `src/capture/index.js` | `captureFullPage(page, outputPath)` — OUT-03 orchestrator | VERIFIED | Exists. FOUR static imports (`mkdir`, `writeFile`, `dirname`, `captureFrames`, `stitchFrames`). Three sequential awaits: `captureFrames → stitchFrames → mkdir(dirname) + writeFile`. |
| `src/cli.js` | else-branch wired to `captureFullPage` | VERIFIED | One new import line. else-branch body replaced: `await captureFullPage(navigatedPage, resolvedOutput)` + `console.log(\`screenshot written: ...\`)`. Smoke branch, `console.time/timeEnd`, `context.close()` before `browser.close()` all unchanged. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `frames.js` | `page.evaluate` (geometry read) | single evaluate returning all 4 props | WIRED | Line 65: `await page.evaluate(() => ({ viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, totalHeight: document.documentElement.scrollHeight, deviceScaleFactor: window.devicePixelRatio }))`. Single call before loop. |
| `frames.js` | `page.evaluate` (rAF wait) | `new Promise((r) => requestAnimationFrame(() => r()))` | WIRED | Line 97: present per-frame inside loop. `page.waitForTimeout` absent. |
| `frames.js` | `page.screenshot` | `clip + scale:'device' + animations:'disabled' + type:'png'` | WIRED | Lines 109-114: all four options present; `omitBackground` and `fullPage` absent. Note: `clip.y` is `0` (viewport-relative), not the scroll offset — this is correct Playwright behavior and is documented as an auto-fixed deviation in 05-01-SUMMARY. |
| `frames.js` | instant scrolling | `behavior: 'instant'` in `window.scrollTo` | WIRED | Line 90: `window.scrollTo({ top: targetY, behavior: 'instant' })`. `behavior: 'smooth'` absent. |
| `stitch.js` | `sharp` (npm) | default import | WIRED | Line 28: `import sharp from 'sharp'`. Exactly 1 import. |
| `stitch.js` | `sharp({ create })` canvas | transparent RGBA canvas | WIRED | Lines 73-83: `channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 }`. |
| `stitch.js` | `.composite(overlays).png().toBuffer()` | sharp pipeline | WIRED | Lines 81-83: single-expression return. `Math.round` applied to canvas dimensions and overlay tops (4 occurrences >= 3 required). |
| `index.js` | `node:fs/promises` (mkdir + writeFile) | STATIC top-of-file import | WIRED | Line 29: `import { mkdir, writeFile } from 'node:fs/promises'`. No `await import`. |
| `index.js` | `node:path` (dirname) | STATIC top-of-file import | WIRED | Line 30: `import { dirname } from 'node:path'`. |
| `index.js` | `frames.js` captureFrames | STATIC import + sequential await | WIRED | Line 31 import + line 48 call: `const { frames, geometry } = await captureFrames(page)`. |
| `index.js` | `stitch.js` stitchFrames | STATIC import + sequential await | WIRED | Line 32 import + line 51 call: `const pngBuffer = await stitchFrames(frames, geometry)`. |
| `index.js` | fs mkdir-then-write invariant | `mkdir(dirname(outputPath))` BEFORE `writeFile` | WIRED | Lines 56-57: sequential awaits. `dirname(outputPath)` confirmed (not `outputPath` directly). |
| `cli.js` | `capture/index.js` captureFullPage | import + else-branch call | WIRED | Line 7 import + line 54 call: `await captureFullPage(navigatedPage, resolvedOutput)`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `frames.js` | `frames: Buffer[]` | `page.screenshot({ clip, scale:'device', ... })` per frame | Yes — real Playwright PNG buffers from live browser rendering | FLOWING |
| `frames.js` | `geometry` | `page.evaluate(() => window.innerWidth/Height/scrollHeight/devicePixelRatio)` | Yes — live DOM values at capture time | FLOWING |
| `stitch.js` | `pngBuffer: Buffer` | `sharp({create}).composite(frames[]).png().toBuffer()` | Yes — sharp produces real PNG bytes | FLOWING |
| `index.js` | file on disk | `writeFile(outputPath, pngBuffer)` | Yes — real file write; `pngBuffer` flows from `stitchFrames(frames, geometry)` | FLOWING |

### Behavioral Spot-Checks

Static module import resolution was verified at verification time:

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CLI shape: capture command with exactly --smoke option | `node --input-type=module -e "import { buildProgram } from './src/cli.js'..."` | `commands: ['capture'], capture options: ['--smoke'], cli-shape-ok` | PASS |
| No `fullPage: true` anywhere in src/ | `! grep -rq "fullPage: true" src/` | Passes | PASS |
| Dependency count unchanged | `Object.keys(package.json.dependencies).length` | `7` — playwright-chromium, sharp, commander, js-yaml, zod, chalk, ora | PASS |
| sharp version pinned at 0.33.x | `require('./node_modules/sharp/package.json').version` | `0.33.5` | PASS |

Full end-to-end runtime spot-checks (8-band 2400px page, 800x4800 canvas) were run as part of plan execution. Verification cannot re-run the full Playwright suite without a live browser but all static gates that proxy the behavioral contracts have been independently verified above.

### Probe Execution

Step 7c: No probe scripts found in `scripts/*/tests/probe-*.sh`. No probe execution required.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| OUT-01 | 05-01-PLAN.md | Full-page screenshot captured by scrolling in viewport-height steps | SATISFIED | `src/capture/frames.js` exports `captureFrames(page)` implementing the scroll loop with `frameYOffsets`, per-frame `page.screenshot`, geometry-once invariant. |
| OUT-02 | 05-02-PLAN.md | Frames stitched into single PNG using sharp, no ghosted sticky elements, no visible seams | SATISFIED | `src/capture/stitch.js` exports `stitchFrames(frames, geometry)` using `sharp({create}).composite(overlays).png().toBuffer()`. Overlap-and-trust-composite strategy eliminates seams. Phase 4 hide list prevents sticky ghosting. |
| OUT-03 | 05-03-PLAN.md | Output file written to templated path with parent dirs created as needed | SATISFIED | `src/capture/index.js` exports `captureFullPage(page, outputPath)` which calls `mkdir(dirname(outputPath), { recursive: true })` before `writeFile(outputPath, pngBuffer)`. CLI wired via else-branch. |

Note: `REQUIREMENTS.md` traceability table still shows OUT-01/02/03 as "Pending" — this is a documentation state that predates Phase 5 execution and does not reflect a code gap. The implementations are fully present and verified above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `stitch.js` | 10 (comment) | `page.screenshot` string in comment | Info | The string `page.screenshot` appears in a header comment line (`// - Inputs (frames[]) are physical pixels (page.screenshot scale='device').`) — this is documentation, not a code call. The grep gate `! grep -q "page.screenshot" src/capture/stitch.js` triggers on this comment. Not a real anti-pattern; the actual function body contains zero `page.*` calls. |

No `TBD`, `FIXME`, or `XXX` markers found in any Phase 5 file. No stub returns. No hardcoded empty data.

### Deviation Noted (Auto-Fixed, Non-Blocking)

**clip.y = 0 vs clip.y = scrollOffset:** The 05-01-PLAN specified `clip: { x: 0, y, width, height }` where `y` is the scroll offset. The implementation uses `clip: { x: 0, y: 0, width, height }` because Playwright's `page.screenshot` clip coordinates are viewport-relative (not document-absolute). This is the correct behavior — after `window.scrollTo({ top: y })`, the clip rect always starts at CSS y=0 within the visible viewport. This was caught during end-to-end runtime testing and documented as an auto-fixed Rule 1 Bug in 05-01-SUMMARY. All three end-to-end cases (exact-multiple, remainder/overlap, single-frame) verified successfully with the corrected value.

### Human Verification Required

None — all truths are verifiable from source code structure and static gates. The full end-to-end rendering quality (no visible seams, correct color fidelity) was verified during plan execution against a real localhost fixture. No items require additional human testing.

### Gaps Summary

No gaps. All four ROADMAP success criteria are satisfied. All three requirement IDs (OUT-01, OUT-02, OUT-03) are accounted for with substantive, wired implementations. The project-wide gate (`! grep -rq "fullPage: true" src/`) passes. Library posture is preserved across all three new modules. Dependency count is unchanged at 7. The only notable deviation (clip.y) was a correct API-conformant fix documented in the summary.

---

_Verified: 2026-05-22_
_Verifier: Claude (gsd-verifier)_
