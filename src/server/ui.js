// src/server/ui.js
// Single-page UI served at GET /. Inline HTML/CSS/JS — no build, no external
// requests beyond the Google Fonts stylesheet (gracefully degrades to system
// serif/mono when offline).

export function renderUi() {
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
    --accent:       #FF5C1B;
    --accent-hot:   #FF7338;
    --accent-soft:  rgba(255, 92, 27, 0.14);
    --accent-line:  rgba(255, 92, 27, 0.35);
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
    padding: 26px 28px 22px;
    border-bottom: 1px solid var(--rule);
    position: relative;
    overflow: hidden;
  }
  .head::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(circle at 50% -20%, rgba(255, 92, 27, 0.09), transparent 70%);
    z-index: 0;
  }
  .head > * { position: relative; z-index: 1; }

  .build-tag {
    position: absolute;
    top: 26px; right: 28px;
    z-index: 2;
    font-family: var(--mono);
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--fg-2);
    background: var(--surface-2);
    padding: 4px 10px 4px 9px;
    border: 1px solid var(--rule-2);
    border-radius: 999px;
    font-feature-settings: 'tnum', 'zero';
  }
  .build-tag::before {
    content: '';
    display: inline-block;
    width: 5px; height: 5px;
    background: var(--ok);
    margin-right: 7px;
    transform: translateY(-1px);
    border-radius: 50%;
    box-shadow: 0 0 6px rgba(111, 207, 151, 0.45);
  }

  .wordmark {
    font-family: var(--sans);
    font-size: 38px;
    font-weight: 600;
    line-height: 0.95;
    letter-spacing: -0.025em;
    color: var(--fg);
  }
  .wordmark em {
    font-style: normal;
    font-weight: 600;
    color: var(--accent);
    margin-left: -0.02em;
    display: inline-block;
    text-shadow: 0 0 12px var(--accent-soft);
  }

  .tagline {
    margin-top: 11px;
    font-family: var(--mono);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--fg-2);
  }
  .tagline .dot { color: var(--fg-3); margin: 0 8px; }

  /* ── SECTION LABELS ──────────────────────────────────── */
  .section-label {
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: var(--sans);
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--fg-2);
    margin: 0 0 14px;
  }
  .section-label .n {
    color: var(--fg-3);
    font-family: var(--mono);
    font-feature-settings: 'tnum', 'zero';
    border-right: 1px solid var(--rule);
    padding-right: 10px;
    margin-right: 4px;
  }
  .section-label .rule { display: none; }

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
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
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

  /* Submit */
  .submit-row {
    margin-top: 26px;
    padding-top: 24px;
    border-top: 1px solid var(--rule);
  }
  button.primary {
    width: 100%;
    background: var(--accent);
    color: var(--bg);
    border: 0;
    border-radius: 6px;
    padding: 12px 18px;
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.005em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.20),
      0 0 0 1px var(--accent);
    transition: background 150ms ease-out, box-shadow 150ms ease-out, transform 80ms ease-out;
  }
  button.primary .kbd {
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    background: rgba(10, 10, 11, 0.20);
    border-radius: 4px;
    font-family: var(--mono);
    font-weight: 500;
    font-size: 10px;
    letter-spacing: 0;
    color: var(--bg);
    transition: background 150ms ease-out;
  }
  button.primary:hover:not(:disabled) {
    background: var(--accent-hot);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.18),
      0 0 0 1px var(--accent-hot),
      0 0 0 3px var(--accent-soft);
  }
  button.primary:hover:not(:disabled) .kbd { background: rgba(10, 10, 11, 0.30); }
  button.primary:active:not(:disabled) { transform: translateY(1px); }
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
    font-family: var(--mono);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--fg-2);
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
    font-family: var(--mono);
    font-size: 12px;
  }

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
    font-style: normal;
    font-weight: 400;
    font-size: 14px;
    letter-spacing: 0;
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
    font-family: var(--mono);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
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
    padding: 7px 11px;
    font-family: var(--sans);
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.12em;
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
    font-style: normal;
    font-weight: 300;
    font-size: 22px;
    letter-spacing: -0.005em;
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
    font-family: var(--mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
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
    padding: 6px 8px;
    font-size: 9px;
    letter-spacing: 0.10em;
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
    font-size: 18px;
    color: var(--fg);
    line-height: 1.15;
    margin-bottom: 6px;
    letter-spacing: -0.015em;
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
    font-style: normal;
    font-family: var(--sans);
    font-weight: 400;
    font-size: 14px;
    padding: 22px;
    border: 0;
    line-height: 1.5;
    letter-spacing: 0;
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
    padding: 7px 11px;
    font-family: var(--sans);
    font-weight: 500;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
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

  /* ── REGIONS ─────────────────────────────────────────── */
  .regions-list:not(:empty) { margin-bottom: 12px; }
  .region-row {
    padding: 12px 14px 14px;
    margin-bottom: 10px;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: var(--surface-2);
    position: relative;
    animation: enter 380ms cubic-bezier(.2, .65, .2, 1) both;
  }
  .region-row:last-child { margin-bottom: 0; }
  .region-row-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .region-row-head .region-name {
    flex: 1;
    font-size: 12.5px;
    padding-top: 0;
    padding-bottom: 5px;
  }
  .region-del {
    flex: none;
    background: transparent;
    border: 1px solid var(--rule-2);
    border-radius: 4px;
    color: var(--fg-3);
    width: 22px; height: 22px;
    padding: 0;
    font-size: 14px;
    font-family: var(--mono);
    line-height: 1;
    cursor: pointer;
    transition: color 150ms ease-out, border-color 150ms ease-out;
  }
  .region-del:hover { color: var(--err); border-color: var(--err); }
  .region-mode-tabs {
    display: flex;
    gap: 0;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--rule);
  }
  .region-tab {
    background: transparent;
    color: var(--fg-3);
    border: 0;
    border-bottom: 1px solid transparent;
    padding: 5px 12px 7px;
    font-family: var(--mono);
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    cursor: pointer;
    margin-bottom: -1px;
    transition: color 150ms ease-out, border-color 150ms ease-out;
  }
  .region-tab:hover { color: var(--fg-2); }
  .region-tab.active { color: var(--fg); border-bottom-color: var(--accent); }
  .region-mode { margin-bottom: 10px; }
  .region-mode-anchor .row-2 { gap: 12px; }
  .region-padding-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  .region-padding-row .field-label { margin: 0; flex-shrink: 0; }
  .region-padding-row .region-padding { width: 80px; flex: none; }
  .region-add {
    background: transparent;
    color: var(--fg-2);
    border: 1px dashed var(--rule-2);
    border-radius: 6px;
    padding: 10px 14px;
    font-family: var(--mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    cursor: pointer;
    width: 100%;
    transition: color 150ms ease-out, border-color 150ms ease-out, background 150ms ease-out;
  }
  .region-add:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }

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
    font-family: var(--mono);
    font-size: 12px;
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
    font-family: var(--mono);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
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

  /* Tasteful scrollbar in the runs rail */
  .runs::-webkit-scrollbar { width: 8px; }
  .runs::-webkit-scrollbar-track { background: transparent; }
  .runs::-webkit-scrollbar-thumb { background: var(--rule-2); border: 2px solid transparent; background-clip: padding-box; border-radius: 0; }
  .runs::-webkit-scrollbar-thumb:hover { background: var(--fg-3); background-clip: padding-box; }

</style>
</head>
<body>
<div class="layout">

  <!-- ── LEFT PANEL ── -->
  <aside class="panel">
    <div class="head">
      <div class="build-tag">v0.1 · local</div>
      <div class="wordmark">framershot<em>.</em></div>
      <div class="tagline">retina capture <span class="dot">·</span> framer sites</div>
    </div>

    <form id="capture-form" autocomplete="off" spellcheck="false">

      <div class="group">
        <div class="section-label"><span class="n">01</span> Source <span class="rule"></span></div>
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
      </div>

      <div class="group">
        <div class="section-label"><span class="n">02</span> Viewports <span class="rule"></span></div>
        <div class="field">
          <div class="vp-section-label">Device</div>
          <div class="vp-chips" id="vpDevice">
            <label class="vp-chip"><input type="checkbox" data-preset="desktop" checked><span>Desktop</span><span class="vp-chip-meta">1440×900</span></label>
            <label class="vp-chip"><input type="checkbox" data-preset="laptop"><span>Laptop</span><span class="vp-chip-meta">1280×800</span></label>
            <label class="vp-chip"><input type="checkbox" data-preset="tablet"><span>Tablet</span><span class="vp-chip-meta">768×1024</span></label>
            <label class="vp-chip"><input type="checkbox" data-preset="mobile"><span>Mobile</span><span class="vp-chip-meta">375×667</span></label>
          </div>
          <div class="vp-section-label">Pinterest · ratio × each device</div>
          <div class="vp-chips" id="vpPin">
            <label class="vp-chip"><input type="checkbox" data-ratio="1.5"   data-slug="2x3"><span>Standard pin</span><span class="vp-chip-meta">2:3</span></label>
            <label class="vp-chip"><input type="checkbox" data-ratio="1.0"   data-slug="1x1"><span>Square pin</span><span class="vp-chip-meta">1:1</span></label>
            <label class="vp-chip"><input type="checkbox" data-ratio="2.1"   data-slug="1x2-1"><span>Long pin</span><span class="vp-chip-meta">1:2.1</span></label>
            <label class="vp-chip"><input type="checkbox" data-ratio="1.778" data-slug="9x16"><span>Idea / video</span><span class="vp-chip-meta">9:16</span></label>
          </div>
          <label class="vp-chip" style="grid-template-columns:none;margin-top:6px;"><input type="checkbox" id="pinsOnlyToggle"><span>Pins only · skip full-page for these devices</span></label>
          <div class="vp-section-label">Custom</div>
          <label class="vp-chip" style="grid-template-columns:none;"><input type="checkbox" id="customViewportToggle"><span>Add a custom viewport</span></label>
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
            <input id="concurrency" type="range" min="1" max="8" value="1" class="range">
            <div class="concurrency-badge"><span id="concurrencyValue">1</span>×</div>
          </div>
          <span class="help">browsers in parallel · capped to viewport count · each ≈ 400 MB</span>
        </div>
        <div class="field">
          <label class="field-label" for="dsr">Density · ×</label>
          <input id="dsr" type="number" min="1" max="3" step="0.5" value="2">
          <span class="help">retina = 2 · range 1 – 3</span>
        </div>
        <div class="field">
          <div class="row-2">
            <div>
              <label class="field-label" for="format">Format</label>
              <select id="format">
                <option value="png">PNG · lossless</option>
                <option value="webp" selected>WebP · 10× smaller</option>
                <option value="jpeg">JPEG</option>
              </select>
            </div>
            <div id="qualityField">
              <label class="field-label" for="quality">Quality · <span id="qualityValue">85</span></label>
              <input id="quality" type="range" min="1" max="100" value="85" class="range">
            </div>
          </div>
          <span class="help">retina PNGs are 10–15 MB · WebP @ 85 ≈ 8× smaller, visually identical for screenshots</span>
        </div>
      </div>

      <div class="group">
        <div class="section-label"><span class="n">03</span> Prepare <span class="rule"></span></div>
        <div class="field">
          <label class="field-label" for="hide">Hide selectors</label>
          <textarea id="hide" placeholder="nav.sticky&#10;#cookie-banner&#10;.intercom-widget"></textarea>
          <span class="help">one css selector per line</span>
        </div>
        <div class="field">
          <label class="check"><input type="checkbox" id="animations" checked> <span>Disable Framer animations</span></label>
          <label class="check"><input type="checkbox" id="scrollPrime" checked> <span>Scroll prime · lazy load</span></label>
        </div>
        <div class="field">
          <div class="row-2">
            <div>
              <label class="field-label" for="extraDelay">Settle delay · ms</label>
              <input id="extraDelay" type="number" min="0" step="50" value="0">
            </div>
            <div>
              <label class="field-label" for="frameDelay">Per-frame · ms</label>
              <input id="frameDelay" type="number" min="0" step="50" value="0">
            </div>
          </div>
          <span class="help">settle = once before capture · per-frame = each scroll step (full-page only)</span>
        </div>
      </div>

      <div class="group">
        <div class="section-label"><span class="n">04</span> Regions <span class="rule"></span></div>
        <div id="regions-list" class="regions-list"></div>
        <button type="button" id="add-region" class="region-add">+ Add region</button>
        <span class="help">leave empty for full-page only · adding regions also captures the full page as <code>full.png</code></span>
      </div>

      <div class="submit-row">
        <button type="submit" class="primary" id="submit-btn"><span id="submit-label">Capture</span><span class="kbd">↵</span></button>
      </div>
    </form>
  </aside>

  <!-- ── MAIN ── -->
  <main class="preview">

    <div class="log-shell">
      <div class="status-head">
        <div class="section-label"><span class="n">05</span> Exposure log <span class="rule"></span></div>
        <span class="led-wrap"><span class="led" id="led"></span><span id="led-text">idle</span></span>
      </div>
      <div class="bracketed log-frame" id="status">
        <div class="log-line idle"><span class="ts">--:--:--</span><span class="msg">awaiting source · fill the panel to begin</span></div>
      </div>
    </div>

    <div class="preview-shell">
      <div class="section-label"><span class="n">06</span> Plate <span class="rule"></span></div>
      <div class="preview-meta" id="result-meta" hidden>
        <div class="where">
          <span class="label">Saved to · click to copy path</span>
          <button class="path" id="result-path" type="button" title="copy full path"></button>
        </div>
        <div class="actions">
          <a class="meta-btn primary" id="result-download" download><span class="arrow">↓</span> Download</a>
          <button class="meta-btn" id="result-reveal" type="button">Reveal</button>
          <a class="meta-btn" id="result-open" target="_blank" rel="noopener">Open <span class="arrow">↗</span></a>
        </div>
      </div>
      <div class="bracketed preview-frame empty" id="result">no exposure yet</div>
      <div id="gallery-actions" class="gallery-actions" hidden>
        <div class="summary">Run output · <span class="count" id="gallery-count">0</span> files</div>
        <button class="meta-btn primary" id="download-all" type="button"><span class="arrow">↓</span> Download all · zip</button>
      </div>
      <div id="result-gallery" class="gallery-grid" hidden></div>
    </div>

  </main>

  <!-- ── RIGHT RAIL ── -->
  <aside class="panel right-rail">
    <div class="rail-head">
      <h2>Recent exposures<span class="count" id="rail-count"></span></h2>
    </div>
    <ul id="runs" class="runs"><li class="empty">no plates yet · captures appear here</li></ul>
    <div class="rail-foot">
      <button class="ghost" id="clear-runs" type="button">Clear archive</button>
    </div>
  </aside>

</div>

<script type="module">
const PRESETS = {
  desktop: { name: 'desktop', width: 1440, height: 900 },
  laptop:  { name: 'laptop',  width: 1280, height: 800 },
  tablet:  { name: 'tablet',  width: 768,  height: 1024 },
  mobile:  { name: 'mobile',  width: 375,  height: 667 },
};
const STORAGE_KEY = 'framershot.recentRuns';
const MAX_RUNS = 12;

const $ = (id) => document.getElementById(id);
const els = {
  form: $('capture-form'),
  baseUrl: $('baseUrl'),
  pagePath: $('pagePath'),
  pageName: $('pageName'),
  vpDevice: $('vpDevice'),
  vpPin: $('vpPin'),
  pinsOnlyToggle: $('pinsOnlyToggle'),
  customViewport: $('customViewport'),
  customViewportToggle: $('customViewportToggle'),
  vpName: $('vpName'), vpWidth: $('vpWidth'), vpHeight: $('vpHeight'),
  concurrency: $('concurrency'),
  concurrencyValue: $('concurrencyValue'),
  dsr: $('dsr'),
  format: $('format'),
  quality: $('quality'),
  qualityValue: $('qualityValue'),
  qualityField: $('qualityField'),
  hide: $('hide'),
  animations: $('animations'),
  scrollPrime: $('scrollPrime'),
  extraDelay: $('extraDelay'),
  frameDelay: $('frameDelay'),
  regionsList: $('regions-list'),
  addRegion: $('add-region'),
  submit: $('submit-btn'),
  submitLabel: $('submit-label'),
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
// user sees should reflect what'll actually run).
function clampConcurrencyToViewports() {
  const cap = Math.max(1, selectedViewportCount());
  if (Number(els.concurrency.value) > cap) {
    els.concurrency.value = cap;
    els.concurrencyValue.textContent = cap;
  }
}

els.customViewportToggle.addEventListener('change', () => {
  els.customViewport.hidden = !els.customViewportToggle.checked;
  clampConcurrencyToViewports();
});

for (const cb of allVpCheckboxes()) {
  cb.addEventListener('change', clampConcurrencyToViewports);
}
els.pinsOnlyToggle.addEventListener('change', clampConcurrencyToViewports);

els.concurrency.addEventListener('input', () => {
  els.concurrencyValue.textContent = els.concurrency.value;
});

// Quality control only applies to lossy codecs — PNG has no quality knob, so
// hide the slider when png is picked. Keep the stored value intact so a flip
// back to webp/jpeg restores the last setting without resetting to 85.
function syncQualityVisibility() {
  els.qualityField.hidden = els.format.value === 'png';
}
els.format.addEventListener('change', syncQualityVisibility);
els.quality.addEventListener('input', () => {
  els.qualityValue.textContent = els.quality.value;
});
syncQualityVisibility();

// ── Regions ────────────────────────────────────────────────
function buildRegionRow(initial = {}) {
  const row = document.createElement('div');
  row.className = 'region-row';
  row.innerHTML = \`
    <div class="region-row-head">
      <input type="text" class="region-name" placeholder="region name">
      <button type="button" class="region-del" title="remove region">×</button>
    </div>
    <div class="region-mode-tabs">
      <button type="button" class="region-tab active" data-mode="selector">CSS selector</button>
      <button type="button" class="region-tab" data-mode="anchor">From → To</button>
    </div>
    <div class="region-mode region-mode-selector">
      <input type="text" class="region-selector" placeholder="#hero, .pricing">
    </div>
    <div class="region-mode region-mode-anchor" hidden>
      <div class="row-2">
        <input type="text" class="region-from" placeholder="from · #hero">
        <input type="text" class="region-to" placeholder="to · #cta">
      </div>
    </div>
    <div class="region-padding-row">
      <label class="field-label">Padding · px</label>
      <input type="number" class="region-padding" min="0" value="0">
    </div>
  \`;

  row.querySelector('.region-del').addEventListener('click', () => row.remove());

  const tabs = row.querySelectorAll('.region-tab');
  const modes = {
    selector: row.querySelector('.region-mode-selector'),
    anchor: row.querySelector('.region-mode-anchor'),
  };
  const activateTab = (mode) => {
    tabs.forEach((tt) => tt.classList.toggle('active', tt.dataset.mode === mode));
    modes.selector.hidden = mode !== 'selector';
    modes.anchor.hidden = mode !== 'anchor';
  };
  tabs.forEach((t) => t.addEventListener('click', () => activateTab(t.dataset.mode)));

  if (initial.name) row.querySelector('.region-name').value = initial.name;
  if (initial.from || initial.to) {
    activateTab('anchor');
    if (initial.from) row.querySelector('.region-from').value = initial.from;
    if (initial.to)   row.querySelector('.region-to').value   = initial.to;
  } else if (initial.selector) {
    row.querySelector('.region-selector').value = initial.selector;
  }
  if (typeof initial.padding === 'number') {
    row.querySelector('.region-padding').value = initial.padding;
  }
  return row;
}

function addRegionRow(initial) {
  els.regionsList.appendChild(buildRegionRow(initial));
}
function clearRegions() { els.regionsList.innerHTML = ''; }

function readRegions() {
  const out = [];
  els.regionsList.querySelectorAll('.region-row').forEach((row) => {
    const name = row.querySelector('.region-name').value.trim();
    if (!name) return;
    const mode = row.querySelector('.region-tab.active').dataset.mode;
    const padding = Number(row.querySelector('.region-padding').value) || 0;
    if (mode === 'selector') {
      const selector = row.querySelector('.region-selector').value.trim();
      if (!selector) return;
      out.push({ name, selector, padding });
    } else {
      const from = row.querySelector('.region-from').value.trim();
      const to   = row.querySelector('.region-to').value.trim();
      if (!from || !to) return;
      out.push({ name, from, to, padding });
    }
  });
  return out;
}

els.addRegion.addEventListener('click', () => addRegionRow());

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
  const ratios = ratioCheckboxes()
    .filter((cb) => cb.checked)
    .map((cb) => ({ slug: cb.dataset.slug, ratio: Number(cb.dataset.ratio) }));
  const skipFullPage = els.pinsOnlyToggle.checked && ratios.length > 0;
  const viewports = [];
  for (const dev of devices) {
    if (!skipFullPage) viewports.push(dev);
    for (const r of ratios) {
      viewports.push({
        name: dev.name + '-' + r.slug,
        width: dev.width,
        height: dev.height,
        pinHeight: Math.round(dev.width * r.ratio),
      });
    }
  }
  const hideLines = els.hide.value.split('\\n').map((s) => s.trim()).filter(Boolean);
  const regions = readRegions();
  return {
    baseUrl: els.baseUrl.value.trim(),
    page: { path: els.pagePath.value.trim() || '/', name: els.pageName.value.trim() || 'home' },
    viewports,
    concurrency: Number(els.concurrency.value) || 1,
    deviceScaleFactor: Number(els.dsr.value),
    format: els.format.value,
    quality: Number(els.quality.value) || 85,
    prepare: {
      animations: els.animations.checked,
      scrollPrime: els.scrollPrime.checked,
      hide: hideLines,
      extraDelay: Number(els.extraDelay.value) || 0,
      frameDelay: Number(els.frameDelay.value) || 0,
    },
    ...(regions.length > 0 ? { regions } : {}),
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
  for (const vp of savedViewports) {
    if (vp.pinHeight === undefined) continue;
    for (const cb of ratioCheckboxes()) {
      if (vp.name.endsWith('-' + cb.dataset.slug)) cb.checked = true;
    }
  }
  // Derive pins-only: the run is pins-only iff every saved entry is a pin
  // entry (i.e. every entry has pinHeight set) AND at least one pin entry
  // exists. Avoids false positives on legacy/full-page-only runs.
  const hasPin = savedViewports.some((vp) => vp.pinHeight !== undefined);
  const allPin = savedViewports.every((vp) => vp.pinHeight !== undefined);
  els.pinsOnlyToggle.checked = hasPin && allPin;
  // Pass 2 — restore device-chip selections from the unique device roots
  // (pin entries strip the trailing -slug to recover the underlying device).
  // The Set collapses duplicates so desktop + desktop-2x3 toggle the desktop
  // chip exactly once.
  const deviceRoots = new Map(); // rootName → { name, width, height }
  for (const vp of savedViewports) {
    let rootName = vp.name;
    if (vp.pinHeight !== undefined) {
      const slug = ratioCheckboxes().map((cb) => cb.dataset.slug)
        .find((s) => vp.name.endsWith('-' + s));
      if (slug) rootName = vp.name.slice(0, -('-' + slug).length);
    }
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
  if (typeof saved.concurrency === 'number') {
    els.concurrency.value = saved.concurrency;
    els.concurrencyValue.textContent = saved.concurrency;
  }
  clampConcurrencyToViewports();

  els.dsr.value = saved.deviceScaleFactor;
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
  els.extraDelay.value = saved.prepare?.extraDelay ?? 0;
  els.frameDelay.value = saved.prepare?.frameDelay ?? 0;
  clearRegions();
  (saved.regions ?? []).forEach((r) => addRegionRow(r));
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
function renderRuns() {
  const runs = loadRuns();
  els.runs.innerHTML = '';
  els.railCount.textContent = runs.length ? '· ' + String(runs.length).padStart(2, '0') : '';
  if (runs.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'no plates yet · captures appear here';
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
    const dim = '<span class="dot">·</span>';
    // Legacy entries (pre-multi-viewport) carried a single viewport; new
    // entries carry viewports[]. Render either gracefully.
    const vps = run.viewports ?? (run.viewport ? [run.viewport] : []);
    let vpSummary;
    if (vps.length === 0) vpSummary = '';
    else if (vps.length === 1) vpSummary = vps[0].name + ' ' + vps[0].width + '×' + vps[0].height;
    else vpSummary = vps.length + ' viewports';
    meta.innerHTML = shortHost(run.baseUrl) + run.page.path + (vpSummary ? dim + vpSummary : '');

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
}

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

// Tile label: prefer "viewport · region" when both exist; fall back to whichever
// is present. The full-page-with-regions entry only has viewportName, so it
// renders as just the viewport name — distinguishable from the region tiles
// because regions add the " · <name>" suffix.
function tileLabel(o) {
  if (o.viewportName && o.regionName) {
    return o.viewportName + ' <span class="tag">' + o.regionName + '</span>';
  }
  return o.viewportName || o.regionName || 'capture';
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
        '<div class="tile-label">' + tileLabel(o) + '</div>' +
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

function showResults(outputs) {
  currentOutputs = outputs;
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
  btn.innerHTML = 'Bundling…';
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

function setSubmitting(on) {
  els.submit.disabled = on;
  els.submitLabel.textContent = on ? 'Capturing…' : 'Capture';
}

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = readForm();
  if (!input.baseUrl) return;

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
        } else if (event.type === 'done') {
          succeeded = true;
          const active = els.status.querySelector('.log-line.active');
          if (active) active.classList.remove('active');
          const outputs = event.outputs || [];
          for (const o of outputs) {
            const tag = parallel && o.viewportName ? '[' + o.viewportName + '] ' : '';
            logLine('done · ' + tag + o.outputPath, 'ok');
          }
          setLed('ok', 'ready');
          showResults(outputs);
        } else if (event.type === 'error') {
          logLine(event.message, 'err');
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
  }
});

renderRuns();
</script>
</body>
</html>`;
}
