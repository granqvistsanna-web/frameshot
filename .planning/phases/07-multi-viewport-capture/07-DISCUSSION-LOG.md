# Phase 7: Multi-viewport Capture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-22
**Phase:** 7-Multi-viewport Capture
**Areas discussed:** Config shape (deeply); runCapture seam, Per-viewport DSR, Web UI scope (delegated to Claude)

---

## Gray-area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Config shape | Singular + plural side-by-side vs. normalize singular to a one-element array at load. Ripples through schema, runCapture signature, and how the rest of the code reasons about viewports. | ✓ |
| runCapture seam | Does runCapture loop viewports internally, or does the CLI/server loop and call a per-viewport runCapture? Affects progress events, context lifecycle ownership, partial-failure semantics. | delegated |
| Per-viewport DSR | Keep deviceScaleFactor top-level, or allow per-viewport override (mobile@3x while desktop@2x). | delegated |
| Web UI scope | Does Phase 7 update src/server to support multi-viewport too, or is it CLI-only? | delegated |

**User's choice:** Config shape; "idk you decide" for the other three.

---

## Config Shape (selected — discussed deeply)

### Q1: How should the config schema express the singular-vs-plural viewport shape?

| Option | Description | Selected |
|--------|-------------|----------|
| Plural-only internally (Recommended) | Schema accepts EITHER `viewport: {...}` (v0.1 form, kept as alias) OR `viewports: [...]` (new form). Loader normalizes singular → one-element array. Downstream code only ever sees config.viewports[]. Clean internal shape, zero branching. | ✓ |
| Both shapes at every consumer | Schema accepts exactly one of the two keys (zod refinement). Every consumer (runCapture, launcher, server) branches on which key is present. More explicit but adds an if-branch everywhere viewports are read. | |
| Plural-only, deprecate singular with warning | Same as the first option but emits a deprecation warning on stderr when a singular `viewport:` block is loaded. | |

**User's choice:** Plural-only internally (Recommended)
**Notes:** Personal tool — no deprecation warnings warranted. Internal normalization keeps downstream code single-shaped.

### Q2: When a config uses `viewports: [...]`, must each entry have a unique `name`?

| Option | Description | Selected |
|--------|-------------|----------|
| Required + unique (Recommended) | Each `viewports[]` entry must have a `name`, and names must be unique across the array (zod refinement). Since the `{viewport}` placeholder is the only mechanism preventing PNG overwrites, enforcing this at validation time gives a clean field-named error instead of a silent overwrite. Singular `viewport.name` stays optional (back-compat). | ✓ |
| Required, not enforced unique | Each entry must have a `name`, but no uniqueness check. Two viewports with the same name silently overwrite the same output path. | |
| Optional, auto-fallback `viewport-N` | Names optional; if missing, auto-generate `viewport-0`, `viewport-1`. Simpler config for quick experiments, but loses control over the `{viewport}` placeholder substitution. | |

**User's choice:** Required + unique (Recommended)
**Notes:** Uniqueness is the load-bearing invariant for success criterion #2 (no overwrites). Schema-enforced beats runtime-discovered.

---

## Done check

| Option | Description | Selected |
|--------|-------------|----------|
| Ready for context (Recommended) | Lock the decisions, capture the three 'you decide' items with Claude's reasoning, and write CONTEXT.md. | ✓ |
| One more area | Pick one more gray area to discuss — e.g., partial-failure semantics, parallelism, or smoke fixture layout. | |

**User's choice:** Ready for context (Recommended)

---

## Claude's Discretion

User explicitly delegated three of the four surfaced gray areas with "idk you decide". CONTEXT.md captures the locked decisions and the reasoning behind each:

- **runCapture seam (D-03):** Loop lands inside runCapture; preserves the seam contract just established by commit 220ff9f.
- **Per-viewport DSR (D-04):** Top-level only; YAGNI for v0.2. Non-breaking addition later if needed.
- **Web UI scope (D-05):** CLI + library only in Phase 7; server gets minimum wiring to handle the new array-returning shape, no UI form changes.

Three additional decisions Claude also locked without asking (they fall out of v0.1 patterns without genuine ambiguity):

- **Partial-failure: fail-fast** — matches v0.1's top-level catch + exit pattern.
- **Parallelism: sequential** — single progress stream, bounded peak memory, no Playwright cross-context contention.
- **Smoke fixtures: two files** — `samples/smoke.yaml` stays as the back-compat fixture, `samples/smoke-multi.yaml` is the new 2-viewport demo.
- **Error types: no new typed error** — ConfigError + BrowserError already cover the new failure modes.

## Deferred Ideas

- Per-viewport `deviceScaleFactor` override (future schema addition)
- Web UI multi-viewport surface (follow-up phase)
- `--parallel` flag for concurrent viewport runs
- `--continue-on-error` partial-failure mode
- `--viewport=<name>` CLI filter (MULTI-03 — already deferred past v0.2 in REQUIREMENTS.md)
