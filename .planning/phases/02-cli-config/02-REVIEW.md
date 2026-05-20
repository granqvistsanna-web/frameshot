---
phase: 02-cli-config
reviewed: 2026-05-20T06:53:21Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/cli.js
  - src/config/load.js
  - src/config/schema.js
  - src/output/template.js
  - samples/sample.yaml
  - samples/bad-missing-baseurl.yaml
  - samples/bad-out-of-range.yaml
  - samples/bad-url.yaml
  - samples/bad-wrong-type.yaml
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: issues_resolved
fixed_at: 2026-05-20T07:05:08Z
fixed_findings: [CR-01, WR-01, WR-02, WR-03, WR-04]
---

# Phase 2: Code Review Report

**Reviewed:** 2026-05-20T06:53:21Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the Phase 2 CLI + config-validation slice: `src/cli.js` (commander wiring + integration), `src/config/load.js` (file→parsed→validated pipeline), `src/config/schema.js` (zod 3 schema + `formatZodError`), `src/output/template.js` (pure placeholder resolver), and five YAML fixtures. The four `samples/bad-*.yaml` files are intentional malformed fixtures and were not flagged for schema/format defects (per scope rules).

Overall the modules are tight, ESM-clean, and the trust-boundary discipline is mostly observed — `loadConfig` never prints, and `formatZodError` never leaks zod taxonomy. However, **the CFG-02 "never leak raw errors" contract has a hole**: passing a directory (or any non-ENOENT/non-EACCES fs error) bubbles up the raw Node.js error message ("EISDIR: illegal operation on a directory, read") with no path context. That's the lone Critical finding. The other defects are correctness/robustness gaps in `slugify` (whitespace-only and special-char-only page names produce empty slugs and silently broken output paths) and one architectural concern about `baseUrl` accepting `javascript:` and `file:` URLs that a future Phase 3 navigator would happily open.

## Critical Issues

### CR-01: `loadConfig` leaks raw fs errors for non-ENOENT/non-EACCES failures (CFG-02 contract hole)

**File:** `src/config/load.js:43-49`

**Issue:** The fs error handler in step 2 only special-cases `ENOENT` and `EACCES`. Any other `fs.readFile` failure — most prominently `EISDIR` when the user passes a directory path, but also `EMFILE`, `ENOTDIR`, `ELOOP`, etc. — re-throws the raw Node `SystemError` via `throw err`. That error has `err.code` set but `err.message` is the raw cryptic form, which then surfaces unwrapped through the top-level `console.error(err.message)` in `index.js`.

Concrete reproduction:
```bash
$ node index.js capture /tmp
EISDIR: illegal operation on a directory, read
EXIT: 1
```
There is no path in the message, no "Config file" framing, and the user has no idea which argument caused it. The plan's `<threat_model>` T-02-01-IY explicitly says the top-level catch is *the* CFG-02 trust chokepoint and must print "err.message only, never the full Error object" — but it relies on `loadConfig` having already wrapped the message into a friendly `ConfigError`. The `throw err` branch breaks that contract.

The class is mismatch as well: a `ConfigError` should result; instead a bare `Error` instance with `name: 'Error'` propagates, so any future `instanceof ConfigError` discriminator in `index.js` (mentioned in the load.js header comment as the rationale for the named subclass) won't fire on these paths.

**Fix:**
```javascript
try {
  raw = await readFile(absPath, 'utf8');
} catch (err) {
  if (err.code === 'ENOENT') throw new ConfigError(`Config file not found: ${absPath}`);
  if (err.code === 'EACCES') throw new ConfigError(`Permission denied reading: ${absPath}`);
  if (err.code === 'EISDIR') throw new ConfigError(`Config path is a directory, not a file: ${absPath}`);
  // Anything else: still wrap so the user sees the path and the contract holds.
  throw new ConfigError(`Failed to read config ${absPath}: ${err.message}`);
}
```
The catch-all `throw new ConfigError(...)` is the load-bearing change — it closes the "any other fs error leaks raw" hole without needing to enumerate every errno.

## Warnings

### WR-01: `slugify` produces empty strings for whitespace-only or special-char-only inputs, yielding broken output paths

**File:** `src/output/template.js:9-15` (and the call sites in `src/cli.js:19-21`)

**Issue:** `slugify` lowercases, replaces runs of non-`[a-zA-Z0-9._-]` with `-`, then trims leading/trailing `-`. There is no guard for the case where the resulting string is empty. Two real user-reachable paths trigger this:

1. `page.name: "   "` (three spaces) — passes `z.string().min(1)` because length is 3, but slugify yields `""`.
2. `page.name: "!!!"` — passes schema, slugifies to `""`.

Concrete reproduction:
```bash
$ cat /tmp/x.yaml
name: t
baseUrl: https://example.com
output: ./{page}.png
deviceScaleFactor: 2
viewport: { width: 1440, height: 900 }
page: { path: /, name: "!!!" }
$ node index.js capture /tmp/x.yaml | grep _resolvedOutput
  "_resolvedOutput": "./.png"
```
A leading `.` produces a hidden file on POSIX. With `output: "./shots/{page}.png"` the result is `./shots/.png` — a literal dotfile written to disk in Phase 5. With `output: "./{page}/img.png"` you'd get `.//img.png` which collapses to `./img.png` and silently flattens the directory hierarchy across pages.

The `<truths>` in 02-03's plan say "Unknown placeholders … are left literal so typos surface visibly" — empty slugs do the opposite: they vanish silently. This is the v0.1 failure mode the plan explicitly wanted to avoid.

**Fix:** Have `slugify` fall back to a sentinel when the result is empty (and likewise have `viewport.name` get a sentinel on empty rather than passing `''`):
```javascript
function slugify(value) {
  const slug = String(value).toLowerCase().replace(SLUG_RE, '-').replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}
```
Alternatively, tighten the schema so `page.name` and `viewport.name` use `.trim()` + `min(1)` after trimming, e.g. `z.string().trim().min(1)`. That catches the whitespace case at validation time (better UX — error at the bad config, not at a mystery filename).

### WR-02: `baseUrl` accepts `javascript:`, `file:`, and other non-HTTP schemes

**File:** `src/config/schema.js:40`

**Issue:** `z.string().url()` uses the WHATWG URL parser, which accepts any well-formed URL scheme. Concrete:
```javascript
configSchema.safeParse({ ..., baseUrl: 'javascript:alert(1)' }).success  // true
configSchema.safeParse({ ..., baseUrl: 'file:///etc/passwd' }).success    // true
configSchema.safeParse({ ..., baseUrl: 'data:text/html,<h1>x</h1>' }).success  // true
```
The PROJECT.md threat model frames the user as the trust boundary, so this is not a remote-attacker vulnerability today — but Phase 3's `chromium.goto(baseUrl + page.path)` will navigate to whatever URL is in the config, and `file://` / `javascript:` URLs in Playwright can read local files and bypass screenshot intent. Better to reject at config-load time than to discover it in Phase 3 with a half-rendered browser. Documented schemes for screenshotting are http/https; everything else is a foot-gun.

**Fix:**
```javascript
baseUrl: z
  .string()
  .url()
  .refine((u) => u.startsWith('http://') || u.startsWith('https://'),
          { message: 'baseUrl must use http or https' }),
```
The `.refine` error message lands in `formatZodError`'s catch-all branch ("baseUrl: baseUrl must use http or https"), which already handles unknown issue codes cleanly.

### WR-03: `formatZodError` `received ?? typeof issue.input` fallback can produce `'undefined'` literal in error messages

**File:** `src/config/schema.js:64`

**Issue:** The `invalid_type` branch reads `issue.received ?? typeof issue.input`. In zod 3.25.x, `issue.received` is typically populated (e.g., `"undefined"`, `"string"`, `"array"`), so the fallback rarely fires. But when it *does* fire (e.g., custom issue paths or future zod minor-version drift where `received` becomes undefined), `typeof issue.input` for an actually-missing field returns the literal string `"undefined"` — which collides with zod's own `received: "undefined"` for missing required fields, yielding the indistinguishable message `expected string, got undefined`. That's fine for missing-required, but for paths where `input` is genuinely the JS undefined for some other reason (deeply nested optional, refine context, etc.) the user sees the same "got undefined" and has no way to distinguish "you forgot this" from "your value is undefined."

More importantly, `issue.input` is **not a documented stable field** on `ZodIssue` in zod 3. It exists in zod 4 (`issue.input` is part of the v4 issue shape) but in zod 3.25 `issue.input` is `undefined` on most issues, so the fallback degrades to `typeof undefined === 'undefined'` for *every* zod-3 case that hits the fallback. The fallback is effectively a no-op-with-confusing-output.

**Fix:** Drop the brittle `?? typeof issue.input` fallback and use a deterministic sentinel:
```javascript
if (issue.code === 'invalid_type') {
  return `${field}: expected ${issue.expected}, got ${issue.received ?? 'unknown'}`;
}
```
Or, if you want to preserve the zod-4 forward-compat, gate it: `issue.received ?? (issue.input === undefined ? 'undefined' : typeof issue.input)`. Either way, document the choice in a comment.

### WR-04: `slugify` is locale-fragile — non-ASCII characters silently dropped

**File:** `src/output/template.js:9` (`SLUG_RE = /[^a-zA-Z0-9._-]+/g`)

**Issue:** The character class only allows ASCII letters and digits. Every non-ASCII letter — `café`, `Größe`, `北京`, `naïve` — is treated as a non-safe run and collapsed to `-`. Reproduction:
```javascript
resolveTemplate('./{page}.png', { date:'x', viewport:'v', page:'café' })
// "./caf.png"  — the 'é' is stripped, NOT replaced with '-' (because surrounded by ASCII)
resolveTemplate('./{page}.png', { date:'x', viewport:'v', page:'北京' })
// "./.png"    — all non-ASCII, slug becomes empty -> dotfile (see WR-01)
```
For a Framer-screenshot tool aimed at marketing sites that often have multilingual content, this is a real footgun: a Swedish/German/Japanese page name silently turns into garbage or a dotfile, and the user has no idea their `output:` template is producing collisions.

The plan's 02-03 §Pitfall 6 picked UTC-date intentionally for locale-invariance; the same instinct should apply to slug. Use Unicode property escapes:

**Fix:**
```javascript
// \p{L} = any letter (any script), \p{N} = any digit (any script).
// 'u' flag is required for Unicode property escapes.
const SLUG_RE = /[^\p{L}\p{N}._-]+/gu;
```
This keeps `café` → `café`, `北京` → `北京`, and still strips `/`, spaces, parentheses, etc. Combined with WR-01's empty-fallback, the slug stays predictable for international users.

## Info

### IN-01: `formatZodError` `<root>` sentinel for empty `issue.path` may be confusing

**File:** `src/config/schema.js:62`

**Issue:** When `issue.path` is empty (e.g., the entire YAML parses to a non-object like `null`, a string, or an array, which trips the top-level `invalid_type`), the error reads `<root>: expected object, got null`. The literal `<root>` works but feels like leaked internals — most users won't know "root" is the YAML document. A friendlier sentinel like `(top-level)` or just dropping the prefix (`expected object, got null`) would read more naturally. Low-impact polish; leave for Phase 6 UX pass.

**Fix (optional):**
```javascript
const field = issue.path.length ? issue.path.join('.') : '(top-level)';
```

### IN-02: `index.js` is referenced but not in the reviewed-files list; sample.yaml comment is stale

**File:** `src/cli.js:17` (and `samples/sample.yaml:1`)

**Issue:** Two minor doc drifts:
1. The action handler comment in `src/cli.js` is sparse — given how load-bearing the CFG-02 contract is, a one-line note that "all errors propagate to index.js top-level catch — do NOT add try/catch here" would prevent a future maintainer from defensively wrapping it and accidentally suppressing the friendly error path. The 02-01 plan calls this out at length; the code itself doesn't.
2. `samples/sample.yaml:1` says `# sample.yaml — minimal v0.1 config` but it includes the full `prepare` block with all four fields — that's not "minimal" anymore, it's "exhaustive." Either rename the comment to `# sample.yaml — full v0.1 reference config` or actually trim to minimal. Cosmetic.

**Fix:** Add a one-line comment in the cli.js action; update the YAML comment for accuracy.

### IN-03: `slugify` is called unconditionally on `page` but `page.path` and `page.name` differ in semantics

**File:** `src/cli.js:20` (passes `config.page.name`); `src/output/template.js:24`

**Issue:** The capture handler forwards `config.page.name` (a human label like `"home"`) into `{page}` substitution. The schema *also* has `config.page.path` (the URL path like `"/about"`) which is the value Phase 3 will actually navigate to. There's no protection against the two drifting — a user can perfectly legally write:
```yaml
page:
  path: /products/widget-pro
  name: home
```
… and the screenshot of `/products/widget-pro` lands in `./.../home.png`, silently mislabeled. This is by design per the 02-02 plan (name is for display, path is for navigation), but it's worth documenting in REQUIREMENTS or in a code comment so the v0.2 multi-page expansion (which adds `pages: [...]`) doesn't repeat the disconnect. Not a defect today; flag for the Phase 5/v0.2 planner.

**Fix:** Add a code comment near `src/cli.js:20` noting the name/path divergence is intentional, or in the v0.2 plan derive `page.name` from `page.path` by default (`slugify(page.path)`) when omitted.

### IN-04: Template substitution order is order-dependent but undocumented

**File:** `src/output/template.js:21-25`

**Issue:** Three sequential `.replaceAll` calls run in the order `{date}` → `{viewport}` → `{page}`. The current implementation is safe because `slugify` strips `{` and `}`, so a viewport name like `"{page}"` slugifies to `"page"` (no braces, no re-substitution) and the `{date}` value (`YYYY-MM-DD`) cannot contain `{` either. So no chained-substitution bug exists *today*. But the safety relies on three invariants that aren't documented:
1. Caller always passes an ISO-date `date` (no braces, no placeholders).
2. `slugify` always strips `{` and `}` (it does — they're non-safe).
3. The replacement order is `date → viewport → page` (matters only if invariants 1+2 break).

If a future contributor changes `slugify` to preserve more characters (e.g., to fix WR-04), and forgets to keep `{}` in the strip set, the order-dependence becomes a latent bug. Add a one-line comment.

**Fix:**
```javascript
// IMPORTANT: slugify must always strip '{' and '}' so substituted values cannot
// re-introduce placeholders. The current SLUG_RE strips them; if you change
// SLUG_RE, preserve that invariant or switch to a single-pass regex.
```

---

_Reviewed: 2026-05-20T06:53:21Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
