// src/prepare/index.js
// Phase 4 wave 1: prepare-pipeline orchestrator + barrel. Single import
// surface for src/cli.js — the CLI imports BOTH lifecycle halves from
// here (no direct import from animations.js / hide.js / scroll.js).
//
// Exports:
//   - installAnimationGuards (re-export from ./animations.js) — pre-nav
//   - runPreparePipeline(page, prepareConfig) → { hideSummary } — post-nav
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors from composed calls bubble; the caller
// (src/cli.js, wired in 04-05) owns presentation, the try/finally lifecycle,
// and exit codes. NO try/catch around the composed calls. NO instrumentation
// (timing instrumentation lives in cli.js per 04-05 — RESEARCH §Anti-Patterns
// line 597, 04-PATTERNS §Risk 13).
//
// Step order is fixed (RESEARCH §Pattern 4 lines 529-541):
//   1. hideSelectors  — hides elements before they trigger any lazy fetches
//   2. scrollPrime    — gated on prepareConfig.scrollPrime (schema.js:29)
//   3. extraDelay     — unconditional call; function short-circuits on ms<=0

import { hideSelectors, hideFramerBadge, hideStickyAndFixed } from './hide.js';
import { scrollPrime, extraDelay } from './scroll.js';
export { installAnimationGuards } from './animations.js';

/**
 * Run the post-navigation prep pipeline: hideSelectors → scrollPrime → extraDelay.
 * Animation guards (PREP-01 + PREP-02) are installed separately by installAnimationGuards
 * BEFORE navigation; this function does NOT touch them.
 *
 * @param {import('playwright-chromium').Page} page — a Page already returned by navigateToPage.
 * @param {{ animations: boolean, hide: string[], scrollPrime: boolean, extraDelay: number }} prepareConfig
 *   The validated config.prepare sub-object. Reads `prepareConfig.hide` (PREP-03),
 *   `prepareConfig.scrollPrime` (PREP-04 gate), `prepareConfig.extraDelay` (PREP-05).
 *   The `animations` boolean is NOT read — its scope is the pre-nav guards which run elsewhere.
 * @returns {Promise<{ hideSummary: { matched: number, missed: string[] } }>}
 *   Informational pass-through. Phase 4 ignores; Phase 6 (CLI-03) will surface
 *   hideSummary.missed as warnings.
 */
export async function runPreparePipeline(page, prepareConfig) {
  // PREP-03 — hide selectors. Empty list is a no-op (hide.js short-circuits).
  const hideSummary = await hideSelectors(page, prepareConfig.hide);

  // PREP-04 — scroll prime. Gated by config; defaults to true.
  if (prepareConfig.scrollPrime) {
    await scrollPrime(page);
  }

  // PREP-05 — extra delay. Defaults to 0; the helper short-circuits on <=0.
  await extraDelay(page, prepareConfig.extraDelay);

  // The badge + sticky/fixed sweeps run LAST — after scrollPrime and any
  // extraDelay — so they catch elements that Framer's runtime mounts in
  // response to the first scroll (the badge in particular is sometimes
  // late-injected). visibility:hidden preserves layout so scrollHeight stays
  // stable for the capture loop's geometry-once invariant.
  if (prepareConfig.hideFramerBadge) {
    await hideFramerBadge(page);
  }
  if (prepareConfig.hideSticky) {
    await hideStickyAndFixed(page);
  }

  return { hideSummary };
}
