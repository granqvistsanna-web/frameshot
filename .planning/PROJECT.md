# framershot

## What This Is

A local Node.js CLI that takes high-quality screenshots of Framer sites, with per-site YAML/JSON configs that handle the annoying parts vanilla Playwright botches: sticky navs, scroll-triggered animations, lazy-loaded media, custom viewports, and full-page stitching. Personal tool — not meant for distribution.

## Core Value

Reliably capture clean, retina-quality screenshots of Framer sites without ghosted navs, half-played animations, or missing lazy-loaded content.

## Requirements

### Validated

- [x] CLI scaffold with config loading (`framershot capture <config.yaml>`) — validated in Phase 2 (CLI-01)
- [x] Per-site YAML config: name, baseUrl, output template, viewport, page, prepare options — validated in Phase 2 (CFG-01)
- [x] Field-named validation errors (no raw zod dump) — validated in Phase 2 (CFG-02)
- [x] Templated output paths (`{date}`, `{viewport}`, `{page}` substitution) — validated in Phase 2 (CFG-03)

### Active
- [ ] Playwright launch with configurable viewport + `deviceScaleFactor` (2 or 3 for retina)
- [ ] Page navigation waits for `networkidle` + `document.fonts.ready`
- [ ] Animation neutralization: CSS injection + Framer Motion–specific disabling (IntersectionObserver replacement so in-view triggers fire instantly)
- [ ] Selector-based element hiding (sticky navs, banners, chat widgets)
- [ ] Scroll prime: scroll to bottom in steps, wait, scroll back to top — forces lazy images and reveals to settle
- [ ] Full-page stitched capture: scroll in viewport-height steps, capture each, stitch with `sharp` (avoids Playwright's native `fullPage` ghosting of sticky elements)
- [ ] Region capture by CSS selector (scroll into view, `element.screenshot()` with padding)
- [ ] Region capture by from/to anchors (compute bounding box between two anchors)
- [ ] Multi-viewport per run (desktop / tablet / mobile from one config)
- [ ] Multi-page per config
- [ ] CLI flags: `--only=<region>`, `--viewport=<name>`, `--pages=<list>`
- [ ] Diff mode: compare two captures, output a diff image
- [ ] Pre-capture hooks: run a script to set cookies or accept consent banners
- [ ] Auth support for password-protected Framer staging URLs

### Out of Scope

- Visual regression testing as a product — diff mode is a tool, not the north star. Why: capture is the goal; diff is a convenience, not the eventual platform.
- Distribution polish (npm publish, friendly errors, README for strangers, install-anywhere UX) — Why: personal tool. Polish only what makes daily use frictionless for me.
- Cross-browser capture (Firefox, WebKit) — Why: Chromium covers the use case; smaller install, fewer moving parts.
- Non-Framer site optimizations — Why: Framer-specific quirks (Framer Motion, framer data attributes) are the reason this exists; generalizing dilutes focus.
- Cloud / hosted capture service — Why: local-only by design. No server, no queue, no infrastructure.
- Headed mode as the default — Why: speed and reproducibility favor headless. Headed only as a debug flag if needed.

## Context

- Personal use case: capturing Framer sites (e.g. pubq.se) for marketing assets, archival, and visual reference
- Daily friction this replaces: Playwright's `fullPage: true` ghosts sticky navs; Framer Motion appear effects get caught mid-flight; lazy-loaded images come up blank; font flash leaves screenshots with fallback fonts
- Existing tools didn't cut it because they either don't handle scroll-prime, can't disable Framer Motion surgically, or require a hosted service
- The config file is the daily-touch surface — getting its ergonomics right matters more than internal architecture

## Constraints

- **Tech stack**: Node.js + Playwright (Chromium only) + sharp + commander/yargs + js-yaml/zod + chalk/ora — Why: known-good stack for this problem; Chromium-only keeps install lean
- **Runtime**: local only, no hosted service — Why: personal tool, no infra to maintain
- **Browser scope**: Chromium only — Why: smaller install (`playwright-chromium` over `playwright`), no need for cross-browser parity
- **Distribution**: not published to npm — Why: personal tool; install from local checkout or `npx` against a git URL is fine

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Stitch screenshots manually instead of Playwright `fullPage: true` | Native fullPage re-renders sticky elements on each capture pass, producing ghosted navs. Manual scroll-and-stitch with sharp lets us hide once and assemble cleanly. | — Pending |
| Surgical Framer Motion disabling as default (not just CSS brute-force) | `window.__framer_motion_disabled = true` + replacing IntersectionObserver fires all in-view triggers instantly. More reliable for Framer than CSS-only `animation: none`. | — Pending |
| Per-site config file (YAML/JSON) as the primary interface | Capture parameters are sticky per project (selectors, viewports, hide list). Repeating them as CLI flags every run is unusable. Config file is the daily-touch surface. | — Pending |
| Chromium only, not all Playwright browsers | Personal tool, single rendering target needed, smaller install. | — Pending |
| Name: framershot | User locked it in — bin name, package name, config namespace all use this. | — Pending |

---
*Last updated: 2026-05-20 — Phase 2 (CLI + Config) complete*
