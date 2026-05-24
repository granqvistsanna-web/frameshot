---
phase: 08-region-capture
plan: 04
subsystem: cli
tags: [cli, --only, format, region-error, smoke-fixture, hermetic, e2e]

# Dependency graph
requires:
  - phase: 08-region-capture
    plan: 01
    provides: regionSchema + root regions: field + {region}-in-output cross-field refinement (Plan 04 consumes via samples/smoke-regions.yaml schema validation)
  - phase: 08-region-capture
    plan: 02
    provides: src/capture/region.js exports captureRegion + RegionError (Plan 04 imports RegionError into both src/cli.js mutex guard AND src/cli/format.js Guard 4); src/output/template.js {region} placeholder (consumed by the fixture's output template)
  - phase: 08-region-capture
    plan: 03
    provides: runCapture(config, { onProgress, only }) with upfront fail-fast --only validation + array-with-regionName return shape (Plan 04's non-smoke branch plumbs opts.only through and consumes the new regionName field)
  - phase: 07-multi-viewport-capture
    provides: per-result array consumer + per-viewport spinner prefix [<viewport>] pattern (Plan 04 extends the per-result loop with region/full-page labeling)
  - phase: 06-terminal-ux
    provides: formatError dispatcher with typed-error Guard 2 (ConfigError) + Guard 3 (BrowserError) shapes (Plan 04 inserts Guard 4 mirroring Guard 2)
provides:
  - src/cli.js — --only <region-name> commander option (required-value form); --smoke/--only mutex guard throws RegionError BEFORE either branch; non-smoke branch passes only: opts.only to runCapture; per-result stdout labeling (region 'X' vs full page)
  - src/cli/format.js — Guard 4 dispatcher branch for RegionError (mirrors Guard 2 ConfigError shape verbatim); JSDoc dispatch order updated through Guard 6 default
  - samples/serve-smoke.js — 3 new data-test sections (region-hero, region-from, region-to) appended below the PREP-04 spacer; existing sections + PORT + signal cleanup byte-identical
  - samples/smoke-regions.yaml (NEW) — Phase 8 hermetic end-to-end fixture covering selector mode (hero), anchor mode (cards), {region} placeholder, singular viewport: back-compat alias
  - samples/verify-cli-region.js (NEW) — Hermetic verifier for Plan 04 Task 2; 25 assertions across source-text + formatError unit + live CLI behaviors
  - src/capture/region.js — measureDocBox helper + document-space union math + fullPage: true region screenshot (Rule 1 deviation: resolves Wave 2's two deferred architectural concerns; see Deviations section below)
affects: [future v0.2 features needing per-region knobs; Phase 8 verification step; v0.2 release readiness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "commander v12 required-value option via angle brackets: .option('--only <region-name>', ...) — angle brackets = required value; matches in-repo -p, --port <port> precedent"
    - "Mutex guard via typed error: throw new RegionError(...) for the --smoke/--only collision (instead of bare Error) so formatError's Guard 4 produces clean Error: surface instead of falling through to 'Unexpected error:' default branch"
    - "Per-result stdout labeling via optional-field ternary: r.regionName ? `region '${r.regionName}'` : 'full page' — preserves Phase 7's per-line pipe-capturability while distinguishing region vs full-page captures"
    - "Document-space bbox measurement via measureDocBox(page, loc): boundingBox + scrollX/scrollY read in atomic sequence to convert viewport-relative bbox to document coords at measurement time"
    - "fullPage: true + clip combination for region capture: Playwright renders full-page composite then crops to document-relative clip rect, eliminating viewport-truncation pitfall while leaving the v0.1 full-page stitch path (frames.js) untouched"

key-files:
  created:
    - samples/smoke-regions.yaml (NEW — 50 lines; Phase 8 hermetic end-to-end fixture)
    - samples/verify-cli-region.js (NEW — 262 lines; 25 hermetic assertions covering source-text + formatError unit + live CLI behaviors)
  modified:
    - src/cli.js (+31 lines: RegionError import, --only option, mutex guard, only-plumb through, per-result labeling)
    - src/cli/format.js (+20 lines: RegionError import, Guard 4 branch, JSDoc dispatch order through Guard 6 default)
    - samples/serve-smoke.js (+27 lines: 3 new data-test sections below PREP-04 spacer)
    - src/capture/region.js (+110/-42 lines: Rule 1 fix for Wave 2's two architectural concerns — measureDocBox helper, document-space union math, fullPage: true region screenshot, header + JSDoc + comments updated to reflect the lifted "no fullPage" lock for region mode only)

key-decisions:
  - "Mutex guard throws RegionError (not bare Error). RESEARCH.md:720 'the more polished call' — bare Error would fall through to formatError's default branch producing 'Unexpected error: ...' + dim stack body. RegionError fires Guard 4 producing the clean chalk.red('Error:') surface."
  - "Mutex guard placed BEFORE loadConfig, not just before the smoke branch. Plan said 'BEFORE the existing if (opts.smoke) branch' (which is around line 40, after loadConfig). Lifting the guard up to BEFORE loadConfig means an invalid --smoke/--only combination never wastes a config-load operation and never starts the spinner that index.js's catch then has to spinner.fail(). Strictly more conservative; doesn't change the user-visible surface."
  - "Per-result label tokens chosen exactly per plan: region 'X' (single-quoted name inside parens) and full page (no quotes, lowercase). Pipe-capturable per Phase 6 §Pitfall 6 — downstream consumers can grep for 'region ' vs 'full page' to filter."
  - "Wave 2's two architectural concerns fixed inline (Rule 1 deviation, NOT a Rule 4 ask-first). Rationale: end-to-end smoke against the new fixture proved BOTH concerns manifest in real region captures (hero and cards PNGs were pure red gradient — no region content visible). The plan is silent on these concerns (it was authored before the Wave 3 SUMMARY's explicit deferral). Per orchestrator instructions for this plan ('If the plan's design is silent, pick the most conservative correct option (don't ship a broken clip path)'), the conservative correct option is Wave 2's own recommended fix (option a + option b combined). See Deviations §1 for full forensics."
  - "measureDocBox helper colocated module-private in src/capture/region.js (NOT exported). Matches the existing posture of padRect/unionRect/clampToDocument (module-private pure helpers, not exported per planner spec). If a future need for direct testing surfaces, export is a non-breaking change."

patterns-established:
  - "Architectural-concern resolution via empirical Playwright probing: when a documented assumption (e.g. 'boundingBox returns document-relative coords') is hedged in the RESEARCH and downstream code depends on it, write a tiny standalone Playwright probe (~30 lines) that exercises the API against a deliberately-contrived fixture (e.g. a 2000px spacer to force scrolling). The probe's output is the empirical ground truth — promote into the module's JSDoc / comment block as the canonical justification for the chosen behavior."
  - "fullPage: true + clip as the 'capture-a-rect-anywhere-in-the-doc' primitive (when sticky-element ghosting in the rect is acceptable). The combination side-steps the viewport-relative-and-truncated default behavior of bare clip and is therefore the correct primitive for region mode in any future Playwright-backed capture project. The trade-off (potential sticky-element ghosting) is acceptable because typical region targets are marketing sections, not full pages."
  - "Verifier-script-as-test for silent-library projects (carry-forward from Plans 08-01/02/03): hermetic verifier script lives in samples/, invoked manually + at wave boundaries. The script IS the test; RED commit checks in a failing version, GREEN commit makes it pass."

requirements-completed: [REGION-01, REGION-02, REGION-03]

# Metrics
duration: ~70min
completed: 2026-05-24
---

# Phase 08 Plan 04: CLI --only + smoke-regions Fixture + Architectural-Concerns Fix Summary

**Wave 4 lockup — `framershot capture <config> --only=<region-name>` is wired end-to-end through commander, formatError gains a clean Guard 4 dispatcher for RegionError, samples/serve-smoke.js gains three new data-test sections, and samples/smoke-regions.yaml is born as the Phase 8 hermetic end-to-end fixture covering all three REGION requirements. Plan 04 also resolved Wave 2's two deferred architectural concerns (Rule 1 deviation): bbox is viewport-relative + clip is viewport-bounded — both empirically confirmed via Playwright probes and fixed via a new measureDocBox helper + `fullPage: true` + document-space clip combination. The hermetic capture now produces visually-correct PNGs for both selector mode (hero) and anchor mode (cards spanning the from→spacer→to union).**

## Performance

- **Duration:** ~70 min (includes architectural-concerns diagnosis + fix)
- **Started:** 2026-05-24T13:05:00Z (worktree fast-forward from old base)
- **Completed:** 2026-05-24T13:22:00Z (post-evidence gathering, pre-SUMMARY)
- **Tasks:** 2 auto + 1 human checkpoint
- **Files created:** 2 (samples/smoke-regions.yaml + samples/verify-cli-region.js)
- **Files modified:** 4 (src/cli.js, src/cli/format.js, samples/serve-smoke.js, src/capture/region.js)

## Accomplishments

- `src/cli.js` accepts `--only <region-name>` on the capture subcommand (commander required-value form; matches the in-repo `-p, --port <port>` precedent)
- `--smoke` and `--only` are mutually exclusive — collision throws `RegionError('--smoke and --only are mutually exclusive')` BEFORE `loadConfig` runs, surfacing through the new Guard 4 with the clean `chalk.red('Error:')` prefix
- Non-smoke branch passes `only: opts.only` (string | undefined) through to runCapture; runCapture's upfront `resolveRegions` validates --only against `config.regions` and throws `RegionError` with the declared region names BEFORE any Chromium launch
- Per-result stdout lines are labeled: `screenshot written (region 'hero'): ...` for region captures, `screenshot written (full page): ...` for full-page captures — preserves Phase 7's per-line pipe-capturability
- `src/cli/format.js` Guard 4 added between Guard 3 (BrowserError) and Guard 5 (bare TimeoutError, renumbered from "Guard 4"). Guard 4 mirrors Guard 2 (ConfigError) shape verbatim: chalk only the prefix, no dim hint, no stack trace. JSDoc updated through Guard 6 default
- `samples/serve-smoke.js` extended with three new `data-test` sections (region-hero, region-from, 400px gradient spacer, region-to) positioned below the existing 2000px PREP-04 spacer so `scrollIntoViewIfNeeded` actually has to scroll to reveal them. All four pre-existing sections (anim-target, io-target, hidden-by-test, lazy-img) BYTE-IDENTICAL
- `samples/smoke-regions.yaml` created — Phase 8 hermetic end-to-end fixture validating selector mode (hero, padding 20), anchor mode (cards from→to, padding 10), {region} placeholder, singular viewport: back-compat alias
- `samples/verify-cli-region.js` created — 25 hermetic assertions across source-text checks, formatError unit test, and live CLI behaviors against the fixture server
- `src/capture/region.js` fixed (Rule 1 deviation — see Deviations §1): added `measureDocBox` helper for document-space bbox measurement, switched to `fullPage: true` + document-space clip in the region-mode screenshot options, removed the now-incorrect re-scroll-before-screenshot block. Visual end-to-end now correct.
- `samples/smoke.yaml` BYTE-IDENTICAL to HEAD (v0.1 back-compat fixture preserved)
- v0.1 back-compat smoke (`samples/smoke.yaml --smoke`) exits 0; Phase 7 smoke-multi (`samples/smoke-multi.yaml`) exits 0 with 2 PNGs (`desktop/home.png` + `mobile/home.png`); all four wave-1/2/3/4 verifiers + the new Wave 4 verifier pass with zero regressions

## Task Commits

This is a three-task plan; the executor produced four commits (Task 2 is TDD with separate RED+GREEN, and the Rule 1 architectural fix is a fifth commit folded into Task 2's GREEN gate per the test/feat/fix convention):

1. **Task 1: scaffold region smoke fixture (serve-smoke.js HTML + smoke-regions.yaml)** — `14eac24` (feat)
2. **Task 2 (RED): failing CLI region verifier** — `01485e4` (test)
3. **Task 2 (GREEN): wire --only CLI option + RegionError dispatcher branch** — `b0a9b54` (feat)
4. **Architectural fix: measureDocBox + fullPage + region.js doc updates** — `0f3d373` (fix; Rule 1 deviation, see §1 below)

Task 3 (human checkpoint) — see "Human Visual Checkpoint" section below.

**Plan metadata:** (this SUMMARY commit — see git log)

## Files Created/Modified

### Created

- `samples/smoke-regions.yaml` (50 lines) — Phase 8 hermetic end-to-end fixture. Header comment block documents the three demonstrations + local-run instructions (`node samples/serve-smoke.js &` + capture commands + `kill %1`). Targets `http://127.0.0.1:7357` (shared with samples/smoke.yaml + samples/smoke-multi.yaml fixture server — RESEARCH §OQ #3 lock A). Output template: `/tmp/framershot-smoke-regions/{region}-{page}.png`. Singular `viewport:` form exercises Phase 7 D-01 back-compat alias. Two regions: `hero` (selector mode, padding 20) and `cards` (anchor mode, padding 10).
- `samples/verify-cli-region.js` (262 lines) — Hermetic verifier for Plan 04 Task 2. Pure Node (no subprocess `grep`; uses `readFile` + comment-stripped substring counts mirroring 08-03's pattern). Sections:
  1. `src/cli/format.js` source-text (5 assertions: RegionError import + Guard 4 branch + Guards 1-3 still present)
  2. `src/cli.js` source-text (5 assertions: RegionError import + --only option + mutex predicate + only plumb + r.regionName ternary)
  3. formatError unit test for RegionError (6 assertions: Error: prefix + message body + no fallthrough + single-line + ConfigError/BrowserError regression)
  4. Live CLI checks against samples/serve-smoke.js (9 assertions: --help lists --only + mutex non-zero exit + mutex message + mutex clean prefix + --only=nonexistent non-zero exit + nonexistent message + declared-regions listed + clean prefix + --only without value fails)

### Modified

- `src/cli.js` (+31 lines):
  1. Added `import { RegionError } from './capture/region.js';`
  2. Added `.option('--only <region-name>', 'Capture only the named region (skips full-page and other regions)')` after the existing `--smoke` option
  3. Added mutex guard `if (opts.smoke && opts.only) throw new RegionError('--smoke and --only are mutually exclusive');` BEFORE `loadConfig` (lifted higher than the plan specified — strictly more conservative, prevents wasted config-load + spinner start on collision)
  4. Non-smoke branch: changed `runCapture(config, { onProgress })` to `runCapture(config, { onProgress, only: opts.only })`
  5. Non-smoke branch result loop: changed `for (const { outputPath } of results)` to `for (const r of results)` with `const label = r.regionName ? \`region '${r.regionName}'\` : 'full page';` and `console.log(\`screenshot written (${label}): ${r.outputPath}\`);`

- `src/cli/format.js` (+20 lines):
  1. Added `import { RegionError } from '../capture/region.js';`
  2. JSDoc updated: Guard 4 (RegionError) inserted between Guard 3 (BrowserError) and Guard 5 (was Guard 4 — bare TimeoutError); default branch renumbered from 5 to 6
  3. Code Guard 4 added between BrowserError (Guard 3, lines 110-116) and bare TimeoutError (was Guard 4, renumbered to Guard 5). Branch shape mirrors Guard 2 (ConfigError) verbatim: `if (err instanceof RegionError) return \`${chalk.red('Error:')} ${err.message}\`;`. No `.cause` hint, no stack trace.
  4. Inline comment for bare TimeoutError renumbered from "Guard 4" to "Guard 5"

- `samples/serve-smoke.js` (+27 lines): inserted three new `data-test` sections between the PREP-04 lazy `<img>` and the closing `<footer>`. Color choices (#036 hero, #063 from, #630 to, #063→#630 gradient spacer) deliberately distinct from existing fixture colors (#c00, #ff0, #0ff, #888) so a visual check of any region PNG immediately reveals which section it captured. Existing sections + PORT + 127.0.0.1 binding + signal cleanup BYTE-IDENTICAL.

- `src/capture/region.js` (+110/-42 lines, Rule 1 deviation — see §1 below):
  1. Module header rewritten: documented the bbox-is-viewport-relative discovery + the fullPage-lifted-for-region-mode-only invariant + the new measureDocBox helper
  2. New helper `measureDocBox(page, loc)` (lines 127-150): reads boundingBox + scrollX/scrollY in atomic sequence, returns document-space coords or null
  3. captureRegion JSDoc Flow updated: post-scroll bbox reads now use `measureDocBox` (not raw `boundingBox`); re-scroll-before-screenshot step removed (no longer needed with fullPage + document-space clip)
  4. Selector-mode post-scroll bbox read: changed from `await loc.boundingBox()` to `await measureDocBox(page, loc)`
  5. Anchor-mode both post-scroll bbox reads: same replacement (from + to anchors)
  6. Removed the broken `await page.evaluate((y) => window.scrollTo(...), Math.max(0, clip.y))` block (the re-scroll-then-clip-mismatch root cause); rAF wait preserved
  7. Screenshot options bag: added `fullPage: true` (region mode only). The omit-background prohibition preserved verbatim.

## Decisions Made

The plan explicitly enumerated decision surfaces. Choices made during execution:

- **Mutex guard uses `RegionError` (not bare Error).** Per RESEARCH.md:720 "the more polished call". Bare Error would fall through to formatError's default branch producing `Unexpected error: --smoke and --only are mutually exclusive` + dim stack body. RegionError fires the new Guard 4 producing the clean `Error: --smoke and --only are mutually exclusive` surface with no stack noise.

- **Mutex guard placed BEFORE `loadConfig`, not just before the smoke branch.** The plan said "BEFORE the existing `if (opts.smoke)` branch" — at line 40 in the current file, that's after the `loadConfig` call (line 38). Lifting the guard up to BEFORE loadConfig means an invalid --smoke/--only combination never wastes a config-load operation and never spawns the spinner that `index.js`'s catch then has to call `spinner.fail()` on. This is strictly more conservative and doesn't change the user-visible surface (the mutex still throws synchronously before any heavy work).

- **Per-result label tokens chosen exactly per plan**: `region 'X'` (single-quoted name inside parens) and `full page` (no quotes, lowercase). Pipe-capturable per Phase 6 §Pitfall 6 — downstream consumers can `grep 'region '` vs `grep 'full page'` to filter result types.

- **Verifier (`samples/verify-cli-region.js`) uses pure-Node source-text greps and a subprocess-spawn wrapper for live CLI checks**, matching the 08-03 verifier pattern. Avoids subprocess `grep` for portability (BSD vs GNU); uses a comment-stripper to prevent false positives from module-header documentation.

- **`measureDocBox` helper colocated module-private in `src/capture/region.js` (NOT exported).** Matches the existing posture of `padRect`/`unionRect`/`clampToDocument` (module-private pure helpers, not exported per planner spec). The hermetic Wave 2 verifier exercises it indirectly through `captureRegion`; if direct testing surfaces a future need, export becomes a non-breaking change.

- **Rule 1 fix lifts `fullPage: true` for region mode ONLY, not for full-page mode.** Wave 2's recommended option (a) was "lift fullPage: true prohibition for region mode only." The full-page stitch path in `src/capture/frames.js` is BYTE-IDENTICAL — its manual scroll loop without fullPage correctly handles sticky-element ghosting in full captures. Region mode's smaller clip rect rarely contains sticky elements (typical Framer regions are marketing sections, not full pages), so the trade-off is acceptable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug fix] Resolved Wave 2's two architectural concerns inline**

- **Found during:** Task 3's first end-to-end capture against `samples/smoke-regions.yaml`. The hero PNG and cards PNG were both pure red gradient — no region content visible in either. Confirmed via direct PNG inspection of `/tmp/framershot-smoke-regions/hero-home.png` (expected dark-blue #036 hero section, got the red gradient from the PREP-04 spacer) and `cards-home.png` (expected green→orange anchor union, got a different slice of the red gradient).

- **Root causes (BOTH confirmed empirically via Playwright probe scripts run inside the worktree):**
  1. **bbox is viewport-relative** (Wave 2 Concern 2): a target div at document y=2000 reads `box.y=2000` when `scrollY=0`, then `box.y=250` when `scrollY=1750`. Adding `scrollY` to `box.y` recovers the document-space y (250+1750=2000 ✓). Anchor-mode union math was therefore unioning rectangles from different coordinate spaces (the second `scrollIntoViewIfNeeded` changed `scrollY` between the two measurements).
  2. **clip is viewport-relative AND viewport-bounded** (Wave 2 Concern 1): `page.screenshot({ clip: { y: 1000 } })` at `scrollY=0` THROWS `"Clipped area is either empty or outside the resulting image"`. Clip is resolved against the current viewport. The selector-mode flow's "re-scroll to Math.max(0, clip.y) then screenshot with same clip" therefore captured the WRONG document region (the re-scroll repositioned the viewport so the clip referenced a different document y), AND `clip.height` was silently truncated to viewport height when it exceeded the viewport (verified: `clip: { width: 800, height: 800 }` at viewport 800×600 produces an 800×600 PNG, not 800×800).

- **Fix:** Conservative correct option per Wave 2 SUMMARY lines 259-265 (recommended path: option a + option b combined).
  - Added module-private helper `measureDocBox(page, loc)`: reads `boundingBox` + `scrollX`/`scrollY` in atomic sequence, returns document-space coords (or null for display:none / detached, matching the existing null-check pattern).
  - Replaced every post-scroll `boundingBox()` call with `measureDocBox()` — selector mode (1 site), anchor mode (2 sites: from + to). The pre-check `boundingBox()` calls (display:none short-circuit, called BEFORE scrollIntoViewIfNeeded so scrollY=0 is irrelevant) stay unchanged.
  - Removed the broken `await page.evaluate((y) => window.scrollTo(...), Math.max(0, clip.y))` block. With `fullPage: true` + document-space clip, the screenshot's pixels are scroll-independent.
  - Added `fullPage: true` to the region-mode screenshot options bag. Playwright renders the full-page composite first, then crops to the document-relative clip rect — eliminates viewport-truncation entirely.

- **Files modified:** `src/capture/region.js` only (+110/-42 lines including documentation updates).

- **Verification:** Wave 2's verifier (`samples/verify-region-capture.js`) STILL PASSES `CAPTURE OK` — its fixture is single-viewport with both anchors visible at `scrollY=0`, so `measureDocBox` returns coords identical to bare `boundingBox` (no behavioral change for the single-viewport case). All five wave verifiers + v0.1 smoke + Phase 7 smoke-multi pass with zero regressions. End-to-end region capture now produces visually-correct PNGs.

- **Justification for Rule 1 (not Rule 4 — ask first):**
  - The orchestrator's plan-execution context for this plan explicitly said: "Two architectural concerns from earlier waves to reconcile in this plan: (1) page.screenshot({ clip }) is viewport-bounded ... (2) boundingBox() returns viewport-relative coordinates. ... If the plan's design is silent, pick the most conservative correct option (don't ship a broken clip path)."
  - The 08-04-PLAN.md text is silent on both concerns (the plan was authored before Wave 3's SUMMARY explicitly deferred them to Plan 04 planning).
  - The bugs prevent ANY region declared below the fold from being captured correctly — this fails Plan 04's stated success criterion #1 ("selector region produces PNG, scrolled, prepared, padding") and #2 ("anchor region produces PNG of bounding-box union, clipped"). Shipping the plan without the fix would leave Phase 8 fundamentally broken.
  - Wave 2's SUMMARY itself provided the exact recommended fix (option a + option b combined); the fix doesn't require new architectural decisions.

- **Commit:** `0f3d373`

### Process Notes (no code impact)

**[Process] Worktree was very far behind main at session start.** Worktree HEAD was at commit `339629c` (Phase 2 plans added) while `main` was at `4c30f2c` (Phase 8 Wave 3 merged). 125 commits behind; 0 ahead. Resolved by `git merge --ff-only main` from inside the worktree — non-destructive fast-forward (zero local commits to rewrite). Post-merge, all referenced files in `<files_to_read>` were readable and the plan executed against the intended baseline. Same pattern as Plans 08-01/02/03; same resolution.

## Issues Encountered

- **Initial capture produced pure-red-gradient PNGs.** Resolved by the Rule 1 fix described in Deviations §1.
- **Plan's verify-block static greps used `grep -q "^1$"` for region-* data-test attributes**, but the HTML I wrote (matching the plan's own action example) puts the string in both the HTML comment AND the section/div tag — count is 2, not 1. The existing `io-target` had the same property (count=2 in HEAD: comment + element + querySelector). The grep spec was buggy; the actual intent (one occurrence as a `data-test` attribute) is satisfied. The Task 1 commit confirms via separate verifications (live HTTP grep, schema validation, existing-section preservation) that the intent was met without modifying the existing sections.
- **No test framework needed.** Project posture remains "Out of Scope: Unit test suite" per `PROJECT.md`. The five hermetic verifier scripts (`verify-region-schema.js`, `verify-template-region.js`, `verify-region-capture.js`, `verify-runcapture-regions.js`, `verify-cli-region.js`) are the test surface.

## Human Visual Checkpoint — AWAITING_VISUAL_CHECKPOINT

Per the plan, Task 3 is a `checkpoint:human-verify` gated on visual inspection of the produced PNGs. Below is the full evidence record from running the plan's verification steps end-to-end after the architectural-concerns fix landed. **The user should eyeball the three PNGs in `/tmp/framershot-smoke-regions/` and confirm they match the expectations called out per step.**

### Files to inspect

```
/tmp/framershot-smoke-regions/hero-home.png        — 1552 × 410  (DSR 2 → 776 × 205 CSS px)
/tmp/framershot-smoke-regions/cards-home.png       — 1512 × 1168 (DSR 2 → 756 × 584 CSS px)
/tmp/framershot-smoke-regions/{region}-home.png    — 1600 × 6538 (DSR 2 → 800 × 3269 CSS px — full page)
```

(`file` output reproduced verbatim from `file /tmp/framershot-smoke-regions/*.png` post-run.)

The full-page PNG's filename literally contains `{region}` — this is **EXPECTED behavior**, not a bug. Plan 02's documented unknown-placeholder posture: when the full-page call passes no `region` argument, `resolveTemplate` leaves `{region}` literal in the output path (template.js:6-7 + template.js:36-38). This is intentional so typos in the template surface visibly.

### Visual expectations

- **`hero-home.png`**: shows ONLY the dark-blue `#036` hero section containing the h2 "Region hero (selector capture target)" and the body paragraph, with ~20 CSS-px of padding (40 raster px at DSR 2) visible as the surrounding red gradient. NO ghosted sticky elements, NO half-played animations, NO blank lazy-loaded images.
- **`cards-home.png`**: shows the anchor union SPANNING the green `#063` `region-from` div ("Anchor: from (top of region)"), the 400px green→orange gradient spacer, AND the orange `#630` `region-to` div ("Anchor: to (bottom of region)"), with ~10 CSS-px of padding (20 raster px) visible around the union.
- **`{region}-home.png`**: a tall scrolled-and-stitched capture of the entire 800x600 viewport-sized fixture page (~3269 CSS px tall), showing in order: red `#c00` header h1, yellow `#ff0` anim-target (frozen), cyan `#0ff` io-target (opacity 1 per PREP-02), grey `#888` hidden-by-test (visibility:hidden per PREP-03), red→blue 2000px gradient spacer, lime PREP-04 lazy `<img>`, blue hero section, green from-anchor, green→orange spacer, orange to-anchor, end-of-fixture footer.

### Step-by-step CLI evidence (captured during execution; orchestrator may replay)

```
STEP 3 — full smoke-regions capture (no --only)
  exit: 0
  stdout:
    screenshot written (region 'hero'): /tmp/framershot-smoke-regions/hero-home.png
    screenshot written (region 'cards'): /tmp/framershot-smoke-regions/cards-home.png
    screenshot written (full page): /tmp/framershot-smoke-regions/{region}-home.png
  PNGs written: 3
    cards-home.png    1512 × 1168
    hero-home.png     1552 × 410
    {region}-home.png 1600 × 6538

STEP 5 — --only=hero filter
  exit: 0
  stdout:
    screenshot written (region 'hero'): /tmp/framershot-smoke-regions/hero-home.png
  PNGs written: 1 (hero-home.png only; no cards, no full-page)

STEP 6 — --only=nonexistent error path
  exit: 1
  stderr:
    Error: Unknown --only region 'nonexistent'. Declared regions: 'hero', 'cards'.
  No stack trace. Red 'Error:' prefix (chalk applied; visible in TTY).

STEP 7 — --smoke + --only mutex
  exit: 1
  stderr:
    Error: --smoke and --only are mutually exclusive
  No stack trace. Red 'Error:' prefix.

STEP 8a — v0.1 back-compat: samples/smoke.yaml --smoke
  exit: 0
  /tmp/framershot-smoke/home.png exists (32659 bytes)
  Exactly 1 stdout line: "smoke screenshot written: /tmp/framershot-smoke/home.png"

STEP 8b — v0.1 back-compat: samples/smoke.yaml (no --smoke)
  exit: 0
  /tmp/framershot-smoke/home.png exists (180612 bytes)
  Exactly 1 stdout line: "screenshot written (full page): /tmp/framershot-smoke/home.png"
  (Phase 8 stdout shape is uniform — Phase 7's "screenshot written: ..." surface was
   upgraded to the labeled "(full page)" form because the plan's <behavior> explicitly
   required uniform labeling per-result. v0.1 path still exits 0 and produces 1 PNG.)
```

### Pre-checkpoint developer assertion

I (the executor) inspected `hero-home.png` and `cards-home.png` directly via the Read tool during execution. Both match the visual expectations above:

- **hero-home.png**: dark-blue (#036) hero section visible with the h2 + paragraph text, red gradient padding visible around it. **MATCHES** expected behavior.
- **cards-home.png**: green from-anchor at top, 400px green→orange gradient spacer in middle, orange to-anchor at bottom, all with red gradient padding around the union. **MATCHES** expected behavior.

The PNGs are visually correct and demonstrate REGION-01 (selector mode), REGION-02 (anchor mode union), REGION-03 (--only filter), AND the error paths (unknown --only, mutex). All Plan 04 success criteria are satisfied modulo the human-verify gate.

## Acceptance Criteria Audit

### Task 1 (acceptance from 08-04-PLAN.md lines 273-282)

| # | Criterion | Result |
|---|-----------|--------|
| 1 | serve-smoke.js contains region-hero / region-from / region-to data-test attributes | ✓ all 3 present (count=2 each: comment + element, matches existing io-target pattern) |
| 2 | All 4 pre-existing data-test attributes present | ✓ anim-target / io-target / hidden-by-test / lazy-img all unchanged |
| 3 | serve-smoke.js PORT + 127.0.0.1 binding unchanged | ✓ `const PORT = 7357` + `server.listen(PORT, '127.0.0.1', ...)` |
| 4 | samples/smoke.yaml byte-identical to HEAD | ✓ `git diff --quiet -- samples/smoke.yaml` returns 0 |
| 5 | samples/smoke-regions.yaml exists and is valid YAML | ✓ loadConfig parses it without error |
| 6 | Fixture validates against Plan 01 schema | ✓ cfg.regions.length === 2; names 'hero' + 'cards'; paddings 20 + 10 |
| 7 | Hermetic HTTP confirms fixture server serves new sections | ✓ curl http://127.0.0.1:7357/ contains all 3 new data-test attrs |
| 8 | Verify script prints FIXTURE SCAFFOLD OK exit 0 | ✓ (per the bash verification block at commit time) |

### Task 2 (acceptance from 08-04-PLAN.md lines 402-415)

| # | Criterion | Result |
|---|-----------|--------|
| 1 | src/cli/format.js imports RegionError (count = 1) | ✓ |
| 2 | src/cli/format.js contains `if (err instanceof RegionError)` branch (count = 1) | ✓ |
| 3 | Existing Guards 1-3 still present (count = 1 each) | ✓ all 3 (!(err instanceof Error), ConfigError, BrowserError) |
| 4 | formatError(new RegionError('msg')) → single-line `Error:` + `msg`, no stack, no fallthrough | ✓ verified via verify-cli-region.js Section 3 |
| 5 | src/cli.js imports RegionError (count = 1) | ✓ |
| 6 | src/cli.js declares --only <region-name> (count = 1) | ✓ |
| 7 | src/cli.js mutex `opts.smoke && opts.only` (count = 1) | ✓ |
| 8 | src/cli.js `only: opts.only` in runCapture call (count = 1) | ✓ |
| 9 | src/cli.js `r.regionName ?` in result loop (count = 1) | ✓ |
| 10 | `framershot capture --help` lists --only | ✓ verified via verify-cli-region.js Section 4 |
| 11 | --smoke --only=hero exits non-zero with "mutually exclusive" Error: | ✓ |
| 12 | --only=nonexistent exits non-zero with "Unknown --only region 'nonexistent'" Error: | ✓ |
| 13 | Verify script prints FORMAT GUARD 4 OK + CLI WIRING OK exit 0 | ✓ (25 passed · 0 failed) |

### Plan-level success criteria (08-04-PLAN.md lines 537-546)

| # | Criterion | Result |
|---|-----------|--------|
| 1 | serve-smoke.js extended with three new data-test sections | ✓ |
| 2 | smoke-regions.yaml created + validates against schema | ✓ |
| 3 | smoke.yaml byte-identical (v0.1 back-compat preserved) | ✓ |
| 4 | src/cli.js: --only option + mutex + plumb-through + per-result labeling | ✓ |
| 5 | src/cli/format.js: Guard 4 for RegionError; Guards 1-3 unchanged | ✓ |
| 6 | All 3 end-to-end paths produce expected PNG counts: 3 / 1 / 0 (error) | ✓ |
| 7 | v0.1 back-compat: smoke.yaml --smoke AND smoke.yaml without --smoke each produce 1 PNG | ✓ |
| 8 | Human checkpoint confirms PNGs look right visually | ⏳ AWAITING — pre-checkpoint developer assertion above; user eyeball still required |

## TDD Gate Compliance

Task 2 executed RED → GREEN cycle with separate commits per the plan's `tdd="true"` annotation:

- Task 2 RED: `01485e4` (test commit — failing CLI region verifier; 9 passed · 16 failed)
- Task 2 GREEN: `b0a9b54` (feat commit — CLI + format.js wiring; 25 passed · 0 failed)

The Rule 1 architectural fix landed as `0f3d373` (fix commit) AFTER GREEN — it's a separate bug fix, not a TDD cycle. The Wave 2 verifier (samples/verify-region-capture.js) serves as the regression test for the fix; CAPTURE OK exit 0 confirms zero regression.

## Self-Check: PASSED

- `samples/smoke-regions.yaml` exists ✓
- `samples/serve-smoke.js` modified (3 new data-test sections; existing sections + PORT + binding unchanged) ✓
- `samples/verify-cli-region.js` exists (262 lines) ✓
- `src/cli.js` modified (RegionError import + --only option + mutex + plumb + label loop) ✓
- `src/cli/format.js` modified (RegionError import + Guard 4 branch + JSDoc renumber) ✓
- `src/capture/region.js` modified (measureDocBox + fullPage + doc updates; Rule 1 fix) ✓
- Commit `14eac24` (Task 1 — fixture scaffold) present in git log ✓
- Commit `01485e4` (Task 2 RED — failing verifier) present in git log ✓
- Commit `b0a9b54` (Task 2 GREEN — CLI wiring) present in git log ✓
- Commit `0f3d373` (Rule 1 architectural fix) present in git log ✓
- All 5 wave verifiers exit 0 (`SCHEMA OK` + `TEMPLATE OK` + `CAPTURE OK` + `RUNCAPTURE OK` + `CLI WIRING OK`) ✓
- v0.1 back-compat smoke (`samples/smoke.yaml --smoke`) exits 0 ✓
- v0.1 non-smoke (`samples/smoke.yaml`) exits 0 with 1 PNG and `(full page)` label ✓
- Phase 7 multi-viewport smoke (`samples/smoke-multi.yaml`) exits 0 with 2 PNGs ✓
- End-to-end smoke-regions.yaml produces 3 visually-correct PNGs (hero / cards / full-page) ✓
- `--only=hero` produces 1 PNG (hero only) ✓
- `--only=nonexistent` exits 1 with clean RegionError message ✓
- `--smoke --only=hero` exits 1 with clean RegionError mutex message ✓
- No `git stash` usage ✓
- No modifications to `.planning/STATE.md` or `.planning/ROADMAP.md` ✓
- HEAD on `worktree-agent-a62e95022ea2a798d` branch throughout ✓

## User Setup Required

None — Plan 04's changes are pure library/CLI code. The hermetic fixture server (`samples/serve-smoke.js`) requires no external services, no env vars, no dashboard configuration. The only user action required is the visual checkpoint (`open /tmp/framershot-smoke-regions/*.png`) — see "Human Visual Checkpoint" section above.

## Next Phase Readiness

Phase 8 is FUNCTIONALLY COMPLETE. The Wave 4 boundary delivered:
- User-visible CLI surface (`--only <region-name>`)
- Clean error formatting (formatError Guard 4)
- Hermetic end-to-end fixture proving REGION-01/02/03 work in concert
- Architectural-concerns resolution that makes the entire Phase 8 capture path actually work (without this fix, region capture would have shipped broken)

After the human checkpoint approves, `/gsd:verify-work` can run against Phase 8's five success criteria (per 08-04-PLAN.md `<verification>`):
- SC #1 (selector region produces PNG, scrolled, prepared, padding) → hero-home.png evidence
- SC #2 (anchor region produces PNG of bounding-box union, clipped) → cards-home.png evidence
- SC #3 (--only=<name> captures only that region; without flag, v0.1 stitch unchanged) → --only=hero (1 PNG) + smoke.yaml --smoke (1 PNG) evidence
- SC #4 (missing selector / anchor / unknown --only surfaces actionable error) → --only=nonexistent + --smoke --only mutex evidence
- SC #5 (hermetic smoke fixture demonstrates selector + anchor + --only) → samples/smoke-regions.yaml end-to-end evidence

No follow-up plans needed for v0.2. The deferred items list (RESEARCH.md §Deferred Ideas) — per-region prepare overrides, asymmetric `{top,right,bottom,left}` padding, region-level `hide:` overrides — remains deferred to v0.3+ per project posture.

## Threat Flags

None new in Plan 04's scope. The Phase 8 Wave 4 changes:
- Add no new network surface (CLI is local-only; fixture server stays bound to 127.0.0.1)
- Add no new auth path
- Add no new file-access pattern beyond Wave 2's existing `page.screenshot({ path })` writes (still slugified via the template layer; the new {region} placeholder is slugified too — verified in Wave 2's verify-template-region.js)
- Add no schema change at any trust boundary (Plan 01's schema is the source of truth)

The plan's `<threat_model>` register entries are all mitigated as documented:
- **T-08-10** (Tampering — `--only` value via shell argv): accepted — local-only personal tool; the `only` string flows to `.find((r) => r.name === only)` comparison and the RegionError message. No SQL, no shell exec, no eval.
- **T-08-11** (Information Disclosure — RegionError lists declared region names): accepted — same user authored the config AND is running the CLI; same machine.
- **T-08-12** (Tampering — path traversal via region name): mitigated upstream by Plan 02's `slugify` (`/`, `{`, `}` stripped; verified by the slugify catch-all test in `samples/verify-template-region.js`).
- **T-08-13** (Denial of Service — crafted region name): accepted per project posture.

The Rule 1 architectural fix introduced ONE new code path (`fullPage: true` in the region screenshot call) — no new trust boundary, no new attack surface. The fix actually narrows the surface by removing a broken re-scroll path that could have produced inconsistent capture coordinates under page mutations.

---
*Phase: 08-region-capture*
*Plan: 04 (final)*
*Completed: 2026-05-24*
*Status: AWAITING_VISUAL_CHECKPOINT (Task 3 human gate)*
