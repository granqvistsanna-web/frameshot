// src/prepare/scroll.js
// Phase 4 wave 1: post-navigation scroll prime (PREP-04) and extra delay
// (PREP-05). Exports: scrollPrime(page) and extraDelay(page, ms).
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors from Playwright primitives bubble; the caller
// (src/cli.js via src/prepare/index.js) owns presentation, the try/finally
// lifecycle, and exit codes.
//
// Scroll behavior is ALWAYS 'instant' — NEVER 'smooth' (RESEARCH §Pitfall 6,
// 04-PATTERNS §Risk 12). Smooth scrolling animates over ~300ms and races
// with the 200ms inter-step wait; lazy-load IntersectionObservers would fire
// at wrong positions, defeating the prime. Instant is deterministic.
//
// The inter-step wait (INTER_STEP_WAIT_MS = 200) gives browser-native
// loading="lazy" IntersectionObservers their next-event-loop window to fire
// and start their image fetches. Modern Chromium ships native lazy-loading
// — we don't ship a polyfill (RESEARCH §Don't Hand-Roll, §Deferred Ideas).

const INTER_STEP_WAIT_MS = 200;

/**
 * Scroll the page from top to bottom in viewport-height steps, pausing
 * INTER_STEP_WAIT_MS between steps so browser-native lazy-load triggers fire
 * and start their image fetches. After reaching the bottom, scrolls back to
 * the top so Phase 5's capture loop starts from a known scrollY=0 position.
 *
 * @param {import('playwright-chromium').Page} page — a Page already navigated
 *   by navigateToPage (DOM is loaded, fonts ready, animations frozen by
 *   04-01's guards).
 * @returns {Promise<void>}
 *
 * @note Uses `behavior: 'instant'` (the default) on EVERY scrollTo call —
 *   smooth scrolling would animate over ~300ms and race with the 200ms
 *   inter-step wait, causing lazy-load IO triggers to fire at wrong scroll
 *   positions. RESEARCH §Pitfall 6, 04-PATTERNS §Risk 12.
 *
 * @note Geometry (innerHeight, scrollHeight) is read ONCE at the start, not
 *   re-read in the loop. If lazy content extends the page during the prime,
 *   those new pixels are unvisited in this prepare pass — Phase 5's capture
 *   loop is the place that re-reads geometry per iteration; here we just need
 *   to PRIME, not exhaustively cover. RESEARCH §Pattern 3 line 458.
 */
export async function scrollPrime(page) {
  const { innerHeight, totalHeight } = await page.evaluate(() => ({
    innerHeight: window.innerHeight,
    totalHeight: document.documentElement.scrollHeight,
  }));

  for (let y = 0; y < totalHeight; y += innerHeight) {
    await page.evaluate((targetY) => {
      window.scrollTo({ top: targetY, behavior: 'instant' });
    }, y);
    await page.waitForTimeout(INTER_STEP_WAIT_MS);
  }

  // Final reset to top — Phase 5's capture loop assumes scrollY=0 at start.
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
}

/**
 * Honor config.prepare.extraDelay (PREP-05) — a no-op when ms is 0 (the
 * schema default); otherwise an `await page.waitForTimeout(ms)`. Exists as a
 * named export so the orchestrator (04-05) can wrap it in
 * `console.time('prepare')` for the SC #4 timing evidence without that timing
 * call living inside this library code.
 *
 * @param {import('playwright-chromium').Page} page — a Page (required for the
 *   Playwright primitive even though the wait doesn't read from the page;
 *   keeps clock control in Playwright's hands per RESEARCH §Anti-Patterns).
 * @param {number} ms — non-negative integer milliseconds, from
 *   `config.prepare.extraDelay` (default 0).
 * @returns {Promise<void>}
 */
export async function extraDelay(page, ms) {
  if (ms <= 0) return;
  await page.waitForTimeout(ms);
}
