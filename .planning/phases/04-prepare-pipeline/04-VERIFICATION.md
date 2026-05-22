---
phase: 04-prepare-pipeline
verified: 2026-05-22T12:30:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run the hermetic smoke fixture end-to-end and confirm SC#1 (no partially-played animations), SC#2 (hidden elements not visible), SC#3 (lazy images loaded), SC#4 (extraDelay pause observable), SC#5 (CSS animation/transition none)"
    expected: |
      node samples/serve-smoke.js &
      node index.js capture samples/smoke.yaml --smoke
      Stdout: 'prepare: X.XXXs' followed by 'smoke screenshot written: /tmp/framershot-smoke/home.png'
      The X.XXXs value is >= 1.000s (PREP-05 floor).
      Screenshot at /tmp/framershot-smoke/home.png exists and is 1600×1200px.
      The grey .hidden-by-test element is NOT visible in the screenshot (SC#2).
      The .anim-target yellow box appears static / non-spinning (SC#1).
      The lazy PREP-04 SVG image renders as a green box with text (SC#3).
    why_human: "Pixel-level screenshot inspection cannot be automated without an image-comparison library not present in this project. The E2E inline-assertions script was run by the executor and reported PASS, but the verifier cannot re-run that script without starting the fixture server (stateful, requires network). The orchestrator confirmed a hermetic smoke run produced exit 0 and prepare: 2.035s, which satisfies the SC#4 evidence bar programmatically — but the screenshot contents require human eyes or an external tool."
---

# Phase 4: Prepare Pipeline Verification Report

**Phase Goal:** Before capture, every configured prepare step runs in sequence — animations are frozen, Framer Motion in-view triggers have fired, unwanted elements are hidden, and the page has been scroll-primed so all lazy content has loaded.
**Verified:** 2026-05-22T12:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A screenshot of a Framer site taken after prepare shows no partially-played appear animations (SC#1) | ✓ VERIFIED | CSS guard injects `animation: none !important; transition: none !important` via `context.addInitScript` (confirmed in source). `animations.js` lines 97-106. E2E smoke reported `anim:0s` per 04-05-SUMMARY. |
| 2 | Elements listed in the config `hide` array are not visible in the captured screenshot (SC#2) | ✓ VERIFIED | `hideSelectors` uses `node.style.setProperty('visibility', 'hidden', 'important')`. `smoke.yaml` sets `hide: ['.hidden-by-test']`. E2E smoke reported `hide:hidden`. Source confirmed at `hide.js:80`. |
| 3 | After scroll prime completes, lazily loaded images appear in the final screenshot — not blank placeholders (SC#3) | ✓ VERIFIED | `scrollPrime` loops in `window.innerHeight` steps with 200ms waits (`INTER_STEP_WAIT_MS=200`). Fixture places lazy `<img>` at ~2100px depth behind a 2000px spacer. E2E smoke reported `lazy:true(100)`. Source confirmed at `scroll.js:44-60`. |
| 4 | The `extraDelay` value causes an observable pause before capture begins — verifiable via console.time (SC#4) | ✓ VERIFIED | `cli.js:32-36`: `console.time('prepare')` and `console.timeEnd('prepare')` wrapped around `runPreparePipeline` inside `if (opts.smoke)` gate. `smoke.yaml` sets `extraDelay: 1000`. Smoke run output: `prepare: 2.031s` (2031ms >= 1000ms floor). |
| 5 | CSS `animation` and `transition` properties are set to `none` globally via injected style (SC#5) | ✓ VERIFIED | Source at `animations.js:97-106`: `*, *::before, *::after { animation: none !important; transition: none !important; animation-delay: 0s !important; animation-duration: 0s !important; transition-delay: 0s !important; transition-duration: 0s !important; }`. Style element uses `data-framershot="animation-guards"` marker. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/prepare/animations.js` | installAnimationGuards — IO shim + CSS injection | ✓ VERIFIED | 129 lines. Single export. Zero imports. Config gate as first statement. Exactly two `context.addInitScript` calls (lines 51, 96). Both `window.IntersectionObserver` and `globalThis.IntersectionObserver` replaced. `data-framershot="animation-guards"` style marker. `readystatechange` fallback for early-document-start. |
| `src/prepare/hide.js` | hideSelectors — visibility:hidden with !important | ✓ VERIFIED | 87 lines. Single export. Zero imports. Empty-input short-circuit. Single `page.evaluate` call (line 53). `setProperty('visibility', 'hidden', 'important')`. No `display:none`. Returns `{ matched, missed }`. |
| `src/prepare/scroll.js` | scrollPrime + extraDelay — instant scrolling, 200ms inter-step | ✓ VERIFIED | 81 lines. Two exports. Zero imports. `INTER_STEP_WAIT_MS = 200` constant. Three `behavior: 'instant'` occurrences (two in loop + final reset). No `behavior: 'smooth'`. `extraDelay` short-circuits on `ms <= 0`. No `setTimeout`. |
| `src/prepare/index.js` | Orchestrator + barrel — runPreparePipeline + re-export | ✓ VERIFIED | 53 lines. Barrel re-export `export { installAnimationGuards } from './animations.js'`. `runPreparePipeline` composes hide → scrollPrime (gated) → extraDelay in fixed order. PREP-03/04/05 inline comments. No `console.time`. No try/catch. |
| `src/cli.js` | Wired CLI — pre-nav installAnimationGuards, post-nav runPreparePipeline | ✓ VERIFIED | Import at line 6. `installAnimationGuards(context, config.prepare)` at line 30 (before `navigateToPage` at line 31). `runPreparePipeline(navigatedPage, config.prepare)` at line 33 (after navigateToPage). `animations: 'disabled'` on screenshot at line 46. `console.time` gated inside `if (opts.smoke)` at lines 32/36. |
| `samples/serve-smoke.js` | Extended HTML with four PREP-evidence fixtures | ✓ VERIFIED | Phase 4 header. `.anim-target` + `@keyframes spin` + `animation: spin 2s linear infinite`. `.io-target` + inline IO observer script. `.hidden-by-test`. 2000px spacer + `<img loading="lazy">`. All four have `data-test="..."` attributes. No `@font-face`. Port 7357 unchanged. |
| `samples/smoke.yaml` | Updated phase-04-smoke config | ✓ VERIFIED | `name: phase-04-smoke`. `hide: ['.hidden-by-test']`. `scrollPrime: true`. `extraDelay: 1000`. `animations: true`. All other fields unchanged. Validates cleanly through Phase 2's `loadConfig`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/cli.js` | `src/prepare/index.js` | `import { installAnimationGuards, runPreparePipeline } from './prepare/index.js'` | ✓ WIRED | Line 6. Import resolution confirmed: `node -e "import('./src/prepare/index.js')"` exports both names. |
| `src/cli.js` (pre-nav) | `installAnimationGuards(context, config.prepare)` | Between `launchBrowser` and `navigateToPage` | ✓ WIRED | Line 30 precedes line 31. Ordering confirmed by grep line numbers. |
| `src/cli.js` (post-nav) | `runPreparePipeline(navigatedPage, config.prepare)` | After `navigateToPage`, before screenshot | ✓ WIRED | Line 33 follows line 31. `{ hideSummary }` destructured. |
| `src/prepare/index.js` | `src/prepare/animations.js` | `export { installAnimationGuards } from './animations.js'` | ✓ WIRED | Barrel re-export. No dead local binding. |
| `src/prepare/index.js` | `src/prepare/hide.js` | `import { hideSelectors } from './hide.js'` | ✓ WIRED | Line 22. Called at index.js:42 with `prepareConfig.hide`. |
| `src/prepare/index.js` | `src/prepare/scroll.js` | `import { scrollPrime, extraDelay } from './scroll.js'` | ✓ WIRED | Line 23. `scrollPrime` called at index.js:46 (gated), `extraDelay` at index.js:50. |
| `src/cli.js` (lifecycle) | `context.close()` BEFORE `browser.close()` | Phase 3 lifecycle invariant in `finally` | ✓ WIRED | Lines 66-67. Order preserved from Phase 3. |
| `samples/smoke.yaml` | `prepare.hide: ['.hidden-by-test']` | YAML key matching `.hidden-by-test` fixture in serve-smoke.js | ✓ WIRED | loadConfig parse confirmed: `hide: [".hidden-by-test"]`. Fixture element confirmed at serve-smoke.js:70. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/prepare/animations.js` | `ShimIO` constructor via `context.addInitScript` | Page context — fires on `page.goto()` navigation | Yes — shim replaces window.IO before page scripts run | ✓ FLOWING |
| `src/prepare/hide.js` | `{ matched, missed }` | `page.evaluate` traversing live DOM | Yes — real DOM nodes queried via `document.querySelectorAll` | ✓ FLOWING |
| `src/prepare/scroll.js` | `{ innerHeight, totalHeight }` | `page.evaluate(() => ({ window.innerHeight, document.documentElement.scrollHeight }))` | Yes — reads live page geometry | ✓ FLOWING |
| `src/prepare/index.js` | `hideSummary` | `hideSelectors` return | Yes — real node counts from hide.js | ✓ FLOWING |
| `src/cli.js` | `hideSummary` | `runPreparePipeline` return | Captured but intentionally unused in Phase 4 | ✓ FLOWING (Phase 6 will consume) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Module imports resolve | `node -e "import('./src/prepare/index.js').then(m => console.log(Object.keys(m).join(',')))"` | `installAnimationGuards,runPreparePipeline` | ✓ PASS |
| smoke.yaml validates | `node -e "import('./src/config/load.js').then(m => m.loadConfig('samples/smoke.yaml')).then(c => console.log(c.prepare.extraDelay))"` | `1000` | ✓ PASS |
| Hermetic smoke (orchestrator-verified) | `node index.js capture samples/smoke.yaml --smoke` | `prepare: 2.035s`, exit 0, `/tmp/framershot-smoke/home.png` 32.6 KB | ✓ PASS |
| E2E inline assertions (executor-verified) | Node E2E script in 04-05 Task 4 | `PREP-01..05 all pass. anim:0s io:1 hide:hidden lazy:true(100) extraDelay+:2048ms hide.matched:1` | ✓ PASS |

Step 7b note: The hermetic smoke run cannot be re-executed here without starting the fixture server. The orchestrator's confirmed smoke result (exit 0, prepare: 2.035s, 32.6 KB PNG) is accepted as the behavioral pass.

### Probe Execution

No probe scripts (`scripts/*/tests/probe-*.sh`) declared or discovered for Phase 4. The equivalent is the hermetic smoke run referenced above.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| PREP-01 | 04-01, 04-04, 04-05 | CSS injection `animation: none !important; transition: none !important` | ✓ SATISFIED | `animations.js:97-106`: universal CSS rule in `context.addInitScript`. Style element with `data-framershot="animation-guards"`. E2E: `anim:0s`. |
| PREP-02 | 04-01, 04-04, 04-05 | Framer Motion appear effects fire via IO replacement | ✓ SATISFIED | `animations.js:51-90`: `ShimIO` replaces `window.IntersectionObserver` and `globalThis.IntersectionObserver`. `observe()` fires callback via `Promise.resolve().then()`. E2E: `io:1` (opacity flipped from 0 to 1). |
| PREP-03 | 04-02, 04-04, 04-05 | Selectors in `hide` list hidden before capture | ✓ SATISFIED | `hide.js:80`: `setProperty('visibility', 'hidden', 'important')`. `index.js:42`: `hideSelectors(page, prepareConfig.hide)`. `smoke.yaml`: `hide: ['.hidden-by-test']`. E2E: `hide:hidden`. |
| PREP-04 | 04-03, 04-04, 04-05 | Scroll prime runs in viewport-height steps with wait | ✓ SATISFIED | `scroll.js:44-60`: loop `for (y = 0; y < totalHeight; y += innerHeight)` + `page.waitForTimeout(200)`. Final reset to `scrollY=0`. E2E: `lazy:true(100)` (lazy image loaded). |
| PREP-05 | 04-03, 04-04, 04-05 | `extraDelay` ms honored before capture | ✓ SATISFIED | `scroll.js:77-80`: `if (ms <= 0) return; await page.waitForTimeout(ms)`. `smoke.yaml`: `extraDelay: 1000`. E2E: `extraDelay+:2048ms`, smoke output `prepare: 2.031s`. |

All five PREP-* requirements assigned to Phase 4 in REQUIREMENTS.md are covered. No orphaned requirements found. REQUIREMENTS.md checkboxes still show `[ ]` (not updated to `[x]`) — this is a documentation gap, not an implementation gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER found | — | — |

All seven Phase 4 modified files are clean of debt markers and stub patterns. No `return null`, `return {}`, `return []` stubs in non-short-circuit positions. Library posture (no `console.*`, no `process.exit`, no chalk/ora) confirmed in all four `src/prepare/*.js` files.

One note: `REQUIREMENTS.md` traceability table still shows `PREP-01..05` as `Pending` with unchecked `[ ]` checkboxes. This is the requirements document's status field, not a code issue. The implementations exist and are E2E-verified. This is informational only.

### Human Verification Required

#### 1. Screenshot content inspection (SC#1, SC#2, SC#3)

**Test:** Run the hermetic smoke fixture and inspect the produced PNG:
```
node samples/serve-smoke.js &
node index.js capture samples/smoke.yaml --smoke
# Inspect /tmp/framershot-smoke/home.png
kill %1
```
**Expected:**
- SC#1 — The yellow `.anim-target` box appears static (not mid-spin). If animations were not frozen, it would appear at a rotated angle.
- SC#2 — The grey `.hidden-by-test` element (with text "this element SHOULD be hidden") is NOT visible — the area should show the page background color through where it was.
- SC#3 — The green PREP-04 SVG image renders below the gradient spacer (not a blank/broken image placeholder).

**Why human:** Pixel-level screenshot content cannot be verified with grep. An image-comparison library (sharp, Jimp, etc.) is not present in the project. The E2E inline-assertions script (run by the executor) reported all assertions passing, but re-running it requires starting the fixture server, which is a stateful networked operation.

### Gaps Summary

No gaps found. All five success criteria are met by the implementation evidence:

1. **SC#1** (no partially-played animations) — `animations.js` CSS injection confirmed. E2E `anim:0s` pass.
2. **SC#2** (hidden elements not visible) — `hide.js` visibility:hidden confirmed. E2E `hide:hidden` pass.
3. **SC#3** (lazy images loaded) — `scroll.js` 200ms inter-step wait confirmed. E2E `lazy:true(100)` pass.
4. **SC#4** (extraDelay observable via console.time) — `cli.js` console.time gated on opts.smoke confirmed. Smoke output `prepare: 2.031s` >= 1000ms floor.
5. **SC#5** (CSS animation and transition none globally) — `animations.js` universal `*` rule with `!important` confirmed. Style element with `data-framershot="animation-guards"` marker confirmed.

The `human_needed` status is solely because screenshot content inspection (pixel correctness of SC#1/SC#2/SC#3) requires human eyes or an image-comparison tool. All automated checks pass.

---

_Verified: 2026-05-22T12:30:00Z_
_Verifier: Claude (gsd-verifier)_
