// =============================================================================
// HERO SECTION — Procedural Flow-Field Particle Canvas
// A mesmerizing generative particle system driven by simplex noise flow fields,
// with mouse-interactive "human in the loop" behavior.
// =============================================================================

const HeroSection = (() => {
  // ---------------------------------------------------------------------------
  // Simplex Noise (2D) — compact inline implementation
  // Based on Stefan Gustavson's simplex noise algorithm
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

    // Seed the permutation table
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates shuffle with a fixed seed for reproducibility
    let seed = 42;
    const seededRandom = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(seededRandom() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) {
      perm[i] = p[i & 255];
      permMod12[i] = perm[i] % 12;
    }

    function noise2D(xin, yin) {
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s);
      const j = Math.floor(yin + s);
      const t = (i + j) * G2;

      const X0 = i - t;
      const Y0 = j - t;
      const x0 = xin - X0;
      const y0 = yin - Y0;

      const i1 = x0 > y0 ? 1 : 0;
      const j1 = x0 > y0 ? 0 : 1;

      const x1 = x0 - i1 + G2;
      const y1 = y0 - j1 + G2;
      const x2 = x0 - 1.0 + 2.0 * G2;
      const y2 = y0 - 1.0 + 2.0 * G2;

      const ii = i & 255;
      const jj = j & 255;
      const gi0 = permMod12[ii + perm[jj]];
      const gi1 = permMod12[ii + i1 + perm[jj + j1]];
      const gi2 = permMod12[ii + 1 + perm[jj + 1]];

      let n0 = 0, n1 = 0, n2 = 0;

      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 >= 0) {
        t0 *= t0;
        n0 = t0 * t0 * (grad3[gi0][0] * x0 + grad3[gi0][1] * y0);
      }

      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 >= 0) {
        t1 *= t1;
        n1 = t1 * t1 * (grad3[gi1][0] * x1 + grad3[gi1][1] * y1);
      }

      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 >= 0) {
        t2 *= t2;
        n2 = t2 * t2 * (grad3[gi2][0] * x2 + grad3[gi2][1] * y2);
      }

      return 70.0 * (n0 + n1 + n2);
    }

    return { noise2D };
  })();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let canvas, ctx, container;
  let width, height, dpr;
  let particles = [];
  let animationId = null;
  let running = false;
  let time = 0;

  // Mouse state (normalized 0-1, centered)
  let mouse = { x: 0.5, y: 0.5, active: false };
  let mouseSmooth = { x: 0.5, y: 0.5 };

  // Ripple state
  let ripples = [];

  // Blur overlay
  let blurOverlay = null;

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------
  const CONFIG = {
    PARTICLE_COUNT: 1200,
    NOISE_SCALE: 0.0025,
    NOISE_SPEED: 0.0003,
    FLOW_STRENGTH: 1.8,
    MOUSE_RADIUS: 0.18,       // As fraction of min(width, height)
    MOUSE_STRENGTH: 0.6,
    TRAIL_ALPHA: 0.06,
    SPEED_DAMPING: 0.97,
    MAX_SPEED: 3.5,
    PARTICLE_MIN_SIZE: 0.5,
    PARTICLE_MAX_SIZE: 2.8,
    BLUR_ENABLED: true,
    BLUR_AMOUNT: 2.3,
    BLUR_CLEAR_RADIUS: 240,
  };

  // Color palette — soft blues, purples, warm whites
  const PALETTE = [
    { r: 140, g: 160, b: 255 },  // soft blue
    { r: 100, g: 140, b: 255 },  // medium blue
    { r: 180, g: 140, b: 255 },  // lavender
    { r: 160, g: 100, b: 240 },  // purple
    { r: 200, g: 180, b: 255 },  // light purple
    { r: 240, g: 230, b: 255 },  // warm white
    { r: 255, g: 245, b: 240 },  // cream white
    { r: 120, g: 180, b: 255 },  // sky blue
  ];

  // ---------------------------------------------------------------------------
  // Particle class
  // ---------------------------------------------------------------------------
  function createParticle(respawn) {
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const size = CONFIG.PARTICLE_MIN_SIZE +
      Math.random() * (CONFIG.PARTICLE_MAX_SIZE - CONFIG.PARTICLE_MIN_SIZE);
    const baseOpacity = 0.15 + Math.random() * 0.6;
    // Larger particles are slightly more opaque
    const opacity = baseOpacity * (0.5 + (size / CONFIG.PARTICLE_MAX_SIZE) * 0.5);
    const life = 300 + Math.random() * 700;

    let x, y;
    if (respawn) {
      // Respawn from edges for continuous flow
      const edge = Math.floor(Math.random() * 4);
      switch (edge) {
        case 0: x = Math.random() * width; y = -10; break;
        case 1: x = width + 10; y = Math.random() * height; break;
        case 2: x = Math.random() * width; y = height + 10; break;
        case 3: x = -10; y = Math.random() * height; break;
      }
    } else {
      x = Math.random() * width;
      y = Math.random() * height;
    }

    return {
      x, y,
      px: x, py: y,
      vx: 0, vy: 0,
      size,
      color,
      opacity,
      maxLife: life,
      life,
      phase: Math.random() * Math.PI * 2, // For subtle pulsing
    };
  }

  // ---------------------------------------------------------------------------
  // Flow field sampling
  // ---------------------------------------------------------------------------
  function sampleFlowField(x, y, t) {
    const scale = CONFIG.NOISE_SCALE;
    const angle = SimplexNoise.noise2D(x * scale, y * scale + t) * Math.PI * 2;

    // Second noise layer for variation — larger scale, slower
    const angle2 = SimplexNoise.noise2D(
      x * scale * 0.4 + 100,
      y * scale * 0.4 + 200 + t * 0.5
    ) * Math.PI * 2;

    // Blend two noise layers for richer, more river-like flow
    const blended = angle * 0.7 + angle2 * 0.3;

    return {
      fx: Math.cos(blended) * CONFIG.FLOW_STRENGTH,
      fy: Math.sin(blended) * CONFIG.FLOW_STRENGTH,
    };
  }

  // ---------------------------------------------------------------------------
  // Mouse interaction — gentle orbital attraction
  // ---------------------------------------------------------------------------
  function applyMouseInfluence(p) {
    if (!mouse.active) return;

    const mx = mouseSmooth.x * width;
    const my = mouseSmooth.y * height;
    const dx = mx - p.x;
    const dy = my - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radius = CONFIG.MOUSE_RADIUS * Math.min(width, height);

    if (dist < radius && dist > 1) {
      const t = 1 - dist / radius;
      const falloff = t * t * (3 - 2 * t); // smoothstep

      // Orbital component (perpendicular to radial direction)
      const nx = dx / dist;
      const ny = dy / dist;
      const orbX = -ny;
      const orbY = nx;

      // Blend attraction (toward cursor) with orbit (around cursor)
      const attractStrength = CONFIG.MOUSE_STRENGTH * falloff * 0.3;
      const orbitStrength = CONFIG.MOUSE_STRENGTH * falloff * 0.7;

      p.vx += nx * attractStrength + orbX * orbitStrength;
      p.vy += ny * attractStrength + orbY * orbitStrength;
    }
  }

  // ---------------------------------------------------------------------------
  // Ripple interaction — expanding wavefront that pushes particles
  // ---------------------------------------------------------------------------
  function createRipple(nx, ny) {
    ripples.push({
      x: nx * width,
      y: ny * height,
      radius: 0,
      maxRadius: Math.min(width, height) * 0.65,
      speed: Math.min(width, height) * 0.005,
      strength: 3.5,
      life: 1,
      phase: Math.random() * Math.PI * 2,
    });
  }

  function applyRippleForces(p) {
    for (let i = 0; i < ripples.length; i++) {
      const r = ripples[i];
      const dx = p.x - r.x;
      const dy = p.y - r.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Wavefront band — particles near the ring edge get pushed
      const ringDist = Math.abs(dist - r.radius);
      const bandWidth = 60 + r.radius * 0.15;

      if (ringDist < bandWidth && dist > 1) {
        const bandFalloff = 1 - ringDist / bandWidth;
        const force = bandFalloff * bandFalloff * r.strength * r.life;

        const nx = dx / dist;
        const ny = dy / dist;

        // Push outward from ripple center
        p.vx += nx * force;
        p.vy += ny * force;
      }
    }
  }

  function updateRipples() {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.radius += r.speed;
      r.life = Math.max(0, 1 - r.radius / r.maxRadius);

      if (r.life <= 0) {
        ripples.splice(i, 1);
      }
    }
  }

  function drawRipples() {
    for (let i = 0; i < ripples.length; i++) {
      const r = ripples[i];
      const alpha = r.life * 0.12;
      if (alpha < 0.005 || r.radius < 1) continue;

      // Soft wave band — radial gradient that fades in and out
      const bandWidth = 40 + r.radius * 0.25;
      const innerR = Math.max(0, r.radius - bandWidth);
      const outerR = r.radius + bandWidth;

      const grad = ctx.createRadialGradient(r.x, r.y, innerR, r.x, r.y, outerR);
      grad.addColorStop(0, `rgba(160, 150, 240, 0)`);
      grad.addColorStop(0.35, `rgba(170, 160, 255, ${alpha * 0.5})`);
      grad.addColorStop(0.5, `rgba(180, 170, 255, ${alpha})`);
      grad.addColorStop(0.65, `rgba(170, 160, 255, ${alpha * 0.5})`);
      grad.addColorStop(1, `rgba(160, 150, 240, 0)`);

      ctx.beginPath();
      ctx.arc(r.x, r.y, outerR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------------------
  // Update & Draw
  // ---------------------------------------------------------------------------
  function update() {
    time += CONFIG.NOISE_SPEED;

    // Smooth mouse position
    mouseSmooth.x += (mouse.x - mouseSmooth.x) * 0.08;
    mouseSmooth.y += (mouse.y - mouseSmooth.y) * 0.08;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Flow field force
      const { fx, fy } = sampleFlowField(p.x, p.y, time);
      p.vx += fx * 0.15;
      p.vy += fy * 0.15;

      // Mouse interaction
      applyMouseInfluence(p);

      // Ripple forces
      applyRippleForces(p);

      // Damping
      p.vx *= CONFIG.SPEED_DAMPING;
      p.vy *= CONFIG.SPEED_DAMPING;

      // Clamp speed
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > CONFIG.MAX_SPEED) {
        p.vx = (p.vx / speed) * CONFIG.MAX_SPEED;
        p.vy = (p.vy / speed) * CONFIG.MAX_SPEED;
      }

      // Move (save previous position for line drawing)
      p.px = p.x;
      p.py = p.y;
      p.x += p.vx;
      p.y += p.vy;

      // Age
      p.life -= 1;

      // Respawn if dead or out of bounds
      const margin = 50;
      if (
        p.life <= 0 ||
        p.x < -margin || p.x > width + margin ||
        p.y < -margin || p.y > height + margin
      ) {
        Object.assign(p, createParticle(true));
      }
    }

    // Update ripple wavefronts
    updateRipples();
  }

  function draw() {
    // Semi-transparent overlay for trails
    ctx.fillStyle = `rgba(10, 10, 15, ${CONFIG.TRAIL_ALPHA})`;
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Life-based fade in/out
      const lifeFrac = p.life / p.maxLife;
      let lifeFade = 1;
      if (lifeFrac > 0.9) lifeFade = (1 - lifeFrac) / 0.1; // fade in
      if (lifeFrac < 0.15) lifeFade = lifeFrac / 0.15;       // fade out

      // Subtle pulse
      const pulse = 0.85 + 0.15 * Math.sin(time * 800 + p.phase);

      // Speed glow — faster particles are slightly brighter
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const speedGlow = Math.min(1, 0.7 + speed * 0.15);

      const alpha = p.opacity * lifeFade * pulse * speedGlow;
      if (alpha < 0.01) continue;

      const { r, g, b } = p.color;
      const lineW = p.size * (0.8 + speed * 0.15);

      // Draw as line segment from previous to current position
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      // Soft glow for larger/faster particles
      if (lineW > 1.5) {
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.08})`;
        ctx.lineWidth = lineW * 4;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }

    // Draw ripple rings
    drawRipples();
  }

  function frame() {
    if (!running) return;
    update();
    draw();
    animationId = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // Inject styles
  // ---------------------------------------------------------------------------
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .hero-section {
        position: relative;
        width: 100%;
        height: 100vh;
        overflow: hidden;
        background: #0a0a0f;
      }

      .hero-canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: block;
      }

      .hero-blur-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1;
        pointer-events: none;
        backdrop-filter: blur(var(--hero-blur, 1.5px));
        -webkit-backdrop-filter: blur(var(--hero-blur, 1.5px));
        mask-image: radial-gradient(circle 0px at 50% 50%, transparent 0%, transparent 50%, black 100%);
        -webkit-mask-image: radial-gradient(circle 0px at 50% 50%, transparent 0%, transparent 50%, black 100%);
        transition: mask-image 0.3s ease, -webkit-mask-image 0.3s ease;
      }

      .hero-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        pointer-events: none;
        z-index: 2;
      }

      .hero-title {
        font-family: 'Georgia', 'Times New Roman', serif;
        font-size: clamp(2.5rem, 7vw, 6.5rem);
        font-weight: 400;
        letter-spacing: 0.04em;
        color: rgba(255, 255, 255, 0.92);
        margin: 0;
        line-height: 1.1;
        text-align: center;
        text-shadow: 0 0 60px rgba(140, 160, 255, 0.2),
                     0 0 120px rgba(140, 100, 240, 0.08);
        animation: heroFadeIn 2s ease-out 0.3s both;
      }

      .hero-subtitle {
        font-family: 'Helvetica Neue', 'Arial', sans-serif;
        font-size: clamp(0.9rem, 2vw, 1.35rem);
        font-weight: 300;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: rgba(180, 170, 220, 0.7);
        margin: 1.2rem 0 0 0;
        text-align: center;
        animation: heroFadeIn 2s ease-out 0.8s both;
      }

      .hero-date {
        font-family: 'Helvetica Neue', 'Arial', sans-serif;
        font-size: clamp(0.7rem, 1.2vw, 0.9rem);
        font-weight: 300;
        letter-spacing: 0.3em;
        text-transform: uppercase;
        color: rgba(160, 150, 200, 0.55);
        margin: 1.6rem 0 0 0;
        text-align: center;
        animation: heroFadeIn 2s ease-out 1.3s both;
      }

      .hero-scroll-indicator {
        position: absolute;
        bottom: 2.5rem;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.3rem;
        z-index: 2;
        pointer-events: none;
        animation: heroFadeIn 2s ease-out 2s both;
      }

      .hero-scroll-indicator span {
        font-family: 'Helvetica Neue', 'Arial', sans-serif;
        font-size: 0.65rem;
        letter-spacing: 0.25em;
        text-transform: uppercase;
        color: rgba(180, 170, 220, 0.55);
      }

      .hero-chevron {
        width: 20px;
        height: 20px;
        opacity: 0.55;
        animation: heroChevronBounce 2.5s ease-in-out infinite;
      }

      .hero-chevron svg {
        width: 100%;
        height: 100%;
      }

      @keyframes heroFadeIn {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes heroChevronBounce {
        0%, 100% { transform: translateY(0); opacity: 0.55; }
        50% { transform: translateY(8px); opacity: 0.6; }
      }

      /* ---- Config Panel ---- */
      .hero-config-btn {
        position: absolute;
        top: 16px;
        right: 16px;
        z-index: 10;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(10, 10, 15, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: border-color 0.25s, background 0.25s;
        padding: 0;
      }
      .hero-config-btn:hover {
        border-color: rgba(255, 255, 255, 0.25);
        background: rgba(20, 20, 30, 0.7);
      }
      .hero-config-btn svg {
        width: 16px;
        height: 16px;
        opacity: 0.45;
        transition: opacity 0.25s;
      }
      .hero-config-btn:hover svg {
        opacity: 0.7;
      }

      .hero-config-panel {
        position: absolute;
        top: 56px;
        right: 16px;
        z-index: 10;
        width: 280px;
        max-height: calc(100vh - 100px);
        overflow-y: auto;
        background: rgba(12, 12, 20, 0.85);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 16px;
        opacity: 0;
        transform: translateY(-8px) scale(0.97);
        pointer-events: none;
        transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                    transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .hero-config-panel.open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }
      .hero-config-panel::-webkit-scrollbar {
        width: 4px;
      }
      .hero-config-panel::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
      }

      .hcp-title {
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.4);
        margin: 0 0 14px;
      }

      .hcp-group {
        margin-bottom: 14px;
      }
      .hcp-group:last-child {
        margin-bottom: 0;
      }

      .hcp-label {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 5px;
      }
      .hcp-label span {
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        letter-spacing: 0.03em;
      }
      .hcp-label .hcp-val {
        color: rgba(180, 170, 255, 0.7);
        font-variant-numeric: tabular-nums;
      }

      .hcp-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 3px;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.08);
        outline: none;
        cursor: pointer;
      }
      .hcp-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: rgba(180, 170, 255, 0.6);
        border: none;
        cursor: pointer;
        transition: background 0.2s;
      }
      .hcp-slider::-webkit-slider-thumb:hover {
        background: rgba(180, 170, 255, 0.85);
      }
      .hcp-slider::-moz-range-thumb {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: rgba(180, 170, 255, 0.6);
        border: none;
        cursor: pointer;
      }

      .hcp-divider {
        height: 1px;
        background: rgba(255, 255, 255, 0.06);
        margin: 14px 0;
      }

      .hcp-toggle-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .hcp-toggle-row span {
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        letter-spacing: 0.03em;
      }
      .hcp-toggle {
        position: relative;
        width: 32px;
        height: 18px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 9px;
        cursor: pointer;
        transition: background 0.25s;
        border: none;
        padding: 0;
      }
      .hcp-toggle.on {
        background: rgba(180, 170, 255, 0.35);
      }
      .hcp-toggle::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.5);
        transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s;
      }
      .hcp-toggle.on::after {
        transform: translateX(14px);
        background: rgba(180, 170, 255, 0.9);
      }
    `;
    document.head.appendChild(style);
    return style;
  }

  // ---------------------------------------------------------------------------
  // Build DOM
  // ---------------------------------------------------------------------------
  function buildDOM(parentContainer) {
    // Section wrapper
    parentContainer.classList.add('hero-section');

    // Canvas
    canvas = document.createElement('canvas');
    canvas.classList.add('hero-canvas');
    parentContainer.appendChild(canvas);
    ctx = canvas.getContext('2d');

    // Blur overlay (backdrop-filter with masked clear zone around cursor)
    blurOverlay = document.createElement('div');
    blurOverlay.classList.add('hero-blur-overlay');
    parentContainer.appendChild(blurOverlay);
    applyBlurSettings();

    // Text overlay
    const overlay = document.createElement('div');
    overlay.classList.add('hero-overlay');
    overlay.innerHTML = `
      <h1 class="hero-title">Procedural Design</h1>
      <p class="hero-subtitle">Design for &amp; with AI</p>
      <p class="hero-date">First Draft &middot; 2019</p>
    `;
    parentContainer.appendChild(overlay);

    // Scroll indicator
    const scrollIndicator = document.createElement('div');
    scrollIndicator.classList.add('hero-scroll-indicator');
    scrollIndicator.innerHTML = `
      <span>Scroll</span>
      <div class="hero-chevron">
        <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 7L10 13L16 7" stroke="rgba(180,170,220,0.6)" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    `;
    parentContainer.appendChild(scrollIndicator);

    // Config button + panel
    buildConfigPanel(parentContainer);
  }

  // ---------------------------------------------------------------------------
  // Config Panel
  // ---------------------------------------------------------------------------
  function buildConfigPanel(parent) {
    // Gear button
    const btn = document.createElement('button');
    btn.className = 'hero-config-btn';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>`;
    parent.appendChild(btn);

    // Panel
    const panel = document.createElement('div');
    panel.className = 'hero-config-panel';

    const PARAMS = [
      { key: 'PARTICLE_COUNT', label: 'Particles', min: 100, max: 3000, step: 50, decimals: 0, rebuild: true },
      null, // divider
      { key: 'NOISE_SCALE', label: 'Flow Scale', min: 0.0005, max: 0.008, step: 0.0001, decimals: 4 },
      { key: 'NOISE_SPEED', label: 'Flow Speed', min: 0.00005, max: 0.002, step: 0.00005, decimals: 5 },
      { key: 'FLOW_STRENGTH', label: 'Flow Strength', min: 0.2, max: 5, step: 0.1, decimals: 1 },
      null,
      { key: 'TRAIL_ALPHA', label: 'Trail Fade', min: 0.01, max: 0.2, step: 0.005, decimals: 3 },
      { key: 'SPEED_DAMPING', label: 'Damping', min: 0.9, max: 0.999, step: 0.001, decimals: 3 },
      { key: 'MAX_SPEED', label: 'Max Speed', min: 1, max: 15, step: 0.5, decimals: 1 },
      null,
      { key: 'PARTICLE_MIN_SIZE', label: 'Min Size', min: 0.1, max: 3, step: 0.1, decimals: 1 },
      { key: 'PARTICLE_MAX_SIZE', label: 'Max Size', min: 0.5, max: 8, step: 0.1, decimals: 1 },
      null,
      { key: 'MOUSE_RADIUS', label: 'Cursor Radius', min: 0.05, max: 0.4, step: 0.01, decimals: 2 },
      { key: 'MOUSE_STRENGTH', label: 'Cursor Force', min: 0.1, max: 2, step: 0.05, decimals: 2 },
    ];

    const BLUR_PARAMS = [
      { key: 'BLUR_AMOUNT', label: 'Blur Amount', min: 0.5, max: 8, step: 0.25, decimals: 1 },
      { key: 'BLUR_CLEAR_RADIUS', label: 'Clear Radius', min: 60, max: 500, step: 10, decimals: 0 },
    ];

    let html = '<div class="hcp-title">Particle Parameters</div>';
    for (const p of PARAMS) {
      if (p === null) {
        html += '<div class="hcp-divider"></div>';
        continue;
      }
      const val = CONFIG[p.key];
      html += `
        <div class="hcp-group">
          <div class="hcp-label">
            <span>${p.label}</span>
            <span class="hcp-val" data-val="${p.key}">${val.toFixed(p.decimals)}</span>
          </div>
          <input type="range" class="hcp-slider" data-key="${p.key}"
            min="${p.min}" max="${p.max}" step="${p.step}" value="${val}"
            ${p.rebuild ? 'data-rebuild="1"' : ''} data-decimals="${p.decimals}">
        </div>`;
    }

    // Blur section
    html += '<div class="hcp-divider"></div>';
    html += `<div class="hcp-toggle-row">
      <span>Depth of Field</span>
      <button class="hcp-toggle ${CONFIG.BLUR_ENABLED ? 'on' : ''}" data-toggle="blur"></button>
    </div>`;
    for (const p of BLUR_PARAMS) {
      const val = CONFIG[p.key];
      html += `
        <div class="hcp-group hcp-blur-ctrl">
          <div class="hcp-label">
            <span>${p.label}</span>
            <span class="hcp-val" data-val="${p.key}">${val.toFixed(p.decimals)}</span>
          </div>
          <input type="range" class="hcp-slider" data-key="${p.key}" data-blur="1"
            min="${p.min}" max="${p.max}" step="${p.step}" value="${val}"
            data-decimals="${p.decimals}">
        </div>`;
    }

    panel.innerHTML = html;
    parent.appendChild(panel);

    // Toggle
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('open');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && e.target !== btn) {
        panel.classList.remove('open');
      }
    });

    // Wire sliders
    panel.addEventListener('input', (e) => {
      const slider = e.target;
      if (!slider.dataset.key) return;
      const key = slider.dataset.key;
      const val = parseFloat(slider.value);
      const decimals = parseInt(slider.dataset.decimals);
      CONFIG[key] = val;

      // Update display value
      const valEl = panel.querySelector(`[data-val="${key}"]`);
      if (valEl) valEl.textContent = val.toFixed(decimals);

      // Rebuild particles if count changed
      if (slider.dataset.rebuild) {
        const target = Math.round(val);
        while (particles.length < target) particles.push(createParticle(false));
        while (particles.length > target) particles.pop();
      }

      // Apply blur settings live
      if (slider.dataset.blur) {
        applyBlurSettings();
      }
    });

    // Wire blur toggle
    panel.addEventListener('click', (e) => {
      const toggle = e.target.closest('[data-toggle="blur"]');
      if (toggle) {
        CONFIG.BLUR_ENABLED = !CONFIG.BLUR_ENABLED;
        toggle.classList.toggle('on', CONFIG.BLUR_ENABLED);
        applyBlurSettings();
        // Dim blur sliders when off
        panel.querySelectorAll('.hcp-blur-ctrl').forEach(el => {
          el.style.opacity = CONFIG.BLUR_ENABLED ? '1' : '0.35';
          el.style.pointerEvents = CONFIG.BLUR_ENABLED ? '' : 'none';
        });
      }
      e.stopPropagation();
    });

    // Prevent panel interactions from triggering ripples
    btn.addEventListener('click', (e) => e.stopPropagation());
  }

  // ---------------------------------------------------------------------------
  // Sizing
  // ---------------------------------------------------------------------------
  function setSize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = container.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------
  function applyBlurSettings() {
    if (!blurOverlay) return;
    if (!CONFIG.BLUR_ENABLED) {
      blurOverlay.style.display = 'none';
      return;
    }
    blurOverlay.style.display = '';
    blurOverlay.style.setProperty('--hero-blur', CONFIG.BLUR_AMOUNT + 'px');
  }

  function updateBlurMask(px, py) {
    if (!blurOverlay || !CONFIG.BLUR_ENABLED) return;
    const r = CONFIG.BLUR_CLEAR_RADIUS;
    const mask = `radial-gradient(circle ${r}px at ${px}px ${py}px, transparent 0%, transparent 40%, black 100%)`;
    blurOverlay.style.maskImage = mask;
    blurOverlay.style.webkitMaskImage = mask;
  }

  function clearBlurMask() {
    if (!blurOverlay) return;
    const mask = 'radial-gradient(circle 0px at 50% 50%, transparent 0%, transparent 50%, black 100%)';
    blurOverlay.style.maskImage = mask;
    blurOverlay.style.webkitMaskImage = mask;
  }

  function onMouseMove(e) {
    const rect = container.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) / rect.width;
    mouse.y = (e.clientY - rect.top) / rect.height;
    mouse.active = true;
    updateBlurMask(e.clientX - rect.left, e.clientY - rect.top);
  }

  function onMouseLeave() {
    mouse.active = false;
    clearBlurMask();
  }

  function onTouchMove(e) {
    if (e.touches.length > 0) {
      const rect = container.getBoundingClientRect();
      mouse.x = (e.touches[0].clientX - rect.left) / rect.width;
      mouse.y = (e.touches[0].clientY - rect.top) / rect.height;
      mouse.active = true;
      updateBlurMask(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
    }
  }

  function onTouchEnd() {
    mouse.active = false;
    clearBlurMask();
  }

  function onClick(e) {
    if (e.target.closest('.hero-config-btn, .hero-config-panel')) return;
    const rect = container.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    createRipple(nx, ny);
  }

  function onTouchStart(e) {
    if (e.touches.length > 0) {
      const rect = container.getBoundingClientRect();
      const nx = (e.touches[0].clientX - rect.left) / rect.width;
      const ny = (e.touches[0].clientY - rect.top) / rect.height;
      createRipple(nx, ny);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  let styleEl = null;

  return {
    init(parentContainer) {
      container = parentContainer;
      styleEl = injectStyles();
      buildDOM(container);
      setSize();

      // Create initial particles
      particles = [];
      for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
        particles.push(createParticle(false));
      }

      // Clear canvas to background color
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, width, height);

      // Bind events
      container.addEventListener('mousemove', onMouseMove);
      container.addEventListener('mouseleave', onMouseLeave);
      container.addEventListener('click', onClick);
      container.addEventListener('touchmove', onTouchMove, { passive: true });
      container.addEventListener('touchstart', onTouchStart, { passive: true });
      container.addEventListener('touchend', onTouchEnd);
    },

    start() {
      if (running) return;
      running = true;
      frame();
    },

    stop() {
      running = false;
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    },

    resize() {
      if (!container) return;
      setSize();

      // Re-clear canvas on resize to avoid artifacts
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, width, height);
    },
  };
})();

// Export for both module and script contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HeroSection;
}
