// ============================================================================
// PARAMETRIC ARCHITECTURE
// Inspired by Shenzhen Bao'an Airport & Autodesk generative design
// Pure vanilla JS + Canvas API, zero dependencies
// ============================================================================

const ParametricArchSection = (() => {

  let container, canvas, ctx, running = false, animFrameId = null;
  let W, H, dpr;

  // --- Slider state ----------------------------------------------------------
  const params = {
    curvature: 0.45,
    columns: 10,
    roofSpan: 1.2,
    height: 1.0,
    organic: 0.35,
  };

  const sliderDefs = [
    { key: 'curvature',  label: 'Curvature',      min: 0,   max: 1,   step: 0.01  },
    { key: 'columns',    label: 'Column Density',  min: 3,   max: 24,  step: 1     },
    { key: 'roofSpan',   label: 'Roof Span',       min: 0.5, max: 2.0, step: 0.01  },
    { key: 'height',     label: 'Height',          min: 0.5, max: 2.0, step: 0.01  },
    { key: 'organic',    label: 'Organic Factor',  min: 0,   max: 1,   step: 0.01  },
  ];

  const presets = {
    'Airport Terminal': { curvature: 0.55, columns: 14, roofSpan: 1.6, height: 0.85, organic: 0.6 },
    'Bridge':          { curvature: 0.7,  columns: 8,  roofSpan: 1.8, height: 0.5,  organic: 0.15 },
    'Stadium':         { curvature: 0.8,  columns: 18, roofSpan: 1.4, height: 1.1,  organic: 0.4 },
    'Tower':           { curvature: 0.2,  columns: 6,  roofSpan: 0.6, height: 1.9,  organic: 0.55 },
  };

  // --- Seeded random ---------------------------------------------------------
  function seededRandom(seed) {
    let s = seed | 0;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 4294967296;
    };
  }

  // --- Bezier helpers --------------------------------------------------------
  function cubicBezier(t, p0, p1, p2, p3) {
    const it = 1 - t;
    return it * it * it * p0 + 3 * it * it * t * p1 + 3 * it * t * t * p2 + t * t * t * p3;
  }

  function evalRoofY(t, baseY, roofHeight, curvature) {
    // t goes from 0 to 1 across the span
    // Returns the Y coordinate of the roof at position t
    if (curvature < 0.3) {
      // Nearly flat with a subtle arc
      const sag = curvature * roofHeight * 0.3;
      const mid = Math.sin(t * Math.PI);
      return baseY - roofHeight + sag * (1 - mid);
    } else if (curvature < 0.6) {
      // Gentle single arc
      const arcDepth = (curvature - 0.3) / 0.3 * roofHeight * 0.4 + roofHeight * 0.1;
      return baseY - roofHeight + arcDepth * (1 - Math.sin(t * Math.PI));
    } else {
      // Dramatic swooping curves — multiple undulations
      const intensity = (curvature - 0.6) / 0.4;
      const waves = 2 + Math.floor(intensity * 2);
      const depth = roofHeight * (0.15 + intensity * 0.35);
      const base = baseY - roofHeight;
      const wave = Math.sin(t * Math.PI * waves) * depth * 0.5;
      const mainArc = Math.sin(t * Math.PI) * depth * 0.5;
      return base + wave * 0.6 + mainArc * 0.4 + depth * (1 - Math.sin(t * Math.PI)) * 0.3;
    }
  }

  // --- Drawing functions -----------------------------------------------------

  function drawSky(groundY) {
    const grad = ctx.createLinearGradient(0, 0, 0, groundY);
    grad.addColorStop(0, '#0a0e1a');
    grad.addColorStop(0.5, '#0f1525');
    grad.addColorStop(1, '#141c30');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, groundY);
  }

  function drawGround(groundY) {
    // Ground shadow
    const shadowGrad = ctx.createLinearGradient(0, groundY, 0, groundY + 80 * dpr);
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.6)');
    shadowGrad.addColorStop(1, 'rgba(6,8,15,0)');
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(0, groundY, W, 80 * dpr);

    // Ground line
    ctx.strokeStyle = '#2a2520';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();
  }

  function drawFoundation(left, right, groundY, foundationH) {
    const grad = ctx.createLinearGradient(0, groundY - foundationH, 0, groundY);
    grad.addColorStop(0, '#8a7a6a');
    grad.addColorStop(1, '#6a5a4a');
    ctx.fillStyle = grad;
    ctx.fillRect(left, groundY - foundationH, right - left, foundationH);
    ctx.strokeStyle = '#9a8a7a';
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(left, groundY - foundationH, right - left, foundationH);
  }

  function drawColumn(x, topY, bottomY, organic, colIndex, totalCols) {
    const baseWidth = (6 + organic * 4) * dpr;
    const topWidth = organic > 0.3 ? baseWidth * (1 - (organic - 0.3) * 0.7) : baseWidth;

    ctx.strokeStyle = '#b0a090';
    ctx.lineWidth = 2 * dpr;

    if (organic < 0.3) {
      // Straight column
      ctx.beginPath();
      ctx.moveTo(x, bottomY);
      ctx.lineTo(x, topY);
      ctx.stroke();
    } else {
      // Tapered column
      ctx.beginPath();
      ctx.moveTo(x - baseWidth / 2, bottomY);
      ctx.lineTo(x - topWidth / 2, topY);
      ctx.lineTo(x + topWidth / 2, topY);
      ctx.lineTo(x + baseWidth / 2, bottomY);
      ctx.closePath();
      ctx.fillStyle = 'rgba(176, 160, 144, 0.15)';
      ctx.fill();
      ctx.stroke();
    }

    // Branching at top when organic > 0.7
    if (organic > 0.7) {
      const branchIntensity = (organic - 0.7) / 0.3;
      const branchLen = (bottomY - topY) * 0.2 * branchIntensity;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = 'rgba(176, 160, 144, 0.7)';

      // Left branch
      ctx.beginPath();
      ctx.moveTo(x, topY + branchLen * 0.3);
      ctx.quadraticCurveTo(
        x - branchLen * 0.8, topY + branchLen * 0.1,
        x - branchLen * 1.2, topY - branchLen * 0.3
      );
      ctx.stroke();

      // Right branch
      ctx.beginPath();
      ctx.moveTo(x, topY + branchLen * 0.3);
      ctx.quadraticCurveTo(
        x + branchLen * 0.8, topY + branchLen * 0.1,
        x + branchLen * 1.2, topY - branchLen * 0.3
      );
      ctx.stroke();

      // Secondary branches
      if (branchIntensity > 0.5) {
        ctx.lineWidth = 1 * dpr;
        ctx.strokeStyle = 'rgba(176, 160, 144, 0.4)';
        const s = branchIntensity * 0.6;
        ctx.beginPath();
        ctx.moveTo(x, topY + branchLen * 0.6);
        ctx.quadraticCurveTo(
          x - branchLen * 0.5, topY + branchLen * 0.4,
          x - branchLen * 0.9, topY + branchLen * 0.1
        );
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, topY + branchLen * 0.6);
        ctx.quadraticCurveTo(
          x + branchLen * 0.5, topY + branchLen * 0.4,
          x + branchLen * 0.9, topY + branchLen * 0.1
        );
        ctx.stroke();
      }
    }
  }

  function drawRoof(left, right, groundY, foundationH, roofHeight, curvature, organic) {
    const steps = 80;
    const baseY = groundY - foundationH;

    ctx.strokeStyle = '#c0b0a0';
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = left + t * (right - left);
      const y = evalRoofY(t, baseY, roofHeight, curvature);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Second outline for thickness
    ctx.strokeStyle = 'rgba(192, 176, 160, 0.3)';
    ctx.lineWidth = 6 * dpr;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = left + t * (right - left);
      const y = evalRoofY(t, baseY, roofHeight, curvature) - 4 * dpr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawStructuralRibs(colPositions, groundY, foundationH, roofHeight, curvature) {
    const baseY = groundY - foundationH;
    const span = colPositions[colPositions.length - 1] - colPositions[0];
    const left = colPositions[0];

    ctx.strokeStyle = 'rgba(176, 160, 144, 0.35)';
    ctx.lineWidth = 1 * dpr;

    for (let i = 0; i < colPositions.length - 1; i++) {
      const x1 = colPositions[i];
      const x2 = colPositions[i + 1];
      const t1 = (x1 - left) / span;
      const t2 = (x2 - left) / span;
      const y1 = evalRoofY(t1, baseY, roofHeight, curvature);
      const y2 = evalRoofY(t2, baseY, roofHeight, curvature);

      // Rib connecting columns at roof level
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      const midX = (x1 + x2) / 2;
      const midT = ((t1 + t2) / 2);
      const midY = evalRoofY(midT, baseY, roofHeight, curvature);
      ctx.quadraticCurveTo(midX, midY, x2, y2);
      ctx.stroke();
    }
  }

  function drawCrossBeams(colPositions, groundY, foundationH, roofHeight, curvature, organic) {
    const baseY = groundY - foundationH;
    const span = colPositions[colPositions.length - 1] - colPositions[0];
    const left = colPositions[0];
    const beamLevels = organic > 0.5 ? 4 : 3;

    for (let level = 1; level <= beamLevels; level++) {
      const frac = level / (beamLevels + 1);
      ctx.strokeStyle = `rgba(176, 160, 144, ${0.2 + frac * 0.15})`;
      ctx.lineWidth = (1 + (1 - frac) * 1) * dpr;

      for (let i = 0; i < colPositions.length - 1; i++) {
        const x1 = colPositions[i];
        const x2 = colPositions[i + 1];
        const t1 = (x1 - left) / span;
        const t2 = (x2 - left) / span;

        const roofY1 = evalRoofY(t1, baseY, roofHeight, curvature);
        const roofY2 = evalRoofY(t2, baseY, roofHeight, curvature);

        const y1 = baseY - (baseY - roofY1) * frac;
        const y2 = baseY - (baseY - roofY2) * frac;

        ctx.beginPath();
        if (organic > 0.2) {
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2 - organic * 4 * dpr;
          ctx.moveTo(x1, y1);
          ctx.quadraticCurveTo(midX, midY, x2, y2);
        } else {
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
        ctx.stroke();
      }
    }
  }

  function drawGlassPanels(colPositions, groundY, foundationH, roofHeight, curvature, organic) {
    const baseY = groundY - foundationH;
    const span = colPositions[colPositions.length - 1] - colPositions[0];
    const left = colPositions[0];

    for (let i = 0; i < colPositions.length - 1; i++) {
      const x1 = colPositions[i];
      const x2 = colPositions[i + 1];
      const t1 = (x1 - left) / span;
      const t2 = (x2 - left) / span;
      const roofY1 = evalRoofY(t1, baseY, roofHeight, curvature);
      const roofY2 = evalRoofY(t2, baseY, roofHeight, curvature);

      // Glass panel fill
      ctx.fillStyle = 'rgba(68, 136, 204, 0.12)';
      ctx.beginPath();
      ctx.moveTo(x1, baseY);
      ctx.lineTo(x1, roofY1);
      // Top edge follows roof
      const subSteps = 10;
      for (let s = 1; s <= subSteps; s++) {
        const st = t1 + (t2 - t1) * (s / subSteps);
        const sx = x1 + (x2 - x1) * (s / subSteps);
        const sy = evalRoofY(st, baseY, roofHeight, curvature);
        ctx.lineTo(sx, sy);
      }
      ctx.lineTo(x2, baseY);
      ctx.closePath();
      ctx.fill();

      // Lattice pattern for organic > 0.5
      if (organic > 0.5) {
        const latticeAlpha = (organic - 0.5) * 0.3;
        ctx.strokeStyle = `rgba(68, 136, 204, ${latticeAlpha})`;
        ctx.lineWidth = 0.7 * dpr;

        const panelW = x2 - x1;
        const panelH = baseY - Math.min(roofY1, roofY2);
        const diagCount = Math.ceil(panelW / (20 * dpr));

        for (let d = 0; d < diagCount; d++) {
          const frac = d / diagCount;
          const dx = x1 + frac * panelW;
          const dy1 = baseY;
          const topFrac = t1 + frac * (t2 - t1);
          const dy2 = evalRoofY(topFrac, baseY, roofHeight, curvature);

          // Diagonals going right
          ctx.beginPath();
          ctx.moveTo(dx, dy1);
          ctx.lineTo(Math.min(dx + panelW * 0.3, x2), dy2 + (dy1 - dy2) * 0.3);
          ctx.stroke();

          // Diagonals going left
          ctx.beginPath();
          ctx.moveTo(dx, dy1);
          ctx.lineTo(Math.max(dx - panelW * 0.3, x1), dy2 + (dy1 - dy2) * 0.3);
          ctx.stroke();
        }
      }
    }
  }

  function drawDimensionLines(left, right, groundY, foundationH, roofHeight, curvature) {
    const baseY = groundY - foundationH;
    const topY = evalRoofY(0.5, baseY, roofHeight, curvature);
    const margin = 30 * dpr;

    ctx.strokeStyle = 'rgba(100, 140, 255, 0.25)';
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);

    // Height dimension (left side)
    const dimX = left - margin;
    ctx.beginPath();
    ctx.moveTo(dimX, groundY);
    ctx.lineTo(dimX, topY);
    ctx.stroke();

    // Arrowheads
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(dimX - 3 * dpr, groundY - 5 * dpr);
    ctx.lineTo(dimX, groundY);
    ctx.lineTo(dimX + 3 * dpr, groundY - 5 * dpr);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(dimX - 3 * dpr, topY + 5 * dpr);
    ctx.lineTo(dimX, topY);
    ctx.lineTo(dimX + 3 * dpr, topY + 5 * dpr);
    ctx.stroke();

    // Height label
    ctx.fillStyle = 'rgba(100, 140, 255, 0.55)';
    ctx.font = `${10 * dpr}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    const hVal = ((groundY - topY) / dpr).toFixed(0);
    ctx.save();
    ctx.translate(dimX - 10 * dpr, (groundY + topY) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${hVal}px`, 0, 0);
    ctx.restore();

    // Span dimension (bottom)
    const dimY = groundY + 20 * dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(left, dimY);
    ctx.lineTo(right, dimY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(left + 5 * dpr, dimY - 3 * dpr);
    ctx.lineTo(left, dimY);
    ctx.lineTo(left + 5 * dpr, dimY + 3 * dpr);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(right - 5 * dpr, dimY - 3 * dpr);
    ctx.lineTo(right, dimY);
    ctx.lineTo(right - 5 * dpr, dimY + 3 * dpr);
    ctx.stroke();

    const spanVal = ((right - left) / dpr).toFixed(0);
    ctx.fillText(`${spanVal}px`, (left + right) / 2, dimY + 14 * dpr);

    ctx.setLineDash([]);
  }

  function drawBuilding() {
    const { curvature, columns, roofSpan, height, organic } = params;
    const numCols = Math.round(columns);

    // Layout measurements
    const groundY = H * 0.78;
    const maxSpan = W * 0.7;
    const span = maxSpan * roofSpan;
    const centerX = W / 2;
    const left = centerX - span / 2;
    const right = centerX + span / 2;
    const foundationH = 12 * dpr;
    const maxRoofHeight = H * 0.45;
    const roofHeight = maxRoofHeight * height;

    // Column positions
    const colPositions = [];
    for (let i = 0; i < numCols; i++) {
      colPositions.push(left + (i / (numCols - 1)) * (right - left));
    }

    // Draw in order: sky, ground, glass, beams, columns, roof, ribs, dims
    drawSky(groundY);
    drawGround(groundY);
    drawFoundation(left, right, groundY, foundationH);
    drawGlassPanels(colPositions, groundY, foundationH, roofHeight, curvature, organic);
    drawCrossBeams(colPositions, groundY, foundationH, roofHeight, curvature, organic);

    // Columns
    const baseY = groundY - foundationH;
    const spanWidth = right - left;
    for (let i = 0; i < numCols; i++) {
      const x = colPositions[i];
      const t = (x - left) / spanWidth;
      const topY = evalRoofY(t, baseY, roofHeight, curvature);
      drawColumn(x, topY, baseY, organic, i, numCols);
    }

    drawRoof(left, right, groundY, foundationH, roofHeight, curvature, organic);
    drawStructuralRibs(colPositions, groundY, foundationH, roofHeight, curvature);
    drawDimensionLines(left, right, groundY, foundationH, roofHeight, curvature);

    // Building reflection/shadow
    const shadowGrad = ctx.createLinearGradient(
      centerX, groundY,
      centerX, groundY + 50 * dpr
    );
    shadowGrad.addColorStop(0, 'rgba(68, 136, 204, 0.06)');
    shadowGrad.addColorStop(1, 'rgba(6, 8, 15, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(left, groundY, right - left, 50 * dpr);
  }

  // --- Render loop -----------------------------------------------------------

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBuilding();
  }

  function loop() {
    if (!running) return;
    render();
    // Not truly animated — re-render on param change. Keep loop for consistency.
    // animFrameId = requestAnimationFrame(loop);
  }

  // --- DOM -------------------------------------------------------------------

  let sliderEls = {};

  function buildDOM(containerEl) {
    container = containerEl;
    container.style.cssText = 'position:relative;width:100%;background:#06080f;padding:60px 0;box-sizing:border-box;font-family:Inter,system-ui,sans-serif;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'max-width:900px;margin:0 auto 32px;padding:0 32px;box-sizing:border-box;';
    header.innerHTML = `
      <div style="text-transform:uppercase;font-size:11px;letter-spacing:3px;color:rgba(100,140,255,0.8);margin-bottom:10px;font-family:'JetBrains Mono',monospace;">Section J</div>
      <h2 style="margin:0 0 12px;font-size:32px;font-weight:700;color:#e8e4de;line-height:1.2;">Parametric Architecture</h2>
      <p style="margin:0;font-size:15px;color:rgba(232,228,222,0.55);line-height:1.6;max-width:640px;">From airports to stadiums — parametric design generates infinite structural variations from a few control parameters. Inspired by Shenzhen Bao'an Airport.</p>
    `;
    container.appendChild(header);

    // Canvas wrapper
    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'position:relative;width:100%;max-width:900px;margin:0 auto;padding:0 32px;box-sizing:border-box;';
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;border-radius:8px;display:block;background:#06080f;';
    canvasWrap.appendChild(canvas);
    container.appendChild(canvasWrap);

    // Controls wrapper
    const controls = document.createElement('div');
    controls.style.cssText = 'max-width:900px;margin:24px auto 0;padding:0 32px;box-sizing:border-box;';

    // Sliders
    const slidersGrid = document.createElement('div');
    slidersGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px 28px;margin-bottom:20px;';

    sliderDefs.forEach(def => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

      const labelRow = document.createElement('div');
      labelRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

      const lbl = document.createElement('label');
      lbl.textContent = def.label;
      lbl.style.cssText = 'font-size:12px;color:rgba(232,228,222,0.6);font-family:"JetBrains Mono",monospace;';

      const valSpan = document.createElement('span');
      valSpan.style.cssText = 'font-size:11px;color:rgba(100,140,255,0.7);font-family:"JetBrains Mono",monospace;';
      valSpan.textContent = formatVal(def.key, params[def.key]);

      labelRow.appendChild(lbl);
      labelRow.appendChild(valSpan);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = def.min;
      input.max = def.max;
      input.step = def.step;
      input.value = params[def.key];
      input.style.cssText = 'width:100%;accent-color:rgba(100,140,255,0.8);height:4px;cursor:pointer;';
      input.addEventListener('input', () => {
        params[def.key] = parseFloat(input.value);
        valSpan.textContent = formatVal(def.key, params[def.key]);
        render();
      });

      sliderEls[def.key] = { input, valSpan };
      wrap.appendChild(labelRow);
      wrap.appendChild(input);
      slidersGrid.appendChild(wrap);
    });

    controls.appendChild(slidersGrid);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';

    // Preset buttons
    Object.keys(presets).forEach(name => {
      const btn = createButton(name);
      btn.addEventListener('click', () => applyPreset(presets[name]));
      btnRow.appendChild(btn);
    });

    // Random button
    const randBtn = createButton('Random Building');
    randBtn.style.background = 'rgba(100,140,255,0.15)';
    randBtn.style.borderColor = 'rgba(100,140,255,0.35)';
    randBtn.addEventListener('click', randomize);
    btnRow.appendChild(randBtn);

    controls.appendChild(btnRow);
    container.appendChild(controls);
  }

  function createButton(text) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      padding:7px 16px;font-size:12px;font-family:"JetBrains Mono",monospace;
      background:rgba(232,228,222,0.06);color:rgba(232,228,222,0.7);
      border:1px solid rgba(232,228,222,0.12);border-radius:6px;cursor:pointer;
      transition:all 0.15s ease;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(232,228,222,0.12)';
      btn.style.color = '#e8e4de';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = text === 'Random Building' ? 'rgba(100,140,255,0.15)' : 'rgba(232,228,222,0.06)';
      btn.style.color = 'rgba(232,228,222,0.7)';
    });
    return btn;
  }

  function formatVal(key, val) {
    if (key === 'columns') return Math.round(val).toString();
    return val.toFixed(2);
  }

  function applyPreset(preset) {
    Object.keys(preset).forEach(key => {
      params[key] = preset[key];
      if (sliderEls[key]) {
        sliderEls[key].input.value = preset[key];
        sliderEls[key].valSpan.textContent = formatVal(key, preset[key]);
      }
    });
    render();
  }

  function randomize() {
    const rng = seededRandom(Date.now());
    const preset = {
      curvature: rng() * 0.85 + 0.05,
      columns: Math.round(rng() * 18 + 4),
      roofSpan: rng() * 1.3 + 0.55,
      height: rng() * 1.3 + 0.55,
      organic: rng() * 0.9 + 0.05,
    };
    applyPreset(preset);
  }

  // --- Sizing ----------------------------------------------------------------

  function setupCanvas() {
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = Math.round(cssW * 0.52);
    canvas.style.height = cssH + 'px';
    W = Math.round(cssW * dpr);
    H = Math.round(cssH * dpr);
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
  }

  // --- Public API ------------------------------------------------------------

  return {
    init(containerEl) {
      buildDOM(containerEl);
      setupCanvas();
      render();
    },
    start() {
      if (running) return;
      running = true;
      render();
    },
    stop() {
      running = false;
      if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    },
    resize() {
      setupCanvas();
      render();
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ParametricArchSection;
