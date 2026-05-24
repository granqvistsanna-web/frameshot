# Requirements: framershot — Milestone v0.2

**Defined:** 2026-05-22
**Milestone:** v0.2 — Multi-viewport & Region Capture
**Core Value:** Reliably capture clean, retina-quality screenshots of Framer sites without ghosted navs, half-played animations, or missing lazy-loaded content.

**Carry-forward context:** v0.1 shipped the full prepare pipeline, scroll-stitch full-page capture, ora progress, and typed-error reporting. v0.2 adds breadth without compromising that pipeline — multi-viewport iteration and region capture both reuse the existing prepare → capture flow.

## v0.2 Requirements

Scope: 4 requirements across 2 categories. Single-page-per-config remains in force; multi-page is deferred.

### Multi-viewport

- [x] **MULTI-01**: User can declare multiple viewports in one config (array of `{ name, width, height, deviceScaleFactor }`) and one `framershot capture` run produces one full-page PNG per viewport. Output template `{viewport}` placeholder resolves to the per-viewport `name`. Each viewport gets its own browser context (no shared state).

### Region capture

- [x] **REGION-01**: User can declare named regions in config by CSS selector (`regions: [{ name, selector, padding? }]`) and capture only that element to its own PNG — scrolled into view, prepare pipeline applied, padding honored.

- [x] **REGION-02**: User can declare named regions by from/to anchors (`regions: [{ name, from, to, padding? }]`) — capture computes the bounding box between the two anchor elements and clips to it.

- [x] **REGION-03**: User can pass `--only=<region-name>` to `framershot capture` to capture a single named region instead of the full page. Without the flag, the full-page stitch behavior from v0.1 is unchanged.

## Validated (carried from v0.1, not re-evaluated)

The full v0.1 validated list lives in `milestones/v0.1-REQUIREMENTS.md`. Carry-forward summary:

- CLI-01/02/03, CFG-01/02/03, CAP-01/02/03/04, PREP-01/02/03/04/05, OUT-01/02/03 — all shipped in v0.1

## Deferred (post-v0.2)

| ID | Capability | Why deferred |
|----|-----------|--------------|
| MULTI-02 | Multiple pages per config | Out of v0.2 scope; pick up when daily use surfaces the need |
| MULTI-03 | `--viewport=<name>` CLI filter | Needed only after multi-viewport surface has been used in anger; YAGNI for v0.2 |
| MULTI-04 | `--pages=<list>` CLI filter | Depends on MULTI-02 |
| DIFF-01 | Diff mode between two captures | Convenience, not the north star |
| HOOK-01 | Pre-capture hooks (cookies / consent) | No current site needs this |
| AUTH-01 | Auth for password-protected staging | No current site needs this |

## Out of Scope (still excluded)

| Feature | Reason |
|---------|--------|
| Visual regression testing as a product | Capture is the goal; diff is a tool |
| npm publish + stranger-friendly UX | Personal tool |
| Cross-browser capture (Firefox, WebKit) | Chromium covers the use case |
| Non-Framer site optimizations | Framer-specific quirks are why this exists |
| Cloud / hosted capture service | Local-only by design |
| Headed mode as default | Speed and reproducibility favor headless |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MULTI-01 | Phase 7 | Complete (Plans 01–04, verified 2026-05-24) |
| REGION-01 | Phase 8 | Complete (Plans 01–04, verified 2026-05-24) |
| REGION-02 | Phase 8 | Complete (Plans 01–04, verified 2026-05-24) |
| REGION-03 | Phase 8 | Complete (Plans 03–04, verified 2026-05-24) |

**Coverage:**

- v0.2 requirements: 4 total
- Mapped to phases: 4 ✓
- Unmapped: 0

---
*Requirements defined: 2026-05-22 — Roadmap mapped: 2026-05-22*
