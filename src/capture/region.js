// src/capture/region.js
// Phase 8 Wave 2: per-region capture module (REGION-01 selector mode + REGION-02
// anchor mode). Sibling of src/capture/frames.js (clip + scroll + rAF), of
// src/browser/launcher.js (typed-error class), and of src/capture/index.js
// (presentation-free orchestrator).
//
// Exports:
//   - captureRegion(page, regionConfig, outputPath, options?) → void
//     options.onProgress: (event) => void  ← Phase 6/7 contract
//   - RegionError extends Error
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors throw RegionError (or bubble Playwright
// TimeoutError as-is); the caller (src/cli.js via runCapture, wired in Plan 08-03)
// owns presentation, the try/finally lifecycle, and exit codes. NO try/catch
// around the composed calls beyond null-bounding-box translation to RegionError.
//
// Lifecycle: takes a prepared Page (Phase 4's prepare pipeline already ran) and
// a resolved outputPath (Phase 2's resolveTemplate, extended in Wave 2 with
// {region}, already substituted). Produces a PNG file on disk. Does NOT close
// the page, context, or browser — the CLI owns lifecycle (Phase 3 invariant).
//
// fs invariant carry-over from src/capture/index.js:25-30: mkdir uses
// dirname(outputPath), NOT outputPath itself — mkdir('hero.png', { recursive })
// creates a DIRECTORY named hero.png and then page.screenshot({ path }) fails
// with EISDIR. Same pitfall, same fix.
//
// Phase 8 specifics (no v0.1 analog):
//   - boundingBox() returns null for display:none / detached elements (does NOT
//     throw) — null-check after every call, translate to RegionError (RESEARCH
//     §Pitfall 2). NOTE: the null check runs BEFORE scrollIntoViewIfNeeded
//     because scrollIntoViewIfNeeded on a display:none element waits for
//     actionability and times out after 30s. boundingBox() is the cheap
//     visibility probe that intercepts the invisible-element path.
//   - boundingBox() returns VIEWPORT-RELATIVE coordinates — measured against
//     the current scrollY at read time. Plan 04 fixes the anchor-mode union
//     math by converting every post-scroll bbox to DOCUMENT-SPACE at
//     measurement time via `measureDocBox()` (reads box + scrollX/scrollY in a
//     single sequence so the conversion is atomic with the read). After this
//     conversion, padRect/unionRect/clampToDocument all operate in document
//     coordinates and the clip is document-relative.
//   - Padding pushing clip outside doc bounds → clampToDocument truncates to
//     [0, docW] × [0, docH] in ONE page.evaluate (geometry-once invariant from
//     frames.js:74-82; RESEARCH §Pitfall 4).
//   - Anchor mode order: scroll → measureDocBox → scroll → measureDocBox. The
//     second scrollIntoViewIfNeeded may reflow the page if lazy-load triggers
//     fire, making the first anchor's boundingBox() stale if read after the
//     second scroll. ALWAYS measure each anchor immediately after scrolling it
//     (RESEARCH §Pitfall 3 / 08-PATTERNS §Anchor Mode Order).
//   - Screenshot uses { fullPage: true, clip } so the document-space clip
//     resolves correctly regardless of current scrollY. Without fullPage,
//     `page.screenshot({ clip })` treats clip as VIEWPORT-relative AND silently
//     truncates clip.height to the viewport height (Wave 2's two architectural
//     concerns combine — verified empirically in Plan 04 execution). With
//     fullPage: true + clip, Playwright renders the full page composite first
//     then crops to the document-relative clip rect (no viewport truncation).
//     This was the locked v0.1 invariant for FULL-PAGE captures; Plan 04 lifts
//     it for region captures only — see "Locked invariants" note below for the
//     full rationale.
//
// Locked invariants inherited from Phase 5 (FULL-PAGE capture path; Plan 04
// adjusts ONLY for the region-capture screenshot call):
//   - Screenshot options bag matches frames.js:124-129 modulo two REGION-MODE
//     deltas: (a) `fullPage: true` is added so Playwright resolves `clip` in
//     document coordinates (eliminates Wave 2's viewport-truncation pitfall);
//     (b) `clip` is the rect we want. The frames.js full-page stitch path is
//     UNCHANGED — Phase 5's invariant that full-page captures NEVER use
//     fullPage: true (because the manual stitch handles sticky elements
//     correctly) still holds. The region-mode fullPage: true is safe because
//     each region clip is small enough that sticky-element ghosting within the
//     clip rect is not a concern (typical Framer regions are marketing
//     sections, not full pages).
//   - The omit-background flag MUST NOT appear in the screenshot call (the
//     page's own background is wanted; this matches frames.js).
//   - Scroll behavior must be the instant variant on every scrollTo (NEVER the
//     smooth variant — that animates ~300ms and races rAF; sticky elements
//     end up at wrong positions).
//   - rAF roundtrip between scroll and screenshot for paint to settle (single
//     await, no fixed timeout).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { encodeImage, applyBackdrop } from './stitch.js';

/**
 * Named Error subclass for region-capture failures: selector matched nothing,
 * anchor matched nothing, element has no bounding box (display:none), or
 * --only=<name> references an undeclared region. Mirrors BrowserError /
 * ConfigError shape; consumed by formatError's dispatcher in src/cli/format.js
 * (Guard 4 added in Plan 08-04).
 */
export class RegionError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'RegionError';
    if (cause) this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Pure geometry helpers — module-private (not exported per planner spec). Trivial
// rectangle math; promoted to top-level functions for testability and clarity.
// ---------------------------------------------------------------------------

// Expand a rect uniformly by `padding` CSS pixels in all four directions.
// padRect({x:100,y:100,w:200,h:50}, 10) → {x:90,y:90,w:220,h:70}
// padRect(box, 0) is a no-op (returns equivalent-valued rect).
// Does NOT mutate `box`.
function padRect(box, padding) {
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  };
}

// Bounding-box union: smallest rect containing both `a` and `b`.
// Pure geometry; commutative (unionRect(a,b) deep-equals unionRect(b,a)).
function unionRect(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

// Clamp a rect to the document's [0, docW] × [0, docH] bounds so Playwright's
// page.screenshot({ clip }) accepts it (Pitfall 4). Negative x/y are clamped
// to 0; widths/heights are reduced by the overflow on each side AND on the
// far side (clip can't extend past docWidth/docHeight either).
//
// Geometry-once invariant (frames.js:74-82): reads scrollWidth + scrollHeight
// in ONE page.evaluate round-trip — multiple props, single protocol message.
async function clampToDocument(page, rect) {
  const { docWidth, docHeight } = await page.evaluate(() => ({
    docWidth: document.documentElement.scrollWidth,
    docHeight: document.documentElement.scrollHeight,
  }));
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  // When rect.x is negative, the clip starts at 0 and we lose |rect.x| of width
  // off the left. Math.min(0, rect.x) is ≤ 0, so adding it to rect.width
  // subtracts the overflow. Then cap so x + width ≤ docWidth.
  // Math.max(0, …) floors at zero — when the padded rect falls entirely outside
  // the document (tiny element + huge padding at an edge) the inner formula
  // can go negative and sharp rejects negative dimensions. The captureRegion
  // call sites translate a zero-area clip into RegionError.
  const width = Math.max(0, Math.min(rect.width + Math.min(0, rect.x), docWidth - x));
  const height = Math.max(0, Math.min(rect.height + Math.min(0, rect.y), docHeight - y));
  return { x, y, width, height };
}

// Read a locator's bounding box AND convert it to document-space in one
// atomic measurement. boundingBox() returns viewport-relative coords (see
// Plan 04 SUMMARY §"Architectural Concerns Resolved" for the empirical
// confirmation: scroll a page from scrollY=0 → 1750, the same element's
// box.y goes from 2000 → 250). Adding the current scrollX/scrollY converts
// to document coords.
//
// Atomicity: bbox and scrollY are read sequentially without an intervening
// scroll. If the page mutates between the two reads (e.g. a lazy-load fires
// and reflows the layout), both reads see the same DOM at the same scroll
// position because no `await scroll`/`await rAF` happens between them.
//
// Returns null when the element has no bounding box (display:none / detached) —
// callers translate to RegionError at the same sites as before this helper.
async function measureDocBox(page, loc) {
  const box = await loc.boundingBox();
  if (box === null) return null;
  const { scrollX, scrollY } = await page.evaluate(() => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  }));
  return {
    x: box.x + scrollX,
    y: box.y + scrollY,
    width: box.width,
    height: box.height,
  };
}

// Wait one requestAnimationFrame roundtrip for paint to settle. Mirrors
// frames.js's helper of the same name; duplicated locally to keep capture
// modules independent (one-line eval, not worth a shared util).
async function waitForPaint(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
}

// Resolve a single anchor locator to a document-space box. Handles the full
// dance: count check (zero matches → RegionError), pre-bbox visibility probe
// (null bbox → RegionError, avoids the 30s scrollIntoViewIfNeeded timeout on
// display:none), scroll into view, then measureDocBox.
//
// `role` is the label that appears in error messages ('selector' for selector
// mode, 'from'/'to' for anchor mode) so the user can tell which anchor failed.
// Pre-check and post-scroll re-check raise the same RegionError shape because
// the page can mutate between the two reads — a single message captures both
// the static-display-none case and the rare race.
async function resolveAnchorBox(page, regionName, role, selector) {
  const count = await page.locator(selector).count();
  if (count === 0) {
    const prefix = role === 'selector' ? `selector '${selector}'` : `'${role}' selector '${selector}'`;
    throw new RegionError(`Region '${regionName}': ${prefix} matched no elements.`);
  }
  const loc = page.locator(selector).first();
  const preBox = await loc.boundingBox();
  if (preBox === null) {
    const prefix = role === 'selector' ? `element '${selector}'` : `'${role}' anchor '${selector}'`;
    throw new RegionError(`Region '${regionName}': ${prefix} has no bounding box (likely display:none).`);
  }
  await loc.scrollIntoViewIfNeeded();
  const box = await measureDocBox(page, loc);
  if (box === null) {
    const prefix = role === 'selector' ? `element '${selector}'` : `'${role}' anchor '${selector}'`;
    throw new RegionError(`Region '${regionName}': ${prefix} has no bounding box (likely display:none).`);
  }
  return box;
}

/**
 * Capture a single named region to a PNG file at outputPath. Branches on
 * regionConfig shape: SELECTOR mode when `selector` is defined, ANCHOR mode
 * otherwise (both `from` and `to` are required by the Wave 1 schema's
 * .superRefine gate; defensive check here would be redundant).
 *
 * Flow (both modes):
 *   emit onProgress step → resolve locator(s) → count-check (RegionError on 0)
 *   → pre-check boundingBox (RegionError on null — display:none short-circuit
 *   that avoids the 30s scrollIntoViewIfNeeded timeout) → scroll into view →
 *   measureDocBox (post-scroll bbox + scrollX/Y → document-space) → padRect →
 *   (anchor mode: scroll second anchor → measureDocBox → unionRect) →
 *   clampToDocument → rAF → mkdir(dirname) → page.screenshot({ path, clip,
 *   fullPage: true, scale, animations, type }).
 *
 *   Plan 04 lifts the v0.1 "no fullPage" lock for region mode only — see the
 *   module-header "Locked invariants" block above. fullPage: true makes
 *   Playwright resolve `clip` in DOCUMENT coordinates and renders the full
 *   page composite before cropping, eliminating the viewport-truncation
 *   pitfall Wave 2 deferred to this plan.
 *
 * @param {import('playwright-chromium').Page} page — a Page already prepared
 *   by Phase 4 (animations frozen, IO triggers fired, hidden selectors removed,
 *   scroll-primed).
 * @param {object} regionConfig — validated by Wave 1's regionSchema:
 *   { name: string, selector?: string, from?: string, to?: string, padding: number }
 *   `padding` defaults to 0 at the schema layer; `?? 0` here is defensive in
 *   case a future caller bypasses validation.
 * @param {string} outputPath — absolute or relative resolved path. Parent
 *   directories will be created with `{ recursive: true }`.
 * @param {{ onProgress?: (event: { type: string, label: string }) => void }} [options={}]
 *   onProgress fires ONCE at start with { type: 'step', label: "Capturing
 *   region '<name>'" } — Plan 08-03's runCapture wrapper injects the per-
 *   viewport `viewport` field on top of this event for Phase 7-style scoping.
 * @returns {Promise<void>} — produces the PNG side effect; caller (runCapture
 *   in Plan 08-03) is responsible for pushing { outputPath, regionName } into
 *   its accumulator.
 * @throws {RegionError} — selector matched nothing; bounding box null
 *   (display:none); 'from'/'to' anchor matched nothing.
 * @throws {Error} — Playwright TimeoutError from scrollIntoViewIfNeeded /
 *   boundingBox if the default 30s timeout fires. Intentionally NOT wrapped —
 *   matches the silent-library posture of Phase 3+ (the top-level catch in
 *   src/cli.js formats it via formatError's default branch).
 */
export async function captureRegion(page, regionConfig, outputPath, { onProgress = () => {}, format = 'png', quality = 85, backdrop } = {}) {
  onProgress({ type: 'step', label: `Capturing region '${regionConfig.name}'` });

  // ANCHOR MODE ORDER (Pitfall 3): when both anchors are present, scroll +
  // measure ATOMICALLY per anchor inside resolveAnchorBox. The second scroll
  // may reflow the page if lazy triggers fire; measuring the first AFTER the
  // second scroll would be stale. measureDocBox converts each post-scroll bbox
  // to DOCUMENT-SPACE at measurement time — without this, the union of two
  // bboxes taken at DIFFERENT scroll positions is mathematically wrong (the
  // bboxes live in different coordinate spaces).
  const padding = regionConfig.padding ?? 0;
  let rect;
  if (regionConfig.selector !== undefined) {
    rect = await resolveAnchorBox(page, regionConfig.name, 'selector', regionConfig.selector);
  } else {
    const boxFrom = await resolveAnchorBox(page, regionConfig.name, 'from', regionConfig.from);
    const boxTo = await resolveAnchorBox(page, regionConfig.name, 'to', regionConfig.to);
    rect = unionRect(boxFrom, boxTo);
  }
  const clip = await clampToDocument(page, padRect(rect, padding));

  // clampToDocument floors width/height at 0 — when the padded rect falls
  // entirely outside the document (degenerate case for tiny elements with
  // large padding near edges), pass a clear RegionError up rather than a raw
  // Playwright "clip.width must be >= 1" failure.
  if (clip.width === 0 || clip.height === 0) {
    throw new RegionError(
      `Region '${regionConfig.name}': computed clip has no area (element + padding falls outside document bounds).`,
    );
  }

  // Wait ONE rAF roundtrip for paint to settle after the last
  // scrollIntoViewIfNeeded — frames.js mirror. With fullPage: true +
  // document-space clip (below), no additional scroll is needed: Playwright
  // renders the full-page composite and crops to the document-relative clip
  // rect, so the current scroll position is irrelevant to the captured pixels.
  await waitForPaint(page);

  // Ensure parent directory exists BEFORE the screenshot writes — mkdir on
  // dirname(outputPath), NOT outputPath (capture/index.js:25-30 carry-over).
  await mkdir(dirname(outputPath), { recursive: true });

  // Screenshot — region-mode options bag. Differs from frames.js:124-129 in
  // ONE place: fullPage: true is added so Playwright resolves `clip` in
  // DOCUMENT coordinates (without this, clip is viewport-relative AND clip
  // height is silently truncated to viewport height — see module header
  // "Locked invariants"). Plan 04 lifted the v0.1 "no fullPage" lock for
  // region mode only; the full-page stitch path in frames.js still uses the
  // manual scroll loop without fullPage to handle sticky elements correctly.
  // - scale device → CAP-02 retina (output = CSS × DSR physical pixels).
  // - animations disabled → belt-and-braces with Phase 4's CSS guards.
  // - type png → explicit self-documenting.
  // The omit-background option MUST NOT appear (the page's own background is
  // wanted).
  // Capture as a lossless PNG buffer first, then hand off to encodeImage so the
  // format/quality knob applies uniformly to region and full-page outputs. We
  // could pass `type: 'jpeg', quality` directly to Playwright (no sharp hop)
  // but Playwright has no native WebP encoder; routing every format through
  // sharp keeps the pipeline branchless and the encoded bytes consistent
  // between full-page and region captures.
  const raw = await page.screenshot({
    clip,
    fullPage: true,
    scale: 'device',
    animations: 'disabled',
    type: 'png',
  });
  // When the user has opted into a colored backdrop, wrap the raw region
  // capture in a padded canvas before the format-encode hop. Same helper the
  // full-page path uses, so the visual treatment is identical across region
  // and full-page outputs. DSR is read from the live page here (matching the
  // full-page path's source of truth — frames.js reads `window.devicePixelRatio`
  // into geometry.deviceScaleFactor and stitchFrames hands that to applyBackdrop).
  // Single source of truth keeps backdrop padding/radius scaled identically
  // across region and full-page outputs in the same run, even if config.deviceScaleFactor
  // ever drifts from the runtime DPR Playwright actually applied.
  // Errors are re-thrown as RegionError so the SSE client sees the region name
  // in the message — otherwise a sharp failure bubbles as a bare Error with no
  // breadcrumb.
  let framed = raw;
  if (backdrop) {
    onProgress({ type: 'step', label: `Applying backdrop to region '${regionConfig.name}'` });
    const { deviceScaleFactor } = await page.evaluate(() => ({
      deviceScaleFactor: window.devicePixelRatio,
    }));
    try {
      framed = await applyBackdrop(raw, { ...backdrop, deviceScaleFactor });
    } catch (err) {
      throw new RegionError(
        `Region '${regionConfig.name}': backdrop apply failed: ${err.message}`,
        { cause: err },
      );
    }
  }
  const encoded = await encodeImage(framed, { format, quality });
  await writeFile(outputPath, encoded);
}
