// src/cli/format.js
// Phase 6 (CLI-02 + CLI-03) — CLI-only presentation helpers. Library modules under
// src/{browser,prepare,capture}/ MUST NOT import from this file. Owned by Phase 6
// plan 06-01 (makeProgress, printSelectorWarnings) and plan 06-02 (formatError, appended).

import ora from 'ora';
import chalk from 'chalk';
import { ConfigError } from '../config/load.js';
import { BrowserError } from '../browser/launcher.js';
import { RegionError } from '../capture/region.js';

/**
 * Named Error subclass for CLI-input failures (invalid flag value, bad port,
 * malformed --viewport, etc.). Routed through formatError's Guard 6 so the
 * user gets a clean `Error: <message>` surface without a Node stack trace —
 * same shape as ConfigError/BrowserError/RegionError. Live in src/cli/ since
 * these errors only originate from CLI flag parsing.
 */
export class CliError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'CliError';
    if (cause) this.cause = cause;
  }
}

/**
 * Create a spinner configured for framershot's capture flow.
 *
 * - Writes to stderr (ora default; set explicitly for self-documentation) so
 *   stdout stays clean for the final result line.
 * - Cyan spinner color (ora default; set explicitly).
 * - Auto-disables in non-TTY contexts (CI, piped output) via ora's is-interactive
 *   check (node_modules/is-interactive/index.js: requires stream.isTTY && !CI env
 *   var && TERM !== 'dumb'). No manual TTY guard needed in src/cli.js.
 * - Text intentionally omitted — caller sets it via spinner.start('...').
 *
 * Called by: src/cli.js capture action body (Step 1 of 7 step boundaries).
 * See 06-RESEARCH.md §Pattern 1.
 *
 * @returns {import('ora').Ora}
 */
export function makeProgress() {
  return ora({
    color: 'cyan',            // explicit; matches ora default — cyan for framershot steps
    stream: process.stderr,   // explicit; matches ora default — leaves stdout for final result line
    // text intentionally omitted — caller sets via spinner.start('...')
  });
}

/**
 * Print a yellow warning line per missed hide selector to stderr. Does NOT throw,
 * does NOT exit — Phase 4's hideSelectors returns missed selectors as data precisely
 * because they are non-fatal. SC #4 ("missing-selector warnings print but capture
 * continues") is satisfied by the fact that this function is called BETWEEN steps
 * in src/cli.js, not in any error path.
 *
 * Iterates hideSummary.missed — the canonical list of zero-match + invalid-CSS
 * selectors returned by runPreparePipeline (src/prepare/hide.js:55-83, verified).
 * The WHOLE line is chalk.yellow (not just the ⚠ prefix) — yellow = non-fatal
 * but worth attention, per 06-RESEARCH.md §Claude's Discretion color palette.
 *
 * Output goes to stderr via console.warn (not console.error, not process.stderr.write;
 * console.warn maps to stderr in Node 20+ and adds the trailing newline).
 *
 * Called by: src/cli.js after runPreparePipeline returns, inside a spinner.stop() /
 * printSelectorWarnings / spinner.start() sandwich to prevent repaint collision
 * (06-RESEARCH.md §Pitfall 2).
 *
 * @param {{ matched: number, missed: string[] }} hideSummary — from runPreparePipeline
 */
export function printSelectorWarnings(hideSummary) {
  for (const sel of hideSummary.missed) {
    console.warn(chalk.yellow(`⚠ hide selector "${sel}" matched 0 elements (or invalid CSS) — skipped`));
  }
}

/**
 * Format any thrown value into a user-facing error string for `console.error`.
 *
 * Dispatch order (06-RESEARCH.md §Pattern 3):
 *
 *   1. Non-Error throws (defensive guard, §Pitfall 5) — string/null/object →
 *      "Unexpected error: <String(thrown)>" with red prefix.
 *
 *   2. ConfigError (Phase 2) — already-formatted multi-line message from
 *      formatZodError is embedded in err.message. Only color the prefix (§Pitfall 3).
 *      Returns: chalk.red('Error:') + ' ' + err.message
 *
 *   3. BrowserError (Phase 3) — URL is already embedded in err.message (§A6).
 *      If err.cause?.name === 'TimeoutError', appends a dim "(timed out)" hint.
 *      Returns: chalk.red('Error:') + ' ' + err.message [+ dim hint]
 *
 *   4. RegionError (Phase 8) — message already actionable (region name embedded,
 *      and unknown --only lists declared region names). Same shape as Guard 2.
 *      Returns: chalk.red('Error:') + ' ' + err.message
 *
 *   5. Bare TimeoutError (Playwright timeout that escaped its origin layer) —
 *      Returns: chalk.red('Error:') + ' Operation timed out — ' + err.message
 *
 *   6. Default (unexpected/programming errors) — headline + dim stack body.
 *      Stack first line duplicates "ErrorType: message", so strip it (slice(1)).
 *      Returns multi-line string: headline \n chalk.dim(stackBody)
 *
 * CONTRACT:
 *   - PURE function — no I/O, no console.*, no process.exit.
 *   - Returns a string; caller (index.js) does `console.error(formatError(err))`.
 *   - Single sink: only index.js's top-level catch calls this (§Pattern 3).
 *   - Do NOT chalk the body of ConfigError/BrowserError messages (§Pitfall 3).
 *   - Do NOT print stack traces for ConfigError or BrowserError — those are
 *     expected/actionable errors; stack adds noise.
 *
 * @param {unknown} err — the caught value from the top-level catch
 * @returns {string}
 */
export function formatError(err) {
  // Guard 1: non-Error throws (string, null, plain object, etc.)
  if (!(err instanceof Error)) {
    return chalk.red('Unexpected error: ') + String(err);
  }

  // Guard 2: ConfigError — message already formatted by formatZodError inside loadConfig.
  // Only red the 'Error:' prefix; body stays default color (§Pitfall 3).
  if (err instanceof ConfigError) {
    return `${chalk.red('Error:')} ${err.message}`;
  }

  // Guard 3: BrowserError — URL is already embedded in err.message (§A6).
  // Append a dim "(timed out)" hint if the cause is a TimeoutError.
  if (err instanceof BrowserError) {
    const base = `${chalk.red('Error:')} ${err.message}`;
    if (err.cause?.name === 'TimeoutError') {
      return `${base}\n  ${chalk.dim('(timed out)')}`;
    }
    return base;
  }

  // Guard 4: RegionError — element missing, anchor missing, unknown --only
  // name, or --smoke/--only mutex violation. Message is already actionable
  // (region name embedded; unknown-only lists declared region names). Same
  // shape as Guard 2 (ConfigError): chalk only the prefix, no stack trace,
  // no dim hint. (08-PATTERNS §"Error Dispatcher Branch")
  if (err instanceof RegionError) {
    return `${chalk.red('Error:')} ${err.message}`;
  }

  // Guard 5: bare TimeoutError (escaped from a non-navigator layer, e.g. Phase 5 screenshot timeout).
  if (err.name === 'TimeoutError') {
    return `${chalk.red('Error:')} Operation timed out — ${err.message}`;
  }

  // Guard 6: CliError — flag-value validation failure (invalid --port, bad
  // --viewport WxH, non-numeric --poll). Message already names the flag and
  // received value; same surface as Guards 2/4 — clean prefix, no stack.
  if (err instanceof CliError) {
    return `${chalk.red('Error:')} ${err.message}`;
  }

  // Default: unexpected/programming error. Print headline + dim stack body.
  const headline = `${chalk.red('Unexpected error:')} ${err.message}`;
  if (err.stack) {
    const stackBody = err.stack.split('\n').slice(1).join('\n');
    return `${headline}\n${chalk.dim(stackBody)}`;
  }
  return headline;
}
