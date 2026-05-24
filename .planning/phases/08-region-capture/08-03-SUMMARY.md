---
phase: 08-region-capture
plan: 03
subsystem: capture
tags: [runCapture, region-loop, only-filter, resolveRegions, seam, orchestration, fail-fast]

# Dependency graph
requires:
  - phase: 08-region-capture
    plan: 01
    provides: regionSchema + root regions: field (defaulted to undefined when omitted); root cross-field refinements (duplicate-name, {region}-in-output)
  - phase: 08-region-capture
    plan: 02
    provides: src/capture/region.js exports captureRegion + RegionError; src/output/template.js resolveTemplate accepts region arg with literal fallback
  - phase: 07-multi-viewport-capture
    plan: 02
    provides: per-viewport for-loop body in runCapture (the structure Wave 3 nests into); array-with-viewportName return shape; per-viewport try/finally lifecycle
provides:
  - runCapture(config, { onProgress, only }) — opts now includes only: string | undefined
  - resolveRegions(regions, only) — module-private helper; not exported; lives in runCapture.js
  - Nested per-viewport × per-region cartesian-product loop with Open Q#1 lock A behavior (regions + no --only = N regions + 1 full-page per viewport)
  - Upfront --only validation throwing RegionError BEFORE any Chromium launch
  - Per-region onProgress events wrapped with viewport: vp.name scoping
  - Results array entries gain optional regionName field on region-capture entries; full-page entries omit it
affects: [08-04 CLI --only flag + format.js Guard 4 + smoke-regions fixture (end-to-end consumer of this orchestration), future v0.2 features needing per-region knobs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Upfront fail-fast --only validation via resolveRegions call BEFORE the viewport for-loop — RegionError fires without launching any browser process"
    - "Per-iteration resolveRegions recomputation — avoids closing over a loop-local variable; defends against (forbidden but free-to-defend-against) cross-iteration config.regions mutation by hypothetical future caller"
    - "Open Q#1 lock A — when regions declared AND --only is unset, capture BOTH the regions AND the full-page per viewport (== regions.length + 1 results per viewport)"
    - "Per-region onProgress wrapping — spread event + inject viewport: vp.name, mirrors Phase 7's per-viewport scoping pattern for frame events"
    - "Optional-field extension on Phase 7's array contract — regionName: string | undefined gates per-entry; existing readers of outputPath/viewportName continue to work unchanged"

key-files:
  created:
    - samples/verify-runcapture-regions.js (NEW — hermetic verifier for runCapture's region-loop shape + fail-fast --only validation; doubles as standing regression check)
  modified:
    - src/capture/runCapture.js (+ resolveRegions helper, + only opt, + nested region branch inside viewport loop, + JSDoc updates; per-viewport try/finally + lifecycle ordering UNCHANGED)

key-decisions:
  - "resolveRegions LIVES IN runCapture.js (not hoisted to region.js) — planner's spec respected. Rationale: the --only-filter validation is purely an orchestration-layer concern (CLI flag plumbing). region.js owns per-region capture mechanics. Cohesion: runCapture.js owns BOTH the upfront fail-fast call AND the per-iteration call. Module-private (not exported)."
  - "resolveRegions called TWICE: once upfront (discard return; pure fail-fast) and once per viewport iteration (use return as `targets`). The upfront call's primary purpose is to throw on unknown --only BEFORE any Chromium launches. Per-iteration call's return is cheap (linear scan of <= regions.length); recomputing avoids closing over `targets` outside the loop scope and stays trivially correct if a future caller mutates config.regions across iterations."
  - "Open Q#1 lock A implemented as a tail-emit inside the FALSE branch (targets.length > 0). Trigger gate: `only === undefined && config.regions !== undefined`. The `config.regions !== undefined` check is necessary because targets.length > 0 alone can also be reached via --only (single-element targets array), and in that branch we MUST skip full-page."
  - "Phase 8 plan was silent on the architectural concerns surfaced in Wave 2 SUMMARY (clip viewport-bounded; boundingBox viewport-relative). Both concerns live in src/capture/region.js, NOT in runCapture.js. Wave 3's `files_modified` frontmatter scope is `src/capture/runCapture.js` only, AND Wave 2's plan locked `fullPage: true` and `omitBackground` to count=0 in region.js (verified by the existing samples/verify-region-capture.js static grep). Conservative call: do NOT modify region.js from Wave 3 — that would break Wave 2's locked invariants and bypass the documented Plan 04 hand-off. Instead, flag both concerns prominently in this SUMMARY's `Architectural Concerns Deferred to Plan 04` section so Plan 04's planner explicitly addresses them before the end-to-end fixture lands. Wave 3's verifier is hermetic and single-viewport, so neither concern manifests in Wave 3's GREEN gate."
  - "RUNCAPTURE_PATH constant + readFile-based source-text grep in the verifier (instead of subprocess `grep` invocations). Pure Node, no shell — keeps the verifier portable and parseable by future eyes. The `stripComments` helper removes // line-comments and /* */ block-comments before counting active-code occurrences, mirroring 08-02-PLAN.md's approach where module-header text was rewritten specifically to avoid grep false positives."

patterns-established:
  - "Upfront-validation-then-loop seam pattern: when a CLI/external flag must be validated against post-load config state, perform the validation OUTSIDE the per-iteration loop body BEFORE any side-effecting operations (browser launch, file write, network call). Use a helper that throws a typed domain error so the validation can fire from multiple call sites with identical semantics."
  - "Optional-field protocol extension on array-shaped returns: when extending a function's return-shape with new variant-specific fields, ADD optional fields (e.g. regionName?: string) rather than introducing a discriminated-union or splitting into two parallel arrays. Existing readers of the always-present fields continue to work; new readers branch on `entry.regionName !== undefined`."
  - "Verifier-script-as-test for silent-library projects (carry-forward from Plans 08-01 + 08-02): hermetic verifier script lives in samples/, invoked manually + at wave boundaries. The script IS the test; RED commit checks in a failing version, GREEN commit makes it pass."

requirements-completed: []
# REGION-01/02/03 are NOT marked complete here. Wave 3 establishes the
# orchestration shape and the upfront-validation contract; end-to-end
# region capture against a live Playwright page (proving the cartesian
# product, the regions+full-page lock A behavior, and the per-region
# event scoping all work in concert against a real DOM) is gated by
# Plan 04's hermetic smoke fixture per the plan's <verification> contract.

# Metrics
duration: ~25min
completed: 2026-05-24
---

# Phase 08 Plan 03: runCapture Region Loop Summary

**Wave 3 lockup — `runCapture(config, { onProgress, only })` now branches between full-page capture (Phase 7 back-compat) and Phase 8 region capture INSIDE the existing per-viewport loop. `resolveRegions` validates --only upfront (throws RegionError before any Chromium launch); per-iteration recomputation feeds the inner loop. Open Q#1 lock A: regions declared + no --only = N region PNGs + 1 full-page PNG per viewport. Two architectural concerns from Wave 2 SUMMARY explicitly deferred to Plan 04 (out of scope for this plan's files_modified).**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-24T12:54:00Z (worktree spawn + fast-forward merge from main)
- **Completed:** 2026-05-24T13:00:30Z (post-GREEN commit, pre-SUMMARY)
- **Tasks:** 1 (TDD — RED commit + GREEN commit)
- **Files modified:** 1 (`src/capture/runCapture.js` — +126 lines, -9 lines)
- **Files created:** 1 (`samples/verify-runcapture-regions.js` — 217 lines)

## Accomplishments

- `src/capture/runCapture.js` extends Phase 7's per-viewport loop body with the Phase 8 region branch — no new outer loop, no new lifecycle code
- `runCapture(config, { onProgress, only })` accepts the new `only: string | undefined` destructured option; default is `undefined` matching "CLI flag absent"
- `runCapture.length` is still `1` — destructured opts don't count toward declared arity; existing callers (cli.js, server/index.js, smoke branch) need ZERO migration
- Module-private `resolveRegions(regions, only)` helper added (top-level function, NOT exported). Returns: `[]` (no filter, no regions), `[match]` (--only matched), or `regions ?? []` (no filter, regions present). Throws `RegionError` with declared-names list when --only set but no match
- Upfront `resolveRegions(config.regions, only)` call BEFORE the per-viewport `for` loop — fail-fast on unknown --only without launching any Chromium process. Validated by the verifier's elapsed-time bound (<1000ms for the throw path)
- Inside the per-viewport iteration: branch on `targets.length === 0`:
  - **TRUE** (no regions declared AND no --only): identical to Phase 7's call shape — emit step event, `captureFullPage`, push single result with no `regionName`
  - **FALSE** (regions to capture): for-loop over targets; per-region `resolveTemplate({...,region:region.name})` for distinct paths; `captureRegion` invocation with onProgress wrapper injecting `viewport: vp.name`; push result with `regionName: region.name`. AFTER the for-loop, Open Q#1 lock A tail-emit: when `only === undefined && config.regions !== undefined`, ALSO run `captureFullPage` and push the full-page result
- Per-viewport `try/finally` lifecycle UNCHANGED — `context.close()` BEFORE `browser.close()` (06-RESEARCH §Pitfall 5 invariant preserved). Inner region for-loop throws bubble through the try/finally, closing context+browser before propagating
- `config.regions` is NEVER mutated — `resolveRegions` returns a NEW array via `.find()` result, so multi-viewport runs see the same declared region list per iteration (T-08-07 mitigation from plan's threat register)
- Presentation-free contract preserved — runCapture stays `console.*`-free, `chalk`/`ora`-free, `process.exit`-free (the file's own header comment block contract upheld)
- JSDoc updated: new `@param opts.only`, extended event-shape doc for region capture's `{ type: 'step', viewport, label: "Capturing region '<name>'" }`, new `regionName?` field in `@returns` type annotation

## Task Commits

This is a single-task TDD plan; the RED→GREEN cycle is recorded below:

1. **Task 1 (RED): Failing runCapture region-loop verifier** — `9261209` (test)
2. **Task 1 (GREEN): nested region loop + --only filter + resolveRegions helper** — `43dd7bb` (feat)

**Plan metadata:** (this SUMMARY commit — see git log)

## Files Created/Modified

### Created

- `samples/verify-runcapture-regions.js` (NEW, 217 lines) — Hermetic verifier asserting every `<behavior>` bullet from `08-03-PLAN.md` Task 1. Pure Node (no subprocess `grep`; uses `readFile` + comment-stripped substring counts). Covers:
  - Source-shape contract: import line for `captureRegion` + `RegionError`; `function resolveRegions` decl (count=1); `export async function runCapture`; opts destructure `only } = {}` (count=1); `captureRegion(navigatedPage` call site (count=1); `region: region.name` template arg (count=1); `regionName: region.name` results.push (count=1); `resolveRegions(config.regions, only)` (count=2, upfront + per-iteration)
  - Presentation-free invariants: `console.` count=0, `process.exit` count=0, `'chalk'`/`'ora'` imports count=0 (all after comment-strip to avoid false positives)
  - Config-mutation anti-pattern absence: regex `config\.regions\s*=` returns no match
  - Module import surface: dynamic `import('../src/capture/runCapture.js')` succeeds; `runCapture` is a function with `runCapture.length === 1`; `RegionError` is importable from `region.js`
  - Live --only validation: `--only=nonexistent` with declared regions throws `RegionError` containing `Unknown --only region 'nonexistent'` AND the declared name `'hero'`; elapsed time <1000ms (proves no browser launch happened on the way to the throw)
  - Live --only validation edge: `--only=anything` with `regions: undefined` throws `RegionError` containing the `<no regions declared>` sentinel

### Modified

- `src/capture/runCapture.js` — surgical extension of Phase 7's body:
  1. Imports: added `import { captureRegion, RegionError } from './region.js'`
  2. Module-level helper: added `function resolveRegions(regions, only)` between imports and the `runCapture` export, with full JSDoc covering return shapes and RegionError throw conditions
  3. Header comment: added a Phase 8 comment block under the existing "Errors bubble" line documenting the branching rule (no regions/no only → full-page; regions declared/no only → N+1; --only matched → 1-only) and the per-region onProgress wrapping
  4. `runCapture` signature: destructure changed from `{ onProgress = () => {} } = {}` to `{ onProgress = () => {}, only } = {}` (default for `only` is `undefined` matching "flag absent")
  5. Body: added upfront `resolveRegions(config.regions, only);` statement (discard return) before the `for (const vp of config.viewports)` loop — fail-fast validation
  6. Inside the viewport loop body, AFTER `runPreparePipeline` + the optional hide-summary warning emit: REPLACED the single `captureFullPage` + `results.push` block with the Phase 8 branch (computes `targets = resolveRegions(...)`; branches on `targets.length === 0` for TRUE-Phase-7-path vs FALSE-region-path; the FALSE path includes the Open Q#1 lock A tail-emit guarded by `only === undefined && config.regions !== undefined`)
  7. JSDoc: extended `@param opts.onProgress` with the new event shape; added `@param opts.only` doc; extended `@returns` type annotation with optional `regionName?: string`
  8. `try/finally` block: BYTE-IDENTICAL to Phase 7. `context.close()` before `browser.close()` preserved verbatim.

## Decisions Made

The plan explicitly enumerated decision surfaces. Choices made during execution:

- **`resolveRegions` lives in `runCapture.js`** (planner's spec respected). The plan's `<interfaces>` section explicitly noted the alternative (colocating in `region.js`) and chose runCapture.js for cohesion with the orchestration-layer --only-filter validation. region.js owns capture mechanics; runCapture.js owns CLI flag plumbing. Module-private (not exported) — the verifier exercises it indirectly via the live --only validation tests.
- **Two `resolveRegions` calls (upfront + per-iteration), not one.** The upfront call's primary purpose is fail-fast: throw on unknown --only BEFORE any Chromium launch. Per-iteration call's purpose is producing the `targets` array for the branch. The plan's `<action>` step 4 explicitly noted "Discard the return value at this position — the per-viewport iteration will recompute it (cheap, and avoids closing over a variable that's only needed inside the loop)." This is also future-proof against a hypothetical caller that mutates `config.regions` between iterations (which is forbidden by the anti-pattern register, but free to defend against here).
- **Open Q#1 lock A tail-emit lives INSIDE the FALSE branch** (after the regions for-loop), gated by `only === undefined && config.regions !== undefined`. The `config.regions !== undefined` check is necessary: `targets.length > 0` alone is also reached via `--only` (single-element targets array), and in that case we MUST skip full-page (the whole point of --only). The plan's `<interfaces>` "Phase 8 region branch" code block documents this exact guard.
- **Verifier uses pure-Node source-text grep** (`readFile` + comment-stripped `indexOf`-loop counter), NOT subprocess `grep` invocations. Rationale: portability (no shell dependency), grep-flag compatibility variance (BSD vs GNU), and parseability by future readers. The plan's `<verify><automated>` block uses shell grep, but the same semantics translate cleanly to Node — the verifier's `assertContainsCount` helper provides identical count-of-occurrences semantics with better error messages.
- **`stripComments` step before counting `console.`/`process.exit`/`'chalk'`/`'ora'`** — matches 08-02-PLAN's approach (the Wave 2 SUMMARY documented that module-header text was specifically rewritten to avoid these false positives). For Wave 3 the verifier handles this in the test instead of asking the source to contort its docs — both approaches are valid; the verifier-side handling is more robust to future doc additions.
- **Did NOT modify `src/capture/region.js`** to address the two architectural concerns from Wave 2 SUMMARY. Rationale documented in detail below under `Architectural Concerns Deferred to Plan 04` — short version: out of scope for Plan 03's `files_modified` frontmatter, and would violate Wave 2's locked `fullPage: true` count=0 invariant.

## Deviations from Plan

Plan executed exactly as written for the in-scope file (`src/capture/runCapture.js`). One out-of-scope architectural concern was deliberately deferred per the rationale in `Architectural Concerns Deferred to Plan 04` below.

### None — code-behavior deviations

No Rule 1 / Rule 2 / Rule 3 / Rule 4 deviations. The plan's `<interfaces>` "Phase 8 region branch" code block was followed verbatim modulo trivial formatting.

## Architectural Concerns Deferred to Plan 04

The orchestrator's worktree instructions flagged two architectural concerns from Wave 2's SUMMARY that surfaced during Plan 02 verifier development. Both are real, both affect end-to-end region capture correctness, and both live in `src/capture/region.js` (Wave 2's territory), NOT in `src/capture/runCapture.js` (Wave 3's territory).

After analysis, Wave 3 **explicitly defers both concerns to Plan 04's re-planning** with the rationale documented below. The most conservative correct option (per the orchestrator's "don't ship a broken clip path" guidance) is to NOT modify region.js from Wave 3, because:

1. **Plan 03's `files_modified` frontmatter scopes to `src/capture/runCapture.js` only.** Modifying region.js would violate the plan's contract and bypass the deliberate plan boundary planners drew between Waves 2 and 4.
2. **Wave 2's plan (08-02-PLAN.md lines 219-220, 251, 398) explicitly locks `fullPage: true` count=0 AND `omitBackground` count=0 in `src/capture/region.js`, enforced by `samples/verify-region-capture.js` static greps.** A region.js fix that adds `fullPage: true` would either break Wave 2's verifier (CAPTURE OK gate) or require a coordinated update to both region.js AND verify-region-capture.js. That coordinated change belongs in a re-planning cycle, not an opportunistic Wave-3 fix.
3. **Wave 3's verifier (`verify-runcapture-regions.js`) is hermetic and single-viewport-bounded** — neither concern manifests in Wave 3's GREEN gate. Wave 3 verifies the orchestration shape and the upfront-validation contract; the cross-viewport region-capture failure mode is exclusively a Plan 04 fixture concern.
4. **Wave 2's SUMMARY already provides recommendation specifics for Plan 03/04 planning** (08-02-SUMMARY.md lines 259-265). Surfacing the concerns here ensures Plan 04 planning addresses them BEFORE the end-to-end fixture lands.

### Concern 1 — `page.screenshot({ clip })` is viewport-bounded, not document-bounded

- **Symptom:** Playwright's `page.screenshot({ clip: {x,y,width,height} })` silently truncates the captured region to the visible viewport when the clip extends beyond the viewport's height. Example from Wave 2: `clip: { width: 800, height: 1500 }` on an 800×600 viewport produces a 1600×1200 PNG (viewport size × dsr), NOT a 1600×3000 PNG (clip size × dsr).
- **Impact on this plan (Wave 3):** None — Wave 3's verifier doesn't perform live region capture; it only validates orchestration shape and the upfront fail-fast --only path. The two RegionError throw cases in the verifier complete before any browser launches.
- **Impact on Plan 04:** Anchor regions spanning more than one viewport-height will silently produce truncated PNGs. Selector regions where the element + padding exceeds viewport height will also truncate.
- **Wave 2's recommended resolution path** (08-02-SUMMARY.md line 261): (a) lift `fullPage: true` prohibition for region mode only (trade-off: regions with sticky elements may ghost; the typical Framer use case has sticky elements as global navs/CTAs which the `hide:` block already handles), (b) implement a manual scroll-and-stitch loop for tall regions (mirror Phase 5's `frames.js` but clipped horizontally), or (c) document the limitation and reject tall-region configs at schema time. Wave 2 recommended option (a) for v0.2.
- **Action for Plan 04 planner:** Re-plan Plan 04 to include either a `src/capture/region.js` fix (option a or b) BEFORE the smoke-regions fixture, OR a schema-time tall-region rejection (option c). If option (a) is chosen, `samples/verify-region-capture.js` must be updated to allow `fullPage: true` AND the new behavior must be re-verified end-to-end. Decision belongs at planning time, not at Wave-3 execution time.

### Concern 2 — `boundingBox()` returns viewport-relative coordinates, not document-relative

- **Symptom:** Playwright's `locator.boundingBox()` returns coordinates relative to the current viewport's scroll position. The Wave 2 RESEARCH.md (line 304, Assumption A7) explicitly hedged on this — "Playwright docs say 'the x coordinate of the element in pixels' without qualifier" — but Wave 2's verifier development confirmed coordinates are VIEWPORT-relative, not document-relative as the RESEARCH had assumed.
- **Impact on this plan (Wave 3):** None — runCapture never directly reads `boundingBox()`; it composes with `captureRegion` which does.
- **Impact on Plan 04:** Anchor-mode union math is incorrect when the two anchors are at different scroll positions after `scrollIntoViewIfNeeded` fires twice. The first anchor's bbox is in scroll-position-1 space; the second's is in scroll-position-2 space; unioning them produces wrong coordinates.
- **Wave 2's recommended resolution path** (08-02-SUMMARY.md line 263): normalize bboxes to document space at measurement time by adding `window.scrollY` (and `window.scrollX`) — captured inside `clampToDocument`'s page.evaluate. Keeps the union math correct without changing the call shape.
- **Action for Plan 04 planner:** Re-plan Plan 04 to include a `src/capture/region.js` fix that normalizes both anchor bboxes to document space BEFORE the union math. The fix is small (~5 lines: read scrollY/scrollX in the existing `page.evaluate`; adjust bbox.x/y at measurement time) but it MUST land before the smoke-regions fixture proves anchor capture works against a tall page. `samples/verify-region-capture.js` should be extended with a cross-viewport anchor fixture once the fix is in.

## Issues Encountered

- **Worktree was at a very old commit at session start.** Worktree HEAD was `339629c` (phase 02 plans added) while `main` was `8dfcdee` (phase 08 Wave 2 merged). The plan and source files referenced in `<files_to_read>` did not exist in the worktree's commit. Resolved by `git fetch /Users/sannagranqvist/Documents/App/screenshotter main` + `git merge --ff-only FETCH_HEAD` from inside the worktree — fast-forward only (no risk, no divergence). Post-merge, all referenced files were readable and the plan executed against the intended baseline. (Same pattern as 08-01 and 08-02 hit; same resolution.)

- **Initial concern about Wave 2 architectural issues** (clip viewport-bounded; boundingBox viewport-relative). The orchestrator's worktree spawn instructions flagged these explicitly and asked: "Resolve these per the plan's design (it should already account for them in the runCapture orchestration). If the plan's design is silent, flag it as a deviation in SUMMARY and pick the most conservative correct option (don't ship a broken clip path)." After cross-referencing Plan 03's `files_modified` frontmatter scope (runCapture.js only), Plan 02's locked `fullPage: true` count=0 invariant (enforced by verify-region-capture.js), and Wave 2 SUMMARY's explicit deferral language ("Two architectural concerns ... should be addressed by Plan 03/04 planning BEFORE Plan 04's end-to-end fixture lands"), the conservative correct option was determined to be: do NOT modify region.js from Wave 3 (would break Wave 2's verifier AND bypass the deliberate plan boundary), and instead document both concerns prominently in this SUMMARY's `Architectural Concerns Deferred to Plan 04` section above. Wave 3's verifier is hermetic and single-viewport, so neither concern manifests in Wave 3's GREEN gate — the broken-clip-path risk is gated to Plan 04's end-to-end fixture, where the planner can address it within scope.

## Acceptance Criteria Audit

All 13 acceptance criteria from `08-03-PLAN.md` lines 283-298 confirmed:

| # | Criterion | Result |
|---|-----------|--------|
| 1 | `src/capture/runCapture.js` imports `captureRegion` AND `RegionError` from `'./region.js'` (one import statement, both names) | ✓ one import line, both names |
| 2 | `src/capture/runCapture.js` contains a `function resolveRegions` declaration (count = 1) | ✓ count = 1 |
| 3 | The runCapture opts destructure includes `only` (matches `only } = {}`) | ✓ count = 1 |
| 4 | `resolveRegions(config.regions, only)` appears exactly TWICE (upfront + per-iteration) | ✓ count = 2 |
| 5 | `captureRegion(navigatedPage, ...` appears exactly once (inside the region for-loop) | ✓ count = 1 |
| 6 | `region: region.name` appears in the resolveTemplate call once | ✓ count = 1 |
| 7 | `regionName: region.name` appears in the results.push call once | ✓ count = 1 |
| 8 | Non-comment lines contain zero `console.*` calls, zero `process.exit` calls, zero `chalk`/`ora` imports | ✓ all counts = 0 (after comment-strip) |
| 9 | No `config.regions = ...` assignment (config-mutation anti-pattern avoided) | ✓ regex test fails to find |
| 10 | Module imports cleanly: `node -e "import('./src/capture/runCapture.js')"` does not throw | ✓ verified via dynamic import in verifier |
| 11 | `--only=nonexistent` test: throws `RegionError` whose `.message` contains `Unknown --only region 'nonexistent'` AND lists `'hero'` | ✓ confirmed; elapsed <1000ms (no browser launch) |
| 12 | `--only=anything` with no `regions:` declared: throws `RegionError` whose message contains `<no regions declared>` | ✓ confirmed; elapsed <1000ms |
| 13 | Verify script prints `RUNCAPTURE OK` with exit 0 | ✓ confirmed |

Plan-level success criteria (lines 344-355):

| # | Criterion | Result |
|---|-----------|--------|
| 1 | `runCapture` accepts a new `only` option, defaulting to `undefined` | ✓ |
| 2 | `resolveRegions` helper exists in `src/capture/runCapture.js` (not exported; orchestration-internal) | ✓ |
| 3 | The region branch nests INSIDE the existing per-viewport loop; full-page branch unchanged when no regions declared AND no --only filter | ✓ (smoke.yaml --smoke regression passes) |
| 4 | When regions are declared AND `--only` is unset: per viewport, captures all regions PLUS a full-page (Open Q#1 lock A) | ✓ (orchestration shape — end-to-end gated by Plan 04 fixture) |
| 5 | When `--only=<name>` matches a declared region: per viewport, captures ONLY that region; full-page skipped | ✓ (orchestration shape) |
| 6 | Unknown `--only` name throws `RegionError` BEFORE any Chromium launch (upfront validation) | ✓ (verifier confirms <1000ms throw) |
| 7 | Per-region `onProgress` events are wrapped to include `viewport: vp.name` | ✓ (spread + viewport injection in the call site) |
| 8 | Results array entries gain optional `regionName` on region entries; full-page entries omit it | ✓ |
| 9 | ZERO presentation code added (no console.*, no chalk/ora, no process.exit) | ✓ |
| 10 | `config.regions` is never mutated | ✓ |
| 11 | The Task 1 verify script passes with exit 0 | ✓ |

Cross-cutting back-compat verifications (informational per plan's `<verification>`):

| # | Check | Result |
|---|-------|--------|
| 1 | `samples/verify-region-schema.js` (Wave 1) still passes | ✓ `SCHEMA OK` exit 0 |
| 2 | `samples/verify-template-region.js` (Wave 2) still passes | ✓ `TEMPLATE OK` exit 0 |
| 3 | `samples/smoke.yaml --smoke` (v0.1 back-compat) | ✓ exit 0; `/tmp/framershot-smoke/home.png` produced (32659 bytes) |
| 4 | `samples/smoke-multi.yaml` (Phase 7 multi-viewport back-compat) | ✓ exit 0; 2 PNGs produced (desktop/home.png + mobile/home.png) |

## TDD Gate Compliance

Task 1 executed RED → GREEN cycle with separate commits:

- Task 1 RED: `9261209` (test commit — failing verifier checked in; failed at first src-text assertion)
- Task 1 GREEN: `43dd7bb` (feat commit — runCapture.js modifications make the verifier pass)

No REFACTOR commit — implementation landed in its final shape on first GREEN attempt.

## Self-Check: PASSED

- `samples/verify-runcapture-regions.js` exists ✓ (217 lines)
- `src/capture/runCapture.js` modified (contains `import { captureRegion, RegionError }`, `function resolveRegions`, `only } = {}`, region branch, JSDoc updates) ✓
- Commit `9261209` (RED test) present in git log ✓
- Commit `43dd7bb` (GREEN feat) present in git log ✓
- Wave 1 + Wave 2 + Wave 3 verifiers all exit 0 (`SCHEMA OK` + `TEMPLATE OK` + `RUNCAPTURE OK`) ✓
- v0.1 back-compat smoke (`samples/smoke.yaml --smoke`) exits 0 ✓
- Phase 7 multi-viewport smoke (`samples/smoke-multi.yaml`) exits 0; 2 PNGs produced ✓
- No `git stash` usage ✓
- No modifications to `.planning/STATE.md` or `.planning/ROADMAP.md` ✓
- HEAD on `worktree-agent-a0539274afe474d78` branch throughout ✓
- Per-viewport `try/finally` lifecycle byte-identical to Phase 7 ✓

## User Setup Required

None — runCapture changes are pure library code; no external services, env vars, or dashboard configuration involved. End-to-end region capture against a real Framer site is gated by Plan 04's CLI wiring + smoke-regions fixture.

## Next Phase Readiness

**Plan 08-04 (next wave)** can begin, with the explicit caveat that BOTH architectural concerns from Wave 2 SUMMARY (deferred above to this section) MUST be addressed in Plan 04's planning pass BEFORE the end-to-end smoke-regions fixture lands. Specifically:

- **Concern 1 (clip viewport-bounded):** Plan 04 planner must decide between Wave 2's recommended options (a/b/c) and either modify `src/capture/region.js` accordingly OR add a schema-time tall-region rejection. If option (a) is chosen (lift `fullPage: true` prohibition for region mode), `samples/verify-region-capture.js`'s static grep MUST also be updated, AND `src/capture/region.js`'s header comments documenting the prohibition must be revised.
- **Concern 2 (boundingBox viewport-relative):** Plan 04 planner must add a `src/capture/region.js` fix that normalizes anchor bboxes to document space BEFORE the union math. The fix is small (~5 lines: extend `clampToDocument`'s `page.evaluate` to also return `window.scrollY` and `window.scrollX`; adjust bbox at measurement time in `captureAnchorRegion`). `samples/verify-region-capture.js` should add a cross-viewport anchor fixture to exercise the fix.

Once those two region.js fixes land, Plan 04's CLI + smoke-regions fixture work proceeds against an end-to-end-correct foundation. The Wave 3 orchestration this plan delivered is correct in shape and unaffected by either fix — runCapture composes with captureRegion via the function-call boundary; internal captureRegion changes don't touch runCapture's branching logic.

The Wave 3 seam is locked. Plan 04's CLI wiring can:
- `import { runCapture } from './capture/runCapture.js'`
- Pass `only: opts.only` through the existing `commander` option
- Consume the array-with-optional-regionName return shape (label per-result lines with `r.regionName ? "region '<name>'" : 'full page'`)
- Catch `RegionError` from `runCapture` (both the upfront `--only` validation throw AND any in-flight `captureRegion` throws) and dispatch via the new `formatError` Guard 4

## Threat Flags

None new in Plan 03's scope. The Phase 8 Wave 3 changes:
- Add no new network surface (runCapture is pure orchestration)
- Add no new auth path
- Add no new file-access pattern beyond the existing `captureFullPage` and `captureRegion` writes (both wave-2-validated)
- Add no schema change at any trust boundary (schema is Wave 1's territory)

The plan's `<threat_model>` register entries are all mitigated as documented:
- **T-08-07** (Tampering — shared config.regions across viewport iterations): mitigated by `resolveRegions` returning a NEW array via `.find()`; verified by the `config\.regions\s*=` regex returning no match in source
- **T-08-08** (Denial of Service — unknown --only causes wasted work): mitigated by the upfront `resolveRegions(config.regions, only)` call BEFORE the viewport loop; verified by the verifier's elapsed-time bound (<1000ms for both throw cases, proving no browser launch happened)
- **T-08-09** (Tampering — per-region path overwrite collision): mitigated upstream by Plan 01's schema enforcing `{region}` placeholder in `output` when `regions:` is declared; runCapture inherits this via `resolveTemplate(...,{region: region.name})` producing distinct paths per iteration

---
*Phase: 08-region-capture*
*Completed: 2026-05-24*
