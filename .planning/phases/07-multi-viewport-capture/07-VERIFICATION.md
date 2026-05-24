---
phase: 07-multi-viewport-capture
verified: 2026-05-24T12:15:00Z
status: passed
score: 5/5 success criteria verified
overrides_applied: 0
re_verification: null
gaps: []
---

# Phase 7: Multi-viewport Capture — Verification Report

**Phase Goal:** User declares an array of viewports in a single config and one `framershot capture` run produces one full-page PNG per viewport, each with its own browser context.
**Requirement:** MULTI-01
**Verified:** 2026-05-24T12:15:00Z
**Status:** PASS — all 5 success criteria verified against live codebase state
**Re-verification:** No — initial verification

---

## Success Criteria Verdict

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | `viewports: [...]` of 2+ entries → one PNG per viewport in a single `framershot capture` run | PASS | Fresh hermetic run: `node index.js capture samples/smoke-multi.yaml` exits 0, prints 2 `screenshot written:` stdout lines, writes 2 PNGs (1600×4886 desktop, 750×4998 mobile) |
| 2 | `{viewport}` placeholder resolves to per-viewport `name` → distinct paths, no overwrites | PASS | `src/capture/runCapture.js:46` — `resolveTemplate(config.output, { date, viewport: vp.name, page })` re-resolved each iteration; on disk: `/tmp/framershot-smoke-multi/desktop/home.png` and `/tmp/framershot-smoke-multi/mobile/home.png` are distinct files with different bytes (112972 vs 77104) |
| 3 | Each viewport runs in its own Playwright browser context — no shared cookies/storage/animation-shim state | PASS | `src/capture/runCapture.js:45-76` — `for (const vp of config.viewports)` loop calls `launchBrowser(config, vp)` per-iteration (fresh `chromium.launch()` + `browser.newContext()` in `src/browser/launcher.js:60-82`), `installAnimationGuards` re-applied per-iteration, per-iteration `finally { context.close(); browser.close(); }`; the `.does-not-exist` warning firing twice in the live run (once per viewport) is observable proof of per-viewport prepare-pipeline isolation |
| 4 | v0.1 singular `viewport: { ... }` config still validates and runs unchanged | PASS | `src/config/schema.js:94-127` — root `.superRefine` mutual-exclusivity guard + `.transform` normalizes singular → `viewports: [{...}]` with `name ?? 'default'`; fresh run: `node index.js capture samples/smoke.yaml --smoke` exits 0, writes `/tmp/framershot-smoke/home.png`; `samples/smoke.yaml` retains singular `viewport:` shape (lines 36-39) |
| 5 | Hermetic smoke fixture demonstrates 2-viewport run → 2 distinct PNGs end-to-end | PASS | `samples/smoke-multi.yaml` exists (45 lines, 2 viewports `desktop` 800×600 + `mobile` 375×667, `{viewport}` placeholder in output template, targets `samples/serve-smoke.js` at 127.0.0.1:7357); live fresh run produced 2 PNGs with correct raster dimensions (1600×4886, 750×4998 — width = CSS px × DSR 2) |

**Score:** 5 / 5

---

## Artifact Verification (Level 1 — exists, Level 2 — substantive, Level 3 — wired, Level 4 — data flows)

| Artifact | Exists | Substantive | Wired | Data Flows | Status |
|----------|--------|-------------|-------|------------|--------|
| `src/config/schema.js` (viewportEntrySchema, viewportsSchema, normalize transform) | ✓ | ✓ (166 lines, root `.superRefine` + `.transform`) | ✓ (imported by `src/config/load.js`, `src/server/index.js`) | ✓ (transform output observable in runCapture) | VERIFIED |
| `src/config/load.js` (loadConfig returns normalized viewports[]) | ✓ | ✓ (90 lines, 4-step pipeline) | ✓ (imported by `src/cli.js`) | ✓ (yields `config.viewports[]` consumed downstream) | VERIFIED |
| `src/capture/runCapture.js` (per-viewport loop, array return) | ✓ | ✓ (80 lines, `for (const vp of config.viewports)` at line 45, array return at line 79) | ✓ (imported by `src/cli.js` and `src/server/index.js`) | ✓ (results array consumed by both adapters) | VERIFIED |
| `src/browser/launcher.js` (2-arg launchBrowser) | ✓ | ✓ (82 lines, `launchBrowser(config, viewportEntry)` signature line 60, `viewportEntry.width/height` line 73-76) | ✓ (called from `runCapture.js:49` and `cli.js:52`) | ✓ (per-viewport context returned) | VERIFIED |
| `src/cli.js` (per-viewport ora prefix, array consumption) | ✓ | ✓ (142 lines, `[${event.viewport}]` prefix lines 94-96, `for (const { outputPath } of results)` line 108) | ✓ (entrypoint via `index.js`) | ✓ (live run shows `[desktop]`/`[mobile]` prefixes + 2 stdout lines) | VERIFIED |
| `src/server/index.js` (SSE `outputs: [...]` shape) | ✓ | ✓ (221 lines, `results.map(...)` → `outputs: [...]` lines 156-163) | ✓ (started by `cli.js` serve/start commands) | ✓ (singular-shaped POST body still validates per Plan 03 self-check) | VERIFIED |
| `samples/smoke-multi.yaml` (2-viewport hermetic fixture) | ✓ | ✓ (45 lines, 2 viewports + `{viewport}` template + hermetic `127.0.0.1:7357`) | ✓ (consumed by `framershot capture` against `samples/serve-smoke.js`) | ✓ (live run produces both PNGs at distinct paths) | VERIFIED |
| `samples/smoke.yaml` (v0.1 back-compat, unchanged) | ✓ | ✓ (50 lines, retains singular `viewport:` at line 36) | ✓ (consumed by `--smoke` branch) | ✓ (live run exits 0, writes PNG) | VERIFIED |

---

## Key Link Verification

| From | To | Via | Status | Detail |
|------|-----|-----|--------|--------|
| `samples/smoke-multi.yaml` → `loadConfig` | configSchema (viewports[] path) | YAML parse → zod safeParse | WIRED | Live run validates without ConfigError |
| `loadConfig` → `runCapture` | `config.viewports[]` array | normalized schema output | WIRED | `runCapture.js:45` reads `config.viewports` directly |
| `runCapture` → `launchBrowser` | per-viewport `vp` param | function call inside loop | WIRED | `runCapture.js:49` calls `launchBrowser(config, vp)` per iteration |
| `runCapture` → `resolveTemplate` | `{ viewport: vp.name }` | per-iteration call | WIRED | `runCapture.js:46` re-resolves output path per viewport — distinct path guarantee |
| `runCapture` → CLI ora adapter | onProgress events with `viewport: vp.name` | callback injection | WIRED | `cli.js:94-96` reads `event.viewport` and prefixes spinner text |
| `runCapture` → CLI stdout | array return → for-loop stdout | array consumption | WIRED | `cli.js:108-110` emits one `screenshot written:` line per viewport (verified live: 2 lines printed) |
| `runCapture` → server SSE | array return → `outputs: [...]` mapping | done-frame serialization | WIRED | `src/server/index.js:156-163` shapes done frame as `{ type: 'done', outputs: [...] }` |
| Per-viewport context isolation | fresh `chromium.launch()` + `browser.newContext()` per iteration | inside `launchBrowser` called per-iteration | WIRED | No process-level browser pool, no shared context — observable via `.does-not-exist` warning firing twice in live run |

All key links WIRED — no orphaned artifacts, no broken connections.

---

## Behavioral Spot-Checks (live, this session)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Multi-viewport hermetic end-to-end produces 2 distinct PNGs with correct dimensions | `node samples/serve-smoke.js & sleep 1; rm -rf /tmp/framershot-smoke-multi; node index.js capture samples/smoke-multi.yaml; file /tmp/framershot-smoke-multi/*/home.png` | exit 0; both PNGs created; desktop 1600×4886, mobile 750×4998 (CSS px × DSR 2) | PASS |
| Per-viewport spinner prefix appears in stderr | (same run) | `[desktop] Running prepare pipeline` then `[mobile] Running prepare pipeline` observed | PASS |
| Per-viewport prepare-pipeline isolation observable | (same run) | `.does-not-exist` warning fires twice — once per viewport | PASS |
| v0.1 singular `viewport:` config still validates and runs | `node index.js capture samples/smoke.yaml --smoke` | exit 0; `/tmp/framershot-smoke/home.png` produced | PASS |
| Exactly 2 `screenshot written:` stdout lines (pipe-capturable per-viewport summary) | (multi-viewport run) | 2 lines printed (desktop + mobile paths) | PASS |
| Output paths distinct (no overwrite) | byte-size diff of two output PNGs | 112972 vs 77104 bytes — distinct files | PASS |

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| (none) | grep for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` across all Phase-7-modified files returned zero hits | — | None |
| (none) | grep for `config.viewport.` (singular access) in `src/` returned zero non-comment hits | — | Confirms D-01 boundary contract (every downstream consumer reads `config.viewports[]` only) |

No blockers, no warnings.

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| MULTI-01 | Multi-viewport capture — declare array of viewports in one config; produce one PNG per viewport per run; each in its own browser context | SATISFIED | Success criteria 1, 3, 5 above; backed by live hermetic end-to-end |

---

## Human Verification Required

None outstanding for this phase. Plan 07-04's Task 2 human-visual checkpoint (PNG proportionality, `.hidden-by-test` hidden in both viewports, full-page height covered) was approved on 2026-05-24 per `07-04-SUMMARY.md`.

---

## Gaps Summary

None. All 5 ROADMAP success criteria are observably satisfied by the live codebase and a fresh hermetic end-to-end run performed during this verification session. v0.1 back-compat preserved without regression. Zero singular `config.viewport.` access remains in source code. Per-viewport browser-context isolation is observable via repeated `.does-not-exist` warning firing per viewport.

**Overall Phase Verdict: PASS** — Phase 7 goal achieved. Ready to proceed to Phase 8.

---

_Verified: 2026-05-24T12:15:00Z_
_Verifier: Claude (gsd-verifier)_
