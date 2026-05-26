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
import { readFile, access } from 'node:fs/promises';
import { resolve, join, normalize, extname, basename, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';
import { configSchema, zipRequestSchema } from '../config/schema.js';
import { runCapture } from '../capture/runCapture.js';
import { renderUi } from './ui.js';
import { ConfigError } from '../config/load.js';
import { BrowserError } from '../browser/launcher.js';

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

    if (req.method === 'POST' && url.pathname === '/api/reveal') {
      await handleReveal(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/zip') {
      await handleZip(req, res);
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
  // filename. With regions declared the schema (config/schema.js §root-
  // superRefine) requires {region} in the template; runCapture substitutes
  // {region} → 'full' for the full-page sibling so it lands alongside the
  // per-region files with a readable name.
  const hasRegions = Array.isArray(body.regions) && body.regions.length > 0;
  const output = hasRegions
    ? './screenshots/{date}/{page}-{region}-{viewport}-{time}.png'
    : './screenshots/{date}/{page}-{viewport}-{time}.png';

  // Accept both shapes: the new UI sends `viewports: [...]` (plural); legacy
  // clients still send `viewport: {...}` (singular). The schema's mutual-
  // exclusivity gate would reject "both" or "neither", so we forward exactly
  // one — preferring plural when present.
  const hasViewports = Array.isArray(body.viewports) && body.viewports.length > 0;
  const candidate = {
    name: body.name || 'ui-capture',
    baseUrl: body.baseUrl,
    output,
    deviceScaleFactor: body.deviceScaleFactor ?? 2,
    ...(hasViewports ? { viewports: body.viewports } : { viewport: body.viewport }),
    page: body.page,
    prepare: body.prepare ?? {},
    // Only spread format/quality/concurrency when present so schema defaults
    // (png/85/1) apply for older clients that don't send them.
    ...(body.format !== undefined ? { format: body.format } : {}),
    ...(body.quality !== undefined ? { quality: body.quality } : {}),
    ...(body.concurrency !== undefined ? { concurrency: body.concurrency } : {}),
    ...(body.backdrop !== undefined ? { backdrop: body.backdrop } : {}),
    ...(hasRegions ? { regions: body.regions } : {}),
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

  const send = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Cache the most recent `step` event so a thrown error can be reported with
  // its surrounding context (viewport / page / step label). Without this, the
  // SSE error event collapsed every failure to a bare message — "Region 'hero':
  // backdrop apply failed" was missing which viewport/page it happened on.
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
      outputs: results.map(({ outputPath, viewportName, regionName, kind }) => ({
        outputPath,
        urlPath: outputPathToUrl(outputPath),
        viewportName,
        // `kind` is 'fullPage' | 'pin' | 'region' — the UI uses it to pick a
        // backdrop image for the pin-offset preview without resorting to slug-
        // suffix matching on viewportName (which would misfire on custom
        // viewport names that happen to end with a chip slug).
        ...(kind ? { kind } : {}),
        ...(regionName ? { regionName } : {}),
      })),
    });
  } catch (err) {
    // Prefer the error's own attached scope (runCapture tags thrown errors
    // with viewportName/pageName/regionName at the per-page try/catch) over
    // lastStep — under concurrency > 1 the most recent step event can come
    // from a different worker than the one that failed. Fall back to lastStep
    // when the error wasn't tagged (e.g., upfront --only validation throws
    // before any per-page work runs).
    const errScope = (err && (err.viewportName || err.pageName || err.regionName))
      ? {
          viewport: err.viewportName,
          page: err.pageName,
          ...(err.regionName ? { region: err.regionName } : {}),
        }
      : null;
    const context = errScope
      ?? (lastStep
        ? { viewport: lastStep.viewport, page: lastStep.page, step: lastStep.label }
        : null);
    send({
      type: 'error',
      message: errorToMessage(err),
      ...(context ? { context } : {}),
    });
  } finally {
    res.end();
  }
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
// by handleReveal and handleZip so the path-traversal guard is one rule, not two.
function resolveScreenshotPath(input) {
  const raw = String(input || '').replace(/^\.\//, '').replace(/^\//, '');
  if (!raw.startsWith('screenshots/')) {
    return { error: { status: 400, message: `path must be under screenshots/: ${input}` } };
  }
  const rel = raw.slice('screenshots/'.length);
  const absPath = normalize(join(SCREENSHOT_ROOT, rel));
  if (!absPath.startsWith(SCREENSHOT_ROOT + sep) && absPath !== SCREENSHOT_ROOT) {
    return { error: { status: 403, message: `forbidden: ${input}` } };
  }
  return { absPath };
}

async function handleReveal(req, res) {
  const body = await readJsonBody(req, res);
  if (body === null) return;

  const { absPath, error } = resolveScreenshotPath(body.path);
  if (error) {
    res.writeHead(error.status, { 'content-type': 'text/plain' });
    res.end(error.message);
    return;
  }

  if (process.platform !== 'darwin') {
    res.writeHead(501, { 'content-type': 'text/plain' });
    res.end('reveal in Finder is macOS-only');
    return;
  }

  try {
    await access(absPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    throw err;
  }

  const { spawn } = await import('node:child_process');
  spawn('open', ['-R', absPath], { stdio: 'ignore', detached: true }).unref();
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
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
    const { absPath, error } = resolveScreenshotPath(p);
    if (error) {
      res.writeHead(error.status, { 'content-type': 'text/plain' });
      res.end(error.message);
      return;
    }
    try {
      await access(absPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end(`not found: ${p}`);
        return;
      }
      throw err;
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
  // Strip leading "/screenshots/" then resolve under SCREENSHOT_ROOT.
  const rel = decodeURIComponent(pathname.replace(/^\/screenshots\/?/, ''));
  const absPath = normalize(join(SCREENSHOT_ROOT, rel));

  // Path traversal guard: absPath must stay under SCREENSHOT_ROOT.
  if (!absPath.startsWith(SCREENSHOT_ROOT + sep) && absPath !== SCREENSHOT_ROOT) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('forbidden');
    return;
  }

  let data;
  try {
    data = await readFile(absPath);
  } catch (err) {
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
