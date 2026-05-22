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

import { launchBrowser } from '../browser/launcher.js';
import { navigateToPage } from '../browser/navigator.js';
import { installAnimationGuards, runPreparePipeline } from '../prepare/index.js';
import { captureFullPage } from './index.js';
import { resolveTemplate } from '../output/template.js';

/**
 * Run the full capture pipeline against a validated config object, iterating
 * over all viewports in config.viewports[] sequentially. Each viewport gets
 * its own fresh Playwright browser and context — no cross-viewport state sharing.
 *
 * @param {import('../config/schema.js').ResolvedConfig} config
 * @param {object} [opts]
 * @param {(event: { type: string, viewport: string, [k: string]: any }) => void} [opts.onProgress]
 *   Receives step events per viewport: { type: 'step', viewport: string, label: string }
 *   | { type: 'frame', viewport: string, current: number, total: number }
 *   | { type: 'warning', viewport: string, kind: 'hide-missed', selectors: string[] }
 *   Every event carries a viewport field set to the viewport's name.
 * @returns {Promise<Array<{ outputPath: string, hideSummary: { matched: number, missed: string[] }, viewportName: string }>>}
 */
export async function runCapture(config, { onProgress = () => {} } = {}) {
  const date = new Date().toISOString().slice(0, 10);
  const page = config.page.name;
  const results = [];

  for (const vp of config.viewports) {
    const outputPath = resolveTemplate(config.output, { date, viewport: vp.name, page });

    onProgress({ type: 'step', viewport: vp.name, label: 'Launching Chromium' });
    const { browser, context } = await launchBrowser(config, vp);
    try {
      onProgress({ type: 'step', viewport: vp.name, label: 'Installing animation guards' });
      await installAnimationGuards(context, config.prepare);

      onProgress({ type: 'step', viewport: vp.name, label: `Navigating to ${config.baseUrl}${config.page.path}` });
      const navigatedPage = await navigateToPage(context, config.page);

      onProgress({ type: 'step', viewport: vp.name, label: 'Running prepare pipeline' });
      const { hideSummary } = await runPreparePipeline(navigatedPage, config.prepare);

      if (hideSummary.missed.length > 0) {
        onProgress({ type: 'warning', viewport: vp.name, kind: 'hide-missed', selectors: hideSummary.missed });
      }

      onProgress({ type: 'step', viewport: vp.name, label: 'Capturing frame 0/?' });
      await captureFullPage(navigatedPage, outputPath, {
        onProgress: (current, total) => {
          onProgress({ type: 'frame', viewport: vp.name, current, total });
        },
      });

      results.push({ outputPath, hideSummary, viewportName: vp.name });
    } finally {
      // ORDER MATTERS: context first, then browser. (06-RESEARCH §Pitfall 5)
      await context.close();
      await browser.close();
    }
  }

  return results;
}
