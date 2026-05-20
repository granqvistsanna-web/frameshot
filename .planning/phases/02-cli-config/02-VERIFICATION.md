---
phase: 02-cli-config
verified: 2026-05-20T08:30:00Z
status: passed
score: 12/12 must-haves verified
overrides_applied: 0
---

# Phase 02: CLI + Config Verification Report

**Phase Goal:** User can point `framershot capture <config.yaml>` at a real config file and have it parsed, validated, and ready for capture
**Verified:** 2026-05-20T08:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria + PLAN must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC #1 — `framershot capture samples/sample.yaml` parses and prints resolved config to stdout | VERIFIED | `node index.js capture samples/sample.yaml` exits 0 and emits valid JSON with all fields (name=`pubq-marketing`, baseUrl=`https://pubq.se`, output template, deviceScaleFactor=2, full viewport/page/prepare blocks) and synthesized `_resolvedOutput` field |
| 2 | SC #2 — bad configs print a specific error naming the bad field (no raw zod dump) | VERIFIED | All four bad fixtures produce one-line-per-issue field-named errors. Verbatim outputs: `baseUrl: expected string, got undefined`, `viewport.width: expected number, got string`, `deviceScaleFactor: Number must be less than or equal to 3 (maximum: 3)`, `baseUrl: Invalid url`. No `ZodError`, no internal codes (`invalid_type`, `invalid_string`, `too_big`, `too_small`, `invalid_format`) appear in any output. Exit 1 in all four cases. |
| 3 | SC #3 — output template with `{date}`, `{viewport}`, `{page}` resolves with current date and config values substituted | VERIFIED | The happy-path SC #1 JSON shows `_resolvedOutput: "./screenshots/2026-05-20/desktop/home.png"` — today's UTC date, viewport name from config, page name from config. Direct test of `resolveTemplate` returns `./shots/2026-05-20/desktop/home.png` for basic and `./mobile-tall/about-us.png` for slugged input. |
| 4 | SC #4 — `framershot` with no arguments prints usage help | VERIFIED | Bare invocation (`node index.js`) prints `Usage: framershot [options] [command]` followed by description, options (`-v, --version`, `-h, --help`), and Commands (`capture <config>`, `help [command]`). |
| 5 | Capture action handler validates via loadConfig and resolves output via resolveTemplate (single shell invocation) | VERIFIED | `src/cli.js:13-23` shows `.action(async (configArg) => { const config = await loadConfig(configArg); ... const resolvedOutput = resolveTemplate(config.output, { date, viewport, page }); console.log(...); });` — integration confirmed end-to-end by happy-path invocation. |
| 6 | CLI exits non-zero on unhandled error with `err.message` only (no stack trace) | VERIFIED | `index.js:5-8` wraps `parseAsync` in `.catch((err) => { console.error(err.message); process.exit(1); });`. All four bad-fixture invocations produced single-line messages with no stack noise. ENOENT path produces `Config file not found: /tmp/__definitely_nonexistent_*.yaml`. |
| 7 | Config path is resolved against `process.cwd()` (CLI-01 from-any-directory) | VERIFIED | Ran from `/tmp`: `cd /tmp && node /Users/.../index.js capture /Users/.../samples/sample.yaml` returns identical JSON, exit 0. `src/config/load.js:39` confirms `resolve(process.cwd(), configPath)`. |
| 8 | Project structure has src/ with cli.js, config/{schema,load}.js, output/template.js | VERIFIED | All five files exist at expected paths with substantive content (cli.js 26 lines, schema.js 75 lines, load.js 79 lines, template.js 25 lines, index.js 9 lines). |
| 9 | samples/sample.yaml exists and matches v0.1 reference fixture (baseUrl, viewport, page, prepare) | VERIFIED | File has 19 lines, includes `baseUrl: https://pubq.se`, `output: ./screenshots/{date}/{viewport}/{page}.png`, viewport block, page block, prepare block. |
| 10 | loadConfig is pure async function — no CLI deps, no console output, no process.exit | VERIFIED | `src/config/load.js` imports only `fs/promises`, `node:path`, `js-yaml`, and `./schema.js`. No `console.log`, no `process.exit`. Throws `ConfigError` only. |
| 11 | formatZodError returns one user-facing line per issue, field-named, no zod internals | VERIFIED | `src/config/schema.js:60-75` — returns `string[]`. Branches: `invalid_type` → `field: expected X, got Y`; `too_small` → `field: msg (minimum: N)`; `too_big` → `field: msg (maximum: N)`; catch-all → `field: msg`. No `issue.code` ever emitted. |
| 12 | resolveTemplate is pure (no I/O, no internal `new Date()`, deterministic) | VERIFIED | `src/output/template.js` has zero imports (`grep -c '^import'` = 0). 25 lines total. Three `.replaceAll` calls + slugify helper. No `new Date()`. Determinism verified by spot-checks (same inputs → same output). |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `index.js` | Thin ESM bin entry, shebang, imports buildProgram, parseAsync, top-level catch | VERIFIED | 9 lines, `#!/usr/bin/env node` shebang preserved, executable bit set, `.catch(err => { console.error(err.message); process.exit(1); })`. Phase 1 wholesale dep imports removed. |
| `src/cli.js` | Commander program builder + capture action integrating loadConfig + resolveTemplate | VERIFIED | Exports `buildProgram()`. Imports `Command` from commander, `loadConfig` from `./config/load.js`, `resolveTemplate` from `./output/template.js`. Action prints `JSON.stringify({ ...config, _resolvedOutput }, null, 2)`. |
| `src/config/schema.js` | zod schema + formatZodError | VERIFIED | Exports `configSchema` (z.object with name, baseUrl, output, deviceScaleFactor, viewport, page, prepare) and `formatZodError` (function). Uses `z.string().url()` per zod 3. |
| `src/config/load.js` | loadConfig async + ConfigError class | VERIFIED | Exports `loadConfig` (async fn) and `ConfigError` (Error subclass). Four-step pipeline: resolve → readFile + BOM strip → yaml.load with YAMLException wrap → safeParse + formatZodError. |
| `src/output/template.js` | Pure resolveTemplate with slugify | VERIFIED | Exports `resolveTemplate`. Zero imports. Three `.replaceAll` calls + slugify helper preserving `.`, `-`, `_`. |
| `samples/sample.yaml` | v0.1 reference fixture | VERIFIED | Matches RESEARCH.md §Code Examples — baseUrl https://pubq.se, name pubq-marketing, output template with three placeholders, viewport/page/prepare blocks. |
| `samples/bad-missing-baseurl.yaml` | CFG-02 fixture archetype 1 | VERIFIED | baseUrl line absent; `loadConfig` throws ConfigError with `baseUrl: expected string, got undefined`. |
| `samples/bad-wrong-type.yaml` | CFG-02 fixture archetype 2 | VERIFIED | viewport.width quoted as string; throws ConfigError with `viewport.width: expected number, got string`. |
| `samples/bad-out-of-range.yaml` | CFG-02 fixture archetype 3 | VERIFIED | deviceScaleFactor=5; throws ConfigError with `deviceScaleFactor: Number must be less than or equal to 3 (maximum: 3)`. |
| `samples/bad-url.yaml` | CFG-02 fixture archetype 4 | VERIFIED | baseUrl=not-a-url; throws ConfigError with `baseUrl: Invalid url` via formatZodError catch-all branch. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `index.js` | `src/cli.js` | `import { buildProgram } from './src/cli.js'` + `parseAsync(process.argv)` | WIRED | Line 2 import, line 5 invocation. |
| `src/cli.js` | `src/config/load.js` | `import { loadConfig } from './config/load.js'` | WIRED | Line 2 import, line 17 invocation in action handler. |
| `src/cli.js` | `src/output/template.js` | `import { resolveTemplate } from './output/template.js'` | WIRED | Line 3 import, line 21 invocation in action handler. |
| `src/config/load.js` | `src/config/schema.js` | `import { configSchema, formatZodError } from './schema.js'` | WIRED | Line 10 import. `configSchema.safeParse` at line 73, `formatZodError(result.error)` at line 75. |
| `src/config/load.js` | `js-yaml` | `yaml.load(raw)` | WIRED | Line 9 default import, line 59 call. |
| `src/config/load.js` | `zod` (via schema) | `configSchema.safeParse(parsed)` | WIRED | Line 73. Result type-narrowed via `result.success`. |
| `src/cli.js` | `process.argv` | `program.parseAsync` (called in index.js) | WIRED | `index.js:5` `program.parseAsync(process.argv)`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/cli.js` (action handler) | `config` | `await loadConfig(configArg)` — reads YAML file → parses → validates via zod safeParse, returns `result.data` | YES — verified end-to-end: stdout JSON contains all eight config fields from sample.yaml | FLOWING |
| `src/cli.js` (action handler) | `resolvedOutput` | `resolveTemplate(config.output, { date, viewport, page })` — three `.replaceAll` substitutions on config-derived strings | YES — happy-path stdout shows `_resolvedOutput: "./screenshots/2026-05-20/desktop/home.png"` | FLOWING |
| `src/config/load.js` (return) | `result.data` | `configSchema.safeParse(parsed)` where `parsed = yaml.load(raw)` and `raw = await readFile(absPath, 'utf8')` | YES — real file I/O → real YAML parse → real schema validation; all error paths throw ConfigError, success path returns typed object | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SC #1 — happy-path JSON | `node index.js capture samples/sample.yaml` | exit 0, valid JSON containing baseUrl, output, _resolvedOutput | PASS |
| SC #2 — missing field | `node index.js capture samples/bad-missing-baseurl.yaml` | exit 1, `baseUrl: expected string, got undefined`, no ZodError | PASS |
| SC #2 — wrong type | `node index.js capture samples/bad-wrong-type.yaml` | exit 1, `viewport.width: expected number, got string`, no ZodError | PASS |
| SC #2 — out of range | `node index.js capture samples/bad-out-of-range.yaml` | exit 1, `deviceScaleFactor: Number must be less than or equal to 3 (maximum: 3)` | PASS |
| SC #2 — invalid URL | `node index.js capture samples/bad-url.yaml` | exit 1, `baseUrl: Invalid url` (catch-all branch) | PASS |
| SC #3 — date/viewport/page substitution | `_resolvedOutput` in happy-path JSON | `./screenshots/2026-05-20/desktop/home.png` | PASS |
| SC #4 — bare invocation | `node index.js` | Prints commander usage help listing `capture <config>` subcommand | PASS |
| CLI-01 — from any directory | `cd /tmp && node /Users/.../index.js capture /Users/.../samples/sample.yaml` | exit 0, JSON with name=pubq-marketing | PASS |
| ENOENT cleanup | `node index.js capture /tmp/__nonexistent.yaml` | `Config file not found: <absPath>`, exit 1 (no ENOENT trace) | PASS |
| --help flag | `node index.js --help` | exit 0, prints same usage help as bare invocation | PASS |
| resolveTemplate slug | `resolveTemplate('./{viewport}/{page}.png', { date: 'x', viewport: 'Mobile (Tall)', page: 'About Us' })` | `./mobile-tall/about-us.png` | PASS |
| resolveTemplate unknown literal | `resolveTemplate('./{foo}/{viewport}.png', { ..., viewport: 'd', ... })` | `./{foo}/d.png` ({foo} preserved literal) | PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| (none defined) | — | — | SKIPPED (no probes declared; phase verified via direct CLI invocations as instructed by user) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CLI-01 | 02-01-PLAN | User can run `framershot capture <config.yaml>` from any directory | SATISFIED | From-any-directory test passed (run from `/tmp` with absolute paths). `loadConfig` uses `resolve(process.cwd(), configPath)`. |
| CFG-01 | 02-01-PLAN, 02-02-PLAN | User can author a YAML config with name, baseUrl, output, deviceScaleFactor, single viewport, single page, prepare | SATISFIED | `configSchema` in `src/config/schema.js` declares all eight fields with appropriate types and defaults. Happy-path JSON shows all fields parse correctly. |
| CFG-02 | 02-01-PLAN, 02-02-PLAN | Invalid configs rejected with field-named error messages (zod-based validation) | SATISFIED | Four bad fixtures verified: missing/wrong-type/out-of-range/invalid-URL — each emits a field-named one-line message via `formatZodError` with no zod internals leaked. |
| CFG-03 | 02-01-PLAN, 02-03-PLAN | Output path template supports `{date}`, `{viewport}`, `{page}` placeholders | SATISFIED | `resolveTemplate` substitutes all three; happy-path `_resolvedOutput` shows `2026-05-20/desktop/home.png` from `{date}/{viewport}/{page}.png`. |

No orphaned requirements: REQUIREMENTS.md maps exactly CLI-01, CFG-01, CFG-02, CFG-03 to Phase 2; all four are accounted for in plan frontmatter and verified above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/config/schema.js` | 41 | comment "placeholder enforcement belongs to the template resolver" | Info — false positive | Comment refers to template `{date}/{viewport}/{page}` placeholders, not a stub marker. No actionable issue. |
| `src/output/template.js` | 6 | comment "Unknown placeholders (e.g. {foo}) are left literal" | Info — false positive | Same — refers to template placeholders. Documents intentional behavior. |

No TBD/FIXME/XXX/TODO/HACK debt markers in any phase-modified file. No stub returns, no hardcoded empty fallbacks, no console.log-only handlers. The "placeholder" matches are documentation about deliberate behavior, not unfinished work.

### Human Verification Required

None. All four ROADMAP success criteria are observable via deterministic CLI invocations; verification was completed end-to-end by running the binary against the sample and bad fixtures.

### Gaps Summary

No gaps. Every Phase 2 success criterion was reproduced from the shell:
- SC #1 (happy-path JSON) — verified
- SC #2 (field-named errors for missing field, wrong type, out-of-range, invalid URL) — verified across all four fixture archetypes, no zod internals leaked
- SC #3 (template resolution) — verified in both integrated (`_resolvedOutput`) and unit-level (`resolveTemplate` direct call) forms
- SC #4 (bare invocation help) — verified

All four requirement IDs (CLI-01, CFG-01, CFG-02, CFG-03) are accounted for in the plan frontmatter and confirmed in the codebase. Wiring is clean (every import is consumed; every key link verified). Modules respect their boundaries (loaders throw, the CLI catches; the template resolver is pure). Commander version is v12.1.0 (the project pins `^12`); all v14 patterns in RESEARCH.md remained compatible.

---

*Verified: 2026-05-20T08:30:00Z*
*Verifier: Claude (gsd-verifier)*
