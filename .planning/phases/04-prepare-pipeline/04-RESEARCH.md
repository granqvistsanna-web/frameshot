# Phase 4: Prepare Pipeline — Research

**Researched:** 2026-05-22
**Domain:** CSS injection timing, Framer Motion's IntersectionObserver-driven `whileInView`, lazy-image scroll prime, prepare-step orchestration
**Confidence:** HIGH (Playwright APIs, IO mechanism) / MEDIUM (Framer Motion internals — verified by reading their public docs + their changelog, not their bundled production code)

## Summary

Phase 4 is the differentiating phase of framershot. Phase 3 produced a `Page` that has finished `networkidle` and `document.fonts.ready`. Phase 4 mutates that page — globally — before Phase 5 captures it. The five PREP-* requirements decompose into three architecturally distinct concerns:

1. **Animation freeze (PREP-01).** Globally kill every CSS animation/transition before any page script runs. The user's brief names CSS injection (`animation: none !important; transition: none !important`) — that's the right tier of intervention, but the canonical pattern is to inject it via `page.addInitScript` (runs before any page script) rather than `page.addStyleTag` (runs after load, leaves a race window). Playwright ALSO has a built-in `page.screenshot({ animations: 'disabled' })` option that stops CSS animations + CSS transitions + Web Animations API tweens at screenshot time — this matters for Phase 4/5's boundary because Framer Motion runs on WAAPI (verified at motion.dev) and the Playwright option fast-forwards WAAPI to completion automatically. **Recommendation: do both.** Use `addInitScript` to inject the CSS for the visible-in-headed-debug-runs reason (success criterion #5: "observable by inspecting computed styles in a headed debug run"), AND pass `animations: 'disabled'` on Phase 5's screenshot calls as belt-and-braces for WAAPI fast-forward. [VERIFIED: types.d.ts:12146-12153]

2. **Framer Motion in-view triggers (PREP-02).** This is the actual differentiator that justifies a personal Framer-specific tool existing. Framer's published in-view detection is `motion.inView()` / React `whileInView` — both use `IntersectionObserver` under the hood (verified at motion.dev/docs/inview). The naive `animations: none` approach freezes appear effects MID-FLIGHT (e.g. `opacity: 0.4`) because the appear effect's `initial` state never animated to the `animate` state — the IO trigger never fired. The fix is **NOT** to disable the animation, but to make the IO fire IMMEDIATELY for every observed target, so all `whileInView` callbacks complete, then once the elements are in their final state, freeze animations. There is also a Framer-Motion-internal flag `MotionGlobalConfig.skipAnimations` (added in 10.17, January 2024 — verified in motion's CHANGELOG.md) BUT it is NOT exposed on `window` or `globalThis`; it's accessible only via `import { MotionGlobalConfig } from 'framer-motion'` inside the page's bundle. We cannot reach it from outside. **The IO shim is the canonical, reliable approach.** The brief's `window.__framer_motion_disabled` flag is NOT a real Framer convention — `MotionGlobalConfig.skipAnimations` is the real flag but inaccessible from our position; we should not pretend the global exists.

3. **Element hiding + scroll prime + delay (PREP-03/04/05).** Mechanical, low-risk:
   - PREP-03 uses `visibility: hidden` (NOT `display: none`) so removed elements still occupy their layout slots — critical because Phase 5's scroll-stitch math depends on consistent scroll height.
   - PREP-04 scrolls in `window.innerHeight` steps, waits ~200ms between steps, then `window.scrollTo(0, 0)` final reset. The wait between steps lets browser-native `loading="lazy"` images trigger their built-in IntersectionObservers.
   - PREP-05 is `await page.waitForTimeout(extraDelay)` after scroll prime, before capture.

**Module layout recommendation:**

```
src/prepare/
├── animations.js     # PREP-01 + PREP-02 — exports installAnimationGuards(page)
├── hide.js           # PREP-03         — exports hideSelectors(page, selectors)
├── scroll.js         # PREP-04         — exports scrollPrime(page)
└── index.js          # orchestrator    — exports prepare(page, prepareConfig)
```

`prepare(page, prepareConfig)` is the only entry point the CLI imports. Internal modules each handle ONE prep step. The ordering inside `prepare()` is locked: install IO shim BEFORE goto (this means `installAnimationGuards` must be called by the CLI **before** `navigateToPage` — Phase 3 boundary will shift slightly, see §Architecture).

**Primary recommendation:** Two-phase prepare. **Pre-navigation** (CLI calls `installAnimationGuards(context)` BEFORE `navigateToPage`) installs the IO shim and animation-disabling CSS via `page.addInitScript`/`browserContext.addInitScript` — these MUST run before Framer's bundle executes, or the bundle captures the original `IntersectionObserver` constructor. **Post-navigation** (CLI calls `runPreparePipeline(page, config.prepare)` AFTER `navigateToPage` returns) does `hideSelectors → scrollPrime → extraDelay`. Verification extends Phase 3's `--smoke` flag: the existing smoke flow already runs prepare for free if we slot the call between navigate and screenshot. No new CLI surface.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PREP-01 | Animations are disabled before capture via CSS injection (`animation: none !important; transition: none !important`) | §Pattern 1 (addInitScript + addStyleTag belt-and-braces); §Standard Stack (Playwright native `animations: 'disabled'` for WAAPI fast-forward); §Pitfall 1 (addInitScript timing); §Pitfall 4 (Web Animations API coverage); §Pitfall 7 (Playwright animations option does not cover SVG SMIL — acknowledged but out of scope for Framer sites which don't use SMIL) |
| PREP-02 | Framer Motion appear effects fire instantly via IntersectionObserver replacement so in-view triggers complete before capture | §Pattern 2 (IO shim — installed via addInitScript before Framer bundle runs); §Don't Hand-Roll (Framer Motion's whileInView is built on IntersectionObserver — motion.dev/docs/inview); §Pitfall 2 (`MotionGlobalConfig.skipAnimations` is inaccessible from outside the page bundle — IO shim is the canonical approach); §Pitfall 3 (timing — must shim BEFORE goto, not after) |
| PREP-03 | Selectors in the config's `hide` list are hidden from the page before capture | §Pattern 3 (hide via visibility: hidden — NOT display: none); §Pitfall 5 (display: none changes scroll height and breaks Phase 5's stitch math); §Anti-Patterns (no warning on missing selectors — Phase 6 owns that) |
| PREP-04 | Scroll prime runs (scroll to bottom in viewport-height steps with wait, then scroll back to top) when enabled in config | §Pattern 4 (window.innerHeight step + 200ms wait + window.scrollTo(0, 0) reset); §Don't Hand-Roll (browser-native loading="lazy" IO triggers); §Pitfall 6 (do NOT use behavior: 'smooth' — race against scroll animation) |
| PREP-05 | Configured `extraDelay` (ms) is honored before capture begins | §Pattern 5 (page.waitForTimeout); §Architecture (extraDelay runs LAST in the prepare sequence, immediately before capture); §Code Examples (console.time hook for SC #4 verification) |
</phase_requirements>

## User Constraints (from PROJECT.md + ROADMAP.md + REQUIREMENTS.md + Phase 2/3 outputs)

No `CONTEXT.md` exists for Phase 4 (no `/gsd:discuss-phase` run was invoked). Constraints derive from project-level docs and from what Phases 2/3 actually shipped.

### Locked Decisions (from PROJECT.md + REQUIREMENTS.md + completed phases)
- **Zero new dependencies.** Phase 4 uses only what's already installed: `playwright-chromium` (for `page.addInitScript`, `page.evaluate`, `page.waitForTimeout`), `commander` (no surface changes), nothing else. No new helper libraries for IO shimming or DOM mutation — both fit in ~30 lines of inline browser-context code.
- **Single page/viewport in v0.1.** Schema already enforces `viewport: object` and `page: object` (not arrays). Prepare runs once per capture run.
- **Local only, personal tool.** No telemetry, no progress UI in prepare modules. Spinners are Phase 6's job.
- **`config.prepare` shape is locked** by Phase 2's schema (verified by reading `src/config/schema.js` lines 22-34):
  ```
  prepare: {
    animations: boolean (default: true),       // PREP-01 + PREP-02 — single toggle for the whole animations pipeline
    hide: string[] (default: []),              // PREP-03
    scrollPrime: boolean (default: true),      // PREP-04
    extraDelay: number int >= 0 (default: 0),  // PREP-05
  }
  ```
  Phase 4 **MUST consume this shape verbatim** — no new keys, no renames. The single `animations` boolean controls both CSS-injection AND the IO shim (since they are inseparable in implementation: shimming IO without freezing CSS leaves Framer's WAAPI tweens free to play, freezing CSS without shimming IO leaves elements stuck at `initial`). See §Pitfall 12 for why the brief's mental model of these as two requirements (PREP-01 + PREP-02) cannot be exposed as two config toggles.
- **Phase 3's `--smoke` is the verification seam.** Phase 4 should not add a new CLI flag. Smoke already drives `launch → navigate → screenshot → close`; Phase 4 inserts prepare between navigate and screenshot. The existing hermetic fixture (`samples/serve-smoke.js` + `samples/smoke.yaml`) needs to grow some Framer-Motion-like content so PREP-02 is exercised hermetically. See §Validation Architecture.
- **Module root is `src/`** (Phase 3 SUMMARY confirms — never `lib/`).
- **Library shape:** Phase 4 modules NEVER log, NEVER call `process.exit`, NEVER import chalk/ora. Same posture as `src/browser/launcher.js` and `src/browser/navigator.js`. Errors throw or are warnings the caller can capture.

### Claude's Discretion
- **Module file layout under `src/prepare/`** — recommendation in §Architecture: 4 files (`animations.js`, `hide.js`, `scroll.js`, `index.js`).
- **Exact function signatures** — recommendation in §Architecture; the canonical one is `prepare(page, prepareConfig): Promise<void>`.
- **CSS rule set for PREP-01** — the brief names `animation: none !important; transition: none !important`. Recommendation in §Pattern 1: extend slightly to cover `animation-delay`, `animation-duration`, `transition-delay`, `transition-duration` (all to 0s) for belt-and-braces; honor the brief literally for the visible-in-computed-styles SC #5 check.
- **Whether to split prepare into two phases (pre-nav for IO shim, post-nav for hide/scroll/delay)** — recommendation in §Architecture: YES, this is required by IO shim timing (Pitfall 3).
- **Wait between scroll steps for PREP-04** — recommendation in §Pattern 4: 200ms (covers the IntersectionObserver-based `loading="lazy"` trigger which fires on the next event loop iteration after the element crosses the rootMargin threshold).
- **Warning behavior when `hide` selector matches nothing** — silent in Phase 4. CLI-03 (Phase 6) will print a warning if the selector matched zero elements. Recommendation in §Architecture: `hideSelectors` returns a `{ matched: number, missed: string[] }` summary the caller may inspect; Phase 4 ignores it, Phase 6 surfaces it.
- **Whether to expose `MotionGlobalConfig.skipAnimations` set via shim** — recommendation in §Pitfall 2: NO. The flag is package-scoped, not window-scoped. Pretending we can set it is incorrect.

### Deferred Ideas (OUT OF SCOPE — do not research)
- Per-element prepare (e.g. "hide nav but only on this page") — v0.2 if at all (HOOK-01 territory).
- `whileHover` / `whileTap` triggers — these require user input that headless capture never provides. Framer's appear effects only matter because IO fires automatically; hover/tap don't fire automatically, so they're trivially "captured at rest." No prepare work needed.
- View Transitions API — Framer doesn't use it as of 2026-05; the App Router cross-route version is a Next.js concern, not Framer. Not in scope.
- CSS scroll-driven animations (`scroll-timeline`) — same: Framer doesn't ship them. The injected CSS does NOT cover this, but it's out of scope for v0.1.
- `loading="lazy"` polyfill — modern Chromium has native lazy-loading. We don't ship a polyfill.
- SVG SMIL animation pausing — Framer doesn't use SMIL. Acknowledged as a Playwright `animations: 'disabled'` gap (Pitfall 7) but not addressed.
- Cookie / consent-banner clicks — that's HOOK-01 in v0.3.
- Progress UI during prepare — Phase 6.
- Per-prep-step timing instrumentation — Phase 6 adds it if useful.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Inject CSS to disable animations | Browser layer (`src/prepare/animations.js`) via Playwright `page.addInitScript` + `page.addStyleTag` | — | Pre-navigation injection lives at the same layer as `launchBrowser` — both write through the Playwright API to the headless Chromium subprocess. |
| Replace `window.IntersectionObserver` with synchronous shim | Browser layer (`src/prepare/animations.js`) via `page.addInitScript` | — | IO shim MUST install before the page's JS runs; `addInitScript` is the only Playwright API that delivers code into the page context before any page script executes. |
| Hide elements by CSS selector | Browser layer (`src/prepare/hide.js`) via `page.evaluate` | — | A `page.evaluate` call DOM-mutates after navigation; no native Playwright API needs a CSS selector list as input (no, locator-mask via `page.screenshot({ mask: [...] })` doesn't apply — it pink-boxes, doesn't hide layout). |
| Scroll-prime in viewport-height steps | Browser layer (`src/prepare/scroll.js`) via `page.evaluate` + `page.waitForTimeout` | — | Combined DOM-read (innerHeight, scrollHeight) + DOM-write (scrollTo) + timer. All Playwright primitives at the same tier. |
| Honor `extraDelay` | Browser layer (`src/prepare/scroll.js` or `index.js`) via `page.waitForTimeout` | — | Trivial; final step of orchestrator. |
| Orchestrate all five prep steps in order | Browser layer (`src/prepare/index.js`) | — | Exposes ONE entry point: `prepare(page, prepareConfig)`. CLI layer is unaware of internal module split. |
| Decide WHEN to run prepare (between navigate and capture) | CLI layer (`src/cli.js`) | Browser layer | The CLI owns the lifecycle (try/finally per Phase 3); it inserts the `await prepare(...)` call between `navigateToPage` and the screenshot/capture step. |
| Decide what to do if `hide` selector matches nothing | Phase 6 (terminal UX) | Browser layer (returns summary) | Phase 4 returns observability data; Phase 6 prints warnings. Don't bake presentation into library code. |

## Standard Stack

### Core (already installed in Phase 1 — zero new packages in Phase 4)
| Library | Version (verified 2026-05-22) | Purpose | Why Standard |
|---------|-------------------------------|---------|--------------|
| `playwright-chromium` | 1.60.0 [VERIFIED: npm registry, latest stable; alpha builds are 1.61.0-alpha-2026-05-22 — verified by `npm view playwright-chromium time`] | `page.addInitScript`, `page.addStyleTag`, `page.evaluate`, `page.waitForTimeout` | Microsoft-maintained; all four APIs are stable across 1.x. The `addInitScript` semantics (runs before any page script in the document context) is the single most important thing this phase depends on — see Pitfall 3. |

### Playwright APIs this phase uses

| API | Signature (verified types.d.ts) | Used For | Notes |
|-----|------|----------|-------|
| `page.addInitScript(fn, arg?)` | `<Arg>(script: PageFunction<Arg, any> \| { path?, content? }, arg?: Arg): Promise<Disposable>` (types.d.ts:318) | Inject the IO shim + animation-killing CSS before any page script runs | `addInitScript` order is NOT defined — see Pitfall 3 |
| `page.addStyleTag({ content })` | `addStyleTag(options?: { content?, path?, url? }): Promise<ElementHandle>` (types.d.ts:2031) | Inject the animation-killing CSS AFTER navigation (belt-and-braces) | Returns an ElementHandle; we ignore the return |
| `page.evaluate(fn, arg?)` | Standard | Hide selectors, run scroll-prime loop | Wrapper around CDP Runtime.evaluate |
| `page.waitForTimeout(ms)` | Standard | extraDelay + inter-scroll-step wait | Discouraged in tests; appropriate for screenshot/prep work |
| `page.screenshot({ animations: 'disabled' })` | `animations?: "disabled"\|"allow"` (types.d.ts:12153) | Belt-and-braces WAAPI fast-forward in Phase 5; not used directly in Phase 4 | "stops CSS animations, CSS transitions and Web Animations" verbatim from docs |

### Supporting Libraries (no new installs)
None. Phase 4 is pure orchestration of existing Playwright primitives + small inline page-context functions.

### Alternatives Considered (and rejected)
| Instead of | Could Use | Why we don't |
|------------|-----------|--------------|
| `page.addInitScript` for IO shim | `browserContext.addInitScript` (one call per context, not per page) | Functionally equivalent for v0.1 single-page model. `page.addInitScript` keeps the lifecycle co-located with the page being prepared, easier to reason about. Switch to context-level if v0.2 multi-page reuses contexts. |
| Custom IO shim | Real polyfill (e.g. the `intersection-observer` npm package) | Polyfills implement IO correctly. We want it to LIE — every entry should report `isIntersecting: true` immediately. A polyfill is the wrong tool. |
| Set `MotionGlobalConfig.skipAnimations = true` via shim | IO replacement | Cannot — see Pitfall 2. The flag is not exposed globally. |
| Native `page.screenshot({ animations: 'disabled' })` only | Custom CSS injection | The native option works ONLY at screenshot time (Phase 5). It does NOT fire IO triggers. PREP-02 needs IO to fire BEFORE the screenshot. CSS injection ALSO satisfies SC #5 ("observable by inspecting computed styles in a headed debug run") which the screenshot-time option doesn't. **We use both, for different reasons.** |
| `page.locator(selector).evaluate(el => el.style.display = 'none')` per selector | One `page.evaluate` with the whole list | Locator API does lots of actionability checking we don't need. Plain evaluate is faster and the right primitive for "set CSS once and forget." |
| `display: none` to hide elements | `visibility: hidden` | display: none removes from layout, shrinking the page height — breaks Phase 5's scroll-stitch math. visibility: hidden keeps layout, removes rendering. (Pitfall 5.) |
| `behavior: 'smooth'` in `window.scrollTo` | `behavior: 'instant'` (or default which is instant) | Smooth scrolling animates over ~300ms; race conditions with lazy-load triggers; instant is deterministic. (Pitfall 6.) |
| MutationObserver to wait for lazy-load completion | Fixed 200ms wait per scroll step | MutationObserver adds complexity; the right signal would be "no more network requests" but we're past `networkidle` already. A short fixed delay is robust for v0.1 — Phase 5 can revisit if real pages need more. |

## Package Legitimacy Audit

slopcheck was unavailable in this environment (sandbox restrictions). However, Phase 4 introduces **zero new packages** — it only consumes `playwright-chromium@1.60.0` (already vetted in Phase 1 and re-confirmed by Phase 3's audit; binary present at `~/Library/Caches/ms-playwright/chromium-1223/`).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| playwright-chromium | npm (1.60.0) | 5+ yrs | ~1.5M/wk | github.com/microsoft/playwright | unavailable | Approved (already declared in Phase 1; re-used unchanged) |

**Packages removed:** none
**Packages flagged [SUS]:** none
**New packages introduced by Phase 4:** **NONE.**

## Architecture Patterns

### System Architecture Diagram

```
                            CLI layer (src/cli.js capture action)
                                          │
                                          │ validated config (Phase 2)
                                          ▼
              ┌─────────────────────────────────────────────────────┐
              │ launchBrowser(config)        (Phase 3 — unchanged)  │
              │   returns { browser, context }                      │
              └────────────────────────┬────────────────────────────┘
                                       │
                                       ▼
            ┌────────────────────────────────────────────────────────┐
            │ ★ NEW Phase 4 INSERTION POINT — pre-navigation hook ★  │
            │ installAnimationGuards(context, prepareConfig)         │
            │   ├─ context.addInitScript(IO_SHIM)         ← BEFORE   │
            │   └─ context.addInitScript(KILL_ANIM_CSS)   ← BEFORE   │
            │ (must run BEFORE navigateToPage so addInitScript fires │
            │  before Framer's bundle captures the original IO)      │
            └────────────────────────┬───────────────────────────────┘
                                     │
                                     ▼
              ┌─────────────────────────────────────────────────────┐
              │ navigateToPage(context, page)  (Phase 3 — unchanged)│
              │   ├─ context.newPage()                              │
              │   │   ↑ when this fires the new page evaluates the  │
              │   │     init scripts we registered → IO is shimmed  │
              │   │     before Framer's JS runs → all IO observers  │
              │   │     get isIntersecting: true → whileInView fires│
              │   │     and completes → CSS injection then freezes  │
              │   │     elements in their final state               │
              │   ├─ goto(path, { waitUntil: 'networkidle', t:15k })│
              │   └─ waitForFunction(() => document.fonts.ready)    │
              └────────────────────────┬────────────────────────────┘
                                       │ Page (settled, fonts loaded,
                                       │       Framer Motion fired and frozen)
                                       ▼
            ┌────────────────────────────────────────────────────────┐
            │ ★ NEW Phase 4 INSERTION POINT — post-navigation hook ★ │
            │ runPreparePipeline(page, prepareConfig)                │
            │   ├─ if hide.length:    hideSelectors(page, hide)      │
            │   ├─ if scrollPrime:    scrollPrime(page)              │
            │   └─ if extraDelay > 0: page.waitForTimeout(extraDelay)│
            └────────────────────────┬───────────────────────────────┘
                                     │ Page (prepared — ready for capture)
                                     ▼
              ┌─────────────────────────────────────────────────────┐
              │ Phase 3 --smoke branch (single screenshot)          │
              │   page.screenshot({                                 │
              │     path: resolvedOutput,                           │
              │     fullPage: false,                                │
              │     animations: 'disabled',  ← Phase 4 adds         │
              │   })                                                │
              │                                                     │
              │ Phase 5 production path (scroll-stitch)             │
              │   captureLoop(page) → sharp.stitch(frames) → write  │
              └────────────────────────┬────────────────────────────┘
                                       │
                                       ▼
              ┌─────────────────────────────────────────────────────┐
              │ finally: context.close() → browser.close()          │
              │ (CLI layer owns the lifecycle — Phase 3 pattern)    │
              └─────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── cli.js                         (Phase 2/3 — modified by Phase 4: insert prepare calls)
├── config/                        (Phase 2 — unchanged)
├── output/                        (Phase 2 — unchanged)
├── browser/
│   ├── launcher.js                (Phase 3 — unchanged)
│   └── navigator.js               (Phase 3 — unchanged)
└── prepare/                       (Phase 4 — NEW)
    ├── animations.js              # PREP-01 + PREP-02 (pre-nav: IO shim + CSS via addInitScript)
    ├── hide.js                    # PREP-03 (post-nav: visibility: hidden via evaluate)
    ├── scroll.js                  # PREP-04 + PREP-05 (post-nav: scroll prime + extraDelay)
    └── index.js                   # orchestrator (entry point for CLI)
```

**Why split into four files** (vs. one 100-line `prepare.js`):
- `animations.js` is qualitatively different from the others — it's pre-navigation and writes init scripts. Co-locating it with post-nav DOM mutation invites the reader to think they're the same lifecycle. They're not.
- Each post-nav module is ~20 lines. Easy to audit independently.
- `index.js` is the single import surface for `src/cli.js` — keeps the CLI's import block clean.

### Pattern 1: installAnimationGuards — pre-navigation IO shim + CSS injection (PREP-01 + PREP-02)

**Where:** `src/prepare/animations.js`
**Called by:** CLI, BEFORE `navigateToPage`
**Why pre-navigation:** `page.addInitScript` registers a function to run as part of every new document init. If we call `addInitScript` AFTER `page.goto`, Framer's bundle has already captured `window.IntersectionObserver` into a local reference inside the bundle's module closure — our later replacement of `window.IntersectionObserver` does nothing because Framer's code no longer reads from the global. The shim MUST be installed before the bundle runs. `context.addInitScript` (preferred over `page.addInitScript` for the multi-page-future case) guarantees this. [VERIFIED: types.d.ts:318]

```javascript
// src/prepare/animations.js
// Source: types.d.ts:318 (addInitScript signature)
// Source: motion.dev/docs/inview (Framer Motion's whileInView uses IntersectionObserver) [CITED]
// Source: motion's CHANGELOG.md 10.17.0 (MotionGlobalConfig.skipAnimations exists but is NOT
//         exposed on window — accessible only inside the bundle. We use the IO shim approach
//         instead.) [CITED]
import { BrowserError } from '../browser/launcher.js';

/**
 * Install the two pre-navigation guards that fix PREP-01 (CSS animation freeze)
 * and PREP-02 (Framer Motion in-view trigger). MUST be called BEFORE navigateToPage,
 * because addInitScript registers handlers that fire on the NEXT new-document — if
 * we register them after the page has already navigated, Framer's bundle has already
 * captured window.IntersectionObserver into its closure and our replacement is moot.
 *
 * @param {import('playwright-chromium').BrowserContext} context
 *   The context returned by launchBrowser. We attach init scripts here (not on a
 *   Page yet — the Page doesn't exist; navigateToPage will create it).
 * @param {object} prepareConfig
 *   The validated config.prepare sub-object. We honor `animations: boolean` — if
 *   false, both guards are skipped (user opted out — exotic but their call).
 * @returns {Promise<void>}
 */
export async function installAnimationGuards(context, prepareConfig) {
  if (!prepareConfig.animations) return;

  // Guard 1: IntersectionObserver shim. Replaces the global so every observer
  // reports its targets as immediately intersecting. Framer Motion's
  // whileInView (and motion.inView()) build on IntersectionObserver — so
  // every appear effect fires on its first observe() call, synchronously
  // enough that by the time we screenshot, all appear effects have completed.
  //
  // We preserve the original by storing it on window.__originalIO — useful
  // if a debug session needs to inspect what the page would have done
  // without our shim. The shim does not have to be perfect; it has to be
  // CORRECT for the one thing Framer needs (firing the callback with
  // isIntersecting: true) and inert for everything else.
  await context.addInitScript(() => {
    window.__originalIO = window.IntersectionObserver;
    window.IntersectionObserver = class {
      constructor(callback, options) {
        this._callback = callback;
        this._options = options;
        this._targets = new Set();
      }
      observe(target) {
        this._targets.add(target);
        // Fire on next microtask so the consumer's observe() call returns
        // before the callback executes — matches native semantics. (Native
        // IO never fires sync from observe(); it batches to the next frame.)
        // Microtask is "soon enough" for Framer Motion's purposes.
        Promise.resolve().then(() => {
          const entry = {
            target,
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: target.getBoundingClientRect?.() ?? {},
            intersectionRect: target.getBoundingClientRect?.() ?? {},
            rootBounds: null,
            time: performance.now(),
          };
          this._callback([entry], this);
        });
      }
      unobserve(target) { this._targets.delete(target); }
      disconnect() { this._targets.clear(); }
      takeRecords() { return []; }
      // Static — some libraries feature-detect by checking constructor.toString().
      // Leave it default; if anyone reads .name they get the class name; close enough.
    };
  });

  // Guard 2: CSS injection to freeze animations after IO triggers fire.
  // Note this CSS runs in addition to (not instead of) Playwright's screenshot
  // animations:'disabled' option — that option fast-forwards WAAPI animations
  // at screenshot time, but doesn't prevent CSS animations from PLAYING
  // before screenshot. We want them never to play in the first place, so the
  // page reaches a steady state during prepare/scroll-prime. The injected
  // CSS also satisfies SC #5: "observable by inspecting computed styles in
  // a headed debug run" — Playwright's screenshot-time option is invisible
  // to getComputedStyle.
  //
  // The verbatim rule from the brief is `animation: none !important; transition: none !important`.
  // We honor that AND extend slightly (animation-delay 0s, transition-delay 0s,
  // both -duration 0s) to cover the case where a transition has already started
  // and a "none" override doesn't immediately complete it — see Pitfall 8.
  await context.addInitScript(() => {
    const css = `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `;
    // Attach as soon as <head> exists. addInitScript runs at "document_start"
    // semantically — i.e. before any document content has been parsed.
    // document.documentElement may exist (Chromium creates the HTML element
    // very early) but document.head may not yet. We listen for head-ready.
    const inject = () => {
      const style = document.createElement('style');
      style.dataset.framershot = 'animation-guards';
      style.textContent = css;
      (document.head ?? document.documentElement).appendChild(style);
    };
    if (document.head) {
      inject();
    } else {
      // Run when the head exists. MutationObserver is overkill; readystatechange
      // catches the load lifecycle at the earliest point head is reliable.
      document.addEventListener('readystatechange', () => {
        if (document.head && !document.querySelector('style[data-framershot="animation-guards"]')) {
          inject();
        }
      });
    }
  });
}
```

**Important note on `addInitScript` order:** Playwright explicitly says the order of multiple init scripts is "not defined" (types.d.ts:308-311). For our two guards this is fine — they don't depend on each other's ordering. Both must run before the bundle, that's all.

### Pattern 2: hideSelectors — post-navigation element hiding (PREP-03)

**Where:** `src/prepare/hide.js`
**Called by:** CLI orchestrator, AFTER `navigateToPage` returns, BEFORE scrollPrime
**Why post-navigation:** The selectors are static strings from the YAML, but the DOM doesn't exist until after `goto`. We could try `addInitScript` for this too, but a single `evaluate` after navigation is simpler and lets us return a "matched count" for Phase 6's warning surface.

```javascript
// src/prepare/hide.js
// Source: types.d.ts page.evaluate signature
// CSS rule choice (visibility: hidden, not display: none) per RESEARCH §Pitfall 5
// — display: none reduces scroll height and breaks Phase 5's stitch math.

/**
 * Hide elements matching the given CSS selectors using `visibility: hidden`.
 * (NOT display: none — that changes layout. Layout must stay stable so
 * Phase 5's scroll-stitch math holds.)
 *
 * Returns a summary { matched, missed } for Phase 6's warning UI. Phase 4
 * does not consume the return — it's informational only.
 *
 * @param {import('playwright-chromium').Page} page
 * @param {string[]} selectors  list of CSS selectors (config.prepare.hide)
 * @returns {Promise<{ matched: number, missed: string[] }>}
 */
export async function hideSelectors(page, selectors) {
  if (!Array.isArray(selectors) || selectors.length === 0) {
    return { matched: 0, missed: [] };
  }

  return page.evaluate((sels) => {
    let matched = 0;
    const missed = [];
    for (const sel of sels) {
      // querySelectorAll never throws on no-match (returns empty NodeList);
      // it DOES throw on invalid syntax. Wrap to convert to "missed" so
      // a typo doesn't kill the whole prepare pipeline.
      let nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch {
        missed.push(sel);
        continue;
      }
      if (nodes.length === 0) {
        missed.push(sel);
        continue;
      }
      for (const node of nodes) {
        // Use the .style.cssText pattern so we can mark it inline-important
        // — a Framer site's own stylesheets may have higher specificity than
        // a simple .style.visibility = 'hidden' assignment.
        node.style.setProperty('visibility', 'hidden', 'important');
        matched++;
      }
    }
    return { matched, missed };
  }, selectors);
}
```

### Pattern 3: scrollPrime — scroll in viewport-height steps, then reset (PREP-04)

**Where:** `src/prepare/scroll.js`
**Called by:** CLI orchestrator, AFTER `hideSelectors`, BEFORE `extraDelay`

```javascript
// src/prepare/scroll.js
// Source: types.d.ts page.evaluate + page.waitForTimeout signatures
// Pattern: scroll to bottom in window.innerHeight steps, 200ms wait between,
// then scrollTo(0, 0) for capture start. The wait between steps gives
// browser-native loading="lazy" IntersectionObservers their next-tick window
// to fire and start fetching images.

const INTER_STEP_WAIT_MS = 200;

/**
 * Scroll the page from top to bottom in viewport-height steps, pausing
 * INTER_STEP_WAIT_MS between steps so browser-native lazy-load triggers
 * fire and start their image fetches. After reaching the bottom, scrolls
 * back to the top so the capture starts from a known position.
 *
 * Uses behavior: 'instant' (the default) for deterministic positioning —
 * smooth scrolling would animate over ~300ms and race with the inter-step
 * wait. See RESEARCH §Pitfall 6.
 *
 * @param {import('playwright-chromium').Page} page
 * @returns {Promise<void>}
 */
export async function scrollPrime(page) {
  // Read the metrics once (innerHeight, scrollHeight) at the start.
  // We don't re-read in the loop — if lazy content extends the page,
  // we just don't visit those new pixels in this prepare pass. Phase 5's
  // scroll-stitch loop is the place that re-reads on each iteration; here
  // we just need to PRIME, not exhaustively cover.
  const { innerHeight, totalHeight } = await page.evaluate(() => ({
    innerHeight: window.innerHeight,
    totalHeight: document.documentElement.scrollHeight,
  }));

  for (let y = 0; y < totalHeight; y += innerHeight) {
    await page.evaluate((targetY) => {
      // 'instant' is the default and we set it explicitly. Avoid 'smooth' —
      // it animates the scroll over ~300ms and races with our 200ms wait.
      window.scrollTo({ top: targetY, behavior: 'instant' });
    }, y);
    await page.waitForTimeout(INTER_STEP_WAIT_MS);
  }

  // Final reset to top — Phase 5's capture loop assumes scrollY=0 at start.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
}

/**
 * Honor config.prepare.extraDelay (PREP-05). Trivial wrapper around
 * page.waitForTimeout; the named export gives the orchestrator a clear
 * site for the "console.time / console.timeEnd" SC #4 hook (see
 * RESEARCH §Code Examples).
 *
 * @param {import('playwright-chromium').Page} page
 * @param {number} ms  non-negative integer milliseconds
 * @returns {Promise<void>}
 */
export async function extraDelay(page, ms) {
  if (ms <= 0) return;
  await page.waitForTimeout(ms);
}
```

### Pattern 4: prepare orchestrator — the single entry point CLI consumes

**Where:** `src/prepare/index.js`
**Called by:** `src/cli.js` capture action

```javascript
// src/prepare/index.js
// The single entry point Phase 4 exposes to the CLI layer.
// Two functions, called from CLI in this order:
//   1. installAnimationGuards(context, prepareConfig)  ← BEFORE navigateToPage
//   2. runPreparePipeline(page, prepareConfig)         ← AFTER navigateToPage
//
// Splitting (vs. one wrapper that does both) is dictated by IO-shim timing:
// see RESEARCH §Pattern 1 and §Pitfall 3. The CLI knows the order;
// the prepare module doesn't pretend to.

import { installAnimationGuards as _install } from './animations.js';
import { hideSelectors } from './hide.js';
import { scrollPrime, extraDelay } from './scroll.js';

// Re-export so the CLI imports both from one place
export { installAnimationGuards } from './animations.js';

/**
 * Run the post-navigation prep pipeline: hide → scroll-prime → extra delay.
 * Animation guards (PREP-01 + PREP-02) are installed separately by
 * installAnimationGuards BEFORE navigation — this function does NOT touch them.
 *
 * Returns the hide-selectors summary so the CLI (or Phase 6) can surface
 * warnings if any selector matched nothing.
 *
 * @param {import('playwright-chromium').Page} page
 * @param {object} prepareConfig  validated config.prepare sub-object
 * @returns {Promise<{ hideSummary: { matched: number, missed: string[] } }>}
 */
export async function runPreparePipeline(page, prepareConfig) {
  // PREP-03 — hide selectors. Empty list is a no-op (defaults to []).
  const hideSummary = await hideSelectors(page, prepareConfig.hide);

  // PREP-04 — scroll prime. Toggled by config; defaults to true.
  if (prepareConfig.scrollPrime) {
    await scrollPrime(page);
  }

  // PREP-05 — extra delay. Defaults to 0; the helper short-circuits.
  await extraDelay(page, prepareConfig.extraDelay);

  return { hideSummary };
}
```

### Pattern 5: CLI integration — Phase 3's capture action body, modified

The CLI's capture action gains two new lines, in two places:

```javascript
// src/cli.js — modifications (paraphrased for clarity)
import { installAnimationGuards, runPreparePipeline } from './prepare/index.js';

// ... inside the action handler, after loadConfig + resolveTemplate ...

const { browser, context } = await launchBrowser(config);
try {
  // ★ NEW: pre-navigation hook — register init scripts BEFORE first page is created
  await installAnimationGuards(context, config.prepare);

  const navigatedPage = await navigateToPage(context, config.page);

  // ★ NEW: post-navigation hook — runs after page is loaded, before capture
  const { hideSummary } = await runPreparePipeline(navigatedPage, config.prepare);
  // Phase 6 will surface hideSummary.missed as warnings. Phase 4 ignores it.

  if (opts.smoke) {
    const { mkdir } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    await mkdir(dirname(resolvedOutput), { recursive: true });
    await navigatedPage.screenshot({
      path: resolvedOutput,
      fullPage: false,
      animations: 'disabled',  // ★ NEW: belt-and-braces WAAPI fast-forward
    });
    console.log(`smoke screenshot written: ${resolvedOutput}`);
  } else {
    // Non-smoke pass-through unchanged from Phase 3
    console.log(JSON.stringify({ ...config, _resolvedOutput: resolvedOutput, _navigated: navigatedPage.url() }, null, 2));
  }
} finally {
  await context.close();
  await browser.close();
}
```

Three changes total: one import line, one pre-nav call, one post-nav call, plus the `animations: 'disabled'` option on the smoke screenshot. Phase 3's lifecycle ordering (context.close → browser.close in finally) is unchanged.

### Anti-Patterns to Avoid

- **Don't `page.addInitScript` AFTER `goto`.** It only fires on the NEXT navigation. Our pre-nav guards must register before any page exists in the context. See Pitfall 3.
- **Don't use `display: none` to hide elements** — it removes them from layout, shrinking page height, breaking Phase 5's stitch. Use `visibility: hidden`. Pitfall 5.
- **Don't shim `IntersectionObserver` by assigning to the constructor at runtime via `page.evaluate`** — if the page's JS already grabbed the original IO into a module-private variable, your replacement is invisible. Shim via `addInitScript` so the constructor is replaced before any other JS runs. Pitfall 3.
- **Don't set `MotionGlobalConfig.skipAnimations = true` from outside the bundle** — the flag is not on `window`. We do not have access. Pitfall 2.
- **Don't `behavior: 'smooth'` on scroll prime** — animates over ~300ms, races with the 200ms wait. Use 'instant' (which is the default, set it explicitly anyway). Pitfall 6.
- **Don't log from prepare modules** — Phase 6 owns terminal UX. Library code returns data; the CLI layer decides what to print.
- **Don't add a new CLI flag for prepare.** Phase 3's `--smoke` already drives the full pipeline. Adding `--prepare-debug` or similar bloats the surface. If a user wants to skip prepare for debug, they set `prepare: { animations: false, hide: [], scrollPrime: false, extraDelay: 0 }` in the YAML.
- **Don't try to instrument prepare timing inside the prepare modules.** A `console.time` hook is fine in the CLI integration (see §Code Examples) but not inside `runPreparePipeline` — library code stays silent.
- **Don't catch errors inside prepare modules.** If the IO shim's `addInitScript` fails, or a `page.evaluate` throws (e.g. the page died), let it bubble. The CLI's try/finally handles it. Wrapping creates either swallowed bugs or fake error classes that don't add value.
- **Don't `setTimeout` inside `page.evaluate`** to implement inter-step wait. `page.waitForTimeout` is the right primitive — it's coordinated with Playwright's event loop and respects the global timeout. Mixing in-page setTimeout splits responsibility for clock control.
- **Don't take a screenshot during scroll prime** to "see" lazy images loaded. That's Phase 5's job. PREP-04 just triggers the loads; the capture happens later from y=0.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting when "in view" triggers fire | A custom MutationObserver that watches for `style="opacity: 1"` to settle | Synchronous IO shim via addInitScript | The IO shim makes triggers fire on the NEXT microtask after observe(), which is faster and more deterministic than waiting for arbitrary side effects to settle. |
| Disabling Framer Motion specifically | A page-context script that does `import('framer-motion')` and sets `MotionGlobalConfig.skipAnimations` | IO shim + CSS injection | `MotionGlobalConfig` isn't on window. The page's bundle has its own module instance. Reaching it requires either dynamic re-import (which loads a 2nd copy and doesn't affect the first) or rewriting the bundle (out of scope). The IO shim approach is library-agnostic — it works for any IntersectionObserver-based animation library, not just Framer. |
| Animating CSS animations to completion | A custom `getAnimations() → finish()` loop via `document.getAnimations()` | Playwright's `screenshot({ animations: 'disabled' })` | The native option does exactly this for WAAPI tweens (and CSS animations via WAAPI's CSS layer). Microsoft-maintained, version-stable, free. |
| Waiting for `loading="lazy"` images | Manual `Promise.all(images.map(img => img.decode()))` | A 200ms wait per scroll step, then trust browser-native lazy IO | `image.decode()` resolves when the bitmap is decoded for the CURRENT src. If the IO hasn't fired yet, src might still be empty, so decode() resolves instantly on nothing. The right signal is "wait for IO triggers" — same primitive as PREP-02. For lazy images specifically, the browser handles IO internally, so we just need to give it a beat. |
| Smooth-scroll timing | `requestAnimationFrame` loop counting frames | `behavior: 'instant'` + `waitForTimeout(200)` | We don't want smooth. The whole point is to skip the smoothness so prepare is fast and deterministic. |
| CSS injection scope (target every element + pseudo-elements) | Manually iterating through `document.styleSheets` and patching every rule | `*, *::before, *::after { ... }` global rule | One CSS rule beats stylesheet introspection. !important + universal selector wins specificity over any author rule. |
| Selector validation | Regex on each selector | `try { document.querySelectorAll(sel) } catch { missed.push(sel) }` | The browser already parses CSS selectors. Free correctness. |

**Key insight:** PREP-01 and PREP-02 sound like two separate operations but the implementation is one block of init scripts. We can't expose them as two config toggles because shimming IO without freezing CSS leaves Framer's WAAPI tweens playing (and the appear effects fire and then play their normal animation), and freezing CSS without shimming IO leaves elements stuck at `initial: { opacity: 0 }`. The single `animations: boolean` in Phase 2's schema is correct — both guards always go together.

## Runtime State Inventory

Not applicable — Phase 4 is greenfield code. No rename/refactor/migration. The only persistent state Phase 4 touches is browser-context init scripts, which are scoped to the context lifetime and discarded on `context.close()`.

## Common Pitfalls

### Pitfall 1: `addStyleTag` instead of `addInitScript` for CSS injection
**What goes wrong:** CSS that should kill animations runs AFTER the page has loaded — but Framer's appear effects have already started during the load. The first 200-500ms of any animation is visible to the screenshot if the screenshot happens immediately after `addStyleTag`.
**Why it happens:** The intuitive choice — "inject a stylesheet" → `addStyleTag` — places the stylesheet at the END of `<head>`, AFTER all author styles. But more importantly, it runs after `load` event, which is after Framer's bundle has already kicked off animations.
**How to avoid:** Use `addInitScript` to inject the `<style>` element. The init script runs at document creation (before any author script). Use `addStyleTag` ONLY if you ALSO need the rule applied post-load for some reason — we don't here.
**Warning signs:** Headed debug screenshots show mid-animation frames; calling `page.locator('.framer-motion-element').evaluate(el => getComputedStyle(el).animationDuration)` returns the original duration, not `0s`.

### Pitfall 2: Assuming `window.__framer_motion_disabled` or `window.MotionGlobalConfig` exist
**What goes wrong:** Setting `window.__framer_motion_disabled = true` in `addInitScript` does literally nothing. Framer Motion does not read from any global window variable. The variable just exists on the window with no side effects.
**Why it happens:** The brief uses the name `window.__framer_motion_disabled` as a likely-existing convention, but it isn't one. The real flag is `MotionGlobalConfig.skipAnimations` (added Jan 2024 in framer-motion 10.17 per the [Motion CHANGELOG](https://github.com/motiondivision/motion/blob/main/CHANGELOG.md) — `"Adding MotionGlobalConfig.skipAnimations to globally disable animations when testing"`). But `MotionGlobalConfig` is the package's named export — it's a module-scope object that the bundled code holds a reference to internally. From OUR position (outside the bundle), we can't reach it: assigning `window.MotionGlobalConfig = { skipAnimations: true }` doesn't affect the bundle's own internal reference.
**How to avoid:** Don't pretend the flag exists. Use the IO shim, which is library-agnostic and works whether the page uses framer-motion, react-intersection-observer, manual IO, or anything else built on the same primitive.
**Warning signs:** Setting `window.__framer_motion_disabled = true` and seeing animations still play; setting it and the screenshots LOOK fine (false positive — the IO shim isn't catching anything either because animations were fast and finished naturally before the screenshot).

### Pitfall 3: Shim installed AFTER navigation
**What goes wrong:** `await page.evaluate(() => { window.IntersectionObserver = ... })` runs after Framer's bundle has executed `const IO = window.IntersectionObserver`. Framer's bundle now has a closure reference to the ORIGINAL IO; our replacement of `window.IntersectionObserver` is invisible to it.
**Why it happens:** It's tempting to install the shim "where the rest of prepare runs" (post-navigation). The shim FEELS like it should be in the same orchestrator block as hide/scroll/delay. But it's lifecycle-bound to module init, not DOM-ready.
**How to avoid:** ALWAYS install the IO shim via `addInitScript`, NEVER via `evaluate`. `addInitScript` registers a function that runs as part of the document-init dance, before any author script. The shim function replaces `window.IntersectionObserver` at the right moment in the page's life.
**Warning signs:** PREP-02 doesn't work — Framer Motion appear effects still freeze mid-animation in screenshots. Verify by `await page.evaluate(() => window.IntersectionObserver.toString())` — if it returns the native code (`function IntersectionObserver() { [native code] }`), the shim didn't install before Framer captured it.

### Pitfall 4: Forgetting about the Web Animations API (WAAPI)
**What goes wrong:** CSS injection kills `animation` and `transition` properties — but Framer Motion runs many animations through `element.animate()` (Web Animations API, not CSS). Those KeyframeEffect tweens are not styled via the `animation` property and ignore `animation: none !important`. Result: WAAPI animations still play after CSS injection.
**Why it happens:** Framer Motion's hybrid engine uses WAAPI for hardware-accelerated transform/opacity tweens (motion.dev/guides/waapi-improvements). [CITED] The CSS `animation` property only controls keyframe animations declared in CSS — WAAPI animations are programmatic.
**How to avoid:** Two complementary mitigations:
1. Pass `animations: 'disabled'` to `page.screenshot()` — Playwright's documented behavior is to "stop CSS animations, CSS transitions and Web Animations. Finite animations are fast-forwarded to completion" (types.d.ts:12146-12153). This is the WAAPI fast-forward we need.
2. The IO shim still matters because it makes the WAAPI tween FIRE in the first place — Framer Motion's flow is: IO entry → state change → WAAPI animation kicks off. With the shim, the animation kicks off immediately and the screenshot-time `animations: 'disabled'` fast-forwards it to completion.
**Warning signs:** Headed screenshots of Framer sites show elements at incorrect opacity or transform values — partial-tween artifacts.

### Pitfall 5: `display: none` hides elements but breaks scroll-stitch math
**What goes wrong:** Phase 5 calculates per-step capture geometry from `document.documentElement.scrollHeight`. If `display: none` removes a sticky nav (or any tall element), scrollHeight shrinks, and Phase 5's loop fewer iterations than the original page had — but the captured PNG ends up shorter than the user expected.
**Why it happens:** `display: none` removes from layout entirely; `visibility: hidden` keeps the element's layout slot but doesn't render its contents.
**How to avoid:** Always `visibility: hidden !important`. For sticky/fixed elements specifically: visibility:hidden still removes them from the visual stack (which is what we want — no ghosted navs) but keeps the layout box (which matters if the layout was sized around them, though sticky/fixed elements are out-of-flow anyway).
**Edge case:** Some Framer sites use `pointer-events: auto` overlays that need both `visibility: hidden` AND `pointer-events: none` to not interfere with anything Phase 5 might do (e.g. if Phase 5 ever needs to click for region capture in v0.2). For Phase 4 (no interaction), `visibility: hidden` alone is enough.
**Warning signs:** Screenshots are shorter than expected; sticky-nav selectors fully removed from the PNG but the page also visibly missing whitespace where the nav was.

### Pitfall 6: `behavior: 'smooth'` on scroll prime
**What goes wrong:** `window.scrollTo({ top, behavior: 'smooth' })` animates the scroll over ~300ms. The inter-step `waitForTimeout(200)` returns BEFORE the scroll completes. Lazy-load IO triggers don't fire until the element is actually in view, which depends on the actual scroll position when the IO check runs.
**Why it happens:** Smooth scroll is the prettier-feeling default for user-facing apps. It's the wrong default for prepare.
**How to avoid:** Always `behavior: 'instant'` (or omit `behavior` — defaults to instant in current Chromium). Set it explicitly to be self-documenting.
**Warning signs:** Lazy images near the middle of the page are blank in the final stitched PNG; PREP-04 takes longer than `(totalHeight / innerHeight) × 200ms`.

### Pitfall 7: SVG SMIL animations escape Playwright's `animations: 'disabled'`
**What goes wrong:** Playwright's `animations: 'disabled'` option doesn't pause SVG SMIL (`<animate>`, `<animateTransform>`) animations. ([microsoft/playwright#31403](https://github.com/microsoft/playwright/issues/31403))
**Why it happens:** SMIL is a separate animation engine from CSS animations, transitions, and WAAPI. Playwright's option only addresses the latter three.
**How to avoid:** For Framer sites specifically, SMIL is essentially never used (Framer's SVG export uses CSS or Motion, not SMIL). If a Framer site somehow includes SMIL, we'd need to inject `svg *, svg { animation-play-state: paused !important; }` plus call `svg.pauseAnimations()` on each SVG via evaluate. Document as known limitation; don't pre-emptively code for it in v0.1.
**Warning signs:** Framer site uses an external SVG embed with SMIL animations; the embed shows mid-animation in screenshots. Not expected to happen with first-party Framer.

### Pitfall 8: `animation: none !important` doesn't immediately stop in-progress animations
**What goes wrong:** A CSS animation that has already STARTED (e.g. via `:hover` or class change during the load) and is currently in its keyframe interpolation doesn't immediately snap to its final state when `animation: none !important` is set later. The interpolation may continue for a frame.
**Why it happens:** The CSS spec says changing the `animation` property is observable but the effect on already-started animations is "implementation defined." Chromium tends to clean up gracefully but the timing isn't guaranteed.
**How to avoid:** Inject the CSS BEFORE any animation can start (via `addInitScript`, which runs before page scripts) AND set `animation-duration: 0s !important; transition-duration: 0s !important` so even if something does start, it completes instantly. The extended rule set in Pattern 1 covers this.
**Warning signs:** Rare flickers in screenshots of pages with `:hover` styles applied via mouse-over during navigation (Playwright doesn't mouse-over by default, so this is mostly not an issue).

### Pitfall 9: IntersectionObserver shim's callback fires synchronously and breaks consumers
**What goes wrong:** Our shim's `observe()` could fire the callback synchronously (right inside `observe()`). Some libraries (older react-intersection-observer versions, possibly Framer Motion's hooks) expect the callback to fire AFTER `observe()` returns — they may not have finished setting up the corresponding state yet. Sync-firing can cause "callback ran before component mounted" errors.
**Why it happens:** Native IntersectionObserver explicitly batches callbacks to the next paint frame; library authors rely on this batching.
**How to avoid:** Fire the callback on the next microtask via `Promise.resolve().then(...)`. This is "soon enough" for prepare's purposes (microtask runs before the next paint, so before any "wait for whileInView" code sees stale state) but late enough to match the post-observe-return semantics consumers expect. Pattern 1 implements this.
**Warning signs:** Console errors during prepare like "Cannot update state during render" or "Cannot call X on unmounted component" — usually only in dev builds of Framer sites; production builds eat the error.

### Pitfall 10: `addInitScript` registered on `page` after `context.newPage()` doesn't apply retroactively
**What goes wrong:** If a Page has already been created (e.g. `await navigateToPage(...)` already returned), registering `page.addInitScript` on that page applies to future navigations of THAT page (e.g. an `a href` click that triggers a same-page navigation), not to the current document. The current document already initialized.
**Why it happens:** `addInitScript` registers handlers for new-document events. The current document isn't a "new" document — it's the one that triggered this state.
**How to avoid:** Always register on the `context` (BEFORE `context.newPage()`), or on a `page` (BEFORE the page's first `goto`). The order in Phase 4 is:
1. `launchBrowser` returns context (no page yet).
2. Phase 4's `installAnimationGuards(context, ...)` registers on the context.
3. `navigateToPage` calls `context.newPage()` → new document → init scripts run.
4. Phase 4's post-nav `runPreparePipeline(page, ...)` runs — these don't use addInitScript.
**Warning signs:** Phase 4 development tries to "fix" the timing by moving installAnimationGuards into runPreparePipeline (post-nav) — then PREP-02 silently fails.

### Pitfall 11: Bundle uses `globalThis.IntersectionObserver`, not `window.IntersectionObserver`
**What goes wrong:** A bundle that reads `globalThis.IntersectionObserver` for cross-environment compatibility doesn't pick up our `window.IntersectionObserver` shim.
**Why it happens:** Some bundlers (Vite, esbuild) and frameworks prefer `globalThis` for portability. In the browser, `globalThis === window`, so assigning to `window.IntersectionObserver` DOES update `globalThis.IntersectionObserver`. But to be safe and future-proof, the shim should assign to both.
**How to avoid:** Update Pattern 1's shim to also do `globalThis.IntersectionObserver = ...`. In the browser, this is redundant (same object), but defensive against bundlers that compile to `globalThis.IntersectionObserver`.
**Warning signs:** PREP-02 works on most Framer sites but fails on one specific page — usually one that uses a third-party embed (not Framer Motion) for a particular element.

### Pitfall 12: Exposing PREP-01 and PREP-02 as two config toggles
**What goes wrong:** A user writes `prepare: { disableAnimations: true, framerMotionFix: false }` (or similar two-toggle hypothetical config). They get inconsistent results: animations frozen but elements stuck at `initial: { opacity: 0 }`. Or vice versa: IO fires but animations also play normally, so partial movement visible.
**Why it happens:** The implementations are coupled. Shimming IO without freezing CSS = Framer Motion fires whileInView, then plays its animation normally → partial during screenshot. Freezing CSS without IO shim = appear effects never fire → elements never reveal.
**How to avoid:** Single config toggle (`animations: boolean`) controls both. Phase 2's schema already does this correctly — Phase 4 must consume the existing shape, not invent new keys.
**Warning signs:** Code review request adds `disableFramerMotion` or `intersectionObserverShim` config keys. Refuse.

## Code Examples

Verified patterns drawn from Playwright types.d.ts inspection and Framer Motion / motion.dev public documentation. Sources cited inline.

### Example 1: end-to-end Phase 4 happy path (the prepared smoke flow)

```javascript
// What a single `framershot capture samples/sample.yaml --smoke` invocation does
// AFTER Phase 4 ships. Compare to Phase 3's flow — only the four ★ markers are new.

import { chromium } from 'playwright-chromium';
import { installAnimationGuards, runPreparePipeline } from './src/prepare/index.js';

const config = await loadConfig('samples/sample.yaml');
const resolvedOutput = resolveTemplate(/* ... */);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  baseURL: 'https://pubq.se',
});

try {
  // ★ Phase 4 — pre-nav guards (IO shim + animation-killing CSS)
  await installAnimationGuards(context, config.prepare);

  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'networkidle', timeout: 15000 })
    .catch(e => { if (e.name !== 'TimeoutError') throw e; });
  await page.waitForFunction(() => document.fonts.ready, null, { timeout: 15000 });

  // ★ Phase 4 — post-nav prepare pipeline
  const { hideSummary } = await runPreparePipeline(page, config.prepare);
  // hideSummary.matched = N, hideSummary.missed = ['unmatched-selector', ...]

  // ★ Phase 4 — animations:'disabled' on screenshot for WAAPI fast-forward
  await page.screenshot({
    path: resolvedOutput,
    fullPage: false,           // Phase 5 owns full-page (scroll-stitch)
    animations: 'disabled',    // Playwright 1.60 — fast-forwards WAAPI
  });
} finally {
  await context.close();
  await browser.close();
}
```

### Example 2: console.time hook for SC #4 (extraDelay observability)

ROADMAP SC #4 says: "The `extraDelay` value in config causes an observable pause before capture begins — verifiable by adding a console.time around the prepare step."

The simplest implementation: the CLI integration wraps the `runPreparePipeline` call in a console.time block in `--smoke` mode only. (Prepare library code stays silent.)

```javascript
// In src/cli.js — only inside the opts.smoke branch
if (opts.smoke) {
  console.time('prepare');
  const { hideSummary } = await runPreparePipeline(navigatedPage, config.prepare);
  console.timeEnd('prepare');  // → "prepare: 1234.567ms"
  // ... screenshot
}
```

When `config.prepare.extraDelay = 1000`, the printed elapsed time should be >= 1000ms. When `extraDelay = 0` and `scrollPrime = false` and `hide = []`, elapsed should be sub-100ms. This is the SC #4 evidence.

### Example 3: PREP-01 verification via computed style inspection (SC #5)

ROADMAP SC #5 says: "CSS `animation` and `transition` properties are set to `none` globally via injected style, observable by inspecting computed styles in a headed debug run."

After prepare, this `page.evaluate` returns the verifiable values:

```javascript
const styleSnapshot = await page.evaluate(() => {
  const sample = document.querySelector('div') ?? document.body;
  const cs = getComputedStyle(sample);
  return {
    animation: cs.animationName + ' ' + cs.animationDuration,
    transition: cs.transitionProperty + ' ' + cs.transitionDuration,
  };
});
// Expected after prepare: { animation: 'none 0s', transition: 'all 0s' }
//                          ^^^^^^^^^^             ^^^^^^^^
// Both durations are 0s (from our injected rule).
```

This is testable in Phase 4's hermetic verification (see §Validation Architecture below).

### Example 4: PREP-04 verification via lazy-load image src inspection

The hermetic fixture (extension of `samples/serve-smoke.js`) can include a `<img loading="lazy" src="data:..." data-original="lazy.png">` element initially below the fold. After scroll prime, querying its `naturalWidth` should be > 0 (image decoded).

```javascript
const lazyLoaded = await page.evaluate(() => {
  const img = document.querySelector('img[data-original]');
  return { complete: img.complete, naturalWidth: img.naturalWidth };
});
// Expected after prepare: { complete: true, naturalWidth: 100 } (or similar non-zero)
```

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|-------------------------|--------------|--------|
| `page.addStyleTag({ content: 'animation: none' })` after load | `page.addInitScript(injectCSS)` before nav + `screenshot({ animations: 'disabled' })` at capture | addInitScript stable since Playwright 1.x; `animations: 'disabled'` since 1.20 | Catches animations that start during page-load, not just those running by `load` event. |
| Polyfilling `IntersectionObserver` for older browsers | Shimming `IntersectionObserver` for headless visual testing | Polyfills (e.g. `intersection-observer` npm) target broken browsers; shims target controlled environments | Different intent — polyfills correct, shims fast-forward. |
| `MotionConfig` context wrapper around the entire app for test-mode disabling | Source-level `MotionGlobalConfig.skipAnimations = isTesting()` flag (10.17.0+) | Framer Motion 10.17, Jan 2024 | Cleaner DX FOR THE SITE'S OWN TEST SUITE — but inaccessible from outside the site's bundle. Doesn't change our calculus. |
| Iframe-based screenshot tools intercepting the parent's IO via prototype patching | Direct IO replacement via addInitScript | always — but Playwright's addInitScript made it ergonomic | Standard pattern for any visual regression tool. |
| `page.screenshot({ fullPage: true })` for tall pages | Manual scroll-and-stitch | framershot's design decision (PROJECT.md) | Avoids ghosted sticky elements + DSR=3 OOM. |

**Deprecated/outdated:**
- `page.waitForLoadState('networkidle')` AFTER navigation — Phase 3 already handles this. Don't add it inside prepare.
- `page.waitFor(ms)` (the old form) — use `page.waitForTimeout(ms)` instead. The old form was removed in early Playwright; current is `waitForTimeout`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Framer's published Framer Motion uses `IntersectionObserver` for `whileInView` / `inView()`, and the bundled instance reads from the global at module-init time (so addInitScript shim takes effect) | §Pitfall 3, Pattern 1 | If Framer's bundle has a custom polyfill embedded that doesn't reference the global, our shim is invisible. Mitigation: the IO shim is verifiable hermetically — if `inView` callbacks don't fire on our fixture, the shim isn't taking effect, and we can diagnose. [VERIFIED indirectly via motion.dev/docs/inview which states inView is "built on the browser's native Intersection Observer API" — but the bundle could theoretically still patch around it. Treat as MEDIUM confidence and verify hermetically.] [CITED: motion.dev/docs/inview] |
| A2 | Framer Motion 10.17's `MotionGlobalConfig.skipAnimations` is package-internal, NOT exposed on `window` or `globalThis` | §Pitfall 2 | If this is wrong and the flag IS reachable via `window.MotionGlobalConfig`, we'd have a simpler one-liner. The IO shim still works either way; we'd be over-engineering. Mitigation: hermetic verification of `window.MotionGlobalConfig` typeof after Framer's bundle loads will tell us instantly. [ASSUMED — verified by reading motion's CHANGELOG.md which announces the flag without window-exposure language, and Matt Perry's X announcement frames it for test-suite use within the app's own code. Treat as HIGH confidence-of-absence.] |
| A3 | Playwright's `addInitScript` runs BEFORE Framer's bundle | §Pattern 1, §Pitfall 3 | If Playwright's init-script timing has any race with the document's script tags, we have a real problem. Mitigation: the Playwright types.d.ts explicitly states init scripts run "before any of the scripts in the page" — strong language, well-tested API. [VERIFIED: types.d.ts:286-318 — though the exact phrasing "before any of the scripts in the page" appears in the docs, types.d.ts paraphrases. HIGH confidence.] |
| A4 | `visibility: hidden` is enough to remove an element from the rendered output without changing layout — for Framer sites specifically | §Pitfall 5 | If Framer uses elements with `position: sticky` AND has CSS that depends on the visible-state of those elements (e.g. a `+ * { padding-top: 80px }` adjacent selector), hiding might change layout. Practically, no — sticky/fixed elements are out-of-flow, hiding them doesn't shift in-flow siblings. [ASSUMED — based on standard CSS behavior. HIGH confidence for the common case.] |
| A5 | A 200ms inter-step wait in PREP-04 is sufficient for browser-native lazy-load IOs to fire and start image fetches | §Pattern 4 | If a Framer site uses an aggressive lazy-loading library (e.g. lazysizes with `data-srcset` swapping) instead of native `loading="lazy"`, 200ms might not be enough. Mitigation: the hermetic fixture can include both kinds; if real-world Framer uses non-native lazy, extraDelay can be increased per config. [ASSUMED — based on Chromium native lazy-load behavior, which fires the load on next macrotask after IO intersect.] |
| A6 | Phase 5's scroll-stitch loop will RE-scroll the page from y=0 to bottom, so PREP-04's final `scrollTo(0, 0)` is the right resting state | §Pattern 4 | If Phase 5 expects to start from an arbitrary position, the reset is wasted work. Mitigation: Phase 5 owns its own scroll loop; PREP-04 just hands off "y=0, lazy images primed." Standard contract. [ASSUMED — but matches the ROADMAP description of Phase 5's "scroll in viewport-height steps." HIGH confidence.] |
| A7 | The single `animations: boolean` Phase 2 schema toggle is the right product surface — exposing PREP-01 and PREP-02 separately would create undefined intermediate states | §Pitfall 12, §User Constraints | If a user genuinely wants ONLY CSS animations frozen but Framer Motion playing normally (?why?), they can't. We accept this constraint as the right product simplification for a personal tool. [ASSUMED — but the Phase 2 schema is already locked, so this matches reality regardless of risk.] |
| A8 | Framer Motion does NOT cache a private reference to `IntersectionObserver` at module-load time in a way that bypasses our shim | §Pitfall 3, §A1 | If the bundle's published format is `const IO = IntersectionObserver;` at module-init AND our addInitScript runs after that const assignment, our shim is invisible. Mitigation: the addInitScript fires at document_start (before any author script). Confidence depends on Playwright's adherence to that semantic. [ASSUMED — Playwright's documentation is unambiguous that addInitScript runs "as part of the document init" before page scripts. HIGH confidence; verify hermetically by checking `IntersectionObserver.name === 'IntersectionObserver'` (our class has the constructor name 'IntersectionObserver' too — for stronger verification, set `IntersectionObserver.__framershot = true` on the shim and check from page-context).] |

## Open Questions

1. **Should `extraDelay` accept fractional milliseconds, or is the schema's `z.number().int()` constraint correct?**
   - What we know: Phase 2 schema enforces integer ≥ 0.
   - What's unclear: 0.5ms isn't useful in practice but 1000.5 isn't dangerous either.
   - Recommendation: Keep integer. Lock-in is fine.

2. **Should the IO shim fire the callback synchronously, on the next microtask, or on the next animation frame?**
   - What we know: Native IO fires on the next frame. Pattern 1 chooses next microtask (Promise.resolve()).
   - What's unclear: Whether any Framer-specific code path expects frame-batching specifically.
   - Recommendation: Microtask is right. If issues arise with frame-batching-dependent code, switch to `requestAnimationFrame`.

3. **Should the post-nav hide step be replaced with addInitScript-based hiding (run during page-init via CSS)?**
   - What we know: Doing it via init-script CSS (`{selector} { visibility: hidden !important }`) would hide elements from the moment they exist in the DOM. The current evaluate-based approach hides them after they've potentially flickered during load.
   - What's unclear: Whether the flicker matters. In headless mode there's no human watching the load; only the screenshot matters, and that's taken after prepare completes.
   - Recommendation: Stick with post-nav evaluate. Init-script CSS injection adds complexity (dynamic CSS construction from the selectors array) for no observable benefit at screenshot time.

4. **Should we add `prepare.scrollPrime.steps` / `prepare.scrollPrime.waitMs` as v0.2 config knobs?**
   - What we know: 200ms wait + viewport-height steps is the v0.1 fixed choice.
   - What's unclear: Whether some Framer sites need 500ms+ for slow lazy-load libraries.
   - Recommendation: Premature knob in v0.1. If real sites surface a need, add in v0.2.

5. **Should `hideSelectors` warn about invalid CSS selector syntax (vs. just "didn't match")?**
   - What we know: The Pattern 2 implementation lumps invalid selectors into `missed` along with zero-match selectors.
   - What's unclear: Whether the user wants to distinguish "syntax error" from "valid but matched nothing."
   - Recommendation: Phase 4 just lumps them; Phase 6 (CLI-03) can split the warning shape if useful.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All Phase 4 code | ✓ | (per package.json `engines.node >= 20`; verified in Phase 1) | — |
| `playwright-chromium` | `addInitScript`, `evaluate`, `waitForTimeout`, screenshot animations option | ✓ | 1.60.0 (Phase 1 install confirmed; APIs verified directly in types.d.ts) | — |
| Chromium browser binary | Browser-context init scripts | ✓ | chromium-1223 (Phase 1 verified) | — |
| `samples/serve-smoke.js` hermetic server | PREP-02 hermetic verify (Framer-Motion-like content) | ✓ (will be extended in Wave 0) | n/a | — |
| `samples/sample.yaml` against pubq.se | Live-site manual gate | ✓ | n/a (network-dependent runtime gate) | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

Phase 4 introduces no new external dependencies. The only environment change is `samples/serve-smoke.js` needs to grow some Framer-Motion-like fixture content (an `<img loading="lazy">` below the fold + a `data-framermotion-test` element with initial opacity 0 that an IO-driven script flips to opacity 1) — see §Validation Architecture.

## Validation Architecture

> `workflow.nyquist_validation` is not explicitly set in `.planning/config.json` — treated as enabled.

### Test Framework

Phase 4 doesn't introduce a test framework. Following Phase 3's pattern (verified by Phase 3's `<self_check>`: "node:test was the recommendation but no test file landed — the hermetic `--smoke` check via `node index.js capture ...` is the de facto integration test"), Phase 4 piggybacks on `--smoke` verification:

| Property | Value |
|----------|-------|
| Framework | Hermetic E2E via `node index.js capture samples/smoke.yaml --smoke` (no test framework) |
| Config file | none |
| Quick run command | `node samples/serve-smoke.js & node index.js capture samples/smoke.yaml --smoke; kill %1` |
| Full suite command | same + the live `samples/sample.yaml` against pubq.se (manual gate) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command (hermetic — extend serve-smoke.js with new content) | File Exists? |
|--------|----------|-----------|----------------------------------------------------------------------|-------------|
| PREP-01 | After prepare, getComputedStyle on a random element reports `animationName: 'none'` and `transitionDuration: '0s'` | post-prep evaluate | extend smoke to read `page.evaluate(() => getComputedStyle(document.body).animationDuration)` after prepare; expect `'0s'` | ❌ Wave 0 |
| PREP-02 | A fixture element with initial `opacity: 0` that an IO observer flips to `opacity: 1` has `opacity === 1` after prepare (proves IO shim fired the callback) | post-prep evaluate | add `<div data-test="io">` to serve-smoke.js with inline JS that uses `new IntersectionObserver(cb)` to flip opacity; verify post-prep `getComputedStyle(el).opacity === '1'` | ❌ Wave 0 |
| PREP-03 | Element matching `.hidden-by-test` selector has `getComputedStyle.visibility === 'hidden'` after prepare | post-prep evaluate | add `<div class="hidden-by-test">` to serve-smoke.js; add `.hidden-by-test` to smoke.yaml `hide:` array; verify | ❌ Wave 0 |
| PREP-04 | A lazy-loaded image below the initial fold reports `complete: true, naturalWidth > 0` after prepare | post-prep evaluate | add `<img loading="lazy">` 2000px down in serve-smoke.js (or a tall stuffer div) with a small inline data: image; verify post-prep | ❌ Wave 0 |
| PREP-05 | console.time-bracketed prepare reports elapsed >= extraDelay value | timing measurement | set `prepare.extraDelay: 1000` in smoke.yaml; verify console.timeEnd("prepare") reports >= 1000ms | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node samples/serve-smoke.js & node index.js capture samples/smoke.yaml --smoke; kill %1` — proves CAP-01..04 still pass AND new PREP-* assertions
- **Per wave merge:** same hermetic test + manual visual inspection of `/tmp/framershot-smoke/home.png`
- **Phase gate:** Hermetic test green + live-site smoke against pubq.se shows no half-played Framer Motion appear effects in the captured PNG (visual gate, documented in 04-SUMMARY.md)

### Wave 0 Gaps
- [ ] `samples/serve-smoke.js` — EXTEND to include three new fixture elements:
  1. `<div data-test="anim-target">` with a CSS animation that would visibly play if not killed
  2. `<div data-test="io-target" style="opacity: 0">` with inline JS using `new IntersectionObserver` to flip opacity to 1 when intersecting — proves PREP-02 shim
  3. `<img loading="lazy" data-test="lazy-img">` positioned 2000px down — proves PREP-04
- [ ] `samples/smoke.yaml` — EXTEND `hide:` array to include a selector that matches a fixture element (e.g. `.hidden-by-test`); add a corresponding `<div class="hidden-by-test">` to serve-smoke.js
- [ ] Optional Phase 4 inline assertions — a `--smoke` post-prep evaluate block in `src/cli.js` that prints `prep-assert: PREP-01=PASS, PREP-02=PASS, PREP-03=PASS, PREP-04=PASS` lines for easy grep verification. Confined to the smoke branch — production runs don't pay this cost.

*(If Wave 0 is skipped: PREP-01/03/05 are still smoke-verifiable visually from the PNG. PREP-02 + PREP-04 require fixture additions for hermetic verification — without them, only live-pubq.se inspection proves them.)*

## Security Domain

> `security_enforcement` not explicitly disabled — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 4 has no auth; same as Phase 3 |
| V3 Session Management | no | Ephemeral context per run |
| V4 Access Control | no | Personal CLI, no multi-user model |
| V5 Input Validation | yes (inherited) | `config.prepare.hide` selectors are validated runtime in `hideSelectors` (try/catch on querySelectorAll); the array structure is zod-validated by Phase 2 |
| V6 Cryptography | no | No secrets, no crypto |
| V8 Data Protection | yes (minor) | Screenshots may contain rendered private data after prepare — same as Phase 3 |
| V10 Malicious Code | yes (minor) | Headless Chromium still executes arbitrary JS from `baseUrl`; the IO shim affects but doesn't increase this surface. The shim ITSELF runs in the page context, not in our Node process, so it can't escape the browser sandbox. |
| V11 Business Logic | no | n/a |
| V12 Files & Resources | no | Phase 4 writes no files (Phase 5's territory) |

### Known Threat Patterns for Headless Chromium Prep Pipeline

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Init-script tampering with sensitive page APIs (we replace `window.IntersectionObserver`) | Tampering (self-inflicted) | Acceptable — the page is under our control during prepare (user explicitly invokes framershot to capture it). The original IO is preserved on `window.__originalIO` for any debug session. Other page APIs (fetch, localStorage, indexedDB) are untouched. |
| Cross-page state leak via init scripts (script registered on context fires on all pages of the same context) | Information Disclosure | Acceptable — v0.1 is single-page-per-context. v0.2 multi-page work can use page-level addInitScript (page.addInitScript instead of context.addInitScript) if cross-page isolation matters. |
| `hide` selector injection — user crafts a malicious selector that triggers a costly querySelectorAll | DoS (self-inflicted) | The querySelectorAll runs in the page context with the page's resource budget. Slow selectors slow prepare but can't escape the browser. PROJECT.md trust boundary holds — user owns the YAML. |
| Bundle that detects our IO shim and refuses to render | Tampering / availability | Possible in adversarial scenarios. Mitigations: the shim's class name is `IntersectionObserver` matching the original; `toString()` won't be `[native code]` but few sites check that. Framer doesn't. Acceptable. |
| `extraDelay` set to MAX_SAFE_INTEGER → infinite hang | DoS (self-inflicted) | Phase 2 schema does NOT clamp the upper bound — `z.number().int().min(0)`. User can write `extraDelay: 999999999`. Personal-tool trust boundary holds. Phase 6 may add a sanity warning. [ACCEPTED] |
| `hide` selector via `<script>` injection (e.g. selector text containing `</script>`) | XSS adjacent | We pass selectors as `arg` to `page.evaluate`, NOT as inline template-literal string. Playwright serializes the arg as JSON and passes through the runtime evaluate API — no string interpolation, no template injection surface. Verified by Pattern 2 implementation. [MITIGATED] |

### Notes
- The IO shim is the most invasive change Phase 4 makes. It rewrites a core browser API in the page context. The trust boundary holds: Playwright's documented `addInitScript` mechanism is the right tier of intervention, and the original IO is preserved for debug.
- No new file writes from Phase 4 (Phase 5's territory).
- No new network calls from Phase 4 — `page.evaluate` and `addInitScript` are CDP-runtime-evaluate, not network operations.

## Project Constraints (from PROJECT.md / no CLAUDE.md present)

No `./CLAUDE.md` file exists in the project root (confirmed by `find . -maxdepth 3 -name CLAUDE.md` returning nothing). Constraints from `.planning/PROJECT.md` and locked decisions:

| Constraint | Source | How Phase 4 honors it |
|-----------|--------|------------------------|
| Tech stack locked — no new deps | PROJECT.md Constraints | Phase 4 imports only `playwright-chromium` (already installed). Zero additions to package.json. |
| Chromium only | PROJECT.md Constraints | Inherits — Phase 4 doesn't touch the launcher's `chromium`-named import. |
| Headless default | PROJECT.md Constraints, ROADMAP Phase 3 SC #1 | Inherits — Phase 4 doesn't change launch options. SC #5 says "headed debug run" but that's for verification only, not production. Don't add a `--headed` flag in Phase 4 (Phase 6's potential scope per Phase 3's research). |
| Personal tool, no polish | PROJECT.md Out of Scope | No chalk in prepare modules; no verbose progress; no per-step instrumentation in library code (the SC #4 `console.time` hook lives in the CLI's `--smoke` branch). |
| Local only | PROJECT.md Constraints | No remote endpoints, no telemetry. addInitScript and evaluate are local CDP calls. |
| Single page/viewport in v0.1 | REQUIREMENTS.md v1 | One pre-nav guard install per run; one post-nav prepare per run. v0.2 multi-page would re-architect to per-page lifecycle. |

## What NOT To Do (re-stated for the planner)

1. **NO new dependencies.** Use only what Phase 1 installed. The shim, CSS, and orchestration all fit in inline page-context code via Playwright primitives.
2. **NO new CLI flags.** `--smoke` (Phase 3) drives Phase 4's verification too. Do not add `--prepare-debug`, `--no-prepare`, `--headed`, or anything else.
3. **NO new config schema keys.** Phase 2's `prepare: { animations, hide, scrollPrime, extraDelay }` is what we consume. Don't propose `prepare.disableFramerMotion`, `prepare.framerSpecific`, `prepare.timeoutMs`, etc.
4. **NO `display: none`.** Always `visibility: hidden !important`. Layout must remain stable.
5. **NO `behavior: 'smooth'`** in scroll prime. Use `'instant'` (default — set explicitly).
6. **NO `addInitScript` after `goto`.** Pre-nav guards register on the CONTEXT before navigateToPage. Post-nav steps use `evaluate`/`waitForTimeout`, not addInitScript.
7. **NO logging in prepare modules.** Phase 6 owns terminal UX. Library code returns data.
8. **NO try/catch around `addInitScript` or `evaluate` in prepare modules.** Let failures bubble to the CLI's top-level catch.
9. **NO `MotionGlobalConfig` references.** It's not exposed globally. Don't pretend otherwise. The IO shim is the correct approach.
10. **NO `page.locator(sel).all()` or similar locator gymnastics for PREP-03.** A single `page.evaluate` with the selector list is the right primitive.
11. **NO IntersectionObserver POLYFILL** (npm `intersection-observer`). We want a SHIM that LIES, not a polyfill that's correct.
12. **NO process.exit, no chalk/ora, no `console.log` in `src/prepare/*`** — same library-shape posture as `src/browser/*`.
13. **NO `await page.screenshot({ fullPage: true })` in `src/prepare/*` debug aids.** PROJECT.md decision: fullPage is forbidden. The phase-level `! grep -rq 'fullPage: true' src/` gate from Phase 3 still applies.

## Phase 4 Boundary

What Phase 4 produces:
- `src/prepare/animations.js` exporting `installAnimationGuards(context, prepareConfig)` — installs IO shim + CSS via context.addInitScript (PREP-01 + PREP-02).
- `src/prepare/hide.js` exporting `hideSelectors(page, selectors) → { matched, missed }` — visibility:hidden via evaluate (PREP-03).
- `src/prepare/scroll.js` exporting `scrollPrime(page)` and `extraDelay(page, ms)` (PREP-04 + PREP-05).
- `src/prepare/index.js` re-exporting `installAnimationGuards` and `runPreparePipeline(page, prepareConfig) → { hideSummary }` — the orchestrator the CLI consumes.
- `src/cli.js` modifications: import from `./prepare/index.js`; call `installAnimationGuards(context, ...)` BEFORE `navigateToPage`; call `runPreparePipeline(page, ...)` AFTER `navigateToPage`; pass `animations: 'disabled'` on the smoke screenshot.
- `samples/serve-smoke.js` extension: include fixture elements proving PREP-01 (animated element), PREP-02 (IO-driven opacity), PREP-03 (hidden-by-selector element), PREP-04 (lazy image below fold).
- `samples/smoke.yaml` extension: `hide:` array including the fixture's hidden selector.

What Phase 4 does **not** do:
- Capture multiple frames or stitch (Phase 5).
- Write to the templated output path beyond the smoke screenshot (Phase 5).
- Show a spinner or formatted error messages (Phase 6).
- Print warnings for unmatched `hide:` selectors (Phase 6 — Phase 4 returns the data).
- Authentication / consent banner handling (v0.3).
- Region capture or anchor selectors (v0.2).

Phase 5 will receive the prepared `Page` and run the scroll-capture-stitch loop. The lifecycle (launch + close) stays owned by `src/cli.js` throughout — Phase 4 just inserts two new orchestration calls into the existing try block.

## Sources

### Primary (HIGH confidence)
- `node_modules/playwright-core/types/types.d.ts` (Playwright 1.60.0 type definitions) — direct source for `addInitScript`, `addStyleTag`, `page.screenshot({ animations })`, `page.evaluate`, `page.waitForTimeout` [VERIFIED — read directly, lines cited inline]
- `npm view playwright-chromium version` → 1.60.0 (stable); `npm view playwright-chromium time` confirms 1.60.0 is the current stable release [VERIFIED]
- Project source files (`src/browser/launcher.js`, `src/browser/navigator.js`, `src/cli.js`, `src/config/schema.js`, `samples/smoke.yaml`, `samples/serve-smoke.js`) — read directly to confirm interfaces and integration points [VERIFIED]
- Phase 3 RESEARCH.md + Phase 3 SUMMARYs + Phase 3 VERIFICATION.md — read directly to anchor architectural decisions (close-order, library-shape modules, lifecycle ownership at CLI) [VERIFIED]

### Secondary (MEDIUM confidence — verified against primary)
- https://motion.dev/docs/inview — Framer Motion's `inView` API uses native IntersectionObserver [CITED]
- https://motion.dev/guides/waapi-improvements — Framer Motion's hybrid engine uses WAAPI for hardware acceleration [CITED]
- https://github.com/motiondivision/motion/blob/main/CHANGELOG.md — `MotionGlobalConfig.skipAnimations` introduced in 10.17.0 (Jan 2024), with no mention of window-exposure [CITED]
- https://github.com/microsoft/playwright/issues/31403 — Playwright's `animations: 'disabled'` does not cover SVG SMIL [CITED]
- https://github.com/microsoft/playwright/issues/11912 — Playwright's `animations: 'disabled'` feature landed (1.20) [CITED]

### Tertiary (LOW confidence — informational, not relied upon)
- General Playwright tutorials on lazy-image handling — used for cross-checking 200ms inter-step wait choice; none cited as authoritative.
- Matt Perry's X announcement of MotionGlobalConfig.skipAnimations (returned 402 on direct fetch but the content was visible in search results) — corroborates the CHANGELOG entry.

## Metadata

**Confidence breakdown:**
- Playwright API shapes (`addInitScript`, `addStyleTag`, `screenshot({ animations })`, `evaluate`, `waitForTimeout`): HIGH — direct types.d.ts inspection.
- CSS injection pattern via addInitScript: HIGH — well-documented pattern; canonical for visual regression tooling.
- IntersectionObserver shim correctness for Framer Motion: MEDIUM-HIGH — Framer Motion's docs explicitly say it uses native IntersectionObserver, but we haven't decompiled the production bundle to confirm there's no defensive caching of the original IO. Hermetic verification via fixture is the right gate.
- `MotionGlobalConfig.skipAnimations` is NOT on `window`: HIGH — verified by reading the CHANGELOG announcement, which frames the feature as "for testing within your own app's test setup." If it were on `window`, the announcement would say so.
- `visibility: hidden` vs `display: none` distinction: HIGH — standard CSS spec behavior.
- `behavior: 'instant'` vs `'smooth'`: HIGH — Chromium's documented default is auto-resolving to instant when scroll behavior isn't smoothly available, and explicit 'instant' is reliable.
- 200ms inter-step wait sufficiency: MEDIUM — based on typical Chromium lazy-load IO firing on the next macrotask. Real-world Framer sites should be hermetic-verified.
- SVG SMIL gap: HIGH (gap exists), but irrelevant for Framer sites which don't use SMIL.
- Pitfall coverage: HIGH for each pitfall — each is sourced from direct primary inspection or GitHub issue analysis.

**Research date:** 2026-05-22
**Valid until:** 2026-06-22 (30 days — Playwright is stable; Framer Motion's published API surface is stable; the only thing that could shift is the bundled site's IntersectionObserver usage if Framer ever moves to a custom polyfill, which is not signaled in any roadmap.)

## Locked-Stack Compliance Confirmation

Nothing in this research contradicts the locked stack or PROJECT.md constraints. Zero new dependencies are introduced. All architectural choices stay within the boundaries set by PROJECT.md (Chromium-only honored, local-only honored, headless-default honored, personal-tool ethos honored, single page/viewport scope honored). The only Phase 2 schema dependency surfaced is the `prepare.animations` single-toggle shape, which Phase 4 consumes verbatim — no schema changes proposed. The only Phase 3 contract dependency is that the CLI's try block is the lifecycle owner — Phase 4 inserts calls inside this try block, preserving Phase 3's pattern.

## RESEARCH COMPLETE

**Recommended approach:** Build `src/prepare/` as four files — `animations.js`, `hide.js`, `scroll.js`, `index.js` — with a strict pre/post-navigation split. The CLI calls `installAnimationGuards(context, prepareConfig)` BEFORE `navigateToPage` (registering an `IntersectionObserver` shim plus an animation-killing CSS stylesheet via `context.addInitScript`, because the shim MUST install before Framer's bundle captures the original IO into its closure); then after `navigateToPage` returns, the CLI calls `runPreparePipeline(page, prepareConfig)` which hides selectors via `visibility: hidden` (NOT `display: none` — Phase 5's stitch math needs stable layout), scroll-primes in viewport-height steps with a 200 ms inter-step wait so browser-native `loading="lazy"` IOs fire and start image fetches, then honors `extraDelay` via `page.waitForTimeout`. The Framer Motion fix is the IO shim — `MotionGlobalConfig.skipAnimations` is the real flag but it's NOT exposed on `window`/`globalThis`, so we replace `IntersectionObserver` to make every `whileInView` trigger fire on the next microtask with `isIntersecting: true`, which is library-agnostic (works for any IntersectionObserver-driven library, not just Framer Motion). Verification extends Phase 3's `--smoke` flag: `samples/serve-smoke.js` grows fixture elements proving PREP-01 (computed-style assertion), PREP-02 (an IO-driven opacity flip we can read back), PREP-03 (a selector in `hide:` whose target ends up `visibility: hidden`), PREP-04 (a `<img loading="lazy">` below the initial fold whose `naturalWidth > 0` after prepare), and a `console.time`/`console.timeEnd` wrap in the smoke branch proves PREP-05's `extraDelay`. Zero new packages, zero new CLI surface, zero new config keys; final SC #5 is satisfied because the injected CSS is observable via `getComputedStyle` in a headed debug run.
