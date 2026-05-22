---
phase: 07-multi-viewport-capture
plan: 03
subsystem: cli
tags: [ora, sse, multi-viewport, adapter, event-stream, back-compat]

# Dependency graph
requires:
  - phase: 07-02
    provides: runCapture returns Array<{ outputPath, hideSummary, viewportName }>; launchBrowser(config, viewportEntry) two-arg signature; every onProgress event carries viewport: <name>
  - phase: 07-01
    provides: config.viewports[] normalized array; config.viewport. (singular) absent from all downstream code
provides:
  - CLI ora adapter consumes array return: spinner shows [<viewport>] prefix; one pipe-capturable stdout line per viewport
  - CLI --smoke branch reads config.viewports[0] (singular config.viewport. gone from cli.js)
  - Server SSE done-frame payload is outputs: [{ outputPath, urlPath, viewportName }, ...] (array shape)
affects:
  - 07-04 (smoke-multi fixture + plan-level E2E — adapters are ready for multi-viewport configs)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "spinner.text = `[${event.viewport}] ${label}` — bracket-prefixed viewport tag in ora spinner text"
    - "spinner.succeed(`N screenshot(s) written`) then for-of stdout loop — N pipe-capturable lines, one per viewport"
    - "results.map(({ outputPath, viewportName }) => ({ outputPath, urlPath, viewportName })) — SSE done-frame array mapping"

key-files:
  created: []
  modified:
    - src/cli.js
    - src/server/index.js

key-decisions:
  - "Spinner prefix format is [<viewport>] <label> (bracket-wrapped) — visually distinct from the step label; consistent across step and frame events"
  - "spinner.succeed shows count summary; console.log loop below emits per-viewport paths — separates human-visible summary (stderr) from machine-capturable data (stdout, §Pitfall 6)"
  - "outputs: [...] SSE done-frame shape chosen (not outputPath/urlPath flat object) — extensible for multi-viewport UI in a future phase without another breaking change"
  - "currentSpinner = null placed AFTER spinner.succeed and BEFORE the for-of stdout loop — matches the existing pattern and keeps the error-sink contract correct"

patterns-established:
  - "Dumb-adapter pattern confirmed: CLI and server contain zero per-viewport iteration logic; all viewport awareness flows through the event.viewport field injected by runCapture"

requirements-completed: [MULTI-01]

# Metrics
duration: 15min
completed: 2026-05-22
---

# Phase 7 Plan 03: CLI + Server Adapter Migration to Array Return Summary

**CLI ora adapter and server SSE adapter migrated to runCapture's array return: spinner gains [<viewport>] prefix, one stdout line per viewport, done-frame becomes outputs: [...] — v0.1 singular configs still pass end-to-end**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-22T20:00:00Z
- **Completed:** 2026-05-22T20:15:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Updated `src/cli.js` --smoke branch to read `config.viewports[0].name` (required, no fallback) and call `launchBrowser(config, config.viewports[0])` — singular `config.viewport.` fully removed from file
- Updated `src/cli.js` non-smoke branch: `const results = await runCapture(...)` with per-viewport `[<viewport>]` spinner prefix in onProgress; `spinner.succeed('N screenshot(s) written')` followed by one `console.log` per viewport
- Updated `src/server/index.js` `handleCapture` SSE pump to emit `{ type: 'done', outputs: [{ outputPath, urlPath, viewportName }, ...] }` — `outputPathToUrl`, `send`, and form-builder block unchanged
- v0.1 singular smoke fixture (`samples/smoke.yaml --smoke`): exit 0, one PNG produced
- v0.1 singular non-smoke fixture (`samples/smoke.yaml`): exit 0, exactly one `screenshot written:` stdout line
- Server SSE back-compat: POSTing singular-viewport UI form payload produces `done` frame with `outputs: [{...viewportName:"web"...}]`

## Task Commits

Each task was committed atomically:

1. **Task 1: Update src/cli.js — non-smoke array return + per-viewport spinner prefix; --smoke reads config.viewports[0]** - `02fd5da` (feat)
2. **Task 2: Update src/server/index.js — handleCapture SSE pump consumes array; done-frame becomes outputs: [...]** - `b8e5504` (feat)

## Files Created/Modified

- `src/cli.js` — Two surgical updates: --smoke reads `config.viewports[0].name` and calls `launchBrowser(config, config.viewports[0])`; non-smoke consumes `results` array, spinner text gains `[<viewport>]` prefix, success line shows count + per-viewport stdout loop
- `src/server/index.js` — One surgical update inside `handleCapture` try block: `const results = await runCapture(...)` + `send({ type: 'done', outputs: results.map(...) })`

## Decisions Made

- **Spinner prefix format `[<viewport>]`:** Bracket-wrapped name was the planner's suggested format and confirmed in PATTERNS.md. Consistent between `step` and `frame` event types. No change to `warning` sandwich (the sandwich resumes spinner after printing, so the prefix reappears naturally on next step/frame event).

- **`outputs: [...]` done-frame shape:** A flat `{ outputPath, urlPath }` object would be backward-compatible for the current UI (which doesn't render per-viewport data per D-05), but the array shape is more honest about the multi-viewport return and avoids another breaking change when the UI learns multi-viewport in a future phase. The UI currently ignores unknown SSE event fields — non-breaking.

- **`currentSpinner = null` placement:** Set after `spinner.succeed` (matches v0.1 pattern) and before the for-of stdout loop. The error-sink in `index.js` uses `getCurrentSpinner()?.fail()` — clearing before the loop means an unexpected throw inside the loop (e.g., `console.log` failing on a broken pipe) won't attempt `spinner.fail()` on an already-succeeded spinner. This matches the pre-existing pattern for the v0.1 single-outputPath case.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The fixture server (`serve-smoke.js`) was already running from a prior session when the smoke E2E ran — `EADDRINUSE` appeared but was harmless (the test captured against the already-running instance). Both smoke and non-smoke back-compat tests still exited 0 with correct output.

## Known Stubs

None.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes were introduced. All changes are in the adapter layer (CLI presentation + SSE serialization); the trust boundaries (POST body → configSchema.safeParse, /screenshots/* path-traversal guard) are unchanged.

## Self-Check

- [x] `src/cli.js` contains `config.viewports[0]` exactly 2 times
- [x] `src/cli.js` contains `launchBrowser(config, config.viewports[0])` exactly 1 time
- [x] `src/cli.js` contains `const results = await runCapture` exactly 1 time
- [x] `src/cli.js` contains `for (const { outputPath } of results)` exactly 1 time
- [x] Non-comment lines of `src/cli.js` contain 0 occurrences of `config.viewport.`
- [x] `src/server/index.js` contains `const results = await runCapture(parsed.data` exactly 1 time
- [x] `src/server/index.js` contains `outputs: results.map` exactly 1 time
- [x] `src/server/index.js` contains `viewport: body.viewport` exactly 1 time (form-builder unchanged)
- [x] `src/server/index.js` binds to `127.0.0.1` (1 match)
- [x] Commits `02fd5da` (Task 1) and `b8e5504` (Task 2) exist
- [x] v0.1 smoke: exit 0, `/tmp/framershot-smoke/home.png` exists — `v0.1 SMOKE BACK-COMPAT: ok`
- [x] v0.1 non-smoke: exit 0, exactly 1 `screenshot written:` stdout line — `v0.1 NON-SMOKE BACK-COMPAT: ok (1 line)`
- [x] Server SSE: done frame has `outputs:[{...viewportName:"web"...}]` — `SERVER BACK-COMPAT OK`

## Self-Check: PASSED

## Next Phase Readiness

- Both adapters are ready for multi-viewport configs. Plan 04 (smoke-multi fixture + E2E) can run the CLI against `samples/smoke-multi.yaml` and verify 2 stdout lines + 2 PNGs.
- The server SSE shape (`outputs: [...]`) is stable. Multi-viewport UI rendering is explicitly deferred per D-05 and can be implemented in a future phase without adapter changes.
- Zero `config.viewport.` (singular) references remain anywhere in the codebase outside comments.

---
*Phase: 07-multi-viewport-capture*
*Completed: 2026-05-22*
