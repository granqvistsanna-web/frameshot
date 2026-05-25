// src/config/schema.js
// Zod 3 schema for the full v0.1/v0.2 framershot config shape + formatZodError helper.
// NOTE: package.json declares "zod": "^3", resolving to zod 3.x at install time.
//   - Use `z.string().url()` (the zod 3 form). The top-level `z.url()` exists in
//     zod v4 but is undefined in zod 3.x. Both `import { z }` and `import * as z`
//     work in zod 3; we use the named export form.
import { z } from 'zod';

// Filename-safe name shape. Every `name:` field on viewports/regions/pages
// flows into the output template (see runCapture.js:176) — these names become
// path components in screenshots/<date>/{page}-{viewport}-{region}-{time}.{ext}.
// Without this regex two attacks open up:
//   1. Path traversal: a name like '../../etc/passwd' could escape SCREENSHOT_ROOT
//      once template substitution joins it into the output path.
//   2. XSS via the gallery: server/ui.js:tileLabel interpolates viewport/region
//      names into innerHTML, so '<img onerror=...>' would execute on render.
// Matches the UI's slug sanitizer at server/ui.js:splitBaseUrl — same allowlist,
// enforced on both ends.
const safeNameSchema = z
  .string()
  .regex(/^[a-zA-Z0-9._-]+$/, "may only contain letters, numbers, '.', '_', '-'");

// Find the first duplicate value in a list of entries when read via `key`.
// Returns the duplicated value or null. Shared by viewports/pages/regions
// name-uniqueness refinements so each schema reports just the first collision
// (cleaner UX than flooding the user with N issues for a single typo).
function findFirstDuplicate(entries, key) {
  const seen = new Set();
  for (const entry of entries) {
    const value = entry[key];
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

// v0.1 singular shape — kept for the singular-alias input path (name is optional).
// Do NOT delete: the root mutual-exclusivity refinement still uses this for the
// `viewport:` field, and the normalize transform reads from it.
const viewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  name: safeNameSchema.optional(),
});

// v0.2 plural shape — `name` is REQUIRED per D-02 so the {viewport} placeholder
// in output templates can never silently produce identical paths for two viewports.
// pinHeight (optional, v0.4): when set, the full-page scroll-stitch is clamped at
// this CSS-pixel height — the page renders at width×height as usual (so the layout
// is natural for the chosen device width) but the output image stops at the pin
// height. Used by the UI's Pinterest ratio chips: pinHeight = round(width × ratio).
// pinOffset (optional, v0.5): fraction in [0..1] of "available vertical room"
// (pageHeight - pinHeight). 0 = top of page (legacy behavior, default when omitted),
// 1 = flush bottom. Requires pinHeight — rejected at schema layer if set alone
// (without that guard captureFrames silently no-ops via the `maxHeight !== undefined`
// branch and the user sees no effect).
export const viewportEntrySchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    name: safeNameSchema,
    pinHeight: z.number().int().positive().optional(),
    pinOffset: z.number().min(0).max(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.pinOffset !== undefined && data.pinHeight === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pinOffset'],
        message: `viewport '${data.name}': pinOffset requires pinHeight (it has no meaning without a pin window to slide)`,
      });
    }
  });

// Array of 1+ viewport entries with unique names.
// .superRefine gives fine-grained control over path + message so formatZodError's
// catch-all renders it as `viewports: duplicate name '<dup>'` (per D-02).
// path: [] (empty) — the parent field is also called `viewports`, so an
// explicit `path: ['viewports']` here would render as the doubled
// `viewports.viewports`. Mirrors the regionSchema pattern below.
export const viewportsSchema = z.array(viewportEntrySchema).min(1).superRefine((arr, ctx) => {
  const dup = findFirstDuplicate(arr, 'name');
  if (dup !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: `duplicate name '${dup}'`,
    });
  }
});

const pageSchema = z.object({
  // Leading slash enforced — gives a clear error when user writes `home` instead of `/home`
  path: z.string().startsWith('/'),
  // name is REQUIRED (not optional) — 02-03's template resolver substitutes it into {page}
  name: safeNameSchema,
});

// v0.3 plural shape — mirrors viewportEntrySchema/viewportsSchema. `name` is
// REQUIRED so the {page} placeholder in output templates can never silently
// produce identical paths for two pages. Used by `framershot discover` to emit
// runnable multipage configs from a sitemap, and by anyone hand-listing a small
// set of routes.
export const pageEntrySchema = z.object({
  path: z.string().startsWith('/'),
  name: safeNameSchema,
});

// path: [] for the same reason as viewportsSchema above — avoids the doubled
// `pages.pages` surface when the parent field is also called `pages`.
export const pagesSchema = z.array(pageEntrySchema).min(1).superRefine((arr, ctx) => {
  const dup = findFirstDuplicate(arr, 'name');
  if (dup !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: `duplicate name '${dup}'`,
    });
  }
});

const prepareSchema = z
  .object({
    // PREP-01: disable animations — default ON (Framer-friendly)
    animations: z.boolean().default(true),
    // PREP-03: selectors to hide (sticky navs, banners, chat widgets)
    hide: z.array(z.string()).default([]),
    // PREP-04: scroll prime — default ON
    scrollPrime: z.boolean().default(true),
    // PREP-05: extra delay in milliseconds after scroll prime
    extraDelay: z.number().int().min(0).default(0),
    // Extra dwell (in ms) between scroll and screenshot on EACH frame of the
    // full-page scroll-stitch loop. 0 = off (default; the rAF roundtrip is
    // sufficient for static Framer pages). Set a non-zero value when the page
    // has per-section animations or lazy content that needs more than one
    // paint to settle in view.
    frameDelay: z.number().int().min(0).default(0),
    // Hide every computed position:fixed/sticky element AFTER frame 0 of the
    // capture loop. The nav/banner appears in the very first viewport-sized
    // shot at the top of the page (matches how the page actually looks on
    // first paint), then is hidden for every subsequent scrolled frame so it
    // doesn't tile down the stitched full-page image. Default ON — the whole
    // point of a long-form screenshot is a clean static view below the fold.
    hideSticky: z.boolean().default(true),
    // Hide the "Made in Framer" badge before any frame is captured.
    // Default ON — this is a Framer-targeted tool and the badge is a
    // universal artifact on framer.website pages.
    hideFramerBadge: z.boolean().default(true),
  })
  // Entire `prepare` block is optional in YAML — .default({}) lets minimal configs omit it
  .default({});

// Phase 8 (REGION-01/02): single region entry shape with selector-XOR-(from+to)
// gate. Both modes share the same outer `z.object` so a `regions: [...]` array
// can mix selector entries and anchor entries; the per-entry `.superRefine`
// enforces "exactly one mode chosen" per RESEARCH §Pattern 1/2 + §Pitfall — a
// `z.union([selectorSchema, anchorSchema])` alternative was rejected because
// union errors degrade to "Invalid input — expected one of these shapes"
// (RESEARCH.md:109) which loses the per-region naming the planner wants in
// formatZodError output.
//
// Path token choice for the per-entry custom issues below:
//   `path: []` (empty) — formatZodError renders as `<root>: region 'X': ...`.
// Chosen over `path: ['<name>']` because the message body already names the
// region, so an empty path avoids the doubled-name surface
// (`hero: region 'hero': ...`). Both options satisfy the <behavior> bullets.
//
// `padding` is a non-negative integer defaulting to 0 (RESEARCH §Pattern 3 —
// asymmetric `{top, right, bottom, left}` deferred per planning_context Open
// Question #2 lock). The default lives on the field via `.default(0)` so
// downstream `captureRegion` consumers never have to write `?? 0`.
export const regionSchema = z
  .object({
    name: safeNameSchema,
    selector: z.string().min(1).optional(),
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
    padding: z.number().int().min(0).default(0),
  })
  .superRefine((data, ctx) => {
    // 'full' is reserved: runCapture.js:131 substitutes region='full' into the
    // output template for the full-page capture, so a region named 'full' would
    // silently overwrite it. Case-insensitive — APFS/HFS+ default to case-insensitive.
    if (data.name.toLowerCase() === 'full') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: `region '${data.name}': name 'full' is reserved for full-page output`,
      });
    }
    const hasSelector = data.selector !== undefined;
    const hasFrom = data.from !== undefined;
    const hasTo = data.to !== undefined;
    const hasAnchor = hasFrom && hasTo;
    const halfAnchor = hasFrom !== hasTo; // exactly one of from/to set
    if (hasSelector && (hasAnchor || halfAnchor)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: `region '${data.name}': use 'selector' OR 'from'+'to', not both`,
      });
    } else if (!hasSelector && !hasAnchor && !halfAnchor) {
      // neither selector nor either anchor half
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: `region '${data.name}': must declare 'selector' OR both 'from' and 'to'`,
      });
    } else if (halfAnchor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: `region '${data.name}': 'from' and 'to' must both be set`,
      });
    }
  });

// Root base schema: both viewport keys are .optional() at the field level so zod
// parses the raw object without rejecting unknown combinations.  The mutual-exclusivity
// invariant is enforced by the .superRefine below.
const baseConfigSchema = z.object({
  name: z.string().min(1),
  // z.string().url() is the standard zod 3 form for WHATWG URL validation.
  // Do NOT use top-level z.url() — that is a zod v4-only API.
  // .refine restricts to http/https so configs cannot point at javascript:,
  // file:, or data: schemes that Phase 3 navigation would happily follow.
  baseUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
      message: 'baseUrl must use http or https',
    }),
  // output: just string min(1) — placeholder enforcement belongs to the template resolver.
  // The extension in the template (typically .png) is rewritten downstream to
  // match `format` (see src/output/template.js#swapExtension), so users can
  // change format without editing their template.
  output: z.string().min(1),
  deviceScaleFactor: z.number().min(1).max(3).default(2),
  // Encoded output format. PNG is lossless (default — preserves the v0.1 contract);
  // JPEG/WebP apply lossy compression keyed off `quality`. Retina full-page PNGs
  // hit 10–15 MB for marketing pages; WebP @ quality 85 typically lands 8–12×
  // smaller with no perceptible loss for screenshots. `quality` is honored for
  // jpeg/webp only — png ignores it.
  format: z.enum(['png', 'jpeg', 'webp']).default('png'),
  quality: z.number().int().min(1).max(100).default(85),
  // Optional colored padding wrapped around the final image (uniform on all
  // sides). Off by default — when omitted, the encoded image is unchanged.
  // color: 6-digit hex (with leading #). padding/radius are CSS pixels and
  // get multiplied by deviceScaleFactor at apply time so they scale with
  // retina output. radius applies rounded corners to the inner screenshot
  // (corners become the backdrop color via composite over a flat canvas).
  backdrop: z
    .object({
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be a 6-digit hex like #FFE45C'),
      padding: z.number().int().min(0).max(400).default(48),
      radius: z.number().int().min(0).max(200).default(0),
    })
    .optional(),
  // v0.1 singular alias — optional at the field level; mutual exclusivity enforced below.
  viewport: viewportSchema.optional(),
  // v0.2 plural form — optional at the field level; mutual exclusivity enforced below.
  viewports: viewportsSchema.optional(),
  // v0.1/v0.2 singular alias — optional at the field level; mutual exclusivity
  // with `pages:` enforced below. Mirrors the viewport/viewports pattern.
  page: pageSchema.optional(),
  // v0.3 plural form — optional at the field level; mutual exclusivity enforced below.
  pages: pagesSchema.optional(),
  prepare: prepareSchema,
  // Phase 8 (REGION-01/02): optional array of region entries. NO `.default([])`
  // — back-compat requires `undefined` when the block is omitted so downstream
  // can distinguish "no regions: block declared" from "explicit empty block".
  // Per-entry shape + selector-XOR-(from+to) gate live on regionSchema above;
  // root-level cross-field checks (duplicate names + {region}-in-output) live
  // on the chained .superRefine below.
  regions: z.array(regionSchema).optional(),
  // v0.3: parallel viewport workers. Default 1 = sequential (preserves Phase 7
  // semantics exactly). Max 8 — past that, Chromium memory pressure dominates
  // on typical laptops (~400 MB per browser × 8 = 3.2 GB) and you start losing
  // to the OS more than you gain to parallelism. CLI `--concurrency N` overrides.
  concurrency: z.number().int().min(1).max(8).default(1),
});

// Full configSchema: mutual-exclusivity refinement → normalize transform.
// Order matters in zod: .superRefine runs BEFORE .transform, so an invalid
// input (both or neither) never reaches the normalize step.
export const configSchema = baseConfigSchema
  .superRefine((data, ctx) => {
    const hasViewport = data.viewport !== undefined;
    const hasViewports = data.viewports !== undefined;
    if (hasViewport && hasViewports) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['viewport / viewports'],
        message: "provide exactly one (got 'both')",
      });
    } else if (!hasViewport && !hasViewports) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['viewport / viewports'],
        message: "provide exactly one (got 'neither')",
      });
    }

    // v0.3 (DISC-01): mirror the viewport/viewports mutual-exclusivity gate for
    // the new singular-or-plural page form. Same shape so formatZodError
    // renders both consistently.
    const hasPage = data.page !== undefined;
    const hasPages = data.pages !== undefined;
    if (hasPage && hasPages) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['page / pages'],
        message: "provide exactly one (got 'both')",
      });
    } else if (!hasPage && !hasPages) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['page / pages'],
        message: "provide exactly one (got 'neither')",
      });
    }
  })
  .transform((data) => {
    // Normalize singular → plural.  If `viewport:` was supplied, convert it to
    // a one-element `viewports:[]` with name defaulting to 'default' (matching
    // the v0.1 fallback in runCapture.js:36 and cli.js:46).
    // The returned object omits `viewport` so downstream consumers see ONLY
    // `config.viewports` — zero branching outside this boundary.
    const { viewport, viewports, page, pages, ...rest } = data;
    const normalizedViewports = viewport !== undefined
      ? [{ width: viewport.width, height: viewport.height, name: viewport.name ?? 'default' }]
      : viewports;
    // Note: viewport (singular) cannot carry pinHeight — it's a v0.1 shape
    // predating ratio captures. Multi-viewport plural form is the only path
    // that gets pinHeight, which matches the UI flow that introduced it.
    // v0.3 (DISC-01): same posture for page → pages. Singular `page:` becomes
    // a one-element `pages:[{path, name}]`. Downstream consumers (runCapture,
    // server) read config.pages[] exclusively.
    const normalizedPages = page !== undefined
      ? [{ path: page.path, name: page.name }]
      : pages;
    return { ...rest, viewports: normalizedViewports, pages: normalizedPages };
  })
  // Phase 8 (REGION-01/02/03): root-level cross-field refinement runs AFTER
  // Phase 7's normalize transform. Zod 3 allows .superRefine to chain after
  // .transform — the refinement sees the transformed value (data.viewports is
  // already plural-normalized; data.regions passes through untransformed since
  // regionSchema's per-entry transforms only fill the padding default).
  .superRefine((data, ctx) => {
    // v0.3 (DISC-01): {page}-overwrite-prevention check. When multiple pages
    // are declared, the output template MUST contain {page} so per-page paths
    // are distinct. Single-page configs are exempt — same posture as
    // viewports-uniqueness (only enforced when length > 1 implicitly, since
    // a single name can't collide with itself).
    if (data.pages.length > 1 && !data.output.includes('{page}')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['output'],
        message: 'template must contain {page} when multiple pages are declared (to avoid overwrites)',
      });
    }

    if (data.regions === undefined) return; // back-compat: no regions block → no checks

    // (a) Duplicate region-name check. Matches Phase 7's `duplicate name '<X>'`
    //     message shape so formatZodError's catch-all renders this as
    //     `regions: duplicate name 'hero'` (mirrors viewportsSchema).
    const dup = findFirstDuplicate(data.regions, 'name');
    if (dup !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['regions'],
        message: `duplicate name '${dup}'`,
      });
    }

    // (b) Overwrite-prevention check: when any region is declared, the output
    //     template MUST contain {region} so per-region paths are distinct.
    //     Mirrors the {viewport}-uniqueness invariant Phase 7 D-02 established
    //     (uniqueness enforced at validation time, not at runtime).
    if (data.regions.length > 0 && !data.output.includes('{region}')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['output'],
        message: 'template must contain {region} when regions are declared (to avoid overwrites)',
      });
    }
  });

/**
 * @typedef {z.infer<typeof configSchema>} ResolvedConfig
 *
 * Always exposes `viewports: Array<{ name: string, width: number, height: number }>`.
 * The v0.1 singular `viewport:` input form is absorbed by the schema transform at this
 * boundary — no downstream consumer ever reads `config.viewport` (singular).
 */

// POST /api/zip body. `paths` is the list of run-output paths to bundle.
// Max 200 entries keeps a hostile/malformed request from trying to zip the
// whole disk; real runs top out around N viewports × M regions, well under
// that. Per-path max 2000 chars caps the JSON payload size at the field
// level — a legitimate framershot path is under 200 chars, so 2000 is
// generous headroom while still blocking degenerate inputs.
export const zipRequestSchema = z.object({
  paths: z.array(z.string().min(1).max(2000)).min(1).max(200),
  filename: z.string().min(1).max(120).optional(),
});

/**
 * Turns a ZodError into one user-facing line per issue.
 * - Names the field (issue.path.join('.'))
 * - Never leaks raw zod internals (no issue.code, no ZodError dump)
 * - Used by src/config/load.js to build the ConfigError message
 *
 * @param {import('zod').ZodError} zodError
 * @returns {string[]}
 */
export function formatZodError(zodError) {
  return zodError.issues.map((issue) => {
    const field = issue.path.length ? issue.path.join('.') : '<root>';
    if (issue.code === 'invalid_type') {
      // issue.received is the documented stable field in zod 3; fall back to
      // a sentinel rather than `typeof issue.input` (issue.input is a zod 4
      // field, undefined on most zod 3 issues, so the old fallback degraded
      // to the literal string 'undefined' for every case that hit it).
      return `${field}: expected ${issue.expected}, got ${issue.received ?? 'unknown'}`;
    }
    if (issue.code === 'too_small') {
      return `${field}: ${issue.message} (minimum: ${issue.minimum})`;
    }
    if (issue.code === 'too_big') {
      return `${field}: ${issue.message} (maximum: ${issue.maximum})`;
    }
    // Catch-all: handles invalid_string (z.string().url() failure), custom, etc.
    return `${field}: ${issue.message}`;
  });
}
