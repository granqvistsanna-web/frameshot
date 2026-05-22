// src/capture/stitch.js
// Phase 5 wave 1: sharp composite of captured frames into one full-page PNG
// buffer for OUT-02. Exports: stitchFrames(frames, geometry) → Buffer.
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors from sharp bubble; the caller (src/capture/index.js,
// wired in 05-03) owns presentation, the try/finally lifecycle, and exit codes.
//
// Pixel dimensions:
//   - Inputs (frames[]) are physical pixels (page.screenshot scale='device').
//   - Canvas is sized in physical pixels: viewportWidth·DSR × totalHeight·DSR.
//   - Each composite offset multiplies the CSS-pixel y by DSR.
//   - All pixel coordinates wrapped in Math.round — defends against fractional
//     DSR (1.25, 1.5) producing non-integer values sharp rejects (Pitfall 8).
//
// Last-frame correctness:
//   - When (totalHeight % viewportHeight !== 0), the final captured frame's
//     y offset is (totalHeight - viewportHeight) — it OVERLAPS the prior frame.
//   - sharp.composite applies overlays in ORDER (sharp 0.33 docs + index.d.ts:312).
//     Later items draw ON TOP, so the last frame's pixels overwrite the prior
//     frame's overlap region cleanly. No manual clipping needed. This is
//     documented sharp behavior, not a quirk to defend against.
//
// sharp import is a DEFAULT (sharp's package exports a default per
// node_modules/sharp/lib/index.d.ts:929). This is the ONLY default import in the
// codebase — do NOT "fix" it to a named import; sharp does not expose one.

import sharp from 'sharp';

/**
 * Compose an ordered array of viewport-sized PNG frame buffers into ONE
 * full-page PNG buffer using sharp.composite. The canvas dimensions are
 * derived from the geometry object captureFrames produced.
 *
 * @param {Buffer[]} frames — ordered array of viewport-sized PNG buffers
 *   (each is `viewportWidth · DSR × viewportHeight · DSR` physical pixels).
 *   Order MUST match `geometry.frameYOffsets` (this is the contract
 *   captureFrames upholds).
 * @param {{
 *   viewportWidth: number,
 *   viewportHeight: number,
 *   totalHeight: number,
 *   frameYOffsets: number[],
 *   deviceScaleFactor: number
 * }} geometry — the geometry payload from captureFrames.
 * @returns {Promise<Buffer>} — a PNG buffer of dimensions
 *   `viewportWidth · DSR × totalHeight · DSR` physical pixels.
 */
export async function stitchFrames(frames, geometry) {
  const { viewportWidth, totalHeight, frameYOffsets, deviceScaleFactor } = geometry;

  // Physical-pixel canvas dimensions.
  const canvasWidth = Math.round(viewportWidth * deviceScaleFactor);
  const canvasHeight = Math.round(totalHeight * deviceScaleFactor);

  // Build the composite payload: each entry is { input: Buffer, top, left }.
  // top/left are in physical pixels (matches the canvas's coordinate space).
  // Order is preserved — sharp's composite applies overlays in this order,
  // which is essential for the last-frame overlap to overwrite correctly.
  // OverlayOptions schema verified at node_modules/sharp/lib/index.d.ts:1487-1510.
  const overlays = frames.map((input, i) => ({
    input,
    top: Math.round(frameYOffsets[i] * deviceScaleFactor),
    left: 0,
  }));

  // Create a blank canvas, composite all frames, encode as PNG.
  // background: { r: 0, g: 0, b: 0, alpha: 0 } — transparent RGBA canvas.
  // Every pixel will be overwritten by composite, so the background never
  // shows, but transparency is the safest default in case of any
  // rounding-induced gap (the overlap strategy already precludes them,
  // belt-and-braces).
  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(overlays)
    .png()
    .toBuffer();
}
