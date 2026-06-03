// src/server/index.js
// Tiny localhost HTTP server that wraps runCapture in a browser UI. Bare
// node:http — no Express/Fastify deps, since the surface is three routes.
//
// Routes:
//   GET  /                       → HTML UI (src/server/ui.js)
//   POST /api/capture            → text/event-stream of progress events
//   GET  /screenshots/<path>     → static file under CWD/screenshots
//
// Hard rules:
//   - Bind to 127.0.0.1 only (never 0.0.0.0). This is a local personal tool;
//     no auth, must not be reachable from the LAN.
//   - /screenshots/* must stay sandboxed under CWD/screenshots (path traversal).
//   - SSE: write events as they happen; flush on each line.

import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, join, normalize, extname, basename, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';
import { configSchema, zipRequestSchema } from '../config/schema.js';
import { runCapture } from '../capture/runCapture.js';
import { renderUi } from './ui.js';
import { ConfigError } from '../config/load.js';
import { BrowserError, launchBrowser } from '../browser/launcher.js';
import { navigateToPage } from '../browser/navigator.js';
import { installAnimationGuards, runPreparePipeline } from '../prepare/index.js';
import { captureFrames } from '../capture/frames.js';
import { stitchFrames } from '../capture/stitch.js';
import { discoverFromSitemap, SitemapError } from '../discover/sitemap.js';

const SCREENSHOT_ROOT = resolve(process.cwd(), 'screenshots');
// Top-level await — resolves at module load, before any HTTP request can land.
// Cached for the process lifetime; do NOT inline as a per-request lookup.
const PKG_VERSION = await readPkgVersion();
// Hard cap on POST body size — well above any legitimate framershot payload
// (a 200-path zip request with 2 KB paths each is < 500 KB) and stops a
// hostile/malformed POST from buffering unbounded bytes before JSON.parse.
const MAX_BODY_BYTES = 5 * 1024 * 1024;

async function readPkgVersion() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = resolve(here, '../../package.json');
    const raw = await readFile(pkgPath, 'utf8');
    return JSON.parse(raw).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * Start the local UI server on 127.0.0.1:<port>.
 * @param {object} opts
 * @param {number} opts.port
 * @param {boolean} [opts.open] — open default browser after listen
 */
export async function startServer({ port, open = false }) {
  const server = http.createServer((req, res) => handleRequest(req, res));

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  const url = `http://localhost:${port}`;
  console.log(`framershot UI ready at ${url}`);
  console.log('press Ctrl+C to stop');

  if (open) {
    const { spawn } = await import('node:child_process');
    const cmd = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start'
      : 'xdg-open';
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
  }

  // Block forever — Ctrl+C is the kill path.
  await new Promise(() => {});
}

// Reject POSTs whose Origin header doesn't match a localhost source. Defends
// against drive-by CSRF and DNS rebinding from a malicious site (which would
// send its own Origin like https://evil.com even after rebinding 127.0.0.1).
// Missing Origin (curl, native scripts) is allowed — reaching 127.0.0.1
// already implies the caller shares the host.
function isOriginAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

// Stream and JSON-parse a POST body with a hard size cap. Returns the parsed
// object on success, or null after writing an error response (so callers just
// `return` early). Replaces the per-handler `for await ... JSON.parse` blocks
// that buffered unbounded bytes.
async function readJsonBody(req, res) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      res.writeHead(413, { 'content-type': 'text/plain' });
      res.end('body too large');
      return null;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch (err) {
    // Surface the parser's position/token message — "Unexpected token } in JSON
    // at position 142" is exactly the diagnostic a UI client needs to fix the
    // payload. Bare "invalid JSON body" left the developer guessing.
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end(`invalid JSON body: ${err?.message ?? 'parse failed'}`);
    return null;
  }
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'POST' && !isOriginAllowed(req)) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('forbidden origin');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/') {
      const html = renderUi({ version: PKG_VERSION });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/capture') {
      await handleCapture(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/preview') {
      await handlePreview(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/reveal') {
      await handleReveal(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/zip') {
      await handleZip(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/discover') {
      await handleDiscover(req, res);
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/screenshots/')) {
      await handleStaticScreenshot(url.pathname, res);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'text/plain' });
    }
    res.end(`server error: ${err.message ?? String(err)}`);
  }
}

async function handleCapture(req, res) {
  const body = await readJsonBody(req, res);
  if (body === null) return;

  // Build a config object from form input. We force a deterministic output
  // template so the server knows where the file will land and can serve it
  // back to the browser. Flat layout — one folder per date, self-describing
  // filename.
  const output = './screenshots/{date}/{page}-{viewport}-{time}.png';

  // Accept both shapes: the new UI sends `viewports: [...]` (plural); legacy
  // clients still send `viewport: {...}` (singular). The schema's mutual-
  // exclusivity gate would reject "both" or "neither", so we forward exactly
  // one — preferring plural when present.
  const hasViewports = Array.isArray(body.viewports) && body.viewports.length > 0;
  // Same posture for page/pages: the new crawl flow sends `pages: [...]` (one
  // entry per discovered route); the single-page form sends `page: {...}`. The
  // schema's mutual-exclusivity gate rejects "both", so forward exactly one,
  // preferring plural when the client included a non-empty list.
  const hasPages = Array.isArray(body.pages) && body.pages.length > 0;
  const candidate = {
    name: body.name || 'ui-capture',
    baseUrl: body.baseUrl,
    output,
    deviceScaleFactor: body.deviceScaleFactor ?? 2,
    ...(hasViewports ? { viewports: body.viewports } : { viewport: body.viewport }),
    ...(hasPages ? { pages: body.pages } : { page: body.page }),
    prepare: body.prepare ?? {},
    // Only spread format/quality/concurrency when present so schema defaults
    // (png/85/1) apply for older clients that don't send them.
    ...(body.format !== undefined ? { format: body.format } : {}),
    ...(body.quality !== undefined ? { quality: body.quality } : {}),
    ...(body.concurrency !== undefined ? { concurrency: body.concurrency } : {}),
    ...(body.backdrop !== undefined ? { backdrop: body.backdrop } : {}),
  };

  const parsed = configSchema.safeParse(candidate);
  if (!parsed.success) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Invalid config',
      issues: parsed.error.issues.map((i) => ({
        field: i.path.join('.') || '<root>',
        message: i.message,
      })),
    }));
    return;
  }

  // Open SSE stream
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    'connection': 'keep-alive',
    'x-accel-buffering': 'no',
  });
  // Flush headers immediately
  res.flushHeaders?.();

  // Client-disconnect handling. The browser may close the EventSource mid-run
  // (tab close, page reload, navigation). Without this guard the next res.write
  // throws ERR_STREAM_DESTROYED inside onProgress, which propagates out of the
  // capture pipeline as a non-actionable error AND triggers a cascading throw
  // in the catch block's send({ type: 'error', … }) on the already-destroyed
  // stream. Worse: the worker pool keeps spawning viewports for the run
  // nobody's watching.
  //
  // Strategy: tag a CLIENT_ABORTED throw and let it propagate. Each worker's
  // next onProgress call rethrows it, runViewport's finally closes the browser,
  // and runCapture's catch surfaces it as firstError. The catch below detects
  // CLIENT_ABORTED and skips the SSE error frame (the client is gone). Net
  // effect: in-flight viewports finish their current frame, then all workers
  // exit cleanly, browsers close, no wasted work past the next progress event.
  let aborted = false;
  req.on('close', () => { aborted = true; });
  const send = (event) => {
    if (aborted) {
      const err = new Error('client disconnected');
      err.code = 'CLIENT_ABORTED';
      throw err;
    }
    if (res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      aborted = true;
      const err = new Error('client disconnected');
      err.code = 'CLIENT_ABORTED';
      throw err;
    }
  };

  // Cache the most recent `step` event so a thrown error can be reported with
  // its surrounding context (viewport / page / step label). Without this, the
  // SSE error event collapses every failure to a bare message and the user
  // loses which viewport/page it happened on.
  let lastStep = null;
  try {
    const results = await runCapture(parsed.data, {
      onProgress: (event) => {
        if (event.type === 'step') lastStep = event;
        send(event);
      },
    });
    send({
      type: 'done',
      outputs: results.map(({ outputPath, viewportName, pageName, kind }) => ({
        outputPath,
        urlPath: outputPathToUrl(outputPath),
        viewportName,
        // pageName lets the gallery label tiles per route in multi-page (crawl)
        // runs, where one viewport repeats across every discovered page.
        ...(pageName ? { pageName } : {}),
        // `kind` is 'fullPage' | 'pin' — the UI uses it to pick a backdrop
        // image for the pin-offset preview without resorting to slug-suffix
        // matching on viewportName (which would misfire on custom viewport
        // names that happen to end with a chip slug).
        ...(kind ? { kind } : {}),
      })),
    });
  } catch (err) {
    if (err?.code === 'CLIENT_ABORTED') {
      // Client is gone — don't try to send an error frame (would throw on the
      // destroyed stream). The capture pipeline has already torn down its
      // browser/contexts via the workers' finally blocks.
      return;
    }
    // Prefer the error's own attached scope (runCapture tags thrown errors
    // with viewportName/pageName at the per-page try/catch) over lastStep —
    // under concurrency > 1 the most recent step event can come from a
    // different worker than the one that failed.
    const errScope = (err && (err.viewportName || err.pageName))
      ? {
          viewport: err.viewportName,
          page: err.pageName,
        }
      : null;
    const context = errScope
      ?? (lastStep
        ? { viewport: lastStep.viewport, page: lastStep.page, step: lastStep.label }
        : null);
    try {
      send({
        type: 'error',
        message: errorToMessage(err),
        ...(context ? { context } : {}),
      });
    } catch {
      // Stream destroyed between abort detection and write — already aborted.
    }
  } finally {
    try { res.end(); } catch {}
  }
}

// In-memory preview cache. Keyed by `${url}|${width}x${height}`. Stores either
// a resolved Buffer (with timestamp for TTL eviction) or an in-flight Promise
// to de-dupe overlapping requests for the same key. Capped at 16 entries —
// well above the few-URLs/few-viewports a single session realistically uses,
// and a hostile request can't grow it unboundedly. 5-minute TTL keeps memory
// bounded across long-lived sessions while making "open modal, tweak, reopen"
// instant. Buffers are ~1–3 MB each at DSR=1, so 16 × 3 MB = 48 MB worst case.
const PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000;
const PREVIEW_CACHE_MAX = 16;
const previewCache = new Map();

function previewCacheGet(key) {
  const entry = previewCache.get(key);
  if (!entry) return null;
  if (entry.promise) return entry.promise;
  if (Date.now() - entry.ts > PREVIEW_CACHE_TTL_MS) {
    previewCache.delete(key);
    return null;
  }
  return entry.buffer;
}

function previewCacheSetPromise(key, promise) {
  previewCache.set(key, { promise });
}

function previewCacheSetBuffer(key, buffer) {
  // Evict the oldest entry when at cap (Map preserves insertion order).
  while (previewCache.size >= PREVIEW_CACHE_MAX) {
    const oldestKey = previewCache.keys().next().value;
    previewCache.delete(oldestKey);
  }
  previewCache.set(key, { buffer, ts: Date.now() });
}

// Render a single full-page PNG at DSR=1 using the same browser + prepare
// pipeline the real capture uses. We use captureFrames + stitchFrames (not
// page.screenshot({ fullPage: true })) so the preview's pixel geometry matches
// the final capture exactly — sticky-nav handling, fixed-element hiding, and
// scroll-stitch behavior are all identical. DSR=1 keeps the preview small
// (1 image-px ≈ 1 CSS-px) which simplifies the modal's overlay math.
async function renderPreview({ url, width, height }) {
  // The capture pipeline expects a config-shaped object with baseUrl + viewport
  // + prepare. Build the minimal shape inline — no schema parse needed since
  // these values came from a validated /api/preview body already.
  const config = {
    baseUrl: url,
    deviceScaleFactor: 1,
    prepare: {
      animations: true,
      hide: [],
      scrollPrime: true,
      extraDelay: 0,
      frameDelay: 0,
      hideSticky: true,
      hideFramerBadge: true,
    },
  };
  const viewport = { width, height, name: 'preview' };

  const { browser, context } = await launchBrowser(config, viewport);
  try {
    await installAnimationGuards(context, config.prepare);
    const page = await navigateToPage(context, { path: '/', name: 'preview' });
    await runPreparePipeline(page, config.prepare);
    const { frames, geometry } = await captureFrames(page, {
      hideStickyAfterFirstFrame: config.prepare.hideSticky,
      frameDelay: 0,
    });
    const buffer = await stitchFrames(frames, geometry, { format: 'png' });
    return buffer;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function handlePreview(req, res) {
  const body = await readJsonBody(req, res);
  if (body === null) return;

  // Input validation. Inline rather than zod-schema since the surface is tiny
  // and the error messages need to be UI-friendly.
  const rawUrl = String(body.url || '').trim();
  const width = Number(body.viewport?.width);
  const height = Number(body.viewport?.height);

  const errors = [];
  let urlObj = null;
  try {
    urlObj = new URL(rawUrl);
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      errors.push('url must use http or https');
    }
  } catch {
    errors.push('url must be a valid http/https URL');
  }
  if (!Number.isInteger(width) || width < 320 || width > 3840) {
    errors.push('viewport.width must be an integer 320..3840');
  }
  if (!Number.isInteger(height) || height < 200 || height > 10000) {
    errors.push('viewport.height must be an integer 200..10000');
  }
  if (errors.length > 0) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid preview request', issues: errors }));
    return;
  }

  // Normalize the cache key off the parsed URL so trivial variants (trailing
  // slash, fragment) hit the same cache entry. Query is preserved — Framer
  // pages can render differently based on query params.
  const cacheKey = `${urlObj.origin}${urlObj.pathname}${urlObj.search}|${width}x${height}`;

  const cached = previewCacheGet(cacheKey);
  let buffer;
  if (cached instanceof Promise) {
    buffer = await cached;
  } else if (cached) {
    buffer = cached;
  } else {
    const promise = renderPreview({ url: urlObj.toString(), width, height });
    previewCacheSetPromise(cacheKey, promise);
    try {
      buffer = await promise;
      previewCacheSetBuffer(cacheKey, buffer);
    } catch (err) {
      previewCache.delete(cacheKey);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Preview failed', message: errorToMessage(err) }));
      return;
    }
  }

  res.writeHead(200, {
    'content-type': 'image/png',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(buffer);
}

function outputPathToUrl(outputPath) {
  // outputPath is like "./screenshots/2026-05-25/home-desktop-11-56-09.png" or
  // "screenshots/.../home-desktop-11-56-09.png". Strip leading "./" if present,
  // ensure a leading "/".
  const cleaned = outputPath.replace(/^\.\//, '');
  return `/${cleaned}`;
}

function errorToMessage(err) {
  if (err instanceof ConfigError) return `Config: ${err.message}`;
  if (err instanceof BrowserError) {
    const causeHint = err.cause?.name === 'TimeoutError' ? ' (timed out)' : '';
    return `Browser: ${err.message}${causeHint}`;
  }
  if (err?.name === 'TimeoutError') return `Operation timed out — ${err.message}`;
  return err?.message ?? String(err);
}

// Resolve one user-supplied path string under SCREENSHOT_ROOT. Returns either
// { absPath } on success or { error: { status, message } } on rejection. Shared
// by handleReveal, handleZip, and handleStaticScreenshot so the path-traversal
// guard is one rule, not three.
//
// Two layers of defense:
//   1. Lexical: normalize(join(...)) collapses `..`, then startsWith verifies
//      the result stays under SCREENSHOT_ROOT. Cheap; blocks the obvious
//      "../../etc/passwd" path.
//   2. realpath: resolves symlinks so a `screenshots/leak` → `/etc/passwd`
//      symlink can't bypass the lexical check. ENOENT (file doesn't exist)
//      surfaces as 404; symlink escape surfaces as 403. The screenshots dir
//      itself may legitimately be a symlink (user choice), so we compare
//      against realpath(SCREENSHOT_ROOT) — falling back to the lexical value
//      when the dir doesn't exist yet (no captures recorded).
async function resolveScreenshotPath(input) {
  const raw = String(input || '').replace(/^\.\//, '').replace(/^\//, '');
  if (!raw.startsWith('screenshots/')) {
    return { error: { status: 400, message: `path must be under screenshots/: ${input}` } };
  }
  const rel = raw.slice('screenshots/'.length);
  const absPath = normalize(join(SCREENSHOT_ROOT, rel));
  if (!absPath.startsWith(SCREENSHOT_ROOT + sep) && absPath !== SCREENSHOT_ROOT) {
    return { error: { status: 403, message: `forbidden: ${input}` } };
  }
  let realPath;
  try {
    realPath = await realpath(absPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { error: { status: 404, message: `not found: ${input}` } };
    }
    throw err;
  }
  const realRoot = await realpath(SCREENSHOT_ROOT).catch(() => SCREENSHOT_ROOT);
  if (!realPath.startsWith(realRoot + sep) && realPath !== realRoot) {
    return { error: { status: 403, message: `forbidden: ${input}` } };
  }
  return { absPath: realPath };
}

async function handleReveal(req, res) {
  const body = await readJsonBody(req, res);
  if (body === null) return;

  if (process.platform !== 'darwin') {
    res.writeHead(501, { 'content-type': 'text/plain' });
    res.end('reveal in Finder is macOS-only');
    return;
  }

  // resolveScreenshotPath now does the realpath + existence check, so the
  // separate access() probe below is no longer needed.
  const { absPath, error } = await resolveScreenshotPath(body.path);
  if (error) {
    res.writeHead(error.status, { 'content-type': 'text/plain' });
    res.end(error.message);
    return;
  }

  const { spawn } = await import('node:child_process');
  spawn('open', ['-R', absPath], { stdio: 'ignore', detached: true }).unref();
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

// POST /api/discover — read the site's sitemap.xml and return its routes so the
// UI can offer "capture every page". Pure read of a public sitemap; no browser,
// no disk write. Returns the same { path, name } shape the capture form submits
// as `pages: [...]`, so the client can forward the selection verbatim.
async function handleDiscover(req, res) {
  const body = await readJsonBody(req, res);
  if (body === null) return;

  const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
  if (!baseUrl) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('baseUrl is required');
    return;
  }

  // Restrict to http/https before fetching. The capture path enforces this via
  // the config schema's .refine; discover fetches the URL directly, so without
  // this gate a request could point the server at file:, data:, or an internal
  // host (a small SSRF surface). Mirrors baseUrl validation in schema.js.
  let scheme;
  try {
    scheme = new URL(baseUrl).protocol;
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end(`Invalid baseUrl: ${baseUrl}`);
    return;
  }
  if (scheme !== 'http:' && scheme !== 'https:') {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('baseUrl must use http or https');
    return;
  }

  try {
    const result = await discoverFromSitemap(baseUrl);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      pages: result.pages,
      discovered: result.discovered,
      truncated: result.truncated,
      sourceUrl: result.sourceUrl,
    }));
  } catch (err) {
    // SitemapError carries a user-facing message (no sitemap, empty, network
    // failure, off-origin). Anything else is unexpected — surface as 500.
    const status = err instanceof SitemapError ? 422 : 500;
    res.writeHead(status, { 'content-type': 'text/plain' });
    res.end(err?.message ?? String(err));
  }
}

async function handleZip(req, res) {
  const body = await readJsonBody(req, res);
  if (body === null) return;

  const parsed = zipRequestSchema.safeParse(body);
  if (!parsed.success) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Invalid zip request',
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    }));
    return;
  }

  // Resolve + verify every path BEFORE we start streaming the zip. Once
  // archiver.pipe(res) is wired the headers are committed; mid-stream rejection
  // would leave the client with a half-zip and no error surface.
  const resolved = [];
  for (const p of parsed.data.paths) {
    // resolveScreenshotPath now does the realpath + existence check, so the
    // separate access() probe below is no longer needed.
    const { absPath, error } = await resolveScreenshotPath(p);
    if (error) {
      res.writeHead(error.status, { 'content-type': 'text/plain' });
      res.end(error.message);
      return;
    }
    resolved.push(absPath);
  }

  // Default filename uses the same HH-MM-SS shape the capture pipeline already
  // uses, so a zip "looks like" the run that produced it.
  const safeName = parsed.data.filename
    ? parsed.data.filename.replace(/[^a-zA-Z0-9._-]/g, '-')
    : `framershot-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.zip`;

  res.writeHead(200, {
    'content-type': 'application/zip',
    'content-disposition': `attachment; filename="${safeName}"`,
    'cache-control': 'no-store',
  });

  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on('error', (err) => {
    // Headers are already out — best we can do is destroy the response so the
    // client sees a truncated download instead of a silent "success".
    res.destroy(err);
  });
  archive.pipe(res);

  // Flat layout — basenames are already self-describing
  // (`home-hero-desktop-11-56-09.png`). Collisions are theoretically possible
  // if a single zip mixes runs from the same second; archiver lets duplicates
  // through, which is acceptable for this tool.
  for (const absPath of resolved) {
    archive.file(absPath, { name: basename(absPath) });
  }
  await archive.finalize();
}

async function handleStaticScreenshot(pathname, res) {
  // /screenshots/foo/bar.png → CWD/screenshots/foo/bar.png
  // Strip leading "/screenshots/" then route through the shared resolver so the
  // lexical-and-realpath guard is identical across reveal/zip/static.
  const rel = decodeURIComponent(pathname.replace(/^\/screenshots\/?/, ''));
  const { absPath, error } = await resolveScreenshotPath('screenshots/' + rel);
  if (error) {
    res.writeHead(error.status, { 'content-type': 'text/plain' });
    res.end(error.status === 404 ? 'not found' : error.message);
    return;
  }

  let data;
  try {
    data = await readFile(absPath);
  } catch (err) {
    // EISDIR survives the realpath check (directories resolve fine); surface
    // as 404 to match the previous behavior for /screenshots/<dir>/ requests.
    if (err.code === 'ENOENT' || err.code === 'EISDIR') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    throw err;
  }

  const mime = MIME[extname(absPath).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': mime,
    'cache-control': 'no-cache',
    // Prevent the browser from MIME-sniffing image bytes as text/html — belt-and-
    // braces given the file extension already determined content-type.
    'x-content-type-options': 'nosniff',
  });
  res.end(data);
}
