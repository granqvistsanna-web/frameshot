# Roadmap: framershot

## Overview

framershot v0.1 delivers a local CLI that captures clean, retina-quality full-page screenshots of Framer sites. Six phases build the tool from scratch: project scaffold, CLI + config loading, browser launch and navigation, the prepare pipeline (the differentiating work — Framer Motion surgical disable + scroll prime), the scroll-and-stitch capture loop, and finally terminal UX polish that makes errors actionable and progress visible.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Project scaffold, dependencies, bin entry wired
- [ ] **Phase 2: CLI + Config** - Commander wiring, YAML parsing, zod validation, output template resolver
- [ ] **Phase 3: Browser + Navigation** - Playwright launch, viewport, retina scale, networkidle + fonts.ready waits
- [ ] **Phase 4: Prepare Pipeline** - Animation disable, Framer Motion surgical fix, element hiding, scroll prime, extraDelay
- [ ] **Phase 5: Scroll-Stitch Output** - Viewport-step scroll-capture loop, sharp stitch, write to templated path
- [ ] **Phase 6: Terminal UX** - ora progress output, actionable error messages for all failure modes

## Phase Details

### Phase 1: Foundation
**Goal**: A working Node.js project exists that can be run as a CLI binary from any directory
**Depends on**: Nothing (first phase)
**Requirements**: None (prerequisite scaffolding — all v1 requirements depend on this phase)
**Success Criteria** (what must be TRUE):
  1. Running `node index.js` (or `framershot` after local install) does not crash with a module error
  2. All production dependencies (playwright-chromium, sharp, commander, js-yaml, zod, chalk, ora) are installed and importable
  3. `package.json` declares the `framershot` bin and the project runs with `node --experimental-vm-modules` or ESM config as needed
**Plans**: TBD

Plans:
- [ ] 01-01: Initialize package.json, install dependencies, configure ESM/CJS, wire bin entry

---

### Phase 2: CLI + Config
**Goal**: User can point `framershot capture <config.yaml>` at a real config file and have it parsed, validated, and ready for capture
**Depends on**: Phase 1
**Requirements**: CLI-01, CFG-01, CFG-02, CFG-03
**Success Criteria** (what must be TRUE):
  1. Running `framershot capture sample.yaml` with a valid config file parses without error and prints the resolved config to stdout (smoke test mode)
  2. Running `framershot capture bad.yaml` where a required field is missing or wrong type prints a specific error message naming the bad field (not a raw zod dump)
  3. An output path template containing `{date}`, `{viewport}`, and `{page}` resolves to the correct string with current date and config values substituted
  4. Running `framershot` with no arguments prints usage help
**Plans**: TBD

Plans:
- [ ] 02-01: Wire commander, define `capture` subcommand, resolve config file path
- [ ] 02-02: Define zod schema for full config shape, parse YAML, validate, surface errors
- [ ] 02-03: Implement output path template resolver (`{date}`, `{viewport}`, `{page}`)

---

### Phase 3: Browser + Navigation
**Goal**: Playwright launches Chromium, opens the target URL at the configured viewport and retina scale, and waits until the page is fully loaded and fonts are rendered before proceeding
**Depends on**: Phase 2
**Requirements**: CAP-01, CAP-02, CAP-03, CAP-04
**Success Criteria** (what must be TRUE):
  1. A Playwright browser launches headless Chromium with the exact pixel width, height, and deviceScaleFactor declared in the config
  2. The browser navigates to `baseUrl + page.path` and does not proceed until network activity is idle
  3. Capture does not proceed until `document.fonts.ready` resolves, ensuring no fallback fonts appear in screenshots
  4. A screenshot taken immediately after navigation (no prepare steps yet) shows the page rendered at the correct viewport size in the output file dimensions
**Plans**: TBD

Plans:
- [ ] 03-01: Implement browser launcher (Playwright Chromium, viewport, deviceScaleFactor, headless)
- [ ] 03-02: Implement page navigator (navigate to URL, wait networkidle, wait fonts.ready)

---

### Phase 4: Prepare Pipeline
**Goal**: Before capture, every configured prepare step runs in sequence — animations are frozen, Framer Motion in-view triggers have fired, unwanted elements are hidden, and the page has been scroll-primed so all lazy content has loaded
**Depends on**: Phase 3
**Requirements**: PREP-01, PREP-02, PREP-03, PREP-04, PREP-05
**Success Criteria** (what must be TRUE):
  1. A screenshot of a Framer site taken after prepare shows no partially-played appear animations — elements are either fully visible or fully hidden
  2. Elements listed in the config `hide` array (e.g. sticky nav selector) are not visible in the captured screenshot
  3. After scroll prime completes, lazily loaded images that only appear below the fold are present in the final screenshot (not blank placeholders)
  4. The `extraDelay` value in config (e.g. 1000ms) causes an observable pause before capture begins — verifiable by adding a console.time around the prepare step
  5. CSS `animation` and `transition` properties are set to `none` globally via injected style, observable by inspecting computed styles in a headed debug run
**Plans**: TBD

Plans:
- [ ] 04-01: Implement CSS animation/transition injection (PREP-01)
- [ ] 04-02: Implement Framer Motion surgical disable — IntersectionObserver replacement + `window.__framer_motion_disabled` (PREP-02)
- [ ] 04-03: Implement element hiding from `hide` selector list (PREP-03)
- [ ] 04-04: Implement scroll prime (viewport-step scroll to bottom + wait + scroll to top) and extraDelay (PREP-04, PREP-05)

---

### Phase 5: Scroll-Stitch Output
**Goal**: The full page is captured as a clean, single PNG by scrolling in viewport-height steps, capturing each frame, and stitching with sharp — with no ghosted sticky elements and no visible seams
**Depends on**: Phase 4
**Requirements**: OUT-01, OUT-02, OUT-03
**Success Criteria** (what must be TRUE):
  1. Running `framershot capture sample.yaml` produces a PNG file at the path defined by the output template (e.g. `./screenshots/2026-05-19/desktop/home.png`)
  2. The output PNG's height equals the full scrollable page height and shows content from top to bottom with no missing sections
  3. Sticky navigation elements appear exactly once at the top of the stitched image, not repeated at every viewport-height interval
  4. Parent directories of the output path are created automatically if they do not exist
**Plans**: TBD

Plans:
- [ ] 05-01: Implement scroll-capture loop (scroll in viewport-height steps, screenshot each frame)
- [ ] 05-02: Implement sharp stitch (compose frames into single PNG, compute canvas height)
- [ ] 05-03: Resolve output path from template, create parent directories, write PNG

---

### Phase 6: Terminal UX
**Goal**: The CLI communicates clearly during every run — showing current progress while running and surfacing actionable, specific error messages when anything fails
**Depends on**: Phase 5
**Requirements**: CLI-02, CLI-03
**Success Criteria** (what must be TRUE):
  1. While a capture is running, the terminal shows the current step (e.g. "Navigating to /", "Running prepare pipeline", "Capturing frame 3/7") without requiring the user to wait blind
  2. When a config file has a validation error, the error message names the specific field and expected type — not a raw zod error object dump
  3. When a network error occurs (URL unreachable), the error message includes the URL that failed and a plain-English description of what went wrong
  4. When a selector in the `hide` list matches nothing, a warning is printed but capture continues rather than crashing
**Plans**: TBD

Plans:
- [ ] 06-01: Add ora spinner + step-level progress messages throughout the capture flow
- [ ] 06-02: Implement error message formatting layer (config errors, network errors, selector warnings)

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/1 | Not started | - |
| 2. CLI + Config | 0/3 | Not started | - |
| 3. Browser + Navigation | 0/2 | Not started | - |
| 4. Prepare Pipeline | 0/4 | Not started | - |
| 5. Scroll-Stitch Output | 0/3 | Not started | - |
| 6. Terminal UX | 0/2 | Not started | - |
