---
phase: 02-cli-config
plan: 01
status: complete
completed: 2026-05-20T06:36:02Z
requirements:
  - CLI-01
  - CFG-01
  - CFG-02
  - CFG-03
key-files:
  created:
    - src/cli.js
    - samples/sample.yaml
  modified:
    - index.js
commits:
  - 3cc0a76 feat(02-01): add src/cli.js commander shell with capture stub action
  - 1aedd2b feat(02-01): rewrite index.js as thin bin entry + ship samples/sample.yaml
  - 33e38b9 feat(02-01): integrate loadConfig + resolveTemplate in capture action
---

# Plan 02-01 Summary — CLI integration

## What was built

**`src/cli.js`** — commander v12 program builder. Exports `buildProgram()` (returns a configured `Command`; does NOT call `parseAsync` so test harnesses can import without side effects). The program is named `framershot` with version `0.1.0` (overrides commander's default `-V` to `-v`). One subcommand: `capture <config>`. The action handler is the wave-2 integration point — it calls `loadConfig(configArg)` (02-02), computes `date = new Date().toISOString().slice(0, 10)`, calls `resolveTemplate(config.output, { date, viewport, page })` (02-03), and prints `JSON.stringify({ ...config, _resolvedOutput: resolvedOutput }, null, 2)` to stdout.

**`index.js`** — thin ESM bin entry. Shebang + executable bit preserved. Imports `buildProgram`, calls `parseAsync(process.argv)` inside a `.catch` that prints `err.message` only (no stack trace) and exits 1. Phase 1's wholesale dep imports (playwright-chromium, sharp, commander, js-yaml, zod, chalk, ora) were removed — those were a Phase 1 ESM smoke test; downstream phases import what they need where they need it.

**`samples/sample.yaml`** — v0.1 reference fixture, exact contents from RESEARCH.md §Code Examples (name: pubq-marketing, baseUrl: https://pubq.se, output template with three placeholders, viewport/page/prepare blocks).

## Resolved package versions

- commander resolved to **12.1.0** (package.json declares `^12`). RESEARCH.md §Pattern 1 was written against v14 but every API used here (`.command('capture <config>')`, async `.action`, `.parseAsync`, `.version('0.1.0', '-v, --version')`, "no default action on top-level ⇒ auto-print help on bare invocation") works identically in v12.
- zod **3.25.76** (from 02-02 wave 1) — error wording is "expected string, got undefined" / "expected number, got string" / "Number must be less than or equal to 3" / "Invalid url". The acceptance regex `/Expected number|expected number/` in 02-01-PLAN.md matched the lowercase zod-3 phrasing.

## Final shape of `src/cli.js`

```js
import { Command } from 'commander';
import { loadConfig } from './config/load.js';
import { resolveTemplate } from './output/template.js';

export function buildProgram() {
  const program = new Command();

  program
    .name('framershot')
    .description('Clean retina screenshots of Framer sites')
    .version('0.1.0', '-v, --version');

  program
    .command('capture <config>')
    .description('Parse a config file, validate, and (later) capture')
    .action(async (configArg) => {
      const config = await loadConfig(configArg);
      const date = new Date().toISOString().slice(0, 10);
      const viewport = config.viewport.name ?? 'default';
      const page = config.page.name;
      const resolvedOutput = resolveTemplate(config.output, { date, viewport, page });
      console.log(JSON.stringify({ ...config, _resolvedOutput: resolvedOutput }, null, 2));
    });

  return program;
}
```

## ROADMAP Phase 2 success criteria — evidence

### SC #1 — `framershot capture samples/sample.yaml` prints the validated config

```
$ node index.js capture samples/sample.yaml
{
  "name": "pubq-marketing",
  "baseUrl": "https://pubq.se",
  "output": "./screenshots/{date}/{viewport}/{page}.png",
  "deviceScaleFactor": 2,
  "viewport": {
    "width": 1440,
    "height": 900,
    "name": "desktop"
  },
  "page": {
    "path": "/",
    "name": "home"
  },
  "prepare": {
    "animations": true,
    "hide": [
      "nav.sticky",
      "#consent-banner"
    ],
    "scrollPrime": true,
    "extraDelay": 500
  },
  "_resolvedOutput": "./screenshots/2026-05-20/desktop/home.png"
}
```

Exit 0.

### SC #2 — field-named errors for invalid configs (CFG-02 contract)

```
$ node index.js capture samples/bad-missing-baseurl.yaml
Invalid config in /Users/sannagranqvist/Documents/App/screenshotter/samples/bad-missing-baseurl.yaml:
  baseUrl: expected string, got undefined
(exit 1)

$ node index.js capture samples/bad-wrong-type.yaml
Invalid config in /Users/sannagranqvist/Documents/App/screenshotter/samples/bad-wrong-type.yaml:
  viewport.width: expected number, got string
(exit 1)

$ node index.js capture samples/bad-out-of-range.yaml
Invalid config in /Users/sannagranqvist/Documents/App/screenshotter/samples/bad-out-of-range.yaml:
  deviceScaleFactor: Number must be less than or equal to 3 (maximum: 3)
(exit 1)

$ node index.js capture samples/bad-url.yaml
Invalid config in /Users/sannagranqvist/Documents/App/screenshotter/samples/bad-url.yaml:
  baseUrl: Invalid url
(exit 1)
```

No `ZodError` literal anywhere. No internal issue codes (`invalid_type`, `too_big`, etc.) leaked. Each fixture exercises one of `formatZodError`'s four branches.

### SC #3 — output template resolved (CFG-03 integration)

The happy-path JSON above shows `_resolvedOutput: "./screenshots/2026-05-20/desktop/home.png"` — `{date}` → today's UTC date, `{viewport}` → "desktop" (slugified, already a slug), `{page}` → "home" (slugified, already a slug).

### SC #4 — bare invocation prints commander usage help

```
$ node index.js
Usage: framershot [options] [command]

Clean retina screenshots of Framer sites

Options:
  -v, --version     output the version number
  -h, --help        display help for command

Commands:
  capture <config>  Parse a config file, validate, and (later) capture
  help [command]    display help for command
```

(Exit 1, which is commander's default for "missing required command" — that's the right behavior for a non-interactive shell tool.)

### CLI-01 — works from any directory

```
$ cd /tmp && node /Users/sannagranqvist/Documents/App/screenshotter/index.js capture \
    /Users/sannagranqvist/Documents/App/screenshotter/samples/sample.yaml
# prints the same SC #1 JSON above (verified)
```

`loadConfig` resolves the path against `process.cwd()` internally, so relative paths from any CWD also work as long as they're valid from that CWD.

## Deviations from RESEARCH.md §Pattern 1

- **commander v12 vs v14**: RESEARCH.md anticipated v14 but `package.json` declared `^12`. Every API used here is v12-compatible (and identical in v14), so no code changes were needed — only the version reference.
- **Recovery execution path**: the first attempt at this plan ran in a worktree executor agent (`a06cff77452478a48`); that agent halted citing its own bash sandbox restriction, wrote `lib/cli.js` instead of `src/cli.js`, and used the wrong JSON shape (`{ config, samplePath }` vs the spec's `{ ...config, _resolvedOutput }`). The orchestrator cleaned up the worktree and re-executed the three tasks inline. The three commits above are the recovery commits; they match the plan exactly.

## Self-Check: PASSED

- src/cli.js exports buildProgram and imports loadConfig + resolveTemplate from the correct paths
- index.js is a thin bin with shebang + executable bit, no Phase 1 wholesale deps
- samples/sample.yaml matches the v0.1 reference
- All four ROADMAP SC observable from a single shell invocation
- CLI-01 from-any-directory verified
- No new dependencies added to package.json
