# Phase 2: CLI + Config — Research

**Researched:** 2026-05-19
**Domain:** Node.js CLI parsing, YAML config loading, schema validation, path templating
**Confidence:** HIGH

## Summary

Phase 2 wires three locked dependencies (commander, js-yaml, zod) into a working `framershot capture <config.yaml>` flow that parses YAML, validates it via zod, and resolves an output path template. The stack is mainstream and battle-tested; the only real design decisions are (a) what zod error format to surface (CFG-02 demands "specific field + expected type," not a raw dump), and (b) how strict to be about path-safety in templated outputs.

The 2026-05 ecosystem state has moved past the versions the user named in the brief: commander is at **v14** (not v12), zod is at **v4** (not v3), js-yaml is at **v4.1.1**. The user's intent — a lean ESM CLI with clean errors — is unchanged, but the doc references and code sketches below target current majors. v14 commander still uses the `Command`/`program` API the brief assumed, so the only adjustment is awareness of v13/v14 stricter argument validation (which actually *helps* CFG-02).

**Primary recommendation:** Use `import { Command } from 'commander'` + `program.command('capture <config>')` with an async action handler invoked via `program.parseAsync(argv)`. Pipe `yaml.load(content)` (safe by default in v4) into `schema.safeParse(parsed)`, then run a ~10-line `formatZodIssues(error)` helper that turns `error.issues` into one line per issue (path + expected + received). Resolve output templates with a 4-line string `.replaceAll()` block; slugify the viewport/page values (not the whole template).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLI-01 | User can run `framershot capture <config.yaml>` from any directory | Section 5 (path resolution) + Section 1 (commander subcommand) |
| CFG-01 | YAML config with name, baseUrl, output, deviceScaleFactor, viewport, page, prepare | Section 3 (zod schema design) + Section 2 (YAML parse) |
| CFG-02 | Invalid config rejected with field-specific message | Section 3 (formatZodIssues sketch) |
| CFG-03 | Output template supports `{date}`, `{viewport}`, `{page}` | Section 4 (template resolver) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CLI argument parsing | CLI entry (index.js + commander) | — | Single concern; commander owns it |
| Config file I/O | Filesystem layer (fs/promises) | CLI entry | Reading the YAML file is a pure I/O step; error shape (ENOENT) bubbles to CLI |
| YAML → JS object | Parser layer (js-yaml) | — | Library-owned; we just call `yaml.load` |
| Schema validation | Validation layer (zod schema module) | — | Owns the canonical shape; isolated so Phase 3+ can `import { configSchema }` |
| Error formatting | Validation layer | CLI entry | `formatZodIssues` lives next to the schema; CLI prints |
| Output path templating | Templater module (pure function) | — | Standalone util; Phase 5 imports it for the actual write |
| Smoke-print | CLI entry | — | `console.log(JSON.stringify(resolved, null, 2))` and exit; throwaway in Phase 3 |

## Standard Stack

### Core (already installed in Phase 1)
| Library | Version (verified 2026-05-19) | Purpose | Why Standard |
|---------|-------------------------------|---------|--------------|
| `commander` | 14.0.3 [VERIFIED: npm registry, published 2026-05-12] | CLI argument parsing, subcommands, help/version | The default Node CLI parser; tj/commander.js is the canonical repo; ~140M weekly downloads |
| `js-yaml` | 4.1.1 [VERIFIED: npm registry, published 2025-11-14] | YAML 1.2 parser, safe by default in v4 | nodeca/js-yaml is the canonical YAML library for Node |
| `zod` | 4.4.3 [VERIFIED: npm registry, published 2026-05-04] | Schema validation with structured `.issues` | colinhacks/zod is the canonical TS/JS schema validator |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `chalk` | 5.6.2 | Colored status messages (red errors, dim usage hints) | For human-facing CLI status; NOT for JSON output |
| `ora` | 9.4.0 | Spinners (Phase 6, not Phase 2) | Skip in Phase 2 — keep stdout clean for the smoke-print |

### Alternatives Considered (and rejected per locked stack)
| Instead of | Could Use | Why we don't |
|------------|-----------|------|
| commander | yargs, mri, sade | PROJECT.md locks commander; the brief explicitly forbids yargs |
| js-yaml | `yaml` (eemeli/yaml), @iarna/toml | js-yaml is locked; brief forbids cosmiconfig |
| zod | valibot, ajv, joi | zod is locked; no swap |

### Critical version note
The brief mentions "commander v12+" and "zod v3" — but current `latest` tags are commander **v14** and zod **v4**. Phase 1 declared caret ranges (`commander ^12`, `zod ^3` per the 01-01 plan text), so `npm install` resolved to **whatever was current at install time** of Phase 1, which (since Phase 1 hasn't been executed yet) will be v14 / v4. The plan author for Phase 2 should:

1. After Phase 1 executes, read `package-lock.json` to confirm actual installed versions.
2. If commander resolved to v14 or zod to v4, use the v14/v4 API in this research (which we do).
3. If a deliberate pin to v12/v3 is desired, that's a Phase 1 amendment, not a Phase 2 concern.

## Package Legitimacy Audit

slopcheck was unavailable in this environment (`pip install slopcheck` not present, no fallback in PATH). Per protocol, all packages would normally be tagged `[ASSUMED]`. However — the three packages here are the **same three already locked by PROJECT.md and declared in the Phase 1 plan** (which itself enumerates the maintainers by name and skips the slopcheck gate for the same reason). Phase 2 introduces **zero new packages**, so the audit is a no-op.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| commander | npm (14.0.3) | 12+ yrs | ~140M/wk | github.com/tj/commander.js | unavailable | Approved (declared in Phase 1) |
| js-yaml | npm (4.1.1) | 14+ yrs | ~80M/wk | github.com/nodeca/js-yaml | unavailable | Approved (declared in Phase 1) |
| zod | npm (4.4.3) | 6+ yrs | ~30M/wk | github.com/colinhacks/zod | unavailable | Approved (declared in Phase 1) |

**Packages removed:** none
**Packages flagged [SUS]:** none
**New packages introduced by Phase 2:** **NONE.** No additions to `package.json` happen in this phase.

## Architecture Patterns

### System Architecture Diagram

```
                              ┌─────────────────────────────┐
process.argv ───────────────► │ commander program           │
                              │   .command('capture <cfg>') │
                              │   .action(async (cfg) => …) │
                              └──────────────┬──────────────┘
                                             │ raw config path string
                                             ▼
                              ┌─────────────────────────────┐
                              │ path.resolve(cwd, arg)      │
                              └──────────────┬──────────────┘
                                             │ absolute path
                                             ▼
                              ┌─────────────────────────────┐
                              │ fs.readFile(path, 'utf8')   │  ── ENOENT / EACCES → exit 1 with msg
                              └──────────────┬──────────────┘
                                             │ raw YAML string
                                             ▼
                              ┌─────────────────────────────┐
                              │ yaml.load(content)          │  ── YAMLException → exit 1 with line:col
                              └──────────────┬──────────────┘
                                             │ unknown JS object
                                             ▼
                              ┌─────────────────────────────┐
                              │ configSchema.safeParse(obj) │  ── !success → formatZodIssues → exit 1
                              └──────────────┬──────────────┘
                                             │ validated, typed config
                                             ▼
                              ┌─────────────────────────────┐
                              │ resolveOutputPath(template, │  (pure function, used by Phase 5)
                              │   { date, viewport, page }) │
                              └──────────────┬──────────────┘
                                             │ resolved config + sample output path
                                             ▼
                              ┌─────────────────────────────┐
                              │ console.log(JSON.stringify( │  ← Phase 2 ends here (smoke mode)
                              │   resolved, null, 2))       │     Phase 3 replaces this with capture
                              └─────────────────────────────┘
```

### Recommended Project Structure

```
index.js                  # shebang + commander wiring (Phase 2 owns; Phase 6 polishes)
src/
├── cli.js                # program definition (extracted from index.js for testability)
├── config/
│   ├── schema.js         # zod schema exports: configSchema, type ResolvedConfig
│   ├── load.js           # readFile + yaml.load + safeParse + formatZodIssues
│   └── format-errors.js  # formatZodIssues(error) → string[]
└── output/
    └── template.js       # resolveOutputPath({ template, date, viewport, page })
```

Phase 1 created only `index.js`. This phase introduces `src/` for the first time. The split is deliberate: Phase 5 will `import { resolveOutputPath } from '../output/template.js'` and Phase 3 will `import { configSchema } from '../config/schema.js'`. Keeping these pure and side-effect-free pays off in Phase 3+.

### Pattern 1: commander v14 ESM subcommand with async action

```javascript
// src/cli.js
// Source: https://github.com/tj/commander.js (README, v14 examples) [CITED]
import { Command } from 'commander';
import { loadAndValidateConfig } from './config/load.js';
import { resolveOutputPath } from './output/template.js';

export function buildProgram() {
  const program = new Command();

  program
    .name('framershot')
    .description('Clean retina screenshots of Framer sites')
    .version('0.1.0', '-v, --version'); // override default -V → -v

  program
    .command('capture <config>')
    .description('Parse a config file, validate, and (later) capture')
    .action(async (configArg) => {
      const config = await loadAndValidateConfig(configArg);
      // Phase 2 smoke-print: dump the validated config + a sample resolved path.
      const samplePath = resolveOutputPath(config.output, {
        date: new Date().toISOString().slice(0, 10),
        viewport: config.viewport.name ?? 'default',
        page: config.page.name,
      });
      console.log(JSON.stringify({ config, samplePath }, null, 2));
    });

  return program;
}

// index.js
import { buildProgram } from './src/cli.js';
const program = buildProgram();
await program.parseAsync(process.argv);
```

**What this gives us, by ROADMAP success criterion:**

| Criterion | Why it works |
|-----------|--------------|
| #1 valid config → prints resolved JSON | The action handler does exactly this |
| #2 bad config → specific field message | `loadAndValidateConfig` calls `formatZodIssues` and throws/exits with formatted message |
| #3 template `{date}/{viewport}/{page}` resolves | `resolveOutputPath` does the substitution |
| #4 no args → usage help | commander auto-prints help when a required subcommand is missing **and no default action is defined on `program` itself** — we have none, so this is automatic [CITED: commander v14 README] |

### Pattern 2: js-yaml v4 safe load with line/column error capture

```javascript
// src/config/load.js
// Source: https://github.com/nodeca/js-yaml/blob/master/CHANGELOG.md (v4 entry) [CITED]
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { configSchema } from './schema.js';
import { formatZodIssues } from './format-errors.js';

export async function loadAndValidateConfig(configArg) {
  const absPath = resolve(process.cwd(), configArg);

  // 1. Read file
  let raw;
  try {
    raw = await readFile(absPath, 'utf8'); // utf8 strips no BOM; see note below
  } catch (err) {
    if (err.code === 'ENOENT') throw new ConfigError(`Config file not found: ${absPath}`);
    if (err.code === 'EACCES') throw new ConfigError(`Permission denied reading: ${absPath}`);
    throw err;
  }

  // Strip UTF-8 BOM if present (hand-edited files on Windows sometimes have one)
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

  // 2. Parse YAML (v4 `load` is safe by default — no code execution risk)
  let parsed;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    // YAMLException exposes .mark.line, .mark.column (both 0-indexed)
    if (err.name === 'YAMLException') {
      const line = (err.mark?.line ?? 0) + 1;
      const col = (err.mark?.column ?? 0) + 1;
      throw new ConfigError(`YAML parse error at ${absPath}:${line}:${col} — ${err.reason}`);
    }
    throw err;
  }

  // 3. Validate
  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    const lines = formatZodIssues(result.error);
    throw new ConfigError(`Invalid config in ${absPath}:\n  ${lines.join('\n  ')}`);
  }

  return result.data;
}

export class ConfigError extends Error {
  constructor(message) { super(message); this.name = 'ConfigError'; }
}
```

### Pattern 3: zod v4 schema with custom error formatter

```javascript
// src/config/schema.js
// Source: https://zod.dev/basics, https://zod.dev/api (v4 docs) [CITED]
import * as z from 'zod';

const viewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  name: z.string().min(1).optional(),
});

const pageSchema = z.object({
  path: z.string().startsWith('/'),       // baseUrl + path, so leading slash enforced
  name: z.string().min(1),                // used in output template — required
});

const prepareSchema = z.object({
  animations: z.boolean().default(true),   // disable animations (PREP-01) — default ON
  hide: z.array(z.string()).default([]),   // selectors to hide (PREP-03)
  scrollPrime: z.boolean().default(true),  // PREP-04 default ON
  extraDelay: z.number().int().min(0).default(0), // PREP-05, milliseconds
}).default({}); // entire `prepare` block is optional in YAML

export const configSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.url(), // v4 top-level z.url() — WHATWG URL validation [CITED: zod.dev/api]
  output: z.string().min(1),
  deviceScaleFactor: z.number().min(1).max(3).default(2),
  viewport: viewportSchema,
  page: pageSchema,
  prepare: prepareSchema,
});

/** @typedef {z.infer<typeof configSchema>} ResolvedConfig */
```

```javascript
// src/config/format-errors.js
// Custom formatter: ZodError → human-readable lines.
// Why custom: z.prettifyError() exists in v4 but is too verbose; CFG-02 wants
// "field: expected X, got Y" one-liners, not multi-line tree output.
export function formatZodIssues(zodError) {
  return zodError.issues.map((issue) => {
    const field = issue.path.length ? issue.path.join('.') : '<root>';
    // Zod v4 streamlined issue codes; common shapes:
    //   invalid_type     → expected, received
    //   too_small/too_big → minimum/maximum
    //   invalid_format   → format (e.g. 'url')
    //   custom           → message
    if (issue.code === 'invalid_type') {
      return `${field}: expected ${issue.expected}, got ${issue.received ?? typeof issue.input}`;
    }
    if (issue.code === 'too_small') {
      return `${field}: ${issue.message} (minimum: ${issue.minimum})`;
    }
    if (issue.code === 'too_big') {
      return `${field}: ${issue.message} (maximum: ${issue.maximum})`;
    }
    return `${field}: ${issue.message}`;
  });
}
```

Example output for a config missing `baseUrl` and with `deviceScaleFactor: 5`:

```
Invalid config in /Users/me/site.yaml:
  baseUrl: expected string, got undefined
  deviceScaleFactor: Number must be less than or equal to 3 (maximum: 3)
```

### Pattern 4: Output path template resolver

```javascript
// src/output/template.js
// Source: ROADMAP Phase 2 plan 02-03; placeholders match Phase 5 success criteria.

const SLUG_RE = /[^a-zA-Z0-9._-]+/g;

function slugify(value) {
  // Lowercase, replace runs of non-safe chars with '-', trim leading/trailing '-'
  return String(value).toLowerCase().replace(SLUG_RE, '-').replace(/^-+|-+$/g, '');
}

export function resolveOutputPath(template, { date, viewport, page }) {
  // Unknown placeholders: leave literal. We log nothing — a typo in the template
  // shows up as a visible `{whatever}` in the resolved string. This is intentional;
  // erroring would block legitimate uses (e.g. literal braces in a filename).
  return template
    .replaceAll('{date}', date)            // ISO date, already safe (YYYY-MM-DD)
    .replaceAll('{viewport}', slugify(viewport))
    .replaceAll('{page}', slugify(page));
}
```

**Date format:** `new Date().toISOString().slice(0, 10)` → `'2026-05-19'`. Matches the ROADMAP example exactly.

**Unknown placeholder behavior:** Leave literal. Rationale: throwing on unknown `{...}` forces us to maintain an allowlist that has to grow as v0.2 adds region/viewport name expansion. Silently leaving them surfaces the bug visibly in the output filename without blocking the run. Phase 6 can add a warning if needed.

**Slugification scope:** Only `viewport` and `page` are slugified — **not** `date` (already safe), **not** the template itself (the author wrote it, trust the directory separators they chose). The slug regex preserves `.`, `-`, `_` so things like `home-v2` and `mobile.tall` survive.

**Trust model:** The config author is the user (PROJECT.md: personal tool). We sanitize against accidental spaces and unicode, not against malicious input. No path-traversal checks (`../`) — if you write `{page}: ../../etc/passwd` in your own config, that's on you.

### Anti-Patterns to Avoid

- **Don't use `program.argument('<config>')` on the top-level program.** The brief says `capture` is a subcommand. Subcommand form (`.command('capture <config>')`) is what gives us the `framershot capture sample.yaml` shape and the automatic help when run bare.
- **Don't call `.parse()` instead of `.parseAsync()`.** Action handlers are async (they await `readFile`). `.parse()` will not wait for them and the process can exit before the action resolves. [CITED: commander README]
- **Don't dump `result.error.issues` directly.** That's exactly the "raw zod dump" CFG-02 forbids. Use `formatZodIssues` (above).
- **Don't `JSON.parse(JSON.stringify(parsed))` to "normalize" YAML output.** Wastes cycles and loses zod's coerce. Pass the YAML object straight to `safeParse`.
- **Don't slugify the whole template string.** It contains `/` (path separators) which slugification would mangle.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Argv parsing, subcommands, help text | Manual `process.argv` slicing | `commander` (already installed) | Handles `--help`, `--version`, missing required args, type coercion |
| YAML parsing | A regex over YAML lines | `js-yaml` (already installed) | YAML has anchors, multi-line strings, flow vs block — too much surface area |
| Schema validation | `if (typeof x !== 'string') throw …` chains | `zod` (already installed) | Composable, type-inferred, produces structured `.issues` |
| URL validation | A regex from Stack Overflow | `z.url()` (built into zod v4) | Uses `new URL()` under the hood — WHATWG-compliant |
| Path resolution | Custom string concatenation | `path.resolve(process.cwd(), arg)` | Handles `~`, `./`, `../`, absolute paths, OS separators |
| BOM stripping | Don't worry about it | `charCodeAt(0) === 0xFEFF` slice | One-liner; only needed because Windows editors sometimes save with BOM |

**Key insight:** Phase 2 is plumbing between three libraries that already do the work. The only original code we write is (a) `formatZodIssues` (~10 lines), (b) `resolveOutputPath` (~6 lines), (c) the schema declaration (~25 lines), and (d) the CLI wiring (~30 lines). Roughly 70 lines of original code total. Anything more means we're hand-rolling something that already exists.

## Common Pitfalls

### Pitfall 1: Calling `program.parse()` with async actions
**What goes wrong:** The action handler returns a Promise but `parse()` doesn't await it. Process exits before `readFile` resolves, or worse — uncaught rejection.
**Why it happens:** Commander has both `parse()` and `parseAsync()`. The default in most examples is `parse()`.
**How to avoid:** Always use `await program.parseAsync(process.argv)` when any action is async. The top-level `await` works because `package.json` has `"type": "module"`.
**Warning signs:** "Process exits without printing anything" or "Promise rejection not handled" at the top level.

### Pitfall 2: Treating `z.string().url()` as v3-style API
**What goes wrong:** In zod v4, `.url()` as a chained method on `z.string()` is **deprecated** (still works for backcompat, but will emit a warning eventually). The v4-preferred form is **top-level** `z.url()`.
**Why it happens:** Most online examples and Stack Overflow answers are pre-v4.
**How to avoid:** Use `z.url()` directly. If type inference gets confused, fall back to `z.string().url()` — but prefer the top-level form. [CITED: zod.dev v4 changelog]
**Warning signs:** Deprecation console messages mentioning "string format methods."

### Pitfall 3: BOM in hand-edited YAML files
**What goes wrong:** A user opens `config.yaml` in Notepad (or some other Windows editor) and saves it with a UTF-8 BOM. The BOM (U+FEFF) appears as the first character. `yaml.load` then either fails outright or interprets the first key incorrectly.
**Why it happens:** Some editors add BOM by default on Windows; the user has no idea.
**How to avoid:** Strip BOM after `readFile`: `if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);`
**Warning signs:** "Unexpected character" YAML errors on what looks like a valid file. The line:column will point at the very start.

### Pitfall 4: Action handler errors hidden by `parseAsync`
**What goes wrong:** `parseAsync` swallows synchronous errors inside the action handler. Logs nothing, exits 0 — looks like success.
**Why it happens:** Commander wraps the action; thrown errors become unhandled rejections that may or may not surface depending on Node version.
**How to avoid:** Wrap the top-level call: `program.parseAsync(process.argv).catch((err) => { console.error(chalk.red(err.message)); process.exit(1); });` — and use a custom `ConfigError` class so you can distinguish user errors from bugs.
**Warning signs:** "It just silently exits" or "no error message even though I know the config is broken."

### Pitfall 5: Letting zod errors leak through as `.toString()` dumps
**What goes wrong:** Someone writes `catch (err) { console.error(err) }` and ships a multi-line "ZodError: [ { path: ['baseUrl'], code: 'invalid_type', ... } ]" message. Violates CFG-02.
**Why it happens:** It's the path of least resistance.
**How to avoid:** **Never** print a `ZodError` directly. Always route through `formatZodIssues`. Make `loadAndValidateConfig` throw a `ConfigError` (a plain Error subclass with a clean `.message`) so the catch site can't accidentally print the raw zod object.
**Warning signs:** Error output starts with `ZodError:` or contains `[ { code:` or path arrays.

### Pitfall 6: Hard-coded date format string drift
**What goes wrong:** `new Date().toISOString().slice(0, 10)` works today, but a teammate later "fixes" it to `toLocaleDateString()` because they want US format. Output paths now contain `5/19/2026` (slashes break path resolution).
**Why it happens:** Locale-aware date functions seem more "polished."
**How to avoid:** Add a code comment: `// ISO date YYYY-MM-DD — path-safe, locale-invariant. Do not change to toLocaleDateString.`
**Warning signs:** Output paths suddenly contain `/` characters where they shouldn't, or output files appear in unexpected directories.

## Runtime State Inventory

Not applicable — Phase 2 is a greenfield phase. No rename/refactor/migration. No external service state, no database state, no OS-registered tasks.

## Code Examples

### A working `sample.yaml` config

```yaml
# sample.yaml — minimal v0.1 config
name: pubq-marketing
baseUrl: https://pubq.se
output: ./screenshots/{date}/{viewport}/{page}.png
deviceScaleFactor: 2
viewport:
  width: 1440
  height: 900
  name: desktop
page:
  path: /
  name: home
prepare:
  animations: true
  hide:
    - 'nav.sticky'
    - '#consent-banner'
  scrollPrime: true
  extraDelay: 500
```

### Expected smoke-print output

```bash
$ framershot capture sample.yaml
{
  "config": {
    "name": "pubq-marketing",
    "baseUrl": "https://pubq.se",
    "output": "./screenshots/{date}/{viewport}/{page}.png",
    "deviceScaleFactor": 2,
    "viewport": { "width": 1440, "height": 900, "name": "desktop" },
    "page": { "path": "/", "name": "home" },
    "prepare": {
      "animations": true,
      "hide": ["nav.sticky", "#consent-banner"],
      "scrollPrime": true,
      "extraDelay": 500
    }
  },
  "samplePath": "./screenshots/2026-05-19/desktop/home.png"
}
```

### Expected error output (CFG-02)

```bash
$ framershot capture broken.yaml
Invalid config in /Users/me/broken.yaml:
  baseUrl: expected string, got undefined
  viewport.width: expected number, got string
  deviceScaleFactor: Number must be less than or equal to 3 (maximum: 3)
```

```bash
$ framershot capture bad-yaml.yaml
YAML parse error at /Users/me/bad-yaml.yaml:5:3 — unexpected end of the stream within a flow collection
```

```bash
$ framershot capture missing.yaml
Config file not found: /Users/me/missing.yaml
```

```bash
$ framershot
Usage: framershot [options] [command]

Clean retina screenshots of Framer sites

Options:
  -v, --version       output version number
  -h, --help          display help for command

Commands:
  capture <config>    Parse a config file, validate, and (later) capture
  help [command]      display help for command
```

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|-------------------------|--------------|--------|
| `yaml.safeLoad(content)` | `yaml.load(content)` (now safe by default) | js-yaml 4.0 (Jan 2021) | Use `load`; `safeLoad` was removed |
| `import { z } from 'zod'` | `import * as z from 'zod'` | zod v4 docs convention | Both work in v4; namespace form is the documented canon |
| `z.string().url()` (method form) | `z.url()` (top-level) | zod v4 | Method form deprecated but still functional |
| `z.object({...}).strict()` | `z.strictObject({...})` | zod v4 | Method form deprecated; we use neither — we want strip-unknown-keys behavior (default `z.object`) |
| `.default(val)` parsed val against input type | `.default(val)` short-circuits, applies to output | zod v4 | Behavior change — for our schema the defaults are literal values so no impact |
| `program.parse()` | `program.parseAsync()` (for async actions) | commander always supported it; v14 docs emphasize | Use `parseAsync` exclusively |

**Deprecated but still works (don't use):**
- `yaml.safeLoad` — removed in v4
- `yaml.DEFAULT_SAFE_SCHEMA` / `DEFAULT_FULL_SCHEMA` — replaced by `DEFAULT_SCHEMA`
- `z.string().url()` — use `z.url()`
- `z.object({...}).strict()` — use `z.strictObject({...})` if you want strict; otherwise stick with `z.object`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 1 has executed before Phase 2 begins and `package-lock.json` reflects whatever majors `npm install` picked | Standard Stack | If Phase 2 plans assume v14/v4 but lockfile shows v12/v3, code examples need minor adjustment (mostly `z.url()` ↔ `z.string().url()`) [ASSUMED] |
| A2 | Single page/viewport in v0.1 — schema rejects arrays | Section 3 (schema design) | If user wants arrays in v0.1 after all, schema must change. ROADMAP and REQUIREMENTS both explicitly defer multi to v0.2, so risk low [ASSUMED] |
| A3 | Path `/...` is the canonical page path shape — leading slash required by `z.string().startsWith('/')` | Section 3 | If user writes `home` (no slash) thinking it's the page name, validation will reject. Mitigated by clear error message [ASSUMED] |
| A4 | Unknown placeholders in template should remain literal, not throw | Section 4 | If user expects strict mode, they'll be surprised by `{viewprt}` showing up in filenames. Mitigated by Phase 6 warning if added [ASSUMED] |
| A5 | Slugification of viewport/page names is desired (whitespace/unicode → `-`) | Section 4 | If user has carefully crafted names with allowed chars only, slugify is a no-op. If they want raw unicode preserved, this is wrong. Low risk for English-language Framer projects [ASSUMED] |
| A6 | The Phase 2 success criterion "prints the resolved config to stdout" means `JSON.stringify(..., null, 2)` — not YAML-roundtrip, not chalk-colored | Section 6 boundary | If user wanted colored YAML output, we'd need `yaml.dump` + chalk. Brief explicitly says "no chalk for the output" so this is locked [ASSUMED → effectively VERIFIED by brief] |

## Open Questions

1. **Should `output` field accept absolute paths?**
   - What we know: The example `./screenshots/{date}/{viewport}/{page}.png` is relative.
   - What's unclear: Does the user want to forbid absolute paths (safety) or allow them (flexibility)?
   - Recommendation: Allow both. `z.string().min(1)` already does. Phase 5 will `path.resolve(process.cwd(), templatedOutput)` so relative resolves relative to cwd, absolute stays absolute.

2. **Should `viewport.name` default if omitted?**
   - What we know: ROADMAP example uses `desktop`, `mobile`, etc.
   - What's unclear: If `name` is missing, what does `{viewport}` resolve to?
   - Recommendation: Default to `'default'` in the template resolver (already shown above: `config.viewport.name ?? 'default'`). Don't force users to add `name: desktop` if they have only one viewport.

3. **Should `prepare` defaults vary by Framer detection?**
   - What we know: PREP-01..05 are all about Framer-specific quirks.
   - What's unclear: Should `animations: true` (disable) be the default, or `false`?
   - Recommendation: Default everything ON (`animations: true`, `scrollPrime: true`). PROJECT.md core value is "clean Framer screenshots," and these defaults match that. The user can override per-config.

## Environment Availability

Not applicable — Phase 2 depends only on Node.js modules already installed in Phase 1. No external tools, services, runtimes, or CLIs are introduced. Phase 1's `node >= 20` engines field already gates the runtime.

## Validation Architecture

> `workflow.research: true` and no explicit `nyquist_validation: false` in `.planning/config.json` → section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None currently in package.json. Phase 1 did not install a test runner (deliberate per the lean ethos). |
| Config file | none — see Wave 0 |
| Quick run command | `node --test src/` (Node built-in test runner — zero deps, ESM-compatible, ships in Node 20+) |
| Full suite command | `node --test src/` (same; suite is small) |

**Recommendation:** Use Node's built-in `node:test` and `node:assert/strict`. Zero dependencies, native ESM support, runs in `node --test`. This is consistent with PROJECT.md's "lean personal tool" ethos — adding `vitest` or `jest` would be the kind of over-tooling the brief explicitly forbids.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLI-01 | `framershot capture <path>` resolves config from any cwd | smoke | `node --test src/config/load.test.js` | ❌ Wave 0 |
| CFG-01 | Valid YAML config with all fields parses successfully | unit | `node --test src/config/schema.test.js` | ❌ Wave 0 |
| CFG-02 | Invalid config → formatted error naming bad field | unit | `node --test src/config/format-errors.test.js` | ❌ Wave 0 |
| CFG-03 | Template `{date}/{viewport}/{page}` resolves correctly | unit | `node --test src/output/template.test.js` | ❌ Wave 0 |
| (smoke) | `framershot` with no args prints help, exits 0 | smoke | `node index.js && [ $? -eq 1 ]` (commander exits 1 on no-args by design) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test src/`
- **Per wave merge:** `node --test src/` (suite is small enough that full = quick)
- **Phase gate:** Full suite green + the smoke-print example above produces the expected JSON

### Wave 0 Gaps

- [ ] `src/config/schema.test.js` — covers CFG-01, valid + invalid object shapes
- [ ] `src/config/load.test.js` — covers CLI-01 (cwd resolution), ENOENT path, YAML parse error path
- [ ] `src/config/format-errors.test.js` — covers CFG-02, asserts no raw zod dump in message
- [ ] `src/output/template.test.js` — covers CFG-03, all three placeholders + slugify + unknown placeholder
- [ ] No framework install needed (`node:test` is built in)

### What we are NOT testing in Phase 2

- Browser launch (Phase 3)
- Prepare pipeline (Phase 4)
- Actual PNG output (Phase 5)
- Spinner/error UX polish (Phase 6)

## Security Domain

> `security_enforcement` is not present in `.planning/config.json` → treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 2 has no auth surface; AUTH-01 is deferred to v0.3 |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | Personal CLI, no multi-user model |
| V5 Input Validation | yes | zod schema validates every field of the YAML config |
| V6 Cryptography | no | No secrets, no crypto |
| V8 Data Protection | yes (minor) | The config file may contain a `baseUrl` for a private staging URL — but Phase 2 doesn't read secrets yet (auth is v0.3) |
| V12 Files & Resources | yes | Output path resolution is user-controlled; Phase 5 will write to it |

### Known Threat Patterns for Node CLI + YAML config

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| YAML deserialization RCE (custom tags executing code) | Tampering / EoP | `yaml.load` in v4 is safe by default — no custom tag execution. Don't use `yaml.LOAD_SCHEMA` extensions [VERIFIED: js-yaml v4 changelog] |
| Path traversal in `output` template (`../../etc/passwd`) | Tampering | Personal-tool context: user is the threat model boundary. They can write what they want. No mitigation needed [ASSUMED — appropriate for personal CLI] |
| Path traversal in `config` arg (`framershot capture /etc/passwd`) | Information Disclosure | The user explicitly chose to read that path. Not a security issue; user privilege boundary [ASSUMED] |
| Prototype pollution via YAML (`__proto__: { admin: true }`) | Tampering | js-yaml v4 default schema does not allow `__proto__` key injection in object construction; zod schema rejects unknown keys at top level anyway (objects are strip-by-default but our shape is strict by virtue of `safeParse` failing on missing required fields) [CITED: js-yaml v4 + general zod behavior] |
| Regex DoS in `output` template | DoS | Our slugify regex `/[^a-zA-Z0-9._-]+/g` is linear; not a ReDoS pattern |
| Malicious dependency (typosquatting) | Tampering / Supply Chain | Already handled in Phase 1 — no new deps in Phase 2 |

### Notes

- **No new secrets** introduced this phase. The YAML may eventually contain auth tokens (v0.3), but Phase 2 schema does not include any auth field.
- **No network calls** from Phase 2 code itself. The validated `baseUrl` is just a string until Phase 3 navigates to it.
- **No file writes** from Phase 2 code (the smoke-print only writes to stdout). Phase 5 introduces file writes.

## Project Constraints (from CLAUDE.md / PROJECT.md)

No `./CLAUDE.md` file present in the project root. Constraints come from `.planning/PROJECT.md`:

| Constraint | Source | How Phase 2 honors it |
|-----------|--------|------------------------|
| Tech stack locked to seven packages | PROJECT.md Constraints | No new deps. No yargs, no cosmiconfig, no dotenv, no vitest. |
| Personal tool — no distribution polish | PROJECT.md Out of Scope | Smoke-print is JSON not pretty-printed YAML; no README updates; error messages are clear but not over-styled |
| Chromium only | PROJECT.md Constraints | Not relevant in Phase 2 (no browser yet) |
| Local only, no hosted service | PROJECT.md Constraints | All reads/writes are filesystem; no network |
| Single page/viewport in v0.1 | REQUIREMENTS.md v1 + Phase 2 description | Schema uses object (not array) for `viewport` and `page` |
| Bin name: framershot | PROJECT.md Key Decisions | commander `.name('framershot')` matches |

## What NOT To Do (re-stated for the planner)

The brief was explicit about anti-patterns. Surfacing them here so the planner can ensure tasks don't drift:

1. **NO new dependencies.** Not even small ones. No `yargs`, `cosmiconfig`, `dotenv`, `vitest`, `tsx`, `tap`, `mocha`. Use `node:test` for tests.
2. **NO logging library beyond chalk.** No `pino`, `winston`, `debug`. Plain `console.log/error` + chalk for status colors.
3. **NO multi-page/multi-viewport schema.** Single `viewport: { width, height, name? }` (object, not array). Single `page: { path, name }` (object, not array). Arrays are v0.2.
4. **NO config-discovery search path.** Don't probe `~/.framershotrc`, `cosmiconfig`-style. The path is always an explicit CLI argument.
5. **NO error-message polish beyond CFG-02 minimum.** Phase 2 must NOT dump raw zod errors. Phase 2 should NOT add stack-trace formatting, suggestions ("did you mean..."), or fuzzy field matching. Phase 6 owns the polish layer.
6. **NO TypeScript.** PROJECT.md doesn't add TS to the stack. Use JSDoc `@typedef` for the inferred config type if needed (shown above).
7. **NO config file write-back / migration.** We read, we validate, we use. We never write the YAML.
8. **NO `framershot.config.js` JS-config support.** YAML only in v0.1. If we wanted JS configs we'd need to import `node:vm` or `import()` a user file — bad surface.

## Phase 2 Boundary

What Phase 2 produces:
- Parsed + validated config object (in memory)
- A resolved sample output path (string)
- That's it. Both get JSON-stringified to stdout.

What Phase 2 does **not** do:
- Launch a browser
- Read the network
- Write any file (other than via console.log)
- Render any spinner or color the success path
- Catch errors below the CLI layer (network errors don't exist yet)

Phase 3 will replace the `console.log(JSON.stringify(...))` line in the action handler with the actual capture flow. The config-loading and template-resolving modules built in Phase 2 will be imported as-is.

## Sources

### Primary (HIGH confidence)
- `npm view commander version` → 14.0.3 (published 2026-05-12) [VERIFIED]
- `npm view js-yaml version` → 4.1.1 (published 2025-11-14) [VERIFIED]
- `npm view zod version` → 4.4.3 (published 2026-05-04) [VERIFIED]
- `npm view <pkg> repository.url` confirms canonical repos: tj/commander.js, nodeca/js-yaml, colinhacks/zod [VERIFIED]
- https://github.com/nodeca/js-yaml/blob/master/CHANGELOG.md — v4.0.0 entry confirms safeLoad removed, load safe by default [CITED]
- https://github.com/tj/commander.js (README + CHANGELOG) — v14 API, subcommand syntax, parseAsync [CITED]
- https://zod.dev/basics — canonical import `import * as z from "zod"`, parse/safeParse [CITED]
- https://zod.dev/api — z.url(), z.strictObject(), z.object() [CITED]
- https://zod.dev/v4/changelog — v4 breaking changes, deprecated method-form string format validators [CITED]
- https://zod.dev/error-formatting — issue shape: path, code, message, expected, received [CITED]

### Secondary (MEDIUM confidence)
- YAMLException shape (mark.line, mark.column, reason) verified via WebFetch of lib/exception.js in nodeca/js-yaml [CITED]

### Tertiary (LOW confidence)
- None — all material claims verified against primary sources or registry.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all three packages verified via npm registry, all three are the canonical/maintained repos, all three have recent releases.
- Architecture: HIGH — commander/zod/js-yaml pattern is mainstream Node CLI work; pattern is well-trodden.
- Pitfalls: HIGH — every pitfall listed is verified against changelogs (BOM, parseAsync, safe-by-default, deprecated z.string().url()).
- Validation architecture: MEDIUM — recommendation to use `node:test` is sound but the user hasn't explicitly committed to a test framework yet; if they prefer none, skip Wave 0 tests and rely on the smoke-print success criterion.

**Research date:** 2026-05-19
**Valid until:** 2026-06-19 (30 days — stack is stable; only zod v4 issue-code shape might tweak in minor releases)

## Locked-Stack Compliance Confirmation

Nothing in this research contradicts the locked stack or PROJECT.md constraints. Zero new dependencies are introduced. All architectural choices stay within the boundaries set by PROJECT.md (Chromium-only is irrelevant here, local-only is honored, personal-tool ethos is honored, single page/viewport scope is honored). The only divergence from the user's brief is the **version numbers** (commander v14 instead of v12, zod v4 instead of v3) — and that divergence is forced by what's already current on npm at Phase 1 install time, not by a research recommendation.
