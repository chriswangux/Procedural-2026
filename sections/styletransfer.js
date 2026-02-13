// =============================================================================
// STYLE TRANSFER SECTION — Same Content, Different Artistic Processes
// Renders an identical procedural composition through 6 distinct visual styles:
// Wireframe, Watercolor, Oil Paint, Pixel Art, Comic/Pop Art, Woodcut.
// =============================================================================

const StyleTransferSection = (() => {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let container;
  let running = false, animFrameId = null;
  let canvases = []; // Array of { canvas, ctx, style, label }
  let dpr = 1;
  let cellWidth = 0, cellHeight = 0;
  let composition = null; // Shared base composition
  let seed = Date.now();
  let animTime = 0;

  // Style definitions
  const STYLES = [
    { id: 'wireframe', label: 'Wireframe' },
    { id: 'watercolor', label: 'Watercolor' },
    { id: 'oilpaint', label: 'Oil Paint' },
    { id: 'pixelart', label: 'Pixel Art' },
    { id: 'comic', label: 'Comic / Pop Art' },
    { id: 'woodcut', label: 'Woodcut' },
  ];

  // Color palettes for base composition
  const PALETTES = [
    ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'],
    ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b', '#eb4d4b', '#6ab04c', '#686de0'],
    ['#fd79a8', '#a29bfe', '#ffeaa7', '#55efc4', '#74b9ff', '#dfe6e9', '#fab1a0', '#00cec9'],
    ['#fc5c65', '#45aaf2', '#26de81', '#fed330', '#a55eea', '#fd9644', '#2bcbba', '#778ca3'],
    ['#e55039', '#4a69bd', '#78e08f', '#f6b93b', '#e056a0', '#0a3d62', '#b8e994', '#60a3bc'],
  ];

  // ---------------------------------------------------------------------------
  // Seeded random
  // ---------------------------------------------------------------------------
  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  let rng = mulberry32(seed);

  function seededRandom() { return rng(); }

  // ---------------------------------------------------------------------------
  // Composition generation
  // ---------------------------------------------------------------------------
  function generateComposition() {
    rng = mulberry32(seed);
    const palette = PALETTES[Math.floor(seededRandom() * PALETTES.length)];
    const shapes = [];
    const numShapes = 8 + Math.floor(seededRandom() * 5); // 8-12

    for (let i = 0; i < numShapes; i++) {
      const type = ['circle', 'rect', 'triangle', 'polygon'][Math.floor(seededRandom() * 4)];
      const x = 0.1 + seededRandom() * 0.8;
      const y = 0.1 + seededRandom() * 0.8;
      const size = 0.06 + seededRandom() * 0.18;
      const color = palette[Math.floor(seededRandom() * palette.length)];
      const rotation = seededRandom() * Math.PI * 2;

      const shape = { type, x, y, size, color, rotation, zIndex: i };

      if (type === 'polygon') {
        shape.sides = 5 + Math.floor(seededRandom() * 4); // 5-8 sides
      }
      if (type === 'rect') {
        shape.aspect = 0.5 + seededRandom() * 1.0; // width/height ratio
      }

      shapes.push(shape);
    }

    // Sort by size (larger behind smaller) for natural depth
    shapes.sort((a, b) => b.size - a.size);

    composition = { shapes, palette, background: '#f8f6f0' };
  }

  // ---------------------------------------------------------------------------
  // Parse hex color
  // ---------------------------------------------------------------------------
  function hexToRGB(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  function rgbToHSL(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  function luminance(hex) {
    const { r, g, b } = hexToRGB(hex);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Nearest color from a reduced palette
  function nearestColor(hex, palette) {
    const { r, g, b } = hexToRGB(hex);
    let best = palette[0], bestDist = Infinity;
    for (const c of palette) {
      const cr = parseInt(c.slice(1, 3), 16);
      const cg = parseInt(c.slice(3, 5), 16);
      const cb = parseInt(c.slice(5, 7), 16);
      const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Shape drawing primitives
  // ---------------------------------------------------------------------------
  function drawCirclePath(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }

  function drawRectPath(ctx, cx, cy, w, h, rotation) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawTrianglePath(ctx, cx, cy, size, rotation) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * size;
      const y = Math.sin(angle) * size;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.restore();
  }

  function drawPolygonPath(ctx, cx, cy, size, sides, rotation) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * size;
      const y = Math.sin(angle) * size;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.restore();
  }

  function drawShapePath(ctx, shape, w, h) {
    const cx = shape.x * w;
    const cy = shape.y * h;
    const s = shape.size * Math.min(w, h);

    switch (shape.type) {
      case 'circle':
        drawCirclePath(ctx, cx, cy, s);
        break;
      case 'rect':
        drawRectPath(ctx, cx, cy, s * (shape.aspect || 1) * 1.6, s * 1.6, shape.rotation);
        break;
      case 'triangle':
        drawTrianglePath(ctx, cx, cy, s, shape.rotation);
        break;
      case 'polygon':
        drawPolygonPath(ctx, cx, cy, s, shape.sides || 6, shape.rotation);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Style: Wireframe
  // ---------------------------------------------------------------------------
  function renderWireframe(ctx, w, h) {
    ctx.fillStyle = '#0d0d12';
    ctx.fillRect(0, 0, w, h);

    for (const shape of composition.shapes) {
      drawShapePath(ctx, shape, w, h);
      ctx.strokeStyle = 'rgba(160, 170, 190, 0.6)';
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();

      // Draw vertex dots
      const cx = shape.x * w;
      const cy = shape.y * h;
      const s = shape.size * Math.min(w, h);
      ctx.fillStyle = 'rgba(100, 140, 255, 0.7)';

      if (shape.type === 'circle') {
        // Draw points along circumference
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * s, cy + Math.sin(a) * s, 1.5 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const sides = shape.type === 'triangle' ? 3 : (shape.type === 'polygon' ? (shape.sides || 6) : 4);
        for (let i = 0; i < sides; i++) {
          const angle = (i / sides) * Math.PI * 2 - Math.PI / 2 + (shape.rotation || 0);
          const vx = cx + Math.cos(angle) * s;
          const vy = cy + Math.sin(angle) * s;
          ctx.beginPath();
          ctx.arc(vx, vy, 2 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Grid overlay
    ctx.strokeStyle = 'rgba(100, 140, 255, 0.06)';
    ctx.lineWidth = 0.5 * dpr;
    const gridSize = 20 * dpr;
    for (let x = 0; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------------------
  // Style: Watercolor
  // ---------------------------------------------------------------------------
  function renderWatercolor(ctx, w, h) {
    // Warm paper
    ctx.fillStyle = '#f5f0e6';
    ctx.fillRect(0, 0, w, h);

    // Paper texture dots
    const dotRng = mulberry32(seed + 999);
    for (let i = 0; i < 800; i++) {
      const dx = dotRng() * w;
      const dy = dotRng() * h;
      ctx.beginPath();
      ctx.arc(dx, dy, dotRng() * 1.2 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 160, 140, ${dotRng() * 0.08})`;
      ctx.fill();
    }

    for (const shape of composition.shapes) {
      const { r, g, b } = hexToRGB(shape.color);

      // Draw shape multiple times with slight offsets and low opacity for watercolor bleed
      const passes = 4;
      for (let p = 0; p < passes; p++) {
        ctx.save();
        const offsetX = (mulberry32(seed + shape.zIndex * 100 + p * 7)() - 0.5) * 6 * dpr;
        const offsetY = (mulberry32(seed + shape.zIndex * 100 + p * 7 + 1)() - 0.5) * 6 * dpr;
        ctx.translate(offsetX, offsetY);

        drawShapePath(ctx, shape, w, h);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.12 + p * 0.04})`;
        ctx.fill();
        ctx.restore();
      }

      // Edge bleeding: draw a slightly larger, very faint version
      ctx.save();
      const bleedShape = { ...shape, size: shape.size * 1.08 };
      drawShapePath(ctx, bleedShape, w, h);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.06)`;
      ctx.fill();
      ctx.restore();

      // Soft edge line
      drawShapePath(ctx, shape, w, h);
      ctx.strokeStyle = `rgba(${r * 0.7}, ${g * 0.7}, ${b * 0.7}, 0.15)`;
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------------------
  // Style: Oil Paint
  // ---------------------------------------------------------------------------
  function renderOilPaint(ctx, w, h) {
    ctx.fillStyle = '#2a2520';
    ctx.fillRect(0, 0, w, h);

    // Canvas texture
    ctx.strokeStyle = 'rgba(255, 250, 240, 0.02)';
    ctx.lineWidth = 0.5 * dpr;
    for (let y = 0; y < h; y += 3 * dpr) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    for (const shape of composition.shapes) {
      const { r, g, b } = hexToRGB(shape.color);
      const cx = shape.x * w;
      const cy = shape.y * h;
      const s = shape.size * Math.min(w, h);

      // Fill with base color (slightly muted)
      drawShapePath(ctx, shape, w, h);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
      ctx.fill();

      // Impasto brush strokes: short thick directional lines
      const brushRng = mulberry32(seed + shape.zIndex * 200);
      const numStrokes = Math.floor(30 + s * 0.3);
      const brushAngle = shape.rotation || brushRng() * Math.PI;

      for (let i = 0; i < numStrokes; i++) {
        const bx = cx + (brushRng() - 0.5) * s * 2;
        const by = cy + (brushRng() - 0.5) * s * 2;

        // Only draw if point is roughly inside shape
        const dist = Math.sqrt((bx - cx) ** 2 + (by - cy) ** 2);
        if (dist > s * 1.1) continue;

        const strokeLen = (4 + brushRng() * 10) * dpr;
        const angle = brushAngle + (brushRng() - 0.5) * 0.8;
        const rVar = Math.floor(r + (brushRng() - 0.5) * 40);
        const gVar = Math.floor(g + (brushRng() - 0.5) * 40);
        const bVar = Math.floor(b + (brushRng() - 0.5) * 40);

        ctx.beginPath();
        ctx.moveTo(bx - Math.cos(angle) * strokeLen / 2, by - Math.sin(angle) * strokeLen / 2);
        ctx.lineTo(bx + Math.cos(angle) * strokeLen / 2, by + Math.sin(angle) * strokeLen / 2);
        ctx.strokeStyle = `rgba(${clamp(rVar, 0, 255)}, ${clamp(gVar, 0, 255)}, ${clamp(bVar, 0, 255)}, ${0.5 + brushRng() * 0.4})`;
        ctx.lineWidth = (2 + brushRng() * 3) * dpr;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Highlight strokes
      for (let i = 0; i < numStrokes * 0.2; i++) {
        const bx = cx + (brushRng() - 0.5) * s * 1.5;
        const by = cy + (brushRng() - 0.5) * s * 1.5;
        const dist = Math.sqrt((bx - cx) ** 2 + (by - cy) ** 2);
        if (dist > s * 0.8) continue;

        const strokeLen = (3 + brushRng() * 6) * dpr;
        const angle = brushAngle + (brushRng() - 0.5) * 0.5;

        ctx.beginPath();
        ctx.moveTo(bx - Math.cos(angle) * strokeLen / 2, by - Math.sin(angle) * strokeLen / 2);
        ctx.lineTo(bx + Math.cos(angle) * strokeLen / 2, by + Math.sin(angle) * strokeLen / 2);
        ctx.strokeStyle = `rgba(${Math.min(r + 60, 255)}, ${Math.min(g + 60, 255)}, ${Math.min(b + 60, 255)}, 0.3)`;
        ctx.lineWidth = (1.5 + brushRng() * 2) * dpr;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Style: Pixel Art
  // ---------------------------------------------------------------------------
  function renderPixelArt(ctx, w, h) {
    // 16-color palette
    const pixelPalette = [
      '#000000', '#1d2b53', '#7e2553', '#008751',
      '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
      '#ff004d', '#ffa300', '#ffec27', '#00e436',
      '#29adff', '#83769c', '#ff77a8', '#ffccaa',
    ];

    const gridSize = 8;
    const pixelW = Math.floor(w / (gridSize * dpr));
    const pixelH = Math.floor(h / (gridSize * dpr));

    // Create an offscreen canvas at pixel-art resolution
    const offCanvas = document.createElement('canvas');
    offCanvas.width = pixelW;
    offCanvas.height = pixelH;
    const offCtx = offCanvas.getContext('2d');

    // Clear with a bg color
    offCtx.fillStyle = '#1d2b53';
    offCtx.fillRect(0, 0, pixelW, pixelH);

    // Draw shapes at low res
    for (const shape of composition.shapes) {
      drawShapePath(offCtx, shape, pixelW, pixelH);
      // Map to nearest palette color
      const mappedColor = nearestColor(shape.color, pixelPalette);
      offCtx.fillStyle = mappedColor;
      offCtx.fill();
    }

    // Read pixels and render as crisp squares
    const imageData = offCtx.getImageData(0, 0, pixelW, pixelH);
    const data = imageData.data;
    const cellW = w / pixelW;
    const cellH = h / pixelH;

    ctx.fillStyle = '#1d2b53';
    ctx.fillRect(0, 0, w, h);

    for (let py = 0; py < pixelH; py++) {
      for (let px = 0; px < pixelW; px++) {
        const idx = (py * pixelW + px) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        // Snap to palette
        const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        const snapped = nearestColor(hex, pixelPalette);
        ctx.fillStyle = snapped;
        ctx.fillRect(Math.floor(px * cellW), Math.floor(py * cellH),
                     Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
      }
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 0.5;
    for (let px = 0; px < pixelW; px++) {
      ctx.beginPath();
      ctx.moveTo(px * cellW, 0);
      ctx.lineTo(px * cellW, h);
      ctx.stroke();
    }
    for (let py = 0; py < pixelH; py++) {
      ctx.beginPath();
      ctx.moveTo(0, py * cellH);
      ctx.lineTo(w, py * cellH);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------------------
  // Style: Comic / Pop Art
  // ---------------------------------------------------------------------------
  function renderComic(ctx, w, h) {
    ctx.fillStyle = '#fff8e0';
    ctx.fillRect(0, 0, w, h);

    for (const shape of composition.shapes) {
      const { r, g, b } = hexToRGB(shape.color);
      // Bright, saturated version
      const brightR = Math.min(Math.floor(r * 1.2), 255);
      const brightG = Math.min(Math.floor(g * 1.2), 255);
      const brightB = Math.min(Math.floor(b * 1.2), 255);

      // Flat fill
      drawShapePath(ctx, shape, w, h);
      ctx.fillStyle = `rgb(${brightR}, ${brightG}, ${brightB})`;
      ctx.fill();

      // Halftone shadow pattern
      const cx = shape.x * w;
      const cy = shape.y * h;
      const s = shape.size * Math.min(w, h);
      const lum = luminance(shape.color);

      ctx.save();
      drawShapePath(ctx, shape, w, h);
      ctx.clip();

      const halftoneSpacing = 5 * dpr;
      const startX = Math.floor((cx - s * 1.5) / halftoneSpacing) * halftoneSpacing;
      const startY = Math.floor((cy - s * 1.5) / halftoneSpacing) * halftoneSpacing;
      const endX = cx + s * 1.5;
      const endY = cy + s * 1.5;

      for (let hx = startX; hx < endX; hx += halftoneSpacing) {
        for (let hy = startY; hy < endY; hy += halftoneSpacing) {
          // Halftone dots: bigger in shadow areas (right side)
          const shadowFactor = clamp((hx - cx) / s + 0.3, 0, 1);
          const dotRadius = halftoneSpacing * 0.35 * shadowFactor;
          if (dotRadius < 0.5) continue;
          ctx.beginPath();
          ctx.arc(hx, hy, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 0, 0, 0.25)`;
          ctx.fill();
        }
      }
      ctx.restore();

      // Bold black outline
      drawShapePath(ctx, shape, w, h);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3 * dpr;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    // Action lines in corner
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.lineWidth = 1.5 * dpr;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 0.4 - Math.PI * 0.1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * w * 0.5, Math.sin(angle) * h * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Style: Woodcut
  // ---------------------------------------------------------------------------
  function renderWoodcut(ctx, w, h) {
    ctx.fillStyle = '#f5f0e0';
    ctx.fillRect(0, 0, w, h);

    // Wood grain background texture
    const grainRng = mulberry32(seed + 777);
    ctx.strokeStyle = 'rgba(180, 165, 140, 0.12)';
    ctx.lineWidth = 0.5 * dpr;
    for (let y = 0; y < h; y += 2 * dpr) {
      ctx.beginPath();
      ctx.moveTo(0, y + (grainRng() - 0.5) * 2);
      for (let x = 0; x < w; x += 10 * dpr) {
        ctx.lineTo(x, y + (grainRng() - 0.5) * 3);
      }
      ctx.stroke();
    }

    for (const shape of composition.shapes) {
      const lum = luminance(shape.color);
      const cx = shape.x * w;
      const cy = shape.y * h;
      const s = shape.size * Math.min(w, h);

      // Thick irregular outline
      drawShapePath(ctx, shape, w, h);
      ctx.strokeStyle = '#1a1408';
      ctx.lineWidth = (3 + mulberry32(seed + shape.zIndex * 300)() * 2) * dpr;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Fill with parallel line texture (engraving style)
      ctx.save();
      drawShapePath(ctx, shape, w, h);
      ctx.clip();

      const lineSpacing = (3 + (lum / 255) * 4) * dpr;
      const lineAngle = shape.rotation + Math.PI * 0.25;
      const cosA = Math.cos(lineAngle);
      const sinA = Math.sin(lineAngle);

      // For dark shapes: denser lines. For light: sparser
      const density = 1 - (lum / 255) * 0.6;
      const adjustedSpacing = lineSpacing / density;

      const maxDim = Math.max(w, h) * 1.5;
      for (let d = -maxDim; d < maxDim; d += adjustedSpacing) {
        const x1 = cx + cosA * maxDim + sinA * d;
        const y1 = cy + sinA * maxDim - cosA * d;
        const x2 = cx - cosA * maxDim + sinA * d;
        const y2 = cy - sinA * maxDim - cosA * d;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        // Add slight wobble for hand-carved feel
        const midX = (x1 + x2) / 2 + (mulberry32(seed + d * 13)() - 0.5) * 2 * dpr;
        const midY = (y1 + y2) / 2 + (mulberry32(seed + d * 17)() - 0.5) * 2 * dpr;
        ctx.quadraticCurveTo(midX, midY, x2, y2);
        ctx.strokeStyle = `rgba(26, 20, 8, ${0.5 + density * 0.4})`;
        ctx.lineWidth = (0.8 + density * 0.8) * dpr;
        ctx.stroke();
      }

      ctx.restore();

      // High contrast: fill very light shapes with white
      if (lum > 180) {
        drawShapePath(ctx, shape, w, h);
        ctx.fillStyle = 'rgba(245, 240, 224, 0.3)';
        ctx.fill();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------
  function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

  // ---------------------------------------------------------------------------
  // Render dispatcher
  // ---------------------------------------------------------------------------
  function renderStyle(ctx, w, h, styleId) {
    ctx.clearRect(0, 0, w, h);
    switch (styleId) {
      case 'wireframe': renderWireframe(ctx, w, h); break;
      case 'watercolor': renderWatercolor(ctx, w, h); break;
      case 'oilpaint': renderOilPaint(ctx, w, h); break;
      case 'pixelart': renderPixelArt(ctx, w, h); break;
      case 'comic': renderComic(ctx, w, h); break;
      case 'woodcut': renderWoodcut(ctx, w, h); break;
    }
  }

  function renderAllStyles() {
    if (!composition) return;
    for (const cell of canvases) {
      renderStyle(cell.ctx, cell.canvas.width, cell.canvas.height, cell.style);
    }
  }

  // ---------------------------------------------------------------------------
  // Animation loop (minimal — mostly static, but keeps RAF for consistency)
  // ---------------------------------------------------------------------------
  function loop() {
    if (!running) return;
    animTime += 16;
    // Static rendering — only re-render on demand
    animFrameId = requestAnimationFrame(loop);
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
    overline.textContent = 'Style Transfer & Imitation';
    overline.style.cssText = `
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: rgba(100,140,255,0.8);
      margin-bottom: 12px;
    `;

    const title = document.createElement('h2');
    title.textContent = 'The same content, rendered through different artistic processes';
    title.style.cssText = `
      font-size: 28px;
      font-weight: 600;
      color: #e8e6e3;
      margin: 0 0 10px;
      line-height: 1.3;
    `;

    const desc = document.createElement('p');
    desc.innerHTML = 'From Prisma to Pixar\u2019s <em>Stylizing Animation by Example</em> \u2014 the same procedural composition rendered through six distinct visual styles. Each demonstrates how artistic process transforms identical content.';
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

    // Grid wrapper
    const gridWrap = document.createElement('div');
    gridWrap.style.cssText = `
      max-width: 900px;
      margin: 0 auto;
      padding: 0 32px;
      box-sizing: border-box;
    `;

    // 3x2 grid
    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    `;

    canvases = [];
    for (const style of STYLES) {
      const cell = document.createElement('div');
      cell.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
      `;

      const canvasWrap = document.createElement('div');
      canvasWrap.style.cssText = `
        position: relative;
        border-radius: 6px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.08);
        aspect-ratio: 4/3;
      `;

      const cvs = document.createElement('canvas');
      cvs.style.cssText = `
        display: block;
        width: 100%;
        height: 100%;
      `;

      canvasWrap.appendChild(cvs);

      const label = document.createElement('div');
      label.textContent = style.label;
      label.style.cssText = `
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: rgba(232,230,227,0.4);
        text-align: center;
      `;

      cell.appendChild(canvasWrap);
      cell.appendChild(label);
      grid.appendChild(cell);

      canvases.push({
        canvas: cvs,
        ctx: null,
        style: style.id,
        wrapper: canvasWrap,
      });
    }

    gridWrap.appendChild(grid);
    container.appendChild(gridWrap);

    // New Composition button
    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = `
      max-width: 900px;
      margin: 24px auto 0;
      padding: 0 32px;
      display: flex;
      justify-content: center;
      box-sizing: border-box;
    `;

    const newBtn = document.createElement('button');
    newBtn.textContent = 'New Composition';
    newBtn.style.cssText = `
      background: rgba(100,140,255,0.1);
      border: 1px solid rgba(100,140,255,0.25);
      border-radius: 6px;
      color: rgba(100,140,255,0.9);
      padding: 10px 28px;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s;
      letter-spacing: 0.3px;
    `;
    newBtn.addEventListener('mouseenter', () => {
      newBtn.style.background = 'rgba(100,140,255,0.2)';
      newBtn.style.borderColor = 'rgba(100,140,255,0.45)';
    });
    newBtn.addEventListener('mouseleave', () => {
      newBtn.style.background = 'rgba(100,140,255,0.1)';
      newBtn.style.borderColor = 'rgba(100,140,255,0.25)';
    });
    newBtn.addEventListener('click', () => {
      seed = Date.now();
      generateComposition();
      sizeCanvases();
      renderAllStyles();
    });

    btnWrap.appendChild(newBtn);
    gridWrap.appendChild(btnWrap);
  }

  // ---------------------------------------------------------------------------
  // Sizing
  // ---------------------------------------------------------------------------
  function sizeCanvases() {
    dpr = window.devicePixelRatio || 1;
    for (const cell of canvases) {
      const rect = cell.wrapper.getBoundingClientRect();
      cell.canvas.width = rect.width * dpr;
      cell.canvas.height = rect.height * dpr;
      cell.canvas.style.width = rect.width + 'px';
      cell.canvas.style.height = rect.height + 'px';
      cell.ctx = cell.canvas.getContext('2d');
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    init(containerEl) {
      buildDOM(containerEl);
      generateComposition();
      // Use RAF to ensure layout has computed before sizing
      requestAnimationFrame(() => {
        sizeCanvases();
        renderAllStyles();
      });
    },

    start() {
      if (running) return;
      running = true;
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
      if (!container) return;
      sizeCanvases();
      renderAllStyles();
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = StyleTransferSection;
