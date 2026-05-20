---
phase: 03-browser-navigation
plan: 02
subsystem: browser
tags: [playwright, chromium, navigation, networkidle, fonts-ready, commander, cli, esm]

# Dependency graph
requires:
  - phase: 03-01
    provides: src/browser/launcher.js exporting launchBrowser(config) → { browser, context } and BrowserError (Error subclass with .cause)
  - phase: 02-cli-config
    provides: src/cli.js (buildProgram with capture <config> subcommand), src/config/load.js (loadConfig + ConfigError), src/output/template.js (resolveTemplate)
provides:
  - "src/browser/navigator.js — navigateToPage(context, pageConfig) → Page (CAP-03 + CAP-04 implementation)"
  - "Reuses BrowserError from src/browser/launcher.js (DRY — does NOT redefine)"
  - "src/cli.js capture action: launch → navigate → branch(smoke screenshot OR pass-through with _navigated) → close. try/finally owns context.close BEFORE browser.close (Playwright #6319 — RESEARCH.md §Pitfall 5)"
  - "--smoke flag on the capture subcommand (commander v12 .option/.action — identical surface in v14)"
  - "samples/smoke.yaml — hermetic fixture (localhost http://127.0.0.1:7357/) validating cleanly through Phase 2's loadConfig"
  - "samples/serve-smoke.js — 30-line Node http fixture server (no deps) for hermetic verification (added as a Rule 1 deviation — see below)"
affects: [04-prepare (will consume the Page returned by navigateToPage), 05-capture (inherits the CLI-layer try/finally lifecycle pattern), 06-terminal-ux (top-level catch in index.js still formats BrowserError messages)]

# Tech tracking
tech-stack:
  added: []  # Zero new dependencies. RESEARCH.md §Package Legitimacy Audit confirmed; verified by `git diff --stat package.json` (unchanged across the three commits).
  patterns:
    - "TimeoutError discrimination: err.name === 'TimeoutError' branches between recoverable (networkidle never settles / fonts.ready slow) and fatal (DNS, SSL, invalid URL). Both classes wrapped in BrowserError on the fatal branch."
    - "waitForFunction (not page.evaluate) for predicate-based waits (RESEARCH.md §Pitfall 6 — intent-expressing form, navigation-timeout semantics)"
    - "DEFAULT_NAV_TIMEOUT_MS = 15000 module-local constant shared by both networkidle and fonts.ready waits (RESEARCH.md §Pitfall 2 — 30s default is too long a blind hang on Framer's WebSocket-haunted networkidle)"
    - "Browser-layer lifecycle owned at the CLI: launchBrowser is called outside try; navigateToPage + the branch live inside try; context.close → browser.close runs in finally in that order"
    - "Dynamic import() of node:fs/promises and node:path inside the action body (Phase 5 will own a proper writer module and lift these to top-level imports)"

key-files:
  created:
    - src/browser/navigator.js
    - samples/smoke.yaml
    - samples/serve-smoke.js
  modified:
    - src/cli.js

key-decisions:
  - "Replaced the planner's data: URL smoke fixture with a localhost http fixture + tiny Node http server helper (Rule 1 auto-fix). Two blockers: (a) Phase 2's schema .refine (commit 1af0f2a, a security fix landed AFTER Phase 3 was planned) rejects data: schemes — samples/smoke.yaml with baseUrl: data:text/html,... fails validation. (b) Playwright 1.60 rejects page.goto('/') against a data: baseURL because data: URLs are opaque under WHATWG URL joining — new URL('/', 'data:...') throws 'Invalid URL'. The hermetic intent (no external network) is preserved via samples/serve-smoke.js binding 127.0.0.1:7357 only."
  - "Used 127.0.0.1 (not 'localhost') in the smoke fixture baseUrl to avoid IPv6/IPv4 resolution ambiguity on macOS"
  - "Kept the planner's exact action-body structure verbatim (launch outside try → navigate inside try → opts.smoke branch → context.close THEN browser.close in finally) — no scope creep"
  - "fullPage: false EXPLICIT on the screenshot call as anti-regression armor (the default is already false; explicit form makes the prohibition loud for anyone copy-pasting into Phase 5)"
  - "Dynamic import of node:fs/promises and node:path inside the smoke branch (per plan) — avoids top-level imports for a single code path; Phase 5's writer module will lift them"
  - "Preserved 02-01's contract — no try/catch around loadConfig; ConfigError propagates to index.js's top-level catch unchanged. Non-smoke runs still emit JSON with _resolvedOutput, plus the new _navigated: navigatedPage.url() field"

patterns-established:
  - "Module-level DEFAULT_NAV_TIMEOUT_MS constant: name + value co-located with the only file that uses them; not a v0.1 config knob (RESEARCH.md §Open Questions #1 — premature config knob)"
  - "Library modules never log: navigator.js has zero console.* / process.exit / chalk / ora (grep-verified). Errors are typed; presentation belongs to index.js top-level catch (Phase 6 boundary)"
  - "Lifecycle ownership at the CLI layer: browser modules return live handles + throw typed errors; the action handler owns try/finally and the close order. Phases 4 and 5 inherit this — they do NOT duplicate launch/close logic, they consume the returned Page object"
  - "Hermetic fixture pattern: when a test must avoid external network AND the schema disallows data:/file: URLs, spawn a minimal localhost http server (samples/serve-smoke.js) bound to 127.0.0.1 on a fixed port. Pattern is reusable for Phase 5 if a stitching test needs hermetic content too."

requirements-completed: [CAP-03, CAP-04]

# Metrics
duration: 6 min
completed: 2026-05-20
---

# Phase 3 Plan 02: Navigator + CLI Wiring Summary

**Headless Chromium navigator + `--smoke` CLI seam: navigateToPage opens a page in the context returned by 03-01's launcher, awaits `networkidle` and `document.fonts.ready` (both with 15s timeout-tolerant catches per RESEARCH.md §Pattern 2), and the `framershot capture <config> --smoke` pipeline writes a viewport×DSR PNG to disk — observable hermetically and live-verified against pubq.se at 2880×1800 with Framer web fonts rendered correctly.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-20T08:54:32Z
- **Completed:** 2026-05-20T09:01:15Z
- **Tasks:** 3 (autonomous)
- **Files modified:** 3 created, 1 modified

## Accomplishments

- `src/browser/navigator.js`: exports `async navigateToPage(context, pageConfig) → Page`. Imports `BrowserError` from `./launcher.js` (DRY — does NOT redefine). `DEFAULT_NAV_TIMEOUT_MS = 15000` constant shared by both waits. Two timeout-tolerant `try { … } catch (err) { if (err.name === 'TimeoutError') { /* fall through */ } else { throw new BrowserError(…, { cause: err }) } }` blocks around `page.goto(path, { waitUntil: 'networkidle', timeout })` and `page.waitForFunction(() => document.fonts.ready, null, { timeout })`. Pure library code — no `console.*`, no `process.exit`, no chalk/ora (grep-verified). 92 lines including JSDoc.
- `src/cli.js`: adds `import { launchBrowser } from './browser/launcher.js'` and `import { navigateToPage } from './browser/navigator.js'`; declares `.option('--smoke', 'Phase 3 verification: launch, navigate, take ONE screenshot, exit')` on the capture subcommand; the action signature is now `(configArg, opts)`; the body runs the full launch → navigate → branch → close pipeline with `await context.close()` strictly before `await browser.close()` in `finally`. Preserves 02-01's `_resolvedOutput` contract in JSON output; adds `_navigated: navigatedPage.url()` field for non-smoke runs.
- `samples/smoke.yaml` + `samples/serve-smoke.js`: hermetic fixture pair (see DEVIATION below). The YAML validates cleanly through `loadConfig`; the server is a 30-line dep-free `node:http` script binding 127.0.0.1:7357.
- **Hermetic CAP-01 + CAP-02 + CAP-03 proof:** `framershot capture samples/smoke.yaml --smoke` (with `node samples/serve-smoke.js &`) writes `/tmp/framershot-smoke/home.png`. IHDR dims read directly from the PNG by Node: `1600x1200` at DSR=2 and `2400x1800` at DSR=3. Both match `viewport.{width,height} × deviceScaleFactor` exactly.
- **Live-site CAP-04 + CAP-03-discrimination-path proof:** `framershot capture samples/sample.yaml --smoke` against the real `https://pubq.se` — exit 0 in 5 seconds, PNG written at `./screenshots/2026-05-20/desktop/home.png` (3,508,448 bytes), IHDR dims `2880x1800` = 1440 × 2 by 900 × 2. Visual inspection of the PNG confirms the rendered text uses Framer-served web fonts (the **pubq** custom logo wordmark with the distinctive rounded "p" and "q" with tail; "Coming soon" and "New website coming soon" rendered in a modern geometric sans — NOT Arial / Helvetica / system-ui).

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement src/browser/navigator.js** — `77f98ff` (feat)
2. **Task 2: Create samples/smoke.yaml + serve-smoke.js** — `431aceb` (feat)
3. **Task 3: Wire launchBrowser + navigateToPage into src/cli.js's capture action with --smoke** — `0ea6189` (feat)

**Plan metadata commit:** added with this SUMMARY (see final commit hash in `git log`).

## Files Created/Modified

- `src/browser/navigator.js` (created, 92 lines) — `navigateToPage(context, pageConfig)`; reuses `BrowserError` from `./launcher.js`; two TimeoutError-tolerant waits at 15 s each
- `samples/smoke.yaml` (created) — hermetic fixture pointing at `http://127.0.0.1:7357`; 800×600 viewport at DSR=2; output `/tmp/framershot-smoke/{page}.png`
- `samples/serve-smoke.js` (created, ~40 lines) — dep-free Node `http` server hosting the fixture HTML; clean shutdown on `SIGTERM`/`SIGINT`/`SIGHUP`
- `src/cli.js` (modified) — added two imports, the `--smoke` option, rewrote the capture action body for the launch → navigate → branch → close pipeline; preserved the `_resolvedOutput` JSON contract from 02-01 and added the `_navigated` field

## Exported API Surface (this plan's contribution)

### `navigateToPage(context, pageConfig)` (new in src/browser/navigator.js)

```javascript
/**
 * Open a new page in the context, navigate to `pageConfig.path` (joined
 * against the context's baseURL), wait for network to settle (best-effort),
 * and wait for fonts to be ready. Returns the Page.
 *
 * networkidle behavior is INTENTIONALLY timeout-tolerant — Framer's
 * WebSocket Server API + analytics beacons may never let network truly
 * idle. A timeout here is treated as "good enough, move on" rather than
 * a fatal error. Phase 4's prepare pipeline provides redundant settling.
 *
 * @param {BrowserContext} context — the context returned by launchBrowser
 * @param {{ path: string, name: string }} pageConfig — the `config.page` sub-object
 * @returns {Promise<Page>}
 * @throws {BrowserError} on non-TimeoutError navigation failure (DNS, SSL,
 *   invalid URL) or non-TimeoutError fonts.ready failure
 */
export async function navigateToPage(context, pageConfig)
```

Lifecycle: the returned Page belongs to the passed context; the navigator does NOT close it. The CLI layer owns `await context.close(); await browser.close();` in `finally` (in that order).

### `src/cli.js` diff (verbatim shape after replacement)

Imports added (alongside the existing Commander, loadConfig, resolveTemplate imports):

```javascript
import { launchBrowser } from './browser/launcher.js';
import { navigateToPage } from './browser/navigator.js';
```

`--smoke` option added BEFORE `.action(...)`:

```javascript
.option('--smoke', 'Phase 3 verification: launch, navigate, take ONE screenshot, exit')
```

Action signature: `(configArg, opts)`.

Action body shape (lifecycle ordering verbatim):

```javascript
const config = await loadConfig(configArg);
// ... resolveTemplate ...
const { browser, context } = await launchBrowser(config);
try {
  const navigatedPage = await navigateToPage(context, config.page);
  if (opts.smoke) {
    const { mkdir } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    await mkdir(dirname(resolvedOutput), { recursive: true });
    await navigatedPage.screenshot({ path: resolvedOutput, fullPage: false });
    console.log(`smoke screenshot written: ${resolvedOutput}`);
  } else {
    console.log(JSON.stringify({ ...config, _resolvedOutput: resolvedOutput, _navigated: navigatedPage.url() }, null, 2));
  }
} finally {
  // ORDER MATTERS: context first, then browser.
  await context.close();
  await browser.close();
}
```

## Verification Results

### Hermetic Phase Gates (Steps 1–9)

| # | Check | Result |
|---|-------|--------|
| 1 | Module structure (`launcher.js`, `navigator.js`, `cli.js`, `smoke.yaml` all exist) | `files-ok` |
| 2 | `index.js` retains executable bit | `index-executable-ok` |
| 3 | Navigator does not redefine BrowserError (and imports it from `./launcher.js`) | `dry-ok` |
| 4 | CLI imports `launchBrowser`/`navigateToPage`; `--smoke` registered and listed in `--help` | `cli-wired-ok` |
| 5 | Lifecycle close order: `context.close()` appears before `browser.close()` in `src/cli.js` (verified via Node regex — BSD `grep` lacks `-Pzo` on macOS) | `close-order-ok` |
| 6 | No `fullPage: true` anywhere under `src/` | `no-fullpage-ok` |
| 7 | Hermetic smoke E2E at DSR=2 — `framershot capture samples/smoke.yaml --smoke` writes `/tmp/framershot-smoke/home.png` whose IHDR dims = ... | **`1600x1200`** (= 800 × 2 by 600 × 2) |
| 8 | Non-smoke run still prints JSON with `_resolvedOutput` AND `_navigated` | `non-smoke-ok` (both fields present; `_navigated: "http://127.0.0.1:7357/"`) |
| 9 | DSR=3 smoke variant writes `/tmp/smoke-dsr3/home.png` whose IHDR dims = ... | **`2400x1800`** (= 800 × 3 by 600 × 3) |

**Verbatim output of step 7 (CAP-01 + CAP-02 + CAP-03 hermetic proof):**

```
1600x1200
```

**Verbatim output of step 9 (DSR=3 geometry sanity check):**

```
2400x1800
```

These dimensions are read directly from the PNG IHDR chunk (bytes 16-23, big-endian uint32) by Node — no `identify` or ImageMagick involved. They prove that `viewport.{width,height}` AND `deviceScaleFactor` both reached the rendering pipeline as siblings on the browser context (a nested `deviceScaleFactor` inside `viewport` would silently drop to DPR=1 and report `800x600` instead of `1600x1200` — the Pitfall 3 failure mode).

### CAP-04 Live-Site Manual Gate (Step 10)

**Command:**

```
node index.js capture samples/sample.yaml --smoke
```

(pointing at `https://pubq.se` per Phase 2's `samples/sample.yaml`)

**Result:**

- **Exit code:** 0
- **Duration:** 5 seconds (process wall clock)
- **PNG written:** `./screenshots/2026-05-20/desktop/home.png`
- **PNG dimensions (IHDR):** **`2880x1800`** (= 1440 × 2 by 900 × 2 — matches `sample.yaml`'s 1440×900 viewport × DSR 2 exactly)
- **PNG file size:** 3,508,448 bytes (3.3 MB) — definitively non-empty, indicating real rendered content with multiple layers
- **No TimeoutError leaked:** the process exited cleanly without any stack trace; the navigator's TimeoutError discrimination path did not need to suppress anything (see "Networkidle observation" below)
- **CLI stdout:** `smoke screenshot written: ./screenshots/2026-05-20/desktop/home.png` (single line)

**Visual font observation (the CAP-04 proof):**

pubq.se is currently in a "Coming soon" placeholder state. The captured PNG shows:

- The **pubq** wordmark logo at the page center — a custom rounded geometric font with the distinctive "p" (closed circle bowl) and "q" (closed circle bowl with tail). This is the brand's own logotype, not a system font.
- "**Coming soon**" headline rendered in a clean modern geometric sans-serif (Inter / Framer-served font — NOT Arial, Helvetica, or system-ui)
- "New website coming soon" subtitle in the same geometric sans, smaller weight
- The background is a blue/violet gradient with subtle wave/cloth-texture patterns characteristic of Framer-hosted hero backgrounds

**Disposition:** **CAP-04 PASSED** — Framer-served web fonts rendered correctly. Browser fallback fonts (which would have been the metric-incompatible Arial / Helvetica / system-ui under macOS) are NOT what appears in the PNG. The navigator's `await page.waitForFunction(() => document.fonts.ready, null, { timeout: 15000 })` successfully blocked until the font swap completed before the screenshot fired.

**Networkidle observation (the CAP-03 TimeoutError-discrimination-path coverage gap):**

The plan's `<self_check>` block predicted that the live pubq.se site would trigger the 15s `networkidle` timeout (RESEARCH.md §Pitfall 2 — Framer's WebSocket Server API + analytics beacons keep network "busy"). **In this specific run, that did NOT happen** — the page reached `networkidle` naturally in roughly 5 seconds, well under the 15s timeout. This is consistent with pubq.se currently being in "Coming soon" placeholder mode: a single static page with minimal scripts, fewer-than-typical analytics beacons, and likely no full Framer Server API WebSocket connection. The TimeoutError discrimination branch in `navigateToPage` (the `if (err.name === 'TimeoutError') { /* fall through */ }` guard around `page.goto`) therefore was NOT exercised on this run. The code path remains correct (it is exercised by the hermetic Task 1 verify only in the sense that the discriminator is invoked when the wait succeeds — the path is dormant); fuller coverage of the timeout branch will accrue naturally once pubq.se publishes its production Framer build with the Server API + WebSocket back-end fully wired. No code change needed; observation is for the record.

## Decisions Made

1. **Use 127.0.0.1 (literal IPv4) in the smoke fixture baseUrl** rather than `localhost`. macOS resolves `localhost` to both `127.0.0.1` (IPv4) and `::1` (IPv6) and Node's `http.createServer` only binds to one family at a time — using the literal address avoids a class of flakes where Playwright tries the wrong family. Documented in `samples/smoke.yaml`'s header comment.

2. **`fullPage: false` EXPLICIT on the screenshot call.** The default is already `false`, but spelling it out — and combining with the phase-level `! grep -rq 'fullPage: true' src/` gate — gives Phase 5's planner anti-regression armor. The plan's RESEARCH.md §What NOT To Do #7 prohibition is then defended both by code intent AND by a grep gate.

3. **Dynamic `import()` of `node:fs/promises` and `node:path` inside the smoke branch** (per plan). Avoids two top-level imports for a single Phase 3 code path. Phase 5 will lift these when it owns a proper writer module.

4. **Kept the `_resolvedOutput` key from 02-01 verbatim** in non-smoke JSON output (preserving the 02-01 contract for whatever consumers may inspect it), and ADDED `_navigated: navigatedPage.url()` so non-smoke runs visibly prove the page actually loaded (without writing to disk).

5. **Did NOT add chalk/ora/--debug/--verbose/--timeout** — explicitly out of scope per the plan's action block and orchestrator constraints.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced data: URL smoke fixture with localhost http fixture + helper server**

- **Found during:** Task 1 (verify block tried `page.goto('/', { waitUntil: 'networkidle' })` against a data: baseURL)
- **Issue (compound):** The planner specified `samples/smoke.yaml` with `baseUrl: data:text/html,...` and `page.path: "/"` for full network-free hermeticity. Two facts discovered during execution made this approach unworkable:
  1. **Schema rejection:** Phase 2's `src/config/schema.js` has a `.refine` on `baseUrl` (added in commit `1af0f2a`, a security fix landed AFTER Phase 3 was planned) that restricts the field to `http://` or `https://` schemes. A data: URL fails `loadConfig` with `baseUrl: baseUrl must use http or https`.
  2. **Playwright/WHATWG rejection:** Even with the schema relaxed, `page.goto('/', ...)` against a data: baseURL throws `page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL`. The root cause is that data: URLs are opaque under WHATWG URL semantics — `new URL("/", "data:text/html,...")` throws `Invalid URL`. Verified directly:
     ```
     $ node -e "try { new URL('/', 'data:text/html,<h1>hi</h1>'); } catch (e) { console.log(e.message); }"
     Invalid URL
     ```
- **Fix:** Replaced the data: URL approach with a localhost http fixture:
  - `samples/smoke.yaml` now uses `baseUrl: http://127.0.0.1:7357` (passes the `.refine` guard; `page.goto('/')` joins cleanly to `http://127.0.0.1:7357/`).
  - Added `samples/serve-smoke.js` — a 40-line dep-free Node `http` server that hosts a deterministic red page on `127.0.0.1:7357`. Clean shutdown on SIGTERM/SIGINT/SIGHUP.
  - The hermetic intent (no external network, deterministic content) is preserved — 127.0.0.1 binding means no traffic leaves the machine; the page bytes are inlined in the helper.
- **Files modified/added:** `samples/smoke.yaml` (different content than plan-prescribed), `samples/serve-smoke.js` (new file, not in plan)
- **Verification:** All hermetic verify steps (1-9) pass with the new fixture. The Task 1 verify command was also adapted to spawn the helper server before invoking the navigator; the test then proves the navigator's contract (navigation completes, viewport+DPR survive) against a real http response — a stronger test than the original data: URL would have provided.
- **Committed in:** `431aceb` (Task 2 commit) and `0ea6189` (Task 3 commit) — the deviation is described in `samples/smoke.yaml`'s header comment so future readers don't try to "fix" the YAML back to a data: URL.

**2. [Rule 3 - Blocking] Static verification gate adapted to macOS BSD `grep`**

- **Found during:** Phase verification step 5 (close-order check)
- **Issue:** The plan's verify command uses `grep -Pzo "(?s)context\.close\(\)[\s\S]*?browser\.close\(\)"` which relies on GNU `grep`'s `-P` (PCRE) and `-z` (treat input as null-terminated, enabling multiline) flags. macOS ships with BSD `grep` which does not support either. The command fails with `grep: invalid option -- P` even though the source code's close order is correct.
- **Fix:** Re-implemented the close-order check via a one-line Node script that loads the file and tests `/context\.close\(\)[\s\S]*?browser\.close\(\)/`. Same regex, same intent, portable across macOS and Linux.
- **Files modified:** none — the production source already satisfies the constraint; only the verification tool changed.
- **Verification:** The Node-based check returns `close-order-ok` and the regex matches (see `git diff src/cli.js` — the `try { … } finally { await context.close(); await browser.close(); }` block is intact).
- **Committed in:** N/A (verification tool change, not a code change)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)

**Impact on plan:** Both auto-fixes were necessary to complete the verification cycle. Deviation #1 affects only the hermetic verification environment (the `samples/smoke.yaml` shape and the new `samples/serve-smoke.js` helper); the production code paths in `src/browser/navigator.js` and `src/cli.js` ship exactly as the plan prescribed, with the same API shapes, the same lifecycle ordering, and the same TimeoutError-tolerant guards. Deviation #2 is a portability fix to a verifier command — no production impact. No architectural changes; the plan's intent is fully delivered.

## Issues Encountered

None during planned work. The two deviations above were not "issues" in the problem-solving sense — they were straightforward auto-fixes via Rules 1 and 3.

## Authentication Gates

None. Local-only personal-tool scope; no network credentials, no service accounts, no env vars. The pubq.se manual gate (Step 10) is a public marketing site requiring no authentication.

## Threat Surface Confirmation

The plan's `<threat_model>` was honored:

- **T-03-02-SC (npm supply chain — mitigate):** Zero new dependencies. `git diff --stat package.json` is empty across all three task commits.
- **T-03-02-IY (captured screenshot may contain private data — accept):** Smoke screenshots write to `/tmp/framershot-smoke/home.png`; the live-site smoke writes to `./screenshots/2026-05-20/desktop/home.png`. Both paths are user-controlled config. PROJECT.md trust boundary holds.
- **T-03-02-XX (page XSS exfiltrating — accept):** Untrusted JS in the page can fetch attacker URLs but cannot read local files (same-origin enforcement). Unchanged from Phase 1's threat model.
- **T-03-02-NI (long-poll holds networkidle past 15s — mitigate):** The TimeoutError-tolerant catch in `navigateToPage` is the explicit mitigation. Verified live on pubq.se (5s settle); the discrimination path remains correct and untested only because the live target settled cleanly rather than hanging.
- **T-03-02-RC (browser process leak on failure — mitigate):** `try/finally` in `src/cli.js` guarantees `context.close()` AND `browser.close()` even when navigateToPage or the screenshot throws. Regex-verified that context.close appears before browser.close.
- **T-03-02-DOSC (DSR=3 OOM at fullPage — mitigate):** `fullPage: true` literal does not appear anywhere under `src/` (grep-verified). The smoke path is viewport-sized only.
- **T-03-02-FUT-PT (output-path traversal — accept, flagged for Phase 5):** Smoke path writes via `page.screenshot({ path: resolvedOutput })` with `mkdir(dirname, { recursive: true })` and no traversal check. Personal-tool trust boundary holds for v0.1; Phase 5's writer will harden if needed.

No new threat surface introduced beyond what the plan modeled. **No new threat flags surfaced.**

## Hand-off Note for Phase 4

The `navigateToPage` return value (a `Page` object whose `networkidle` and `document.fonts.ready` have already settled) is the entry point for the prepare pipeline (Phase 4). The CLI-layer lifecycle (try/finally in `src/cli.js` owning `context.close → browser.close`) is the production pattern Phase 4 inherits — Phase 4 should NOT duplicate launch/close logic. Specifically:

```javascript
// Phase 4 will insert a prepare(navigatedPage, config.prepare) call inline:
const navigatedPage = await navigateToPage(context, config.page);
await prepare(navigatedPage, config.prepare);   // ← Phase 4's addition
// then either smoke branch or Phase 5's capture loop
```

The dynamic `import()` of `node:fs/promises` and `node:path` inside the smoke branch is a temporary expedient. When Phase 5 ships a real writer module, those imports lift to top-level and the smoke branch shrinks to a single call to that module.

## ROADMAP Phase 3 Success Criteria Status

| SC | Description | Status | Evidence |
|----|-------------|--------|----------|
| 1 | Browser launches headless Chromium with configured viewport | DONE (hermetic) | Step 7: 1600×1200 PNG = 800×600 × DSR 2; Step 9: 2400×1800 = 800×600 × DSR 3 |
| 2 | Capture honors deviceScaleFactor | DONE (hermetic) | Same as SC #1; both DSR=2 and DSR=3 dims reach the rendering pipeline |
| 3 | Browser navigates to baseUrl + page.path and waits for networkidle | DONE (hermetic + live) | Step 7 hermetic + Step 10 live (`_navigated` field shows `http://127.0.0.1:7357/` and `https://pubq.se/`) |
| 4 | Capture waits for document.fonts.ready so screenshots don't use fallback fonts | DONE (live-gated) | Step 10 PNG shows Framer-served web fonts (pubq logotype + Inter-family sans on the "Coming soon" copy), NOT Arial / Helvetica / system-ui |

All four success criteria are now observable. SC #1, #2, #3 are observable hermetically; SC #4 is observable via the live-site manual gate documented above.

## Self-Check: PASSED

- `src/browser/navigator.js`: FOUND (92 lines)
- `samples/smoke.yaml`: FOUND
- `samples/serve-smoke.js`: FOUND
- `src/cli.js`: MODIFIED (imports + --smoke + new action body)
- Commit `77f98ff`: FOUND in `git log --oneline --all`
- Commit `431aceb`: FOUND in `git log --oneline --all`
- Commit `0ea6189`: FOUND in `git log --oneline --all`
- Verification step 1 (file structure): `files-ok`
- Verification step 2 (executable bit on index.js): `index-executable-ok`
- Verification step 3 (no BrowserError redefinition; named import from launcher): `dry-ok`
- Verification step 4 (CLI imports and --smoke registered): `cli-wired-ok`
- Verification step 5 (close-order regex, via Node): `close-order-ok`
- Verification step 6 (no fullPage: true anywhere under src/): `no-fullpage-ok`
- Verification step 7 (DSR=2 hermetic dims): `1600x1200`
- Verification step 8 (non-smoke pass-through with both contract fields): `_resolvedOutput` and `_navigated` both present
- Verification step 9 (DSR=3 hermetic dims): `2400x1800`
- Verification step 10 (live-site CAP-04 gate against pubq.se): exit 0, PNG dims `2880x1800`, 3.5MB, Framer web fonts visually confirmed
- All 15 `<success_criteria>` items in the plan satisfied

## User Setup Required

None — no external service configuration. To reproduce the hermetic gates locally:

```
node samples/serve-smoke.js &
node index.js capture samples/smoke.yaml --smoke
kill %1
```

The PNG lands at `/tmp/framershot-smoke/home.png` (1600×1200).

## Next Phase Readiness

**Ready for Phase 4 (prepare pipeline).** Phase 3's browser layer is complete:

- `launchBrowser(config)` returns `{ browser, context }` with viewport/DSR/baseURL applied (03-01)
- `navigateToPage(context, pageConfig)` returns a settled `Page` (this plan)
- `src/cli.js`'s capture action owns the try/finally lifecycle with the correct close order (this plan)
- `--smoke` is the developer-verification seam; production runs go through the non-smoke branch (which Phase 4 will replace)

Phase 4's responsibilities (per ROADMAP): inject CSS to disable animations (PREP-01), allow per-page `hide:` selectors (PREP-03), implement scroll-prime (PREP-04), honor `extraDelay` (PREP-05). All four operate on the `Page` returned by `navigateToPage`.

---
*Phase: 03-browser-navigation*
*Completed: 2026-05-20*
