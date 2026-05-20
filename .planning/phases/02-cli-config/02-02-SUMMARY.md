---
phase: 02-cli-config
plan: "02"
subsystem: config
tags: [zod, js-yaml, yaml, validation, error-formatting, config-loading]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: package.json with zod ^3, js-yaml ^4 installed; "type":"module" ESM project

provides:
  - src/config/schema.js — configSchema (zod 3 object) + formatZodError helper
  - src/config/load.js — loadConfig(path) async function + ConfigError class
  - samples/bad-missing-baseurl.yaml — CFG-02 fixture (missing required field)
  - samples/bad-wrong-type.yaml — CFG-02 fixture (wrong type for viewport.width)
  - samples/bad-out-of-range.yaml — CFG-02 fixture (deviceScaleFactor > max)
  - samples/bad-url.yaml — CFG-02 fixture (non-URL baseUrl string)

affects:
  - 02-01 — imports loadConfig and ConfigError from src/config/load.js
  - 02-03 — imports configSchema from src/config/schema.js for ResolvedConfig type
  - Phase 3+ — all phases that use the validated config shape

# Tech tracking
tech-stack:
  added: []  # No new packages — zod 3.25.76 and js-yaml 4.1.1 were installed in Phase 1
  patterns:
    - "ConfigError subclass pattern: pure modules throw ConfigError with clean .message; CLI catch handles formatting"
    - "safeParse + formatZodError: never let raw ZodError surface to user (CFG-02)"
    - "Four-step loader pipeline: resolve path → read+BOM-strip → YAML parse → schema validate"

key-files:
  created:
    - src/config/schema.js
    - src/config/load.js
    - samples/bad-missing-baseurl.yaml
    - samples/bad-wrong-type.yaml
    - samples/bad-out-of-range.yaml
    - samples/bad-url.yaml
  modified: []

key-decisions:
  - "Use z.string().url() (zod 3 form) not top-level z.url() — package.json declares 'zod':'^3' which resolved to 3.25.76; top-level z.url() is zod v4-only"
  - "configSchema uses z.object (not z.strictObject) — strip-unknown-keys behavior is correct for a personal tool where extra YAML keys should not crash"
  - "prepare block .default({}) so minimal configs omit it entirely"
  - "loadConfig is a pure async function: no console output, no process.exit — 02-01 owns the CLI presentation layer"
  - "formatZodError returns string[] (not joined string) so callers can choose their own indent/join"

patterns-established:
  - "Error boundary pattern: low-level modules throw typed ConfigError; CLI catches and presents"
  - "BOM stripping after readFile: charCodeAt(0) === 0xFEFF check on all YAML reads"

requirements-completed: [CFG-01, CFG-02]

# Metrics
duration: 15min
completed: "2026-05-20"
---

# Phase 2 Plan 02: Config Schema + Loader Summary

**Zod 3 config schema and file loader that validate YAML into a typed ResolvedConfig or throw a field-named ConfigError — CFG-02's "no raw zod dumps" contract implemented via formatZodError helper**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-20T04:53:00Z
- **Completed:** 2026-05-20T05:08:56Z
- **Tasks:** 3
- **Files created:** 6

## Accomplishments

- `src/config/schema.js` exports `configSchema` (full v0.1 shape with defaults) and `formatZodError` (one-line-per-issue, field-named, no zod internals)
- `src/config/load.js` exports `loadConfig` (four-step pipeline: path resolve → read+BOM → YAML parse → safeParse) and `ConfigError` (named Error subclass)
- Four CFG-02 fixtures in `samples/` cover every branch of `formatZodError`: missing required field, wrong type, out-of-range, invalid format (URL)

## Zod Version Discovery

**Actual installed version: zod 3.25.76** (package.json declares `"zod": "^3"`).

The RESEARCH.md noted zod v4 as current on npm (4.4.3) but also flagged the v3 declaration in package.json. Phase 1 installed whatever matched `^3` — confirmed as 3.25.76 via package-lock.json.

Key API difference affecting this plan:
- `z.url()` (top-level) — **does NOT exist in zod 3.x**. Only available in zod v4.
- `z.string().url()` — **works in both zod 3 and v4**. This is what schema.js uses.
- `import { z } from 'zod'` — works in both. Used here per standard convention.

The plan's task instructions already accounted for this (they explicitly said to use `z.string().url()` and noted the zod 3 context). No adjustment was needed beyond confirming the lockfile.

## CFG-02 Evidence — Verbatim Error Messages

These are the exact error messages produced by `loadConfig` on the four bad-config fixtures:

**`samples/bad-missing-baseurl.yaml` (required field absent):**
```
Invalid config in <absPath>/samples/bad-missing-baseurl.yaml:
  baseUrl: expected string, got undefined
```

**`samples/bad-wrong-type.yaml` (viewport.width as string):**
```
Invalid config in <absPath>/samples/bad-wrong-type.yaml:
  viewport.width: expected number, got string
```

**`samples/bad-out-of-range.yaml` (deviceScaleFactor=5, max=3):**
```
Invalid config in <absPath>/samples/bad-out-of-range.yaml:
  deviceScaleFactor: Number must be less than or equal to 3 (maximum: 3)
```

**`samples/bad-url.yaml` (non-URL baseUrl string):**
```
Invalid config in <absPath>/samples/bad-url.yaml:
  baseUrl: Invalid url
```

Note: zod 3's `invalid_string` issue for `.url()` failure yields `issue.message = "Invalid url"` — the catch-all branch in `formatZodError` (`${field}: ${issue.message}`) handles it correctly. No issue code leaks. The 02-01 integration smoke test verify regex should match `/Invalid url/` for the URL fixture.

## Exported API Surface

### `src/config/schema.js`

```javascript
export const configSchema  // z.object — fields:
  // name: z.string().min(1)
  // baseUrl: z.string().url()          — WHATWG URL via zod 3 string method
  // output: z.string().min(1)
  // deviceScaleFactor: z.number().min(1).max(3).default(2)
  // viewport: { width: number (int, positive), height: number (int, positive), name?: string }
  // page: { path: string (startsWith '/'), name: string (required) }
  // prepare: { animations: boolean (default true), hide: string[] (default []),
  //            scrollPrime: boolean (default true), extraDelay: number int>=0 (default 0) }
  //           .default({}) — entire block optional in YAML

export function formatZodError(zodError: ZodError): string[]
  // Returns one string per issue: "field: human-readable description"
  // Never includes: issue.code, 'ZodError', stack traces
  // Handles: invalid_type → "field: expected X, got Y"
  //          too_small    → "field: message (minimum: N)"
  //          too_big      → "field: message (maximum: N)"
  //          all others   → "field: message" (catch-all)
```

### `src/config/load.js`

```javascript
export class ConfigError extends Error
  // .name === 'ConfigError', .message is user-safe (no raw zod internals)

export async function loadConfig(configPath: string): Promise<ResolvedConfig>
  // 1. resolve(process.cwd(), configPath)
  // 2. readFile(absPath, 'utf8') — throws ConfigError on ENOENT/EACCES
  //    BOM-strip: charCodeAt(0) === 0xFEFF → slice(1)
  // 3. yaml.load(raw) — throws ConfigError with line:col on YAMLException
  // 4. configSchema.safeParse(parsed) — throws ConfigError with formatZodError lines on failure
  // Returns: result.data (fully-typed ResolvedConfig)
```

## CLI Decoupling Confirmation

No CLI wiring was added in this plan. `src/config/load.js` has no `import` of commander, no `console.log` or `console.error` calls, and no `process.exit` calls. It is a pure async library module. Plan 02-01 (wave 2) is responsible for importing `loadConfig` and `ConfigError` into the capture action handler in `index.js`.

## Task Commits

1. **Task 1: Write src/config/schema.js** — `4d66586` (feat)
2. **Task 2: Write src/config/load.js** — `452ff78` (feat)
3. **Task 3: Create bad-config fixtures in samples/** — `b082fd3` (feat)

## Files Created

- `src/config/schema.js` — zod 3 configSchema + formatZodError helper
- `src/config/load.js` — four-step YAML→validated-config pipeline + ConfigError
- `samples/bad-missing-baseurl.yaml` — CFG-02 fixture: missing required baseUrl field
- `samples/bad-wrong-type.yaml` — CFG-02 fixture: viewport.width typed as string
- `samples/bad-out-of-range.yaml` — CFG-02 fixture: deviceScaleFactor=5 (max=3)
- `samples/bad-url.yaml` — CFG-02 fixture: baseUrl is not a valid URL

## Decisions Made

1. **z.string().url() over z.url()** — Confirmed zod 3.25.76 in lockfile; top-level z.url() is zod v4-only. No change needed since plan instructions already specified z.string().url().
2. **z.object (not z.strictObject)** — Strip-unknown-keys is correct for a personal tool; extra YAML keys warn visibly in filenames rather than crashing.
3. **prepare.default({})** — Allows minimal configs to omit the entire prepare block.
4. **No console/process.exit in load.js** — Clean module boundary; 02-01 owns the CLI error presentation.

## Deviations from Plan

None — plan executed exactly as written. The zod version note (3.x not 4.x) was already anticipated in the plan's task instructions; no runtime surprises were encountered.

## Issues Encountered

None.

## Threat Surface Scan

No new network endpoints, auth paths, file writes, or schema changes at trust boundaries. The `output` field template traversal risk (flagged in the plan's threat model as T-02-02-FUT-PT) is accepted and logged for Phase 5's file writer.

## Next Phase Readiness

- `loadConfig` and `ConfigError` are ready for import by 02-01 (wave 2)
- `configSchema` and `ResolvedConfig` typedef are ready for 02-03 (template resolver)
- `samples/bad-*.yaml` fixtures are ready for 02-01's integration smoke test
- `samples/sample.yaml` is NOT created here — that is 02-01's responsibility

---
*Phase: 02-cli-config*
*Completed: 2026-05-20*
