// samples/verify-region-schema.js — Phase 8 Plan 01 hermetic schema verifier.
//
// Project posture (PROJECT.md "Out of Scope: Unit test suite", 08-VALIDATION.md
// "Framework: None — hermetic smoke fixture"): no jest/vitest/node:test
// scaffolding. This file IS the test for 08-01 — the verifier asserts every
// behavior bullet from 08-01-PLAN.md's <behavior> block and prints SCHEMA OK
// on success, exiting non-zero on the first failed assertion.
//
// Run:  node samples/verify-region-schema.js
//
// Maps 1:1 to the inline <verify><automated> block in 08-01-PLAN.md.

import { configSchema, formatZodError } from '../src/config/schema.js';
import yaml from 'js-yaml';
import fs from 'node:fs';

const baseValid = {
  name: 'p',
  baseUrl: 'http://x.test',
  viewport: { width: 800, height: 600, name: 'smoke' },
  page: { path: '/', name: 'home' },
  prepare: { animations: true, hide: [], scrollPrime: true, extraDelay: 0 },
};

function fail(label, detail) {
  console.error(`FAIL ${label}`);
  if (detail !== undefined) console.error(detail);
  process.exit(1);
}

// 1. v0.1 back-compat: no regions block validates unchanged
const v01 = configSchema.safeParse({ ...baseValid, output: '/tmp/{page}.png' });
if (!v01.success) fail('v0.1-back-compat', v01.error.issues);
if (v01.data.regions !== undefined) fail('regions-should-be-undefined-when-omitted', v01.data.regions);

// 2. selector region validates + padding defaults to 0
const sel = configSchema.safeParse({
  ...baseValid,
  output: '/tmp/{region}-{page}.png',
  regions: [{ name: 'hero', selector: '.hero' }],
});
if (!sel.success) fail('selector-region', sel.error.issues);
if (sel.data.regions[0].padding !== 0) fail('padding-default', sel.data.regions[0]);

// 3. padding explicit value preserved
const padded = configSchema.safeParse({
  ...baseValid,
  output: '/tmp/{region}-{page}.png',
  regions: [{ name: 'hero', selector: '.hero', padding: 20 }],
});
if (!padded.success || padded.data.regions[0].padding !== 20) {
  fail('padding-explicit', padded.error?.issues ?? padded.data);
}

// 4. anchor region validates
const anc = configSchema.safeParse({
  ...baseValid,
  output: '/tmp/{region}-{page}.png',
  regions: [{ name: 'cards', from: '#a', to: '#b' }],
});
if (!anc.success) fail('anchor-region', anc.error.issues);

// 5. mixed array validates
const mix = configSchema.safeParse({
  ...baseValid,
  output: '/tmp/{region}-{page}.png',
  regions: [
    { name: 'a', selector: '.x' },
    { name: 'b', from: '#p', to: '#q', padding: 5 },
  ],
});
if (!mix.success || mix.data.regions.length !== 2) {
  fail('mixed', mix.error?.issues ?? mix.data);
}

// 6. selector + anchor -> reject with both-not-allowed message
const both = configSchema.safeParse({
  ...baseValid,
  output: '/tmp/{region}-{page}.png',
  regions: [{ name: 'hero', selector: '.x', from: '#p', to: '#q' }],
});
if (both.success) fail('both-rejected');
const bothLines = formatZodError(both.error);
if (!bothLines.some((l) => l.includes('not both') && l.includes("'hero'"))) {
  fail('both-message', bothLines);
}

// 7. neither selector nor anchors -> reject
const neither = configSchema.safeParse({
  ...baseValid,
  output: '/tmp/{region}-{page}.png',
  regions: [{ name: 'oops' }],
});
if (neither.success) fail('neither-rejected');
const neitherLines = formatZodError(neither.error);
if (!neitherLines.some((l) => l.includes("must declare 'selector' OR") && l.includes("'oops'"))) {
  fail('neither-message', neitherLines);
}

// 8. half-anchor (from without to) -> reject
const half = configSchema.safeParse({
  ...baseValid,
  output: '/tmp/{region}-{page}.png',
  regions: [{ name: 'half', from: '#only-from' }],
});
if (half.success) fail('half-rejected');
const halfLines = formatZodError(half.error);
if (!halfLines.some((l) => l.includes("'from' and 'to'") && l.includes("'half'"))) {
  fail('half-message', halfLines);
}

// 8b. half-anchor (to without from) -> reject (mirror case from <behavior>)
const halfTo = configSchema.safeParse({
  ...baseValid,
  output: '/tmp/{region}-{page}.png',
  regions: [{ name: 'half2', to: '#only-to' }],
});
if (halfTo.success) fail('half-to-rejected');
const halfToLines = formatZodError(halfTo.error);
if (!halfToLines.some((l) => l.includes("'from' and 'to'") && l.includes("'half2'"))) {
  fail('half-to-message', halfToLines);
}

// 9. duplicate names -> reject with field-named message
const dup = configSchema.safeParse({
  ...baseValid,
  output: '/tmp/{region}-{page}.png',
  regions: [
    { name: 'h', selector: '.x' },
    { name: 'h', selector: '.y' },
  ],
});
if (dup.success) fail('dup-rejected');
const dupLines = formatZodError(dup.error);
if (!dupLines.some((l) => l.includes("duplicate name 'h'"))) fail('dup-message', dupLines);

// 10. regions present but output lacks {region} -> reject pointing at output
const noPlaceholder = configSchema.safeParse({
  ...baseValid,
  output: '/tmp/{page}.png',
  regions: [{ name: 'hero', selector: '.hero' }],
});
if (noPlaceholder.success) fail('no-placeholder-rejected');
const npLines = formatZodError(noPlaceholder.error);
if (!npLines.some((l) => l.startsWith('output:') && l.includes('{region}'))) {
  fail('no-placeholder-message', npLines);
}

// 11. regions present AND output has {region} -> validates
const ok = configSchema.safeParse({
  ...baseValid,
  output: '/tmp/{region}-{page}.png',
  regions: [{ name: 'hero', selector: '.hero' }],
});
if (!ok.success) fail('final-ok', ok.error.issues);

// 12. existing v0.1 sample fixtures still parse and produce regions === undefined
for (const path of ['samples/smoke.yaml', 'samples/sample.yaml']) {
  const parsed = yaml.load(fs.readFileSync(path, 'utf8'));
  const r = configSchema.safeParse(parsed);
  if (!r.success) fail(`fixture-regression ${path}`, r.error.issues);
  if (r.data.regions !== undefined) fail(`fixture-regions-leaked ${path}`, r.data.regions);
}

console.log('SCHEMA OK');
