import { Command } from 'commander';
import { loadConfig } from './config/load.js';
import { resolveTemplate } from './output/template.js';
import { launchBrowser } from './browser/launcher.js';
import { navigateToPage } from './browser/navigator.js';

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
        const navigatedPage = await navigateToPage(context, config.page);
        if (opts.smoke) {
          // Phase 3 hermetic-verifiable seam: ONE viewport-sized screenshot
          // proves viewport × DSR math reached the rendering pipeline
          // (CAP-01 + CAP-02 + CAP-03). CAP-04 is exercised by the same
          // navigator code path but proven by the live-site manual gate.
          // fullPage is INTENTIONALLY false — full-page is Phase 5.
          const { mkdir } = await import('node:fs/promises');
          const { dirname } = await import('node:path');
          await mkdir(dirname(resolvedOutput), { recursive: true });
          await navigatedPage.screenshot({ path: resolvedOutput, fullPage: false });
          console.log(`smoke screenshot written: ${resolvedOutput}`);
        } else {
          // Phase 3 boundary: Phase 4 (prepare) and Phase 5 (capture loop)
          // will replace this branch. For now, confirm the page is up.
          console.log(
            JSON.stringify(
              {
                ...config,
                _resolvedOutput: resolvedOutput,
                _navigated: navigatedPage.url(),
              },
              null,
              2,
            ),
          );
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
