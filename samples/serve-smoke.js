#!/usr/bin/env node
// samples/serve-smoke.js — tiny hermetic HTTP fixture for the Phase 3 smoke test.
//
// Hosts a single deterministic page on http://127.0.0.1:7357/ that the
// samples/smoke.yaml fixture navigates to. No dependencies — pure Node http.
//
// Usage:
//   node samples/serve-smoke.js &
//   node index.js capture samples/smoke.yaml --smoke
//   kill %1
//
// The page declares NO @font-face rules — its document.fonts collection is
// empty, so document.fonts.ready resolves on the next microtask. This matches
// the planner's hermetic-fixture intent: prove the geometry math (CAP-01 +
// CAP-02 + CAP-03) without exercising fonts.ready BLOCKING behavior (CAP-04 —
// which is gated by the live-site pubq.se manual verification step instead).
import http from 'node:http';

const PORT = 7357;
const HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; background: #c00; color: #fff; font-family: system-ui; }
    h1 { padding: 1rem; }
  </style>
</head>
<body>
  <h1>framershot phase 3 smoke</h1>
</body>
</html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`smoke fixture: http://127.0.0.1:${PORT}/`);
});

// Clean shutdown on signal so the verifier can kill us cleanly.
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
