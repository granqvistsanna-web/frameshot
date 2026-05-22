# framershot

## What This Is

A local Node.js CLI that takes high-quality screenshots of Framer sites, with per-site YAML configs that handle the parts vanilla Playwright botches: sticky navs, scroll-triggered animations, lazy-loaded media, custom viewports, and full-page stitching. Personal tool — not meant for distribution.

**Current state (v0.1 shipped 2026-05-22):** Single-page, single-viewport capture works end-to-end. `framershot capture <config.yaml>` produces a clean, retina full-page PNG to a templated path. ora progress, actionable errors, and the full prepare pipeline (animation disable + Framer Motion IO shim + selector hiding + scroll prime + extraDelay) are live.

## Core Value

Reliably capture clean, retina-quality screenshots of Framer sites without ghosted navs, half-played animations, or missing lazy-loaded content.

Validated post-v0.1: the four daily pain points (sticky-nav ghosting, mid-flight appear effects, blank lazy-loaded images, font-flash) are all solved in the shipped output. The config file is, as predicted, the daily-touch surface — getting its ergonomics right has mattered more than internal architecture.

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

### Active (next milestone — not yet scoped)

Deferred from v0.1; pick a subset for v0.2 via `/gsd:new-milestone`:

- [ ] Multi-viewport per run (desktop / tablet / mobile from one config) — MULTI-01
- [ ] Multi-page per config — MULTI-02
- [ ] CLI filter flags: `--viewport=<name>`, `--pages=<list>`, `--only=<region>` — MULTI-03, MULTI-04, REGION-03
- [ ] Region capture by CSS selector (scroll into view, `element.screenshot()` with padding) — REGION-01
- [ ] Region capture by from/to anchors (compute bounding box between two anchors) — REGION-02
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
- Daily friction this replaces: Playwright's `fullPage: true` ghosts sticky navs; Framer Motion appear effects get caught mid-flight; lazy-loaded images come up blank; font flash leaves screenshots with fallback fonts — **all four resolved in v0.1**
- The config file is the daily-touch surface — getting its ergonomics right matters more than internal architecture (confirmed: zod + named field errors are pleasant in practice)
- Codebase state at v0.1 ship: ~2,061 LOC JS across `src/` (browser/, capture/, cli/, config/, output/, prepare/); 98 commits; ESM throughout

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
| Wave-based parallel plan execution with zero `files_modified` overlap | Phase 4 ran 4 plans in parallel, Phase 5 ran 2 — merges stayed trivial because each plan owned a distinct file. | ✓ Good — pattern to reuse in v0.2. |
| Name: framershot | User-chosen; bin name, package name, config namespace all use this. | ✓ Good. |

---
*Last updated: 2026-05-22 after v0.1 milestone shipped*
