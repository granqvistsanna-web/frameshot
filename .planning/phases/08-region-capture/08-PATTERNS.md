# Phase 8: Region Capture - Pattern Map

**Mapped:** 2026-05-22
**Files analyzed:** 9 (1 new module, 1 new YAML fixture, 7 modified)
**Analogs found:** 9 / 9 (all in-repo; zero external lookups)

Like Phase 7, this is a feature-addition phase where every modification self-extends a v0.1 file. The only genuinely-new module (`src/capture/region.js`) has three excellent in-repo analogs: `src/capture/index.js` for the "presentation-free capture orchestrator" shape, `src/browser/launcher.js` for the typed-error class shape, and `src/capture/frames.js` for the exact `page.screenshot({ clip })` + scroll + rAF pattern. **Zero new dependencies. Zero new external lookups.**

Phase 8 also inherits the Phase 7 shape contract verbatim: array-returning `runCapture`, per-iteration `try/finally` lifecycle, per-event `viewport` scoping. The Phase 8 additions slot inside Phase 7's already-loop-shaped body — the region loop becomes an inner loop nested inside Phase 7's viewport loop.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/capture/region.js` (NEW) | capture module (library, presentation-free) | request-response (page + regionCfg → PNG file) | `src/capture/index.js` (orchestrator) + `src/capture/frames.js` (clip/scroll/rAF math) + `src/browser/launcher.js` (typed-error class) | composite — three exact analogs |
| `src/config/schema.js` | schema | validate + normalize | `src/config/schema.js` (current viewportSchema + baseUrl `.refine` + prepareSchema `.default({})`) | self-extend (exact) |
| `src/config/load.js` | loader/normalize boundary | parse → validate | `src/config/load.js` (current 4-step pipeline) | self-extend (unchanged) |
| `src/capture/runCapture.js` | seam (library, presentation-free) | sequential nested loop, event-stream | `src/capture/runCapture.js` (Phase 7's viewport loop body) | self-extend (exact) |
| `src/output/template.js` | template resolver (pure) | string transform | `src/output/template.js` (existing `.replaceAll` chain + `slugify`) | self-extend (exact) |
| `src/cli.js` | wiring (ora adapter, commander options) | event-stream consumer | `src/cli.js` `capture` command's `.option('--smoke', ...)` + Phase 7's array consumer | self-extend (exact) |
| `src/cli/format.js` | error dispatcher | dispatch by `instanceof` | `src/cli/format.js` Guard 2 (ConfigError) + Guard 3 (BrowserError) — same dispatcher shape | self-extend (exact) |
| `samples/serve-smoke.js` | fixture HTML | static HTML | `samples/serve-smoke.js` current PREP-01..PREP-04 fixture sections | self-extend (exact) |
| `samples/smoke-regions.yaml` (NEW) | fixture | static YAML | `samples/smoke.yaml` + Phase 7's `samples/smoke-multi.yaml` (sibling-to-be) | exact shape sibling |

**`src/server/index.js`** — NOT modified by Phase 8 per RESEARCH §Code Touchpoints (line 1009: "No changes beyond Phase 7's array-handling — region results just have an extra optional `regionName` field"). Phase 7's wiring update covers Phase 8's needs.

---

## Pattern Assignments

### `src/capture/region.js` (NEW — capture module)

**Three analogs compose the new file:**

#### Analog A — `src/capture/index.js` (presentation-free orchestrator shape)

**File header pattern to copy** (`src/capture/index.js:1-31`) — sets the library posture this new module must inherit verbatim:
```javascript
// src/capture/index.js
// Phase 5 wave 2: scroll-stitch orchestrator + barrel. Single import surface
// for src/cli.js — the CLI imports captureFullPage from HERE (no direct
// import from frames.js or stitch.js).
//
// Exports:
//   - captureFullPage(page, outputPath, options?) → void
//     options.onProgress: (current: number, total: number) => void  ← Phase 6 contract
//
// IMPORTANT: This module has NO console output, NO process.exit, and NO chalk/ora.
// It is pure library code. Errors from composed calls bubble; the caller
// (src/cli.js) owns presentation, the try/finally lifecycle, and exit codes.
// NO try/catch around the composed calls.
//
// Lifecycle: takes a prepared Page (Phase 4 already ran) and a resolved output
// path (Phase 2 already resolved). Produces a PNG file on disk. Does NOT close
// the page, context, or browser — the CLI owns lifecycle.
```

**Imports + mkdir-on-dirname pattern** (`src/capture/index.js:32-33, 70-71`):
```javascript
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// ...inside captureRegion, after computing pngBuffer or before page.screenshot:
await mkdir(dirname(outputPath), { recursive: true });
// then either writeFile(outputPath, buf) OR page.screenshot({ path: outputPath, ... })
```

The new `captureRegion` uses `page.screenshot({ path: outputPath, clip, ... })` directly (Playwright writes the file), so the `writeFile` step from the orchestrator is replaced by the `path:` option — but `mkdir(dirname(...), { recursive: true })` STILL must run first because Playwright does NOT create parent directories. (RESEARCH.md:687 confirms this in the proposed code.)

**Critical fs invariant carry-over** (`src/capture/index.js:25-30`): `mkdir(dirname(outputPath))`, NOT `mkdir(outputPath)` — the latter creates a directory NAMED foo.png and then the screenshot fails with EISDIR. Same pitfall, same fix.

#### Analog B — `src/capture/frames.js` (clip + scroll + rAF pattern)

**The exact `page.screenshot({ clip })` invocation to mirror** (`src/capture/frames.js:114-129`) — copy the full options bag verbatim, only `clip` differs:
```javascript
// Screenshot this viewport in physical pixels:
//   - clip in CSS pixels (Playwright types.d.ts:24276-24296)
//   - scale: 'device' → output = CSS × DSR physical pixels (CAP-02 retina)
//   - animations: 'disabled' — belt-and-braces with Phase 4's CSS guards
//   - type: 'png' — explicit for self-documenting code
//   - background is preserved (Risk 16 — page's own background is wanted)
//   - clip-based capture only (Risk 1 — project gate: manual stitch)
const buf = await page.screenshot({
  clip: { x: 0, y: 0, width: viewportWidth, height: viewportHeight },
  animations: 'disabled',
  scale: 'device',
  type: 'png',
});
```

For Phase 8, the only difference is `clip` is derived from `boundingBox + padding` (not from a viewport offset), and `path: outputPath` is added since `captureRegion` writes its own file:
```javascript
await page.screenshot({
  path: outputPath,
  clip,                         // computed from boundingBox + padRect + clampToDocument
  scale: 'device',              // SAME — CAP-02 retina contract
  animations: 'disabled',       // SAME — Phase 4 belt-and-braces
  type: 'png',                  // SAME
});
```

**The scroll + rAF pattern to mirror** (`src/capture/frames.js:103-112`) — Phase 8's anchor mode must call this exact sequence before its `page.screenshot({ clip })` so the clip rect intersects the viewport (RESEARCH §Pitfall 1):
```javascript
// (a) Scroll instantly to target position (Risk 7 — NEVER 'smooth').
await page.evaluate((targetY) => {
  window.scrollTo({ top: targetY, behavior: 'instant' });
}, y);

// (b) Wait ONE rAF roundtrip for paint to settle (Risk 8, Pitfall 3 —
//     Phase 4's scrollPrime already triggered lazy-load IOs so we only need
//     layout/paint to settle here; a fixed timeout would add ~200ms × nFrames
//     of waste with no benefit).
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
```

`behavior: 'instant'` is the locked invariant (`frames.js:103, 105`; `scroll.js:52,59` mirror). NEVER `'smooth'` — animates over ~300ms and races with the rAF wait, leaving sticky elements at wrong positions.

**Geometry-once invariant** (`src/capture/frames.js:74-82`) — Phase 8 uses a single `page.evaluate` to read `document.documentElement.scrollWidth/scrollHeight` inside `clampToDocument` (RESEARCH.md:631-639). Same pattern: one round-trip, multiple props:
```javascript
const { docWidth, docHeight } = await page.evaluate(() => ({
  docWidth: document.documentElement.scrollWidth,
  docHeight: document.documentElement.scrollHeight,
}));
```

#### Analog C — `src/browser/launcher.js` (typed-error class shape)

**The `BrowserError` template to copy verbatim** (`src/browser/launcher.js:14-27`) — this is the established typed-error pattern Phase 8's `RegionError` MUST match exactly:
```javascript
/**
 * Named Error subclass for browser-layer failures (Chromium launch errors).
 * Mirrors Phase 2's ConfigError pattern so the top-level catch in src/cli.js
 * can distinguish browser failures from config failures for Phase 6's error
 * formatting work. The original Playwright error is preserved on `.cause` for
 * debugging while the `.message` stays clean for end-user display.
 */
export class BrowserError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'BrowserError';
    if (cause) this.cause = cause;
  }
}
```

**`RegionError` to add** (exported from `src/capture/region.js` per RESEARCH §Pattern 4):
```javascript
/**
 * Named Error subclass for region-capture failures: selector matched nothing,
 * anchor matched nothing, element has no bounding box (display:none), or
 * --only=<name> references an undeclared region. Mirrors BrowserError /
 * ConfigError shape; consumed by formatError's dispatcher in src/cli/format.js.
 */
export class RegionError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'RegionError';
    if (cause) this.cause = cause;
  }
}
```

#### Phase 8 specifics — pure-math helpers (no analog needed; trivial geometry)

Three pure functions live alongside `captureRegion` in `src/capture/region.js` (RESEARCH.md:613-640). They have no in-repo analog because v0.1 has no bounding-box math — but they're 4-line functions that don't need one:
- `padRect(box, padding)` — expands rect uniformly (RESEARCH §Pattern 3)
- `unionRect(a, b)` — bounding-box union (RESEARCH §Pattern 2 step 4)
- `clampToDocument(page, rect)` — clamps to `[0, docW] × [0, docH]` (RESEARCH §Pitfall 4)

**Full proposed shape** (already drafted by research at RESEARCH.md:600-695): selector mode → count-check → `scrollIntoViewIfNeeded` → `boundingBox` null-check → `padRect` → `clampToDocument` → `page.screenshot({ clip })`. Anchor mode adds union math between scrolls and a final re-scroll to `Math.max(0, clip.y)` so the clip intersects the viewport.

---

### `src/config/schema.js` (schema, validate + normalize)

**Analog:** itself — extend the zod schema with three new schemas + cross-field refinement.

**Existing viewportSchema** (`src/config/schema.js:9-13`) — base shape for the new region schemas. Same `z.object` + `z.number().int().positive()` posture:
```javascript
const viewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  name: z.string().min(1).optional(),
});
```

**Existing prepareSchema with `.default({})`** (`src/config/schema.js:22-34`) — the precedent for "default-when-omitted" YAML ergonomics. Phase 8's `padding` field uses the same `.default()` pattern at the scalar level:
```javascript
const prepareSchema = z
  .object({
    animations: z.boolean().default(true),
    hide: z.array(z.string()).default([]),
    scrollPrime: z.boolean().default(true),
    extraDelay: z.number().int().min(0).default(0),
  })
  .default({});
```

Phase 8 mirror: `padding: z.number().int().min(0).default(0)` on every region entry (RESEARCH.md:774, 781, 791).

**Existing `.refine` pattern** (`src/config/schema.js:42-47`) — the single established refinement style in the codebase. Predicate-returns-boolean + `{ message }` object. Use this exact shape for all Phase 8 cross-field refinements (root `regions` uniqueness, output-template `{region}` requirement):
```javascript
baseUrl: z
  .string()
  .url()
  .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
    message: 'baseUrl must use http or https',
  }),
```

**Existing root `configSchema`** (`src/config/schema.js:36-54`) — add `regions: z.array(regionSchema).optional()` here, then chain a `.superRefine` at the root level for the cross-field `{region}`-in-output check (RESEARCH.md:825-834). The `.refine` precedent above produces single-issue refinements; `.superRefine` is the right tool when emitting issues at non-root `path:` arrays (like `path: ['output']`) or multiple issues per call.

**Existing `formatZodError` catch-all** (`src/config/schema.js:83-84`) — UNCHANGED. The catch-all already handles `z.ZodIssueCode.custom` refinement issues correctly:
```javascript
// Catch-all: handles invalid_string (z.string().url() failure), custom, etc.
return `${field}: ${issue.message}`;
```

All Phase 8 refinement messages (`"region 'hero': use 'selector' OR 'from'+'to', not both"`, `"regions: names must be unique"`, `"output: template must contain {region} when regions are declared"`) flow through this catch-all unchanged.

**The three new schemas** (Phase 8 spec, drawn from RESEARCH.md:769-834 — already fully drafted):
1. `selectorRegionSchema` — `{ name, selector, padding? }` shape
2. `anchorRegionSchema` — `{ name, from, to, padding? }` shape
3. `regionSchema` — single shape with `.superRefine` enforcing selector-XOR-(from+to) gate, emitting custom issues with actionable messages

Note: research recommends a single `z.object().superRefine()` over `z.union([selectorRegionSchema, anchorRegionSchema])` because union errors degrade to "Invalid input — expected one of these shapes" while superRefine messages stay actionable (RESEARCH.md:109).

---

### `src/config/load.js` (loader/normalize boundary)

**Analog:** itself — UNCHANGED. RESEARCH §Code Touchpoints (line 1000) confirms: "No changes — zod validation already covers the new schema."

The existing 4-step pipeline (`src/config/load.js:37-82`) — resolve path → read file → parse YAML → `configSchema.safeParse` → throw ConfigError on failure — handles the new `regions:` block automatically because the schema absorbs it. The error path stays identical:
```javascript
// Step 4 — Validate
const result = configSchema.safeParse(parsed);
if (!result.success) {
  const lines = formatZodError(result.error);
  throw new ConfigError(`Invalid config in ${absPath}:\n  ${lines.join('\n  ')}`);
}
return result.data;
```

All new failure modes (duplicate region names, malformed selector/anchor entry, missing `{region}` in output template when regions present) surface as `ConfigError` with `Invalid config in <path>:\n  <field>: <message>` shape — exactly v0.1.

---

### `src/capture/runCapture.js` (the seam — region loop nests inside viewport loop)

**Analog:** itself — extends Phase 7's already-loop-shaped body with an inner region loop + `only` filter + `--smoke`/`--only` interaction (no — that lives in CLI; runCapture only gets `only`).

**Existing single-flow body** (`src/capture/runCapture.js:34-69`) — the Phase 7 baseline (per Phase 7 PATTERNS.md line 105) wraps lines 35-63 in `for (const vp of config.viewports) { ... }`. Phase 8 adds an inner branch:
```javascript
// Inside Phase 7's per-viewport iteration (after prepare pipeline + warning emit),
// REPLACE the single captureFullPage call with the Phase 8 region/full branch:

const targets = resolveRegions(config.regions, only);  // returns [] when no region work

if (targets.length === 0) {
  // Full-page path — unchanged from Phase 7. (Phase 8 OQ #1 lock A: no `regions:` AND no --only.)
  onProgress({ type: 'step', viewport: vp.name, label: 'Capturing frame 0/?' });
  await captureFullPage(navigatedPage, outputPath, {
    onProgress: (current, total) => {
      onProgress({ type: 'frame', viewport: vp.name, current, total });
    },
  });
  results.push({ outputPath, hideSummary, viewportName: vp.name });
} else {
  // Region path — one PNG per region per viewport.
  for (const region of targets) {
    const regionPath = resolveTemplate(config.output, {
      date, viewport: vp.name, page, region: region.name,
    });
    await captureRegion(navigatedPage, region, regionPath, {
      onProgress: (event) => onProgress({ ...event, viewport: vp.name }),
    });
    results.push({ outputPath: regionPath, hideSummary, viewportName: vp.name, regionName: region.name });
  }

  // Per Phase 8 OQ #1 resolved (A): when `regions:` present AND no --only,
  // also capture full-page. When --only is set, skip full-page.
  if (only === undefined && targets.length === config.regions.length) {
    // "regions block present, no --only" path — also capture full-page (RESEARCH §Pitfall 6).
    onProgress({ type: 'step', viewport: vp.name, label: 'Capturing full page' });
    await captureFullPage(navigatedPage, outputPath, {
      onProgress: (current, total) => onProgress({ type: 'frame', viewport: vp.name, current, total }),
    });
    results.push({ outputPath, hideSummary, viewportName: vp.name });
  }
}
```

**Existing onProgress contract** (`src/capture/runCapture.js:40, 43, 46, 49, 53, 56`) — Phase 7 adds `viewport: vp.name` to every event. Phase 8 adds a per-region `{ type: 'step', viewport, label: 'Capturing region <name>' }` event from inside `captureRegion` (RESEARCH.md:643). The `captureRegion` callback is wrapped in runCapture to inject the per-viewport scope:
```javascript
onProgress: (event) => onProgress({ ...event, viewport: vp.name })
```

This is the SAME pattern Phase 7 uses for the viewport-tagged frame events — just extended one layer.

**Existing `try/finally` lifecycle** (`src/capture/runCapture.js:42-68`) — PRESERVE PER VIEWPORT ITERATION (per Phase 7 PATTERNS.md):
```javascript
} finally {
  // ORDER MATTERS: context first, then browser. (06-RESEARCH §Pitfall 5)
  await context.close();
  await browser.close();
}
```

Phase 8 changes nothing here. The inner region loop's throws bubble to Phase 7's per-iteration `try`, which lets `finally` close the context+browser for the failed viewport, then bubbles up the throw — fail-fast preserved (per Phase 7 D-05 locked-behavior).

**`resolveRegions` helper** — Phase 8's NEW helper (lives inside `runCapture.js` or in `src/capture/region.js`; planner's call). Validates `--only=<name>` against `config.regions`, throws `RegionError` on unknown name (RESEARCH.md:488-497):
```javascript
function resolveRegions(regions, only) {
  if (only === undefined) {
    // No --only filter: return all regions (may be empty array if no regions: block).
    return regions ?? [];
  }
  // --only filter: must match a declared region.
  const declared = regions ?? [];
  const match = declared.find((r) => r.name === only);
  if (!match) {
    const names = declared.map((r) => `'${r.name}'`).join(', ') || '<no regions declared>';
    throw new RegionError(`Unknown --only region '${only}'. Declared regions: ${names}.`);
  }
  return [match];
}
```

Note this is the EARLIEST legal point for the unknown-`--only`-name check — schema validation can't see the CLI flag (RESEARCH.md:83 in Architectural Responsibility Map).

**Existing return shape** (Phase 7 PATTERNS.md line 145) — array, with optional `regionName`:
```javascript
// Phase 7: Array<{ outputPath, hideSummary, viewportName }>
// Phase 8: Array<{ outputPath, hideSummary, viewportName, regionName? }>
// regionName is set when the entry is a region capture, undefined for full-page.
```

This is what RESEARCH §Code Touchpoints (line 1004) means by "Phase 7's array shape extends naturally."

---

### `src/output/template.js` (template resolver — `{region}` placeholder)

**Analog:** itself — extend the `.replaceAll` chain with one line.

**Existing chain** (`src/output/template.js:27-35`):
```javascript
export function resolveTemplate(template, { date, viewport, page }) {
  // {date} is NOT slugified — YYYY-MM-DD hyphens are intentional and path-safe.
  // {viewport} and {page} ARE slugified — handles spaces, unicode, etc.
  // The template itself is NOT slugified — '/' path separators must survive.
  return template
    .replaceAll('{date}', date)
    .replaceAll('{viewport}', slugify(viewport))
    .replaceAll('{page}', slugify(page));
}
```

**Phase 8 extension** (per RESEARCH §Pattern 5 + RESEARCH.md:1001):
```javascript
export function resolveTemplate(template, { date, viewport, page, region }) {
  return template
    .replaceAll('{date}', date)
    .replaceAll('{viewport}', slugify(viewport))
    .replaceAll('{page}', slugify(page))
    .replaceAll('{region}', region ? slugify(region) : '{region}');
  // When no region is being captured (full-page run), keep the literal — matches
  // the existing unknown-placeholder posture (template.js:6-7). Users who want
  // full-page-only captures simply don't put {region} in their template.
}
```

**Existing `slugify` function** (`src/output/template.js:14-25`) — UNCHANGED. The same SLUG_RE Unicode-aware sanitizer that strips `/`, `{`, `}`, etc. handles region names. Per RESEARCH §Security: path-traversal via `../../etc/passwd` is neutralized because `slugify` strips structural chars.

**Header comment to preserve** (`src/output/template.js:6-7`):
```javascript
// Unknown placeholders (e.g. {foo}) are left literal — typos surface visibly
// in the output path rather than silently being dropped.
```

This is exactly the precedent for "when `region` arg is undefined, leave `{region}` literal" — same defensive posture (RESEARCH.md:48).

---

### `src/cli.js` (wiring — `--only` option + array consumer + smoke/only mutex)

**Analog:** itself — three surgical updates.

#### (a) Add `--only` option declaration

**Existing `--smoke` option** (`src/cli.js:31`) — the pattern for adding a commander option to the `capture` command:
```javascript
.option('--smoke', 'Phase 3 verification: launch, navigate, take ONE screenshot, exit')
```

Phase 8 sibling addition (RESEARCH.md:476, 706):
```javascript
.option('--only <region-name>', 'Capture only the named region (skips full-page stitch)')
```

Note `<region-name>` (angle brackets → required value) NOT `[region-name]` (square brackets → optional value). The `-p, --port <port>` option at `src/cli.js:113` is the in-repo precedent for required-value options.

#### (b) Smoke/only mutual exclusion

**Existing smoke branch entry** (`src/cli.js:40`):
```javascript
if (opts.smoke) { ... }
```

Phase 8 adds a guard BEFORE the smoke branch (RESEARCH §Pitfall 8, RESEARCH.md:710-712):
```javascript
if (opts.smoke && opts.only) {
  throw new Error('--smoke and --only are mutually exclusive');
}
```

(This throws an unwrapped Error which the top-level catch in `index.js` formats via formatError's default branch — `chalk.red('Unexpected error:')`. That's not the cleanest surface; the planner may choose to wrap in `RegionError` instead to get the clean `chalk.red('Error:')` branch. Both work; RegionError is the more polished call.)

#### (c) Non-smoke branch — pass `only` through and consume array (Phase 7 contract)

**Existing non-smoke `runCapture` call** (`src/cli.js:90-102`) — Phase 7 already changes this to consume an array:
```javascript
const { outputPath } = await runCapture(config, {
  onProgress: (event) => {
    if (event.type === 'step') { spinner.text = event.label; }
    // ... frame, warning events ...
  },
});
spinner.succeed(`screenshot written: ${outputPath}`);
console.log(`screenshot written: ${outputPath}`);
```

Phase 7's PATTERNS.md (lines 202-209) updates this to:
```javascript
const results = await runCapture(config, { onProgress: (event) => { ... } });
spinner.succeed(`${results.length} screenshot(s) written`);
for (const { outputPath } of results) {
  console.log(`screenshot written: ${outputPath}`);
}
```

Phase 8 layers ONE addition: pass `only: opts.only` through, and label per-result lines with the region name when present (RESEARCH.md:722-735):
```javascript
const results = await runCapture(config, {
  onProgress: (event) => { /* Phase 7's per-viewport mapping unchanged */ },
  only: opts.only,                      // PHASE 8 NEW — string | undefined
});
spinner.succeed(`${results.length} screenshot(s) written`);
for (const r of results) {
  const label = r.regionName ? `region '${r.regionName}'` : 'full page';
  console.log(`screenshot written (${label}): ${r.outputPath}`);
  // ^ duplicate to stdout so paths are pipe-capturable — 06-RESEARCH §Pitfall 6
}
```

**Existing onProgress→spinner.text sandwich** (`src/cli.js:96-100`) — `spinner.stop() → printSelectorWarnings → spinner.start()` is the precedent for "non-trivial console writes between spinner frames." Phase 8 region-capture events flow through the same Phase 7-tagged mapping (`[<viewport>] Capturing region '<name>'`); no new sandwich required.

#### (d) Smoke branch unchanged for Phase 8

The smoke branch (`src/cli.js:40-83`) is NOT modified by Phase 8 beyond Phase 7's `config.viewports[0]` field rename. The smoke path is explicitly mutually-exclusive with `--only` (per (b) above), so it never needs to know about regions.

---

### `src/cli/format.js` (error dispatcher — `RegionError` branch)

**Analog:** itself — add Guard 4 mirroring Guards 2 and 3 verbatim.

**Existing import block** (`src/cli/format.js:7-9`):
```javascript
import { ConfigError } from '../config/load.js';
import { BrowserError } from '../browser/launcher.js';
```

Phase 8 sibling addition (RESEARCH.md:1008):
```javascript
import { RegionError } from '../capture/region.js';
```

**Existing Guard 2 (ConfigError)** (`src/cli/format.js:102-106`) — the shape to mirror:
```javascript
// Guard 2: ConfigError — message already formatted by formatZodError inside loadConfig.
// Only red the 'Error:' prefix; body stays default color (§Pitfall 3).
if (err instanceof ConfigError) {
  return `${chalk.red('Error:')} ${err.message}`;
}
```

**Phase 8 Guard 4 (RegionError)** — drop in immediately after Guard 3 (BrowserError, line 110-116) and before Guard 4 (bare TimeoutError, line 119) — i.e. at the existing line 117 position. Same shape as ConfigError (RESEARCH.md:408-411):
```javascript
// Guard 4 (Phase 8): RegionError — element missing, anchor missing, or unknown --only name.
// Same shape as ConfigError: message is already actionable; only red the prefix.
if (err instanceof RegionError) {
  return `${chalk.red('Error:')} ${err.message}`;
}
```

**No body coloring** (`src/cli/format.js:89`) — per the existing `formatError` contract: "Do NOT chalk the body of ConfigError/BrowserError messages (§Pitfall 3)." RegionError follows the same rule.

**No stack trace** — per `src/cli/format.js:90-91`: "Do NOT print stack traces for ConfigError or BrowserError — those are expected/actionable errors; stack adds noise." Same for RegionError.

**Server-side `errorToMessage`** (`src/server/index.js:172-180`) — Phase 8 may also want to add a RegionError branch here for consistent server-side messages, but RESEARCH §Code Touchpoints explicitly says server is unchanged. If the planner adds it, mirror the existing branches:
```javascript
if (err instanceof RegionError) return `Region: ${err.message}`;
```

---

### `samples/serve-smoke.js` (fixture HTML — add named selector sections)

**Analog:** itself — extend the inline HTML with new `data-test`-tagged sections.

**Existing fixture sections** (`samples/serve-smoke.js:42-86`) — the established pattern is "one section per requirement exercise, marked with `data-test=<id>`":
```html
<!-- PREP-01 fixture: .anim-target has animation: spin 2s linear infinite. -->
<div class="anim-target" data-test="anim-target"></div>

<!-- PREP-02 fixture: .io-target starts at opacity: 0. -->
<div class="io-target" data-test="io-target" style="...">...</div>

<!-- PREP-03 fixture: .hidden-by-test is matched by smoke.yaml's hide: array. -->
<div class="hidden-by-test" data-test="hidden-by-test" style="...">...</div>

<!-- PREP-04 fixture: 2000px spacer + lazy <img>. -->
<div style="height: 2000px; background: linear-gradient(#c00, #00c);"></div>
<img data-test="lazy-img" loading="lazy" ... />
```

**Phase 8 additions** (per RESEARCH §Code Touchpoints line 1010 + RESEARCH §Validation Architecture Wave 0 line 937):
```html
<!-- REGION-01 fixture: a single named element for selector-region capture.
     smoke-regions.yaml's first region targets [data-test="region-hero"]. -->
<section data-test="region-hero" style="margin: 2rem; padding: 2rem; background: #036; color: #fff;">
  <h2>Region hero (selector capture target)</h2>
  <p>This is the entire selector region. Padding should produce visible margin around it.</p>
</section>

<!-- REGION-02 fixture: two anchor elements with distance between them.
     smoke-regions.yaml's second region uses from=[data-test=region-from] to=[data-test=region-to].
     The captured PNG should span the union of both boxes, padded. -->
<div data-test="region-from" style="margin: 2rem; padding: 1rem; background: #063; color: #fff;">
  Anchor: from (top of region)
</div>
<div style="height: 400px; background: linear-gradient(#063, #630);"></div>
<div data-test="region-to" style="margin: 2rem; padding: 1rem; background: #630; color: #fff;">
  Anchor: to (bottom of region)
</div>
```

**Placement** — slot these sections after the PREP-04 lazy `<img>` (around line 84) but before the closing `<footer>`. The existing PREP-04 spacer pushes them below the fold so `scrollIntoViewIfNeeded` must actually scroll to reveal them — exercising REGION-01/02's scroll-then-measure flow.

**Server lifecycle, port, startup pattern** — UNCHANGED. Same `PORT = 7357`, same `127.0.0.1`-bound listen, same SIGTERM/SIGINT/SIGHUP cleanup. The existing fixture server is reused per RESEARCH §Open Question #3 recommendation A — one server, multiple `.yaml` fixtures.

---

### `samples/smoke-regions.yaml` (NEW fixture)

**Analog:** `samples/smoke.yaml` (the back-compat fixture) + Phase 7's `samples/smoke-multi.yaml` (sibling-to-be — same Phase 7-vs-Phase 8 sibling relationship as smoke.yaml-vs-smoke-multi.yaml).

**Pattern to copy from `samples/smoke.yaml:1-50`** — header comment block + standard fields + prepare block:
```yaml
# smoke.yaml — Phase 3 hermetic smoke fixture.
# [... documenting why baseUrl points at the localhost fixture server ...]
#
# To run this smoke locally:
#   node samples/serve-smoke.js &
#   node index.js capture samples/smoke.yaml --smoke
#   kill %1

name: phase-04-smoke
baseUrl: http://127.0.0.1:7357
output: /tmp/framershot-smoke/{page}.png
deviceScaleFactor: 2
viewport:
  width: 800
  height: 600
  name: smoke
page:
  path: "/"
  name: home
prepare:
  animations: true
  hide:
    - '.hidden-by-test'
    - '.does-not-exist'
  scrollPrime: true
  extraDelay: 1000
```

**Phase 8 adaptation** (RESEARCH.md:741-765 has the full draft):
```yaml
# smoke-regions.yaml — Phase 8 hermetic smoke fixture for REGION-01/02/03.
#
# Demonstrates:
#   - REGION-01: selector region capture ('hero')
#   - REGION-02: anchor region capture ('cards' spans from→to)
#   - REGION-03: --only=<name> isolation (separate invocation in run instructions)
#
# Reuses samples/serve-smoke.js (extended in Phase 8 with new data-test sections).
# Output template uses {region} placeholder so all regions write to distinct paths.
#
# To run this smoke locally:
#   node samples/serve-smoke.js &
#   node index.js capture samples/smoke-regions.yaml                # both regions + full page
#   node index.js capture samples/smoke-regions.yaml --only=hero    # ONLY hero
#   kill %1

name: phase-08-smoke-regions
baseUrl: http://127.0.0.1:7357
output: /tmp/framershot-smoke-regions/{region}-{page}.png
deviceScaleFactor: 2
viewport:                       # singular form per back-compat (Phase 7 D-01 input alias)
  width: 800
  height: 600
  name: smoke
page:
  path: "/"
  name: home
prepare:
  animations: true
  scrollPrime: true
  extraDelay: 500
regions:
  - name: hero                  # REGION-01: selector mode
    selector: '[data-test="region-hero"]'
    padding: 20
  - name: cards                 # REGION-02: anchor mode
    from: '[data-test="region-from"]'
    to: '[data-test="region-to"]'
    padding: 10
```

**Key fixture choices that follow established Phase 4-7 fixture style:**
- Same fixture server (`samples/serve-smoke.js` extended with new sections per RESEARCH §Open Question #3 lock A)
- Output under `/tmp/` (no `.gitignore` work — matches `smoke.yaml` choice)
- `{region}` in the output template — this fixture IS the REGION-01/02 evidence (no overwrites across regions)
- Singular `viewport:` form (NOT `viewports:`) — exercises the Phase 7 D-01 back-compat alias, keeping the fixture single-viewport to keep test surface clean (multi-viewport × multi-region is Phase 8's natural test, but adding both at once muddies the per-requirement evidence)
- No `hide:` block — region-capture path doesn't need the hide-warning machinery to be exercised; that's already covered by `smoke.yaml`

---

## Shared Patterns

These cross-cutting patterns apply to multiple Phase 8 files. Sourced from v0.1 / Phase 7 code that the planner MUST NOT reinvent.

### Typed Error Class Shape
**Source:** `src/browser/launcher.js:21-27` (BrowserError) + `src/config/load.js:17-22` (ConfigError)
**Apply to:** New `RegionError` in `src/capture/region.js`
**Pattern:** ES class extending Error; sets `this.name`; optional `{ cause }` second arg preserved on `this.cause`. Exported from the module that throws it (BrowserError lives where Chromium-launch failures originate; ConfigError lives where config-validation failures originate; RegionError lives in `src/capture/region.js` where region failures originate). The dispatcher in `src/cli/format.js` imports it.

### Error Dispatcher Branch
**Source:** `src/cli/format.js:104-116` (Guards 2 and 3 — ConfigError + BrowserError)
**Apply to:** New Guard 4 (RegionError) in `src/cli/format.js`
**Pattern:** Single `if (err instanceof <Class>) return chalk.red('Error:') + ' ' + err.message;` line. Body NOT chalked (Pitfall 3). No stack trace. Insert after Guard 3 (BrowserError) and before Guard 5 (bare TimeoutError) — preserves dispatcher precedence: typed errors first, fall-through to defaults last.

### Presentation-free Library Posture
**Source:** `src/capture/runCapture.js:1-16` (header comment block) + `src/capture/index.js:13-16` + `src/capture/frames.js:8-12`
**Apply to:** `src/capture/region.js` (new), `src/capture/runCapture.js` (modify)
**Pattern:** No `console.*`, no `process.exit`, no `chalk`/`ora` in `src/{browser,capture,prepare,config,output}/`. All progress flows through `onProgress` callback events; all errors throw typed errors. Phase 8's `captureRegion` emits `{ type: 'step', label: "Capturing region '<name>'" }` events (RESEARCH.md:643); runCapture wraps them with `viewport: vp.name` for Phase 7's per-viewport scoping. The library NEVER imports from `src/cli/`.

### Single Error Sink in `index.js` (fail-fast)
**Source:** Project root `index.js` (top-level catch) + `src/cli.js:11-18` (currentSpinner module-level ref)
**Apply to:** All Phase 8 throw sites
**Pattern:** First region that throws (selector mismatch, anchor mismatch, unknown `--only`, padding-pushed-clip-outside, null bounding-box) aborts the run. RunCapture's nested loops let the throw propagate through both region-loop AND viewport-loop `try/finally` blocks (closing the current iteration's context+browser), up to the CLI's top-level catch which calls `spinner.fail()` and exits non-zero. Phase 8 makes ZERO changes to this contract — matches Phase 7's locked fail-fast posture (Phase 7 D-05 locked-behavior).

### Playwright Screenshot Options Bag
**Source:** `src/capture/frames.js:124-129` (the canonical `page.screenshot({ clip })` invocation)
**Apply to:** Both modes inside `src/capture/region.js`
**Pattern:** Always include `scale: 'device'` (CAP-02 retina), `animations: 'disabled'` (Phase 4 belt-and-braces), `type: 'png'` (self-documenting). `clip` is in CSS pixels. NEVER `fullPage: true` (defeats Phase 5's whole reason for existence — ghosts sticky elements). NEVER `omitBackground` (the page's own background is wanted). Phase 8 adds `path: outputPath` to the bag since `captureRegion` writes its own file (vs frames.js which returns the buffer for stitch.js).

### Scroll-then-rAF-then-Screenshot
**Source:** `src/capture/frames.js:103-129` (the three-step in-loop pattern)
**Apply to:** `src/capture/region.js` anchor-mode AND any case where the clip rect needs to enter the viewport
**Pattern:**
1. `await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), targetY);` — instant, NEVER smooth
2. `await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));` — single rAF roundtrip for paint to settle
3. `await page.screenshot({ clip, ... });` — capture

This sequence is required because Playwright's `page.screenshot({ clip })` composites at the current scroll position; the clip rect must intersect the viewport (RESEARCH §Pitfall 1). For selector regions, `locator.scrollIntoViewIfNeeded()` (Playwright primitive) handles steps 1+2 atomically — skip the manual scroll. For anchor regions, the union rect's `clip.y` may be above either anchor's bounding-box scroll target, so step 1 (`scrollTo(Math.max(0, clip.y))`) MUST run between the union math and the screenshot.

### Geometry-once Invariant
**Source:** `src/capture/frames.js:74-82` (single `page.evaluate` reading multiple properties)
**Apply to:** `clampToDocument` in `src/capture/region.js`
**Pattern:** When you need 2+ properties from the page, fetch them in ONE `page.evaluate` round-trip — NOT multiple sequential awaits. Reduces protocol overhead and avoids stale-read races. `clampToDocument` reads `scrollWidth` and `scrollHeight` in one call (RESEARCH.md:631-639); Phase 5's `captureFrames` reads `innerWidth/innerHeight/scrollHeight/devicePixelRatio` in one call.

### mkdir(dirname(outputPath)) — Not mkdir(outputPath)
**Source:** `src/capture/index.js:25-30, 70-71` (header comment + implementation) + `src/cli.js:74-75` (smoke branch mirrors the pattern)
**Apply to:** `src/capture/region.js` before `page.screenshot({ path: outputPath, ... })`
**Pattern:** Always `await mkdir(dirname(outputPath), { recursive: true })` BEFORE writing. NEVER `mkdir(outputPath)` — that creates a directory named e.g. `hero-home.png` which then causes `page.screenshot({ path })` to fail with EISDIR. Same pitfall Phase 5 documented; Phase 8 inherits.

### Hermetic Smoke Fixture Pattern
**Source:** `samples/smoke.yaml` + `samples/serve-smoke.js` (Phase 3-7 fixture pattern)
**Apply to:** `samples/smoke-regions.yaml` + `samples/serve-smoke.js` extensions
**Pattern:** `node samples/serve-smoke.js &` backgrounded; capture run consumes `http://127.0.0.1:7357`; output to `/tmp/framershot-smoke*/...`; verify PNGs exist with distinct paths after the run. ONE fixture server, MANY `.yaml` configs (RESEARCH §OQ #3 lock A). `data-test` attribute tags every fixture element. No `.gitignore` work, no repo pollution, no network dependency.

### Wave-friendly File Modification Boundaries
**Source:** PROJECT.md Key Decisions ("zero `files_modified` overlap" rule) + Phase 7 PATTERNS.md §"Wave-friendly File Modification Boundaries"
**Apply to:** Phase 8 plan structure
**Pattern:** Plans that touch disjoint files can wave-parallel. Phase 8's natural seams:
- **Wave 1 (schema):** `src/config/schema.js` (new `regionSchema` + root refinement)
- **Wave 2 (capture module — depends on Wave 1's normalized shape):** `src/capture/region.js` (NEW) + `src/output/template.js` (`{region}` placeholder)
- **Wave 3 (seam — depends on Wave 2):** `src/capture/runCapture.js` (nested region loop + `only` filter + `resolveRegions` helper)
- **Wave 4 (wiring + fixtures — depends on Wave 3's return shape, but the three files touch disjoint paths so they CAN parallel each other):**
  - `src/cli.js` (`--only` option + smoke/only mutex + array-with-regionName consumer)
  - `src/cli/format.js` (RegionError Guard 4)
  - `samples/serve-smoke.js` (HTML extension) + `samples/smoke-regions.yaml` (NEW)

The CLI changes depend on RegionError being importable (Wave 2), but `src/cli.js` and `src/cli/format.js` touch disjoint files so they're parallel-safe within Wave 4. Planner can collapse Waves 1+2 if it prefers fewer waves; this is the natural dependency shape.

### Phase 7 Array-Return Contract (inherited unchanged)
**Source:** Phase 7 PATTERNS.md §"src/capture/runCapture.js" (return shape) — `Array<{ outputPath, hideSummary, viewportName }>`
**Apply to:** Phase 8 runCapture return type
**Pattern:** Phase 8 extends the SAME array shape by adding an optional `regionName: string` field on entries that are region captures (undefined for full-page entries). The CLI and server consumers iterate the array and label entries based on the presence/absence of `regionName`. No shape change beyond field addition — Phase 7's consumers continue to work with Phase 8 results because they only read `outputPath`/`viewportName` (which are present on both region and full-page entries).

### Anchor Mode Order — scroll → measure → scroll → measure (NEW pitfall)
**Source:** None in v0.1 (no precedent for two-element bounding-box math). RESEARCH §Pattern 2 step 3 documents the rule.
**Apply to:** `captureAnchorRegion` inside `src/capture/region.js`
**Pattern:** Measure each anchor's bounding box IMMEDIATELY after scrolling THAT anchor into view, NOT after scrolling both. The second `scrollIntoViewIfNeeded` may reflow the page if lazy-load triggers fire — making the first anchor's `boundingBox()` stale if read after the second scroll. Always: `scroll(from) → measure(from) → scroll(to) → measure(to)`. This is one of two Phase-8-specific gotchas with no v0.1 analog (the other is the null bounding-box check after `boundingBox()`).

---

## No Analog Found

The Phase-8-specific anchor-mode bounding-box union math has no in-repo analog because v0.1 has no two-element geometry. However:
- The 4-line `Math.min`/`Math.max` block (RESEARCH.md:622-628) is trivial pure geometry that does not need an analog — research recommends inline implementation over a "rectangle library" (RESEARCH §"Don't Hand-Roll").
- The recommended shape is fully drafted at RESEARCH.md:613-640 (`padRect`, `unionRect`, `clampToDocument`).

The new pitfalls Phase 8 introduces also have no v0.1 analogs:
- Null bounding-box on `display:none` elements (RESEARCH §Pitfall 2)
- Padding pushing clip outside document bounds (RESEARCH §Pitfall 4)
- Anchor-scroll order (RESEARCH §Pitfall 3 / above shared pattern)

These are documented in RESEARCH.md; the planner should propagate them into the new module's JSDoc comments rather than seeking in-repo precedent.

---

## Metadata

**Analog search scope:**
- `/Users/sannagranqvist/Documents/App/screenshotter/src/**` (all 17 JS files — every one touched-or-read for this map)
- `/Users/sannagranqvist/Documents/App/screenshotter/samples/**` (10 YAML/JS fixtures)
- `/Users/sannagranqvist/Documents/App/screenshotter/.planning/phases/07-multi-viewport-capture/07-PATTERNS.md` (Phase 7 analog precedent — inherited verbatim)
- `/Users/sannagranqvist/Documents/App/screenshotter/.planning/phases/08-region-capture/RESEARCH.md` (Phase 8 research — drafted shapes verified against installed Playwright types)

**Files scanned:** 17 source files + 10 fixtures + Phase 7 PATTERNS.md + Phase 8 RESEARCH.md

**Pattern extraction date:** 2026-05-22

**Key reuse decisions confirmed:**
- Zod 3 (NOT zod 4) — `.refine` with `{ message }` object form, `.superRefine` for multi-issue or non-root-path emissions, refinements surface via `formatZodError`'s catch-all
- ESM throughout; commander v12 (`-p, --port <port>` is the in-repo precedent for required-value options — `--only <region-name>` mirrors)
- `page.screenshot({ clip })` (not `locator.screenshot()`) — `clip` doesn't exist on `LocatorScreenshotOptions` per `node_modules/playwright-core/types/types.d.ts:23613-23692` (verified in RESEARCH §Standard Stack)
- `RegionError` is a new typed error class (sibling of BrowserError + ConfigError shape) — runtime failure modes that schema can't catch (RESEARCH §Pattern 4)
- One fixture server (`serve-smoke.js`) extended with new `data-test` sections — RESEARCH §OQ #3 lock A
- Singular `viewport:` in `smoke-regions.yaml` to keep test surface clean (multi-viewport × multi-region cartesian product is implicitly tested by extending into Phase 7's `smoke-multi.yaml` shape later if needed)
- Server-side (`src/server/index.js`) NOT modified by Phase 8 — Phase 7's array-handling wiring covers regions naturally (RESEARCH §Code Touchpoints line 1009)
