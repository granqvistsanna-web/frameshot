# Phase 7: Multi-viewport Capture - Pattern Map

**Mapped:** 2026-05-22
**Files analyzed:** 8 (5 modified, 1 new YAML fixture, 2 read-only references)
**Analogs found:** 8 / 8 (all in-repo, zero external lookups required)

All analogs live in this repository; v0.1 is the canonical pattern source. The seam (`runCapture`) was just extracted in commit 220ff9f — this map treats that commit's diff as the "shape we're loop-ifying." No new dependencies. ESM throughout. No new typed errors (per D-05 locked-behavior).

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/config/schema.js` | schema | validate + normalize | `src/config/schema.js` (current viewport/prepare schemas + baseUrl `.refine`) | self-extend (exact) |
| `src/config/load.js` | loader/normalize boundary | parse → validate → return | `src/config/load.js` (current 4-step pipeline) | self-extend (exact) |
| `src/capture/runCapture.js` | seam (library, presentation-free) | sequential loop over array, event-stream | `src/capture/runCapture.js` (current single-flow body) | self-extend (exact) |
| `src/browser/launcher.js` | adapter (Playwright wrapping) | request-response (config → {browser, context}) | `src/browser/launcher.js` (current `launchBrowser(config)` signature) | self-extend (exact) |
| `src/cli.js` | wiring (ora adapter) | event-stream consumer | `src/cli.js` `--smoke` branch + non-smoke branch | self-extend (exact) |
| `src/server/index.js` | wiring (SSE adapter) | event-stream producer | `src/server/index.js` `handleCapture` + `send(...)` SSE pump | self-extend (exact) |
| `samples/smoke-multi.yaml` (NEW) | fixture | static | `samples/smoke.yaml` | exact shape sibling |
| `samples/smoke.yaml` | fixture (UNCHANGED — back-compat evidence) | static | — | n/a (frozen) |

**No analog needed** for any file — every modification is a self-extension of v0.1 code. The only new file (`smoke-multi.yaml`) has a near-identical sibling.

---

## Pattern Assignments

### `src/config/schema.js` (schema, validate + normalize)

**Analog:** itself — extend the existing zod 3 schema with three additions: `viewportEntrySchema`, `viewportsSchema`, and a mutually-exclusive root refinement that also normalizes singular → plural.

**Existing viewport schema** (lines 9-13) — base shape, KEEP, and make `name` REQUIRED in the new `viewportEntrySchema` per D-02:
```javascript
const viewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  name: z.string().min(1).optional(),
});
```
The new `viewportEntrySchema` is the same shape with `name` non-optional:
```javascript
const viewportEntrySchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  name: z.string().min(1),        // REQUIRED per D-02
});
```

**Existing `.refine` pattern** (lines 36-47) — copy this exact style for the new refinements. This is the ONLY established `.refine` in the codebase, so its message-shape sets the precedent:
```javascript
baseUrl: z
  .string()
  .url()
  .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
    message: 'baseUrl must use http or https',
  }),
```
Pattern to copy: predicate-returns-boolean + `{ message: '<field>: <human reason>' }` object form. Field-named messages already flow through `formatZodError`'s catch-all (line 84, `${field}: ${issue.message}`).

**`.default({})` pattern** (line 34) — the `prepareSchema` ends with `.default({})` so YAML can omit it entirely. Use the same approach for `viewportsSchema` and the root normalization is best done via a `.transform()` after the root refinements, OR inside `loadConfig` (D-03 leaves the landing site to the planner; both are equally clean per CONTEXT.md "Integration Points").

**`formatZodError` catch-all** (lines 67-86) — UNCHANGED. The catch-all on line 84 already handles refinement issues correctly:
```javascript
// Catch-all: handles invalid_string (z.string().url() failure), custom, etc.
return `${field}: ${issue.message}`;
```
Refinement issues use `issue.code === 'custom'` and surface via this branch. No `formatZodError` changes needed.

**New refinements to add** (planner spec, not a copy — derived from D-01 and D-02):
1. Root-level: `viewport` XOR `viewports` (both → ConfigError; neither → ConfigError)
2. `viewports[]` array: 1+ entries, names unique across the array
3. Normalize step: singular `viewport: {...}` becomes `viewports: [{...}]` with `name` defaulting to `'default'` (matching current `config.viewport.name ?? 'default'` fallback in `runCapture.js:36` and `cli.js:46`)

**ZodError message shape** the planner should hit for the duplicate-name case (cited in D-02): `"viewports: duplicate name 'desktop'"` — flows through `formatZodError` catch-all.

---

### `src/config/load.js` (loader/normalize boundary)

**Analog:** itself — extend the existing 4-step pipeline. The normalize step (singular → array) goes either inside `safeParse`'s zod transform OR as a tiny step 5 between `safeParse` success and `return result.data`. CONTEXT.md leaves the choice to the planner.

**Existing 4-step pipeline** (lines 37-82) — KEEP all four steps; if normalize happens here instead of inside zod, add Step 5:
```javascript
// Step 4 — Validate
const result = configSchema.safeParse(parsed);
if (!result.success) {
  const lines = formatZodError(result.error);
  throw new ConfigError(`Invalid config in ${absPath}:\n  ${lines.join('\n  ')}`);
}
return result.data;
```

**ConfigError throw shape** (line 79) — UNCHANGED contract. Whichever path the normalize step takes (zod transform or step 5), any new validation failure (mutually-exclusive keys, duplicate names) still surfaces as a `ConfigError` with the same `Invalid config in <path>:\n  <field>: <message>` shape.

**JSDoc return type** (line 34) — `Promise<import('./schema.js').ResolvedConfig>` — update `ResolvedConfig` type alias on `schema.js:56` if the normalized output type differs from the raw zod inference (it will: `viewports` not `viewport`).

---

### `src/capture/runCapture.js` (the seam — internal loop lands here)

**Analog:** itself — the just-extracted single-flow body (commit 220ff9f) becomes the loop body. Per D-03, the loop lives inside `runCapture`; callers stay dumb adapters.

**Existing single-flow body** (lines 34-69) — wrap lines 35-63 in `for (const vp of config.viewports) { ... }`. The lifecycle `try/finally` (lines 42-68) stays PER ITERATION — each viewport gets its own `launchBrowser → context → finally { context.close(); browser.close(); }`.

**Critical lifecycle invariant** (lines 65-68) — PRESERVE PER VIEWPORT:
```javascript
} finally {
  // ORDER MATTERS: context first, then browser. (06-RESEARCH §Pitfall 5)
  await context.close();
  await browser.close();
}
```
The new loop body MUST keep this exact ordering inside each iteration. Do NOT hoist `browser` to a shared outer scope and reuse it across viewports — success criterion #3 ("Each viewport gets its own browser context — no shared state") implies a fresh `chromium.launch` per viewport too, not just a fresh context. (`launchBrowser` returns `{ browser, context }` — it launches a new browser AND a new context. Calling it N times is the correct shape.)

**Existing `outputPath` resolution** (lines 35-38) — moves INSIDE the loop, parameterized by `vp.name`:
```javascript
// Before (single):
const viewport = config.viewport.name ?? 'default';
// After (per-iteration):
const viewport = vp.name;   // name is REQUIRED on viewports[] entries per D-02
const outputPath = resolveTemplate(config.output, { date, viewport, page });
```

**Existing onProgress events** (lines 40, 43, 46, 49, 53, 56-60) — wrap in per-viewport scoping per D-03:
```javascript
// Before:
onProgress({ type: 'step', label: 'Launching Chromium' });
// After:
onProgress({ type: 'step', viewport: vp.name, label: 'Launching Chromium' });
```
All four event shapes (`step`, `frame`, `warning`, plus a new per-viewport-`done` event the server consumes) carry a `viewport: vp.name` field. The `warning` event for hide-missed selectors (line 53) also gets the viewport tag.

**Existing return shape** (line 33, 63) — array, per CONTEXT.md "Integration Points":
```javascript
// Before:
// @returns {Promise<{ outputPath: string, hideSummary: { matched: number, missed: string[] } }>}
return { outputPath, hideSummary };

// After:
// @returns {Promise<Array<{ outputPath: string, hideSummary: {...}, viewportName: string }>>}
results.push({ outputPath, hideSummary, viewportName: vp.name });
// ... after loop:
return results;
```
Fail-fast (locked behavior): if any iteration's `try` body throws, `finally` still closes that iteration's context+browser, then the throw bubbles out of the `for` loop and up to the caller. No accumulated `results` is returned on failure — matches v0.1 behavior shape.

---

### `src/browser/launcher.js` (adapter — Playwright wrapping)

**Analog:** itself — change the signature from `launchBrowser(config)` to `launchBrowser(config, viewportEntry)`. Everything else stays.

**Existing context creation** (lines 70-77) — reads from `config.viewport.{width,height}` and `config.deviceScaleFactor`. New shape reads viewport dims from the per-iteration entry, DSR still from top-level config (per D-04):
```javascript
// Before:
const context = await browser.newContext({
  viewport: {
    width: config.viewport.width,
    height: config.viewport.height,
  },
  deviceScaleFactor: config.deviceScaleFactor,
  baseURL: config.baseUrl,
});

// After:
const context = await browser.newContext({
  viewport: {
    width: viewportEntry.width,
    height: viewportEntry.height,
  },
  deviceScaleFactor: config.deviceScaleFactor,    // stays top-level per D-04
  baseURL: config.baseUrl,
});
```

**Existing BrowserError pattern** (lines 21-27, 62-68) — UNCHANGED. Per-viewport launch failures still throw `BrowserError`; the wrapped error message + `.cause` shape stay identical. No new typed error per D-05 locked-behavior.

**Existing JSDoc lifecycle contract** (lines 38-49) — update the example to reflect the per-viewport entry parameter, but the lifecycle rule itself (close context before browser) is unchanged.

---

### `src/cli.js` (wiring — ora adapter)

**Analog:** itself — two surgical updates in the two branches.

**`--smoke` branch** (lines 40-83) — only one field rename:
```javascript
// Before (line 46):
const viewport = config.viewport.name ?? 'default';
// After:
const viewport = config.viewports[0].name;   // name is required on entries; no fallback needed
```
And the `launchBrowser(config)` call on line 51 becomes `launchBrowser(config, config.viewports[0])`. The smoke path is documented as deliberately taking the FIRST viewport only (success criterion #4 — single-viewport back-compat fixture still produces one PNG).

**Non-smoke branch** (lines 90-107) — consumes the new array return:
```javascript
// Before:
const { outputPath } = await runCapture(config, { onProgress: (event) => { ... } });
spinner.succeed(`screenshot written: ${outputPath}`);
console.log(`screenshot written: ${outputPath}`);

// After:
const results = await runCapture(config, { onProgress: (event) => { ... } });
spinner.succeed(`${results.length} screenshot(s) written`);
for (const { outputPath } of results) {
  console.log(`screenshot written: ${outputPath}`);   // one stdout line per viewport, pipe-capturable per §Pitfall 6
}
```

**Existing onProgress→spinner.text mapping** (lines 91-101) — gets per-viewport scoping in the spinner text. The pattern is unchanged; the label gains a viewport prefix:
```javascript
// Before:
if (event.type === 'step') {
  spinner.text = event.label;
} else if (event.type === 'frame') {
  spinner.text = `Capturing frame ${event.current}/${event.total}`;
}
// After:
if (event.type === 'step') {
  spinner.text = `[${event.viewport}] ${event.label}`;
} else if (event.type === 'frame') {
  spinner.text = `[${event.viewport}] Capturing frame ${event.current}/${event.total}`;
}
```
(Exact bracket-format choice is the planner's call; the principle is per-viewport visibility in the single ora line.)

**Existing selector-warning sandwich** (lines 96-100) — `spinner.stop() → printSelectorWarnings → spinner.start()` pattern is preserved; per-viewport warning events flow through it identically.

---

### `src/server/index.js` (wiring — SSE adapter)

**Analog:** itself — `handleCapture`'s SSE pump (lines 99-162) updates to consume the array return and emit per-viewport events. UI form stays single-viewport (D-05).

**Existing form-builder shape** (lines 115-123) — UNCHANGED in this phase per D-05. The server still receives `body.viewport` (singular object) from the form, builds a candidate with `viewport: body.viewport`, which the schema's singular→plural normalizer converts. The UI does NOT learn multi-viewport in Phase 7.

**Existing SSE pump** (lines 138-162) — the consumption pattern adapts to the array return:
```javascript
// Before (lines 152-156):
const { outputPath } = await runCapture(parsed.data, {
  onProgress: (event) => send(event),
});
send({ type: 'done', outputPath, urlPath: outputPathToUrl(outputPath) });

// After:
const results = await runCapture(parsed.data, {
  onProgress: (event) => send(event),   // events already carry viewport: <name> per runCapture
});
send({
  type: 'done',
  outputs: results.map(({ outputPath, viewportName }) => ({
    outputPath,
    urlPath: outputPathToUrl(outputPath),
    viewportName,
  })),
});
```

**Existing `send` helper** (lines 148-150) — UNCHANGED. The SSE frame format is preserved; only the `done` frame payload shape grows from a single-object to an `outputs: [...]` array.

**Existing `outputPathToUrl` + `errorToMessage`** (lines 164-180) — UNCHANGED. Path-to-URL mapping is per-output; error formatting is unchanged (fail-fast: first per-viewport error becomes the SSE `error` frame, matching v0.1's BrowserError/ConfigError dispatch).

---

### `samples/smoke-multi.yaml` (NEW fixture)

**Analog:** `samples/smoke.yaml` (lines 32-50). Copy the shape, swap singular `viewport:` for plural `viewports:` array, point at the same hermetic fixture server (`samples/serve-smoke.js` on `http://127.0.0.1:7357`).

**Pattern to copy** (from `samples/smoke.yaml:32-50`):
```yaml
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

**Phase 7 adaptation** (planner spec — derived from CONTEXT.md "Specifics" + success criterion #5):
```yaml
name: phase-07-smoke-multi
baseUrl: http://127.0.0.1:7357
output: /tmp/framershot-smoke-multi/{viewport}/{page}.png   # {viewport} placeholder critical — no overwrites
deviceScaleFactor: 2
viewports:
  - width: 800
    height: 600
    name: desktop
  - width: 375
    height: 667
    name: mobile
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

Key fixture choices that follow established Phase 4-6 fixture style:
- Same fixture server (`samples/serve-smoke.js`, no server changes needed per CONTEXT.md)
- Output under `/tmp/` so no `.gitignore` work needed (matches `smoke.yaml` choice)
- `{viewport}` in the output template — this fixture IS the success criterion #2 evidence (no overwrites)
- Same hide selectors (intentional `.does-not-exist` exercises selector-warning path per Phase 6 pattern)

---

## Shared Patterns

These cross-cutting patterns apply to multiple Phase 7 files. Each is sourced from v0.1 code that the planner should NOT reinvent.

### Typed Error Dispatch (NO new error type)
**Source:** `src/cli/format.js:96-130` (formatError dispatcher)
**Apply to:** All Phase 7 throw sites
**Pattern:** Per-viewport schema failures → `ConfigError`. Per-viewport launch failures → `BrowserError`. Per-viewport navigation/timeout → `BrowserError` (existing dispatch unchanged). No `ViewportError` per D-05.

The existing dispatcher already returns clean messages for all these:
```javascript
if (err instanceof ConfigError) {
  return `${chalk.red('Error:')} ${err.message}`;
}
if (err instanceof BrowserError) {
  const base = `${chalk.red('Error:')} ${err.message}`;
  if (err.cause?.name === 'TimeoutError') {
    return `${base}\n  ${chalk.dim('(timed out)')}`;
  }
  return base;
}
```
Phase 7 changes nothing here. Server-side `errorToMessage` (`src/server/index.js:172-180`) also unchanged.

### Presentation-free Library Posture
**Source:** `src/capture/runCapture.js:1-16` (header comment)
**Apply to:** `src/capture/runCapture.js`, `src/browser/launcher.js`
**Pattern:** No `console.*`, no `process.exit`, no `chalk`/`ora` in `src/{browser,capture,prepare,config,output}/`. All progress flows through the `onProgress` callback; all errors throw typed errors. Phase 7's loop preserves this invariant — the new per-viewport events are still data, not console writes.

### Single Error Sink in `index.js`
**Source:** `src/cli.js:11-18` (currentSpinner module-level ref) + project `index.js` top-level catch
**Apply to:** All Phase 7 throw sites in the CLI path
**Pattern:** First viewport that throws aborts the run (fail-fast). `runCapture`'s `for` loop lets the throw propagate; CLI's top-level catch in `index.js` calls `spinner.fail()` via `getCurrentSpinner()` and exits non-zero. Phase 7 makes ZERO changes to this contract.

### Wave-friendly File Modification Boundaries
**Source:** PROJECT.md Key Decisions ("zero `files_modified` overlap" rule)
**Apply to:** Plan structure
**Pattern:** Plans that touch disjoint files can wave-parallel. Phase 7's natural seams:
- Wave 1 (schema/loader): `src/config/schema.js` + `src/config/load.js`
- Wave 2 (capture core, depends on wave 1's normalized shape): `src/capture/runCapture.js` + `src/browser/launcher.js`
- Wave 3 (wiring, depends on wave 2's return shape): `src/cli.js` + `src/server/index.js` (these two CAN parallel because they touch disjoint files)
- Fixtures (independent, parallelizable with any wave): `samples/smoke-multi.yaml`

Planner can collapse or split waves; this is the natural dependency shape.

### Hermetic Smoke Fixture Pattern
**Source:** `samples/smoke.yaml` + `samples/serve-smoke.js` (Phase 3-6 fixture pattern)
**Apply to:** `samples/smoke-multi.yaml`
**Pattern:** `node samples/serve-smoke.js &` backgrounded; capture run consumes `http://127.0.0.1:7357`; output to `/tmp/framershot-smoke*/...`; verify N PNGs exist with distinct paths after the run. No `.gitignore` work, no repo pollution, no network dependency.

---

## No Analog Found

None. Every Phase 7 modification has an exact self-extension analog in v0.1 code; the only new file (`samples/smoke-multi.yaml`) has a direct sibling (`samples/smoke.yaml`).

---

## Metadata

**Analog search scope:**
- `/Users/sannagranqvist/Documents/App/screenshotter/src/**` (all 17 JS files)
- `/Users/sannagranqvist/Documents/App/screenshotter/samples/**` (10 YAML/JS fixtures)
- `/Users/sannagranqvist/Documents/App/screenshotter/.planning/phases/02-cli-config/` (zod refinement precedent)
- `/Users/sannagranqvist/Documents/App/screenshotter/.planning/phases/06-terminal-ux/` (formatError dispatcher, onProgress contract)
- Commit `220ff9f` (the seam extraction — diff inspected for the loop-around target)

**Files scanned:** 17 source files + 10 fixtures + 3 prior-phase summaries

**Pattern extraction date:** 2026-05-22

**Key reuse decisions confirmed:**
- Zod 3 (NOT zod 4) — `z.string().url()` form, `.refine` with `{ message }` object form, refinements surface via `formatZodError`'s catch-all
- ESM throughout; commander v12; no new deps
- `launchBrowser(config, viewportEntry)` signature change is non-breaking (only two callers: `runCapture` and `cli.js --smoke`)
- Server UI form stays singular; schema's singular→plural normalizer makes Phase 7 server-side a pure wiring update (D-05)
