#!/usr/bin/env node
// samples/serve-smoke.js — tiny hermetic HTTP fixture for the Phase 3/4 smoke test.
//
// Hosts a single deterministic page on http://127.0.0.1:7357/ that the
// samples/smoke.yaml fixture navigates to. No dependencies — pure Node http.
//
// Usage:
//   node samples/serve-smoke.js &
//   node index.js capture samples/smoke.yaml --smoke
//   kill %1
//
// Watch-mode smoke:
//   node samples/serve-smoke.js --tick 2000 &     # bump content every 2s
//   node index.js watch samples/smoke.yaml --poll 1 --debounce 500
//   kill %1
//
// The page declares no custom font rules — its document.fonts collection is
// empty, so document.fonts.ready resolves on the next microtask. This matches
// the planner's hermetic-fixture intent: prove the geometry math (CAP-01 +
// CAP-02 + CAP-03) without exercising fonts.ready BLOCKING behavior (CAP-04 —
// which is gated by the live-site pubq.se manual verification step instead).
import http from 'node:http';

const PORT = 7357;

// --tick <ms>: when set, increment an internal counter every <ms> milliseconds
// and embed it in the served HTML so the hash changes on each tick. Lets
// watch-mode be smoke-tested deterministically without a Framer republish.
// Without the flag the counter stays at 0 and every response is byte-identical,
// matching the existing capture/--smoke fixture contract.
const tickArgIdx = process.argv.indexOf('--tick');
const tickMs = tickArgIdx !== -1 ? Number.parseInt(process.argv[tickArgIdx + 1], 10) : 0;
let tickCounter = 0;
let tickTimer = null;
if (Number.isFinite(tickMs) && tickMs > 0) {
  tickTimer = setInterval(() => { tickCounter += 1; }, tickMs);
  tickTimer.unref?.();
}

function renderHtml() {
  return HTML.replace('__TICK__', String(tickCounter));
}

const HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; background: #c00; color: #fff; font-family: system-ui; }
    h1 { padding: 1rem; }

    /* PREP-01 fixture: @keyframes animation that would visibly play if not frozen.
       The universal * { animation: none !important } guard from 04-01 must beat this. */
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .anim-target {
      width: 50px;
      height: 50px;
      background: #ff0;
      animation: spin 2s linear infinite;
    }
  </style>
</head>
<body>
  <h1>framershot phase 4 smoke</h1>

  <!-- PREP-01 fixture: .anim-target has animation: spin 2s linear infinite.
       After installAnimationGuards, getComputedStyle(.anim-target).animationDuration === '0s'. -->
  <div class="anim-target" data-test="anim-target"></div>

  <!-- PREP-02 fixture: .io-target starts at opacity: 0. An inline IIFE uses
       new IntersectionObserver (resolved to the addInitScript shim) to observe
       the element; when the shim fires isIntersecting: true, the callback sets
       opacity = '1'. After prep, getComputedStyle(.io-target).opacity === '1'. -->
  <div class="io-target" data-test="io-target" style="width: 40px; height: 40px; background: #0ff; opacity: 0;"></div>
  <script>
    (() => {
      const el = document.querySelector('[data-test="io-target"]');
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.style.opacity = '1';
          }
        }
      });
      io.observe(el);
    })();
  </script>

  <!-- PREP-03 fixture: .hidden-by-test is matched by smoke.yaml's hide: array.
       After hideSelectors, getComputedStyle(.hidden-by-test).visibility === 'hidden'. -->
  <div class="hidden-by-test" data-test="hidden-by-test" style="padding: 1rem; background: #888; color: #fff;">
    this element SHOULD be hidden by Phase 4 prepare
  </div>

  <!-- PREP-04 fixture: 2000px spacer makes the page tall enough that scrollPrime
       has multiple steps to walk. The lazy <img> below the spacer would not load
       on initial paint (viewport is 600px); scrollPrime's inter-step waits give
       Chromium's native lazy-loading IO time to fire. -->
  <div style="height: 2000px; background: linear-gradient(#c00, #00c);"></div>
  <img
    data-test="lazy-img"
    loading="lazy"
    src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='40'><rect width='100' height='40' fill='%2300ff00'/><text x='4' y='24' fill='black' font-size='14'>PREP-04</text></svg>"
    style="display: block; width: 100px; height: 40px; margin-top: 100px;"
  />

  <!-- REGION-01 fixture: a single named element for selector-region capture.
       samples/smoke-regions.yaml's 'hero' region targets [data-test="region-hero"].
       Positioned below the PREP-04 spacer so scrollIntoViewIfNeeded must scroll
       to reveal it. Color #036 (dark blue) is deliberately distinct from the
       existing fixture colors (#c00, #ff0, #0ff, #888) so a visual check of any
       region PNG immediately reveals which section it captured. -->
  <section data-test="region-hero" style="margin: 2rem; padding: 2rem; background: #036; color: #fff;">
    <h2>Region hero (selector capture target)</h2>
    <p>This is the entire selector region. Padding should produce visible margin around it.</p>
  </section>

  <!-- REGION-02 fixture: 'from' anchor for anchor-region capture.
       samples/smoke-regions.yaml's 'cards' region uses from=[data-test="region-from"]
       to=[data-test="region-to"]. -->
  <div data-test="region-from" style="margin: 2rem; padding: 1rem; background: #063; color: #fff;">
    Anchor: from (top of region)
  </div>

  <!-- Spacer (400px) between from and to anchors — gives the union rect visible
       height so the captured PNG demonstrably spans more than either anchor alone. -->
  <div style="height: 400px; background: linear-gradient(#063, #630);"></div>

  <!-- REGION-02 fixture: 'to' anchor — the bottom of the anchor-region union. -->
  <div data-test="region-to" style="margin: 2rem; padding: 1rem; background: #630; color: #fff;">
    Anchor: to (bottom of region)
  </div>

  <footer style="padding: 1rem; color: #aaa;">end of phase-04 fixture · tick __TICK__</footer>
</body>
</html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(renderHtml());
});

server.listen(PORT, '127.0.0.1', () => {
  const tickNote = tickTimer ? ` (ticking every ${tickMs}ms)` : '';
  console.log(`smoke fixture: http://127.0.0.1:${PORT}/${tickNote}`);
});

// Clean shutdown on signal so the verifier can kill us cleanly.
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => {
    if (tickTimer) clearInterval(tickTimer);
    server.close(() => process.exit(0));
  });
}
