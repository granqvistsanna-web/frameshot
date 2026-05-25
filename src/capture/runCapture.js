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
// Phase 8 (REGION-01/02/03): the per-viewport loop body now branches between
// full-page capture (v0.1+Phase 7 path) and region capture (v0.2 new path).
// Branching rule (Open Q#1 lock A — "capture everything declared"):
//   - When config.regions is undefined AND only is undefined: full-page only
//     (Phase 7 back-compat — exactly N captures for N viewports).
//   - When config.regions is declared AND only is undefined: BOTH per-region
//     captures AND full-page capture per viewport. Result count per viewport
//     = regions.length + 1.
//   - When only !== undefined: only the matched region runs per viewport;
//     full-page is skipped. Result count per viewport = 1.
//   - When only !== undefined AND no region matches the name: RegionError
//     thrown BEFORE any browser launch (fail-fast upfront validation).
// Per-region onProgress events from captureRegion are wrapped to inject
// viewport: vp.name scoping, mirroring Phase 7's per-viewport scoping pattern.
// Results array entries gain an optional regionName field on region-capture
// entries; full-page entries omit it (or set undefined).
//
// v0.3 concurrency: viewports run in parallel up to config.concurrency (CLI
// `--concurrency N` overrides). Each viewport remains its own browser+context,
// so the parallel unit-of-work is "one viewport". Pages within a viewport stay
// sequential (they share the context). Concurrency=1 (default) preserves
// Phase 7 fail-fast semantics exactly — a throw in viewport N skips N+1..M.
// At >1, the in-flight viewports finish (no cancellation; closing a context
// mid-capture is more dangerous than letting it complete), the queue is
// drained, and the first error is rethrown. Results order is no longer
// strictly viewport-declaration order at >1 — within a viewport, page+region
// order is preserved. Callers that depend on result ordering should sort by
// (viewportName, pageName, regionName) themselves.

import { launchBrowser } from '../browser/launcher.js';
import { navigateToPage } from '../browser/navigator.js';
import { installAnimationGuards, runPreparePipeline } from '../prepare/index.js';
import { captureFullPage } from './index.js';
import { captureRegion, RegionError } from './region.js';
import { resolveTemplate, swapExtension } from '../output/template.js';

/**
 * Resolve the list of regions to capture for the current run.
 *
 * - When `only === undefined`: returns `regions ?? []` — every declared region
 *   (or an empty array when no regions: block exists in the config).
 * - When `only` is set: returns a single-element array containing the matched
 *   region. Throws RegionError if no declared region matches the name —
 *   including the case where `regions` itself is undefined or empty.
 *
 * Does NOT mutate `regions`. The same input regions array can be passed
 * across multiple viewport iterations without filter contamination
 * (RESEARCH §"Anti-Patterns to Avoid": "Mutating the config object to filter
 * regions when --only is used").
 *
 * Lives in runCapture.js (not region.js) because the --only-filter validation
 * is purely an orchestration-layer concern — region.js owns per-region
 * capture mechanics, runCapture.js owns the CLI/server-flag plumbing.
 *
 * @param {Array<object>|undefined} regions — config.regions from a validated config
 * @param {string|undefined} only — the CLI --only flag value (Plan 04 wires it)
 * @returns {Array<object>} — empty array (no filter, no regions), single-element
 *   array (--only match), or full regions array (no filter, regions declared)
 * @throws {RegionError} — when `only` is set but no declared region matches the
 *   name. The message lists the declared region names so the user can fix the
 *   flag value without re-reading the config.
 */
function resolveRegions(regions, only) {
  if (only === undefined) {
    return regions ?? [];
  }
  const declared = regions ?? [];
  const match = declared.find((r) => r.name === only);
  if (!match) {
    const names = declared.map((r) => `'${r.name}'`).join(', ') || '<no regions declared>';
    throw new RegionError(`Unknown --only region '${only}'. Declared regions: ${names}.`);
  }
  return [match];
}

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
 *   For region captures (Phase 8): { type: 'step', viewport, label: "Capturing region '<name>'" }
 *   Every event carries a viewport field set to the viewport's name.
 * @param {string} [opts.only] — Phase 8: when set, only the named region runs
 *   per viewport (skips full-page and other regions; Plan 04 wires the
 *   --only=<region-name> CLI flag to this option). When unset, all declared
 *   regions PLUS full-page run per viewport (Open Q#1 lock A — "capture
 *   everything declared"). When unset AND config.regions is undefined, only
 *   full-page runs (v0.1/Phase 7 back-compat — exactly N captures for N viewports).
 * @returns {Promise<Array<{ outputPath: string, hideSummary: { matched: number, missed: string[] }, viewportName: string, regionName?: string }>>}
 *   Region-capture entries carry regionName; full-page entries omit it
 *   (or set undefined). One entry per capture, in execution order:
 *   for each viewport, regions[0..N-1] (when declared and not filtered out
 *   by --only) followed by full-page (when --only is unset).
 */
export async function runCapture(config, { onProgress = () => {}, only } = {}) {
  // Single timestamp shared across all viewports/pages/regions in this run so
  // every artifact lands under the same {date}/{time} folder — captures
  // taken seconds apart never collide, captures within one run stay grouped.
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replaceAll(':', '-');
  const results = [];

  // Fail-fast upfront --only validation — runs BEFORE any Chromium launch so
  // an unknown flag value never wastes a browser process. Discard the return
  // value; per-iteration target resolution recomputes (cheap, avoids closing
  // over a variable that is only needed inside the loop and stays correct if
  // a future caller mutates config.regions between iterations — which they
  // should not, but defensive cohesion is free here).
  resolveRegions(config.regions, only);

  // Format/quality knob — added in v0.3 so retina marketing-page captures can
  // ship as WebP/JPEG instead of 10–15 MB PNGs. The output template still ends
  // in `.png` (v0.1 default + the server's hardcoded template); swapExtension
  // rewrites the extension once per resolved path so callers never have to
  // think about format-vs-template skew.
  const { format, quality } = config;

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
    onProgress({ type: 'step', viewport: vp.name, label: 'Launching Chromium' });
    const { browser, context } = await launchBrowser(config, vp);
    try {
      onProgress({ type: 'step', viewport: vp.name, label: 'Installing animation guards' });
      await installAnimationGuards(context, config.prepare);

      for (const pg of config.pages) {
        // Per-page event scope adds `page: pg.name` so CLI/server UX can label
        // multi-page runs without parsing the label string.
        const scope = { viewport: vp.name, page: pg.name };
        // Pass region: 'full' so the full-page output substitutes {region} → 'full'
        // when the template contains it (regions-declared case). When the template
        // omits {region} (no regions), this is a no-op — resolveTemplate only
        // substitutes placeholders that appear in the template.
        const outputPath = swapExtension(
          resolveTemplate(config.output, { date, time, viewport: vp.name, page: pg.name, region: 'full' }),
          format,
        );

        onProgress({ type: 'step', ...scope, label: `Navigating to ${config.baseUrl}${pg.path}` });
        const navigatedPage = await navigateToPage(context, pg);
        try {
          onProgress({ type: 'step', ...scope, label: 'Running prepare pipeline' });
          const { hideSummary } = await runPreparePipeline(navigatedPage, config.prepare);

          if (hideSummary.missed.length > 0) {
            onProgress({ type: 'warning', ...scope, kind: 'hide-missed', selectors: hideSummary.missed });
          }

          // Phase 8 region branch — replaces Phase 7's single captureFullPage call.
          // The targets array contains zero items (no regions, no --only), one
          // item (--only match), or N items (all declared regions, --only unset).
          const targets = resolveRegions(config.regions, only);

          if (targets.length === 0) {
            // Full-page only — back-compat path (no regions declared, no --only).
            // vp.pinHeight (v0.4): when set on the viewport entry, the scroll-stitch
            // clamps to this CSS-pixel height — produces a ratio-shaped pin output
            // (e.g., 1440×2160 for a 2:3 desktop pin) instead of a full-page capture.
            // Undefined = original full-page behavior.
            onProgress({ type: 'step', ...scope, label: 'Capturing frame 0/?' });
            await captureFullPage(navigatedPage, outputPath, {
              onProgress: (current, total) => {
                onProgress({ type: 'frame', ...scope, current, total });
              },
              hideStickyAfterFirstFrame: config.prepare.hideSticky,
              frameDelay: config.prepare.frameDelay,
              maxHeight: vp.pinHeight,
              format,
              quality,
            });
            localResults.push({ outputPath, hideSummary, viewportName: vp.name, pageName: pg.name });
          } else {
            // Region path — one image per region. Per-region onProgress events
            // are wrapped to inject viewport + page scope.
            for (const region of targets) {
              const regionPath = swapExtension(
                resolveTemplate(config.output, {
                  date,
                  time,
                  viewport: vp.name,
                  page: pg.name,
                  region: region.name,
                }),
                format,
              );
              await captureRegion(navigatedPage, region, regionPath, {
                onProgress: (event) => onProgress({ ...event, ...scope }),
                format,
                quality,
              });
              localResults.push({
                outputPath: regionPath,
                hideSummary,
                viewportName: vp.name,
                pageName: pg.name,
                regionName: region.name,
              });
            }
            // Open Q#1 lock A: when regions are declared AND --only is unset,
            // ALSO capture the full page for this viewport+page combination.
            // vp.pinHeight is honored here too so a pin viewport + declared
            // regions still produces a ratio-shaped image instead of full-page.
            if (only === undefined && config.regions !== undefined) {
              onProgress({ type: 'step', ...scope, label: 'Capturing full page' });
              await captureFullPage(navigatedPage, outputPath, {
                onProgress: (current, total) => {
                  onProgress({ type: 'frame', ...scope, current, total });
                },
                hideStickyAfterFirstFrame: config.prepare.hideSticky,
                frameDelay: config.prepare.frameDelay,
                maxHeight: vp.pinHeight,
                format,
                quality,
              });
              localResults.push({ outputPath, hideSummary, viewportName: vp.name, pageName: pg.name });
            }
          }
        } finally {
          // Close the page tab between iterations so a long sitemap run does
          // not accumulate tabs in a single context.
          await navigatedPage.close();
        }
      }
    } finally {
      // ORDER MATTERS: context first, then browser. (06-RESEARCH §Pitfall 5)
      await context.close();
      await browser.close();
    }
    return localResults;
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

  async function worker() {
    while (true) {
      if (firstError) return; // stop pulling new work after a failure
      const i = nextIndex++;
      if (i >= config.viewports.length) return;
      try {
        const viewportResults = await runViewport(config.viewports[i]);
        results.push(...viewportResults);
      } catch (err) {
        if (!firstError) firstError = err;
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (firstError) throw firstError;
  return results;
}
