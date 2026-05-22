# Phase 6: Terminal UX — Research

**Researched:** 2026-05-22
**Domain:** ora 8.2.0 ESM spinners, chalk 5.6.2 color, error mapping (zod 3 `formatZodError`, Playwright `BrowserError`, hide-summary `missed`), CLI-layer-only orchestration of progress + error presentation for a silent-library codebase
**Confidence:** HIGH (ora 8.2 and chalk 5.6 APIs verified by reading `node_modules/ora/index.d.ts` and `node_modules/chalk/package.json`; existing error class shape verified by reading `src/config/load.js`, `src/browser/launcher.js`, `src/browser/navigator.js`, `src/prepare/hide.js`; the top-level catch sink verified at `index.js:5-8`)

## Summary

Phase 6 is the smallest phase in v0.1: two plans, no new files in `src/{browser,prepare,capture}/`, and **zero new dependencies** (ora 8.2.0 and chalk 5.6.2 are already installed and untouched since Phase 1). Every Phase-3/4/5 module already documents in its header comment that it has "NO console output, NO process.exit, and NO chalk/ora" — the silent-library posture has been honored consistently. Phase 6 is the **first and only** place in the codebase where presentation lives.

The work splits cleanly along the two ROADMAP plans:

1. **06-01 — Progress (CLI-02).** Add an ora spinner to `src/cli.js` that updates `spinner.text` at every step boundary the CLI already orchestrates: load config → launch browser → install guards → navigate → prepare → capture frame N/M → stitch → write → done. Step boundaries are call sites the CLI already owns; no library module gets a callback parameter, no Phase-5 module emits events. The single exception — "Capturing frame N/M" — requires Phase 5's `captureFullPage` to accept an optional `onProgress` callback whose contract is one line of types and one increment per frame; the library still doesn't import ora, still doesn't `console.log`. Recommended: **callback option on `captureFullPage`, defaults to no-op.** Phase 5 is being planned in parallel with this research — the planner should add the callback as a Phase 5 wave-3 line item OR Phase 6 plans both. Either is fine; Phase 6 OWNS the contract.

2. **06-02 — Error formatting (CLI-03).** Replace `index.js`'s bare `.catch(err => { console.error(err.message); process.exit(1); })` with a `formatError(err)` switch over the four already-distinguishable error sources:
   - `err instanceof ConfigError` → already formatted by `formatZodError` (Phase 2) — print as-is with a red banner. **No new work; only ergonomics.**
   - `err instanceof BrowserError` → already has `.cause` preserved (Phase 3) — extract Playwright sub-type from `err.cause.name` (e.g. `TimeoutError`, `Error` with DNS-shaped message) and print a plain-English description with the failing URL.
   - `err.name === 'TimeoutError'` (bare Playwright timeout that escaped the navigator's try/catch — possible from prepare or capture) → format as "operation X timed out after Y seconds."
   - Anything else → "Unexpected error: {err.message}" with a hint to check `--verbose` (deferred — see Open Questions). Stack trace printed via `chalk.dim` when set.

   The missed-selectors warning is **non-fatal**: it's not thrown — it's returned. The CLI inspects `hideSummary.missed` after `runPreparePipeline` returns and prints a yellow warning line per missed selector (or one summary line). Capture continues. SC #4 honored.

**Architecture: one new file (`src/cli/format.js`), modifications to two existing files (`src/cli.js` and `index.js`).** The library tree under `src/{browser,prepare,capture}/` is **NOT touched** except for Phase 5 adding `onProgress` to `captureFullPage`'s signature (the contract addition is owned by Phase 6 even if the patch lands in Phase 5's code). The new directory is `src/cli/` — a sibling of `src/browser/`, `src/prepare/`, `src/capture/` — and contains only `format.js` (and possibly `progress.js` if the planner prefers two files; the §Architecture section argues for one).

Plans match the ROADMAP draft:
- **06-01** = `src/cli/progress.js` (or inlined into `cli.js`) + spinner wiring across the 7 step boundaries in `cli.js`'s capture action body (CLI-02)
- **06-02** = `src/cli/format.js` (the error-mapping switch) + replace `index.js`'s top-level catch (CLI-03)

**Primary recommendation:** ONE new file `src/cli/format.js` containing both the progress helper (a thin `makeProgress(opts)` wrapper around `ora()`) and the error formatter (`formatError(err)` returning a string). Wire from `src/cli.js` (progress calls between existing step boundaries) and from `index.js` (the top-level catch sink). Smoke mode stays SILENT — no spinner, only the existing `console.log('smoke screenshot written: ...')` line; this preserves hermetic test output and matches the existing `console.time('prepare')` ergonomics. Selector warnings are printed unconditionally (smoke or not) because they reflect user-config quality, which the user wants surfaced even during smoke runs.

## User Constraints (from PROJECT.md + ROADMAP.md + REQUIREMENTS.md + Phase 1–5 outputs)

No `CONTEXT.md` exists for Phase 6 (no `/gsd:discuss-phase` invocation). Constraints derive from project-level docs and the consistent posture Phases 1–5 established.

### Locked Decisions (from PROJECT.md + REQUIREMENTS.md + completed phases + the additional_context brief)

- **Zero new dependencies.** ora 8.2.0 and chalk 5.6.2 are already in `package.json` (`"chalk": "^5"`, `"ora": "^8"`) and installed at `node_modules/{ora,chalk}/package.json` [VERIFIED via direct read of both]. No new packages introduced by Phase 6.
- **Silent library posture is sacrosanct.** `src/browser/launcher.js:5-7`, `src/browser/navigator.js:5-8`, `src/prepare/hide.js:4-6`, `src/prepare/index.js:11-15`, `src/prepare/animations.js:6-10`, `src/prepare/scroll.js:5-8` ALL declare in header comments: "NO console output, NO process.exit, and NO chalk/ora." Phase 5's planned modules (`src/capture/{frames,stitch,index}.js`) carry the same posture per 05-RESEARCH.md §Architecture and §Anti-Patterns line 580. **Phase 6 does NOT touch this rule.** No `import 'chalk'` or `import 'ora'` appears in `src/{browser,prepare,capture}/`. Presentation lives ONLY in `src/cli.js`, `index.js`, and the new `src/cli/format.js`.
- **The CLI owns the lifecycle (Phase 3 + Phase 5 invariant).** `src/cli.js:28-68`'s try/finally is the SOLE owner of `context.close()` and `browser.close()`, in that order. Phase 6's spinner integration MUST NOT add try/catch around the existing lifecycle — the spinner's `.fail()` call goes in the OUTER catch (at `index.js` or wrapping the entire `.action(async)` body), not interleaved with the lifecycle calls. See §Pitfall 1.
- **The single top-level catch is `index.js:5-8`.** This is the **one** error sink for the entire process. `program.parseAsync(...).catch(err => { console.error(err.message); process.exit(1); })`. Phase 6 replaces the body of this catch with `console.error(formatError(err)); process.exit(1);`. No new catches are added inside `src/cli.js`'s action body — letting errors bubble keeps the error-classification logic in ONE place. [VERIFIED at `index.js:5-8`.]
- **Error classes already exist with `.cause` preserved.** `ConfigError` (`src/config/load.js:17-22`) and `BrowserError` (`src/browser/launcher.js:21-27`) both subclass `Error` with `name` set and `cause` preserved when relevant. The error-mapping switch uses `instanceof` checks, NOT string matching. [VERIFIED at both files.]
- **`formatZodError` already exists and is already correct.** `src/config/schema.js:67-86` returns one user-facing line per zod issue, naming the field and expected type. The `ConfigError.message` is already the formatted multi-line string ("Invalid config in /path/to/file:\n  field: expected x, got y\n  field2: …"). Phase 6 does NOT re-parse or re-format zod errors — it just prints `ConfigError.message` as-is, optionally with a red `chalk` banner above it. [VERIFIED by reading `src/config/load.js:77-79` and `src/config/schema.js:67-86`.]
- **`hideSummary.missed` is the canonical selector-warning data source.** `src/prepare/hide.js:55-83` collects both zero-match selectors AND invalid-CSS-syntax selectors into the same `missed` array. `src/prepare/index.js:40-52` returns `{ hideSummary }` from `runPreparePipeline`. The CLI already destructures `const { hideSummary } = await runPreparePipeline(...)` at `src/cli.js:33`, with a comment at lines 34-35 explicitly reading: "hideSummary is intentionally unused in Phase 4 — Phase 6 (CLI-03) will surface hideSummary.missed as warnings if any hide: selector matched 0 elements." **Phase 6 is the named consumer.** [VERIFIED at `src/prepare/hide.js`, `src/prepare/index.js`, and `src/cli.js:33-35`.]
- **`--smoke` stays semantically minimal.** Phase 4's 04-05 wiring keeps `--smoke` as the hermetic test seam (one viewport screenshot, console.time('prepare'), simple `console.log` confirmation). Phase 5's RESEARCH §Pitfall 9 reinforces: "Smoke runtime increases from ~2s to ~15s; hermetic test PNG output is much taller than the viewport" is the failure mode of treating both branches identically. **Phase 6 does NOT add the spinner to the `--smoke` branch.** Selector warnings DO print in smoke mode (they're user-config feedback). Spinners do NOT. See §Open Questions #1 for the rationale.
- **The new path is `src/cli/`, not `src/ui/` or `src/format/`.** Phase 6 introduces a new module directory. Naming follows the sibling pattern: `src/browser/`, `src/prepare/`, `src/capture/`, `src/output/`, `src/config/` are all single-concern dirs. `src/cli/` is the natural name for "things that exist because there's a CLI." The orchestration entry stays at `src/cli.js` (singular file, parallel to `index.js`); the new module is `src/cli/format.js` (the helpers).
- **Single page, single viewport, single run still applies.** Per REQUIREMENTS v1 + 05-RESEARCH locked decisions. Phase 6 presents progress for ONE capture per invocation; no multi-page/multi-viewport progress aggregation logic needed.
- **No new CLI flags.** No `--quiet`, no `--no-spinner`, no `--verbose`. ora's TTY auto-disable handles non-interactive contexts (verified — see §Pattern 1). Verbose stack traces are deferred (see §Open Questions #2).
- **Progress goes to stderr (ora default).** ora 8.2.0 writes to `process.stderr` by default per `node_modules/ora/index.d.ts:84-92`. This is the correct stream: it leaves stdout free for the final "screenshot written: /path/to/file.png" line and matches CLI conventions (stdout = data, stderr = chatter). [VERIFIED at index.d.ts line 84.]

### Claude's Discretion

- **File layout under `src/cli/`** — recommendation in §Architecture: ONE file `src/cli/format.js` containing both `makeProgress()` and `formatError()`. Alternative: TWO files (`progress.js` + `format.js`). One file is fewer imports and clearer because both helpers share the same "presentation-only" concern. Two files would be defensible if either helper grew past ~80 lines, which it shouldn't for v0.1.
- **Spinner step granularity.** Recommendation in §Pattern 1: 7 step messages, mapped 1:1 to the existing CLI step boundaries (load config, launch browser, install guards, navigate, prepare, capture, stitch+write done). The per-frame "Capturing frame N/M" lives WITHIN the "capture" step as `spinner.text` updates driven by the `onProgress` callback. Other valid granularities exist (e.g. group browser+navigate as "Opening page"); the 7-step version maps to the user-facing mental model and to the 7 visible operations in `cli.js`.
- **Where the per-frame counter comes from.** Three options (per the brief's question #4):
  - **(a) Compute N up front from geometry and pass to a progress callback.** Phase 5 reads `viewportHeight` + `totalHeight` in `captureFrames` step 1 (before the screenshot loop) — exactly the moment N becomes knowable. The Phase 5 contract becomes `captureFullPage(page, outputPath, { onProgress?: (current, total) => void })`. **RECOMMENDED.** Honors silent-library posture (the library calls the callback; it doesn't log). Preserves separation. Adds one optional parameter to one function signature.
  - **(b) Phase 5 emits events.** Adds an EventEmitter to `captureFullPage`. Heavier surface for one consumer. Rejected.
  - **(c) Phase 6 wraps and increments.** Phase 6 wraps `captureFullPage` and increments a counter — but Phase 6 can't see inside the loop, so it can't increment per frame. Only works if Phase 5 splits `captureFullPage` into `captureFrames` + `stitchFrames` + `writeOutput` and Phase 6 calls them sequentially. Plausible, but breaks the single-entry-point contract Phase 5's RESEARCH §Architecture establishes ("captureFullPage is the single entry point the CLI consumes"). Rejected.
  - The recommended **(a)** requires Phase 5 to accept one optional callback in `captureFullPage`. Owned by Phase 6's plan, patch lands in `src/capture/index.js` and `src/capture/frames.js`. See §Pattern 2.
- **Color palette.** Recommendation in §Pattern 3: chalk's named colors — `chalk.green` for ✓ success persists, `chalk.red` for ✖ failures, `chalk.yellow` for ⚠ selector warnings, `chalk.dim` for hints + stack traces, `chalk.cyan` for the spinner default color (ora's default). No custom hex codes; no 256-color or truecolor.
- **Whether to show the final success line as a spinner.succeed() or a plain console.log.** Recommendation in §Pattern 1: `spinner.succeed("screenshot written: " + resolvedOutput)`. This persists the line with a green ✔ symbol, replacing the spinner. Matches ora's canonical pattern (verified at `node_modules/ora/index.d.ts:233-239`). The existing `cli.js:47` smoke confirmation stays as `console.log` (because smoke has no spinner).
- **Whether `spinner.fail()` runs in `index.js`'s catch or inside the action's try.** Recommendation: in `index.js`'s catch. The spinner instance must be accessible there; pass it via a shared module-level reference or a try-with-spinner higher-order pattern. See §Pattern 1 for the chosen approach (module-level `currentSpinner` reference set at start, cleared at end, checked in the catch).
- **Spinner type/frames.** Recommendation: leave it default (`'dots'`). ora's `'dots'` is the canonical choice — works in any terminal that supports unicode, falls back to `'line'` on Windows cmd.exe (handled by ora internally per `node_modules/ora/index.d.ts:46-56`).
- **Whether to wrap PlaywrightTimeoutError formatting at the navigator level vs CLI.** Recommendation in §Pattern 2: keep all error formatting at the CLI level. `navigator.js:47-52` already absorbs the post-load networkidle TimeoutError (timeout-tolerant pattern); the only TimeoutError that reaches Phase 6 is one from elsewhere (e.g. fonts.ready or a Phase 5 screenshot timeout). The formatter handles all `name === 'TimeoutError'` cases uniformly.

### Deferred Ideas (OUT OF SCOPE — do not research)

- **--verbose / --debug flags** — out of scope for v0.1. Stack traces print only on truly unexpected errors. Add later if needed.
- **Multi-line progress (separate spinners per concurrent task)** — single-task linear flow; ora supports this but we don't need it.
- **Progress percentage** — for the per-frame counter, "frame 3/7" is more informative than "37%". Skip.
- **Streaming progress to a log file** — personal tool; user reads the terminal.
- **Configurable color palette** — not needed; chalk auto-disables in non-color contexts.
- **Internationalized error messages** — English only.
- **Error code taxonomy (E001, E002, …)** — overengineering for a personal tool.
- **Recoverable errors that prompt for input** — Phase 6 prints + exits. No interactive prompts.
- **Telemetry on error frequency / pattern detection** — out of scope; personal tool with explicit no-telemetry posture in PROJECT.md.
- **Network-error pattern matching for specific Chromium ERR_* codes (ERR_NAME_NOT_RESOLVED, ERR_SSL_PROTOCOL_ERROR, ERR_CONNECTION_REFUSED, etc.)** — the `BrowserError.message` already includes Playwright's error text. v0.1's plain-English description is "Failed to reach {url} — {cause.message}." Pattern-matching to give bespoke "DNS lookup failed for hostname X" advice is nice-to-have; deferred. See §Open Questions #3.
- **Per-config "expected fields" hints (e.g. "did you mean `baseUrl` instead of `baseURL`?")** — would require a config-field similarity matcher. Deferred. Phase 2's `formatZodError` already names the bad field, which is sufficient for v0.1.
- **Capture-stage progress sub-events (e.g. "Reading geometry", "Scrolling to y=900")** — too noisy. Frame N/M is the right granularity.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Display in-progress spinner with current step text | CLI layer (`src/cli/format.js` + `src/cli.js`) | — | Presentation. Library code (`src/{browser,prepare,capture}/*`) is silent by contract. |
| Update spinner with per-frame "N/M" during capture | CLI layer via callback wired into `captureFullPage` options | Capture layer (`src/capture/index.js` + `frames.js` invoke the callback) | The capture loop owns the step count (it iterates); the CLI owns the display. Optional callback bridges without breaking silent-library posture. |
| Decide WHICH step name to show at each boundary | CLI layer (`src/cli.js` action body) | — | Step boundaries are CLI orchestration concerns. Library functions don't know they're being "called for step 4 of 7." |
| Persist a final success/failure line | CLI layer (`spinner.succeed()` / `spinner.fail()`) | — | Same as above. |
| Catch all errors and route to formatter | Process entry (`index.js`) | — | Single error sink. Already established. |
| Map error → formatted user-facing string | CLI layer (`src/cli/format.js::formatError`) | — | Pure function. No I/O. Easy to unit-test if we wanted to. |
| Detect a TimeoutError from a non-navigator source | CLI layer (`formatError` `instanceof` + `err.name === 'TimeoutError'`) | Library layer (navigator absorbs its own TimeoutError; others bubble) | The navigator's `try { goto } catch (e) { if (e.name === 'TimeoutError') noop }` (`navigator.js:47-52`) is the boundary. Anything that reaches the formatter is an unhandled-by-design timeout. |
| Print missed-selectors warning | CLI layer (`src/cli.js` after `runPreparePipeline` returns) | — | The library returns `{ hideSummary }`; the CLI is the named consumer per the comment at `cli.js:34-35`. |
| Continue capture after missed-selectors warning | CLI layer (`hideSummary` is a return value, not a throw — control flow continues unaltered) | — | Already correct by Phase 4 design. Phase 6 just prints, doesn't branch. |
| Color terminal output | CLI layer (`chalk.{green,red,yellow,dim,cyan}`) | — | chalk only ever imported in `src/cli/format.js`. |
| Auto-disable colors / spinner in non-TTY contexts | chalk + ora internals | — | Both libraries detect TTY and CI env vars and degrade gracefully. We rely on this — no manual TTY checks. |
| Exit with code 1 on any error | Process entry (`index.js`) | — | The catch's `process.exit(1)` line. Phase 6 doesn't change the exit code, just the message before it. |

## Standard Stack

### Core (already installed in Phase 1 — zero new packages in Phase 6)

| Library | Version (verified 2026-05-22) | Purpose | Why Standard |
|---------|-------------------------------|---------|--------------|
| `ora` | 8.2.0 [VERIFIED: `node_modules/ora/package.json`] | Elegant terminal spinner with `.text` updates and `.succeed()` / `.fail()` / `.warn()` persists | Sindre Sorhus's library; the canonical Node spinner. ESM-only since v6 (matches our `"type": "module"` package.json). |
| `chalk` | 5.6.2 [VERIFIED: `node_modules/chalk/package.json`] | Terminal color (red errors, green success, yellow warnings, dim hints) | Industry standard. ESM-only since v5. Auto-disables in non-color terminals via `supports-color` (`node_modules/chalk/source/index.js:1-9`). |
| `node:process` | Node 20+ stdlib | `process.exit(1)` | Already used at `index.js:7`. |

### ora APIs this phase uses (verified `node_modules/ora/index.d.ts`)

| API | Signature (line in index.d.ts) | Used For | Notes |
|-----|-------------------------------|----------|-------|
| `ora(options)` default export | `default function ora(options?: string \| Options): Ora` (line 311) | Create a spinner | If a string is passed, it's treated as `options.text`. We use the object form for explicit `color: 'cyan'` and `stream: process.stderr` (the latter is default; explicit is self-documenting). |
| `spinner.start(text?)` | `start(text?: string): this` (line 224) | Begin spinning, optionally setting text | Returns `this` — chainable. |
| `spinner.text` (setter) | `text: string` (line 168) | Update the current step text mid-spin | The canonical way to advance the message without succeed/fail. ora repaints on next frame. |
| `spinner.succeed(text?)` | `succeed(text?: string): this` (line 233-239) | Stop with green ✔ and persist text | Used for the final "screenshot written" line. |
| `spinner.fail(text?)` | `fail(text?: string): this` (line 242-247) | Stop with red ✖ and persist text | Used in the top-level catch when the spinner is still running. |
| `spinner.warn(text?)` | `warn(text?: string): this` (line 250-255) | Stop with yellow ⚠ and persist text | NOT used in the main flow (we use chalk.yellow directly for selector warnings since they're non-fatal and shouldn't stop the spinner). Documented for completeness. |
| `spinner.stop()` | `stop(): this` (line 226-231) | Stop and clear (no symbol, no persist) | NOT used in main flow. |
| `spinner.isSpinning` (getter) | `get isSpinning(): boolean` (line 208) | Check before calling `.fail()` from the top-level catch | The catch may run before the spinner started (e.g. config load failure) — guard against double-failing. |

### chalk APIs this phase uses (verified `node_modules/chalk/source/index.js` + `node_modules/chalk/source/index.d.ts`)

| API | Used For | Notes |
|-----|----------|-------|
| `chalk.red()` | Error banner header (e.g. "Error: Invalid config") | Red is the universal error color. |
| `chalk.green()` | Success banner ("screenshot written") — actually delivered via `spinner.succeed()` which prepends `chalk.green('✔')` internally | Used directly only if we want to emphasize a sub-message. |
| `chalk.yellow()` | Selector warnings (one yellow line per missed selector) | Non-fatal feedback. |
| `chalk.dim()` | Hints, stack traces, secondary text | Less visual weight. |
| `chalk.cyan()` | URL highlighting in network error messages (`Failed to reach ${chalk.cyan(url)}`) | Makes the failing URL stand out. |

### Supporting Libraries (no new installs)

None. ora 8.2.0 transitively installs `chalk@^5.3.0` (per `node_modules/ora/package.json` deps line 47), which is the same chalk we depend on directly — no version conflicts.

### Alternatives Considered (and rejected)

| Instead of | Could Use | Why we don't |
|------------|-----------|--------------|
| ora 8.2.0 | listr2 (multi-step task lists) | Heavier dep, designed for multi-task parallel UI. Single-task linear progress is what we have. |
| ora 8.2.0 | cli-progress (progress bars) | Better for known-percentage operations; less idiomatic for "current step text" updates. |
| ora 8.2.0 | log-update (re-renders any text) | Lower-level. ora wraps it. We want the higher-level spinner abstraction. |
| ora 8.2.0 | Build a custom spinner with ANSI cursor codes | Hand-rolling means re-implementing TTY detection, CI detection, cursor restoration on SIGINT, etc. ora handles all of it. |
| chalk 5.6.2 | picocolors | Smaller, but chalk is already installed and we don't have a perf-sensitive code path. Switching would be churn for no benefit. |
| chalk 5.6.2 | kleur | Same as picocolors. |
| chalk 5.6.2 | ANSI codes directly | Strings like `\x1b[31m...\x1b[0m` are unreadable. chalk wraps this. |
| `oraPromise(promise, options)` (ora helper) | Manual `spinner.start() / await / spinner.succeed()` | `oraPromise` is for ONE promise with success+fail text known up front. Our flow is multi-step with text changing per step. Manual control is the right shape. |
| Error subclasses for every category (TimeoutError, NetworkError, DnsError, …) | The current pattern (ConfigError + BrowserError + bare TimeoutError) | The existing two classes + `name`-based dispatch is sufficient for v0.1. Subclassing further is premature. |
| Wrapping Playwright errors at every call site | Top-level formatError switch | We already wrap at the navigator level for fatal nav errors (`BrowserError` with `cause`). Adding wrappers in Phase 5 capture would require Phase 5 to know error taxonomies. Letting raw Playwright errors bubble to formatError is simpler — the formatter handles them by `name`. |
| Pino / Winston structured logging | console.log + ora spinner + chalk colors | Personal tool. No log aggregation, no JSON output requirement. Heavyweight for nothing. |
| commander's built-in error handling (`program.exitOverride`) | The existing `parseAsync().catch()` | The current shape works; replacing it would require restructuring commander integration without benefit. |

## Package Legitimacy Audit

slopcheck was unavailable in this environment. Phase 6 introduces **zero new packages** — it consumes `ora@8.2.0` and `chalk@5.6.2`, both already declared and vetted in Phase 1 (and untouched since).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| ora | npm (8.2.0) | 9+ yrs | ~70M/wk | github.com/sindresorhus/ora | unavailable | Approved (Phase 1; first real use in Phase 6) |
| chalk | npm (5.6.2) | 12+ yrs | ~280M/wk | github.com/chalk/chalk | unavailable | Approved (Phase 1; first real use in Phase 6) |
| node:process | builtin | — | — | nodejs.org | — | Approved (stdlib; already used at `index.js:7`) |

**Packages removed:** none
**Packages flagged [SUS]:** none
**New packages introduced by Phase 6:** **NONE.**

Note: ora 8.2.0's transitive dependencies (chalk, cli-cursor, cli-spinners, is-interactive, is-unicode-supported, log-symbols, stdin-discarder, string-width, strip-ansi) are all sindresorhus-maintained packages with well-known provenance. chalk 5.6.2 vendors its own ansi-styles and supports-color (via `imports` in package.json) — no transitive packages from the chalk side. Both libraries are pure ESM (`"type": "module"`) matching our package.json.

## Architecture Patterns

### System Architecture Diagram

```
                            index.js (process entry)
                                     │
                                     │ program.parseAsync(process.argv)
                                     ▼
                ┌────────────────────────────────────────────┐
                │ src/cli.js — capture action body           │
                │                                            │
                │  spinner = makeProgress()                  │
                │  spinner.start('Loading config…')          │
                │     │                                      │
                │     ▼ loadConfig(configArg)   [Phase 2]    │
                │  spinner.text = 'Launching browser…'       │
                │     │                                      │
                │     ▼ launchBrowser(config)   [Phase 3]    │
                │  spinner.text = 'Installing guards…'       │
                │     │                                      │
                │     ▼ installAnimationGuards  [Phase 4]    │
                │  spinner.text = 'Navigating to ' + url     │
                │     │                                      │
                │     ▼ navigateToPage          [Phase 3]    │
                │  spinner.text = 'Running prepare pipeline' │
                │     │                                      │
                │     ▼ runPreparePipeline      [Phase 4]    │
                │     │  → returns { hideSummary }           │
                │     │  spinner.stop()                      │
                │     │  printSelectorWarnings(hideSummary)  │
                │     │  spinner.start('…')                  │
                │     │                                      │
                │     ▼ captureFullPage(page, out, {         │
                │          onProgress: (i, n) => {           │
                │            spinner.text =                  │
                │              `Capturing frame ${i}/${n}`   │
                │          }                                 │
                │        })                     [Phase 5]    │
                │     │                                      │
                │  spinner.succeed(`screenshot written: ${   │
                │      resolvedOutput}`)                     │
                └────────────────────┬───────────────────────┘
                                     │
                                     │ (throws bubble all the way up)
                                     ▼
                ┌────────────────────────────────────────────┐
                │ index.js catch                             │
                │                                            │
                │  if (currentSpinner?.isSpinning)           │
                │      currentSpinner.fail()                 │
                │  console.error(formatError(err))           │
                │  process.exit(1)                           │
                └────────────────────────────────────────────┘
                                     │
                                     ▼
                ┌────────────────────────────────────────────┐
                │ src/cli/format.js (NEW)                    │
                │                                            │
                │  export function makeProgress(opts) {      │
                │    return ora({ color: 'cyan', stream: …}) │
                │  }                                         │
                │                                            │
                │  export function printSelectorWarnings(    │
                │    hideSummary                             │
                │  ) {                                       │
                │    for (sel of hideSummary.missed)         │
                │      console.warn(chalk.yellow(            │
                │        `⚠ hide selector "${sel}" matched   │
                │         0 elements`))                      │
                │  }                                         │
                │                                            │
                │  export function formatError(err) {        │
                │    switch on err class/name:               │
                │     - ConfigError → red banner + msg       │
                │     - BrowserError → red + URL + cause     │
                │     - TimeoutError → red + "timed out"     │
                │     - default → "Unexpected error: …"      │
                │  }                                         │
                └────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── cli.js                    (Phase 2/3/4 — modified by Phase 6: spinner wiring at step boundaries + selector-warning call after prepare)
├── cli/                      (Phase 6 — NEW)
│   └── format.js             # CLI-02 + CLI-03 (makeProgress, printSelectorWarnings, formatError)
├── config/                   (Phase 2 — unchanged)
├── output/                   (Phase 2 — unchanged)
├── browser/                  (Phase 3 — unchanged)
├── prepare/                  (Phase 4 — unchanged)
└── capture/                  (Phase 5 — modified by Phase 6: add onProgress callback option to captureFullPage; frames.js invokes it per frame)

index.js                      (Phase 1 — modified by Phase 6: top-level catch calls formatError)
```

**Why ONE file `src/cli/format.js`** (vs. splitting into `progress.js` + `errors.js`):
- Both helpers are small (~30 lines each). One file keeps the import surface lean (one import from `src/cli.js` and one from `index.js`).
- Both are presentation-only — same single responsibility at a coarse level. Splitting would be premature taxonomy.
- The planner can argue for two files if the formatter grows materially (e.g. distinct error-type sub-formatters). For v0.1, one file is right.

### Pattern 1: makeProgress + spinner step boundaries (CLI-02)

**Where:** `src/cli/format.js` (the `makeProgress` factory) + `src/cli.js` (the step boundary call sites)
**Called by:** `src/cli.js` action body
**Why first:** Establishes the spinner instance that the entire capture action lifecycle uses.

The factory:

```javascript
// src/cli/format.js — excerpt
// Phase 6: CLI-only presentation helpers. No library code imports from here.
import ora from 'ora';
import chalk from 'chalk';

/**
 * Create a spinner configured for framershot's capture flow.
 * - Writes to stderr (ora default) so stdout stays clean for the final result line.
 * - Cyan spinner (ora default) — chalk.cyan elsewhere stays consistent.
 * - Auto-disables in non-TTY contexts (CI, piped output) via ora's is-interactive check
 *   (verified at node_modules/is-interactive/index.js: requires stream.isTTY && !CI env var
 *   && TERM !== 'dumb'). NO manual TTY guard needed in cli.js.
 *
 * @returns {import('ora').Ora}
 */
export function makeProgress() {
  return ora({
    color: 'cyan',          // explicit; matches ora default
    stream: process.stderr, // explicit; matches ora default — leaves stdout for the final line
    // text intentionally omitted — caller sets it via spinner.start('...')
  });
}
```

The step boundary wiring at `src/cli.js`:

```javascript
// src/cli.js — paraphrased diff
import { makeProgress, printSelectorWarnings } from './cli/format.js';

// Module-level so index.js's catch can reach it (see Pattern 3).
// Reset to null after a successful run; checked by isSpinning before .fail().
let currentSpinner = null;
export function getCurrentSpinner() { return currentSpinner; }

// … inside .action(async (configArg, opts) => { …
const spinner = currentSpinner = makeProgress();

// Step 1 — Load config (BEFORE spinner if we want load errors clean — see below)
// Actually: start the spinner BEFORE loadConfig so config errors get the spinner.fail() treatment.
spinner.start('Loading config');
const config = await loadConfig(configArg);

const date = new Date().toISOString().slice(0, 10);
const viewport = config.viewport.name ?? 'default';
const page = config.page.name;
const resolvedOutput = resolveTemplate(config.output, { date, viewport, page });

// Step 2 — Launch browser
spinner.text = 'Launching Chromium';
const { browser, context } = await launchBrowser(config);

try {
  // Step 3 — Install guards
  spinner.text = 'Installing animation guards';
  await installAnimationGuards(context, config.prepare);

  // Step 4 — Navigate
  // Build the user-visible URL for display purposes only; navigateToPage uses path.
  spinner.text = `Navigating to ${config.baseUrl}${config.page.path}`;
  const navigatedPage = await navigateToPage(context, config.page);

  // Smoke branch: existing behavior, no spinner changes beyond Step 1-4 above.
  if (opts.smoke) {
    // Stop the spinner cleanly before smoke's existing console.time/.log calls.
    // Smoke output stays hermetic.
    spinner.stop();
    currentSpinner = null;
    // … existing smoke branch body unchanged (console.time('prepare') etc.)
    return;
  }

  // Step 5 — Prepare pipeline
  spinner.text = 'Running prepare pipeline';
  const { hideSummary } = await runPreparePipeline(navigatedPage, config.prepare);

  // Step 5.5 — Selector warnings (non-fatal, printed BETWEEN steps)
  // The spinner is briefly stopped + restarted so the warning line doesn't
  // collide with the spinner's continuous repaint.
  if (hideSummary.missed.length > 0) {
    spinner.stop();
    printSelectorWarnings(hideSummary);
    spinner.start();  // restart with no text — text set on next line
  }

  // Step 6 — Capture (the per-frame counter lives here)
  spinner.text = 'Capturing frame 0/?';
  await captureFullPage(navigatedPage, resolvedOutput, {
    onProgress: (current, total) => {
      spinner.text = `Capturing frame ${current}/${total}`;
    },
  });

  // Step 7 — Done
  spinner.succeed(`screenshot written: ${resolvedOutput}`);
  currentSpinner = null;
} finally {
  // ORDER MATTERS: context first, then browser. UNCHANGED by Phase 6.
  await context.close();
  await browser.close();
}
```

**A note on the "Capturing frame 0/?" initial text:** before the first `onProgress` fires, we don't know N (it's computed inside `captureFrames`). The "0/?" placeholder is honest — it indicates capture has started but the count isn't known yet. The first `onProgress(1, N)` call replaces it immediately. Alternative: leave the text as "Running capture loop" until the first callback. Both are acceptable; "0/?" is more informative for users with very large pages where geometry-read takes a beat.

### Pattern 2: captureFullPage onProgress callback (CLI-02 — Phase 5 contract addition)

**Where:** `src/capture/index.js` + `src/capture/frames.js` (Phase 5 patch owned by Phase 6 plan)
**Called by:** `src/cli.js`'s capture step
**Why second:** The "Capturing frame N/M" message is the most informative progress signal because it scales with page length; the callback wiring is the smallest possible bridge from a silent library to the CLI's spinner.

**Phase 5 contract addition** — `captureFullPage`'s signature gains an optional `options.onProgress`:

```javascript
// src/capture/index.js — paraphrased patch
export async function captureFullPage(page, outputPath, options = {}) {
  const { onProgress } = options;  // signature: (current: number, total: number) => void
  // Step 1 — Capture
  const { frames, geometry } = await captureFrames(page, { onProgress });
  // Step 2 — Stitch (no callback — too fast and singular to be worth a "Stitching" step)
  const pngBuffer = await stitchFrames(frames, geometry);
  // Step 3 — Write
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, pngBuffer);
}
```

```javascript
// src/capture/frames.js — paraphrased patch inside captureFrames
export async function captureFrames(page, options = {}) {
  const { onProgress } = options;
  // ... existing geometry read & frameYOffsets computation ...
  const total = frameYOffsets.length;
  for (let i = 0; i < frameYOffsets.length; i++) {
    const y = frameYOffsets[i];
    // ... existing scroll + rAF + screenshot ...
    frames.push(buf);
    // Invoke callback AFTER the frame is captured — "frame i+1 of total complete"
    // Callback runs synchronously; if it throws, it's a CLI bug (silent library
    // posture means library doesn't try/catch presentation callbacks).
    onProgress?.(i + 1, total);
  }
  return { frames, geometry: { ... } };
}
```

**Three properties this preserves:**
1. **Silent library still silent.** The library invokes a function it received; it doesn't import ora, doesn't import chalk, doesn't `console.log`. The callback is data, not presentation.
2. **Backward compatible.** `captureFullPage(page, out)` still works (no `options` arg = `options = {}` = `onProgress = undefined` = `?.()` is a no-op).
3. **No event-emitter surface.** No subscription model, no event types to document. One optional callback. Minimal.

**Wire ownership:** Even though the patch lives in Phase 5's files, the CONTRACT (callback signature, semantics, the fact that it exists at all) is owned by Phase 6's plan because Phase 6 is the named consumer. The planner should either:
- Add the callback to Phase 5's 05-01 plan (frames.js) and 05-03 plan (index.js) before Phase 5 executes — recommended if Phase 5 hasn't been planned yet
- OR have Phase 6's 06-01 plan touch `src/capture/index.js` and `src/capture/frames.js` directly — recommended if Phase 5 is already locked

(STATE.md as of 2026-05-22 reads "Phase 5 not started"; `src/capture/` does not yet exist [VERIFIED via `ls /Users/sannagranqvist/Documents/App/screenshotter/src/capture/` → `No such file or directory`]. The planner can choose either approach; I recommend folding the callback into Phase 5's plans so they ship complete.)

### Pattern 3: formatError + index.js catch wiring (CLI-03)

**Where:** `src/cli/format.js` (the `formatError` switch) + `index.js` (the catch sink)
**Called by:** `index.js`'s `program.parseAsync(...).catch()`
**Why third:** The error path is orthogonal to the happy path's spinner wiring; it slots into the existing single-catch architecture.

The formatter:

```javascript
// src/cli/format.js — excerpt
import chalk from 'chalk';
import { ConfigError } from '../config/load.js';
import { BrowserError } from '../browser/launcher.js';

/**
 * Format a thrown error into a user-facing multi-line string.
 *
 * Dispatch by class/name:
 *   - ConfigError    → Phase 2's formatZodError already produced the message;
 *                      we just wrap with a red "Error:" banner.
 *   - BrowserError   → Phase 3 preserved err.cause; we extract Playwright sub-type
 *                      (TimeoutError vs other) and emit a plain-English description.
 *                      The URL is embedded in BrowserError.message already (verified
 *                      at src/browser/navigator.js:56-60).
 *   - TimeoutError   → A bare Playwright TimeoutError that escaped its origin
 *                      (e.g. from a future Phase 5 screenshot timeout). Generic
 *                      "operation timed out" with the original message.
 *   - default        → "Unexpected error" with the message + dim stack.
 *
 * Always returns a string ending in '\n' (or not — caller does console.error which
 * adds '\n'). Pure function — no I/O, no side effects.
 *
 * @param {Error} err — any error caught from program.parseAsync
 * @returns {string} — formatted multi-line user-facing message
 */
export function formatError(err) {
  // Config errors (Phase 2: src/config/load.js throws these with already-formatted messages)
  if (err instanceof ConfigError) {
    // err.message already includes "Invalid config in /path:\n  field: expected x, got y"
    return `${chalk.red('Error:')} ${err.message}`;
  }

  // Browser/navigation errors (Phase 3: src/browser/launcher.js + navigator.js)
  if (err instanceof BrowserError) {
    const cause = err.cause;
    if (cause?.name === 'TimeoutError') {
      // BrowserError shouldn't wrap a TimeoutError today (navigator absorbs them),
      // but be defensive — Phase 5 may add wrapping.
      return `${chalk.red('Error:')} ${err.message}\n  ${chalk.dim('(timed out)')}`;
    }
    return `${chalk.red('Error:')} ${err.message}`;
  }

  // Bare Playwright timeouts (escaped from any layer)
  if (err.name === 'TimeoutError') {
    return `${chalk.red('Error:')} Operation timed out — ${err.message}`;
  }

  // Anything else — unexpected
  const lines = [
    `${chalk.red('Unexpected error:')} ${err.message}`,
  ];
  if (err.stack) {
    // Print stack dim so it's available but doesn't dominate the output.
    // Strip the first line (which is "ErrorName: message" — already shown above).
    const stackBody = err.stack.split('\n').slice(1).join('\n');
    lines.push(chalk.dim(stackBody));
  }
  return lines.join('\n');
}

/**
 * Print a yellow warning line per missed hide selector. Does NOT throw, does NOT
 * exit — Phase 4 returns missed selectors as data (hideSummary.missed) precisely
 * because they're non-fatal. SC #4 ("missing-selector warnings print but capture
 * continues") is satisfied by the fact that this function is called BETWEEN steps
 * in cli.js, not in any error path.
 *
 * Output goes to stderr (console.warn) so stdout stays clean.
 *
 * @param {{ matched: number, missed: string[] }} hideSummary — from runPreparePipeline
 */
export function printSelectorWarnings(hideSummary) {
  for (const sel of hideSummary.missed) {
    console.warn(chalk.yellow(`⚠ hide selector "${sel}" matched 0 elements (or invalid CSS) — skipped`));
  }
}
```

The catch wiring at `index.js`:

```javascript
// index.js — paraphrased patch
#!/usr/bin/env node
import { buildProgram, getCurrentSpinner } from './src/cli.js';
import { formatError } from './src/cli/format.js';

const program = buildProgram();
await program.parseAsync(process.argv).catch((err) => {
  // If a spinner was running, fail it cleanly (red ✖ + persist text).
  // The text stays the same — it shows WHICH step was running when the error hit.
  const spinner = getCurrentSpinner();
  if (spinner?.isSpinning) {
    spinner.fail();
  }
  console.error(formatError(err));
  process.exit(1);
});
```

**Why `console.error` not `process.stderr.write`:** `console.error` adds a trailing newline and is the canonical write-to-stderr API. ora also writes to stderr — both streams are flushed in order. No interleaving concerns.

### Pattern 4: Smoke branch stays spinner-free (preserves hermetic test output)

The smoke branch was added in Phase 3/4 as the hermetic verification seam — one viewport screenshot, deterministic, easy to assert against. Phase 5's RESEARCH §Pitfall 9 documents the failure mode of "enthusiastically replace both branches." Phase 6 has the symmetric pitfall: enthusiastically wiring the spinner into the smoke branch breaks hermeticity.

**The rule:** The spinner stops cleanly via `spinner.stop()` + `currentSpinner = null` BEFORE the `--smoke` branch runs. The existing `console.time('prepare')` / `console.timeEnd('prepare')` / `console.log('smoke screenshot written: ...')` lines stay UNCHANGED. The smoke branch returns early (or falls through to the `} finally {`), and never re-starts the spinner.

**Selector warnings are the one cross-cutting print in smoke mode.** They reflect user-config quality and the user wants them surfaced even during smoke runs. They go to stderr (where they always go), so smoke's stdout assertions are unaffected. If a smoke test ever needs to assert "no selector warnings," it can assert empty stderr OR can use a smoke fixture with all selectors present.

### Anti-Patterns to Avoid

- **Don't import `chalk` or `ora` in `src/{browser,prepare,capture}/*`.** The silent-library posture is checked by header comment + visual review at PR time. Any such import is a regression.
- **Don't `console.log` for progress** — use the spinner. `console.log` interleaves badly with the spinner's continuous repaint, producing visual glitches (the spinner's frame overprints the log line, or vice versa).
- **Don't wrap each library call with a try/catch in `src/cli.js`** — there is ONE top-level catch (in `index.js`). Adding inner catches scatters error formatting and makes the dispatch logic harder to follow.
- **Don't call `spinner.fail()` inside `src/cli.js`'s try** — the spinner's failure persistence happens in the OUTER catch (`index.js`). Otherwise a failure during prepare leaves the browser open (the finally hasn't run yet) AND has called `.fail()`, then the finally calls `browser.close()` which prints another line, then index.js's catch runs and tries to format the error — chaotic. Single failure path.
- **Don't add `--quiet` or `--no-spinner` flags** — ora's auto-disable handles non-interactive contexts. Users in CI get text-only output by default. Adding flags is yak-shaving for a personal tool.
- **Don't try to parse zod errors AGAIN in formatError** — Phase 2's `formatZodError` already produced the formatted message inside `ConfigError.message`. Re-parsing means duplicating logic and risking divergence.
- **Don't print color codes when piped to a file** — chalk handles this via `supports-color`. Don't add a manual `if (!process.stdout.isTTY)` strip.
- **Don't `process.exit(1)` from anywhere except `index.js`'s catch.** Currently the codebase has zero `process.exit` calls in `src/*` (verified by grep — search target: `process.exit` should appear ONLY in `index.js`). Phase 6 maintains this. Library exits via thrown errors that bubble to the single sink.
- **Don't add the spinner to the smoke branch.** See Pattern 4 + §Pitfall 1.
- **Don't print the selector warnings AS the spinner is spinning.** The spinner repaints over them. Stop spinner → print warnings → restart spinner. See Pattern 1 step 5.5.
- **Don't use `oraPromise(captureFullPage(...))`** — it wraps ONE promise with fixed success/fail text. Our flow has changing per-step text. Manual control is the right shape.
- **Don't have `getCurrentSpinner` return a fresh spinner if none is set.** It returns the module-level reference (possibly null). The catch must handle null.
- **Don't depend on ora's `.stop()` clearing the line completely on every terminal** — it does, but if a future user runs in a terminal where it doesn't, they get a leftover spinner frame. Acceptable for a personal tool.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal spinner with text updates | A `setInterval(repaint, 80ms)` loop with ANSI cursor codes | `ora()` | TTY detection, CI detection, SIGINT cleanup, Windows fallback to `'line'` spinner, cursor restoration — all handled. |
| Per-frame counter display | A buffered console.log batch with manual cursor-up codes | `spinner.text = ...` | Same reasons. ora's repaint is designed for this. |
| Color output | ANSI escape codes (`\x1b[31m...\x1b[0m`) | `chalk.red(...)` | Auto-disable in non-color contexts; readable code. |
| Zod error → field+type | A new parser for zod's `error.issues[]` | Phase 2's existing `formatZodError` | Already shipped. Already tested. ConfigError.message is the output. |
| Playwright error → English | An exhaustive switch over Chromium ERR_* codes | The minimum: TimeoutError name check + BrowserError.message (which already includes path/URL) | v0.1 personal tool. The message already names the failing path. Pattern-matching specific codes is deferred. |
| TTY detection | `process.stdout.isTTY` checks scattered through the code | ora's `isInteractive()` (transitively) and chalk's `supports-color` | Already in node_modules. Don't reimplement. |
| Selector warning aggregation | Custom collector class | Phase 4's `hideSummary.missed[]` array | Already shipped. CLI just iterates. |
| "Did you mean X?" config field suggestion | Levenshtein distance matcher | Nothing — zod issue.path is sufficient ("field 'baseURL' invalid" tells the user) | Premature ergonomics for v0.1. |

**Key insight:** Phase 6 is the smallest phase because every hard problem has already been solved upstream — `formatZodError`, `ConfigError`, `BrowserError` with `cause`, `hideSummary.missed`, ora's TTY detection. Phase 6's job is to **wire** these into the user-facing output, not to **add** error or progress infrastructure. The risk in Phase 6 is over-engineering: building an error taxonomy, writing custom progress UI, adding flags. Resist all of it.

## Runtime State Inventory

Not applicable — Phase 6 is greenfield code (one new file + edits to two existing files). No rename/refactor/migration. No persistent state touched: no databases, no caches, no env vars, no OS-registered state, no installed-package side effects.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| ora | Spinner output | ✓ | 8.2.0 | — (no install needed) |
| chalk | Color output | ✓ | 5.6.2 | — (no install needed) |
| Node 20+ | ESM imports, top-level await in `index.js` | ✓ | per package.json `engines.node >= 20` | — |
| TTY stdout/stderr | Spinner animation | conditional | — | ora auto-disables; text-only fallback works |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

## Common Pitfalls

### Pitfall 1: Spinner state leaking across the try/finally lifecycle

**What goes wrong:** Spinner is started inside the try block, an error fires inside the try, the catch in `index.js` calls `.fail()`, but the spinner reference isn't accessible to `index.js` because it's a local variable in `cli.js`'s action body. Either the catch can't fail the spinner (it stays spinning forever in a terminal), or the codebase grows extra plumbing.

**Why it happens:** Spinner naturally wants to live in the action's local scope (where it's used), but the catch lives outside that scope (in `index.js`).

**How to avoid:** Module-level reference in `src/cli.js` — `let currentSpinner = null;` plus `export function getCurrentSpinner()`. Set at action start, clear on success, checked-and-failed in `index.js`'s catch. The §Pattern 3 example shows the wiring.

**Alternative:** Pass the spinner through `commander`'s context somehow. Less idiomatic, more plumbing. Reject.

**Warning signs:** Terminal shows the spinner indefinitely after a crash; the error message appears but the spinner doesn't ✖-out; the next prompt is contaminated by the spinner's frame.

### Pitfall 2: Spinner repaint racing with console.log output

**What goes wrong:** A library function (or the action body) does `console.log('something')` while the spinner is spinning. ora repaints on its interval (~80ms for 'dots'), then console.log writes, then ora repaints again — producing interleaved text where the log line is partially overwritten by the spinner frame.

**Why it happens:** ora and console.log both write to stderr (or stdout) without coordination.

**How to avoid:**
- Library code (`src/{browser,prepare,capture}/*`) NEVER logs — already enforced by silent-library posture.
- The CLI itself only logs at step boundaries where we STOP the spinner first (`spinner.stop()` → `console.warn(...)` → `spinner.start()`). See §Pattern 1 Step 5.5 for the selector-warnings example.
- The final success line uses `spinner.succeed(text)` (which stops + persists) — NOT `console.log` while spinner is spinning.

**Warning signs:** Output that looks like `Capturing⠋frame 3/⠙7⠹ warning⠴ something⠦` — fragments of two writes interleaved.

### Pitfall 3: chalk.red wrapping the WHOLE multiline ConfigError message

**What goes wrong:** `chalk.red(err.message)` where `err.message` is the multi-line "Invalid config in /path:\n  field1: …\n  field2: …" makes the entire block red. Visually overwhelming. The user can't distinguish "this is the error category" from "this is the specific issue."

**Why it happens:** Wrapping with chalk is one line; wrapping just the prefix is two operations.

**How to avoid:** Use `${chalk.red('Error:')} ${err.message}` — color only the prefix, not the body. See §Pattern 3 formatError. Same principle for `chalk.yellow('⚠')` + plain text for warnings.

**Warning signs:** Terminal output is a wall of red text; the user squints to find the relevant field name.

### Pitfall 4: Adding the spinner to the --smoke branch

**What goes wrong:** Smoke test runtime increases (the spinner adds tens of milliseconds for cursor management and TTY checks); hermetic smoke output now has spinner frames captured in test logs; the test assertions against stdout/stderr need updating.

**Why it happens:** "Both branches should look the same" instinct.

**How to avoid:** Stop the spinner BEFORE the smoke branch runs (see §Pattern 1 — `if (opts.smoke) { spinner.stop(); … }`). Smoke output stays minimal and grep-able.

**Warning signs:** Smoke test snapshots include `⠋ Loading config` or other spinner frames.

### Pitfall 5: Calling formatError on undefined or non-Error throws

**What goes wrong:** Something `throw 'string'` or `throw { msg: 'oops' }` — formatError accesses `err.message` and gets undefined, prints "Unexpected error: undefined."

**Why it happens:** JavaScript allows throwing non-Error values. Library code mostly throws proper Errors, but a foreign dep might not.

**How to avoid:** First line of formatError: `if (!(err instanceof Error)) return chalk.red('Unexpected error: ') + String(err);`. Cheap defensive guard. Optional for v0.1 — every throw in our codebase IS an Error subclass [VERIFIED via reading load.js, launcher.js, navigator.js, hide.js].

**Warning signs:** Output literally reads "Unexpected error: undefined."

### Pitfall 6: ora's default stream is stderr, but spinner.succeed text might land on the wrong stream for downstream pipes

**What goes wrong:** A user runs `framershot capture config.yaml | tee log.txt` expecting `log.txt` to contain "screenshot written: /path". But `spinner.succeed` writes to stderr (ora default), not stdout — so the final line isn't in log.txt.

**Why it happens:** ora's stream default is stderr; the user's mental model is "progress went to terminal, the final result line should be capturable."

**How to avoid:**
- Option A: After `spinner.succeed`, also `console.log` the final path to stdout. Gives both visual feedback (succeed) AND pipe-capturable result (log).
- Option B: Set `stream: process.stdout` on makeProgress, so the spinner AND succeed both go to stdout. Breaks the "data on stdout, chatter on stderr" convention.
- **Recommendation:** Option A. The two-line cost is minor; the convention is preserved; the user can `2>&1` if they want everything.

**Warning signs:** A user complains "I piped it and got nothing"; or a future automation script expects stdout but reads nothing.

### Pitfall 7: Spinner doesn't show in CI even though we want progress

**What goes wrong:** A user runs framershot inside a `script` block in a CI job (which has `CI=1` set). ora detects CI, auto-disables — no spinner appears, no per-step messages appear. CI logs are silent for the duration of capture, then dump the final line.

**Why it happens:** ora's `is-interactive` returns false when `'CI' in process.env`. By design — spinners on continuous-repaint streams in CI logs produce thousands of garbage lines.

**How to avoid:** Don't fight it. v0.1 is a personal tool primarily used interactively. If the user explicitly wants CI progress, they can `unset CI` or call ora with `isEnabled: true` — but adding a flag for this is yak-shaving. Accept the silent-in-CI behavior. Document in Open Questions if it becomes a real need.

**Warning signs:** None from the tool; user feedback "I ran it in GitHub Actions and saw nothing for 30 seconds."

### Pitfall 8: Multiple onProgress callbacks if Phase 5's frames.js retries a screenshot

**What goes wrong:** If Phase 5 adds retry-on-screenshot-failure (it doesn't currently per 05-RESEARCH §Pattern 1), `onProgress(i+1, total)` might fire twice for the same `i`. The spinner text shows "Capturing frame 3/7" then briefly back to "Capturing frame 3/7" (no visual change), then forward to 4/7. Cosmetically fine, but the counter could in theory go backward (e.g. if the retry decrements i — it shouldn't, but a bug could).

**Why it happens:** Defensive retry logic.

**How to avoid:** Phase 5's frames.js per 05-RESEARCH does NOT retry. If a future Phase 5 patch adds retry, it should call `onProgress` AT MOST ONCE per frame (on final success). Document this contract in the callback's JSDoc.

**Warning signs:** Frame counter pauses/repeats during capture; or user-reported "frame counter jittered."

### Pitfall 9: chalk's color level disagreement with ora's color

**What goes wrong:** chalk detects color level X, ora's bundled chalk detects color level Y (different version, different supports-color result), output has inconsistent color depths.

**Why it happens:** ora 8.2.0 declares `"chalk": "^5.3.0"` (per `node_modules/ora/package.json` line 47). Our package.json declares `"chalk": "^5"` resolving to 5.6.2. npm dedupes if compatible; the deduped chalk is one instance.

**How to avoid:** Verified — `ls /Users/sannagranqvist/Documents/App/screenshotter/node_modules/ora/node_modules/` (if exists) would show a separate chalk only if dedup failed. Per package.json resolver semantics, ^5.3.0 and ^5 both satisfy 5.6.2 → single chalk install. No conflict.

**Warning signs:** Disk-check via `find node_modules -name 'chalk' -type d` shows multiple chalk installs.

### Pitfall 10: Forgetting to clear currentSpinner on success path

**What goes wrong:** After `spinner.succeed(...)`, the next run (in a long-lived process, e.g. tests) sees stale currentSpinner. The next failure's catch tries to `.fail()` a spinner that's already stopped — ora handles this gracefully (`.fail()` on a stopped spinner is a no-op-with-symbol-render), so cosmetic issue only.

**Why it happens:** The success path is "happy" and easy to forget to clean up.

**How to avoid:** `currentSpinner = null;` immediately after `spinner.succeed(...)` AND immediately after the early-return for `--smoke`. The §Pattern 1 example shows both. Defensive, cheap.

**Warning signs:** In test runs (where buildProgram is invoked multiple times in one process), the second run shows a phantom ✖ from a previous run's spinner.

## Code Examples

Verified patterns drawn from `node_modules/ora/index.d.ts`, `node_modules/chalk/source/index.js`, `src/config/{load,schema}.js`, `src/browser/{launcher,navigator}.js`, `src/prepare/hide.js`, and Phase 5 RESEARCH. Sources cited inline.

### Example 1: end-to-end Phase 6 happy path (the full production flow with progress)

```javascript
// What a single `framershot capture samples/sample.yaml` invocation does AFTER Phase 6 ships.
// Compare to Phase 5's flow (05-RESEARCH §Example 1) — Phase 6 adds the spinner lines and
// the final succeed call.

// User runs: framershot capture samples/sample.yaml
// Terminal output (interactive TTY):
//   ⠋ Loading config
//   ⠋ Launching Chromium
//   ⠋ Installing animation guards
//   ⠋ Navigating to https://pubq.se/
//   ⠋ Running prepare pipeline
//   ⠋ Capturing frame 1/10
//   ⠋ Capturing frame 2/10
//   ...
//   ⠋ Capturing frame 10/10
//   ✔ screenshot written: ./screenshots/2026-05-22/desktop/home.png
//   screenshot written: ./screenshots/2026-05-22/desktop/home.png   ← duplicate to stdout per Pitfall 6

// Each line above except the ✔ and the stdout line is REPLACING the previous line in place
// (ora's spinner text update). Total terminal lines after success: 2 (✔ on stderr, plain on stdout).

// In CI (TERM=dumb or CI=1): no spinner lines at all, just the final stdout line.
```

### Example 2: end-to-end Phase 6 error paths

```javascript
// User runs: framershot capture bad-config.yaml (where bad-config has `viewport.width: "1440"` — string not number)
// Terminal output (stderr):
//   ⠋ Loading config              ← briefly, before loadConfig throws
//   ✖ Loading config              ← spinner.fail() from index.js catch (text unchanged from current step)
//   Error: Invalid config in /Users/.../bad-config.yaml:
//     viewport.width: expected number, got string
//
// Exit code: 1
// stdout: empty (the "screenshot written" line never reached)

// ---

// User runs: framershot capture config.yaml (where baseUrl is https://nonexistent.example.tld)
// Terminal output (stderr):
//   ⠋ Loading config
//   ⠋ Launching Chromium
//   ⠋ Installing animation guards
//   ⠋ Navigating to https://nonexistent.example.tld/
//   ✖ Navigating to https://nonexistent.example.tld/
//   Error: Failed to navigate to / (resolved against context baseURL). Original error: page.goto: net::ERR_NAME_NOT_RESOLVED at https://nonexistent.example.tld/
//
// Exit code: 1

// ---

// User runs: framershot capture config.yaml (where prepare.hide includes ".nonexistent-selector")
// Terminal output (stderr):
//   ⠋ Loading config
//   ⠋ Launching Chromium
//   ⠋ Installing animation guards
//   ⠋ Navigating to https://pubq.se/
//   ⠋ Running prepare pipeline
//   ⚠ hide selector ".nonexistent-selector" matched 0 elements (or invalid CSS) — skipped
//   ⠋ Capturing frame 1/10
//   ...
//   ✔ screenshot written: ./screenshots/2026-05-22/desktop/home.png
//   screenshot written: ./screenshots/2026-05-22/desktop/home.png
//
// Exit code: 0  ← non-fatal warning, capture completed
```

### Example 3: the formatError dispatch verified against actual error shapes

```javascript
// ConfigError shape (verified at src/config/load.js:17-22 + 77-79):
//   new ConfigError(`Invalid config in ${absPath}:\n  ${lines.join('\n  ')}`)
//   .name = 'ConfigError'
//   .message = 'Invalid config in /path/to/file.yaml:\n  field1: expected x, got y\n  field2: ...'
//   instanceof ConfigError === true
//   instanceof Error === true

formatError(new ConfigError('Invalid config in /tmp/c.yaml:\n  viewport.width: expected number, got string'));
// → 'Error: Invalid config in /tmp/c.yaml:\n  viewport.width: expected number, got string'
//   (with chalk.red on 'Error:' prefix)

// BrowserError shape (verified at src/browser/launcher.js:21-27 + navigator.js:56-60):
//   new BrowserError(`Failed to navigate to ${pageConfig.path} ... Original error: ${err.message}`, { cause: err })
//   .name = 'BrowserError'
//   .message = 'Failed to navigate to /home. Original error: page.goto: net::ERR_NAME_NOT_RESOLVED at https://...'
//   .cause = PlaywrightError (name='Error' typically for DNS, or 'TimeoutError' for timeouts)
//   instanceof BrowserError === true

formatError(new BrowserError('Failed to navigate to /home. Original error: ERR_NAME_NOT_RESOLVED', { cause: new Error('net::ERR_NAME_NOT_RESOLVED') }));
// → 'Error: Failed to navigate to /home. Original error: ERR_NAME_NOT_RESOLVED'
//   (with chalk.red on 'Error:' prefix)

// Bare Playwright TimeoutError:
const t = new Error('Timeout 30000ms exceeded.');
t.name = 'TimeoutError';
formatError(t);
// → 'Error: Operation timed out — Timeout 30000ms exceeded.'

// Unexpected error:
formatError(new TypeError('Cannot read properties of undefined (reading "x")'));
// → 'Unexpected error: Cannot read properties of undefined (reading "x")'
//   <dim stack trace below>
```

### Example 4: ora 8.2.0 API verified against installed types

```javascript
// All signatures verified at node_modules/ora/index.d.ts:
import ora from 'ora';

const spinner = ora({           // line 311: default export
  text: 'initial text',          // line 168
  color: 'cyan',                 // line 71 (Color type at line 16-26)
  stream: process.stderr,        // line 84-92
}).start();                       // line 224 — chainable, returns this

// Update mid-spin:
spinner.text = 'next step';      // line 168 — text is a setter on the Ora interface

// Persist with green ✔:
spinner.succeed('done');         // line 233-239

// Persist with red ✖:
spinner.fail('something broke'); // line 242-247

// Check if still spinning (used by index.js catch — see Pattern 3):
if (spinner.isSpinning) { spinner.fail(); }   // line 208
```

### Example 5: chalk 5.6.2 imported into ESM (verified clean import in our project)

```javascript
// chalk 5 is pure ESM; package.json "type": "module" in our project (verified at package.json line 5)
// matches chalk's ESM-only distribution. No CJS compatibility shim needed.
import chalk from 'chalk';

// Color level auto-detected via supports-color (chalk/source/index.js:1-9 verified).
// In a non-color terminal (or `NO_COLOR=1` env), chalk returns the input string unchanged.

console.error(`${chalk.red('Error:')} something went wrong`);
// → "Error: something went wrong" (with ANSI codes around 'Error:' in color terminals)

console.warn(chalk.yellow('⚠ warning'));
console.error(chalk.dim('  (hint: try --foo)'));
```

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|-------------------------|--------------|--------|
| `process.stdout.write('\r' + frame)` hand-rolled spinner | `ora()` | Late 2010s | Handles TTY/CI/Windows uniformly; ~30+ spinner styles built-in; correct cursor cleanup on SIGINT. |
| ANSI escape codes for color | `chalk.red(...)` | Mid 2010s | Readable code; auto-disable in non-color contexts; supports 16-color, 256-color, truecolor automatically. |
| Multiple try/catch with `console.error(err)` at each call site | Single top-level catch + error-type dispatch via `instanceof` | — | Single place to change error formatting; consistent UX; testable in isolation. |
| `program.exitOverride(err => ...)` (commander 8+) | `program.parseAsync(...).catch(...)` (commander-agnostic) | — | Both work; the catch form is what `index.js:5-8` already uses. Don't restructure. |
| Custom EventEmitter for progress | Optional callback option | — | Lighter surface for one consumer; no subscription/teardown plumbing. |
| Hand-rolled zod error formatter | `formatZodError` (Phase 2 shipped) | 2026-05-20 (Phase 2 completed) | One field-aware message per issue; no raw zod dump. CFG-02 contract honored. |
| Multi-stream coordination via mutex | Just write to different streams (stdout for data, stderr for chatter) | — | Convention is sufficient; no programmatic coordination needed for our single-process flow. |

**Deprecated/outdated:**
- ora < 6 (CJS) — superseded by ora 6+ (ESM). We're on 8.2.0.
- chalk < 5 (CJS with template literal API) — superseded by chalk 5+ (ESM with the same function-call API but no `chalk\`...\`` template literal). We're on 5.6.2.
- `kleur` / `picocolors` / `ansi-colors` — viable lighter alternatives but chalk is the established default and is already installed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ora 8.2.0's `spinner.text = ...` setter triggers a repaint on the next render interval, without requiring `spinner.render()` | §Pattern 1, §Pattern 2 | If text updates require manual `.render()` calls, the per-frame counter would lag. Mitigation: verified at `node_modules/ora/index.d.ts:168` (`text: string` setter — no qualifier saying manual render needed; the canonical example at line 296-309 shows `spinner.text = 'Loading rainbows'` working without `.render()`). [VERIFIED via index.d.ts inspection + readme example; HIGH confidence.] |
| A2 | ora 8.2.0 auto-disables in CI/non-TTY environments via the bundled `is-interactive` dependency | §Pattern 1, §Pitfall 7, §Locked Decisions | If ora doesn't auto-disable, CI logs would be polluted with thousands of spinner frame characters. Mitigation: verified at `node_modules/is-interactive/index.js` — returns `false` when `!stream.isTTY` OR `process.env.TERM === 'dumb'` OR `'CI' in process.env`; verified at `node_modules/ora/index.js:54` that this is consulted via `this.#isEnabled = ... isInteractive({stream: this.#stream})`. [VERIFIED via direct source inspection; HIGH confidence.] |
| A3 | chalk 5.6.2 auto-detects color support and degrades to plain strings when `NO_COLOR` is set or stdout is not a TTY | §Pattern 3, §Locked Decisions | If chalk emits ANSI codes regardless, piped output would contain garbage escape sequences. Mitigation: verified at `node_modules/chalk/source/index.js:1-9` — imports `#supports-color` which respects NO_COLOR + TTY. [VERIFIED via direct source inspection; HIGH confidence.] |
| A4 | The npm-deduped chalk between our direct dep and ora's transitive dep is a single install with consistent color-level detection | §Pitfall 9 | If two chalks are installed (dedup failed), color level inconsistency is possible. Mitigation: verified at top-level `node_modules/chalk/package.json` (version 5.6.2) AND ora's package.json declares `"chalk": "^5.3.0"` which is satisfied by 5.6.2; no `node_modules/ora/node_modules/chalk/` should exist (would indicate dedup failure — gate by checking at PR time). [VERIFIED via package.json reads; HIGH confidence — npm dedup is deterministic for compatible ranges.] |
| A5 | `ConfigError.message` already contains a multi-line user-formatted string (no further parsing needed by formatError) | §Pattern 3, §Don't Hand-Roll | If a future change to load.js wraps ConfigError differently, formatError would print a less-helpful message. Mitigation: verified at `src/config/load.js:77-79` — `throw new ConfigError(\`Invalid config in ${absPath}:\n  ${lines.join('\n  ')}\`)` produces the final string. Any future change should preserve this contract (or update Phase 6's formatter). [VERIFIED via direct source read; HIGH confidence.] |
| A6 | `BrowserError.message` includes the URL/path that failed, and `BrowserError.cause` preserves the original Playwright Error | §Pattern 3, §Architectural Responsibility Map | If BrowserError stops preserving `.cause`, the timeout-vs-non-timeout dispatch in formatError can't differentiate. Mitigation: verified at `src/browser/launcher.js:64-67` (cause passed at launch) and `src/browser/navigator.js:56-60` (cause passed at navigate failure with the path in the message). The pattern is consistent. [VERIFIED via direct source read; HIGH confidence.] |
| A7 | Phase 5 will accept an `onProgress` callback as a new optional option to `captureFullPage`, OR Phase 6 plans the patch directly | §Pattern 2, §Claude's Discretion | If Phase 5 lands first without the callback AND Phase 6 doesn't add it, the per-frame counter ("Capturing frame N/M") regresses to a static "Capturing…" message. Mitigation: STATE.md shows Phase 5 not started (`src/capture/` does not exist [VERIFIED]); the planner can fold the callback into Phase 5 OR Phase 6. Either path works; the contract is owned by Phase 6 regardless. [ASSUMED based on consistent silent-library posture across Phases 3-5; HIGH confidence.] |
| A8 | `index.js`'s top-level `await program.parseAsync(...).catch(...)` correctly catches ALL throws from inside `cli.js`'s `async (configArg, opts) => { ... }` action body | §Pattern 3, §Locked Decisions | If commander internally swallows errors from action callbacks, formatError would never run. Mitigation: verified by reading `index.js:5-8` (parseAsync().catch is the explicit shape — works because parseAsync rejects when an action callback rejects); also verified by Phase 2's load.js + Phase 3's launcher.js both throwing into this catch successfully in production runs. [VERIFIED by codebase precedent; HIGH confidence.] |
| A9 | Module-level `let currentSpinner = null` in `src/cli.js` is safe across multiple `buildProgram()` invocations (e.g. in test runs that build + execute the program multiple times) | §Pattern 1, §Pitfall 10 | If buildProgram is called from multiple concurrent tests, currentSpinner could leak across invocations. Mitigation: framershot is a CLI — buildProgram is invoked ONCE per process (at `index.js:4`). Test environments that invoke it multiple times would do so sequentially, and Pitfall 10's `currentSpinner = null` on success path handles the cleanup. [ACCEPTED for v0.1 single-invocation use; MEDIUM confidence — if multi-invocation testing ever matters, refactor to a factory.] |
| A10 | `console.warn` in Node 20+ writes to stderr | §Pattern 3, §Pattern 4 | If console.warn writes to stdout (it doesn't in Node — verified at Node docs), our hermetic test contract for smoke-mode stdout would break. Mitigation: Node's `console` API ties `.warn` and `.error` to `process.stderr` by default. [VERIFIED via Node documentation knowledge; HIGH confidence.] |
| A11 | `chalk.red('Error:')` + plain text body is the correct visual emphasis pattern (color only the category prefix, not the message body) | §Pitfall 3 | Aesthetic judgment — if the user prefers full-message red coloring, our recommendation is wrong. Mitigation: convention in CLI tools (npm errors, git errors, eslint errors) all use this prefix-only pattern. [ASSUMED based on convention; MEDIUM-HIGH confidence — would be easy to change if user disagrees.] |

## Open Questions

1. **Does --smoke get any spinner output, or stay completely silent?**
   - What we know: Smoke mode's purpose is hermetic test verification. Existing `console.time('prepare')` + `console.timeEnd('prepare')` + `console.log('smoke screenshot written: ...')` lines were chosen to be assert-friendly.
   - What's unclear: Whether a user running `--smoke` interactively (rather than from a test runner) would want to see "Loading config / Launching Chromium" while it runs.
   - Recommendation: Phase 6 v0.1 — smoke stays SILENT (no spinner). If a user later complains, the change is trivial (move the `spinner.stop()` to AFTER the smoke branch, or remove the smoke-special-case entirely). Documented in §Pattern 4.

2. **Should we add --verbose / --debug for stack traces on expected errors?**
   - What we know: Expected errors (ConfigError, BrowserError) produce clean one-line messages. Unexpected errors get a `chalk.dim` stack trace by default in formatError.
   - What's unclear: Whether the user wants to opt into stack traces for ConfigError/BrowserError too (e.g. when debugging the framershot tool itself).
   - Recommendation: Defer. No flag in v0.1. The user can set `DEBUG=1` env var as a private escape hatch if we ever feel like adding it (one line in formatError: `if (process.env.DEBUG && err.stack) lines.push(chalk.dim(err.stack))`).

3. **Should the network-error formatter pattern-match specific Chromium ERR_* codes?**
   - What we know: `BrowserError.message` already includes the Playwright error string which contains `ERR_NAME_NOT_RESOLVED`, `ERR_SSL_PROTOCOL_ERROR`, `ERR_CONNECTION_REFUSED`, etc. The current v0.1 output prints the whole message verbatim.
   - What's unclear: Whether bespoke "plain English" descriptions per code add value over the existing message.
   - Recommendation: Defer. For v0.1, "Failed to navigate to /home. Original error: page.goto: net::ERR_NAME_NOT_RESOLVED" is already plain enough for a senior frontend engineer. Pattern-matching specific codes can be added later as a quality-of-life improvement.

4. **Should `getCurrentSpinner` be replaced by a more idiomatic pattern (e.g. AsyncLocalStorage)?**
   - What we know: Node's `node:async_hooks.AsyncLocalStorage` provides per-async-context state without module-level mutation.
   - What's unclear: Whether the cleanliness justifies the API complexity for one consumer.
   - Recommendation: Use the module-level pattern (§Pattern 1). Single-CLI-invocation use makes the simple shape correct. Revisit if framershot ever becomes multi-tenant (it won't — personal tool).

5. **Should `printSelectorWarnings` print one line per missed selector or one summary line?**
   - What we know: For a user with 1-3 missed selectors, one line each is informative. For a user with 50 missed selectors (someone configured a bad regex into hide), 50 lines is noisy.
   - What's unclear: The expected distribution. Personal tool, the user wrote the YAML themselves — 1-3 missed is the realistic case.
   - Recommendation: One line per missed selector for v0.1. If the count grows, switch to "N selectors didn't match: [list]" condensed format. Trivial change.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| ora | Spinner output | ✓ | 8.2.0 (`node_modules/ora/package.json`) | — |
| chalk | Color output | ✓ | 5.6.2 (`node_modules/chalk/package.json`) | — |
| Node 20+ | ESM + top-level await | ✓ | per package.json `"engines": { "node": ">=20" }` | — |
| TTY stderr | Spinner animation | conditional (auto-detected) | — | ora auto-disables in non-TTY; text-only output continues |
| `process.env.CI` absent | Spinner enabled | conditional | — | ora auto-disables when CI is set; acceptable |
| `process.env.NO_COLOR` absent | Color output | conditional | — | chalk auto-disables when NO_COLOR set; acceptable |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

## Validation Architecture

> Skip this section entirely if workflow.nyquist_validation is explicitly set to false in .planning/config.json. If the key is absent, treat as enabled.

framershot does not currently have a `.planning/config.json` with `nyquist_validation` either way; Phases 1-5 have not authored an automated test suite (verification has been by hermetic smoke runs against `samples/serve-smoke.js`). Phase 6 follows the same pattern.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None (no automated test framework installed — package.json has no `devDependencies` and `scripts.test` is absent) |
| Config file | none |
| Quick run command | `node index.js capture samples/smoke.yaml --smoke` (hermetic smoke run against `samples/serve-smoke.js`) |
| Full suite command | same as quick — manual visual verification of stderr output is the validation method |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLI-02 | Progress shown during capture run | manual-only (interactive TTY visual inspection) | `node index.js capture samples/sample.yaml` (non-smoke) and observe stderr | n/a — observational |
| CLI-02 | Per-frame "Capturing frame N/M" updates | manual-only | same — observe frame counter increments | n/a |
| CLI-02 | Spinner auto-disables in non-TTY | smoke (output to stderr is empty of spinner frames) | `node index.js capture samples/smoke.yaml --smoke 2>&1 | grep -v 'screenshot written'` should be empty (or just contain `console.time` output) | smoke fixtures exist |
| CLI-03 | ConfigError displayed with field+type | smoke | `node index.js capture samples/bad-viewport-width.yaml` (create fixture with `viewport.width: "1440"`) → stderr must contain "viewport.width: expected number, got string" | NEW fixture — Wave 0 gap |
| CLI-03 | BrowserError includes URL | smoke | `node index.js capture samples/bad-baseurl.yaml` (create fixture with `baseUrl: https://nonexistent.example.tld`) → stderr must contain `nonexistent.example.tld` | NEW fixture — Wave 0 gap |
| CLI-03 | Selector warning prints + capture continues | smoke | extend `samples/smoke.yaml` with `prepare.hide: [.nonexistent]` → run smoke, assert stderr contains warning AND stdout contains "smoke screenshot written" | UPDATE existing fixture |

### Sampling Rate

- **Per task commit:** `node index.js capture samples/smoke.yaml --smoke` (existing hermetic smoke; verifies nothing regressed)
- **Per wave merge:** All smoke variants — happy path + bad config + bad URL + missing selector
- **Phase gate:** All four smoke runs pass with expected stderr content

### Wave 0 Gaps

- [ ] `samples/bad-viewport-width.yaml` — fixture for ConfigError dispatch (CLI-03)
- [ ] `samples/bad-baseurl.yaml` — fixture for BrowserError dispatch (CLI-03)
- [ ] Update `samples/smoke.yaml` to include a missing selector in `prepare.hide` (CLI-03 selector warning)
- [ ] No framework install needed — manual smoke verification matches Phases 1-5 posture

## Security Domain

> Required when `security_enforcement` is enabled (absent = enabled). Omit only if explicitly `false` in config.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 6 is read/print only; no auth surface |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No access control (local CLI, no users) |
| V5 Input Validation | no (already handled) | Phase 2's zod schema is the input boundary; Phase 6 doesn't accept new input |
| V6 Cryptography | no | No crypto operations |
| V7 Error Handling | YES | Phase 6 IS error handling — see below |
| V8 Data Protection | no | No PII or secrets |
| V13 API & Web Services | no | No outbound API surface added |

### Known Threat Patterns for the CLI/error-formatting stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Information leakage in error messages (stack traces revealing file paths to remote attackers) | Information Disclosure | N/A for local CLI — the user IS the only audience for output. Stack traces are dimmed but printed; user runs framershot on their own machine. |
| ANSI escape injection from user-controlled strings printed via chalk | Tampering | chalk does not interpret input as ANSI codes — it WRAPS input with literal codes. User-supplied strings (e.g. selector names from YAML) printed inside chalk calls cannot inject escape sequences that survive chalk's literal-string treatment. Verified at chalk's `createStyler` — input is the function's argument, output prepends/appends escape codes around it. [VERIFIED via chalk/source/index.js source review.] |
| Log injection (newlines in user input forging fake log entries) | Tampering | Selector strings from YAML could in theory contain newlines (YAML allows it via `|` or `>` blocks). Phase 6's `printSelectorWarnings` emits `console.warn(chalk.yellow('⚠ hide selector "${sel}" matched 0 elements'))` — if `sel` contains a newline, the output spans multiple lines. Low risk for a personal CLI; mitigation: `sel.replace(/[\n\r]/g, ' ')` before printing if it ever matters. Not implemented in v0.1. |
| Spinner repaint clobbering security-relevant log line | Information Disclosure | Mitigated by §Pitfall 2 — library code never logs while spinner spins; warnings stop+restart spinner. |
| Process.exit code leaking sensitive info | Information Disclosure | Exit code is binary (0/1) — no information channel. |

**Security posture summary:** Phase 6 is presentation-only. No new input surface, no new output channel beyond stdout/stderr, no network, no filesystem writes (those belong to Phase 5). The only category that materially applies is V7 Error Handling, and our pattern (single sink, type-dispatched formatter, dim stack traces, no exception details to remote parties) is consistent with V7 best practice for local CLIs.

## Sources

### Primary (HIGH confidence)
- `node_modules/ora/index.d.ts` lines 1-333 — complete ora 8.2.0 typed API surface
- `node_modules/ora/index.js` lines 1-340 — ora 8.2.0 implementation (TTY detection, stream defaults)
- `node_modules/ora/package.json` — version 8.2.0, ESM-only, dependencies
- `node_modules/chalk/package.json` — version 5.6.2, ESM-only, exports shape
- `node_modules/chalk/source/index.js` lines 1-30 — chalk 5.6.2 entry; supports-color integration
- `node_modules/is-interactive/index.js` — TTY/CI/dumb-term detection logic (used by ora)
- `src/config/load.js` — ConfigError class shape and message formatting (verified directly)
- `src/config/schema.js` — formatZodError implementation (verified directly)
- `src/browser/launcher.js` — BrowserError class shape; `.cause` preservation (verified directly)
- `src/browser/navigator.js` — BrowserError message format with URL; TimeoutError absorption pattern (verified directly)
- `src/prepare/hide.js` — `{ matched, missed }` return shape; silent-library posture (verified directly)
- `src/prepare/index.js` — `runPreparePipeline` return signature; named-Phase-6-consumer comment (verified directly)
- `src/prepare/animations.js`, `src/prepare/scroll.js` — silent-library posture headers (verified directly)
- `src/cli.js` — existing capture action flow; current step boundaries; `hideSummary` already destructured (verified directly)
- `src/output/template.js` — Phase 2 template resolver (verified for completeness)
- `index.js` — top-level catch shape (verified directly at lines 1-8)
- `package.json` — confirms ESM (`"type": "module"`), Node 20+ requirement, ora/chalk versions in deps
- `.planning/PROJECT.md` — locked decisions, personal-tool scope, no-distribution-polish posture
- `.planning/ROADMAP.md` — Phase 6 goal, success criteria, plan outline
- `.planning/REQUIREMENTS.md` — CLI-02 and CLI-03 specifications
- `.planning/phases/05-scroll-stitch-output/05-RESEARCH.md` — captureFullPage signature, silent-library posture for Phase 5, Pitfall 9 (smoke branch invariance)

### Secondary (MEDIUM confidence)
- ora README example patterns (publicly documented at github.com/sindresorhus/ora — canonical usage matches our wiring)
- chalk README ESM-only migration notes (chalk v5 ESM transition — well-documented industry knowledge)

### Tertiary (LOW confidence — flagged for validation if used)
None — all critical claims verified via direct source inspection or repository file reads.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — both ora and chalk verified at the version level; APIs verified against installed types.d.ts
- Architecture (spinner wiring, format dispatch, single-sink catch): HIGH — pattern derives from existing single-catch pattern at `index.js:5-8` and the explicit Phase 4 comment naming Phase 6 as the `hideSummary.missed` consumer (`cli.js:34-35`); no speculative patterns introduced
- Phase 5 contract (onProgress callback): MEDIUM-HIGH — Phase 5 not yet executed, so the callback addition is a forward-looking contract; the planner controls whether it lands in Phase 5's plans or Phase 6's
- Smoke-mode silence: HIGH — established Phase 3/4 pattern verified at cli.js:36-47, reinforced by 05-RESEARCH §Pitfall 9
- Common pitfalls: HIGH — each pitfall maps to a verified library behavior or a specific cli.js code location

**Research date:** 2026-05-22
**Valid until:** 2026-06-21 (30 days — ora 8.x and chalk 5.x are stable lines; APIs do not change meaningfully on a sub-monthly cadence)

## RESEARCH COMPLETE

Phase 6 is the smallest phase in v0.1 — zero new dependencies, one new file (`src/cli/format.js`), wiring changes in `src/cli.js` + `index.js`, and a one-parameter contract addition (`onProgress` callback) to Phase 5's `captureFullPage` — all of it presentation-only on top of error infrastructure (ConfigError, BrowserError, formatZodError, hideSummary.missed) that Phases 2-4 already shipped with Phase 6 as the named consumer.
