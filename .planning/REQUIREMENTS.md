# Requirements: framershot

**Defined:** 2026-05-19
**Core Value:** Reliably capture clean, retina-quality screenshots of Framer sites without ghosted navs, half-played animations, or missing lazy-loaded content.

## v1 Requirements

Scope: v0.1 minimum viable — CLI + config + single page/viewport full-page stitched capture with prepare pipeline.

### CLI

- [x] **CLI-01**: User can run `framershot capture <config.yaml>` from any directory and produce screenshots
- [ ] **CLI-02**: User sees terminal progress output (current page, current step) while capture runs
- [ ] **CLI-03**: User sees actionable error messages when capture fails (config error, network error, missing selector)

### Config

- [x] **CFG-01**: User can author a YAML config with name, baseUrl, output template, deviceScaleFactor, single viewport, single page, and prepare options
- [x] **CFG-02**: Invalid config files are rejected with specific error messages pointing to the bad field (zod-based validation)
- [x] **CFG-03**: Output path template supports `{date}`, `{viewport}`, `{page}` placeholders

### Capture

- [x] **CAP-01**: Browser launches Chromium headless with configured viewport width and height
- [x] **CAP-02**: Capture honors `deviceScaleFactor` for retina-quality output (2x or 3x)
- [x] **CAP-03**: Browser navigates to `baseUrl` + page path and waits for `networkidle` before proceeding
- [x] **CAP-04**: Capture waits for `document.fonts.ready` so screenshots don't use fallback fonts

### Prepare

- [ ] **PREP-01**: Animations are disabled before capture via CSS injection (`animation: none !important; transition: none !important`)
- [ ] **PREP-02**: Framer Motion appear effects fire instantly via IntersectionObserver replacement so in-view triggers complete before capture
- [ ] **PREP-03**: Selectors in the config's `hide` list are hidden from the page before capture (sticky navs, banners, chat widgets)
- [ ] **PREP-04**: Scroll prime runs (scroll to bottom in viewport-height steps with wait, then scroll back to top) when enabled in config
- [ ] **PREP-05**: Configured `extraDelay` (ms) is honored before capture begins

### Output

- [ ] **OUT-01**: Full-page screenshot is captured by scrolling in viewport-height steps and capturing each frame
- [ ] **OUT-02**: Captured frames are stitched into a single PNG using sharp with no ghosted sticky elements and no visible seams
- [ ] **OUT-03**: Output file is written to the templated path with parent directories created as needed

## v2 Requirements

Deferred to future milestones (v0.2 and v0.3 from spec). Tracked but not in current roadmap.

### Multi-target capture (v0.2)

- **MULTI-01**: User can declare multiple viewports in config and capture all in one run
- **MULTI-02**: User can declare multiple pages in config and capture all in one run
- **MULTI-03**: User can pass `--viewport=<name>` to restrict a run to one viewport
- **MULTI-04**: User can pass `--pages=<list>` to restrict a run to specific pages

### Region capture (v0.2)

- **REGION-01**: User can declare named regions by CSS selector and capture only that element with padding
- **REGION-02**: User can declare named regions by `from`/`to` anchors and capture the bounding box between them
- **REGION-03**: User can pass `--only=<region>` to capture a specific region instead of the full page

### Advanced (v0.3)

- **DIFF-01**: User can run a diff command comparing two captures and get a diff image
- **HOOK-01**: User can declare pre-capture hooks (scripts) that run before capture to set cookies or accept consent
- **AUTH-01**: User can configure HTTP basic auth or password-protected Framer staging URL credentials

## Out of Scope

| Feature | Reason |
|---------|--------|
| Visual regression testing as a product | Capture is the goal; diff mode is a tool, not the north star |
| npm publish + friendly stranger UX + comprehensive README | Personal tool; polish only what makes daily use frictionless |
| Cross-browser capture (Firefox, WebKit) | Chromium covers the use case; smaller install |
| Non-Framer site optimizations / general-purpose tool | Framer-specific quirks are why this exists; generalizing dilutes focus |
| Cloud / hosted capture service | Local-only by design; no server or infrastructure |
| Headed mode as default | Speed and reproducibility favor headless; headed only as debug flag if added |

## Traceability

Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLI-01 | Phase 2 | Complete |
| CLI-02 | Phase 6 | Pending |
| CLI-03 | Phase 6 | Pending |
| CFG-01 | Phase 2 | Complete |
| CFG-02 | Phase 2 | Complete |
| CFG-03 | Phase 2 | Complete |
| CAP-01 | Phase 3 | Complete |
| CAP-02 | Phase 3 | Complete |
| CAP-03 | Phase 3 | Complete |
| CAP-04 | Phase 3 | Complete |
| PREP-01 | Phase 4 | Pending |
| PREP-02 | Phase 4 | Pending |
| PREP-03 | Phase 4 | Pending |
| PREP-04 | Phase 4 | Pending |
| PREP-05 | Phase 4 | Pending |
| OUT-01 | Phase 5 | Pending |
| OUT-02 | Phase 5 | Pending |
| OUT-03 | Phase 5 | Pending |

**Coverage:**

- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-19*
*Last updated: 2026-05-19 after roadmap creation*
