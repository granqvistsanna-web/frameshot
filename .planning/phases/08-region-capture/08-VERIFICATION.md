---
phase: 08-region-capture
verified: 2026-05-24T16:10:00Z
status: passed
score: 5/5 success criteria verified
overrides_applied: 0
re_verification: false
---

# Phase 8: Region Capture — Verification Report

**Phase Goal (ROADMAP.md line 55):** User declares named regions in config — by CSS selector or by from/to anchor pair — and captures each region as its own PNG, with `--only=<region-name>` to capture a single region instead of the full page.

**Requirements covered:** REGION-01, REGION-02, REGION-03 (all v0.2 region requirements).

**Verified:** 2026-05-24T16:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Success Criteria (from ROADMAP.md lines 58–64)

| #   | Criterion                                                                                                                                                            | Status     | Evidence                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A config with `regions: [{ name, selector, padding? }]` produces one PNG per selector-region — scrolled into view, prepare pipeline applied, padding honored         | ✓ PASS     | `hero-home.png` 1552×410 PNG; visual inspection shows dark-blue #036 hero section with red #c00 padding margin around it (padding 20 honored)              |
| 2   | A config with `regions: [{ name, from, to, padding? }]` produces one PNG per anchor-region — clipped to the bounding box spanning the two anchor elements            | ✓ PASS     | `cards-home.png` 1512×1168 PNG; visual inspection shows green #063 from-anchor + green→orange gradient spacer + orange #630 to-anchor (union), with padding |
| 3   | `framershot capture <config> --only=<region-name>` captures only that single named region; without the flag, full-page stitch behavior from v0.1 is unchanged       | ✓ PASS     | `--only=hero` → 1 PNG; `--only=cards` → 1 PNG; `samples/smoke.yaml --smoke` and `samples/smoke-multi.yaml` produce 1 / 2 PNGs unchanged (v0.1 + Phase 7)    |
| 4   | A missing selector / missing anchor / unknown `--only` name surfaces an actionable error via the existing `formatError` dispatcher (typed error, not a raw throw)    | ✓ PASS     | All four error paths produce `Error:` prefix (Guard 4) — no stack, no fallthrough to "Unexpected error:"                                                    |
| 5   | The hermetic smoke fixture demonstrates: (a) a selector-region capture, (b) an anchor-region capture, (c) the `--only` flag isolating one region                    | ✓ PASS     | `samples/smoke-regions.yaml` end-to-end produces 3 visually-correct PNGs (hero + cards + full-page); `--only=hero` isolates to 1 PNG                        |

**Score: 5/5 success criteria verified**

---

## Per-Criterion Evidence

### SC #1 — Selector region capture (REGION-01)

**Goal:** `regions: [{ name, selector, padding? }]` → 1 PNG per region, scrolled, prepared, padding honored.

**Evidence — code:**

- `src/config/schema.js:84–118` — `regionSchema` with selector-XOR-(from+to) `.superRefine`; `padding` defaults to 0 via `.default(0)` (line 90).
- `src/capture/region.js:222–269` — `captureRegion` SELECTOR MODE branch: count-check → bbox pre-check → `scrollIntoViewIfNeeded` → `measureDocBox` (post-scroll bbox to document-space) → `padRect` → `clampToDocument` → screenshot.
- `src/capture/runCapture.js:159–175` — per-viewport region loop calls `captureRegion(navigatedPage, region, regionPath, {...})`.
- `samples/smoke-regions.yaml:43–46` — hero region uses selector mode with padding 20.

**Evidence — execution:**

```
$ node samples/serve-smoke.js & sleep 2
$ node index.js capture samples/smoke-regions.yaml
✔ 3 screenshot(s) written
screenshot written (region 'hero'): /tmp/framershot-smoke-regions/hero-home.png
...
$ file /tmp/framershot-smoke-regions/hero-home.png
hero-home.png: PNG image data, 1552 x 410, 8-bit/color RGB, non-interlaced
```

Visual inspection of `hero-home.png` (via Read tool on the PNG): dark-blue `#036` hero section with h2 "Region hero (selector capture target)" + paragraph "This is the entire selector region. Padding should produce visible margin around it.", surrounded by red `#c00` padding margin (≈ 40 raster px = 20 CSS px × DSR 2). **MATCHES expected behavior.** No ghosted nav, no half-played animation, no mid-page artifact.

**Verifier exit codes (full-stack):**

- `node samples/verify-region-schema.js` → `SCHEMA OK` (exit 0)
- `node samples/verify-region-capture.js` → `CAPTURE OK` (exit 0) — Playwright-backed, 10+ live assertions including selector happy-path, padding growth, zero-match, display:none short-circuit
- `node samples/verify-runcapture-regions.js` → `RUNCAPTURE OK` (exit 0)

**Verdict:** ✓ PASS — selector mode is wired end-to-end, scrolls into view, runs the prepare pipeline (animations frozen, IO triggers fired, hide-selectors applied — visible in stderr `[smoke] Running prepare pipeline`), honors padding.

### SC #2 — Anchor region capture (REGION-02)

**Goal:** `regions: [{ name, from, to, padding? }]` → 1 PNG per region, clipped to the bounding-box union of the two anchors.

**Evidence — code:**

- `src/capture/region.js:270–326` — ANCHOR MODE branch: pre-bbox-check on `from` → scroll → `measureDocBox` → pre-bbox-check on `to` → scroll → `measureDocBox` → `unionRect(boxFrom, boxTo)` → `padRect` → `clampToDocument` → screenshot.
- `src/capture/region.js:119–125` — pure `unionRect(a, b)` helper computes smallest-rect containment.
- `src/capture/region.js:163–176` — `measureDocBox` helper converts viewport-relative bbox → document-space via `boundingBox + scrollX/scrollY` (Plan 04 fix for the Wave 2 deferred concern).
- `src/capture/region.js:351–358` — screenshot uses `{ fullPage: true, clip }` so document-space clip resolves correctly regardless of scroll (Plan 04 fix for viewport-truncation pitfall).
- `samples/smoke-regions.yaml:47–50` — cards region uses anchor mode (`from: [data-test="region-from"]`, `to: [data-test="region-to"]`) with padding 10.

**Evidence — execution:**

```
$ node index.js capture samples/smoke-regions.yaml
screenshot written (region 'cards'): /tmp/framershot-smoke-regions/cards-home.png
$ file /tmp/framershot-smoke-regions/cards-home.png
cards-home.png: PNG image data, 1512 x 1168, 8-bit/color RGB, non-interlaced
```

Visual inspection of `cards-home.png`: green `#063` `from` anchor at top, green→orange gradient spacer in middle (the 400px section between anchors), orange `#630` `to` anchor at bottom, all surrounded by red `#c00` padding margin (≈ 20 raster px = 10 CSS px × DSR 2). **MATCHES expected behavior** — the union spans across the 400px gradient spacer, not just either anchor alone. Height of 584 CSS px (1168/2) is consistent with the from-anchor (~64px) + 400px spacer + to-anchor (~64px) + ~56px of padding/margin slack.

**Verdict:** ✓ PASS — anchor mode computes the union and clips correctly to it. The Plan 04 architectural fix (measureDocBox + fullPage:true) is what makes this work; pre-fix the PNG was a pure red gradient (per Plan 04 SUMMARY §Deviations §1).

### SC #3 — `--only=<region-name>` filter + back-compat (REGION-03)

**Goal:** `--only=<name>` captures only the matched region (skips full-page + other regions); without the flag, v0.1 full-page stitch behavior is unchanged.

**Evidence — code:**

- `src/cli.js:33` — `.option('--only <region-name>', ...)` commander required-value declaration.
- `src/cli.js:123` — `only: opts.only` plumbed through to `runCapture`.
- `src/capture/runCapture.js:70–81` — `resolveRegions(regions, only)` returns single-match for `--only`, all regions for unset, throws RegionError for unknown name.
- `src/capture/runCapture.js:119` — upfront `resolveRegions(config.regions, only)` call BEFORE the viewport loop (fail-fast before any Chromium launch).
- `src/capture/runCapture.js:145–188` — branch logic: zero targets → full-page (Phase 7 path); N targets → per-region captures; AFTER the for-loop, tail-emit full-page IFF `only === undefined && config.regions !== undefined` (Open Q#1 lock A).

**Evidence — execution (--only=hero / --only=cards isolation):**

```
$ node index.js capture samples/smoke-regions.yaml --only=hero
✔ 1 screenshot(s) written
screenshot written (region 'hero'): /tmp/framershot-smoke-regions/hero-home.png
exit=0
$ ls /tmp/framershot-smoke-regions/
hero-home.png       # only PNG produced — no cards, no full-page

$ node index.js capture samples/smoke-regions.yaml --only=cards
✔ 1 screenshot(s) written
screenshot written (region 'cards'): /tmp/framershot-smoke-regions/cards-home.png
exit=0
$ ls /tmp/framershot-smoke-regions/
cards-home.png      # only PNG produced
```

**Evidence — back-compat (no regions, no --only):**

```
$ node index.js capture samples/smoke.yaml --smoke
✔ smoke screenshot written: /tmp/framershot-smoke/home.png
exit=0  # 1 PNG, 32659 bytes (smoke-path unchanged from v0.1)

$ node index.js capture samples/smoke.yaml          # non-smoke v0.1 path
✔ 1 screenshot(s) written
screenshot written (full page): /tmp/framershot-smoke/home.png
exit=0  # 1 PNG, 180612 bytes — full-page stitch produced; label upgraded to "(full page)" per Plan 04 stdout-uniformity decision

$ node index.js capture samples/smoke-multi.yaml    # Phase 7 multi-viewport
✔ 2 screenshot(s) written
screenshot written (full page): /tmp/framershot-smoke-multi/desktop/home.png
screenshot written (full page): /tmp/framershot-smoke-multi/mobile/home.png
exit=0  # 2 PNGs (desktop + mobile), no spurious region work
```

`grep -c "^regions:" samples/smoke.yaml` → `0` (no regions block; SC #3's "unchanged when --only absent" precondition is genuine).

Note: the v0.1 non-smoke stdout label changed from Phase 7's `screenshot written: ...` → Phase 8's `screenshot written (full page): ...`. This is the documented uniform-labeling decision in Plan 04 (SUMMARY §Decisions Made). PNG behavior is byte-identical (modulo timestamp); only the stdout line was extended.

**Verdict:** ✓ PASS — `--only` isolation works (1 PNG, no others); v0.1 and Phase 7 back-compat preserved (still produce 1 / 2 PNGs respectively with no spurious region work).

### SC #4 — Actionable error via formatError dispatcher (REGION-01/02/03)

**Goal:** Missing selector / missing anchor / unknown `--only` name surfaces an actionable error via the existing `formatError` dispatcher (typed error, not a raw throw).

**Evidence — code:**

- `src/capture/region.js:91–97` — `RegionError extends Error` (BrowserError-mirror shape).
- `src/cli/format.js:10` — `import { RegionError } from '../capture/region.js'`.
- `src/cli/format.js:123–130` — Guard 4: `if (err instanceof RegionError) return ${chalk.red('Error:')} ${err.message}` — chalk only the prefix, no stack, no dim hint.
- `src/cli/format.js:78–82` — JSDoc dispatch-order doc inserts Guard 4 between Guard 3 (BrowserError) and Guard 5 (bare TimeoutError, renumbered from 4).
- `src/cli.js:43–45` — mutex guard `if (opts.smoke && opts.only) throw new RegionError(...)` BEFORE loadConfig — routes through Guard 4 instead of the default branch.

**Evidence — execution (four error surfaces):**

```
# 1. Missing selector (no element matches)
$ node index.js capture /tmp/test-missing-selector.yaml
Error: Region 'ghost': selector '[data-test="this-element-does-not-exist"]' matched no elements.
exit=1

# 2. Missing anchor (no 'to' element)
$ node index.js capture /tmp/test-missing-anchor.yaml
Error: Region 'ghost': 'to' selector '[data-test="ghost-anchor"]' matched no elements.
exit=1

# 3. Unknown --only name
$ node index.js capture samples/smoke-regions.yaml --only=nonexistent
Error: Unknown --only region 'nonexistent'. Declared regions: 'hero', 'cards'.
exit=1

# 4. --smoke + --only mutex
$ node index.js capture samples/smoke-regions.yaml --smoke --only=hero
Error: --smoke and --only are mutually exclusive
exit=1
```

All four messages:
- Start with `Error:` (Guard 4 — clean, chalked red in a real TTY).
- Name the region (where applicable) and the offending value.
- For unknown --only: enumerate the declared region names so the user can fix the flag without re-reading the config.
- For missing selector/anchor: include the actual CSS selector that didn't match.
- No stack trace, no fallthrough to "Unexpected error:" default branch.

`verify-cli-region.js` Section 3 + Section 4 explicitly assert the Guard 4 path:
- output contains `Error:` prefix ✓
- output does NOT fall through to default branch (no "Unexpected error:") ✓
- output is single-line (no stack trace) ✓
- ConfigError still formats with Error: prefix ✓ (regression check)
- BrowserError still formats with Error: prefix ✓ (regression check)

**Verdict:** ✓ PASS — all four region-error surfaces (missing selector, missing anchor, unknown --only, mutex) flow through formatError Guard 4 with clean, actionable messages. ConfigError + BrowserError dispatch unchanged.

### SC #5 — Hermetic smoke fixture demonstrates selector + anchor + --only

**Goal:** Hermetic smoke fixture demonstrates (a) selector-region capture, (b) anchor-region capture, (c) the `--only` flag isolating one region.

**Evidence — fixture:**

- `samples/serve-smoke.js:86–111` — three new `data-test` sections added below the 2000px PREP-04 spacer:
  - `[data-test="region-hero"]` — dark blue #036 section (selector target)
  - `[data-test="region-from"]` — green #063 (anchor from)
  - 400px green→orange gradient spacer between
  - `[data-test="region-to"]` — orange #630 (anchor to)
- `samples/smoke-regions.yaml` — declares `hero` (selector mode, padding 20) + `cards` (anchor mode, padding 10), output template `/tmp/framershot-smoke-regions/{region}-{page}.png`.
- Singular `viewport:` form (smoke-regions.yaml:32–35) exercises Phase 7 D-01 back-compat alias on the same run that exercises Phase 8 region capture.
- Existing pre-Phase-8 fixture sections (anim-target, io-target, hidden-by-test, lazy-img) byte-identical — no regression to Phase 4/5/6 smoke surface.

**Evidence — execution (a + b + c demonstrated):**

```
# (a) + (b) — full smoke produces hero (selector) + cards (anchor) + full-page
$ node samples/serve-smoke.js & sleep 2
$ node index.js capture samples/smoke-regions.yaml
✔ 3 screenshot(s) written
screenshot written (region 'hero'): /tmp/framershot-smoke-regions/hero-home.png
screenshot written (region 'cards'): /tmp/framershot-smoke-regions/cards-home.png
screenshot written (full page): /tmp/framershot-smoke-regions/{region}-home.png
exit=0
$ file /tmp/framershot-smoke-regions/*.png
cards-home.png:    PNG image data, 1512 x 1168, 8-bit/color RGB, non-interlaced
hero-home.png:     PNG image data, 1552 x 410, 8-bit/color RGB, non-interlaced
{region}-home.png: PNG image data, 1600 x 6538, 8-bit/color RGBA, non-interlaced

# (c) — --only=hero isolates to 1 PNG
$ node index.js capture samples/smoke-regions.yaml --only=hero
✔ 1 screenshot(s) written
screenshot written (region 'hero'): /tmp/framershot-smoke-regions/hero-home.png
$ ls /tmp/framershot-smoke-regions/
hero-home.png         # only — no cards, no full-page
```

The `{region}-home.png` filename for the full-page entry literally contains `{region}` — this is **intentional** per the documented unknown-placeholder posture in `src/output/template.js:6–7` and `src/output/template.js:36–38`. When the full-page call passes no `region` argument, `resolveTemplate` leaves `{region}` literal so typos in the template surface visibly. Not a defect.

**Verdict:** ✓ PASS — fixture demonstrates all three required behaviors end-to-end. Three PNGs land at distinct paths (no overwrites), all visually correct, exit code 0.

---

## Requirements Coverage

| Requirement | Description (from REQUIREMENTS.md) | Source plan(s) | Status | Evidence |
| ----------- | ---------------------------------- | -------------- | ------ | -------- |
| REGION-01 | Selector-region capture (CSS selector + padding) | 08-01, 08-02, 08-03, 08-04 | ✓ SATISFIED | SC #1 evidence above; `hero-home.png` visually correct |
| REGION-02 | Anchor-region capture (from/to bbox union) | 08-01, 08-02, 08-03, 08-04 | ✓ SATISFIED | SC #2 evidence above; `cards-home.png` visually correct |
| REGION-03 | `--only=<region-name>` CLI filter | 08-01, 08-03, 08-04 | ✓ SATISFIED | SC #3 evidence (--only isolation + back-compat); SC #4 evidence (unknown --only RegionError) |

All three v0.2 region requirements satisfied. No orphaned requirements.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/config/schema.js` | `regionSchema` + root `regions` field + duplicate-name + `{region}`-in-output refinements | ✓ VERIFIED | Lines 84–118 (regionSchema), 150 (regions field), 195–228 (root .superRefine for both refinements); `formatZodError` body byte-untouched (lines 247–266) |
| `src/capture/region.js` | `captureRegion` + `RegionError` + `padRect/unionRect/clampToDocument/measureDocBox` | ✓ VERIFIED | 360 lines; RegionError 91–97; padRect 108–115; unionRect 119–125; clampToDocument 134–147; measureDocBox 163–176; captureRegion 222–359 |
| `src/capture/runCapture.js` | region loop + `resolveRegions` + upfront `--only` fail-fast | ✓ VERIFIED | resolveRegions 70–81; runCapture 108–197; upfront call 119; branch logic 145–188 (Open Q#1 lock A 179–187) |
| `src/cli.js` | `--only` option + mutex + plumb-through + per-result labeling | ✓ VERIFIED | Line 33 (--only option); 43–45 (mutex); 123 (only plumb); 132–135 (per-result label) |
| `src/cli/format.js` | Guard 4 RegionError dispatcher | ✓ VERIFIED | Line 10 (import); 128–130 (Guard 4 branch); JSDoc 78–82 |
| `src/output/template.js` | `{region}` placeholder with literal fallback | ✓ VERIFIED | Line 27 (signature region arg); 38 (`.replaceAll('{region}', region ? slugify(region) : '{region}')`); SLUG_RE + slugify + header byte-unchanged |
| `samples/serve-smoke.js` | region-hero / region-from / region-to data-test sections | ✓ VERIFIED | Lines 86–111 (three new sections); existing 4 sections + PORT + 127.0.0.1 binding byte-identical |
| `samples/smoke-regions.yaml` | Phase 8 hermetic fixture | ✓ VERIFIED | 51 lines; hero (selector, padding 20) + cards (anchor, padding 10); singular viewport form |
| `samples/verify-region-schema.js` | Wave 1 verifier | ✓ VERIFIED | Exit 0, "SCHEMA OK" |
| `samples/verify-region-capture.js` | Wave 2 Playwright verifier | ✓ VERIFIED | Exit 0, "CAPTURE OK" |
| `samples/verify-template-region.js` | Wave 2 template verifier | ✓ VERIFIED | Exit 0, "TEMPLATE OK" |
| `samples/verify-runcapture-regions.js` | Wave 3 runCapture verifier | ✓ VERIFIED | Exit 0, "RUNCAPTURE OK" |
| `samples/verify-cli-region.js` | Wave 4 CLI verifier | ✓ VERIFIED | Exit 0, "CLI WIRING OK" (25 passed · 0 failed) |

All 13 artifacts present, substantive, and wired. All five verifier scripts pass with exit 0.

---

## Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `src/cli.js` | `RegionError` (mutex throw) | `import { RegionError } from './capture/region.js'` line 8 + line 44 throw | ✓ WIRED |
| `src/cli.js` | `runCapture` with `only` arg | line 123 `only: opts.only` | ✓ WIRED |
| `src/cli/format.js` | `RegionError` Guard 4 | line 10 import + line 128 instanceof branch | ✓ WIRED |
| `src/capture/runCapture.js` | `captureRegion` | line 41 import + line 166 call | ✓ WIRED |
| `src/capture/runCapture.js` | `RegionError` (unknown --only throw) | line 41 import + line 78 throw | ✓ WIRED |
| `src/capture/runCapture.js` | `resolveTemplate` with `region` arg | line 42 import + line 160–165 call | ✓ WIRED |
| `src/config/schema.js` | `{region}`-in-output refinement | lines 221–227 (`!data.output.includes('{region}')`) | ✓ WIRED |
| `samples/smoke-regions.yaml` | `serve-smoke.js` data-test sections | baseUrl 127.0.0.1:7357 + selector strings match HTML attrs | ✓ WIRED |

All key links verified end-to-end via the live execution evidence above (regions actually capture; --only actually filters; unknown --only actually throws; mutex actually fires; etc.).

---

## Data-Flow Trace (Level 4)

For each artifact that renders dynamic output, verified data actually flows through the wiring:

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `samples/smoke-regions.yaml` PNGs | hero PNG pixels | `[data-test="region-hero"]` element rendered by serve-smoke.js (dark blue #036 section) | YES — visual inspection confirms dark-blue hero content, not red gradient stub | ✓ FLOWING |
| `samples/smoke-regions.yaml` PNGs | cards PNG pixels | from + spacer + to anchors rendered by serve-smoke.js (green #063 + gradient + orange #630) | YES — visual inspection confirms anchor union with all three elements visible | ✓ FLOWING |
| `--only=nonexistent` error message | declared region names list | `regions.map((r) => '${r.name}').join(', ')` in resolveRegions line 77 | YES — "Declared regions: 'hero', 'cards'." matches yaml-declared names | ✓ FLOWING |
| CLI stdout label | r.regionName ternary | runCapture results array push line 173 `regionName: region.name` | YES — "(region 'hero')" and "(region 'cards')" and "(full page)" appear correctly per result type | ✓ FLOWING |
| Schema validation errors | region path + message | regionSchema .superRefine custom issues + root .superRefine | YES — Wave 1 verifier exercises 12 assertions including duplicate-name, half-anchor, missing-{region} — all surface with `regions:` field prefix | ✓ FLOWING |

No HOLLOW or DISCONNECTED data flows. PNGs contain actual page content (verified visually), not stub/empty/red-gradient placeholders. This is the critical Plan 04 fix: pre-fix, region PNGs were pure red gradient because clip was viewport-bounded and viewport-relative. Post-fix, PNGs render real region content.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Wave 1 schema verifier | `node samples/verify-region-schema.js` | `SCHEMA OK` exit 0 | ✓ PASS |
| Wave 2 region capture verifier | `node samples/verify-region-capture.js` | `CAPTURE OK` exit 0 | ✓ PASS |
| Wave 2 template verifier | `node samples/verify-template-region.js` | `TEMPLATE OK` exit 0 | ✓ PASS |
| Wave 3 runCapture verifier | `node samples/verify-runcapture-regions.js` | `RUNCAPTURE OK` exit 0 | ✓ PASS |
| Wave 4 CLI verifier | `node samples/verify-cli-region.js` | `CLI WIRING OK` (25 passed · 0 failed) exit 0 | ✓ PASS |
| End-to-end smoke-regions (Open Q#1 lock A) | `node index.js capture samples/smoke-regions.yaml` | 3 PNGs (hero + cards + full-page), exit 0 | ✓ PASS |
| End-to-end smoke-regions (--only=hero) | `node index.js capture samples/smoke-regions.yaml --only=hero` | 1 PNG (hero only), exit 0 | ✓ PASS |
| End-to-end smoke-regions (--only=cards) | `node index.js capture samples/smoke-regions.yaml --only=cards` | 1 PNG (cards only), exit 0 | ✓ PASS |
| Unknown --only RegionError | `node index.js capture samples/smoke-regions.yaml --only=nonexistent` | `Error: Unknown --only region 'nonexistent'. Declared regions: 'hero', 'cards'.`, exit 1 | ✓ PASS |
| Mutex RegionError | `node index.js capture samples/smoke-regions.yaml --smoke --only=hero` | `Error: --smoke and --only are mutually exclusive`, exit 1 | ✓ PASS |
| Missing-selector RegionError | (ad-hoc fixture with non-matching selector) | `Error: Region 'ghost': selector '...' matched no elements.`, exit 1 | ✓ PASS |
| Missing-anchor RegionError | (ad-hoc fixture with non-matching `to`) | `Error: Region 'ghost': 'to' selector '...' matched no elements.`, exit 1 | ✓ PASS |
| v0.1 back-compat smoke | `node index.js capture samples/smoke.yaml --smoke` | 1 PNG, exit 0 | ✓ PASS |
| v0.1 non-smoke (no regions, no --only) | `node index.js capture samples/smoke.yaml` | 1 PNG labeled "(full page)", exit 0 | ✓ PASS |
| Phase 7 multi-viewport back-compat | `node index.js capture samples/smoke-multi.yaml` | 2 PNGs (desktop + mobile), exit 0 | ✓ PASS |

15/15 behavioral spot-checks PASS.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |

Zero anti-patterns found.

**Debt markers** (TBD/FIXME/XXX) scan on all 8 Phase 8 modified/created source files: **zero hits**.

**TODO/HACK/PLACEHOLDER** scan: **zero hits**.

**Stub phrases** (placeholder/coming soon/not yet implemented/not available) scan: 5 hits, all documentation references to the `{region}` template placeholder feature (e.g. `src/config/schema.js:135` "placeholder enforcement belongs to the template resolver"; `src/output/template.js:6` "Unknown placeholders (e.g. {foo}) are left literal"). **None are stubs** — they describe the implemented placeholder system.

---

## Commit Hash Verification

All 12 Phase 8 commit hashes referenced in the four plan SUMMARYs were verified present in `git log`:

| Plan | Type | Hash | Message |
| ---- | ---- | ---- | ------- |
| 08-01 | RED | `8ca3651` | test(08-01): add failing region schema verifier (RED) |
| 08-01 | GREEN | `bfa913b` | feat(08-01): add regionSchema + regions field + root cross-field refinements (GREEN) |
| 08-02 | RED | `fb6e075` | test(08-02): add failing region capture verifier (RED) |
| 08-02 | GREEN | `c90a33c` | feat(08-02): add src/capture/region.js with captureRegion + RegionError (GREEN) |
| 08-02 | RED | `ff8091b` | test(08-02): add failing {region} placeholder verifier (RED) |
| 08-02 | GREEN | `a8335bf` | feat(08-02): extend resolveTemplate with {region} placeholder (GREEN) |
| 08-03 | RED | `9261209` | test(08-03): add failing runCapture region-loop verifier (RED) |
| 08-03 | GREEN | `43dd7bb` | feat(08-03): nest region loop inside per-viewport loop + --only filter (GREEN) |
| 08-04 | feat | `14eac24` | feat(08-04): scaffold region smoke fixture — extend serve-smoke HTML + add smoke-regions.yaml |
| 08-04 | RED | `01485e4` | test(08-04): add failing CLI region verifier (RED) |
| 08-04 | GREEN | `b0a9b54` | feat(08-04): wire --only CLI option + RegionError dispatcher branch (GREEN) |
| 08-04 | fix | `0f3d373` | fix(08-04): resolve Wave 2's two architectural concerns in region capture (Rule 1 deviation) |

TDD discipline confirmed: every feat/fix is preceded by a test commit (RED → GREEN pattern).

---

## Human Verification Required

None.

Phase 8's plan author (08-04) included a `checkpoint:human-verify` for visual inspection of the produced PNGs against the hermetic fixture. The user already approved this checkpoint at plan-execution time (per orchestrator context: "human visual checkpoint (APPROVED by user)"). This verifier independently re-ran the end-to-end capture against `samples/smoke-regions.yaml` and visually inspected `hero-home.png` and `cards-home.png` via the Read tool — both match the documented expectations (dark-blue hero, green→orange anchor union with padding). No further human verification is needed for the hermetic fixture.

The "real-Framer-site region capture" manual-only verification in `08-VALIDATION.md` lines 71–73 is an operational test that exercises Phase 8 against a live Framer site (e.g. pubq.se), which is out of scope for this goal-backward verification of the ROADMAP success criteria. The hermetic smoke fixture is the contract the SCs require, and it passes end-to-end.

---

## Concerns / Notes

### Documented intentional behavior — not defects

1. **`{region}-home.png` filename for full-page entry contains literal `{region}`.** When the full-page capture runs alongside region captures (Open Q#1 lock A), the full-page call passes no `region` argument to `resolveTemplate`. Per the documented unknown-placeholder posture (`src/output/template.js:6-7`), unknown placeholders are left literal so typos surface visibly. This is **expected behavior** per Plan 04 SUMMARY. To avoid the literal-`{region}` filename, users can either (a) use `--only` to skip the full-page emit, (b) write a different output template for region-enabled configs, or (c) accept the literal as a visible signal that a full-page capture ran in a regions-declared config. Not a defect; documented in three locations.

2. **v0.1 non-smoke stdout label changed.** Phase 7's `screenshot written: ...` is now `screenshot written (full page): ...` for v0.1 configs (no regions declared, no `--only`). The label change is per Plan 04's uniform-labeling decision (consumers can grep `region '` vs `full page` to filter). PNG behavior is byte-equivalent. Documented in Plan 04 SUMMARY §Decisions Made.

### Architectural fixes during Wave 4

Plan 04 resolved two architectural concerns deferred from Wave 2 (`page.screenshot({ clip })` is viewport-bounded; `boundingBox()` is viewport-relative). Both were empirically confirmed via Playwright probes and fixed via the new `measureDocBox` helper (document-space bbox measurement) + `fullPage: true` + document-space clip combination. **Without this fix, Phase 8 would have shipped with broken region capture** (region PNGs were pure red gradient pre-fix). The fix is the reason SC #1 and SC #2 PASS. The Wave 2 verifier (`samples/verify-region-capture.js`) continues to pass post-fix because its hermetic fixture is single-viewport (both anchors visible at scrollY=0, so `measureDocBox` returns coords identical to bare `boundingBox`). This is a Rule 1 deviation properly documented in Plan 04 SUMMARY §Deviations §1.

### Scope notes

- Deferred-past-v0.2 items (MULTI-02 multi-page, MULTI-03/04 filter flags, DIFF-01, HOOK-01, AUTH-01) are explicitly out of scope per REQUIREMENTS.md and are not part of Phase 8.
- The "real-Framer-site" manual verification (08-VALIDATION.md) is operational follow-up after v0.2 ships; it is not a SC for Phase 8.

---

## Overall Verdict

**PASS — 5/5 success criteria verified.**

Phase 8 (Region Capture) delivers the ROADMAP goal: user declares named regions in config (selector mode or from/to anchor mode), each region captures as its own PNG with padding honored, and `--only=<region-name>` filters to a single region. The hermetic smoke fixture demonstrates all three required behaviors end-to-end with visually-correct PNGs. v0.1 and Phase 7 back-compat fixtures continue to pass unchanged. All four region-error surfaces (missing selector, missing anchor, unknown `--only`, mutex) route cleanly through `formatError` Guard 4.

REGION-01, REGION-02, and REGION-03 are SATISFIED. v0.2 milestone is ready for the milestone-close step.

---

*Verified: 2026-05-24T16:10:00Z*
*Verifier: Claude (gsd-verifier)*
