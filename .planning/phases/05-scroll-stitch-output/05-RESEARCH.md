# Phase 5: Scroll-Stitch Output — Research

**Researched:** 2026-05-22
**Domain:** Playwright viewport screenshots with `clip`, sharp 0.33 `composite()` vertical stacking, full-page geometry math (deviceScaleFactor handling), Node `fs/promises` mkdir + write
**Confidence:** HIGH (Playwright `screenshot.clip` + `scale` semantics, sharp `composite`/`png`/`create` APIs, all verified by reading `node_modules/playwright-core/types/types.d.ts` and `node_modules/sharp/lib/index.d.ts` directly) / MEDIUM (the precise last-frame strategy — multiple defensible options exist; recommendation is the simplest deterministic one)

## Summary

Phase 4 hands Phase 5 a `Page` that is settled (networkidle reached, fonts ready, animations frozen, IO triggers fired, hidden selectors removed, scroll-primed back to `y=0`). Phase 5 must turn that page into one PNG, written to a templated path, with no ghosted sticky elements (the headline failure mode `fullPage: true` produces on Framer sites) and no visible seams.

The recipe is three pieces:

1. **`captureFrames(page)` — produce an ordered array of PNG buffers.** Read `innerHeight` (CSS px) and `scrollHeight` (CSS px) once. Loop `y = 0, vh, 2vh, …`, scrolling instantly to each `y` and calling `page.screenshot({ clip: { x: 0, y, width: vw, height: vh }, animations: 'disabled', scale: 'device' })`. Each buffer is `vw·DSR × vh·DSR` physical pixels. The last frame requires care: when `scrollHeight % innerHeight !== 0`, the final iteration would either go past the end (clip throws or zero-pads with background) or skip the tail. The recommended pattern is **overlap-and-trust-composite**: clamp the last `y` to `scrollHeight - innerHeight` so the last frame is always a full-height viewport screenshot that overlaps the previous frame; sharp's composite then writes it on top at its true target position, naturally overwriting the duplicated pixels. (Detailed math in §Pattern 1; rejected alternatives in §Pitfall 1.)

2. **`stitchFrames(frames, dimensions)` — assemble one tall PNG with sharp.** Create a transparent blank canvas of `totalScrollHeight·DSR × vw·DSR` via `sharp({ create: { width, height, channels: 4, background: 'rgba(0,0,0,0)' } }).png()`. Composite each frame buffer with `top: y·DSR, left: 0`. Sharp 0.33's `composite()` accepts an ordered array of overlays and writes them in order — later overlays paint over earlier ones, which is exactly the property the overlap-last-frame strategy relies on. Output: `.png().toBuffer()`.

3. **`writeOutput(buffer, resolvedPath)` — write the buffer to disk.** `await mkdir(dirname(resolvedPath), { recursive: true })` then `await writeFile(resolvedPath, buffer)`. Both via `node:fs/promises`. No new dependency; matches the pattern Phase 4's `--smoke` CLI integration already uses (`cli.js:43-45`).

**Architecture: three new files under `src/capture/`, one wiring change in `src/cli.js`.**

```
src/capture/
├── frames.js        # captureFrames(page) → { frames: Buffer[], geometry }
├── stitch.js        # stitchFrames(frames, geometry) → Buffer
└── index.js         # captureFullPage(page, outputPath) → void (orchestrator)
```

Phase 5 plans match the ROADMAP draft:
- **05-01** = `frames.js` (OUT-01: scroll-capture loop)
- **05-02** = `stitch.js` (OUT-02: sharp composite, no seams)
- **05-03** = `index.js` + CLI wiring (OUT-03: mkdir + writeFile + template resolve hand-off)

**Primary recommendation:** Three-file `src/capture/` module. Capture-loop reads CSS pixels (innerHeight, scrollHeight) but writes in physical pixels (everything multiplied by DSR) since `page.screenshot()` defaults to `scale: 'device'`. Last frame overlaps; sharp composite order guarantees correctness. No new dependencies (sharp 0.33.5 already installed). No CLI surface changes — the `--smoke` branch (which already takes a single screenshot) stays as-is; the non-smoke branch becomes the new production path that calls `captureFullPage(navigatedPage, resolvedOutput)`.

## User Constraints (from PROJECT.md + ROADMAP.md + REQUIREMENTS.md + Phase 1–4 outputs)

No `CONTEXT.md` exists for Phase 5 (no `/gsd:discuss-phase` invocation). Constraints derive from project-level docs and from what Phases 1–4 shipped.

### Locked Decisions (from PROJECT.md + REQUIREMENTS.md + completed phases + the additional_context brief)
- **Zero new dependencies.** sharp 0.33.5 is already in `package.json` (`"sharp": "^0.33"`) and installed at `node_modules/sharp/package.json` [VERIFIED: `node -e 'console.log(require(\"./node_modules/sharp/package.json\").version)'` → `0.33.5`; libvips 8.x bundled]. playwright-chromium 1.60.0 already installed. Nothing else needed for Phase 5.
- **Manual scroll-and-stitch — NOT Playwright's `fullPage: true`.** PROJECT.md Key Decisions table locks this. The whole reason the project exists. Verified by the Phase 3 gate noted in 04-PATTERNS §What NOT To Do #13: `! grep -rq 'fullPage: true' src/` is a phase gate that still applies. Phase 5 honors it strictly.
- **Single page, single viewport, single run.** REQUIREMENTS v1 enforces; the schema's `viewport: object` and `page: object` (not arrays) make this structural. Phase 5 produces ONE PNG per `framershot capture` invocation.
- **Local only, personal tool.** No streaming, no multi-process, no telemetry. The full set of frames lives in RAM during stitch — no temp files needed for v0.1 (sizing rationale in §Architecture and §Open Questions).
- **The output path is already resolved.** Phase 2 (CFG-03) shipped `resolveTemplate(template, { date, viewport, page })` at `src/output/template.js`, and `src/cli.js:23-26` already calls it. Phase 5 just consumes the resolved string and does `mkdir + writeFile`. Phase 5 does NOT touch templating.
- **The Page is already prepared.** Phase 4 (`installAnimationGuards` + `runPreparePipeline`) runs before Phase 5's entry point. PREP-01..05 are all satisfied at the moment `captureFullPage` is called. Phase 5 MUST NOT re-run prepare steps, re-wait for networkidle, or re-call `document.fonts.ready` — Phase 4/3 already own those gates.
- **The CLI owns the lifecycle.** `src/cli.js:28-68` owns `try { … } finally { context.close(); browser.close(); }`. Phase 5's `captureFullPage` is called inside the existing try block, between `runPreparePipeline` and the existing else-branch. It accepts the Page and the resolved output path; it does NOT touch the browser or context.
- **Library posture — silent.** Phase 5 modules NEVER `console.log`, NEVER `process.exit`, NEVER import `chalk`/`ora`. Same posture as Phase 3 (`src/browser/*`) and Phase 4 (`src/prepare/*`). Errors throw — Phase 6 (CLI-03) formats them.
- **Sticky elements are already hidden by Phase 4's `hide` list.** OUT-02 / SC #3 ("Sticky navigation elements appear exactly once at the top") is a consequence of Phase 4's `hideSelectors` doing its job: the user lists `nav.sticky`, `#consent-banner`, etc. in `config.prepare.hide` and Phase 4 removes them with `visibility: hidden`. Phase 5 does NOT have to do additional sticky-detection. The brief's key-question #2 explicitly asks whether extra handling is needed — answer: **NO, Phase 4's `hide` list covers it.** If the user forgets to add their sticky selector, the result is ghosting; that's a config bug, not a Phase 5 bug. (See §Pitfall 2 for the corner-case nuance: `position: sticky` elements scroll up briefly in the loop, but only because the user didn't hide them — same root cause.)
- **No CLI flags added in Phase 5.** Same posture as Phase 4 — `--smoke` is the only flag, and it stays semantically as "take ONE viewport-sized screenshot for hermetic verification." Phase 5 does not add `--full-page`, `--no-stitch`, or anything else. The non-`--smoke` branch (currently a `JSON.stringify` placeholder at `cli.js:48-61`) BECOMES the call to `captureFullPage`.
- **No schema changes.** No new `output.*` or `stitch.*` keys. Phase 2's schema is final for v0.1.

### Claude's Discretion
- **Module file layout under `src/capture/`** — recommendation in §Architecture: three files (`frames.js`, `stitch.js`, `index.js`). Other valid layouts (one file, four files) are inferior on the same axes Phase 4 weighed: file size, single-responsibility, single import surface.
- **Exact function signatures** — recommendation in §Architecture; canonical entry point is `captureFullPage(page, outputPath, options?): Promise<void>` with `options` reserved-for-future and unused in v0.1.
- **Last-frame strategy** — three viable options exist (overlap-and-trust-composite, shorter-last-step-with-clip-shrinking, capture-with-pad-and-crop). Recommendation in §Pattern 1: **overlap-and-trust-composite**. Rejected alternatives in §Pitfall 1.
- **Per-step wait** — Phase 4's scroll-prime already used 200ms inter-step waits for lazy-load. The Phase 5 capture loop runs AFTER scroll-prime so lazy images are already triggered. The §Pattern 1 recommendation is to **wait one animation frame** (`requestAnimationFrame` round-trip via evaluate) between scroll and screenshot to ensure layout settles, with NO additional fixed delay. The phase 4 scroll-prime did the heavy "wait for lazy-load IOs" work; here we just need scroll/paint settling. See §Pitfall 3 for the failure mode if no wait at all.
- **Whether to use `omitBackground: true` on screenshots** — recommendation in §Pattern 1: **NO**. Solid pages should keep their background. The blank canvas under the composite IS transparent (channels: 4) but every pixel is overwritten by the first composite anyway. Setting `omitBackground: true` on the per-frame screenshots would produce transparent areas where the page background is absent (e.g. corners during scroll bounce), and there is no benefit. Default `omitBackground: false`.
- **Whether to use `type: 'png'` explicitly** — recommendation in §Pattern 1: yes, set explicitly. Default is also `'png'` but explicit is self-documenting and decouples Phase 5 from any future Playwright default change.
- **`scale: 'device'` vs `'css'`** — recommendation in §Architecture: **`scale: 'device'` (default)**. This is the retina-quality requirement from CAP-02. `scale: 'css'` would defeat the purpose of `deviceScaleFactor`. The math math then has to multiply by DSR for canvas sizing (see §Pattern 2).
- **Sharp PNG encoder options** — recommendation in §Pattern 2: defaults. compressionLevel=6 is fine; we don't need progressive PNG, palette quantization, or other tunables for a personal tool. Defer if file sizes become a real issue.
- **Whether to handle the `vh > totalHeight` case (page shorter than viewport)** — recommendation in §Pattern 1: yes, single-frame fast path. If `scrollHeight <= innerHeight`, take ONE screenshot of the page at `y=0` (no clip needed; the visible viewport IS the whole page) and skip the loop and the composite. The math still works through the loop, but a single-frame fast path is cleaner.

### Deferred Ideas (OUT OF SCOPE — do not research)
- Multi-page or multi-viewport per run — v0.2 (MULTI-01..04).
- Region capture (CSS selector or from/to anchors) — v0.2 (REGION-01..03). Phase 5 emits full-page only.
- Diff mode — v0.3 (DIFF-01).
- Progress UI / spinners during capture — Phase 6 (CLI-02).
- Friendly error messages for disk full / permission denied / sharp errors — Phase 6 (CLI-03). Phase 5 throws plain errors; Phase 6 formats them. We DO surface them with enough context that Phase 6 can format well, but Phase 5 doesn't `chalk` anything.
- WebP / AVIF output — out of scope for v0.1. PNG only (REQUIREMENTS implicit via "PNG" in OUT-01 description).
- Streaming-stitch (decode + composite incrementally to reduce peak memory) — premature for v0.1's typical page sizes. See §Open Questions #2.
- Configurable per-step wait — premature knob. The §Pattern 1 default of "one rAF roundtrip" is right for v0.1.
- Sticky-element re-detection / sticky-aware capture — Phase 4's `hide` list is the canonical mechanism. Reinventing it as Phase-5-internal logic is wrong abstraction layer.
- Visual seam detection (pixel-row comparison across frames) — overkill for v0.1. The overlap-and-trust-composite strategy makes seams structurally impossible; hermetic visual verification confirms.
- Capturing into a temp file then atomic-rename for crash safety — personal tool; if the process crashes mid-write, the user re-runs.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Read page geometry (`innerHeight`, `scrollHeight`, `innerWidth`) | Browser layer (`src/capture/frames.js`) via `page.evaluate` | — | Same primitive Phase 4's `scrollPrime` uses (`scroll.js:45-48`). Single round-trip read at the start of capture. |
| Scroll to a target `y` | Browser layer (`src/capture/frames.js`) via `page.evaluate` | — | Same primitive Phase 4 uses. `behavior: 'instant'` for determinism. |
| Take per-viewport screenshot | Browser layer (`src/capture/frames.js`) via `page.screenshot({ clip, animations: 'disabled', scale: 'device' })` | — | Playwright owns the bytes. We pass the bounding rect in CSS pixels; Playwright returns physical pixels. |
| Stitch buffers into one PNG | Node process (`src/capture/stitch.js`) via sharp `create` + `composite` + `png()` + `toBuffer` | — | Image manipulation lives in the Node process, not the browser. sharp wraps libvips natively. |
| Write the final PNG to disk | Node process (`src/capture/index.js`) via `fs/promises` `mkdir({ recursive }) + writeFile` | — | Same approach already used in `cli.js:43-45` for the smoke screenshot's parent-dir creation. Phase 5 just generalizes it to a real production path. |
| Decide WHEN to capture (after prepare, before close) | CLI layer (`src/cli.js`) | — | The CLI owns the lifecycle. Phase 5 inserts ONE call (`await captureFullPage(navigatedPage, resolvedOutput)`) into the existing non-`--smoke` else-branch. |
| Decide what to do on error (disk full, sharp throw, screenshot timeout) | Phase 6 (CLI-03) | Library (throws) | Phase 5 throws with `cause` preserved; Phase 6 formats. Same posture as `BrowserError` from Phase 3. |
| Resolve output template | Phase 2 (CFG-03, `src/output/template.js`) | — | Phase 5 receives the resolved string from the CLI. Does NOT re-resolve. |
| Run prepare steps | Phase 4 (`src/prepare/`) | — | Phase 5 assumes the Page is prepared. Does NOT re-run any prepare. |

## Standard Stack

### Core (already installed in Phase 1 — zero new packages in Phase 5)

| Library | Version (verified 2026-05-22) | Purpose | Why Standard |
|---------|-------------------------------|---------|--------------|
| `playwright-chromium` | 1.60.0 [VERIFIED: `node_modules/playwright-chromium/package.json`] | `page.evaluate`, `page.screenshot({ clip, scale, animations })` | Same library used by Phases 3 + 4. All needed screenshot options confirmed in `node_modules/playwright-core/types/types.d.ts:24256-24365` (PageScreenshotOptions). |
| `sharp` | 0.33.5 [VERIFIED: `node_modules/sharp/package.json`] | Composite N PNG buffers into one PNG canvas | Industry standard for Node image manipulation. Wraps libvips natively for performance. v0.33 is the stable line; current latest is 0.34.5 per `npm view sharp version`, but project pin `"^0.33"` keeps us on 0.33.x and there's no Phase-5 capability gap. |
| `node:fs/promises` | Node 20+ stdlib | `mkdir({ recursive: true })`, `writeFile(path, buffer)` | Builtin. Already used in `cli.js:43-44` for the smoke screenshot. |
| `node:path` | Node 20+ stdlib | `dirname(outputPath)` | Builtin. Already used in `cli.js:44`. |

### Playwright APIs this phase uses

| API | Signature (verified types.d.ts) | Used For | Notes |
|-----|--------------------------------|----------|-------|
| `page.evaluate(fn)` | Standard | Read geometry; perform `window.scrollTo`; rAF roundtrip wait | One-roundtrip per call; we keep loop calls minimal. |
| `page.screenshot({ clip, animations, scale, type })` | `PageScreenshotOptions` in types.d.ts:24256-24365 | Capture each viewport-sized frame | `clip` is `{ x, y, width, height }` in CSS pixels (types.d.ts:24276-24296). `scale` default is `'device'` (types.d.ts:24338-24344 — "single pixel per each device pixel… screenshots of high-dpi devices will be twice as large"). `animations: 'disabled'` is belt-and-braces with Phase 4's CSS guards (types.d.ts:24258-24265). |
| `page.waitForTimeout(ms)` | Standard | NOT used in v0.1 capture loop (we use rAF instead — see §Pattern 1) | The temptation to use it again is here, but rAF is more deterministic; see §Pitfall 3. |

### sharp APIs this phase uses

| API | Signature (verified `node_modules/sharp/lib/index.d.ts`) | Used For | Notes |
|-----|--------------------------------------------------------|----------|-------|
| `sharp({ create: { width, height, channels, background } })` | `Create` interface in index.d.ts:943-955 — `width: number, height: number, channels: Channels (3 or 4), background: Color` | Create the blank canvas of the right dimensions | `channels: 4` for RGBA so `background: 'rgba(0,0,0,0)'` produces a transparent canvas (every pixel will be overwritten by composite, so the background never shows — but transparency is the safest default). |
| `.composite(images: OverlayOptions[])` | `composite(images: OverlayOptions[]): Sharp` in index.d.ts:312-318 | Compose N frame buffers onto the canvas | Each entry is `{ input: Buffer, top: number, left: number }` (`OverlayOptions` in index.d.ts ~lines 1487-1510). **Order matters**: "The images to composite must be the same size or smaller than the processed image" (index.d.ts:312) — and they are applied in order, later overlays drawn on top. This is the property the overlap-last-frame strategy depends on. |
| `.png(options?)` | `png(options?: PngOptions): Sharp` in index.d.ts:724 | Specify PNG output encoder | Defaults are fine: compressionLevel=6, progressive=false. We set this explicitly to lock the format even though our buffers are already PNG. |
| `.toBuffer()` | `toBuffer(): Promise<Buffer>` in index.d.ts:631 | Materialize the final PNG Buffer | The simpler form returns just the Buffer; no `{ resolveWithObject: true }` needed for v0.1. |

### Supporting Libraries (no new installs)
None.

### Alternatives Considered (and rejected)

| Instead of | Could Use | Why we don't |
|------------|-----------|--------------|
| Manual scroll + per-frame screenshot + sharp composite | Playwright's `fullPage: true` | **The whole reason this project exists.** PROJECT.md Key Decisions table locks: "Native fullPage re-renders sticky elements on each capture pass, producing ghosted navs. Manual scroll-and-stitch with sharp lets us hide once and assemble cleanly." Verified in practice by users on framer-style sites. Hard rule. |
| sharp 0.33.5 | sharp 0.34.5 (current latest) | Package.json pins `^0.33`; bumping is a separate decision. 0.33's composite/create/png APIs are fully sufficient for Phase 5 — no missing capability. |
| sharp | Jimp / pngjs / canvas | sharp is the standard. ~10x faster than Jimp (libvips native bindings). Already installed. |
| Buffer-only composite (everything in RAM) | Streaming composite via tile-files in `os.tmpdir()` | For v0.1 typical pages (4–10 frames at 1440×900 × DSR 2 = ~3MB/frame uncompressed RGBA, ~30MB peak RAM), pure-buffer is fine. Streaming would add complexity for no observable benefit. Revisit if real Framer sites produce frames > 50. See §Open Questions #2. |
| Capture each frame with `clip` | Capture each frame with `fullPage: false` + scroll, then full viewport | Both work. `clip` is more explicit (you specify the exact rect) and removes the dependency on "what does Playwright consider the viewport right now" — useful because Playwright's viewport is the CSS-pixel viewport, and scroll position is independent of viewport-rect. `clip` makes the math identical regardless of scroll position. Recommendation: `clip` for explicitness, AND scroll first so lazy-load IOs are at the right scroll-position when the screenshot's internal pipeline runs (the pipeline does compositing relative to current scroll, not relative to clip's y). |
| `page.locator(':root').screenshot()` | Same as `page.screenshot({ fullPage: false })` | Locator-based screenshots add actionability checks we don't need. `page.screenshot` with `clip` is the right primitive. |
| Native `page.screenshot({ fullPage: true })` + per-row sticky-hide | Phase 4's `hide` list before Phase 5 | Doesn't compose well — Playwright's fullPage path rebuilds the layout state per pass internally, which is the cause of the ghosting in the first place. |
| Stitch with sharp `joinChannel` | sharp `composite` | `joinChannel` is for combining channel data (e.g. R, G, B, A from separate sources), not for spatial stacking. composite is the right primitive. |
| Stitch with sharp `extend` | sharp `composite` | `extend` adds padding to one image. composite places one or more inputs on top of another. composite is right for N overlays at known offsets. |
| Hand-rolled PNG byte concatenation | sharp composite | PNG byte streams cannot be naively concatenated; each PNG has its own IHDR/IDAT/IEND chunks. Trying to merge them at the byte level would require re-encoding anyway. sharp does this once, correctly. |
| Use sharp on every captured frame to convert to raw RGBA first | Composite the PNG buffers directly | sharp's composite handles PNG-encoded input transparently. No need to pre-decode. |
| Capture as JPEG (smaller) | PNG | OUT-01/02 specify PNG. Lossy JPEG would defeat the retina-quality goal. |
| Write each frame to `os.tmpdir()` then `sharp(tmpFiles)` | Buffer-only RAM | Same memory pressure (sharp loads each input on composite anyway), but adds tmp-file management. Not worth it for v0.1. |

## Package Legitimacy Audit

slopcheck was unavailable in this environment. Phase 5 introduces **zero new packages** — it consumes `playwright-chromium@1.60.0`, `sharp@0.33.5`, and Node builtins, all of which were already declared and vetted in Phase 1.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| playwright-chromium | npm (1.60.0) | 5+ yrs | ~1.5M/wk | github.com/microsoft/playwright | unavailable | Approved (Phase 1; re-used unchanged) |
| sharp | npm (0.33.5) | 10+ yrs | ~10M/wk | github.com/lovell/sharp | unavailable | Approved (Phase 1; first real use in Phase 5) |
| node:fs/promises | builtin | — | — | nodejs.org | — | Approved (stdlib) |
| node:path | builtin | — | — | nodejs.org | — | Approved (stdlib) |

**Packages removed:** none
**Packages flagged [SUS]:** none
**New packages introduced by Phase 5:** **NONE.**

Note: sharp 0.33.5 is verified present at `node_modules/sharp/` with bundled libvips 8.x (confirmed via `node -e "console.log(require('sharp').versions)"` — emits the vendored libvips dependency tree including aom, cairo, expat, freetype, glib, harfbuzz, etc.). The build is platform-native (darwin-arm64 in this environment based on the architecture). sharp's npm registry presence and source repo (lovell/sharp) are well-known and trustworthy.

## Architecture Patterns

### System Architecture Diagram

```
                          CLI layer (src/cli.js capture action)
                                       │
                                       │ validated config (Phase 2)
                                       ▼
                  ┌────────────────────────────────────────────┐
                  │ launchBrowser(config)        (Phase 3)     │
                  │ installAnimationGuards(...)  (Phase 4)     │
                  │ navigateToPage(context, ...) (Phase 3)     │
                  │ runPreparePipeline(page, ...) (Phase 4)    │
                  │   → Page is settled and prepared           │
                  └─────────────────────┬──────────────────────┘
                                        │ Page (prepared, scrollY=0)
                                        ▼
              ┌──────────────────────────────────────────────────┐
              │ ★ NEW Phase 5 INSERTION POINT — non-smoke branch ★│
              │  src/cli.js calls:                               │
              │  await captureFullPage(page, resolvedOutput)     │
              └─────────────────────┬───────────────────────────┘
                                    │ Page + outputPath
                                    ▼
            ┌─────────────────────────────────────────────────────┐
            │ src/capture/index.js — captureFullPage              │
            │ orchestrates: frames → stitch → write               │
            └──────────┬──────────────┬────────────────┬──────────┘
                       │              │                │
                       ▼              ▼                ▼
            ┌──────────────────┐  ┌────────────────┐  ┌──────────────────┐
            │ frames.js        │  │ stitch.js      │  │ fs/promises      │
            │ captureFrames    │  │ stitchFrames   │  │ mkdir+writeFile  │
            │  ┌──────────┐    │  │   ┌────────┐   │  │                  │
            │  │ read geom│    │  │   │ create │   │  │ mkdir({          │
            │  │  via     │    │  │   │ blank  │   │  │   recursive:true │
            │  │ evaluate │    │  │   │ canvas │   │  │ }, dirname(out)) │
            │  └─────┬────┘    │  │   └────┬───┘   │  │                  │
            │        │         │  │        │       │  │ writeFile(out,   │
            │  ┌─────▼────┐    │  │   ┌────▼───┐   │  │   pngBuffer)     │
            │  │ for each │    │  │   │ composite│  │  └──────────────────┘
            │  │ y step:  │    │  │   │ frames  │  │
            │  │  scroll  │    │  │   │ at      │  │
            │  │  rAF wait│    │  │   │ y*DSR   │  │
            │  │  screen- │    │  │   │ offsets │  │
            │  │   shot   │    │  │   └────┬───┘   │
            │  │   (clip) │    │  │        │       │
            │  └─────┬────┘    │  │   ┌────▼───┐   │
            │        │         │  │   │ .png() │   │
            │  ┌─────▼────┐    │  │   │.toBuffr│   │
            │  │ return   │    │  │   └────────┘   │
            │  │{frames,  │    │  │                │
            │  │ geom}    │    │  │                │
            │  └──────────┘    │  └────────────────┘
            └──────────────────┘
                       │
                       ▼
            ┌─────────────────────────────────────────────────────┐
            │ Return — captureFullPage resolves with no value     │
            │ CLI continues to finally{ context.close()           │
            │                          browser.close() }          │
            └─────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── cli.js                         (Phase 2/3/4 — modified by Phase 5: replace non-smoke else-branch with captureFullPage call)
├── config/                        (Phase 2 — unchanged)
├── output/                        (Phase 2 — unchanged; template resolver already used)
├── browser/                       (Phase 3 — unchanged)
├── prepare/                       (Phase 4 — unchanged)
└── capture/                       (Phase 5 — NEW)
    ├── frames.js                  # OUT-01 (scroll + screenshot loop)
    ├── stitch.js                  # OUT-02 (sharp composite, no seams)
    └── index.js                   # OUT-03 (orchestrator: captureFullPage = frames → stitch → mkdir+writeFile)
```

**Why split into three files** (vs. one 80-line `capture.js`):
- `frames.js` is pure browser-layer orchestration (page.evaluate, page.screenshot). It NEVER touches sharp or fs.
- `stitch.js` is pure Node-layer image manipulation (sharp create/composite/png). It NEVER touches Playwright.
- `index.js` is the single import surface and the only file that does I/O (`fs/promises`).
- Each file maps to exactly one ROADMAP-drafted plan (05-01, 05-02, 05-03). The planner can author them in parallel since their `files_modified` sets don't overlap.

### Pattern 1: captureFrames — scroll loop + per-frame screenshot (OUT-01)

**Where:** `src/capture/frames.js`
**Called by:** `src/capture/index.js`
**Why first:** Captures all the bytes; geometry is decided here; sharp depends on knowing `vw`, `vh`, `totalHeight`, and `dsr`.

The math:

- Read once (CSS pixels): `vw = window.innerWidth`, `vh = window.innerHeight`, `totalHeight = document.documentElement.scrollHeight`.
- Compute number of full frames: `nFull = Math.floor(totalHeight / vh)`.
- Compute last frame need: `lastFrameNeeded = (totalHeight % vh) > 0`.
- For `i = 0..nFull-1`: `y = i * vh`, capture viewport-sized clip at `(0, y, vw, vh)`.
- If `lastFrameNeeded`: `y = totalHeight - vh` (clamp), capture viewport-sized clip at `(0, y, vw, vh)`. **This overlaps the previous frame.** Composite-order in `stitchFrames` guarantees correctness.
- Edge case: if `totalHeight <= vh`, just capture once at `y=0` (no loop).

The returned object includes the captured frames AND the geometry the stitcher needs:

```javascript
// src/capture/frames.js
// Phase 5: scroll-capture loop. Exports: captureFrames(page) → { frames: Buffer[], geometry }.
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors from Playwright primitives bubble; the caller
// (src/capture/index.js) owns presentation, the try/finally lifecycle, and exit codes.
//
// Reads page geometry ONCE before the loop. Lazy-load content that extends the page
// AFTER the initial measurement is NOT covered — Phase 4's scrollPrime already walked
// the page bottom-to-top to trigger lazy-load IOs, so this is acceptable. If a real
// Framer site surfaces a need to handle dynamic-height-during-capture, revisit
// (deferred per §Open Questions).
//
// Last-frame strategy: OVERLAP. When totalHeight is not an exact multiple of innerHeight,
// the final iteration clamps y to (totalHeight - innerHeight) — producing a full-height
// viewport screenshot that OVERLAPS the previous frame. The stitchFrames composite
// places this frame at the correct y offset; sharp's composite-order guarantee
// (later overlays draw on top) ensures the overlap region is overwritten cleanly
// with the correct content. See RESEARCH.md §Pattern 1 + §Pitfall 1 (rejected
// alternatives) and §Pattern 2 (compositing math).

/**
 * Scroll the prepared page from top to bottom in viewport-height steps,
 * capturing a viewport-sized PNG buffer per step. Returns ordered buffers
 * plus the geometry the stitcher needs to compose them into a final PNG.
 *
 * @param {import('playwright-chromium').Page} page — a Page already prepared
 *   by Phase 4 (animations frozen, IO triggers fired, hidden selectors removed,
 *   scroll-primed; scrollY=0 at entry).
 * @returns {Promise<{
 *   frames: Buffer[],
 *   geometry: {
 *     viewportWidth: number,    // CSS pixels (innerWidth)
 *     viewportHeight: number,   // CSS pixels (innerHeight)
 *     totalHeight: number,      // CSS pixels (scrollHeight at start)
 *     frameYOffsets: number[],  // CSS-pixel y offset for each captured frame
 *     deviceScaleFactor: number,// physical:CSS pixel ratio (from window.devicePixelRatio)
 *   }
 * }>}
 *
 * @throws Playwright errors (TimeoutError, etc.) bubble. No wrapping. Phase 6
 *   owns formatting.
 */
export async function captureFrames(page) {
  // Step 1 — Read geometry once. We also read devicePixelRatio from window
  // because the stitcher needs DSR to compute physical-pixel canvas size;
  // pulling it from window (vs from the launcher config) avoids coupling
  // the capture layer to the config layer and is the source of truth that
  // the per-frame screenshot is actually using.
  const { viewportWidth, viewportHeight, totalHeight, deviceScaleFactor } = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    totalHeight: document.documentElement.scrollHeight,
    deviceScaleFactor: window.devicePixelRatio,
  }));

  // Step 2 — Compute frame y-offsets in CSS pixels.
  const frameYOffsets = [];
  if (totalHeight <= viewportHeight) {
    // Single-frame fast path: page fits in one viewport.
    frameYOffsets.push(0);
  } else {
    // Full-height frames at y = 0, vh, 2vh, …, (nFull-1)*vh.
    const nFull = Math.floor(totalHeight / viewportHeight);
    for (let i = 0; i < nFull; i++) {
      frameYOffsets.push(i * viewportHeight);
    }
    // Last frame (if remainder): clamp to (totalHeight - viewportHeight)
    // so we always capture a FULL viewport (overlap-and-trust-composite).
    // The overlap region is overwritten by the later composite call.
    if (totalHeight % viewportHeight > 0) {
      frameYOffsets.push(totalHeight - viewportHeight);
    }
  }

  // Step 3 — Capture each frame.
  const frames = [];
  for (const y of frameYOffsets) {
    // Scroll to the target y. 'instant' (default) — never 'smooth' for the
    // same race-condition reason Phase 4's scrollPrime documents (RESEARCH
    // §Pitfall 4 + Phase 4 §Pitfall 6).
    await page.evaluate((targetY) => {
      window.scrollTo({ top: targetY, behavior: 'instant' });
    }, y);

    // Wait one animation frame (a rAF roundtrip via evaluate). The scroll's
    // immediate side-effect is positioned, but a `position: sticky` element
    // that's been hidden by Phase 4 may still have a layout-pass settling
    // step, and Framer Motion elements that have completed their appear
    // animation (Phase 4's IO shim) may still have a final paint flush.
    // One rAF is the minimum deterministic wait; no fixed timeout needed.
    // RESEARCH §Pitfall 3 documents the failure mode if no wait at all.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));

    // Screenshot the current viewport using `clip` rather than relying on the
    // viewport-as-screenshot-target. clip's coordinates are CSS pixels (per
    // types.d.ts:24276-24296). The output buffer is physical pixels because
    // scale defaults to 'device' (types.d.ts:24338-24344): a 1440×900 viewport
    // at DSR=2 yields a 2880×1800 px PNG per frame.
    const buf = await page.screenshot({
      clip: { x: 0, y, width: viewportWidth, height: viewportHeight },
      animations: 'disabled',  // belt-and-braces (Phase 4 already froze CSS animations)
      scale: 'device',         // explicit; this is the default but document the choice
      type: 'png',             // explicit; this is the default but document the choice
      // omitBackground intentionally not set — the page's own background is wanted.
    });
    frames.push(buf);
  }

  return {
    frames,
    geometry: { viewportWidth, viewportHeight, totalHeight, frameYOffsets, deviceScaleFactor },
  };
}
```

**A note on `clip` vs. just trusting the viewport:** Without `clip`, `page.screenshot()` captures the current viewport but its `y` extent is whatever's currently scrolled to. With `clip: { x: 0, y, width, height }`, you specify the rect in document coordinates (CSS pixels) AND it must intersect the current viewport. Playwright internally throws if the clip rect is entirely outside the viewport. So you MUST scroll to (or near) `y` first — which we do. The `clip` parameter is functionally a "double-check" against the scroll position; if scroll silently fails (rare), `clip` would catch it by throwing.

### Pattern 2: stitchFrames — sharp composite into one PNG (OUT-02)

**Where:** `src/capture/stitch.js`
**Called by:** `src/capture/index.js`
**Why second:** Consumes the frames + geometry from `captureFrames`; produces one PNG buffer ready to write.

**The dimensional translation is the heart of this function.** `frameYOffsets` are in CSS pixels (because that's what scrollTo and clip use). The output canvas must be sized in physical pixels (because that's what the screenshot bytes are). So:

- Canvas dimensions: `width = viewportWidth · DSR`, `height = totalHeight · DSR`.
- Each frame's composite offset: `top = yOffset · DSR`, `left = 0`.
- The last frame's `top` is `(totalHeight - viewportHeight) · DSR`, which intentionally overlaps the previous frame's painted region. Sharp's composite applies overlays in array order — later items overwrite earlier ones — so the last frame's correct pixels win in the overlap region.

```javascript
// src/capture/stitch.js
// Phase 5: sharp composite of captured frames into one full-page PNG buffer.
// Exports: stitchFrames(frames, geometry) → Buffer.
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors from sharp bubble; the caller (src/capture/index.js)
// owns presentation, the try/finally lifecycle, and exit codes.
//
// Pixel dimensions:
//   - Inputs (frames[]) are physical pixels (page.screenshot scale='device').
//   - Canvas is sized in physical pixels: viewportWidth*DSR × totalHeight*DSR.
//   - Each composite offset multiplies the CSS-pixel y by DSR.
//
// Last-frame correctness:
//   - When (totalHeight % viewportHeight !== 0), the final captured frame's
//     y offset is (totalHeight - viewportHeight) — it OVERLAPS the prior frame.
//   - sharp.composite applies overlays in ORDER (sharp 0.33 docs + index.d.ts:312).
//     Later items draw ON TOP, so the last frame's pixels overwrite the prior
//     frame's overlap region cleanly. No manual clipping needed.

import sharp from 'sharp';

/**
 * Compose an ordered array of viewport-sized PNG frame buffers into ONE
 * full-page PNG buffer using sharp.composite. The canvas dimensions are
 * derived from the geometry object captureFrames produced.
 *
 * @param {Buffer[]} frames — ordered array of viewport-sized PNG buffers
 *   (each is `viewportWidth · DSR × viewportHeight · DSR` physical pixels).
 *   Order MUST match `geometry.frameYOffsets` (this is the contract
 *   captureFrames upholds).
 * @param {{
 *   viewportWidth: number,
 *   viewportHeight: number,
 *   totalHeight: number,
 *   frameYOffsets: number[],
 *   deviceScaleFactor: number
 * }} geometry — the geometry payload from captureFrames.
 * @returns {Promise<Buffer>} — a PNG buffer of dimensions
 *   `viewportWidth · DSR × totalHeight · DSR` physical pixels.
 */
export async function stitchFrames(frames, geometry) {
  const { viewportWidth, totalHeight, frameYOffsets, deviceScaleFactor } = geometry;

  // Physical-pixel canvas dimensions.
  const canvasWidth = Math.round(viewportWidth * deviceScaleFactor);
  const canvasHeight = Math.round(totalHeight * deviceScaleFactor);

  // Build the composite payload: each entry is { input: Buffer, top, left }.
  // top/left are in physical pixels (matches the canvas's coordinate space).
  // Order is preserved — sharp's composite applies overlays in this order,
  // which is essential for the last-frame overlap to overwrite correctly.
  // OverlayOptions schema verified at node_modules/sharp/lib/index.d.ts:1487-1510.
  const overlays = frames.map((input, i) => ({
    input,
    top: Math.round(frameYOffsets[i] * deviceScaleFactor),
    left: 0,
  }));

  // Create a blank canvas, composite all frames, encode as PNG.
  // background: 'rgba(0,0,0,0)' — transparent canvas. Every pixel will be
  // overwritten by composite, so the background never shows, but transparent
  // is the safest default in case of any rounding-induced gap (which the
  // overlap strategy already precludes, belt-and-braces).
  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(overlays)
    .png()
    .toBuffer();
}
```

**Verified sharp behavior:** sharp 0.33's composite array is applied in document order. The docs explicitly state "Overlay images on top of the processed image" — and the index.d.ts comment at line 312-318 makes this contract part of the typed surface. The "later overlays paint on top" property is the documented behavior, not a quirk to be careful about — it's the canonical use case.

### Pattern 3: captureFullPage — orchestrator + write to disk (OUT-03)

**Where:** `src/capture/index.js`
**Called by:** `src/cli.js`
**Why third:** Composes `frames.js` + `stitch.js`, then writes the buffer to the resolved output path with `mkdir -p`.

```javascript
// src/capture/index.js
// Phase 5 orchestrator: captureFullPage = captureFrames → stitchFrames → mkdir+writeFile.
// Single entry point the CLI consumes. The CLI imports ONLY from here, never
// directly from frames.js or stitch.js.
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors bubble; the caller (src/cli.js) owns presentation.
//
// Lifecycle: takes a prepared Page (Phase 4 already ran) and a resolved output
// path (Phase 2 already resolved). Produces a PNG file on disk. Does NOT
// close the page, context, or browser — the CLI owns lifecycle (per Phase 3
// pattern; cli.js:63-67 — context.close() then browser.close() in finally).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { captureFrames } from './frames.js';
import { stitchFrames } from './stitch.js';

/**
 * Full-page capture orchestrator. Scroll-and-stitch a prepared page into one
 * PNG file at the resolved output path, creating parent directories as needed.
 *
 * @param {import('playwright-chromium').Page} page — a Page already prepared by
 *   Phase 4 (animations frozen, IO triggers fired, hidden selectors removed,
 *   scroll-primed; scrollY=0 at entry).
 * @param {string} outputPath — absolute or relative resolved path (Phase 2's
 *   `resolveTemplate` already substituted {date}, {viewport}, {page}). Parent
 *   directories will be created with { recursive: true } if missing.
 * @returns {Promise<void>}
 */
export async function captureFullPage(page, outputPath) {
  // Step 1 — Capture: scroll + per-viewport screenshots → array of Buffers.
  const { frames, geometry } = await captureFrames(page);

  // Step 2 — Stitch: sharp composite into one PNG Buffer.
  const pngBuffer = await stitchFrames(frames, geometry);

  // Step 3 — Write: mkdir parent + writeFile. Same fs/promises calls
  // cli.js:43-45 already uses for the smoke screenshot's parent dir.
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, pngBuffer);
}
```

### Pattern 4: CLI integration — replace the placeholder else-branch

The CLI's capture action body, after Phase 4, looks like (`src/cli.js:28-68`):

```javascript
const { browser, context } = await launchBrowser(config);
try {
  await installAnimationGuards(context, config.prepare);
  const navigatedPage = await navigateToPage(context, config.page);
  if (opts.smoke) console.time('prepare');
  const { hideSummary } = await runPreparePipeline(navigatedPage, config.prepare);
  if (opts.smoke) console.timeEnd('prepare');
  if (opts.smoke) {
    // ... existing smoke branch: one viewport screenshot via fullPage:false, animations:'disabled'
  } else {
    // ★ Phase 5 placeholder: JSON dump of the resolved config + URL
    console.log(JSON.stringify({ ...config, _resolvedOutput: resolvedOutput, _navigated: navigatedPage.url() }, null, 2));
  }
} finally {
  await context.close();
  await browser.close();
}
```

Phase 5 changes:

1. **Add import:** `import { captureFullPage } from './capture/index.js';` — mirror the existing `./browser/...` / `./prepare/...` import style.
2. **Replace the else-branch body:** swap the `JSON.stringify` call with `await captureFullPage(navigatedPage, resolvedOutput);` and a confirmation line (e.g. `console.log(\`screenshot written: ${resolvedOutput}\`);`) modeled on the smoke branch's existing `console.log(\`smoke screenshot written: ${resolvedOutput}\`);` at `cli.js:47`.
3. **Do NOT touch the `--smoke` branch.** That's the Phase 3/4 hermetic verification seam; it stays semantically as "ONE viewport screenshot." Phase 5's capture loop lives only in the production branch.
4. **Do NOT touch the try/finally lifecycle.** `context.close()` BEFORE `browser.close()`. Phase 3 invariant. Untouched.

```javascript
// src/cli.js — diff (paraphrased)
import { Command } from 'commander';
import { loadConfig } from './config/load.js';
import { resolveTemplate } from './output/template.js';
import { launchBrowser } from './browser/launcher.js';
import { navigateToPage } from './browser/navigator.js';
import { installAnimationGuards, runPreparePipeline } from './prepare/index.js';
import { captureFullPage } from './capture/index.js';   // ★ NEW

// ... inside the else branch (around cli.js:48-61) ...
} else {
  // ★ Phase 5: full-page scroll-and-stitch capture
  await captureFullPage(navigatedPage, resolvedOutput);
  console.log(`screenshot written: ${resolvedOutput}`);
}
```

One import line + one branch-body replacement + one log line. No new flags. No structural changes.

### Anti-Patterns to Avoid

- **Don't use `page.screenshot({ fullPage: true })`** anywhere in `src/capture/*` — the project gate `! grep -rq 'fullPage: true' src/` (from Phase 3 RESEARCH and reinforced in 04-PATTERNS §What NOT To Do #13) still applies. Phase 5 is the WHOLE REASON this gate exists.
- **Don't use `behavior: 'smooth'`** on `window.scrollTo` — same race-condition rule Phase 4's scroll.js documents.
- **Don't add a fixed timeout (`page.waitForTimeout(N)`)** between scroll and screenshot — use a single rAF roundtrip. `waitForTimeout` in a per-frame loop accumulates latency unnecessarily and isn't deterministically tied to "layout has settled."
- **Don't re-read `scrollHeight`** in the loop — measure once at the start. If the page extends mid-capture (rare for prepared Framer pages where Phase 4 scrollPrime walked everything), you'd get an inconsistent picture. Re-reading would also add a roundtrip per frame.
- **Don't catch sharp errors** in `stitch.js` and rewrap them. Let them bubble. Phase 6 formats.
- **Don't log progress from `src/capture/*`** — Phase 6 (CLI-02) owns spinner output. Library code stays silent. The CLI confirmation line (after the await) is the production output for v0.1.
- **Don't add a `--full-page` or `--no-stitch` flag** — Phase 4's pattern. The production path IS the stitch path. There is no alternative production behavior.
- **Don't write to a tmp file then rename for "atomicity"** — personal tool. If the write fails or crashes mid-write, the user re-runs.
- **Don't call `sharp.cache(false)` or `sharp.concurrency(N)`** in v0.1 — defaults are appropriate. Tuning is premature.
- **Don't try to re-resolve `outputPath`** in `captureFullPage` — the CLI already called `resolveTemplate` (`cli.js:26`). Re-resolving would either be a no-op (best case) or corrupt the path (worst case if our resolver was called on already-resolved input).
- **Don't `mkdir` the file path** (instead of its parent) — `mkdir({ recursive: true }, outputPath)` would create the PNG path as a directory and then `writeFile` would fail. Always `mkdir(dirname(outputPath), { recursive: true })`. Verified in `cli.js:43-45` which already does this correctly.
- **Don't open the captured frame buffers with `sharp(buf)` before composite** — sharp's composite accepts PNG buffers directly as overlays. Pre-loading each is wasted decode+re-encode work.
- **Don't pass each frame as a `{ input: { create: ... } }` overlay** — that's for synthesizing test images. Pass `input: Buffer` directly. Verified at sharp index.d.ts:1487 (`input?: string | Buffer | { create: Create } | …`).
- **Don't change `scale: 'device'` to `'css'`** — defeats `deviceScaleFactor`, breaks CAP-02 (retina quality). The Phase 5 math depends on `scale: 'device'`.
- **Don't move the sticky-element handling into Phase 5** — Phase 4's `hide` list owns this. If users get ghosting, the fix is to add their sticky selector to `prepare.hide`. Phase 5 trusts Phase 4.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Compose N PNG buffers into one tall PNG | A custom PNG decoder + IDAT-chunk concatenator | `sharp({ create }).composite([...]).png().toBuffer()` | PNG chunk concatenation is non-trivial (IHDR width/height must match, IDAT chunks must be re-deflated, CRC32 must be recomputed). sharp handles all of this via libvips natively. |
| Compute physical-pixel canvas size from CSS-pixel geometry | A guesser that hardcodes DSR=2 | Read `window.devicePixelRatio` once, multiply through | Hardcoding DSR=2 silently breaks DSR=1 (desktop screenshots) and DSR=3 (mobile). Reading at capture time is the source of truth and matches what Playwright's `scale: 'device'` actually applied to the screenshot bytes. |
| Handle the last-frame remainder | Capture-beyond-page + manual pixel clipping in sharp via `extract` | Clamp final y to `totalHeight - viewportHeight` and rely on composite-order overlap | Either approach works mathematically. Clamp-and-overlap is simpler — no extra sharp call, no manual rect math, no risk of off-by-one. Composite-order is a documented sharp guarantee. |
| Wait for "page is stable" between scroll and screenshot | Polling getComputedStyle for "no animation in progress" | One `requestAnimationFrame` roundtrip via `page.evaluate(() => new Promise(r => requestAnimationFrame(r)))` | Polling for stability is high-complexity for marginal correctness gain. Phase 4 already disabled animations; Phase 5 just needs one paint to flush. rAF is the documented stability primitive for "wait for next paint." |
| Create the parent directory tree | A recursive `if (!exists) mkdir; for (parent of parents) mkdir` loop | `await mkdir(dirname(outputPath), { recursive: true })` | Node 10.12+ added `recursive: true`. Builtin. Same call `cli.js:43-44` already uses. |
| Pick a PNG compression level | Tune compressionLevel and adaptive filtering across a benchmark suite | sharp defaults (compressionLevel=6, no adaptive filtering) | Personal tool, infrequent runs. PNG file size is not the bottleneck; capture-and-stitch time is. Sharp's defaults are sensible. |
| Detect if a page is "single-viewport tall" | A heuristic based on viewport-element ratio | If `scrollHeight <= innerHeight`: single-frame fast path | Trivial check. The single-frame path is identical to the loop's single iteration; the fast path just skips computing offsets. |

**Key insight:** sharp's composite handles every dimension of the stitch correctly out-of-box (PNG decode, canvas creation, alpha compositing, PNG re-encode, byte buffer return) in ONE chained call. The risk in Phase 5 is over-engineering: rolling a custom PNG manipulator, manually clipping the last frame, polling for page stability — each of these is a temptation that produces strictly worse code than the canonical sharp call.

## Runtime State Inventory

Not applicable — Phase 5 is greenfield code. No rename/refactor/migration. The only persistent state Phase 5 touches:
- Writes PNG files at the resolved output path. These accumulate over time; cleanup is the user's responsibility (mkdir is idempotent for re-runs; writeFile silently overwrites).
- No databases, no caches, no env vars, no OS-registered state.
- No installed-package side effects (sharp's native libvips binary is bundled in the npm tarball; Phase 1 already accepted this).

## Common Pitfalls

### Pitfall 1: Last-frame off-by-one — capturing beyond page bottom

**What goes wrong:** If `scrollHeight % innerHeight !== 0` (almost always — Framer pages rarely happen to be exact multiples), naive iteration goes `y = 0, vh, 2vh, …` until `y + vh > totalHeight`. The last natural iteration would capture from `y = nFull * vh` to `y + vh = (nFull+1) * vh`, which exceeds the page. Three failure modes:

- **(a) Playwright clip throws.** `page.screenshot({ clip: { y: nFull*vh, height: vh } })` where `y + height > scrollHeight` — Playwright will throw "Clipped area is either empty or outside the resulting image" if the clip rect doesn't intersect the viewport at all (after scrolling). Even if it doesn't throw, the bottom portion of the captured image is undefined (white, black, or transparent depending on Chromium version).
- **(b) Tail content missing.** A more defensive implementation that stops at `y + vh <= totalHeight` simply doesn't capture the final `totalHeight % vh` CSS pixels. Output is missing the bottom of the page.
- **(c) Wrong canvas size.** If you stop the loop early to avoid (a), the stitched canvas is also too short (sum of captured frame heights, not totalHeight). Output PNG dimensions don't match expectation.

**Why it happens:** Iteration in fixed-step is the natural pattern; not every page is a multiple of viewport.

**How to avoid:** Overlap-and-trust-composite. Cap the last iteration at `y = totalHeight - viewportHeight`. The screenshot is always full-viewport. The composite places this frame at its true y in the canvas, overlapping the prior frame's bottom portion. sharp composite-order resolves the overlap: the last frame wins. Verified semantics at sharp index.d.ts:312-318 ("Overlay images on top… The images to composite must be the same size or smaller than the processed image"). Composite-order is the canonical use case.

**Rejected alternatives:**
1. **Shorter last step** — capture with `clip: { y: nFull*vh, height: totalHeight - nFull*vh }`. Produces a non-full-viewport frame. Works mathematically (canvas math just uses each frame's actual height). Adds branching in stitch.js. Equivalent correctness, slightly more code. Defensible alternative; chose overlap for "all frames are the same shape" simplicity.
2. **Capture beyond + clip-in-sharp** — go past the page, then `sharp.extract({ left:0, top: 0, width, height: totalHeight*DSR })`. Adds a sharp pipeline step. More moving parts.
3. **Pad-and-crop** — make the page taller via CSS injection, capture, then crop. Adds DOM mutation. Wrong layer.

**Warning signs:** Stitched PNG is shorter than `scrollHeight*DSR`; or `page.screenshot` throws with a clip-rect error; or the tail of the page is missing from the output.

### Pitfall 2: Sticky elements that weren't in the `hide` list

**What goes wrong:** A `position: sticky` or `position: fixed` element that the user forgot to add to `prepare.hide` scrolls with the viewport during the capture loop. Result: a ghosted sticky nav at each frame's top in the stitched PNG.

**Why it happens:** OUT-02's SC #3 ("Sticky navigation elements appear exactly once at the top") is satisfied **by Phase 4's hide list**, not by any Phase 5 logic. The brief's key-question #2 surfaces this explicitly. If the user's YAML lists `nav.sticky`, `#consent-banner`, etc. in `config.prepare.hide`, Phase 4 hides them with `visibility: hidden !important` AND keeps their layout slot (so scroll math holds). If the user OMITS the selector, Phase 4 has nothing to hide, and Phase 5 has no way to know "that element is sticky and should appear only once."

**How to avoid:** Document that `prepare.hide` is the canonical sticky-handling surface. Phase 4 already does this; Phase 5 doesn't have to do anything except trust Phase 4. Phase 6 (CLI-03) is where missing-selector warnings surface (`hideSummary.missed` is the data Phase 6 reads to print "selector X matched 0 elements — your YAML may be missing a hide entry"). The end-to-end user feedback loop is: missed sticky → ghosted output → user notices → adds selector → re-runs.

**Edge case (and why we don't try to fix it in Phase 5):** A page might have NO `position: sticky` elements at all (genuinely scrolling content from top to bottom). In that case the user has no `hide` entries for navs, and there's no ghosting. Correctness is preserved. The failure mode is only if a sticky exists AND the user forgot to list it AND wants a clean capture.

**Warning signs:** Stitched PNG shows a nav bar at the top of every viewport-height interval. The user's config has an empty `hide:` list (or one missing the sticky selector). Diagnosis: visually inspect the output; the periodicity of the ghost is the viewport height.

### Pitfall 3: No wait between scroll and screenshot — layout not yet settled

**What goes wrong:** Immediately after `window.scrollTo(0, y)`, the page's `scrollY` is updated, but a `position: sticky` element's compositor layer (or any element whose layout depends on scroll position via JS) may not have re-painted yet. Capturing immediately produces a frame where the sticky element is at the WRONG y — usually still at the prior frame's position — leading to visible doubled or mis-aligned elements at frame boundaries.

**Why it happens:** Scrolling triggers layout/paint asynchronously in the browser's render pipeline. `scrollTo` returns synchronously after updating `scrollY`, but the visual update is queued for the next frame.

**How to avoid:** One `requestAnimationFrame` round-trip before screenshot:

```javascript
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
```

This blocks until the next animation frame fires, which is when Chromium has performed at least one layout-and-paint pass after the scroll. Sufficient for v0.1's prepared-by-Phase-4 pages (animations already frozen, IO callbacks already run). Alternative: `page.waitForTimeout(50)` — non-deterministic, slower (50ms vs ~16ms for one frame), worse on every axis.

**Why not `page.waitForLoadState('networkidle')` again:** Phase 3 already waited. Network state shouldn't change during the capture loop on a prepared page (Phase 4's scrollPrime already triggered all lazy-loads). Re-waiting wastes time.

**Warning signs:** Frame boundaries show vertical discontinuity (a sticky element at the bottom of frame N is at the top of frame N+1 instead of being absent from both because it was hidden, or being correctly absent because Phase 4 hid it).

### Pitfall 4: Confusing CSS pixels and physical pixels

**What goes wrong:** Geometry math gets the canvas size wrong by a factor of DSR. Either the canvas is too small (frames don't fit, sharp throws "Image to composite must have same dimensions or smaller") or too large (frames don't fill the canvas, leaving transparent strips).

**Why it happens:** Playwright's `scale: 'device'` produces physical-pixel screenshots, but `innerHeight`, `scrollHeight`, and `clip` coordinates are CSS pixels. The dimensional unit boundary is invisible if you don't track it.

**How to avoid:** Encode the contract in variable names AND in the geometry payload's structure:

- `viewportWidth`, `viewportHeight`, `totalHeight`, `frameYOffsets[]` — all CSS pixels (what the page sees).
- `deviceScaleFactor` — the multiplier.
- Canvas dimensions: `Math.round(cssDim * dsr)` for each. Composite offsets: `Math.round(yCss * dsr)`.

**Verified sources:**
- Playwright's PageScreenshotOptions.scale docs (types.d.ts:24338-24344): "When set to 'css', screenshot will have a single pixel per each css pixel… Using 'device' option will produce a single pixel per each device pixel, so screenshots of high-dpi devices will be twice as large or even larger. Defaults to 'device'." [VERIFIED]
- Playwright's PageScreenshotOptions.clip docs (types.d.ts:24276-24296): clip coordinates documented in CSS pixels (the same coordinate space innerHeight uses). [VERIFIED]
- `window.devicePixelRatio` is the canonical source of DSR at the page-context layer; matches Playwright's launcher `deviceScaleFactor` config. [VERIFIED]

**Warning signs:** sharp throws on composite "Image to composite must have same dimensions or smaller as the processed image"; or the output PNG dimensions are 1440×6580 when you expected 2880×13160 (DSR=2 case, off-by-factor-2); or transparent strips visible at the right/bottom of the stitched image.

### Pitfall 5: Reading `scrollHeight` inside the loop

**What goes wrong:** If `scrollHeight` is re-read each iteration, lazy-load content that arrives during the capture (or a `position: sticky` element that adds intrinsic height when scrolled into view) can change the loop's iteration count mid-flight. Either an infinite loop (each step extends the page) or an inconsistent number of frames vs. canvas height.

**Why it happens:** Defensive instinct — "what if the page extended?"

**How to avoid:** Read geometry ONCE at the start of `captureFrames`. Phase 4's `scrollPrime` already walked the page bottom-to-top, so lazy-load IOs have fired and image fetches have settled by the time Phase 5 starts. The geometry is stable. If a real Framer site surfaces dynamic-height-during-capture, revisit (deferred per §Open Questions #1).

**Warning signs:** Frame count varies between two consecutive runs of the same page; or the loop never terminates; or stitched canvas size doesn't match `scrollHeight * DSR`.

### Pitfall 6: sharp `composite` order — relying on it the wrong way

**What goes wrong:** A misreading of the docs ("later overlays paint on top") leads to passing frames in REVERSE order — assuming "last overlay = bottommost frame." Inverted PNG result.

**Why it happens:** "Last overlay on top" is ambiguous about whether "top" means "visual top of the stack" or "spatial top of the canvas."

**How to avoid:** Pass frames in DOCUMENT order (top-of-page first, bottom-of-page last). "On top" in sharp means "visual top of the alpha stack" — later overlays' pixels win over earlier ones in the SAME spatial region. Since each frame occupies a different spatial region (their `top` offsets are distinct), the order only matters in the overlap region of the last frame. We want the LAST frame's pixels to win in the overlap (because the last frame is the one whose y was clamped — it has the correct bottom content). Pass frames in document order; last frame wins in overlap; correct result. Verified by reading sharp's composite docs and tested mentally against the OverlayOptions ordering contract.

**Warning signs:** The bottom of the PNG looks "smeared" or "wrong" — the overlap region shows the prior frame's pixels (because we accidentally put the last frame first in the overlays array).

### Pitfall 7: `mkdir({ recursive: true })` on the file path instead of the directory

**What goes wrong:** `mkdir('./screenshots/2026-05-22/desktop/home.png', { recursive: true })` creates a directory named `home.png`, and then `writeFile('./screenshots/.../home.png', buf)` fails with EISDIR.

**Why it happens:** Quick fingers; "ensure the path exists" reads as "mkdir the path."

**How to avoid:** Always `mkdir(dirname(outputPath), { recursive: true })`. Then `writeFile(outputPath, buffer)`. This is exactly what `cli.js:43-45` already does for the smoke screenshot — verified pattern in repo.

**Warning signs:** EISDIR on writeFile; or the file system has a directory at the intended output path; or the test cleanup `rm` complains about being unable to remove a non-empty directory.

### Pitfall 8: Sharp's `composite` rejecting overlays larger than the canvas

**What goes wrong:** If our DSR rounding produces a canvas one pixel smaller than the sum of frame dimensions (e.g. floor instead of round, or DSR=1.5 producing a fractional canvas height), composite throws "Image to composite must have same dimensions or smaller as the processed image" per index.d.ts:312.

**Why it happens:** `Math.floor(1.5 * vh) * nFrames` vs `Math.floor(1.5 * (nFrames * vh))` can differ by 1.

**How to avoid:** Use `Math.round` for ALL pixel dimensions. Apply DSR to the COMPOSED CSS-pixel value, not piecewise. The frame screenshot itself is whatever physical-pixel dimensions Playwright produces (we don't control that rounding); the canvas just needs to be ≥ the frame's physical pixels. For DSR=2 (the common case), all values are integer-multiplied; no rounding concerns. For fractional DSR (1.5, 1.25), use `Math.ceil` for the canvas height to err on the side of "canvas is slightly larger than needed" — sharp tolerates frames smaller than canvas, but not larger.

**Warning signs:** sharp throws with "Image to composite must have same dimensions or smaller as the processed image"; or transparent strip of 1px at the bottom of the stitched output.

### Pitfall 9: Forgetting that the `--smoke` branch should stay one screenshot

**What goes wrong:** A planner enthusiastically replaces both the `--smoke` and non-`--smoke` branches with the new `captureFullPage` call. Result: hermetic smoke verification now takes 10x longer and produces a different-shaped output than the smoke test was designed to verify (single viewport screenshot vs. full page).

**Why it happens:** "Both branches output a screenshot; they should call the same function" feels like a refactor.

**How to avoid:** `--smoke` is the Phase 3/4 hermetic verification seam. It explicitly takes ONE viewport screenshot to prove CAP-01/02/03 + PREP-01..05. Phase 5's scroll-stitch loop is NOT exercised by `--smoke`; it's the production path. Touch only the `else` branch at `cli.js:48-61`. The smoke branch stays unchanged.

**Warning signs:** Smoke runtime increases from ~2s to ~15s; hermetic test PNG output is much taller than the viewport (the smoke fixture is 600px tall viewport, but the fixture HTML is ~2600px so the stitched output would be ~2600px tall — too long for the SC the smoke is verifying).

### Pitfall 10: Writing an enormous PNG to /tmp without notifying the user

**What goes wrong:** A pubq.se page at 1440×900 DSR=2 with `scrollHeight = 8000` produces a ~5–10 MB PNG. Tolerable. But a page with `scrollHeight = 30000` (a long-form blog post) at DSR=3 produces a 4320×90000 PNG — potentially 50+ MB.

**Why it happens:** No size guard.

**How to avoid:** v0.1 — accept the risk. Personal tool. The user knows what page they're capturing. If output sizes become problematic, a `maxPageHeight` config knob can be added in v0.2 (deferred per §Open Questions).

**Warning signs:** PNG file > 100 MB; sharp's libvips OOMs on extremely tall canvases; output directory's disk usage balloons.

### Pitfall 11: Re-running the prepare pipeline inside Phase 5

**What goes wrong:** "Defense in depth" instinct adds a `runPreparePipeline(page, config.prepare)` call inside `captureFullPage`. Result: the IO shim's effects (which were captured into page state during Phase 4) are now reset because hide+scrollPrime+extraDelay run again. Performance degrades; correctness might too if Framer Motion appear-effects re-fire and produce different final states.

**Why it happens:** Symmetry; "Phase 5 wants a settled page, so make sure it's settled."

**How to avoid:** Phase 4 already prepared the page. Phase 5 trusts the upstream contract. Phase 5 modules NEVER call any `src/prepare/*` function. The CLI orchestrates the order; Phase 5 just consumes the prepared Page.

**Warning signs:** PRs add `import { runPreparePipeline } from '../prepare/index.js';` to `src/capture/*`. Reject.

### Pitfall 12: Closing the browser or context inside Phase 5

**What goes wrong:** Phase 5 module throws a clean error wrapper that tries to clean up: `try { ... } catch (err) { await context.close(); throw err; }`. The CLI's `finally { await context.close(); await browser.close(); }` then throws "Context already closed."

**Why it happens:** Defensive cleanup instinct.

**How to avoid:** `cli.js:63-67` is the SOLE owner of `context.close()` and `browser.close()`. Phase 5 modules accept Page references but never close anything. Same posture as Phase 4. 04-PATTERNS §Risk 10 enumerates this for Phase 4; same applies to Phase 5.

**Warning signs:** Error log shows "Context already closed" or "Browser already closed" wrapping the actual capture error.

## Code Examples

Verified patterns drawn from `node_modules/playwright-core/types/types.d.ts` and `node_modules/sharp/lib/index.d.ts` (direct inspection). Sources cited inline.

### Example 1: end-to-end Phase 5 happy path (the full production flow)

```javascript
// What a single `framershot capture samples/sample.yaml` invocation does
// AFTER Phase 5 ships. Compare to Phase 4's flow — only the marked ★ change.

import { chromium } from 'playwright-chromium';
import { installAnimationGuards, runPreparePipeline } from './src/prepare/index.js';
import { captureFullPage } from './src/capture/index.js';   // ★ NEW

const config = await loadConfig('samples/sample.yaml');
const resolvedOutput = resolveTemplate(config.output, {
  date: new Date().toISOString().slice(0, 10),
  viewport: config.viewport.name,
  page: config.page.name,
});

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  baseURL: 'https://pubq.se',
});

try {
  await installAnimationGuards(context, config.prepare);
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'networkidle', timeout: 15000 })
    .catch((e) => { if (e.name !== 'TimeoutError') throw e; });
  await page.waitForFunction(() => document.fonts.ready, null, { timeout: 15000 });
  const { hideSummary } = await runPreparePipeline(page, config.prepare);

  // ★ Phase 5: full-page scroll-and-stitch capture writes the PNG.
  // No need to mkdir or screenshot directly — captureFullPage owns both.
  await captureFullPage(page, resolvedOutput);
  console.log(`screenshot written: ${resolvedOutput}`);
} finally {
  await context.close();
  await browser.close();
}
```

### Example 2: the geometry math, worked through end-to-end

Assume: pubq.se home page at 1440×900 viewport, deviceScaleFactor=2, scrollHeight = 8237 CSS pixels.

```
CSS-pixel quantities:
  vw           = 1440
  vh           =  900
  totalHeight  = 8237
  nFull        = Math.floor(8237 / 900)         = 9   (frames at y = 0, 900, 1800, …, 7200)
  remainder    = 8237 - 9 * 900                 = 137
  remainder?   = yes — add one more frame at y = 8237 - 900 = 7337
                 (this overlaps frame 9 from y=7200 to y=8100)
  frameYOffsets = [0, 900, 1800, 2700, 3600, 4500, 5400, 6300, 7200, 7337]  (10 frames)

Physical-pixel canvas (DSR = 2):
  canvasWidth  = 1440 * 2                       = 2880
  canvasHeight = 8237 * 2                       = 16474

Per-frame screenshot (each one):
  page.screenshot dimensions                    = 1440 * 2 × 900 * 2 = 2880 × 1800 px

Composite overlays (10 entries):
  overlays[0]  = { input: frames[0], top: 0    * 2 =      0, left: 0 }
  overlays[1]  = { input: frames[1], top: 900  * 2 =   1800, left: 0 }
  overlays[2]  = { input: frames[2], top: 1800 * 2 =   3600, left: 0 }
  overlays[3]  = { input: frames[3], top: 2700 * 2 =   5400, left: 0 }
  overlays[4]  = { input: frames[4], top: 3600 * 2 =   7200, left: 0 }
  overlays[5]  = { input: frames[5], top: 4500 * 2 =   9000, left: 0 }
  overlays[6]  = { input: frames[6], top: 5400 * 2 =  10800, left: 0 }
  overlays[7]  = { input: frames[7], top: 6300 * 2 =  12600, left: 0 }
  overlays[8]  = { input: frames[8], top: 7200 * 2 =  14400, left: 0 }
  overlays[9]  = { input: frames[9], top: 7337 * 2 =  14674, left: 0 }   ← overlaps overlay[8]:
                                                                          14400..16200 (overlay[8])
                                                                          14674..16474 (overlay[9])
                                                                          overlap 14674..16200 → overlay[9] wins (composite order)

Result PNG: 2880 × 16474 px (2880, 8237*2).
```

This is the math the planner and downstream task authors should keep mentally available.

### Example 3: handling the single-frame fast path

Assume: pubq.se promo card page at 1440×900 viewport, deviceScaleFactor=2, scrollHeight = 720 CSS pixels.

```javascript
// In captureFrames:
const { viewportWidth, viewportHeight, totalHeight, deviceScaleFactor } = /* read from page */;
// viewportWidth = 1440, viewportHeight = 900, totalHeight = 720, dsr = 2.
// totalHeight <= viewportHeight → single-frame fast path.

const frameYOffsets = [0];
// Just one screenshot at y=0.
//
// One catch: the clip rect height. If we pass { height: 900 } but the page
// is only 720 CSS pixels tall, Playwright will clip to the visible area
// (Chromium does NOT extend the screenshot with empty space — it returns
// what the page actually has). So either:
//   (a) Pass { height: Math.min(viewportHeight, totalHeight) } — explicit clamp
//   (b) Just pass viewportHeight and accept whatever Playwright returns
//
// (a) is safer because the canvas dimension is totalHeight * DSR; if the
// captured frame is taller than that (somehow), composite throws Pitfall 8.
// Recommendation: ALWAYS clamp clip height to min(viewportHeight, totalHeight).
```

Adjusted clip pattern (for the single-frame fast path AND the last frame in the overlap-disabled alternative):

```javascript
const clipHeight = Math.min(viewportHeight, totalHeight - y);
// But with overlap-and-trust-composite, the last frame's y is clamped, so
// clipHeight is always = viewportHeight. The single-frame fast path is the
// only case where clipHeight differs. Recommendation: special-case the
// single-frame path with its own clip { height: totalHeight }, and have
// the loop ALWAYS use clip { height: viewportHeight } (which is correct
// thanks to overlap-clamping).
```

### Example 4: sharp composite verified against `node_modules/sharp/lib/index.d.ts`

```javascript
// Verbatim from RESEARCH §Pattern 2. Sources cited inline.

import sharp from 'sharp';

// Inputs verified at sharp index.d.ts:
//   - sharp(options).create.{width, height, channels, background} — Create interface line 943-955
//   - .composite(images: OverlayOptions[]) — line 312-318
//   - OverlayOptions.{input, top, left} — line 1487-1510
//   - .png(options?) — line 724
//   - .toBuffer() — line 631

const canvasWidth  = 2880;   // viewportWidth * DSR
const canvasHeight = 16474;  // totalHeight * DSR

const overlays = [
  { input: frames[0], top:     0, left: 0 },
  { input: frames[1], top:  1800, left: 0 },
  { input: frames[2], top:  3600, left: 0 },
  // … through frames[9] …
];

const pngBuffer = await sharp({
  create: {
    width: canvasWidth,
    height: canvasHeight,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(overlays)
  .png()
  .toBuffer();
```

The `background` accepts a `Color` (verified at index.d.ts:1620 — the docs link to `npmjs.org/package/color` for parsing; the `{r, g, b, alpha}` object form is the canonical shape that doesn't require the `color` package to be installed).

### Example 5: writing the final PNG with parent directory creation

```javascript
// Same pattern cli.js:43-45 already uses for the smoke screenshot.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// outputPath came from Phase 2's resolveTemplate — could be:
//   './screenshots/2026-05-22/desktop/home.png'  (relative; resolves against cwd)
//   '/Users/.../screenshots/2026-05-22/desktop/home.png'  (absolute)
//   '/tmp/framershot-smoke/home.png'  (smoke fixture)

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, pngBuffer);
// fs/promises writeFile accepts a Buffer directly — no need to convert to a stream.
```

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|-------------------------|--------------|--------|
| Playwright `fullPage: true` for tall pages | Manual scroll-and-stitch | framershot's design decision (PROJECT.md) | Avoids ghosted sticky elements on Framer sites. |
| imagemagick CLI / wkhtmltoimage for stitching | sharp (Node native via libvips) | Mid-2010s | 10–50x faster than CLI fork-exec; no shell quoting risk; integrates with the Node runtime cleanly. |
| `puppeteer.page.screenshot({ fullPage: true })` (similar ghosting issue) | Playwright + manual stitch | 2020+ | Playwright's `clip` option + sharp composite is the industry standard pattern for stitched captures (see Visual regression tools: Percy, Chromatic, BackstopJS — all derive from this pattern). |
| Custom PNG byte-stitching (concatenating IDAT chunks) | sharp composite | Always — sharp existed before this need was common | Custom PNG manipulation is a footgun (CRC32, chunk ordering, palette concerns). Use the library. |
| `pageres` CLI library for Node | Playwright + sharp directly | Late 2010s | pageres uses headless Chrome but its full-page mode has the same sticky-ghost issue. Direct Playwright + sharp gives us the surgical control Phase 4's IO shim needs. |
| `chrome-remote-interface` (raw CDP) | Playwright | 2020 | Playwright wraps CDP with stable, typed JS APIs. Same capability, better DX. |

**Deprecated/outdated:**
- `page.waitFor(ms)` — use `page.waitForTimeout(ms)` (already established in Phase 4).
- Playwright's older `pdf({ fullPage: true })` for full-page captures — produces PDF, not PNG; orthogonal.
- sharp < 0.32 — limited composite array semantics. 0.33+ is what we have.
- `node-canvas` for PNG composite — heavier dep (compiles cairo natively, no libvips advantages). sharp is preferred.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | sharp 0.33.5's `composite` applies overlays in array order, with later overlays painting on top of earlier ones in overlapping regions | §Pattern 2, §Pitfall 1, §Pitfall 6 | If sharp's composite-order semantics differ (e.g. randomized, or top-to-bottom z-order based on something else), the last-frame-overlap strategy produces wrong output in the overlap region. Mitigation: documented behavior per sharp's typed surface (index.d.ts:312-318); hermetic verification by creating a test composite of two overlapping rectangles and inspecting the PNG would gate this hard. [VERIFIED via reading index.d.ts; HIGH confidence — composite-order is a canonical use case, not an undocumented quirk. The phrase "Overlay images on top of the processed image" combined with array-input + "later wins" is the documented contract.] |
| A2 | Playwright 1.60's `page.screenshot({ clip: { x, y, width, height }, scale: 'device' })` returns a PNG of physical pixels equal to `width·DSR × height·DSR`, with the rect positioned at CSS-pixel coordinates `(x, y)` in the document | §Pattern 1, §Pattern 2, §Pitfall 4 | If clip is in physical pixels (it isn't, but if it were), our canvas math would be off by DSR. Mitigation: types.d.ts:24276-24296 describes clip as "x-coordinate of top-left corner of clip area" without unit qualification, but the surrounding scale documentation (types.d.ts:24338-24344) makes clear that scale is the only unit-affecting parameter, and clip uses the same coordinate space as the page. Hermetic verification: capture a 100×100 clip at known coords, inspect output dimensions. [VERIFIED via types.d.ts inspection; HIGH confidence — Playwright's consistent use of CSS pixels for coordinate input is canonical. The CSS-pixel-for-clip vs physical-pixel-for-output convention is the same as Chromium DevTools' Recorder format.] |
| A3 | A single `requestAnimationFrame` roundtrip via `page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())))` is sufficient to wait for layout-and-paint after a `window.scrollTo` | §Pattern 1, §Pitfall 3 | If Chromium's render pipeline produces a stale screenshot inside one rAF (because Playwright's screenshot internally goes through CDP's Page.captureScreenshot which has its own pipeline), we'd see frame-boundary discontinuities. Mitigation: Phase 4 already disabled animations and fired IO callbacks; the layout-after-scroll is the only outstanding step. Empirically, one rAF is enough for non-animated layouts; widely used in visual regression tooling (Percy, BackstopJS docs name this primitive). [ASSUMED based on widely-used pattern; MEDIUM-HIGH confidence — if real Framer sites surface a need, a `page.waitForTimeout(50)` fallback would be a one-line change.] |
| A4 | `window.devicePixelRatio` inside `page.evaluate` returns the same value as the `deviceScaleFactor` passed to `browser.newContext` | §Pattern 1, §Architectural Responsibility Map | If Playwright applies deviceScaleFactor to the rendering pipeline but not to `window.devicePixelRatio` (which would be a surprising decoupling), our DSR-from-page math would be wrong. Mitigation: Playwright's `deviceScaleFactor` is documented as "can be thought of as dpr" (types.d.ts:10247-10248, the launcher's deviceScaleFactor doc) — explicit equation. [VERIFIED in Playwright docs; HIGH confidence.] |
| A5 | Phase 4's `runPreparePipeline` leaves the page at `scrollY = 0` | §Pattern 1, §Architecture | If Phase 4's final state isn't scrollY=0 (e.g. extraDelay introduces some interaction), Phase 5's first frame at y=0 would mis-align with the document top. Mitigation: Phase 4's scrollPrime ends with `window.scrollTo({ top: 0, behavior: 'instant' })` (verified in `src/prepare/scroll.js:58-60`). [VERIFIED by reading the existing source; HIGH confidence.] |
| A6 | sharp's `create` with `channels: 4` produces an RGBA canvas where every pixel is initially `background` (alpha 0 = transparent), and composite-input PNGs (which have their own RGBA channels) overlay correctly without alpha-channel surprises | §Pattern 2 | If the PNG buffers from page.screenshot have alpha channels that interact unexpectedly with the transparent canvas (e.g. premultiplied alpha mismatches), we could see incorrect edge blending. Mitigation: Playwright's PNG output is non-premultiplied straight RGBA; sharp's default composite handles non-premultiplied inputs correctly. The transparent canvas is invisible because every pixel is overwritten by the first composite (which is a fully-opaque viewport screenshot). [VERIFIED at sharp index.d.ts; HIGH confidence — the transparent canvas is effectively a no-op visually.] |
| A7 | `fs/promises.writeFile(path, Buffer)` writes the buffer atomically in the sense that no concurrent reader sees a half-written file mid-call | §Pattern 3, §Pitfall 10 | If a real concurrent reader (which we don't have — no parallel runs) saw partial content during write, the personal-tool scope makes this irrelevant. v0.1 doesn't promise atomicity. [ACCEPTED.] |
| A8 | The frames buffer array's peak RAM cost (frames-per-page × frame-size) is acceptable for v0.1 typical pages | §Standard Stack, §Don't Hand-Roll, §Open Questions | A 30-frame pubq.se page at 1440×900 DSR=2 produces 30 × 2880×1800 = ~30 MB of PNG-compressed data in RAM during capture, plus the same amount as decoded RGBA during composite (~150 MB). Acceptable. A 100-frame page at DSR=3 with mobile viewport sizes could push to several hundred MB. Not a concern for personal-tool v0.1. [ACCEPTED; revisit in §Open Questions #2.] |
| A9 | Playwright's `clip` rect must intersect the current visible viewport — meaning we MUST scroll to (or near) `y` BEFORE the screenshot, even though clip uses document coordinates | §Pattern 1 | If clip works independently of scroll (capturing any document rect), we could skip the scrollTo and just screenshot with clip at the target y. Mitigation: Playwright's internal pipeline uses the compositor's currently-rendered surface; document regions not currently in the compositor have stale or absent content. Scrolling first is the safe pattern; the clip then double-checks our scroll worked. [ASSUMED based on how CDP Page.captureScreenshot works; MEDIUM-HIGH confidence — could be verified by intentionally skipping scrollTo and checking output.] |
| A10 | The locked decision in PROJECT.md to "stitch manually instead of fullPage: true" is sufficient justification to avoid `fullPage: true` even though Playwright >= 1.50 may have improved its sticky-element handling | §Anti-Patterns, §Alternatives Considered | If Playwright has silently fixed the sticky-ghost issue, we'd be paying the complexity cost of manual stitch for no benefit. Mitigation: PROJECT.md is the locked decision; revisiting it is a separate conversation, not a Phase 5 research call. [ACCEPTED — locked decision honored.] |

## Open Questions (RESOLVED)

All questions below have a `RESOLVED:` recommendation that locks the decision for v0.1. Items remain documented for future-phase context.

1. **What if the page extends in height DURING the capture loop (lazy-loading by scroll position OR a JS framework reacting to viewport intersection)?**
   - What we know: Phase 4's `scrollPrime` walked the page to the bottom in 200ms steps, so browser-native lazy-loading IOs have fired. Phase 4's IO shim makes Framer Motion's `whileInView` callbacks fire immediately. Most height-changing behavior has happened by the time Phase 5 starts.
   - What's unclear: Whether some Framer sites have JS that listens for scroll-position events (`window.addEventListener('scroll', …)`) and changes layout in response — distinct from IO triggers.
   - RESOLVED: Read geometry once at start. If real Framer sites surface this problem (hermetic verification + live-site smoke against pubq.se will tell us), add a v0.2 `dynamicHeight: true` config option that re-reads scrollHeight per iteration with a max-iteration cap to prevent infinite loops. Phase 5 v0.1 doesn't handle it.

2. **What's the right memory ceiling for v0.1, and when does streaming-stitch become necessary?**
   - What we know: A typical Framer site is 5-15 frames at 2880×1800 px per frame (DSR=2 desktop). Peak RAM during compose is ~150 MB. Tolerable.
   - What's unclear: Real pubq.se's page heights (could be 30+ frames for marketing scroll-stories). Author's machine RAM headroom.
   - RESOLVED: v0.1 keeps everything in RAM. If `framershot capture` ever OOMs on a real page, add a frames-to-disk mode (write each frame to `os.tmpdir()`, sharp composite from file paths). v0.2 work.

3. **Should `captureFullPage` accept any options at all, even as a placeholder?**
   - What we know: The brief specifies the signature is `captureFullPage(page, outputPath)`. No options.
   - What's unclear: Whether future work (v0.2 region capture, v0.2 multi-page) will share enough of this code to benefit from an options object.
   - RESOLVED: v0.1 — no options. Add when a real second consumer materializes. YAGNI.

4. **Should `captureFullPage` return any value (the buffer, dimensions, a summary)?**
   - What we know: The CLI just needs to know "succeeded; print confirmation" — return value is unused.
   - What's unclear: Whether Phase 6 (CLI-02 spinners) wants to know per-frame progress.
   - RESOLVED: v0.1 returns `void`. Phase 6 can refactor to return a progress-emitter or accept a callback if needed.

5. **Should sharp's `composite` be called with `premultiplied: false` (or true) explicitly?**
   - What we know: PNG output from Playwright is non-premultiplied straight RGBA. sharp's default composite handles this correctly.
   - What's unclear: Whether explicit `premultiplied: false` on each overlay improves clarity.
   - RESOLVED: Don't set it. Default is correct. Adding the explicit flag would be cargo-cult.

6. **Should the per-frame screenshot include `omitBackground: true`?**
   - What we know: Most Framer sites have an opaque background. Per-frame screenshots with omitBackground would expose transparent regions where the page background hasn't painted (rare, but possible at scroll-bounce or just-loaded states).
   - What's unclear: Edge cases on pages with intentional transparency.
   - RESOLVED: NO. Defaults (`omitBackground: false`). v0.1 emits opaque PNGs.

7. **What's the right behavior when the page is shorter than the viewport (`scrollHeight <= innerHeight`)?**
   - What we know: A single-frame capture suffices. The clip's height should be `min(viewportHeight, totalHeight)`.
   - What's unclear: Whether the output PNG's height should be `viewportHeight * DSR` (padded with white/transparent) or `totalHeight * DSR` (exactly the page).
   - RESOLVED: Output PNG height = `totalHeight * DSR`. Match the page exactly. The clip height clamp handles this.

8. **Should there be a max-height safety cap (e.g. refuse pages taller than 50,000 CSS pixels)?**
   - What we know: Personal tool, user knows their page.
   - What's unclear: Whether libvips throws on enormous canvas dimensions (it has its own limits in `unlimited: false` mode).
   - RESOLVED: v0.1 — no cap. If real pages produce sharp errors, surface them via the existing error-bubble + Phase 6 formatting.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All Phase 5 code | ✓ | (per package.json `engines.node >= 20`; verified in Phase 1) | — |
| `playwright-chromium` | `page.evaluate`, `page.screenshot` | ✓ | 1.60.0 | — |
| `sharp` | Buffer composite to PNG | ✓ | 0.33.5 [verified in `node_modules/sharp/package.json`] | — |
| libvips (bundled with sharp) | sharp's native backend | ✓ | 8.x (verified via `node -e "console.log(require('sharp').versions.vips ?? 'bundled')"` returns full libvips version tree) | — |
| Chromium browser binary | Per-frame screenshots | ✓ | chromium-1223 (Phase 1 + 3 verified) | — |
| `node:fs/promises` | mkdir + writeFile | ✓ | Node 20 stdlib | — |
| `node:path` | dirname | ✓ | Node 20 stdlib | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

Phase 5 introduces no new external dependencies. sharp's bundled native libvips is the only platform-specific binary; it's been installed and is functional in this environment (darwin-arm64 host, sharp 0.33.5 was installed at Phase 1 with the correct platform-native build).

## Validation Architecture

> `workflow.nyquist_validation` is not explicitly set in `.planning/config.json` — treated as enabled.

### Test Framework

Phase 5 doesn't introduce a test framework. Following Phases 3 + 4's pattern, Phase 5 piggybacks on the existing hermetic seam — but with an important shift: the `--smoke` branch is a one-screenshot Phase 3 verification, NOT the Phase 5 production path. So `--smoke` cannot verify Phase 5 directly. Instead, Phase 5's hermetic verification is a NEW run that exercises the non-`--smoke` branch and asserts on the resulting PNG.

| Property | Value |
|----------|-------|
| Framework | Hermetic E2E via `node index.js capture samples/smoke.yaml` (NO `--smoke`) running against the existing localhost fixture |
| Config file | none |
| Quick run command | `node samples/serve-smoke.js & sleep 0.5 && node index.js capture samples/smoke.yaml; kill %1` |
| Full suite command | quick run + the live `samples/sample.yaml` against pubq.se (manual visual gate against a known-good screenshot) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OUT-01 | Running `framershot capture samples/smoke.yaml` (no `--smoke`) produces a PNG at the templated path | hermetic E2E + file existence | `node samples/serve-smoke.js & node index.js capture samples/smoke.yaml && test -f /tmp/framershot-smoke/home.png; kill %1` | ✅ existing fixture already covers smoke.yaml's templated path resolution; just remove `--smoke` |
| OUT-02 — height correctness | The output PNG's height equals `scrollHeight * deviceScaleFactor` (within rounding tolerance) | hermetic metadata assertion | Add a verifier script that uses sharp's `metadata()` to read width/height; assert `height === expected_total * DSR` (the fixture's scrollHeight is deterministic — ~2700px from the smoke fixture HTML — see `samples/serve-smoke.js`) | ❌ Wave 0 — add `samples/verify-stitch.js` (a tiny Node script) |
| OUT-02 — no seams | Visual inspection: the stitched PNG shows the fixture content top-to-bottom with no visible repeating bars | manual visual gate | Manual: open the resulting PNG in Preview, scroll through and confirm no doubled elements at viewport-height intervals | ❌ Wave 0 — documented in SUMMARY |
| OUT-02 — sticky correctness | The fixture's `.hidden-by-test` element does NOT appear in the stitched PNG (Phase 4's hide list already removes it; Phase 5 must not re-introduce it) | hermetic visual + DOM-state | Phase 4's smoke already verifies this in the single-viewport screenshot; for Phase 5 we add a sharp-based pixel sample at the position the `.hidden-by-test` element would have occupied to confirm it's not present | ❌ Wave 0 (optional — Phase 4's smoke already proves the mechanism works) |
| OUT-03 | Running with a config whose output template includes a non-existent parent directory produces the file with `mkdir -p` semantics | hermetic file system | `rm -rf /tmp/framershot-stitch-test && OUTPUT=/tmp/framershot-stitch-test/sub/dir/home.png node index.js capture <custom config with this output>; test -f /tmp/framershot-stitch-test/sub/dir/home.png` | ❌ Wave 0 — either add a `samples/smoke-deep-path.yaml` or test by inference from smoke.yaml's existing `/tmp/framershot-smoke/{page}.png` (which already creates `/tmp/framershot-smoke/` recursively) |

### Sampling Rate
- **Per task commit:** `node samples/serve-smoke.js & node index.js capture samples/smoke.yaml; kill %1` — proves OUT-01 (file exists) + OUT-03 (mkdir recursive). OUT-02 height assertion via `samples/verify-stitch.js` if Wave 0 ships it.
- **Per wave merge:** same hermetic + a quick `sharp(path).metadata()` height check.
- **Phase gate:** Hermetic test green + live-site capture against pubq.se shows a clean stitched PNG with no ghosted navs (visual gate, documented in 05-SUMMARY.md). The pubq.se baseline screenshot is the "what good looks like" reference.

### Wave 0 Gaps
- [ ] `samples/verify-stitch.js` — OPTIONAL — small Node helper that reads the generated PNG with `sharp(path).metadata()` and asserts width/height match the expected `viewportWidth*DSR × totalHeight*DSR`. The fixture's HTML in `samples/serve-smoke.js` produces a deterministic scrollHeight (computable: title 50px + .anim-target 50px + .io-target 40px + .hidden-by-test ~50px + spacer 2000px + lazy-img margin 100px + lazy-img 40px + footer ~50px ≈ 2380px; rendered scrollHeight may be ~2700px including default margins). Helper inspects the OUT-02 height claim hermetically.
- [ ] No new fixture files needed in `samples/` beyond the verify helper — `samples/smoke.yaml` and `samples/serve-smoke.js` are already adequate for Phase 5's hermetic verification (their content was extended in Phase 4 specifically to grow the fixture into a multi-viewport-height page, which is exactly what Phase 5 needs).
- [ ] CLI must NOT log per-frame progress in v0.1 (library code stays silent; production confirmation line modeled on `smoke screenshot written:` is enough). Phase 6 adds the spinner.

*(If Wave 0 is skipped: OUT-01 is still smoke-verifiable from the file's existence. OUT-02 height correctness can be verified manually by opening the resulting PNG in Preview and checking dimensions; or by a quick `node -e "require('sharp')('/tmp/framershot-smoke/home.png').metadata().then(console.log)"` invocation. OUT-03 mkdir is verified by running against a deeper output template than the smoke fixture's existing path. None of these require new fixture files.)*

## Security Domain

> `security_enforcement` not explicitly disabled — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 5 has no auth; same as Phases 3+4 |
| V3 Session Management | no | Ephemeral context per run |
| V4 Access Control | no | Personal CLI, no multi-user model |
| V5 Input Validation | yes (inherited) | The output template was validated + resolved by Phase 2 (CFG-03). Phase 5 consumes the resolved string verbatim — no further validation. |
| V6 Cryptography | no | No secrets, no crypto, no signing |
| V8 Data Protection | yes (minor) | Screenshots may contain rendered private data; written to user-specified output path. Trust boundary = user owns the YAML, user owns the disk. |
| V10 Malicious Code | no | Phase 5 doesn't execute new code paths in the browser; only inert read-and-screenshot calls. The IO shim and CSS injection are Phase 4's surface. |
| V11 Business Logic | no | n/a |
| V12 Files & Resources | yes | Phase 5 IS the file-writing tier — mkdir + writeFile to a user-controlled path |

### Known Threat Patterns for Output-Writing Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `..` in resolved output (e.g. user's YAML output is `./out/{page}.png` and `page.name` is `../../etc/sneaky`) | Tampering | Phase 2's slugify (`src/output/template.js:14-25`) strips `..` and other path-special characters from `{viewport}` and `{page}` substitutions. The template literal itself (e.g. `./screenshots/{date}/...`) is user-owned. Trust boundary: user wrote the template; user owns the output disk. Phase 5 doesn't re-validate. [MITIGATED at Phase 2] |
| Writing to a privileged path (e.g. `/etc/passwd`) | Tampering / DoS | Process runs as the invoking user; OS permission system applies. Personal tool, single-user. [ACCEPTED — OS boundary holds.] |
| Disk fill via enormous PNG | DoS (self-inflicted) | No size cap in v0.1. User initiated the capture. [ACCEPTED — see §Pitfall 10 and §Open Questions #8.] |
| Symlink attack at output path (mkdir resolves a hostile symlink) | Tampering | `mkdir({ recursive: true })` follows symlinks per Node's documented behavior. Personal tool; no malicious actor in this trust model. [ACCEPTED.] |
| Race condition on parallel runs writing the same output path | Tampering (self-inflicted) | v0.1 is single-run, single-page; no parallel-write surface. [N/A] |
| sharp libvips parsing a malicious PNG buffer | Tampering / RCE | PNG buffers come from Playwright's own screenshot output, not user-supplied content. The trust boundary is "if Playwright produced a malicious PNG, we have a bigger problem." libvips' PNG parser has had occasional CVEs but no current open advisories against 0.33.x's bundled version. [ACCEPTED — Playwright is the source.] |

### Notes
- Phase 5 is the first file-writing phase. The output path's safety is owned at the boundary by Phase 2's `resolveTemplate` (slugify of substitutions). Phase 5 trusts that boundary and does not re-validate.
- No new network calls.
- No new browser-context state.
- sharp's bundled libvips is the only native code Phase 5 introduces to the runtime — already vetted by Phase 1's accept-the-binary decision.

## Project Constraints (from PROJECT.md / no CLAUDE.md present)

No `./CLAUDE.md` file exists in the project root (confirmed by `ls /Users/sannagranqvist/Documents/App/screenshotter/CLAUDE.md` returning ENOENT). Constraints from `.planning/PROJECT.md` and locked decisions:

| Constraint | Source | How Phase 5 honors it |
|-----------|--------|------------------------|
| Tech stack locked — no new deps | PROJECT.md Constraints | Phase 5 imports only `playwright-chromium` + `sharp` + Node stdlib. Zero additions to package.json. |
| Chromium only | PROJECT.md Constraints | Inherited — Phase 5 doesn't touch the launcher's `chromium`-named import. |
| Headless default | PROJECT.md Constraints | Inherited — Phase 5 doesn't change launch options. |
| Personal tool, no polish | PROJECT.md Out of Scope | No chalk in capture modules; no progress UI; production output is a single confirmation log line in the CLI layer. Library code is silent. |
| Local only | PROJECT.md Constraints | No remote endpoints, no telemetry. File writes are local fs. |
| Single page/viewport in v0.1 | REQUIREMENTS.md v1 | One captureFullPage call per run. Multi-page is v0.2. |
| Manual stitch, NOT Playwright fullPage:true | PROJECT.md Key Decisions table | Phase 5 IS this decision's implementation. The phase gate `! grep -rq 'fullPage: true' src/` (from Phase 3 + 4) continues to hold. |
| Library shape — silent, no exit, no chalk/ora | All previous phases | Same posture in `src/capture/*`. |
| CLI lifecycle ownership | Phase 3 SUMMARY | `cli.js` owns try/finally; Phase 5 modules accept Page, output path, never close anything. |
| Zero new CLI flags | Phase 4 establishment | No `--full-page`, `--no-stitch`. The non-`--smoke` branch IS the production path. |

## What NOT To Do (re-stated for the planner)

1. **NO new dependencies.** Use only what Phase 1 installed. sharp 0.33.5 is the standard.
2. **NO new CLI flags.** The non-`--smoke` branch IS the new production path.
3. **NO new config schema keys.** Phase 2's schema is final.
4. **NO `page.screenshot({ fullPage: true })`** anywhere in `src/capture/*`. The whole point of Phase 5 is to avoid this.
5. **NO `behavior: 'smooth'`** in any `window.scrollTo` call. `'instant'` always.
6. **NO fixed `page.waitForTimeout(N)`** between scroll and screenshot. Use a single `requestAnimationFrame` roundtrip via `page.evaluate`.
7. **NO re-reading `scrollHeight`** inside the capture loop. Once, at the start.
8. **NO try/catch around Playwright or sharp calls in `src/capture/*`.** Let errors bubble; Phase 6 formats.
9. **NO logging in `src/capture/*`** — same library-shape posture as `src/browser/*` and `src/prepare/*`.
10. **NO `process.exit`, no chalk/ora, no `console.log`** in `src/capture/*`. The CLI emits a confirmation line; that's it for v0.1.
11. **NO re-running `runPreparePipeline`** or any `src/prepare/*` function inside `src/capture/*`. Phase 4 already prepared the page.
12. **NO closing the browser or context** inside `src/capture/*`. The CLI owns lifecycle.
13. **NO `mkdir({ recursive: true })` on the file path** — always on `dirname(outputPath)`.
14. **NO custom PNG byte manipulation.** sharp owns image manipulation; Phase 5 doesn't.
15. **NO temp-file write-then-rename.** Just writeFile.
16. **NO `omitBackground: true`** on screenshots. Default is correct.
17. **NO `scale: 'css'`** on screenshots. `'device'` (default) — defeats CAP-02 otherwise.
18. **NO new module location** — Phase 5 lives at `src/capture/`, matching the `src/browser/`, `src/config/`, `src/output/`, `src/prepare/` pattern.
19. **NO refactoring the `--smoke` branch** — it stays as Phase 3/4 left it.
20. **NO touching `src/output/template.js`** — Phase 2 owns templating. Phase 5 consumes the resolved string.

## Phase 5 Boundary

What Phase 5 produces:
- `src/capture/frames.js` exporting `captureFrames(page) → { frames: Buffer[], geometry }` — scroll-capture loop with overlap-last-frame strategy and rAF wait (OUT-01).
- `src/capture/stitch.js` exporting `stitchFrames(frames, geometry) → Buffer` — sharp composite of frames into one PNG at correct DSR-scaled dimensions (OUT-02).
- `src/capture/index.js` exporting `captureFullPage(page, outputPath) → void` — orchestrator that composes frames → stitch → mkdir + writeFile (OUT-03).
- `src/cli.js` modifications: one import (`import { captureFullPage } from './capture/index.js';`), replace the non-`--smoke` else-branch body with `await captureFullPage(navigatedPage, resolvedOutput);` + a confirmation `console.log`. Smoke branch untouched.
- (Optional, Wave 0) `samples/verify-stitch.js` — small helper that uses `sharp(path).metadata()` to assert OUT-02 height correctness.

What Phase 5 does **not** do:
- Touch Phase 4's prepare pipeline.
- Add CLI flags or schema keys.
- Re-validate the output template (Phase 2 owns it).
- Run prepare steps again.
- Close any Playwright handle.
- Print per-frame progress (Phase 6).
- Format errors (Phase 6).
- Multi-viewport / multi-page (v0.2).
- Region capture (v0.2).
- Diff mode (v0.3).
- Streaming-stitch (deferred — see §Open Questions #2).
- Temp files of any kind.

Phase 6 will then add the spinner output and formatted error messages on top of Phase 5's silent-library + thrown-errors surface.

## Sources

### Primary (HIGH confidence)
- `node_modules/playwright-core/types/types.d.ts` — Playwright 1.60.0 type definitions; read directly for `page.screenshot`, `PageScreenshotOptions` (lines 24256-24365), `clip` (lines 24276-24296), `scale` (lines 24338-24344), `animations` (lines 24258-24265), `type` (line 24364) [VERIFIED]
- `node_modules/sharp/lib/index.d.ts` — sharp 0.33.5 type definitions; read directly for `composite` (line 312-318), `OverlayOptions` (lines 1487-1510), `Create` (lines 943-955), `png()` (line 724), `toBuffer()` (line 631), `metadata()` (lines 333-342) [VERIFIED]
- `node_modules/playwright-chromium/package.json` — confirms playwright-chromium@1.60.0 installed [VERIFIED]
- `node_modules/sharp/package.json` — confirms sharp@0.33.5 installed; bundled libvips 8.x [VERIFIED via `node -e "console.log(require('sharp').versions)"`]
- Project source files (`src/cli.js`, `src/browser/launcher.js`, `src/browser/navigator.js`, `src/prepare/scroll.js`, `src/prepare/index.js`, `src/config/schema.js`, `src/output/template.js`, `samples/smoke.yaml`, `samples/serve-smoke.js`) — read directly to confirm interfaces, integration points, and lifecycle ownership [VERIFIED]
- Phase 4 RESEARCH.md + 04-PATTERNS.md — read in full to inherit shape, conventions, and the locked decisions established by Phase 4 [VERIFIED]

### Secondary (MEDIUM confidence — verified against primary)
- `npm view sharp version` → 0.34.5 (current); we pin to ^0.33 so 0.33.5 is what's installed [VERIFIED via direct npm query]
- sharp official docs at sharp.pixelplumbing.com (Lovell Fuller's project) — composite ordering semantics, Color background syntax [CITED]
- PlaywrightWeb's official screenshot docs (https://playwright.dev/docs/screenshots#capture-a-screenshot) — sticky-element behavior with fullPage:true is documented as a known limitation; matches the PROJECT.md decision rationale [CITED]

### Tertiary (LOW confidence — informational, not relied upon)
- Various Stack Overflow threads on Playwright fullPage + sticky elements — corroborate the locked decision but not primary source.
- libvips documentation — for sharp's internal layer; only consulted to confirm libvips supports very large composites (which it does up to 2GB image dimensions).

## Metadata

**Confidence breakdown:**
- Playwright API shapes (`screenshot.clip`, `scale`, `animations`, `type`): HIGH — direct types.d.ts inspection.
- sharp API shapes (`create`, `composite`, `png`, `toBuffer`, `metadata`): HIGH — direct types.d.ts inspection.
- Composite-order semantics for overlap-last-frame: HIGH — documented + the canonical use case for overlay arrays.
- CSS-pixel vs physical-pixel boundary: HIGH — Playwright's scale documentation is unambiguous.
- rAF-roundtrip sufficiency for layout-settle: MEDIUM-HIGH — widely used pattern, but may need a small fallback timeout for adversarial sites; v0.1 takes the bet.
- Phase 4's `scrollY=0` exit state: HIGH — verified by reading `src/prepare/scroll.js:58-60`.
- Last-frame overlap strategy correctness: HIGH — three independent strategies are mathematically equivalent; overlap is the simplest of them.
- Memory ceiling for v0.1: MEDIUM — typical pages fit comfortably; pathological pages may need v0.2 streaming work.
- `window.devicePixelRatio` equivalence to launcher `deviceScaleFactor`: HIGH — Playwright's launcher doc literally says "can be thought of as dpr."
- Phase 4's `hide` list as the sticky-handling boundary: HIGH — Phase 4 RESEARCH locks this and Phase 5 trusts the upstream contract.

**Research date:** 2026-05-22
**Valid until:** 2026-06-22 (30 days — Playwright 1.x is stable; sharp 0.33.x is stable; both expose the APIs Phase 5 needs without any signaled breaking changes in their roadmaps.)

## Locked-Stack Compliance Confirmation

Nothing in this research contradicts the locked stack or PROJECT.md constraints. Zero new dependencies are introduced (playwright-chromium 1.60.0 and sharp 0.33.5 are both already declared in `package.json` and installed in `node_modules/`). All architectural choices stay within the boundaries set by PROJECT.md (Chromium-only honored, local-only honored, headless-default honored, personal-tool ethos honored, single page/viewport scope honored, manual-stitch-not-fullPage:true honored as the headline implementation). No Phase 2 schema changes proposed. No Phase 3 lifecycle changes. No Phase 4 prepare changes. Phase 5 modifies exactly ONE existing file (`src/cli.js`'s else-branch body) and adds THREE new files under `src/capture/`. The phase gate `! grep -rq 'fullPage: true' src/` continues to hold — Phase 5 is, in fact, the phase that makes the gate meaningful.

## RESEARCH COMPLETE

**Recommended approach:** Build `src/capture/` as three files — `frames.js`, `stitch.js`, `index.js` — split cleanly along the layer boundary (frames.js = Playwright-only, stitch.js = sharp-only, index.js = orchestrator + fs/promises). The CLI imports only from `src/capture/index.js` and replaces its current placeholder `JSON.stringify` non-smoke branch with `await captureFullPage(navigatedPage, resolvedOutput)`. The scroll-capture loop reads `innerHeight`, `scrollHeight`, and `window.devicePixelRatio` ONCE at the start, then iterates `y = 0, vh, 2vh, …, (nFull-1)*vh`, scrolling with `behavior: 'instant'`, waiting ONE `requestAnimationFrame` roundtrip via `page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())))`, then `page.screenshot({ clip: { x: 0, y, width: vw, height: vh }, animations: 'disabled', scale: 'device', type: 'png' })`. When `scrollHeight % innerHeight !== 0`, a final frame is captured with `y` clamped to `scrollHeight - innerHeight` — this OVERLAPS the previous frame; sharp's composite-order guarantee (later overlays draw on top) makes the overlap resolve to the correct content (the last frame's pixels win). The stitcher creates a transparent RGBA canvas of `viewportWidth · DSR × totalHeight · DSR` physical pixels via `sharp({ create: { width, height, channels: 4, background: { r:0, g:0, b:0, alpha:0 } } })`, composites each frame at `top: y · DSR, left: 0`, encodes via `.png().toBuffer()`. The orchestrator writes the buffer via `fs/promises.writeFile(outputPath, buffer)` after `mkdir(dirname(outputPath), { recursive: true })`. Sticky-element correctness comes from Phase 4's `hide` list — Phase 5 does NOT re-implement sticky handling. Zero new dependencies, zero new CLI flags, zero new config keys; one import line and a four-line else-branch replacement in `src/cli.js`. Verification piggybacks on the existing `samples/serve-smoke.js` + `samples/smoke.yaml` fixture by running them WITHOUT `--smoke` and asserting the output PNG's existence and dimensions (a tiny optional `samples/verify-stitch.js` helper can do the metadata assertion).
