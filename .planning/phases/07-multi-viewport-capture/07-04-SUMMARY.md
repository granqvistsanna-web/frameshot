---
phase: 07-multi-viewport-capture
plan: 04
subsystem: testing
tags: [smoke-fixture, multi-viewport, hermetic, yaml, back-compat]

# Dependency graph
requires:
  - phase: 07-02
    provides: runCapture per-viewport loop; launchBrowser(config, viewportEntry); per-viewport prepare pipeline isolation
  - phase: 07-03
    provides: CLI ora adapter with `[<viewport>]` spinner prefix; one stdout line per viewport; SSE outputs:[...] done frame
provides:
  - samples/smoke-multi.yaml — 2-viewport hermetic smoke fixture (desktop 800×600, mobile 375×667) targeting samples/serve-smoke.js
  - End-to-end evidence for ROADMAP success criteria #2 ({viewport} placeholder → distinct paths) and #5 (2-viewport run → 2 PNGs)
  - Per-viewport prepare-pipeline isolation confirmation (`.does-not-exist` warning fires twice — once per viewport)
affects:
  - 08 (region capture — same hermetic fixture pattern; samples/smoke-regions.yaml will model on this two-fixture approach)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-fixture pattern: samples/smoke.yaml (singular, v0.1 back-compat) coexists with samples/smoke-multi.yaml (plural, v0.2 multi-viewport) — neither mutates the other"
    - "/{viewport}/ path segment in output template is the canonical 'distinct paths' guarantee"
    - "/tmp/<fixture-name>/ output convention keeps repo clean — no .gitignore work needed"

key-files:
  created:
    - samples/smoke-multi.yaml
  modified: []

key-decisions:
  - "Two fixtures, not one mutated fixture — keeps singular-shape coverage intact (CONTEXT.md 'Locked behavior')"
  - "Same fixture server (samples/serve-smoke.js, 127.0.0.1:7357) for both fixtures — no new server, no network dependency"
  - "Intentional `.does-not-exist` hide selector kept — exercises per-viewport warning-event path; firing twice proves per-viewport prepare-pipeline isolation"
  - "deviceScaleFactor stays top-level (D-04) — per-viewport DSR deferred to a future phase"

patterns-established:
  - "Hermetic fixture pattern extended cleanly to multi-viewport — no schema, server, or pipeline changes beyond what Plans 01-03 delivered"

requirements-completed: [MULTI-01]

# Metrics
duration: 5min
completed: 2026-05-24
---

# Phase 7 Plan 04: samples/smoke-multi.yaml Hermetic 2-Viewport Fixture Summary

**Hermetic 2-viewport smoke fixture (desktop 800×600 + mobile 375×667) produces 2 distinct PNGs end-to-end against samples/serve-smoke.js — `samples/smoke.yaml` untouched, v0.1 back-compat verified**

## Performance

- **Duration:** ~5 min (Task 1 commit) + human checkpoint approval
- **Started:** 2026-05-22T (Task 1 commit `3eaf249`)
- **Completed:** 2026-05-24 (human checkpoint approved)
- **Tasks:** 2 (1 auto + 1 human-verify checkpoint)
- **Files modified:** 1 created

## Accomplishments

- New `samples/smoke-multi.yaml` fixture: 2 viewports (`desktop` 800×600, `mobile` 375×667), `{viewport}` placeholder in output template, same hermetic fixture server as `samples/smoke.yaml`
- End-to-end hermetic 2-viewport capture produces exactly 2 PNGs at distinct paths: `/tmp/framershot-smoke-multi/desktop/home.png` (1600×4886 raster) and `/tmp/framershot-smoke-multi/mobile/home.png` (750×4998 raster)
- Per-viewport prepare-pipeline isolation confirmed: `.does-not-exist` warning fires twice (once per viewport)
- Per-viewport spinner prefix confirmed: `[desktop] Running prepare pipeline` then `[mobile] Running prepare pipeline`
- v0.1 back-compat verified: `samples/smoke.yaml --smoke` still exits 0 and produces `/tmp/framershot-smoke/home.png`
- `samples/smoke.yaml` is bit-identical to HEAD (`git diff --quiet` returns 0)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create samples/smoke-multi.yaml — 2 viewports, {viewport} in output template** — `3eaf249` (feat)
2. **Task 2: Human-verify checkpoint — eyeball PNGs, confirm per-viewport isolation** — Approved 2026-05-24 (no commit; checkpoint-only)

## Files Created/Modified

- `samples/smoke-multi.yaml` — Hermetic 2-viewport fixture modeled on `samples/smoke.yaml` with `viewports:` array and `/{viewport}/` path segment in the output template

## Decisions Made

- **Two fixtures over one mutated fixture:** `samples/smoke.yaml` is the v0.1 back-compat evidence (ROADMAP success criterion #4); mutating it would forfeit that coverage. CONTEXT.md "Locked behavior" pre-committed to the two-fixture pattern.
- **Same fixture server for both fixtures:** `samples/serve-smoke.js` is reentrant and state-free; reusing it avoids a second port allocation and keeps the hermetic pattern uniform.
- **Intentional `.does-not-exist` hide selector retained:** Firing twice per capture run is the cheapest possible per-viewport prepare-pipeline isolation check — confirms each viewport runs its own prepare pipeline rather than sharing state.
- **`deviceScaleFactor` stays top-level (D-04):** Per-viewport DSR is a future-phase concern; this fixture validates the array-of-viewports shape, not the DSR-per-viewport shape.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Surface Scan

No new network endpoints, file access patterns, or schema changes. The fixture is static YAML committed by the developer, targets a hermetic localhost server, and writes only to `/tmp/`. No new trust boundary added.

## Self-Check

- [x] `samples/smoke-multi.yaml` exists and validates (`loadConfig` returns 2-entry `viewports[]` with names `desktop`/`mobile`)
- [x] `samples/smoke.yaml` is bit-identical to HEAD (`git diff --quiet -- samples/smoke.yaml` returns 0)
- [x] Hermetic 2-viewport capture exits 0
- [x] `/tmp/framershot-smoke-multi/desktop/home.png` exists, raster width 1600 (800 × DSR 2)
- [x] `/tmp/framershot-smoke-multi/mobile/home.png` exists, raster width 750 (375 × DSR 2)
- [x] Exactly 2 `screenshot written:` stdout lines (one per viewport)
- [x] `.does-not-exist` warning fires twice — per-viewport prepare-pipeline isolation confirmed
- [x] Per-viewport spinner prefix `[desktop]` / `[mobile]` present in stderr
- [x] v0.1 `samples/smoke.yaml --smoke` back-compat: exit 0, `/tmp/framershot-smoke/home.png` produced
- [x] Human visual checkpoint approved (PNGs proportionally correct, `.hidden-by-test` hidden in both, full page height covered)

## Self-Check: PASSED

## Next Phase Readiness

- All Phase 7 success criteria (1-5) satisfied; Phase 7 is COMPLETE
- Hermetic fixture pattern extended cleanly — Phase 8 can model `samples/smoke-regions.yaml` on the same two-fixture approach
- No outstanding stubs, no v0.1 regressions, no schema/server churn carried into Phase 8

---
*Phase: 07-multi-viewport-capture*
*Completed: 2026-05-24*
