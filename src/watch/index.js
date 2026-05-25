// src/watch/index.js
// Watch loop for `framershot watch <config>`. Two modes:
//   - hash (default): poll the live URL on `pollMs`, hash the HTML response,
//     and re-run runCapture after a debounce window of `debounceMs` once a new
//     hash is observed. Successive changes inside the debounce window reset
//     the timer — useful while iterating on a Framer draft so a flurry of
//     republishes collapses to a single capture.
//   - interval: when `intervalMs` is set, skip hash checking entirely and
//     re-capture unconditionally every `intervalMs`.
//
// Contract (mirrors src/capture/runCapture.js):
//   - Pure library: NO console output, NO process.exit, NO chalk/ora here.
//   - All presentation goes through `onEvent` (high-level watch events) and
//     `onCaptureProgress` (per-capture progress, forwarded directly to
//     runCapture's onProgress signature).
//   - Caller signals shutdown via an AbortSignal. The loop drains, finishes
//     any in-flight capture, and returns. It NEVER aborts a capture mid-flight
//     (Playwright cleanup happens in runCapture's own finally block).
//
// Hash strategy: sha256 of the raw HTML response body. No script-stripping or
// DOM normalization — Framer-published pages have stable HTML for the same
// content. If noise turns up in practice, the place to filter is here.

import { createHash } from 'node:crypto';
import { runCapture } from '../capture/runCapture.js';

export class WatchError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'WatchError';
  }
}

/**
 * GET the URL and return sha256(text). Wraps non-OK and network failures in
 * WatchError so the caller can render them uniformly without leaking raw
 * fetch internals. Times out via AbortController so a hung server doesn't
 * stall the watch loop.
 *
 * @param {string} url
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<string>} hex-encoded sha256
 */
export async function fetchHtmlHash(url, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) {
      throw new WatchError(`HTTP ${res.status} fetching ${url}`);
    }
    const html = await res.text();
    return createHash('sha256').update(html).digest('hex');
  } catch (err) {
    if (err instanceof WatchError) throw err;
    if (err.name === 'AbortError') {
      throw new WatchError(`Timed out after ${timeoutMs}ms fetching ${url}`);
    }
    throw new WatchError(`Failed to fetch ${url}: ${err.message}`, { cause: err });
  } finally {
    clearTimeout(timer);
  }
}

// Resolves when either the timer fires OR the signal aborts — whichever comes
// first. Used as the loop's "tick" so Ctrl+C breaks the wait immediately
// instead of waiting for pollMs to elapse.
function sleepUntil(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(); return; }
    const t = setTimeout(resolve, ms);
    const onAbort = () => { clearTimeout(t); resolve(); };
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

/**
 * Run the watch loop until `signal` aborts.
 *
 * @param {import('../config/schema.js').ResolvedConfig} config
 * @param {object} [opts]
 * @param {string} [opts.url] — the URL to hash-poll. Required for hash mode;
 *   ignored in interval mode. Caller-supplied so the watch module doesn't
 *   have to encode page-resolution policy (single page vs. multi).
 * @param {number} [opts.pollMs=5000]    — hash-mode poll cadence
 * @param {number} [opts.debounceMs=1500] — quiet window after change before capture
 * @param {number|null} [opts.intervalMs=null] — when set, switches to interval mode
 * @param {boolean} [opts.initialCapture=true] — capture once at startup
 * @param {AbortSignal} [opts.signal]
 * @param {(event: object) => void} [opts.onEvent] — high-level watch events
 * @param {(event: object) => void} [opts.onCaptureProgress] — runCapture onProgress
 */
export async function runWatch(config, opts = {}) {
  const {
    url,
    pollMs = 5000,
    debounceMs = 1500,
    intervalMs = null,
    initialCapture = true,
    signal,
    onEvent = () => {},
    onCaptureProgress = () => {},
  } = opts;

  const mode = intervalMs != null ? 'interval' : 'hash';
  if (mode === 'hash' && !url) {
    throw new WatchError('runWatch requires opts.url in hash mode');
  }

  // Single source of truth for cross-callback state. Plain object so the
  // closures below mutate by reference; no need for getters/setters.
  const state = {
    stopping: false,
    capturing: false,
    pendingRecapture: false,  // set when a change lands while capture is running
    lastHash: null,
  };
  signal?.addEventListener?.('abort', () => { state.stopping = true; }, { once: true });

  onEvent({ type: 'watch-start', url, mode, pollMs, debounceMs, intervalMs });

  // Wrap runCapture in a re-entrancy guard. If a second capture is requested
  // while one is in-flight, set pendingRecapture and bail — the original call
  // re-enters once the current one finishes. This collapses a burst of
  // changes during a slow capture into exactly one follow-up run.
  const capture = async (trigger) => {
    if (state.capturing) { state.pendingRecapture = true; return; }
    state.capturing = true;
    onEvent({ type: 'capture-start', trigger });
    try {
      const results = await runCapture(config, { onProgress: onCaptureProgress });
      onEvent({ type: 'capture-done', trigger, results });
    } catch (err) {
      onEvent({ type: 'capture-error', error: err });
    } finally {
      state.capturing = false;
    }
    if (state.pendingRecapture && !state.stopping) {
      state.pendingRecapture = false;
      await capture({ kind: 'pending' });
    }
  };

  if (initialCapture && !state.stopping) {
    await capture({ kind: 'initial' });
  }
  if (state.stopping) { onEvent({ type: 'watch-stop' }); return; }

  if (mode === 'interval') {
    while (!state.stopping) {
      await sleepUntil(intervalMs, signal);
      if (state.stopping) break;
      await capture({ kind: 'interval' });
    }
  } else {
    // Prime the baseline hash so the first non-zero poll doesn't fire on the
    // pre-existing page state. If the baseline fetch fails, leave lastHash
    // null — the first successful poll will set it and (since null !== hex)
    // trigger one capture, which is the safer side to err on.
    try {
      state.lastHash = await fetchHtmlHash(url);
      onEvent({ type: 'hash-baseline', hash: state.lastHash });
    } catch (err) {
      onEvent({ type: 'poll-error', error: err });
    }

    let debounceTimer = null;
    const clearDebounce = () => {
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    };

    while (!state.stopping) {
      await sleepUntil(pollMs, signal);
      if (state.stopping) break;

      let h;
      try {
        h = await fetchHtmlHash(url);
      } catch (err) {
        onEvent({ type: 'poll-error', error: err });
        continue;
      }

      if (h === state.lastHash) {
        onEvent({ type: 'poll-unchanged', hash: h });
        continue;
      }

      const previous = state.lastHash;
      state.lastHash = h;
      onEvent({ type: 'change-detected', from: previous, to: h });

      // Reset debounce on each change — a republish followed by another
      // republish 500ms later collapses into one capture starting debounceMs
      // after the LAST change.
      clearDebounce();
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (state.stopping) return;
        capture({ kind: 'change' });
      }, debounceMs);
    }
    clearDebounce();
  }

  onEvent({ type: 'watch-stop' });
}
