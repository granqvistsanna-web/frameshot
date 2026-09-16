// src/server/ssrf.js
// SSRF guard for hosted (public) mode. When frameshotter runs on a cloud box it
// fetches and renders arbitrary user-supplied URLs — without this, a user could
// point it at http://169.254.169.254/ (cloud metadata) or an internal service
// and exfiltrate credentials. We resolve the hostname to its IPs and reject any
// that fall in private / loopback / link-local / reserved ranges.
//
// Only invoked in public mode (FRAMESHOTTER_PUBLIC=1). Local mode keeps full
// reach so you can still screenshot http://localhost:3000 dev drafts.
//
// ponytail: DNS-resolve-then-check. There's a theoretical TOCTOU window (DNS
// rebinding between this check and Chromium's own fetch). Closing it fully needs
// a custom resolver pinned into the browser — overkill for a few trusted users.
// Upgrade path: pin the resolved IP into the request if abuse shows up.

import { lookup } from 'node:dns/promises';

export class SsrfError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SsrfError';
  }
}

// Returns true if an IPv4/IPv6 address string is in a range we must not reach.
function isBlockedAddress(ip) {
  // IPv4
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0) return true;                       // 0.0.0.0/8
    if (a === 10) return true;                      // 10.0.0.0/8 private
    if (a === 127) return true;                     // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;        // 169.254.0.0/16 link-local (metadata!)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true;        // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true;                      // 224+ multicast/reserved
    return false;
  }
  // IPv6 — normalize and check the dangerous prefixes.
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;       // loopback / unspecified
  if (lower.startsWith('fe80:')) return true;               // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local fc00::/7
  if (lower.startsWith('::ffff:')) {                        // IPv4-mapped → re-check as v4
    return isBlockedAddress(lower.slice('::ffff:'.length));
  }
  return false;
}

/**
 * Throw SsrfError if `urlStr` resolves to a blocked address or isn't http(s).
 * Resolves ALL A/AAAA records — a hostname with one public and one private IP
 * (DNS rebinding setup) is rejected on the private one.
 * @param {string} urlStr
 */
export async function assertPublicUrl(urlStr) {
  let url;
  try {
    url = new URL(urlStr);
  } catch {
    throw new SsrfError(`invalid URL: ${urlStr}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfError('URL must use http or https');
  }

  let records;
  try {
    records = await lookup(url.hostname, { all: true });
  } catch {
    throw new SsrfError(`could not resolve host: ${url.hostname}`);
  }
  for (const { address } of records) {
    if (isBlockedAddress(address)) {
      throw new SsrfError(`blocked: ${url.hostname} resolves to a private/reserved address`);
    }
  }
}

// Self-check: node src/server/ssrf.js
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (cond, msg) => { if (!cond) { throw new Error('FAIL: ' + msg); } };
  assert(isBlockedAddress('169.254.169.254'), 'metadata endpoint');
  assert(isBlockedAddress('127.0.0.1'), 'loopback');
  assert(isBlockedAddress('10.1.2.3'), '10/8');
  assert(isBlockedAddress('172.16.0.1'), '172.16/12');
  assert(isBlockedAddress('172.32.0.1') === false, '172.32 is public');
  assert(isBlockedAddress('192.168.1.1'), '192.168/16');
  assert(isBlockedAddress('8.8.8.8') === false, 'public v4');
  assert(isBlockedAddress('::1'), 'v6 loopback');
  assert(isBlockedAddress('fe80::1'), 'v6 link-local');
  assert(isBlockedAddress('::ffff:127.0.0.1'), 'v4-mapped loopback');
  assert(isBlockedAddress('2606:4700:4700::1111') === false, 'public v6');
  console.log('ssrf self-check OK');
}
