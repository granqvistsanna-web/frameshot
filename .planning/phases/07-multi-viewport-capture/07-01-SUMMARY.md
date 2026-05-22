---
phase: 07-multi-viewport-capture
plan: 01
subsystem: config
tags: [zod, schema-validation, normalization, config, yaml]

# Dependency graph
requires:
  - phase: 02-cli-config
    provides: configSchema, formatZodError, loadConfig, ConfigError (the zod validation + YAML loading stack this plan extends)
  - phase: 06-terminal-ux
    provides: formatError dispatcher pattern (no new error types per D-05 locked-behavior)
provides:
  - viewportEntrySchema (name required, v0.2 plural entry shape)
  - viewportsSchema (array 1+, duplicate-name enforcement via superRefine)
  - Extended configSchema with mutual-exclusivity refinement + singular→plural normalize transform
  - loadConfig returns normalized shape: config.viewports[] always; config.viewport never present
affects:
  - 07-02 (runCapture + launcher — reads config.viewports[] from this boundary)
  - 07-03 (cli + server wiring — consumes the normalized plural shape)
  - 07-04 (fixtures — smoke-multi.yaml uses viewports: [...] which this schema validates)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "superRefine for controlled path+message on duplicate-name arrays (zod 3)"
    - "root-level .transform() for input normalization — schema boundary absorbs v0.1→v0.2 shape change"
    - "mutual-exclusivity via superRefine + boolean presence checks on optional fields"

key-files:
  created: []
  modified:
    - src/config/schema.js
    - src/config/load.js

key-decisions:
  - "Normalization chosen as zod .transform() on the root schema (not a step 5 in loadConfig) — keeps the loader code-frozen and the normalization visible inside the schema itself"
  - "superRefine used for duplicate-name check (not .refine) to control path and message precisely — formatZodError catch-all renders `viewports: duplicate name '<dup>'`"
  - "viewportSchema (singular, name optional) kept — the v0.1 input alias still flows through it before normalization"
  - "Singular viewport.name falls back to 'default' matching existing runCapture.js:36 + cli.js:46 behavior"

patterns-established:
  - "zod .superRefine with ctx.addIssue and custom path for array-level validation messages"
  - "root schema .superRefine → .transform chain for input normalization"

requirements-completed: [MULTI-01]

# Metrics
duration: 12min
completed: 2026-05-22
---

# Phase 7 Plan 01: Schema + Loader — Normalized viewports[] Boundary Summary

**Zod schema extended with mutual-exclusivity refinement and singular→plural normalize transform so all downstream code reads config.viewports[] only — never config.viewport**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-22T19:12:00Z
- **Completed:** 2026-05-22T19:24:19Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Extended `src/config/schema.js` with `viewportEntrySchema` (name required), `viewportsSchema` (1+, duplicate-name check), and a root superRefine+transform that enforces `viewport` XOR `viewports` and normalizes singular → one-element array
- Both v0.1-shaped configs (`samples/smoke.yaml`, `samples/sample.yaml`) still load successfully — back-compat preserved
- Duplicate-name validation surfaces as `viewports: duplicate name 'desktop'` through the existing `formatZodError` catch-all (no changes to that function)
- `src/config/load.js` is code-frozen — normalization lives entirely inside the zod schema; JSDoc updated to document the normalized output contract

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend schema with viewportEntrySchema, viewportsSchema, mutual-exclusivity + normalize** - `8df91ec` (feat)
2. **Task 2: Update loadConfig JSDoc + verify back-compat at loader boundary** - `683a9f0` (docs)

## Files Created/Modified

- `src/config/schema.js` — Added `viewportEntrySchema` (name required), `viewportsSchema` (array 1+, duplicate-name superRefine), restructured root to `baseConfigSchema` with optional viewport/viewports, added root superRefine (mutual exclusivity) chained with `.transform()` (singular→plural normalize). Updated `ResolvedConfig` typedef comment.
- `src/config/load.js` — JSDoc-only update to `loadConfig` documenting the normalized output shape (v0.1 singular input absorbed at schema boundary).

## Decisions Made

- **Normalize inside zod .transform() (not step 5 in loadConfig):** CONTEXT.md Integration Points left this to the planner. Chose the schema's `.transform()` so the loader stays code-frozen and both the refine logic and normalize logic live in one place (`schema.js`). Step 4 in `loadConfig` (`configSchema.safeParse(parsed).data`) already carries the normalized shape.

- **superRefine for duplicate-name check:** Used `.superRefine(arr, ctx)` (not `.refine()`) because `superRefine` allows `ctx.addIssue({ code, path, message })` with a controlled `path: ['viewports']` — this is what makes `formatZodError`'s catch-all render `viewports: duplicate name 'desktop'` instead of a generic message. `.refine()` would have attached the issue to the array's root path, not to `viewports`.

- **Integration point:** The normalize transform is the schema boundary. This matches D-01 from CONTEXT.md: "Every downstream consumer sees `config.viewports[]` only — zero branching outside the schema/loader."

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — the zod 3 `.superRefine` + `.transform()` chain worked on the first attempt. The worktree was at an older git state (branched from commit `339629c`), so source files had to be checked out from `main` before implementation; this is standard worktree setup and not an issue with the plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Schema boundary is locked. All downstream consumers (runCapture, launcher, cli, server) can read `config.viewports[]` directly — no branching on the old `viewport` key needed anywhere in the codebase.
- Wave 2 (Plan 07-02: runCapture + launcher loop) can proceed: the normalized `config.viewports[]` shape is available and schema-enforced.
- `formatZodError` is unchanged — existing error formatting contract holds for all new failure modes.

---
*Phase: 07-multi-viewport-capture*
*Completed: 2026-05-22*
