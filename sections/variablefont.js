// ============================================================================
// TYPOGRAPHIC DESIGN SPACE — Variable Font Interpolation
// Procedural bezier letterforms with 4 variation axes (weight, width,
// optical size, slant). Inspired by Inter variable font and NSynth/Magenta
// interpolation grids. Each letter defined as bezier path commands.
// ============================================================================

const VariableFontSection = (() => {

  let container, canvas, ctx, running = false, animFrameId = null;
  let W = 0, H = 0, dpr = 1;
  let time = 0;

  // --- Constants ----------------------------------------------------------

  const BG = '#06080f';
  const ACCENT = 'rgba(100,140,255,0.8)';
  const WORD = 'Design';

  // --- Axis state ---------------------------------------------------------

  const axes = {
    weight: 0.35,
    width: 0.5,
    opticalSize: 0.5,
    slant: 0.0,
  };

  const AXIS_META = [
    { key: 'weight',      label: 'Weight',       lo: 'Thin',       hi: 'Bold' },
    { key: 'width',       label: 'Width',        lo: 'Condensed',  hi: 'Extended' },
    { key: 'opticalSize', label: 'Optical Size', lo: 'Caption',    hi: 'Display' },
    { key: 'slant',       label: 'Slant',        lo: 'Upright',    hi: 'Italic' },
  ];

  // --- Slider interaction state -------------------------------------------

  let sliderRects = [];  // {x, y, w, h, key}
  let activeSlider = null;
  let hoveredSlider = null;
  let hoveredCell = null; // {r, c} for design space grid

  // --- Procedural Letterform Definitions ----------------------------------
  // Each letter is an array of path commands in a normalized coordinate
  // system (0,0) to (1,1). Commands: M(x,y), L(x,y), C(cx1,cy1,cx2,cy2,x,y), Z
  // The coordinate space has origin at top-left of the letter's bounding box.

  const LETTERS = {
    D: [
      { op: 'M', x: 0.15, y: 0.05 },
      { op: 'L', x: 0.45, y: 0.05 },
      { op: 'C', cx1: 0.75, cy1: 0.05, cx2: 0.90, cy2: 0.22, x: 0.90, y: 0.50 },
      { op: 'C', cx1: 0.90, cy1: 0.78, cx2: 0.75, cy2: 0.95, x: 0.45, y: 0.95 },
      { op: 'L', x: 0.15, y: 0.95 },
      { op: 'Z' },
      // Inner cutout
      { op: 'M', x: 0.32, y: 0.22 },
      { op: 'L', x: 0.32, y: 0.78 },
      { op: 'L', x: 0.44, y: 0.78 },
      { op: 'C', cx1: 0.60, cy1: 0.78, cx2: 0.70, cy2: 0.68, x: 0.70, y: 0.50 },
      { op: 'C', cx1: 0.70, cy1: 0.32, cx2: 0.60, cy2: 0.22, x: 0.44, y: 0.22 },
      { op: 'Z' },
    ],
    e: [
      { op: 'M', x: 0.85, y: 0.52 },
      { op: 'L', x: 0.18, y: 0.52 },
      { op: 'C', cx1: 0.18, cy1: 0.32, cx2: 0.32, cy2: 0.20, x: 0.50, y: 0.20 },
      { op: 'C', cx1: 0.70, cy1: 0.20, cx2: 0.83, cy2: 0.32, x: 0.85, y: 0.52 },
      { op: 'Z' },
      { op: 'M', x: 0.18, y: 0.58 },
      { op: 'L', x: 0.85, y: 0.58 },
      { op: 'C', cx1: 0.82, cy1: 0.78, cx2: 0.68, cy2: 0.92, x: 0.50, y: 0.92 },
      { op: 'C', cx1: 0.28, cy1: 0.92, cx2: 0.12, cy2: 0.76, x: 0.12, y: 0.55 },
      { op: 'C', cx1: 0.12, cy1: 0.34, cx2: 0.28, cy2: 0.18, x: 0.50, y: 0.18 },
      { op: 'C', cx1: 0.72, cy1: 0.18, cx2: 0.88, cy2: 0.34, x: 0.88, y: 0.55 },
      { op: 'L', x: 0.88, y: 0.58 },
      // We only want the lower outer bowl visible, using even-odd fill
    ],
    s: [
      { op: 'M', x: 0.78, y: 0.32 },
      { op: 'C', cx1: 0.74, cy1: 0.22, cx2: 0.64, cy2: 0.18, x: 0.50, y: 0.18 },
      { op: 'C', cx1: 0.30, cy1: 0.18, cx2: 0.18, cy2: 0.26, x: 0.18, y: 0.36 },
      { op: 'C', cx1: 0.18, cy1: 0.46, cx2: 0.28, cy2: 0.50, x: 0.50, y: 0.54 },
      { op: 'C', cx1: 0.72, cy1: 0.58, cx2: 0.82, cy2: 0.62, x: 0.82, y: 0.72 },
      { op: 'C', cx1: 0.82, cy1: 0.82, cx2: 0.70, cy2: 0.92, x: 0.50, y: 0.92 },
      { op: 'C', cx1: 0.34, cy1: 0.92, cx2: 0.22, cy2: 0.84, x: 0.20, y: 0.74 },
      // Stroke-based letter: drawn as thick stroke, not filled shape
    ],
    i: [
      // Dot
      { op: 'M', x: 0.38, y: 0.05 },
      { op: 'C', cx1: 0.38, cy1: 0.02, cx2: 0.62, cy2: 0.02, x: 0.62, y: 0.05 },
      { op: 'C', cx1: 0.62, cy1: 0.12, cx2: 0.38, cy2: 0.12, x: 0.38, y: 0.05 },
      { op: 'Z' },
      // Stem
      { op: 'M', x: 0.36, y: 0.22 },
      { op: 'L', x: 0.64, y: 0.22 },
      { op: 'L', x: 0.64, y: 0.92 },
      { op: 'L', x: 0.36, y: 0.92 },
      { op: 'Z' },
    ],
    g: [
      // Main bowl
      { op: 'M', x: 0.82, y: 0.22 },
      { op: 'L', x: 0.82, y: 0.82 },
      { op: 'C', cx1: 0.82, cy1: 1.05, cx2: 0.68, cy2: 1.14, x: 0.50, y: 1.14 },
      { op: 'C', cx1: 0.32, cy1: 1.14, cx2: 0.20, cy2: 1.05, x: 0.20, y: 0.95 },
      // Bowl curve
      { op: 'M', x: 0.82, y: 0.55 },
      { op: 'C', cx1: 0.82, cy1: 0.76, cx2: 0.68, cy2: 0.88, x: 0.50, y: 0.88 },
      { op: 'C', cx1: 0.32, cy1: 0.88, cx2: 0.18, cy2: 0.76, x: 0.18, y: 0.55 },
      { op: 'C', cx1: 0.18, cy1: 0.34, cx2: 0.32, cy2: 0.22, x: 0.50, y: 0.22 },
      { op: 'C', cx1: 0.68, cy1: 0.22, cx2: 0.82, cy2: 0.34, x: 0.82, y: 0.55 },
    ],
    n: [
      // Left stem
      { op: 'M', x: 0.14, y: 0.22 },
      { op: 'L', x: 0.30, y: 0.22 },
      { op: 'L', x: 0.30, y: 0.38 },
      { op: 'C', cx1: 0.34, cy1: 0.26, cx2: 0.44, cy2: 0.20, x: 0.58, y: 0.20 },
      { op: 'C', cx1: 0.74, cy1: 0.20, cx2: 0.86, cy2: 0.32, x: 0.86, y: 0.48 },
      { op: 'L', x: 0.86, y: 0.92 },
      { op: 'L', x: 0.70, y: 0.92 },
      { op: 'L', x: 0.70, y: 0.50 },
      { op: 'C', cx1: 0.70, cy1: 0.38, cx2: 0.64, cy2: 0.34, x: 0.55, y: 0.34 },
      { op: 'C', cx1: 0.44, cy1: 0.34, cx2: 0.30, cy2: 0.42, x: 0.30, y: 0.52 },
      { op: 'L', x: 0.30, y: 0.92 },
      { op: 'L', x: 0.14, y: 0.92 },
      { op: 'Z' },
    ],
  };

  // Letter widths (relative, sum used for spacing)
  const LETTER_WIDTHS = { D: 0.85, e: 0.72, s: 0.62, i: 0.35, g: 0.75, n: 0.75 };

  // --- Transform a single point by axes ----------------------------------

  function transformPoint(px, py, letterCenterX, ax) {
    // Width: horizontal scale relative to letter center
    const widthScale = 0.65 + ax.width * 0.7;  // 0.65 → 1.35
    let x = letterCenterX + (px - letterCenterX) * widthScale;
    let y = py;

    // Optical size: affects y proportions subtly
    const optScale = 0.95 + ax.opticalSize * 0.1;
    y = 0.5 + (y - 0.5) * optScale;

    // Slant: horizontal shear
    const shear = ax.slant * 0.22;
    x += (1.0 - y) * shear;  // top goes right, bottom stays

    return { x, y };
  }

  // --- Render a single letter to canvas -----------------------------------

  function renderLetter(cx, cy, letterH, letterKey, ax, fillColor, strokeColor, strokeW) {
    const cmds = LETTERS[letterKey];
    if (!cmds) return;

    const lw = LETTER_WIDTHS[letterKey] || 0.7;
    const letterW = letterH * lw;
    const centerNorm = 0.5;

    ctx.save();
    ctx.translate(cx - letterW / 2, cy - letterH / 2);
    ctx.scale(letterW, letterH);

    ctx.beginPath();
    for (const cmd of cmds) {
      switch (cmd.op) {
        case 'M': {
          const p = transformPoint(cmd.x, cmd.y, centerNorm, ax);
          ctx.moveTo(p.x, p.y);
          break;
        }
        case 'L': {
          const p = transformPoint(cmd.x, cmd.y, centerNorm, ax);
          ctx.lineTo(p.x, p.y);
          break;
        }
        case 'C': {
          const c1 = transformPoint(cmd.cx1, cmd.cy1, centerNorm, ax);
          const c2 = transformPoint(cmd.cx2, cmd.cy2, centerNorm, ax);
          const p = transformPoint(cmd.x, cmd.y, centerNorm, ax);
          ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p.x, p.y);
          break;
        }
        case 'Z':
          ctx.closePath();
          break;
      }
    }

    ctx.restore();

    // Now translate back to pixel space for fill/stroke
    ctx.save();
    ctx.translate(cx - letterW / 2, cy - letterH / 2);
    ctx.scale(letterW, letterH);

    // Rebuild path in pixel context for rendering
    ctx.beginPath();
    for (const cmd of cmds) {
      switch (cmd.op) {
        case 'M': {
          const p = transformPoint(cmd.x, cmd.y, centerNorm, ax);
          ctx.moveTo(p.x, p.y);
          break;
        }
        case 'L': {
          const p = transformPoint(cmd.x, cmd.y, centerNorm, ax);
          ctx.lineTo(p.x, p.y);
          break;
        }
        case 'C': {
          const c1 = transformPoint(cmd.cx1, cmd.cy1, centerNorm, ax);
          const c2 = transformPoint(cmd.cx2, cmd.cy2, centerNorm, ax);
          const p = transformPoint(cmd.x, cmd.y, centerNorm, ax);
          ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p.x, p.y);
          break;
        }
        case 'Z':
          ctx.closePath();
          break;
      }
    }

    ctx.restore();

    // Apply fill and stroke at pixel scale
    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fill('evenodd');
    }
    if (strokeColor && strokeW > 0) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeW;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  // --- Render the full word -----------------------------------------------

  function renderWord(centerX, centerY, totalWidth, ax, fillColor, strokeColor, strokeWidth) {
    const letters = WORD.split('');
    const totalRelW = letters.reduce((sum, ch) => sum + (LETTER_WIDTHS[ch] || 0.6), 0);
    const spacing = totalWidth * 0.04; // inter-letter space
    const availW = totalWidth - spacing * (letters.length - 1);
    const scale = availW / totalRelW;
    const letterH = scale;

    // Weight adjusts stroke width
    const weightStroke = strokeWidth + ax.weight * letterH * 0.06;

    let x = centerX - totalWidth / 2;
    for (const ch of letters) {
      const relW = LETTER_WIDTHS[ch] || 0.6;
      const lw = relW * scale;
      const lx = x + lw / 2;
      const ly = centerY;

      renderLetter(lx, ly, letterH, ch, ax, fillColor, strokeColor, weightStroke);
      x += lw + spacing;
    }
  }

  // --- Header rendering ---------------------------------------------------

  let headerH = 0;

  function drawHeader() {
    const pad = 32;
    ctx.save();

    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = ACCENT;
    ctx.textBaseline = 'top';
    ctx.fillText('SECTION E', pad, pad);

    ctx.font = 'bold 28px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#e8ecf8';
    ctx.fillText('Typographic Design Space', pad, pad + 22);

    ctx.font = '14px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(180,190,220,0.6)';
    const desc = 'Variable font interpolation \u2014 navigating continuous axes of typographic variation';
    ctx.fillText(desc, pad, pad + 56);

    ctx.restore();
    headerH = pad + 80;
  }

  // --- Slider rendering ---------------------------------------------------

  function drawSliders() {
    const sliderW = Math.min(260, W * 0.25);
    const sliderH = 28;
    const gap = 44;
    const sx = W - sliderW - 40;
    const sy = headerH + 20;

    sliderRects = [];

    ctx.save();

    // Panel background
    const panelPad = 16;
    const panelH = AXIS_META.length * gap + panelPad * 2 + 8;
    ctx.fillStyle = 'rgba(12,16,30,0.7)';
    ctx.strokeStyle = 'rgba(100,140,255,0.12)';
    ctx.lineWidth = 1;
    roundRect(sx - panelPad, sy - panelPad, sliderW + panelPad * 2, panelH, 8);
    ctx.fill();
    ctx.stroke();

    // Title
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(180,190,220,0.55)';
    ctx.textBaseline = 'top';
    ctx.fillText('VARIATION AXES', sx, sy);

    let y = sy + 20;
    for (const meta of AXIS_META) {
      const val = axes[meta.key];
      const isActive = activeSlider === meta.key;
      const isHovered = hoveredSlider === meta.key;

      // Label
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillStyle = isActive || isHovered ? '#e8ecf8' : 'rgba(180,190,220,0.6)';
      ctx.textBaseline = 'bottom';
      ctx.fillText(meta.label, sx, y - 2);

      // Value
      ctx.textAlign = 'right';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(100,140,255,0.6)';
      ctx.fillText(val.toFixed(2), sx + sliderW, y - 2);
      ctx.textAlign = 'left';

      // Track
      const trackY = y + 4;
      const trackH = 4;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(sx, trackY, sliderW, trackH, 2);
      ctx.fill();

      // Filled portion
      ctx.fillStyle = isActive ? 'rgba(100,140,255,0.5)' : 'rgba(100,140,255,0.3)';
      roundRect(sx, trackY, sliderW * val, trackH, 2);
      ctx.fill();

      // Thumb
      const thumbX = sx + sliderW * val;
      const thumbR = isActive ? 7 : (isHovered ? 6 : 5);
      ctx.beginPath();
      ctx.arc(thumbX, trackY + trackH / 2, thumbR, 0, Math.PI * 2);
      ctx.fillStyle = isActive || isHovered ? '#e8ecf8' : ACCENT;
      ctx.fill();

      // Lo/Hi labels
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(180,190,220,0.55)';
      ctx.textBaseline = 'top';
      ctx.fillText(meta.lo, sx, trackY + trackH + 3);
      ctx.textAlign = 'right';
      ctx.fillText(meta.hi, sx + sliderW, trackY + trackH + 3);
      ctx.textAlign = 'left';

      sliderRects.push({ x: sx - 8, y: y - 14, w: sliderW + 16, h: gap, key: meta.key });
      y += gap;
    }

    ctx.restore();

    return { x: sx - panelPad, y: sy - panelPad, w: sliderW + panelPad * 2, h: panelH };
  }

  // --- Design space grid --------------------------------------------------

  function drawDesignSpaceGrid() {
    const GRID_N = 5;
    const gridSize = Math.min(280, W * 0.25, H * 0.32);
    const cellSize = gridSize / GRID_N;
    const gx = W - gridSize - 40;
    const gy = H - gridSize - 40;

    ctx.save();

    // Panel background
    const pad = 12;
    ctx.fillStyle = 'rgba(12,16,30,0.6)';
    ctx.strokeStyle = 'rgba(100,140,255,0.08)';
    ctx.lineWidth = 1;
    roundRect(gx - pad, gy - pad - 30, gridSize + pad * 2, gridSize + pad * 2 + 30, 8);
    ctx.fill();
    ctx.stroke();

    // Title
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(180,190,220,0.55)';
    ctx.textBaseline = 'top';
    ctx.fillText('DESIGN SPACE', gx, gy - 24);

    // Axis labels
    ctx.fillStyle = 'rgba(180,190,220,0.55)';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Weight \u2192', gx, gy - 4);
    ctx.save();
    ctx.translate(gx - 6, gy + gridSize);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText('Width \u2192', 0, 0);
    ctx.restore();

    // Find current position
    const curCol = Math.round(axes.weight * (GRID_N - 1));
    const curRow = Math.round(axes.width * (GRID_N - 1));

    for (let r = 0; r < GRID_N; r++) {
      for (let c = 0; c < GRID_N; c++) {
        const cx = gx + c * cellSize + cellSize / 2;
        const cy = gy + r * cellSize + cellSize / 2;
        const isCurrent = c === curCol && r === curRow;
        const isHov = hoveredCell && hoveredCell.c === c && hoveredCell.r === r;

        // Cell background
        ctx.fillStyle = isCurrent ? 'rgba(100,140,255,0.15)' :
                        (isHov ? 'rgba(100,140,255,0.08)' : 'rgba(255,255,255,0.015)');
        ctx.fillRect(gx + c * cellSize + 1, gy + r * cellSize + 1, cellSize - 2, cellSize - 2);

        if (isCurrent) {
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(gx + c * cellSize + 0.5, gy + r * cellSize + 0.5, cellSize - 1, cellSize - 1);
        }

        // Mini word render
        const miniAx = {
          weight: c / (GRID_N - 1),
          width: r / (GRID_N - 1),
          opticalSize: axes.opticalSize,
          slant: axes.slant,
        };
        const miniW = cellSize * 0.75;
        const miniColor = isCurrent ? 'rgba(200,210,240,0.9)' : 'rgba(200,210,240,0.55)';
        renderWord(cx, cy, miniW, miniAx, miniColor, null, 0);
      }
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(100,140,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_N; i++) {
      ctx.beginPath();
      ctx.moveTo(gx + i * cellSize, gy);
      ctx.lineTo(gx + i * cellSize, gy + gridSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gx, gy + i * cellSize);
      ctx.lineTo(gx + gridSize, gy + i * cellSize);
      ctx.stroke();
    }

    ctx.restore();

    return { gx, gy, gridSize, cellSize, GRID_N };
  }

  // --- Utility ------------------------------------------------------------

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // --- Main draw ----------------------------------------------------------

  let gridInfo = null;

  function draw(ts) {
    if (!running) return;
    animFrameId = requestAnimationFrame(draw);
    time = ts || 0;

    ctx.clearRect(0, 0, W * dpr, H * dpr);
    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    drawHeader();

    // Compute main word area
    const sliderPanel = drawSliders();
    gridInfo = drawDesignSpaceGrid();

    // Main word display — fill the available left space
    const wordAreaW = (sliderPanel.x - 40) - 32;
    const wordAreaH = H - headerH - 40;
    const wordCX = 32 + wordAreaW / 2;
    const wordCY = headerH + wordAreaH / 2;
    const wordDisplayW = wordAreaW * 0.85;

    // Subtle background frame
    ctx.strokeStyle = 'rgba(100,140,255,0.04)';
    ctx.lineWidth = 1;
    roundRect(32, headerH + 10, wordAreaW, wordAreaH - 20, 8);
    ctx.stroke();

    // Render the main word
    const fillColor = '#e0e6f6';
    const strokeColor = 'rgba(100,140,255,0.3)';
    const strokeW = 1 + axes.weight * 2;
    renderWord(wordCX, wordCY - 10, wordDisplayW, axes, fillColor, strokeColor, strokeW);

    // Axes readout below word
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(180,190,220,0.55)';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    const readout = `wght:${axes.weight.toFixed(2)}  wdth:${axes.width.toFixed(2)}  opsz:${axes.opticalSize.toFixed(2)}  slnt:${axes.slant.toFixed(2)}`;
    ctx.fillText(readout, wordCX, wordCY + wordDisplayW * 0.22);
    ctx.textAlign = 'left';

    ctx.restore();
  }

  // --- Interaction --------------------------------------------------------

  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function getTouchPos(e) {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches[0] || e.changedTouches[0];
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  function hitTestSlider(x, y) {
    for (const sr of sliderRects) {
      if (x >= sr.x && x <= sr.x + sr.w && y >= sr.y && y <= sr.y + sr.h) {
        return sr.key;
      }
    }
    return null;
  }

  function updateSliderValue(key, x) {
    const sr = sliderRects.find(s => s.key === key);
    if (!sr) return;
    const trackX = sr.x + 8;
    const trackW = sr.w - 16;
    const val = Math.max(0, Math.min(1, (x - trackX) / trackW));
    axes[key] = val;
  }

  function hitTestGrid(x, y) {
    if (!gridInfo) return null;
    const { gx, gy, gridSize, cellSize, GRID_N } = gridInfo;
    if (x < gx || x > gx + gridSize || y < gy || y > gy + gridSize) return null;
    const c = Math.floor((x - gx) / cellSize);
    const r = Math.floor((y - gy) / cellSize);
    if (c >= 0 && c < GRID_N && r >= 0 && r < GRID_N) {
      return { c, r };
    }
    return null;
  }

  function onMouseDown(e) {
    const pos = getCanvasPos(e);
    const sliderKey = hitTestSlider(pos.x, pos.y);
    if (sliderKey) {
      activeSlider = sliderKey;
      updateSliderValue(sliderKey, pos.x);
      return;
    }
    const cell = hitTestGrid(pos.x, pos.y);
    if (cell && gridInfo) {
      axes.weight = cell.c / (gridInfo.GRID_N - 1);
      axes.width = cell.r / (gridInfo.GRID_N - 1);
    }
  }

  function onMouseMove(e) {
    const pos = getCanvasPos(e);
    if (activeSlider) {
      updateSliderValue(activeSlider, pos.x);
      canvas.style.cursor = 'grabbing';
      return;
    }
    hoveredSlider = hitTestSlider(pos.x, pos.y);
    hoveredCell = hitTestGrid(pos.x, pos.y);
    canvas.style.cursor = (hoveredSlider || hoveredCell) ? 'pointer' : 'default';
  }

  function onMouseUp() {
    activeSlider = null;
  }

  function onTouchStart(e) {
    e.preventDefault();
    const pos = getTouchPos(e);
    const sliderKey = hitTestSlider(pos.x, pos.y);
    if (sliderKey) {
      activeSlider = sliderKey;
      updateSliderValue(sliderKey, pos.x);
      return;
    }
    const cell = hitTestGrid(pos.x, pos.y);
    if (cell && gridInfo) {
      axes.weight = cell.c / (gridInfo.GRID_N - 1);
      axes.width = cell.r / (gridInfo.GRID_N - 1);
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (activeSlider) {
      const pos = getTouchPos(e);
      updateSliderValue(activeSlider, pos.x);
    }
  }

  function onTouchEnd() {
    activeSlider = null;
  }

  // --- Public API ---------------------------------------------------------

  return {
    init(containerEl) {
      container = containerEl;
      container.style.position = 'relative';
      container.style.overflow = 'hidden';
      container.style.background = BG;
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.userSelect = 'none';

      canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.appendChild(canvas);

      ctx = canvas.getContext('2d');

      canvas.addEventListener('mousedown', onMouseDown);
      canvas.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd);

      this.resize();
    },

    start() {
      if (running) return;
      running = true;
      animFrameId = requestAnimationFrame(draw);
    },

    stop() {
      running = false;
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
    },

    resize() {
      dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = VariableFontSection;
