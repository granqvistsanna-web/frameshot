// src/config/load.js
// File → parsed → validated pipeline with clean error wrapping.
// Exports: loadConfig(configPath) and ConfigError.
//
// IMPORTANT: This module has NO console output and NO process.exit calls.
// It throws ConfigError on any failure; the CLI entry (02-01) catches and formats.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { configSchema, formatZodError } from './schema.js';

/**
 * Named Error subclass for user-input failures (bad config path, invalid YAML,
 * schema validation failure). Lets the top-level catch in index.js distinguish
 * "user input was bad" from "we have a bug."
 */
export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Load and validate a YAML config file.
 *
 * Four-step pipeline:
 *   1. Resolve path against process.cwd() (CLI-01: must work from any directory)
 *   2. Read file with BOM stripping
 *   3. Parse YAML with line/column-aware error wrapping
 *   4. Validate against configSchema.safeParse, throw ConfigError on failure
 *
 * @param {string} configPath — relative or absolute path to the YAML config file
 * @returns {Promise<import('./schema.js').ResolvedConfig>}
 * @throws {ConfigError} on any failure path
 */
export async function loadConfig(configPath) {
  // Step 1 — Resolve path against CWD (not import.meta.url — CLI-01 requires user's CWD)
  const absPath = resolve(process.cwd(), configPath);

  // Step 2 — Read file
  let raw;
  try {
    raw = await readFile(absPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') throw new ConfigError(`Config file not found: ${absPath}`);
    if (err.code === 'EACCES') throw new ConfigError(`Permission denied reading: ${absPath}`);
    throw err; // genuinely unexpected — let it bubble
  }
  // Strip UTF-8 BOM if present (hand-edited files on Windows sometimes have one)
  // RESEARCH.md §Pitfall 3: Notepad and some editors save UTF-8 with BOM by default
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  // Step 3 — Parse YAML
  // js-yaml v4 `yaml.load` is safe by default — no custom-tag code execution risk.
  // Do NOT use the removed `yaml.safeLoad` API.
  let parsed;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    if (err.name === 'YAMLException') {
      // YAMLException exposes .mark.line and .mark.column (both 0-indexed)
      const line = (err.mark?.line ?? 0) + 1; // convert to 1-indexed for display
      const col = (err.mark?.column ?? 0) + 1;
      throw new ConfigError(`YAML parse error at ${absPath}:${line}:${col} — ${err.reason}`);
    }
    throw err;
  }

  // Step 4 — Validate
  // Use safeParse (not parse) — the whole point of CFG-02 is controlled error formatting.
  // RESEARCH.md §Pitfall 5: never let a raw ZodError surface to the user.
  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    const lines = formatZodError(result.error);
    throw new ConfigError(`Invalid config in ${absPath}:\n  ${lines.join('\n  ')}`);
  }
  return result.data;
}
