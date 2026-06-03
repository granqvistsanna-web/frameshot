import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from './config/load.js';
import { resolveTemplate, swapExtension } from './output/template.js';
import { encodeImage } from './capture/stitch.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { launchBrowser } from './browser/launcher.js';
import { navigateToPage } from './browser/navigator.js';
import { installAnimationGuards, runPreparePipeline } from './prepare/index.js';
import { runCapture } from './capture/runCapture.js';
import { makeProgress, printSelectorWarnings, formatError, CliError } from './cli/format.js';
import { startServer } from './server/index.js';
import { runWatch } from './watch/index.js';
import { discoverFromSitemap, formatDiscoveredConfig, SitemapError } from './discover/sitemap.js';

// Module-level spinner reference so index.js's top-level catch can reach it.
// Set to the active spinner at action start; cleared to null on success or
// on the smoke early-return. The catch in index.js calls getCurrentSpinner()
// and guards with spinner.isSpinning before calling .fail() — see
// 06-RESEARCH.md §Pattern 1 §Pitfall 1.
let currentSpinner = null;

export function getCurrentSpinner() { return currentSpinner; }

// CLI numeric-flag helpers. Throw CliError → formatError Guard 6 surface
// (clean `Error: <message>`, no Node stack). The flag name + received value
// already point at the fix; no stack adds value here.
function parseInteger(raw, flagName, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || String(n) !== String(raw).trim()) {
    throw new CliError(`Invalid value for ${flagName}: ${raw}`);
  }
  if (n < min || n > max) {
    throw new CliError(`Value for ${flagName} out of range [${min}, ${max}]: ${raw}`);
  }
  return n;
}

function parseSecondsToMs(raw, flagName) {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new CliError(`Invalid value for ${flagName} (positive number of seconds expected): ${raw}`);
  }
  return Math.round(n * 1000);
}

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
    .option('--concurrency <N>', 'Run N viewports in parallel (default: from config, or 1)')
    .action(async (configArg, opts) => {
      // Step 1 — Load config.
      // Start the spinner BEFORE loadConfig so config errors get the
      // spinner.fail() treatment from index.js's catch (06-RESEARCH §Pattern 1).
      const spinner = (currentSpinner = makeProgress());
      spinner.start('Loading config');
      const config = await loadConfig(configArg);

      // `--concurrency N` overrides config.concurrency (schema default 1).
      // Bounds match the schema (min 1, max 8) so the CLI surface and YAML
      // surface stay congruent — past 8 Chromium memory pressure dominates.
      if (opts.concurrency !== undefined) {
        config.concurrency = parseInteger(opts.concurrency, '--concurrency', { min: 1, max: 8 });
      }

      if (opts.smoke) {
        // SMOKE BRANCH — Phase 3 hermetic-verifiable seam. Kept inline so the
        // verification path stays exactly as commit-locked. Does NOT call
        // runCapture (that does full-page; smoke needs ONE viewport-sized shot
        // to prove viewport × DSR math reached rendering).
        const now = new Date();
        const date = now.toISOString().slice(0, 10);
        const time = now.toISOString().slice(11, 19).replaceAll(':', '-');
        // smoke takes the first viewport AND the first page only — back-compat with v0.1/Phase 7.
        const viewport = config.viewports[0].name;
        const firstPage = config.pages[0];
        const page = firstPage.name;
        const resolvedOutput = swapExtension(
          resolveTemplate(config.output, { date, time, viewport, page }),
          config.format,
        );

        spinner.text = 'Launching Chromium';
        const { browser, context } = await launchBrowser(config, config.viewports[0]);
        try {
          spinner.text = 'Installing animation guards';
          await installAnimationGuards(context, config.prepare);

          spinner.text = `Navigating to ${config.baseUrl}${firstPage.path}`;
          const navigatedPage = await navigateToPage(context, firstPage);

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

          await mkdir(dirname(resolvedOutput), { recursive: true });
          // Smoke shot honors `format`/`quality` so a `format: webp` config
          // produces a .webp smoke file too — keeps the verification surface
          // representative of what runCapture would write.
          const raw = await navigatedPage.screenshot({ fullPage: false, animations: 'disabled', type: 'png' });
          const encoded = await encodeImage(raw, { format: config.format, quality: config.quality });
          await writeFile(resolvedOutput, encoded);
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
      // Multi-page runs (config.pages.length > 1) include the page name in the
      // spinner prefix so the user can see progress across the sitemap. Single-
      // page runs (the common back-compat case) keep the existing `[viewport]
      // label` shape so v0.2 output stays unchanged.
      const multiPage = config.pages.length > 1;
      const scopePrefix = (event) =>
        multiPage ? `[${event.viewport}|${event.page}]` : `[${event.viewport}]`;

      // Spinner UX splits on concurrency. Sequential (=1) keeps the v0.2
      // single-line text-mutating spinner. Parallel (>1) holds the spinner on
      // a stable aggregate line and emits each step event as a dim stderr log
      // line above it (interleaved spinner.text from N viewports would thrash
      // the line unreadably). Frame events are suppressed in parallel mode —
      // a hot Capturing-frame stream from 3 viewports is too noisy for log
      // mode, and the per-viewport summary lines already mark progress.
      const parallel = config.concurrency > 1;
      if (parallel) {
        spinner.text = `Running ${config.viewports.length} viewport(s), up to ${config.concurrency} in parallel`;
      }

      const { results, failures } = await runCapture(config, {
        onProgress: (event) => {
          // page-error: a multi-page (crawl) run skipped one page and kept
          // going. Surface it inline as a warning regardless of parallel mode,
          // then let the run continue — the end-of-run summary lists them all.
          if (event.type === 'page-error') {
            spinner.stop();
            console.error(chalk.yellow(`${scopePrefix(event)} skipped — ${event.message}`));
            spinner.start();
            return;
          }
          if (parallel) {
            if (event.type === 'step') {
              spinner.stop();
              console.error(chalk.dim(`${scopePrefix(event)} ${event.label}`));
              spinner.start();
            } else if (event.type === 'warning' && event.kind === 'hide-missed') {
              spinner.stop();
              printSelectorWarnings({ matched: 0, missed: event.selectors });
              spinner.start();
            }
            return;
          }
          if (event.type === 'step') {
            spinner.text = `${scopePrefix(event)} ${event.label}`;
          } else if (event.type === 'frame') {
            spinner.text = `${scopePrefix(event)} Capturing frame ${event.current}/${event.total}`;
          } else if (event.type === 'warning' && event.kind === 'hide-missed') {
            spinner.stop();
            printSelectorWarnings({ matched: 0, missed: event.selectors });
            spinner.start();
          }
        },
      });

      // A crawl that lost some pages still wrote the rest — succeed with a count
      // that names the skips so the exit isn't silently partial.
      if (failures.length > 0) {
        spinner.warn(`${results.length} screenshot(s) written, ${failures.length} page(s) skipped`);
        for (const f of failures) {
          console.error(chalk.yellow(`  skipped [${f.viewportName}/${f.pageName}]: ${f.message}`));
        }
      } else {
        spinner.succeed(`${results.length} screenshot(s) written`);
      }
      currentSpinner = null;
      // One stdout line per result — pipe-capturable per 06-RESEARCH §Pitfall 6.
      // Label includes page '<name>' when the run spans multiple pages, 'full
      // page' otherwise — distinct tokens so downstream pipe-consumers can
      // grep/match per category.
      for (const r of results) {
        const parts = [];
        if (multiPage) parts.push(`page '${r.pageName}'`);
        if (parts.length === 0) parts.push('full page');
        console.log(`screenshot written (${parts.join(', ')}): ${r.outputPath}`);
      }
    });

  // `watch` — keep the page reloading; we'll re-capture whenever the live
  // URL's HTML hash changes (or unconditionally on a fixed --interval).
  // Useful while iterating on a Framer draft: publish → see capture refresh.
  // Quiet output during idle (no log per poll). Ctrl+C requests a clean stop;
  // a second Ctrl+C forces an immediate exit (Playwright children get cleaned
  // up by the OS at that point).
  program
    .command('watch <config>')
    .description('Re-capture on a debounce when the live URL\'s HTML changes (or on a fixed --interval)')
    .option('--poll <seconds>', 'hash poll cadence (hash mode)', '5')
    .option('--debounce <ms>', 'quiet window after a change before capturing (hash mode)', '1500')
    .option('--interval <seconds>', 'unconditional re-capture cadence — skips hash polling')
    .option('--no-initial', 'skip the capture at startup; wait for the first change')
    .action(async (configArg, opts) => {
      const pollMs = parseSecondsToMs(opts.poll, '--poll');
      const debounceMs = parseInteger(opts.debounce, '--debounce', { min: 0 });
      const intervalMs = opts.interval !== undefined
        ? parseSecondsToMs(opts.interval, '--interval')
        : null;

      const config = await loadConfig(configArg);
      // Watch a single URL — the first page in config.pages. Multi-page watch
      // would multiply hash polls and is out of scope for v0.3; if the user
      // wants per-page watch, run one watch process per config.
      const url = config.baseUrl + config.pages[0].path;

      // SIGINT lets the loop drain cleanly. A second press hard-exits — the
      // capture-in-progress branch is the one place a hung Chromium could
      // strand us, so we offer the escape hatch.
      const ac = new AbortController();
      let interrupted = false;
      const onSigint = () => {
        if (interrupted) {
          // eslint-disable-next-line n/no-process-exit
          process.exit(130);
        }
        interrupted = true;
        ac.abort();
        console.error(chalk.dim('\n[watch] stopping (Ctrl+C again to force quit)…'));
      };
      process.on('SIGINT', onSigint);

      // One persistent spinner across the whole watch session. During captures
      // it shows per-frame progress; during idle it shows "watching".
      const spinner = (currentSpinner = makeProgress());
      const idleText = intervalMs != null
        ? `watching ${url} — re-capture every ${intervalMs / 1000}s`
        : `watching ${url} — poll ${pollMs / 1000}s, debounce ${debounceMs}ms`;
      spinner.start(idleText);

      try {
        await runWatch(config, {
          url,
          pollMs,
          debounceMs,
          intervalMs,
          initialCapture: opts.initial !== false, // commander negates --no-initial → opts.initial=false
          signal: ac.signal,
          onCaptureProgress: (event) => {
            // Watch operates on a single page (cli.js:196 picks pages[0]), so
            // events carry that one page name; collapse to `[viewport]` shape
            // since adding the page name buys nothing on a single-page watch.
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
          onEvent: (ev) => {
            switch (ev.type) {
              case 'watch-start': {
                // Spinner already shows the idle text — keep this quiet.
                break;
              }
              case 'hash-baseline': {
                // Useful debug breadcrumb; render dim and out-of-band so it
                // doesn't compete with the active spinner.
                spinner.stop();
                console.error(chalk.dim(`[watch] baseline hash ${ev.hash.slice(0, 8)}`));
                spinner.start(idleText);
                break;
              }
              case 'change-detected': {
                spinner.stop();
                console.error(chalk.cyan(`[watch] change detected — capturing in ${debounceMs}ms`));
                spinner.start(idleText);
                break;
              }
              case 'capture-start': {
                spinner.text = `[watch] capturing (${ev.trigger.kind})`;
                break;
              }
              case 'capture-done': {
                spinner.stop();
                const ts = new Date().toISOString().slice(11, 19);
                console.error(chalk.green(`[watch ${ts}] captured ${ev.results.length} screenshot(s)`));
                for (const r of ev.results) {
                  console.log(`screenshot written (full page): ${r.outputPath}`);
                }
                spinner.start(idleText);
                break;
              }
              case 'capture-error': {
                spinner.stop();
                console.error(formatError(ev.error));
                spinner.start(idleText);
                break;
              }
              case 'poll-error': {
                spinner.stop();
                console.warn(chalk.yellow(`[watch] poll error: ${ev.error.message}`));
                spinner.start(idleText);
                break;
              }
              case 'poll-unchanged': {
                // Quiet by design — no per-poll output.
                break;
              }
              case 'watch-stop': {
                // Final teardown happens after runWatch returns.
                break;
              }
              default: {
                // Unknown event type — render dim and continue.
                spinner.stop();
                console.error(chalk.dim(`[watch] ${ev.type}`));
                spinner.start(idleText);
              }
            }
          },
        });
      } finally {
        process.off('SIGINT', onSigint);
        spinner.stop();
        currentSpinner = null;
      }
    });

  // `discover` — point at a Framer site, read /sitemap.xml, emit a runnable
  // multipage config. Sister command to `capture` — the typical flow is
  // `framershot discover <baseUrl> -o site.yaml` then `framershot capture site.yaml`.
  // Prints to stdout when -o is omitted, so it composes with shell redirection.
  program
    .command('discover <baseUrl>')
    .description('Fetch /sitemap.xml at the given baseUrl and emit a runnable multipage YAML config')
    .option('-o, --out <path>', 'write the config to this path instead of stdout')
    .option('--max <n>', 'cap discovered pages (default 200)', '200')
    .option('--name <name>', 'config `name` field (defaults to a slug of the hostname)')
    .option('--viewport <WxH>', 'default viewport in the emitted config, e.g. 1440x900 (default 1440x900)', '1440x900')
    .option('--timeout <seconds>', 'per-fetch timeout', '10')
    .action(async (baseUrlArg, opts) => {
      const max = parseInteger(opts.max, '--max', { min: 1, max: 10_000 });
      const timeoutMs = parseSecondsToMs(opts.timeout, '--timeout');
      const viewportMatch = String(opts.viewport).match(/^(\d+)x(\d+)$/);
      if (!viewportMatch) {
        throw new CliError(`Invalid --viewport (expected WxH, e.g. 1440x900): ${opts.viewport}`);
      }
      const viewport = {
        name: 'desktop',
        width: Number.parseInt(viewportMatch[1], 10),
        height: Number.parseInt(viewportMatch[2], 10),
      };

      // Quiet spinner — discover is usually fast (~1 fetch + N child fetches
      // for sitemap indices). The spinner reassures the user that the
      // network call is in flight; succeed-line on completion summarizes.
      const spinner = (currentSpinner = makeProgress());
      spinner.start(`Fetching ${baseUrlArg}/sitemap.xml`);

      let discovery;
      try {
        discovery = await discoverFromSitemap(baseUrlArg, { maxPages: max, timeoutMs });
      } catch (err) {
        // SitemapError already carries the URL/origin in the message; the
        // default formatError branch would print "Unexpected error: ..." with
        // a stack. Translate to a cleaner surface here.
        if (err instanceof SitemapError) {
          spinner.fail(err.message);
          currentSpinner = null;
          process.exitCode = 1;
          return;
        }
        throw err;
      }

      const yamlText = formatDiscoveredConfig(discovery, { name: opts.name, viewport });

      if (opts.out) {
        const absOut = resolve(process.cwd(), opts.out);
        await mkdir(dirname(absOut), { recursive: true });
        await writeFile(absOut, yamlText, 'utf8');
        spinner.succeed(`${discovery.discovered} page(s) discovered → ${absOut}`);
        currentSpinner = null;
        console.log(absOut);
      } else {
        // Stdout mode — stop the spinner BEFORE writing so spinner repaint
        // doesn't interleave with YAML lines (06-RESEARCH §Pitfall 2 in a
        // different shape).
        spinner.succeed(`${discovery.discovered} page(s) discovered`);
        currentSpinner = null;
        process.stdout.write(yamlText);
      }

      if (discovery.truncated) {
        console.error(chalk.yellow(`⚠ truncated at --max=${max}. Raise --max to capture more pages.`));
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
        throw new CliError(`Invalid port: ${opts.port}`);
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
        throw new CliError(`Invalid port: ${opts.port}`);
      }
      await startServer({ port, open: true });
    });

  return program;
}
