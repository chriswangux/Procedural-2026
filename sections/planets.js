// ============================================================================
// PROCEDURAL PLANET GENERATOR
// Inspired by No Man's Sky — 18,446,744,073,709,551,616 unique planets
// Pure vanilla JS + Canvas API, zero dependencies
// ============================================================================

const PlanetSection = (() => {

  // --- Simplex-style noise (self-contained) -----------------------------------

  // Permutation table seeded from planet seed
  function buildPerm(seed) {
    const p = new Uint8Array(512);
    const base = new Uint8Array(256);
    for (let i = 0; i < 256; i++) base[i] = i;
    // Fisher-Yates shuffle driven by seed
    let s = seed | 0;
    for (let i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const j = ((s >>> 0) % (i + 1));
      const tmp = base[i]; base[i] = base[j]; base[j] = tmp;
    }
    for (let i = 0; i < 512; i++) p[i] = base[i & 255];
    return p;
  }

  const GRAD3 = [
    [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
    [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
    [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
  ];

  function dot3(g, x, y, z) { return g[0]*x + g[1]*y + g[2]*z; }

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }

  function perlin3(perm, x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A  = perm[X] + Y;
    const AA = perm[A] + Z;
    const AB = perm[A + 1] + Z;
    const B  = perm[X + 1] + Y;
    const BA = perm[B] + Z;
    const BB = perm[B + 1] + Z;
    return lerp(
      lerp(
        lerp(dot3(GRAD3[perm[AA] % 12], x, y, z),
             dot3(GRAD3[perm[BA] % 12], x-1, y, z), u),
        lerp(dot3(GRAD3[perm[AB] % 12], x, y-1, z),
             dot3(GRAD3[perm[BB] % 12], x-1, y-1, z), u),
        v),
      lerp(
        lerp(dot3(GRAD3[perm[AA+1] % 12], x, y, z-1),
             dot3(GRAD3[perm[BA+1] % 12], x-1, y, z-1), u),
        lerp(dot3(GRAD3[perm[AB+1] % 12], x, y-1, z-1),
             dot3(GRAD3[perm[BB+1] % 12], x-1, y-1, z-1), u),
        v),
      w);
  }

  // Fractal Brownian Motion — multiple octaves for rich detail
  function fbm(perm, x, y, z, octaves, lacunarity, gain) {
    let value = 0, amplitude = 1, frequency = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      value += amplitude * perlin3(perm, x * frequency, y * frequency, z * frequency);
      max += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return value / max;
  }

  // --- Seeded PRNG for deterministic planet properties ------------------------

  function seededRandom(seed) {
    let s = seed | 0;
    return function() {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 4294967296;
    };
  }

  // --- Color utilities --------------------------------------------------------

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    if (h < 60)       { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }

  function lerpColor(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }

  // --- Planet type palettes ---------------------------------------------------

  const PLANET_TYPES = [
    { // Rocky desert
      name: 'Rocky',
      colors: (rng) => {
        const hue = 20 + rng() * 30;
        return {
          surface: [
            hslToRgb(hue, 0.6, 0.25),
            hslToRgb(hue + 15, 0.5, 0.35),
            hslToRgb(hue + 30, 0.4, 0.5),
            hslToRgb(hue - 10, 0.7, 0.2),
          ],
          atmosphere: hslToRgb(hue + 10, 0.3, 0.5),
          clouds: hslToRgb(30, 0.1, 0.85),
          cloudDensity: 0.15 + rng() * 0.2,
        };
      },
    },
    { // Icy
      name: 'Icy',
      colors: (rng) => {
        const hue = 195 + rng() * 30;
        return {
          surface: [
            hslToRgb(hue, 0.3, 0.75),
            hslToRgb(hue + 10, 0.5, 0.85),
            hslToRgb(hue - 10, 0.4, 0.6),
            hslToRgb(hue + 20, 0.2, 0.9),
          ],
          atmosphere: hslToRgb(hue, 0.5, 0.7),
          clouds: hslToRgb(210, 0.1, 0.95),
          cloudDensity: 0.3 + rng() * 0.3,
        };
      },
    },
    { // Lush / Earth-like
      name: 'Lush',
      colors: (rng) => {
        const hue = 100 + rng() * 50;
        return {
          surface: [
            hslToRgb(210, 0.7, 0.4),   // ocean
            hslToRgb(hue, 0.6, 0.3),    // forest
            hslToRgb(hue + 30, 0.5, 0.45), // plains
            hslToRgb(40, 0.5, 0.55),    // desert/sand
          ],
          atmosphere: hslToRgb(210, 0.5, 0.65),
          clouds: hslToRgb(0, 0, 0.95),
          cloudDensity: 0.35 + rng() * 0.3,
        };
      },
    },
    { // Volcanic
      name: 'Volcanic',
      colors: (rng) => {
        const hue = rng() * 20;
        return {
          surface: [
            hslToRgb(0, 0.1, 0.08),
            hslToRgb(hue, 0.9, 0.4),
            hslToRgb(hue + 30, 0.95, 0.55),
            hslToRgb(0, 0.05, 0.15),
          ],
          atmosphere: hslToRgb(hue + 10, 0.7, 0.35),
          clouds: hslToRgb(0, 0.3, 0.2),
          cloudDensity: 0.1 + rng() * 0.15,
        };
      },
    },
    { // Gas giant
      name: 'Gas Giant',
      colors: (rng) => {
        const hue = rng() * 360;
        return {
          surface: [
            hslToRgb(hue, 0.5, 0.55),
            hslToRgb(hue + 30, 0.6, 0.4),
            hslToRgb(hue + 60, 0.4, 0.65),
            hslToRgb(hue - 20, 0.55, 0.35),
          ],
          atmosphere: hslToRgb(hue + 15, 0.4, 0.6),
          clouds: hslToRgb(hue + 40, 0.2, 0.7),
          cloudDensity: 0.05,
          isGasGiant: true,
        };
      },
    },
    { // Toxic / alien
      name: 'Toxic',
      colors: (rng) => {
        const hue = 70 + rng() * 40;
        return {
          surface: [
            hslToRgb(hue, 0.8, 0.3),
            hslToRgb(hue + 40, 0.6, 0.2),
            hslToRgb(hue - 20, 0.9, 0.45),
            hslToRgb(hue + 60, 0.5, 0.15),
          ],
          atmosphere: hslToRgb(hue, 0.7, 0.4),
          clouds: hslToRgb(hue + 20, 0.3, 0.6),
          cloudDensity: 0.4 + rng() * 0.3,
        };
      },
    },
    { // Ocean world
      name: 'Ocean',
      colors: (rng) => {
        const hue = 190 + rng() * 40;
        return {
          surface: [
            hslToRgb(hue, 0.7, 0.3),
            hslToRgb(hue + 15, 0.6, 0.4),
            hslToRgb(hue - 10, 0.8, 0.25),
            hslToRgb(hue + 30, 0.5, 0.5),
          ],
          atmosphere: hslToRgb(hue, 0.5, 0.6),
          clouds: hslToRgb(0, 0, 0.92),
          cloudDensity: 0.4 + rng() * 0.25,
        };
      },
    },
    { // Purple alien
      name: 'Exotic',
      colors: (rng) => {
        const hue = 270 + rng() * 40;
        return {
          surface: [
            hslToRgb(hue, 0.6, 0.3),
            hslToRgb(hue + 30, 0.7, 0.45),
            hslToRgb(hue - 30, 0.5, 0.25),
            hslToRgb(hue + 60, 0.4, 0.55),
          ],
          atmosphere: hslToRgb(hue + 10, 0.5, 0.5),
          clouds: hslToRgb(hue + 20, 0.15, 0.8),
          cloudDensity: 0.2 + rng() * 0.3,
        };
      },
    },
  ];

  // --- Planet state -----------------------------------------------------------

  let container = null;
  let canvas = null;
  let ctx = null;
  let uiOverlay = null;
  let animFrameId = null;
  let running = false;

  let currentSeed = 1;
  let planet = null;           // current planet data
  let surfaceImageData = null; // pre-rendered surface strip
  let time = 0;
  let transitionAlpha = 1;     // 1 = fully visible, fades out then in on new planet
  let transitioning = false;
  let pendingSeed = null;

  // Offscreen canvas for planet texture
  let texCanvas = null;
  let texCtx = null;
  const TEX_WIDTH = 800;
  const TEX_HEIGHT = 400;

  // Reusable offscreen buffer for sphere rendering (avoid per-frame allocation)
  let sphereBufCanvas = null;
  let sphereBufCtx = null;
  let cachedTexData = null;

  // --- Generate planet from seed ----------------------------------------------

  function generatePlanet(seed) {
    const rng = seededRandom(seed);
    const perm = buildPerm(seed);

    // Pick planet type
    const typeIndex = Math.floor(rng() * PLANET_TYPES.length);
    const type = PLANET_TYPES[typeIndex];
    const palette = type.colors(rng);

    // Properties
    const sizeMultiplier = 0.7 + rng() * 0.5;
    const hasRings = rng() < 0.25;
    const ringColor = hslToRgb(rng() * 360, 0.2 + rng() * 0.3, 0.5 + rng() * 0.3);
    const ringInner = 1.25 + rng() * 0.15;
    const ringOuter = 1.6 + rng() * 0.5;
    const ringTilt = 0.15 + rng() * 0.35;
    const ringOpacity = 0.3 + rng() * 0.4;
    const rotationSpeed = 0.0003 + rng() * 0.0005;
    const axialTilt = (rng() - 0.5) * 0.3;
    const noiseScale = 2.5 + rng() * 3.5;
    const cloudNoiseScale = 1.5 + rng() * 2;

    // Star field (seeded)
    const stars = [];
    const starRng = seededRandom(seed + 9999);
    const numStars = 200 + Math.floor(starRng() * 200);
    for (let i = 0; i < numStars; i++) {
      stars.push({
        x: starRng(),
        y: starRng(),
        brightness: 0.3 + starRng() * 0.7,
        size: 0.5 + starRng() * 1.5,
        twinkleSpeed: 0.5 + starRng() * 2,
        twinkleOffset: starRng() * Math.PI * 2,
      });
    }

    return {
      seed,
      type,
      palette,
      sizeMultiplier,
      hasRings,
      ringColor,
      ringInner,
      ringOuter,
      ringTilt,
      ringOpacity,
      rotationSpeed,
      axialTilt,
      noiseScale,
      cloudNoiseScale,
      perm,
      stars,
    };
  }

  // --- Render planet surface texture to offscreen canvas ----------------------

  function renderSurfaceTexture(p) {
    if (!texCanvas) {
      texCanvas = document.createElement('canvas');
      texCtx = texCanvas.getContext('2d');
    }
    texCanvas.width = TEX_WIDTH;
    texCanvas.height = TEX_HEIGHT;

    const imgData = texCtx.createImageData(TEX_WIDTH, TEX_HEIGHT);
    const d = imgData.data;
    const { perm, palette, noiseScale, cloudNoiseScale } = p;
    const isGas = palette.isGasGiant;

    for (let py = 0; py < TEX_HEIGHT; py++) {
      const v = py / TEX_HEIGHT; // 0..1
      const phi = v * Math.PI;   // latitude angle
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      for (let px = 0; px < TEX_WIDTH; px++) {
        const u = px / TEX_WIDTH;
        const theta = u * Math.PI * 2; // longitude angle

        // 3D sphere coords for noise sampling
        const nx = sinPhi * Math.cos(theta);
        const ny = sinPhi * Math.sin(theta);
        const nz = cosPhi;

        let r, g, b;

        if (isGas) {
          // Gas giant: horizontal bands with turbulence
          const band = fbm(perm, nx * 1.5, ny * 1.5, nz * 1.5 + v * noiseScale, 5, 2.0, 0.5);
          const bandV = v * 8 + band * 2;
          const bandNoise = Math.sin(bandV * Math.PI) * 0.5 + 0.5;
          const turbulence = fbm(perm, nx * noiseScale, ny * noiseScale, nz * noiseScale, 4, 2.2, 0.45);

          const t1 = (bandNoise + turbulence) * 0.5;
          const idx = Math.min(3, Math.max(0, Math.floor(t1 * 4)));
          const idx2 = Math.min(3, idx + 1);
          const frac = (t1 * 4) - idx;
          const col = lerpColor(palette.surface[idx], palette.surface[idx2 % 4], Math.max(0, Math.min(1, frac)));
          r = col[0]; g = col[1]; b = col[2];

          // Storm spots
          const storm = fbm(perm, nx * 3, ny * 3, nz * 3 + 100, 3, 2.0, 0.5);
          if (storm > 0.4) {
            const si = (storm - 0.4) * 3;
            const stormCol = palette.surface[2];
            r = r + (stormCol[0] - r) * si * 0.5;
            g = g + (stormCol[1] - g) * si * 0.5;
            b = b + (stormCol[2] - b) * si * 0.5;
          }
        } else {
          // Terrestrial planet
          const terrain = fbm(perm, nx * noiseScale, ny * noiseScale, nz * noiseScale, 6, 2.0, 0.5);
          const detail = fbm(perm, nx * noiseScale * 3, ny * noiseScale * 3, nz * noiseScale * 3 + 50, 4, 2.0, 0.45);

          // Map terrain to color gradient
          const t = (terrain * 0.7 + detail * 0.3) * 0.5 + 0.5; // 0..1
          let col;
          if (t < 0.35) {
            col = lerpColor(palette.surface[0], palette.surface[1], t / 0.35);
          } else if (t < 0.6) {
            col = lerpColor(palette.surface[1], palette.surface[2], (t - 0.35) / 0.25);
          } else {
            col = lerpColor(palette.surface[2], palette.surface[3], Math.min(1, (t - 0.6) / 0.4));
          }
          r = col[0]; g = col[1]; b = col[2];

          // Heightmap shading (simple diffuse)
          const h = terrain * 0.5 + 0.5;
          const shade = 0.6 + h * 0.4;
          r *= shade; g *= shade; b *= shade;
        }

        // Clouds
        if (palette.cloudDensity > 0.05) {
          const cloud = fbm(perm, nx * cloudNoiseScale + 200, ny * cloudNoiseScale + 200, nz * cloudNoiseScale, 5, 2.0, 0.5);
          const cloudVal = Math.max(0, (cloud - (1 - palette.cloudDensity * 2)) * 2);
          if (cloudVal > 0) {
            const ci = Math.min(1, cloudVal);
            r = r + (palette.clouds[0] - r) * ci * 0.7;
            g = g + (palette.clouds[1] - g) * ci * 0.7;
            b = b + (palette.clouds[2] - b) * ci * 0.7;
          }
        }

        const idx = (py * TEX_WIDTH + px) * 4;
        d[idx]     = Math.max(0, Math.min(255, r));
        d[idx + 1] = Math.max(0, Math.min(255, g));
        d[idx + 2] = Math.max(0, Math.min(255, b));
        d[idx + 3] = 255;
      }
    }

    texCtx.putImageData(imgData, 0, 0);
    return texCanvas;
  }

  // --- Draw planet to main canvas ---------------------------------------------

  function drawScene(timestamp) {
    if (!ctx || !canvas) return;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const baseRadius = Math.min(W, H) * 0.28;

    ctx.clearRect(0, 0, W, H);

    // Deep space background
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
    bgGrad.addColorStop(0, '#0a0a1a');
    bgGrad.addColorStop(1, '#000005');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    if (!planet) return;

    // Stars
    for (const star of planet.stars) {
      const sx = star.x * W;
      const sy = star.y * H;
      const twinkle = 0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
      const alpha = star.brightness * (0.5 + twinkle * 0.5) * transitionAlpha;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const radius = baseRadius * planet.sizeMultiplier;

    // Apply transition alpha
    ctx.globalAlpha = transitionAlpha;

    // Rings behind planet (bottom half)
    if (planet.hasRings) {
      drawRings(cx, cy, radius, planet, 'behind');
    }

    // Atmosphere glow
    const glowSize = radius * 1.25;
    const atmoGrad = ctx.createRadialGradient(cx, cy, radius * 0.95, cx, cy, glowSize);
    const ac = planet.palette.atmosphere;
    atmoGrad.addColorStop(0, `rgba(${ac[0]|0},${ac[1]|0},${ac[2]|0},0.4)`);
    atmoGrad.addColorStop(0.5, `rgba(${ac[0]|0},${ac[1]|0},${ac[2]|0},0.15)`);
    atmoGrad.addColorStop(1, `rgba(${ac[0]|0},${ac[1]|0},${ac[2]|0},0)`);
    ctx.fillStyle = atmoGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, glowSize, 0, Math.PI * 2);
    ctx.fill();

    // Planet sphere (textured)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    if (surfaceImageData) {
      // Calculate scroll offset for rotation
      const scrollX = (time * planet.rotationSpeed * TEX_WIDTH * 80) % TEX_WIDTH;

      // Draw the texture mapped onto the circular clip, with spherical distortion
      // We draw two copies for seamless wrapping
      const sx = -scrollX;
      const drawW = radius * 2;
      const drawH = radius * 2;
      const destX = cx - radius;
      const destY = cy - radius;

      // Draw surface texture with sphere mapping via pixel manipulation
      drawSphereTexture(cx, cy, radius, scrollX);
    }

    // Lighting: sunlit side gradient for 3D depth
    const lightAngle = -0.3;
    const lightX = cx + radius * 0.35 * Math.cos(lightAngle);
    const lightY = cy + radius * 0.35 * Math.sin(lightAngle);

    const lightGrad = ctx.createRadialGradient(
      lightX - radius * 0.3, lightY - radius * 0.3, 0,
      cx, cy, radius
    );
    lightGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
    lightGrad.addColorStop(0.4, 'rgba(255,255,255,0.03)');
    lightGrad.addColorStop(0.7, 'rgba(0,0,0,0.1)');
    lightGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = lightGrad;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    // Edge darkening (limb darkening)
    const limbGrad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
    limbGrad.addColorStop(0, 'rgba(0,0,0,0)');
    limbGrad.addColorStop(0.8, 'rgba(0,0,0,0.05)');
    limbGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = limbGrad;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    ctx.restore();

    // Atmosphere edge highlight (thin bright ring)
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${ac[0]|0},${ac[1]|0},${ac[2]|0},0.25)`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Rings in front of planet (top half)
    if (planet.hasRings) {
      drawRings(cx, cy, radius, planet, 'front');
    }

    ctx.globalAlpha = 1;
  }

  // --- Sphere-mapped texture rendering ----------------------------------------

  function drawSphereTexture(cx, cy, radius, scrollX) {
    // Use an offscreen buffer at reduced resolution for performance
    const maxDiam = 400;
    const scale = Math.min(1, maxDiam / (radius * 2));
    const size = Math.ceil(radius * 2 * scale);
    const halfSize = size / 2;

    // Reuse / resize offscreen buffer
    if (!sphereBufCanvas) {
      sphereBufCanvas = document.createElement('canvas');
      sphereBufCtx = sphereBufCanvas.getContext('2d');
    }
    if (sphereBufCanvas.width !== size || sphereBufCanvas.height !== size) {
      sphereBufCanvas.width = size;
      sphereBufCanvas.height = size;
    }

    const buf = sphereBufCtx.createImageData(size, size);
    const bd = buf.data;

    // Cache texture pixel data (only re-read when planet changes)
    if (!cachedTexData) {
      cachedTexData = texCtx.getImageData(0, 0, TEX_WIDTH, TEX_HEIGHT);
    }
    const td = cachedTexData.data;

    for (let py = 0; py < size; py++) {
      const dy = (py - halfSize) / halfSize; // -1..1
      if (Math.abs(dy) >= 1) continue;

      for (let px = 0; px < size; px++) {
        const dx = (px - halfSize) / halfSize; // -1..1
        if (dx * dx + dy * dy >= 1) continue;

        // Sphere UV mapping
        const phi = Math.asin(dy);
        const cosP = Math.cos(phi);
        const theta = (cosP > 0.001) ? Math.asin(Math.max(-1, Math.min(1, dx / cosP))) : 0;

        // Map to texture coords
        let u = (theta / Math.PI + 0.5);
        let v = (phi / Math.PI + 0.5);

        // Apply rotation scroll
        u = ((u * TEX_WIDTH + scrollX) % TEX_WIDTH + TEX_WIDTH) % TEX_WIDTH;
        v = v * TEX_HEIGHT;

        // Bilinear sample from texture
        const tx = Math.floor(u);
        const ty = Math.floor(v);
        const fx = u - tx;
        const fy = v - ty;

        const tx1 = (tx + 1) % TEX_WIDTH;
        const ty1 = Math.min(ty + 1, TEX_HEIGHT - 1);

        const i00 = (ty * TEX_WIDTH + tx) * 4;
        const i10 = (ty * TEX_WIDTH + tx1) * 4;
        const i01 = (ty1 * TEX_WIDTH + tx) * 4;
        const i11 = (ty1 * TEX_WIDTH + tx1) * 4;

        const r = td[i00]*(1-fx)*(1-fy) + td[i10]*fx*(1-fy) + td[i01]*(1-fx)*fy + td[i11]*fx*fy;
        const g = td[i00+1]*(1-fx)*(1-fy) + td[i10+1]*fx*(1-fy) + td[i01+1]*(1-fx)*fy + td[i11+1]*fx*fy;
        const b = td[i00+2]*(1-fx)*(1-fy) + td[i10+2]*fx*(1-fy) + td[i01+2]*(1-fx)*fy + td[i11+2]*fx*fy;

        const bi = (py * size + px) * 4;
        bd[bi]     = r;
        bd[bi + 1] = g;
        bd[bi + 2] = b;
        bd[bi + 3] = 255;
      }
    }

    sphereBufCtx.putImageData(buf, 0, 0);
    ctx.drawImage(sphereBufCanvas, cx - radius, cy - radius, radius * 2, radius * 2);
  }

  // --- Ring rendering ---------------------------------------------------------

  function drawRings(cx, cy, radius, p, layer) {
    ctx.save();

    const innerR = radius * p.ringInner;
    const outerR = radius * p.ringOuter;
    const tiltY = p.ringTilt;

    // Ring is an ellipse
    const ringCenterY = cy;

    ctx.beginPath();
    if (layer === 'behind') {
      // Draw only the part behind the planet
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, cy, canvas.width, canvas.height);
      // Also exclude planet circle from behind layer
      ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
      ctx.clip();
    } else {
      // Front layer: only top half
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, cy);
      ctx.clip();
    }

    // Draw ring bands
    const numBands = 40;
    for (let i = 0; i < numBands; i++) {
      const t = i / numBands;
      const r = innerR + (outerR - innerR) * t;
      const bandAlpha = p.ringOpacity * (0.3 + 0.7 * Math.sin(t * Math.PI));

      // Add some variation from noise
      const variation = Math.sin(t * 47 + p.seed) * 0.3 + 0.7;

      ctx.beginPath();
      ctx.ellipse(cx, ringCenterY, r, r * tiltY, 0, 0, Math.PI * 2);
      const rc = p.ringColor;
      ctx.strokeStyle = `rgba(${rc[0]|0},${rc[1]|0},${rc[2]|0},${bandAlpha * variation})`;
      ctx.lineWidth = (outerR - innerR) / numBands + 0.5;
      ctx.stroke();
    }

    ctx.restore();
    ctx.restore();
  }

  // --- Number formatting ------------------------------------------------------

  function formatSeed(seed) {
    return seed.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // --- UI setup ---------------------------------------------------------------

  function createUI() {
    uiOverlay = document.createElement('div');
    uiOverlay.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; display: flex; flex-direction: column;
      justify-content: space-between; font-family: 'Inter', 'SF Pro Display', -apple-system, sans-serif;
      color: #fff; z-index: 2;
    `;

    // Top section: title + stats
    const topBar = document.createElement('div');
    topBar.style.cssText = `
      padding: 40px 48px; pointer-events: none;
    `;
    topBar.innerHTML = `
      <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 3px; color: rgba(255,255,255,0.4); margin-bottom: 8px;">
        Procedural Generation
      </div>
      <div style="font-size: 28px; font-weight: 600; letter-spacing: -0.5px; margin-bottom: 16px;">
        Every World Is Unique
      </div>
      <div style="display: flex; align-items: center; gap: 32px;">
        <div style="display: flex; align-items: baseline; gap: 8px;">
          <span style="font-size: 36px; font-weight: 700; color: #7dd3fc;">~5</span>
          <span style="font-size: 14px; color: rgba(255,255,255,0.5);">developers</span>
        </div>
        <div style="font-size: 20px; color: rgba(255,255,255,0.2);">&rarr;</div>
        <div style="display: flex; align-items: baseline; gap: 8px;">
          <span style="font-size: 36px; font-weight: 700; color: #c4b5fd;">18.4 quintillion</span>
          <span style="font-size: 14px; color: rgba(255,255,255,0.5);">unique planets</span>
        </div>
      </div>
    `;
    uiOverlay.appendChild(topBar);

    // Bottom section: controls
    const bottomBar = document.createElement('div');
    bottomBar.style.cssText = `
      padding: 32px 48px 40px; pointer-events: auto;
      background: linear-gradient(transparent, rgba(0,0,0,0.5));
    `;

    // Planet counter
    const counter = document.createElement('div');
    counter.id = 'planet-counter';
    counter.style.cssText = `
      font-size: 15px; color: rgba(255,255,255,0.5); margin-bottom: 20px;
      font-variant-numeric: tabular-nums;
    `;
    counter.textContent = `Planet #1 of 18,446,744,073,709,551,616`;
    bottomBar.appendChild(counter);

    // Controls row
    const controls = document.createElement('div');
    controls.style.cssText = `
      display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    `;

    // Seed input
    const seedLabel = document.createElement('label');
    seedLabel.style.cssText = `
      font-size: 13px; color: rgba(255,255,255,0.4); display: flex; align-items: center; gap: 8px;
    `;
    seedLabel.textContent = 'Seed:';
    const seedInput = document.createElement('input');
    seedInput.type = 'text';
    seedInput.id = 'seed-input';
    seedInput.value = '1';
    seedInput.style.cssText = `
      background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px; padding: 10px 14px; color: #fff; font-size: 15px;
      width: 160px; outline: none; font-family: 'SF Mono', 'Fira Code', monospace;
      font-variant-numeric: tabular-nums; transition: border-color 0.2s;
    `;
    seedInput.addEventListener('focus', () => {
      seedInput.style.borderColor = 'rgba(255,255,255,0.35)';
    });
    seedInput.addEventListener('blur', () => {
      seedInput.style.borderColor = 'rgba(255,255,255,0.15)';
    });
    seedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = parseInt(seedInput.value, 10);
        if (!isNaN(val) && val > 0) {
          transitionToPlanet(val);
        }
      }
    });
    seedLabel.appendChild(seedInput);
    controls.appendChild(seedLabel);

    // Go button
    const goBtn = document.createElement('button');
    goBtn.textContent = 'Go';
    goBtn.style.cssText = `
      background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px; padding: 10px 20px; color: #fff; font-size: 14px;
      cursor: pointer; transition: all 0.2s; font-weight: 500;
    `;
    goBtn.addEventListener('mouseenter', () => {
      goBtn.style.background = 'rgba(255,255,255,0.18)';
    });
    goBtn.addEventListener('mouseleave', () => {
      goBtn.style.background = 'rgba(255,255,255,0.1)';
    });
    goBtn.addEventListener('click', () => {
      const val = parseInt(seedInput.value, 10);
      if (!isNaN(val) && val > 0) {
        transitionToPlanet(val);
      }
    });
    controls.appendChild(goBtn);

    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = `
      width: 1px; height: 28px; background: rgba(255,255,255,0.15); margin: 0 8px;
    `;
    controls.appendChild(divider);

    // Generate New World button
    const genBtn = document.createElement('button');
    genBtn.textContent = 'Generate New World';
    genBtn.id = 'gen-btn';
    genBtn.style.cssText = `
      background: linear-gradient(135deg, rgba(125,211,252,0.2), rgba(196,181,253,0.2));
      border: 1px solid rgba(125,211,252,0.3);
      border-radius: 8px; padding: 10px 24px; color: #fff; font-size: 14px;
      cursor: pointer; transition: all 0.3s; font-weight: 600;
      letter-spacing: 0.3px;
    `;
    genBtn.addEventListener('mouseenter', () => {
      genBtn.style.background = 'linear-gradient(135deg, rgba(125,211,252,0.35), rgba(196,181,253,0.35))';
      genBtn.style.borderColor = 'rgba(125,211,252,0.5)';
    });
    genBtn.addEventListener('mouseleave', () => {
      genBtn.style.background = 'linear-gradient(135deg, rgba(125,211,252,0.2), rgba(196,181,253,0.2))';
      genBtn.style.borderColor = 'rgba(125,211,252,0.3)';
    });
    genBtn.addEventListener('click', () => {
      const newSeed = Math.floor(Math.random() * 999999999) + 1;
      seedInput.value = newSeed;
      transitionToPlanet(newSeed);
    });
    controls.appendChild(genBtn);

    // Planet type label
    const typeLabel = document.createElement('div');
    typeLabel.id = 'planet-type';
    typeLabel.style.cssText = `
      font-size: 13px; color: rgba(255,255,255,0.35); margin-left: auto;
      text-transform: uppercase; letter-spacing: 2px;
    `;
    typeLabel.textContent = '';
    controls.appendChild(typeLabel);

    bottomBar.appendChild(controls);
    uiOverlay.appendChild(bottomBar);

    container.appendChild(uiOverlay);
  }

  function updateUI() {
    const counter = document.getElementById('planet-counter');
    if (counter) {
      counter.textContent = `Planet #${formatSeed(currentSeed)} of 18,446,744,073,709,551,616`;
    }
    const typeLabel = document.getElementById('planet-type');
    if (typeLabel && planet) {
      const ringText = planet.hasRings ? ' / Ringed' : '';
      typeLabel.textContent = `${planet.type.name}${ringText}`;
    }
  }

  // --- Transitions ------------------------------------------------------------

  function transitionToPlanet(seed) {
    if (transitioning) return;
    transitioning = true;
    pendingSeed = seed;

    // Fade out
    const fadeOut = () => {
      transitionAlpha -= 0.04;
      if (transitionAlpha <= 0) {
        transitionAlpha = 0;
        // Switch planet
        currentSeed = pendingSeed;
        planet = generatePlanet(currentSeed);
        renderSurfaceTexture(planet);
        cachedTexData = null; // invalidate texture cache
        updateUI();
        // Fade in
        fadeIn();
      } else {
        requestAnimationFrame(fadeOut);
      }
    };

    const fadeIn = () => {
      transitionAlpha += 0.04;
      if (transitionAlpha >= 1) {
        transitionAlpha = 1;
        transitioning = false;
        pendingSeed = null;
      } else {
        requestAnimationFrame(fadeIn);
      }
    };

    fadeOut();
  }

  // --- Animation loop ---------------------------------------------------------

  function animate(timestamp) {
    if (!running) return;
    time = timestamp * 0.001;
    drawScene(timestamp);
    animFrameId = requestAnimationFrame(animate);
  }

  // --- Public API -------------------------------------------------------------

  return {
    init(containerEl) {
      container = containerEl;
      container.style.position = 'relative';
      container.style.overflow = 'hidden';
      container.style.background = '#000';

      canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
      container.appendChild(canvas);
      ctx = canvas.getContext('2d');

      this.resize();
      createUI();

      // Generate first planet
      currentSeed = Math.floor(Math.random() * 999999) + 1;
      const seedInput = document.getElementById('seed-input');
      if (seedInput) seedInput.value = currentSeed;
      planet = generatePlanet(currentSeed);
      renderSurfaceTexture(planet);
      cachedTexData = null;
      updateUI();
    },

    start() {
      if (running) return;
      running = true;
      transitionAlpha = 1;
      animFrameId = requestAnimationFrame(animate);
    },

    stop() {
      running = false;
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
    },

    resize() {
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      // Use CSS pixel dimensions directly (no DPR scaling for pixel-level
      // sphere rendering — keeps the per-frame work manageable)
      canvas.width = rect.width;
      canvas.height = rect.height;
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlanetSection;
}
