---
phase: 02-cli-config
plan: "03"
subsystem: output
tags: [template, path-resolution, slugify, esm, pure-function]

# Dependency graph
requires: []
provides:
  - "resolveTemplate(template, {date, viewport, page}) pure ESM function in src/output/template.js"
  - "slugify helper that lowercases and collapses unsafe chars to dashes, preserving ., -, _"
affects:
  - 02-01  # capture action handler will wire loadConfig + resolveTemplate
  - phase-05  # output writer reuses resolveTemplate for real file paths

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure zero-dependency ESM module pattern: no imports, single named export, fully deterministic"
    - "Caller-computes-date pattern: function accepts pre-formatted YYYY-MM-DD string so no new Date() inside"
    - "Unknown-placeholder-literal pattern: unrecognised {tokens} pass through verbatim to surface typos visibly"
    - "Slugify-internal pattern: viewport/page are slugified inside resolveTemplate, not by callers, preventing drift"

key-files:
  created:
    - src/output/template.js
  modified: []

key-decisions:
  - "date is a string parameter (not Date object) — keeps function pure and deterministic for testing and Phase 5 reuse"
  - "viewport and page are slugified internally (not by callers) — prevents drift between 02-01 and Phase 5"
  - "unknown placeholders left literal — erroring would require an allowlist that grows with v0.2 features; literal pass-through surfaces typos visibly"
  - "template path separators (/) are not slugified — the config author wrote them; trust is appropriate for a personal tool"

patterns-established:
  - "Pure ESM module: zero imports, one named export, zero side effects — reusable across phases without coupling"
  - "slugify regex /[^a-zA-Z0-9._-]+/g: linear, no ReDoS risk, preserves dots/hyphens/underscores"

requirements-completed:
  - CFG-03

# Metrics
duration: 2min
completed: 2026-05-20
---

# Phase 02 Plan 03: Template Resolver Summary

**Pure `resolveTemplate` ESM function that substitutes `{date}`, `{viewport}`, `{page}` placeholders with slugified values, leaving unknown placeholders literal**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-20T05:06:26Z
- **Completed:** 2026-05-20T05:08:35Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `src/output/template.js` as a zero-dependency pure ESM module — no imports, single named export `resolveTemplate`
- Implemented slugify helper that lowercases values and collapses unsafe character runs to `-` while preserving `.`, `-`, `_`
- All six acceptance criteria pass: basic substitution, slug case (spaces/parens), unknown placeholder literal pass-through, no-placeholder template, preserved separators (dots and hyphens), and determinism

## Task Commits

1. **Task 1: Implement resolveTemplate as a pure ESM function with slugification** - `e928120` (feat)

## Files Created/Modified

- `src/output/template.js` - Pure resolveTemplate function: three sequential .replaceAll() calls, slugify helper, zero dependencies

## Decisions Made

- date is passed as a pre-formatted string (YYYY-MM-DD) rather than computed internally — keeps the function deterministic and testable; callers use `new Date().toISOString().slice(0, 10)` to stay locale-invariant
- Unknown placeholders (e.g. `{foo}`, `{Date}` wrong case) are left literal rather than throwing — surfaces typos visibly in output paths without blocking the run; an allowlist would need to grow as v0.2 adds new placeholder tokens
- Three sequential `.replaceAll()` calls rather than a regex callback — simpler, matches the RESEARCH.md §Pattern 4 documented form exactly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `resolveTemplate` is ready for 02-01 (wave 2) to wire alongside `loadConfig` to satisfy ROADMAP SC #1 and SC #3
- Phase 5 output writer can `import { resolveTemplate } from './output/template.js'` as-is
- No blockers

---
*Phase: 02-cli-config*
*Completed: 2026-05-20*

## Self-Check: PASSED

- `src/output/template.js` exists: FOUND
- Commit `e928120` exists: FOUND
- Zero imports: VERIFIED (`grep -c '^import'` returns 0)
- Named export `resolveTemplate`: VERIFIED
- All six acceptance criteria: PASSED
