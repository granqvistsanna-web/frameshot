# Phase 7: Multi-viewport Capture - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

User declares an array of viewports in a single config and one `framershot capture` run produces one full-page PNG per viewport, each running in its own Playwright browser context (no shared cookies/storage/animation-shim state). The v0.1 single-`viewport` config shape must still validate and run unchanged.

**In scope:**
- Schema accepts plural `viewports: [{ name, width, height }]` alongside the v0.1 singular `viewport: { ... }` block
- One full-page PNG per declared viewport per `framershot capture` run
- `{viewport}` placeholder resolves to the per-viewport `name` so PNG paths are distinct (no overwrites)
- Each viewport gets its own browser context — context lifecycle still context-close-before-browser-close per v0.1 contract
- Hermetic smoke fixture demonstrates a 2-viewport run end-to-end

**Out of scope (deferred past v0.2):**
- Multi-page per config (MULTI-02)
- `--viewport=<name>` CLI filter (MULTI-03)
- `--pages=<list>` CLI filter (MULTI-04)
- Region capture (that's Phase 8: REGION-01/02/03)

</domain>

<decisions>
## Implementation Decisions

### Config Shape

- **D-01: Plural-only internally; singular kept as an input alias.** The zod schema accepts EITHER `viewport: { ... }` (v0.1 form, no deprecation warning — this is a personal tool) OR `viewports: [ ... ]` (new v0.2 form), and the loader normalizes singular → one-element `viewports[]` array before anything downstream reads it. Every downstream consumer (`runCapture`, `launcher`, `output/template`) sees `config.viewports[]` only — zero branching outside the schema/loader. Both keys present in the same config is a config error (mutually exclusive).

- **D-02: `name` is required on every `viewports[]` entry, and names must be unique across the array.** Enforced via zod refinement at validation time so duplicates produce a clean field-named ConfigError ("viewports: duplicate name 'desktop'") instead of a silent PNG overwrite at write time. The `{viewport}` placeholder is the only mechanism preventing overwrites (success criterion #2), so this invariant has to be schema-enforced, not assumed. The singular `viewport.name` stays optional (with the existing `'default'` fallback in path resolution) — back-compat trumps stricter validation for the v0.1 shape.

### Claude's Discretion

These three areas the user delegated. Locking in the lean defaults that match v0.1's shape; flag if downstream research surfaces something that changes the calculus.

- **D-03: `runCapture` seam — loops viewports internally.** The seam was just extracted (commit 220ff9f) precisely so both CLI and server consume one entry point with a streaming `onProgress` event channel. Pushing the loop into `runCapture` keeps that contract clean: callers stay dumb adapters. The function returns `Array<{ outputPath, hideSummary, viewportName }>`, and emits per-viewport scoped events (e.g., `{ type: 'step', viewport: 'desktop', label: ... }`, `{ type: 'frame', viewport: 'desktop', current, total }`). All browser/context lifecycle (including the context-close-before-browser-close invariant from `src/browser/launcher.js`) stays owned inside `runCapture`. The alternative (CLI/server loops, calls `runCapture` per viewport) duplicates lifecycle and progress-stream logic across two callers — exactly what extracting the seam was meant to prevent.

- **D-04: `deviceScaleFactor` stays top-level only.** YAGNI for v0.2. No current Framer-site workflow needs per-viewport DSR (mobile@3x while desktop@2x is a theoretical, not-yet-real use case). Top-level DSR applies to every viewport in the array. If a real need ever surfaces, adding an optional `viewports[].deviceScaleFactor` override on top of the top-level default is a non-breaking schema addition — defer until needed.

- **D-05: Phase 7 is CLI + library scope only; the web UI doesn't gain a multi-viewport surface in this phase.** Reasoning: `src/server/index.js` and `src/server/ui.js` are a thin local UI that takes one viewport's worth of form input. Adding "+/- viewport row" UI affordances + plural form serialization is genuine UI design work, not a side effect of MULTI-01. Doing it in Phase 7 doubles the surface area and dilutes the MULTI-01 acceptance evidence. **However**, the server-side `runCapture` call site must still WORK if it ever receives a multi-viewport config in the future — i.e., the UI's hard-coded `viewport: body.viewport` form-builder shape stays unchanged in this phase, and the server's handling of `runCapture`'s new array-returning shape gets the minimum wiring needed (send per-viewport done events + return all output URLs in the final SSE `done` frame). That's bookkeeping, not UI work.

### Locked behavior (no question — falls out of v0.1 patterns)

- **Partial-failure semantics: fail-fast.** First viewport that throws aborts the run; the top-level catch in `index.js` formats and exits non-zero, matching v0.1's behavior shape. Continuing on error introduces summary-reporting complexity not warranted for a personal tool — re-run the config if one viewport breaks.
- **Parallelism: sequential.** Each viewport runs to completion before the next launches its context. Matches the single-progress-stream UX (ora spinner / SSE), keeps peak memory bounded, and avoids cross-context Playwright resource contention. `--parallel` is a future optimization, not v0.2 scope.
- **Smoke fixture layout: add `samples/smoke-multi.yaml` alongside `samples/smoke.yaml`.** Keeps the v0.1 single-viewport smoke fixture intact as the back-compat acceptance evidence (success criterion #4), and the new `smoke-multi.yaml` is the 2-viewport demo (success criterion #5). Two fixtures, one per success criterion — cleaner than mutating `smoke.yaml` and losing the singular-shape coverage.
- **Error type: no new typed error needed.** ConfigError covers schema validation failures (duplicate names, missing names, both keys present). BrowserError already covers per-context launch failures. A new `ViewportError` would be ceremony with no information gain over the existing dispatcher.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and acceptance
- `.planning/ROADMAP.md` §"Phase 7: Multi-viewport Capture" — goal + 5 success criteria
- `.planning/REQUIREMENTS.md` §"Multi-viewport" — MULTI-01 requirement text + traceability
- `.planning/PROJECT.md` §"Active (v0.2 scope)" + §"Key Decisions" — v0.1 carry-forward decisions still load-bearing
- `.planning/STATE.md` §"Decisions" — explicit list of v0.1 decisions that carry into v0.2

### Existing code touched by this phase (every plan needs these)
- `src/config/schema.js` — current zod schema with singular `viewport: viewportSchema` + `formatZodError` helper. The refinement-and-normalize work lands here.
- `src/config/load.js` — produces the validated config object. Singular→array normalization happens at this boundary.
- `src/capture/runCapture.js` — the seam (commit 220ff9f). Internal loop lands here per D-03.
- `src/browser/launcher.js` — `launchBrowser(config)` currently builds ONE context from `config.viewport.{width,height}` + `config.deviceScaleFactor`. Needs to accept a single viewport entry (signature change: `launchBrowser(config, viewportEntry)`) so `runCapture` can launch N contexts.
- `src/output/template.js` — `resolveTemplate(template, { date, viewport, page })` is unchanged in behavior; `runCapture` just calls it per viewport with the per-viewport name.
- `src/cli.js` — the `capture` command's `--smoke` branch builds a one-shot screenshot from `config.viewport` directly (NOT via runCapture). The smoke path must keep working under the new normalized shape — it reads `config.viewports[0]` instead of `config.viewport`. Same logical behavior, new field name.
- `src/server/index.js` — wiring update only per D-05: handle `runCapture`'s new return shape (array of results), emit per-viewport events, return all output URLs in the SSE `done` frame. UI form stays single-viewport.

### Fixtures and verification
- `samples/smoke.yaml` — stays single-viewport (back-compat acceptance for success criterion #4)
- `samples/sample.yaml` — current real-config example, also single-viewport — leave as-is
- `samples/serve-smoke.js` — the hermetic local fixture server; smoke-multi.yaml points at the same fixture (no server changes needed)

### Prior-phase context worth re-reading
- `.planning/phases/06-terminal-ux/06-RESEARCH.md` §Pitfall 5 — context-close-before-browser-close lifecycle (preserved per-viewport in the new loop)
- `.planning/phases/06-terminal-ux/06-01-SUMMARY.md` — formatError dispatcher pattern (no new error type per D-05 locked-behavior section)
- `.planning/phases/05-scroll-stitch-output/` — scroll-stitch loop that runs PER viewport in the new world

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`runCapture(config, { onProgress })` seam** (`src/capture/runCapture.js`) — already presentation-free, already streaming events. The loop lands inside this function; the contract with CLI/server (ora adapter, SSE stream) stays intact.
- **`launchBrowser(config)`** (`src/browser/launcher.js`) — builds one context. Refactor to `launchBrowser(config, viewportEntry)` and call it N times from inside `runCapture`.
- **`resolveTemplate(template, { date, viewport, page })`** (`src/output/template.js`) — already slugifies `{viewport}`. Per-viewport name flows in via `runCapture`'s loop — no changes here.
- **Zod schema + `formatZodError`** (`src/config/schema.js`) — extend with `viewportEntrySchema` (name required) + `viewportsSchema` (array of 1+, unique names refinement) + mutually-exclusive-keys refinement on root. `formatZodError`'s catch-all already produces field-named messages for refinements; no changes needed there.
- **Prepare pipeline modules** (`src/prepare/animations.js`, `hide.js`, `scroll.js`, `index.js`) — applied per-context (per-viewport) inside the loop, exactly as today. Zero changes.

### Established Patterns

- **Presentation-free library, single error sink in `index.js`** — keep. Per-viewport errors throw normally; the top-level catch formats and exits.
- **Typed errors with `formatError` dispatcher** — no new typed error needed (per D-05 locked-behavior section).
- **Wave-based parallel plan execution with zero `files_modified` overlap** (PROJECT.md Key Decisions) — applies to plan structure: split schema work, runCapture/launcher work, and CLI/server wiring across non-overlapping files where possible.
- **Hermetic smoke fixture as the verification standard** — `samples/smoke-multi.yaml` + a brief CLI invocation demonstrating 2 distinct PNGs is the canonical evidence for success criterion #5.
- **ESM throughout, commander v12, no new deps expected** — confirm during research (PROJECT.md Constraints).

### Integration Points

- **Schema → loader → runCapture data shape transition** — singular `viewport:` input becomes plural `viewports:[one]` internally somewhere between `loadConfig` returning the validated config and `runCapture` consuming it. Cleanest landing spot: zod `.transform()` on the root schema or a small normalize step inside `loadConfig`. Either is fine; planner picks.
- **`runCapture` return shape change** — `Promise<{ outputPath, hideSummary }>` → `Promise<Array<{ outputPath, hideSummary, viewportName }>>`. Two consumers (CLI in `src/cli.js`, server in `src/server/index.js`) update in lockstep.
- **`--smoke` branch in `src/cli.js`** — reads `config.viewport.name` today. Becomes `config.viewports[0].name` after normalization. Trivial.

</code_context>

<specifics>
## Specific Ideas

- The user wants Phase 7 to stay tight: lock the config shape with strong validation, push complexity into the schema/loader so the rest of the code reads one normalized shape, and don't expand the surface area (no UI work, no `--parallel` flag, no `--viewport=<name>` filter, no new error type).
- Two fixtures: `samples/smoke.yaml` (single, back-compat evidence) + `samples/smoke-multi.yaml` (multi, new evidence). Both run against the existing `samples/serve-smoke.js` fixture server.
- "Each viewport gets its own browser context" is a hard invariant from success criterion #3 — no `context.newPage()` reuse across viewports. New browser context every iteration, closed before the next launches (or before browser close in the fail-fast catch path).

</specifics>

<deferred>
## Deferred Ideas

- **Per-viewport `deviceScaleFactor` override** — future schema addition once a real need surfaces (e.g., mobile@3x). Non-breaking when it lands.
- **Web UI multi-viewport surface** — UI form needs "+/- viewport row" affordances + plural serialization. Genuine UI design work; belongs in a follow-up phase, not Phase 7.
- **`--parallel` flag for concurrent viewport runs** — speed optimization; sequential is the v0.2 default.
- **`--continue-on-error` partial-failure mode** — fail-fast is the v0.2 default.
- **`--viewport=<name>` CLI filter (MULTI-03)** — already deferred past v0.2 in REQUIREMENTS.md. Capture here too in case it comes up during planning.

### Reviewed Todos (not folded)

None — no pending todos surfaced by the cross-reference step (STATE.md shows zero).

</deferred>

---

*Phase: 7-Multi-viewport Capture*
*Context gathered: 2026-05-22*
