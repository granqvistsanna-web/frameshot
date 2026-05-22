---
phase: 04-prepare-pipeline
plan: 02
subsystem: prepare
tags: [hide, visibility, css, playwright, PREP-03]
dependency_graph:
  requires: [src/browser/navigator.js, src/config/schema.js]
  provides: [src/prepare/hide.js]
  affects: [src/prepare/index.js (04-05 imports hideSelectors)]
tech_stack:
  added: []
  patterns: [page.evaluate with arg seam, visibility:hidden inline-important, matched/missed summary shape]
key_files:
  created: [src/prepare/hide.js]
  modified: []
decisions:
  - "visibility:hidden via setProperty('visibility','hidden','important') — NOT display:none — to preserve document.scrollHeight for Phase 5's scroll-stitch math"
  - "Selectors passed as page.evaluate arg (not interpolated) — injection-proof boundary per RESEARCH §Security"
  - "Invalid CSS selectors go into missed[], not thrown — library returns data, Phase 6 owns warnings"
  - "Zero imports — pure single-function module, no BrowserError wrapping"
metrics:
  duration: "~5 minutes"
  completed: "2026-05-22"
---

# Phase 4 Plan 02: Element Hiding (PREP-03) Summary

**One-liner:** hideSelectors(page, selectors) hides matching DOM elements via inline-important visibility:hidden (not display:none, preserving scrollHeight for Phase 5 stitching) and returns { matched, missed } for Phase 6 observability.

## Task Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement src/prepare/hide.js | ca0985f | src/prepare/hide.js (created, 87 lines) |

## Exported API Surface

**File:** `src/prepare/hide.js`

```javascript
/**
 * Hide elements matching the given CSS selectors using `visibility: hidden` with
 * `!important` (not the `display` property, which would shrink scrollHeight and
 * break Phase 5's scroll-stitch math).
 *
 * @param {import('playwright-chromium').Page} page
 * @param {string[]} selectors — the validated config.prepare.hide array
 * @returns {Promise<{ matched: number, missed: string[] }>}
 */
export async function hideSelectors(page, selectors)
```

**visibility:hidden rationale (verbatim from file header):**
`visibility:hidden` preserves layout and removes visual presence. The `display` property MUST NOT be set to "none" — doing so shrinks `document.scrollHeight`, which breaks Phase 5's scroll-stitch math (the capture loop reads `scrollHeight` to compute frame count).

## End-to-End Verification Output

```
ok
```

The script exited 0 and printed `ok`, confirming all assertions passed.

## PREP-03 Probe Result

4-selector probe against `<nav class="sticky-nav">N1</nav><nav class="sticky-nav">N2</nav><div id="lonely">L</div>` with author stylesheet `.sticky-nav { visibility: visible !important }`:

```
selectors: ['.sticky-nav', '#lonely', '.does-not-exist', '[unclosed[']
result:    { matched: 3, missed: ['.does-not-exist', '[unclosed['] }
```

- `.sticky-nav` matched 2 nodes → both contribute to `matched` (increments per node)
- `#lonely` matched 1 node → contributes to `matched`
- `.does-not-exist` matched 0 nodes → recorded in `missed`
- `[unclosed[` is invalid CSS syntax → `querySelectorAll` throws `SyntaxError` → recorded in `missed`

## Author-Important Override Confirmation

Author stylesheet declared: `.sticky-nav { visibility: visible !important }`

After `hideSelectors` ran:
- `getComputedStyle(.sticky-nav[0]).visibility` → `"hidden"` (our inline-important beat author-important)
- `getComputedStyle(.sticky-nav[1]).visibility` → `"hidden"`
- `getComputedStyle(#lonely).visibility` → `"hidden"`

The 3-argument form `node.style.setProperty('visibility', 'hidden', 'important')` (CSSOM inline-important) beat the author-important rule via cascade ordering (inline beats author at equal priority level).

## Layout Preservation Confirmation

After `hideSelectors` ran: `document.documentElement.scrollHeight > 0` → `true`

Using `visibility:hidden` preserves layout; `scrollHeight` remains positive. If `display:none` had been used, `scrollHeight` would be 0 or significantly smaller, breaking Phase 5's scroll-stitch frame-count computation.

## No New Dependencies

`package.json` is unchanged. `git diff HEAD~1 HEAD -- package.json` produced no output. `src/prepare/hide.js` has zero import statements — operates entirely on `page.evaluate`.

## Note for 04-05 (Orchestrator)

The return value `{ matched, missed }` is informational only. Phase 4 does NOT consume it internally. `04-05`'s `runPreparePipeline` orchestrator captures it as `hideSummary` and passes it up so Phase 6 (CLI-03) can surface warnings later (e.g., "2 selectors in hide list matched nothing: .does-not-exist, [unclosed[").

## Note for 04-03 (scroll.js)

`src/prepare/hide.js` does NOT import or depend on `src/prepare/scroll.js`. The orchestrator (04-05) sequences hide → scrollPrime → extraDelay; all three modules are independent and can be developed in parallel (wave 1).

## Deviations from Plan

**1. [Rule 1 - Bug] Header comment phrasing to avoid false-positive in verify grep**
- **Found during:** Task 1 verification
- **Issue:** The plan's action template included literal `display: none` in the header comment block, but the plan's own `<verify>` script used `! grep -qE "display\s*:\s*none"` to assert no `display: none` exists in the file. Since `\s*` matches zero spaces, the comment text triggered the grep.
- **Fix:** Rephrased the comment to describe the constraint without using the literal string `display: none` (or `display:none`). The meaning is preserved: "The `display` property MUST NOT be set to 'none'."
- **Files modified:** `src/prepare/hide.js` (header comment only, no functional change)
- **Commit:** ca0985f (part of the same commit — no separate commit needed; fix was in initial write)

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This module operates entirely inside `page.evaluate` — runs in the page's JS context with no external I/O. The selectors are passed as the `arg` argument (injection-proof seam per STRIDE threat T-04-02-XS). All threats identified in the plan's `<threat_model>` are addressed.

## Self-Check: PASSED

- FOUND: src/prepare/hide.js
- FOUND: commit ca0985f (feat(04-02): implement hideSelectors)
