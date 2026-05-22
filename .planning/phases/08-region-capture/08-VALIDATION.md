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
| 08-00-01 | 00 | 0 | REGION-01,02,03 | — | Fixture present + serves hero/from/to elements | smoke fixture scaffold | `node samples/serve-smoke.js & sleep 1; curl -s localhost:4173 \| grep 'data-test="region-hero"'; kill %1` | ❌ W0 | ⬜ pending |
| 08-00-02 | 00 | 0 | REGION-01,02 | — | smoke-regions.yaml validates against schema | smoke fixture scaffold | `node index.js capture samples/smoke-regions.yaml --dry-run` (or schema-only validate) | ❌ W0 | ⬜ pending |
| 08-01-XX | 01 | 1 | REGION-01 | — | Selector region produces PNG of element box + padding, with prepare pipeline applied | smoke fixture | `node samples/serve-smoke.js & sleep 1; node index.js capture samples/smoke-regions.yaml; test -f /tmp/framershot-smoke/desktop/hero-home.png; kill %1` | ❌ W0 | ⬜ pending |
| 08-02-XX | 02 | 1 | REGION-02 | — | Anchor region produces PNG of bounding-box union | smoke fixture | Same fixture; `test -f /tmp/framershot-smoke/desktop/features-home.png` | ❌ W0 | ⬜ pending |
| 08-03-XX | 03 | 2 | REGION-03 | — | `--only=<name>` captures only that region; without flag, regions + full-page both run | smoke fixture | `node index.js capture samples/smoke-regions.yaml --only=hero; ls /tmp/framershot-smoke/desktop/ \| wc -l` (expect 1) | ❌ W0 | ⬜ pending |
| 08-04-XX | 04 | 2 | REGION-01,02,03 (back-compat) | — | v0.1 stitch behavior unchanged for configs without `regions:` and without `--only` | smoke fixture | `node index.js capture samples/smoke.yaml --smoke; diff /tmp/framershot-smoke/<prev>.png /tmp/framershot-smoke/<curr>.png \|\| true` | ✅ Existing | ⬜ pending |

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
