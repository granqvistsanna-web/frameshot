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
 * Encode a raw image Buffer (typically PNG from page.screenshot or sharp) into
 * the requested output format. PNG passes through losslessly; jpeg/webp apply
 * quality-keyed compression. mozjpeg is enabled for JPEG (small, modern, no
 * runtime cost) and effort:4 for WebP (balanced — sharp's default is 4).
 *
 * @param {Buffer} buffer — source image bytes
 * @param {{ format: 'png'|'jpeg'|'webp', quality: number }} options
 * @returns {Promise<Buffer>}
 */
export async function encodeImage(buffer, { format, quality }) {
  const pipeline = sharp(buffer);
  if (format === 'jpeg') return pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  if (format === 'webp') return pipeline.webp({ quality }).toBuffer();
  return pipeline.png().toBuffer();
}

// Parse a 6-digit hex like "#FFE45C" into sharp's { r, g, b } shape.
// Schema validates the format upstream, so this trusts the input.
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Wrap a raw image buffer in a colored backdrop with optional rounded inner
 * corners. Returns a new PNG buffer ready for encodeImage.
 *
 * padding/radius are CSS pixels — multiplied by deviceScaleFactor so retina
 * outputs match a 1× design. When radius > 0 the inner screenshot is masked
 * with rounded corners and the cut areas become the backdrop color (composite
 * over a flat canvas, not transparent — JPEG has no alpha channel).
 *
 * @param {Buffer} buffer — composited image bytes (any format sharp reads)
 * @param {{ color: string, padding: number, radius: number, deviceScaleFactor: number }} opts
 * @returns {Promise<Buffer>} — PNG buffer; caller hands off to encodeImage
 */
export async function applyBackdrop(buffer, { color, padding, radius, deviceScaleFactor }) {
  const dsr = deviceScaleFactor || 1;
  const padPx = Math.round(padding * dsr);
  const radPx = Math.round(radius * dsr);
  const meta = await sharp(buffer).metadata();
  const innerW = meta.width;
  const innerH = meta.height;

  // Step 1 — optionally round the inner image's corners via an SVG alpha mask.
  // dest-in keeps the source pixels only where the mask is opaque, producing
  // a screenshot with transparent corners.
  let inner = buffer;
  if (radPx > 0) {
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${innerW}" height="${innerH}">` +
        `<rect width="${innerW}" height="${innerH}" rx="${radPx}" ry="${radPx}" fill="#fff"/>` +
      `</svg>`,
    );
    inner = await sharp(buffer)
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer();
  }

  // Step 2 — composite the (possibly rounded) inner onto a flat backdrop
  // canvas sized to inner + padding × 2 on each axis. Using a flat canvas
  // (not extend+flatten) keeps the corner-transparent pixels filled with the
  // backdrop color cleanly in one step, no second pass needed.
  const outerW = innerW + padPx * 2;
  const outerH = innerH + padPx * 2;
  const bg = hexToRgb(color);
  return sharp({
    create: {
      width: outerW,
      height: outerH,
      channels: 3,
      background: bg,
    },
  })
    .composite([{ input: inner, top: padPx, left: padPx }])
    .png()
    .toBuffer();
}

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
 * @param {{ format?: 'png'|'jpeg'|'webp', quality?: number, backdrop?: { color, padding, radius } }} [options]
 * @returns {Promise<Buffer>} — encoded image buffer in the requested format.
 */
export async function stitchFrames(frames, geometry, { format = 'png', quality = 85, backdrop } = {}) {
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
  // Composite the frames first, then dispatch to the format-specific encoder.
  // .png() vs .jpeg({quality, mozjpeg}) vs .webp({quality}) all live in
  // encodeImage; we hand off the intermediate composited PNG buffer so the
  // sharp pipeline tree stays linear and easy to reason about.
  let composited = await sharp({
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
  if (backdrop) {
    composited = await applyBackdrop(composited, { ...backdrop, deviceScaleFactor });
  }
  return encodeImage(composited, { format, quality });
}
