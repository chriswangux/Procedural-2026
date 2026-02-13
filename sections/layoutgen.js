// ============================================================================
// GENERATIVE LAYOUT — Procedural Page Composition
// Adobe-style generative layout system with 12-column grid, multiple block
// types, and preset layout modes. Bin-packing algorithm with animated
// transitions between generated layouts.
// ============================================================================

const LayoutGenSection = (() => {

  let container, canvas, ctx, running = false, animFrameId = null;
  let W = 0, H = 0, dpr = 1;
  let time = 0;

  // --- Seeded PRNG --------------------------------------------------------

  function seededRandom(seed) {
    let s = seed | 0;
    return function () {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 4294967296;
    };
  }

  // --- Constants ----------------------------------------------------------

  const COLS = 12;
  const GUTTER = 10;         // px between blocks (scaled at draw time)
  const BG = '#06080f';
  const GRID_COLOR = 'rgba(100,140,255,0.06)';
  const ACCENT = 'rgba(100,140,255,0.8)';

  const BLOCK_TYPES = {
    heading:     { label: 'Heading',    color: 'rgba(100,140,255,0.55)', border: 'rgba(100,140,255,0.8)' },
    'body-text': { label: 'Body Text',  color: 'rgba(180,190,220,0.18)', border: 'rgba(180,190,220,0.45)' },
    image:       { label: 'Image',      color: 'rgba(70,200,160,0.18)',  border: 'rgba(70,200,160,0.55)' },
    sidebar:     { label: 'Sidebar',    color: 'rgba(255,180,80,0.18)',  border: 'rgba(255,180,80,0.50)' },
    'pull-quote':{ label: 'Pull Quote', color: 'rgba(200,120,255,0.18)', border: 'rgba(200,120,255,0.55)' },
    nav:         { label: 'Nav',        color: 'rgba(255,100,100,0.18)', border: 'rgba(255,100,100,0.50)' },
  };

  // --- Layout state -------------------------------------------------------

  let currentBlocks = [];     // {type, col, row, spanC, spanR, x, y, w, h}
  let targetBlocks = [];
  let animProgress = 1;       // 0→1 during transition
  const ANIM_DURATION = 400;  // ms
  let animStart = 0;
  let currentMode = 0;
  let seed = 1;
  let gridArea = { x: 0, y: 0, w: 0, h: 0, colW: 0, rowH: 0, rows: 0 };

  const MODES = ['Magazine', 'Blog', 'Dashboard', 'Portfolio'];

  // --- Easing -------------------------------------------------------------

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // --- Grid occupancy helper ----------------------------------------------

  function createOccupancy(cols, rows) {
    const grid = [];
    for (let r = 0; r < rows; r++) {
      grid[r] = new Uint8Array(cols);
    }
    return grid;
  }

  function canPlace(occ, col, row, spanC, spanR, cols, rows) {
    if (col + spanC > cols || row + spanR > rows) return false;
    for (let r = row; r < row + spanR; r++) {
      for (let c = col; c < col + spanC; c++) {
        if (occ[r][c]) return false;
      }
    }
    return true;
  }

  function markOccupied(occ, col, row, spanC, spanR) {
    for (let r = row; r < row + spanR; r++) {
      for (let c = col; c < col + spanC; c++) {
        occ[r][c] = 1;
      }
    }
  }

  // --- Layout generation per mode -----------------------------------------

  function generateMagazine(rng) {
    const blocks = [];
    // Hero image top
    blocks.push({ type: 'nav', col: 0, row: 0, spanC: 12, spanR: 1 });
    blocks.push({ type: 'image', col: 0, row: 1, spanC: 8, spanR: 4 });
    blocks.push({ type: 'heading', col: 8, row: 1, spanC: 4, spanR: 2 });
    blocks.push({ type: 'body-text', col: 8, row: 3, spanC: 4, spanR: 2 });
    // Pull quote
    blocks.push({ type: 'pull-quote', col: 0, row: 5, spanC: 4, spanR: 2 });
    // Two columns
    blocks.push({ type: 'body-text', col: 4, row: 5, spanC: 4, spanR: 3 });
    blocks.push({ type: 'body-text', col: 8, row: 5, spanC: 4, spanR: 3 });
    blocks.push({ type: 'image', col: 0, row: 7, spanC: 4, spanR: 2 });
    // Extra row variation
    blocks.push({ type: 'heading', col: 0, row: 9, spanC: 6, spanR: 1 });
    blocks.push({ type: 'body-text', col: 0, row: 10, spanC: 6, spanR: 2 });
    blocks.push({ type: 'image', col: 6, row: 8, spanC: 6, spanR: 4 });
    // Randomize a few extra blocks
    const extras = [
      { type: 'pull-quote', spanC: 3, spanR: 2 },
      { type: 'body-text', spanC: 4, spanR: 2 },
      { type: 'image', spanC: 3, spanR: 3 },
    ];
    const ROWS = 16;
    const occ = createOccupancy(COLS, ROWS);
    blocks.forEach(b => markOccupied(occ, b.col, b.row, b.spanC, b.spanR));
    for (const ext of extras) {
      if (rng() > 0.5) continue;
      for (let r = 0; r < ROWS - ext.spanR; r++) {
        let placed = false;
        for (let c = 0; c <= COLS - ext.spanC; c++) {
          if (canPlace(occ, c, r, ext.spanC, ext.spanR, COLS, ROWS)) {
            blocks.push({ type: ext.type, col: c, row: r, spanC: ext.spanC, spanR: ext.spanR });
            markOccupied(occ, c, r, ext.spanC, ext.spanR);
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
    }
    return blocks;
  }

  function generateBlog(rng) {
    const blocks = [];
    const ROWS = 16;
    blocks.push({ type: 'nav', col: 0, row: 0, spanC: 12, spanR: 1 });
    // Main column (8 cols)
    let mainRow = 1;
    blocks.push({ type: 'heading', col: 0, row: mainRow, spanC: 8, spanR: 1 }); mainRow += 1;
    blocks.push({ type: 'image', col: 0, row: mainRow, spanC: 8, spanR: 3 }); mainRow += 3;
    blocks.push({ type: 'body-text', col: 0, row: mainRow, spanC: 8, spanR: 3 }); mainRow += 3;
    blocks.push({ type: 'pull-quote', col: 1, row: mainRow, spanC: 6, spanR: 2 }); mainRow += 2;
    blocks.push({ type: 'body-text', col: 0, row: mainRow, spanC: 8, spanR: 3 }); mainRow += 3;
    if (mainRow < ROWS - 1) {
      blocks.push({ type: 'image', col: 0, row: mainRow, spanC: 8, spanR: Math.min(3, ROWS - mainRow) });
    }
    // Sidebar (4 cols)
    let sideRow = 1;
    blocks.push({ type: 'sidebar', col: 8, row: sideRow, spanC: 4, spanR: 4 }); sideRow += 4;
    blocks.push({ type: 'sidebar', col: 8, row: sideRow, spanC: 4, spanR: 3 }); sideRow += 3;
    blocks.push({ type: 'sidebar', col: 8, row: sideRow, spanC: 4, spanR: 3 }); sideRow += 3;
    if (sideRow < ROWS - 1) {
      blocks.push({ type: 'sidebar', col: 8, row: sideRow, spanC: 4, spanR: Math.min(3, ROWS - sideRow) });
    }
    return blocks;
  }

  function generateDashboard(rng) {
    const blocks = [];
    blocks.push({ type: 'nav', col: 0, row: 0, spanC: 12, spanR: 1 });
    blocks.push({ type: 'sidebar', col: 0, row: 1, spanC: 2, spanR: 11 });
    // Cards in 4x3-ish grid in the remaining 10 cols
    const cardTypes = ['image', 'body-text', 'heading', 'body-text', 'image', 'body-text',
                       'body-text', 'image', 'body-text', 'heading', 'image', 'body-text'];
    let idx = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        const type = cardTypes[idx % cardTypes.length];
        const colStart = 2 + c * 3 + (c > 0 ? 1 : 0);
        const spanC = c < 2 ? 3 : (12 - colStart);
        blocks.push({
          type: type,
          col: colStart,
          row: 1 + r * 3,
          spanC: Math.min(spanC, 3),
          spanR: 3,
        });
        idx++;
      }
    }
    return blocks;
  }

  function generatePortfolio(rng) {
    const blocks = [];
    const ROWS = 16;
    blocks.push({ type: 'nav', col: 0, row: 0, spanC: 12, spanR: 1 });
    blocks.push({ type: 'heading', col: 0, row: 1, spanC: 12, spanR: 1 });
    // Masonry: place image blocks of varying sizes
    const occ = createOccupancy(COLS, ROWS);
    markOccupied(occ, 0, 0, 12, 1);
    markOccupied(occ, 0, 1, 12, 1);
    const sizes = [
      { spanC: 6, spanR: 4 }, { spanC: 4, spanR: 3 }, { spanC: 3, spanR: 3 },
      { spanC: 6, spanR: 3 }, { spanC: 4, spanR: 4 }, { spanC: 3, spanR: 2 },
      { spanC: 5, spanR: 3 }, { spanC: 4, spanR: 2 }, { spanC: 3, spanR: 3 },
      { spanC: 6, spanR: 3 }, { spanC: 4, spanR: 3 }, { spanC: 3, spanR: 2 },
    ];
    for (let i = 0; i < sizes.length; i++) {
      const s = sizes[i];
      let placed = false;
      for (let r = 2; r < ROWS - s.spanR + 1 && !placed; r++) {
        for (let c = 0; c <= COLS - s.spanC && !placed; c++) {
          if (canPlace(occ, c, r, s.spanC, s.spanR, COLS, ROWS)) {
            const type = rng() < 0.7 ? 'image' : (rng() < 0.5 ? 'body-text' : 'heading');
            blocks.push({ type, col: c, row: r, spanC: s.spanC, spanR: s.spanR });
            markOccupied(occ, c, r, s.spanC, s.spanR);
            placed = true;
          }
        }
      }
    }
    return blocks;
  }

  const GENERATORS = [generateMagazine, generateBlog, generateDashboard, generatePortfolio];

  // --- Convert grid positions to pixel positions ---------------------------

  function computePixelPositions(blocks) {
    const { x: gx, y: gy, colW, rowH } = gridArea;
    return blocks.map(b => ({
      ...b,
      x: gx + b.col * colW + GUTTER / 2,
      y: gy + b.row * rowH + GUTTER / 2,
      w: b.spanC * colW - GUTTER,
      h: b.spanR * rowH - GUTTER,
    }));
  }

  // --- Generate layout and trigger animation ------------------------------

  function generateLayout() {
    const rng = seededRandom(seed);
    const blocks = GENERATORS[currentMode](rng);
    const withPixels = computePixelPositions(blocks);

    // Match blocks between current and target for smooth morphing
    if (currentBlocks.length === 0) {
      currentBlocks = withPixels;
      targetBlocks = withPixels;
      animProgress = 1;
    } else {
      // Snapshot current rendered positions as starting point
      currentBlocks = getRenderState();
      targetBlocks = withPixels;
      animProgress = 0;
      animStart = performance.now();
    }
  }

  // --- Get interpolated render state --------------------------------------

  function getRenderState() {
    if (animProgress >= 1) return targetBlocks.slice();
    const t = easeInOutCubic(animProgress);
    const result = [];
    const maxLen = Math.max(currentBlocks.length, targetBlocks.length);
    for (let i = 0; i < maxLen; i++) {
      const src = currentBlocks[i] || targetBlocks[i];
      const dst = targetBlocks[i] || currentBlocks[i];
      result.push({
        type: dst.type,
        col: dst.col,
        row: dst.row,
        spanC: dst.spanC,
        spanR: dst.spanR,
        x: src.x + (dst.x - src.x) * t,
        y: src.y + (dst.y - src.y) * t,
        w: src.w + (dst.w - src.w) * t,
        h: src.h + (dst.h - src.h) * t,
      });
    }
    return result;
  }

  // --- Block rendering functions ------------------------------------------

  function drawBlock(b, alpha) {
    const info = BLOCK_TYPES[b.type];
    if (!info) return;
    const a = alpha;

    // Background fill
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = info.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);

    // Left accent border
    ctx.fillStyle = info.border;
    ctx.fillRect(b.x, b.y, 3, b.h);

    // Type-specific content
    ctx.globalAlpha = a * 0.6;
    switch (b.type) {
      case 'heading':
        drawHeadingContent(b);
        break;
      case 'body-text':
        drawBodyTextContent(b);
        break;
      case 'image':
        drawImageContent(b);
        break;
      case 'sidebar':
        drawSidebarContent(b);
        break;
      case 'pull-quote':
        drawPullQuoteContent(b);
        break;
      case 'nav':
        drawNavContent(b);
        break;
    }

    // Border outline
    ctx.globalAlpha = a * 0.25;
    ctx.strokeStyle = info.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);

    ctx.restore();
  }

  function drawHeadingContent(b) {
    const pad = Math.min(b.w * 0.08, 12);
    const lineH = Math.max(4, b.h * 0.15);
    ctx.fillStyle = 'rgba(200,210,240,0.4)';
    // Thick heading line
    ctx.fillRect(b.x + pad, b.y + b.h * 0.3, b.w * 0.65, lineH);
    // Thinner sub-line
    ctx.fillStyle = 'rgba(200,210,240,0.2)';
    ctx.fillRect(b.x + pad, b.y + b.h * 0.3 + lineH + 4, b.w * 0.4, lineH * 0.6);
  }

  function drawBodyTextContent(b) {
    const pad = Math.min(b.w * 0.08, 10);
    const lineH = 3;
    const gap = 6;
    const startY = b.y + pad;
    const endY = b.y + b.h - pad;
    ctx.fillStyle = 'rgba(160,170,200,0.22)';
    for (let y = startY; y < endY; y += lineH + gap) {
      const wFrac = 0.6 + 0.35 * Math.sin(y * 0.13);
      ctx.fillRect(b.x + pad, y, (b.w - pad * 2) * wFrac, lineH);
    }
  }

  function drawImageContent(b) {
    // Diagonal cross
    ctx.strokeStyle = 'rgba(70,200,160,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(b.x + 4, b.y + 4);
    ctx.lineTo(b.x + b.w - 4, b.y + b.h - 4);
    ctx.moveTo(b.x + b.w - 4, b.y + 4);
    ctx.lineTo(b.x + 4, b.y + b.h - 4);
    ctx.stroke();
    // Mountain icon
    const cx = b.x + b.w * 0.5;
    const cy = b.y + b.h * 0.55;
    const sz = Math.min(b.w, b.h) * 0.18;
    ctx.fillStyle = 'rgba(70,200,160,0.35)';
    ctx.beginPath();
    ctx.moveTo(cx - sz, cy + sz * 0.6);
    ctx.lineTo(cx - sz * 0.3, cy - sz * 0.5);
    ctx.lineTo(cx + sz * 0.1, cy + sz * 0.1);
    ctx.lineTo(cx + sz * 0.4, cy - sz * 0.3);
    ctx.lineTo(cx + sz, cy + sz * 0.6);
    ctx.closePath();
    ctx.fill();
    // Small circle (sun)
    ctx.beginPath();
    ctx.arc(cx + sz * 0.5, cy - sz * 0.4, sz * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSidebarContent(b) {
    const pad = Math.min(b.w * 0.12, 8);
    ctx.fillStyle = 'rgba(255,180,80,0.2)';
    let y = b.y + pad;
    for (let i = 0; i < 6 && y < b.y + b.h - pad; i++) {
      const w = (0.5 + 0.4 * Math.sin(i * 2.1)) * (b.w - pad * 2);
      ctx.fillRect(b.x + pad, y, w, 3);
      y += 10;
    }
    // Small box
    if (b.h > 60) {
      ctx.fillStyle = 'rgba(255,180,80,0.12)';
      ctx.fillRect(b.x + pad, y + 4, b.w - pad * 2, Math.min(30, b.h * 0.2));
    }
  }

  function drawPullQuoteContent(b) {
    const sz = Math.min(b.w, b.h) * 0.35;
    ctx.font = `bold ${sz}px Georgia, serif`;
    ctx.fillStyle = 'rgba(200,120,255,0.25)';
    ctx.textBaseline = 'top';
    ctx.fillText('\u201C', b.x + b.w * 0.08, b.y + b.h * 0.1);
    // Placeholder lines
    ctx.fillStyle = 'rgba(200,120,255,0.15)';
    const pad = b.w * 0.15;
    const lineY = b.y + b.h * 0.45;
    ctx.fillRect(b.x + pad, lineY, b.w - pad * 2, 3);
    ctx.fillRect(b.x + pad, lineY + 9, (b.w - pad * 2) * 0.7, 3);
  }

  function drawNavContent(b) {
    const pad = 12;
    const dotR = 3;
    const gap = 18;
    const cy = b.y + b.h * 0.5;
    ctx.fillStyle = 'rgba(255,100,100,0.35)';
    // Logo placeholder
    ctx.fillRect(b.x + pad, cy - 4, 24, 8);
    // Dot indicators
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(b.x + pad + 50 + i * gap, cy, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Draw grid lines ----------------------------------------------------

  function drawGrid() {
    const { x: gx, y: gy, colW, w: gw, h: gh, rows } = gridArea;
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    // Vertical column lines
    for (let c = 0; c <= COLS; c++) {
      const x = Math.round(gx + c * colW) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x, gy + gh);
      ctx.stroke();
    }
    // Horizontal row lines
    const rowH = gridArea.rowH;
    for (let r = 0; r <= rows; r++) {
      const y = Math.round(gy + r * rowH) + 0.5;
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx + gw, y);
      ctx.stroke();
    }
  }

  // --- Header & controls rendering ----------------------------------------

  let headerH = 0;
  let controlsX = 0;
  let controlsW = 0;
  let modeButtons = [];   // {x, y, w, h, mode}
  let generateBtn = null; // {x, y, w, h}
  let hoveredBtn = -1;
  let hoveredGen = false;

  function drawHeader() {
    const pad = 32;
    ctx.save();

    // Overline
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = ACCENT;
    ctx.textBaseline = 'top';
    ctx.letterSpacing = '2px';
    ctx.fillText('SECTION D', pad, pad);

    // Title
    ctx.font = 'bold 28px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#e8ecf8';
    ctx.fillText('Generative Layout', pad, pad + 22);

    // Description
    ctx.font = '14px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(180,190,220,0.6)';
    ctx.fillText('Procedural page composition \u2014 abstract content intents as variables', pad, pad + 56);

    ctx.restore();
    headerH = pad + 80;
  }

  function drawControls() {
    const pad = 16;
    const btnH = 32;
    const btnGap = 8;
    const cx = controlsX;
    const cy = headerH + 10;
    const cw = controlsW;

    ctx.save();

    // Panel background
    ctx.fillStyle = 'rgba(12,16,30,0.7)';
    ctx.strokeStyle = 'rgba(100,140,255,0.12)';
    ctx.lineWidth = 1;
    const panelH = MODES.length * (btnH + btnGap) + btnH + btnGap * 3 + pad * 2 + 30;
    roundRect(cx, cy, cw, panelH, 8);
    ctx.fill();
    ctx.stroke();

    // "Layout Mode" label
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(180,190,220,0.5)';
    ctx.textBaseline = 'top';
    ctx.fillText('LAYOUT MODE', cx + pad, cy + pad);

    modeButtons = [];
    let by = cy + pad + 20;
    for (let i = 0; i < MODES.length; i++) {
      const bx = cx + pad;
      const bw = cw - pad * 2;
      const isActive = i === currentMode;
      const isHovered = i === hoveredBtn;

      ctx.fillStyle = isActive ? 'rgba(100,140,255,0.2)' : (isHovered ? 'rgba(100,140,255,0.08)' : 'rgba(255,255,255,0.03)');
      ctx.strokeStyle = isActive ? ACCENT : 'rgba(100,140,255,0.1)';
      ctx.lineWidth = 1;
      roundRect(bx, by, bw, btnH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.font = '13px Inter, system-ui, sans-serif';
      ctx.fillStyle = isActive ? '#e8ecf8' : 'rgba(180,190,220,0.6)';
      ctx.textBaseline = 'middle';
      ctx.fillText(MODES[i], bx + 12, by + btnH / 2);

      modeButtons.push({ x: bx, y: by, w: bw, h: btnH, mode: i });
      by += btnH + btnGap;
    }

    // Generate button
    by += btnGap;
    const gbx = cx + pad;
    const gbw = cw - pad * 2;
    const isHovGen = hoveredGen;
    ctx.fillStyle = isHovGen ? 'rgba(100,140,255,0.35)' : 'rgba(100,140,255,0.2)';
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    roundRect(gbx, by, gbw, btnH + 4, 6);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 13px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#e8ecf8';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('Generate', gbx + gbw / 2, by + (btnH + 4) / 2);
    ctx.textAlign = 'left';

    generateBtn = { x: gbx, y: by, w: gbw, h: btnH + 4 };

    // Seed display
    by += btnH + 16;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(180,190,220,0.35)';
    ctx.textBaseline = 'top';
    ctx.fillText(`seed: ${seed}`, cx + pad, by);

    // Legend
    by += 24;
    ctx.fillText('BLOCK TYPES', cx + pad, by);
    by += 16;
    const types = Object.keys(BLOCK_TYPES);
    for (let i = 0; i < types.length; i++) {
      const info = BLOCK_TYPES[types[i]];
      ctx.fillStyle = info.border;
      ctx.fillRect(cx + pad, by, 8, 8);
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(180,190,220,0.5)';
      ctx.fillText(info.label, cx + pad + 14, by);
      by += 16;
    }

    ctx.restore();
  }

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

  // --- Layout computation -------------------------------------------------

  function computeGridArea() {
    const panelW = Math.min(180, W * 0.2);
    controlsW = panelW;
    controlsX = W - panelW - 24;
    const gx = 32;
    const gy = headerH + 10;
    const gw = controlsX - gx - 20;
    const gh = H - gy - 24;
    const colW = gw / COLS;
    const rows = 16;
    const rowH = gh / rows;
    gridArea = { x: gx, y: gy, w: gw, h: gh, colW, rowH, rows };
  }

  // --- Main draw ----------------------------------------------------------

  function draw(ts) {
    if (!running) return;
    animFrameId = requestAnimationFrame(draw);
    time = ts || 0;

    // Update animation
    if (animProgress < 1) {
      animProgress = Math.min(1, (time - animStart) / ANIM_DURATION);
    }

    // Clear
    ctx.clearRect(0, 0, W * dpr, H * dpr);
    ctx.save();
    ctx.scale(dpr, dpr);

    // BG
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    drawHeader();
    computeGridArea();
    drawGrid();

    // Draw blocks
    const state = getRenderState();
    const blockAlpha = animProgress < 1 ? 0.5 + 0.5 * easeInOutCubic(animProgress) : 1;
    for (const b of state) {
      drawBlock(b, blockAlpha);
    }

    drawControls();

    ctx.restore();
  }

  // --- Interaction --------------------------------------------------------

  let mouseX = 0, mouseY = 0;

  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    return { x, y };
  }

  function hitTest(x, y) {
    hoveredBtn = -1;
    hoveredGen = false;
    for (const mb of modeButtons) {
      if (x >= mb.x && x <= mb.x + mb.w && y >= mb.y && y <= mb.y + mb.h) {
        hoveredBtn = mb.mode;
        return;
      }
    }
    if (generateBtn && x >= generateBtn.x && x <= generateBtn.x + generateBtn.w &&
        y >= generateBtn.y && y <= generateBtn.y + generateBtn.h) {
      hoveredGen = true;
    }
  }

  function onClick(e) {
    const pos = getCanvasPos(e);
    hitTest(pos.x, pos.y);
    if (hoveredBtn >= 0) {
      currentMode = hoveredBtn;
      seed = Math.floor(Math.random() * 99999) + 1;
      generateLayout();
    } else if (hoveredGen) {
      seed = Math.floor(Math.random() * 99999) + 1;
      generateLayout();
    }
  }

  function onMouseMove(e) {
    const pos = getCanvasPos(e);
    mouseX = pos.x;
    mouseY = pos.y;
    hitTest(pos.x, pos.y);
    canvas.style.cursor = (hoveredBtn >= 0 || hoveredGen) ? 'pointer' : 'default';
  }

  function onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
      const t = e.touches[0];
      const pos = getCanvasPos(t);
      hitTest(pos.x, pos.y);
      if (hoveredBtn >= 0) {
        currentMode = hoveredBtn;
        seed = Math.floor(Math.random() * 99999) + 1;
        generateLayout();
      } else if (hoveredGen) {
        seed = Math.floor(Math.random() * 99999) + 1;
        generateLayout();
      }
    }
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

      canvas.addEventListener('click', onClick);
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('touchstart', onTouchStart, { passive: false });

      this.resize();
      generateLayout();
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
      computeGridArea();
      // Recompute pixel positions for blocks
      if (targetBlocks.length > 0) {
        targetBlocks = computePixelPositions(targetBlocks);
        if (animProgress >= 1) {
          currentBlocks = targetBlocks.slice();
        }
      }
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LayoutGenSection;
