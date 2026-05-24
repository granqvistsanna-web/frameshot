#!/usr/bin/env node
// samples/verify-template-region.js — Phase 8 Plan 02 hermetic template verifier.
//
// Project posture (PROJECT.md "Out of Scope: Unit test suite"): no test
// framework. This script IS the test for 08-02 Task 2 — asserts every
// behavior bullet from the plan's Task 2 <behavior> block. Maps 1:1 to the
// inline <verify><automated> block.
//
// Run:  node samples/verify-template-region.js

import { resolveTemplate } from '../src/output/template.js';

function fail(label, expected, got) {
  console.error(`FAIL ${label}`);
  console.error('  expected:', JSON.stringify(expected));
  console.error('  got:     ', JSON.stringify(got));
  process.exit(1);
}

const cases = [
  // 1. region present + slugified
  {
    label: 'region-substituted',
    input: ['/tmp/{region}-{page}.png', { date: '2026-05-22', viewport: 'desktop', page: 'home', region: 'hero' }],
    expect: '/tmp/hero-home.png',
  },
  // 2. region omitted → literal {region} preserved
  {
    label: 'region-omitted-literal',
    input: ['/tmp/{region}-{page}.png', { date: '2026-05-22', viewport: 'desktop', page: 'home' }],
    expect: '/tmp/{region}-home.png',
  },
  // 3. region explicit undefined → literal {region} preserved
  {
    label: 'region-undefined-literal',
    input: ['/tmp/{region}-{page}.png', { date: '2026-05-22', viewport: 'desktop', page: 'home', region: undefined }],
    expect: '/tmp/{region}-home.png',
  },
  // 4. back-compat: no {region} in template, no region arg
  {
    label: 'back-compat-no-region-key',
    input: ['/tmp/{viewport}/{page}.png', { date: '2026-05-22', viewport: 'desktop', page: 'home' }],
    expect: '/tmp/desktop/home.png',
  },
  // 5. slugification of region name (spaces + special chars)
  {
    label: 'region-slugified',
    input: ['/tmp/{region}.png', { date: '2026-05-22', viewport: 'd', page: 'h', region: 'Hero Card!!!' }],
    expect: '/tmp/hero-card.png',
  },
  // 6. path-traversal neutralization (security: SLUG_RE strips / and dots collapse)
  {
    label: 'region-traversal-slugified',
    input: ['/tmp/{region}.png', { date: '2026-05-22', viewport: 'd', page: 'h', region: '../../etc/passwd' }],
    expect: '/tmp/--etc-passwd.png',
  },
  // 7. region + viewport + page + date all together
  {
    label: 'all-placeholders-region',
    input: [
      '/out/{date}/{viewport}/{region}-{page}.png',
      { date: '2026-05-22', viewport: 'desktop', page: 'home', region: 'hero' },
    ],
    expect: '/out/2026-05-22/desktop/hero-home.png',
  },
  // 8. unknown placeholder posture preserved when region present
  {
    label: 'unknown-placeholder-literal-with-region',
    input: ['/tmp/{region}-{foo}.png', { date: '2026-05-22', viewport: 'd', page: 'h', region: 'hero' }],
    expect: '/tmp/hero-{foo}.png',
  },
];

for (const { label, input, expect } of cases) {
  const got = resolveTemplate(...input);
  if (got !== expect) fail(label, expect, got);
}

// Existing v0.1 callers (no region arg) must continue to work
// Both these forms must produce the same output:
const noRegionA = resolveTemplate('/tmp/{viewport}/{page}.png', { date: '2026-05-22', viewport: 'desktop', page: 'home' });
const noRegionB = resolveTemplate('/tmp/{viewport}/{page}.png', { date: '2026-05-22', viewport: 'desktop', page: 'home', region: undefined });
if (noRegionA !== noRegionB) fail('back-compat-undefined-vs-omitted', noRegionA, noRegionB);
if (noRegionA !== '/tmp/desktop/home.png') fail('back-compat-value', '/tmp/desktop/home.png', noRegionA);

console.log('TEMPLATE OK');
