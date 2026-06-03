// src/capture/runCapture.js
// Headless, presentation-free capture pipeline. Both src/cli.js (with an ora
// spinner adapter) and src/server (with an SSE event stream) consume this.
//
// Contract:
//   - Pure library: NO console output, NO process.exit, NO chalk/ora here.
//   - Takes an already-validated config object (the shape produced by loadConfig).
//     Server passes an in-memory config; CLI passes the result of loadConfig.
//   - onProgress is the single presentation seam — events drive both ora text
//     and the SSE stream. Every event carries viewport: <name>.
//   - Lifecycle: per viewport — launches browser/context, runs the pipeline,
//     closes context THEN browser (order matters; ~22% leak otherwise — see
//     06-RESEARCH §Pitfall 5 in src/cli.js comments). Fail-fast: if iteration
//     N throws, its context+browser still close before the throw propagates;
//     iterations N+1..M never run.
//
// Errors bubble. Callers convert to user-facing messages (formatError for CLI,
// SSE error frame for server).
//
// Crawl resilience: a SINGLE-page run is fail-fast (its page error rejects the
// promise). A MULTI-page run (config.pages.length > 1) isolates per-page
// failures — a crashed/failed page is recorded in the returned `failures[]` and
// emitted as a non-fatal `page-error` progress event, and the batch continues.
// Fatal errors (browser launch, client abort) still reject regardless of mode.
//
// v0.3 concurrency: viewports run in parallel up to config.concurrency (CLI
// `--concurrency N` overrides). Each viewport remains its own browser+context,
// so the parallel unit-of-work is "one viewport". Pages within a viewport stay
// sequential (they share the context). Concurrency=1 (default) preserves
// Phase 7 fail-fast semantics exactly — a throw in viewport N skips N+1..M.
// At >1, the in-flight viewports finish (no cancellation; closing a context
// mid-capture is more dangerous than letting it complete), the queue is
// drained, and the first error is rethrown. Results order is no longer
// strictly viewport-declaration order at >1 — within a viewport, page order
// is preserved. Callers that depend on result ordering should sort by
// (viewportName, pageName) themselves.

import { launchBrowser } from '../browser/launcher.js';
import { navigateToPage } from '../browser/navigator.js';
import { installAnimationGuards, runPreparePipeline } from '../prepare/index.js';
import { captureFullPage } from './index.js';
import { resolveTemplate, swapExtension } from '../output/template.js';

/**
 * Run the full capture pipeline against a validated config object, iterating
 * over all viewports in config.viewports[]. Each viewport gets its own fresh
 * Playwright browser and context — no cross-viewport state sharing. Viewports
 * run concurrently up to `config.concurrency` (default 1 = sequential).
 *
 * @param {import('../config/schema.js').ResolvedConfig} config
 * @param {object} [opts]
 * @param {(event: { type: string, viewport: string, [k: string]: any }) => void} [opts.onProgress]
 *   Receives step events per viewport: { type: 'step', viewport: string, label: string }
 *   | { type: 'frame', viewport: string, current: number, total: number }
 *   | { type: 'warning', viewport: string, kind: 'hide-missed', selectors: string[] }
 *   Every event carries a viewport field set to the viewport's name.
 * @returns {Promise<{
 *   results: Array<{ outputPath: string, hideSummary: { matched: number, missed: string[] }, viewportName: string, pageName: string, kind: string }>,
 *   failures: Array<{ viewportName: string, pageName: string, message: string }>,
 * }>}
 *   `results` — one entry per successful capture, in execution order.
 *   `failures` — non-fatal per-page failures from multi-page (crawl) runs that
 *   were skipped so the batch could continue. Always empty for single-page runs
 *   (those fail-fast: a page error rejects the promise instead).
 */
export async function runCapture(config, { onProgress = () => {} } = {}) {
  // Single timestamp shared across all viewports/pages in this run so every
  // artifact lands under the same {date}/{time} folder — captures taken
  // seconds apart never collide, captures within one run stay grouped.
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replaceAll(':', '-');
  const results = [];

  // Format/quality knob — added in v0.3 so retina marketing-page captures can
  // ship as WebP/JPEG instead of 10–15 MB PNGs. The output template still ends
  // in `.png` (v0.1 default + the server's hardcoded template); swapExtension
  // rewrites the extension once per resolved path so callers never have to
  // think about format-vs-template skew.
  const { format, quality, backdrop } = config;

  // v0.3 (DISC-01): viewport is the OUTER loop, page is the INNER loop. One
  // browser+context per viewport — pages are reused tabs in the same context,
  // because the only thing that requires a new context is a different
  // viewport/DSR pair. A 20-page sitemap capture launches Chromium once per
  // viewport, not 20× per viewport. Tabs are closed between pages so a long
  // sitemap run does not accumulate DOM/fonts/listeners in one context.
  //
  // v0.3 concurrency: this function processes ONE viewport — the dispatcher
  // below runs N of these in parallel. Results from each viewport are pushed
  // onto a per-viewport array and merged back into the shared `results` array
  // once the viewport completes (so partial captures from a failed viewport
  // never leak into the result set, which matches the Phase 7 fail-fast
  // contract of "either a viewport completes whole or its captures don't
  // count").
  async function runViewport(vp) {
    const localResults = [];
    const localFailures = [];
    // Crawl resilience: with more than one page queued, a single page's failure
    // (a Chromium renderer crash on a heavy retina page, a nav error on one bad
    // route) skips that page and continues the batch — losing a 20-page sitemap
    // run because page 7 crashed is the wrong trade. A single-page run keeps the
    // original fail-fast contract: its one error IS the run's outcome, so it
    // propagates and aborts the run.
    const multiPage = config.pages.length > 1;
    onProgress({ type: 'step', viewport: vp.name, label: 'Launching Chromium' });
    const { browser, context } = await launchBrowser(config, vp);
    try {
      onProgress({ type: 'step', viewport: vp.name, label: 'Installing animation guards' });
      await installAnimationGuards(context, config.prepare);

      for (const pg of config.pages) {
        // Per-page event scope adds `page: pg.name` so CLI/server UX can label
        // multi-page runs without parsing the label string.
        const scope = { viewport: vp.name, page: pg.name };
        const outputPath = swapExtension(
          resolveTemplate(config.output, { date, time, viewport: vp.name, page: pg.name }),
          format,
        );

        // A crash on an earlier page can take the whole browser process down,
        // not just its tab. Hammering a dead browser with newPage() for every
        // remaining route yields N identical low-level "Target closed" errors —
        // detect it once, record the rest as skipped, and stop this viewport.
        if (!browser.isConnected()) {
          const message = 'skipped — Chromium crashed on an earlier page in this viewport';
          localFailures.push({ viewportName: vp.name, pageName: pg.name, message });
          onProgress({ type: 'page-error', ...scope, message });
          continue;
        }

        // navigatedPage stays in the outer scope so the finally can close it
        // even when navigateToPage itself throws (it would be undefined then).
        let navigatedPage;
        try {
          onProgress({ type: 'step', ...scope, label: `Navigating to ${config.baseUrl}${pg.path}` });
          navigatedPage = await navigateToPage(context, pg);

          onProgress({ type: 'step', ...scope, label: 'Running prepare pipeline' });
          const { hideSummary } = await runPreparePipeline(navigatedPage, config.prepare);

          if (hideSummary.missed.length > 0) {
            onProgress({ type: 'warning', ...scope, kind: 'hide-missed', selectors: hideSummary.missed });
          }

          // vp.pinHeight (v0.4) clamps the scroll-stitch to a CSS-pixel height —
          // undefined means full-page. vp.pinOffset (v0.5/v0.6) slides the
          // capture window down the page; works for both pin and full-page
          // captures. vp.pinOffsetPx (v0.6) is the absolute-pixel alternative.
          // `kind` tags full-page outputs as either 'fullPage' or 'pin' so the UI
          // can pick the right backdrop for the pin-offset preview without
          // re-deriving it from a slug-suffix heuristic (which would misfire
          // if a custom viewport name happened to end with a chip slug).
          const fullPageKind = vp.pinHeight !== undefined ? 'pin' : 'fullPage';
          const fullPageOpts = {
            onProgress: (current, total) => onProgress({ type: 'frame', ...scope, current, total }),
            onStepEvent: (e) => onProgress({ type: 'step', ...scope, label: e.label }),
            onMeta: (e) => onProgress({ type: 'debug', ...scope, ...e }),
            hideStickyAfterFirstFrame: config.prepare.hideSticky,
            frameDelay: config.prepare.frameDelay,
            maxHeight: vp.pinHeight,
            pinOffset: vp.pinOffset,
            pinOffsetPx: vp.pinOffsetPx,
            format,
            quality,
            backdrop,
          };

          onProgress({ type: 'step', ...scope, label: 'Capturing frames (estimating)' });
          await captureFullPage(navigatedPage, outputPath, fullPageOpts);
          localResults.push({ outputPath, hideSummary, viewportName: vp.name, pageName: pg.name, kind: fullPageKind });
        } catch (err) {
          // A client disconnect is tagged CLIENT_ABORTED by the server's
          // onProgress seam — that's fatal for the WHOLE run (nobody's
          // watching), never a per-page skip. Let it propagate.
          if (err?.code === 'CLIENT_ABORTED') throw err;

          // Attach viewport+page scope so a fail-fast (single-page) error
          // reaches the caller's catch with its breadcrumb intact. Under
          // concurrency > 1 the server's lastStep cache can capture
          // cross-viewport state when workers interleave SSE events, so the
          // error itself must carry its own scope.
          if (err.viewportName === undefined) err.viewportName = vp.name;
          if (err.pageName === undefined) err.pageName = pg.name;

          // Single-page run: preserve fail-fast — the error IS the outcome.
          if (!multiPage) throw err;

          // Crawl run: record, surface a non-fatal page-error event, move on.
          const message = err?.message ?? String(err);
          localFailures.push({ viewportName: vp.name, pageName: pg.name, message });
          onProgress({ type: 'page-error', ...scope, message });
        } finally {
          // Close the page tab between iterations so a long sitemap run does
          // not accumulate tabs in a single context. May be undefined if
          // newPage()/navigate threw before assignment; guard it. Best-effort:
          // a throw here would mask the real capture error (JS finally spec).
          if (navigatedPage) await navigatedPage.close().catch(() => {});
        }
      }
    } finally {
      // ORDER MATTERS: context first, then browser. (06-RESEARCH §Pitfall 5)
      // Swallow cleanup errors — a throw from finally replaces any in-flight
      // capture error (JS spec), so an unrelated context.close() failure would
      // mask the real "TimeoutError on hide selector" surfaced through
      // firstError. Cleanup is best-effort here.
      try { await context.close(); } catch {}
      try { await browser.close(); } catch {}
    }
    return { results: localResults, failures: localFailures };
  }

  // Worker-pool dispatcher: pull viewports from a shared index up to
  // `concurrency` workers in parallel. Each worker loops until the index
  // exhausts the viewport list. On the first error: stop pulling new work,
  // let in-flight workers finish (no mid-capture cancellation — closing a
  // context while sharp is encoding a 15 MB image is worse than waiting a
  // few seconds), then rethrow the first error.
  //
  // concurrency=1 collapses to "single worker, sequential pull" — bit-for-bit
  // equivalent to the Phase 7 for-of loop including fail-fast (next viewport
  // never starts after a throw because the worker exits its while-loop and
  // there's no second worker to keep going).
  const concurrency = Math.min(config.concurrency, config.viewports.length);
  let nextIndex = 0;
  let firstError = null;
  // Non-fatal per-page failures from multi-page (crawl) runs, merged across all
  // viewports. Distinct from firstError, which is the fatal/single-page abort.
  const failures = [];

  async function worker() {
    while (true) {
      if (firstError) return; // stop pulling new work after a failure
      const i = nextIndex++;
      if (i >= config.viewports.length) return;
      try {
        const { results: viewportResults, failures: viewportFailures } = await runViewport(config.viewports[i]);
        results.push(...viewportResults);
        failures.push(...viewportFailures);
      } catch (err) {
        if (!firstError) firstError = err;
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (firstError) throw firstError;
  return { results, failures };
}
