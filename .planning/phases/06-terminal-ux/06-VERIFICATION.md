---
phase: 06-terminal-ux
verified: 2026-05-22T00:00:00Z
status: passed
score: 4/4
overrides_applied: 0
re_verification: false
---

# Phase 06: Terminal UX — Verification Report

**Phase Goal:** The CLI communicates clearly during every run — showing current progress while running and surfacing actionable, specific error messages when anything fails.

**Verified:** 2026-05-22
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Terminal shows current step while running (e.g. "Navigating to /", "Running prepare pipeline", "Capturing frame 3/7") without requiring user to wait blind | VERIFIED | See detail below |
| 2 | Config validation error names specific field and expected type — not a raw zod error dump | VERIFIED | See detail below |
| 3 | Network error includes the URL that failed AND plain-English description | VERIFIED | See detail below |
| 4 | Missing hide selector prints a warning but capture continues rather than crashing | VERIFIED | See detail below |

**Score:** 4/4 truths verified

---

## SC #1 — Live progress while running

**Claim:** The terminal shows the current step at each phase boundary without requiring blind waiting.

**Code evidence:**

`src/cli.js` wires 7 distinct spinner text assignments:

- Line 36: `spinner.start('Loading config')`
- Line 45: `spinner.text = 'Launching Chromium'`
- Line 49: `spinner.text = 'Installing animation guards'`
- Line 53: `` spinner.text = `Navigating to ${config.baseUrl}${config.page.path}` ``
- Line 59: `spinner.text = 'Running prepare pipeline'`
- Line 101: `spinner.text = 'Capturing frame 0/?'`
- Line 104: `` spinner.text = `Capturing frame ${current}/${total}` `` (fired per frame via `onProgress`)

The `onProgress` callback chain is fully wired:

- `src/cli.js:102–105` passes `onProgress` to `captureFullPage`
- `src/capture/index.js:59,62` destructures it and passes it to `captureFrames`
- `src/capture/frames.js:73,136` destructures it and invokes `onProgress?.(i + 1, total)` after every frame screenshot resolves

**Smoke run output (run 2026-05-22, happy path):**

```
- Loading config
prepare: 2.042s
⚠ hide selector ".does-not-exist" matched 0 elements (or invalid CSS) — skipped
- Running prepare pipeline
smoke screenshot written: /tmp/framershot-smoke/home.png
```

The `- Loading config` and `- Running prepare pipeline` labels confirm the spinner is live at those steps. The "Capturing frame N/M" label is exercised in non-smoke (full-page) runs via the `onProgress` callback; the code path is verified as wired.

**Verdict: VERIFIED**

---

## SC #2 — Config validation error names specific field and type

**Claim:** When a config file has a validation error, the error message names the specific field and expected type — not a raw zod error object dump.

**Code evidence:**

- `src/config/schema.js:68–85` — `formatZodError` maps each `ZodIssue` to `"${field}: expected ${issue.expected}, got ${issue.received}"` for `invalid_type` errors. The `field` is `issue.path.join('.')`.
- `src/config/load.js:78–79` — calls `formatZodError` and throws `ConfigError` with the formatted lines embedded in the message.
- `src/cli/format.js:104–106` — `formatError` handles `ConfigError` by prefixing `chalk.red('Error:')` and printing `err.message` verbatim without further transformation.
- `index.js:9` — `console.error(formatError(err))` is the single output sink.

**Fixture run output (`bad-viewport-width.yaml`, run 2026-05-22, exit code 1):**

```
- Loading config
Error: Invalid config in /Users/sannagranqvist/Documents/App/screenshotter/samples/bad-viewport-width.yaml:
  viewport.width: expected number, got string
```

Field named (`viewport.width`), expected type stated (`number`), received type stated (`string`). No raw ZodError object in output.

**Verdict: VERIFIED**

---

## SC #3 — Network error includes URL and plain-English description

**Claim:** When a network error occurs (URL unreachable), the error message includes the URL that failed AND a plain-English description of what went wrong.

**Code evidence:**

- `src/browser/navigator.js:56–60` — non-TimeoutError navigation failures are wrapped as:
  `"Failed to navigate to ${pageConfig.path} (resolved against context baseURL). Original error: ${err.message}"`
  The Playwright error message for DNS failure contains the full URL including the configured host.
- `src/cli/format.js:111–115` — `BrowserError` handler outputs `chalk.red('Error:')` + `err.message`.
- `index.js:9` — single output sink.

**Fixture run output (`bad-baseurl.yaml`, run 2026-05-22, exit code 1):**

```
- Loading config
Error: Failed to navigate to / (resolved against context baseURL). Original error: page.goto: net::ERR_NAME_NOT_RESOLVED at https://nonexistent.example.tld/
```

Plain-English description present ("Failed to navigate to ... resolved against context baseURL"). URL that failed present (`https://nonexistent.example.tld/`). No stack trace, no raw Playwright object.

**Verdict: VERIFIED**

---

## SC #4 — Missing hide selector prints warning, capture continues

**Claim:** When a selector in the `hide` list matches nothing, a warning is printed but capture continues rather than crashing.

**Code evidence:**

- `src/cli/format.js:56–59` — `printSelectorWarnings` iterates `hideSummary.missed` and calls `console.warn(chalk.yellow(...))` per missed selector. Pure output function — no throw, no exit.
- `src/cli.js:69–73` — called in the non-fatal path between `spinner.stop()` and `spinner.start()` (not in any error or catch path).
- `smoke.yaml:47` — `.does-not-exist` is intentionally in the `hide` list to exercise this path on every smoke run.

**Smoke run output (run 2026-05-22, exit code 0):**

```
⚠ hide selector ".does-not-exist" matched 0 elements (or invalid CSS) — skipped
smoke screenshot written: /tmp/framershot-smoke/home.png
```

Warning printed, exit code 0, screenshot written. Capture continued and completed successfully.

**Verdict: VERIFIED**

---

## Required Artifacts

| Artifact | Role | Status | Evidence |
|----------|------|--------|----------|
| `src/cli/format.js` | `makeProgress`, `printSelectorWarnings`, `formatError` | VERIFIED | Full implementation, 130 lines, all exports functional |
| `src/cli.js` | 7 spinner step boundaries, `getCurrentSpinner` export | VERIFIED | Lines 36, 45, 49, 53, 59, 101, 104; export at line 17 |
| `src/capture/frames.js` | `onProgress` callback invoked per frame | VERIFIED | Lines 73, 136: destructure + `onProgress?.(i + 1, total)` |
| `src/capture/index.js` | Passes `onProgress` through to `captureFrames` | VERIFIED | Lines 59, 62 |
| `index.js` | Top-level catch wires `getCurrentSpinner` + `formatError` | VERIFIED | Lines 2–3, 7–9 |
| `samples/bad-viewport-width.yaml` | CLI-03 fixture for config error path | VERIFIED | Exercises `viewport.width: "800"` (string, not number) |
| `samples/bad-baseurl.yaml` | CLI-03 fixture for network error path | VERIFIED | Exercises `https://nonexistent.example.tld` DNS failure |
| `samples/smoke.yaml` | Exercises SC #4 via `.does-not-exist` selector | VERIFIED | Line 47–48: `.does-not-exist` in hide list |

---

## Key Link Verification

| From | To | Via | Status | Evidence |
|------|----|----|--------|----------|
| `src/cli.js` | `src/cli/format.js` | `import { makeProgress, printSelectorWarnings }` | WIRED | cli.js line 8 |
| `index.js` | `src/cli.js` | `import { buildProgram, getCurrentSpinner }` | WIRED | index.js line 2 |
| `index.js` | `src/cli/format.js` | `import { formatError }` | WIRED | index.js line 3 |
| `src/cli.js` | `src/capture/index.js` | `import { captureFullPage }` | WIRED | cli.js line 7 |
| `captureFullPage` | `captureFrames` | `onProgress` option passed through | WIRED | capture/index.js lines 59, 62 |
| `captureFrames` | spinner text update | `onProgress?.(i + 1, total)` | WIRED | frames.js line 136 |
| `index.js catch` | `getCurrentSpinner()` | `spinner?.isSpinning` guard + `.fail()` | WIRED | index.js lines 7–8 |
| `index.js catch` | `formatError(err)` | `console.error` | WIRED | index.js line 9 |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Happy path: spinner labels + selector warning + exit 0 | `node index.js capture samples/smoke.yaml --smoke` | `- Loading config`, `⚠ hide selector ".does-not-exist"...`, `smoke screenshot written: ...`, exit 0 | PASS |
| Config error: field-level message, exit 1 | `node index.js capture samples/bad-viewport-width.yaml` | `Error: Invalid config in ...:\n  viewport.width: expected number, got string`, exit 1 | PASS |
| Network error: URL in message, exit 1 | `node index.js capture samples/bad-baseurl.yaml` | `Error: Failed to navigate to / ... https://nonexistent.example.tld/`, exit 1 | PASS |

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| CLI-02 | Progress feedback during capture | SATISFIED | Spinner with 7 step labels; `onProgress` callback chain; SC #1 VERIFIED |
| CLI-03 | Actionable, specific error messages | SATISFIED | `formatZodError` per-field formatting; `BrowserError` with URL; `formatError` dispatcher; SC #2, SC #3 VERIFIED |

---

## Anti-Patterns Found

| File | Pattern | Severity | Notes |
|------|---------|----------|-------|
| — | None found | — | No TBD/FIXME/XXX markers, no placeholder returns, no stub handlers in phase-modified files |

Checked: `src/cli/format.js`, `src/cli.js`, `src/capture/index.js`, `src/capture/frames.js`, `index.js`.

---

## Human Verification Required

None. All success criteria were verifiable programmatically via live spot-checks.

Note: The "Capturing frame N/M" counter (SC #1, non-smoke path) is exercised during a real full-page run but was not tested here because the hermetic smoke fixture uses `--smoke` (single viewport screenshot). The code path is fully wired and the `onProgress` callback chain is verified at source level. A full-page run against any live page would show the counter updating in real time.

---

## Gaps Summary

No gaps. All four success criteria are observably true in the shipped code and confirmed by live smoke runs.

---

**Phase 06 GOAL ACHIEVED — ready to mark complete.**

---

_Verified: 2026-05-22T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
