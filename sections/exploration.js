// ============================================================================
// DESIGN EXPLORATION AT SCALE
// Generative design grid, interpolation, and exploration mode visualizations
// ============================================================================

const ExplorationSection = {
  container: null,
  canvases: [],
  interpCanvas: null,
  modesCanvas: null,
  animFrame: null,
  running: false,
  time: 0,

  // Design variable state
  params: {
    complexity: 0.5,
    symmetry: 0.5,
    organic: 0.3,
    colorTemp: 0.5,
  },

  // Interpolation state
  interpT: 0.5,
  designA: null,
  designB: null,

  // Exploration modes state
  explorationMode: 0, // 0=linear, 1=multi-threaded, 2=agentive
  modeTransition: 0,
  selectedMode: null, // null=auto-cycle, 0/1/2=user-selected
  lastAutoTime: 0,
  agents: [],

  // ── Parametric seed system ──────────────────────────────────────────────
  // Each grid cell gets a unique seed that drives its variation

  _seededRandom(seed) {
    let s = seed;
    return () => {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
  },

  // ── Color system ────────────────────────────────────────────────────────

  _hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return `rgb(${Math.round((r + m) * 255)},${Math.round((g + m) * 255)},${Math.round((b + m) * 255)})`;
  },

  _palette(seed, colorTemp) {
    const rng = this._seededRandom(seed);
    // Color temperature shifts the hue range
    // Cool: blues/purples (200-280), Warm: reds/oranges/yellows (0-60, 330-390)
    const coolBase = 220 + rng() * 60;
    const warmBase = rng() * 60 + (rng() > 0.5 ? 330 : 0);
    const baseHue = coolBase * (1 - colorTemp) + warmBase * colorTemp;
    const colors = [];
    for (let i = 0; i < 5; i++) {
      const hue = baseHue + (i - 2) * (20 + rng() * 25);
      const sat = 0.5 + rng() * 0.4;
      const lit = 0.25 + i * 0.12 + rng() * 0.08;
      colors.push({ h: hue, s: sat, l: lit });
    }
    return colors;
  },

  _getColor(palette, index, alpha) {
    const c = palette[index % palette.length];
    if (alpha !== undefined) {
      const h = ((c.h % 360) + 360) % 360;
      const s = Math.max(0, Math.min(1, c.s));
      const l = Math.max(0, Math.min(1, c.l));
      const ch = (1 - Math.abs(2 * l - 1)) * s;
      const x = ch * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = l - ch / 2;
      let r, g, b;
      if (h < 60) { r = ch; g = x; b = 0; }
      else if (h < 120) { r = x; g = ch; b = 0; }
      else if (h < 180) { r = 0; g = ch; b = x; }
      else if (h < 240) { r = 0; g = x; b = ch; }
      else if (h < 300) { r = x; g = 0; b = ch; }
      else { r = ch; g = 0; b = x; }
      return `rgba(${Math.round((r + m) * 255)},${Math.round((g + m) * 255)},${Math.round((b + m) * 255)},${alpha})`;
    }
    return this._hslToRgb(c.h, c.s, c.l);
  },

  // ── Noise function (simple value noise) ─────────────────────────────────

  _noise2D(x, y, seed) {
    const rng = this._seededRandom(
      Math.floor(x) * 374761 + Math.floor(y) * 668265 + seed
    );
    const v00 = rng();
    const rng2 = this._seededRandom(
      (Math.floor(x) + 1) * 374761 + Math.floor(y) * 668265 + seed
    );
    const v10 = rng2();
    const rng3 = this._seededRandom(
      Math.floor(x) * 374761 + (Math.floor(y) + 1) * 668265 + seed
    );
    const v01 = rng3();
    const rng4 = this._seededRandom(
      (Math.floor(x) + 1) * 374761 + (Math.floor(y) + 1) * 668265 + seed
    );
    const v11 = rng4();
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const tx = fx * fx * (3 - 2 * fx);
    const ty = fy * fy * (3 - 2 * fy);
    return (v00 * (1 - tx) + v10 * tx) * (1 - ty) +
           (v01 * (1 - tx) + v11 * tx) * ty;
  },

  _fbm(x, y, seed, octaves) {
    let val = 0, amp = 1, freq = 1, total = 0;
    for (let i = 0; i < octaves; i++) {
      val += this._noise2D(x * freq, y * freq, seed + i * 1000) * amp;
      total += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return val / total;
  },

  // ── Generate design parameters for a cell ───────────────────────────────

  _cellParams(cellIndex, globalParams) {
    const seed = cellIndex * 7919 + 42;
    const rng = this._seededRandom(seed);
    return {
      seed,
      rng,
      complexity: globalParams.complexity,
      symmetry: globalParams.symmetry,
      organic: globalParams.organic,
      colorTemp: globalParams.colorTemp,
      // Per-cell variation
      patternType: rng(),
      rotation: rng() * Math.PI * 2,
      scale: 0.6 + rng() * 0.8,
      density: rng(),
      layerSeed: Math.floor(rng() * 100000),
    };
  },

  // ── Draw a single generative design on a canvas ─────────────────────────

  _drawDesign(ctx, w, h, params, time) {
    const { seed, complexity, symmetry, organic, colorTemp, patternType,
            rotation, scale, density, layerSeed } = params;
    const rng = this._seededRandom(seed + layerSeed);
    const palette = this._palette(seed, colorTemp);
    const cx = w / 2;
    const cy = h / 2;
    const size = Math.min(w, h);

    ctx.clearRect(0, 0, w, h);

    // Dark background
    ctx.fillStyle = this._getColor(palette, 0, 0.15);
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cx, cy);

    // Number of symmetry folds based on symmetry parameter
    const folds = symmetry < 0.2 ? 1 :
                  symmetry < 0.4 ? 2 :
                  symmetry < 0.6 ? 4 :
                  symmetry < 0.8 ? 6 : 8;

    // Number of layers based on complexity
    const layers = Math.floor(2 + complexity * 6);

    // Number of elements per layer
    const elemCount = Math.floor(3 + complexity * 15 + density * 10);

    for (let layer = 0; layer < layers; layer++) {
      const lrng = this._seededRandom(seed + layer * 3571);
      const layerType = lrng();
      const layerAlpha = 0.3 + lrng() * 0.5;
      const colorIdx = 1 + (layer % 4);

      ctx.save();
      ctx.rotate(rotation + layer * 0.15 + time * 0.0003 * (layer % 2 === 0 ? 1 : -1));

      for (let fold = 0; fold < folds; fold++) {
        ctx.save();
        ctx.rotate((fold * Math.PI * 2) / folds);
        if (fold % 2 === 1 && symmetry > 0.5) {
          ctx.scale(-1, 1);
        }

        if (layerType < 0.3 || organic < 0.3) {
          // Geometric layer: lines, polygons, arcs
          this._drawGeometricLayer(ctx, size, scale, elemCount, lrng, palette,
            colorIdx, layerAlpha, complexity, organic, time, layer);
        } else if (layerType < 0.6) {
          // Organic curves layer
          this._drawOrganicLayer(ctx, size, scale, elemCount, lrng, palette,
            colorIdx, layerAlpha, complexity, organic, seed, time, layer);
        } else {
          // Dot/circle pattern layer
          this._drawDotLayer(ctx, size, scale, elemCount, lrng, palette,
            colorIdx, layerAlpha, complexity, organic, time, layer);
        }

        ctx.restore();
      }

      ctx.restore();
    }

    // Overlay: fine detail noise texture for complexity > 0.6
    if (complexity > 0.6) {
      this._drawNoiseOverlay(ctx, size, seed, palette, complexity, time);
    }

    ctx.restore();
  },

  _drawGeometricLayer(ctx, size, scale, count, rng, palette, colorIdx, alpha, complexity, organic, time, layer) {
    const r = size * 0.35 * scale;
    ctx.strokeStyle = this._getColor(palette, colorIdx, alpha * 0.8);
    ctx.fillStyle = this._getColor(palette, colorIdx, alpha * 0.2);
    ctx.lineWidth = 1 + complexity * 1.5;

    for (let i = 0; i < count; i++) {
      const ir = rng();
      const angle = rng() * Math.PI * 0.5;
      const dist = rng() * r * 0.9;
      const elemSize = (5 + rng() * 25) * scale * (0.5 + complexity * 0.5);
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * dist;
      const sides = Math.floor(3 + rng() * 5);
      const curveAmount = organic * 0.4;
      const breathe = Math.sin(time * 0.001 + i * 0.5 + layer) * 2;

      ctx.beginPath();
      if (ir < 0.4) {
        // Polygon
        for (let s = 0; s <= sides; s++) {
          const sa = (s / sides) * Math.PI * 2 + time * 0.0005;
          const sr = elemSize + breathe + (curveAmount > 0 ? Math.sin(sa * 3) * elemSize * curveAmount : 0);
          const sx = px + Math.cos(sa) * sr;
          const sy = py + Math.sin(sa) * sr;
          if (s === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        if (rng() > 0.5) ctx.fill();
        ctx.stroke();
      } else if (ir < 0.7) {
        // Arc
        const startA = rng() * Math.PI * 2;
        const arcLen = (0.5 + rng() * 1.5) * Math.PI;
        ctx.arc(px, py, elemSize + breathe, startA, startA + arcLen);
        ctx.stroke();
      } else {
        // Line segment
        const la = rng() * Math.PI;
        const ll = elemSize * 2;
        ctx.moveTo(px - Math.cos(la) * ll, py - Math.sin(la) * ll);
        ctx.lineTo(px + Math.cos(la) * ll, py + Math.sin(la) * ll);
        ctx.stroke();
      }
    }
  },

  _drawOrganicLayer(ctx, size, scale, count, rng, palette, colorIdx, alpha, complexity, organic, seed, time, layer) {
    const r = size * 0.32 * scale;
    ctx.strokeStyle = this._getColor(palette, colorIdx, alpha * 0.7);
    ctx.lineWidth = 0.8 + complexity;

    for (let i = 0; i < Math.floor(count * 0.5); i++) {
      const startAngle = rng() * Math.PI * 0.5;
      const startDist = rng() * r * 0.6;
      ctx.beginPath();

      const steps = Math.floor(10 + complexity * 30);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const noiseX = this._fbm(t * 3 + i, layer * 0.7 + time * 0.0003, seed + i, 3);
        const noiseY = this._fbm(t * 3 + i + 100, layer * 0.7 + time * 0.0003, seed + i + 500, 3);
        const flowAngle = startAngle + t * Math.PI * (0.5 + organic * 1.5);
        const flowDist = startDist + t * r * 0.6;
        const ox = (noiseX - 0.5) * size * 0.2 * organic;
        const oy = (noiseY - 0.5) * size * 0.2 * organic;
        const px = Math.cos(flowAngle) * flowDist + ox;
        const py = Math.sin(flowAngle) * flowDist + oy;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  },

  _drawDotLayer(ctx, size, scale, count, rng, palette, colorIdx, alpha, complexity, organic, time, layer) {
    const r = size * 0.35 * scale;

    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 0.5;
      const dist = rng() * r;
      const dotSize = (1.5 + rng() * 6) * (0.5 + complexity * 0.5);
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * dist;
      const breathe = Math.sin(time * 0.002 + i + layer) * 1.5;

      // Organic: soft circles. Geometric: crisp shapes
      if (organic > 0.5) {
        const grad = ctx.createRadialGradient(px, py, 0, px, py, dotSize + breathe + 2);
        grad.addColorStop(0, this._getColor(palette, colorIdx, alpha));
        grad.addColorStop(1, this._getColor(palette, colorIdx, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, dotSize + breathe + 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = this._getColor(palette, colorIdx, alpha);
        ctx.fillRect(px - dotSize / 2, py - dotSize / 2, dotSize + breathe, dotSize + breathe);
      }
    }
  },

  _drawNoiseOverlay(ctx, size, seed, palette, complexity, time) {
    const detail = Math.floor((complexity - 0.6) * 50);
    ctx.strokeStyle = this._getColor(palette, 3, 0.12);
    ctx.lineWidth = 0.5;
    const halfSize = size * 0.38;

    for (let i = 0; i < detail; i++) {
      const rng = this._seededRandom(seed + i * 9973 + Math.floor(time * 0.0001));
      const x = (rng() - 0.5) * halfSize * 2;
      const y = (rng() - 0.5) * halfSize * 2;
      const len = 3 + rng() * 10;
      const angle = this._fbm(x * 0.02, y * 0.02, seed, 2) * Math.PI * 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    }
  },

  // ── Interpolation between two designs ───────────────────────────────────

  _lerpParams(a, b, t) {
    const result = {};
    for (const key of Object.keys(a)) {
      if (typeof a[key] === 'number') {
        result[key] = a[key] * (1 - t) + b[key] * t;
      } else {
        result[key] = t < 0.5 ? a[key] : b[key];
      }
    }
    return result;
  },

  _makeDesignEndpoint(seedBase) {
    const rng = this._seededRandom(seedBase);
    return {
      seed: seedBase,
      rng: this._seededRandom(seedBase),
      complexity: 0.3 + rng() * 0.6,
      symmetry: rng(),
      organic: rng(),
      colorTemp: rng(),
      patternType: rng(),
      rotation: rng() * Math.PI * 2,
      scale: 0.7 + rng() * 0.5,
      density: 0.3 + rng() * 0.5,
      layerSeed: Math.floor(rng() * 100000),
    };
  },

  // ── Exploration modes diagram ───────────────────────────────────────────

  _initAgents() {
    this.agents = [];
    for (let i = 0; i < 30; i++) {
      this.agents.push({
        x: 0.5,
        y: 0.5,
        vx: (Math.random() - 0.5) * 0.004,
        vy: (Math.random() - 0.5) * 0.004,
        trail: [],
        hue: Math.random() * 60 + 180,
        phase: Math.random() * Math.PI * 2,
      });
    }
  },

  _drawExplorationModes(ctx, w, h, time) {
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(8, 10, 18, 0.95)';
    ctx.fillRect(0, 0, w, h);

    // Determine current mode: user-selected or auto-cycle
    const cycleDuration = 5000;
    const totalCycle = cycleDuration * 3;
    const cycleTime = time % totalCycle;
    const autoMode = Math.floor(cycleTime / cycleDuration);
    const currentMode = this.selectedMode !== null ? this.selectedMode : autoMode;
    const modeProgress = (cycleTime % cycleDuration) / cycleDuration;

    // Subtle grid background representing "design space"
    ctx.strokeStyle = 'rgba(100, 120, 180, 0.06)';
    ctx.lineWidth = 1;
    const gridStep = 30;
    for (let x = 0; x < w; x += gridStep) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += gridStep) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Store button regions for hit testing
    this._modeBtnRects = [];

    // Mode labels
    const labels = ['Linear Exploration', 'Multi-threaded Exploration', 'Agentive Exploration'];
    const descriptions = [
      'Single path through design space',
      'Branching parallel evaluation',
      'Autonomous agents explore continuously'
    ];

    // Draw mode selectors with playful underline highlight
    const labelY = 28;
    ctx.textAlign = 'center';

    for (let i = 0; i < 3; i++) {
      const lx = w * (i + 0.5) / 3;
      const isActive = i === currentMode;
      const isSelected = i === this.selectedMode;

      // Hit-test region (generous clickable area, no visible box)
      const hitW = w / 3 - 8;
      const hitH = 52;
      const hitX = lx - hitW / 2;
      const hitY = 6;
      this._modeBtnRects.push({ x: hitX, y: hitY, w: hitW, h: hitH, mode: i });

      // Label text
      const fontSize = isActive ? 13 : 11;
      ctx.font = `${isActive ? '600 ' : '400 '}${fontSize}px "SF Mono", "Fira Code", monospace`;
      ctx.fillStyle = isActive ? 'rgba(220, 230, 255, 0.95)' : 'rgba(150, 160, 190, 0.55)';
      ctx.fillText(labels[i], lx, labelY);

      // Playful underline highlight for active mode
      if (isActive) {
        const textW = ctx.measureText(labels[i]).width;
        const underY = labelY + 4;
        // Wavy/playful underline using a sine wave
        ctx.beginPath();
        ctx.strokeStyle = isSelected ? 'rgba(100, 170, 255, 0.8)' : 'rgba(100, 150, 255, 0.5)';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        const startX = lx - textW / 2 - 4;
        const endX = lx + textW / 2 + 4;
        const waveAmp = 2;
        const waveFreq = 0.12;
        ctx.moveTo(startX, underY);
        for (let px = startX; px <= endX; px += 2) {
          const wave = Math.sin((px - startX) * waveFreq + time * 0.002) * waveAmp;
          ctx.lineTo(px, underY + wave);
        }
        ctx.stroke();
      }

      // Description below
      ctx.font = '10px "SF Mono", "Fira Code", monospace';
      ctx.fillStyle = isActive ? 'rgba(150, 170, 220, 0.6)' : 'rgba(150, 170, 220, 0.45)';
      ctx.fillText(descriptions[i], lx, labelY + 20);

      // Pinned indicator: small dot under the label
      if (isSelected) {
        ctx.fillStyle = 'rgba(100, 170, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(lx, labelY + 32, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Auto-cycle progress: thin line under all three labels
    if (this.selectedMode === null) {
      const barY = labelY + 36;
      const barW = w * 0.5;
      const barX = (w - barW) / 2;
      ctx.fillStyle = 'rgba(100, 140, 255, 0.06)';
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, 2, 1);
      ctx.fill();
      const progress = (cycleTime % cycleDuration) / cycleDuration;
      const segW = barW / 3;
      const fillX = barX + autoMode * segW;
      ctx.fillStyle = 'rgba(100, 160, 255, 0.35)';
      ctx.beginPath();
      ctx.roundRect(fillX, barY, segW * progress, 2, 1);
      ctx.fill();
    }

    // Drawing area
    const drawY = 72;
    const drawH = h - drawY - 10;

    if (currentMode === 0) {
      this._drawLinearMode(ctx, w, drawY, drawH, modeProgress, time);
    } else if (currentMode === 1) {
      this._drawMultiThreadedMode(ctx, w, drawY, drawH, modeProgress, time);
    } else {
      this._drawAgentiveMode(ctx, w, drawY, drawH, modeProgress, time);
    }
  },

  _drawLinearMode(ctx, w, y0, h, progress, time) {
    const cx = w / 2;
    const cy = y0 + h / 2;
    const pathLen = w * 0.7;
    const startX = cx - pathLen / 2;

    // Draw the path
    ctx.strokeStyle = 'rgba(100, 140, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(startX, cy);
    ctx.lineTo(startX + pathLen, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Animated exploration point
    const t = (Math.sin(time * 0.0008) + 1) / 2;
    const px = startX + t * pathLen;

    // Trail
    ctx.strokeStyle = 'rgba(100, 160, 255, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(startX, cy);
    ctx.lineTo(px, cy);
    ctx.stroke();

    // Glow
    const grad = ctx.createRadialGradient(px, cy, 0, px, cy, 25);
    grad.addColorStop(0, 'rgba(100, 160, 255, 0.6)');
    grad.addColorStop(1, 'rgba(100, 160, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, cy, 25, 0, Math.PI * 2);
    ctx.fill();

    // Point
    ctx.fillStyle = 'rgba(160, 200, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(px, cy, 5, 0, Math.PI * 2);
    ctx.fill();

    // Arrow head at end
    ctx.fillStyle = 'rgba(100, 140, 255, 0.4)';
    ctx.beginPath();
    ctx.moveTo(startX + pathLen + 10, cy);
    ctx.lineTo(startX + pathLen - 5, cy - 6);
    ctx.lineTo(startX + pathLen - 5, cy + 6);
    ctx.closePath();
    ctx.fill();

    // Labels at endpoints
    ctx.font = '10px "SF Mono", monospace';
    ctx.fillStyle = 'rgba(150, 170, 210, 0.5)';
    ctx.textAlign = 'center';
    ctx.fillText('Start', startX, cy + 25);
    ctx.fillText('End', startX + pathLen, cy + 25);
  },

  _drawMultiThreadedMode(ctx, w, y0, h, progress, time) {
    const cx = w / 2;
    const cy = y0 + h / 2;
    const startX = w * 0.06;
    const midX = w * 0.3;
    const endX = w * 0.58;
    const leafX = w * 0.88;

    // Draw branching tree spanning full width
    const branches = [
      { from: [startX, cy], to: [midX, cy - h * 0.3], children: [
        { from: null, to: [endX, cy - h * 0.4], leaves: [
          { to: [leafX, cy - h * 0.45] },
          { to: [leafX, cy - h * 0.35] },
        ]},
        { from: null, to: [endX, cy - h * 0.15], leaves: [
          { to: [leafX, cy - h * 0.2] },
          { to: [leafX, cy - h * 0.1] },
        ]},
      ]},
      { from: [startX, cy], to: [midX, cy], children: [
        { from: null, to: [endX, cy - h * 0.05], leaves: [
          { to: [leafX, cy - h * 0.05] },
        ]},
        { from: null, to: [endX, cy + h * 0.05], leaves: [
          { to: [leafX, cy + h * 0.05] },
        ]},
      ]},
      { from: [startX, cy], to: [midX, cy + h * 0.3], children: [
        { from: null, to: [endX, cy + h * 0.15], leaves: [
          { to: [leafX, cy + h * 0.1] },
          { to: [leafX, cy + h * 0.2] },
        ]},
        { from: null, to: [endX, cy + h * 0.4], leaves: [
          { to: [leafX, cy + h * 0.35] },
          { to: [leafX, cy + h * 0.45] },
        ]},
      ]},
    ];

    const animT = (Math.sin(time * 0.001) + 1) / 2;

    // Origin dot
    ctx.fillStyle = 'rgba(160, 200, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(startX, cy, 5, 0, Math.PI * 2);
    ctx.fill();

    branches.forEach((branch, bi) => {
      const [fx, fy] = branch.from;
      const [tx, ty] = branch.to;

      // Main branch line
      ctx.strokeStyle = `rgba(100, 160, 255, ${0.3 + animT * 0.3})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      // Animated dot on main branch
      const dt = (Math.sin(time * 0.0015 + bi * 1.2) + 1) / 2;
      const dx = fx + (tx - fx) * dt;
      const dy = fy + (ty - fy) * dt;

      const g = ctx.createRadialGradient(dx, dy, 0, dx, dy, 15);
      g.addColorStop(0, 'rgba(100, 180, 255, 0.5)');
      g.addColorStop(1, 'rgba(100, 180, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(dx, dy, 15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(140, 200, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(dx, dy, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Child branches (generation 2)
      branch.children.forEach((child, ci) => {
        const [cx2, cy2] = child.to;
        ctx.strokeStyle = 'rgba(100, 160, 255, 0.25)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(cx2, cy2);
        ctx.stroke();

        // Animated dot on child branch
        const ct = (Math.sin(time * 0.002 + bi * 2 + ci * 1.5) + 1) / 2;
        const cdx = tx + (cx2 - tx) * ct;
        const cdy = ty + (cy2 - ty) * ct;
        ctx.fillStyle = 'rgba(140, 190, 255, 0.7)';
        ctx.beginPath();
        ctx.arc(cdx, cdy, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Child end node
        ctx.strokeStyle = 'rgba(100, 160, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx2, cy2, 6, 0, Math.PI * 2);
        ctx.stroke();

        // Leaf branches (generation 3)
        if (child.leaves) {
          child.leaves.forEach((leaf, li) => {
            const [lx, ly] = leaf.to;
            ctx.strokeStyle = 'rgba(100, 160, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx2, cy2);
            ctx.lineTo(lx, ly);
            ctx.stroke();

            // Leaf dot
            const lt = (Math.sin(time * 0.0025 + bi * 3 + ci * 2 + li * 1.8) + 1) / 2;
            const ldx = cx2 + (lx - cx2) * lt;
            const ldy = cy2 + (ly - cy2) * lt;
            ctx.fillStyle = 'rgba(140, 190, 255, 0.5)';
            ctx.beginPath();
            ctx.arc(ldx, ldy, 2, 0, Math.PI * 2);
            ctx.fill();

            // Leaf end node
            ctx.strokeStyle = 'rgba(100, 160, 255, 0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(lx, ly, 5, 0, Math.PI * 2);
            ctx.stroke();
          });
        }
      });

      // Branch end node (generation 1)
      ctx.strokeStyle = 'rgba(100, 160, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(tx, ty, 6, 0, Math.PI * 2);
      ctx.stroke();
    });
  },

  _drawAgentiveMode(ctx, w, y0, h, progress, time) {
    const cx = w / 2;
    const cy = y0 + h / 2;
    const regionW = w * 0.7;
    const regionH = h * 0.7;
    const left = cx - regionW / 2;
    const top = cy - regionH / 2;

    // Update and draw agents
    for (const agent of this.agents) {
      // Wander behavior
      agent.vx += (Math.random() - 0.5) * 0.001;
      agent.vy += (Math.random() - 0.5) * 0.001;
      const speed = Math.sqrt(agent.vx * agent.vx + agent.vy * agent.vy);
      if (speed > 0.005) {
        agent.vx = (agent.vx / speed) * 0.005;
        agent.vy = (agent.vy / speed) * 0.005;
      }

      agent.x += agent.vx;
      agent.y += agent.vy;

      // Soft boundary
      if (agent.x < 0.05) agent.vx += 0.001;
      if (agent.x > 0.95) agent.vx -= 0.001;
      if (agent.y < 0.05) agent.vy += 0.001;
      if (agent.y > 0.95) agent.vy -= 0.001;

      agent.x = Math.max(0, Math.min(1, agent.x));
      agent.y = Math.max(0, Math.min(1, agent.y));

      // Store trail
      agent.trail.push({ x: agent.x, y: agent.y });
      if (agent.trail.length > 60) agent.trail.shift();

      // Draw trail
      if (agent.trail.length > 2) {
        ctx.beginPath();
        for (let i = 0; i < agent.trail.length; i++) {
          const px = left + agent.trail[i].x * regionW;
          const py = top + agent.trail[i].y * regionH;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = `hsla(${agent.hue}, 60%, 60%, 0.15)`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Draw agent dot
      const ax = left + agent.x * regionW;
      const ay = top + agent.y * regionH;
      const pulse = 2.5 + Math.sin(time * 0.003 + agent.phase) * 1;

      const g = ctx.createRadialGradient(ax, ay, 0, ax, ay, pulse + 8);
      g.addColorStop(0, `hsla(${agent.hue}, 70%, 65%, 0.7)`);
      g.addColorStop(1, `hsla(${agent.hue}, 70%, 65%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ax, ay, pulse + 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `hsla(${agent.hue}, 70%, 75%, 0.95)`;
      ctx.beginPath();
      ctx.arc(ax, ay, pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    // "Design space" label
    ctx.font = '9px "SF Mono", monospace';
    ctx.fillStyle = 'rgba(130, 150, 200, 0.55)';
    ctx.textAlign = 'left';
    ctx.fillText('design space', left + 5, top + 12);
  },

  // ── Build the DOM ───────────────────────────────────────────────────────

  init(container) {
    this.container = container;
    container.innerHTML = '';
    container.style.cssText = `
      width: 100%; min-height: 100vh; padding: 60px 40px;
      box-sizing: border-box; background: #06080f;
      font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
      color: #c8d0e0; overflow-x: hidden;
    `;

    // ── Section title ──
    const header = document.createElement('div');
    header.style.cssText = 'text-align: center; margin-bottom: 50px;';
    header.innerHTML = `
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 4px; color: rgba(130,160,255,0.6); margin-bottom: 12px;">
        Design Exploration at Scale
      </div>
      <h2 style="font-size: 32px; font-weight: 300; color: #e0e6f0; margin: 0 0 8px 0; font-family: inherit;">
        Abstract Design Intents as Variables
      </h2>
      <p style="font-size: 13px; color: rgba(160,175,210,0.55); max-width: 520px; margin: 0 auto; line-height: 1.7;">
        Create variants by parameterizing design decisions. Navigate the space
        of possibilities through interpolation and generative exploration.
      </p>
    `;
    container.appendChild(header);

    // ── Generative Grid ──
    const gridSection = document.createElement('div');
    gridSection.style.cssText = 'margin-bottom: 60px;';

    const gridLabel = document.createElement('div');
    gridLabel.style.cssText = 'font-size: 11px; text-transform: uppercase; letter-spacing: 3px; color: rgba(130,160,255,0.55); margin-bottom: 20px;';
    gridLabel.textContent = 'Generative Design Grid';
    gridSection.appendChild(gridLabel);

    // Grid + Controls wrapper
    const gridWrapper = document.createElement('div');
    gridWrapper.style.cssText = 'display: flex; gap: 30px; align-items: flex-start; flex-wrap: wrap;';

    // Grid container
    const gridContainer = document.createElement('div');
    gridContainer.style.cssText = `
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
      flex: 1; min-width: 320px; max-width: 640px;
      background: rgba(20, 25, 40, 0.4); border-radius: 8px;
      padding: 6px; border: 1px solid rgba(80, 100, 160, 0.12);
    `;

    this.canvases = [];
    for (let i = 0; i < 16; i++) {
      const cell = document.createElement('div');
      cell.style.cssText = `
        aspect-ratio: 1; border-radius: 4px; overflow: hidden;
        background: rgba(10, 12, 20, 0.8);
        border: 1px solid rgba(60, 80, 140, 0.08);
        transition: border-color 0.3s;
      `;
      cell.addEventListener('mouseenter', () => {
        cell.style.borderColor = 'rgba(100, 140, 255, 0.3)';
      });
      cell.addEventListener('mouseleave', () => {
        cell.style.borderColor = 'rgba(60, 80, 140, 0.08)';
      });

      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'width: 100%; height: 100%; display: block;';
      cell.appendChild(canvas);
      gridContainer.appendChild(cell);
      this.canvases.push(canvas);
    }
    gridWrapper.appendChild(gridContainer);

    // Controls panel
    const controls = document.createElement('div');
    controls.style.cssText = `
      width: 220px; min-width: 180px; flex-shrink: 0;
      background: rgba(15, 18, 30, 0.6); border-radius: 8px;
      padding: 20px; border: 1px solid rgba(80, 100, 160, 0.12);
    `;

    const ctrlTitle = document.createElement('div');
    ctrlTitle.style.cssText = 'font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: rgba(130,160,255,0.55); margin-bottom: 20px;';
    ctrlTitle.textContent = 'Design Variables';
    controls.appendChild(ctrlTitle);

    const sliderDefs = [
      { key: 'complexity', label: 'Complexity', lo: 'Simple', hi: 'Intricate' },
      { key: 'symmetry', label: 'Symmetry', lo: 'Asymmetric', hi: 'Radial' },
      { key: 'organic', label: 'Organic', lo: 'Geometric', hi: 'Organic' },
      { key: 'colorTemp', label: 'Color Temperature', lo: 'Cool', hi: 'Warm' },
    ];

    this._sliders = {};
    sliderDefs.forEach(def => {
      const group = document.createElement('div');
      group.style.cssText = 'margin-bottom: 18px;';

      const labelRow = document.createElement('div');
      labelRow.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 6px;';
      labelRow.innerHTML = `
        <span style="font-size: 11px; color: rgba(180,190,220,0.7);">${def.label}</span>
        <span style="font-size: 10px; color: rgba(130,150,200,0.55);" class="val-display">${(this.params[def.key] * 100).toFixed(0)}%</span>
      `;
      group.appendChild(labelRow);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.value = String(this.params[def.key] * 100);
      slider.style.cssText = `
        width: 100%; height: 4px; -webkit-appearance: none; appearance: none;
        background: rgba(60, 80, 140, 0.25); border-radius: 2px; outline: none;
        cursor: pointer;
      `;
      // Style the thumb via a class
      slider.classList.add('expl-slider');
      slider.addEventListener('input', () => {
        this.params[def.key] = slider.value / 100;
        labelRow.querySelector('.val-display').textContent = `${slider.value}%`;
      });
      group.appendChild(slider);

      const rangeLabels = document.createElement('div');
      rangeLabels.style.cssText = 'display: flex; justify-content: space-between; margin-top: 3px;';
      rangeLabels.innerHTML = `
        <span style="font-size: 9px; color: rgba(130,150,200,0.55);">${def.lo}</span>
        <span style="font-size: 9px; color: rgba(130,150,200,0.55);">${def.hi}</span>
      `;
      group.appendChild(rangeLabels);

      controls.appendChild(group);
      this._sliders[def.key] = slider;
    });

    // Randomize button
    const randBtn = document.createElement('button');
    randBtn.textContent = 'Randomize All';
    randBtn.style.cssText = `
      width: 100%; padding: 10px; margin-top: 10px;
      background: rgba(80, 110, 200, 0.15); border: 1px solid rgba(80, 110, 200, 0.3);
      border-radius: 6px; color: rgba(160, 180, 240, 0.8); font-size: 11px;
      cursor: pointer; font-family: inherit; letter-spacing: 1px;
      text-transform: uppercase; transition: all 0.2s;
    `;
    randBtn.addEventListener('mouseenter', () => {
      randBtn.style.background = 'rgba(80, 110, 200, 0.25)';
      randBtn.style.borderColor = 'rgba(80, 110, 200, 0.5)';
    });
    randBtn.addEventListener('mouseleave', () => {
      randBtn.style.background = 'rgba(80, 110, 200, 0.15)';
      randBtn.style.borderColor = 'rgba(80, 110, 200, 0.3)';
    });
    randBtn.addEventListener('click', () => {
      for (const def of sliderDefs) {
        const val = Math.random();
        this.params[def.key] = val;
        this._sliders[def.key].value = String(val * 100);
        this._sliders[def.key].parentElement.querySelector('.val-display').textContent = `${(val * 100).toFixed(0)}%`;
      }
    });
    controls.appendChild(randBtn);

    gridWrapper.appendChild(controls);
    gridSection.appendChild(gridWrapper);
    container.appendChild(gridSection);

    // ── Interpolation Demo ──
    const interpSection = document.createElement('div');
    interpSection.style.cssText = 'margin-bottom: 60px;';

    const interpLabel = document.createElement('div');
    interpLabel.style.cssText = 'font-size: 11px; text-transform: uppercase; letter-spacing: 3px; color: rgba(130,160,255,0.55); margin-bottom: 20px;';
    interpLabel.textContent = 'Design Space Interpolation';
    interpSection.appendChild(interpLabel);

    const interpRow = document.createElement('div');
    interpRow.style.cssText = `
      display: flex; align-items: center; gap: 12px;
      background: rgba(15, 18, 30, 0.5); border-radius: 8px;
      padding: 20px; border: 1px solid rgba(80, 100, 160, 0.12);
      flex-wrap: wrap; justify-content: center;
    `;

    // Design A label
    const labelA = document.createElement('div');
    labelA.style.cssText = 'font-size: 10px; color: rgba(130,160,255,0.55); text-align: center; min-width: 30px;';
    labelA.textContent = 'A';
    interpRow.appendChild(labelA);

    // Design A canvas
    const canvasA = document.createElement('canvas');
    canvasA.style.cssText = 'width: 120px; height: 120px; border-radius: 6px; border: 1px solid rgba(80,110,200,0.2); flex-shrink: 0;';
    interpRow.appendChild(canvasA);
    this.interpCanvasA = canvasA;

    // Middle interpolated strip — multiple small canvases
    const interpStrip = document.createElement('div');
    interpStrip.style.cssText = 'display: flex; gap: 4px; align-items: center; flex: 1; min-width: 200px; justify-content: center;';

    this.interpMidCanvases = [];
    const interpSteps = 7;
    for (let i = 0; i < interpSteps; i++) {
      const mc = document.createElement('canvas');
      const isCenter = i === Math.floor(interpSteps / 2);
      const sz = isCenter ? 100 : (60 + 30 * (1 - Math.abs(i - interpSteps / 2 + 0.5) / (interpSteps / 2)));
      mc.style.cssText = `width: ${sz}px; height: ${sz}px; border-radius: 4px; border: 1px solid rgba(80,110,200,${isCenter ? 0.35 : 0.1}); flex-shrink: 0;`;
      interpStrip.appendChild(mc);
      this.interpMidCanvases.push(mc);
    }
    interpRow.appendChild(interpStrip);

    // Design B canvas
    const canvasB = document.createElement('canvas');
    canvasB.style.cssText = 'width: 120px; height: 120px; border-radius: 6px; border: 1px solid rgba(80,110,200,0.2); flex-shrink: 0;';
    interpRow.appendChild(canvasB);
    this.interpCanvasB = canvasB;

    // Design B label
    const labelB = document.createElement('div');
    labelB.style.cssText = 'font-size: 10px; color: rgba(130,160,255,0.55); text-align: center; min-width: 30px;';
    labelB.textContent = 'B';
    interpRow.appendChild(labelB);

    interpSection.appendChild(interpRow);

    // Interpolation slider
    const interpControls = document.createElement('div');
    interpControls.style.cssText = 'margin-top: 16px; display: flex; align-items: center; gap: 12px; justify-content: center;';

    const interpSlider = document.createElement('input');
    interpSlider.type = 'range';
    interpSlider.min = '0';
    interpSlider.max = '100';
    interpSlider.value = '50';
    interpSlider.classList.add('expl-slider');
    interpSlider.style.cssText = `
      width: 400px; max-width: 80%; height: 4px; -webkit-appearance: none; appearance: none;
      background: linear-gradient(90deg, rgba(100,140,255,0.3), rgba(255,140,100,0.3));
      border-radius: 2px; outline: none; cursor: pointer;
    `;
    interpSlider.addEventListener('input', () => {
      this.interpT = interpSlider.value / 100;
    });
    interpControls.appendChild(interpSlider);

    const interpVal = document.createElement('span');
    interpVal.style.cssText = 'font-size: 10px; color: rgba(130,150,200,0.55); min-width: 30px;';
    interpVal.textContent = 't = 0.50';
    interpControls.appendChild(interpVal);
    this._interpValDisplay = interpVal;
    this._interpSlider = interpSlider;

    interpSection.appendChild(interpControls);

    // New endpoints button
    const newEndpoints = document.createElement('div');
    newEndpoints.style.cssText = 'text-align: center; margin-top: 12px;';
    const newBtn = document.createElement('button');
    newBtn.textContent = 'New Endpoints';
    newBtn.style.cssText = `
      padding: 8px 20px; background: rgba(80, 110, 200, 0.12);
      border: 1px solid rgba(80, 110, 200, 0.25); border-radius: 6px;
      color: rgba(160, 180, 240, 0.7); font-size: 10px; cursor: pointer;
      font-family: inherit; letter-spacing: 1px; text-transform: uppercase;
      transition: all 0.2s;
    `;
    newBtn.addEventListener('mouseenter', () => {
      newBtn.style.background = 'rgba(80, 110, 200, 0.22)';
    });
    newBtn.addEventListener('mouseleave', () => {
      newBtn.style.background = 'rgba(80, 110, 200, 0.12)';
    });
    newBtn.addEventListener('click', () => {
      this.designA = this._makeDesignEndpoint(Math.floor(Math.random() * 100000));
      this.designB = this._makeDesignEndpoint(Math.floor(Math.random() * 100000));
    });
    newEndpoints.appendChild(newBtn);
    interpSection.appendChild(newEndpoints);

    container.appendChild(interpSection);

    // ── Exploration Modes ──
    const modesSection = document.createElement('div');
    modesSection.style.cssText = 'margin-bottom: 40px;';

    const modesLabel = document.createElement('div');
    modesLabel.style.cssText = 'font-size: 11px; text-transform: uppercase; letter-spacing: 3px; color: rgba(130,160,255,0.55); margin-bottom: 20px;';
    modesLabel.textContent = 'Exploration Modes';
    modesSection.appendChild(modesLabel);

    const modesContainer = document.createElement('div');
    modesContainer.style.cssText = `
      background: rgba(15, 18, 30, 0.5); border-radius: 8px;
      border: 1px solid rgba(80, 100, 160, 0.12);
      overflow: hidden;
    `;

    this.modesCanvas = document.createElement('canvas');
    this.modesCanvas.style.cssText = 'width: 100%; height: 480px; display: block; cursor: pointer;';
    modesContainer.appendChild(this.modesCanvas);

    // Click handler for mode selection
    this.modesCanvas.addEventListener('click', (e) => {
      if (!this._modeBtnRects) return;
      const rect = this.modesCanvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left);
      const my = (e.clientY - rect.top);
      for (const btn of this._modeBtnRects) {
        if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
          // Toggle: click same mode again → return to auto-cycle
          if (this.selectedMode === btn.mode) {
            this.selectedMode = null;
          } else {
            this.selectedMode = btn.mode;
          }
          return;
        }
      }
    });

    // Hover cursor for buttons
    this.modesCanvas.addEventListener('mousemove', (e) => {
      if (!this._modeBtnRects) return;
      const rect = this.modesCanvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left);
      const my = (e.clientY - rect.top);
      let overBtn = false;
      for (const btn of this._modeBtnRects) {
        if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
          overBtn = true;
          break;
        }
      }
      this.modesCanvas.style.cursor = overBtn ? 'pointer' : 'default';
    });

    modesSection.appendChild(modesContainer);
    container.appendChild(modesSection);

    // ── Inject slider styles ──
    const style = document.createElement('style');
    style.textContent = `
      .expl-slider::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none;
        width: 14px; height: 14px; border-radius: 50%;
        background: rgba(130, 160, 255, 0.8);
        border: 2px solid rgba(100, 130, 230, 0.4);
        cursor: pointer; transition: background 0.2s;
      }
      .expl-slider::-webkit-slider-thumb:hover {
        background: rgba(150, 180, 255, 1);
      }
      .expl-slider::-moz-range-thumb {
        width: 14px; height: 14px; border-radius: 50%;
        background: rgba(130, 160, 255, 0.8);
        border: 2px solid rgba(100, 130, 230, 0.4);
        cursor: pointer;
      }
    `;
    container.appendChild(style);

    // Initialize design endpoints for interpolation
    this.designA = this._makeDesignEndpoint(12345);
    this.designB = this._makeDesignEndpoint(67890);

    // Initialize agents
    this._initAgents();

    // Initial sizing
    this.resize();
  },

  // ── Resize all canvases ──
  resize() {
    // Grid canvases
    this.canvases.forEach(canvas => {
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    });

    // Interpolation canvases
    [this.interpCanvasA, this.interpCanvasB, ...this.interpMidCanvases].forEach(c => {
      if (c) {
        const rect = c.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        c.width = rect.width * dpr;
        c.height = rect.height * dpr;
      }
    });

    // Modes canvas
    if (this.modesCanvas) {
      const rect = this.modesCanvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.modesCanvas.width = rect.width * dpr;
      this.modesCanvas.height = rect.height * dpr;
    }
  },

  // ── Animation loop ──
  start() {
    this.running = true;
    this.time = performance.now();
    this._lastGridDraw = 0;

    const animate = (now) => {
      if (!this.running) return;
      this.time = now;

      // Draw grid at reduced framerate for performance (every 80ms)
      if (now - this._lastGridDraw > 80) {
        this._lastGridDraw = now;
        this._drawGrid(now);
        this._drawInterpolation(now);
      }

      // Exploration modes at full framerate (it's lightweight)
      if (this.modesCanvas) {
        const ctx = this.modesCanvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.scale(dpr, dpr);
        const rect = this.modesCanvas.getBoundingClientRect();
        this._drawExplorationModes(ctx, rect.width, rect.height, now);
        ctx.restore();
      }

      this.animFrame = requestAnimationFrame(animate);
    };
    this.animFrame = requestAnimationFrame(animate);
  },

  stop() {
    this.running = false;
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  },

  _drawGrid(time) {
    const dpr = window.devicePixelRatio || 1;
    for (let i = 0; i < 16; i++) {
      const canvas = this.canvases[i];
      if (!canvas || canvas.width === 0) continue;
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.scale(dpr, dpr);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const params = this._cellParams(i, this.params);
      this._drawDesign(ctx, w, h, params, time);
      ctx.restore();
    }
  },

  _drawInterpolation(time) {
    const dpr = window.devicePixelRatio || 1;
    if (!this.designA || !this.designB) return;

    // Update display
    if (this._interpValDisplay) {
      this._interpValDisplay.textContent = `t = ${this.interpT.toFixed(2)}`;
    }

    // Draw Design A
    if (this.interpCanvasA && this.interpCanvasA.width > 0) {
      const ctx = this.interpCanvasA.getContext('2d');
      ctx.save();
      ctx.scale(dpr, dpr);
      const w = this.interpCanvasA.width / dpr;
      const h = this.interpCanvasA.height / dpr;
      this._drawDesign(ctx, w, h, this.designA, time);
      ctx.restore();
    }

    // Draw Design B
    if (this.interpCanvasB && this.interpCanvasB.width > 0) {
      const ctx = this.interpCanvasB.getContext('2d');
      ctx.save();
      ctx.scale(dpr, dpr);
      const w = this.interpCanvasB.width / dpr;
      const h = this.interpCanvasB.height / dpr;
      this._drawDesign(ctx, w, h, this.designB, time);
      ctx.restore();
    }

    // Draw intermediate steps
    const steps = this.interpMidCanvases.length;
    for (let i = 0; i < steps; i++) {
      const mc = this.interpMidCanvases[i];
      if (!mc || mc.width === 0) continue;
      const t = (i + 0.5) / steps;

      // Blend the t value toward the slider position for the center canvas
      const centerIdx = Math.floor(steps / 2);
      let finalT;
      if (i < centerIdx) {
        finalT = t * this.interpT * 2;
        finalT = Math.min(finalT, this.interpT);
      } else if (i === centerIdx) {
        finalT = this.interpT;
      } else {
        finalT = this.interpT + (1 - this.interpT) * ((i - centerIdx) / (steps - centerIdx));
      }
      finalT = Math.max(0, Math.min(1, finalT));

      const blended = this._lerpParams(this.designA, this.designB, finalT);
      const ctx = mc.getContext('2d');
      ctx.save();
      ctx.scale(dpr, dpr);
      const w = mc.width / dpr;
      const h = mc.height / dpr;
      this._drawDesign(ctx, w, h, blended, time);
      ctx.restore();
    }
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExplorationSection;
}
