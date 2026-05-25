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
import { readFile } from 'node:fs/promises';
import { resolve, join, normalize, extname } from 'node:path';
import { configSchema } from '../config/schema.js';
import { runCapture } from '../capture/runCapture.js';
import { renderUi } from './ui.js';
import { ConfigError } from '../config/load.js';
import { BrowserError } from '../browser/launcher.js';

const SCREENSHOT_ROOT = resolve(process.cwd(), 'screenshots');

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

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/') {
      const html = renderUi();
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
  // Read JSON body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('invalid JSON body');
    return;
  }

  // Build a config object from form input. We force a deterministic output
  // template so the server knows where the file will land and can serve it
  // back to the browser. When regions are declared the schema (config/schema.js
  // §root-superRefine) requires {region} in the template — switch to a regions-
  // aware path that groups per-region files (and the full-page sibling) under a
  // per-page folder so a page with multiple regions doesn't sprawl.
  const hasRegions = Array.isArray(body.regions) && body.regions.length > 0;
  const output = hasRegions
    ? './screenshots/{date}/{time}/{viewport}/{page}/{region}.png'
    : './screenshots/{date}/{time}/{viewport}/{page}.png';

  const candidate = {
    name: body.name || 'ui-capture',
    baseUrl: body.baseUrl,
    output,
    deviceScaleFactor: body.deviceScaleFactor ?? 2,
    viewport: body.viewport,
    page: body.page,
    prepare: body.prepare ?? {},
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

  try {
    const results = await runCapture(parsed.data, {
      onProgress: (event) => send(event),
    });
    send({
      type: 'done',
      outputs: results.map(({ outputPath, viewportName }) => ({
        outputPath,
        urlPath: outputPathToUrl(outputPath),
        viewportName,
      })),
    });
  } catch (err) {
    send({ type: 'error', message: errorToMessage(err) });
  } finally {
    res.end();
  }
}

function outputPathToUrl(outputPath) {
  // outputPath is like "./screenshots/2026-05-22/14-32-07/desktop/home.png" or
  // "screenshots/.../home.png". Strip leading "./" if present, ensure
  // a leading "/".
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

async function handleReveal(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('invalid JSON body');
    return;
  }

  // body.path is like "./screenshots/.../home.png" — strip leading "./" or "/"
  const raw = String(body.path || '').replace(/^\.\//, '').replace(/^\//, '');
  if (!raw.startsWith('screenshots/')) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('path must be under screenshots/');
    return;
  }
  const rel = raw.slice('screenshots/'.length);
  const absPath = normalize(join(SCREENSHOT_ROOT, rel));

  if (!absPath.startsWith(SCREENSHOT_ROOT + '/') && absPath !== SCREENSHOT_ROOT) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('forbidden');
    return;
  }

  if (process.platform !== 'darwin') {
    res.writeHead(501, { 'content-type': 'text/plain' });
    res.end('reveal in Finder is macOS-only');
    return;
  }

  const { spawn } = await import('node:child_process');
  spawn('open', ['-R', absPath], { stdio: 'ignore', detached: true }).unref();
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

async function handleStaticScreenshot(pathname, res) {
  // /screenshots/foo/bar.png → CWD/screenshots/foo/bar.png
  // Strip leading "/screenshots/" then resolve under SCREENSHOT_ROOT.
  const rel = decodeURIComponent(pathname.replace(/^\/screenshots\/?/, ''));
  const absPath = normalize(join(SCREENSHOT_ROOT, rel));

  // Path traversal guard: absPath must stay under SCREENSHOT_ROOT.
  if (!absPath.startsWith(SCREENSHOT_ROOT + '/') && absPath !== SCREENSHOT_ROOT) {
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
  });
  res.end(data);
}
