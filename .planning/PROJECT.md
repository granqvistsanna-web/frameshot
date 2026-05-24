# framershot

## What This Is

A local Node.js CLI that takes high-quality screenshots of Framer sites, with per-site YAML configs that handle the parts vanilla Playwright botches: sticky navs, scroll-triggered animations, lazy-loaded media, custom viewports, and full-page stitching. Personal tool — not meant for distribution.

**Current state (v0.2 shipped 2026-05-24):** Single-page, multi-viewport capture works end-to-end — one config declares an array of viewports, one `framershot capture <config.yaml>` run produces one full-page retina PNG per viewport, each in its own Playwright browser context. On top of that, named region capture (by CSS selector or from/to anchor pair) and a `--only=<region>` CLI filter let the same config produce element-scoped PNGs alongside (or instead of) the full-page stitch. v0.1 single-viewport / no-regions configs still run unchanged. ora progress, actionable errors, and the full prepare pipeline (animation disable + Framer Motion IO shim + selector hiding + scroll prime + extraDelay) are reused verbatim per viewport and per region.

## Core Value

Reliably capture clean, retina-quality screenshots of Framer sites without ghosted navs, half-played animations, or missing lazy-loaded content.

Validated post-v0.1: the four daily pain points (sticky-nav ghosting, mid-flight appear effects, blank lazy-loaded images, font-flash) are all solved in the shipped output. The config file is, as predicted, the daily-touch surface — getting its ergonomics right has mattered more than internal architecture.

Validated post-v0.2: the prepare pipeline reused verbatim per viewport and per region — no regressions, no cross-viewport state leakage. The schema's backward-compatible normalization (singular `viewport:` → `viewports: [{ ..., name: 'default' }]` via root `.transform`) means daily v0.1 configs never had to change; v0.2 is purely additive at the YAML surface.

## Requirements

### Validated (shipped in v0.1)

- ✓ CLI scaffold with config loading (`framershot capture <config.yaml>`) — v0.1 (CLI-01)
- ✓ Terminal progress output via ora spinner across step boundaries — v0.1 (CLI-02)
- ✓ Actionable error messages dispatcher (ConfigError / BrowserError / TimeoutError / default) — v0.1 (CLI-03)
- ✓ Per-site YAML config: name, baseUrl, output template, viewport, page, prepare options — v0.1 (CFG-01)
- ✓ Field-named validation errors via zod + formatZodError (no raw zod dumps) — v0.1 (CFG-02)
- ✓ Templated output paths (`{date}`, `{viewport}`, `{page}` substitution) — v0.1 (CFG-03)
- ✓ Playwright Chromium launch with configurable viewport + `deviceScaleFactor` (2 or 3 for retina) — v0.1 (CAP-01, CAP-02)
- ✓ Page navigation waits for `networkidle` + `document.fonts.ready` (15s nav timeout) — v0.1 (CAP-03, CAP-04)
- ✓ Animation neutralization: CSS injection + Framer Motion IntersectionObserver replacement — v0.1 (PREP-01, PREP-02)
- ✓ Selector-based element hiding via `visibility: hidden` (preserves layout heights) — v0.1 (PREP-03)
- ✓ Scroll prime (viewport-step bottom-and-back) + configurable extraDelay — v0.1 (PREP-04, PREP-05)
- ✓ Full-page scroll-and-stitch capture (sharp composite, no `fullPage:true` ghosting) — v0.1 (OUT-01, OUT-02)
- ✓ Output writes to templated path with parent dirs auto-created — v0.1 (OUT-03)

### Validated (shipped in v0.2)

- ✓ Multi-viewport per run — declare `viewports: [...]` in one config, one `framershot capture` run produces one full-page PNG per viewport with per-viewport browser context isolation — v0.2 (MULTI-01)
- ✓ Region capture by CSS selector — `regions: [{ name, selector, padding? }]` scrolled into view, prepare pipeline applied, padding honored — v0.2 (REGION-01)
- ✓ Region capture by from/to anchors — `regions: [{ name, from, to, padding? }]` clipped to the bounding box spanning the two anchor elements — v0.2 (REGION-02)
- ✓ CLI `--only=<region-name>` flag — fail-fast validation pre-Chromium-launch; without the flag, full-page stitch behavior from v0.1 is unchanged (regions are additive) — v0.2 (REGION-03)

### Active (next milestone)

(None defined yet — see `/gsd:new-milestone` to scope v0.3.)

### Deferred (carry-forward to v0.3+)

- [ ] Multi-page per config — MULTI-02
- [ ] CLI `--viewport=<name>` and `--pages=<list>` filter flags — MULTI-03, MULTI-04
- [ ] Diff mode: compare two captures, output a diff image — DIFF-01
- [ ] Pre-capture hooks: run a script to set cookies or accept consent banners — HOOK-01
- [ ] Auth support for password-protected Framer staging URLs — AUTH-01

### Out of Scope (reasoning still valid after v0.1)

- Visual regression testing as a product — diff mode is a tool, not the north star. Why: capture is the goal; diff is a convenience, not the eventual platform.
- Distribution polish (npm publish, friendly errors for strangers, README for strangers, install-anywhere UX) — Why: personal tool. Polish only what makes daily use frictionless for me.
- Cross-browser capture (Firefox, WebKit) — Why: Chromium covers the use case; smaller install, fewer moving parts.
- Non-Framer site optimizations — Why: Framer-specific quirks (Framer Motion, framer data attributes) are the reason this exists; generalizing dilutes focus.
- Cloud / hosted capture service — Why: local-only by design. No server, no queue, no infrastructure.
- Headed mode as the default — Why: speed and reproducibility favor headless. Headed only as a debug flag if needed.
- Unit test suite — Why: verified via the hermetic smoke fixture (`samples/serve-smoke.js` + `samples/smoke.yaml`); adequate for personal-tool scope.

## Context

- Personal use case: capturing Framer sites (e.g. pubq.se) for marketing assets, archival, and visual reference
- Daily friction this replaces: Playwright's `fullPage: true` ghosts sticky navs; Framer Motion appear effects get caught mid-flight; lazy-loaded images come up blank; font flash leaves screenshots with fallback fonts — **all four resolved in v0.1, preserved through v0.2**
- The config file is the daily-touch surface — getting its ergonomics right matters more than internal architecture (confirmed across v0.1 and v0.2: zod + named field errors are pleasant in practice; backward-compatible normalization via `.transform` made v0.2's `viewports: [...]` shape additive without breaking v0.1 configs)
- Codebase state at v0.2 ship: ~3,356 LOC JS across `src/` (browser/, capture/, cli/, config/, output/, prepare/, server/); +~1,295 LOC over v0.1; ~148 commits total; ESM throughout. v0.2 added `src/capture/region.js` and grew `src/server/` substantially (a web-UI surface emerged alongside the CLI during v0.2).

## Constraints

- **Tech stack**: Node.js + `playwright-chromium` + sharp + commander v12 + js-yaml + zod + chalk + ora — known-good stack; Chromium-only keeps install lean
- **Runtime**: local only, no hosted service — personal tool, no infra to maintain
- **Browser scope**: Chromium only — smaller install, no cross-browser parity needed
- **Distribution**: not published to npm — install from local checkout or `npm link`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Stitch screenshots manually instead of Playwright `fullPage: true` | Native fullPage re-renders sticky elements on each pass, producing ghosted navs. Manual scroll-and-stitch with sharp lets us hide once and assemble cleanly. | ✓ Good — Phase 5 stitched output cleanly composites viewport frames; sticky elements appear once at top. |
| Surgical Framer Motion disabling via IntersectionObserver shim | The canonical Framer Motion hook is the IntersectionObserver; replacing it so `isIntersecting:true` fires synchronously triggers `whileInView` animations to their end state instantly. More reliable than CSS-only `animation: none`. | ✓ Good — Phase 4 ships the IO shim (pre-nav, context-level) + CSS injection as belt-and-braces. Note: `window.__framer_motion_disabled` is NOT a real Framer global — corrected at plan time. |
| `visibility: hidden` (not `display: none`) for hidden selectors | Preserves layout heights so Phase 5's viewport-step scroll math stays valid. | ✓ Good — confirmed in Phase 4 + Phase 5 verification. |
| Per-site YAML config as the primary interface | Capture parameters are sticky per project (selectors, viewports, hide list). Repeating them as CLI flags every run is unusable. Config file is the daily-touch surface. | ✓ Good — daily use confirms the ergonomics. |
| Chromium only, not all Playwright browsers (`playwright-chromium` package) | Personal tool, single rendering target needed, smaller install. | ✓ Good — install size and cold-launch time benefit observed. |
| Single error sink in `index.js` (libraries throw typed errors) | `ConfigError`, `BrowserError` carry pre-formatted messages; only top-level catch calls `console.error` / `process.exit`. Keeps library modules pure and testable. | ✓ Good — Phase 6 `formatError` dispatcher is the only formatter; works cleanly. |
| ESM + executable shebang committed via `git update-index --chmod=+x` | So `npm link` produces a working `framershot` command immediately after clone. | ✓ Good — `framershot` runs from any cwd. |
| Caret-major version ranges in `package.json` (`^1`, `^12`, …) | Let npm resolve latest within major; avoid over-pinning. | ✓ Good — no surprise breakages across the 4-day milestone. |
| Wave-based parallel plan execution with zero `files_modified` overlap | Phase 4 ran 4 plans in parallel, Phase 5 ran 2 — merges stayed trivial because each plan owned a distinct file. | ✓ Good — reused in v0.2: Phase 7 ran in 3 waves, Phase 8 in 4 waves, no merge conflicts. |
| Name: framershot | User-chosen; bin name, package name, config namespace all use this. | ✓ Good. |
| Per-viewport loop in `runCapture` (D-03, v0.2 Phase 7-02), not in callers | CLI and server stay dumb adapters consuming an array return shape; the iteration concern is internal to `runCapture`. Avoids duplicating lifecycle/event-scoping logic across two adapters. | ✓ Good — Phase 7-03 CLI/server changes were lean (just array consumers + per-result formatting). |
| `launchBrowser(config, viewportEntry)` two-arg signature (D-04, v0.2 Phase 7-02) | Separates per-viewport geometry from top-level baseURL + DSR. Keeps the launcher pure; `runCapture` owns the per-iteration lifecycle (context.close → browser.close in `try/finally`). | ✓ Good — per-viewport isolation observable in live runs (`.does-not-exist` warning fires once per viewport). |
| UI form stays single-viewport (D-05, v0.2 Phase 7-03) | Multi-viewport ergonomics belong to YAML, not the web form. The form is for quick one-off captures; the array shape belongs in version-controlled configs. | ✓ Good — kept the web UI scope tight; no form complexity creep. |
| Single `z.object` + `.superRefine` over `z.union` for `regionSchema` (v0.2 Phase 8-01) | Preserves actionable per-entry error messages (e.g. `regions[0] 'hero': selector and from/to are mutually exclusive`); `z.union` would flatten errors and lose the per-region name surface. | ✓ Good — all 4 region error paths produce clean `Error:` prefix via Guard 4 of `formatError`. |
| Open-Q#1 lock A: regions + no `--only` = N regions + 1 full-page per viewport (v0.2 Phase 8-03) | Regions are additive, not replacing — preserves v0.1 default behavior. Users opt into "region only" by passing `--only=<name>`. | ✓ Good — daily v0.1 configs that add regions get both surfaces; default is non-surprising. |
| `--only` fail-fast validation pre-Chromium-launch (v0.2 Phase 8-03) | Invalid region names should not waste a Chromium cold-start. Validation reads the regions list before `chromium.launch()`. | ✓ Good — typed `RegionError` thrown immediately; no wasted browser session. |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-24 after v0.2 milestone shipped (Multi-viewport & Region Capture).*
