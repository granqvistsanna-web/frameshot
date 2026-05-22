---
phase: 03-browser-navigation
verified: 2026-05-20T12:00:00Z
status: passed
score: 4/4 success criteria verified (CAP-01..CAP-04)
overrides_applied: 0
gaps: []
deferred: []
human_verification: []
notes:
  - "Networkidle TimeoutError discrimination branch (navigator.js:47-62) is correct by inspection but was NOT behaviorally exercised. Hermetic fixture settles instantly; live pubq.se settled in ~5s under the 15s timeout. INFO, not a gap — flagged below."
---

# Phase 3: Browser + Navigation — Verification Report

**Phase Goal:** Playwright launches Chromium, opens the target URL at the configured viewport and retina scale, and waits until the page is fully loaded and fonts are rendered before proceeding.

**Verified:** 2026-05-20
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Roadmap Success Criteria

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | Playwright launches headless Chromium with exact pixel width, height, and deviceScaleFactor from config | PASS | `src/browser/launcher.js:61` (`chromium.launch({ headless: true })`) + `src/browser/launcher.js:70-77` (`viewport: { width, height }`, `deviceScaleFactor`, `baseURL` as siblings of viewport). Hermetic E2E proof: DSR=2 produced 1600×1200 PNG, DSR=3 produced 2400×1800 PNG (PNG IHDR bytes 16-23 read by Node — see 03-02-SUMMARY.md §Verification Step 7 & 9). |
| 2 | Browser navigates to `baseUrl + page.path` and does not proceed until network activity is idle | PASS | `src/browser/navigator.js:42-45` — `page.goto(pageConfig.path, { waitUntil: 'networkidle', timeout: 15000 })`. `pageConfig.path` is passed alone; the context's `baseURL` (set in launcher.js:76) handles WHATWG-compliant URL joining — no manual concat. Hermetic E2E proof: `_navigated` field reports `http://127.0.0.1:7357/`; live proof: pubq.se URL recorded in stdout of step 10. |
| 3 | Capture does not proceed until `document.fonts.ready` resolves | PASS | `src/browser/navigator.js:73-75` — `page.waitForFunction(() => document.fonts.ready, null, { timeout: 15000 })`. NOT `page.evaluate` (verified absent — RESEARCH.md §Pitfall 6 honored). Live-site proof: pubq.se PNG (2880×1800, 3.5 MB) shows Framer-served web fonts on the "Coming soon" copy and the pubq logotype, NOT Arial/Helvetica/system-ui fallbacks. |
| 4 | A screenshot taken immediately after navigation shows the page rendered at the correct viewport size in the output file dimensions | PASS | `src/cli.js:39` — `navigatedPage.screenshot({ path: resolvedOutput, fullPage: false })`. Hermetic verify: `viewport: 800×600` × `DSR 2` → IHDR-reported `1600×1200` exactly. DSR=3 sanity: `2400×1800` exactly. Live-site: `1440×900` × DSR 2 → `2880×1800`. These exact dimensions prove viewport AND deviceScaleFactor reached the rendering pipeline (a Pitfall 3 nesting failure would have produced `800×600` / `1440×900`). |

**Score: 4/4 ROADMAP success criteria verified.**

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| CAP-01 | Browser launches Chromium headless with configured viewport width and height | PASS | launcher.js:71-74; hermetic IHDR=1600×1200 confirms viewport reached rendering pipeline |
| CAP-02 | Capture honors `deviceScaleFactor` for retina-quality output (2x or 3x) | PASS | launcher.js:75 (sibling, not nested); both DSR=2 (1600×1200) and DSR=3 (2400×1800) hermetic proofs |
| CAP-03 | Browser navigates to `baseUrl + page path` and waits for `networkidle` before proceeding | PASS | navigator.js:42-45; live pubq.se proof; context baseURL handles joining (launcher.js:76) |
| CAP-04 | Capture waits for `document.fonts.ready` so screenshots don't use fallback fonts | PASS (live-gated) | navigator.js:73-75 (`waitForFunction`, not `evaluate`); live pubq.se PNG shows Framer web fonts, not fallbacks. The hermetic fixture cannot prove BLOCKING (empty font set resolves immediately) — the live-site visual inspection is the documented gate. |

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/browser/launcher.js` | `launchBrowser(config) → { browser, context }` + `BrowserError` class; named `{ chromium }` import; viewport/DSR/baseURL as siblings | VERIFIED | 80 lines including JSDoc; both exports present; library-shape (no console/exit/chalk/ora — grep-verified); JSDoc lifecycle note verbatim at lines 37-50 |
| `src/browser/navigator.js` | `navigateToPage(context, pageConfig) → Page`; imports `BrowserError` from `./launcher.js` (does NOT redefine); networkidle + fonts.ready waits both timeout-tolerant | VERIFIED | 92 lines including JSDoc; `import { BrowserError } from './launcher.js'` at line 17; `DEFAULT_NAV_TIMEOUT_MS = 15000` at line 19; both waits at lines 41-62 and 72-89; library-shape preserved |
| `src/cli.js` | imports `launchBrowser`+`navigateToPage`; `--smoke` option on capture; `(configArg, opts)` action; try/finally with `context.close()` BEFORE `browser.close()` | VERIFIED | Lines 4-5 imports; line 18 option; line 19 action signature; lines 27-61 pipeline; lines 59-60 close-order |
| `samples/smoke.yaml` | Hermetic fixture validating through `loadConfig`; resolves outside repo to `/tmp/framershot-smoke/` | VERIFIED | 39 lines; `baseUrl: http://127.0.0.1:7357` (Rule 1 auto-fix from planner's data: URL — explained in file header and 03-02-SUMMARY.md §Deviations); validates through Phase 2's schema; output path is `/tmp/framershot-smoke/{page}.png` (no .gitignore needed) |
| `samples/serve-smoke.js` | New helper file (planner deviation) — dep-free Node http server for hermetic fixture | VERIFIED | 49 lines; binds 127.0.0.1:7357 only (no traffic leaves the machine); clean shutdown on SIGTERM/SIGINT/SIGHUP; declares NO `@font-face` (intentional — fonts.ready BLOCKING is gated to live site) |

---

## Key Link Verification

| From | To | Via | Status | Evidence |
|------|------|-----|--------|----------|
| `src/browser/launcher.js` | `playwright-chromium` | `import { chromium } from 'playwright-chromium'` (named) | WIRED | launcher.js:12; no default-import variant present; locked by commit 95a1c70 |
| `src/browser/launcher.js` | `config.viewport / deviceScaleFactor / baseUrl` | `browser.newContext({ viewport, deviceScaleFactor, baseURL })` as siblings | WIRED | launcher.js:70-77; siblings (NOT nested); proven hermetically by DPR=2 and DPR=3 PNG dimensions |
| `src/browser/navigator.js` | `src/browser/launcher.js` | `import { BrowserError } from './launcher.js'` (DRY — reuse only) | WIRED | navigator.js:17; no redefinition (grep confirmed) |
| `src/cli.js` | `src/browser/launcher.js` | `import { launchBrowser } from './browser/launcher.js'` | WIRED | cli.js:4; called at cli.js:27 |
| `src/cli.js` | `src/browser/navigator.js` | `import { navigateToPage } from './browser/navigator.js'` | WIRED | cli.js:5; called at cli.js:29 |
| `src/cli.js` | `context.close()` THEN `browser.close()` | try/finally in capture action | WIRED | cli.js:56-61; regex `/context\.close\(\)[\s\S]*?browser\.close\(\)/` matches the source |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/cli.js` smoke branch | `resolvedOutput` | `resolveTemplate(config.output, { date, viewport, page })` from Phase 2 + real `page.screenshot({ path })` | YES — produces PNG bytes on disk at exact `viewport × DSR` dimensions | FLOWING |
| `src/cli.js` non-smoke branch | `_navigated` field | `navigatedPage.url()` after live navigation | YES — non-smoke run JSON shows `http://127.0.0.1:7357/` (hermetic) or `https://pubq.se/` (live) | FLOWING |
| `src/browser/navigator.js` Page return | Page handle | `context.newPage()` after `page.goto(...)` and font wait | YES — downstream `page.screenshot()` produces real rendered bytes; PNG size 3.5 MB on live pubq.se confirms real rendered content | FLOWING |
| `src/browser/launcher.js` `{ browser, context }` | Live Playwright handles | `chromium.launch()` + `browser.newContext()` | YES — DPR readback proves viewport + DSR reached real subprocess | FLOWING |

No hollow-prop or static-return anti-patterns. Every artifact in the wiring chain produces real, observable bytes.

---

## Behavioral Spot-Checks

| Behavior | Command (per executor — already run) | Result | Status |
|----------|------------|--------|--------|
| Hermetic smoke at DSR=2 produces correct PNG dimensions | `node index.js capture samples/smoke.yaml --smoke` (with serve-smoke.js running) | `1600x1200` IHDR | PASS |
| DSR=3 sanity check | `node index.js capture /tmp/smoke-dsr3.yaml --smoke` | `2400x1800` IHDR | PASS |
| Live-site CAP-04 gate against pubq.se | `node index.js capture samples/sample.yaml --smoke` | Exit 0, 2880×1800 PNG, Framer web fonts visually present, 5s wall clock | PASS |
| Non-smoke run prints JSON with `_resolvedOutput` AND `_navigated` | `node index.js capture samples/smoke.yaml` | `_resolvedOutput` + `_navigated: "http://127.0.0.1:7357/"` both present | PASS |

All behavioral checks were already executed by the executor (per task brief — re-running would require spawning `samples/serve-smoke.js` and is unnecessary). Static-source verification of every artifact in the wiring chain confirms the behavior cannot regress from what was observed.

---

## Anti-Patterns Scan

| File | Pattern | Severity | Disposition |
|------|---------|----------|-------------|
| src/browser/launcher.js | TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER | none | clean |
| src/browser/navigator.js | TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER | none | clean |
| src/cli.js | TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER | none | clean |
| samples/smoke.yaml | TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER | none | clean |
| samples/serve-smoke.js | TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER | none | clean |
| src/ (all) | `fullPage: true` (RESEARCH.md §What NOT To Do #7) | none | clean — `fullPage: false` is explicit at cli.js:39; no `fullPage: true` anywhere under src/ |
| src/browser/* | `console.*` / `process.exit` / `chalk` / `ora` imports | none | clean — library-shape preserved (grep returned zero matches in non-comment lines) |
| src/browser/navigator.js | `page.evaluate(() => document.fonts.ready)` (Pitfall 6) | none | clean — `page.waitForFunction(...)` used instead |
| src/browser/navigator.js | Second `export class BrowserError` (DRY violation) | none | clean — imported, not redefined |

No anti-patterns found. No debt markers in phase-modified files.

---

## Notable Observations (INFO — not gaps)

### NetworkIdle TimeoutError Discrimination Branch Untested at Runtime

The plan's `<self_check>` predicted that the live pubq.se site would trigger the 15s `networkidle` timeout (RESEARCH.md §Pitfall 2 — Framer's WebSocket Server API + analytics beacons), which would exercise the `err.name === 'TimeoutError'` discrimination guard at navigator.js:47-62. In the executor's actual live-site run, pubq.se settled cleanly in ~5s (currently in "Coming soon" placeholder mode — minimal scripts, no production Framer Server API yet). **The TimeoutError branch is correct by static inspection** (proper error-class discriminator, BrowserError wrapping on the non-timeout path, no logging, no rethrow on TimeoutError) **but was not behaviorally exercised by this phase's verification.**

Disposition: **ACCEPTED** for Phase 3. The branch will be exercised naturally once pubq.se ships its production Framer build with the Server API + WebSocket back-end fully wired, OR in Phase 6 when terminal UX work may want to surface networkidle timeouts as warnings (per navigator.js:50-52 comment). No code change required. Recorded for the phase log so this isn't re-discovered as a "missing test" later.

### Hermetic Fixture Deviation (Auto-Fixed During Execution)

The planner specified a `data:text/html,...` URL for `samples/smoke.yaml`'s baseUrl. Two facts discovered during execution made that unworkable: (1) Phase 2 commit `1af0f2a` (security fix landed AFTER Phase 3 was planned) restricts `baseUrl` to `http://` or `https://` schemes; (2) Playwright 1.60 rejects `page.goto('/')` against a `data:` baseURL because `data:` URLs are opaque under WHATWG URL joining. Executor auto-fixed via `samples/serve-smoke.js` — a 49-line dep-free Node http server bound to `127.0.0.1:7357`. Hermetic intent (no external network) is preserved; the page bytes are inlined in the helper. Documented in 03-02-SUMMARY.md §Deviations and in the YAML header comment.

Disposition: **ACCEPTED** — the production code paths in `src/browser/navigator.js` and `src/cli.js` ship exactly as the planner prescribed. Only the test fixture changed. The fix is independently audited (Phase 2 schema and Playwright 1.60 behavior verified by direct experiments documented in the SUMMARY).

---

## Gaps Summary

**None.**

All four ROADMAP success criteria pass. All four v1 requirements (CAP-01..CAP-04) are satisfied. All key links wired, all artifacts substantive, all data flows confirmed. Two acknowledged observations are recorded above as INFO — neither blocks Phase 4 readiness.

The Phase 3 browser layer is complete and ready to be consumed by Phase 4's prepare pipeline (which will operate on the `Page` returned by `navigateToPage`) and Phase 5's scroll-stitch loop (which inherits the CLI-layer try/finally lifecycle).

---

*Verified: 2026-05-20*
*Verifier: Claude (gsd-verifier)*
