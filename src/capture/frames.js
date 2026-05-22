// src/capture/frames.js
// Phase 5 wave 1: scroll-capture loop for OUT-01. Exports: captureFrames(page, options?) →
// { frames: Buffer[], geometry }.
// options.onProgress: (current: number, total: number) => void — Phase 6-owned
// contract (06-RESEARCH.md §Pattern 2). Optional; the library does NOT import
// ora or chalk — the callback is the bridge between silent library and CLI display.
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors from Playwright primitives bubble; the caller
// (src/capture/index.js, wired in 05-03) owns presentation, the try/finally
// lifecycle, and exit codes.
//
// Reads page geometry ONCE before the loop (Pitfall 5, Risk 6). Lazy-load content
// that extends the page AFTER the initial measurement is NOT covered — Phase 4's
// scrollPrime already walked the page bottom-to-top to trigger lazy-load IOs.
//
// Last-frame strategy: OVERLAP. When totalHeight is not an exact multiple of
// innerHeight, the final iteration clamps y to (totalHeight - innerHeight) —
// producing a full-height viewport screenshot that OVERLAPS the previous frame.
// The stitcher (05-02) places this frame at the correct y offset; sharp's
// composite-order guarantee (later overlays draw on top) ensures the overlap
// region is overwritten cleanly with the correct content. RESEARCH §Pattern 1
// + §Pitfall 1 (rejected alternatives) + §Pitfall 4 (CSS vs physical pixel).
//
// Scroll behavior is ALWAYS 'instant' — NEVER 'smooth' (Risk 7, scroll.js mirror).
// Between scroll and screenshot the wait is ONE rAF roundtrip — NOT a fixed
// timeout delay (Risk 8, Pitfall 3). Phase 4's scrollPrime owned lazy-load
// triggering; here we just need paint to settle.

/**
 * Scroll the prepared page from top to bottom in viewport-height steps,
 * capturing a viewport-sized PNG buffer per step. Returns ordered buffers plus
 * the geometry the stitcher needs to compose them into a final PNG.
 *
 * @param {import('playwright-chromium').Page} page — a Page already prepared by
 *   Phase 4 (animations frozen, IO triggers fired, hidden selectors removed,
 *   scroll-primed; scrollY=0 at entry).
 * @param {{ onProgress?: (current: number, total: number) => void }} [options={}]
 *   Optional options bag. Phase 6 owns this contract — see
 *   .planning/phases/06-terminal-ux/06-RESEARCH.md §Pattern 2.
 *   - onProgress: called once per frame AFTER the screenshot resolves with
 *     (current, total) where current is 1-indexed and total is frameYOffsets.length.
 *     Backward compatible: omitting options or onProgress silently no-ops via
 *     optional chaining. The library MUST NOT import ora/chalk — the callback IS
 *     the bridge; the library calls it, the CLI displays.
 * @returns {Promise<{
 *   frames: Buffer[],
 *   geometry: {
 *     viewportWidth: number,      // CSS pixels (innerWidth)
 *     viewportHeight: number,     // CSS pixels (innerHeight)
 *     totalHeight: number,        // CSS pixels (scrollHeight at start)
 *     frameYOffsets: number[],    // CSS-pixel y offset per frame; order matches frames[]
 *     deviceScaleFactor: number,  // physical:CSS pixel ratio from window.devicePixelRatio
 *   }
 * }>}
 * @throws Playwright errors (TimeoutError, etc.) bubble. No wrapping. Phase 6
 *   owns formatting.
 *
 * @note Uses `behavior: 'instant'` on EVERY scrollTo call — NEVER 'smooth'
 *   (Risk 7, scroll.js:52,59 mirror). Smooth animates over ~300ms and races with
 *   the rAF wait; sticky elements end up at wrong positions in the screenshot.
 *
 * @note Geometry is read ONCE at the start, not re-read in the loop (Pitfall 5,
 *   Risk 6). Phase 4's scrollPrime already triggered lazy-load IOs; the geometry
 *   is stable at capture time. Re-reading per iteration creates infinite-loop risk
 *   and inconsistent canvas math.
 *
 * @note Last frame overlaps when totalHeight % innerHeight !== 0. Final y clamped
 *   to (totalHeight - innerHeight); sharp composite-order in 05-02 overwrites the
 *   overlap region cleanly. Pattern 1 lines 327-332.
 */
export async function captureFrames(page, options = {}) {
  const { onProgress } = options;
  // Step 1 — Read geometry ONCE (geometry-once invariant: Pitfall 5, Risk 6).
  // All four properties returned in a single page.evaluate round-trip.
  const { viewportWidth, viewportHeight, totalHeight, deviceScaleFactor } =
    await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      totalHeight: document.documentElement.scrollHeight,
      deviceScaleFactor: window.devicePixelRatio,
    }));

  // Step 2 — Pre-compute frameYOffsets in CSS pixels.
  // Single-frame fast path when the page fits in one viewport (mirrors
  // hide.js:45-47 defensive-branch posture). Otherwise push nFull evenly-spaced
  // offsets and append one clamped last frame when there is a remainder.
  const frameYOffsets = [];
  if (totalHeight <= viewportHeight) {
    frameYOffsets.push(0);
  } else {
    const nFull = Math.floor(totalHeight / viewportHeight);
    for (let i = 0; i < nFull; i++) frameYOffsets.push(i * viewportHeight);
    if (totalHeight % viewportHeight > 0) frameYOffsets.push(totalHeight - viewportHeight);
  }

  // Step 3 — Capture one PNG buffer per frame offset.
  const frames = [];
  const total = frameYOffsets.length;
  for (let i = 0; i < total; i++) {
    const y = frameYOffsets[i];

    // (a) Scroll instantly to target position (Risk 7 — NEVER 'smooth').
    await page.evaluate((targetY) => {
      window.scrollTo({ top: targetY, behavior: 'instant' });
    }, y);

    // (b) Wait ONE rAF roundtrip for paint to settle (Risk 8, Pitfall 3 —
    //     Phase 4's scrollPrime already triggered lazy-load IOs so we only need
    //     layout/paint to settle here; a fixed timeout would add ~200ms × nFrames
    //     of waste with no benefit).
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));

    // (c) Screenshot this viewport in physical pixels:
    //   - clip in CSS pixels (Playwright types.d.ts:24276-24296)
    //   - scale: 'device' → output = CSS × DSR physical pixels (CAP-02 retina)
    //   - animations: 'disabled' — belt-and-braces with Phase 4's CSS guards
    //   - type: 'png' — explicit for self-documenting code
    //   - background is preserved (Risk 16 — page's own background is wanted)
    //   - clip-based capture only (Risk 1 — project gate: manual stitch)
    // clip coordinates are relative to the current viewport (CSS pixels from
    // the top of the visible area), so y is always 0 — we have already scrolled
    // to position `y` above; this clip captures the full visible viewport.
    const buf = await page.screenshot({
      clip: { x: 0, y: 0, width: viewportWidth, height: viewportHeight },
      animations: 'disabled',
      scale: 'device',
      type: 'png',
    });
    frames.push(buf);

    // Invoke onProgress AFTER the frame resolves — "frame i+1 of total complete".
    // 1-indexed: first frame fires (1, total), last fires (total, total).
    // Phase 6 owns this contract; see 06-RESEARCH.md §Pattern 2.
    // Uses optional chaining — when onProgress is undefined this is a silent no-op.
    onProgress?.(i + 1, total);
  }

  // Step 4 — Return ordered buffers + geometry for the stitcher (05-02).
  // Contract: frames.length === geometry.frameYOffsets.length.
  // Each frames[i] is a PNG Buffer of physical size (viewportWidth·DSR × viewportHeight·DSR).
  return {
    frames,
    geometry: {
      viewportWidth,
      viewportHeight,
      totalHeight,
      frameYOffsets,
      deviceScaleFactor,
    },
  };
}
