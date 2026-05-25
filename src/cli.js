import { Command } from 'commander';
import { loadConfig } from './config/load.js';
import { resolveTemplate } from './output/template.js';
import { launchBrowser } from './browser/launcher.js';
import { navigateToPage } from './browser/navigator.js';
import { installAnimationGuards, runPreparePipeline } from './prepare/index.js';
import { runCapture } from './capture/runCapture.js';
import { RegionError } from './capture/region.js';
import { makeProgress, printSelectorWarnings } from './cli/format.js';
import { startServer } from './server/index.js';

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
    .option('--only <region-name>', 'Capture only the named region (skips full-page and other regions)')
    .action(async (configArg, opts) => {
      // Phase 8 mutex guard — --smoke and --only are mutually exclusive
      // (RESEARCH §Pitfall 8). Throw BEFORE either branch runs and BEFORE
      // loadConfig so the user gets the clean RegionError → formatError
      // Guard 4 surface (red `Error:` prefix, no stack). Using RegionError
      // here (instead of bare Error) is intentional — the new formatError
      // Guard 4 produces actionable output without falling through to the
      // "Unexpected error:" default branch (RESEARCH.md:720 "the more
      // polished call").
      if (opts.smoke && opts.only) {
        throw new RegionError('--smoke and --only are mutually exclusive');
      }

      // Step 1 — Load config.
      // Start the spinner BEFORE loadConfig so config errors get the
      // spinner.fail() treatment from index.js's catch (06-RESEARCH §Pattern 1).
      const spinner = (currentSpinner = makeProgress());
      spinner.start('Loading config');
      const config = await loadConfig(configArg);

      if (opts.smoke) {
        // SMOKE BRANCH — Phase 3 hermetic-verifiable seam. Kept inline so the
        // verification path stays exactly as commit-locked. Does NOT call
        // runCapture (that does full-page; smoke needs ONE viewport-sized shot
        // to prove viewport × DSR math reached rendering).
        const now = new Date();
        const date = now.toISOString().slice(0, 10);
        const time = now.toISOString().slice(11, 19).replaceAll(':', '-');
        // smoke takes the first viewport only — see Phase 7 PLAN-03 / ROADMAP success criterion #4 (v0.1 back-compat)
        const viewport = config.viewports[0].name;
        const page = config.page.name;
        const resolvedOutput = resolveTemplate(config.output, { date, time, viewport, page });

        spinner.text = 'Launching Chromium';
        const { browser, context } = await launchBrowser(config, config.viewports[0]);
        try {
          spinner.text = 'Installing animation guards';
          await installAnimationGuards(context, config.prepare);

          spinner.text = `Navigating to ${config.baseUrl}${config.page.path}`;
          const navigatedPage = await navigateToPage(context, config.page);

          spinner.text = 'Running prepare pipeline';
          console.time('prepare');
          const { hideSummary } = await runPreparePipeline(navigatedPage, config.prepare);
          console.timeEnd('prepare');

          if (hideSummary.missed.length > 0) {
            spinner.stop();
            printSelectorWarnings(hideSummary);
            spinner.start();
          }

          spinner.stop();
          currentSpinner = null;

          const { mkdir } = await import('node:fs/promises');
          const { dirname } = await import('node:path');
          await mkdir(dirname(resolvedOutput), { recursive: true });
          await navigatedPage.screenshot({ path: resolvedOutput, fullPage: false, animations: 'disabled' });
          console.log(`smoke screenshot written: ${resolvedOutput}`);
        } finally {
          await context.close();
          await browser.close();
        }
        return;
      }

      // NON-SMOKE BRANCH — full pipeline via runCapture. The CLI's job here is
      // purely the ora adapter: map progress events to spinner.text, sandwich
      // selector warnings between spinner.stop()/start() (06-RESEARCH §Pitfall 2),
      // and emit the final success line on both stderr (via spinner.succeed) and
      // stdout (pipe-capturable, §Pitfall 6).
      //
      // Phase 8: pass `only: opts.only` (string | undefined) through to runCapture.
      // runCapture validates --only upfront (throws RegionError on unknown name
      // BEFORE any Chromium launch, per Plan 03 §"upfront fail-fast"). The
      // top-level catch in index.js routes the throw through formatError's new
      // Guard 4 (RegionError) for the actionable `Error:` surface.
      const results = await runCapture(config, {
        onProgress: (event) => {
          if (event.type === 'step') {
            spinner.text = `[${event.viewport}] ${event.label}`;
          } else if (event.type === 'frame') {
            spinner.text = `[${event.viewport}] Capturing frame ${event.current}/${event.total}`;
          } else if (event.type === 'warning' && event.kind === 'hide-missed') {
            spinner.stop();
            printSelectorWarnings({ matched: 0, missed: event.selectors });
            spinner.start();
          }
        },
        only: opts.only,
      });

      spinner.succeed(`${results.length} screenshot(s) written`);
      currentSpinner = null;
      // One stdout line per result — pipe-capturable per 06-RESEARCH §Pitfall 6.
      // Phase 8: label each line with the region name when present (region
      // capture) or 'full page' otherwise. The two label tokens are distinct
      // so downstream pipe-consumers can grep/match per category.
      for (const r of results) {
        const label = r.regionName ? `region '${r.regionName}'` : 'full page';
        console.log(`screenshot written (${label}): ${r.outputPath}`);
      }
    });

  program
    .command('serve')
    .description('Launch the browser-based UI on http://localhost:<port>')
    .option('-p, --port <port>', 'port to listen on', '5173')
    .option('--open', 'open the UI in your default browser after start')
    .action(async (opts) => {
      const port = Number.parseInt(opts.port, 10);
      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port: ${opts.port}`);
      }
      await startServer({ port, open: !!opts.open });
    });

  // `start` — the easy-mode entry point. Aliased as the default so bare
  // `framershot` just opens the UI. Same as `serve --open` with a default port.
  program
    .command('start', { isDefault: true })
    .description('Open the framershot UI in your browser — paste a link and capture')
    .option('-p, --port <port>', 'port to listen on', '5173')
    .action(async (opts) => {
      const port = Number.parseInt(opts.port, 10);
      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port: ${opts.port}`);
      }
      await startServer({ port, open: true });
    });

  return program;
}
