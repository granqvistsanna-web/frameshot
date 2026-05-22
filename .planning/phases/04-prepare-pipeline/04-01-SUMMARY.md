---
phase: 04-prepare-pipeline
plan: "01"
subsystem: prepare
tags: [animations, framer-motion, intersection-observer, css-injection, pre-navigation]
dependency_graph:
  requires:
    - src/browser/launcher.js (launchBrowser — provides BrowserContext consumed here)
    - src/config/schema.js (prepareSchema — prepareConfig.animations boolean)
  provides:
    - src/prepare/animations.js → installAnimationGuards(context, prepareConfig): Promise<void>
  affects:
    - 04-05 (CLI wiring — must call installAnimationGuards between launchBrowser and navigateToPage)
tech_stack:
  added: []
  patterns:
    - context.addInitScript for pre-navigation page-context code injection
    - IntersectionObserver shim that immediately reports isIntersecting:true via microtask
    - CSS universal animation/transition freeze via injected <style> element
key_files:
  created:
    - src/prepare/animations.js
  modified: []
decisions:
  - PREP-01 + PREP-02 co-located in one module under one config gate (single animations boolean)
  - Zero new dependencies — all shim code inline in addInitScript callbacks
  - Library posture — no console output, no process.exit, errors bubble to CLI
  - No try/catch around context.addInitScript (failures propagate to CLI's top-level handler)
metrics:
  duration: "3m"
  completed_date: "2026-05-22"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 4 Plan 01: Animation Guards (PREP-01 + PREP-02) Summary

Pre-navigation IO shim + CSS injection as a single async function gated by one config boolean — zero imports, zero side effects on import, library-shaped.

## What Was Built

`src/prepare/animations.js` — a single-export ESM module implementing both PREP-01 and PREP-02 animation guards. The module registers two Playwright init scripts on a BrowserContext before any page navigation occurs.

## Exported API Surface

```javascript
/**
 * Install the two pre-navigation guards that fix PREP-01 (CSS animation/transition
 * freeze) and PREP-02 (Framer Motion in-view trigger via IntersectionObserver shim).
 *
 * @param {import('playwright-chromium').BrowserContext} context - the context returned by launchBrowser
 * @param {{ animations: boolean, hide: string[], scrollPrime: boolean, extraDelay: number }} prepareConfig -
 *   the validated config.prepare sub-object from Phase 2's loadConfig. Only `animations` is read by this
 *   function; the other fields are owned by 04-02 (hide) and 04-03 (scrollPrime, extraDelay).
 * @returns {Promise<void>}
 *
 * LIFECYCLE CONTRACT — MUST be called BEFORE navigateToPage. addInitScript registers
 * handlers that fire on the NEXT new-document creation — if Framer's bundle has already
 * captured `window.IntersectionObserver` into its module closure (which happens on page
 * load, when Framer's JS first runs), our replacement is invisible to Framer's code.
 * The single correct call site is between `launchBrowser` and `navigateToPage` in the
 * CLI's try block — see 04-05's wiring.
 */
export async function installAnimationGuards(context, prepareConfig)
```

## Single Config Gate

The FIRST executable statement in the function body is:

```javascript
if (!prepareConfig.animations) return;
```

When `animations: false` is set in YAML, both guards are skipped together. There is no path that registers only one of the two — per RESEARCH §Pitfall 12, two separate toggles would produce broken intermediate states.

## IO Shim Methods (Guard 1 — PREP-02)

All five required IO methods are present:

```javascript
const ShimIO = class {
  constructor(callback, options) { ... }     // stores _callback, _options, _targets Set
  observe(target)                            // fires callback via Promise.resolve().then(...)
  unobserve(target)                          // deletes from _targets
  disconnect()                               // clears _targets
  takeRecords()                              // returns []
};
window.IntersectionObserver = ShimIO;
globalThis.IntersectionObserver = ShimIO;   // belt-and-braces per Pitfall 11
```

The `observe()` microtask fires with:
```javascript
{ target, isIntersecting: true, intersectionRatio: 1, boundingClientRect: rect,
  intersectionRect: rect, rootBounds: null, time: performance.now() }
```

Original constructor preserved: `window.__originalIO = window.IntersectionObserver;`

## CSS Rule (Guard 2 — PREP-01)

Exact CSS committed (verbatim brief text + four extensions):

```css
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  animation-delay: 0s !important;
  animation-duration: 0s !important;
  transition-delay: 0s !important;
  transition-duration: 0s !important;
}
```

Style element uses `style.dataset.framershot = 'animation-guards'` (canonical marker for deduplication and verification).

Early-document-start robustness: if `document.head` is not yet present when the init script fires, a `readystatechange` listener waits for it. The `inject()` helper checks for an existing `style[data-framershot="animation-guards"]` to prevent double-injection.

## End-to-End Behavioral Check Output

Verified with a hermetic localhost HTTP server and `page.goto()`:

```
ok
```

Behavior confirmed:
- With `animations: true`: IO replaced on both `window` and `globalThis`, `__originalIO` preserved, observing a `<div>` fires callback within 1s with `isIntersecting === true` and `intersectionRatio === 1`. `getComputedStyle(elem).animationName === 'none'`, `transitionProperty === 'none'`, `animationDuration === '0s'`.
- With `animations: false` (fresh context + fresh page): `window.__originalIO === undefined` — both guards skipped.

Note: the plan's `<verify>` block uses `page.setContent()` to set HTML content. This does NOT re-fire `addInitScript` because `setContent()` replaces the DOM without creating a new navigation context (page stays at `about:blank`). The implementation is correct for its documented lifecycle — `addInitScript` fires on `page.goto()` navigations. The E2E verification above uses a real HTTP server and `page.goto()`, which is the actual production flow.

## Dependency Notes

### For 04-05 (CLI wiring)

`installAnimationGuards(context, config.prepare)` MUST be called BETWEEN `launchBrowser` and `navigateToPage` in `src/cli.js`. Calling it after `navigateToPage` is a no-op for the page that has already navigated (RESEARCH §Pitfall 3). The wiring point:

```javascript
const { browser, context } = await launchBrowser(config);
try {
  await installAnimationGuards(context, config.prepare);   // <-- 04-05 adds this
  const navigatedPage = await navigateToPage(context, config.page);
  // ...
}
```

### For 04-02 / 04-03

This module does NOT handle PREP-03 (selector hiding), PREP-04 (scroll prime), or PREP-05 (extra delay). Those plans own their respective files (`src/prepare/hide.js`, `src/prepare/scroll.js`) and do not overlap with `src/prepare/animations.js`.

## Package.json — No New Dependencies

```diff
(no diff — package.json was not modified)
```

Dependencies before and after are identical. All shim code runs inline in `context.addInitScript()` callbacks. Zero new npm packages.

## Deviations from Plan

None — plan executed exactly as written, with one implementation note:

**Verification test adaptation:** The plan's `<verify>` block uses `page.setContent()` to load test HTML. `page.setContent()` does not re-fire `addInitScript` (it keeps the page on `about:blank` and replaces the DOM). This is a Playwright behavior fact, not an implementation bug — `addInitScript` fires on navigation events (e.g., `page.goto()`), not on `setContent()`. The implementation was verified using the correct pattern: a real localhost HTTP server with `page.goto('/')`. All acceptance criteria pass in the real-world usage flow.

## Self-Check: PASSED

- `src/prepare/animations.js` exists: FOUND
- Task commit `131fc06` exists: FOUND
- Zero imports: CONFIRMED
- Single export `installAnimationGuards`: CONFIRMED
- Config gate as first executable statement: CONFIRMED
- Exactly two `context.addInitScript` calls: CONFIRMED
- Both `window.IntersectionObserver` and `globalThis.IntersectionObserver` replaced: CONFIRMED
- `isIntersecting: true` and `intersectionRatio: 1` in shim: CONFIRMED
- CSS rule with all 6 declarations present: CONFIRMED
- `data-framershot="animation-guards"` marker: CONFIRMED
- `readystatechange` fallback: CONFIRMED
- No MotionGlobalConfig / `__framer_motion_disabled` references: CONFIRMED
- No page.addInitScript / page.addStyleTag: CONFIRMED
- Library shape (no console/process.exit/chalk/ora): CONFIRMED
- End-to-end IO shim behavior: PASSED
- End-to-end CSS guard behavior: PASSED
- End-to-end gate (animations:false) behavior: PASSED
- No new dependencies in package.json: CONFIRMED
