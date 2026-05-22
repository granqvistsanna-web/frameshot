// src/config/schema.js
// Zod 3 schema for the full v0.1/v0.2 framershot config shape + formatZodError helper.
// NOTE: package.json declares "zod": "^3", resolving to zod 3.x at install time.
//   - Use `z.string().url()` (the zod 3 form). The top-level `z.url()` exists in
//     zod v4 but is undefined in zod 3.x. Both `import { z }` and `import * as z`
//     work in zod 3; we use the named export form.
import { z } from 'zod';

// v0.1 singular shape — kept for the singular-alias input path (name is optional).
// Do NOT delete: the root mutual-exclusivity refinement still uses this for the
// `viewport:` field, and the normalize transform reads from it.
const viewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  name: z.string().min(1).optional(),
});

// v0.2 plural shape — `name` is REQUIRED per D-02 so the {viewport} placeholder
// in output templates can never silently produce identical paths for two viewports.
export const viewportEntrySchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  name: z.string().min(1),
});

// Array of 1+ viewport entries with unique names.
// .superRefine gives fine-grained control over path + message so formatZodError's
// catch-all renders it as `viewports: duplicate name '<dup>'` (per D-02).
export const viewportsSchema = z.array(viewportEntrySchema).min(1).superRefine((arr, ctx) => {
  const seen = new Set();
  for (const entry of arr) {
    if (seen.has(entry.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['viewports'],
        message: `duplicate name '${entry.name}'`,
      });
      return; // report only the first duplicate (cleaner UX)
    }
    seen.add(entry.name);
  }
});

const pageSchema = z.object({
  // Leading slash enforced — gives a clear error when user writes `home` instead of `/home`
  path: z.string().startsWith('/'),
  // name is REQUIRED (not optional) — 02-03's template resolver substitutes it into {page}
  name: z.string().min(1),
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
  })
  // Entire `prepare` block is optional in YAML — .default({}) lets minimal configs omit it
  .default({});

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
  // output: just string min(1) — placeholder enforcement belongs to the template resolver
  output: z.string().min(1),
  deviceScaleFactor: z.number().min(1).max(3).default(2),
  // v0.1 singular alias — optional at the field level; mutual exclusivity enforced below.
  viewport: viewportSchema.optional(),
  // v0.2 plural form — optional at the field level; mutual exclusivity enforced below.
  viewports: viewportsSchema.optional(),
  page: pageSchema,
  prepare: prepareSchema,
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
  })
  .transform((data) => {
    // Normalize singular → plural.  If `viewport:` was supplied, convert it to
    // a one-element `viewports:[]` with name defaulting to 'default' (matching
    // the v0.1 fallback in runCapture.js:36 and cli.js:46).
    // The returned object omits `viewport` so downstream consumers see ONLY
    // `config.viewports` — zero branching outside this boundary.
    const { viewport, viewports, ...rest } = data;
    if (viewport !== undefined) {
      return {
        ...rest,
        viewports: [{ width: viewport.width, height: viewport.height, name: viewport.name ?? 'default' }],
      };
    }
    // viewports[] was supplied — pass through as-is.
    return { ...rest, viewports };
  });

/**
 * @typedef {z.infer<typeof configSchema>} ResolvedConfig
 *
 * Always exposes `viewports: Array<{ name: string, width: number, height: number }>`.
 * The v0.1 singular `viewport:` input form is absorbed by the schema transform at this
 * boundary — no downstream consumer ever reads `config.viewport` (singular).
 */

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
