# Milestones: framershot

Shipped versions, in reverse chronological order. Each entry links to its archive.

---

## v0.1 — MVP

**Shipped:** 2026-05-22
**Phases:** 1–6 (6 phases, 16 plans)
**Timeline:** 2026-05-19 → 2026-05-22 (4 days)
**Codebase:** ~2,061 LOC JS in `src/` (98 commits to ship)
**Archive:** [milestones/v0.1-ROADMAP.md](milestones/v0.1-ROADMAP.md) · [milestones/v0.1-REQUIREMENTS.md](milestones/v0.1-REQUIREMENTS.md)

### Delivered

A working local CLI (`framershot capture <config.yaml>`) that captures clean, retina-quality full-page screenshots of Framer sites — solving the four daily pain points: sticky-nav ghosting, half-played Framer Motion appear effects, blank lazy-loaded images, and font-flash fallbacks.

### Key Accomplishments

1. **ESM CLI scaffold with `framershot` bin** — commander v12, `npm link`-installable, executable shebang committed via `git update-index --chmod=+x` (Phase 1–2)
2. **YAML config with zod validation + field-named errors** — no raw zod dumps; `{date}`/`{viewport}`/`{page}` template placeholders (Phase 2)
3. **Playwright Chromium launch with retina viewport, `networkidle`, and `document.fonts.ready` waits** — 15s nav timeout, BrowserError on failure (Phase 3)
4. **Prepare pipeline — the differentiating work** — CSS animation disable, Framer Motion IntersectionObserver replacement (so `whileInView` triggers fire instantly), `visibility:hidden` selector hiding, scroll-prime with viewport-step waits, configurable extraDelay (Phase 4)
5. **Scroll-and-stitch full-page capture** — viewport-step screenshots stitched with sharp; sticky elements appear once, not on every viewport boundary (Phase 5)
6. **Terminal UX polish** — ora spinner across 7 step boundaries; `formatError` dispatcher routes ConfigError / BrowserError / TimeoutError / default to actionable messages (Phase 6)

### Known Gaps

None — all 18 v1 requirements delivered.

### Notable Decisions

- IntersectionObserver shim (canonical Framer Motion hook) over a fabricated `window.__framer_motion_disabled` global
- `visibility: hidden` (not `display: none`) for hidden selectors — preserves layout heights so scroll-stitch math works
- Scroll-and-stitch over Playwright's `fullPage: true` — avoids sticky-element ghosting
- Single error sink in `index.js`; library modules throw typed errors

### Deferred to v0.2+

Multi-viewport, multi-page, region capture, CLI filter flags, diff mode, pre-capture hooks, auth — see [milestones/v0.1-REQUIREMENTS.md](milestones/v0.1-REQUIREMENTS.md) §v2.

---
