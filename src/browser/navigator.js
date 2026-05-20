// src/browser/navigator.js
// Wave 2 of Phase 3: page-level navigation + load-state wait + fonts.ready wait.
// Exports: navigateToPage(context, pageConfig) → Page.
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors throw BrowserError (imported from launcher.js —
// not redefined here); the caller (src/cli.js) owns presentation, the try/finally
// lifecycle, and exit codes.
//
// Networkidle is officially DISCOURAGED upstream (types.d.ts:3172 comment) but
// CAP-03 names it verbatim — we honor it literally with a 15s timeout-tolerant
// guard. Framer's WebSocket Server API + analytics beacons keep network "busy"
// indefinitely on real Framer sites, so a TimeoutError on the post-load
// networkidle wait is treated as "good enough, move on" rather than fatal
// (RESEARCH.md §Pitfall 2). Other navigation errors (DNS, SSL, invalid URL)
// are wrapped in BrowserError and re-thrown.
import { BrowserError } from './launcher.js';

const DEFAULT_NAV_TIMEOUT_MS = 15000;

/**
 * Open a new page in the context, navigate to `pageConfig.path` (joined against
 * the context's baseURL), wait for network to settle (best-effort), and wait
 * for fonts to be ready. Returns the Page.
 *
 * networkidle behavior is INTENTIONALLY timeout-tolerant — Framer's WebSocket
 * Server API + analytics beacons may never let network truly idle. A timeout
 * here is treated as "good enough, move on" rather than a fatal error.
 * Phase 4's prepare pipeline provides redundant settling time.
 *
 * @param {import('playwright-chromium').BrowserContext} context — the context returned by launchBrowser
 * @param {{ path: string, name: string }} pageConfig — the `config.page` sub-object from Phase 2's validated config
 * @returns {Promise<import('playwright-chromium').Page>}
 * @throws {BrowserError} on non-TimeoutError navigation failure (DNS, SSL, invalid URL) or non-TimeoutError fonts.ready failure
 */
export async function navigateToPage(context, pageConfig) {
  const page = await context.newPage();

  // Step 1 — Navigate with networkidle (timeout-tolerant)
  // pageConfig.path (NOT baseUrl + path) — context.baseURL handles joining.
  try {
    await page.goto(pageConfig.path, {
      waitUntil: 'networkidle',
      timeout: DEFAULT_NAV_TIMEOUT_MS,
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      // The page DID start loading (goto returned a Response and the timeout
      // fired on the post-load networkidle wait). Continue — fonts.ready below
      // is the real gate, and Phase 4 prepare adds further settling. We
      // intentionally do NOT log here — Phase 6 owns terminal UX; if Phase 6
      // wants to warn on networkidle timeout, it can wrap this call.
    } else {
      // SSL error, DNS failure, invalid URL, ERR_NAME_NOT_RESOLVED, etc.
      // — these are fatal.
      throw new BrowserError(
        `Failed to navigate to ${pageConfig.path} (resolved against context baseURL). ` +
          `Original error: ${err.message}`,
        { cause: err },
      );
    }
  }

  // Step 2 — Wait for fonts (also timeout-tolerant; this is the CAP-04 implementation)
  // waitForFunction (NOT page.evaluate) — RESEARCH.md §Pitfall 6: waitForFunction
  // is the documented-for-waiting form and uses navigation-timeout semantics.
  // The second argument `null` is the optional `arg` parameter (no args needed
  // for our predicate); including it matches the Playwright docs signature.
  // RESEARCH.md §Pitfall 4: Framer uses font-display: swap, so document.fonts.ready
  // is what blocks until the swap completes. Playwright also re-awaits this
  // internally before page.screenshot() (issue #35200) — belt-and-braces.
  try {
    await page.waitForFunction(() => document.fonts.ready, null, {
      timeout: DEFAULT_NAV_TIMEOUT_MS,
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      // Same posture as networkidle: don't fail the run. A 15s font wait
      // covers all reasonable cases; if it times out, fall through with
      // whatever the page has rendered so far. Playwright also internally
      // awaits document.fonts.ready before page.screenshot() (per issue #35200)
      // — belt-and-braces.
    } else {
      throw new BrowserError(
        `Error waiting for fonts to be ready. Original error: ${err.message}`,
        { cause: err },
      );
    }
  }

  return page;
}
