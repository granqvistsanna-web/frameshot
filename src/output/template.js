// src/output/template.js
// Pure output-path template resolver — zero dependencies, no I/O.
// Callers compute date/time strings before passing them:
//   const d = new Date();
//   date: d.toISOString().slice(0, 10)              // YYYY-MM-DD
//   time: d.toISOString().slice(11, 19).replaceAll(':', '-')  // HH-MM-SS (colons replaced; Windows-safe)
// Both are derived from the same Date so they stay consistent within a run.
// Do not switch to toLocaleString — locale-invariant ISO output keeps paths
// portable across machines and CI.
//
// Unknown placeholders (e.g. {foo}) are left literal — typos surface visibly
// in the output path rather than silently being dropped.

// \p{L} = any letter (any script), \p{N} = any digit (any script).
// 'u' flag is required for Unicode property escapes.
// Note: '{' and '}' are intentionally NOT in the safe set — slugify must
// strip them so substituted values cannot re-introduce template placeholders
// (resolveTemplate below relies on this invariant).
const SLUG_RE = /[^\p{L}\p{N}._-]+/gu;

function slugify(value) {
  // Lowercase, replace runs of non-safe chars with '-', trim leading/trailing '-'.
  // Preserves '.', '-', '_' so 'home-v2' and 'mobile.tall' survive unchanged.
  // Unicode-aware: 'café' and '北京' survive intact; only structural chars
  // (spaces, '/', '(', '{', etc.) collapse to '-'.
  const slug = String(value).toLowerCase().replace(SLUG_RE, '-').replace(/^-+|-+$/g, '');
  // Fallback for whitespace-only or special-char-only inputs that would
  // otherwise yield '' and produce dotfile/collapsed-path output ('./.png').
  return slug || 'untitled';
}

export function resolveTemplate(template, { date, time, viewport, page, region }) {
  // {date} and {time} are NOT slugified — pre-formatted hyphenated forms are
  // path-safe and locale-invariant. {time} is optional; when absent, the
  // placeholder stays literal so the typo surfaces visibly.
  // {viewport} and {page} ARE slugified — handles spaces, unicode, etc.
  // {region} is slugified when present; left literal when region arg is undefined (full-page run).
  // The template itself is NOT slugified — '/' path separators must survive.
  return template
    .replaceAll('{date}', date)
    .replaceAll('{time}', time ?? '{time}')
    .replaceAll('{viewport}', slugify(viewport))
    .replaceAll('{page}', slugify(page))
    // {region} literal-fallback posture mirrors template.js:6-7 (unknown
    // placeholders stay literal so typos surface in the output path).
    .replaceAll('{region}', region ? slugify(region) : '{region}');
}
