// ============================================================================
// PROGRAMMATIC COLOR — ColorBox
// Inspired by ColorBox.io & Lyft's approach to color
// Procedurally generated accessible color palettes with HSL curve control
// Pure vanilla JS + Canvas API, zero dependencies
// ============================================================================

const ColorBoxSection = (() => {

  let container, running = false, animFrameId = null;
  let dpr = 1;

  // --- State -----------------------------------------------------------------

  let steps = 12;
  let perceptualCorrection = false;
  let palette = []; // Array of { h, s, l, hex, rgb }

  // Bezier control points for each curve: [cp1x, cp1y, cp2x, cp2y] normalized 0-1
  // x = step position (0-1), y = value (0-1 normalized to range)
  const curves = {
    hue:        { cp1: { x: 0.25, y: 0.3 }, cp2: { x: 0.75, y: 0.7 }, startY: 0.55, endY: 0.7 },
    saturation: { cp1: { x: 0.3, y: 0.8 },  cp2: { x: 0.7, y: 0.6 },  startY: 0.7,  endY: 0.5 },
    lightness:  { cp1: { x: 0.25, y: 0.85 }, cp2: { x: 0.75, y: 0.2 }, startY: 0.95, endY: 0.1 },
  };

  // Canvas refs for curve editors
  const curveEditors = {};
  let swatchContainer, contrastContainer, perceptionCanvas, perceptionCtx;
  let warningEl;

  // Drag state
  let dragging = null; // { curve, point ('cp1'|'cp2'), canvas }

  // --- Presets ----------------------------------------------------------------

  const presets = {
    'Ocean Blues': {
      hue:        { cp1: { x: 0.3, y: 0.55 }, cp2: { x: 0.7, y: 0.6 },  startY: 0.5,  endY: 0.65 },
      saturation: { cp1: { x: 0.3, y: 0.9 },  cp2: { x: 0.7, y: 0.75 }, startY: 0.6,  endY: 0.85 },
      lightness:  { cp1: { x: 0.2, y: 0.9 },  cp2: { x: 0.8, y: 0.15 }, startY: 0.97, endY: 0.08 },
    },
    'Warm Sunset': {
      hue:        { cp1: { x: 0.25, y: 0.08 }, cp2: { x: 0.75, y: 0.05 }, startY: 0.0,  endY: 0.12 },
      saturation: { cp1: { x: 0.3, y: 0.95 },  cp2: { x: 0.7, y: 0.8 },  startY: 0.7,  endY: 0.9 },
      lightness:  { cp1: { x: 0.25, y: 0.9 },  cp2: { x: 0.75, y: 0.15 }, startY: 0.95, endY: 0.1 },
    },
    'Accessible Grays': {
      hue:        { cp1: { x: 0.3, y: 0.6 },  cp2: { x: 0.7, y: 0.6 },  startY: 0.6,  endY: 0.6 },
      saturation: { cp1: { x: 0.3, y: 0.03 }, cp2: { x: 0.7, y: 0.03 }, startY: 0.02, endY: 0.04 },
      lightness:  { cp1: { x: 0.2, y: 0.92 }, cp2: { x: 0.8, y: 0.1 },  startY: 0.97, endY: 0.06 },
    },
    'Brand Purple': {
      hue:        { cp1: { x: 0.25, y: 0.72 }, cp2: { x: 0.75, y: 0.82 }, startY: 0.7,  endY: 0.85 },
      saturation: { cp1: { x: 0.3, y: 0.85 },  cp2: { x: 0.7, y: 0.7 },  startY: 0.6,  endY: 0.8 },
      lightness:  { cp1: { x: 0.2, y: 0.9 },   cp2: { x: 0.8, y: 0.15 }, startY: 0.95, endY: 0.1 },
    },
  };

  // --- Color math ------------------------------------------------------------

  function hslToRgb(h, s, l) {
    // h: 0-360, s: 0-100, l: 0-100
    h = ((h % 360) + 360) % 360;
    s = s / 100;
    l = l / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r, g, b;
    if (h < 60)       { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function linearize(c) {
    // sRGB to linear
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function relativeLuminance(r, g, b) {
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
  }

  function contrastRatio(l1, l2) {
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function wcagLevel(ratio) {
    if (ratio >= 7) return 'AAA';
    if (ratio >= 4.5) return 'AA';
    return 'Fail';
  }

  // Perceived brightness compensation per hue
  // Green/yellow appear brighter; blue/purple darker at same L
  function perceivedBrightness(hue) {
    // Attempt to model human luminosity sensitivity
    // Peak sensitivity around green (120) and yellow (60), low at blue (240)
    const h = ((hue % 360) + 360) % 360;
    // Simple model: sine-based approximation
    const rad = (h / 360) * Math.PI * 2;
    // Green peak at ~120, second peak at ~60 (yellow), valley at ~240 (blue)
    return 0.5 + 0.2 * Math.sin(rad - Math.PI * 0.33) + 0.15 * Math.cos(rad * 2 - Math.PI * 0.5);
  }

  // --- Bezier evaluation -----------------------------------------------------

  function evalCubicBezier(t, start, cp1, cp2, end) {
    const it = 1 - t;
    return it * it * it * start +
           3 * it * it * t * cp1 +
           3 * it * t * t * cp2 +
           t * t * t * end;
  }

  function evalCurve(curveName, t) {
    const c = curves[curveName];
    const val = evalCubicBezier(t, c.startY, c.cp1.y, c.cp2.y, c.endY);
    return Math.max(0, Math.min(1, val));
  }

  // --- Palette generation ----------------------------------------------------

  function generatePalette() {
    palette = [];
    for (let i = 0; i < steps; i++) {
      const t = steps === 1 ? 0.5 : i / (steps - 1);
      let h = evalCurve('hue', t) * 360;
      let s = evalCurve('saturation', t) * 100;
      let l = evalCurve('lightness', t) * 100;

      // Perceptual correction: adjust lightness based on hue
      if (perceptualCorrection) {
        const perceived = perceivedBrightness(h);
        // If hue is perceptually bright (like yellow/green), reduce lightness slightly
        // If hue is perceptually dark (like blue), increase lightness slightly
        const correction = (0.5 - perceived) * 15;
        l = Math.max(2, Math.min(98, l + correction));
      }

      h = ((h % 360) + 360) % 360;
      s = Math.max(0, Math.min(100, s));
      l = Math.max(0, Math.min(100, l));

      const rgb = hslToRgb(h, s, l);
      const hex = rgbToHex(...rgb);
      palette.push({ h, s, l, rgb, hex });
    }
  }

  // --- Curve editor drawing --------------------------------------------------

  function drawCurveEditor(name) {
    const editor = curveEditors[name];
    if (!editor) return;
    const cvs = editor.canvas;
    const cx = editor.ctx;
    const w = cvs.width;
    const h = cvs.height;
    const c = curves[name];

    cx.clearRect(0, 0, w, h);

    // Background
    cx.fillStyle = 'rgba(10, 14, 25, 0.9)';
    cx.fillRect(0, 0, w, h);

    // Grid lines
    cx.strokeStyle = 'rgba(232, 228, 222, 0.06)';
    cx.lineWidth = 1 * dpr;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * h;
      cx.beginPath();
      cx.moveTo(0, y);
      cx.lineTo(w, y);
      cx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const x = (i / 4) * w;
      cx.beginPath();
      cx.moveTo(x, 0);
      cx.lineTo(x, h);
      cx.stroke();
    }

    // Axis labels
    cx.fillStyle = 'rgba(232, 228, 222, 0.55)';
    cx.font = `${9 * dpr}px "JetBrains Mono", monospace`;
    cx.textAlign = 'left';
    const ranges = { hue: '360°', saturation: '100%', lightness: '100%' };
    cx.fillText(ranges[name], 3 * dpr, 11 * dpr);
    cx.fillText('0', 3 * dpr, h - 3 * dpr);

    // Draw the bezier curve
    const pad = 0; // no padding, full canvas
    cx.strokeStyle = name === 'hue' ? 'rgba(255, 140, 100, 0.8)' :
                     name === 'saturation' ? 'rgba(100, 255, 180, 0.8)' :
                     'rgba(100, 140, 255, 0.8)';
    cx.lineWidth = 2 * dpr;
    cx.beginPath();
    const resolution = 60;
    for (let i = 0; i <= resolution; i++) {
      const t = i / resolution;
      const x = t * w;
      const val = evalCubicBezier(t, c.startY, c.cp1.y, c.cp2.y, c.endY);
      const y = (1 - Math.max(0, Math.min(1, val))) * h;
      if (i === 0) cx.moveTo(x, y);
      else cx.lineTo(x, y);
    }
    cx.stroke();

    // Fill under curve
    cx.lineTo(w, h);
    cx.lineTo(0, h);
    cx.closePath();
    const fillColor = name === 'hue' ? 'rgba(255, 140, 100, 0.06)' :
                      name === 'saturation' ? 'rgba(100, 255, 180, 0.06)' :
                      'rgba(100, 140, 255, 0.06)';
    cx.fillStyle = fillColor;
    cx.fill();

    // Control point tangent lines
    cx.strokeStyle = 'rgba(232, 228, 222, 0.2)';
    cx.lineWidth = 1 * dpr;
    cx.setLineDash([3 * dpr, 3 * dpr]);

    // Line from start to cp1
    cx.beginPath();
    cx.moveTo(0, (1 - c.startY) * h);
    cx.lineTo(c.cp1.x * w, (1 - c.cp1.y) * h);
    cx.stroke();

    // Line from end to cp2
    cx.beginPath();
    cx.moveTo(w, (1 - c.endY) * h);
    cx.lineTo(c.cp2.x * w, (1 - c.cp2.y) * h);
    cx.stroke();

    cx.setLineDash([]);

    // Draw control points
    [c.cp1, c.cp2].forEach((cp, idx) => {
      const px = cp.x * w;
      const py = (1 - cp.y) * h;
      cx.beginPath();
      cx.arc(px, py, 6 * dpr, 0, Math.PI * 2);
      cx.fillStyle = 'rgba(232, 228, 222, 0.9)';
      cx.fill();
      cx.strokeStyle = name === 'hue' ? 'rgba(255, 140, 100, 0.9)' :
                       name === 'saturation' ? 'rgba(100, 255, 180, 0.9)' :
                       'rgba(100, 140, 255, 0.9)';
      cx.lineWidth = 2 * dpr;
      cx.stroke();
    });

    // Start/end handles
    [{ x: 0, y: c.startY }, { x: 1, y: c.endY }].forEach(pt => {
      const px = pt.x * w;
      const py = (1 - pt.y) * h;
      cx.beginPath();
      cx.arc(px, py, 4 * dpr, 0, Math.PI * 2);
      cx.fillStyle = 'rgba(232, 228, 222, 0.5)';
      cx.fill();
    });
  }

  // --- Swatch rendering ------------------------------------------------------

  function renderSwatches() {
    if (!swatchContainer) return;
    swatchContainer.innerHTML = '';

    const whiteLum = relativeLuminance(255, 255, 255);
    const blackLum = relativeLuminance(0, 0, 0);

    palette.forEach((color, i) => {
      const swatch = document.createElement('div');
      swatch.style.cssText = 'display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;';

      // Color block
      const block = document.createElement('div');
      block.style.cssText = `
        width:100%;height:60px;background:${color.hex};border-radius:6px;
        position:relative;margin-bottom:6px;border:1px solid rgba(232,228,222,0.08);
      `;

      // Contrast dots (white on top, black on bottom)
      const lum = relativeLuminance(...color.rgb);
      const whiteContrast = contrastRatio(whiteLum, lum);
      const blackContrast = contrastRatio(lum, blackLum);

      const whiteDot = document.createElement('div');
      const wSize = whiteContrast >= 7 ? 8 : whiteContrast >= 4.5 ? 6 : 4;
      whiteDot.style.cssText = `
        position:absolute;top:5px;right:5px;width:${wSize}px;height:${wSize}px;
        border-radius:50%;background:white;opacity:${Math.min(1, whiteContrast / 7)};
      `;
      block.appendChild(whiteDot);

      const blackDot = document.createElement('div');
      const bSize = blackContrast >= 7 ? 8 : blackContrast >= 4.5 ? 6 : 4;
      blackDot.style.cssText = `
        position:absolute;bottom:5px;right:5px;width:${bSize}px;height:${bSize}px;
        border-radius:50%;background:black;opacity:${Math.min(1, blackContrast / 7)};
        border:1px solid rgba(255,255,255,0.15);
      `;
      block.appendChild(blackDot);

      swatch.appendChild(block);

      // Hex label
      const hexLabel = document.createElement('div');
      hexLabel.textContent = color.hex.toUpperCase();
      hexLabel.style.cssText = 'font-size:10px;color:rgba(232,228,222,0.7);font-family:"JetBrains Mono",monospace;margin-bottom:2px;';
      swatch.appendChild(hexLabel);

      // HSL values
      const hslLabel = document.createElement('div');
      hslLabel.textContent = `${Math.round(color.h)}° ${Math.round(color.s)}% ${Math.round(color.l)}%`;
      hslLabel.style.cssText = 'font-size:8px;color:rgba(232,228,222,0.55);font-family:"JetBrains Mono",monospace;';
      swatch.appendChild(hslLabel);

      swatchContainer.appendChild(swatch);

      // Contrast ratio badge between adjacent swatches
      if (i < palette.length - 1) {
        const next = palette[i + 1];
        const lum1 = relativeLuminance(...color.rgb);
        const lum2 = relativeLuminance(...next.rgb);
        const ratio = contrastRatio(lum1, lum2);
        const level = wcagLevel(ratio);

        const badge = document.createElement('div');
        badge.style.cssText = `
          display:flex;align-items:center;justify-content:center;
          min-width:28px;padding:0 2px;align-self:flex-start;margin-top:20px;
        `;
        const badgeInner = document.createElement('div');
        const badgeColor = level === 'AAA' ? 'rgba(80,200,120,0.8)' :
                           level === 'AA'  ? 'rgba(240,200,60,0.8)' :
                           'rgba(240,80,80,0.8)';
        badgeInner.style.cssText = `
          font-size:8px;font-family:"JetBrains Mono",monospace;
          color:${level === 'AA' ? '#1a1a1a' : '#fff'};background:${badgeColor};
          padding:2px 4px;border-radius:3px;white-space:nowrap;
          line-height:1;
        `;
        badgeInner.textContent = `${ratio.toFixed(1)}`;
        badge.appendChild(badgeInner);
        swatchContainer.appendChild(badge);
      }
    });
  }

  // --- Perception visualization ----------------------------------------------

  function drawPerception() {
    if (!perceptionCanvas) return;
    const cvs = perceptionCanvas;
    const cx = perceptionCtx;
    const w = cvs.width;
    const h = cvs.height;

    cx.clearRect(0, 0, w, h);

    // Background
    cx.fillStyle = 'rgba(10, 14, 25, 0.9)';
    cx.fillRect(0, 0, w, h);

    const barTop = 18 * dpr;
    const barH = 24 * dpr;
    const curveTop = barTop + barH + 8 * dpr;
    const curveH = h - curveTop - 14 * dpr;

    // Hue spectrum bar
    for (let x = 0; x < w; x++) {
      const hue = (x / w) * 360;
      const rgb = hslToRgb(hue, 100, 50);
      cx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      cx.fillRect(x, barTop, 1, barH);
    }

    // Border
    cx.strokeStyle = 'rgba(232, 228, 222, 0.1)';
    cx.lineWidth = 1 * dpr;
    cx.strokeRect(0, barTop, w, barH);

    // Hue labels
    cx.fillStyle = 'rgba(232, 228, 222, 0.55)';
    cx.font = `${8 * dpr}px "JetBrains Mono", monospace`;
    cx.textAlign = 'center';
    [0, 60, 120, 180, 240, 300, 360].forEach(deg => {
      const x = (deg / 360) * w;
      cx.fillText(`${deg}°`, x, barTop - 4 * dpr);
    });

    // Perceived brightness curve
    cx.strokeStyle = 'rgba(255, 220, 100, 0.7)';
    cx.lineWidth = 2 * dpr;
    cx.beginPath();
    for (let x = 0; x < w; x++) {
      const hue = (x / w) * 360;
      const p = perceivedBrightness(hue);
      const y = curveTop + curveH * (1 - p);
      if (x === 0) cx.moveTo(x, y);
      else cx.lineTo(x, y);
    }
    cx.stroke();

    // Fill under curve
    cx.lineTo(w, curveTop + curveH);
    cx.lineTo(0, curveTop + curveH);
    cx.closePath();
    cx.fillStyle = 'rgba(255, 220, 100, 0.04)';
    cx.fill();

    // Mark palette hue positions on the bar
    palette.forEach(color => {
      const x = (color.h / 360) * w;
      cx.strokeStyle = 'rgba(232, 228, 222, 0.6)';
      cx.lineWidth = 1.5 * dpr;
      cx.beginPath();
      cx.moveTo(x, barTop);
      cx.lineTo(x, barTop + barH);
      cx.stroke();
      // Small triangle marker
      cx.fillStyle = 'rgba(232, 228, 222, 0.6)';
      cx.beginPath();
      cx.moveTo(x, barTop + barH);
      cx.lineTo(x - 3 * dpr, barTop + barH + 4 * dpr);
      cx.lineTo(x + 3 * dpr, barTop + barH + 4 * dpr);
      cx.closePath();
      cx.fill();
    });

    // Y-axis label
    cx.fillStyle = 'rgba(255, 220, 100, 0.5)';
    cx.font = `${8 * dpr}px "JetBrains Mono", monospace`;
    cx.textAlign = 'left';
    cx.fillText('perceived brightness', 4 * dpr, curveTop + 10 * dpr);

    // Check for blue hues in palette and show warning
    const hasBlue = palette.some(c => c.h >= 200 && c.h <= 280 && c.s > 30);
    if (warningEl) {
      warningEl.style.display = hasBlue ? 'block' : 'none';
    }
  }

  // --- Full update -----------------------------------------------------------

  function update() {
    generatePalette();
    Object.keys(curveEditors).forEach(drawCurveEditor);
    renderSwatches();
    drawPerception();
  }

  // --- Curve drag interaction ------------------------------------------------

  function getClosestPoint(name, mx, my, canvas) {
    const rect = canvas.getBoundingClientRect();
    const nx = (mx - rect.left) / rect.width;
    const ny = 1 - (my - rect.top) / rect.height;
    const c = curves[name];

    let best = null;
    let bestDist = Infinity;

    // Check cp1 and cp2
    ['cp1', 'cp2'].forEach(key => {
      const dx = nx - c[key].x;
      const dy = ny - c[key].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = key;
      }
    });

    // Also check start/end
    const dStart = Math.sqrt(nx * nx + (ny - c.startY) * (ny - c.startY));
    if (dStart < bestDist) { bestDist = dStart; best = 'start'; }
    const dEnd = Math.sqrt((nx - 1) * (nx - 1) + (ny - c.endY) * (ny - c.endY));
    if (dEnd < bestDist) { bestDist = dEnd; best = 'end'; }

    // Threshold in normalized coords
    if (bestDist > 0.08) return null;
    return best;
  }

  function onPointerDown(name, e) {
    const canvas = curveEditors[name].canvas;
    const point = getClosestPoint(name, e.clientX, e.clientY, canvas);
    if (point) {
      dragging = { curve: name, point, canvas };
      e.preventDefault();
    }
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const { curve, point, canvas } = dragging;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));

    if (point === 'cp1' || point === 'cp2') {
      curves[curve][point].x = point === 'cp1' ? Math.max(0.01, Math.min(0.5, nx)) : Math.max(0.5, Math.min(0.99, nx));
      curves[curve][point].y = ny;
    } else if (point === 'start') {
      curves[curve].startY = ny;
    } else if (point === 'end') {
      curves[curve].endY = ny;
    }

    update();
    e.preventDefault();
  }

  function onPointerUp() {
    dragging = null;
  }

  // --- DOM construction ------------------------------------------------------

  function buildDOM(containerEl) {
    container = containerEl;
    container.style.cssText = 'position:relative;width:100%;background:#06080f;padding:60px 0;box-sizing:border-box;font-family:Inter,system-ui,sans-serif;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'max-width:900px;margin:0 auto 32px;padding:0 32px;box-sizing:border-box;';
    header.innerHTML = `
      <div style="text-transform:uppercase;font-size:11px;letter-spacing:3px;color:rgba(100,140,255,0.8);margin-bottom:10px;font-family:'JetBrains Mono',monospace;">Section K</div>
      <h2 style="margin:0 0 12px;font-size:32px;font-weight:700;color:#e8e4de;line-height:1.2;">Programmatic Color</h2>
      <p style="margin:0;font-size:15px;color:rgba(232,228,222,0.55);line-height:1.6;max-width:640px;">Procedurally generated, fully accessible color palettes — every step computed from curves, not picked by hand. Inspired by ColorBox.io.</p>
    `;
    container.appendChild(header);

    // Main content area
    const main = document.createElement('div');
    main.style.cssText = 'max-width:900px;margin:0 auto;padding:0 32px;box-sizing:border-box;';

    // --- Curve editors ---
    const curveRow = document.createElement('div');
    curveRow.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:28px;';

    ['hue', 'saturation', 'lightness'].forEach(name => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

      const label = document.createElement('div');
      const colors = { hue: 'rgba(255,140,100,0.8)', saturation: 'rgba(100,255,180,0.8)', lightness: 'rgba(100,140,255,0.8)' };
      const ranges = { hue: '0 – 360°', saturation: '0 – 100%', lightness: '0 – 100%' };
      label.innerHTML = `
        <span style="font-size:12px;color:${colors[name]};font-family:'JetBrains Mono',monospace;font-weight:600;text-transform:capitalize;">${name}</span>
        <span style="font-size:10px;color:rgba(232,228,222,0.35);font-family:'JetBrains Mono',monospace;margin-left:6px;">${ranges[name]}</span>
      `;
      wrap.appendChild(label);

      const cvs = document.createElement('canvas');
      cvs.style.cssText = 'width:100%;height:110px;border-radius:6px;cursor:crosshair;display:block;border:1px solid rgba(232,228,222,0.08);';
      wrap.appendChild(cvs);
      curveRow.appendChild(wrap);

      // Store references
      curveEditors[name] = { canvas: cvs, ctx: null };

      // Event listeners
      cvs.addEventListener('pointerdown', e => onPointerDown(name, e));
    });

    main.appendChild(curveRow);

    // --- Controls ---
    const controlRow = document.createElement('div');
    controlRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:24px;';

    // Steps slider
    const stepsWrap = document.createElement('div');
    stepsWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const stepsLabel = document.createElement('label');
    stepsLabel.textContent = 'Steps';
    stepsLabel.style.cssText = 'font-size:12px;color:rgba(232,228,222,0.6);font-family:"JetBrains Mono",monospace;';
    const stepsVal = document.createElement('span');
    stepsVal.textContent = steps;
    stepsVal.style.cssText = 'font-size:11px;color:rgba(100,140,255,0.7);font-family:"JetBrains Mono",monospace;min-width:20px;text-align:center;';
    const stepsInput = document.createElement('input');
    stepsInput.type = 'range';
    stepsInput.min = 6;
    stepsInput.max = 20;
    stepsInput.step = 1;
    stepsInput.value = steps;
    stepsInput.style.cssText = 'width:100px;accent-color:rgba(100,140,255,0.8);height:4px;cursor:pointer;';
    stepsInput.addEventListener('input', () => {
      steps = parseInt(stepsInput.value);
      stepsVal.textContent = steps;
      update();
    });
    stepsWrap.appendChild(stepsLabel);
    stepsWrap.appendChild(stepsInput);
    stepsWrap.appendChild(stepsVal);
    controlRow.appendChild(stepsWrap);

    // Perceptual correction toggle
    const toggleWrap = document.createElement('label');
    toggleWrap.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;';
    const toggleCb = document.createElement('input');
    toggleCb.type = 'checkbox';
    toggleCb.checked = perceptualCorrection;
    toggleCb.style.cssText = 'accent-color:rgba(100,140,255,0.8);cursor:pointer;';
    toggleCb.addEventListener('change', () => {
      perceptualCorrection = toggleCb.checked;
      update();
    });
    const toggleLabel = document.createElement('span');
    toggleLabel.textContent = 'Perceptual Correction';
    toggleLabel.style.cssText = 'font-size:12px;color:rgba(232,228,222,0.6);font-family:"JetBrains Mono",monospace;';
    toggleWrap.appendChild(toggleCb);
    toggleWrap.appendChild(toggleLabel);
    controlRow.appendChild(toggleWrap);

    // Separator
    const sep = document.createElement('div');
    sep.style.cssText = 'width:1px;height:20px;background:rgba(232,228,222,0.1);margin:0 4px;';
    controlRow.appendChild(sep);

    // Preset buttons
    Object.keys(presets).forEach(name => {
      const btn = createButton(name);
      btn.addEventListener('click', () => applyPreset(name));
      controlRow.appendChild(btn);
    });

    // Randomize button
    const randBtn = createButton('Randomize');
    randBtn.style.background = 'rgba(100,140,255,0.15)';
    randBtn.style.borderColor = 'rgba(100,140,255,0.35)';
    randBtn.addEventListener('click', randomizeCurves);
    controlRow.appendChild(randBtn);

    main.appendChild(controlRow);

    // --- Swatch display ---
    swatchContainer = document.createElement('div');
    swatchContainer.style.cssText = 'display:flex;gap:4px;align-items:flex-start;margin-bottom:32px;overflow-x:auto;padding-bottom:4px;';
    main.appendChild(swatchContainer);

    // --- Perception visualization ---
    const percSection = document.createElement('div');
    percSection.style.cssText = 'margin-bottom:12px;';

    const percLabel = document.createElement('div');
    percLabel.style.cssText = 'font-size:12px;color:rgba(232,228,222,0.45);font-family:"JetBrains Mono",monospace;margin-bottom:8px;';
    percLabel.textContent = 'Human Luminosity Sensitivity';
    percSection.appendChild(percLabel);

    perceptionCanvas = document.createElement('canvas');
    perceptionCanvas.style.cssText = 'width:100%;height:120px;border-radius:6px;display:block;border:1px solid rgba(232,228,222,0.08);';
    percSection.appendChild(perceptionCanvas);

    const percCaption = document.createElement('div');
    percCaption.style.cssText = 'font-size:10px;color:rgba(232,228,222,0.55);font-family:"JetBrains Mono",monospace;margin-top:6px;';
    percCaption.textContent = 'Human vision is more sensitive to green and red, less sensitive to blue — identical lightness values appear different in brightness.';
    percSection.appendChild(percCaption);

    warningEl = document.createElement('div');
    warningEl.style.cssText = 'display:none;font-size:11px;color:rgba(255,180,80,0.7);font-family:"JetBrains Mono",monospace;margin-top:6px;padding:8px 12px;background:rgba(255,180,80,0.06);border:1px solid rgba(255,180,80,0.15);border-radius:4px;';
    warningEl.textContent = 'Your palette includes blue hues (200-280°). These will appear darker than HSL lightness suggests. Enable Perceptual Correction to compensate.';
    percSection.appendChild(warningEl);

    main.appendChild(percSection);
    container.appendChild(main);

    // Global pointer events for drag
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }

  function createButton(text) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      padding:6px 14px;font-size:11px;font-family:"JetBrains Mono",monospace;
      background:rgba(232,228,222,0.06);color:rgba(232,228,222,0.7);
      border:1px solid rgba(232,228,222,0.12);border-radius:5px;cursor:pointer;
      transition:all 0.15s ease;white-space:nowrap;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(232,228,222,0.12)';
      btn.style.color = '#e8e4de';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = text === 'Randomize' ? 'rgba(100,140,255,0.15)' : 'rgba(232,228,222,0.06)';
      btn.style.color = 'rgba(232,228,222,0.7)';
    });
    return btn;
  }

  function applyPreset(name) {
    const p = presets[name];
    if (!p) return;
    ['hue', 'saturation', 'lightness'].forEach(key => {
      curves[key].cp1 = { ...p[key].cp1 };
      curves[key].cp2 = { ...p[key].cp2 };
      curves[key].startY = p[key].startY;
      curves[key].endY = p[key].endY;
    });
    update();
  }

  function randomizeCurves() {
    const r = () => Math.random();
    ['hue', 'saturation', 'lightness'].forEach(name => {
      const c = curves[name];
      c.startY = r();
      c.endY = r();
      c.cp1.x = 0.1 + r() * 0.35;
      c.cp1.y = r();
      c.cp2.x = 0.55 + r() * 0.35;
      c.cp2.y = r();
      // Lightness: bias toward a wider range for better palettes
      if (name === 'lightness') {
        c.startY = 0.7 + r() * 0.28;
        c.endY = r() * 0.3;
      }
    });
    update();
  }

  // --- Canvas sizing ---------------------------------------------------------

  function setupCanvases() {
    dpr = window.devicePixelRatio || 1;

    // Curve editor canvases
    Object.keys(curveEditors).forEach(name => {
      const editor = curveEditors[name];
      const cvs = editor.canvas;
      const rect = cvs.getBoundingClientRect();
      cvs.width = Math.round(rect.width * dpr);
      cvs.height = Math.round(rect.height * dpr);
      editor.ctx = cvs.getContext('2d');
    });

    // Perception canvas
    if (perceptionCanvas) {
      const rect = perceptionCanvas.getBoundingClientRect();
      perceptionCanvas.width = Math.round(rect.width * dpr);
      perceptionCanvas.height = Math.round(rect.height * dpr);
      perceptionCtx = perceptionCanvas.getContext('2d');
    }
  }

  // --- Public API ------------------------------------------------------------

  return {
    init(containerEl) {
      buildDOM(containerEl);
      setupCanvases();
      update();
    },
    start() {
      if (running) return;
      running = true;
    },
    stop() {
      running = false;
      if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    },
    resize() {
      setupCanvases();
      update();
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ColorBoxSection;
