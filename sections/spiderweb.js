// ============================================================
// SpiderWebSection — Interactive Spider Web Simulation
// Inspired by Pixar's procedural cobweb system
// Pure vanilla JS + Canvas API, no dependencies
// ============================================================

const SpiderWebSection = (() => {
  // --- State ---
  let container = null;
  let canvas = null;
  let ctx = null;
  let animFrameId = null;
  let running = false;
  let time = 0;

  // Anchor points placed by user
  let anchors = []; // { x, y, id }
  let anchorIdCounter = 0;
  let hoveredAnchor = null;

  // Web structures
  let webs = []; // each web: { anchors, radials, spirals, built, ... }
  let spiders = []; // animated spider dots

  // Controls
  let settings = {
    density: 0.5,    // 0..1
    tension: 0.5,    // 0..1
    spiderSpeed: 0.5 // 0..1
  };

  // Wind simulation
  let wind = { x: 0, y: 0, phase: 0 };

  // Layout
  let W = 0, H = 0;
  let dpr = 1;

  // Interaction
  let mouse = { x: 0, y: 0, down: false };

  // --- Constants ---
  const ANCHOR_RADIUS = 7;
  const ANCHOR_HIT_RADIUS = 18;
  const SPIDER_RADIUS = 3.5;
  const MIN_ANCHORS_FOR_WEB = 3;
  const THREAD_ALPHA_BASE = 0.35;
  const GLOW_ALPHA = 0.08;
  const GLOW_RADIUS = 4;
  const GRAVITY = 0.0004;

  // ============================================================
  // Utility
  // ============================================================

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function randomRange(lo, hi) {
    return lo + Math.random() * (hi - lo);
  }

  // Catenary / sag approximation for a thread between two points
  function sagPoint(ax, ay, bx, by, t, sagAmount) {
    const x = lerp(ax, bx, t);
    const y = lerp(ay, by, t);
    // Parabolic sag: maximum at t=0.5
    const sag = 4 * sagAmount * t * (1 - t);
    return { x, y: y + sag };
  }

  // Compute sag amount based on distance and tension
  function computeSag(length) {
    const tensionFactor = 1 - settings.tension * 0.9; // tension 1 => very tight
    return length * GRAVITY * tensionFactor * 800;
  }

  // ============================================================
  // Web generation
  // ============================================================

  function generateWebFromAnchors(anchorList) {
    if (anchorList.length < MIN_ANCHORS_FOR_WEB) return null;

    // Find centroid
    let cx = 0, cy = 0;
    for (const a of anchorList) { cx += a.x; cy += a.y; }
    cx /= anchorList.length;
    cy /= anchorList.length;

    // Sort anchors by angle from centroid
    const sorted = anchorList.slice().sort((a, b) => {
      return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
    });

    // Radial threads: from centroid to each anchor, plus subdivisions
    const radials = [];
    const densityCount = Math.floor(3 + settings.density * 12);

    for (let i = 0; i < sorted.length; i++) {
      const anchor = sorted[i];
      // Main radial
      radials.push({ from: { x: cx, y: cy }, to: { x: anchor.x, y: anchor.y }, progress: 0 });

      // Additional radials between this anchor and the next (density-based)
      const next = sorted[(i + 1) % sorted.length];
      const subCount = Math.floor(densityCount / sorted.length);
      for (let s = 1; s <= subCount; s++) {
        const t = s / (subCount + 1);
        const subX = lerp(anchor.x, next.x, t);
        const subY = lerp(anchor.y, next.y, t);
        radials.push({ from: { x: cx, y: cy }, to: { x: subX, y: subY }, progress: 0 });
      }
    }

    // Frame threads: connect anchors in order
    const frameThreads = [];
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const b = sorted[(i + 1) % sorted.length];
      frameThreads.push({ from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y }, progress: 0 });
    }

    // Spiral threads: concentric rings from center outward
    const spirals = [];
    const maxRadius = Math.max(...sorted.map(a => dist(a, { x: cx, y: cy })));
    const spiralCount = Math.floor(4 + settings.density * 18);

    for (let ring = 1; ring <= spiralCount; ring++) {
      const rFraction = ring / (spiralCount + 1);
      const r = maxRadius * rFraction;
      const points = [];
      for (let i = 0; i < radials.length; i++) {
        const radial = radials[i];
        const dx = radial.to.x - radial.from.x;
        const dy = radial.to.y - radial.from.y;
        const radialLen = Math.sqrt(dx * dx + dy * dy);
        if (radialLen < 1) continue;
        const t = Math.min(r / radialLen, 1);
        points.push({
          x: radial.from.x + dx * t,
          y: radial.from.y + dy * t
        });
      }
      // Connect spiral points in order
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        spirals.push({ from: a, to: b, progress: 0, ring });
      }
    }

    return {
      cx, cy,
      anchors: sorted,
      radials,
      frameThreads,
      spirals,
      built: false,
      buildPhase: 0, // 0=frame, 1=radials, 2=spirals
      buildProgress: 0,
      age: 0
    };
  }

  function rebuildWebs() {
    if (anchors.length < MIN_ANCHORS_FOR_WEB) {
      webs = [];
      spiders = [];
      return;
    }

    const web = generateWebFromAnchors(anchors);
    if (web) {
      webs = [web];
      // Spawn spiders
      spiders = [];
      const spiderCount = Math.max(1, Math.floor(anchors.length * 0.8));
      for (let i = 0; i < spiderCount; i++) {
        spiders.push(createSpider(web));
      }
    }
  }

  // ============================================================
  // Spider agents
  // ============================================================

  function createSpider(web) {
    return {
      x: web.cx,
      y: web.cy,
      targetX: web.cx,
      targetY: web.cy,
      threadIndex: 0,
      threadType: 'radial', // 'radial', 'frame', 'spiral'
      threadT: 0,
      speed: randomRange(0.3, 0.7),
      phase: Math.random() * Math.PI * 2,
      active: true,
      trail: []
    };
  }

  function updateSpider(spider, web, dt) {
    const speedMult = 0.2 + settings.spiderSpeed * 1.8;
    const spd = spider.speed * speedMult * dt * 60;

    // Advance along current thread
    spider.threadT += spd * 0.015;

    let thread = null;
    let threads = null;

    if (spider.threadType === 'frame') {
      threads = web.frameThreads;
    } else if (spider.threadType === 'radial') {
      threads = web.radials;
    } else {
      threads = web.spirals;
    }

    if (threads.length === 0) return;

    spider.threadIndex = spider.threadIndex % threads.length;
    thread = threads[spider.threadIndex];

    if (!thread) return;

    // Thread progress also determines build animation
    if (thread.progress < 1) {
      thread.progress = Math.min(1, thread.progress + spd * 0.02);
    }

    const effectiveT = clamp(spider.threadT, 0, 1);
    const len = dist(thread.from, thread.to);
    const sag = computeSag(len);
    const pt = sagPoint(thread.from.x, thread.from.y, thread.to.x, thread.to.y, effectiveT, sag);

    spider.x = pt.x;
    spider.y = pt.y;

    // Record trail
    spider.trail.push({ x: spider.x, y: spider.y, age: 0 });
    if (spider.trail.length > 20) spider.trail.shift();

    // Move to next thread when done
    if (spider.threadT >= 1) {
      spider.threadT = 0;
      spider.threadIndex++;

      // Cycle through phases: frame -> radials -> spirals
      if (spider.threadType === 'frame' && spider.threadIndex >= web.frameThreads.length) {
        spider.threadType = 'radial';
        spider.threadIndex = 0;
      } else if (spider.threadType === 'radial' && spider.threadIndex >= web.radials.length) {
        spider.threadType = 'spiral';
        spider.threadIndex = 0;
      } else if (spider.threadType === 'spiral' && spider.threadIndex >= web.spirals.length) {
        // Loop back: wander the completed web
        spider.threadType = Math.random() < 0.3 ? 'radial' : 'spiral';
        spider.threadIndex = Math.floor(Math.random() * (spider.threadType === 'radial' ? web.radials.length : web.spirals.length));
      }
    }
  }

  // ============================================================
  // Rendering
  // ============================================================

  function drawThread(fromX, fromY, toX, toY, progress, alpha, windOffset, lineWidth) {
    if (progress <= 0) return;
    const len = dist({ x: fromX, y: fromY }, { x: toX, y: toY });
    const sag = computeSag(len);
    const steps = Math.max(8, Math.floor(len / 8));
    const drawTo = progress;

    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * drawTo;
      const pt = sagPoint(fromX, fromY, toX, toY, t, sag);
      // Wind displacement
      const windDisp = Math.sin(time * 0.8 + pt.x * 0.003 + pt.y * 0.002) * windOffset;
      const windDispY = Math.cos(time * 1.1 + pt.x * 0.002) * windOffset * 0.5;
      const fx = pt.x + windDisp;
      const fy = pt.y + windDispY;
      if (i === 0) ctx.moveTo(fx, fy);
      else ctx.lineTo(fx, fy);
    }

    // Glow layer
    ctx.strokeStyle = `rgba(200, 220, 255, ${alpha * GLOW_ALPHA})`;
    ctx.lineWidth = lineWidth + GLOW_RADIUS;
    ctx.stroke();

    // Main thread
    ctx.strokeStyle = `rgba(220, 230, 255, ${alpha})`;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  function drawAnchor(anchor, isHovered) {
    const r = ANCHOR_RADIUS;
    // Outer glow
    const grad = ctx.createRadialGradient(anchor.x, anchor.y, 0, anchor.x, anchor.y, r * 3);
    grad.addColorStop(0, isHovered ? 'rgba(255,180,100,0.4)' : 'rgba(180,200,255,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, r * 3, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = isHovered ? 'rgba(255,200,120,0.95)' : 'rgba(200,215,255,0.85)';
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Border
    ctx.strokeStyle = isHovered ? 'rgba(255,220,150,0.9)' : 'rgba(160,180,220,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawSpider(spider) {
    // Trail
    for (let i = 0; i < spider.trail.length; i++) {
      const t = spider.trail[i];
      const a = (i / spider.trail.length) * 0.15;
      ctx.fillStyle = `rgba(220, 60, 60, ${a})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Spider body glow
    const grad = ctx.createRadialGradient(spider.x, spider.y, 0, spider.x, spider.y, SPIDER_RADIUS * 4);
    grad.addColorStop(0, 'rgba(255,80,60,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(spider.x, spider.y, SPIDER_RADIUS * 4, 0, Math.PI * 2);
    ctx.fill();

    // Spider body
    ctx.fillStyle = 'rgba(210,50,50,0.95)';
    ctx.beginPath();
    ctx.arc(spider.x, spider.y, SPIDER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(255,150,130,0.5)';
    ctx.beginPath();
    ctx.arc(spider.x - 1, spider.y - 1, SPIDER_RADIUS * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    // Wind offset based on tension
    const windStrength = 2 + (1 - settings.tension) * 5;

    // Draw webs
    for (const web of webs) {
      // Frame threads
      for (const t of web.frameThreads) {
        drawThread(t.from.x, t.from.y, t.to.x, t.to.y, t.progress, THREAD_ALPHA_BASE * 1.2, windStrength, 1.2);
      }

      // Radial threads
      for (const t of web.radials) {
        drawThread(t.from.x, t.from.y, t.to.x, t.to.y, t.progress, THREAD_ALPHA_BASE, windStrength * 0.8, 0.8);
      }

      // Spiral threads
      for (const t of web.spirals) {
        const ringAlpha = THREAD_ALPHA_BASE * 0.7;
        drawThread(t.from.x, t.from.y, t.to.x, t.to.y, t.progress, ringAlpha, windStrength * 0.6, 0.6);
      }
    }

    // Draw anchors
    for (const a of anchors) {
      drawAnchor(a, a === hoveredAnchor);
    }

    // Draw spiders
    for (const s of spiders) {
      drawSpider(s);
    }

    // Instructions overlay if no anchors
    if (anchors.length === 0) {
      ctx.fillStyle = 'rgba(180, 200, 230, 0.5)';
      ctx.font = '16px "Inter", "SF Pro Display", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click to place anchor points', W / 2, H / 2);
      ctx.font = '13px "Inter", "SF Pro Display", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(180, 200, 230, 0.3)';
      ctx.fillText('Place 3 or more anchors to weave a web', W / 2, H / 2 + 28);
    } else if (anchors.length < MIN_ANCHORS_FOR_WEB) {
      ctx.fillStyle = 'rgba(180, 200, 230, 0.35)';
      ctx.font = '13px "Inter", "SF Pro Display", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Place ${MIN_ANCHORS_FOR_WEB - anchors.length} more anchor${MIN_ANCHORS_FOR_WEB - anchors.length > 1 ? 's' : ''} to begin weaving`, W / 2, H - 30);
    }
  }

  // ============================================================
  // Animation loop
  // ============================================================

  let lastTime = 0;

  function tick(timestamp) {
    if (!running) return;

    const dt = lastTime ? Math.min((timestamp - lastTime) / 16.67, 3) : 1;
    lastTime = timestamp;
    time += dt * 0.016;

    // Update wind
    wind.phase += dt * 0.01;
    wind.x = Math.sin(wind.phase) * 2;
    wind.y = Math.cos(wind.phase * 0.7) * 1;

    // Update spiders
    for (const web of webs) {
      web.age += dt;
    }
    for (const spider of spiders) {
      if (webs.length > 0) {
        updateSpider(spider, webs[0], dt);
      }
    }

    render();
    animFrameId = requestAnimationFrame(tick);
  }

  // ============================================================
  // Interaction
  // ============================================================

  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height)
    };
  }

  function findAnchorAt(pos) {
    for (let i = anchors.length - 1; i >= 0; i--) {
      if (dist(pos, anchors[i]) < ANCHOR_HIT_RADIUS) return anchors[i];
    }
    return null;
  }

  function onMouseMove(e) {
    const pos = getCanvasPos(e);
    mouse.x = pos.x;
    mouse.y = pos.y;
    hoveredAnchor = findAnchorAt(pos);
    canvas.style.cursor = hoveredAnchor ? 'pointer' : 'crosshair';
  }

  function onClick(e) {
    const pos = getCanvasPos(e);

    // Right-click or shift+click to remove
    if (e.shiftKey) {
      const anchor = findAnchorAt(pos);
      if (anchor) {
        removeAnchor(anchor);
        return;
      }
    }

    // If clicking on an existing anchor, remove it
    const existing = findAnchorAt(pos);
    if (existing && e.detail === 2) {
      // Double-click to remove
      removeAnchor(existing);
      return;
    }

    // Add new anchor
    addAnchor(pos.x, pos.y);
  }

  function onContextMenu(e) {
    e.preventDefault();
    const pos = getCanvasPos(e);
    const anchor = findAnchorAt(pos);
    if (anchor) {
      removeAnchor(anchor);
    }
  }

  function addAnchor(x, y) {
    anchors.push({ x, y, id: anchorIdCounter++ });
    rebuildWebs();
  }

  function removeAnchor(anchor) {
    anchors = anchors.filter(a => a !== anchor);
    hoveredAnchor = null;
    rebuildWebs();
  }

  function clearAll() {
    anchors = [];
    webs = [];
    spiders = [];
    hoveredAnchor = null;
    anchorIdCounter = 0;
  }

  // ============================================================
  // UI Construction
  // ============================================================

  function buildUI() {
    // Section container
    container.style.position = 'relative';
    container.style.width = '100%';
    container.style.overflow = 'hidden';

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      text-align: center;
      padding: 50px 20px 30px;
      position: relative;
      z-index: 2;
    `;
    header.innerHTML = `
      <h2 style="
        font-family: 'Inter', 'SF Pro Display', system-ui, sans-serif;
        font-size: clamp(28px, 4vw, 48px);
        font-weight: 700;
        color: #e8ecf4;
        margin: 0 0 12px 0;
        letter-spacing: -0.02em;
      ">Procedural &amp; Agentive Design</h2>
      <p style="
        font-family: 'Inter', 'SF Pro Display', system-ui, sans-serif;
        font-size: clamp(14px, 2vw, 18px);
        color: rgba(180, 200, 230, 0.6);
        margin: 0;
        max-width: 640px;
        margin-left: auto;
        margin-right: auto;
        line-height: 1.6;
      ">Inspired by Pixar's procedural cobweb system &mdash; virtual spiders weave realistic webs
      controlled by density, tension, and placement parameters.</p>
    `;
    container.appendChild(header);

    // Canvas wrapper
    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = `
      position: relative;
      width: 100%;
      max-width: 960px;
      margin: 0 auto 20px;
      aspect-ratio: 16 / 10;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.06);
    `;

    canvas = document.createElement('canvas');
    canvas.style.cssText = `
      display: block;
      width: 100%;
      height: 100%;
      background: radial-gradient(ellipse at 50% 40%, #141824 0%, #0a0d14 70%, #060810 100%);
      cursor: crosshair;
    `;
    canvasWrap.appendChild(canvas);

    // Help text below canvas
    const helpText = document.createElement('div');
    helpText.style.cssText = `
      position: absolute;
      bottom: 10px;
      right: 14px;
      font-family: 'Inter', 'SF Pro Display', system-ui, sans-serif;
      font-size: 11px;
      color: rgba(180, 200, 230, 0.3);
      pointer-events: none;
      z-index: 3;
    `;
    helpText.textContent = 'Double-click or right-click anchor to remove';
    canvasWrap.appendChild(helpText);

    container.appendChild(canvasWrap);

    // Controls panel
    const controls = document.createElement('div');
    controls.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 24px;
      padding: 16px 20px 40px;
      max-width: 960px;
      margin: 0 auto;
    `;

    function makeSlider(label, key, min, max, step) {
      const wrap = document.createElement('div');
      wrap.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        min-width: 140px;
      `;

      const lbl = document.createElement('label');
      lbl.style.cssText = `
        font-family: 'Inter', 'SF Pro Display', system-ui, sans-serif;
        font-size: 12px;
        font-weight: 500;
        color: rgba(180, 200, 230, 0.55);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      `;
      lbl.textContent = label;

      const input = document.createElement('input');
      input.type = 'range';
      input.min = min;
      input.max = max;
      input.step = step;
      input.value = settings[key];
      input.style.cssText = `
        width: 140px;
        height: 4px;
        -webkit-appearance: none;
        appearance: none;
        background: rgba(100, 120, 160, 0.25);
        border-radius: 2px;
        outline: none;
        cursor: pointer;
        accent-color: #6b8aad;
      `;
      // Style the thumb via a sheet
      input.addEventListener('input', () => {
        settings[key] = parseFloat(input.value);
        rebuildWebs();
      });

      wrap.appendChild(lbl);
      wrap.appendChild(input);
      return wrap;
    }

    controls.appendChild(makeSlider('Web Density', 'density', 0, 1, 0.01));
    controls.appendChild(makeSlider('Tension', 'tension', 0, 1, 0.01));
    controls.appendChild(makeSlider('Spider Speed', 'spiderSpeed', 0, 1, 0.01));

    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = `
      font-family: 'Inter', 'SF Pro Display', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 500;
      color: rgba(200, 210, 230, 0.7);
      background: rgba(100, 120, 160, 0.12);
      border: 1px solid rgba(100, 120, 160, 0.2);
      border-radius: 8px;
      padding: 8px 24px;
      cursor: pointer;
      transition: all 0.2s ease;
      letter-spacing: 0.02em;
    `;
    clearBtn.addEventListener('mouseenter', () => {
      clearBtn.style.background = 'rgba(100, 120, 160, 0.22)';
      clearBtn.style.color = 'rgba(220, 225, 240, 0.9)';
    });
    clearBtn.addEventListener('mouseleave', () => {
      clearBtn.style.background = 'rgba(100, 120, 160, 0.12)';
      clearBtn.style.color = 'rgba(200, 210, 230, 0.7)';
    });
    clearBtn.addEventListener('click', () => {
      clearAll();
    });
    controls.appendChild(clearBtn);

    container.appendChild(controls);

    // Inject slider thumb styles
    const style = document.createElement('style');
    style.textContent = `
      .spiderweb-section input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #8aa4c4;
        cursor: pointer;
        box-shadow: 0 0 6px rgba(120,160,210,0.4);
        border: none;
      }
      .spiderweb-section input[type="range"]::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #8aa4c4;
        cursor: pointer;
        box-shadow: 0 0 6px rgba(120,160,210,0.4);
        border: none;
      }
    `;
    container.appendChild(style);
    container.classList.add('spiderweb-section');
  }

  function sizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = rect.width * dpr;
    H = rect.height * dpr;
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    // For drawing calculations, use CSS pixels
    W = rect.width;
    H = rect.height;
  }

  // ============================================================
  // Public API
  // ============================================================

  return {
    init(cont) {
      container = cont;
      buildUI();
      sizeCanvas();

      // Event listeners
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('click', onClick);
      canvas.addEventListener('contextmenu', onContextMenu);

      // Touch support
      canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const pos = getCanvasPos(touch);
        addAnchor(pos.x, pos.y);
      }, { passive: false });
    },

    start() {
      if (running) return;
      running = true;
      lastTime = 0;
      animFrameId = requestAnimationFrame(tick);
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
      // Remap anchors to new size
      const oldW = W;
      const oldH = H;
      sizeCanvas();
      if (oldW > 0 && oldH > 0) {
        const scaleX = W / oldW;
        const scaleY = H / oldH;
        for (const a of anchors) {
          a.x *= scaleX;
          a.y *= scaleY;
        }
        rebuildWebs();
      }
    }
  };
})();

// Export for both module and non-module contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpiderWebSection;
}
