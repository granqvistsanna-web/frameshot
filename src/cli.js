import { Command } from 'commander';
import { loadConfig } from './config/load.js';
import { resolveTemplate } from './output/template.js';
import { launchBrowser } from './browser/launcher.js';
import { navigateToPage } from './browser/navigator.js';
import { installAnimationGuards, runPreparePipeline } from './prepare/index.js';
import { captureFullPage } from './capture/index.js';

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
      const config = await loadConfig(configArg);

      const date = new Date().toISOString().slice(0, 10);
      const viewport = config.viewport.name ?? 'default';
      const page = config.page.name;
      const resolvedOutput = resolveTemplate(config.output, { date, viewport, page });

      const { browser, context } = await launchBrowser(config);
      try {
        await installAnimationGuards(context, config.prepare);
        const navigatedPage = await navigateToPage(context, config.page);
        if (opts.smoke) console.time('prepare');
        const { hideSummary } = await runPreparePipeline(navigatedPage, config.prepare);
        // hideSummary is intentionally unused in Phase 4 — Phase 6 (CLI-03)
        // will surface hideSummary.missed as warnings if any hide: selector matched 0 elements.
        if (opts.smoke) console.timeEnd('prepare');
        if (opts.smoke) {
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
          // Phase 5: full-page scroll-and-stitch capture writes the PNG.
          // captureFullPage owns the mkdir + writeFile internally — the CLI does
          // NOT need a parallel mkdir call (unlike the smoke branch which calls
          // page.screenshot({ path: ... }) directly without an orchestrator).
          await captureFullPage(navigatedPage, resolvedOutput);
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
