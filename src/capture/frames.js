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
// Last-frame strategy: OVERLAP. When captureHeight is not an exact multiple of
// innerHeight, the final iteration clamps y to (captureHeight - innerHeight) —
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

// Sub-pixel threshold (CSS px) for treating a DOMMatrix m42 (translateY) as a
// hide-on-scroll offset rather than rounding noise. 0.5px sits below the
// smallest visually meaningful shift on a 1× display and well below any
// intentional nav-hide transform (typically -100% of the bar height).
const HIDE_TRANSLATE_Y_EPSILON_PX = 0.5;

// Wait one requestAnimationFrame roundtrip for paint to settle. Used after every
// scroll/DOM mutation that needs to land in pixels before the next screenshot.
async function waitForPaint(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
}

// Build the actionable error that replaces Playwright's opaque "Target page,
// context or browser has been closed" when the renderer actually crashed. A
// crashed renderer is unrecoverable (the page is dead), so the caller fails
// fast with this instead of retrying — and the message names the realistic
// causes so a support ticket is debuggable.
function rendererCrashError(cause) {
  const err = new Error(
    'Chromium renderer crashed during screenshot — most likely out of memory. ' +
      'The page may be too tall or heavy to capture at this device scale factor, or the ' +
      'machine is under memory pressure (e.g. live preview running a second Chromium at the same time).',
  );
  err.cause = cause;
  return err;
}

// Screenshot one frame, hardened against the target dying mid-call. Two failure
// modes hide behind the same Playwright message ("Target ... has been closed"):
//   - renderer crash (OOM/GPU kill) — page.on('crash') has fired; the page is
//     dead and a retry is futile, so convert to rendererCrashError immediately.
//   - transient close with a still-connected browser — settle briefly and retry
//     once; a fresh paint usually succeeds.
// `isCrashed` is a thunk so it reads the live crash flag at catch time, not at
// call time. Non-close errors (TimeoutError, clip math, etc.) bubble untouched.
async function captureFrameScreenshot(page, clip, isCrashed) {
  const opts = { clip, animations: 'disabled', scale: 'device', type: 'png' };
  try {
    return await page.screenshot(opts);
  } catch (err) {
    if (!/closed|crash/i.test(err?.message ?? '')) throw err;
    if (isCrashed()) throw rendererCrashError(err);
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      return await page.screenshot(opts);
    } catch (retryErr) {
      if (isCrashed()) throw rendererCrashError(retryErr);
      throw retryErr;
    }
  }
}

// Hide every computed-position fixed/sticky element via visibility:hidden
// !important. visibility preserves layout (vs display:none) so scrollHeight and
// frame offsets remain stable.
async function hideStickies(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      const pos = getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') {
        el.style.setProperty('visibility', 'hidden', 'important');
      }
    }
  });
}

// Frame-0 fix-up: force every fixed/sticky element back to a visible, untranslated
// state. scrollPrime walked the page top-to-bottom which triggers hide-on-scroll
// navs to apply inline styles (translateY/opacity/visibility). Jumping back to
// scrollY=0 doesn't always reverse this — Framer Motion and similar libs track
// direction in JS state, not via the native scroll position. Overriding the
// hide here works regardless of HOW the element was hidden. Only the translateY
// component of transform is zeroed so centered/scaled fixed elements (which use
// translateX(-50%) / scale()) are preserved.
async function revealStickies(page) {
  await page.evaluate((epsilon) => {
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;

      if (parseFloat(cs.opacity) < 1) {
        el.style.setProperty('opacity', '1', 'important');
      }
      if (cs.visibility === 'hidden') {
        el.style.setProperty('visibility', 'visible', 'important');
      }
      const transform = cs.transform;
      if (transform && transform !== 'none') {
        try {
          const matrix = new DOMMatrix(transform);
          if (Math.abs(matrix.m42) > epsilon) {
            matrix.m42 = 0;
            el.style.setProperty('transform', matrix.toString(), 'important');
          }
        } catch {
          el.style.setProperty('transform', 'none', 'important');
        }
      }
    }
  }, HIDE_TRANSLATE_Y_EPSILON_PX);
}

/**
 * Scroll the prepared page from top to bottom in viewport-height steps,
 * capturing a viewport-sized PNG buffer per step. Returns ordered buffers plus
 * the geometry the stitcher needs to compose them into a final PNG.
 *
 * @param {import('playwright-chromium').Page} page — a Page already prepared by
 *   Phase 4 (animations frozen, IO triggers fired, hidden selectors removed,
 *   scroll-primed; scrollY=0 at entry).
 * @param {{
 *   onProgress?: (current: number, total: number) => void,
 *   hideStickyAfterFirstFrame?: boolean,
 *   frameDelay?: number,
 *   maxHeight?: number,
 *   pinOffset?: number,
 * }} [options={}]
 *   Optional options bag. Phase 6 owns the onProgress contract — see
 *   .planning/phases/06-terminal-ux/06-RESEARCH.md §Pattern 2.
 *   - onProgress: called once per frame AFTER the screenshot resolves with
 *     (current, total) where current is 1-indexed and total is frameYOffsets.length.
 *     Backward compatible: omitting options or onProgress silently no-ops via
 *     optional chaining. The library MUST NOT import ora/chalk — the callback IS
 *     the bridge; the library calls it, the CLI displays.
 *   - hideStickyAfterFirstFrame: when true (default), AFTER frame 0 is captured
 *     every computed-position fixed/sticky element is hidden via
 *     visibility:hidden !important. The nav/banner therefore appears in the
 *     first frame (top of page) but is removed before subsequent scrolled
 *     frames, so it does not tile down the stitched image. visibility
 *     preserves layout so the geometry-once invariant (Step 1) holds.
 *   - frameDelay: extra dwell in ms between scroll and screenshot on EACH frame.
 *     0 = off (default; rAF roundtrip is enough for static Framer pages). Non-zero
 *     is for per-section animations or lazy content needing more than one paint.
 *   - maxHeight: v0.4 pin-format clamp. When set, captureHeight is capped at this
 *     CSS-pixel value so the output stops early and is ratio-shaped instead of
 *     full-page. Undefined = full-page behavior.
 *   - pinOffset: v0.5/v0.6 fraction in [0..1] of available vertical room.
 *     0 = top of page (default), 1 = flush bottom. Works with maxHeight (slides
 *     the pin window) AND for full-page captures (shifts the start of the
 *     scroll-stitch — capture extends from startY to end of page).
 *   - pinOffsetPx: v0.6 absolute-pixel alternative to pinOffset. Becomes startY
 *     directly, clamped to [0, rawScrollHeight - viewportHeight]. When both
 *     pinOffset and pinOffsetPx are provided, pinOffsetPx wins (the schema
 *     rejects that combo upstream, but be defensive here).
 * @returns {Promise<{
 *   frames: Buffer[],
 *   geometry: {
 *     viewportWidth: number,      // CSS pixels (innerWidth)
 *     viewportHeight: number,     // CSS pixels (innerHeight)
 *     captureHeight: number,        // CSS pixels — clamped to maxHeight when set, else raw scrollHeight
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
 * @note Last frame overlaps when captureHeight % innerHeight !== 0. Final y clamped
 *   to (captureHeight - innerHeight); sharp composite-order in 05-02 overwrites the
 *   overlap region cleanly. Pattern 1 lines 327-332.
 */
export async function captureFrames(page, options = {}) {
  const { onProgress, onMeta, hideStickyAfterFirstFrame = true, frameDelay = 0, maxHeight, pinOffset = 0, pinOffsetPx } = options;

  // Track renderer crashes for the duration of this capture so the screenshot
  // loop can distinguish "the renderer died" (unrecoverable — fail with a clear
  // OOM message) from a transient target-close (retry once). The listener is
  // scoped to this page and detaches when the page closes between iterations.
  let rendererCrashed = false;
  page.once('crash', () => { rendererCrashed = true; });

  // Step 1 — Read geometry ONCE (geometry-once invariant: Pitfall 5, Risk 6).
  // All four properties returned in a single page.evaluate round-trip.
  const { viewportWidth, viewportHeight, scrollHeight: rawScrollHeight, deviceScaleFactor } =
    await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      deviceScaleFactor: window.devicePixelRatio,
    }));

  // Empty-page guard. Without this, the single-frame fast path below resolves
  // clipHeight to 0, which Playwright rejects with an opaque "clip.height must
  // be >= 1". Surface a clear message — scrollPrime probably hasn't completed
  // or the page hasn't rendered yet.
  if (rawScrollHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    throw new Error(
      `Page has no measurable layout (scrollHeight=${rawScrollHeight}, innerWidth=${viewportWidth}, innerHeight=${viewportHeight}). The page may not have rendered yet — check that scrollPrime ran or increase extraDelay.`,
    );
  }

  // Resolve startY first so full-page captures with an offset can size
  // captureHeight as "from startY to end of page". Two paths:
  //   (a) Pin capture (maxHeight set): startY slides inside the room between
  //       rawScrollHeight and the pinned captureHeight (v0.4/v0.5 contract).
  //   (b) Full-page capture (maxHeight undefined) with an offset: startY slides
  //       in the room between rawScrollHeight and viewportHeight (so the very
  //       last frame can fit) and captureHeight becomes (rawScrollHeight - startY).
  //       This is the v0.6 addition — "capture from middle/bottom of page".
  // pinOffsetPx wins when provided (schema rejects the combo but be defensive).
  // Both forms clamp to non-negative room so short pages collapse to startY=0.
  const pinned = maxHeight !== undefined;
  const captureHeightIfPinned = pinned ? Math.min(rawScrollHeight, maxHeight) : rawScrollHeight;
  const roomForOffset = pinned
    ? Math.max(0, rawScrollHeight - captureHeightIfPinned)
    : Math.max(0, rawScrollHeight - viewportHeight);
  let startY;
  if (pinOffsetPx !== undefined) {
    startY = Math.max(0, Math.min(roomForOffset, Math.round(pinOffsetPx)));
  } else if (roomForOffset > 0) {
    startY = Math.round(roomForOffset * Math.min(1, Math.max(0, pinOffset)));
  } else {
    startY = 0;
  }
  // Effective captureHeight: pin captures keep their clamp; full-page captures
  // with startY>0 trim the top so the stitched output starts at the chosen Y.
  const captureHeight = pinned ? captureHeightIfPinned : rawScrollHeight - startY;
  // For observability the "room" stays the formal room-against-captureHeight
  // (matches the v0.5 pin-math contract). For full-page with no startY the
  // room is 0 and offsetApplied is false, which is the right signal.
  const room = Math.max(0, rawScrollHeight - captureHeight);

  // Observability hook for "the slider didn't move my pin" support tickets.
  // Emitted for pin captures (maxHeight set) AND for full-page captures that
  // actually applied a startY offset (v0.6). Plain top-to-bottom full-page
  // runs skip the event to keep the SSE stream quiet.
  if (pinned || startY > 0) {
    onMeta?.({
      kind: 'pin-math',
      rawScrollHeight,
      captureHeight,
      room,
      startY,
      pinOffset,
      pinOffsetPx,
      // Whether the user's offset actually produced a non-zero shift.
      // false here = either room was 0 (page shorter than window) OR offset
      // was 0. The user can tell which from rawScrollHeight vs captureHeight.
      offsetApplied: startY > 0,
    });
  }

  // Step 2 — Pre-compute frameYOffsets in CSS pixels (window-relative — i.e.,
  // canvas-placement coords, starting at 0). The page-scroll positions are
  // `startY + frameYOffsets[i]`; stitch.js sees the window-relative offsets.
  // Single-frame fast path when the window fits in one viewport (mirrors
  // hide.js:45-47 defensive-branch posture). Otherwise push nFull evenly-spaced
  // offsets and append one clamped last frame when there is a remainder.
  const frameYOffsets = [];
  if (captureHeight <= viewportHeight) {
    frameYOffsets.push(0);
  } else {
    const nFull = Math.floor(captureHeight / viewportHeight);
    for (let i = 0; i < nFull; i++) frameYOffsets.push(i * viewportHeight);
    if (captureHeight % viewportHeight > 0) frameYOffsets.push(captureHeight - viewportHeight);
  }

  // Step 3 — Capture one PNG buffer per frame offset.
  const frames = [];
  const total = frameYOffsets.length;
  for (let i = 0; i < total; i++) {
    const y = frameYOffsets[i];
    // Page-scroll position: window-relative frame offset shifted by the pin
    // startY. When startY === 0 this collapses to `y` exactly (v0.4 contract).
    const scrollY = startY + y;

    // (a) Scroll instantly to target position (Risk 7 — NEVER 'smooth').
    await page.evaluate((targetY) => {
      window.scrollTo({ top: targetY, behavior: 'instant' });
    }, scrollY);

    // (b) Wait ONE rAF roundtrip for paint to settle (Risk 8, Pitfall 3 —
    //     Phase 4's scrollPrime already triggered lazy-load IOs so we only need
    //     layout/paint to settle here; a fixed timeout would add ~200ms × nFrames
    //     of waste with no benefit).
    await waitForPaint(page);

    // (b2) Optional extra dwell per frame — opt-in via prepare.frameDelay.
    //      Threaded through captureFullPage → captureFrames; 0 = off (no-op).
    //      Use a non-zero value when per-section animations or lazy content
    //      need more than one paint to settle in view.
    if (frameDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, frameDelay));
    }

    // (b3) Frame-0 sticky handling. Two mutually-exclusive paths:
    //      - startY === 0: full-page or top-pinned capture — REVEAL hide-on-scroll
    //        navs so the first frame matches the page's first-paint look. The
    //        post-frame-0 hide block below then tears them back down.
    //      - startY > 0: mid-page pin — HIDE stickies BEFORE the screenshot so
    //        position:fixed nav/banners don't sit on top of mid-page content.
    //        Re-revealing would defeat the explicit mid-page intent.
    //      The post-frame-0 hide ensures subsequent scrolled frames stay clean
    //      regardless of which path ran.
    if (i === 0 && hideStickyAfterFirstFrame) {
      if (startY === 0) {
        await revealStickies(page);
      } else {
        await hideStickies(page);
      }
      await waitForPaint(page);
    }

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
    // Clip height = min(viewportHeight, remaining canvas height). This matters
    // in two cases: (a) very short pages where captureHeight < viewportHeight, and
    // (b) pin-format captures where maxHeight has clamped captureHeight to less
    // than a full viewport. In both, capturing a full-viewport frame would
    // overflow the stitcher's canvas (sharp.composite rejects overlays larger
    // than the canvas). For the standard multi-frame path this collapses to
    // viewportHeight, preserving the v0.1 contract bit-for-bit.
    const clipHeight = Math.min(viewportHeight, captureHeight - y);
    const buf = await captureFrameScreenshot(
      page,
      { x: 0, y: 0, width: viewportWidth, height: clipHeight },
      () => rendererCrashed,
    );
    frames.push(buf);

    // Invoke onProgress AFTER the frame resolves — "frame i+1 of total complete".
    // 1-indexed: first frame fires (1, total), last fires (total, total).
    // Phase 6 owns this contract; see 06-RESEARCH.md §Pattern 2.
    // Uses optional chaining — when onProgress is undefined this is a silent no-op.
    onProgress?.(i + 1, total);

    // After frame 0 only: hide every computed-position fixed/sticky element so
    // they don't tile down every subsequent frame. visibility:hidden preserves
    // layout — scrollHeight stays put, so the geometry-once invariant (Step 1)
    // still holds and frameYOffsets remain correct. Idempotent (only runs once,
    // gated by i === 0) and skipped when there's only one frame (no tiling
    // risk), when the caller disables it, or when startY > 0 (the mid-page
    // path above already hid them pre-screenshot).
    if (i === 0 && hideStickyAfterFirstFrame && total > 1 && startY === 0) {
      await hideStickies(page);
    }
  }

  // Reflow drift check — only meaningful for pin captures starting mid-page
  // (startY > 0). When the page reflowed during capture (lazy content settled
  // late, font loaded after rAF, etc.) the rawScrollHeight we measured at
  // Step 1 may differ from the actual scrollHeight by the end of the loop.
  // For startY=0 captures the drift is harmless (the last frame just dupes
  // the new bottom). For startY>0 the captured pixels live at a different
  // absolute page position than the user requested — worth surfacing so a
  // confusing output is debuggable rather than silently wrong. One extra
  // page.evaluate at end-of-loop, only when startY > 0.
  if (startY > 0) {
    const finalScrollHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    if (Math.abs(finalScrollHeight - rawScrollHeight) > viewportHeight * 0.1) {
      onMeta?.({
        kind: 'reflow-drift',
        initialScrollHeight: rawScrollHeight,
        finalScrollHeight,
        startY,
      });
    }
  }

  // Step 4 — Return ordered buffers + geometry for the stitcher (05-02).
  // Contract: frames.length === geometry.frameYOffsets.length.
  // Each frames[i] is a PNG Buffer of physical size (viewportWidth·DSR × viewportHeight·DSR).
  return {
    frames,
    geometry: {
      viewportWidth,
      viewportHeight,
      captureHeight,
      frameYOffsets,
      deviceScaleFactor,
    },
  };
}
