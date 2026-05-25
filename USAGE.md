# framershot — Usage

Local CLI for clean, retina-quality screenshots of Framer sites. Tested on `https://deltaventure.framer.website` — produced a 12 MB full-page retina PNG in one command.

## Install

```bash
cd /Users/sannagranqvist/Documents/App/screenshotter
npm install      # already done if node_modules/ exists
```

Requires Node ≥ 20. Playwright Chromium is bundled via the npm dep.

## Two ways to use it

### 1. Browser UI (easy mode)

```bash
node index.js               # opens UI in default browser (default port 5173)
node index.js start         # same thing, explicit
node index.js serve         # start server, don't auto-open
node index.js serve -p 8080 # custom port
```

Paste a Framer URL, hit capture. Good for one-offs.

### 2. CLI with a YAML config (repeatable)

```bash
node index.js capture <config.yaml>
node index.js capture <config.yaml> --only <region-name>
node index.js capture <config.yaml> --smoke   # one viewport-sized shot, fast smoke
```

Output paths are printed one per line to stdout, so you can grep/pipe.

### 3. Watch mode (iterate on a Framer draft)

Re-capture whenever the live URL's HTML hash changes — debounced so a burst
of republishes collapses to one capture. Stays running until you Ctrl+C.

```bash
node index.js watch <config.yaml>
node index.js watch <config.yaml> --poll 3 --debounce 2000   # hash mode, custom timing
node index.js watch <config.yaml> --interval 30              # fixed cadence: every 30s
node index.js watch <config.yaml> --no-initial               # wait for first change
```

- `--poll <seconds>` — hash-poll cadence (default `5`)
- `--debounce <ms>` — quiet window after a change before capturing (default `1500`)
- `--interval <seconds>` — switch to unconditional re-capture every N seconds (skips hash polling)
- `--no-initial` — skip the capture at startup; wait for the first detected change

Stdout still gets one `screenshot written` line per output per capture, so you
can `tail -F` the log or pipe it into another tool while you keep iterating.

## Minimal config

```yaml
name: my-site
baseUrl: https://example.framer.website
output: ./screenshots/{date}/{viewport}/{page}.png
deviceScaleFactor: 2
viewport:
  width: 1440
  height: 900
  name: desktop
page:
  path: /
  name: home
prepare:
  animations: true     # disable animations (Framer-friendly)
  scrollPrime: true    # scroll to bottom to load lazy content
  extraDelay: 500      # ms after scroll prime
  hide:                # CSS selectors to hide before capture
    - 'nav.sticky'
    - '#consent-banner'
```

Output template placeholders: `{date}`, `{viewport}`, `{page}`, `{region}` (the last is required when `regions:` is declared).

## Multi-viewport

Use plural `viewports:` (each `name` must be unique — that's how the `{viewport}` placeholder avoids collisions):

```yaml
viewports:
  - { name: desktop, width: 1440, height: 900 }
  - { name: mobile,  width: 375,  height: 667 }
```

`viewport:` (singular) and `viewports:` (plural) are mutually exclusive — pick one.

## Multi-page

Use plural `pages:` to capture multiple routes in one run. Names must be unique
(that's how `{page}` keeps the output paths distinct) and the output template
MUST contain `{page}` once you declare more than one:

```yaml
pages:
  - { path: /,         name: home }
  - { path: /about,    name: about }
  - { path: /work/foo, name: work-foo }
```

`page:` (singular) and `pages:` (plural) are mutually exclusive — pick one.

A single Chromium launches per viewport; pages are reused as fresh tabs inside
that context, so a 20-page run only pays the browser-launch cost once per
viewport rather than 20×.

## Sitemap discovery (skip the chore of listing pages)

Don't hand-write a 20-page `pages:` block — point `discover` at the site and let
it read `/sitemap.xml`:

```bash
node index.js discover https://example.framer.website                # prints YAML to stdout
node index.js discover https://example.framer.website -o site.yaml   # writes file
node index.js discover https://example.framer.website --max 50       # cap at 50 pages
node index.js discover https://example.framer.website --viewport 1280x800 --name acme
```

The emitted config is immediately runnable:

```bash
node index.js discover https://example.framer.website -o site.yaml
node index.js capture site.yaml
```

Discover handles sitemap-index files (Framer splits very large sites this way)
by recursing one level into child sitemaps, filters to same-origin URLs, and
derives a kebab-case `name` from each path (`/blog/post-1` → `blog-post-1`). If
the sitemap is missing or empty you get a clear error rather than an empty
config.

## Region capture

Capture sub-sections of a page. Two modes:

- **Selector** — single element: `selector: '[data-test="hero"]'`
- **Anchor** — span from one element to another: `from: '...'` + `to: '...'`

```yaml
regions:
  - name: hero
    selector: '[data-test="hero"]'
    padding: 20
  - name: cards
    from: '#cards-start'
    to:   '#cards-end'
    padding: 10
```

When `regions:` is declared, `output` MUST contain `{region}` (validation rejects configs that would overwrite themselves). Per-region capture also produces a full-page shot unless you pass `--only`:

```bash
node index.js capture config.yaml --only hero   # just the hero region
```

`--smoke` and `--only` are mutually exclusive.

## Test it now

```bash
node index.js capture samples/deltaventure.yaml
# → ./screenshots/<today>/desktop/home.png  (~12 MB, 2880×… retina)
```

Other ready-made fixtures in [samples/](samples/):

- [sample.yaml](samples/sample.yaml) — annotated minimal config
- [deltaventure.yaml](samples/deltaventure.yaml) — real Framer site
- [smoke.yaml](samples/smoke.yaml), [smoke-multi.yaml](samples/smoke-multi.yaml), [smoke-regions.yaml](samples/smoke-regions.yaml) — hermetic tests; pair with `node samples/serve-smoke.js &`

## Output

Default location: `./screenshots/{date}/{viewport}/{page}.png` (configurable). Full-page captures by default; viewport `width`×`height` controls layout, `deviceScaleFactor` (1–3) controls pixel density (2 = retina).

## Errors you might hit

- `baseUrl must use http or https` — strip `javascript:`/`file:`/`data:` schemes.
- `page.path must start with /` — write `/` not `home`.
- `template must contain {region} when regions are declared` — add `{region}` to `output`.
- `viewports: duplicate name '<x>'` — viewport names must be unique.
- Selector warnings (e.g. `.does-not-exist not matched`) — printed but non-fatal; the run continues.
