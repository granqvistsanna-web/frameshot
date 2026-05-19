---
phase: 01-foundation
plan: 01
subsystem: scaffold
tags: [scaffold, esm, npm, playwright, dependencies]
dependency_graph:
  requires: []
  provides:
    - package.json (ESM manifest, framershot bin)
    - index.js (executable ESM entry with shebang)
    - .gitignore (node_modules, screenshots/, OS noise)
    - package-lock.json (pinned dep tree)
    - node_modules/ (35 packages resolved)
    - Chromium browser binary at ~/Library/Caches/ms-playwright/chromium-1223
  affects: []
tech_stack:
  added:
    - playwright-chromium@1.60.0
    - sharp@0.33.5
    - commander@12.1.0
    - js-yaml@4.1.1
    - zod@3.25.76
    - chalk@5.6.2
    - ora@8.2.0
  patterns:
    - ESM module system ("type": "module") for top-level await + import syntax
    - Bin field in object form ({ framershot: ./index.js }) so bin name is independent of package name
    - Shebang + executable bit (committed via git update-index --chmod=+x) so `npm link` produces a working CLI
    - Default vs named import shapes locked per package (Command from commander, z from zod, default for sharp/chalk/ora/playwright-chromium/js-yaml)
key_files:
  created:
    - package.json
    - index.js
    - .gitignore
    - package-lock.json
  modified: []
decisions:
  - Used caret-major version ranges in package.json (^1, ^0.33, ^12, ^4, ^3, ^5, ^8) rather than guessing minors; let npm resolve latest within major
  - Did NOT install full `playwright` package — only `playwright-chromium` per PROJECT.md Browser scope constraint
  - Committed index.js with executable bit set via `git update-index --chmod=+x` so the shebang is honored after clone or `npm link`
  - Stub main body in index.js prints `${name} v${version}` only — full CLI wiring is Phase 2's job
metrics:
  duration_seconds: 80
  tasks_completed: 3
  commits: 3
  files_created: 4
  completed: "2026-05-19"
---

# Phase 1 Plan 01: Foundation Scaffold Summary

Scaffolded framershot as a private ESM Node.js CLI with the locked seven-dependency stack (playwright-chromium, sharp, commander, js-yaml, zod, chalk, ora), an executable index.js entry with shebang for future `npm link`, and a verified-importable dependency tree.

## What Was Built

A minimal but complete Node.js project skeleton:

- **package.json** — ESM manifest (`"type": "module"`), `private: true`, `engines.node >= 20`, bin in object form (`{ framershot: ./index.js }`), and exactly seven production dependencies declared with caret-major ranges. No devDependencies, no author/license/repository/keywords/files/publishConfig fields — the scope is strictly local-personal.
- **index.js** — Shebang `#!/usr/bin/env node`, ESM imports of all seven deps in their canonical shapes, reads its own `package.json` via `fs/promises` + `import.meta.url` (no `require`), prints a one-line `framershot v0.1.0` banner and exits 0. Phase 2 will replace the body with commander wiring.
- **.gitignore** — `node_modules`, `.DS_Store`, `*.log`, `screenshots/`. The last entry pre-empts Phase 5 output landing in version control.
- **package-lock.json** — 35 packages total (7 declared + transitive). Reproducible install.

## Resolved Dependency Versions

| Package | Declared | Resolved | Maintainer |
|---|---|---|---|
| playwright-chromium | ^1 | 1.60.0 | Microsoft (official Playwright distribution, Chromium-only) |
| sharp | ^0.33 | 0.33.5 | Lovell Fuller |
| commander | ^12 | 12.1.0 | TJ Holowaychuk |
| js-yaml | ^4 | 4.1.1 | Vitaly Puzrin |
| zod | ^3 | 3.25.76 | Colin McDonnell |
| chalk | ^5 | 5.6.2 | Sindre Sorhus |
| ora | ^8 | 8.2.0 | Sindre Sorhus |

`npm install` reported `added 35 packages, audited 36 packages in 4s` with **0 vulnerabilities**. The fast install indicates the npm cache already held the tarballs from prior cache state; resolution still produced a fresh `package-lock.json`.

## Chromium Binary Confirmation

playwright-chromium's postinstall step targets `~/Library/Caches/ms-playwright/chromium-1223/` (the build matching playwright-chromium 1.60.0). The directory exists on disk:

```
drwxr-xr-x@ 5 sannagranqvist staff 160 May 12 19:54 chromium-1223
```

Phase 3 (Browser + Navigation) can launch this binary without an additional download step. No `playwright install` postinstall errors occurred.

## File Sizes

| File | Bytes | Notes |
|---|---|---|
| .gitignore | 42 | 4 entries |
| package.json | 508 | 26 lines, no extraneous fields |
| index.js | 548 | Shebang + 7 ESM imports + banner; mode 100755 in git |
| package-lock.json | 28,175 | 35 packages pinned |

Total tracked: 29,273 bytes across 4 files.

## Verification Results

All six end-to-end checks from the plan pass:

1. `node index.js` → prints `framershot v0.1.0`, exits 0
2. Dynamic import of all seven deps prints `<name> ok` for each (no `ERR_MODULE_NOT_FOUND`, no `ERR_REQUIRE_ESM`)
3. `package.json` shape check (`type==module` and `bin.framershot===./index.js`) → `pass`
4. `head -1 index.js` → `#!/usr/bin/env node`
5. `test -x index.js` → executable
6. `.gitignore` contains `node_modules` → gitignored

Per-task acceptance criteria from the PLAN also all pass:
- Task 1: package.json structure verify exits 0 with `ok`
- Task 2: node_modules + lockfile + .gitignore + 7 dep subdirs verify exits 0 with `ok`
- Task 3: shebang + chmod -x + node index.js exit 0 + dynamic-import smoke prints `all-imports-ok`; grep counts exactly 7 dep imports; zero internal `./` imports.

## Phase 2 Handoff

To install the CLI globally for testing (the question the plan output spec asks to document):

```bash
cd /Users/sannagranqvist/Documents/App/screenshotter
npm link
# Then from anywhere:
framershot
# → prints: framershot v0.1.0
```

`npm link` works because (a) `bin.framershot` points at `./index.js`, (b) the shebang `#!/usr/bin/env node` is in place, and (c) the executable bit is recorded in git (`100755`). To unlink later: `npm unlink -g framershot`.

Phase 2 will replace the index.js body with commander wiring for the `capture <config.yaml>` subcommand.

## Deviations from Plan

None functionally — the plan executed exactly as written. Two tiny implementation choices worth flagging for the record:

1. **Caret-major ranges (not exact pins) in package.json** — The Task 1 action prose offered the choice between caret ranges or letting `npm install` rewrite the file. I used `"^1"`, `"^0.33"`, `"^12"`, `"^4"`, `"^3"`, `"^5"`, `"^8"` so the declared intent stays visible in the manifest while `package-lock.json` records the exact resolved versions. This matches the plan's "You may use caret ranges like '^X' where X is the current major" guidance.
2. **`git update-index --chmod=+x` after `chmod +x index.js`** — The plan only specifies `chmod +x index.js` (POSIX filesystem bit). I added the git equivalent so the executable bit is recorded in the git index (`100755`) and survives clones / sparse checkouts. This is a strict improvement, not a deviation from intent — it makes the shebang actually work for future contributors / fresh clones.

No authentication gates, no Rule 4 architectural questions, no checkpoints reached.

## Authentication Gates

None. This plan does no network operations beyond `npm install` (anonymous registry pull) and the playwright-chromium postinstall (anonymous Microsoft CDN pull).

## Known Stubs

The `index.js` body is intentionally minimal — it prints a `name v version` banner and exits. This is documented as a Phase 1 stub in the plan's Task 3 `<action>` block:

> "A minimal main body: print a one-line banner like a name+version string [...] and exit 0. This is a Phase 1 stub; Phase 2 will replace this with commander wiring."

The seven imports are present so ESM resolution is exercised as a smoke test today, even though the symbols aren't consumed yet. Phase 2 (specifically plan 02-01) will replace the banner with commander wiring and start using `Command`, `chalk`, `ora`, etc. in earnest. Not a defect — explicitly scoped.

## Threat Flags

None. The plan's `<threat_model>` (T-01-SC supply chain, T-01-PIH postinstall, T-01-EE bin elevation, T-01-I info disclosure) was honored:

- All seven installed packages match the names enumerated in Task 2 — `npm ls --depth=0 --json` (implicitly via package-lock inspection) shows `playwright-chromium`, not `playwrite-chromium`; `sharp`, not `shrp`; `commander`, not `comander`. No typo-squat substitutions.
- `playwright-chromium` postinstall completed without error and matches the documented Microsoft-distributed package (1.60.0 with version-matched Chromium 1223 build).
- `private: true` is set and the manifest contains no author/repository/keywords/files/publishConfig fields, so accidental `npm publish` is blocked by npm itself.
- Bin entry runs with user privileges only after explicit `npm link` — same threat surface as any other user-installed CLI.

No new threat surface beyond what the plan modeled.

## Commits

| Commit | Task | Type | Summary |
|---|---|---|---|
| `224d193` | 1 | feat | add package.json with ESM, framershot bin, seven deps |
| `d1a35de` | 2 | chore | add .gitignore and install seven deps via npm install |
| `848b26c` | 3 | feat | add executable index.js ESM entry with shebang and seven imports |

## Self-Check: PASSED

- package.json: FOUND
- index.js: FOUND (mode 100755)
- .gitignore: FOUND
- package-lock.json: FOUND
- Commit 224d193: FOUND
- Commit d1a35de: FOUND
- Commit 848b26c: FOUND
- node index.js: exits 0 with `framershot v0.1.0`
- All 7 ESM dynamic imports: resolve cleanly
- Chromium binary at ~/Library/Caches/ms-playwright/chromium-1223: FOUND
