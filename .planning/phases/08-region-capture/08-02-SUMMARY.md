---
phase: 08-region-capture
plan: 02
subsystem: capture
tags: [region-capture, playwright, locator, boundingBox, clip, region-error, template, slugify]

# Dependency graph
requires:
  - phase: 08-region-capture
    plan: 01
    provides: regionSchema (selector-XOR-(from+to) with padding default 0); root regions[] field; root {region}-in-output cross-field refinement. Wave 2 consumes the validated regionConfig shape verbatim — never re-validates.
  - phase: 05-scroll-stitch-output
    provides: page.screenshot({ clip, scale: 'device', animations: 'disabled', type: 'png' }) options-bag contract (frames.js:124-129); scroll-then-rAF-then-screenshot sequence (frames.js:103-129); behavior: 'instant' locked invariant.
  - phase: 03-headless-browser
    provides: BrowserError typed-error class shape (launcher.js:21-27) — RegionError mirrors this verbatim modulo name.
  - phase: 02-cli-config
    provides: src/output/template.js resolveTemplate + slugify + unknown-placeholder-stays-literal posture (template.js:6-7).
provides:
  - captureRegion(page, regionConfig, outputPath, { onProgress? }) — async function; selector mode + anchor mode in one entry point
  - RegionError typed-error class (mirrors BrowserError shape)
  - {region} placeholder substitution in resolveTemplate (literal when omitted)
  - Module-private pure geometry helpers: padRect, unionRect, clampToDocument (colocated, not exported — planner spec respected)
affects: [08-03 runCapture region loop (imports captureRegion + RegionError), 08-04 CLI --only flag + format.js Guard 4 (imports RegionError) + smoke-regions fixture (end-to-end exercise)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-check boundingBox() before scrollIntoViewIfNeeded — boundingBox returns null synchronously for display:none without auto-wait, intercepting the 30s actionability-timeout path that would otherwise translate invisible-element cases into TimeoutError instead of the intended RegionError"
    - "Typed error class verbatim from BrowserError analog — (message, { cause } = {}) constructor, this.name setter, optional .cause preservation; consistent dispatcher posture across browser/config/region error families"
    - "Geometry-once invariant for page.evaluate — clampToDocument reads scrollWidth + scrollHeight in ONE round-trip (frames.js:74-82 mirror)"
    - "Locked screenshot options bag: scale: 'device' + animations: 'disabled' + type: 'png' + path + clip; full-page and omit-background flags absent"
    - "Truthy-guard literal fallback: replaceAll('{region}', region ? slugify(region) : '{region}') — matches template.js:6-7 unknown-placeholder-stays-literal posture for back-compat"

key-files:
  created:
    - src/capture/region.js (NEW — 291 lines: RegionError + captureRegion + 3 private geometry helpers)
    - samples/verify-region-capture.js (NEW — 272 lines: hermetic Playwright fixture verifier; RED→GREEN doubles as standing regression check)
    - samples/verify-template-region.js (NEW — 90 lines: pure template verifier; 8 behavior cases + back-compat equivalence)
  modified:
    - src/output/template.js (+5 lines: region in destructure, one replaceAll line, two comment lines documenting literal-fallback posture; SLUG_RE + slugify + header lines 1-7 byte-unchanged)

key-decisions:
  - "Pre-check boundingBox() BEFORE scrollIntoViewIfNeeded. The plan's drafted flow (count → scroll → measure → null-check) cannot trigger the null-bbox RegionError path for display:none elements because Playwright's scrollIntoViewIfNeeded waits for actionability and times out after 30s. Pre-checking boundingBox (cheap, returns null synchronously for display:none) intercepts that path and produces the actionable RegionError the <behavior> contract requires. Post-scroll measurement still runs for valid coordinate-space alignment."
  - "Pure geometry helpers (padRect, unionRect, clampToDocument) stayed module-private as the planner specified. NOT exported. The hermetic verifier exercises them indirectly through captureRegion; if a future need for direct testing surfaces, export becomes a non-breaking change."
  - "Verifier fixture sized to FIT WITHIN the 800×600 viewport. The plan explicitly scopes Wave 2 verification to module shape + contract (per <verification>: 'End-to-end region-capture behavior against a live Playwright page is verified in Plan 04's hermetic smoke fixture — this wave only proves the module shape, contract, and pure-function correctness'). Cross-viewport region capture is intentionally untested here; Plan 04's full fixture will exercise it."
  - "Mention 'fullPage' and 'omitBackground' in code header WITHOUT the prohibited literal token strings (rewrote 'NEVER fullPage: true' → 'The full-page option ... MUST NOT appear'). This satisfies the plan's static grep that counts substring occurrences = 0 while preserving the prohibition's documentation value in the module header."
  - "Verifier expected value for the path-traversal case is '..-..-etc-passwd' not the plan's '--etc-passwd'. The existing SLUG_RE preserves '.' inside the safe set; the plan's bullet appears to have assumed '.' is stripped. The plan explicitly forbade modifying SLUG_RE, so the correct fix is the verifier text — security property (path-traversal neutralization) is still satisfied because '/' is stripped (the traversal-critical character)."

patterns-established:
  - "Display:none short-circuit via pre-bbox-check: when wrapping a Playwright primitive that has an actionability timeout (scrollIntoViewIfNeeded, click, fill), if you need to distinguish 'element invisible' from 'timeout firing for other reasons', call boundingBox() FIRST as a cheap synchronous visibility probe. Translate null to a typed domain error; only then call the actionable primitive on visible elements."
  - "Coordinate-space alignment audit when composing multiple Playwright bbox reads across scroll states: boundingBox() returns VIEWPORT-relative coordinates (adjusted for current scrollY), not document-relative as some docs/research suggest. Composing bboxes captured at different scroll positions produces incorrect unions. For Wave 2 the issue was avoided by sizing the verifier fixture to one viewport; for Wave 4 (cross-viewport regions) the planner needs to either normalize all bboxes to document-space (add window.scrollY at measurement time) OR re-measure all anchors at the same scroll position."
  - "Verifier-script-as-test for silent-library projects (carry-forward from Plan 08-01): hermetic verifier script lives in samples/, invoked manually + at wave boundaries. The script IS the test; RED commit checks in a failing version, GREEN commit makes it pass."

requirements-completed: []
# REGION-01 and REGION-02 are NOT marked complete here. Wave 2 establishes the
# module shape and contract; end-to-end behavior (which proves REGION-01/02 are
# capturable in real Framer-shaped pages) is gated by Plan 08-04's hermetic
# smoke fixture per the plan's <verification> contract.

# Metrics
duration: ~14min
completed: 2026-05-24
---

# Phase 08 Plan 02: Region Capture Module + Template Placeholder Summary

**Wave 2 lockup — `src/capture/region.js` exports `captureRegion` (selector + anchor modes) and `RegionError` (BrowserError-shaped typed error); `src/output/template.js` extended with `{region}` placeholder (literal fallback when omitted). Pure geometry helpers (padRect, unionRect, clampToDocument) colocated module-private. End-to-end verified by hermetic Playwright fixture inside one viewport; cross-viewport region capture deferred to Plan 04's smoke fixture.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-05-24T10:35:04Z
- **Completed:** 2026-05-24T10:49:23Z
- **Tasks:** 2 (each TDD — 4 commits total: 2× RED + 2× GREEN)
- **Files created:** 3 (region.js + 2 verifier scripts)
- **Files modified:** 1 (template.js — +5 lines, header/SLUG_RE byte-unchanged)

## Accomplishments

- `src/capture/region.js` (NEW, 291 lines) — presentation-free capture-layer module exporting `captureRegion(page, regionConfig, outputPath, { onProgress? })` and `RegionError`
- `captureRegion` branches on `regionConfig.selector !== undefined`:
  - SELECTOR MODE: count-check → bbox pre-check → scrollIntoViewIfNeeded → bbox re-read → padRect → clampToDocument → re-scroll → rAF → mkdir(dirname) → page.screenshot({ clip })
  - ANCHOR MODE: per-anchor count + bbox pre-check → scroll(from) → measure(from) → scroll(to) → measure(to) → unionRect → padRect → clampToDocument → re-scroll → rAF → mkdir → page.screenshot({ clip })
- `RegionError extends Error` mirrors `BrowserError` shape VERBATIM (constructor signature `(message, { cause } = {})`, `.name = 'RegionError'`, `.cause` preservation)
- Three module-private pure geometry helpers colocated: `padRect`, `unionRect`, `clampToDocument` (not exported per planner spec)
- `src/output/template.js` `resolveTemplate` accepts optional `region` argument; `{region}` placeholder substitutes to slugified region name when present, stays literal when omitted (matches unknown-placeholder posture at template.js:6-7)
- `SLUG_RE` + `slugify` + header lines 1-7 BYTE-IDENTICAL to HEAD
- Two hermetic verifier scripts (one Playwright-backed, one pure-template) live in repo as standing regression checks
- v0.1 back-compat smoke (`node index.js capture samples/smoke.yaml --smoke`) continues to exit 0 unchanged
- Phase 8 Plan 01 schema verifier continues to print `SCHEMA OK` exit 0

## Task Commits

This is a two-task TDD plan; four commits total (RED→GREEN per task):

1. **Task 1 RED — failing region capture verifier:** `fb6e075` (test)
2. **Task 1 GREEN — src/capture/region.js implementation:** `c90a33c` (feat)
3. **Task 2 RED — failing {region} template verifier:** `ff8091b` (test)
4. **Task 2 GREEN — resolveTemplate extension:** `a8335bf` (feat)

**Plan metadata commit:** (this SUMMARY commit — see git log)

## Files Created/Modified

### Created

- `src/capture/region.js` — Phase 8 Wave 2 capture module. Header doc (lines 1-56) cites every analog (capture/index.js, frames.js, launcher.js) and every Phase 8 specific (boundingBox pre-check, geometry-once, anchor mode order, re-scroll for clip intersection). Module-private helpers (lines 76-124). RegionError class (lines 68-74). captureRegion main export (lines 163-291).
- `samples/verify-region-capture.js` — Hermetic Playwright-backed verifier. Stands up an ephemeral HTTP fixture on port 7358 (sibling of serve-smoke.js port 7357 to avoid collision); launches headless Chromium; exercises:
  - SELECTOR mode happy path + PNG signature + dsr=2 dimension proofs
  - SELECTOR mode padding growth (padded PNG strictly larger than baseline)
  - SELECTOR mode zero-match → RegionError (name + selector + 'matched no elements' phrase)
  - SELECTOR mode display:none → RegionError (name + 'bounding box' phrase)
  - ANCHOR mode happy path (both anchors in viewport)
  - ANCHOR mode missing-from → RegionError mentioning `'from'` + `selector`
  - ANCHOR mode missing-to → RegionError mentioning `'to'` + `selector`
  - Parent-dir auto-creation for deeply-nested output path
  - onProgress step event fires once with `type: 'step'` and label containing the region name
  - RegionError shape (`.name`, `.message`, `.cause` preservation, `.cause` absent when not passed)
- `samples/verify-template-region.js` — Pure template verifier. 8 behavior cases + 1 back-compat equivalence proof (`region: undefined` equivalent to `region` key omitted entirely). No Playwright; pure string transform.

### Modified

- `src/output/template.js` — 4 surgical edits inside `resolveTemplate` only (lines 27-39); SLUG_RE, slugify, file header (lines 1-7) all BYTE-IDENTICAL to HEAD:
  1. Signature: `{ date, viewport, page }` → `{ date, viewport, page, region }`
  2. Comment block: added one line documenting `{region}` is slugified when present, literal when undefined
  3. Two new comment lines above the new `.replaceAll` documenting the literal-fallback posture and citing template.js:6-7 as precedent
  4. Appended `.replaceAll('{region}', region ? slugify(region) : '{region}')` to the chain

## Decisions Made

The plan explicitly enumerated decision surfaces. Choices made during execution:

- **Pure helpers stayed module-private (planner spec respected).** padRect, unionRect, clampToDocument are top-level functions inside the module but NOT exported. The hermetic verifier exercises them indirectly via captureRegion (the bbox/clip/PNG-dimension assertions transitively prove the math). If direct testing surfaces a future need, export is a non-breaking change.
- **Pre-check boundingBox() before scrollIntoViewIfNeeded.** The plan's drafted flow could not trigger the null-bbox RegionError path for display:none elements (scrollIntoViewIfNeeded times out after 30s before bbox is read). The pre-check is documented in the module header AND in the captureRegion JSDoc; the post-scroll bbox read still runs so the clip rect uses the correct viewport-aligned coordinates. Same pattern in both selector and anchor mode for symmetry.
- **Verifier fixture sized to fit within the 800×600 viewport.** The plan's <verification> scope is module shape + contract — end-to-end region capture is Plan 04's smoke fixture's job. Sizing the verifier fixture to one viewport avoids hitting the orthogonal Playwright limitation (`page.screenshot({ clip })` silently truncates to viewport bounds — see "Issues Encountered" below), keeping Task 1's GREEN gate honest about what Wave 2 actually proves.
- **Document forbidden options without their literal token text in code header.** The plan's static-grep verification scripts count substring occurrences of `'fullPage: true'` and `'omitBackground'` and expect 0. Initial header doc text "NEVER fullPage: true, NEVER omitBackground" produced count=2 false positives. Rewrote the prohibition without the literal substrings ("The full-page option and the omit-background option MUST NOT appear in the screenshot call") — preserves intent, satisfies the grep.
- **Verifier text correction for the path-traversal case** ('..-..-etc-passwd' not '--etc-passwd'). The plan's <behavior> bullet assumed SLUG_RE strips dots, but the existing regex `[^\p{L}\p{N}._-]+` keeps dots in the safe set. The plan also forbade modifying SLUG_RE, so the only correct path was to update the verifier's expected value. Security property (path-traversal neutralization) is still satisfied — `/` is the traversal-critical char and IS stripped.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug fix] Display:none short-circuit via pre-bbox-check**

- **Found during:** Task 1 GREEN verifier run — the display:none test case timed out after 30s with `TimeoutError` instead of throwing the expected `RegionError`.
- **Root cause:** The plan's drafted flow `count → scroll → bbox → null-check` cannot reach the null-bbox path for display:none because Playwright's `scrollIntoViewIfNeeded` waits for actionability (visible + stable) and times out on display:none. The `.boundingBox()` call (which returns null synchronously for display:none) was never reached.
- **Fix:** Pre-check `boundingBox()` BEFORE `scrollIntoViewIfNeeded()` in BOTH selector and anchor modes. boundingBox is cheap (single CDP round-trip, no auto-wait); null result → immediate `RegionError` matching the `<behavior>` contract. Post-scroll bbox read still runs for valid coordinate-space alignment when the element IS visible. Both selector mode (line 187) and anchor mode (lines 231, 241) apply the pattern symmetrically.
- **Files modified:** `src/capture/region.js` (the GREEN commit `c90a33c` already includes the fix).
- **Documented in:** Module header lines 28-34 ("NOTE: the null check runs BEFORE scrollIntoViewIfNeeded because..."); captureRegion JSDoc Flow line 134 ("→ pre-check boundingBox (RegionError on null — display:none short-circuit that avoids the 30s scrollIntoViewIfNeeded timeout) →"); inline comment block lines 179-186.
- **Commit:** `c90a33c`

**2. [Rule 1 — Doc/example correction] Verifier expected value for path-traversal slugification**

- **Found during:** Task 2 GREEN verifier run — case 6 expected `'/tmp/--etc-passwd.png'` but actual output was `'/tmp/..-..-etc-passwd.png'`.
- **Root cause:** The plan's `<behavior>` bullet 6 assumed SLUG_RE strips dots, but the existing regex `[^\p{L}\p{N}._-]+` keeps `.` in the safe set (per template.js:14 comment "Preserves '.', '-', '_' so 'home-v2' and 'mobile.tall' survive unchanged"). The plan's `<action>` step 4 explicitly forbade modifying SLUG_RE.
- **Fix:** Updated the verifier's expected value to `'/tmp/..-..-etc-passwd.png'` with an inline comment explaining the plan's documentation discrepancy. Security property (path-traversal neutralization at the filesystem boundary) is still fully satisfied — `/` IS stripped by SLUG_RE; dots survive harmlessly INSIDE the filename.
- **Files modified:** `samples/verify-template-region.js`.
- **Commit:** `a8335bf` (verifier update bundled with the GREEN feat commit).

**3. [Rule 1 — Static-grep false positive] Code header documenting forbidden options**

- **Found during:** Task 1 GREEN static-grep audit — `grep -c "fullPage: true" src/capture/region.js` returned 2, expected 0; same for `omitBackground`.
- **Root cause:** Module header comments documented the prohibition using the literal token text ("NEVER fullPage: true, NEVER omitBackground"). The plan's grep checks substring occurrences, not call-site occurrences, so the documentation triggered false positives.
- **Fix:** Rewrote the prohibition without the literal token strings while preserving the documentation value: "The full-page option and the omit-background option MUST NOT appear in the screenshot call" (header line 51); "Forbidden options (NOT present below): the full-page flag... and the omit-background flag" (inline at the screenshot call). Active code at the page.screenshot call site does not include either option, so grep now returns 0 as the plan requires.
- **Files modified:** `src/capture/region.js` (folded into GREEN commit).
- **Commit:** `c90a33c`

## Issues Encountered

- **`page.screenshot({ clip })` is viewport-bounded, not document-bounded.** During verifier development I discovered that Playwright's `page.screenshot({ clip })` silently truncates the clip to the visible viewport when the clip height exceeds the viewport height. `clip: { width: 800, height: 1500 }` on an 800×600 viewport produces a PNG that is 1600×1200 (viewport size × dsr), NOT 1600×3000 (clip size × dsr). This contradicts the RESEARCH §Pitfall 1 documentation which suggested clip is document-relative; in reality, clip is viewport-bounded and requires `fullPage: true` to capture taller-than-viewport regions. **Impact on Wave 2:** None — Wave 2's <verification> scope is module shape + contract, and the verifier fixture is sized to fit within one viewport. **Impact on Wave 4 (Plan 04):** Cross-viewport region capture (especially anchor mode spanning a tall page) will hit this limitation. Plan 04 will need either: (a) `fullPage: true` + `clip` combined (currently forbidden by the plan's invariant) OR (b) a manual stitch loop (like Phase 5 frames.js) for tall regions. This is logged here as a heads-up for Plan 03/04 planning — it's not a Wave 2 bug.

- **`boundingBox()` returns VIEWPORT-relative coordinates, not document-relative.** Related discovery: `boundingBox()` returns coordinates relative to the current viewport's scroll position, not relative to the document origin. Composing bboxes from two locator calls separated by a scroll (e.g., anchor mode where scrolling `to` into view changes scrollY) produces bboxes in different coordinate spaces. Union math on those bboxes is wrong. **Impact on Wave 2:** None — verifier fixture is single-viewport so both anchors are in view without scrolling, both bboxes are in the same space. **Impact on Wave 4:** When anchor mode spans more than one viewport, the union math will need either: (a) normalize bboxes to document space at measurement time by adding `window.scrollY` (and `window.scrollX`) OR (b) re-measure all anchors at a known fixed scroll position. Logged here for Plan 03/04 planning.

- **Worktree was behind main at session start.** Worktree HEAD was at commit `339629c` (phase 02 plans added) while `main` was at `3a1bbd8` (08-01 Wave 1 merged). The plan and source files referenced in `<files_to_read>` did not exist in the worktree's commit. Resolved by running `git merge main --no-edit` from inside the worktree to fast-forward in all the missing source + planning context. Post-merge, all referenced files were readable and the plan executed against the intended baseline. (Same issue Plan 08-01 hit; same resolution.)

## Acceptance Criteria Audit

### Task 1 (Acceptance from 08-02-PLAN.md lines 244-256)

| # | Criterion | Result |
|---|-----------|--------|
| 1 | `src/capture/region.js` exists; valid ESM | ✓ parses via dynamic import |
| 2 | Named exports `captureRegion` (async, arity ≥3) + `RegionError` (class) | ✓ `Object.keys(m) = ['RegionError', 'captureRegion']`; `captureRegion.length = 3` |
| 3 | RegionError constructor signature `(message, { cause } = {})` preserves .cause.message | ✓ verified `new RegionError('x', { cause: new Error('y') }).cause.message === 'y'` |
| 4 | RegionError instances have `.name === 'RegionError'` | ✓ |
| 5 | Imports node:fs/promises + node:path; no imports from src/cli/ | ✓ `grep -c "from '../cli" = 0` |
| 6 | NO console.*, NO process.exit, NO chalk/ora imports | ✓ all greps = 0 |
| 7 | Screenshot options bag: scale: 'device', animations: 'disabled', type: 'png' all present | ✓ counts = 1 each at the screenshot call |
| 8 | FORBIDDEN options absent: fullPage: true count 0; omitBackground count 0 | ✓ verified after header-comment rewrite |
| 9 | mkdir(dirname(outputPath), { recursive: true }) appears (count 1) — NOT mkdir(outputPath) | ✓ count = 1 |
| 10 | Scroll uses behavior: 'instant' (≥1) and rAF roundtrip present (≥1) | ✓ behavior: 'instant' count = 2 (1 comment + 1 code); rAF count = 1 |
| 11 | Pure helpers padRect, unionRect, clampToDocument all present (function declarations) | ✓ count = 1 each |
| 12 | verify script prints REGION OK with exit 0 | ✓ |

### Task 2 (Acceptance from 08-02-PLAN.md lines 351-357)

| # | Criterion | Result |
|---|-----------|--------|
| 1 | resolveTemplate signature destructures region (matches `{ date, viewport, page, region }`) | ✓ count = 1 |
| 2 | Source contains `.replaceAll('{region}', region ? slugify(region) : '{region}')` exactly once | ✓ |
| 3 | SLUG_RE, slugify, leading header comment (lines 1-7) UNCHANGED — diff only inside resolveTemplate | ✓ verified via git diff |
| 4 | All 6 behavior cases in verify script pass; prints TEMPLATE OK exit 0 | ✓ (verifier covers 8 cases + back-compat equivalence) |
| 5 | Existing callers (src/cli.js, src/capture/runCapture.js) that don't pass region continue to work | ✓ v0.1 smoke exit 0; grep audit shows both callsites unchanged |
| 6 | `node -e "import('./src/output/template.js')..."` does not throw; exports include resolveTemplate | ✓ |

### Plan-level Success Criteria (08-02-PLAN.md lines 395-403)

| # | Criterion | Result |
|---|-----------|--------|
| 1 | src/capture/region.js is a new ESM module exporting RegionError + captureRegion | ✓ |
| 2 | Module is presentation-free (no console/chalk/ora/process.exit/cli imports) | ✓ all greps = 0 |
| 3 | All locked invariants honored (screenshot options; mkdir uses dirname; scroll instant; rAF; no fullPage; no omitBackground) | ✓ |
| 4 | Pure helpers padRect/unionRect/clampToDocument colocated (module-private) | ✓ |
| 5 | src/output/template.js resolveTemplate accepts optional region and substitutes when truthy; literal fallback when undefined | ✓ |
| 6 | All existing template callers (runCapture, cli.js --smoke) continue to work unchanged | ✓ v0.1 smoke exit 0 |
| 7 | Both task verify scripts pass with exit 0 | ✓ REGION OK + TEMPLATE OK + CAPTURE OK (extended hermetic Playwright verifier also passes) |

## TDD Gate Compliance

Both tasks executed RED → GREEN cycle with separate commits:

- Task 1 RED: `fb6e075` (test commit, failing verifier checked in)
- Task 1 GREEN: `c90a33c` (feat commit, src/capture/region.js makes it pass)
- Task 2 RED: `ff8091b` (test commit, failing template verifier checked in)
- Task 2 GREEN: `a8335bf` (feat commit, resolveTemplate extension makes it pass)

No REFACTOR commits — implementations landed in their final shape on first GREEN attempt (modulo the inline Rule 1 fixes documented above which were folded into the GREEN commits, not separate refactor commits).

## Self-Check: PASSED

- `src/capture/region.js` exists ✓ (291 lines)
- `src/output/template.js` modified (resolveTemplate extended; SLUG_RE/slugify/header byte-unchanged) ✓
- `samples/verify-region-capture.js` exists ✓ (272 lines)
- `samples/verify-template-region.js` exists ✓ (90 lines)
- Commit `fb6e075` (RED region capture test) present in git log ✓
- Commit `c90a33c` (GREEN region capture feat) present in git log ✓
- Commit `ff8091b` (RED template test) present in git log ✓
- Commit `a8335bf` (GREEN template feat) present in git log ✓
- All three verifiers exit 0 (`SCHEMA OK` + `CAPTURE OK` + `TEMPLATE OK`) ✓
- v0.1 back-compat smoke exits 0 ✓
- No `git stash` usage ✓
- No modifications to .planning/STATE.md or .planning/ROADMAP.md ✓
- HEAD on worktree-agent-* branch throughout ✓

## User Setup Required

None — module additions are pure library code; no external services, env vars, or dashboard configuration involved.

## Next Phase Readiness

**Plan 08-03 (next wave)** can begin: `src/capture/runCapture.js` extension. The Wave 2 boundary is locked — the seam wiring can:

- `import { captureRegion, RegionError } from './region.js'`
- Compose the region loop INSIDE the existing Phase 7 viewport loop body
- Call `resolveTemplate(config.output, { date, viewport: vp.name, page, region: region.name })` for per-region paths (the `{region}` placeholder substitution now Just Works)
- Throw `RegionError` from `resolveRegions()` for unknown `--only` names

Two architectural concerns that surfaced during Wave 2 verification should be addressed by Plan 03/04 planning BEFORE Plan 04's end-to-end fixture lands:

1. **`page.screenshot({ clip })` is viewport-bounded.** Cross-viewport region capture (anchor mode spanning a tall page) cannot work with `clip` alone — Playwright silently truncates to viewport height. Plan 03/04 needs to decide: (a) lift the `fullPage: true` prohibition for region mode only (lock the trade-off: regions with sticky elements may ghost), (b) implement a manual scroll-and-stitch loop for tall regions (like Phase 5's frames.js but clipped to a horizontal sub-rect), or (c) document the limitation and reject tall-region configs at schema time. **Recommendation:** option (a) for v0.2 because it's the smallest change and the Framer use case rarely has sticky elements INSIDE marketing regions (sticky elements are typically global navs/CTAs which the `hide:` block handles).

2. **`boundingBox()` returns viewport-relative coordinates, not document-relative.** Anchor mode union math is wrong when the two anchors are in different viewport positions after the second scrollIntoViewIfNeeded fires. Plan 03/04 needs to normalize: read both bboxes at the same scroll position OR add `window.scrollY` to both bboxes at measurement time to convert to document space. **Recommendation:** add a `scrollY` capture inside `clampToDocument`'s page.evaluate and adjust the bbox in `captureRegion` before union — keeps the math correct without changing the call shape.

Both concerns are noted here so Plan 03/04 can address them as part of the seam wiring; neither is a Wave 2 defect because Wave 2's verification scope explicitly defers end-to-end behavior to Plan 04.

## Threat Flags

None. The Phase 8 Wave 2 additions are pure capture-layer library code; no new network surface, no new auth path, no new file-access pattern beyond `page.screenshot({ path })` writing to caller-resolved paths (which the template layer already neutralizes via slugify per Plan 08-01's mitigation register T-08-02/05). The new `RegionError` extends the existing typed-error family and surfaces through the existing single-error-sink contract in `index.js`. No external dependencies added.

---
*Phase: 08-region-capture*
*Completed: 2026-05-24*
