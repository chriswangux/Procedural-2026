// =============================================================================
// SPIDER-VERSE SHADING SECTION — Art-Directable Cross-Hatching & Stippling
// Artist demonstrates design intent, AI fills in the in-betweens.
// Inspired by Spider-Man: Into the Spider-Verse's hand-drawn shading style.
// =============================================================================

const SpiderVerseSection = (() => {
  // ---------------------------------------------------------------------------
  // Simplex Noise (2D) — for hand-drawn waviness
  // ---------------------------------------------------------------------------
  const SimplexNoise = (() => {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    const grad3 = [
      [1, 1], [-1, 1], [1, -1], [-1, -1],
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [-1, 1], [1, -1], [-1, -1],
    ];
    const perm = new Uint8Array(512);
    const permMod12 = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let seed = 137;
    const sr = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    for (let i = 255; i > 0; i--) { const j = Math.floor(sr() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod12[i] = perm[i] % 12; }

    function noise2D(xin, yin) {
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const x0 = xin - (i - t), y0 = yin - (j - t);
      const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      const gi0 = permMod12[ii + perm[jj]];
      const gi1 = permMod12[ii + i1 + perm[jj + j1]];
      const gi2 = permMod12[ii + 1 + perm[jj + 1]];
      let n0 = 0, n1 = 0, n2 = 0;
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * (grad3[gi0][0] * x0 + grad3[gi0][1] * y0); }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * (grad3[gi1][0] * x1 + grad3[gi1][1] * y1); }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * (grad3[gi2][0] * x2 + grad3[gi2][1] * y2); }
      return 70 * (n0 + n1 + n2);
    }
    return { noise2D };
  })();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let container, canvas, ctx;
  let running = false, animFrameId = null;
  let width, height, dpr;
  let strokes = [];
  let currentStroke = null;
  let isDrawing = false;
  let shadingDensity = 0.6;
  let lineWeight = 1.0;
  let shadingStyle = 'mixed'; // 'crosshatch', 'stipple', 'mixed'
  let animTime = 0;
  let needsRedraw = true;

  // Paper background color
  const PAPER_COLOR = '#f5f0e8';
  const INK_COLOR = '#1a1410';

  // ---------------------------------------------------------------------------
  // Utility functions
  // ---------------------------------------------------------------------------
  function dist(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // Smooth a stroke path using Chaikin's algorithm
  function smoothPath(points, iterations) {
    if (points.length < 3) return points;
    let result = points;
    for (let iter = 0; iter < iterations; iter++) {
      const smoothed = [result[0]];
      for (let i = 0; i < result.length - 1; i++) {
        const p0 = result[i];
        const p1 = result[i + 1];
        smoothed.push({ x: lerp(p0.x, p1.x, 0.25), y: lerp(p0.y, p1.y, 0.25) });
        smoothed.push({ x: lerp(p0.x, p1.x, 0.75), y: lerp(p0.y, p1.y, 0.75) });
      }
      smoothed.push(result[result.length - 1]);
      result = smoothed;
    }
    return result;
  }

  // Compute tangent and normal at each point of a path
  function computePathData(points) {
    const data = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      data.push({
        x: points[i].x,
        y: points[i].y,
        tx: dx / len, // tangent
        ty: dy / len,
        nx: -dy / len, // normal (perpendicular)
        ny: dx / len,
      });
    }
    return data;
  }

  // Get cumulative distances along a path
  function cumulativeDistances(points) {
    const dists = [0];
    for (let i = 1; i < points.length; i++) {
      dists.push(dists[i - 1] + dist(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y));
    }
    return dists;
  }

  // Resample a path at regular intervals
  function resamplePath(points, spacing) {
    if (points.length < 2) return points;
    const dists = cumulativeDistances(points);
    const totalLen = dists[dists.length - 1];
    if (totalLen < spacing) return points;
    const resampled = [points[0]];
    let currentDist = spacing;
    let segIdx = 0;
    while (currentDist < totalLen) {
      while (segIdx < dists.length - 1 && dists[segIdx + 1] < currentDist) segIdx++;
      if (segIdx >= points.length - 1) break;
      const segLen = dists[segIdx + 1] - dists[segIdx];
      const t = segLen > 0 ? (currentDist - dists[segIdx]) / segLen : 0;
      resampled.push({
        x: lerp(points[segIdx].x, points[segIdx + 1].x, t),
        y: lerp(points[segIdx].y, points[segIdx + 1].y, t),
      });
      currentDist += spacing;
    }
    resampled.push(points[points.length - 1]);
    return resampled;
  }

  // ---------------------------------------------------------------------------
  // Cross-hatching generation
  // ---------------------------------------------------------------------------
  function generateCrossHatch(pathData, stroke) {
    const lines = [];
    const density = shadingDensity;
    const baseSpacing = lerp(18, 5, density);
    const hatchLength = lerp(20, 55, density);
    const weight = lineWeight;

    for (let i = 0; i < pathData.length; i += Math.max(1, Math.floor(baseSpacing / 3))) {
      const pt = pathData[i];
      const progress = i / pathData.length;

      // Primary hatch direction (perpendicular to stroke)
      const angle1 = Math.atan2(pt.ny, pt.nx);
      // Secondary hatch direction (diagonal)
      const angle2 = angle1 + Math.PI * 0.35;

      // Distance-based density: more hatching near center of stroke
      const noiseVal = SimplexNoise.noise2D(pt.x * 0.01, pt.y * 0.01);

      // Primary hatching
      const len1 = hatchLength * (0.5 + 0.5 * Math.abs(noiseVal)) * (0.6 + 0.4 * density);
      const waviness1 = SimplexNoise.noise2D(pt.x * 0.03 + 100, pt.y * 0.03) * 3;
      const waviness2 = SimplexNoise.noise2D(pt.x * 0.03 + 200, pt.y * 0.03 + 200) * 3;

      lines.push({
        x1: pt.x - Math.cos(angle1) * len1 * 0.5,
        y1: pt.y - Math.sin(angle1) * len1 * 0.5 + waviness1,
        x2: pt.x + Math.cos(angle1) * len1 * 0.5,
        y2: pt.y + Math.sin(angle1) * len1 * 0.5 + waviness2,
        weight: weight * (0.4 + 0.6 * (1 - Math.abs(noiseVal))) * lerp(0.8, 2.2, weight),
        opacity: 0.5 + 0.4 * density,
      });

      // Secondary cross-hatching (sparser)
      if (density > 0.3 && (i % 2 === 0 || density > 0.7)) {
        const len2 = len1 * 0.6;
        const wave3 = SimplexNoise.noise2D(pt.x * 0.025 + 300, pt.y * 0.025) * 2;
        lines.push({
          x1: pt.x - Math.cos(angle2) * len2 * 0.5,
          y1: pt.y - Math.sin(angle2) * len2 * 0.5 + wave3,
          x2: pt.x + Math.cos(angle2) * len2 * 0.5,
          y2: pt.y + Math.sin(angle2) * len2 * 0.5 - wave3,
          weight: weight * 0.5 * lerp(0.6, 1.8, weight),
          opacity: 0.3 + 0.3 * density,
        });
      }
    }
    return lines;
  }

  // ---------------------------------------------------------------------------
  // Stippling generation
  // ---------------------------------------------------------------------------
  function generateStipple(pathData, stroke) {
    const dots = [];
    const density = shadingDensity;
    const numDots = Math.floor(pathData.length * lerp(2, 12, density));
    const spread = lerp(8, 30, density);

    for (let i = 0; i < numDots; i++) {
      const idx = Math.floor(Math.random() * pathData.length);
      const pt = pathData[idx];
      const noise1 = SimplexNoise.noise2D(pt.x * 0.02 + i, pt.y * 0.02) * spread;
      const noise2 = SimplexNoise.noise2D(pt.x * 0.02, pt.y * 0.02 + i) * spread;
      const offsetX = (Math.random() - 0.5) * spread + noise1 * 0.3;
      const offsetY = (Math.random() - 0.5) * spread + noise2 * 0.3;
      const distFromCenter = Math.sqrt(offsetX * offsetX + offsetY * offsetY) / spread;

      dots.push({
        x: pt.x + pt.nx * offsetX + pt.tx * offsetY * 0.3,
        y: pt.y + pt.ny * offsetX + pt.ty * offsetY * 0.3,
        radius: lineWeight * lerp(0.5, 1.8, 1 - distFromCenter) * (0.5 + Math.random() * 0.5),
        opacity: lerp(0.3, 0.85, 1 - distFromCenter * 0.5),
      });
    }
    return dots;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function drawPaperTexture() {
    // Subtle paper grain texture
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 8;
      data[i] = clamp(data[i] + noise, 0, 255);
      data[i + 1] = clamp(data[i + 1] + noise, 0, 255);
      data[i + 2] = clamp(data[i + 2] + noise, 0, 255);
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function drawStroke(points) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x * dpr, points[0].y * dpr);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const mx = (prev.x + curr.x) * 0.5 * dpr;
      const my = (prev.y + curr.y) * 0.5 * dpr;
      ctx.quadraticCurveTo(prev.x * dpr, prev.y * dpr, mx, my);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x * dpr, last.y * dpr);
    ctx.strokeStyle = INK_COLOR;
    ctx.lineWidth = 2.5 * lineWeight * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawHatchLines(lines) {
    for (const line of lines) {
      ctx.beginPath();
      // Add subtle waviness along the line
      const steps = 6;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = lerp(line.x1, line.x2, t) * dpr;
        const y = lerp(line.y1, line.y2, t) * dpr;
        const waveOffset = SimplexNoise.noise2D(x * 0.05, y * 0.05 + animTime * 0.001) * 1.5 * dpr;
        const nx = -(line.y2 - line.y1);
        const ny = (line.x2 - line.x1);
        const len = Math.sqrt(nx * nx + ny * ny) || 1;
        if (s === 0) {
          ctx.moveTo(x + (nx / len) * waveOffset, y + (ny / len) * waveOffset);
        } else {
          ctx.lineTo(x + (nx / len) * waveOffset, y + (ny / len) * waveOffset);
        }
      }
      ctx.strokeStyle = INK_COLOR;
      ctx.lineWidth = line.weight * dpr;
      ctx.lineCap = 'round';
      ctx.globalAlpha = line.opacity;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawStippleDots(dots) {
    for (const dot of dots) {
      ctx.beginPath();
      ctx.arc(dot.x * dpr, dot.y * dpr, dot.radius * dpr, 0, Math.PI * 2);
      ctx.fillStyle = INK_COLOR;
      ctx.globalAlpha = dot.opacity;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function renderAll() {
    // Clear with paper color
    ctx.fillStyle = PAPER_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw subtle paper grain
    drawPaperTexture();

    // Draw each completed stroke and its shading
    for (const stroke of strokes) {
      const smoothed = smoothPath(stroke.points, 2);
      const resampled = resamplePath(smoothed, 4);
      const pathData = computePathData(resampled);

      // Draw shading based on style
      const style = stroke.style || shadingStyle;
      if (style === 'crosshatch' || style === 'mixed') {
        const hatchLines = generateCrossHatch(pathData, stroke);
        drawHatchLines(hatchLines);
      }
      if (style === 'stipple' || style === 'mixed') {
        const dots = generateStipple(pathData, stroke);
        drawStippleDots(dots);
      }

      // Draw the main stroke on top
      drawStroke(resampled);
    }

    // Draw current in-progress stroke
    if (currentStroke && currentStroke.length > 1) {
      drawStroke(currentStroke);
    }
  }

  // ---------------------------------------------------------------------------
  // Animation loop (just for paper grain animation subtlety)
  // ---------------------------------------------------------------------------
  function loop() {
    if (!running) return;
    animTime += 16;
    if (needsRedraw) {
      renderAll();
      needsRedraw = false;
    }
    animFrameId = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------------
  // Input handling
  // ---------------------------------------------------------------------------
  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left),
      y: (touch.clientY - rect.top),
    };
  }

  function onPointerDown(e) {
    e.preventDefault();
    isDrawing = true;
    const pos = getPointerPos(e);
    currentStroke = [pos];
    needsRedraw = true;
  }

  function onPointerMove(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPointerPos(e);
    if (currentStroke.length > 0) {
      const last = currentStroke[currentStroke.length - 1];
      if (dist(last.x, last.y, pos.x, pos.y) > 2) {
        currentStroke.push(pos);
        needsRedraw = true;
      }
    }
  }

  function onPointerUp(e) {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentStroke && currentStroke.length > 2) {
      strokes.push({
        points: currentStroke.slice(),
        style: shadingStyle,
        density: shadingDensity,
        weight: lineWeight,
      });
    }
    currentStroke = null;
    needsRedraw = true;
  }

  // ---------------------------------------------------------------------------
  // DOM Builder
  // ---------------------------------------------------------------------------
  function buildDOM(containerEl) {
    container = containerEl;
    container.style.cssText = `
      position: relative;
      width: 100%;
      padding: 60px 0;
      background: #06080f;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      overflow: hidden;
      box-sizing: border-box;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      max-width: 900px;
      margin: 0 auto 36px;
      padding: 0 32px;
      box-sizing: border-box;
    `;

    const overline = document.createElement('div');
    overline.textContent = 'Art-Directable Shading';
    overline.style.cssText = `
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: rgba(100,140,255,0.8);
      margin-bottom: 12px;
    `;

    const title = document.createElement('h2');
    title.textContent = 'Artist demonstrates intent, AI fills in the in-betweens';
    title.style.cssText = `
      font-size: 28px;
      font-weight: 600;
      color: #e8e6e3;
      margin: 0 0 10px;
      line-height: 1.3;
    `;

    const desc = document.createElement('p');
    desc.textContent = 'Draw rough strokes on the canvas below. The system procedurally generates comic-style cross-hatching, stippling, and shading — inspired by Spider-Man: Into the Spider-Verse.';
    desc.style.cssText = `
      font-size: 15px;
      color: rgba(232,230,227,0.55);
      margin: 0;
      line-height: 1.6;
      max-width: 640px;
    `;

    header.appendChild(overline);
    header.appendChild(title);
    header.appendChild(desc);
    container.appendChild(header);

    // Canvas wrapper
    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = `
      max-width: 900px;
      margin: 0 auto;
      padding: 0 32px;
      box-sizing: border-box;
    `;

    // Canvas container with border
    const canvasContainer = document.createElement('div');
    canvasContainer.style.cssText = `
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.08);
      cursor: crosshair;
      background: ${PAPER_COLOR};
      touch-action: none;
    `;

    canvas = document.createElement('canvas');
    canvas.style.cssText = `
      display: block;
      width: 100%;
      height: 480px;
    `;

    // Hint overlay
    const hint = document.createElement('div');
    hint.id = 'spiderverse-hint';
    hint.textContent = 'Draw here — your strokes will be shaded';
    hint.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: rgba(26,20,16,0.25);
      pointer-events: none;
      transition: opacity 0.4s;
    `;

    canvasContainer.appendChild(canvas);
    canvasContainer.appendChild(hint);
    canvasWrap.appendChild(canvasContainer);
    container.appendChild(canvasWrap);

    // Controls
    const controls = document.createElement('div');
    controls.style.cssText = `
      max-width: 900px;
      margin: 20px auto 0;
      padding: 0 32px;
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      align-items: center;
      box-sizing: border-box;
    `;

    // Shading Density slider
    const densityGroup = createSliderGroup('Shading Density', 0, 1, shadingDensity, 0.01, (v) => {
      shadingDensity = v;
      needsRedraw = true;
    });

    // Line Weight slider
    const weightGroup = createSliderGroup('Line Weight', 0.2, 2.5, lineWeight, 0.05, (v) => {
      lineWeight = v;
      needsRedraw = true;
    });

    // Style selector
    const styleGroup = document.createElement('div');
    styleGroup.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
    const styleLabel = document.createElement('label');
    styleLabel.textContent = 'Style';
    styleLabel.style.cssText = `
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: rgba(232,230,227,0.55);
    `;
    const styleSelect = document.createElement('select');
    styleSelect.style.cssText = `
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: #e8e6e3;
      padding: 6px 10px;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      cursor: pointer;
      outline: none;
    `;
    ['mixed', 'crosshatch', 'stipple'].forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
      if (s === shadingStyle) opt.selected = true;
      styleSelect.appendChild(opt);
    });
    styleSelect.addEventListener('change', () => {
      shadingStyle = styleSelect.value;
      needsRedraw = true;
    });
    styleGroup.appendChild(styleLabel);
    styleGroup.appendChild(styleSelect);

    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = `
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      color: #e8e6e3;
      padding: 8px 20px;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s;
      margin-left: auto;
      align-self: flex-end;
    `;
    clearBtn.addEventListener('mouseenter', () => {
      clearBtn.style.background = 'rgba(255,80,80,0.15)';
      clearBtn.style.borderColor = 'rgba(255,80,80,0.3)';
    });
    clearBtn.addEventListener('mouseleave', () => {
      clearBtn.style.background = 'rgba(255,255,255,0.06)';
      clearBtn.style.borderColor = 'rgba(255,255,255,0.12)';
    });
    clearBtn.addEventListener('click', () => {
      strokes = [];
      currentStroke = null;
      needsRedraw = true;
      const h = container.querySelector('#spiderverse-hint');
      if (h) h.style.opacity = '1';
    });

    controls.appendChild(densityGroup);
    controls.appendChild(weightGroup);
    controls.appendChild(styleGroup);
    controls.appendChild(clearBtn);
    canvasWrap.appendChild(controls);

    // Events
    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('mouseleave', onPointerUp);
    canvas.addEventListener('touchstart', onPointerDown, { passive: false });
    canvas.addEventListener('touchmove', onPointerMove, { passive: false });
    canvas.addEventListener('touchend', onPointerUp);
    canvas.addEventListener('touchcancel', onPointerUp);

    // Hide hint on first draw
    canvas.addEventListener('mousedown', () => {
      const h = container.querySelector('#spiderverse-hint');
      if (h) h.style.opacity = '0';
    }, { once: false });
    canvas.addEventListener('touchstart', () => {
      const h = container.querySelector('#spiderverse-hint');
      if (h) h.style.opacity = '0';
    }, { once: false });
  }

  function createSliderGroup(labelText, min, max, value, step, onChange) {
    const group = document.createElement('div');
    group.style.cssText = 'display: flex; flex-direction: column; gap: 6px; min-width: 140px;';

    const labelRow = document.createElement('div');
    labelRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

    const label = document.createElement('label');
    label.textContent = labelText;
    label.style.cssText = `
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: rgba(232,230,227,0.55);
    `;

    const valDisplay = document.createElement('span');
    valDisplay.textContent = value.toFixed(2);
    valDisplay.style.cssText = `
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: rgba(100,140,255,0.8);
    `;

    labelRow.appendChild(label);
    labelRow.appendChild(valDisplay);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;
    slider.style.cssText = `
      width: 100%;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: rgba(255,255,255,0.1);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    `;

    // Style the slider thumb via a style element
    const styleId = 'spiderverse-slider-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .sv-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px;
          border-radius: 50%;
          background: rgba(100,140,255,0.9);
          cursor: pointer;
          border: none;
        }
        .sv-slider::-moz-range-thumb {
          width: 14px; height: 14px;
          border-radius: 50%;
          background: rgba(100,140,255,0.9);
          cursor: pointer;
          border: none;
        }
      `;
      document.head.appendChild(style);
    }
    slider.className = 'sv-slider';

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      valDisplay.textContent = v.toFixed(2);
      onChange(v);
    });

    group.appendChild(labelRow);
    group.appendChild(slider);
    return group;
  }

  // ---------------------------------------------------------------------------
  // Sizing
  // ---------------------------------------------------------------------------
  function sizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    width = rect.width;
    height = 480;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    needsRedraw = true;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    init(containerEl) {
      buildDOM(containerEl);
      sizeCanvas();
      ctx = canvas.getContext('2d');
      needsRedraw = true;
    },

    start() {
      if (running) return;
      running = true;
      needsRedraw = true;
      loop();
    },

    stop() {
      running = false;
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
    },

    resize() {
      if (!canvas) return;
      sizeCanvas();
      if (ctx) renderAll();
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SpiderVerseSection;
