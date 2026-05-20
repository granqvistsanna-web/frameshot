// src/browser/launcher.js
// Wave 1 of Phase 3: headless Chromium launcher + browser context creation.
// Exports: launchBrowser(config) and BrowserError.
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors throw BrowserError; the caller (src/cli.js, wired
// in 03-02) owns presentation, the try/finally lifecycle, and exit codes.
//
// Import shape locked by Phase 1 commit 95a1c70: the default export of
// playwright-chromium is the module namespace object — `chromium.launch is not
// a function` if you use the default. Use the named { chromium } import.
import { chromium } from 'playwright-chromium';

/**
 * Named Error subclass for browser-layer failures (Chromium launch errors).
 * Mirrors Phase 2's ConfigError pattern so the top-level catch in src/cli.js
 * can distinguish browser failures from config failures for Phase 6's error
 * formatting work. The original Playwright error is preserved on `.cause` for
 * debugging while the `.message` stays clean for end-user display.
 */
export class BrowserError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'BrowserError';
    if (cause) this.cause = cause;
  }
}

/**
 * Launch headless Chromium and create a context configured for the v0.1
 * single-viewport/single-page model.
 *
 * The returned context already has viewport.{width,height}, deviceScaleFactor,
 * and baseURL applied — downstream `page.goto(path)` resolves against baseURL
 * and rendering happens at the configured CSS pixel size scaled by DSR.
 *
 * LIFECYCLE CONTRACT — the caller MUST close `context` BEFORE `browser` in a
 * try/finally:
 *
 *     const { browser, context } = await launchBrowser(config);
 *     try {
 *       // ... use context ...
 *     } finally {
 *       await context.close();
 *       await browser.close();
 *     }
 *
 * Reversed order leaks memory: Playwright issue #6319 documents a ~22% RAM
 * reduction when context.close() runs before browser.close().
 *
 * @param {object} config - the validated config from Phase 2's loadConfig
 * @returns {Promise<{
 *   browser: import('playwright-chromium').Browser,
 *   context: import('playwright-chromium').BrowserContext
 * }>}
 * @throws {BrowserError} if Chromium fails to launch (e.g. binary missing)
 */
export async function launchBrowser(config) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    throw new BrowserError(
      `Failed to launch Chromium. Is the Playwright browser binary installed at ~/Library/Caches/ms-playwright/chromium-1223/? ` +
        `Original error: ${err.message}`,
      { cause: err },
    );
  }

  const context = await browser.newContext({
    viewport: {
      width: config.viewport.width,
      height: config.viewport.height,
    },
    deviceScaleFactor: config.deviceScaleFactor,
    baseURL: config.baseUrl,
  });

  return { browser, context };
}
