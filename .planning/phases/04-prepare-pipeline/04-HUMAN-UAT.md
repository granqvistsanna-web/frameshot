---
status: partial
phase: 04-prepare-pipeline
source: [04-VERIFICATION.md]
started: 2026-05-22T09:41:08Z
updated: 2026-05-22T09:41:08Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Screenshot content inspection (SC#1, SC#2, SC#3)

expected: |
  Run the hermetic smoke and inspect /tmp/framershot-smoke/home.png:

      node samples/serve-smoke.js &
      node index.js capture samples/smoke.yaml --smoke
      kill %1

  Expected output:
  - stdout shows `prepare: X.XXXs` where X >= 1.000 (PREP-05 floor)
  - stdout shows `smoke screenshot written: /tmp/framershot-smoke/home.png`
  - PNG dimensions: 1600×1200 (deviceScaleFactor=2 × 800×600 viewport)

  Visual checks on the PNG:
  - SC#1: The `.anim-target` yellow box appears static (not mid-spin)
  - SC#2: The grey `.hidden-by-test` element is NOT visible
  - SC#3: The lazy PREP-04 SVG renders as a green box with text (not a broken-image placeholder)
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
