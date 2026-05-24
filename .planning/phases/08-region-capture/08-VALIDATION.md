---
phase: 8
slug: region-capture
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-22
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `08-RESEARCH.md` §Validation Architecture (lines 908–939).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — hermetic smoke fixture (per PROJECT.md "Out of Scope: Unit test suite") |
| **Config file** | None |
| **Quick run command** | `node samples/serve-smoke.js & sleep 1; node index.js capture samples/smoke-regions.yaml; kill %1` |
| **Full suite command** | `node samples/serve-smoke.js & sleep 1; node index.js capture samples/smoke.yaml --smoke; node index.js capture samples/smoke-multi.yaml; node index.js capture samples/smoke-regions.yaml; kill %1` |
| **Estimated runtime** | ~10–20 seconds per smoke fixture |

---

## Sampling Rate

- **After every task commit:** No automated test runs — module is "silent library" per project posture; smoke fixtures execute at wave boundaries
- **After every plan wave:** Run `samples/smoke.yaml --smoke` to confirm v0.1 back-compat is unbroken
- **Before `/gsd:verify-work`:** All three smoke fixtures (`smoke`, `smoke-multi`, `smoke-regions`) must run end-to-end and produce expected PNGs; all `samples/bad-*.yaml` fixtures still error with their expected messages
- **Max feedback latency:** ~20s per smoke fixture

---

## Per-Task Verification Map

> Filled out during planning — each task's `<automated>` block points back to a row here.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | REGION-01,02,03 | — | `regionSchema` + root `regions` field + duplicate-name + `{region}`-in-output cross-field refinements validate | schema unit assertion | `node -e "import('./src/config/schema.js').then(async ({ configSchema, formatZodError }) => { /* see 08-01-PLAN.md verify block */ })"` (full script in 08-01-PLAN.md Task 1) | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 2 | REGION-01,02 | — | `captureRegion` + `RegionError` + `padRect`/`unionRect`/`clampToDocument` helpers exist and `RegionError instanceof Error` | module surface assertion | `node -e "import('./src/capture/region.js').then(m => { if (typeof m.captureRegion !== 'function') process.exit(1); if (!(new m.RegionError('x') instanceof Error)) process.exit(1); })"` | ❌ W0 | ⬜ pending |
| 08-02-02 | 02 | 2 | REGION-01,02 | — | `{region}` placeholder substitutes when region passed, stays literal otherwise | template unit assertion | `node -e "import('./src/output/template.js').then(({ resolveTemplate }) => { /* assert {region} substitution + literal fallback */ })"` | ❌ W0 | ⬜ pending |
| 08-03-01 | 03 | 3 | REGION-01,02,03 | — | `runCapture` runs nested viewport × region loop; `--only` unknown throws `RegionError`; regions + no `--only` captures BOTH regions and full-page | runCapture integration assertion | `node samples/serve-smoke.js & sleep 1; node -e "import('./src/capture/runCapture.js').then(...)"; kill %1` (full script in 08-03-PLAN.md Task 1) | ❌ W0 | ⬜ pending |
| 08-04-01 | 04 | 4 | REGION-01,02,03 | — | Fixture HTML serves `[data-test="region-hero"]`, `[data-test="region-from"]`, `[data-test="region-to"]`; `samples/smoke-regions.yaml` validates | smoke fixture scaffold | `node samples/serve-smoke.js & sleep 1; curl -s http://127.0.0.1:7357/ \| grep -q 'data-test="region-hero"'; kill %1` | ❌ W0 | ⬜ pending |
| 08-04-02 | 04 | 4 | REGION-03 | — | `--only=<name>` filters regions; `--smoke` + `--only` mutex; `formatError` Guard 4 handles `RegionError` | CLI E2E assertion | `node samples/serve-smoke.js & sleep 1; node index.js capture samples/smoke-regions.yaml --only=hero; node index.js capture samples/smoke-regions.yaml --smoke --only=hero` (mutex must error); kill %1` | ❌ W0 | ⬜ pending |
| 08-04-03 | 04 | 4 | REGION-01,02,03 (back-compat) | — | v0.1 stitch behavior unchanged for configs without `regions:` and without `--only` | checkpoint:human-verify | Re-run `framershot capture samples/smoke.yaml --smoke`; re-run `samples/sample.yaml`; eyeball PNGs against pre-Phase-8 versions | ✅ Existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> Plan/task IDs are placeholders until the planner finalizes them; rows align by plan number.

---

## Wave 0 Requirements

- [ ] `samples/serve-smoke.js` — extend hermetic HTML with `[data-test="region-hero"]`, `[data-test="region-from"]`, `[data-test="region-to"]` sized/positioned to exercise both region modes (selector + anchor)
- [ ] `samples/smoke-regions.yaml` — new fixture covering: one selector region (`hero`), one anchor region (`features` from→to), padding on at least one, `{region}` placeholder in output template
- [ ] Document the `--only` assertion in a top-of-file YAML comment

*Pulled from RESEARCH.md §Wave 0 Gaps (lines 935–938).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-Framer-site region capture (selector + anchor) | REGION-01, REGION-02 | Hermetic smoke can't catch Framer-specific layout/animation interactions (sticky containers, transformed parents — see RESEARCH §R2) | Run `node index.js capture <user-config-pointing-at-pubq.se>` with a `regions:` block targeting a real Framer section; visually inspect produced PNG for: (a) animation not mid-play, (b) correct crop including padding, (c) no Framer overlay artifacts |
| `--only` over real site | REGION-03 | Confirms commander wiring works end-to-end through the real CLI entry point | Re-run above with `--only=<region-name>`, confirm only that PNG is produced |
| Back-compat regression on existing configs | All | Byte-equality is brittle; visual identity is the real bar | Re-run `framershot capture samples/sample.yaml` and `framershot capture samples/deltaventure.yaml`; eyeball outputs against pre-Phase-8 versions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: smoke fixtures run at every wave boundary
- [ ] Wave 0 covers all MISSING references (`smoke-regions.yaml`, `serve-smoke.js` HTML extension)
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s per fixture
- [ ] `nyquist_compliant: true` set in frontmatter once planner aligns task IDs

**Approval:** pending
