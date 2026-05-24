# Milestones: framershot

Shipped versions, in reverse chronological order. Each entry links to its archive.

---

## v0.2 — Multi-viewport & Region Capture

**Shipped:** 2026-05-24
**Phases:** 7–8 (2 phases, 8 plans)
**Timeline:** 2026-05-22 → 2026-05-24 (3 days)
**Codebase:** ~3,356 LOC JS in `src/` (+~1,295 LOC over v0.1; 50 commits to ship)
**Archive:** [milestones/v0.2-ROADMAP.md](milestones/v0.2-ROADMAP.md) · [milestones/v0.2-REQUIREMENTS.md](milestones/v0.2-REQUIREMENTS.md)

### Delivered

Multi-viewport captures from a single config (declare desktop/tablet/mobile, get N retina PNGs in one run, each in its own Playwright context) plus region capture by CSS selector or from/to anchor pair — with a `--only=<region>` CLI flag that fail-fast-validates before any browser launch. v0.1 single-viewport / no-regions configs run unchanged; the prepare pipeline (animation disable + IO shim + selector hiding + scroll prime + extraDelay) is reused verbatim per viewport and per region.

### Key Accomplishments

1. **Backward-compatible multi-viewport schema** — root `.superRefine` enforces singular/plural mutual exclusivity; `.transform` normalizes singular `viewport:` into `viewports: [{ ..., name: 'default' }]`; downstream code only reads `config.viewports[]` (Phase 7-01)
2. **Per-viewport browser context isolation** — `for (const vp of config.viewports)` loop in `runCapture` with per-iteration `try/finally` (context.close → browser.close) + per-iteration `installAnimationGuards`; observable proof: `.does-not-exist` warning fires once per viewport in live runs (Phase 7-02)
3. **CLI + server adapter migration to array return shape** — `[<viewport>]` ora spinner prefix; one stdout line per viewport; SSE done frame is `outputs: [...]` (Phase 7-03)
4. **Region capture by selector or from/to anchors** — `captureRegion` module covers both modes (selector → scrollIntoView + measure + screenshot; anchor → unionRect + clip); module-private `padRect`/`unionRect`/`clampToDocument` helpers; `RegionError` typed error mirrors `BrowserError`; `{region}` placeholder slugifies region name into output template (Phase 8-01, 8-02)
5. **`--only=<region>` fail-fast CLI filter + nested per-viewport × per-region orchestration** — `--only` validates against the regions list BEFORE Chromium launch; `--smoke`/`--only` mutex throws `RegionError`; default behavior (no `--only`) keeps regions additive — N regions + 1 full-page stitch per viewport (Open-Q#1 lock A) (Phase 8-03, 8-04)
6. **Hermetic smoke fixtures extend the v0.1 pattern** — `samples/smoke-multi.yaml` (2-viewport: desktop 800×600, mobile 375×667) and `samples/smoke-regions.yaml` (selector hero + anchor cards from/to + full-page); end-to-end visual checkpoints approved (Phase 7-04, 8-04)

### Known Gaps

None — all 4 v0.2 requirements (MULTI-01, REGION-01, REGION-02, REGION-03) delivered and verified against the live codebase (2/2 phase verifications PASS, 10/10 success criteria PASS).

### Notable Decisions

- Loop in `runCapture` (D-03), not in callers — CLI/server stay dumb adapters consuming an array return
- `launchBrowser(config, viewportEntry)` two-arg signature (D-04) — per-viewport geometry separated from top-level baseURL + DSR
- UI form stays single-viewport (D-05) — multi-viewport ergonomics belong to YAML, not the web form
- Single `z.object` + `.superRefine` over `z.union` for regions — preserves actionable per-entry error messages
- Open-Q#1 lock A: regions + no `--only` = N regions + 1 full-page per viewport (regions are additive, not replacing) — preserves v0.1 default behavior

### Deferred to v0.3+

Multi-page per config (MULTI-02), `--viewport=<name>` and `--pages=<list>` CLI filters (MULTI-03, MULTI-04), diff mode (DIFF-01), pre-capture hooks (HOOK-01), auth for protected staging (AUTH-01) — see [milestones/v0.2-REQUIREMENTS.md](milestones/v0.2-REQUIREMENTS.md) §Deferred.

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
