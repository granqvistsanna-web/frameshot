// src/discover/sitemap.js
// Fetch and parse sitemap.xml (and sitemap indices) into a list of routes
// suitable for the v0.3 `pages:` config block.
//
// Library posture (matches src/capture/* and src/config/*):
//   - NO console output, NO process.exit, NO chalk/ora here.
//   - Throws SitemapError on any user-visible failure; the CLI entry
//     (src/cli.js#discover) catches and formats.
//   - Pure-ish: takes a fetch impl as a seam so tests can inject a fake.
//
// Sitemap protocol — we honor the bits that matter for Framer sites:
//   - <urlset> with <url><loc>…</loc></url> entries (the common case)
//   - <sitemapindex> with <sitemap><loc>…</loc></sitemap> entries (Framer
//     splits very large sites this way; we recurse exactly ONE level deep)
//   - <loc> values that are absolute URLs (we filter to same-origin only)
//
// What we INTENTIONALLY skip (out of scope for v0.3):
//   - robots.txt sitemap discovery — Framer always exposes /sitemap.xml directly
//   - <lastmod>/<priority>/<changefreq> — we only care about the URL set
//   - sitemap.xml.gz — never seen in the wild on framer.website hosts
//
// Regex parsing of <loc> tags is intentional. A real XML parser would handle
// CDATA and namespaces, but every sitemap we've ever inspected ships <loc>
// as a plain text node with no CDATA, and the alternative is adding a new
// dependency for a 3-line job. If we ever hit a sitemap that needs CDATA
// support, swap to fast-xml-parser at that point.

export class SitemapError extends Error {
  constructor(message, opts) {
    super(message, opts);
    this.name = 'SitemapError';
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_PAGES = 200;
const SITEMAP_INDEX_RECURSION_LIMIT = 1; // recurse one level — index → child sitemaps

/**
 * Fetch the sitemap at `<baseUrl>/sitemap.xml` (and any child sitemaps if the
 * root is a sitemap index), parse it, and return a list of routes for the
 * v0.3 `pages:` config block.
 *
 * Same-origin filter: only URLs whose origin matches `new URL(baseUrl).origin`
 * survive. Framer sites occasionally include third-party URLs in sitemaps
 * (e.g. a custom domain redirect target) — we drop those so the capture run
 * cannot wander off the site under test.
 *
 * @param {string} baseUrl — root of the Framer site, e.g. https://x.framer.website
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl] — injected fetch (test seam)
 * @param {number} [opts.maxPages] — cap on discovered pages (default 200);
 *   triggers `truncated: true` in the result when hit
 * @param {number} [opts.timeoutMs] — per-fetch timeout (default 10s)
 * @returns {Promise<{
 *   baseUrl: string,
 *   sourceUrl: string,
 *   pages: Array<{ path: string, name: string }>,
 *   discovered: number,
 *   truncated: boolean,
 *   childSitemaps: string[],
 * }>}
 * @throws {SitemapError} on network failure, non-2xx response, or empty/invalid sitemap
 */
export async function discoverFromSitemap(baseUrl, opts = {}) {
  const {
    fetchImpl = globalThis.fetch,
    maxPages = DEFAULT_MAX_PAGES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = opts;

  // Strip trailing slash so we don't accidentally produce //sitemap.xml.
  const root = baseUrl.replace(/\/+$/, '');
  let origin;
  try {
    origin = new URL(root).origin;
  } catch (err) {
    throw new SitemapError(`Invalid baseUrl: ${baseUrl}`, { cause: err });
  }

  const sourceUrl = `${root}/sitemap.xml`;
  const visited = new Set();
  const seenPaths = new Set();
  const seenNames = new Set();
  const pages = [];
  const childSitemaps = [];
  let truncated = false;

  async function fetchAndParse(url, depth) {
    if (visited.has(url)) return;
    visited.add(url);

    const xml = await fetchXml(url, fetchImpl, timeoutMs);
    const isIndex = /<sitemapindex[\s>]/i.test(xml);
    const locs = extractLocs(xml);

    if (locs.length === 0) {
      throw new SitemapError(`Sitemap at ${url} contained no <loc> entries`);
    }

    if (isIndex) {
      // Sitemap index — each <loc> is a child sitemap URL. Recurse exactly
      // SITEMAP_INDEX_RECURSION_LIMIT levels deep to avoid loops.
      if (depth >= SITEMAP_INDEX_RECURSION_LIMIT) {
        // Should not happen on real Framer sites (one level of nesting).
        // If we hit this, the sitemap is pathological — stop, don't recurse.
        return;
      }
      for (const childUrl of locs) {
        if (truncated) break;
        childSitemaps.push(childUrl);
        await fetchAndParse(childUrl, depth + 1);
      }
      return;
    }

    // Plain <urlset> — each <loc> is a page URL.
    for (const loc of locs) {
      if (truncated) break;
      let u;
      try {
        u = new URL(loc);
      } catch {
        // Skip malformed URLs silently — sitemaps occasionally contain
        // trailing whitespace or encoding glitches that the regex catches
        // but new URL() rejects. One bad entry shouldn't blow up the run.
        continue;
      }
      if (u.origin !== origin) continue; // same-origin filter
      const path = u.pathname || '/';
      if (seenPaths.has(path)) continue;
      seenPaths.add(path);
      pages.push({ path, name: deriveName(path, seenNames) });
      if (pages.length >= maxPages) {
        truncated = true;
        break;
      }
    }
  }

  try {
    await fetchAndParse(sourceUrl, 0);
  } catch (err) {
    if (err instanceof SitemapError) throw err;
    throw new SitemapError(`Failed to read sitemap at ${sourceUrl}: ${err.message}`, { cause: err });
  }

  if (pages.length === 0) {
    throw new SitemapError(
      `Sitemap at ${sourceUrl} yielded no same-origin pages (origin: ${origin})`,
    );
  }

  return {
    baseUrl: root,
    sourceUrl,
    pages,
    discovered: pages.length,
    truncated,
    childSitemaps,
  };
}

async function fetchXml(url, fetchImpl, timeoutMs) {
  if (!fetchImpl) {
    throw new SitemapError('No fetch implementation available (need Node 20+ or an explicit fetchImpl)');
  }
  let res;
  try {
    res = await fetchImpl(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/xml, text/xml;q=0.9, */*;q=0.5' },
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new SitemapError(`Timed out fetching ${url} after ${timeoutMs}ms`, { cause: err });
    }
    throw new SitemapError(`Network error fetching ${url}: ${err.message}`, { cause: err });
  }
  if (!res.ok) {
    throw new SitemapError(`HTTP ${res.status} fetching ${url}`);
  }
  return await res.text();
}

// Extract every <loc>...</loc> body in document order. Tolerates whitespace,
// case-insensitive tag matching (sitemaps in the wild sometimes use <LOC>).
// Does NOT decode HTML entities — Framer sitemaps don't ship encoded URLs,
// and decoding adds complexity for ~0 real-world value.
function extractLocs(xml) {
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/**
 * Format a discovery result into a runnable YAML config string.
 *
 * Output shape matches the v0.3 schema: `pages:` plural, default desktop
 * viewport, sensible prepare defaults (animations off, scrollPrime on), and
 * an output template that includes `{page}` so per-page paths are distinct
 * (the schema enforces this for pages.length > 1).
 *
 * Hand-emitted (not js-yaml.dump) because we want flow style for page
 * entries (`{ path: /, name: home }` on one line — matches deltaventure.yaml
 * style) and block style for everything else. js-yaml does not support
 * per-collection style switching without a custom Schema.
 *
 * @param {Awaited<ReturnType<typeof discoverFromSitemap>>} discovery
 * @param {object} [opts]
 * @param {string} [opts.name] — config name; defaults to the hostname slug
 * @param {{ width: number, height: number, name: string }} [opts.viewport]
 * @returns {string}
 */
export function formatDiscoveredConfig(discovery, opts = {}) {
  const { name, viewport } = opts;
  const hostname = new URL(discovery.baseUrl).hostname;
  const configName = name ?? hostname.replace(/\./g, '-');
  const vp = viewport ?? { width: 1440, height: 900, name: 'desktop' };

  const lines = [];
  lines.push(`# Generated by \`framershot discover ${discovery.baseUrl}\``);
  lines.push(`# Source: ${discovery.sourceUrl}`);
  lines.push(`# ${discovery.discovered} page(s)${discovery.truncated ? ' (truncated — raise --max to capture more)' : ''}`);
  if (discovery.childSitemaps.length > 0) {
    lines.push(`# Sitemap index recursed into ${discovery.childSitemaps.length} child sitemap(s)`);
  }
  lines.push('');
  lines.push(`name: ${yamlString(configName)}`);
  lines.push(`baseUrl: ${yamlString(discovery.baseUrl)}`);
  lines.push(`output: ./screenshots/{date}/{viewport}/{page}.png`);
  lines.push(`deviceScaleFactor: 2`);
  lines.push(`viewport:`);
  lines.push(`  name: ${yamlString(vp.name)}`);
  lines.push(`  width: ${vp.width}`);
  lines.push(`  height: ${vp.height}`);
  lines.push(`pages:`);
  for (const pg of discovery.pages) {
    lines.push(`  - { path: ${yamlString(pg.path)}, name: ${yamlString(pg.name)} }`);
  }
  lines.push(`prepare:`);
  lines.push(`  animations: true`);
  lines.push(`  scrollPrime: true`);
  lines.push(`  extraDelay: 500`);
  lines.push('');
  return lines.join('\n');
}

// Quote a value if YAML would otherwise parse it as something other than a
// string (`/`, names starting with digits, names containing colons, etc.).
// Conservative — when in doubt, quote. Single quotes prevent escape processing.
function yamlString(value) {
  const s = String(value);
  // Safe identifier (matches the slug shape we emit) — unquoted is fine.
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(s)) return s;
  // Anything else gets single-quoted; double any embedded single quote.
  return `'${s.replace(/'/g, "''")}'`;
}

// Convert a URL path to a kebab-case page name. Examples:
//   /                  → home
//   /about             → about
//   /blog/post-1       → blog-post-1
//   /work/2024/case-a  → work-2024-case-a
//   /pricing/          → pricing  (trailing slashes collapsed)
//   /café              → caf-     (percent-encoded/unicode → allowlist-safe)
//
// The output MUST satisfy config/schema.js#safeNameSchema (`[a-zA-Z0-9._-]+`),
// because the server validates discovered `pages` against the schema BEFORE
// the template resolver's slugify ever runs. Relying on slugify to clean these
// names (as an earlier version did) is wrong: a non-ASCII or percent-encoded
// route (`/café` → pathname `/caf%C3%A9`) fails the schema gate and rejects the
// ENTIRE multi-page run with a 400, not just that page.
//
// Name uniqueness is enforced HERE via the caller's `seenNames` set — two
// different paths can slug to the same name (`/about` + `/about/` → 'about';
// `/a/b` + `/a-b` → 'a-b'). The caller's seenPaths check dedupes on pathname,
// which does NOT catch these, so collisions get a numeric `-2`, `-3` suffix.
function deriveName(path, seenNames) {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  // Slashes → hyphens, then collapse any char outside the safeNameSchema
  // allowlist to a single hyphen and trim stray edge hyphens.
  const base =
    trimmed
      .replace(/\//g, '-')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'home';
  // Dedupe against names already emitted for this sitemap.
  let name = base;
  for (let n = 2; seenNames.has(name); n++) name = `${base}-${n}`;
  seenNames.add(name);
  return name;
}
