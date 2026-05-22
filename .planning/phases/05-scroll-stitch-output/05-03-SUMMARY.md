---
phase: 05-scroll-stitch-output
plan: "03"
subsystem: capture
tags: [node, fs, sharp, playwright, orchestrator, cli, scroll-stitch, output]

# Dependency graph
requires:
  - phase: 05-scroll-stitch-output/05-01
    provides: captureFrames(page) → { frames, geometry } — scroll capture loop
  - phase: 05-scroll-stitch-output/05-02
    provides: stitchFrames(frames, geometry) → Promise<Buffer> — sharp composite
  - phase: 04-prepare-pipeline
    provides: Prepared Page handle (animations frozen, scroll-primed, selectors hidden)
  - phase: 02-config-schema
    provides: resolveTemplate output string (CFG-03 — {date}/{viewport}/{page} substituted)

provides:
  - "src/capture/index.js — captureFullPage(page, outputPath) → void (OUT-03 orchestrator + only fs-touching code in Phase 5)"
  - "src/cli.js (modified) — production else-branch now calls captureFullPage, emits 'screenshot written:' confirmation"

affects:
  - phase-06-terminal-ux (CLI-01 ora spinner will wrap the else-branch; CLI-02/03 will format errors + hideSummary warnings)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase 5 orchestrator barrel (src/capture/index.js) mirrors prepare/index.js: single import surface, library posture, errors bubble"
    - "Static top-of-file imports for node builtins in library modules (vs cli.js dynamic import Phase 3 quirk)"
    - "mkdir(dirname(outputPath), { recursive: true }) before writeFile(outputPath, buf) — sequential fs invariant"

key-files:
  created:
    - src/capture/index.js
  modified:
    - src/cli.js

key-decisions:
  - "captureFullPage is the sole import surface — CLI imports only from capture/index.js, never directly from frames.js or stitch.js"
  - "mkdir uses dirname(outputPath) not outputPath itself — prevents EISDIR when output path is a file path (Risk 11 / Pitfall 7)"
  - "Static imports in orchestrator — dynamic import is a cli.js Phase 3 quirk; library modules always use static top-of-file imports (Risk 12 inverse)"
  - "No new CLI flags in Phase 5 — --smoke remains the only option on the capture subcommand (Risk 13 inverse)"

# Metrics
duration: 5min
completed: 2026-05-22
---

# Phase 5 Plan 03: captureFullPage Orchestrator + CLI Wiring Summary

**Phase 5 orchestrator composes captureFrames → stitchFrames → mkdir(dirname) + writeFile; CLI else-branch replacement delivers the headline-feature trifecta: full-page PNG output per `framershot capture` invocation (OUT-01 + OUT-02 + OUT-03)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-22T13:07:24Z
- **Completed:** 2026-05-22T13:13:07Z
- **Tasks:** 2 of 2
- **Files modified:** 2 (1 new, 1 modified)

## Accomplishments

- Created `src/capture/index.js` — OUT-03 orchestrator. Four static top-of-file imports, one named export `captureFullPage(page, outputPath) → void`, three sequential awaits composing captureFrames → stitchFrames → mkdir(dirname) + writeFile
- Modified `src/cli.js` with exactly three surgical edits: one new import line, one else-branch body replacement, nothing else touched
- End-to-end PNG output verified against localhost 8-band 2400px page: 800×4800 PNG written at nested 3-dir-deep output path, confirming OUT-01 + OUT-02 + OUT-03 all satisfied through the orchestrator

## Exported API Surface

```javascript
// src/capture/index.js
export async function captureFullPage(
  page,       // import('playwright-chromium').Page — prepared by Phase 4
  outputPath  // string — resolved by Phase 2's resolveTemplate (CFG-03)
): Promise<void>

// Step sequence (verbatim):
// Step 1 — OUT-01: scroll + per-viewport screenshots → ordered PNG Buffers + geometry.
const { frames, geometry } = await captureFrames(page);

// Step 2 — OUT-02: sharp composite → one full-page PNG Buffer.
const pngBuffer = await stitchFrames(frames, geometry);

// Step 3 — OUT-03: mkdir parent + writeFile. Same fs/promises pattern
// cli.js:43-45 uses for the smoke screenshot's parent dir. mkdir on
// dirname, NOT outputPath itself (Risk 11, Pitfall 7).
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, pngBuffer);
```

Side effect: writes `outputPath` (PNG file) and creates intermediate directories. No return value.

## CLI Changes (src/cli.js — Three Surgical Edits)

**Edit 1 — Import added after line 6 (prepare/index.js import):**

```diff
+ import { captureFullPage } from './capture/index.js';
```

**Edit 2 — else-branch body replaced (was lines 48–62):**

Before:
```javascript
} else {
  // Phase 3 boundary: Phase 4 (prepare) and Phase 5 (capture loop)
  // will replace this branch. For now, confirm the page is up.
  console.log(
    JSON.stringify(
      {
        ...config,
        _resolvedOutput: resolvedOutput,
        _navigated: navigatedPage.url(),
      },
      null,
      2,
    ),
  );
}
```

After:
```javascript
} else {
  // Phase 5: full-page scroll-and-stitch capture writes the PNG.
  // captureFullPage owns the mkdir + writeFile internally — the CLI does
  // NOT need a parallel mkdir call (unlike the smoke branch which calls
  // page.screenshot({ path: ... }) directly without an orchestrator).
  await captureFullPage(navigatedPage, resolvedOutput);
  console.log(`screenshot written: ${resolvedOutput}`);
}
```

**Edit 3:** Everything else byte-identical — smoke branch, `console.time('prepare')` / `console.timeEnd('prepare')` at cli.js:32/36, `context.close()` before `browser.close()` lifecycle in finally, single `--smoke` option.

## Static Verification Gates (all passed)

```
dir-ok                  src/capture/ directory exists
file-ok                 src/capture/index.js exists
mkdir-import-ok         import { mkdir, writeFile } from 'node:fs/promises' (static)
dirname-import-ok       import { dirname } from 'node:path' (static)
captureFrames-import-ok import { captureFrames } from './frames.js' (static)
stitchFrames-import-ok  import { stitchFrames } from './stitch.js' (static)
import-count-ok         grep -cE '^[[:space:]]*import\s' = 4
export-ok               export async function captureFullPage present
captureFrames-call-ok   await captureFrames(page) with { frames, geometry } destructure
stitchFrames-call-ok    await stitchFrames(frames, geometry) with pngBuffer
mkdir-dirname-ok        mkdir(dirname(outputPath), { recursive: true })
recursive-ok            { recursive: true } present
writeFile-ok            writeFile(outputPath, pngBuffer)
no-dynamic-import-ok    ! grep -q "await import" src/capture/index.js (Risk 12 inverse)
no-prepare-ok           ! grep -q "prepare/" src/capture/index.js (Risk 4 inverse)
no-context-close-ok     ! grep -q "context.close" src/capture/index.js (Risk 5 inverse)
no-browser-close-ok     ! grep -q "browser.close" src/capture/index.js (Risk 5 inverse)
no-page-close-ok        ! grep -q "page.close" src/capture/index.js (Pitfall 12 inverse)
no-BrowserError-ok      ! grep -q "BrowserError" (Risk 2 inverse)
no-CaptureError-ok      ! grep -q "CaptureError" (Risk 2 inverse)
no-class-ok             ! grep -qE "class\s" (Anti-Patterns)
no-try-ok               ! grep -qE "try\s*\{" (Anti-Patterns line 579)
no-console-time-ok      ! grep -q "console.time" (04-PATTERNS Risk 13 stance)
no-perf-mark-ok         ! grep -q "performance.mark"
no-promise-all-ok       ! grep -q "Promise.all" (sequential mkdir-before-writeFile)
library-shape-ok        zero non-comment console.*/process.exit/chalk/ora
static-ok               node --input-type=module import resolves at load time

captureFullPage-import-ok   CLI: import { captureFullPage } from './capture/index.js'
captureFullPage-call-ok     CLI: await captureFullPage(navigatedPage, resolvedOutput)
confirmation-log-ok         CLI: console.log(`screenshot written: ${resolvedOutput}`)
smoke-log-preserved-ok      CLI: smoke screenshot written: (smoke branch unchanged)
no-JSON-stringify-ok        CLI: ! grep -q "JSON.stringify(" (placeholder gone)
smoke-branch-ok             CLI: if (opts.smoke) branch present
fullPage-false-ok           CLI: fullPage: false in smoke branch (unchanged)
no-fullPage-true-ok         CLI: ! grep -qE "fullPage:\s*true"
context-close-ok            CLI: context.close() in finally (Phase 3 invariant)
browser-close-ok            CLI: browser.close() in finally (Phase 3 invariant)
console-time-ok             CLI: console.time('prepare') preserved (Phase 4)
console-timeEnd-ok          CLI: console.timeEnd('prepare') preserved (Phase 4)
no-import-sharp-ok          CLI: ! grep -q "import sharp" (lives in stitch.js)
no-mkdir-writeFile-ok       CLI: ! grep -q "mkdir, writeFile" (lives in orchestrator)
no-full-page-flag-ok        CLI: ! .option('--full-page') (Risk 13 inverse)
no-no-stitch-flag-ok        CLI: ! .option('--no-stitch') (Risk 13 inverse)
no-quality-flag-ok          CLI: ! .option('--quality') (Risk 13 inverse)
option-count-ok             CLI: .option( count = 1 (Risk 13 inverse)
no-fullpage-true-project-ok ! grep -rq "fullPage: true" src/ (project-wide gate)
cli-shape-ok                buildProgram() → capture cmd with exactly 1 option (--smoke)
deps-ok                     package.json dependency count = 7 (no new deps)
```

## End-to-End PNG Output Assertion

**Fixture:** 8-band HTML page, each band 300px tall = 2400px total page height. Colors: #e63946, #f1faee, #a8dadc, #457b9d, #1d3557, #06d6a0, #118ab2, #073b4c.

**Config:** `baseUrl: http://127.0.0.1:<port>`, `deviceScaleFactor: 2`, `viewport: { width: 400, height: 300 }`, `output: /tmp/.../sub1/sub2/sub3/out.png`.

**Command:** `node index.js capture <config.yaml>` (non-smoke branch).

**Results:**
- Exit code: 0
- stdout: `screenshot written: /tmp/.../sub1/sub2/sub3/out.png`
- File exists at 3-dir-deep output path: PASS (recursive parent-dir creation — OUT-03 SC #4)
- PNG magic bytes: `89 50 4E 47 0D 0A 1A 0A` — valid PNG
- Canvas dimensions: width=800 (400 × DSR 2), height=4800 (2400 × DSR 2) — correct full-page scroll-stitch math
- Chain proven: captureFrames (OUT-01) → stitchFrames (OUT-02) → mkdir(dirname) + writeFile (OUT-03)

## Risk Checklist

| Risk | Disposition | Verification |
|------|-------------|--------------|
| Risk 1: fullPage: true regression | Avoided | ! grep -rq "fullPage: true" src/ passes project-wide |
| Risk 2: CaptureError class | Avoided | no-CaptureError-ok, no-class-ok |
| Risk 3: chalk/ora/console.log in library | Avoided | library-shape-ok (zero non-comment matches) |
| Risk 4: re-running prepare inside captureFullPage | Avoided | no-prepare-ok (! grep -q "prepare/") |
| Risk 5: closing context/browser inside captureFullPage | Avoided | no-context-close-ok, no-browser-close-ok |
| Risk 11: mkdir(outputPath) instead of mkdir(dirname(outputPath)) | Avoided | mkdir-dirname-ok (grep confirms dirname() wrap) |
| Risk 12: dynamic import drift | Avoided | no-dynamic-import-ok; all four imports are static |
| Risk 13: adding new CLI flag | Avoided | option-count-ok (count=1), no-full-page/no-stitch/quality flags absent |
| Pitfall 7: EISDIR from mkdir on file path | Avoided | same as Risk 11 |
| Pitfall 9: smoke + production collapse | Avoided | smoke branch byte-identical, fullPage: false preserved |
| Pitfall 11: re-running prepare | Avoided | same as Risk 4 |
| Pitfall 12: closing lifecycle in library | Avoided | same as Risk 5 |

## Decisions Made

- **captureFullPage is the sole CLI import surface** — CLI does not import captureFrames or stitchFrames directly; they are encapsulated behind the orchestrator
- **mkdir uses dirname(outputPath)** — `mkdir('foo.png', { recursive })` would create a DIRECTORY named foo.png causing EISDIR on writeFile; dirname() extracts the parent directory path
- **Static imports throughout** — the cli.js dynamic `await import('node:fs/promises')` is a Phase 3 workaround; library modules under src/ always use static top-of-file imports

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Accidental commit to `main` branch**
- **Found during:** Task 1 commit
- **Issue:** The task_commit_protocol used `cd /Users/sannagranqvist/Documents/App/screenshotter` (the main repo) for verification, then committed there. The `src/capture/index.js` file was written to the main repo's working tree and committed to `main`.
- **Fix:** Used `git reset --soft HEAD~1` on `main` to undo the commit without losing file content, unstaged the file, copied it to the worktree's working tree (`/Users/sannagranqvist/Documents/App/screenshotter/.claude/worktrees/agent-a288c06d805302c8c/src/capture/`), and committed on the correct `worktree-agent-a288c06d805302c8c` branch. The main repo was restored to `c8fd856` (pre-deviation HEAD).
- **Files modified:** No net additional changes; the same content landed in the right place
- **Commit:** `f24903b` (on worktree branch)

## Note for Phase 6 (Terminal UX)

- Production confirmation log is `console.log(\`screenshot written: ${resolvedOutput}\`)` — Phase 6 will replace this with an ora-spinner-friendly final message (CLI-01/CLI-02)
- `hideSummary.missed` from `runPreparePipeline` is still ignored in Phase 5; Phase 6's CLI-03 work will surface it as a warning
- Errors from captureFullPage (Playwright timeout, sharp libvips, fs ENOSPC/EISDIR) all bubble through cli.js's outer try/finally — Phase 6 will format them with field/URL/path context

## Phase 5 Retrospective

All three OUT-* requirements are now satisfied end-to-end:
- **OUT-01** — captureFrames: scroll loop with pre-computed frameYOffsets, rAF wait, clip viewport (05-01)
- **OUT-02** — stitchFrames: sharp composite, Math.round pixel coords, overlap-and-trust-composite (05-02)
- **OUT-03** — captureFullPage + CLI wiring: mkdir(dirname) + writeFile, recursive parent-dir creation, confirmation log (this plan)

The headline-feature trifecta is complete: Phase 3 browser navigation + Phase 4 prepare pipeline + Phase 5 scroll-stitch produces ONE working full-page PNG per `framershot capture` invocation. Next phase: Phase 6 (Terminal UX — ora progress, actionable errors).

## Task Commits

1. **Task 1: Implement src/capture/index.js** — `f24903b` (feat)
2. **Task 2: Wire captureFullPage into src/cli.js** — `0aa996f` (feat)

## Files Created/Modified

- `src/capture/index.js` — captureFullPage(page, outputPath) → void; 4 static imports; 3 sequential awaits; library posture
- `src/cli.js` — 1 import added; else-branch body replaced (7 lines added, 13 removed); everything else unchanged

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns beyond what the plan's threat model documents. The orchestrator writes to `outputPath` (a local filesystem path resolved by Phase 2's resolveTemplate). No new trust boundaries introduced.

## Known Stubs

None — `captureFullPage` writes a real PNG file. No placeholder data.

## Self-Check: PASSED

- `src/capture/index.js` exists: FOUND
- `src/cli.js` modified: FOUND
- Commit `f24903b` exists: FOUND
- Commit `0aa996f` exists: FOUND
- All 43 static checks: PASSED
- End-to-end runtime: PASSED (800x4800 PNG at nested 3-dir-deep path)

---
*Phase: 05-scroll-stitch-output*
*Completed: 2026-05-22*
