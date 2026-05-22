import { Command } from 'commander';
import { loadConfig } from './config/load.js';
import { resolveTemplate } from './output/template.js';
import { launchBrowser } from './browser/launcher.js';
import { navigateToPage } from './browser/navigator.js';
import { installAnimationGuards, runPreparePipeline } from './prepare/index.js';
import { captureFullPage } from './capture/index.js';
import { makeProgress, printSelectorWarnings } from './cli/format.js';

// Module-level spinner reference so index.js's top-level catch can reach it.
// Set to the active spinner at action start; cleared to null on success or
// on the smoke early-return. The catch in index.js calls getCurrentSpinner()
// and guards with spinner.isSpinning before calling .fail() — see
// 06-RESEARCH.md §Pattern 1 §Pitfall 1.
let currentSpinner = null;

export function getCurrentSpinner() { return currentSpinner; }

export function buildProgram() {
  const program = new Command();

  program
    .name('framershot')
    .description('Clean retina screenshots of Framer sites')
    .version('0.1.0', '-v, --version');

  program
    .command('capture <config>')
    .description('Parse a config file, validate, and (later) capture')
    .option('--smoke', 'Phase 3 verification: launch, navigate, take ONE screenshot, exit')
    .action(async (configArg, opts) => {
      // Step 1 — Load config.
      // Start the spinner BEFORE loadConfig so config errors get the
      // spinner.fail() treatment from index.js's catch (06-RESEARCH §Pattern 1).
      const spinner = (currentSpinner = makeProgress());
      spinner.start('Loading config');
      const config = await loadConfig(configArg);

      const date = new Date().toISOString().slice(0, 10);
      const viewport = config.viewport.name ?? 'default';
      const page = config.page.name;
      const resolvedOutput = resolveTemplate(config.output, { date, viewport, page });

      // Step 2 — Launch browser.
      spinner.text = 'Launching Chromium';
      const { browser, context } = await launchBrowser(config);
      try {
        // Step 3 — Install animation guards (pre-nav).
        spinner.text = 'Installing animation guards';
        await installAnimationGuards(context, config.prepare);

        // Step 4 — Navigate to page.
        spinner.text = `Navigating to ${config.baseUrl}${config.page.path}`;
        const navigatedPage = await navigateToPage(context, config.page);

        // Step 5 — Prepare pipeline.
        // Set spinner text BEFORE runPreparePipeline so both smoke and non-smoke
        // show this label while prepare runs (06-RESEARCH §Pattern 1 Step B).
        spinner.text = 'Running prepare pipeline';
        if (opts.smoke) console.time('prepare');
        const { hideSummary } = await runPreparePipeline(navigatedPage, config.prepare);
        if (opts.smoke) console.timeEnd('prepare');

        // Step 5.5 — Selector warnings (non-fatal; runs in both smoke and non-smoke).
        // Stop the spinner, print warnings, restart — prevents repaint collision
        // between spinner frames and console.warn output (06-RESEARCH §Pitfall 2).
        // Selector warnings DO print in smoke mode — they are user-config feedback
        // (06-RESEARCH §Pattern 4).
        if (hideSummary.missed.length > 0) {
          spinner.stop();
          printSelectorWarnings(hideSummary);
          spinner.start(); // restart with no text — text set in next region
        }

        if (opts.smoke) {
          // SMOKE BRANCH: stop the spinner cleanly before smoke's existing output.
          // Smoke runs stay hermetic and grep-able (06-RESEARCH §Pattern 4 §Pitfall 4).
          spinner.stop();
          currentSpinner = null;

          // Phase 3 hermetic-verifiable seam: ONE viewport-sized screenshot
          // proves viewport × DSR math reached the rendering pipeline
          // (CAP-01 + CAP-02 + CAP-03). CAP-04 is exercised by the same
          // navigator code path but proven by the live-site manual gate.
          // fullPage is INTENTIONALLY false — full-page is Phase 5.
          const { mkdir } = await import('node:fs/promises');
          const { dirname } = await import('node:path');
          await mkdir(dirname(resolvedOutput), { recursive: true });
          await navigatedPage.screenshot({ path: resolvedOutput, fullPage: false, animations: 'disabled' });
          console.log(`smoke screenshot written: ${resolvedOutput}`);
        } else {
          // NON-SMOKE BRANCH: full-page scroll-and-stitch capture.
          // captureFullPage owns the mkdir + writeFile internally — the CLI does
          // NOT need a parallel mkdir call (unlike the smoke branch which calls
          // page.screenshot({ path: ... }) directly without an orchestrator).

          // Step 6 — Capture (per-frame counter via onProgress callback).
          // "0/?" is an honest placeholder until the first onProgress fires — the
          // frame count (N) is computed inside captureFrames from page geometry and
          // isn't available before captureFullPage is called.
          spinner.text = 'Capturing frame 0/?';
          await captureFullPage(navigatedPage, resolvedOutput, {
            onProgress: (current, total) => {
              spinner.text = `Capturing frame ${current}/${total}`;
            },
          });

          // Step 7 — Done: persist the success line with a green ✔ symbol.
          spinner.succeed(`screenshot written: ${resolvedOutput}`);
          currentSpinner = null;

          // Duplicate to stdout so the path is pipe-capturable (stderr = chatter,
          // stdout = data; 06-RESEARCH §Pitfall 6).
          console.log(`screenshot written: ${resolvedOutput}`);
        }
      } finally {
        // ORDER MATTERS: context first, then browser. Reversing leaks
        // memory (~22% per Playwright issue #6319; RESEARCH.md Pitfall 5).
        await context.close();
        await browser.close();
      }
    });

  return program;
}
