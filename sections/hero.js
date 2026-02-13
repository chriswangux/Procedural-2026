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

      // Damping
      p.vx *= CONFIG.SPEED_DAMPING;
      p.vy *= CONFIG.SPEED_DAMPING;

      // Clamp speed
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > CONFIG.MAX_SPEED) {
        p.vx = (p.vx / speed) * CONFIG.MAX_SPEED;
        p.vy = (p.vy / speed) * CONFIG.MAX_SPEED;
      }

      // Move
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

      // Draw the particle — a soft radial dot
      const radius = p.size * (0.8 + speed * 0.12);

      // For larger particles, add a soft glow
      if (radius > 1.5) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.08})`;
        ctx.fill();
      }

      // Core dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.fill();
    }
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
  function onMouseMove(e) {
    const rect = container.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) / rect.width;
    mouse.y = (e.clientY - rect.top) / rect.height;
    mouse.active = true;
  }

  function onMouseLeave() {
    mouse.active = false;
  }

  function onTouchMove(e) {
    if (e.touches.length > 0) {
      const rect = container.getBoundingClientRect();
      mouse.x = (e.touches[0].clientX - rect.left) / rect.width;
      mouse.y = (e.touches[0].clientY - rect.top) / rect.height;
      mouse.active = true;
    }
  }

  function onTouchEnd() {
    mouse.active = false;
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
      container.addEventListener('touchmove', onTouchMove, { passive: true });
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
