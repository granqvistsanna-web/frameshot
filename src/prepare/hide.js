// src/prepare/hide.js
// Phase 4 wave 1: post-navigation element hiding for PREP-03. Exports:
// hideSelectors(page, selectors) → { matched, missed }.
// Also exports hideFramerBadge(page) → { matched } for the Framer-specific
// badge sweep (see prepareSchema.hideFramerBadge in src/config/schema.js).
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors from page.evaluate bubble; the caller
// (src/cli.js via src/prepare/index.js) owns presentation and lifecycle.
// Invalid CSS-syntax selectors do NOT throw — they are recorded in `missed`
// so Phase 6's terminal UX (CLI-03) can surface them as warnings.
//
// CSS rule choice (RESEARCH §Pitfall 5, 04-PATTERNS §Risk 11):
// - visibility:hidden  — preserves layout, removes visual presence. REQUIRED.
// - The `display` property MUST NOT be set to "none". Doing so shrinks
//   document.scrollHeight, which breaks Phase 5's scroll-stitch math
//   (the capture loop reads scrollHeight to compute frame count).

/**
 * Hide elements matching the given CSS selectors using `visibility: hidden` with
 * `!important` (not the `display` property, which would shrink scrollHeight and
 * break Phase 5's scroll-stitch math).
 *
 * Each selector is applied independently via `document.querySelectorAll`. Selectors
 * that produce a CSS `SyntaxError` OR match zero elements are recorded in `missed`
 * rather than thrown — a typo in the config should not kill the whole prepare
 * pipeline. Phase 4 ignores this return value; Phase 6 (CLI-03) will surface
 * `missed` as a warning.
 *
 * @param {import('playwright-chromium').Page} page — a Page already returned by
 *   navigateToPage (so the DOM is loaded and font-ready). MUST be post-navigation;
 *   calling against a Page that hasn't navigated yet would evaluate against `about:blank`.
 * @param {string[]} selectors — the validated `config.prepare.hide` array from Phase 2's
 *   loadConfig. May be empty (default from schema is `[]`).
 * @returns {Promise<{ matched: number, missed: string[] }>} — `matched` is the total
 *   node count across all selectors that matched ≥1 element (increments per node, not
 *   per selector); `missed` is the list of selectors that either threw a `SyntaxError`
 *   from querySelectorAll OR matched zero elements. Phase 4 ignores this return;
 *   Phase 6 (CLI-03) will surface `missed` as a warning.
 */
export async function hideSelectors(page, selectors) {
  // Defensive empty-input short-circuit (04-PATTERNS §Shared Patterns
  // "Defensive empty-input short-circuit"). Honors the schema's
  // default-empty-array case without paying for a page.evaluate round-trip.
  // Also defends against malformed callers that might pass `undefined` —
  // defensive, since the schema enforces array, but explicit > implicit.
  if (!Array.isArray(selectors) || selectors.length === 0) {
    return { matched: 0, missed: [] };
  }

  // Single page.evaluate call — selectors passed as the `arg` argument (NOT
  // interpolated into the function source). This is the canonical injection-proof
  // boundary: a string containing `"); evil(); //` cannot break out of the array
  // element it occupies. 04-PATTERNS §hide.js Body shape line 130.
  return page.evaluate((sels) => {
    let matched = 0;
    const missed = [];
    for (const sel of sels) {
      let nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch {
        // querySelectorAll throws SyntaxError on invalid CSS syntax.
        // Lump syntax errors with zero-match into `missed` so a typo
        // in the config doesn't kill the whole prepare pipeline.
        missed.push(sel);
        continue;
      }
      if (nodes.length === 0) {
        missed.push(sel);
        continue;
      }
      for (const node of nodes) {
        // Inline-important pattern beats author stylesheets that may
        // declare higher specificity rules on the same element. A
        // simple `node.style.visibility = 'hidden'` would lose to a
        // page-level `.sticky-nav { visibility: visible }` declaration.
        // The 3-argument form of setProperty is the documented way to set
        // !important via the CSSOM — `node.style.visibility = 'hidden !important'`
        // does NOT work; the !important is stripped by the assignment.
        // 04-PATTERNS §hide.js Body shape line 132.
        node.style.setProperty('visibility', 'hidden', 'important');
        matched++;
      }
    }
    return { matched, missed };
  }, selectors);
}

/**
 * Hide the "Made in Framer" badge using known selectors plus a defensive
 * computed-style sweep (any position:fixed anchor pointing at framer.com /
 * framer.website / framer.link, or any element whose id/class contains
 * "framer-badge"). Uses `visibility: hidden !important` — same reasoning as
 * hideSelectors: `display:none` would shrink scrollHeight and break the
 * capture loop's frame math. Silent on no-match — the badge legitimately
 * doesn't exist on non-Framer sites, and absence is not an error.
 *
 * @param {import('playwright-chromium').Page} page — post-navigation page
 * @returns {Promise<{ matched: number }>} — node count hidden (informational)
 */
export async function hideFramerBadge(page) {
  return page.evaluate(() => {
    let matched = 0;
    const seen = new Set();
    const hide = (node) => {
      if (seen.has(node)) return;
      seen.add(node);
      node.style.setProperty('visibility', 'hidden', 'important');
      matched++;
    };
    // Known ids in Framer's published site runtime: the "Made in Framer" badge
    // and the "Edit page" editor bar (an iframe shown to logged-in editors).
    for (const id of ['__framer-badge-container', '__framer-editorbar']) {
      const byId = document.getElementById(id);
      if (byId) hide(byId);
    }
    // Any element whose id/class hints at the badge.
    for (const el of document.querySelectorAll('[id*="framer-badge"], [class*="framer-badge"], [id*="__framer-badge"]')) {
      hide(el);
    }
    // Any fixed-position anchor targeting Framer's domains is almost
    // certainly the badge link. Avoids hiding inline framer.com links
    // in page body content (those are not position:fixed).
    for (const a of document.querySelectorAll('a[href*="framer.com"], a[href*="framer.website"], a[href*="framer.link"]')) {
      if (getComputedStyle(a).position === 'fixed') hide(a);
    }
    return { matched };
  });
}
