---
phase: 06-terminal-ux
plan: 02
subsystem: cli
tags: [chalk, ora, error-handling, terminal-ux, dispatcher]

# Dependency graph
requires:
  - phase: 06-01
    provides: makeProgress, printSelectorWarnings, getCurrentSpinner, currentSpinner module-level ref in src/cli.js
  - phase: 02-01
    provides: ConfigError class with pre-formatted multi-line message from formatZodError
  - phase: 03-01
    provides: BrowserError class with URL-bearing message and optional cause field

provides:
  - formatError(err) dispatcher in src/cli/format.js — routes ConfigError / BrowserError / TimeoutError / default to user-facing strings with chalk.red prefix
  - index.js top-level catch now calls formatError + conditionally spinner.fail() before process.exit(1)
  - CLI-03 test fixtures bad-viewport-width.yaml and bad-baseurl.yaml for hermetic smoke assertions

affects: [06-VALIDATION, any future plan that extends error dispatch categories]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "formatError pure-function dispatcher: instanceof dispatch → chalk.red prefix only on 'Error:' label, body in default color (no wall-of-red §Pitfall 3)"
    - "Single error sink: only index.js top-level catch calls console.error / process.exit — library modules throw, CLI formats and exits"
    - "Spinner.fail() guard: isSpinning check before fail() prevents cosmetic double-fail on already-stopped spinners"

key-files:
  created:
    - samples/bad-viewport-width.yaml
    - samples/bad-baseurl.yaml
  modified:
    - src/cli/format.js
    - index.js

key-decisions:
  - "formatError dispatch order: non-Error guard first, then ConfigError, BrowserError, bare TimeoutError, default — matches §Pattern 3 exactly"
  - "chalk.red on 'Error:' prefix ONLY — body of ConfigError/BrowserError message stays default color (§Pitfall 3 anti-pattern avoided)"
  - "Bad-baseurl fixture uses nonexistent.example.tld (.tld is not a real TLD) not example.com — guarantees ERR_NAME_NOT_RESOLVED vs TimeoutError"
  - "formatError is pure (no I/O) — caller does console.error(formatError(err)); single-sink design maintained"

patterns-established:
  - "Pattern: dispatcher returns string, caller prints — keeps formatError testable without mocking console"
  - "Pattern: fixtures are single-field deviations from smoke.yaml — all other fields valid so failure surfaces in the target layer only"

requirements-completed: [CLI-03]

# Metrics
duration: 18min
completed: 2026-05-22
---

# Phase 06 Plan 02: formatError Dispatcher + index.js Catch Rewire Summary

**`formatError` dispatcher wired into index.js single-sink catch: ConfigError prints zod-formatted field errors, BrowserError prints URL-bearing navigation message, bare TimeoutError prints "Operation timed out", unexpected errors print dimmed stack trace — all with chalk.red "Error:" prefix and exit code 1.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-05-22T13:54:00Z
- **Completed:** 2026-05-22T14:12:10Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Authored two CLI-03 hermetic fixtures (`bad-viewport-width.yaml` triggers ConfigError via zod invalid_type; `bad-baseurl.yaml` triggers BrowserError via DNS failure to `nonexistent.example.tld`)
- Appended `formatError(err)` to `src/cli/format.js` with four-branch dispatch (ConfigError → BrowserError → bare TimeoutError → default+dim-stack), defensive non-Error guard, pure function contract
- Rewired `index.js` top-level catch to call `getCurrentSpinner()?.fail()` conditionally, then `console.error(formatError(err))`, then `process.exit(1)` — single sink pattern, spinner gracefully failed before error prints

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 fixtures bad-viewport-width + bad-baseurl** - `0c21973` (feat)
2. **Task 2: formatError dispatcher appended to src/cli/format.js** - `6c25860` (feat)
3. **Task 3: index.js catch rewire** - `811bc0a` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `samples/bad-viewport-width.yaml` - CLI-03 ConfigError fixture: viewport.width as string "800" triggers zod invalid_type → formatZodError → ConfigError dispatch
- `samples/bad-baseurl.yaml` - CLI-03 BrowserError fixture: baseUrl https://nonexistent.example.tld triggers DNS failure → BrowserError dispatch
- `src/cli/format.js` - formatError(err) appended; two new imports (ConfigError, BrowserError) added at top; existing makeProgress + printSelectorWarnings unchanged
- `index.js` - Top-level catch rewired: getCurrentSpinner + formatError imports, spinner.fail() guard, console.error(formatError(err)), process.exit(1)

## Decisions Made

- Dispatch order matches §Pattern 3 exactly: non-Error guard → ConfigError → BrowserError → bare TimeoutError → default. This order ensures the most specific checks (concrete error subclasses) run before the generic name-based check.
- `chalk.red` applied to the `'Error:'` prefix string only — body of ConfigError/BrowserError messages is default color. Avoids the §Pitfall 3 wall-of-red anti-pattern that made zod field lists illegible.
- `nonexistent.example.tld` chosen over `example.com`/`example.org` because `.tld` is an unregistered TLD that reliably triggers `ERR_NAME_NOT_RESOLVED` rather than a network timeout.
- `formatError` is a pure function returning a string — the caller (`index.js`) does `console.error(formatError(err))`. This keeps the formatter testable and the single-sink design intact.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. All three smoke variants (ConfigError, BrowserError, happy-path regression) passed on first run after Task 3 implementation.

## Plan-Level Verification Results

All four checks from the plan `<verification>` block passed:

1. **4-variant smoke suite:**
   - Happy path (`--smoke`): exits 0, prints `smoke screenshot written`, prints `⚠` selector warning — PASS
   - ConfigError (`bad-viewport-width.yaml`): exits 1, stderr contains `viewport.width: expected number, got string` — PASS
   - BrowserError (`bad-baseurl.yaml`): exits 1, stderr contains `nonexistent.example.tld` — PASS

2. **Silent-library posture (Invariant 3):** `grep -rE "^import .*(chalk|ora)" src/browser/ src/prepare/ src/capture/ src/config/ src/output/ | wc -l` → 0 — PASS

3. **Single-sink invariant (Invariant 4):**
   - Actual `process.exit` calls: 1 (index.js:10) — PASS
   - Actual `console.error` calls: 1 (index.js:9) — PASS
   - `console.warn` in `printSelectorWarnings` is the intentional warning-printer exception — OK

4. **No raw zod dump:** `node index.js capture samples/bad-viewport-width.yaml 2>&1 | grep -E '\[.*invalid_type' | wc -l` → 0 — PASS

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 06 (terminal-ux) is complete. Both plans (06-01 spinner/warnings + 06-02 formatError/catch) have been executed and verified. The CLI now has:
- Progressive spinner feedback for all 7 capture steps (CLI-02)
- Actionable error messages for all error categories with correct chalk coloring (CLI-03)
- Single error sink — all failures route through `index.js` catch → `formatError` → `console.error` → `process.exit(1)`

Ready for `/gsd:verify-phase 06` or `/gsd:plan-phase 07`.

---
*Phase: 06-terminal-ux*
*Completed: 2026-05-22*

## Self-Check: PASSED

- `samples/bad-viewport-width.yaml`: EXISTS, viewport.width is string "800" (CONFIRMED)
- `samples/bad-baseurl.yaml`: EXISTS, baseUrl is https://nonexistent.example.tld (CONFIRMED)
- `src/cli/format.js`: EXISTS, exports formatError (CONFIRMED via node -e test)
- `index.js`: EXISTS, imports getCurrentSpinner + formatError (CONFIRMED via grep)
- Commit `0c21973`: EXISTS (fixtures)
- Commit `6c25860`: EXISTS (formatError)
- Commit `811bc0a`: EXISTS (index.js rewire)
- All acceptance criteria from all 3 tasks: PASSED
- Plan-level verification block (4-variant smoke + 2 invariant greps): PASSED
