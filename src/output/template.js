// src/output/template.js
// Pure output-path template resolver — zero dependencies, no I/O.
// Callers compute the date string before passing it:
//   new Date().toISOString().slice(0, 10)  // ISO date YYYY-MM-DD — path-safe, locale-invariant. Do not change to toLocaleDateString.
//
// Unknown placeholders (e.g. {foo}) are left literal — typos surface visibly
// in the output path rather than silently being dropped.

const SLUG_RE = /[^a-zA-Z0-9._-]+/g;

function slugify(value) {
  // Lowercase, replace runs of non-safe chars with '-', trim leading/trailing '-'.
  // Preserves '.', '-', '_' so 'home-v2' and 'mobile.tall' survive unchanged.
  return String(value).toLowerCase().replace(SLUG_RE, '-').replace(/^-+|-+$/g, '');
}

export function resolveTemplate(template, { date, viewport, page }) {
  // {date} is NOT slugified — YYYY-MM-DD hyphens are intentional and path-safe.
  // {viewport} and {page} ARE slugified — handles spaces, unicode, etc.
  // The template itself is NOT slugified — '/' path separators must survive.
  return template
    .replaceAll('{date}', date)
    .replaceAll('{viewport}', slugify(viewport))
    .replaceAll('{page}', slugify(page));
}
