// src/server/ui.js
// Single-page UI served at GET /. Inline HTML/CSS/JS — no build, no external
// requests beyond the Google Fonts stylesheet (gracefully degrades to system
// serif/mono when offline).

export function renderUi({ version = '0.0.0' } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>framershot · capture</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@300..600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:           #0A0A0B;
    --surface:      #101012;
    --surface-2:    #16161A;
    --surface-3:    #1B1B20;
    --fg:           #EDEDED;
    --fg-2:         #A1A1AA;
    --fg-3:         #52525B;
    --rule:         #1F1F22;
    --rule-2:       #2A2A2E;
    --accent:       #F4F4F5;
    --accent-hot:   #FFFFFF;
    --accent-soft:  rgba(244, 244, 245, 0.10);
    --accent-line:  rgba(244, 244, 245, 0.28);
    --ok:           #6FCF97;
    --warn:         #E0B341;
    --err:          #FF6B6B;
    --sans:  'Geist', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
    --mono:  'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html, body {
    margin: 0; padding: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--sans);
    font-size: 13px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  ::selection { background: var(--accent); color: var(--bg); }

  .layout {
    position: relative;
    display: grid;
    grid-template-columns: 380px 1fr 280px;
    grid-template-rows: 1fr auto;
    min-height: 100vh;
  }
  @media (max-width: 1180px) { .layout { grid-template-columns: 380px 1fr; } .right-rail { display: none; } }
  @media (max-width: 780px)  { .layout { grid-template-columns: 1fr; } }

  .panel {
    background: var(--surface);
    border-right: 1px solid var(--rule);
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .panel.right-rail { border-right: 0; border-left: 1px solid var(--rule); }

  /* ── HEAD ───────────────────────────────────────────── */
  .head {
    padding: 18px 22px 16px;
    border-bottom: 1px solid var(--rule);
  }

  .brand-row {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .brand-mark {
    width: 18px;
    height: 18px;
    flex: none;
    display: block;
  }
  .brand-mark .frame {
    fill: none;
    stroke: var(--fg-2);
    stroke-width: 1.75;
    stroke-linecap: square;
  }
  .brand-mark .dot {
    fill: var(--fg-2);
  }

  .wordmark {
    font-family: var(--sans);
    font-size: 13.5px;
    font-weight: 500;
    line-height: 1;
    letter-spacing: -0.005em;
    color: var(--fg);
  }

  .build-tag {
    margin-left: auto;
    font-family: var(--mono);
    font-size: 10.5px;
    color: var(--fg-3);
    font-feature-settings: 'tnum', 'zero';
  }

  /* ── SECTION LABELS ──────────────────────────────────── */
  .section-label {
    display: block;
    font-family: var(--sans);
    font-size: 11.5px;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--fg-3);
    margin: 0 0 12px;
  }

  /* ── FORM ────────────────────────────────────────────── */
  form { padding: 24px 28px 28px; }
  .group {
    padding-bottom: 22px;
    margin-bottom: 22px;
    border-bottom: 1px solid var(--rule);
  }
  .group.no-rule { border-bottom: 0; padding-bottom: 0; margin-bottom: 0; }

  .field { margin-bottom: 14px; }
  .field:last-child { margin-bottom: 0; }

  .field-label {
    display: block;
    font-family: var(--sans);
    font-weight: 500;
    font-size: 11.5px;
    color: var(--fg-2);
    margin-bottom: 6px;
    font-feature-settings: 'tnum';
  }

  input[type=text], input[type=number], select, textarea {
    width: 100%;
    background: transparent;
    color: var(--fg);
    border: 0;
    border-bottom: 1px solid var(--rule-2);
    border-radius: 0;
    padding: 6px 0 7px;
    font-family: var(--mono);
    font-size: 13px;
    font-feature-settings: 'tnum', 'zero', 'ss01';
    transition: border-color 150ms ease-out, color 150ms ease-out, box-shadow 150ms ease-out;
  }
  input:hover:not(:focus), select:hover:not(:focus), textarea:hover:not(:focus) {
    border-bottom-color: var(--fg-3);
  }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-bottom-color: var(--fg-2);
    box-shadow: 0 1px 0 0 var(--fg-2), 0 4px 12px -6px var(--accent-soft);
  }
  input::placeholder, textarea::placeholder {
    color: var(--fg-3);
    font-family: var(--sans);
    font-style: normal;
    font-weight: 400;
    font-size: 13px;
    letter-spacing: 0;
  }

  textarea {
    resize: vertical;
    min-height: 64px;
    line-height: 1.6;
    padding: 8px 0 8px;
  }

  /* Custom select arrow */
  select {
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
    background-image:
      linear-gradient(45deg, transparent 50%, var(--fg-2) 50%),
      linear-gradient(135deg, var(--fg-2) 50%, transparent 50%);
    background-position: calc(100% - 11px) calc(50% - 1px), calc(100% - 6px) calc(50% - 1px);
    background-size: 5px 5px;
    background-repeat: no-repeat;
    padding-right: 22px;
  }
  select option { background: var(--surface-2); color: var(--fg); }
  select optgroup {
    background: var(--surface-2);
    color: var(--fg-3);
    font-style: normal;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  /* Range slider */
  input[type=range].range {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 28px;
    background: transparent;
    border: 0;
    padding: 0;
    margin: 0;
    cursor: pointer;
  }
  input[type=range].range::-webkit-slider-runnable-track {
    height: 2px;
    background: var(--rule-2);
    border-radius: 1px;
  }
  input[type=range].range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -5px;
    background: var(--accent);
    border: 0;
    border-radius: 50%;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
    transition: transform 150ms ease-out;
  }
  input[type=range].range:hover::-webkit-slider-thumb { transform: scale(1.1); }
  input[type=range].range::-moz-range-track { height: 2px; background: var(--rule-2); border: 0; border-radius: 1px; }
  input[type=range].range::-moz-range-thumb {
    width: 12px; height: 12px;
    background: var(--accent); border: 0; border-radius: 50%;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
    transition: transform 150ms ease-out;
  }
  input[type=range].range:hover::-moz-range-thumb { transform: scale(1.1); }

  .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .row-3 { display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 14px; }

  /* Toggle-style checkboxes */
  .check {
    display: flex;
    align-items: center;
    gap: 11px;
    cursor: pointer;
    padding: 5px 0;
    font-family: var(--sans);
    font-size: 13px;
    color: var(--fg);
    user-select: none;
  }
  .check input {
    appearance: none;
    -webkit-appearance: none;
    margin: 0;
    width: 30px;
    height: 16px;
    background: var(--surface-3);
    border: 1px solid var(--rule-2);
    border-radius: 9px;
    position: relative;
    cursor: pointer;
    transition: background 180ms ease-out, border-color 180ms ease-out;
  }
  .check input::after {
    content: '';
    position: absolute;
    top: 1px; left: 1px;
    width: 12px; height: 12px;
    background: var(--fg-3);
    border-radius: 50%;
    transition: transform 180ms ease-out, background 180ms ease-out;
  }
  .check input:checked { background: var(--accent-soft); border-color: var(--accent); }
  .check input:checked::after { transform: translateX(14px); background: var(--accent); }
  .check:hover input:not(:checked) { border-color: var(--fg-3); }

  /* Submit — sticky to viewport bottom so a tall form never buries the CTA.
     Negative horizontal margin extends bg edge-to-edge inside the form, so the
     line and background align with the panel chrome (not the form padding). */
  .submit-row {
    position: sticky;
    bottom: 0;
    margin: 24px -28px 0;
    padding: 16px 28px 22px;
    background: var(--surface);
    border-top: 1px solid var(--rule);
    z-index: 5;
  }
  button.primary {
    width: 100%;
    background: var(--accent);
    color: var(--bg);
    border: 0;
    border-radius: 6px;
    padding: 10px 16px;
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: -0.005em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: background 120ms ease-out, box-shadow 120ms ease-out;
  }
  button.primary .kbd {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 17px;
    height: 17px;
    background: rgba(10, 10, 11, 0.16);
    border-radius: 4px;
    font-family: var(--mono);
    font-weight: 500;
    font-size: 10px;
    color: var(--bg);
  }
  button.primary:hover:not(:disabled) {
    background: var(--accent-hot);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  button.primary:disabled { opacity: 0.42; cursor: not-allowed; }

  .help {
    display: block;
    margin-top: 6px;
    font-family: var(--sans);
    font-style: normal;
    font-weight: 400;
    font-size: 11.5px;
    color: var(--fg-3);
    letter-spacing: 0;
    line-height: 1.5;
  }
  .help code {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--fg-2);
    background: var(--surface-2);
    padding: 1px 5px;
    border-radius: 3px;
  }

  /* ── MAIN ────────────────────────────────────────────── */
  main.preview {
    padding: 30px 40px 40px;
    min-width: 0;
    position: relative;
  }

  .status-head {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 14px;
  }
  .status-head .section-label { flex: 1; margin: 0; }
  .status-head .led-wrap {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--sans);
    font-size: 11px;
    color: var(--fg-3);
  }
  .led {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--fg-3);
    transition: background 200ms ease-out, box-shadow 200ms ease-out;
  }
  .led.running {
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent), 0 0 16px var(--accent-soft);
    animation: pulse 1.1s ease-in-out infinite;
  }
  .led.ok  { background: var(--ok);  box-shadow: 0 0 6px var(--ok); }
  .led.err { background: var(--err); box-shadow: 0 0 6px var(--err); }
  .led.warn { background: var(--warn); box-shadow: 0 0 6px var(--warn); }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

  .bracketed {
    position: relative;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 8px;
  }

  .log-frame {
    padding: 22px 26px;
    min-height: 130px;
    /* Cap the log height so a long run (e.g. a multi-page crawl streaming one
       line per page × viewport) scrolls within the panel instead of pushing the
       preview/gallery far down the page. logLine() keeps the newest line in view. */
    max-height: 340px;
    overflow-y: auto;
    overscroll-behavior: contain;
    font-family: var(--mono);
    font-size: 12px;
  }
  .log-frame::-webkit-scrollbar { width: 8px; }
  .log-frame::-webkit-scrollbar-thumb {
    background: var(--rule-2);
    border-radius: 4px;
  }
  .log-frame::-webkit-scrollbar-thumb:hover { background: var(--fg-3); }

  .log-line {
    display: flex;
    gap: 16px;
    padding: 3px 0;
    color: var(--fg-2);
    font-family: var(--mono);
    font-size: 12px;
    align-items: baseline;
    animation: line-in 280ms cubic-bezier(.2, .7, .2, 1) both;
  }
  @keyframes line-in {
    from { opacity: 0; transform: translateX(-4px); }
    to   { opacity: 1; transform: none; }
  }
  .log-line .ts {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--fg-3);
    letter-spacing: 0.04em;
    font-feature-settings: 'tnum';
    min-width: 60px;
    flex-shrink: 0;
  }
  .log-line .msg { flex: 1; word-break: break-word; }
  .log-line.active { color: var(--fg); }
  .log-line.active .msg::after {
    content: '_';
    margin-left: 3px;
    color: var(--accent);
    animation: blink 0.95s steps(2) infinite;
  }
  @keyframes blink { 50% { opacity: 0; } }
  .log-line.ok   .msg { color: var(--ok); }
  .log-line.warn .msg { color: var(--warn); }
  .log-line.err  .msg { color: var(--err); white-space: pre-wrap; }
  .log-line.idle .msg {
    color: var(--fg-3);
    font-family: var(--sans);
    font-weight: 400;
    font-size: 12.5px;
  }

  /* Frame progress bar with tick marks */
  .frame-bar-wrap {
    margin-top: 16px;
    position: relative;
    height: 2px;
    background: var(--rule);
  }
  .frame-bar-fill {
    position: absolute;
    inset: 0 auto 0 0;
    width: 0%;
    background: var(--accent);
    transition: width 200ms ease-out;
  }
  .frame-bar-ticks {
    position: absolute;
    inset: 0;
    background-image: repeating-linear-gradient(90deg, transparent 0 calc(10% - 1px), var(--bg) calc(10% - 1px) 10%);
    pointer-events: none;
  }

  /* ── PREVIEW (plate) ─────────────────────────────────── */
  .preview-shell { margin-top: 40px; }
  .preview-meta {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 14px;
    gap: 18px;
    flex-wrap: wrap;
  }
  .preview-meta .where {
    flex: 1 1 280px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .preview-meta .label {
    font-family: var(--sans);
    font-size: 11px;
    color: var(--fg-3);
  }
  .preview-meta .path {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--fg-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    border: 0;
    background: transparent;
    padding: 0;
    text-align: left;
    transition: color 150ms ease-out;
    max-width: 100%;
  }
  .preview-meta .path:hover { color: var(--fg); }
  .preview-meta .where .copied {
    color: var(--ok);
    font-style: normal;
    font-weight: 400;
    margin-top: 4px;
    font-family: var(--sans);
    font-size: 11px;
    letter-spacing: 0;
  }
  .preview-meta .actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
    align-items: center;
  }
  .meta-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    color: var(--fg-2);
    border: 1px solid var(--rule-2);
    border-radius: 6px;
    padding: 6px 11px;
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: color 150ms ease-out, border-color 150ms ease-out, background 150ms ease-out, box-shadow 150ms ease-out;
    white-space: nowrap;
  }
  .meta-btn:hover {
    color: var(--fg);
    border-color: var(--fg-3);
    background: rgba(255, 255, 255, 0.03);
  }
  .meta-btn.primary {
    color: var(--bg);
    background: var(--fg);
    border-color: transparent;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.30);
  }
  .meta-btn.primary:hover {
    color: var(--bg);
    background: #FFFFFF;
    border-color: transparent;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.30),
      0 0 0 3px rgba(237, 237, 237, 0.10);
  }
  .meta-btn .arrow {
    font-family: var(--sans);
    font-style: normal;
    font-size: 12px;
    line-height: 1;
    letter-spacing: 0;
  }

  .preview-frame {
    padding: 14px;
    min-height: 280px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .preview-frame img {
    display: block;
    max-width: 100%;
    height: auto;
    background: #fff;
    animation: plate-in 480ms cubic-bezier(.2, .7, .2, 1) both;
  }
  @keyframes plate-in {
    from { opacity: 0; transform: scale(0.97); }
    to   { opacity: 1; transform: none; }
  }
  .preview-frame.empty {
    color: var(--fg-3);
    font-family: var(--sans);
    font-weight: 400;
    font-size: 13px;
  }

  /* ── GALLERY (N>1 outputs) ───────────────────────────── */
  .gallery-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .gallery-actions .summary {
    font-family: var(--sans);
    font-size: 11px;
    color: var(--fg-3);
    font-feature-settings: 'tnum';
  }
  .gallery-actions .summary .count { color: var(--fg-2); }
  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
  }
  .gallery-tile {
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: plate-in 380ms cubic-bezier(.2, .7, .2, 1) both;
  }
  .gallery-tile .tile-img {
    background: #fff;
    aspect-ratio: 4 / 3;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .gallery-tile .tile-img img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
  }
  .gallery-tile .tile-meta {
    padding: 10px 12px 6px;
    border-top: 1px solid var(--rule);
  }
  .gallery-tile .tile-label {
    font-family: var(--sans);
    font-weight: 500;
    font-size: 12px;
    color: var(--fg);
    letter-spacing: -0.005em;
  }
  .gallery-tile .tile-label .tag {
    color: var(--accent);
    margin-left: 6px;
    font-family: var(--mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-weight: 400;
  }
  .gallery-tile .tile-path {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--fg-3);
    margin-top: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gallery-tile .tile-actions {
    display: flex;
    gap: 4px;
    padding: 8px 12px 12px;
  }
  .gallery-tile .tile-actions .meta-btn {
    flex: 1;
    padding: 5px 8px;
    font-size: 11px;
    justify-content: center;
    gap: 4px;
  }

  /* ── RIGHT RAIL ──────────────────────────────────────── */
  .right-rail .rail-head {
    padding: 22px 22px 14px;
    border-bottom: 1px solid var(--rule);
  }
  .right-rail h2 {
    margin: 0;
    font-family: var(--sans);
    font-weight: 500;
    font-size: 12px;
    letter-spacing: -0.005em;
    color: var(--fg-2);
  }
  .right-rail h2 .count {
    color: var(--fg-3);
    margin-left: 8px;
    font-family: var(--mono);
    font-feature-settings: 'tnum';
  }
  .runs {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
    overflow-y: auto;
  }
  .runs li {
    padding: 14px 22px;
    cursor: pointer;
    border-bottom: 1px solid var(--rule);
    transition: background 150ms ease-out, padding-left 180ms ease-out;
    position: relative;
  }
  .runs li:hover {
    background: var(--surface-2);
    padding-left: 26px;
  }
  .runs li:hover .recall-glyph { opacity: 1; transform: translateX(0); }
  .recall-glyph {
    position: absolute;
    right: 22px;
    top: 16px;
    color: var(--fg-3);
    font-family: var(--sans);
    font-style: normal;
    font-weight: 500;
    font-size: 18px;
    line-height: 1;
    opacity: 0;
    transform: translateX(-4px);
    transition: opacity 180ms ease-out, transform 180ms ease-out, color 180ms ease-out;
    pointer-events: none;
  }
  .runs li:hover .recall-glyph { color: var(--fg-2); }
  .runs li .idx {
    font-family: var(--mono);
    font-size: 9px;
    color: var(--fg-3);
    font-feature-settings: 'tnum';
    letter-spacing: 0.12em;
    display: block;
    margin-bottom: 4px;
  }
  .runs li .name {
    font-family: var(--sans);
    font-weight: 500;
    font-size: 13.5px;
    color: var(--fg);
    line-height: 1.25;
    margin-bottom: 4px;
    letter-spacing: -0.005em;
  }
  .runs li .name em { font-style: normal; color: var(--accent); }
  .runs li .meta {
    display: block;
    color: var(--fg-2);
    font-family: var(--mono);
    font-size: 10.5px;
    line-height: 1.5;
    word-break: break-all;
    font-feature-settings: 'tnum';
  }
  .runs li .meta .dot { color: var(--fg-3); margin: 0 6px; }
  .runs li.empty {
    color: var(--fg-3);
    cursor: default;
    font-family: var(--sans);
    font-weight: 400;
    font-size: 12px;
    padding: 18px 22px;
    border: 0;
    line-height: 1.5;
  }
  .runs li.empty:hover { background: transparent; padding-left: 22px; }

  .rail-foot {
    padding: 14px 22px 22px;
    border-top: 1px solid var(--rule);
  }
  button.ghost {
    background: transparent;
    color: var(--fg-2);
    border: 1px solid var(--rule-2);
    border-radius: 6px;
    padding: 6px 11px;
    font-family: var(--sans);
    font-weight: 500;
    font-size: 12px;
    cursor: pointer;
    width: 100%;
    transition: color 150ms ease-out, border-color 150ms ease-out, background 150ms ease-out;
  }
  button.ghost:hover {
    color: var(--fg);
    border-color: var(--fg-3);
    background: rgba(255, 255, 255, 0.03);
  }

  /* ── ENTRANCE STAGGER ────────────────────────────────── */
  @keyframes enter {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: none; }
  }
  .head, .group, .submit-row, .preview > * {
    animation: enter 700ms cubic-bezier(.2, .65, .2, 1) both;
  }
  .head { animation-delay: 60ms; }
  .group:nth-of-type(1) { animation-delay: 140ms; }
  .group:nth-of-type(2) { animation-delay: 200ms; }
  .group:nth-of-type(3) { animation-delay: 260ms; }
  .group:nth-of-type(4) { animation-delay: 320ms; }
  .submit-row           { animation-delay: 380ms; }
  .preview > *:nth-child(1) { animation-delay: 200ms; }
  .preview > *:nth-child(2) { animation-delay: 320ms; }

  /* ── VIEWPORT CHIPS ─────────────────────────────────── */
  .vp-chips {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px 8px;
  }
  .vp-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 11px;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: var(--surface-2);
    cursor: pointer;
    font-family: var(--sans);
    font-size: 12.5px;
    color: var(--fg-2);
    transition: color 150ms ease-out, border-color 150ms ease-out, background 150ms ease-out;
    user-select: none;
  }
  .vp-chip:hover { color: var(--fg); border-color: var(--rule-2); }
  .vp-chip input {
    appearance: none;
    -webkit-appearance: none;
    width: 12px; height: 12px;
    border: 1px solid var(--rule-2);
    border-radius: 2px;
    background: transparent;
    margin: 0;
    cursor: pointer;
    position: relative;
    flex: none;
  }
  .vp-chip input:checked {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .vp-chip input:checked::after {
    content: '';
    position: absolute;
    top: 1px; left: 4px;
    width: 3px; height: 6px;
    border: solid var(--accent);
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
  }
  .vp-chip:has(input:checked) {
    color: var(--fg);
    border-color: var(--accent-line);
    background: var(--accent-soft);
  }
  .vp-chip-meta {
    margin-left: auto;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--fg-3);
    letter-spacing: 0.04em;
  }
  .vp-chip:has(input:checked) .vp-chip-meta { color: var(--fg-2); }
  .vp-section-label {
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 500;
    color: var(--fg-3);
    margin: 14px 0 7px;
  }
  .vp-section-label:first-child { margin-top: 0; }

  /* Concurrency control — slider + numeric badge */
  .concurrency-row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 14px;
  }
  .concurrency-badge {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--fg);
    background: var(--surface-3);
    border: 1px solid var(--rule-2);
    border-radius: 6px;
    padding: 3px 9px;
    min-width: 28px;
    text-align: center;
  }

  /* Density pills — discrete 1×/2×/3× segmented control */
  .seg-pills {
    display: inline-flex;
    background: var(--surface-2);
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
  }
  .seg-pill {
    background: transparent;
    color: var(--fg-2);
    border: 0;
    border-radius: 4px;
    padding: 5px 14px;
    font-family: var(--mono);
    font-size: 12px;
    cursor: pointer;
    transition: color 150ms ease-out, background 150ms ease-out;
    font-feature-settings: 'tnum';
  }
  .seg-pill:hover { color: var(--fg); }
  .seg-pill.is-active {
    background: var(--accent-soft);
    color: var(--fg);
    box-shadow: inset 0 0 0 1px var(--accent-line);
  }

  /* Behavior toggles that sit alongside the chip groups — wider, full-width
     rows that don't masquerade as selection chips. Distinguished by dashed
     border so it reads as "action" not "option in a set". */
  .vp-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
    padding: 8px 11px;
    border: 1px dashed var(--rule-2);
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    font-family: var(--sans);
    font-size: 12.5px;
    color: var(--fg-2);
    user-select: none;
    transition: color 150ms ease-out, border-color 150ms ease-out, background 150ms ease-out;
  }
  .vp-toggle:hover:not(.is-disabled) { color: var(--fg); border-color: var(--fg-3); }
  .vp-toggle.is-disabled { opacity: 0.4; cursor: not-allowed; }
  .vp-toggle input {
    appearance: none;
    -webkit-appearance: none;
    width: 12px; height: 12px;
    border: 1px solid var(--rule-2);
    border-radius: 2px;
    background: transparent;
    margin: 0;
    cursor: inherit;
    position: relative;
    flex: none;
  }
  .vp-toggle input:checked { background: var(--accent-soft); border-color: var(--accent); }
  .vp-toggle input:checked::after {
    content: '';
    position: absolute;
    top: 1px; left: 4px;
    width: 3px; height: 6px;
    border: solid var(--accent);
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
  }
  .vp-toggle:has(input:checked):not(.is-disabled) {
    color: var(--fg);
    border-color: var(--accent-line);
    border-style: solid;
    background: var(--accent-soft);
  }

  /* Section sub-label hint — sits inline with vp-section-label */
  .vp-section-hint {
    margin-left: 8px;
    color: var(--fg-3);
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 400;
  }

  /* Pin offset block — only meaningful when at least one ratio chip is checked.
     The block is hidden until then via [hidden]. Slider follows the "irrelevant
     given current settings" pattern (.is-dim) when no chips are checked. */
  .pin-offset-block { margin-top: 14px; }
  .pin-offset-label-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .pin-offset-label-row .field-label { margin: 0; }
  .pin-offset-label-row .pin-offset-val {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--fg-2);
    font-feature-settings: 'tnum';
  }

  /* Per-ratio preview row — small page silhouettes, one per checked ratio.
     Backdrop is either a stylized gradient (no recent capture) or the most
     recent full-page screenshot. The pin window overlay slides with the
     offset slider and is sized to the chip's ratio over an assumed (or
     measured, when a backdrop is available) page aspect. */
  .pin-preview-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 10px;
  }
  .pin-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .pin-preview-silhouette {
    position: relative;
    width: 56px;
    /* Default 1:3.2 page aspect — overridden inline when a real capture's
       dimensions become known so the silhouette matches the actual page. */
    aspect-ratio: 1 / 3.2;
    background:
      linear-gradient(180deg,
        rgba(244, 244, 245, 0.06) 0%,
        rgba(244, 244, 245, 0.03) 30%,
        rgba(244, 244, 245, 0.08) 60%,
        rgba(244, 244, 245, 0.02) 100%);
    border: 1px solid var(--rule-2);
    border-radius: 3px;
    overflow: hidden;
  }
  .pin-preview-silhouette.has-bg {
    background-size: cover;
    background-position: top center;
    background-repeat: no-repeat;
  }
  .pin-preview-window {
    position: absolute;
    left: -1px;
    right: -1px;
    background: var(--accent-soft);
    border-top: 1px solid var(--accent);
    border-bottom: 1px solid var(--accent);
    transition: top 120ms ease-out, height 120ms ease-out;
    pointer-events: none;
  }
  .pin-preview-label {
    font-family: var(--mono);
    font-size: 9px;
    color: var(--fg-3);
    letter-spacing: 0.06em;
    font-feature-settings: 'tnum';
  }

  /* Capture-position controls — chips + custom % / px row + Preview button.
     The chips share the same .seg-pills styling as the density pills; the
     Custom block reveals the existing slider plus an absolute-pixel input
     wired two-way to it via JS. */
  .preview-pick-btn {
    margin-top: 10px;
    padding: 7px 12px;
    font: inherit;
    font-size: 11px;
    background: var(--bg-2);
    color: var(--fg);
    border: 1px solid var(--rule-2);
    border-radius: 4px;
    cursor: pointer;
    transition: background 90ms ease, border-color 90ms ease;
  }
  .preview-pick-btn:hover:not(:disabled) {
    background: var(--bg-3);
    border-color: var(--fg-3);
  }
  .preview-pick-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .crawl-hint {
    display: block;
    margin-top: 6px;
    font-size: 10.5px;
    color: var(--fg-3);
  }
  .crawl-panel {
    margin-top: 10px;
    border: 1px solid var(--rule-2);
    border-radius: 5px;
    background: var(--bg-2);
    overflow: hidden;
  }
  .crawl-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-bottom: 1px solid var(--rule-2);
  }
  .crawl-all {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    cursor: pointer;
  }
  .crawl-clear {
    font: inherit;
    font-size: 10.5px;
    background: none;
    border: none;
    color: var(--fg-3);
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }
  .crawl-clear:hover { color: var(--fg); }
  .crawl-list {
    max-height: 280px;
    overflow-y: auto;
  }
  /* Capture Queue (Option A) — the crawl-head now hosts a progress readout
     instead of a select-all checkbox; the list below is a status worklist,
     one row per discovered page, advanced one at a time. */
  .queue-head-info {
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex: 1;
    margin-right: 12px;
    min-width: 0;
  }
  .queue-head-label {
    font-size: 11px;
    color: var(--fg-2);
    font-feature-settings: 'tnum';
  }
  .queue-progress {
    height: 3px;
    background: var(--rule-2);
    border-radius: 2px;
    overflow: hidden;
  }
  .queue-progress-fill {
    height: 100%;
    width: 0%;
    background: var(--accent);
    transition: width 0.25s ease;
  }
  .queue-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    font-size: 11px;
    border-top: 1px solid var(--rule-2);
    cursor: pointer;
  }
  .queue-row:first-child { border-top: none; }
  .queue-row:hover { background: var(--surface-2); }
  .queue-row.is-active { background: var(--accent-soft); }
  .queue-glyph {
    flex: none;
    width: 13px;
    text-align: center;
    font-family: var(--mono);
    color: var(--fg-3);
  }
  .queue-row.status-done .queue-glyph { color: var(--ok); }
  .queue-row.status-failed .queue-glyph { color: var(--warn); }
  .queue-row.is-active .queue-glyph { color: var(--accent); }
  .queue-path {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--fg-2);
    min-width: 0;
  }
  .queue-row.is-active .queue-path { color: var(--fg); }
  .queue-slug {
    flex: none;
    color: var(--fg-3);
    font-size: 10px;
    max-width: 90px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .queue-meta {
    flex: none;
    color: var(--fg-3);
    font-size: 10px;
    font-feature-settings: 'tnum';
  }
  .queue-thumb {
    flex: none;
    width: 30px;
    height: 30px;
    object-fit: cover;
    object-position: top;
    border-radius: 3px;
    border: 1px solid var(--rule-2);
    background: var(--surface-2);
  }
  .pin-custom-block { margin-top: 12px; }
  .pin-custom-row {
    display: grid;
    grid-template-columns: 1fr 110px;
    gap: 14px;
    align-items: end;
  }
  .pin-custom-field { display: flex; flex-direction: column; gap: 6px; }
  .pin-custom-field .field-label { margin: 0; }
  .pin-custom-input-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .pin-custom-input-row .range { flex: 1; }
  .pin-custom-val {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--fg-2);
    font-feature-settings: 'tnum';
    min-width: 36px;
    text-align: right;
  }
  .pin-custom-px {
    font: inherit;
    font-family: var(--mono);
    font-size: 12px;
    padding: 6px 8px;
    background: var(--bg-2);
    color: var(--fg);
    border: 1px solid var(--rule-2);
    border-radius: 4px;
    width: 100%;
    box-sizing: border-box;
  }
  .pin-custom-px:focus {
    outline: none;
    border-color: var(--accent);
  }

  /* Preview modal — fullscreen overlay with the captured preview PNG on the
     left and the position controls on the right. The overlay rectangle is
     draggable; client-side math maps image-px ↔ CSS-px because the preview
     is captured at DSR=1. */
  .preview-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.78);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 24px;
  }
  .preview-modal-backdrop[hidden] { display: none; }
  .preview-modal {
    background: var(--bg);
    border: 1px solid var(--rule-2);
    border-radius: 6px;
    width: min(900px, 100%);
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .preview-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--rule);
  }
  .preview-modal-title {
    font-size: 13px;
    color: var(--fg);
    font-weight: 500;
  }
  .preview-modal-close {
    background: transparent;
    border: none;
    color: var(--fg-2);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
    padding: 0 6px;
  }
  .preview-modal-close:hover { color: var(--fg); }
  .preview-modal-body {
    display: grid;
    grid-template-columns: 1fr 240px;
    gap: 18px;
    padding: 18px;
    flex: 1;
    min-height: 0;
  }
  .preview-stage {
    position: relative;
    background: var(--bg-2);
    border: 1px solid var(--rule);
    border-radius: 4px;
    overflow: auto;
    max-height: 70vh;
    min-height: 280px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }
  .preview-stage-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-3);
    font-size: 12px;
    padding: 40px 20px;
    text-align: center;
  }
  .preview-stage-frame {
    position: relative;
    display: inline-block;
  }
  .preview-stage-img {
    display: block;
    max-width: 100%;
    height: auto;
  }
  .preview-overlay {
    position: absolute;
    left: 0;
    right: 0;
    background: rgba(255, 228, 92, 0.18);
    border-top: 2px solid var(--accent);
    border-bottom: 2px solid var(--accent);
    cursor: grab;
    user-select: none;
  }
  .preview-overlay.is-dragging { cursor: grabbing; }
  .preview-overlay-tag {
    position: absolute;
    top: 4px;
    left: 6px;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--bg);
    background: var(--accent);
    padding: 2px 6px;
    border-radius: 3px;
    pointer-events: none;
  }
  .preview-controls {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .preview-controls .seg-pills { width: 100%; }
  .preview-controls .seg-pill { flex: 1; }
  .preview-readout {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    background: var(--bg-2);
    border: 1px solid var(--rule);
    border-radius: 4px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--fg-2);
    font-feature-settings: 'tnum';
  }
  .preview-readout-row {
    display: flex;
    justify-content: space-between;
  }
  .preview-readout-row strong {
    color: var(--fg);
    font-weight: 500;
  }
  .preview-modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 18px;
    border-top: 1px solid var(--rule);
  }
  .preview-btn {
    padding: 7px 14px;
    font: inherit;
    font-size: 12px;
    background: var(--bg-2);
    color: var(--fg);
    border: 1px solid var(--rule-2);
    border-radius: 4px;
    cursor: pointer;
  }
  .preview-btn:hover { background: var(--bg-3); }
  .preview-btn.is-primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }
  .preview-btn.is-primary:hover { filter: brightness(1.05); }
  .preview-error {
    color: #ff6b6b;
    font-size: 12px;
    padding: 12px;
    background: rgba(255, 107, 107, 0.08);
    border: 1px solid rgba(255, 107, 107, 0.3);
    border-radius: 4px;
    text-align: center;
  }
  .preview-spinner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    color: var(--fg-3);
    font-size: 12px;
  }
  .preview-spinner::before {
    content: '';
    width: 22px;
    height: 22px;
    border: 2px solid var(--rule-2);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: preview-spin 0.7s linear infinite;
  }
  @keyframes preview-spin {
    to { transform: rotate(360deg); }
  }

  /* Inline button spinner — a small ring that inherits the button's text color
     via currentColor, so it reads correctly on both light (.primary) and dark
     (ghost/pick) buttons. Hidden via [hidden]; the right margin only applies
     while visible since [hidden] collapses to display:none. */
  .btn-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    margin-right: 8px;
    border: 1.5px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    opacity: 0.85;
    vertical-align: -2px;
    animation: preview-spin 0.6s linear infinite;
  }

  /* Backdrop — color swatch + hex text input sit on one line. The native
     color picker is a small clickable square; the hex field shows the value
     and accepts manual entry. They stay in sync via JS. */
  .backdrop-color-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .backdrop-color-row input[type=color] {
    -webkit-appearance: none;
    appearance: none;
    width: 28px;
    height: 28px;
    border: 1px solid var(--rule-2);
    border-radius: 6px;
    padding: 0;
    background: transparent;
    cursor: pointer;
    flex: none;
  }
  .backdrop-color-row input[type=color]::-webkit-color-swatch-wrapper { padding: 2px; }
  .backdrop-color-row input[type=color]::-webkit-color-swatch { border: 0; border-radius: 4px; }
  .backdrop-color-row input[type=color]::-moz-color-swatch { border: 0; border-radius: 4px; }
  .backdrop-color-row input[type=text] {
    flex: 1;
    min-width: 0;
  }
  .backdrop-swatches {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .backdrop-swatch {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: 1px solid var(--rule-2);
    cursor: pointer;
    padding: 0;
    transition: transform 120ms ease-out, border-color 120ms ease-out;
  }
  .backdrop-swatch:hover { transform: scale(1.1); border-color: var(--fg-3); }
  .backdrop-swatch.is-active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }

  /* Format/quality row — like row-2 but collapses to a single column when
     quality is hidden (PNG), so the Format select isn't orphaned. */
  .format-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }
  .format-row.is-single { grid-template-columns: 1fr; }

  /* Generic "this field is irrelevant given current settings" treatment */
  .is-dim {
    opacity: 0.4;
    pointer-events: none;
  }

  /* Tasteful scrollbar in the runs rail */
  .runs::-webkit-scrollbar { width: 8px; }
  .runs::-webkit-scrollbar-track { background: transparent; }
  .runs::-webkit-scrollbar-thumb { background: var(--rule-2); border: 2px solid transparent; background-clip: padding-box; border-radius: 0; }
  .runs::-webkit-scrollbar-thumb:hover { background: var(--fg-3); background-clip: padding-box; }

  /* ── STATUS BAR ──────────────────────────────────────── */
  .status-bar {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 26px;
    padding: 0 18px;
    background: var(--surface);
    border-top: 1px solid var(--rule);
    font-family: var(--mono);
    font-size: 10px;
    color: var(--fg-3);
    letter-spacing: 0.04em;
    font-feature-settings: 'tnum', 'zero';
    user-select: none;
    position: relative;
    z-index: 2;
  }
  .status-bar::before {
    content: '';
    position: absolute;
    inset: 0 0 auto 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.04), transparent);
    pointer-events: none;
  }
  .status-bar .seg {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .status-bar .sep { color: var(--rule-2); }
  .status-bar .key { color: var(--fg-2); }
  .status-bar .accent { color: var(--accent); }
  .status-bar .branch {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--fg-2);
  }
  .status-bar .branch-glyph {
    color: var(--fg-3);
    font-family: var(--mono);
  }
  .status-bar .dot-led {
    display: inline-block;
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--fg-3);
    transition: background 200ms ease-out, box-shadow 200ms ease-out;
  }
  .status-bar .dot-led.running { background: var(--accent); box-shadow: 0 0 5px var(--accent); }
  .status-bar .dot-led.ok { background: var(--ok); box-shadow: 0 0 5px var(--ok); }
  .status-bar .dot-led.err { background: var(--err); box-shadow: 0 0 5px var(--err); }
  .status-bar .dot-led.warn { background: var(--warn); box-shadow: 0 0 5px var(--warn); }
  .status-bar .clock {
    color: var(--fg-2);
    font-feature-settings: 'tnum';
  }
  @media (max-width: 600px) {
    .status-bar .seg.middle { display: none; }
  }

</style>
</head>
<body>
<div class="layout">

  <!-- ── LEFT PANEL ── -->
  <aside class="panel">
    <div class="head">
      <div class="brand-row">
        <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
          <path class="frame" d="M3 8V3H8 M16 3H21V8 M21 16V21H16 M8 21H3V16"/>
          <rect class="dot" x="10.5" y="10.5" width="3" height="3"/>
        </svg>
        <div class="wordmark">framershot</div>
        <div class="build-tag">v${version}</div>
      </div>
    </div>

    <form id="capture-form" autocomplete="off" spellcheck="false">

      <div class="group">
        <div class="section-label">Source</div>
        <div class="field">
          <label class="field-label" for="baseUrl">Base URL</label>
          <input id="baseUrl" type="text" placeholder="https://framer.site" required>
        </div>
        <div class="field">
          <div class="row-2">
            <div>
              <label class="field-label" for="pagePath">Path</label>
              <input id="pagePath" type="text" value="/" required>
            </div>
            <div>
              <label class="field-label" for="pageName">Slug</label>
              <input id="pageName" type="text" value="home" required>
            </div>
          </div>
        </div>
        <div class="field">
          <button type="button" class="preview-pick-btn" id="crawlBtn">Find all pages…</button>
          <span class="crawl-hint" id="crawlHint">Reads the site's sitemap.xml into a queue · capture one page at a time</span>
          <div class="crawl-panel" id="crawlPanel" hidden>
            <div class="crawl-head">
              <div class="queue-head-info">
                <span class="queue-head-label" id="crawlCount">Queue · 0 of 0 captured</span>
                <div class="queue-progress"><div class="queue-progress-fill" id="queueProgressFill"></div></div>
              </div>
              <button type="button" class="crawl-clear" id="crawlClear">Use single page</button>
            </div>
            <div class="crawl-list" id="crawlList"></div>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="section-label">Render</div>
        <div class="field">
          <div class="vp-section-label">Device</div>
          <!-- Populated from PRESETS at boot so chip dimensions stay in sync
               with the JS object that submits them. Do NOT hand-author chips
               here — see renderDeviceChips() in the script tag below. -->
          <div class="vp-chips" id="vpDevice"></div>
          <div class="vp-section-label">Pinterest <span class="vp-section-hint">each ratio captured at every selected device width</span></div>
          <div class="vp-chips" id="vpPin">
            <label class="vp-chip"><input type="checkbox" data-ratio="1.5"   data-slug="2x3"><span>Standard pin</span><span class="vp-chip-meta">2:3</span></label>
            <label class="vp-chip"><input type="checkbox" data-ratio="1.0"   data-slug="1x1"><span>Square pin</span><span class="vp-chip-meta">1:1</span></label>
            <label class="vp-chip"><input type="checkbox" data-ratio="2.1"   data-slug="1x2-1"><span>Long pin</span><span class="vp-chip-meta">1:2.1</span></label>
            <label class="vp-chip"><input type="checkbox" data-ratio="1.778" data-slug="9x16"><span>Idea / video</span><span class="vp-chip-meta">9:16</span></label>
            <label class="vp-chip"><input type="checkbox" data-mode="viewport" data-slug="view"><span>Single viewport</span><span class="vp-chip-meta">1×</span></label>
          </div>
          <label class="vp-toggle" id="pinsOnlyChip"><input type="checkbox" id="pinsOnlyToggle" disabled><span>Pins only · skip full-page for these devices</span></label>
          <div class="pin-offset-block" id="pinOffsetBlock">
            <div class="pin-offset-label-row">
              <label class="field-label">Start position</label>
              <span class="pin-offset-val" id="positionReadout">Top</span>
            </div>
            <div class="seg-pills" id="positionPills" role="radiogroup" aria-label="Capture start position">
              <button type="button" class="seg-pill is-active" data-pos="top" role="radio" aria-checked="true">Top</button>
              <button type="button" class="seg-pill" data-pos="middle" role="radio" aria-checked="false">Middle</button>
              <button type="button" class="seg-pill" data-pos="bottom" role="radio" aria-checked="false">Bottom</button>
              <button type="button" class="seg-pill" data-pos="custom" role="radio" aria-checked="false">Custom</button>
            </div>
            <button type="button" class="preview-pick-btn" id="previewPickBtn" disabled title="Add a URL to preview the page">Preview &amp; pick…</button>
            <div class="pin-custom-block" id="pinCustomBlock" hidden>
              <div class="pin-custom-row">
                <div class="pin-custom-field">
                  <label class="field-label" for="pinOffset">Percent</label>
                  <div class="pin-custom-input-row">
                    <input id="pinOffset" type="range" min="0" max="100" value="0" class="range">
                    <span class="pin-custom-val"><span id="pinOffsetValue">0</span>%</span>
                  </div>
                </div>
                <div class="pin-custom-field">
                  <label class="field-label" for="pinOffsetPx">Pixels</label>
                  <input id="pinOffsetPx" type="number" min="0" step="1" placeholder="0" class="pin-custom-px">
                </div>
              </div>
              <span class="help">% slides within available room · px is absolute Y from the top · they stay in sync</span>
            </div>
            <div class="pin-preview-row" id="pinPreviewRow"></div>
          </div>
          <div class="vp-section-label">Custom</div>
          <label class="vp-toggle"><input type="checkbox" id="customViewportToggle"><span>Add a custom viewport</span></label>
        </div>
        <div class="field" id="customViewport" hidden>
          <div class="row-3">
            <div><label class="field-label" for="vpName">Name</label><input id="vpName" type="text" value="custom"></div>
            <div><label class="field-label" for="vpWidth">Width</label><input id="vpWidth" type="number" min="1" value="1440"></div>
            <div><label class="field-label" for="vpHeight">Height</label><input id="vpHeight" type="number" min="1" value="900"></div>
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="concurrency">Concurrency</label>
          <div class="concurrency-row">
            <input id="concurrency" type="range" min="1" max="8" value="2" class="range">
            <div class="concurrency-badge"><span id="concurrencyValue">2</span>×</div>
          </div>
          <span class="help">browsers in parallel · capped to viewport count · each ≈ 400 MB</span>
        </div>
        <div class="field">
          <label class="field-label">Density</label>
          <div class="seg-pills" id="dsrPills" role="radiogroup" aria-label="Pixel density">
            <button type="button" class="seg-pill" data-dsr="1" role="radio" aria-checked="false">1×</button>
            <button type="button" class="seg-pill is-active" data-dsr="2" role="radio" aria-checked="true">2×</button>
            <button type="button" class="seg-pill" data-dsr="3" role="radio" aria-checked="false">3×</button>
          </div>
          <span class="help">retina = 2× · 3× doubles file size with little visible gain</span>
        </div>
        <div class="field">
          <div class="format-row" id="formatRow">
            <div>
              <label class="field-label" for="format">Format</label>
              <select id="format">
                <option value="png">PNG · lossless</option>
                <option value="webp">WebP · 10× smaller</option>
                <option value="jpeg" selected>JPEG · universal</option>
              </select>
            </div>
            <div id="qualityField">
              <label class="field-label" for="quality">Quality · <span id="qualityValue">85</span></label>
              <input id="quality" type="range" min="1" max="100" value="85" class="range">
            </div>
          </div>
          <span class="help">retina PNGs are 10–15 MB · JPEG @ 85 ≈ 10× smaller, universally supported · WebP for max compression</span>
        </div>
      </div>

      <div class="group">
        <div class="section-label">Backdrop</div>
        <label class="vp-toggle"><input type="checkbox" id="backdropToggle"><span>Frame with colored background</span></label>
        <div id="backdropOptions" hidden>
          <div class="field" style="margin-top: 14px;">
            <label class="field-label" for="backdropColorHex">Color</label>
            <div class="backdrop-color-row">
              <input type="color" id="backdropColor" value="#FFE45C">
              <input type="text" id="backdropColorHex" value="#FFE45C" maxlength="7" spellcheck="false">
            </div>
            <div class="backdrop-swatches" id="backdropSwatches">
              <button type="button" class="backdrop-swatch" data-color="#FFE45C" style="background:#FFE45C" title="Yellow"></button>
              <button type="button" class="backdrop-swatch" data-color="#F4F0E8" style="background:#F4F0E8" title="Cream"></button>
              <button type="button" class="backdrop-swatch" data-color="#E8E4DD" style="background:#E8E4DD" title="Stone"></button>
              <button type="button" class="backdrop-swatch" data-color="#171513" style="background:#171513" title="Ink"></button>
              <button type="button" class="backdrop-swatch" data-color="#FF6B5C" style="background:#FF6B5C" title="Coral"></button>
              <button type="button" class="backdrop-swatch" data-color="#6FCF97" style="background:#6FCF97" title="Mint"></button>
              <button type="button" class="backdrop-swatch" data-color="#7AA2F7" style="background:#7AA2F7" title="Sky"></button>
              <button type="button" class="backdrop-swatch" data-color="#FFFFFF" style="background:#FFFFFF" title="White"></button>
            </div>
          </div>
          <div class="field">
            <div class="row-2">
              <div>
                <label class="field-label" for="backdropPadding">Padding · px</label>
                <input id="backdropPadding" type="number" min="0" max="400" value="48">
              </div>
              <div>
                <label class="field-label" for="backdropRadius">Inner radius · px</label>
                <input id="backdropRadius" type="number" min="0" max="200" value="12">
              </div>
            </div>
            <span class="help">padding wraps the screenshot · radius rounds the inner corners (filled with backdrop color)</span>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="section-label">Prepare</div>
        <div class="field">
          <label class="field-label" for="hide">Hide selectors</label>
          <textarea id="hide" placeholder="nav.sticky&#10;#cookie-banner&#10;.intercom-widget"></textarea>
          <span class="help">one css selector per line</span>
        </div>
        <div class="field">
          <label class="check"><input type="checkbox" id="animations" checked> <span>Disable Framer animations</span></label>
          <label class="check"><input type="checkbox" id="scrollPrime" checked> <span>Scroll prime · lazy load</span></label>
          <label class="check"><input type="checkbox" id="hideSticky" checked> <span>Hide sticky nav after frame 0</span></label>
          <label class="check"><input type="checkbox" id="hideFramerBadge" checked> <span>Hide "Made in Framer" badge</span></label>
        </div>
        <div class="field">
          <div class="row-2">
            <div>
              <label class="field-label" for="extraDelay">Settle delay · ms</label>
              <input id="extraDelay" type="number" min="0" step="50" value="0">
            </div>
            <div id="frameDelayWrap">
              <label class="field-label" for="frameDelay">Per-frame · ms</label>
              <input id="frameDelay" type="number" min="0" step="50" value="0">
            </div>
          </div>
          <span class="help">settle = once before capture · per-frame = each scroll step (full-page only)</span>
        </div>
      </div>

      <div class="submit-row">
        <button type="submit" class="primary" id="submit-btn"><span class="btn-spinner" id="submit-spinner" hidden></span><span id="submit-label">Capture</span><span class="kbd">↵</span></button>
      </div>
    </form>
  </aside>

  <!-- ── MAIN ── -->
  <main class="preview">

    <div class="log-shell">
      <div class="status-head">
        <div class="section-label">Log</div>
        <span class="led-wrap"><span class="led" id="led"></span><span id="led-text">idle</span></span>
      </div>
      <div class="bracketed log-frame" id="status">
        <div class="log-line idle"><span class="ts">--:--:--</span><span class="msg">Idle</span></div>
      </div>
    </div>

    <div class="preview-shell">
      <div class="section-label">Preview</div>
      <div class="preview-meta" id="result-meta" hidden>
        <div class="where">
          <span class="label">Path · click to copy</span>
          <button class="path" id="result-path" type="button" title="copy full path"></button>
        </div>
        <div class="actions">
          <a class="meta-btn primary" id="result-download" download><span class="arrow">↓</span> Download</a>
          <button class="meta-btn" id="result-reveal" type="button">Reveal</button>
          <a class="meta-btn" id="result-open" target="_blank" rel="noopener">Open <span class="arrow">↗</span></a>
        </div>
      </div>
      <div class="bracketed preview-frame empty" id="result">No capture yet</div>
      <div id="gallery-actions" class="gallery-actions" hidden>
        <div class="summary"><span class="count" id="gallery-count">0</span> files</div>
        <button class="meta-btn primary" id="download-all" type="button"><span class="arrow">↓</span> Download all</button>
      </div>
      <div id="result-gallery" class="gallery-grid" hidden></div>
    </div>

  </main>

  <!-- ── RIGHT RAIL ── -->
  <aside class="panel right-rail">
    <div class="rail-head">
      <h2>Recent<span class="count" id="rail-count"></span></h2>
    </div>
    <ul id="runs" class="runs"><li class="empty">No runs yet</li></ul>
    <div class="rail-foot">
      <button class="ghost" id="clear-runs" type="button">Clear</button>
    </div>
  </aside>

  <!-- ── STATUS BAR ── -->
  <footer class="status-bar" role="contentinfo">
    <div class="seg">
      <span class="branch"><span class="branch-glyph">⎇</span><span>main</span></span>
      <span class="sep">·</span>
      <span>screenshots/</span>
    </div>
    <div class="seg middle">
      <span class="dot-led" id="status-bar-led"></span>
      <span id="status-bar-text">idle</span>
    </div>
    <div class="seg">
      <span class="key">framershot</span>
      <span class="accent">v${version}</span>
      <span class="sep">·</span>
      <span class="clock" id="status-bar-clock">--:--</span>
    </div>
  </footer>

  <!-- ── PREVIEW MODAL ── -->
  <div class="preview-modal-backdrop" id="previewModal" hidden role="dialog" aria-modal="true" aria-labelledby="previewModalTitle">
    <div class="preview-modal">
      <div class="preview-modal-header">
        <span class="preview-modal-title" id="previewModalTitle">Pick capture position</span>
        <button type="button" class="preview-modal-close" id="previewModalClose" aria-label="Close">×</button>
      </div>
      <div class="preview-modal-body">
        <div class="preview-stage" id="previewStage">
          <div class="preview-spinner" id="previewSpinner">Capturing preview…</div>
        </div>
        <div class="preview-controls">
          <div>
            <label class="field-label">Start position</label>
            <div class="seg-pills" id="modalPositionPills" role="radiogroup" aria-label="Modal capture start position">
              <button type="button" class="seg-pill is-active" data-pos="top" role="radio" aria-checked="true">Top</button>
              <button type="button" class="seg-pill" data-pos="middle" role="radio" aria-checked="false">Mid</button>
              <button type="button" class="seg-pill" data-pos="bottom" role="radio" aria-checked="false">Bot</button>
            </div>
          </div>
          <div>
            <label class="field-label" for="modalOffsetSlider">Percent</label>
            <div class="pin-custom-input-row">
              <input id="modalOffsetSlider" type="range" min="0" max="100" value="0" class="range">
              <span class="pin-custom-val"><span id="modalOffsetPctValue">0</span>%</span>
            </div>
          </div>
          <div>
            <label class="field-label" for="modalOffsetPx">Pixels (Y)</label>
            <input id="modalOffsetPx" type="number" min="0" step="1" value="0" class="pin-custom-px">
          </div>
          <div class="preview-readout" id="previewReadout">
            <div class="preview-readout-row"><span>page height</span><strong id="readoutPage">—</strong></div>
            <div class="preview-readout-row"><span>window</span><strong id="readoutWindow">—</strong></div>
            <div class="preview-readout-row"><span>start Y</span><strong id="readoutStartY">—</strong></div>
          </div>
        </div>
      </div>
      <div class="preview-modal-footer">
        <button type="button" class="preview-btn" id="previewCancelBtn">Cancel</button>
        <button type="button" class="preview-btn is-primary" id="previewConfirmBtn" disabled>Use this position</button>
      </div>
    </div>
  </div>

</div>

<script type="module">
// Device presets — single source of truth for both chip rendering and the
// viewport payload submitted to /api/capture. \`label\` is the human-readable
// chip text; \`name\` is what runCapture sees and what shows up in output paths
// and recent-runs entries. Adjust dimensions here and the UI updates with no
// HTML edits required.
const PRESETS = {
  desktop: { name: 'desktop', label: 'Desktop', width: 1440, height: 900 },
  laptop:  { name: 'laptop',  label: 'Laptop',  width: 1280, height: 800 },
  tablet:  { name: 'tablet',  label: 'Tablet',  width: 768,  height: 1024 },
  mobile:  { name: 'mobile',  label: 'Mobile',  width: 375,  height: 667 },
};
const DEFAULT_DEVICE_KEY = 'desktop'; // initial-checked chip on first load
// Default concurrency target when the user hasn't touched the slider — 2 in
// parallel is a sweet spot on modern dev laptops (~800 MB RAM, faster than
// serial without thrashing). Capped at the selected viewport count.
const DEFAULT_CONCURRENCY_TARGET = 2;
const STORAGE_KEY = 'framershot.recentRuns';
const MAX_RUNS = 12;

const $ = (id) => document.getElementById(id);
const els = {
  form: $('capture-form'),
  baseUrl: $('baseUrl'),
  pagePath: $('pagePath'),
  pageName: $('pageName'),
  crawlBtn: $('crawlBtn'),
  crawlHint: $('crawlHint'),
  crawlPanel: $('crawlPanel'),
  crawlCount: $('crawlCount'),
  crawlClear: $('crawlClear'),
  crawlList: $('crawlList'),
  queueProgressFill: $('queueProgressFill'),
  vpDevice: $('vpDevice'),
  vpPin: $('vpPin'),
  pinsOnlyToggle: $('pinsOnlyToggle'),
  pinOffsetBlock: $('pinOffsetBlock'),
  pinOffset: $('pinOffset'),
  pinOffsetValue: $('pinOffsetValue'),
  pinOffsetPx: $('pinOffsetPx'),
  pinPreviewRow: $('pinPreviewRow'),
  positionPills: $('positionPills'),
  positionReadout: $('positionReadout'),
  pinCustomBlock: $('pinCustomBlock'),
  previewPickBtn: $('previewPickBtn'),
  previewModal: $('previewModal'),
  previewModalClose: $('previewModalClose'),
  previewStage: $('previewStage'),
  previewSpinner: $('previewSpinner'),
  modalPositionPills: $('modalPositionPills'),
  modalOffsetSlider: $('modalOffsetSlider'),
  modalOffsetPctValue: $('modalOffsetPctValue'),
  modalOffsetPx: $('modalOffsetPx'),
  readoutPage: $('readoutPage'),
  readoutWindow: $('readoutWindow'),
  readoutStartY: $('readoutStartY'),
  previewCancelBtn: $('previewCancelBtn'),
  previewConfirmBtn: $('previewConfirmBtn'),
  customViewport: $('customViewport'),
  customViewportToggle: $('customViewportToggle'),
  vpName: $('vpName'), vpWidth: $('vpWidth'), vpHeight: $('vpHeight'),
  pinsOnlyChip: $('pinsOnlyChip'),
  concurrency: $('concurrency'),
  concurrencyValue: $('concurrencyValue'),
  dsrPills: $('dsrPills'),
  format: $('format'),
  formatRow: $('formatRow'),
  quality: $('quality'),
  qualityValue: $('qualityValue'),
  qualityField: $('qualityField'),
  hide: $('hide'),
  animations: $('animations'),
  scrollPrime: $('scrollPrime'),
  hideSticky: $('hideSticky'),
  hideFramerBadge: $('hideFramerBadge'),
  extraDelay: $('extraDelay'),
  frameDelay: $('frameDelay'),
  frameDelayWrap: $('frameDelayWrap'),
  backdropToggle: $('backdropToggle'),
  backdropOptions: $('backdropOptions'),
  backdropColor: $('backdropColor'),
  backdropColorHex: $('backdropColorHex'),
  backdropSwatches: $('backdropSwatches'),
  backdropPadding: $('backdropPadding'),
  backdropRadius: $('backdropRadius'),
  submit: $('submit-btn'),
  submitLabel: $('submit-label'),
  submitSpinner: $('submit-spinner'),
  status: $('status'),
  result: $('result'),
  resultMeta: $('result-meta'),
  resultPath: $('result-path'),
  resultOpen: $('result-open'),
  resultDownload: $('result-download'),
  resultReveal: $('result-reveal'),
  gallery: $('result-gallery'),
  galleryActions: $('gallery-actions'),
  galleryCount: $('gallery-count'),
  downloadAll: $('download-all'),
  runs: $('runs'),
  railCount: $('rail-count'),
  clearRuns: $('clear-runs'),
  led: $('led'),
  ledText: $('led-text'),
  statusBarLed: $('status-bar-led'),
  statusBarText: $('status-bar-text'),
  statusBarClock: $('status-bar-clock'),
};

const platform = navigator.userAgentData?.platform ?? navigator.platform ?? '';
const IS_MAC = /mac/i.test(platform);
if (!IS_MAC) els.resultReveal.hidden = true;

// Two chip groups — devices set the rendering width/height; ratios are
// multipliers that turn each device into an additional pin-shaped capture.
// Each is queried live (static markup, so the lists never change after render).
const deviceCheckboxes = () => [...els.vpDevice.querySelectorAll('input[type=checkbox]')];
const ratioCheckboxes  = () => [...els.vpPin.querySelectorAll('input[type=checkbox]')];
const allVpCheckboxes  = () => [...deviceCheckboxes(), ...ratioCheckboxes()];

// Split a viewport name into { root, slug }. Pin entries follow the pattern
// "<deviceRoot>-<ratioSlug>" (e.g. "desktop-2x3"); full-page entries have no
// slug. Returns { root: name, slug: null } when no ratio chip slug matches as
// a suffix, so the helper is safe to call on any viewport name regardless of
// whether the entry was a pin or full-page capture.
function splitPinName(name) {
  for (const slug of ratioCheckboxes().map((cb) => cb.dataset.slug)) {
    const suffix = '-' + slug;
    if (name.endsWith(suffix)) {
      return { root: name.slice(0, -suffix.length), slug };
    }
  }
  return { root: name, slug: null };
}

// Total captures = devices × (1 full-page + N pin ratios), where the +1 drops
// when pinsOnly is on AND at least one ratio is checked (otherwise the toggle
// is moot — there'd be nothing to capture). Custom viewport, when toggled on,
// counts as one more device — it's paired with every checked ratio too.
function selectedViewportCount() {
  const devices = deviceCheckboxes().filter((cb) => cb.checked).length
    + (els.customViewportToggle.checked ? 1 : 0);
  const ratios = ratioCheckboxes().filter((cb) => cb.checked).length;
  const fullPagePer = (els.pinsOnlyToggle.checked && ratios > 0) ? 0 : 1;
  return devices * (fullPagePer + ratios);
}

// Concurrency slider can't exceed the number of selected viewports — past that
// it's wasted UI capacity (worker pool caps internally too, but the value the
// user sees should reflect what'll actually run). Both the .max attribute and
// the current .value need clamping; otherwise the thumb visually overshoots
// the cap and snaps back on mouseup. .userTouched lets us preserve a manual
// pick across viewport changes (so adding viewports doesn't quietly bump the
// user's chosen 1× to 4×).
const HARD_CONCURRENCY_MAX = 8;
let concurrencyUserTouched = false;
function syncConcurrencyToViewports() {
  const vpCount = Math.max(1, selectedViewportCount());
  const cap = Math.min(HARD_CONCURRENCY_MAX, vpCount);
  els.concurrency.max = String(cap);
  let next = Number(els.concurrency.value);
  if (!concurrencyUserTouched) {
    next = Math.min(DEFAULT_CONCURRENCY_TARGET, cap);
  }
  if (next > cap) next = cap;
  els.concurrency.value = String(next);
  els.concurrencyValue.textContent = String(next);
}

// Pins-only is only meaningful when at least one ratio is checked — otherwise
// toggling it has no effect (the readForm matrix has no pins to "only" capture).
// Reflect that by disabling the chip when no ratios are selected, and forcing
// it off so it doesn't silently activate when ratios are added later.
function syncPinsOnlyEnabled() {
  const anyRatio = ratioCheckboxes().some((cb) => cb.checked);
  els.pinsOnlyToggle.disabled = !anyRatio;
  els.pinsOnlyChip.classList.toggle('is-disabled', !anyRatio);
  if (!anyRatio && els.pinsOnlyToggle.checked) els.pinsOnlyToggle.checked = false;
}

// frameDelay only applies to the full-page scroll-stitch loop. When pins-only
// is active, no full-page captures run — dim the field so the user sees it'll
// have no effect rather than silently ignoring a non-zero value.
function syncFrameDelayRelevance() {
  const anyRatio = ratioCheckboxes().some((cb) => cb.checked);
  const irrelevant = anyRatio && els.pinsOnlyToggle.checked;
  els.frameDelayWrap.classList.toggle('is-dim', irrelevant);
}

// ── Pin offset + preview ───────────────────────────────────
// Single global slider — applies the same fraction to every checked pin ratio
// across every device. Preview renders one silhouette per checked ratio with
// a window overlay sized to the ratio over an assumed (or measured) page
// aspect. When a recent full-page screenshot is available (from the latest
// run's currentOutputs), it's loaded as the silhouette backdrop and the
// aspect ratio is taken from the actual image dimensions — much more
// accurate than the 1:3.2 default for the user's specific page.
const DEFAULT_PAGE_ASPECT = 3.2; // page height / page width — rough marketing-page assumption

// lastFullPage = { url, aspect: pageHeight/pageWidth } once a backdrop loads.
// Captured into closure; updated by trySetBackdrop() and consumed by
// renderPinPreview(). Null until at least one full-page capture has run.
let lastFullPage = null;

// Tile registry — one entry per rendered pin-preview tile, kept in sync with
// the DOM by renderPinPreview. updatePinPreviewPositions mutates these in
// place on every slider tick so we don't churn through createElement on each
// 'input' event (≤4 tiles is small, but mutating top% is still ~10× cheaper
// than tearing down and rebuilding the row, and avoids per-tick GC pressure).
let pinPreviewTiles = [];

// v0.6: capture-position controls are always visible (they apply to full-page,
// pin, and single-viewport captures alike). This function is kept for the few
// callers that still invoke it after viewport selection changes, but it now
// only resyncs the preview row — the block itself never hides.
function syncPinOffsetBlockVisibility() {
  els.pinOffsetBlock.hidden = false;
}

// ── Capture-position state (v0.6) ──────────────────────────
// position is the active chip: 'top' | 'middle' | 'bottom' | 'custom'.
// Default 'top' = legacy behavior (startY=0 across every viewport).
// customSource tracks which Custom input the user last touched so readForm
// emits the right field — pinOffset (fraction) or pinOffsetPx (absolute).
// pageHeightHint is set after a preview load OR after a real run completes,
// enabling two-way sync between % and px inputs in Custom mode.
let position = 'top';
let customSource = 'percent';
let pageHeightHint = null;

function positionToOffsetFrac(pos) {
  if (pos === 'middle') return 0.5;
  if (pos === 'bottom') return 1.0;
  return 0;
}

function setPositionPillsActive(container, value) {
  for (const btn of container.querySelectorAll('.seg-pill')) {
    const active = btn.dataset.pos === value;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-checked', String(active));
  }
}

function setPosition(value, { source = 'chip' } = {}) {
  position = value;
  setPositionPillsActive(els.positionPills, value);
  els.pinCustomBlock.hidden = value !== 'custom';
  if (value === 'top') {
    els.pinOffset.value = '0';
    els.pinOffsetPx.value = '';
    els.positionReadout.textContent = 'Top';
  } else if (value === 'middle') {
    els.pinOffset.value = '50';
    els.pinOffsetPx.value = '';
    els.positionReadout.textContent = 'Middle';
  } else if (value === 'bottom') {
    els.pinOffset.value = '100';
    els.pinOffsetPx.value = '';
    els.positionReadout.textContent = 'Bottom';
  } else if (value === 'custom') {
    customSource = 'percent';
    els.positionReadout.textContent = 'Custom ' + els.pinOffset.value + '%';
  }
  updatePinPreviewPositions();
  // Source 'chip' = user click on a pill — refresh the submit label since the
  // wire payload may have changed shape (e.g. pinOffset toggled on/off).
  if (source === 'chip') updateSubmitLabel?.();
}

// Wire the main-form position pills. Clicking 'top'/'middle'/'bottom'/'custom'
// updates the shared position state and reveals/hides the Custom row.
for (const btn of els.positionPills.querySelectorAll('.seg-pill')) {
  btn.addEventListener('click', () => setPosition(btn.dataset.pos));
}

// Custom % slider → also keep px in sync when we have a page-height hint
// (from a preview run). Without a hint, leave px empty so the user knows the
// conversion isn't grounded yet — they can open the preview modal to fix that.
els.pinOffset.addEventListener('input', () => {
  customSource = 'percent';
  if (pageHeightHint != null && pageHeightHint > 0) {
    const frac = Number(els.pinOffset.value) / 100;
    const px = Math.round(pageHeightHint * frac);
    els.pinOffsetPx.value = String(px);
  } else {
    els.pinOffsetPx.value = '';
  }
  if (position === 'custom') {
    els.positionReadout.textContent = 'Custom ' + els.pinOffset.value + '%';
  }
  updatePinPreviewPositions();
});

// Custom px → derive % when we have a hint, otherwise just record the value
// and let readForm emit pinOffsetPx directly.
els.pinOffsetPx.addEventListener('input', () => {
  customSource = 'pixels';
  if (pageHeightHint != null && pageHeightHint > 0) {
    const px = Math.max(0, Number(els.pinOffsetPx.value) || 0);
    const frac = Math.min(1, px / pageHeightHint);
    els.pinOffset.value = String(Math.round(frac * 100));
  }
  if (position === 'custom') {
    els.positionReadout.textContent = 'Custom ' + (els.pinOffsetPx.value || 0) + 'px';
  }
  updatePinPreviewPositions();
});

// Build the position-options object for one viewport entry. Returns either {}
// (Top — legacy, no field emitted) or { pinOffset } or { pinOffsetPx }.
function getPositionOpts() {
  if (position === 'top') return {};
  if (position === 'middle') return { pinOffset: 0.5 };
  if (position === 'bottom') return { pinOffset: 1.0 };
  // Custom — honor whichever input the user last touched.
  if (customSource === 'pixels') {
    const px = Math.max(0, Math.round(Number(els.pinOffsetPx.value) || 0));
    if (px > 0) return { pinOffsetPx: px };
  }
  const frac = Math.max(0, Math.min(1, Number(els.pinOffset.value) / 100));
  if (frac > 0) return { pinOffset: frac };
  return {};
}

// Enable the Preview & pick button only when a URL is present. The modal
// needs a URL to fetch from — disabling avoids a 400 round-trip and a
// confusing empty modal.
function syncPreviewPickEnabled() {
  const ready = els.baseUrl.value.trim().length > 0;
  els.previewPickBtn.disabled = !ready;
  els.previewPickBtn.title = ready
    ? 'Open preview to pick the start position'
    : 'Add a URL to preview the page';
}
els.baseUrl.addEventListener('input', syncPreviewPickEnabled);
syncPreviewPickEnabled();

// Build one preview tile per checked ratio. Each tile shows the silhouette
// of a "page" (gradient or real backdrop) with a colored window overlay sized
// to the ratio and positioned by the current offset slider value. Recomputed
// from scratch on every change — cheap (≤4 small DOM trees).
// Full rebuild — call when the *set* of checked ratios changes or the backdrop
// image changes. On slider input alone, updatePinPreviewPositions handles the
// cheap path (no DOM churn).
function renderPinPreview() {
  // Skip the single-viewport chip (data-mode="viewport") — its window height
  // depends on the device, not a fixed ratio, so the per-ratio silhouette row
  // can't represent it generically. The preview modal is the better surface
  // for visualizing single-viewport captures.
  const checked = ratioCheckboxes().filter((cb) => cb.checked && cb.dataset.ratio !== undefined);
  els.pinPreviewRow.innerHTML = '';
  pinPreviewTiles = [];
  if (checked.length === 0) {
    updatePinPreviewPositions();
    return;
  }

  // pageAspect is page_height / page_width. The silhouette is rendered with
  // 'aspect-ratio: 1 / pageAspect' and the pin window height is
  // (ratio / pageAspect) × silhouetteHeight — i.e., (ratio / pageAspect) × 100%.
  const pageAspect = lastFullPage?.aspect ?? DEFAULT_PAGE_ASPECT;

  for (const cb of checked) {
    const ratio = Number(cb.dataset.ratio);
    // Clamp to (0, 1] so the window never exceeds the silhouette (degenerate
    // case: pinHeight > pageHeight → window is 100% tall, no room to slide).
    const winFrac = Math.min(1, ratio / pageAspect);

    const tile = document.createElement('div');
    tile.className = 'pin-preview';

    const sil = document.createElement('div');
    sil.className = 'pin-preview-silhouette';
    if (lastFullPage) {
      sil.classList.add('has-bg');
      sil.style.backgroundImage = 'url("' + lastFullPage.url + '")';
      sil.style.aspectRatio = '1 / ' + pageAspect;
    }

    const win = document.createElement('div');
    win.className = 'pin-preview-window';
    win.style.height = (winFrac * 100) + '%';
    sil.appendChild(win);

    const label = document.createElement('div');
    label.className = 'pin-preview-label';
    // Read the chip's own meta label (e.g. "2:3", "1:2.1") rather than munging
    // the slug — keeps display formatting data-driven so adding a new chip
    // doesn't require touching this code path.
    const meta = cb.parentElement.querySelector('.vp-chip-meta');
    label.textContent = meta ? meta.textContent : cb.dataset.slug;

    tile.appendChild(sil);
    tile.appendChild(label);
    els.pinPreviewRow.appendChild(tile);

    pinPreviewTiles.push({ win, winFrac });
  }

  updatePinPreviewPositions();
}

// Cheap slider-tick path: only mutates the top% style on already-rendered
// window elements. No DOM churn, no createElement, no re-measuring.
function updatePinPreviewPositions() {
  els.pinOffsetValue.textContent = els.pinOffset.value;
  const offset = Number(els.pinOffset.value) / 100;
  for (const { win, winFrac } of pinPreviewTiles) {
    const room = 1 - winFrac;
    win.style.top = (room * offset * 100) + '%';
  }
}

// Try to use a full-page output as the silhouette backdrop. The server tags
// each output with kind ∈ {'fullPage', 'pin'}; we pick the first 'fullPage'
// entry. Older server builds without the kind field fall back to the legacy
// slug-suffix heuristic so replaying a saved run from before this change
// still works. Loads the image off-DOM to read naturalWidth/Height so the
// silhouette can render at the actual page aspect.
function trySetBackdrop(outputs) {
  if (!outputs || outputs.length === 0) return;
  let fullPage = outputs.find((o) => o.kind === 'fullPage');
  if (!fullPage) {
    // Legacy fallback: pre-kind outputs. splitPinName returns slug=null when
    // no ratio chip suffix matches, identifying the full-page sibling. The
    // heuristic can misfire on custom viewport names ending in a chip slug —
    // bounded to pre-kind outputs only, so impact is finite.
    fullPage = outputs.find((o) => {
      if (o.kind) return false;
      if (!o.viewportName) return false;
      return splitPinName(o.viewportName).slug === null;
    });
  }
  if (!fullPage) return;
  const img = new Image();
  img.onload = () => {
    const aspect = img.naturalHeight / img.naturalWidth;
    lastFullPage = { url: fullPage.urlPath, aspect };
    renderPinPreview();
  };
  // Failure leaves lastFullPage as-is — the silhouette gracefully falls back
  // to the stylized gradient. Warn so a dev hitting the issue (404 file, CORS,
  // truncated server response) can find the cause in devtools without having
  // to set a breakpoint here.
  img.onerror = () => {
    console.warn('[pin preview] backdrop image failed to load:', fullPage.urlPath);
  };
  img.src = fullPage.urlPath;
}

function onViewportSelectionChange() {
  syncPinsOnlyEnabled();
  syncFrameDelayRelevance();
  syncConcurrencyToViewports();
  syncPinOffsetBlockVisibility();
  renderPinPreview();
  updateSubmitLabel();
}

// Populate the device-chip group from PRESETS so chip text always matches the
// dimensions the form actually submits. Must run BEFORE the per-checkbox
// listener wiring below (deviceCheckboxes() queries live DOM, not a snapshot).
function renderDeviceChips() {
  els.vpDevice.innerHTML = '';
  for (const [key, preset] of Object.entries(PRESETS)) {
    const label = document.createElement('label');
    label.className = 'vp-chip';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.preset = key;
    if (key === DEFAULT_DEVICE_KEY) input.checked = true;
    const name = document.createElement('span');
    name.textContent = preset.label;
    const meta = document.createElement('span');
    meta.className = 'vp-chip-meta';
    meta.textContent = preset.width + '×' + preset.height;
    label.appendChild(input);
    label.appendChild(name);
    label.appendChild(meta);
    els.vpDevice.appendChild(label);
  }
}
renderDeviceChips();

els.customViewportToggle.addEventListener('change', () => {
  els.customViewport.hidden = !els.customViewportToggle.checked;
  onViewportSelectionChange();
});

for (const cb of allVpCheckboxes()) {
  cb.addEventListener('change', onViewportSelectionChange);
}
els.pinsOnlyToggle.addEventListener('change', onViewportSelectionChange);

els.concurrency.addEventListener('input', () => {
  concurrencyUserTouched = true;
  els.concurrencyValue.textContent = els.concurrency.value;
});

// Pin offset slider listeners are wired earlier in the position-state block
// (one handler updates customSource + readout + px sync, then calls
// updatePinPreviewPositions). No additional listener needed here.

// Density pills — discrete 1×/2×/3× segmented control replacing the prior
// number-with-0.5-step input. Selection is stored as data-dsr on the active
// pill; readForm pulls it at submit. setDsr is also called by fillForm when
// replaying a saved run.
function setDsr(value) {
  // Pre-v0.4 stored runs may carry 1.5/2.5 from the old number-with-0.5-step
  // input. The current control is a discrete 1×/2×/3× pill group — snap to
  // the nearest pill rather than leaving every pill inactive on replay.
  const target = String(Math.round(Number(value) || 2));
  let matched = false;
  for (const btn of els.dsrPills.querySelectorAll('.seg-pill')) {
    const on = btn.dataset.dsr === target;
    if (on) matched = true;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  }
  if (!matched) {
    const fallback = els.dsrPills.querySelector('.seg-pill[data-dsr="2"]');
    fallback?.classList.add('is-active');
    fallback?.setAttribute('aria-checked', 'true');
  }
}
function getDsr() {
  const active = els.dsrPills.querySelector('.seg-pill.is-active');
  return active ? Number(active.dataset.dsr) : 2;
}
for (const btn of els.dsrPills.querySelectorAll('.seg-pill')) {
  btn.addEventListener('click', () => setDsr(btn.dataset.dsr));
}

// If the user pastes a full URL with a path into Base URL (e.g.
// https://site.com/contact), Playwright's context.baseURL + page.goto('/')
// would resolve to https://site.com/ — silently dropping /contact and
// screenshotting the home page. Split the path out into the Path field so
// the captured URL matches what was pasted. Only auto-fills Path/Slug when
// they're still at defaults, so manual edits aren't clobbered.
//
// Note on escaping: this entire script body lives inside a backtick template
// literal in renderUi(), so every backslash must be doubled to survive the
// outer template before reaching the browser. That is why the slash-stripping
// regex below uses doubled-backslash escapes, and why the SSE frame separator
// in the submit handler uses doubled-backslash-n-doubled-backslash-n. Single
// backslashes here would be consumed by the template literal and never reach
// the browser as the intended escape sequence.
function splitBaseUrl() {
  const raw = els.baseUrl.value.trim();
  if (!raw) return;
  let parsed;
  try { parsed = new URL(raw); }
  catch { return; }
  const path = parsed.pathname + parsed.search + parsed.hash;
  if (path === '/' || path === '') return;
  els.baseUrl.value = parsed.origin;
  if (els.pagePath.value.trim() === '' || els.pagePath.value.trim() === '/') {
    els.pagePath.value = path;
  }
  if (els.pageName.value.trim() === '' || els.pageName.value.trim() === 'home') {
    const slug = parsed.pathname.replace(/^\\/+|\\/+$/g, '').split('/').pop() || 'home';
    els.pageName.value = slug.replace(/[^a-zA-Z0-9._-]/g, '-') || 'home';
  }
}
els.baseUrl.addEventListener('blur', splitBaseUrl);
els.baseUrl.addEventListener('paste', () => setTimeout(splitBaseUrl, 0));

// ---- Capture Queue (Option A) ----------------------------------------------
// "Find all pages" reads the site's sitemap.xml (server /api/discover) and
// seeds a worklist — one row per discovered route — instead of an all-at-once
// batch. Each entry is captured individually: the active item's path/name drive
// the single-page form, the user tunes its start position, hits "Capture &
// next", and the queue advances to the next pending page (without auto-firing).
//
// Item shape: { path, name, status, position, thumbUrl, shots }
//   status   'pending' | 'done' | 'failed'
//   position null, or a captured position-state object (see capturePositionState)
//   thumbUrl null, or the servable PNG URL of the last capture (history thumb)
//   shots    output count from the last successful capture
//
// "Use single page" (crawlClear) empties the queue and falls back to the plain
// Path/Slug single-page behaviour — the escape hatch that must always work.
let captureQueue = [];
let activeQueueIndex = -1;

const QUEUE_GLYPH = { pending: '○', active: '▶', done: '✓', failed: '⚠' };

// Queue mode is on whenever the panel holds at least one item. readForm() and
// the submit handler branch on this to suppress the legacy pages[] batch and
// drive a single-page capture off the active item instead.
function isQueueMode() {
  return !els.crawlPanel.hidden && captureQueue.length > 0;
}

// Snapshot the form's current start-position controls into a plain object so it
// can be stored per-item and restored verbatim later. Mirrors the four pieces
// of state setPosition()/the Custom inputs manage.
function capturePositionState() {
  return {
    position,
    customSource,
    pinOffset: els.pinOffset.value,
    pinOffsetPx: els.pinOffsetPx.value,
  };
}

// Restore a position-state snapshot into the form. null → Top (legacy default).
// Custom is reconstructed the same way confirmPreviewModal() lands a custom
// pick so the readout/preview stay consistent.
function applyPositionState(state) {
  if (!state || state.position !== 'custom') {
    setPosition(state ? state.position : 'top', { source: 'restore' });
    els.pinOffsetValue.textContent = els.pinOffset.value;
    return;
  }
  els.pinOffset.value = state.pinOffset || '0';
  els.pinOffsetPx.value = state.pinOffsetPx || '';
  setPosition('custom', { source: 'restore' });
  customSource = state.customSource || 'percent';
  els.pinOffsetValue.textContent = els.pinOffset.value;
  els.positionReadout.textContent = customSource === 'pixels'
    ? 'Custom ' + (els.pinOffsetPx.value || 0) + 'px'
    : 'Custom ' + els.pinOffset.value + '%';
  updatePinPreviewPositions();
}

// Persist the form's current start position back onto the active item. Called
// from the position-control listeners so per-page tuning is never lost when the
// user switches rows or fires a capture.
function writeBackActivePosition() {
  if (activeQueueIndex < 0 || !captureQueue[activeQueueIndex]) return;
  captureQueue[activeQueueIndex].position = capturePositionState();
}

function renderQueue() {
  els.crawlList.textContent = '';
  const total = captureQueue.length;
  const done = captureQueue.filter((q) => q.status === 'done').length;
  if (total === 0) {
    els.crawlCount.textContent = 'Queue · empty';
  } else if (done === total) {
    els.crawlCount.textContent = 'Queue complete';
  } else {
    els.crawlCount.textContent = 'Queue · ' + done + ' of ' + total + ' captured';
  }
  els.queueProgressFill.style.width = total ? Math.round((done / total) * 100) + '%' : '0%';

  captureQueue.forEach((item, i) => {
    const isActive = i === activeQueueIndex;
    const row = document.createElement('div');
    row.className = 'queue-row status-' + item.status + (isActive ? ' is-active' : '');

    const glyph = document.createElement('span');
    glyph.className = 'queue-glyph';
    glyph.textContent = isActive ? QUEUE_GLYPH.active : (QUEUE_GLYPH[item.status] || QUEUE_GLYPH.pending);

    const path = document.createElement('span');
    path.className = 'queue-path';
    path.textContent = item.path;

    const slug = document.createElement('span');
    slug.className = 'queue-slug';
    slug.textContent = item.name;

    const meta = document.createElement('span');
    meta.className = 'queue-meta';
    if (item.status === 'done') meta.textContent = item.shots + ' shot' + (item.shots === 1 ? '' : 's');
    else if (item.status === 'failed') meta.textContent = 'failed';

    row.appendChild(glyph);
    row.appendChild(path);
    row.appendChild(slug);
    row.appendChild(meta);

    if (item.thumbUrl) {
      const thumb = document.createElement('img');
      thumb.className = 'queue-thumb';
      thumb.src = item.thumbUrl;
      thumb.alt = item.name;
      row.appendChild(thumb);
    }

    row.addEventListener('click', () => activateQueueItem(i));
    els.crawlList.appendChild(row);
  });
}

// Make item i the active one: persist the outgoing item's position, then load
// the incoming item's path/name + saved position into the form. Resets the pin
// silhouette since it was measured against the previous page.
function activateQueueItem(i) {
  if (i < 0 || i >= captureQueue.length) return;
  writeBackActivePosition();
  activeQueueIndex = i;
  const item = captureQueue[i];
  els.pagePath.value = item.path;
  els.pageName.value = item.name;
  applyPositionState(item.position);
  invalidatePinPreviewBackdrop();
  renderQueue();
  updateSubmitLabel();
}

// Find the next pending item after fromIndex (wrapping to earlier pendings),
// and load it. When nothing remains pending the queue is complete — leave the
// last item active and let the label/header reflect completion.
function advanceQueue(fromIndex) {
  let next = -1;
  for (let k = fromIndex + 1; k < captureQueue.length; k++) {
    if (captureQueue[k].status === 'pending') { next = k; break; }
  }
  if (next === -1) {
    for (let k = 0; k <= fromIndex && k < captureQueue.length; k++) {
      if (captureQueue[k].status === 'pending') { next = k; break; }
    }
  }
  if (next === -1) {
    renderQueue();
    updateSubmitLabel();
    return;
  }
  activateQueueItem(next);
}

// Seed the queue from /api/discover results. First item becomes active and its
// position is seeded from whatever the form currently shows (so a pre-set
// position carries onto page 1). Empty result hides the panel.
function seedQueue(pages) {
  captureQueue = pages.map((pg) => ({
    path: pg.path,
    name: pg.name,
    status: 'pending',
    position: null,
    thumbUrl: null,
    shots: 0,
  }));
  els.crawlPanel.hidden = captureQueue.length === 0;
  if (captureQueue.length > 0) {
    activeQueueIndex = 0;
    const first = captureQueue[0];
    els.pagePath.value = first.path;
    els.pageName.value = first.name;
    writeBackActivePosition();
    invalidatePinPreviewBackdrop();
  } else {
    activeQueueIndex = -1;
  }
  renderQueue();
  updateSubmitLabel();
}

els.crawlClear.addEventListener('click', () => {
  captureQueue = [];
  activeQueueIndex = -1;
  els.crawlList.textContent = '';
  els.crawlPanel.hidden = true;
  updateSubmitLabel();
});

// Keep the active item's path/name in sync as the user edits the single-page
// fields, and refresh the row so the queue mirrors the form live.
els.pagePath.addEventListener('input', () => {
  if (activeQueueIndex < 0 || !captureQueue[activeQueueIndex]) return;
  captureQueue[activeQueueIndex].path = els.pagePath.value.trim() || '/';
  renderQueue();
});
els.pageName.addEventListener('input', () => {
  if (activeQueueIndex < 0 || !captureQueue[activeQueueIndex]) return;
  captureQueue[activeQueueIndex].name = els.pageName.value.trim() || 'home';
  renderQueue();
});

// Persist position edits onto the active item. These listeners stack on top of
// the existing position handlers (which run first), so by the time these fire
// the form state is already updated.
els.pinOffset.addEventListener('input', writeBackActivePosition);
els.pinOffsetPx.addEventListener('input', writeBackActivePosition);
els.positionPills.addEventListener('click', writeBackActivePosition);

els.crawlBtn.addEventListener('click', async () => {
  const baseUrl = els.baseUrl.value.trim();
  if (!baseUrl) { logLine('crawl · add a base URL first', 'warn'); return; }
  const btn = els.crawlBtn;
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>Finding…';
  try {
    const res = await fetch('/api/discover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl }),
    });
    if (!res.ok) {
      logLine('crawl · ' + (await res.text()), 'err');
      return;
    }
    const data = await res.json();
    seedQueue(data.pages || []);
    let msg = 'crawl · queued ' + data.discovered + ' page' + (data.discovered === 1 ? '' : 's');
    if (data.truncated) msg += ' (capped at 200)';
    logLine(msg, 'ok');
  } catch (err) {
    logLine('crawl · ' + err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

// Invalidate the pin-preview silhouette when the target URL or path changes —
// lastFullPage was captured against the previous page and its aspect ratio /
// content has no relationship to the new page. Falls back to the gradient
// silhouette until the next non-backdropped capture lands.
function invalidatePinPreviewBackdrop() {
  if (lastFullPage === null) return;
  lastFullPage = null;
  renderPinPreview();
}
els.baseUrl.addEventListener('input', invalidatePinPreviewBackdrop);
els.pagePath.addEventListener('input', invalidatePinPreviewBackdrop);

// Quality control only applies to lossy codecs — PNG has no quality knob, so
// hide the slider when png is picked. Keep the stored value intact so a flip
// back to webp/jpeg restores the last setting without resetting to 85. The
// .is-single class collapses the row to a single column so Format isn't
// orphaned in a 2-col grid with a hole on the right.
function syncQualityVisibility() {
  const png = els.format.value === 'png';
  els.qualityField.hidden = png;
  els.formatRow.classList.toggle('is-single', png);
}
els.format.addEventListener('change', syncQualityVisibility);
els.quality.addEventListener('input', () => {
  els.qualityValue.textContent = els.quality.value;
});
syncQualityVisibility();

// ── Backdrop ──────────────────────────────────────────────
// Color picker + hex text field stay in sync via two event paths. The hex
// field accepts both #RRGGBB and RRGGBB shorthand — we normalize before
// pushing into the color input (which requires the leading #). Invalid hex
// (anything not /^#?[0-9a-f]{6}$/i) silently no-ops the sync so the user can
// type freely without snapback. Schema-side validation catches malformed hex
// at submit time.
// Snapshot the swatch list once at boot — the swatches are baked into the
// static HTML and never reorder, so re-querying on every color set is wasted
// work (and used to fire on every input event from the color picker).
const backdropSwatchEls = [...els.backdropSwatches.querySelectorAll('.backdrop-swatch')];

function setBackdropColor(hex) {
  const normalized = /^#?[0-9a-fA-F]{6}$/.test(hex)
    ? (hex.startsWith('#') ? hex : '#' + hex).toUpperCase()
    : null;
  if (!normalized) return;
  els.backdropColor.value = normalized;
  els.backdropColorHex.value = normalized;
  for (const sw of backdropSwatchEls) {
    sw.classList.toggle('is-active', sw.dataset.color.toUpperCase() === normalized);
  }
}
els.backdropColor.addEventListener('input', () => setBackdropColor(els.backdropColor.value));
els.backdropColorHex.addEventListener('change', () => setBackdropColor(els.backdropColorHex.value));
els.backdropColorHex.addEventListener('blur', () => setBackdropColor(els.backdropColorHex.value));
for (const sw of backdropSwatchEls) {
  sw.addEventListener('click', () => setBackdropColor(sw.dataset.color));
}
els.backdropToggle.addEventListener('change', () => {
  els.backdropOptions.hidden = !els.backdropToggle.checked;
});
// Initial swatch highlight for the default value
setBackdropColor(els.backdropColorHex.value);

const pad = (n) => String(n).padStart(2, '0');
const stamp = () => {
  const d = new Date();
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
};

function readForm() {
  // Build the viewports[] array as a matrix of devices × (full-page + checked
  // pin ratios). Each device contributes its own full-page entry UNLESS the
  // pins-only toggle is on AND at least one ratio is checked (in which case
  // the full-page entry is skipped — the user explicitly opted out). For every
  // checked ratio chip, the device ALSO contributes a pin entry with
  // pinHeight = round(width × ratio) — the schema knob runCapture honors to
  // clamp the scroll-stitch and produce a ratio-shaped image at the device's
  // natural rendering width (so Framer layouts stay correct).
  // Always send plural; if exactly one is selected the server's schema
  // collapses that to the same downstream shape.
  const devices = deviceCheckboxes()
    .filter((cb) => cb.checked)
    .map((cb) => PRESETS[cb.dataset.preset]);
  if (els.customViewportToggle.checked) {
    devices.push({
      name: els.vpName.value.trim() || 'custom',
      width: Number(els.vpWidth.value),
      height: Number(els.vpHeight.value),
    });
  }
  // Pin variants. data-ratio chips produce a height-as-fraction-of-width pin
  // (Pinterest shapes); data-mode="viewport" produces a single-viewport-tall
  // capture sized to the device's natural height.
  const variants = ratioCheckboxes()
    .filter((cb) => cb.checked)
    .map((cb) => ({
      slug: cb.dataset.slug,
      mode: cb.dataset.mode || 'ratio',
      ratio: cb.dataset.ratio !== undefined ? Number(cb.dataset.ratio) : null,
    }));
  const skipFullPage = els.pinsOnlyToggle.checked && variants.length > 0;
  // v0.6: position opts (pinOffset OR pinOffsetPx, possibly neither) apply to
  // EVERY viewport entry — full-page, pin, and single-viewport alike — so
  // "middle / bottom / custom" works uniformly. Top emits nothing.
  const positionOpts = getPositionOpts();
  const viewports = [];
  for (const dev of devices) {
    if (!skipFullPage) viewports.push({ ...dev, ...positionOpts });
    for (const v of variants) {
      const pinHeight = v.mode === 'viewport'
        ? dev.height
        : Math.round(dev.width * v.ratio);
      const pinEntry = {
        name: dev.name + '-' + v.slug,
        width: dev.width,
        height: dev.height,
        pinHeight,
        ...positionOpts,
      };
      viewports.push(pinEntry);
    }
  }
  const hideLines = els.hide.value.split('\\n').map((s) => s.trim()).filter(Boolean);
  // Backdrop is opt-in — when the toggle is off we send no field, so the
  // schema's optional() leaves config.backdrop === undefined and the capture
  // pipeline skips the post-process step entirely.
  const backdrop = els.backdropToggle.checked
    ? {
        color: els.backdropColorHex.value.toUpperCase(),
        padding: Number(els.backdropPadding.value) || 0,
        radius: Number(els.backdropRadius.value) || 0,
      }
    : undefined;
  // Capture Queue (Option A) is one-page-at-a-time: every run is a single-page
  // payload built from the active item (its path/name live in pagePath/pageName).
  // The legacy pages[] batch branch is gone — the queue advances client-side
  // instead of submitting all routes at once.
  return {
    baseUrl: els.baseUrl.value.trim(),
    page: { path: els.pagePath.value.trim() || '/', name: els.pageName.value.trim() || 'home' },
    viewports,
    concurrency: Number(els.concurrency.value) || 1,
    deviceScaleFactor: getDsr(),
    format: els.format.value,
    quality: Number(els.quality.value) || 85,
    prepare: {
      animations: els.animations.checked,
      scrollPrime: els.scrollPrime.checked,
      hideSticky: els.hideSticky.checked,
      hideFramerBadge: els.hideFramerBadge.checked,
      hide: hideLines,
      extraDelay: Number(els.extraDelay.value) || 0,
      frameDelay: Number(els.frameDelay.value) || 0,
    },
    ...(backdrop ? { backdrop } : {}),
  };
}

function fillForm(saved) {
  els.baseUrl.value = saved.baseUrl;
  els.pagePath.value = saved.page.path;
  els.pageName.value = saved.page.name;

  // Restore the viewport selection. Recent-runs entries may carry either the
  // legacy single viewport field (pre-multi-viewport runs), the v0.3 flat
  // viewports array, or the v0.4 matrix where every device width is also
  // emitted as one entry per checked pin ratio (pin entries carry pinHeight).
  // Treat the legacy field as a one-item array so old stored runs replay cleanly.
  const savedViewports = saved.viewports
    ?? (saved.viewport ? [saved.viewport] : []);
  for (const cb of allVpCheckboxes()) cb.checked = false;
  els.pinsOnlyToggle.checked = false;
  els.customViewportToggle.checked = false;
  els.customViewport.hidden = true;
  // Pass 1 — reconstruct ratio-chip selections from any pin entries by
  // matching the saved name's suffix against the slug each chip stores.
  // While we're iterating, also snap the pin-offset slider to the first
  // pinOffset we find (all pin entries in a single run share the same
  // offset, so picking the first is sufficient). Explicit boolean flag
  // rather than "first non-zero" — readForm currently strips pinOffset:0
  // from the wire, but if that ever changes, a saved 0 must restore as 0
  // (not be skipped as "still searching"). The flag keeps the contract
  // independent of the wire shape.
  // v0.6: position opts now live on EVERY viewport entry (full-page, pin,
  // single-viewport) — scan all entries, not just pins. First non-undefined
  // wins; pinOffsetPx takes precedence over pinOffset (schema rejects both).
  let restoredOffset = 0;
  let restoredPx = null;
  let offsetRestored = false;
  for (const vp of savedViewports) {
    if (vp.pinHeight !== undefined) {
      const { slug } = splitPinName(vp.name);
      if (slug) {
        const cb = ratioCheckboxes().find((c) => c.dataset.slug === slug);
        if (cb) cb.checked = true;
      }
    }
    if (!offsetRestored) {
      if (typeof vp.pinOffsetPx === 'number') {
        restoredPx = vp.pinOffsetPx;
        offsetRestored = true;
      } else if (typeof vp.pinOffset === 'number') {
        restoredOffset = vp.pinOffset;
        offsetRestored = true;
      }
    }
  }
  // Snap to a chip when the restored offset matches one cleanly; otherwise
  // land on Custom so the saved value is preserved verbatim.
  if (restoredPx != null) {
    els.pinOffset.value = '0';
    els.pinOffsetPx.value = String(restoredPx);
    setPosition('custom', { source: 'restore' });
    customSource = 'pixels';
    els.positionReadout.textContent = 'Custom ' + restoredPx + 'px';
  } else {
    els.pinOffset.value = String(Math.round(restoredOffset * 100));
    els.pinOffsetPx.value = '';
    let nextPos = 'top';
    if (restoredOffset === 0.5) nextPos = 'middle';
    else if (restoredOffset === 1) nextPos = 'bottom';
    else if (restoredOffset > 0) nextPos = 'custom';
    setPosition(nextPos, { source: 'restore' });
  }
  els.pinOffsetValue.textContent = els.pinOffset.value;
  // Derive pins-only: the run is pins-only iff every saved entry is a pin
  // entry (i.e. every entry has pinHeight set) AND at least one pin entry
  // exists. Avoids false positives on legacy/full-page-only runs.
  const hasPin = savedViewports.some((vp) => vp.pinHeight !== undefined);
  const allPin = savedViewports.every((vp) => vp.pinHeight !== undefined);
  els.pinsOnlyToggle.checked = hasPin && allPin;
  // Pass 2 — restore device-chip selections from the unique device roots
  // (splitPinName strips the trailing -slug to recover the underlying device).
  // The Map collapses duplicates so desktop + desktop-2x3 toggle the desktop
  // chip exactly once.
  const deviceRoots = new Map(); // rootName → { name, width, height }
  for (const vp of savedViewports) {
    const rootName = vp.pinHeight !== undefined ? splitPinName(vp.name).root : vp.name;
    if (!deviceRoots.has(rootName)) {
      deviceRoots.set(rootName, { name: rootName, width: vp.width, height: vp.height });
    }
  }
  for (const dev of deviceRoots.values()) {
    const matched = Object.entries(PRESETS).find(([, p]) =>
      p.width === dev.width && p.height === dev.height && p.name === dev.name);
    if (matched) {
      const cb = deviceCheckboxes().find((el) => el.dataset.preset === matched[0]);
      if (cb) cb.checked = true;
    } else {
      // First (and only) non-preset device becomes the custom row. Multiple
      // custom viewports per run aren't supported in the UI yet — last wins.
      els.customViewportToggle.checked = true;
      els.customViewport.hidden = false;
      els.vpName.value = dev.name;
      els.vpWidth.value = dev.width;
      els.vpHeight.value = dev.height;
    }
  }
  // Saved concurrency is an explicit user pick — treat it as "touched" so
  // the auto-default doesn't override it on subsequent viewport changes.
  if (typeof saved.concurrency === 'number') {
    concurrencyUserTouched = true;
    els.concurrency.value = saved.concurrency;
    els.concurrencyValue.textContent = saved.concurrency;
  } else {
    concurrencyUserTouched = false;
  }
  syncPinsOnlyEnabled();
  syncFrameDelayRelevance();
  syncConcurrencyToViewports();
  syncPinOffsetBlockVisibility();
  renderPinPreview();

  setDsr(saved.deviceScaleFactor);
  if (saved.format) {
    els.format.value = saved.format;
    syncQualityVisibility();
  }
  if (typeof saved.quality === 'number') {
    els.quality.value = saved.quality;
    els.qualityValue.textContent = saved.quality;
  }
  els.hide.value = (saved.prepare?.hide ?? []).join('\\n');
  els.animations.checked = saved.prepare?.animations ?? true;
  els.scrollPrime.checked = saved.prepare?.scrollPrime ?? true;
  els.hideSticky.checked = saved.prepare?.hideSticky ?? true;
  els.hideFramerBadge.checked = saved.prepare?.hideFramerBadge ?? true;
  els.extraDelay.value = saved.prepare?.extraDelay ?? 0;
  els.frameDelay.value = saved.prepare?.frameDelay ?? 0;
  // Backdrop restore — when the saved run carries one, populate the fields
  // and reveal the options group; otherwise reset to the off state so an
  // older backdrop-less run doesn't leave a stale toggle from the previous fill.
  if (saved.backdrop) {
    els.backdropToggle.checked = true;
    els.backdropOptions.hidden = false;
    setBackdropColor(saved.backdrop.color);
    if (typeof saved.backdrop.padding === 'number') els.backdropPadding.value = saved.backdrop.padding;
    if (typeof saved.backdrop.radius === 'number') els.backdropRadius.value = saved.backdrop.radius;
  } else {
    els.backdropToggle.checked = false;
    els.backdropOptions.hidden = true;
  }
  updateSubmitLabel();
}

function loadRuns() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function saveRuns(runs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
}
function shortHost(url) {
  try { return new URL(url).host.replace(/^www\\./, ''); }
  catch { return url; }
}

// Compact summary for the recent-runs rail. Returns either '' (nothing to add)
// or a plain text fragment — caller wraps with a separator element so the
// localStorage-sourced run fields never touch innerHTML.
// Three cases: 0 viewports → silent; 1 viewport → "<name> <w>×<h>"; many →
// either "N viewports" (no pins) or "D dev × R pin" (matrix runs).
function summarizeRunViewports(vps) {
  if (vps.length === 0) return '';
  if (vps.length === 1) return vps[0].name + ' ' + vps[0].width + '×' + vps[0].height;
  // Count unique device roots and unique pin ratios (splitPinName parses the
  // suffix). Falls back to "N viewports" if no pin entries were emitted. Also
  // pick up a per-run pinOffset if any pin entry carries one (all pin entries
  // in a run share the same value, so first-found is sufficient).
  const deviceRoots = new Set();
  const pinSlugs = new Set();
  let hasPin = false;
  let offsetPct = 0;
  for (const vp of vps) {
    if (vp.pinHeight !== undefined) {
      hasPin = true;
      if (typeof vp.pinOffset === 'number' && offsetPct === 0) {
        offsetPct = Math.round(vp.pinOffset * 100);
      }
      const { root, slug } = splitPinName(vp.name);
      if (slug) {
        pinSlugs.add(slug);
        deviceRoots.add(root);
      } else {
        deviceRoots.add(vp.name);
      }
    } else {
      deviceRoots.add(vp.name);
    }
  }
  if (hasPin && pinSlugs.size > 0) {
    const base = deviceRoots.size + ' dev × ' + pinSlugs.size + ' pin';
    return offsetPct > 0 ? base + ' @ ' + offsetPct + '%' : base;
  }
  return vps.length + ' viewports';
}

function renderRuns() {
  const runs = loadRuns();
  els.runs.innerHTML = '';
  els.railCount.textContent = runs.length ? '· ' + String(runs.length).padStart(2, '0') : '';
  if (runs.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No runs yet';
    els.runs.appendChild(li);
    return;
  }
  runs.forEach((run, i) => {
    const li = document.createElement('li');

    const idx = document.createElement('span');
    idx.className = 'idx';
    idx.textContent = String(i + 1).padStart(2, '0');

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = run.page.name || 'home';

    const meta = document.createElement('span');
    meta.className = 'meta';
    // Legacy entries (pre-multi-viewport) carried a single viewport; new
    // entries carry viewports[]. Render either gracefully. For matrix runs
    // (devices × pin ratios), show the breakdown rather than the opaque "N
    // viewports" — "2 dev × 3 pin" tells you what the run actually shot.
    const vps = run.viewports ?? (run.viewport ? [run.viewport] : []);
    // textContent for every localStorage-sourced field; the · separator is the
    // only HTML element here, built as a real DOM node.
    meta.appendChild(document.createTextNode(shortHost(run.baseUrl) + run.page.path));
    const summary = summarizeRunViewports(vps);
    if (summary) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.textContent = '·';
      meta.appendChild(dot);
      meta.appendChild(document.createTextNode(summary));
    }

    const glyph = document.createElement('span');
    glyph.className = 'recall-glyph';
    glyph.textContent = '↶';

    li.appendChild(idx);
    li.appendChild(name);
    li.appendChild(meta);
    li.appendChild(glyph);
    li.addEventListener('click', () => fillForm(run));
    els.runs.appendChild(li);
  });
}
function recordRun(input) {
  const label = input.page.name || 'home';
  const entry = { ...input, label, ts: Date.now() };
  const existing = loadRuns().filter((r) =>
    !(r.baseUrl === input.baseUrl && r.page.path === input.page.path && r.page.name === input.page.name));
  saveRuns([entry, ...existing]);
  renderRuns();
}

els.clearRuns.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  renderRuns();
});

function setLed(state, text) {
  els.led.className = 'led' + (state ? ' ' + state : '');
  els.ledText.textContent = text;
  els.statusBarLed.className = 'dot-led' + (state ? ' ' + state : '');
  els.statusBarText.textContent = text;
}

function updateClock() {
  const d = new Date();
  els.statusBarClock.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
}
updateClock();
setInterval(updateClock, 15000);

function logReset() { els.status.innerHTML = ''; }
function logLine(msg, cls = '') {
  const active = els.status.querySelector('.log-line.active');
  if (active) active.classList.remove('active');
  const row = document.createElement('div');
  row.className = 'log-line ' + cls;
  const ts = document.createElement('span');
  ts.className = 'ts';
  ts.textContent = stamp();
  const m = document.createElement('span');
  m.className = 'msg';
  m.textContent = msg;
  row.appendChild(ts);
  row.appendChild(m);
  els.status.appendChild(row);
  // Keep the latest line visible once the log overflows its max-height.
  els.status.scrollTop = els.status.scrollHeight;
  return row;
}
function logActive(msg) {
  const row = logLine(msg);
  row.classList.add('active');
  return row;
}

let frameBarFill = null;
function ensureFrameBar() {
  if (frameBarFill) return;
  const wrap = document.createElement('div');
  wrap.className = 'frame-bar-wrap';
  const fill = document.createElement('div');
  fill.className = 'frame-bar-fill';
  const ticks = document.createElement('div');
  ticks.className = 'frame-bar-ticks';
  wrap.appendChild(fill);
  wrap.appendChild(ticks);
  els.status.appendChild(wrap);
  frameBarFill = fill;
}
function setFrameBar(current, total) {
  ensureFrameBar();
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  frameBarFill.style.width = pct + '%';
}

function deriveDownloadName(outputPath) {
  // Filename is already self-describing — e.g. home-desktop-11-56-09.png or
  // home-hero-desktop-11-56-09.png. Just return the basename.
  const parts = outputPath.replace(/^\\.\\//, '').split('/');
  return parts[parts.length - 1] || 'capture.png';
}

let lastOutputPath = null;
// Persisted across the run so the "Download all" button can post the full list
// to /api/zip without re-reading the (now-cleared) log.
let currentOutputs = [];

// Populate a tile-label DOM node with the viewport name. Built with
// textContent so any embedded markup in viewportName (user-supplied config)
// renders as text rather than HTML.
function setTileLabel(labelEl, o) {
  // Multi-page runs reuse the same viewport across many pages, so lead with the
  // page name when present ("about · desktop") to keep tiles distinguishable.
  const vp = o.viewportName || 'capture';
  labelEl.textContent = o.pageName ? o.pageName + ' · ' + vp : vp;
}

function showHero(output) {
  lastOutputPath = output.outputPath;
  els.result.classList.remove('empty');
  els.result.innerHTML = '';
  els.resultMeta.hidden = false;
  els.resultPath.textContent = output.outputPath;
  els.resultOpen.href = output.urlPath;
  els.resultDownload.href = output.urlPath;
  els.resultDownload.setAttribute('download', deriveDownloadName(output.outputPath));
  const img = new Image();
  img.src = output.urlPath + '?t=' + Date.now();
  img.alt = 'capture';
  els.result.appendChild(img);
}

function showGallery(outputs) {
  // Hide the single-hero meta + image; gallery owns the panel.
  els.resultMeta.hidden = true;
  els.result.classList.add('empty');
  els.result.hidden = true;
  els.gallery.hidden = false;
  els.galleryActions.hidden = false;
  els.galleryCount.textContent = outputs.length;
  els.gallery.innerHTML = '';
  const bust = '?t=' + Date.now();
  for (const o of outputs) {
    const tile = document.createElement('div');
    tile.className = 'gallery-tile';
    const revealHtml = IS_MAC
      ? '<button class="meta-btn tile-reveal" type="button">Reveal</button>'
      : '';
    tile.innerHTML =
      '<div class="tile-img"><img alt="capture"></div>' +
      '<div class="tile-meta">' +
        '<div class="tile-label"></div>' +
        '<div class="tile-path" title=""></div>' +
      '</div>' +
      '<div class="tile-actions">' +
        '<a class="meta-btn primary tile-download" download><span class="arrow">↓</span></a>' +
        revealHtml +
        '<a class="meta-btn tile-open" target="_blank" rel="noopener">↗</a>' +
      '</div>';
    // Set attributes via DOM (not innerHTML) for the user-controlled paths so
    // we don't need to HTML-escape them — outputPath comes from the server but
    // belt-and-braces is cheaper than thinking through every edge case.
    tile.querySelector('img').src = o.urlPath + bust;
    setTileLabel(tile.querySelector('.tile-label'), o);
    const pathEl = tile.querySelector('.tile-path');
    pathEl.textContent = o.outputPath;
    pathEl.title = o.outputPath;
    const dl = tile.querySelector('.tile-download');
    dl.href = o.urlPath;
    dl.setAttribute('download', deriveDownloadName(o.outputPath));
    tile.querySelector('.tile-open').href = o.urlPath;
    if (IS_MAC) {
      tile.querySelector('.tile-reveal').addEventListener('click', async () => {
        try {
          const r = await fetch('/api/reveal', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: o.outputPath }),
          });
          if (!r.ok) logLine('reveal · ' + (await r.text()), 'warn');
        } catch (err) {
          logLine('reveal · ' + err.message, 'warn');
        }
      });
    }
    els.gallery.appendChild(tile);
  }
}

function hideGallery() {
  els.gallery.hidden = true;
  els.galleryActions.hidden = true;
  els.gallery.innerHTML = '';
  els.result.hidden = false;
}

function showResults(outputs, { hadBackdrop = false } = {}) {
  currentOutputs = outputs;
  // Best-effort: swap the pin-preview backdrop to whichever full-page output
  // landed in this run. No-op when none qualifies; never blocks the gallery.
  // Skip when this run produced backdropped outputs — the colored padding
  // baked into the image would skew the silhouette's measured aspect ratio
  // (naturalH/naturalW includes padding) and the pin-window overlay would no
  // longer correspond to the actual page slice. Keep the prior non-backdropped
  // silhouette (or the default gradient) instead.
  if (!hadBackdrop) trySetBackdrop(outputs);
  if (outputs.length <= 1) {
    hideGallery();
    if (outputs.length === 1) showHero(outputs[0]);
    return;
  }
  showGallery(outputs);
}

let copiedFlash = null;
let copiedTimer = null;
els.resultPath.addEventListener('click', async () => {
  if (!lastOutputPath) return;
  try {
    await navigator.clipboard.writeText(lastOutputPath);
    if (copiedTimer) clearTimeout(copiedTimer);
    if (copiedFlash) copiedFlash.remove();
    copiedFlash = document.createElement('span');
    copiedFlash.className = 'copied';
    copiedFlash.textContent = 'copied';
    els.resultPath.parentNode.appendChild(copiedFlash);
    copiedTimer = setTimeout(() => {
      if (copiedFlash) copiedFlash.remove();
      copiedFlash = null;
      copiedTimer = null;
    }, 1400);
  } catch {
    // clipboard may be blocked — path is still visible on screen
  }
});

els.downloadAll.addEventListener('click', async () => {
  if (currentOutputs.length === 0) return;
  const btn = els.downloadAll;
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>Bundling…';
  try {
    const res = await fetch('/api/zip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths: currentOutputs.map((o) => o.outputPath) }),
    });
    if (!res.ok) {
      logLine('zip · ' + (await res.text()), 'err');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    // Filename: prefer the server's Content-Disposition (it knows the run's
    // exact timestamp); fall back to a UI-side stamp if absent.
    const cd = res.headers.get('content-disposition') || '';
    const match = cd.match(/filename="([^"]+)"/);
    const fallback = 'framershot-' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19) + '.zip';
    const a = document.createElement('a');
    a.href = url;
    a.download = match ? match[1] : fallback;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    logLine('zip · ' + err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
});

els.resultReveal.addEventListener('click', async () => {
  if (!lastOutputPath) return;
  try {
    const r = await fetch('/api/reveal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: lastOutputPath }),
    });
    if (!r.ok) logLine('reveal · ' + (await r.text()), 'warn');
  } catch (err) {
    logLine('reveal · ' + err.message, 'warn');
  }
});

// Submit label reflects the current scope: idle state shows "Capture" (1 shot)
// or "Capture N shots" (multi). Runs the count off selectedViewportCount so it
// reacts immediately to chip/toggle changes. While submitting it's overridden
// with "Capturing…" — updateSubmitLabel skips while disabled so a tick doesn't
// flicker mid-run.
function updateSubmitLabel() {
  if (els.submit.disabled) return;
  // Queue mode: "Capture & next" while another page is still pending (firing
  // the active one will advance), otherwise plain "Capture" (last page, a
  // re-capture with nothing left, or a complete queue).
  if (isQueueMode()) {
    const morePending = captureQueue.some((q, i) => q.status === 'pending' && i !== activeQueueIndex);
    els.submitLabel.textContent = morePending ? 'Capture & next' : 'Capture';
    return;
  }
  const n = selectedViewportCount();
  els.submitLabel.textContent = n > 1 ? 'Capture ' + n + ' shots' : 'Capture';
}

function setSubmitting(on) {
  els.submit.disabled = on;
  els.submitSpinner.hidden = !on;
  if (on) {
    els.submitLabel.textContent = 'Capturing…';
  } else {
    updateSubmitLabel();
  }
}

// Cmd+Enter (mac) / Ctrl+Enter (others) submits from anywhere in the form —
// matches the ↵ kbd glyph already shown in the button. Plain Enter still
// submits when focus is on a single-line input (browser default), but is
// captured by textareas — Cmd+Enter is the universal shortcut.
els.form.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (!(e.metaKey || e.ctrlKey)) return;
  e.preventDefault();
  if (!els.submit.disabled) els.form.requestSubmit();
});

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = readForm();
  if (!input.baseUrl) return;

  // Queue mode (Option A): every submit captures the single active item. Pin the
  // index now — the SSE loop runs async and the user could click another row
  // mid-run, so we update the item we actually fired against, not whatever is
  // active when the stream ends.
  const queueMode = isQueueMode();
  const capturedIndex = queueMode ? activeQueueIndex : -1;

  setSubmitting(true);
  logReset();
  frameBarFill = null;
  // Clear any prior run's gallery so tiles from the last capture don't linger
  // while the new run streams in. The single-hero preview (els.result) is left
  // alone — it'll be overwritten by showResults() when the new outputs land.
  hideGallery();
  currentOutputs = [];
  setLed('running', 'capturing');
  const vpCount = input.viewports.length;
  const parallel = vpCount > 1;
  if (parallel) {
    logLine('begin · ' + vpCount + ' viewports · up to ' + input.concurrency + ' in parallel');
  } else {
    logLine('begin · ' + shortHost(input.baseUrl) + input.page.path);
  }

  // Single try/finally so the button always re-enables — even if recordRun or
  // any downstream parsing throws. Without this, one uncaught error leaves the
  // form stuck in "Capturing…" and the user can't capture again.
  let succeeded = false;
  let doneOutputs = [];
  try {
    let response;
    try {
      response = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
    } catch (err) {
      logLine('network · ' + err.message, 'err');
      setLed('err', 'error');
      return;
    }

    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = body.issues
          ? body.issues.map((i) => i.field + ' · ' + i.message).join('\\n')
          : (body.error || '');
      } catch { detail = await response.text(); }
      detail.split('\\n').forEach((line) => logLine(line, 'err'));
      setLed('err', 'error');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\\n\\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = raw.split('\\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const event = JSON.parse(line.slice(6));

        // Multi-viewport runs interleave events from N parallel workers, so
        // every log line carries a viewport prefix in that mode. Single-
        // viewport runs keep the cleaner unprefixed format. The active-line
        // animation (used by logActive) tracks one capture at a time and
        // would thrash across viewports, so multi-viewport mode falls back to
        // discrete log lines + suppresses the frame bar (frame events from
        // N workers can't share a single bar meaningfully).
        const prefix = parallel && event.viewport ? '[' + event.viewport + '] ' : '';

        if (event.type === 'step') {
          if (parallel) {
            logLine(prefix + event.label.toLowerCase());
          } else {
            logActive(event.label.toLowerCase());
          }
        } else if (event.type === 'frame') {
          if (parallel) {
            // Skip — frame events from N viewports flood the log and the
            // shared frame bar is meaningless. Step events still mark progress.
          } else {
            logActive('frame ' + String(event.current).padStart(2, '0') + ' / ' + String(event.total).padStart(2, '0'));
            setFrameBar(event.current, event.total);
          }
        } else if (event.type === 'warning' && event.kind === 'hide-missed') {
          for (const sel of event.selectors) {
            logLine(prefix + 'hide "' + sel + '" matched nothing · skipped', 'warn');
          }
        } else if (event.type === 'page-error') {
          // A multi-page crawl skipped one page (a Chromium crash on a heavy
          // page, a nav error on one route) and kept going. Always tag with
          // viewport/page since a single-viewport crawl has no parallel prefix.
          const tag = '[' + [event.viewport, event.page].filter(Boolean).join('/') + '] ';
          logLine('skipped · ' + tag + event.message, 'warn');
        } else if (event.type === 'done') {
          succeeded = true;
          const active = els.status.querySelector('.log-line.active');
          if (active) active.classList.remove('active');
          const outputs = event.outputs || [];
          doneOutputs = outputs;
          for (const o of outputs) {
            const tag = parallel && o.viewportName ? '[' + o.viewportName + '] ' : '';
            logLine('done · ' + tag + o.outputPath, 'ok');
          }
          // Headline the partial-batch outcome when a crawl dropped pages — the
          // per-page 'skipped' lines already streamed above; this is the count.
          const failures = event.failures || [];
          if (failures.length) {
            logLine('done · ' + outputs.length + ' written · ' + failures.length + ' skipped', 'warn');
            setLed('warn', 'partial');
          } else {
            setLed('ok', 'ready');
          }
          showResults(outputs, { hadBackdrop: input.backdrop !== undefined });
        } else if (event.type === 'error') {
          // Surface the server's lastStep context when present — turns a bare
          // "Navigation failed" into "[iPad/blog] step: 'Navigating to …' ·
          // Navigation failed", which is the single line the user can paste
          // into a bug report.
          const ctx = event.context;
          const ctxTag = ctx && (ctx.viewport || ctx.page || ctx.step)
            ? '[' + [ctx.viewport, ctx.page].filter(Boolean).join('/') + ']'
              + (ctx.step ? " step: '" + ctx.step + "' · " : ' ')
            : '';
          logLine(ctxTag + event.message, 'err');
          setLed('err', 'error');
        }
      }
    }

    if (succeeded) {
      try { recordRun(input); }
      catch (err) { logLine('record · ' + err.message, 'warn'); }
    }
  } catch (err) {
    logLine('stream · ' + err.message, 'err');
    setLed('err', 'error');
  } finally {
    setSubmitting(false);
    // Queue mode: record the outcome on the item we fired against, then load
    // the next pending page (advance-and-wait — no auto-fire). Runs in finally
    // so network/bad-response early-returns still mark the item failed.
    if (queueMode && capturedIndex >= 0 && captureQueue[capturedIndex]) {
      const item = captureQueue[capturedIndex];
      if (succeeded) {
        item.status = 'done';
        item.shots = doneOutputs.length;
        if (doneOutputs[0] && doneOutputs[0].urlPath) {
          // Cache-bust so a re-capture replaces the thumbnail rather than
          // showing the browser's stale copy at the same URL.
          item.thumbUrl = doneOutputs[0].urlPath + '?t=' + Date.now();
        }
      } else {
        item.status = 'failed';
      }
      advanceQueue(capturedIndex);
    }
  }
});

// ── Preview modal (v0.6) ───────────────────────────────────
// Visual position picker. Fetches /api/preview for the current URL + first
// selected device, displays the PNG with an overlay rectangle marking the
// capture window. Drag the overlay (or use the pills/slider/px input) to
// dial in startY. "Use this position" writes back into the main form.
//
// Image-space math: the preview is captured at DSR=1, so 1 image-px ≈ 1
// CSS-px on the page. We convert image-px ↔ rendered-px via
// scale = renderedHeight / naturalHeight.
let modalState = null;

function modalDeviceForPreview() {
  for (const cb of deviceCheckboxes()) {
    if (cb.checked) return PRESETS[cb.dataset.preset];
  }
  if (els.customViewportToggle.checked) {
    return {
      name: 'custom',
      width: Math.max(1, Number(els.vpWidth.value) || 1440),
      height: Math.max(1, Number(els.vpHeight.value) || 900),
    };
  }
  return PRESETS[DEFAULT_DEVICE_KEY];
}

function modalWindowHeight(device) {
  // Mirrors readForm variant precedence — viewport chip > ratio chip >
  // full-page. Picks the FIRST checked match when multiple ratios are on so
  // the modal shows one representative window (the others get the same
  // start position at capture time anyway).
  const viewportCb = ratioCheckboxes().find((cb) => cb.checked && cb.dataset.mode === 'viewport');
  if (viewportCb) return device.height;
  const ratioCb = ratioCheckboxes().find((cb) => cb.checked && cb.dataset.ratio !== undefined);
  if (ratioCb) return Math.round(device.width * Number(ratioCb.dataset.ratio));
  return null; // full-page — overlay extends from startY to bottom of page
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load preview image'));
    img.src = src;
  });
}

function renderModalStage(state) {
  els.previewStage.innerHTML = '';
  if (state.kind === 'loading') {
    const sp = document.createElement('div');
    sp.className = 'preview-spinner';
    sp.textContent = 'Capturing preview…';
    els.previewStage.appendChild(sp);
    return;
  }
  if (state.kind === 'error') {
    const div = document.createElement('div');
    div.className = 'preview-error';
    div.textContent = state.error;
    els.previewStage.appendChild(div);
    return;
  }
  // kind === 'image'
  const frame = document.createElement('div');
  frame.className = 'preview-stage-frame';
  const imgEl = document.createElement('img');
  imgEl.className = 'preview-stage-img';
  imgEl.src = state.img.src;
  // Prevent the native image-drag ghost — we own pointer events on the overlay.
  imgEl.addEventListener('dragstart', (e) => e.preventDefault());
  const overlay = document.createElement('div');
  overlay.className = 'preview-overlay';
  const tag = document.createElement('div');
  tag.className = 'preview-overlay-tag';
  overlay.appendChild(tag);
  frame.appendChild(imgEl);
  frame.appendChild(overlay);
  els.previewStage.appendChild(frame);
  modalState.imgEl = imgEl;
  modalState.overlayEl = overlay;
  modalState.tagEl = tag;
  // Image is already loaded so getBoundingClientRect is valid on next frame.
  requestAnimationFrame(updateModalOverlay);
}

function setModalPillsActive(value) {
  for (const btn of els.modalPositionPills.querySelectorAll('.seg-pill')) {
    const active = btn.dataset.pos === value;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-checked', String(active));
  }
}

function updateModalOverlay() {
  if (!modalState || !modalState.overlayEl) return;
  const { pageHeight, viewportH, windowH, offsetPx, overlayEl, imgEl, tagEl } = modalState;
  const room = Math.max(0, pageHeight - viewportH);
  const startY = Math.max(0, Math.min(room, offsetPx));
  const winPx = windowH != null
    ? Math.min(windowH, pageHeight - startY)
    : Math.max(0, pageHeight - startY);
  const rendered = imgEl.getBoundingClientRect();
  const scale = rendered.height > 0 ? rendered.height / pageHeight : 1;
  overlayEl.style.top = (startY * scale) + 'px';
  overlayEl.style.height = (winPx * scale) + 'px';
  tagEl.textContent = 'Y ' + startY + ' · ' + winPx + 'px tall';
  els.modalOffsetPx.value = String(startY);
  const pct = room > 0 ? Math.round((startY / room) * 100) : 0;
  els.modalOffsetSlider.value = String(pct);
  els.modalOffsetPctValue.textContent = String(pct);
  els.readoutPage.textContent = pageHeight + 'px';
  els.readoutWindow.textContent = (windowH != null ? windowH + 'px' : 'to bottom');
  els.readoutStartY.textContent = startY + 'px';
  // Pills snap to preset when startY lands on one cleanly; otherwise deselect.
  if (startY === 0) setModalPillsActive('top');
  else if (startY === room) setModalPillsActive('bottom');
  else if (Math.abs(startY - room / 2) <= 1) setModalPillsActive('middle');
  else setModalPillsActive('');
}

function initModalControls() {
  for (const btn of els.modalPositionPills.querySelectorAll('.seg-pill')) {
    btn.onclick = () => {
      const room = Math.max(0, modalState.pageHeight - modalState.viewportH);
      const pos = btn.dataset.pos;
      if (pos === 'top') modalState.offsetPx = 0;
      else if (pos === 'middle') modalState.offsetPx = Math.round(room * 0.5);
      else if (pos === 'bottom') modalState.offsetPx = room;
      updateModalOverlay();
    };
  }
  els.modalOffsetSlider.oninput = () => {
    const room = Math.max(0, modalState.pageHeight - modalState.viewportH);
    const pct = Number(els.modalOffsetSlider.value) / 100;
    modalState.offsetPx = Math.round(room * pct);
    updateModalOverlay();
  };
  els.modalOffsetPx.oninput = () => {
    const room = Math.max(0, modalState.pageHeight - modalState.viewportH);
    const px = Math.max(0, Math.min(room, Number(els.modalOffsetPx.value) || 0));
    modalState.offsetPx = px;
    updateModalOverlay();
  };
  // Drag the overlay vertically. Pointer events handle mouse + touch + pen
  // uniformly and capture cleanly when the cursor leaves the overlay.
  let dragging = null;
  modalState.overlayEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    modalState.overlayEl.setPointerCapture(e.pointerId);
    modalState.overlayEl.classList.add('is-dragging');
    dragging = { startClientY: e.clientY, startOffsetPx: modalState.offsetPx };
  });
  modalState.overlayEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const room = Math.max(0, modalState.pageHeight - modalState.viewportH);
    const rendered = modalState.imgEl.getBoundingClientRect();
    const scale = rendered.height > 0 ? rendered.height / modalState.pageHeight : 1;
    const dyImg = (e.clientY - dragging.startClientY) / scale;
    modalState.offsetPx = Math.max(0, Math.min(room, Math.round(dragging.startOffsetPx + dyImg)));
    updateModalOverlay();
  });
  modalState.overlayEl.addEventListener('pointerup', (e) => {
    if (dragging) {
      modalState.overlayEl.releasePointerCapture(e.pointerId);
      modalState.overlayEl.classList.remove('is-dragging');
      dragging = null;
    }
  });
}

async function openPreviewModal() {
  const url = els.baseUrl.value.trim();
  if (!url) return;
  const device = modalDeviceForPreview();

  els.previewModal.hidden = false;
  document.body.style.overflow = 'hidden';
  renderModalStage({ kind: 'loading' });
  els.previewConfirmBtn.disabled = true;

  try {
    const resp = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, viewport: { width: device.width, height: device.height } }),
    });
    if (!resp.ok) {
      let msg = 'Preview failed (HTTP ' + resp.status + ')';
      try {
        const j = await resp.json();
        msg = j.message || j.error || msg;
      } catch {}
      renderModalStage({ kind: 'error', error: msg });
      return;
    }
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const img = await loadImage(objectUrl);
    // Seed offsetPx from the main form's current state so the modal opens on
    // the user's last pick (or 0 = Top by default).
    const room = Math.max(0, img.naturalHeight - device.height);
    let seedPx = 0;
    if (customSource === 'pixels' && els.pinOffsetPx.value) {
      seedPx = Math.min(room, Math.max(0, Number(els.pinOffsetPx.value) || 0));
    } else {
      const frac = Math.max(0, Math.min(1, Number(els.pinOffset.value) / 100));
      seedPx = Math.round(room * frac);
    }
    modalState = {
      device,
      pageHeight: img.naturalHeight,
      pageWidth: img.naturalWidth,
      viewportH: device.height,
      windowH: modalWindowHeight(device),
      offsetPx: seedPx,
      objectUrl,
    };
    // Update the main form's pageHeightHint so %/px stay in sync after close.
    pageHeightHint = img.naturalHeight;
    renderModalStage({ kind: 'image', img });
    initModalControls();
    els.previewConfirmBtn.disabled = false;
  } catch (err) {
    renderModalStage({ kind: 'error', error: err?.message || 'Preview request failed' });
  }
}

function closePreviewModal() {
  if (modalState?.objectUrl) URL.revokeObjectURL(modalState.objectUrl);
  modalState = null;
  els.previewModal.hidden = true;
  document.body.style.overflow = '';
}

function confirmPreviewModal() {
  if (!modalState) return;
  const room = Math.max(0, modalState.pageHeight - modalState.viewportH);
  const px = modalState.offsetPx;
  // Snap to a preset chip when the value lands cleanly; otherwise land on
  // Custom with the absolute pixel value preserved verbatim (most accurate).
  if (px === 0) {
    setPosition('top');
  } else if (room > 0 && px === room) {
    setPosition('bottom');
  } else if (room > 0 && Math.abs(px - room / 2) <= 1) {
    setPosition('middle');
  } else {
    setPosition('custom');
    els.pinOffsetPx.value = String(px);
    customSource = 'pixels';
    const pct = room > 0 ? Math.round((px / room) * 100) : 0;
    els.pinOffset.value = String(pct);
    els.pinOffsetValue.textContent = String(pct);
    els.positionReadout.textContent = 'Custom ' + px + 'px';
    updatePinPreviewPositions();
  }
  // Persist the modal's pick onto the active queue item (no-op in single mode).
  writeBackActivePosition();
  closePreviewModal();
  updateSubmitLabel();
}

els.previewPickBtn.addEventListener('click', openPreviewModal);
els.previewModalClose.addEventListener('click', closePreviewModal);
els.previewCancelBtn.addEventListener('click', closePreviewModal);
els.previewConfirmBtn.addEventListener('click', confirmPreviewModal);
els.previewModal.addEventListener('click', (e) => {
  if (e.target === els.previewModal) closePreviewModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.previewModal.hidden) closePreviewModal();
});

renderRuns();
// Initial sync — apply the pins-only/frameDelay/concurrency/submit-label
// derivations once on load so the UI reflects the default-checked Desktop chip
// (1 viewport → concurrency=1, single-shot "Capture" label) without waiting
// for the first user interaction.
syncPinsOnlyEnabled();
syncFrameDelayRelevance();
syncConcurrencyToViewports();
syncPinOffsetBlockVisibility();
renderPinPreview();
updateSubmitLabel();
</script>
</body>
</html>`;
}
