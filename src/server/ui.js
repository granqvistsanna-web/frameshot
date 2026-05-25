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
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,300..700,0..100,0..1;1,9..144,300..700,0..100,0..1&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<style>
  :root {
    --paper:        #0c0a08;
    --paper-2:      #100e0c;
    --paper-3:      #15120f;
    --ink:          #efe9dd;
    --ink-2:        #8f897d;
    --ink-3:        #555048;
    --rule:         #221f1a;
    --rule-strong:  #2e2a23;
    --safe:         #d4621a;
    --safe-hot:     #e8732b;
    --safe-glow:    rgba(212, 98, 26, 0.20);
    --ok:           #7ea66c;
    --warn:         #c69a3a;
    --err:          #c54836;
    --display: 'Fraunces', 'Times New Roman', Times, serif;
    --mono:    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;

    /* Reusable variation presets for Fraunces */
    --vf-wordmark: "opsz" 144, "SOFT" 50, "WONK" 0;
    --vf-wordmark-em: "opsz" 144, "SOFT" 100, "WONK" 1;
    --vf-display:  "opsz" 72,  "SOFT" 40, "WONK" 0;
    --vf-caption:  "opsz" 14,  "SOFT" 60, "WONK" 0;
  }

  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html, body {
    margin: 0; padding: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--mono);
    font-size: 12.5px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  /* Analog grain overlay — fixed, non-interactive, soft overlay blend */
  body::before {
    content: '';
    position: fixed; inset: 0;
    pointer-events: none;
    z-index: 100;
    background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.93  0 0 0 0 0.91  0 0 0 0 0.86  0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    mix-blend-mode: overlay;
    opacity: 0.13;
  }

  ::selection { background: var(--safe); color: var(--paper); }

  .layout {
    position: relative;
    display: grid;
    grid-template-columns: 380px 1fr 280px;
    min-height: 100vh;
  }
  @media (max-width: 1180px) { .layout { grid-template-columns: 380px 1fr; } .right-rail { display: none; } }
  @media (max-width: 780px)  { .layout { grid-template-columns: 1fr; } }

  .panel {
    background: linear-gradient(180deg, var(--paper-2), var(--paper) 60%);
    border-right: 1px solid var(--rule);
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .panel.right-rail { border-right: 0; border-left: 1px solid var(--rule); }

  /* ── HEAD ───────────────────────────────────────────── */
  .head {
    padding: 24px 28px 20px;
    border-bottom: 1px solid var(--rule);
    position: relative;
  }
  .build-tag {
    position: absolute;
    top: 26px; right: 28px;
    font-size: 9px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--ink-3);
    padding: 4px 8px 4px 9px;
    border: 1px solid var(--rule);
    border-radius: 1px;
    font-feature-settings: 'tnum', 'zero';
  }
  .build-tag::before {
    content: '';
    display: inline-block;
    width: 5px; height: 5px;
    background: var(--safe);
    margin-right: 8px;
    transform: translateY(-1px);
    border-radius: 50%;
    box-shadow: 0 0 6px var(--safe-glow);
  }
  .wordmark {
    font-family: var(--display);
    font-size: 44px;
    font-weight: 380;
    font-variation-settings: var(--vf-wordmark);
    line-height: 0.92;
    letter-spacing: -0.028em;
    color: var(--ink);
  }
  .wordmark em {
    font-style: italic;
    font-weight: 420;
    font-variation-settings: var(--vf-wordmark-em);
    color: var(--safe);
    letter-spacing: 0;
    margin-left: -0.04em;
    display: inline-block;
    transform: translateY(0.02em);
  }
  .tagline {
    margin-top: 10px;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--ink-2);
  }
  .tagline .dot { color: var(--ink-3); margin: 0 8px; }

  /* ── SECTION LABELS ──────────────────────────────────── */
  .section-label {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 9.5px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.24em;
    color: var(--ink-2);
    margin: 0 0 14px;
  }
  .section-label .n {
    color: var(--ink-3);
    font-feature-settings: 'tnum', 'zero';
    border-right: 1px solid var(--rule);
    padding-right: 10px;
    margin-right: 4px;
  }
  .section-label .rule {
    flex: 1;
    height: 1px;
    background: var(--rule);
  }

  /* ── FORM ────────────────────────────────────────────── */
  form { padding: 24px 28px 28px; }
  .group {
    padding-bottom: 22px;
    margin-bottom: 22px;
    border-bottom: 1px dashed var(--rule);
  }
  .group.no-rule { border-bottom: 0; padding-bottom: 0; margin-bottom: 0; }

  .field { margin-bottom: 14px; }
  .field:last-child { margin-bottom: 0; }

  .field-label {
    display: block;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.20em;
    color: var(--ink-2);
    margin-bottom: 6px;
    font-feature-settings: 'tnum';
  }

  input[type=text], input[type=number], select, textarea {
    width: 100%;
    background: transparent;
    color: var(--ink);
    border: 0;
    border-bottom: 1px solid var(--rule-strong);
    border-radius: 0;
    padding: 6px 0 7px;
    font-family: var(--mono);
    font-size: 13px;
    font-feature-settings: 'tnum', 'zero', 'ss01';
    transition: border-color 220ms, color 220ms, box-shadow 220ms;
  }
  input:hover:not(:focus), select:hover:not(:focus), textarea:hover:not(:focus) {
    border-bottom-color: var(--ink-3);
  }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-bottom-color: var(--safe);
    box-shadow: 0 1px 0 0 var(--safe);
  }
  input::placeholder, textarea::placeholder {
    color: var(--ink-3);
    font-family: var(--display);
    font-variation-settings: "opsz" 14, "SOFT" 60, "WONK" 0;
    font-style: italic;
    font-size: 14px;
    letter-spacing: 0;
  }

  textarea {
    resize: vertical;
    min-height: 60px;
    line-height: 1.6;
    padding: 8px 0 8px;
  }

  /* Custom select arrow */
  select {
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
    background-image:
      linear-gradient(45deg, transparent 50%, var(--ink-2) 50%),
      linear-gradient(135deg, var(--ink-2) 50%, transparent 50%);
    background-position: calc(100% - 11px) calc(50% - 1px), calc(100% - 6px) calc(50% - 1px);
    background-size: 5px 5px;
    background-repeat: no-repeat;
    padding-right: 22px;
  }
  select option { background: var(--paper-2); color: var(--ink); }
  select optgroup {
    background: var(--paper-2);
    color: var(--ink-3);
    font-style: normal;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  /* Range slider — matches the dotted/ink palette */
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
    background: var(--rule-strong);
    border-radius: 0;
  }
  input[type=range].range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -5px;
    background: var(--safe);
    border: 0;
    border-radius: 50%;
    box-shadow: 0 0 8px var(--safe-glow);
    transition: transform 120ms;
  }
  input[type=range].range:hover::-webkit-slider-thumb { transform: scale(1.15); }
  input[type=range].range::-moz-range-track { height: 2px; background: var(--rule-strong); border: 0; }
  input[type=range].range::-moz-range-thumb {
    width: 12px; height: 12px;
    background: var(--safe); border: 0; border-radius: 50%;
    box-shadow: 0 0 8px var(--safe-glow);
  }

  .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .row-3 { display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 14px; }

  /* Toggle-style checkboxes */
  .check {
    display: flex;
    align-items: center;
    gap: 11px;
    cursor: pointer;
    padding: 5px 0;
    font-size: 13px;
    color: var(--ink);
    user-select: none;
  }
  .check input {
    appearance: none;
    -webkit-appearance: none;
    margin: 0;
    width: 28px;
    height: 15px;
    background: var(--paper-3);
    border: 1px solid var(--rule-strong);
    border-radius: 9px;
    position: relative;
    cursor: pointer;
    transition: background 220ms, border-color 220ms;
  }
  .check input::after {
    content: '';
    position: absolute;
    top: 1px; left: 1px;
    width: 11px; height: 11px;
    background: var(--ink-3);
    border-radius: 50%;
    transition: transform 220ms cubic-bezier(.5, 1.6, .4, 1), background 220ms;
  }
  .check input:checked { background: var(--safe-glow); border-color: var(--safe); }
  .check input:checked::after { transform: translateX(13px); background: var(--safe); }
  .check:hover input:not(:checked) { border-color: var(--ink-3); }

  /* Submit */
  .submit-row {
    margin-top: 26px;
    padding-top: 24px;
    border-top: 1px solid var(--rule-strong);
  }
  button.primary {
    width: 100%;
    background: var(--safe);
    color: var(--paper);
    border: 0;
    padding: 14px 18px;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.26em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 180ms, box-shadow 220ms, transform 80ms;
  }
  button.primary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    position: relative;
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
    background: rgba(12, 10, 8, 0.18);
    border: 1px solid rgba(12, 10, 8, 0.28);
    border-radius: 3px;
    font-weight: 500;
    font-size: 10px;
    letter-spacing: 0;
    opacity: 0.85;
    transition: background 180ms, border-color 180ms;
  }
  button.primary:hover:not(:disabled) .kbd {
    background: rgba(12, 10, 8, 0.30);
    border-color: rgba(12, 10, 8, 0.42);
  }
  button.primary:hover:not(:disabled) {
    background: var(--safe-hot);
    box-shadow: 0 0 0 1px var(--safe-hot), 0 0 36px var(--safe-glow);
  }
  button.primary:active:not(:disabled) { transform: translateY(1px); }
  button.primary:disabled { opacity: 0.42; cursor: not-allowed; }

  .help {
    display: block;
    margin-top: 6px;
    font-size: 12px;
    color: var(--ink-3);
    font-style: italic;
    font-family: var(--display);
    font-variation-settings: var(--vf-caption);
    letter-spacing: 0.005em;
    line-height: 1.4;
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
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--ink-2);
  }
  .led {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--ink-3);
    transition: background 200ms, box-shadow 200ms;
  }
  .led.running {
    background: var(--safe);
    box-shadow: 0 0 8px var(--safe), 0 0 16px var(--safe-glow);
    animation: pulse 1.1s ease-in-out infinite;
  }
  .led.ok  { background: var(--ok);  box-shadow: 0 0 6px var(--ok); }
  .led.err { background: var(--err); box-shadow: 0 0 6px var(--err); }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

  /* Bracketed frames — four corner registration marks via background gradients */
  .bracketed {
    --bw: 1px;
    --bl: 14px;
    --bc: var(--ink-3);
    --bp: 0;  /* inset */
    position: relative;
    background-color: var(--paper-2);
    background-image:
      linear-gradient(var(--bc), var(--bc)),
      linear-gradient(var(--bc), var(--bc)),
      linear-gradient(var(--bc), var(--bc)),
      linear-gradient(var(--bc), var(--bc)),
      linear-gradient(var(--bc), var(--bc)),
      linear-gradient(var(--bc), var(--bc)),
      linear-gradient(var(--bc), var(--bc)),
      linear-gradient(var(--bc), var(--bc));
    background-size:
      var(--bl) var(--bw),  var(--bw) var(--bl),
      var(--bl) var(--bw),  var(--bw) var(--bl),
      var(--bl) var(--bw),  var(--bw) var(--bl),
      var(--bl) var(--bw),  var(--bw) var(--bl);
    background-position:
      var(--bp) var(--bp),                   var(--bp) var(--bp),
      calc(100% - var(--bp)) var(--bp),      calc(100% - var(--bp)) var(--bp),
      var(--bp) calc(100% - var(--bp)),      var(--bp) calc(100% - var(--bp)),
      calc(100% - var(--bp)) calc(100% - var(--bp)), calc(100% - var(--bp)) calc(100% - var(--bp));
    background-repeat: no-repeat;
  }

  .log-frame {
    padding: 22px 26px;
    min-height: 130px;
    font-family: var(--mono);
    font-size: 12.5px;
  }

  .log-line {
    display: flex;
    gap: 16px;
    padding: 3px 0;
    color: var(--ink-2);
    font-size: 12px;
    align-items: baseline;
    animation: line-in 280ms cubic-bezier(.2, .7, .2, 1) both;
  }
  @keyframes line-in {
    from { opacity: 0; transform: translateX(-4px); }
    to   { opacity: 1; transform: none; }
  }
  .log-line .ts {
    font-size: 10px;
    color: var(--ink-3);
    letter-spacing: 0.05em;
    font-feature-settings: 'tnum';
    min-width: 60px;
    flex-shrink: 0;
  }
  .log-line .msg { flex: 1; word-break: break-word; }
  .log-line.active { color: var(--ink); }
  .log-line.active .msg::after {
    content: '_';
    margin-left: 3px;
    color: var(--safe);
    animation: blink 0.95s steps(2) infinite;
  }
  @keyframes blink { 50% { opacity: 0; } }
  .log-line.ok   .msg { color: var(--ok); }
  .log-line.warn .msg { color: var(--warn); }
  .log-line.err  .msg { color: var(--err); white-space: pre-wrap; }
  .log-line.idle .msg {
    color: var(--ink-3);
    font-family: var(--display);
    font-variation-settings: var(--vf-display);
    font-size: 17px;
    font-style: italic;
    letter-spacing: 0.002em;
  }

  /* Frame progress bar with tick marks */
  .frame-bar-wrap {
    margin-top: 16px;
    position: relative;
    height: 3px;
    background: var(--rule);
  }
  .frame-bar-fill {
    position: absolute;
    inset: 0 auto 0 0;
    width: 0%;
    background: var(--safe);
    box-shadow: 0 0 8px var(--safe-glow);
    transition: width 220ms cubic-bezier(.4, .2, .2, 1);
  }
  .frame-bar-ticks {
    position: absolute;
    inset: 0;
    background-image: repeating-linear-gradient(90deg, transparent 0 calc(10% - 1px), var(--paper-2) calc(10% - 1px) 10%);
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
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--ink-3);
  }
  .preview-meta .path {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    border: 0;
    background: transparent;
    padding: 0;
    text-align: left;
    transition: color 180ms;
    max-width: 100%;
  }
  .preview-meta .path:hover { color: var(--ink); }
  .preview-meta .where .copied {
    color: var(--ok);
    font-style: italic;
    margin-top: 2px;
    font-family: var(--display);
    font-size: 13px;
    letter-spacing: 0.01em;
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
    color: var(--ink-2);
    border: 1px solid var(--rule-strong);
    padding: 7px 11px;
    font-family: var(--mono);
    font-size: 9.5px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    text-decoration: none;
    cursor: pointer;
    transition: color 180ms, border-color 180ms, background 180ms;
    white-space: nowrap;
  }
  .meta-btn:hover { color: var(--ink); border-color: var(--ink-3); }
  .meta-btn.primary {
    color: var(--paper);
    background: var(--safe);
    border-color: var(--safe);
  }
  .meta-btn.primary:hover {
    background: var(--safe-hot);
    border-color: var(--safe-hot);
    color: var(--paper);
    box-shadow: 0 0 18px var(--safe-glow);
  }
  .meta-btn .arrow { font-family: var(--display); font-style: italic; font-size: 13px; line-height: 1; letter-spacing: 0; }

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
    color: var(--ink-3);
    font-family: var(--display);
    font-variation-settings: "opsz" 96, "SOFT" 70, "WONK" 1;
    font-style: italic;
    font-weight: 360;
    font-size: 30px;
    letter-spacing: -0.005em;
  }

  /* ── RIGHT RAIL ──────────────────────────────────────── */
  .right-rail .rail-head {
    padding: 24px 22px 14px;
    border-bottom: 1px solid var(--rule);
  }
  .right-rail h2 {
    margin: 0;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--ink-2);
    font-weight: 500;
  }
  .right-rail h2 .count {
    color: var(--ink-3);
    margin-left: 8px;
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
    border-bottom: 1px dashed var(--rule);
    transition: background 150ms, padding-left 220ms;
    position: relative;
  }
  .runs li:hover {
    background: var(--paper-3);
    padding-left: 26px;
  }
  .runs li:hover .recall-glyph { opacity: 1; transform: translateX(0); }
  .recall-glyph {
    position: absolute;
    right: 22px;
    top: 16px;
    color: var(--safe);
    font-family: var(--display);
    font-variation-settings: "opsz" 36, "SOFT" 80, "WONK" 1;
    font-style: italic;
    font-size: 22px;
    line-height: 1;
    opacity: 0;
    transform: translateX(-4px);
    transition: opacity 220ms, transform 220ms;
    pointer-events: none;
  }
  .runs li .idx {
    font-size: 9.5px;
    color: var(--ink-3);
    font-feature-settings: 'tnum';
    letter-spacing: 0.18em;
    display: block;
    margin-bottom: 4px;
  }
  .runs li .name {
    font-family: var(--display);
    font-variation-settings: "opsz" 36, "SOFT" 50, "WONK" 0;
    font-weight: 400;
    font-size: 24px;
    color: var(--ink);
    line-height: 1.05;
    margin-bottom: 6px;
    letter-spacing: -0.018em;
  }
  .runs li .name em { font-style: italic; color: var(--safe); }
  .runs li .meta {
    display: block;
    color: var(--ink-2);
    font-size: 10.5px;
    line-height: 1.5;
    word-break: break-all;
    font-feature-settings: 'tnum';
  }
  .runs li .meta .dot { color: var(--ink-3); margin: 0 6px; }
  .runs li.empty {
    color: var(--ink-3);
    cursor: default;
    font-style: italic;
    font-family: var(--display);
    font-variation-settings: "opsz" 24, "SOFT" 70, "WONK" 0;
    font-size: 19px;
    padding: 22px;
    border: 0;
    line-height: 1.3;
    letter-spacing: -0.005em;
  }
  .runs li.empty:hover { background: transparent; padding-left: 22px; }

  .rail-foot {
    padding: 14px 22px 22px;
    border-top: 1px solid var(--rule);
  }
  button.ghost {
    background: transparent;
    color: var(--ink-2);
    border: 1px solid var(--rule-strong);
    padding: 9px 12px;
    font-family: var(--mono);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    cursor: pointer;
    width: 100%;
    transition: color 180ms, border-color 180ms;
  }
  button.ghost:hover { color: var(--ink); border-color: var(--ink-3); }

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
    background: var(--paper-3);
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
    border: 1px solid var(--rule-strong);
    color: var(--ink-3);
    width: 22px; height: 22px;
    padding: 0;
    font-size: 14px;
    font-family: var(--mono);
    line-height: 1;
    cursor: pointer;
    transition: color 180ms, border-color 180ms;
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
    color: var(--ink-3);
    border: 0;
    border-bottom: 1px solid transparent;
    padding: 5px 12px 7px;
    font-family: var(--mono);
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.20em;
    cursor: pointer;
    margin-bottom: -1px;
    transition: color 180ms, border-color 180ms;
  }
  .region-tab:hover { color: var(--ink-2); }
  .region-tab.active { color: var(--safe); border-bottom-color: var(--safe); }
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
    color: var(--ink-2);
    border: 1px dashed var(--rule-strong);
    padding: 10px 14px;
    font-family: var(--mono);
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    cursor: pointer;
    width: 100%;
    transition: color 180ms, border-color 180ms, background 180ms;
  }
  .region-add:hover { color: var(--safe); border-color: var(--safe); background: var(--safe-glow); }

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
    background: var(--paper-3);
    cursor: pointer;
    font-size: 12px;
    color: var(--ink-2);
    transition: color 160ms, border-color 160ms, background 160ms;
    user-select: none;
  }
  .vp-chip:hover { color: var(--ink); border-color: var(--rule-strong); }
  .vp-chip input {
    appearance: none;
    -webkit-appearance: none;
    width: 12px; height: 12px;
    border: 1px solid var(--rule-strong);
    background: transparent;
    margin: 0;
    cursor: pointer;
    position: relative;
    flex: none;
  }
  .vp-chip input:checked {
    background: var(--safe);
    border-color: var(--safe);
    box-shadow: 0 0 6px var(--safe-glow);
  }
  .vp-chip input:checked::after {
    content: '';
    position: absolute;
    top: 1px; left: 4px;
    width: 3px; height: 6px;
    border: solid var(--paper);
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
  }
  .vp-chip:has(input:checked) {
    color: var(--ink);
    border-color: var(--safe);
    background: var(--safe-glow);
  }
  .vp-chip-meta {
    margin-left: auto;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--ink-3);
    letter-spacing: 0.04em;
  }
  .vp-chip:has(input:checked) .vp-chip-meta { color: var(--ink-2); }
  .vp-section-label {
    font-family: var(--mono);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--ink-3);
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
    color: var(--safe);
    background: var(--safe-glow);
    border: 1px solid var(--safe);
    padding: 3px 9px;
    min-width: 28px;
    text-align: center;
  }

  /* Tasteful scrollbar in the runs rail */
  .runs::-webkit-scrollbar { width: 8px; }
  .runs::-webkit-scrollbar-track { background: transparent; }
  .runs::-webkit-scrollbar-thumb { background: var(--rule-strong); border: 2px solid var(--paper-2); border-radius: 0; }
  .runs::-webkit-scrollbar-thumb:hover { background: var(--ink-3); }

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
          <div class="vp-section-label">Pinterest</div>
          <div class="vp-chips" id="vpPin">
            <label class="vp-chip"><input type="checkbox" data-preset="pinStandard"><span>Standard pin</span><span class="vp-chip-meta">1000×1500</span></label>
            <label class="vp-chip"><input type="checkbox" data-preset="pinSquare"><span>Square pin</span><span class="vp-chip-meta">1000×1000</span></label>
            <label class="vp-chip"><input type="checkbox" data-preset="pinLong"><span>Long pin</span><span class="vp-chip-meta">1000×2100</span></label>
            <label class="vp-chip"><input type="checkbox" data-preset="pinIdea"><span>Idea / video</span><span class="vp-chip-meta">1080×1920</span></label>
          </div>
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
  desktop:     { name: 'desktop',     width: 1440, height: 900 },
  laptop:      { name: 'laptop',      width: 1280, height: 800 },
  tablet:      { name: 'tablet',      width: 768,  height: 1024 },
  mobile:      { name: 'mobile',      width: 375,  height: 667 },
  pinStandard: { name: 'pin-standard', width: 1000, height: 1500 },
  pinSquare:   { name: 'pin-square',   width: 1000, height: 1000 },
  pinLong:     { name: 'pin-long',     width: 1000, height: 2100 },
  pinIdea:     { name: 'pin-idea',     width: 1080, height: 1920 },
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
  runs: $('runs'),
  railCount: $('rail-count'),
  clearRuns: $('clear-runs'),
  led: $('led'),
  ledText: $('led-text'),
};

const platform = navigator.userAgentData?.platform ?? navigator.platform ?? '';
if (!/mac/i.test(platform)) els.resultReveal.hidden = true;

// Collect every preset checkbox once — used by readForm, fillForm, and the
// concurrency-cap helper. Querying live keeps things simple; the chip grid is
// static markup so the list never changes after first render.
const vpCheckboxes = () => [
  ...els.vpDevice.querySelectorAll('input[type=checkbox]'),
  ...els.vpPin.querySelectorAll('input[type=checkbox]'),
];

function selectedViewportCount() {
  let n = vpCheckboxes().filter((cb) => cb.checked).length;
  if (els.customViewportToggle.checked) n += 1;
  return n;
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

for (const cb of vpCheckboxes()) {
  cb.addEventListener('change', clampConcurrencyToViewports);
}

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
  // Build the viewports[] array from checked preset chips + (optionally) the
  // custom viewport. Always send plural; if exactly one is selected the
  // server's schema collapses that to the same downstream shape.
  const viewports = vpCheckboxes()
    .filter((cb) => cb.checked)
    .map((cb) => PRESETS[cb.dataset.preset]);
  if (els.customViewportToggle.checked) {
    viewports.push({
      name: els.vpName.value.trim() || 'custom',
      width: Number(els.vpWidth.value),
      height: Number(els.vpHeight.value),
    });
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
  // legacy single viewport field (pre-multi-viewport runs) or the new
  // viewports array. Treat the legacy field as a one-item array so old
  // stored runs replay cleanly.
  const savedViewports = saved.viewports
    ?? (saved.viewport ? [saved.viewport] : []);
  for (const cb of vpCheckboxes()) cb.checked = false;
  els.customViewportToggle.checked = false;
  els.customViewport.hidden = true;
  for (const vp of savedViewports) {
    const matched = Object.entries(PRESETS).find(([, p]) =>
      p.width === vp.width && p.height === vp.height && p.name === vp.name);
    if (matched) {
      const cb = [...els.vpDevice.querySelectorAll('input'), ...els.vpPin.querySelectorAll('input')]
        .find((el) => el.dataset.preset === matched[0]);
      if (cb) cb.checked = true;
    } else {
      // First (and only) non-preset entry becomes the custom row. Multiple
      // custom viewports per run aren't supported in the UI yet — last wins.
      els.customViewportToggle.checked = true;
      els.customViewport.hidden = false;
      els.vpName.value = vp.name;
      els.vpWidth.value = vp.width;
      els.vpHeight.value = vp.height;
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
    meta.innerHTML = shortHost(run.baseUrl) + run.page.path + dim + run.viewport.name + ' ' + run.viewport.width + '×' + run.viewport.height;

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
    !(r.baseUrl === input.baseUrl && r.page.path === input.page.path && r.viewport.name === input.viewport.name));
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

function showResult(urlPath, outputPath) {
  lastOutputPath = outputPath;
  els.result.classList.remove('empty');
  els.result.innerHTML = '';
  els.resultMeta.hidden = false;
  els.resultPath.textContent = outputPath;
  els.resultOpen.href = urlPath;
  els.resultDownload.href = urlPath;
  els.resultDownload.setAttribute('download', deriveDownloadName(outputPath));
  const img = new Image();
  img.src = urlPath + '?t=' + Date.now();
  img.alt = 'capture';
  els.result.appendChild(img);
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
  setLed('running', 'capturing');
  const vpCount = input.viewports.length;
  const parallel = vpCount > 1;
  if (parallel) {
    logLine('begin · ' + vpCount + ' viewports · up to ' + input.concurrency + ' in parallel');
  } else {
    logLine('begin · ' + shortHost(input.baseUrl) + input.page.path);
  }

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
    setSubmitting(false);
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
    setSubmitting(false);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let succeeded = false;

  try {
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
          const last = outputs[outputs.length - 1];
          if (last) showResult(last.urlPath, last.outputPath);
        } else if (event.type === 'error') {
          logLine(event.message, 'err');
          setLed('err', 'error');
        }
      }
    }
  } catch (err) {
    logLine('stream · ' + err.message, 'err');
    setLed('err', 'error');
  }

  if (succeeded) recordRun(input);
  setSubmitting(false);
});

renderRuns();
</script>
</body>
</html>`;
}
