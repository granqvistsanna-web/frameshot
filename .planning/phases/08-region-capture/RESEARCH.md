# Phase 8: Region Capture - Research

**Researched:** 2026-05-22
**Domain:** Playwright element-level capture (`locator.screenshot`, `locator.boundingBox`, `scrollIntoViewIfNeeded`), `page.screenshot({ clip })` for bounding-box spans, zod region schema extension, commander v12 option wiring, padding semantics around an element's bounding box, output-template placeholder design (`{region}`), composition with Phase 7's `{viewport}` placeholder
**Confidence:** HIGH (Playwright element/locator/page screenshot APIs verified by reading `node_modules/playwright-core/types/types.d.ts` directly; existing code touchpoints verified by reading every file under `src/`; integration with Phase 7 reasoned from its CONTEXT.md and DISCUSSION-LOG.md which are committed) / MEDIUM (padding semantics — multiple valid interpretations, recommendation in §Pattern 3 needs one user-facing decision)

## Summary

Phase 8 adds **region capture**: a config block declares named regions (by CSS selector OR by from/to anchor pair) and produces one PNG per region instead of (or in addition to) the v0.1 full-page stitch. A new `--only=<region-name>` CLI flag captures a single named region in isolation.

The two region modes split cleanly along Playwright API lines:

1. **Selector regions** (`regions: [{ name, selector, padding? }]`) — single element, captured via `locator.scrollIntoViewIfNeeded()` (which honors v0.1's prepare pipeline first) followed by `page.screenshot({ clip })` derived from `locator.boundingBox()` plus the optional padding. We deliberately use `page.screenshot({ clip })` instead of `locator.screenshot()` because the **`clip` option does not exist on `LocatorScreenshotOptions`** (verified `node_modules/playwright-core/types/types.d.ts:23613-23692`) — and padding requires expanding the bounding box outward, which only `clip` supports. [VERIFIED: types.d.ts]

2. **Anchor regions** (`regions: [{ name, from, to, padding? }]`) — two elements, bounding box computed as `union(from.boundingBox(), to.boundingBox())` with optional padding, then captured via `page.screenshot({ clip })`. Both anchors are scrolled into view in sequence — `to` (the lower anchor) is scrolled last so the screenshot's compositing pass runs with the union rect intersecting the current viewport (Playwright requires the clip rect to intersect the viewport).

Both modes **reuse v0.1's prepare pipeline verbatim** (animation disable + IO shim + hide + scrollPrime + extraDelay). This is mandatory because Framer Motion's `whileInView` triggers only fire if the IO shim has replaced `IntersectionObserver` before Framer's bundle executes — exactly what `installAnimationGuards` already does. Element capture without the prepare pipeline would produce half-animated regions, which is the failure mode v0.1 exists to solve.

The `--only=<region-name>` flag adds one option to `commander`'s capture command and one branch to `runCapture`: when present, only that region runs; when absent, v0.1's full-page stitch runs UNCHANGED (success criterion #3 — back-compat hard requirement). Critically, **regions and full-page are mutually exclusive per run by default** — adding a `regions:` block does NOT silently disable full-page capture; the user opts into region mode either by passing `--only=<name>` (capture just that one) OR by an explicit config-level decision the planner must choose between (see §Open Question #1).

The new typed error `RegionError` (raised by the missing-selector / missing-anchor / unknown-`--only`-name paths) plugs into the existing `formatError` dispatcher in `src/cli/format.js` — same shape as `BrowserError` / `ConfigError`. A new error class is justified here (unlike Phase 7's case where ConfigError sufficed): unknown region names are a runtime failure mode that can't be caught at schema-validation time (the schema doesn't know which value the CLI flag will receive), and missing-selector failures from Playwright's `locator.boundingBox()` return `null` rather than throwing — we need to convert that null to an actionable error.

**Primary recommendation:** Extend the zod schema with an optional `regions: [...]` array (zod refinement: exactly one of `selector` OR (`from` AND `to`) on each entry, names required + unique). Add `--only` as a `commander` option on the existing `capture` command. Push the region-loop INTO `runCapture` (preserving the seam contract Phase 7 also relies on). Add `src/capture/region.js` exporting `captureRegion(page, regionConfig, outputPath, { onProgress })` — a sibling of `captureFullPage(page, outputPath)`, consumed only by `runCapture`. Add `RegionError` exported from a new `src/capture/region.js` (mirroring `BrowserError` in `src/browser/launcher.js`). Extend `resolveTemplate` with a `{region}` placeholder (kept literal when no region — back-compat). Two new smoke fixtures: `samples/smoke-regions.yaml` (selector + anchor coverage) and a CLI assertion that `--only` runs in isolation. Phase 7 lands first; Phase 8 builds on its normalized `viewports[]` shape.

## User Constraints (carried from v0.1 + STATE.md + PROJECT.md + ROADMAP.md)

> No CONTEXT.md exists for Phase 8 yet — `/gsd:discuss-phase 8` has not been invoked. The constraints below derive from PROJECT.md "Key Decisions", STATE.md "Decisions" (v0.1 carry-forward), Phase 7's CONTEXT.md, and the user's brief.

### Locked Decisions (from project-level docs + Phase 7 carry-forward)

- **v0.1 full-page stitch behavior is unchanged when no `regions:` block and no `--only` flag.** Success criterion #3 is a hard back-compat invariant. The presence of a `regions:` block in config alone must NOT disable full-page capture by default — see §Open Question #1 for the precise rule.
- **Region capture reuses the prepare pipeline.** Per STATE.md "Decisions": "Region capture (Phase 8) uses `element.screenshot()` / `page.screenshot({ clip })` instead of the stitch loop — but reuses the same prepare pipeline (animation disable + IO shim + hide + scroll prime) before capture." No new prepare logic.
- **Single error sink in `index.js`; new typed errors plug into `formatError`.** Per STATE.md: "Single error sink in `index.js`; libraries throw typed errors (`ConfigError`, `BrowserError`) — extend with new typed errors per v0.2 surface (e.g. `RegionError`) via `src/cli/format.js` dispatcher." `RegionError` is explicitly anticipated.
- **Smoke fixture pattern is the verification standard.** Per STATE.md: "Hermetic smoke fixture pattern (`samples/serve-smoke.js` + `samples/smoke.yaml`) is the verification standard — Phase 7 and Phase 8 each extend it with new `samples/*.yaml` fixtures." Phase 8 must add at least one new YAML fixture; the fixture HTML (in `samples/serve-smoke.js`) may need extending to add region-shaped DOM elements.
- **Schema additions preserve backward compatibility.** Per STATE.md: "Schema additions (`viewports[]`, `regions[]`) must preserve v0.1 backward compatibility — single-viewport / no-regions configs must still validate and run unchanged."
- **Stack locked: no new deps.** Per STATE.md: "Stack locked: Node.js + `playwright-chromium` + sharp + commander v12 + js-yaml + zod + chalk + ora — no churn expected." Phase 8 adds zero dependencies.
- **runCapture is the seam.** Per Phase 7 CONTEXT.md D-03: "The seam was just extracted (commit 220ff9f) precisely so both CLI and server consume one entry point." Phase 8 extends the seam — the region loop lands inside `runCapture` (same shape Phase 7 chose for the viewport loop).
- **Web UI scope: minimum wiring only (mirror Phase 7 D-05).** Phase 7 explicitly deferred multi-viewport UI affordances. Phase 8 should make the same call: the server's `runCapture` call site must handle whatever new return shape Phase 8 introduces (per-region outputs in the SSE `done` frame), but the UI form does NOT gain `+/- region row` affordances. UI work for regions is a follow-up phase.
- **Fail-fast partial-failure semantics.** Phase 7 CONTEXT.md established: "First viewport that throws aborts the run." Phase 8 mirrors this for regions: first region that errors (missing selector, missing anchor) aborts the run via typed `RegionError`. No partial-success summary reporting.
- **Sequential, not parallel.** Phase 7 established sequential execution across viewports. Phase 8 mirrors this for regions: each region captured in turn, single ora progress stream. Per-region parallelism is a future optimization.
- **Phase 8 depends on Phase 7.** Per ROADMAP.md: "Depends on Phase 7". Region × viewport composition (each region captured once per viewport) requires Phase 7's normalized `viewports[]` shape to be in place.

### Claude's Discretion

These five surfaces have no locked decision yet; Phase 8 `/gsd:discuss-phase` will likely lock them. Research presents recommendations.

- **Padding semantics** — does `padding: N` expand the captured rect by N CSS pixels in all four directions (recommended) or is it an asymmetric `{ top, right, bottom, left }` object? Recommendation in §Pattern 3: scalar `padding: number` only for v0.2 (4-direction uniform expansion); asymmetric padding deferred. The scalar form covers the daily use case ("add some breathing room around the captured element") and the asymmetric form is a non-breaking schema addition later. Both selector and anchor regions get the same padding semantics.
- **`{region}` placeholder behavior when no region is being captured** — does `{region}` resolve to `'full'` / `'fullpage'` / stay literal? Recommendation in §Pattern 5: stay literal (matches `resolveTemplate`'s existing unknown-placeholder posture in `src/output/template.js:6-7`: "Unknown placeholders (e.g. {foo}) are left literal — typos surface visibly"). Full-page runs that don't use `{region}` in their template aren't affected; users who add `{region}` to their template AND use full-page only will see a literal `{region}` in the path, which is the documented surface-typo behavior.
- **Regions × viewports composition** — when both are declared, do we capture (N viewports) × (M regions) PNGs? Recommendation in §Pattern 6: YES, full cartesian product. Each region runs once per viewport (since regions are pixel-precise and an element's bounding box differs across viewports). The output template `./screenshots/{date}/{viewport}/{region}-{page}.png` produces N×M distinct paths. Without `{region}` and `{viewport}` distinct placeholders in the template, overwrites would happen — this is a CFG-02 schema-validation check the planner can require.
- **`regions:` block + `--only` flag interaction** — see §Open Question #1.
- **`RegionError` vs reusing `ConfigError`** — see §Pattern 4. New class recommended because the failure modes (missing selector at runtime, unknown `--only` name at runtime) are distinct from config-validation failures.

### Deferred Ideas (OUT OF SCOPE — do not research)

- **Per-region `prepare` overrides** — e.g., a region that hides a different selector list. Unnecessary for v0.2; the global `prepare` block applies to the page once, then any subset of regions is captured. Non-breaking schema addition later if needed.
- **Asymmetric padding (`{ top, right, bottom, left }`)** — see Claude's Discretion above. Scalar only for v0.2.
- **`--only=<region-name>` matching multiple regions** — e.g., `--only=hero,about` for two regions. v0.2 takes exactly one region name. Non-breaking change later: accept comma-separated.
- **Web UI region affordances** — `+/- region row` form work. Same reasoning as Phase 7 D-05 (Web UI scope).
- **Capture only the visible viewport of a region (no scrollIntoView)** — opinionated; v0.2 always scrolls into view because the failure mode of not scrolling is a clipped capture (Playwright requires the clip rect to intersect the visible viewport).
- **Iframe / shadow-DOM region selectors** — Framer doesn't ship iframes in any pattern we capture. If it ever does, `page.locator()` already handles shadow DOM by default (per types.d.ts:3597 `locator(selector, ...)` documentation). No extra work.
- **Multi-element selectors (selector that matches > 1 element)** — first-match semantics for v0.2. The schema does NOT require `:scope`-strict selectors. If a selector matches 3 elements, capture the first one. Phase 6's hide-summary pattern (matched/missed counts) doesn't apply here — region capture is element-precise, not list-shaped.
- **`{from}` / `{to}` placeholder in output template** — anchors are an implementation detail of where the bounding box came from, not a user-facing identity. The region's `name` is the identity. `{region}` is sufficient.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REGION-01 | User can declare named regions in config by CSS selector (`regions: [{ name, selector, padding? }]`) and capture only that element to its own PNG — scrolled into view, prepare pipeline applied, padding honored. | §Pattern 1 (selector region capture flow), §Pattern 3 (padding semantics), §Standard Stack (Playwright `locator.boundingBox` + `page.screenshot({ clip })`), §Code Examples §"Selector region capture" |
| REGION-02 | User can declare named regions by from/to anchors (`regions: [{ name, from, to, padding? }]`) — capture computes the bounding box between the two anchor elements and clips to it. | §Pattern 2 (anchor region capture flow + bounding-box union math), §Pattern 3 (padding semantics), §Pitfall 3 (anchor order — visual top-to-bottom not document-order), §Code Examples §"Anchor region capture" |
| REGION-03 | User can pass `--only=<region-name>` to `framershot capture` to capture a single named region instead of the full page. Without the flag, full-page stitch behavior from v0.1 is unchanged. | §Pattern 7 (commander v12 option wiring), §Open Question #1 (regions + no-flag semantics), §Standard Stack §commander, §Code Examples §"--only flag" |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Region schema validation (zod refinement: selector XOR from+to; name unique; padding numeric) | Config layer (`src/config/schema.js`) | — | Schema is the existing zod-refinement landing spot. Phase 7 establishes the precedent with `viewports[]` uniqueness refinement. Same boundary. |
| Region config normalization (e.g., default `padding: 0`) | Config layer (`src/config/load.js`) or zod `.default(0)` | — | Same boundary as Phase 7's singular→plural normalization. Zod `.default()` is the lower-ceremony option for the padding default. |
| Region loop orchestration (iterate `regions[]`, dispatch each to `captureRegion`) | Capture layer (`src/capture/runCapture.js`) | — | runCapture is the seam (D-03 from Phase 7). The region loop sits inside, alongside the viewport loop, as `for (viewport) for (region) ...`. |
| Per-region element capture (locator → boundingBox → clip → screenshot) | Capture layer (new `src/capture/region.js`) | Browser layer (Playwright primitives) | New module, sibling of `src/capture/frames.js` and `src/capture/stitch.js`. Owns the selector vs. anchor branching and the padding math. |
| Bounding-box union math for anchor regions | Capture layer (new `src/capture/region.js`) | — | Pure math (no Playwright after the two `boundingBox()` calls). Stays in the same file as `captureRegion` for cohesion. |
| `scrollIntoViewIfNeeded` invocation | Capture layer (new `src/capture/region.js`) via `page.locator(sel).scrollIntoViewIfNeeded()` | — | Playwright primitive; called once per region (or twice for anchors — `from` then `to`). Lives next to the screenshot call. |
| `--only=<region-name>` flag parsing | CLI layer (`src/cli.js`) | — | commander v12 `.option()` on the existing `capture` command. The value is passed through to `runCapture` as part of an options bag, not the validated config. |
| Unknown-region-name validation (`--only=foo` but `foo` isn't declared) | Capture layer (in `runCapture`, just after config loaded) | CLI layer (passes the flag through) | Validation can't happen at zod time because the flag is CLI-only, not config. Earliest legal point is `runCapture` startup. Throws `RegionError`. |
| `RegionError` typed error class | Capture layer (new `src/capture/region.js`, exported alongside `captureRegion`) | — | Same shape as `BrowserError` in `src/browser/launcher.js`. Exported from the module that throws it. |
| `formatError` dispatch for `RegionError` | CLI layer (`src/cli/format.js`) | — | Add a fourth `instanceof` branch to the existing dispatcher in `src/cli/format.js:96-130`. |
| `{region}` placeholder substitution | Output layer (`src/output/template.js`) | — | Add `{region}` to the existing template resolver. Slugified through the same `SLUG_RE` Phase 2 already locked in. |
| Smoke fixture HTML extension | Test fixtures (`samples/serve-smoke.js`) | — | The current fixture (a tall page with a lazy img) needs additional sections to demonstrate selector + anchor regions. Inline HTML edit only. |

## Standard Stack

### Core (already installed — no new deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `playwright-chromium` | 1.60.0 [VERIFIED: `node_modules/playwright-chromium/package.json:3`] | `page.locator()`, `locator.boundingBox()`, `locator.count()`, `locator.scrollIntoViewIfNeeded()`, `page.screenshot({ clip })` | Same library used by Phases 3/4/5/7. All needed APIs are stable Playwright primitives. |
| `zod` | 3.x (`^3` per package.json:24) | Schema extension: `regions` array with refinement for selector XOR (from + to), unique names, padding default | Phase 2 established `formatZodError` + named field errors. Same patterns apply. |
| `commander` | 12.x (`^12` per package.json:21) | `--only <region-name>` option on the `capture` command | Already in use for the `capture` and `serve` commands at `src/cli.js:21-119`. |
| `sharp` | 0.33.x | NOT needed for Phase 8 | Region capture is `page.screenshot({ clip })` — one buffer per region, no stitching. The sharp dependency stays but is unused by Phase 8 code paths. |
| `chalk` | 5.x | `RegionError` formatting via existing `formatError` red prefix | No changes; reuses Phase 6's color discipline. |
| `ora` | 8.x | Per-region step messages in the spinner via `onProgress` events from `runCapture` | No changes; reuses Phase 6's CLI adapter pattern. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `page.screenshot({ clip: { x, y, width, height } })` with manually-computed bounding box | `locator.screenshot()` (the locator-based API) | **Cannot work for this phase**: `LocatorScreenshotOptions` (types.d.ts:23613-23692) does NOT include `clip` — padding-extended capture requires `clip`. Verified by direct read of the types file. `locator.screenshot()` captures exactly the element's bounding box with no padding/expansion mechanism. Anchor regions also can't use `locator.screenshot()` because there's no single element to attach to. |
| `page.screenshot({ clip })` for both modes (selector + anchor) | Mixed: `locator.screenshot()` for selector + `page.screenshot({ clip })` for anchor | Two APIs, two code paths, two failure modes to test. The `clip`-only approach is uniformly applicable. The actionability checks `locator.screenshot()` adds (waits for visible, stable) don't matter — Phase 4's prepare pipeline already settled the page. |
| `elementHandle.screenshot()` (legacy element-handle API) | `page.locator(sel).screenshot()` | Playwright explicitly marks elementHandle.screenshot as legacy: types.d.ts:12131 — "Use locator-based [locator.screenshot()] instead." We don't use either; we use `page.screenshot({ clip })` with locator-derived rect math. But if we ever switched, locator is the correct choice. |
| Manual zod refinement (`.refine((data) => xor(data.selector, data.from && data.to))`) for selector/anchor mutex | `z.union([selectorRegionSchema, anchorRegionSchema])` | Both work. `.refine` produces nicer error messages because we can write the message ourselves; `z.union` produces "Invalid input — expected one of these shapes" which is less actionable. Phase 2's `formatZodError` already pretty-prints refinement messages (schema.js:84 catch-all). Recommendation: `.refine` for the per-entry shape gate; `.superRefine` if we need to emit multiple errors per entry. |
| `--only` as a CLI flag on `capture` | `--only` as a top-level CLI option | Subcommand-level option matches Phase 7's no-new-top-level-flags posture. `framershot capture <config> --only=hero` is the canonical shape. |

**Installation:**
```bash
# No new packages. Phase 8 introduces ZERO dependencies.
```

**Version verification:** Re-checked at research time — all packages already installed and pinned via `^` ranges in `package.json:18-25`. No npm install needed for Phase 8.

## Package Legitimacy Audit

> Phase 8 installs ZERO new external packages. The existing dependency tree is unchanged from v0.1.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | No-op — phase installs no new packages |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                                 framershot capture <config> [--only=<name>]
                                                │
                                                ▼
                          ┌──────────────────────────────────────────┐
                          │ src/cli.js : capture action body         │
                          │  - commander parses --only into opts     │
                          │  - loadConfig(configArg) → ResolvedConfig│
                          │  - spinner = makeProgress()              │
                          │  - calls runCapture(config, {            │
                          │      onProgress, only: opts.only         │
                          │    })                                    │
                          └──────────────────────────────────────────┘
                                                │
                                                ▼
                          ┌──────────────────────────────────────────┐
                          │ src/capture/runCapture.js                │
                          │ ── Phase 7 already loops viewports here ─│
                          │  for (const viewport of config.viewports)│
                          │    launchBrowser(config, viewport)       │
                          │    installAnimationGuards (PRE-NAV)      │
                          │    navigateToPage()                      │
                          │    runPreparePipeline() (POST-NAV)       │
                          │                                          │
                          │    if (only OR config.regions present) { │
                          │       const targets = resolveRegions(    │
                          │         config.regions, only             │
                          │       )  ──► throws RegionError on       │
                          │              unknown name                │
                          │       for (const region of targets) {    │
                          │         captureRegion(page, region,      │
                          │           outputPath, { onProgress })    │
                          │       }                                  │
                          │       // skip full-page stitch when      │
                          │       // --only OR (per §OQ-1 policy)    │
                          │    }                                     │
                          │    else {                                │
                          │       captureFullPage(page, outputPath)  │
                          │    }                                     │
                          │                                          │
                          │    context.close() ; (next viewport)     │
                          │  // browser.close() in finally           │
                          └──────────────────────────────────────────┘
                                                │
                ┌───────────────────────────────┴───────────────────────────────┐
                ▼                                                               ▼
   ┌────────────────────────────────┐                       ┌──────────────────────────────────────┐
   │ src/capture/index.js           │                       │ src/capture/region.js (NEW)          │
   │  captureFullPage(...)          │                       │  captureRegion(page, regionCfg,      │
   │  ── v0.1 unchanged ──          │                       │     outputPath, { onProgress })      │
   │  - captureFrames               │                       │                                      │
   │  - stitchFrames                │                       │  Branch on regionCfg shape:          │
   │  - mkdir + writeFile           │                       │                                      │
   └────────────────────────────────┘                       │  SELECTOR mode:                      │
                                                            │   loc = page.locator(sel)            │
                                                            │   if (await loc.count() === 0)       │
                                                            │     throw RegionError(...)           │
                                                            │   await loc.scrollIntoViewIfNeeded() │
                                                            │   box = await loc.boundingBox()      │
                                                            │   if (box === null) throw RE(...)    │
                                                            │   clip = padRect(box, padding)       │
                                                            │                                      │
                                                            │  ANCHOR mode:                        │
                                                            │   from = page.locator(fromSel)       │
                                                            │   to = page.locator(toSel)           │
                                                            │   (count checks → RegionError)       │
                                                            │   await from.scrollIntoViewIfNeeded()│
                                                            │   boxFrom = await from.boundingBox() │
                                                            │   await to.scrollIntoViewIfNeeded()  │
                                                            │   boxTo = await to.boundingBox()     │
                                                            │   union = unionRect(boxFrom, boxTo)  │
                                                            │   clip = padRect(union, padding)     │
                                                            │                                      │
                                                            │  ──► clamp clip into doc bounds      │
                                                            │  ──► page.screenshot({ clip,         │
                                                            │        scale: 'device',              │
                                                            │        animations: 'disabled' })     │
                                                            │  ──► mkdir + writeFile               │
                                                            └──────────────────────────────────────┘
                                                                            │
                                                                            ▼
                                                              one PNG per region per viewport
```

### Recommended Project Structure (additions only)

```
src/
├── capture/
│   ├── frames.js       # unchanged (Phase 5)
│   ├── stitch.js       # unchanged (Phase 5)
│   ├── index.js        # unchanged (Phase 5)
│   ├── runCapture.js   # extends (region loop + region-vs-full branching + only filter)
│   └── region.js       # NEW — captureRegion + RegionError + padRect + unionRect helpers
├── config/
│   ├── schema.js       # extends (regionSchema + selectorRegionSchema + anchorRegionSchema + refinement + uniqueness)
│   └── load.js         # unchanged (zod validation already covers regions via schema)
├── output/
│   └── template.js     # extends ({region} placeholder)
├── cli.js              # extends (--only option; pass through to runCapture)
├── cli/
│   └── format.js       # extends (RegionError instanceof branch in formatError)
└── browser/, prepare/, server/    # unchanged

samples/
├── smoke.yaml             # unchanged (v0.1 back-compat fixture)
├── smoke-multi.yaml       # added by Phase 7 (multi-viewport fixture)
├── smoke-regions.yaml     # NEW — selector + anchor region coverage; --only assertion via separate invocation
└── serve-smoke.js         # extends — add named DOM sections for the smoke-regions fixture to target
```

### Pattern 1: Selector Region Capture

**What:** Capture a single element by CSS selector, with optional padding around its bounding box.

**When to use:** `regionConfig` has `selector` (and no `from`/`to`).

**Flow:**
1. `const loc = page.locator(regionConfig.selector);`
2. `const count = await loc.count();` — if 0, throw `RegionError("Region '<name>': selector '<sel>' matched no elements.")` Why: `locator.boundingBox()` returns `null` rather than throwing on no-match, so we need an explicit pre-check to produce the right error message.
3. `await loc.first().scrollIntoViewIfNeeded();` — uses Playwright's built-in scroll behavior. `.first()` resolves the multi-match case to a deterministic single element. types.d.ts:14783 — "tries to scroll element into view, unless it is completely visible".
4. `const box = await loc.first().boundingBox();` — returns `{ x, y, width, height }` in CSS pixels. types.d.ts:13105-13133. If `null` (element invisible / detached during the await), throw `RegionError`.
5. `const clip = padRect(box, regionConfig.padding ?? 0);` — see §Pattern 3.
6. `const clamped = clampToDocument(clip, docWidth, docHeight);` — see §Pitfall 4.
7. `await page.screenshot({ path: outputPath, clip: clamped, scale: 'device', animations: 'disabled', type: 'png' });` — `scale: 'device'` matches Phase 5's retina contract.

**Why this shape:** Mirrors `captureFrames`'s `page.screenshot({ clip })` call in `src/capture/frames.js:124-129` exactly — same `scale: 'device'`, same `animations: 'disabled'`, same `type: 'png'`. The only difference is `clip` is computed from `boundingBox + padding` instead of from a scroll offset. Stays uniform with v0.1's capture contract.

**Example:**
```javascript
// src/capture/region.js (proposed)
async function captureSelectorRegion(page, regionConfig, outputPath) {
  const loc = page.locator(regionConfig.selector).first();
  const count = await page.locator(regionConfig.selector).count();
  if (count === 0) {
    throw new RegionError(
      `Region '${regionConfig.name}': selector '${regionConfig.selector}' matched no elements.`,
    );
  }
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  if (box === null) {
    throw new RegionError(
      `Region '${regionConfig.name}': element '${regionConfig.selector}' has no bounding box (likely display:none).`,
    );
  }
  const padded = padRect(box, regionConfig.padding ?? 0);
  const clip = await clampToDocument(page, padded);
  await page.screenshot({
    path: outputPath,
    clip,
    scale: 'device',
    animations: 'disabled',
    type: 'png',
  });
}
```

### Pattern 2: Anchor Region Capture

**What:** Capture the bounding box spanning two elements (e.g., "from the hero section to the testimonials"), with optional padding.

**When to use:** `regionConfig` has `from` AND `to` (and no `selector`).

**Flow:**
1. Resolve both anchors: `const fromLoc = page.locator(from).first();` and `const toLoc = page.locator(to).first();`.
2. Count-check each — throw `RegionError` listing which anchor didn't match if either count is 0.
3. Scroll `from` into view → measure → scroll `to` into view → measure. Critically, **measure each anchor's bounding box AFTER scrolling it into view, NOT after scrolling both** — `boundingBox()` returns document-space coordinates, but Playwright requires the clip rect to intersect the *current viewport* at screenshot time. So:
   - `await fromLoc.scrollIntoViewIfNeeded(); const boxFrom = await fromLoc.boundingBox();`
   - `await toLoc.scrollIntoViewIfNeeded(); const boxTo = await toLoc.boundingBox();`
   - Both bounding boxes are in document coordinates and are stable across the scroll (Phase 5's geometry-once invariant — document coordinates don't shift when you scroll). `boundingBox()` returns coordinates relative to the document, not the viewport. types.d.ts:13105 — "the x coordinate of the element in pixels" (document space; the doc comment says "in pixels" without qualifier but the documented behavior is document-relative).
4. Compute union rect:
   ```javascript
   const x = Math.min(boxFrom.x, boxTo.x);
   const y = Math.min(boxFrom.y, boxTo.y);
   const right = Math.max(boxFrom.x + boxFrom.width, boxTo.x + boxTo.width);
   const bottom = Math.max(boxFrom.y + boxFrom.height, boxTo.y + boxTo.height);
   const union = { x, y, width: right - x, height: bottom - y };
   ```
5. `const clip = clampToDocument(padRect(union, padding ?? 0));`
6. **Re-scroll** so the clip rect intersects the viewport. Playwright requires this for `page.screenshot({ clip })` — see §Pitfall 1. The simplest correct call: `await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), clip.y);` — same `behavior: 'instant'` Phase 5's `captureFrames` uses (`src/capture/frames.js:104-106`).
7. Wait one rAF roundtrip for paint to settle: `await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));` — same primitive Phase 5's `captureFrames:112` uses.
8. `await page.screenshot({ path, clip, scale: 'device', animations: 'disabled', type: 'png' });`

**Example:**
```javascript
// src/capture/region.js (proposed)
async function captureAnchorRegion(page, regionConfig, outputPath) {
  const fromLoc = page.locator(regionConfig.from).first();
  const toLoc = page.locator(regionConfig.to).first();
  // count-check both, throw RegionError on either zero
  if (await page.locator(regionConfig.from).count() === 0) {
    throw new RegionError(`Region '${regionConfig.name}': 'from' selector '${regionConfig.from}' matched no elements.`);
  }
  if (await page.locator(regionConfig.to).count() === 0) {
    throw new RegionError(`Region '${regionConfig.name}': 'to' selector '${regionConfig.to}' matched no elements.`);
  }
  await fromLoc.scrollIntoViewIfNeeded();
  const boxFrom = await fromLoc.boundingBox();
  await toLoc.scrollIntoViewIfNeeded();
  const boxTo = await toLoc.boundingBox();
  if (boxFrom === null || boxTo === null) {
    throw new RegionError(`Region '${regionConfig.name}': one or both anchors have no bounding box.`);
  }
  const union = unionRect(boxFrom, boxTo);
  const padded = padRect(union, regionConfig.padding ?? 0);
  const clip = await clampToDocument(page, padded);
  // Re-scroll so the clip's top edge is in (or above) the viewport.
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.max(0, clip.y));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  await page.screenshot({
    path: outputPath,
    clip,
    scale: 'device',
    animations: 'disabled',
    type: 'png',
  });
}
```

### Pattern 3: Padding Semantics

**What:** A scalar `padding: number` (CSS pixels) that expands the captured rect uniformly in all four directions.

**When to use:** Both selector and anchor regions; default `0`.

**Math:**
```javascript
function padRect(box, padding) {
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + (padding * 2),
    height: box.height + (padding * 2),
  };
}
```

**Then clamp:** Negative `x` or `y`, or `x + width > documentWidth`, or `y + height > documentHeight` will cause Playwright to throw "Clipped area is either empty or outside the resulting image" (the exact error documented in `.planning/phases/05-scroll-stitch-output/05-RESEARCH.md:618`). The `clampToDocument` helper truncates to valid bounds:

```javascript
async function clampToDocument(page, rect) {
  const { docWidth, docHeight } = await page.evaluate(() => ({
    docWidth: document.documentElement.scrollWidth,
    docHeight: document.documentElement.scrollHeight,
  }));
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const width = Math.min(rect.width + Math.min(0, rect.x), docWidth - x);
  const height = Math.min(rect.height + Math.min(0, rect.y), docHeight - y);
  return { x, y, width, height };
}
```

**Pixel-precision note:** Phase 5's stitch.js uses `Math.round` to defend against fractional DSR. Phase 8's clip math operates in CSS pixels (Playwright converts to physical pixels internally when `scale: 'device'` is set). Fractional bounding-box values (e.g., `y: 123.456`) are accepted by `clip`. No rounding required — but harmless if added.

### Pattern 4: RegionError typed class

**What:** A new error subclass mirroring `BrowserError` / `ConfigError`.

**Code shape** (proposed for `src/capture/region.js`):
```javascript
export class RegionError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'RegionError';
    if (cause) this.cause = cause;
  }
}
```

**Dispatcher branch** (added to `src/cli/format.js:96`):
```javascript
// Guard 4 (new): RegionError — element missing, anchor missing, or unknown --only name.
if (err instanceof RegionError) {
  return `${chalk.red('Error:')} ${err.message}`;
}
```

**Why a new class:** Three runtime failure modes the dispatcher needs to recognize as user-actionable (not unexpected):
- Region's `selector` matched no elements at capture time
- Region's `from` or `to` anchor matched no elements
- `--only=foo` passed but no region named `foo` in config

The first two cannot be detected at schema-validation time because the selectors may be valid CSS but match nothing in the live DOM. The third cannot be detected at schema time because the CLI flag is not part of the config schema. `ConfigError` doesn't fit: these aren't config-format errors, they're "your config and the live page disagree" or "your CLI flag and your config disagree" errors. `BrowserError` doesn't fit: Playwright itself didn't fail.

### Pattern 5: `{region}` Output Template Placeholder

**What:** Extend `resolveTemplate` to substitute `{region}` with the per-region `name`.

**Code change** (proposed for `src/output/template.js:27-35`):
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

**Overwrite-prevention check:** If the resolved output template after region-name slugification still contains a literal `{region}` AND we're in region-capture mode, that's an overwrite trap — every region writes to the same path. This is a `ConfigError` at load time (zod refinement: when `regions:` block is present, `output` must contain `{region}`). Same shape as Phase 7's `{viewport}` uniqueness requirement.

### Pattern 6: Regions × Viewports Cartesian Product

**What:** When BOTH `viewports: [a, b]` and `regions: [x, y]` are declared, capture 4 PNGs: `a×x, a×y, b×x, b×y`.

**Why:** A region's bounding box is viewport-dependent. The hero section's box at desktop (1440×900) is not the box at mobile (375×667). Each combination is a distinct visual artifact.

**Loop shape (inside `runCapture`)**:
```javascript
for (const viewport of config.viewports) {
  // launch context, navigate, prepare ...
  const targets = resolveRegions(config.regions, only);
  if (targets.length === 0) {
    // Full-page mode (back-compat path)
    await captureFullPage(page, outputPath, { onProgress });
  } else {
    for (const region of targets) {
      const regionPath = resolveTemplate(config.output, {
        date, viewport: viewport.name, page: pageName, region: region.name,
      });
      await captureRegion(page, region, regionPath, { onProgress });
    }
  }
  // close context
}
```

**Schema check:** When `regions:` is present, the output template MUST contain `{region}` (to avoid overwrites across regions). When `viewports:` has length > 1 AND `regions:` is present, the template MUST contain BOTH `{region}` AND `{viewport}` (to avoid overwrites across the cartesian product). This is a zod refinement on the root schema.

### Pattern 7: commander v12 `--only` Option

**Code change** (proposed for `src/cli.js:29-32`):
```javascript
program
  .command('capture <config>')
  .description('Parse a config file, validate, and capture')
  .option('--smoke', 'Phase 3 verification: ...')
  .option('--only <region-name>', 'Capture only the named region (skips full-page stitch)')
  .action(async (configArg, opts) => {
    // opts.only is undefined when not passed, string when passed
    // ...
    await runCapture(config, { onProgress, only: opts.only });
  });
```

**commander v12 specifics:** `.option('--only <name>', ...)` with angle-brackets makes the value required (commander throws if `--only` is passed without a value). With square-brackets (`[name]`) it'd be optional. Required is correct here — `--only` without a name is meaningless. [VERIFIED: commander 12 docs and existing `-p, --port <port>` shape at `src/cli.js:113`.]

**Validation timing:** `opts.only` is just a string at parse time — commander doesn't validate that it's a known region name. That check happens inside `runCapture` once the config is loaded, since that's the earliest point both pieces of information are in scope:

```javascript
// inside runCapture, after loadConfig completes:
if (only !== undefined) {
  const match = (config.regions ?? []).find((r) => r.name === only);
  if (!match) {
    const names = (config.regions ?? []).map((r) => `'${r.name}'`).join(', ') || '<no regions declared>';
    throw new RegionError(`Unknown --only region '${only}'. Declared regions: ${names}.`);
  }
}
```

### Anti-Patterns to Avoid

- **Calling `locator.screenshot()` for selector regions.** No `clip` option on `LocatorScreenshotOptions`; padding cannot be expressed. Use `page.screenshot({ clip: padRect(box, padding) })`. [VERIFIED: types.d.ts:23613-23692]
- **Computing the union rect AFTER both anchors are scrolled.** The second `scrollIntoViewIfNeeded` may reflow the page if lazy-load triggers fire — making the first anchor's `boundingBox()` stale if read after the second scroll. Always: scroll → measure → scroll → measure.
- **Not re-scrolling before `page.screenshot({ clip })` in anchor mode.** Playwright throws if the clip rect doesn't intersect the current viewport. After the second anchor scroll, the viewport sits near the bottom of the union — but the union's TOP may now be off-screen above. Re-scroll to `Math.max(0, clip.y)` so the clip rect's top edge is in the viewport.
- **Using `fullPage: true` to capture a region.** Phase 5's existing scroll-stitch architecture exists because `fullPage: true` ghosts sticky elements. Region capture has the same issue: any sticky element in the captured rect would render at its sticky position rather than its document position. Use `clip` + manual scrolling.
- **Skipping the prepare pipeline for regions.** Framer Motion's `whileInView` triggers only fire if the IO shim is installed pre-navigation. Skipping prepare would produce regions with un-triggered animations. Always run the full prepare pipeline before region capture (same as v0.1 full-page).
- **Mutating the config object to filter regions when `--only` is used.** `runCapture` should compute a `targets` array locally instead of mutating `config.regions`. The validated config is shared across viewport iterations; mutating it pollutes the second iteration.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scroll element into view | DIY `element.scrollIntoView()` in `page.evaluate` | `page.locator(sel).scrollIntoViewIfNeeded()` | Playwright handles the actionability checks (visible + stable), accounts for scrollable parents, and uses native scrolling semantics. Reinventing this misses scrollable-container edge cases. types.d.ts:14776-14791 |
| Compute element bounding box | DIY `getBoundingClientRect()` in `page.evaluate` + scroll-offset adjustment | `await page.locator(sel).boundingBox()` | Playwright returns document-space coordinates directly — no scroll-offset math. types.d.ts:13105-13133 |
| Wait for element to be stable before measuring | DIY `setTimeout` polling | Playwright's actionability checks built into `scrollIntoViewIfNeeded()` | Already in the box. |
| Detect "selector matched zero elements" | Wrap `boundingBox()` in try/catch (it returns `null`, doesn't throw) | `await page.locator(sel).count()` then check `=== 0` | More explicit and produces a better error message. Avoids the null-vs-throw confusion. |
| CSS selector validation | DIY `try { document.querySelector(sel) } catch` shim in evaluate | Let `locator.count()` throw the SyntaxError naturally — caught by `runCapture`'s try, wrapped in `RegionError` | Same posture Phase 4 chose for `hideSelectors` invalid-CSS handling (`src/prepare/hide.js:58-65`). |
| Slugify region name for output path | DIY name-sanitizer | Reuse existing `slugify` function in `src/output/template.js:14-25` | Already Unicode-aware, already enforces the safe character set, already battle-tested in v0.1. |
| Bounding-box union math (anchor mode) | Reach for a "rectangle library" on npm | 4-line `Math.min/Math.max` block (see §Pattern 2) | Trivial geometry; a library would be over-engineering. |
| Per-region progress reporting | Side-channel global state | Extend `onProgress` event shape: `{ type: 'step', label: 'Capturing region <name>' }` | Phase 6's pattern is already the right shape. |

**Key insight:** Playwright's locator API is the canonical primitive for "address one DOM element by selector and operate on it." Every Playwright tutorial uses it; every Phase-8-shaped problem (region capture, element measurement, scroll-into-view) is exactly what it's designed for. The trap to avoid is reaching for `page.evaluate(...)` patterns that bypass the locator — those work but skip the actionability machinery and reinvent the failure modes locators already handle.

## Runtime State Inventory

> This is a feature-addition phase, not a rename/refactor. Inventory shortened.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no persistent state outside the screenshots directory | None |
| Live service config | None — no external services configured | None |
| OS-registered state | None — `framershot` is invoked via `npm link` or `node index.js` only | None |
| Secrets/env vars | None | None |
| Build artifacts | None — pure ESM, no build step | None |

**Migration concern:** v0.1 configs that don't have a `regions:` block must continue to validate and produce identical output. The zod `regions` field is added as `.optional()` — schemas without it remain valid. Test: every existing fixture in `samples/` (`smoke.yaml`, `sample.yaml`, `deltaventure.yaml`, `bad-*.yaml`) must still load and behave identically after Phase 8 lands. Add this as a verification item.

## Common Pitfalls

### Pitfall 1: Playwright requires clip rect to intersect the current viewport
**What goes wrong:** `page.screenshot({ clip: { x: 0, y: 5000, width: 800, height: 600 } })` when the page is scrolled to `y=0`. Playwright throws "Clipped area is either empty or outside the resulting image" — the exact error documented in `.planning/phases/05-scroll-stitch-output/05-RESEARCH.md:618` for the same reason.
**Why it happens:** Playwright's screenshot pipeline composites at the current scroll position. The clip rect is in document coordinates, but the source pixels come from the viewport.
**How to avoid:** Always `page.evaluate(() => window.scrollTo({ top: clip.y, behavior: 'instant' }))` immediately before `page.screenshot({ clip })`. Phase 5's `captureFrames` already does this for every frame.
**Warning signs:** `page.screenshot` throws with the "outside the resulting image" message; OR the captured image is the wrong content (top of page when you wanted bottom).

### Pitfall 2: `locator.boundingBox()` returns `null` for `display:none` elements (it does NOT throw)
**What goes wrong:** `const box = await loc.boundingBox(); const padded = padRect(box, 10);` — `padRect` then tries to access `null.x` and throws a generic TypeError.
**Why it happens:** `boundingBox()` returns `null` when the element has no rendered geometry — `display: none`, detached from DOM, or visibility-hidden zero-size container. types.d.ts:13113.
**How to avoid:** Explicit null check after every `boundingBox()` call; throw `RegionError` with the region name and selector if null. The "matched 0 elements" case is handled by the count-check; the "matched but invisible" case needs this null check too.
**Warning signs:** Generic TypeError in the capture path; PNG output is wrong shape; spinner crashes mid-region.

### Pitfall 3: Anchor order — "from" and "to" must be visual-top-to-bottom, not document-order
**What goes wrong:** A user writes `regions: [{ name: 'hero-to-cta', from: '.cta', to: '.hero' }]`. The union math still works (union is order-independent) but the user's mental model says `from` is the top and `to` is the bottom; if both anchors are visually top-to-bottom, the captured PNG is correct, but if the user swapped them, the bounding box still encompasses both and the capture works — just the semantic intent is lost.
**Why it happens:** Document order in HTML doesn't equal visual order on the page (CSS Grid, Flexbox, `order:` property can reorder).
**How to avoid:** Document in the YAML schema comment that `from` and `to` define the spanning region, not strict directionality. The math is order-independent (we compute `Math.min(box.y)` and `Math.max(box.y + box.height)`); the names are conventional. No code change — just doc clarity.
**Warning signs:** None at runtime (the math always works). User confusion at config-edit time.

### Pitfall 4: Padding pushes the clip rect outside document bounds
**What goes wrong:** Region anchored at `y=0` (top of page) with `padding: 50`. The padded clip has `y: -50`, which Playwright rejects (clip x/y must be ≥0).
**Why it happens:** Naive `padRect` math doesn't account for document bounds.
**How to avoid:** Always pass the padded rect through `clampToDocument` (§Pattern 3) before passing to `page.screenshot({ clip })`. Negative x/y are clamped to 0; widths/heights are clamped to document edges.
**Warning signs:** Playwright "Clipped area" error after padding is added (works without padding); padded captures missing pixels on one side.

### Pitfall 5: Padding semantics divergence between selector and anchor modes
**What goes wrong:** A user expects `padding: 20` to mean "20px around the visual outer edges" — and assumes that's what both modes do — but selector mode pads the single element's box while anchor mode pads the union of two boxes. If the union is wider than the individual anchors (e.g., the anchors are narrow but in different columns), the padding around the union is wider than the padding around either anchor.
**Why it happens:** Padding applies to the captured RECT, not the anchor elements themselves.
**How to avoid:** Document explicitly: padding expands the **captured bounding box** (whether selector-element box or anchor-union box). This is the simpler and more consistent rule. Alternative ("padding the individual anchor elements before unioning") produces less predictable results.
**Warning signs:** User confusion; mismatched aesthetic expectations. No runtime failure.

### Pitfall 6: `regions:` block silently disables full-page capture
**What goes wrong:** A user adds `regions:` to a config to ALSO capture regions, expecting both region PNGs AND the full-page PNG. With a naive implementation, the presence of `regions:` causes full-page capture to be skipped.
**Why it happens:** Implementation ambiguity — see §Open Question #1.
**How to avoid:** Lock the rule explicitly. Recommendation (and the planner's discuss-phase opportunity): when `regions:` is present in config WITHOUT `--only` flag, capture BOTH the regions AND the full page in a single run (the unsurprising "everything declared, capture everything" interpretation). When `--only=<name>` is passed, capture ONLY that named region (skip full-page and other regions). When `regions:` is absent (with or without `--only`), `--only=foo` is a `RegionError`.
**Warning signs:** User reports "where did my full-page screenshot go?" after adding a regions block.

### Pitfall 7: Selector that matches multiple elements
**What goes wrong:** `selector: '.card'` matches 12 cards on the page. Which one gets captured?
**How to avoid:** Use `.first()` deterministically (resolves to the first DOM-order match). Document this in the schema comment. Strict-single-match validation is overengineering for v0.2 (users can write more specific selectors like `.card:first-of-type` or `#hero-card`).
**Warning signs:** Captured PNG is the wrong card.

### Pitfall 8: Region capture in `--smoke` mode
**What goes wrong:** Phase 6's `--smoke` flag was designed for the v0.1 full-page path. It bypasses `runCapture` entirely (`src/cli.js:40-83` — the smoke branch builds a one-shot screenshot inline). If the user runs `framershot capture <config> --only=hero --smoke`, what happens?
**How to avoid:** Decide explicitly: either `--smoke` and `--only` are mutually exclusive (commander can enforce this; throw a friendly error) OR `--smoke` is the hermetic seam that ignores `regions:` and `--only`. Recommendation: mutually exclusive — clearer error than silent feature interaction.
**Warning signs:** Silent fallback to full-page when user expected a region; or unclear behavior in CI.

### Pitfall 9: Sticky elements in the captured region
**What goes wrong:** A region's bounding box includes a sticky header. The sticky header renders at the top of the visible viewport when the region is scrolled into view, but the captured rect is at document coordinates — so the sticky header sits inside the region rect at the WRONG document y, producing a duplicated/ghosted sticky.
**Why it happens:** Same root cause as v0.1's "fullPage:true ghosts sticky navs" — sticky positioning is viewport-relative.
**How to avoid:** Trust the prepare pipeline. v0.1's `hide:` list (in `config.prepare.hide`) is the canonical way to suppress sticky elements during capture. Region captures inherit this list automatically (the page is the same page; the prepare pipeline ran once before any region was captured). If a user has sticky elements and doesn't add them to `hide:`, the region capture WILL include the sticky at its viewport-top position — that's the same v0.1 behavior, and the `hide:` list is the documented escape hatch.
**Warning signs:** Region capture has a sticky element duplicated or in the wrong place; user complains.

### Pitfall 10: `clip` coordinates in CSS pixels vs. physical pixels
**What goes wrong:** Confusion about whether `clip: { y: 1000 }` means "1000 CSS px from top" or "1000 device-pixel-ratio×CSS-px from top". Playwright docs (types.d.ts:24276-24296) say "x/y/width/height" with no qualifier.
**Reality:** Phase 5's research and code confirms (`src/capture/frames.js:124` comment block): "clip in CSS pixels (Playwright types.d.ts:24276-24296)" and `scale: 'device'` produces physical pixels in the OUTPUT but `clip` itself is in CSS pixels. `boundingBox()` returns CSS pixels too. So the math is consistent — no unit conversion needed in Phase 8 code.
**How to avoid:** Match Phase 5's pattern exactly. No conversions. Phase 5 has been live and correct since 2026-05-22 — trust the same units.

## Code Examples

### Selector region capture (Pattern 1 full code)

```javascript
// src/capture/region.js — proposed
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class RegionError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'RegionError';
    if (cause) this.cause = cause;
  }
}

function padRect(box, padding) {
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + (padding * 2),
    height: box.height + (padding * 2),
  };
}

function unionRect(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

async function clampToDocument(page, rect) {
  const { docWidth, docHeight } = await page.evaluate(() => ({
    docWidth: document.documentElement.scrollWidth,
    docHeight: document.documentElement.scrollHeight,
  }));
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const width = Math.min(rect.width + Math.min(0, rect.x), docWidth - x);
  const height = Math.min(rect.height + Math.min(0, rect.y), docHeight - y);
  return { x, y, width, height };
}

export async function captureRegion(page, regionConfig, outputPath, { onProgress = () => {} } = {}) {
  onProgress({ type: 'step', label: `Capturing region '${regionConfig.name}'` });

  let clip;
  if (regionConfig.selector !== undefined) {
    // Selector mode
    const loc = page.locator(regionConfig.selector).first();
    const count = await page.locator(regionConfig.selector).count();
    if (count === 0) {
      throw new RegionError(
        `Region '${regionConfig.name}': selector '${regionConfig.selector}' matched no elements.`,
      );
    }
    await loc.scrollIntoViewIfNeeded();
    const box = await loc.boundingBox();
    if (box === null) {
      throw new RegionError(
        `Region '${regionConfig.name}': element matched but has no bounding box (display:none?).`,
      );
    }
    clip = await clampToDocument(page, padRect(box, regionConfig.padding ?? 0));
  } else {
    // Anchor mode
    const fromLoc = page.locator(regionConfig.from).first();
    const toLoc = page.locator(regionConfig.to).first();
    if (await page.locator(regionConfig.from).count() === 0) {
      throw new RegionError(`Region '${regionConfig.name}': 'from' selector '${regionConfig.from}' matched no elements.`);
    }
    if (await page.locator(regionConfig.to).count() === 0) {
      throw new RegionError(`Region '${regionConfig.name}': 'to' selector '${regionConfig.to}' matched no elements.`);
    }
    await fromLoc.scrollIntoViewIfNeeded();
    const boxFrom = await fromLoc.boundingBox();
    await toLoc.scrollIntoViewIfNeeded();
    const boxTo = await toLoc.boundingBox();
    if (boxFrom === null || boxTo === null) {
      throw new RegionError(`Region '${regionConfig.name}': anchor element has no bounding box.`);
    }
    clip = await clampToDocument(page, padRect(unionRect(boxFrom, boxTo), regionConfig.padding ?? 0));
  }

  // Re-scroll so clip's top edge is in the viewport (Playwright requires intersection).
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.max(0, clip.y));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));

  await mkdir(dirname(outputPath), { recursive: true });
  await page.screenshot({
    path: outputPath,
    clip,
    scale: 'device',
    animations: 'disabled',
    type: 'png',
  });
}
```

### `--only` flag in CLI (Pattern 7)

```javascript
// src/cli.js (extension to capture command) — proposed diff
program
  .command('capture <config>')
  .description('Parse a config file, validate, and capture')
  .option('--smoke', 'Phase 3 verification: launch, navigate, take ONE screenshot, exit')
  .option('--only <region-name>', 'Capture only the named region (skips full-page stitch)')
  .action(async (configArg, opts) => {
    // ... existing spinner + loadConfig ...

    if (opts.smoke && opts.only) {
      throw new Error('--smoke and --only are mutually exclusive');  // see §Pitfall 8
    }

    if (opts.smoke) {
      // existing smoke branch unchanged
      // ...
      return;
    }

    // Pass --only through to runCapture; runCapture validates the name
    // against the loaded config and throws RegionError on unknown.
    const results = await runCapture(config, {
      onProgress: /* ... */,
      only: opts.only,  // string | undefined
    });

    // results shape (Phase 8 contract):
    //   Phase 7: Array<{ outputPath, hideSummary, viewportName }>
    //   Phase 8: Array<{ outputPath, hideSummary, viewportName, regionName? }>
    //     — regionName is set when the entry is a region capture, undefined for full-page
    for (const r of results) {
      const label = r.regionName ? `region '${r.regionName}'` : 'full page';
      console.log(`screenshot written (${label}): ${r.outputPath}`);
    }
  });
```

### Region config — YAML

```yaml
# samples/smoke-regions.yaml — proposed Phase 8 fixture
name: phase-08-smoke-regions
baseUrl: http://127.0.0.1:7357
output: /tmp/framershot-smoke/{region}-{page}.png
deviceScaleFactor: 2
viewport:                       # Phase 7's singular shape — back-compat
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
  - name: hero               # Selector region (REGION-01)
    selector: '[data-test="region-hero"]'
    padding: 20
  - name: cards              # Anchor region (REGION-02)
    from: '[data-test="region-from"]'
    to: '[data-test="region-to"]'
    padding: 10
```

### Updated zod schema sketch

```javascript
// src/config/schema.js (proposed additions)
const selectorRegionSchema = z.object({
  name: z.string().min(1),
  selector: z.string().min(1),
  padding: z.number().int().min(0).default(0),
});

const anchorRegionSchema = z.object({
  name: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  padding: z.number().int().min(0).default(0),
});

// Per-entry refinement: exactly one shape. Using superRefine so we can emit
// distinct, actionable error messages.
const regionSchema = z.object({
  name: z.string().min(1),
  selector: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  padding: z.number().int().min(0).default(0),
}).superRefine((data, ctx) => {
  const hasSelector = data.selector !== undefined;
  const hasAnchor = data.from !== undefined && data.to !== undefined;
  const halfAnchor = (data.from !== undefined) !== (data.to !== undefined);
  if (hasSelector && hasAnchor) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `region '${data.name}': use 'selector' OR 'from'+'to', not both`,
    });
  } else if (!hasSelector && !hasAnchor) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `region '${data.name}': must declare 'selector' OR both 'from' and 'to'`,
    });
  } else if (halfAnchor) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `region '${data.name}': 'from' and 'to' must both be set`,
    });
  }
});

// Root schema additions
export const configSchema = z.object({
  // ... existing fields ...
  regions: z.array(regionSchema).optional().refine(
    (regions) => {
      if (!regions) return true;
      const names = regions.map((r) => r.name);
      return names.length === new Set(names).size;
    },
    { message: 'regions: names must be unique' },
  ),
}).superRefine((data, ctx) => {
  // Cross-field: when regions present, output template must contain {region}
  if (data.regions && data.regions.length > 0 && !data.output.includes('{region}')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['output'],
      message: 'output template must contain {region} when regions are declared (to avoid overwrites)',
    });
  }
});
```

## State of the Art

| Old Approach (pre-Playwright-locators) | Current Approach | When Changed | Impact |
|-----------------------------------------|------------------|--------------|--------|
| `page.$(selector).screenshot()` (ElementHandle) | `page.locator(selector).screenshot()` OR `page.screenshot({ clip })` from `locator.boundingBox()` | Playwright 1.14+ deprecated ElementHandle in favor of Locator; types.d.ts:12131 documents the migration | Locators retry on stale references; ElementHandles don't. Phase 8 uses `page.screenshot({ clip })` because `clip` doesn't exist on `LocatorScreenshotOptions`. |
| Compute scroll offset manually before `getBoundingClientRect()` | `locator.boundingBox()` returns document-space coordinates directly | Playwright 1.x | Less math, fewer off-by-one risks. |
| Use `display: none` to hide elements (and accept that scrollHeight changes) | `visibility: hidden` (preserves layout) | v0.1 Phase 4 decision (PROJECT.md Key Decisions) | Phase 8 inherits this — region capture relies on stable document geometry. |

**Deprecated/outdated:**
- `elementHandle.screenshot()` for region capture — documented as superseded by locator-based API (types.d.ts:12131). Don't use.
- `page.screenshot({ fullPage: true })` for region capture — same issues as v0.1's full-page rejection (ghosted sticky elements).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 7's normalized `viewports[]` shape will be in place when Phase 8 implements. Phase 7 is being planned in parallel; Phase 8 depends on Phase 7 per ROADMAP.md. | §Pattern 6, §Architectural Responsibility Map | If Phase 7 ships a different shape, Phase 8's region × viewport loop changes shape. Mitigation: Phase 7 CONTEXT.md is committed (commit 8147ae7) and the singular→plural normalization is locked (D-01). Risk is low but non-zero. [CITED: `.planning/phases/07-multi-viewport-capture/07-CONTEXT.md`] |
| A2 | Web UI scope mirrors Phase 7 D-05 (CLI + library only, no UI form changes for regions). | §User Constraints, §Architectural Responsibility Map | If user wants regions in UI for v0.2, this assumption forces a follow-up. [ASSUMED — but consistent with Phase 7's pattern] |
| A3 | Padding is a scalar (`number`), not an object (`{ top, right, bottom, left }`). | §Pattern 3, §Claude's Discretion | If user wants asymmetric padding, the schema needs to accept either shape. Scalar is the lower-ceremony default; asymmetric is a non-breaking addition later. [ASSUMED] |
| A4 | When `regions:` block is in config WITHOUT `--only`, capture BOTH regions AND full-page in one run. | §Open Question #1, §Pitfall 6 | If user wants regions-only behavior (no full-page) without needing the flag, the default flips. [ASSUMED — DISCUSS-PHASE GATE] |
| A5 | `--only=<name>` is a single name, not a list. | §Deferred Ideas, §Pattern 7 | If user wants `--only=hero,about`, comma-parsing logic needs to be added (non-breaking). [ASSUMED] |
| A6 | Multi-match selectors use `.first()` semantics (no error, deterministic). | §Pitfall 7 | If user wants strict-single-match, the schema needs a `strict: true` opt-in. [ASSUMED] |
| A7 | `boundingBox()` returns document-space coordinates (NOT viewport-space). | §Pattern 2 | If Playwright behavior differs, anchor union math is wrong. Playwright docs say "the x coordinate of the element in pixels" without qualifier; the documented use cases (`page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)`) imply document space — clicking uses absolute page coordinates. Phase 5's existing `frames.js:104-106` scrolls to `targetY` (document space) and clips at `(0, 0, vw, vh)` (viewport-relative); the two coordinate spaces are reconciled by the scroll. [VERIFIED by Phase 5's working implementation, but worth confirming during Phase 8 implementation with a hermetic test] |
| A8 | `RegionError` is the right error class to add. `ConfigError` doesn't fit because the failures (selector matches nothing in DOM, unknown `--only` name) happen at runtime, not config-validation time. | §Pattern 4 | If user prefers fewer error classes, dispatcher logic gets messier (string-prefix matching). [ASSUMED — DISCUSS-PHASE GATE] |
| A9 | Smoke fixture needs HTML extension (new sections in `samples/serve-smoke.js`) to provide selectors that the region fixture can target. | §Recommended Project Structure, §Code Examples | If existing fixture sections are reusable as anchors/selectors, the HTML edit is smaller — but at least one new section is likely needed. [ASSUMED] |
| A10 | Phase 6's `--smoke` and Phase 8's `--only` should be mutually exclusive (commander error). | §Pitfall 8 | Could instead silently fall through to full-page smoke — but unclear behavior is worse than friendly error. [ASSUMED — DISCUSS-PHASE GATE] |

## Open Questions

1. **`regions:` config block present + no `--only` flag: capture both or regions-only?**
   - What we know: Success criterion #3 says "without the flag, full-page stitch behavior from v0.1 is unchanged." If a v0.1 config (no `regions:`) is loaded, full-page runs. The ambiguity is what happens for a **v0.2 config with `regions:` but no `--only`**.
   - Two coherent rules:
     - **(A) Capture everything declared:** regions PLUS full-page PNG. The presence of `regions:` adds outputs but doesn't remove any.
     - **(B) Regions imply opt-out of full-page:** if you wrote regions, you want regions. Full-page only happens when no `regions:` block exists.
   - Recommendation: **(A)** — "everything declared" is the unsurprising default; users who want regions-only can use `--only=<name>`. Rule (A) makes `--only` a *filter* (subset of declared); rule (B) makes `--only` a *no-op* (regions already exclusive). Filter semantics are more useful.
   - Cost of getting it wrong: behavioral surprise. Documented in §Pitfall 6.
   - Recommendation: lock during `/gsd:discuss-phase 8`.

2. **Padding shape — scalar or asymmetric?**
   - What we know: §Pattern 3 recommends scalar for v0.2.
   - What's unclear: does the user have a real use case for asymmetric padding (e.g., "20px above the hero, 0 below to avoid cutting into the next section")?
   - Recommendation: scalar for v0.2; asymmetric is a non-breaking schema addition later.

3. **Should the smoke fixture extend `samples/serve-smoke.js` HTML or be a separate fixture file?**
   - Option A: Extend `serve-smoke.js` with new named sections, point both `smoke.yaml` and `smoke-regions.yaml` at the same server.
   - Option B: Add a second hermetic server (`samples/serve-regions.js`) on a different port.
   - Recommendation: **A** — one fixture server, multiple `*.yaml` configs pointing at it. Less duplication, less port-juggling.

4. **How does `--only` interact with regions × viewports?**
   - When `--only=hero` is passed AND `viewports: [a, b]`, do we capture hero × a and hero × b (2 PNGs) or just one (which viewport)?
   - Recommendation: **capture hero per declared viewport** — `--only` filters regions, not viewports. Phase 7's separate `--viewport=<name>` filter (MULTI-03) is deferred past v0.2; `--only` controls regions only.

5. **Anchor `from` / `to` — are they required to be distinct?**
   - If `from === to`, the union math degenerates to the box of that one element — basically a selector region.
   - Recommendation: allow it (no extra check); it's a defensible edge case (e.g., the user is iterating a config and forgot to fill `to`). Document as "behaves like a selector region for `from`." Could also flag as a config warning, but warnings on valid-but-suspicious configs add ceremony.

6. **Naming: `RegionError` or `CaptureError`?**
   - Both work. `RegionError` is narrower (specifically about regions); `CaptureError` is broader (could absorb future capture-time failures).
   - Recommendation: `RegionError` — narrower error classes produce better dispatcher branches and clearer error messages. Phase 7 already decided no new error class; Phase 8's failure modes are more distinct (runtime selector mismatch vs schema validation).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | runtime | ✓ (assumed) | >=20 (per package.json:11) | — |
| `playwright-chromium` Chromium binary | element capture | ✓ (already installed by v0.1) | 1.60.0 | — |
| sharp native binaries | NOT NEEDED for Phase 8 code paths | ✓ (already installed by v0.1, unused here) | 0.33.x | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

## Validation Architecture

> nyquist_validation is not explicitly disabled in `.planning/config.json` — treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None (PROJECT.md "Out of Scope": "Unit test suite — Why: verified via the hermetic smoke fixture (`samples/serve-smoke.js` + `samples/smoke.yaml`); adequate for personal-tool scope.") |
| Config file | None |
| Quick run command | `node samples/serve-smoke.js & node index.js capture samples/smoke.yaml --smoke; node index.js capture samples/smoke-regions.yaml; kill %1` |
| Full suite command | All three smoke fixtures (smoke, smoke-multi, smoke-regions) run end-to-end |

### Phase Requirements → Verification Map

| Req ID | Behavior | Test Type | Verification Command | Fixture Exists? |
|--------|----------|-----------|----------------------|-----------------|
| REGION-01 | Selector region produces PNG of element box + padding, prepared | smoke fixture | `node samples/serve-smoke.js & node index.js capture samples/smoke-regions.yaml; ls /tmp/framershot-smoke/hero-home.png` | ❌ Wave 0 (create smoke-regions.yaml) |
| REGION-02 | Anchor region produces PNG of bounding-box union, padded | smoke fixture | Same fixture as REGION-01; the same fixture exercises both modes via two `regions:` entries | ❌ Wave 0 (same fixture) |
| REGION-03 | `--only=<name>` captures only that region; without flag, v0.1 stitch unchanged | smoke fixture + back-compat assertion | (a) `framershot capture smoke-regions.yaml --only=hero` produces ONLY `hero-home.png`; (b) `framershot capture smoke.yaml` produces same PNG as before Phase 8 (byte-equal or visually identical) | ❌ Wave 0 |
| Back-compat: v0.1 configs unchanged | All four existing fixtures (`smoke.yaml`, `sample.yaml`, `deltaventure.yaml`, `bad-*.yaml`) validate and behave identically | manual + smoke | Re-run `framershot capture samples/smoke.yaml --smoke`; re-run `framershot capture samples/sample.yaml`; confirm all `bad-*.yaml` fixtures produce identical error messages | ✅ Existing |

### Sampling Rate
- **Per task commit:** No tests — silent module + smoke at phase milestones (matches v0.1)
- **Per wave merge:** Run `smoke.yaml --smoke` to confirm back-compat
- **Phase gate:** All three smoke fixtures (`smoke`, `smoke-multi`, `smoke-regions`) green; bad-*.yaml regression check; manual verification on `pubq.se` (or another real Framer site) per the README workflow

### Wave 0 Gaps
- [ ] `samples/smoke-regions.yaml` — Phase 8 fixture covering selector + anchor + padding
- [ ] `samples/serve-smoke.js` — extend with named selector sections (`[data-test="region-hero"]`, `[data-test="region-from"]`, `[data-test="region-to"]`) sized and positioned to exercise both modes
- [ ] Document `--only` assertion in the README workflow comment in `smoke-regions.yaml`

## Security Domain

> framershot is a local-only, personal CLI tool with no user-supplied URL execution beyond what's in the user's own config file. ASVS surface is minimal.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (local-only tool) |
| V3 Session Management | no | — (no sessions) |
| V4 Access Control | partial | server bound to 127.0.0.1 only (v0.1 enforces); path traversal guard in `/screenshots/*` (`src/server/index.js:188-193`) |
| V5 Input Validation | yes | zod schema; selectors pass through `querySelectorAll` which throws SyntaxError on malformed CSS (existing Phase 4 pattern). New: validate that `selector` / `from` / `to` strings are non-empty and pass to Playwright's locator. |
| V6 Cryptography | no | — |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious selector causing CPU spike (`*` selector across huge DOM) | Denial of Service | Acceptable — user supplies their own configs. Mitigation: locator timeouts default to 30s; can override via context default timeout. Not a Phase 8 concern. |
| Path traversal via region `name` (`../../../etc/passwd`) | Tampering | `slugify` already applies (template.js:14) — strips `/` and other structural chars. Region names that start with `..` get slugified to `--`. |
| Arbitrary JS execution via selector | Information Disclosure | None — `page.locator(sel)` does not execute selector strings as JS; they're CSS selectors parsed by the browser's CSS parser. |

## Sources

### Primary (HIGH confidence)
- `node_modules/playwright-core/types/types.d.ts` (Playwright 1.60.0)
  - Lines 12131-12223: `ElementHandle.screenshot` (legacy, not used)
  - Lines 13105-13133: `Locator.boundingBox` return shape
  - Lines 13390: `Locator.count` signature
  - Lines 14773: `Locator.screenshot` (does not have `clip`)
  - Lines 14776-14791: `Locator.scrollIntoViewIfNeeded`
  - Lines 23613-23692: `LocatorScreenshotOptions` (no `clip`)
  - Lines 24256-24296: `PageScreenshotOptions.clip` (in CSS pixels)
- `node_modules/playwright-chromium/package.json` — version 1.60.0
- `/Users/sannagranqvist/Documents/App/screenshotter/src/capture/runCapture.js` — the seam Phase 8 extends
- `/Users/sannagranqvist/Documents/App/screenshotter/src/capture/frames.js` — clip + scroll precedent
- `/Users/sannagranqvist/Documents/App/screenshotter/src/config/schema.js` — zod patterns
- `/Users/sannagranqvist/Documents/App/screenshotter/src/output/template.js` — `{region}` placeholder integration
- `/Users/sannagranqvist/Documents/App/screenshotter/src/cli/format.js` — `formatError` dispatcher
- `/Users/sannagranqvist/Documents/App/screenshotter/src/cli.js` — commander option wiring
- `/Users/sannagranqvist/Documents/App/screenshotter/.planning/phases/07-multi-viewport-capture/07-CONTEXT.md` — Phase 7 decisions (D-01..D-05) Phase 8 builds on
- `/Users/sannagranqvist/Documents/App/screenshotter/.planning/phases/05-scroll-stitch-output/05-RESEARCH.md` — clip semantics in CSS px verified
- `/Users/sannagranqvist/Documents/App/screenshotter/.planning/phases/04-prepare-pipeline/04-RESEARCH.md` — prepare-pipeline integration
- `/Users/sannagranqvist/Documents/App/screenshotter/.planning/STATE.md` — carry-forward decisions including `RegionError` anticipated
- `/Users/sannagranqvist/Documents/App/screenshotter/.planning/REQUIREMENTS.md` — REGION-01/02/03 requirements text
- `/Users/sannagranqvist/Documents/App/screenshotter/.planning/ROADMAP.md` — Phase 8 success criteria

### Secondary (MEDIUM confidence)
- Playwright's documented behavior that `clip` requires viewport intersection — confirmed by Phase 5 RESEARCH.md:618 documenting the exact error "Clipped area is either empty or outside the resulting image"

### Tertiary (LOW confidence)
- None — all critical claims verified against the installed Playwright types file or existing in-repo code

## Code Touchpoints — file:line reference for the planner

| File | Lines | Action |
|------|-------|--------|
| `src/config/schema.js` | 9-13 (viewportSchema is the precedent) | Add `selectorRegionSchema`, `anchorRegionSchema`, `regionSchema` (superRefine for the XOR check), root-level `regions: z.array(regionSchema).optional()` + cross-field refinement for `{region}` placeholder requirement |
| `src/config/schema.js` | 36-54 (configSchema body) | Add `regions` field; extend the root with `.superRefine` for the output-template `{region}` check |
| `src/config/schema.js` | 67-86 (formatZodError) | No changes — catch-all already handles custom refinement messages |
| `src/config/load.js` | 37-82 | No changes — zod validation already covers the new schema |
| `src/output/template.js` | 27-35 (resolveTemplate body) | Extend the chain with `.replaceAll('{region}', region ? slugify(region) : '{region}')`; add `region` to the destructured args |
| `src/capture/region.js` | NEW file | Create with `captureRegion`, `RegionError`, `padRect`, `unionRect`, `clampToDocument` helpers |
| `src/capture/runCapture.js` | 34-69 (function body) | Extend with `only` option parameter; add `resolveRegions(config.regions, only)` helper; inside the (Phase 7) viewport loop, branch on `targets.length > 0 ? region loop : captureFullPage`; emit per-region `onProgress` events |
| `src/capture/runCapture.js` | (return shape) | Change return to `Array<{ outputPath, hideSummary, viewportName, regionName? }>` (Phase 7's array shape extends naturally) |
| `src/cli.js` | 28-83 (capture action body) | Add `--only` option declaration; pass `only: opts.only` to `runCapture`; mutual-exclusion check with `--smoke` |
| `src/cli.js` | 90-107 (non-smoke branch) | Update consumer to iterate the array of results (already Phase 7's shape); add per-result label |
| `src/cli/format.js` | 96-130 (formatError) | Add `if (err instanceof RegionError)` branch — same shape as ConfigError branch |
| `src/cli/format.js` | 7-9 (imports) | Import `RegionError` from `src/capture/region.js` |
| `src/server/index.js` | 152-162 (runCapture call site) | No changes beyond Phase 7's array-handling — region results just have an extra optional `regionName` field |
| `samples/serve-smoke.js` | 19-88 (HTML) | Add named sections: `<section data-test="region-hero">…</section>`, `<div data-test="region-from">…</div>`, `<div data-test="region-to">…</div>` at known positions on the page |
| `samples/smoke-regions.yaml` | NEW file | Selector + anchor region config; see §Code Examples §"Region config — YAML" |

## Risks and Unknowns

### R1: Phase 7 lands later than expected
- **Impact:** Phase 8 PLAN execution blocked if `runCapture` doesn't yet have the array return shape
- **Mitigation:** Phase 7's CONTEXT.md (committed) locks the contract. Phase 8 PLAN can be drafted concurrently with Phase 7 implementation; execution waits.

### R2: A real Framer site has a region where `scrollIntoViewIfNeeded` doesn't fully reveal the element (sticky containers, transformed parents)
- **Impact:** `boundingBox()` returns coordinates the screenshot can't reach
- **Mitigation:** Test on a real Framer site (`pubq.se` per PROJECT.md context) as part of phase verification, not just hermetic smoke. Same posture as Phase 4's live-site verification.

### R3: The `{region}` placeholder collides with a user-written literal `{region}` in their output template
- **Impact:** A user who already has `{region}` literal in their template (very unlikely but possible) sees it suddenly substituted in Phase 8
- **Mitigation:** None worth taking — `{region}` is a brand-new placeholder for v0.2; nobody can have committed to it pre-v0.2. The unknown-placeholder posture in template.js:6-7 ("typos surface visibly") only applies to genuinely unknown placeholders.

### R4: Padding pushes the clip outside the document in BOTH x and y simultaneously
- **Impact:** `clampToDocument` shrinks both dimensions, producing a clip rect smaller than the user expected
- **Mitigation:** Acceptable — clamp-on-overflow is the documented behavior. Alternative ("error if padding exceeds document bounds") is overly strict. Document in the YAML schema comment.

### R5: A region's selector matches an element inside a Framer animation that the IO shim couldn't shim in time
- **Impact:** Captured region shows a half-played animation (the v0.1 failure mode this whole project exists to solve)
- **Mitigation:** Same as v0.1 — `installAnimationGuards` runs PRE-NAV. The shim covers the case. If it doesn't, that's a v0.1 bug Phase 4 already addressed and re-tests should catch.

### R6: `--only` collides with a future top-level flag
- **Impact:** None for v0.2; `--only` is scoped to the `capture` subcommand. Top-level flags like `--version` or `--help` are on `program`, not `command('capture')`.
- **Mitigation:** None needed.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every API verified against installed types file
- Architecture: HIGH — extends the existing seam pattern Phase 7 also extends; matches v0.1's silent-library / single-error-sink posture
- Padding semantics: MEDIUM — multiple defensible options; scalar is the recommended default but the user may want asymmetric
- `regions:` + no-`--only` behavior: MEDIUM — see §Open Question #1
- Pitfalls: HIGH — most are direct echoes of Phase 5's already-solved problems (clip viewport intersection, CSS-vs-device-pixel units); the few new ones (anchor-order, null bounding-box) are textbook Playwright behavior

**Research date:** 2026-05-22
**Valid until:** 2026-06-22 (30 days — stable Playwright/zod/commander surface) OR until Phase 7 ships (whichever first; verify Phase 7's final `runCapture` shape against assumption A1)
