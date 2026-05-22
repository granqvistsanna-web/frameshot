# Roadmap: framershot

## Milestones

- ✅ **v0.1 MVP** — Phases 1–6 (shipped 2026-05-22) — [archive](milestones/v0.1-ROADMAP.md)
- 🚧 **v0.2 Multi-viewport & Region Capture** — Phases 7–8 (planning started 2026-05-22)

## Phases

<details>
<summary>✅ v0.1 MVP (Phases 1–6) — SHIPPED 2026-05-22</summary>

- [x] Phase 1: Foundation (1/1 plans) — completed 2026-05-19
- [x] Phase 2: CLI + Config (3/3 plans) — completed 2026-05-20
- [x] Phase 3: Browser + Navigation (2/2 plans) — completed 2026-05-20
- [x] Phase 4: Prepare Pipeline (5/5 plans) — completed 2026-05-22
- [x] Phase 5: Scroll-Stitch Output (3/3 plans) — completed 2026-05-22
- [x] Phase 6: Terminal UX (2/2 plans) — completed 2026-05-22

Full milestone detail: [milestones/v0.1-ROADMAP.md](milestones/v0.1-ROADMAP.md)

</details>

### v0.2 Multi-viewport & Region Capture

- [ ] **Phase 7: Multi-viewport Capture** — One config + one `capture` run produces one full-page PNG per declared viewport
- [ ] **Phase 8: Region Capture** — Capture named regions (by selector or from/to anchors) instead of (or alongside) the full page, with `--only=<name>` filter

## Phase Details

### Phase 7: Multi-viewport Capture

**Goal**: User declares an array of viewports in a single config and one `framershot capture` run produces one full-page PNG per viewport, each with its own browser context
**Depends on**: Phase 6 (v0.1 shipped)
**Requirements**: MULTI-01
**Success Criteria** (what must be TRUE):

  1. A config with a `viewports: [...]` array of 2+ entries produces one full-page PNG per viewport in a single `framershot capture` run
  2. The `{viewport}` placeholder in the output template resolves to the per-viewport `name` field so PNGs land at distinct paths (no overwrites)
  3. Each viewport runs in its own Playwright browser context — no shared cookies, storage, or animation-shim state between viewports
  4. A v0.1-shaped config with a single `viewport: { ... }` block still validates and runs unchanged (backward compatibility preserved)
  5. The hermetic smoke fixture demonstrates a 2-viewport run producing 2 distinct PNGs end-to-end

**Plans**: 4 plans

- [ ] 07-01-PLAN.md — Schema + loader: viewportEntrySchema/viewportsSchema + mutually-exclusive root refinement + singular→plural normalize transform (Wave 1)
- [ ] 07-02-PLAN.md — runCapture per-viewport loop + launchBrowser(config, viewportEntry) refactor + per-viewport-scoped onProgress events + array return shape (Wave 2)
- [ ] 07-03-PLAN.md — CLI ora adapter + server SSE adapter consume array return; per-viewport spinner prefix; UI form stays single-viewport per D-05 (Wave 3)
- [ ] 07-04-PLAN.md — samples/smoke-multi.yaml hermetic 2-viewport fixture + human visual checkpoint (Wave 3, after 07-03)

---

### Phase 8: Region Capture

**Goal**: User declares named regions in config — by CSS selector or by from/to anchor pair — and captures each region as its own PNG, with `--only=<region-name>` to capture a single region instead of the full page
**Depends on**: Phase 7
**Requirements**: REGION-01, REGION-02, REGION-03
**Success Criteria** (what must be TRUE):

  1. A config with `regions: [{ name, selector, padding? }]` produces one PNG per selector-region — scrolled into view, prepare pipeline applied, padding honored
  2. A config with `regions: [{ name, from, to, padding? }]` produces one PNG per anchor-region — clipped to the bounding box spanning the two anchor elements
  3. Running `framershot capture <config> --only=<region-name>` captures only that single named region (skips full-page stitch and other regions); without the flag, full-page stitch behavior from v0.1 is unchanged
  4. A missing selector / missing anchor / unknown `--only` name surfaces an actionable error via the existing `formatError` dispatcher (typed error, not a raw throw)
  5. The hermetic smoke fixture demonstrates: (a) a selector-region capture, (b) an anchor-region capture, (c) the `--only` flag isolating one region

**Plans**: TBD

## Progress

| Phase                     | Milestone | Plans Complete | Status      | Completed  |
| ------------------------- | --------- | -------------- | ----------- | ---------- |
| 1. Foundation             | v0.1      | 1/1            | Complete    | 2026-05-19 |
| 2. CLI + Config           | v0.1      | 3/3            | Complete    | 2026-05-20 |
| 3. Browser + Navigation   | v0.1      | 2/2            | Complete    | 2026-05-20 |
| 4. Prepare Pipeline       | v0.1      | 5/5            | Complete    | 2026-05-22 |
| 5. Scroll-Stitch Output   | v0.1      | 3/3            | Complete    | 2026-05-22 |
| 6. Terminal UX            | v0.1      | 2/2            | Complete    | 2026-05-22 |
| 7. Multi-viewport Capture | v0.2      | 0/4 | Planned    |  |
| 8. Region Capture         | v0.2      | 0/?            | Not started | -          |
