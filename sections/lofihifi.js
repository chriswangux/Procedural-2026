// =============================================================================
// LOFI-TO-HIFI SECTION — GauGAN-Inspired Semantic Painting
// Paint semantic blocks on a sketch canvas; system generates procedural
// textured landscape in real-time on a companion "rendered" canvas.
// =============================================================================

const LofiHifiSection = (() => {
  // ---- State ----
  let container, sketchCanvas, renderCanvas, sketchCtx, renderCtx;
  let running = false, animFrameId = null;
  let dpr = 1, canvasW = 0, canvasH = 0;
  let painting = false;
  let currentBrush = 'Sky';
  let renderDirty = true;
  let lastRenderTime = 0;
  const RENDER_THROTTLE = 100;
  const BRUSH_RADIUS = 40;

  // ---- Semantic Palette ----
  const PALETTE = [
    { name: 'Sky',       color: '#87CEEB', rgb: [135, 206, 235] },
    { name: 'Water',     color: '#1E5F8B', rgb: [30, 95, 139] },
    { name: 'Trees',     color: '#2D5A1E', rgb: [45, 90, 30] },
    { name: 'Mountains', color: '#6B6B6B', rgb: [107, 107, 107] },
    { name: 'Ground',    color: '#6B4423', rgb: [107, 68, 35] },
    { name: 'Sand',      color: '#C2A95E', rgb: [194, 169, 94] },
    { name: 'Snow',      color: '#E8E8F0', rgb: [232, 232, 240] },
  ];

  // ---- Noise (FBM) ----
  // Simple value-noise based FBM for procedural textures
  const _noiseP = new Uint8Array(512);
  (() => {
    let s = 17;
    const sr = () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(sr() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) _noiseP[i] = p[i & 255];
  })();

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }

  function grad1d(hash, x) {
    return (hash & 1) === 0 ? x : -x;
  }

  function noise2d(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const aa = _noiseP[_noiseP[X] + Y];
    const ab = _noiseP[_noiseP[X] + Y + 1];
    const ba = _noiseP[_noiseP[X + 1] + Y];
    const bb = _noiseP[_noiseP[X + 1] + Y + 1];

    function grad2(hash, x2, y2) {
      const h = hash & 3;
      return ((h & 1) === 0 ? x2 : -x2) + ((h & 2) === 0 ? y2 : -y2);
    }

    return lerp(
      lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u),
      lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u),
      v
    );
  }

  function fbm(x, y, octaves, lacunarity, gain) {
    let sum = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise2d(x * freq, y * freq) * amp;
      max += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / max;
  }

  // ---- Seeded random for deterministic detail generation ----
  let _rngState = 1;
  function seedRng(s) { _rngState = s | 1; }
  function rng() {
    _rngState ^= _rngState << 13;
    _rngState ^= _rngState >> 17;
    _rngState ^= _rngState << 5;
    return (((_rngState < 0 ? ~_rngState + 1 : _rngState) % 10000) / 10000);
  }

  // ---- DOM helpers ----
  function el(tag, styles, parent) {
    const e = document.createElement(tag);
    if (styles) Object.assign(e.style, styles);
    if (parent) parent.appendChild(e);
    return e;
  }

  // ==========================================================================
  //  BUILD DOM
  // ==========================================================================
  function buildDOM(root) {
    container = root;
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.background = '#06080f';
    container.style.width = '100%';
    container.style.minHeight = '100vh';
    container.style.fontFamily = "'Inter', system-ui, -apple-system, sans-serif";
    container.style.color = '#e0e0e0';

    // Header
    const header = el('div', {
      maxWidth: '900px', margin: '0 auto', padding: '60px 24px 20px',
      textAlign: 'center',
    }, container);

    const overline = el('div', {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase',
      color: 'rgba(100,140,255,0.8)', marginBottom: '12px',
    }, header);
    overline.textContent = 'Lofi to Hifi';

    const h2 = el('h2', {
      fontSize: '32px', fontWeight: '700', lineHeight: '1.2',
      margin: '0 0 12px', color: '#ffffff',
    }, header);
    h2.textContent = 'Give Me Some Baseline to Jam On';

    const desc = el('p', {
      fontSize: '15px', lineHeight: '1.6', color: 'rgba(255,255,255,0.55)',
      maxWidth: '640px', margin: '0 auto 0',
    }, header);
    desc.textContent = 'Paint intent, generate detail. Sketch semantic regions on the left — sky, water, trees — and watch procedural textures emerge on the right. Inspired by Nvidia GauGAN.';

    // Toolbar
    const toolbar = el('div', {
      display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
      alignItems: 'center', gap: '8px',
      maxWidth: '900px', margin: '20px auto 12px', padding: '0 24px',
    }, container);

    // Brush buttons
    PALETTE.forEach(p => {
      const btn = el('button', {
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '6px 14px', border: 'none', borderRadius: '6px',
        background: currentBrush === p.name ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
        color: '#e0e0e0', cursor: 'pointer', fontSize: '12px',
        fontFamily: "'Inter', sans-serif", transition: 'background 0.2s',
        outline: currentBrush === p.name ? '1.5px solid rgba(100,140,255,0.6)' : 'none',
      }, toolbar);

      const swatch = el('span', {
        display: 'inline-block', width: '14px', height: '14px',
        borderRadius: '3px', background: p.color, flexShrink: '0',
      }, btn);

      const label = document.createTextNode(p.name);
      btn.appendChild(label);

      btn.addEventListener('click', () => {
        currentBrush = p.name;
        updateToolbarSelection();
      });
      btn._brushName = p.name;
    });

    // Separator
    el('span', { width: '1px', height: '24px', background: 'rgba(255,255,255,0.12)', flexShrink: '0' }, toolbar);

    // Action buttons
    ['Example', 'Clear'].forEach(label => {
      const btn = el('button', {
        padding: '6px 16px', border: '1px solid rgba(100,140,255,0.3)',
        borderRadius: '6px', background: 'transparent',
        color: 'rgba(100,140,255,0.9)', cursor: 'pointer', fontSize: '12px',
        fontFamily: "'Inter', sans-serif", transition: 'all 0.2s',
      }, toolbar);
      btn.textContent = label;
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(100,140,255,0.1)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
      btn.addEventListener('click', () => {
        if (label === 'Clear') clearAll();
        else paintExample();
      });
    });

    // Canvas container
    const canvasRow = el('div', {
      display: 'flex', gap: '2px', maxWidth: '1100px',
      margin: '0 auto', padding: '0 24px 60px',
      justifyContent: 'center',
    }, container);

    // Labels row (inside each column)
    const leftCol = el('div', { flex: '1', maxWidth: '540px', minWidth: '0' }, canvasRow);
    const rightCol = el('div', { flex: '1', maxWidth: '540px', minWidth: '0' }, canvasRow);

    const mkLabel = (text, parent) => {
      const lb = el('div', {
        fontFamily: "'JetBrains Mono', monospace", fontSize: '10px',
        letterSpacing: '2px', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.55)', marginBottom: '6px', textAlign: 'center',
      }, parent);
      lb.textContent = text;
    };
    mkLabel('Sketch', leftCol);
    mkLabel('Rendered', rightCol);

    // Sketch canvas
    sketchCanvas = el('canvas', {
      width: '100%', display: 'block', borderRadius: '8px',
      background: '#0d1017', cursor: 'crosshair',
      border: '1px solid rgba(255,255,255,0.06)',
    }, leftCol);

    // Render canvas
    renderCanvas = el('canvas', {
      width: '100%', display: 'block', borderRadius: '8px',
      background: '#0d1017',
      border: '1px solid rgba(255,255,255,0.06)',
    }, rightCol);

    sketchCtx = sketchCanvas.getContext('2d');
    renderCtx = renderCanvas.getContext('2d');
  }

  function updateToolbarSelection() {
    const btns = container.querySelectorAll('button');
    btns.forEach(btn => {
      if (btn._brushName !== undefined) {
        const active = btn._brushName === currentBrush;
        btn.style.background = active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)';
        btn.style.outline = active ? '1.5px solid rgba(100,140,255,0.6)' : 'none';
      }
    });
  }

  // ==========================================================================
  //  SIZING
  // ==========================================================================
  function sizeCanvases() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = sketchCanvas.parentElement;
    const w = rect.clientWidth || 400;
    const h = Math.round(w * 0.65);
    canvasW = w;
    canvasH = h;

    [sketchCanvas, renderCanvas].forEach(c => {
      c.style.width = w + 'px';
      c.style.height = h + 'px';
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    });

    sketchCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    renderDirty = true;
  }

  // ==========================================================================
  //  PAINTING
  // ==========================================================================
  function getCanvasPos(e) {
    const rect = sketchCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function paintStroke(x, y) {
    const p = PALETTE.find(b => b.name === currentBrush);
    if (!p) return;
    sketchCtx.globalCompositeOperation = 'source-over';
    sketchCtx.fillStyle = p.color;
    sketchCtx.beginPath();
    sketchCtx.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2);
    sketchCtx.fill();
    renderDirty = true;
  }

  function onPointerDown(e) {
    e.preventDefault();
    painting = true;
    const pos = getCanvasPos(e);
    paintStroke(pos.x, pos.y);
  }

  function onPointerMove(e) {
    if (!painting) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    paintStroke(pos.x, pos.y);
  }

  function onPointerUp() { painting = false; }

  function bindEvents() {
    sketchCanvas.addEventListener('mousedown', onPointerDown);
    sketchCanvas.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    sketchCanvas.addEventListener('touchstart', onPointerDown, { passive: false });
    sketchCanvas.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
  }

  // ==========================================================================
  //  CLEAR & EXAMPLE
  // ==========================================================================
  function clearAll() {
    sketchCtx.clearRect(0, 0, canvasW, canvasH);
    renderCtx.clearRect(0, 0, canvasW, canvasH);
    renderDirty = true;
  }

  function paintExample() {
    sketchCtx.clearRect(0, 0, canvasW, canvasH);
    const w = canvasW, h = canvasH;

    // Sky - top 45%
    sketchCtx.fillStyle = PALETTE[0].color;
    sketchCtx.fillRect(0, 0, w, h * 0.45);

    // Mountains - band from 25% to 50%
    sketchCtx.fillStyle = PALETTE[3].color;
    sketchCtx.beginPath();
    sketchCtx.moveTo(0, h * 0.5);
    sketchCtx.lineTo(0, h * 0.38);
    sketchCtx.lineTo(w * 0.15, h * 0.28);
    sketchCtx.lineTo(w * 0.3, h * 0.4);
    sketchCtx.lineTo(w * 0.45, h * 0.25);
    sketchCtx.lineTo(w * 0.6, h * 0.38);
    sketchCtx.lineTo(w * 0.75, h * 0.3);
    sketchCtx.lineTo(w * 0.9, h * 0.35);
    sketchCtx.lineTo(w, h * 0.32);
    sketchCtx.lineTo(w, h * 0.5);
    sketchCtx.closePath();
    sketchCtx.fill();

    // Trees - patches
    sketchCtx.fillStyle = PALETTE[2].color;
    for (let i = 0; i < 8; i++) {
      const cx = w * (0.05 + i * 0.12);
      const cy = h * 0.52;
      sketchCtx.beginPath();
      sketchCtx.arc(cx, cy, 30, 0, Math.PI * 2);
      sketchCtx.fill();
    }

    // Ground - mid area
    sketchCtx.fillStyle = PALETTE[4].color;
    sketchCtx.fillRect(0, h * 0.58, w, h * 0.15);

    // Sand strip
    sketchCtx.fillStyle = PALETTE[5].color;
    sketchCtx.fillRect(0, h * 0.73, w, h * 0.07);

    // Water - bottom
    sketchCtx.fillStyle = PALETTE[1].color;
    sketchCtx.fillRect(0, h * 0.8, w, h * 0.2);

    // Snow caps on mountain peaks
    sketchCtx.fillStyle = PALETTE[6].color;
    [[0.15, 0.28], [0.45, 0.25], [0.75, 0.3]].forEach(([px, py]) => {
      sketchCtx.beginPath();
      sketchCtx.arc(w * px, h * py, 18, 0, Math.PI * 2);
      sketchCtx.fill();
    });

    renderDirty = true;
  }

  // ==========================================================================
  //  PROCEDURAL RENDERING — reads sketch, generates textures
  // ==========================================================================
  function classifyPixel(r, g, b, a) {
    if (a < 30) return null;
    let best = null, bestDist = Infinity;
    for (const p of PALETTE) {
      const dr = r - p.rgb[0], dg = g - p.rgb[1], db = b - p.rgb[2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) { bestDist = d; best = p.name; }
    }
    return bestDist < 12000 ? best : null;
  }

  function generateRender() {
    const w = canvasW, h = canvasH;
    if (w === 0 || h === 0) return;

    // Read sketch pixel data at 1:1 (CSS pixels)
    // We sample the sketch canvas at its DPR-scaled resolution
    const sketchImageData = sketchCtx.getImageData(0, 0, w, h);
    const sketchPx = sketchImageData.data;

    // Build classification map at reduced resolution for performance
    const step = 2;
    const cols = Math.ceil(w / step);
    const rows = Math.ceil(h / step);
    const classMap = new Array(rows);
    for (let r = 0; r < rows; r++) {
      classMap[r] = new Array(cols);
      for (let c = 0; c < cols; c++) {
        const px = c * step, py = r * step;
        const idx = (py * w + px) * 4;
        classMap[r][c] = classifyPixel(sketchPx[idx], sketchPx[idx + 1], sketchPx[idx + 2], sketchPx[idx + 3]);
      }
    }

    // Create output ImageData
    const outData = renderCtx.createImageData(w, h);
    const out = outData.data;

    seedRng(42);

    // Time for animation
    const t = performance.now() * 0.001;

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const cr = Math.min(Math.floor(py / step), rows - 1);
        const cc = Math.min(Math.floor(px / step), cols - 1);
        const cls = classMap[cr][cc];
        const idx = (py * w + px) * 4;
        const nx = px / w;
        const ny = py / h;

        if (!cls) {
          // Empty — dark background
          out[idx] = 6; out[idx + 1] = 8; out[idx + 2] = 15; out[idx + 3] = 255;
          continue;
        }

        let R = 0, G = 0, B = 0;

        switch (cls) {
          case 'Sky': {
            // Vertical gradient + cloud fbm
            const base = lerp(0.55, 0.85, ny / 0.5);
            const r2 = lerp(135, 70, Math.min(ny * 2, 1));
            const g2 = lerp(206, 130, Math.min(ny * 2, 1));
            const b2 = lerp(255, 220, Math.min(ny * 2, 1));
            R = r2; G = g2; B = b2;

            // Clouds
            const cloud = fbm(px * 0.005, py * 0.008, 5, 2.0, 0.5);
            if (cloud > 0.05) {
              const ci = Math.min((cloud - 0.05) * 4, 1);
              R = lerp(R, 245, ci * 0.7);
              G = lerp(G, 245, ci * 0.7);
              B = lerp(B, 255, ci * 0.5);
            }
            break;
          }

          case 'Water': {
            // Base deep blue
            const depth = 0.5 + fbm(px * 0.01, py * 0.015, 4, 2.0, 0.5) * 0.3;
            R = 15 + depth * 30;
            G = 60 + depth * 50;
            B = 120 + depth * 50;

            // Wave lines
            const wave = Math.sin(px * 0.04 + py * 0.5 + noise2d(px * 0.02, py * 0.01) * 4);
            if (wave > 0.7) {
              const wi = (wave - 0.7) / 0.3;
              R = lerp(R, 180, wi * 0.5);
              G = lerp(G, 210, wi * 0.5);
              B = lerp(B, 240, wi * 0.5);
            }

            // Reflection highlights
            const refl = fbm(px * 0.03, py * 0.005, 3, 2.0, 0.5);
            if (refl > 0.25) {
              const ri = (refl - 0.25) * 2;
              R = lerp(R, 200, ri * 0.3);
              G = lerp(G, 220, ri * 0.3);
              B = lerp(B, 255, ri * 0.25);
            }
            break;
          }

          case 'Trees': {
            // Canopy base
            const n = fbm(px * 0.02, py * 0.02, 4, 2.0, 0.5);
            const n2 = fbm(px * 0.05 + 100, py * 0.05 + 100, 3, 2.0, 0.5);

            // Green variation
            R = 30 + n * 40;
            G = 80 + n * 60 + n2 * 20;
            B = 20 + n * 25;

            // Canopy circles — darker dappling
            const cx1 = Math.sin(px * 0.08) * Math.cos(py * 0.06);
            if (cx1 > 0.3) {
              R *= 0.7; G *= 0.8; B *= 0.6;
            }

            // Trunk lines (thin vertical dark streaks)
            const trunkNoise = noise2d(px * 0.15, 0);
            if (Math.abs(trunkNoise) < 0.05 && n2 < -0.1) {
              R = 60; G = 40; B = 20;
            }

            // Leaf scatter (bright dots)
            const leaf = noise2d(px * 0.3, py * 0.3);
            if (leaf > 0.35) {
              R = Math.min(R + 30, 255);
              G = Math.min(G + 25, 255);
            }
            break;
          }

          case 'Mountains': {
            // Ridge profile from noise
            const ridge = fbm(px * 0.006, 0, 4, 2.0, 0.5);
            const elevation = 1 - ny; // higher = top of canvas

            // Base rock
            const rock = fbm(px * 0.015, py * 0.015, 5, 2.0, 0.5);
            const base = 90 + rock * 50;
            R = base * 0.9;
            G = base * 0.88;
            B = base * 0.95;

            // Sun-facing side (left lighter)
            const sunFace = fbm(px * 0.01 - 50, py * 0.01, 3, 2.0, 0.5);
            if (sunFace > 0) {
              R = Math.min(R + sunFace * 40, 200);
              G = Math.min(G + sunFace * 35, 195);
              B = Math.min(B + sunFace * 45, 210);
            } else {
              // Shadow side
              R *= 0.75; G *= 0.73; B *= 0.78;
            }

            // Snow caps — if pixel is in upper portion and noise says so
            if (elevation > 0.65 && rock > 0.1) {
              const snowAmt = Math.min((elevation - 0.65) * 4, 1) * Math.max(rock, 0);
              R = lerp(R, 240, snowAmt);
              G = lerp(G, 242, snowAmt);
              B = lerp(B, 250, snowAmt);
            }
            break;
          }

          case 'Ground': {
            // Warm brown base
            const n = fbm(px * 0.02, py * 0.02, 4, 2.0, 0.5);
            R = 90 + n * 40;
            G = 65 + n * 30;
            B = 30 + n * 20;

            // Grass strokes
            const grass = noise2d(px * 0.1, py * 0.25);
            if (grass > 0.2) {
              R -= 15; G += 20; B -= 5;
            }

            // Small stones
            const stone = noise2d(px * 0.5, py * 0.5);
            if (stone > 0.42) {
              R += 30; G += 28; B += 25;
            }
            break;
          }

          case 'Sand': {
            // Warm sand base
            const n = fbm(px * 0.03, py * 0.03, 3, 2.0, 0.5);
            R = 194 + n * 30;
            G = 169 + n * 25;
            B = 94 + n * 20;

            // Fine grain noise dots
            const grain = noise2d(px * 0.4, py * 0.4);
            R += grain * 15;
            G += grain * 12;
            B += grain * 8;

            // Wind ripple lines
            const ripple = Math.sin(py * 0.3 + noise2d(px * 0.02, py * 0.01) * 8);
            if (ripple > 0.6) {
              const ri = (ripple - 0.6) * 2.5;
              R = lerp(R, R + 20, ri);
              G = lerp(G, G + 18, ri);
              B = lerp(B, B + 12, ri);
            }
            break;
          }

          case 'Snow': {
            // Smooth white
            const n = fbm(px * 0.015, py * 0.015, 3, 2.0, 0.5);
            R = 230 + n * 20;
            G = 232 + n * 18;
            B = 245 + n * 10;

            // Blue-tinted shadows
            const shadow = fbm(px * 0.008 + 200, py * 0.012 + 200, 4, 2.0, 0.5);
            if (shadow < -0.1) {
              R -= 25; G -= 15; B += 5;
            }

            // Sparkle dots
            const sparkle = noise2d(px * 0.8, py * 0.8);
            if (sparkle > 0.44) {
              R = 255; G = 255; B = 255;
            }
            break;
          }
        }

        out[idx] = Math.max(0, Math.min(255, R));
        out[idx + 1] = Math.max(0, Math.min(255, G));
        out[idx + 2] = Math.max(0, Math.min(255, B));
        out[idx + 3] = 255;
      }
    }

    // Edge blending pass — simple 3x3 box blur on the output
    const blurred = new Uint8ClampedArray(out.length);
    blurred.set(out);
    for (let py = 1; py < h - 1; py++) {
      for (let px = 1; px < w - 1; px++) {
        // Check if this is near a region boundary
        const cr = Math.min(Math.floor(py / step), rows - 1);
        const cc = Math.min(Math.floor(px / step), cols - 1);
        const center = classMap[cr][cc];

        // Check neighbors
        let isBoundary = false;
        for (let dy = -1; dy <= 1 && !isBoundary; dy++) {
          for (let dx = -1; dx <= 1 && !isBoundary; dx++) {
            const nr = Math.min(Math.max(cr + dy, 0), rows - 1);
            const nc = Math.min(Math.max(cc + dx, 0), cols - 1);
            if (classMap[nr][nc] !== center) isBoundary = true;
          }
        }

        if (isBoundary) {
          // Apply 5x5 box blur
          let rr = 0, gg = 0, bb = 0, count = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const sy = py + dy, sx = px + dx;
              if (sy >= 0 && sy < h && sx >= 0 && sx < w) {
                const si = (sy * w + sx) * 4;
                rr += out[si]; gg += out[si + 1]; bb += out[si + 2];
                count++;
              }
            }
          }
          const bi = (py * w + px) * 4;
          blurred[bi] = rr / count;
          blurred[bi + 1] = gg / count;
          blurred[bi + 2] = bb / count;
        }
      }
    }

    const finalData = renderCtx.createImageData(w, h);
    finalData.data.set(blurred);
    renderCtx.putImageData(finalData, 0, 0);
  }

  // ==========================================================================
  //  ANIMATION LOOP
  // ==========================================================================
  function tick(time) {
    if (!running) return;
    animFrameId = requestAnimationFrame(tick);

    if (renderDirty && time - lastRenderTime > RENDER_THROTTLE) {
      renderDirty = false;
      lastRenderTime = time;
      generateRender();
    }
  }

  // ==========================================================================
  //  PUBLIC API
  // ==========================================================================
  return {
    init(containerEl) {
      buildDOM(containerEl);
      sizeCanvases();
      bindEvents();
      // Paint example on load so users see the effect immediately
      paintExample();
    },

    start() {
      if (running) return;
      running = true;
      renderDirty = true;
      animFrameId = requestAnimationFrame(tick);
    },

    stop() {
      running = false;
      if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    },

    resize() {
      sizeCanvases();
      renderDirty = true;
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LofiHifiSection;
