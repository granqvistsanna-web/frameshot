---
phase: 6
slug: terminal-ux
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-22
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Mirrors the Phase 1–5 posture: no automated framework, manual hermetic smoke runs against `samples/serve-smoke.js` are the validation method.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — `package.json` has no `devDependencies` and no `scripts.test`. Hermetic smoke runs against `samples/serve-smoke.js` are the established pattern (Phases 1–5). |
| **Config file** | none |
| **Quick run command** | `node samples/serve-smoke.js & sleep 1 && node index.js capture samples/smoke.yaml --smoke; kill %1` |
| **Full suite command** | All four smoke variants (happy + bad-config + bad-baseurl + missing-selector) — see Per-Task Verification Map |
| **Estimated runtime** | ~5–8 seconds per smoke variant; ~30 seconds for full suite |

---

## Sampling Rate

- **After every task commit:** Run the happy-path smoke (`node index.js capture samples/smoke.yaml --smoke`); verify nothing regressed from Phases 1–5.
- **After every plan wave:** Run all four smoke variants for the plan's requirement family.
- **Before `/gsd:verify-phase`:** All four smoke variants pass with the expected stderr content listed below.
- **Max feedback latency:** ~10 seconds (single smoke run).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-* | 01 | 1 | CLI-02 | — | Progress visible during non-smoke run; spinner auto-disables in non-TTY | smoke (TTY observational + non-TTY assertion) | `node index.js capture samples/sample.yaml` (TTY: observe spinner) / `node index.js capture samples/smoke.yaml --smoke 2>&1 \| grep -E '⠋\|⠙\|⠚' \| wc -l` must be `0` | ⬜ smoke fixture exists; ✅ assertion command added during execute | ⬜ pending |
| 06-01-* | 01 | 1 | CLI-02 | — | Per-frame "Capturing frame N/M" updates emitted | smoke (observational) | `node index.js capture samples/sample.yaml` and observe the frame counter incrementing | n/a — observational | ⬜ pending |
| 06-02-* | 02 | 2 | CLI-03 | T-06-V7 | ConfigError prints `<field>: expected <type>, got <type>` (not raw zod dump) | smoke | `node index.js capture samples/bad-viewport-width.yaml 2>&1 \| grep -F 'viewport.width: expected number'` must exit `0` | ❌ W0 fixture | ⬜ pending |
| 06-02-* | 02 | 2 | CLI-03 | T-06-V7 | BrowserError includes the failing URL in plain English | smoke | `node index.js capture samples/bad-baseurl.yaml 2>&1 \| grep -F 'nonexistent.example.tld'` must exit `0` | ❌ W0 fixture | ⬜ pending |
| 06-02-* | 02 | 2 | CLI-03 | — | Missing hide selector prints a warning AND capture continues to completion | smoke (assertion on both stderr warning and stdout success) | `node index.js capture samples/smoke.yaml --smoke 2>&1` must contain `'⚠'` AND `'smoke screenshot written'` | ⬜ requires updating `samples/smoke.yaml` to include a missing selector | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `samples/bad-viewport-width.yaml` — fixture for ConfigError dispatch (CLI-03). Body: copy `samples/smoke.yaml` and change `viewport.width: 1440` → `viewport.width: "1440"`.
- [ ] `samples/bad-baseurl.yaml` — fixture for BrowserError dispatch (CLI-03). Body: copy `samples/smoke.yaml` and change `baseUrl: http://localhost:8080` → `baseUrl: https://nonexistent.example.tld`.
- [ ] Update `samples/smoke.yaml` — add at least one selector that will not match (e.g. `prepare.hide: [..., '.does-not-exist']`) to drive the CLI-03 selector-warning path on every smoke run.
- [ ] No framework install needed — manual smoke verification matches Phases 1–5 posture.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Spinner frames visible in interactive TTY (current step text updates) | CLI-02 | Spinner output is rewritten in-place via ANSI cursor codes; only observable by a human watching a real terminal. CI/grep can only detect frame presence, not the rendering quality. | Run `node samples/serve-smoke.js & sleep 1 && node index.js capture samples/smoke.yaml` (NO `--smoke` flag) in a real terminal. Verify the spinner advances through steps: "Launching browser" → "Navigating" → "Running prepare pipeline" → "Capturing frame N/M" → "Writing PNG" and ends with a ✓ success line. |
| Error message readability (color, hierarchy, dim stack trace) | CLI-03 | Color rendering and visual hierarchy require a human reading the output. | Run each of the three bad-fixture smoke variants in a real terminal; visually confirm the error header is red, the field/URL is highlighted, and any stack trace is dimmed and below the actionable message. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify (smoke command) or are flagged manual-only with rationale
- [ ] Sampling continuity: no 3 consecutive tasks without automated smoke verify
- [ ] Wave 0 fixtures (`bad-viewport-width.yaml`, `bad-baseurl.yaml`, updated `smoke.yaml`) authored and committed before Wave 2 tasks
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s per smoke run
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 fixtures land and per-task smoke commands are pinned in PLAN.md

**Approval:** pending
