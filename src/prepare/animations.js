// src/prepare/animations.js
// Phase 4 wave 1: pre-navigation guards for PREP-01 (CSS animation/transition
// freeze) and PREP-02 (Framer Motion in-view trigger via IntersectionObserver
// shim). Exports: installAnimationGuards(context, prepareConfig).
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors from context.addInitScript bubble; the caller
// (src/cli.js, wired in 04-05) owns presentation, the try/finally lifecycle,
// and exit codes. Do NOT try/catch around addInitScript (RESEARCH §Anti-Patterns
// line 599; 04-PATTERNS §Risk 1).
//
// The two guards installed here MUST run BEFORE the first Page is created in
// the context — addInitScript registered after Framer's bundle has captured
// the original IntersectionObserver into its module closure is invisible to
// Framer. See RESEARCH.md §Pattern 1 + §Pitfall 3 + 04-PATTERNS §Risk 7.
//
// PREP-01 and PREP-02 are gated by a single config boolean
// (prepareConfig.animations — schema.js:25). They CANNOT be shipped
// independently: see RESEARCH §Pitfall 12 for why two toggles produce
// broken intermediate states. 04-PATTERNS §Risk 5 forbids adding new
// schema keys.

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
export async function installAnimationGuards(context, prepareConfig) {
  // Step 0 — Single config gate (RESEARCH.md §Pitfall 12, 04-PATTERNS §Risk 5).
  // When the user opts out via YAML `prepare: { animations: false }`, both guards
  // are skipped together. There is NO branch that registers only one of the two.
  if (!prepareConfig.animations) return;

  // Step 1 — Guard 1: IntersectionObserver shim via context.addInitScript (PREP-02).
  // Replaces window.IntersectionObserver AND globalThis.IntersectionObserver with a
  // shim class whose observe() schedules a microtask that fires the callback with
  // [{ target, isIntersecting: true, intersectionRatio: 1, ... }].
  // Preserves original on window.__originalIO for debug-friendly inspection.
  await context.addInitScript(() => {
    window.__originalIO = window.IntersectionObserver;
    const ShimIO = class {
      constructor(callback, options) {
        this._callback = callback;
        this._options = options;
        this._targets = new Set();
      }
      observe(target) {
        this._targets.add(target);
        // Fire on next microtask so the consumer's observe() call returns
        // before the callback executes — matches native semantics. Native
        // IO never fires sync from observe(); it batches to the next frame.
        // Microtask is "soon enough" for Framer Motion's purposes.
        Promise.resolve().then(() => {
          const rect = target.getBoundingClientRect?.() ?? {};
          const entry = {
            target,
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: rect,
            intersectionRect: rect,
            rootBounds: null,
            time: performance.now(),
          };
          this._callback([entry], this);
        });
      }
      unobserve(target) { this._targets.delete(target); }
      disconnect() { this._targets.clear(); }
      takeRecords() { return []; }
    };
    window.IntersectionObserver = ShimIO;
    // Belt-and-braces: some bundlers reference globalThis.IntersectionObserver
    // separately from window.IntersectionObserver in browser environments —
    // they're the same binding, but explicit assignment guards against
    // any module that grabbed `globalThis` first. 04-PATTERNS §animations.js
    // body shape (Guard 1 — and globalThis.IntersectionObserver per Pitfall 11).
    globalThis.IntersectionObserver = ShimIO;
  });

  // Step 2 — Guard 2: CSS injection via context.addInitScript (PREP-01).
  // Appends a <style data-framershot="animation-guards"> element to
  // document.head ?? document.documentElement with the universal CSS rule.
  // Robust to early-document-start timing where document.head may not yet exist.
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
    const inject = () => {
      if (document.querySelector('style[data-framershot="animation-guards"]')) return;
      const style = document.createElement('style');
      style.dataset.framershot = 'animation-guards';
      style.textContent = css;
      (document.head ?? document.documentElement).appendChild(style);
    };
    if (document.head) {
      inject();
    } else {
      // addInitScript fires at document_start when document.documentElement
      // exists but document.head may not yet. readystatechange catches
      // the head's arrival at the earliest reliable point.
      document.addEventListener('readystatechange', () => {
        if (document.head) inject();
      });
    }
  });

  // Step 3 — Return (implicit). Both await calls above ensure both handlers
  // are registered before the function resolves.
}
