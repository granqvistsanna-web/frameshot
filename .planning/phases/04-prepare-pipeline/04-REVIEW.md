---
phase: 04-prepare-pipeline
reviewed: 2026-05-22T09:33:04Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - samples/serve-smoke.js
  - samples/smoke.yaml
  - src/cli.js
  - src/prepare/animations.js
  - src/prepare/hide.js
  - src/prepare/index.js
  - src/prepare/scroll.js
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-05-22T09:33:04Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 4 lands a clean library-shaped prepare pipeline: four `src/prepare/` modules
(animations, hide, scroll, index/barrel) plus CLI wiring and a hermetic HTTP
fixture. The codebase consistently honors the stated "no console output / errors
bubble / caller owns presentation" contract, uses `page.evaluate(fn, arg)` for
selector injection safety (the most important security boundary here), and gets
the init-script lifecycle ordering right (animation guards registered before
navigation).

No Critical findings. The most consequential issue is a defensive-guard gap in
`scrollPrime` where a pathological `window.innerHeight <= 0` produces an infinite
loop with no escape (WR-01). The remaining warnings are real but small: a `setInterval`-style
listener leak in the readystatechange path of the CSS guard (WR-02), an
incorrect "default" claim in a docstring (WR-03), and a missing native-API
surface on the IntersectionObserver shim (WR-04) that any feature-detecting
consumer (Framer Motion does this) would notice. Info items cover style
preferences and minor diagnostic ergonomics.

The hide module's CSS-selector handling is correctly injection-safe (passed as
`arg`, not interpolated) and SyntaxError-tolerant; that's the single most
attractive injection surface in the diff and it is clean.

## Warnings

### WR-01: Infinite loop in scrollPrime when innerHeight <= 0

**File:** `src/prepare/scroll.js:50`
**Issue:** The scroll loop `for (let y = 0; y < totalHeight; y += innerHeight)` has
no defensive guard for `innerHeight === 0` (or negative). If `window.innerHeight`
ever evaluates to a non-positive value at the time of the `page.evaluate` read,
this loop iterates forever — each iteration scrolls to the same `y`, waits 200ms,
and never advances. The Phase 2 schema validates the *config* viewport, but
`innerHeight` is read from the live page at runtime, not from config, and there
is no contract that guarantees Playwright has finished applying the viewport by
the time `scrollPrime` runs (the navigator's networkidle + fonts.ready waits
don't gate on layout being sized). The risk is small in practice but the
consequence — a hung CLI run with no progress indication — is disproportionate
to the cost of a one-line guard.
**Fix:**
```js
const { innerHeight, totalHeight } = await page.evaluate(() => ({
  innerHeight: window.innerHeight,
  totalHeight: document.documentElement.scrollHeight,
}));

// Defensive: a zero/negative innerHeight would loop forever.
if (innerHeight <= 0) return;

for (let y = 0; y < totalHeight; y += innerHeight) {
  // ...
}
```

### WR-02: readystatechange listener never removed; fires for every state transition

**File:** `src/prepare/animations.js:120-122`
**Issue:** The fallback path that waits for `document.head` to appear registers
a `readystatechange` listener but never removes it. `readystatechange` fires on
every transition (`loading` → `interactive` → `complete`), so the handler runs
up to three times. The body is idempotent (the `querySelector('style[data-framershot=...]')`
check on line 108 short-circuits re-injection), so this is not a correctness bug
— but it is a real listener leak that keeps a closure alive for the lifetime of
the document and runs an unnecessary DOM query per state change. The simple fix
is `{ once: true }` or an explicit `removeEventListener` after the head appears.
**Fix:**
```js
if (document.head) {
  inject();
} else {
  document.addEventListener('readystatechange', function onRSC() {
    if (document.head) {
      inject();
      document.removeEventListener('readystatechange', onRSC);
    }
  });
}
```
or, more concisely:
```js
document.addEventListener('readystatechange', () => {
  if (document.head) inject();
}, { once: true });
```
Note: `{ once: true }` removes the listener after the FIRST fire even if `document.head`
is still not present, so prefer the explicit form if you want to keep retrying
until head exists.

### WR-03: Docstring claims `behavior: 'instant'` is the default — it is not

**File:** `src/prepare/scroll.js:33-36`
**Issue:** The JSDoc says: "Uses `behavior: 'instant'` (the default) on EVERY
scrollTo call". This is incorrect. The WHATWG CSSOM-View spec defines the
default value of `behavior` in `ScrollToOptions` as `'auto'`, not `'instant'`.
The distinction matters: `'auto'` consults the `scroll-behavior` CSS property of
the scrolling element, which Framer sites can (and sometimes do) declare as
`smooth` on `html` or `:root`. The explicit `'instant'` in the code is correct
and is doing real work — it is *overriding* a possible smooth `scroll-behavior`
declaration, not just restating the default. The doc as written suggests the
explicit value is redundant defensive style; future readers may delete it.
**Fix:** Update the doc to reflect why `'instant'` is required, not optional.
```js
 * @note Uses `behavior: 'instant'` on EVERY scrollTo call to OVERRIDE any
 *   author `scroll-behavior: smooth` declaration on :root/html (the CSSOM
 *   spec default for `behavior` is `'auto'`, which consults that property).
 *   Smooth scrolling would animate over ~300ms and race with the 200ms
 *   inter-step wait, causing lazy-load IO triggers to fire at wrong scroll
 *   positions. RESEARCH §Pitfall 6, 04-PATTERNS §Risk 12.
```

### WR-04: IntersectionObserver shim missing native instance properties (root, rootMargin, thresholds)

**File:** `src/prepare/animations.js:53-82`
**Issue:** The `ShimIO` class implements `observe`, `unobserve`, `disconnect`,
and `takeRecords` — but lacks the three instance properties that native
`IntersectionObserver` exposes: `root`, `rootMargin`, and `thresholds`. Any
consumer doing feature detection via `'rootMargin' in observer` (Framer Motion's
`useInView` does inspect option-derived properties), or computing margins from
`observer.rootMargin`, will see `undefined`. The shim already accepts an
`options` argument and stores it as `this._options`; surfacing the conventional
properties is a one-liner and removes a class of "shim looks real until somebody
reads a property" surprises. This is a real risk on a Framer site even if the
smoke fixture (which uses a plain `new IntersectionObserver(cb)`) does not
exercise it.
**Fix:**
```js
constructor(callback, options) {
  this._callback = callback;
  this._options = options ?? {};
  this._targets = new Set();
  // Surface the three instance properties native IO exposes, so consumers
  // doing 'rootMargin' in observer or reading observer.thresholds get
  // plausible values rather than undefined.
  this.root = this._options.root ?? null;
  this.rootMargin = this._options.rootMargin ?? '0px 0px 0px 0px';
  const t = this._options.threshold;
  this.thresholds = Array.isArray(t) ? t.slice() : [t ?? 0];
}
```

## Info

### IN-01: Destructured `hideSummary` is unused in the same scope

**File:** `src/cli.js:33-34`
**Issue:** `const { hideSummary } = await runPreparePipeline(...)` destructures
`hideSummary` and then immediately drops it with a comment that Phase 6 will
consume it. Static analyzers (ESLint `no-unused-vars`) and TypeScript checking
(`tsc --noEmit` with `noUnusedLocals`) will flag this. Until Phase 6 wires the
consumer, prefer either omitting the destructure or assigning to a `_`-prefixed
name that lints accept by convention. The existing comment is good — the symbol
just needs to not be a hard lint failure.
**Fix:**
```js
// Option A — drop the destructure until Phase 6 needs it:
await runPreparePipeline(navigatedPage, config.prepare);

// Option B — name it _hideSummary so lint rules ignore it:
const { hideSummary: _hideSummary } = await runPreparePipeline(navigatedPage, config.prepare);
```

### IN-02: __originalIO can be clobbered by repeated init-script runs

**File:** `src/prepare/animations.js:52`
**Issue:** `window.__originalIO = window.IntersectionObserver;` is set
unconditionally on every init-script invocation. `addInitScript` runs on every
new document — including same-origin iframes and any post-navigation document
swap. On a second run, `window.IntersectionObserver` is already the shim, so
`__originalIO` gets clobbered with the shim rather than retaining the real
constructor. The only consumer of `__originalIO` is the comment-described
"debug-friendly inspection" — no production code depends on it — so this is
diagnostic-quality only, but the current write is misleading. Trivial fix is a
"set once" guard.
**Fix:**
```js
if (!window.__originalIO) {
  window.__originalIO = window.IntersectionObserver;
}
```

### IN-03: page.waitForTimeout is officially discouraged by Playwright

**File:** `src/prepare/scroll.js:54`, `src/prepare/scroll.js:79`
**Issue:** Playwright marks `page.waitForTimeout()` as discouraged in its docs
("Never wait for timeout in production"). Both call sites here have a legitimate
reason — the 200ms inter-step wait gives Chromium-native lazy IO a real wall-clock
window, and `extraDelay` is explicitly a user-tunable wall-clock pause — so the
usage is justified. Worth a one-line comment near each call site noting the
choice was deliberate, so a future cleanup pass doesn't strip them.
**Fix:**
```js
// page.waitForTimeout is officially discouraged, but the lazy-IO trigger
// window is a real wall-clock requirement — there is no Playwright primitive
// for "give native lazy-load IO its event-loop turn". Documented in 04-PATTERNS.
await page.waitForTimeout(INTER_STEP_WAIT_MS);
```

### IN-04: smoke fixture crashes if port 7357 is busy

**File:** `samples/serve-smoke.js:95-97`
**Issue:** `server.listen(PORT, '127.0.0.1', cb)` has no `error` event handler.
If port 7357 is already in use (e.g., a prior smoke run was not killed cleanly),
the server emits an unhandled `error` and the process exits with an unfriendly
node stack trace. For a fixture, a one-line message naming the conflict would
save a developer a minute of confusion.
**Fix:**
```js
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`smoke fixture: port ${PORT} is already in use — is another instance running?`);
    process.exit(1);
  }
  throw err;
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`smoke fixture: http://127.0.0.1:${PORT}/`);
});
```

### IN-05: Dynamic imports inside --smoke action are unusual without lazy-load benefit

**File:** `src/cli.js:43-44`
**Issue:** `const { mkdir } = await import('node:fs/promises'); const { dirname } = await import('node:path');`
are dynamic imports inside the action handler, but `node:fs/promises` and
`node:path` are tiny built-ins — there is no startup-cost reason to defer them.
The pattern reads as "carved out of a different module" rather than intentional.
Hoist them to the top-level import block for consistency with the rest of the
CLI.
**Fix:**
```js
// At top of file:
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// At call site (delete the dynamic imports):
await mkdir(dirname(resolvedOutput), { recursive: true });
await navigatedPage.screenshot({ path: resolvedOutput, fullPage: false, animations: 'disabled' });
```

---

_Reviewed: 2026-05-22T09:33:04Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
