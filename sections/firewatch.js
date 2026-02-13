// =============================================================================
// FIREWATCH COLOR & TONE SECTION — Procedural Layered Landscape
// Art-directable procedural color inspired by Campo Santo's Firewatch.
// Time-of-day drives the entire color palette with atmospheric perspective.
// =============================================================================

const FirewatchSection = (() => {
  // ---------------------------------------------------------------------------
  // Simplex Noise (2D)
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
    let seed = 42;
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
  let timeOfDay = 17.0; // Start at golden hour
  let temperature = 0.0; // -1 cool, +1 warm
  let saturation = 0.0;  // -1 muted, +1 vivid
  let mouseX = 0.5, mouseY = 0.5;
  let targetMouseX = 0.5, targetMouseY = 0.5;
  let animTime = 0;

  // Terrain layers (generated once, rendered each frame with new colors)
  let layers = [];
  const NUM_LAYERS = 7;

  // ---------------------------------------------------------------------------
  // Color system — time-of-day keyframes
  // ---------------------------------------------------------------------------
  // Each keyframe: { hour, sky: [h,s,l], horizon: [h,s,l], layers: [[h,s,l], ...] }
  // Layers go from farthest (index 0) to nearest (last index)
  const COLOR_KEYFRAMES = [
    { // Night (0h)
      hour: 0,
      sky: [225, 20, 6],
      horizon: [230, 15, 10],
      sun: [55, 10, 80],
      layers: [
        [230, 12, 10], [225, 14, 9], [220, 16, 8],
        [215, 18, 7], [210, 20, 6], [205, 22, 5], [200, 25, 4],
      ],
    },
    { // Pre-dawn (4h)
      hour: 4,
      sky: [225, 25, 10],
      horizon: [250, 20, 18],
      sun: [40, 50, 85],
      layers: [
        [240, 15, 14], [235, 18, 12], [230, 20, 10],
        [225, 22, 8], [220, 25, 7], [215, 28, 6], [210, 30, 5],
      ],
    },
    { // Dawn (5.5h)
      hour: 5.5,
      sky: [280, 30, 28],
      horizon: [25, 80, 55],
      sun: [40, 95, 90],
      layers: [
        [300, 25, 22], [310, 28, 20], [320, 30, 18],
        [330, 32, 15], [340, 35, 12], [350, 38, 10], [0, 40, 8],
      ],
    },
    { // Sunrise (7h)
      hour: 7,
      sky: [210, 50, 55],
      horizon: [35, 85, 60],
      sun: [45, 100, 92],
      layers: [
        [240, 30, 40], [220, 35, 35], [200, 40, 30],
        [180, 42, 25], [160, 45, 22], [140, 50, 18], [120, 55, 14],
      ],
    },
    { // Morning (9h)
      hour: 9,
      sky: [205, 60, 62],
      horizon: [195, 50, 70],
      sun: [50, 100, 95],
      layers: [
        [210, 35, 50], [195, 40, 42], [180, 45, 36],
        [165, 48, 30], [150, 52, 25], [135, 56, 20], [120, 60, 16],
      ],
    },
    { // Noon (12h)
      hour: 12,
      sky: [200, 65, 60],
      horizon: [195, 55, 68],
      sun: [55, 100, 97],
      layers: [
        [205, 40, 52], [195, 42, 44], [185, 45, 38],
        [170, 48, 32], [155, 52, 26], [140, 56, 22], [125, 60, 18],
      ],
    },
    { // Afternoon (15h)
      hour: 15,
      sky: [210, 55, 55],
      horizon: [30, 60, 58],
      sun: [40, 95, 90],
      layers: [
        [210, 35, 45], [200, 38, 38], [185, 42, 32],
        [170, 45, 26], [150, 48, 22], [135, 52, 18], [120, 55, 14],
      ],
    },
    { // Golden hour (17h)
      hour: 17,
      sky: [30, 65, 50],
      horizon: [20, 90, 55],
      sun: [30, 100, 88],
      layers: [
        [35, 40, 38], [30, 45, 32], [25, 48, 26],
        [20, 50, 22], [15, 52, 18], [10, 55, 14], [5, 58, 10],
      ],
    },
    { // Sunset (18.5h)
      hour: 18.5,
      sky: [270, 45, 30],
      horizon: [15, 85, 45],
      sun: [20, 100, 80],
      layers: [
        [280, 30, 25], [290, 32, 22], [300, 35, 18],
        [310, 38, 15], [320, 40, 12], [330, 42, 10], [340, 45, 8],
      ],
    },
    { // Dusk (20h)
      hour: 20,
      sky: [250, 30, 15],
      horizon: [270, 25, 22],
      sun: [55, 20, 70],
      layers: [
        [255, 20, 16], [250, 22, 14], [245, 24, 12],
        [240, 26, 10], [235, 28, 8], [230, 30, 7], [225, 32, 5],
      ],
    },
    { // Night (24h, wraps to 0)
      hour: 24,
      sky: [225, 20, 6],
      horizon: [230, 15, 10],
      sun: [55, 10, 80],
      layers: [
        [230, 12, 10], [225, 14, 9], [220, 16, 8],
        [215, 18, 7], [210, 20, 6], [205, 22, 5], [200, 25, 4],
      ],
    },
  ];

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

  function lerpHSL(a, b, t) {
    // Handle hue wrapping
    let dh = b[0] - a[0];
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    return [
      (a[0] + dh * t + 360) % 360,
      lerp(a[1], b[1], t),
      lerp(a[2], b[2], t),
    ];
  }

  function hslString(hsl, alphaOverride) {
    const a = alphaOverride !== undefined ? alphaOverride : 1;
    return `hsla(${hsl[0].toFixed(1)}, ${hsl[1].toFixed(1)}%, ${hsl[2].toFixed(1)}%, ${a})`;
  }

  function applyTemperatureAndSaturation(hsl) {
    let [h, s, l] = hsl;
    // Temperature shifts hue: warm = toward orange (30), cool = toward blue (220)
    h = h + temperature * 15;
    // Saturation adjustment
    s = clamp(s + saturation * 25, 0, 100);
    return [(h + 360) % 360, s, l];
  }

  // Interpolate between keyframes for a given time
  function getColorsForTime(time) {
    const hour = ((time % 24) + 24) % 24;
    let k0 = COLOR_KEYFRAMES[0], k1 = COLOR_KEYFRAMES[1];
    for (let i = 0; i < COLOR_KEYFRAMES.length - 1; i++) {
      if (hour >= COLOR_KEYFRAMES[i].hour && hour <= COLOR_KEYFRAMES[i + 1].hour) {
        k0 = COLOR_KEYFRAMES[i];
        k1 = COLOR_KEYFRAMES[i + 1];
        break;
      }
    }
    const range = k1.hour - k0.hour;
    const t = range > 0 ? (hour - k0.hour) / range : 0;
    // Smoothstep for nicer transitions
    const st = t * t * (3 - 2 * t);

    const sky = applyTemperatureAndSaturation(lerpHSL(k0.sky, k1.sky, st));
    const horizon = applyTemperatureAndSaturation(lerpHSL(k0.horizon, k1.horizon, st));
    const sun = lerpHSL(k0.sun, k1.sun, st);
    const layerColors = [];
    for (let i = 0; i < NUM_LAYERS; i++) {
      const c0 = k0.layers[Math.min(i, k0.layers.length - 1)];
      const c1 = k1.layers[Math.min(i, k1.layers.length - 1)];
      layerColors.push(applyTemperatureAndSaturation(lerpHSL(c0, c1, st)));
    }
    return { sky, horizon, sun, layerColors };
  }

  // ---------------------------------------------------------------------------
  // Terrain generation
  // ---------------------------------------------------------------------------
  function generateLayers() {
    layers = [];
    for (let i = 0; i < NUM_LAYERS; i++) {
      const depth = i / (NUM_LAYERS - 1); // 0 = farthest, 1 = nearest
      const baseY = lerp(0.25, 0.85, depth); // Vertical position
      const amplitude = lerp(0.06, 0.18, depth); // Height variation
      const frequency = lerp(0.002, 0.006, depth); // Noise frequency
      const octaves = depth < 0.5 ? 2 : 3;

      // Generate terrain profile points
      const numPoints = 200;
      const points = [];
      for (let j = 0; j <= numPoints; j++) {
        const px = j / numPoints;
        let elevation = 0;
        let amp = amplitude;
        let freq = frequency;
        for (let o = 0; o < octaves; o++) {
          elevation += SimplexNoise.noise2D(px * freq * 1000 + i * 100, i * 50 + o * 30) * amp;
          amp *= 0.5;
          freq *= 2;
        }
        // Add some larger features
        elevation += SimplexNoise.noise2D(px * 1.5 + i * 37, i * 13) * amplitude * 0.6;
        points.push({ x: px, y: baseY - elevation });
      }

      // Add trees for nearer layers
      let trees = [];
      if (depth > 0.5) {
        const numTrees = Math.floor(lerp(5, 25, (depth - 0.5) * 2));
        for (let t = 0; t < numTrees; t++) {
          const tx = Math.random();
          // Find terrain height at this x
          const idx = Math.floor(tx * numPoints);
          const terrainY = points[Math.min(idx, points.length - 1)].y;
          const treeHeight = lerp(0.02, 0.07, Math.random()) * (0.5 + depth * 0.5);
          trees.push({
            x: tx,
            baseY: terrainY,
            height: treeHeight,
            width: lerp(0.005, 0.015, Math.random()),
            type: Math.random() > 0.4 ? 'pine' : 'deciduous',
          });
        }
      }

      layers.push({ depth, points, trees, parallaxFactor: lerp(0.02, 0.12, depth) });
    }
  }

  // ---------------------------------------------------------------------------
  // Star field
  // ---------------------------------------------------------------------------
  let stars = [];
  function generateStars() {
    stars = [];
    for (let i = 0; i < 200; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random() * 0.6,
        size: 0.5 + Math.random() * 1.5,
        brightness: 0.3 + Math.random() * 0.7,
        twinkleSpeed: 1 + Math.random() * 3,
        twinklePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function drawSky(colors) {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height * dpr);
    skyGrad.addColorStop(0, hslString(colors.sky));
    skyGrad.addColorStop(0.6, hslString(lerpHSL(colors.sky, colors.horizon, 0.5)));
    skyGrad.addColorStop(1, hslString(colors.horizon));
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width * dpr, height * dpr);
  }

  function drawSunMoon(colors) {
    const hour = ((timeOfDay % 24) + 24) % 24;
    const isNight = hour < 5 || hour > 20;

    // Sun/moon position based on time
    let celestialProgress;
    if (isNight) {
      // Moon arc from 20h to 5h (next day)
      const nightHour = hour >= 20 ? hour - 20 : hour + 4;
      celestialProgress = nightHour / 9;
    } else {
      // Sun arc from 5h to 20h
      celestialProgress = (hour - 5) / 15;
    }

    const arcX = lerp(0.1, 0.9, celestialProgress) * width * dpr;
    const parallaxOffsetX = (mouseX - 0.5) * width * 0.01 * dpr;
    const arcY = (0.1 + 0.25 * Math.sin(Math.PI * celestialProgress)) * height * dpr;
    // Sun is lowest at edges, highest at midday

    const cx = arcX + parallaxOffsetX;
    // Invert: higher arc = lower y value
    const cy = lerp(0.45, 0.05, Math.sin(Math.PI * celestialProgress)) * height * dpr;

    if (isNight) {
      // Moon
      const moonRadius = 12 * dpr;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, moonRadius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(55, 10%, 85%, 0.9)`;
      ctx.fill();
      // Glow
      const glowGrad = ctx.createRadialGradient(cx, cy, moonRadius * 0.5, cx, cy, moonRadius * 6);
      glowGrad.addColorStop(0, `hsla(55, 10%, 90%, 0.15)`);
      glowGrad.addColorStop(1, `hsla(55, 10%, 90%, 0)`);
      ctx.fillStyle = glowGrad;
      ctx.fillRect(cx - moonRadius * 6, cy - moonRadius * 6, moonRadius * 12, moonRadius * 12);
      ctx.restore();
    } else {
      // Sun
      const sunBrightness = colors.sun[2];
      const sunRadius = lerp(15, 25, sunBrightness / 100) * dpr;
      ctx.save();
      // Outer glow
      const glowGrad = ctx.createRadialGradient(cx, cy, sunRadius * 0.3, cx, cy, sunRadius * 8);
      glowGrad.addColorStop(0, hslString(colors.sun, 0.4));
      glowGrad.addColorStop(0.3, hslString(colors.sun, 0.15));
      glowGrad.addColorStop(1, hslString(colors.sun, 0));
      ctx.fillStyle = glowGrad;
      ctx.fillRect(cx - sunRadius * 8, cy - sunRadius * 8, sunRadius * 16, sunRadius * 16);
      // Sun disc
      ctx.beginPath();
      ctx.arc(cx, cy, sunRadius, 0, Math.PI * 2);
      ctx.fillStyle = hslString([colors.sun[0], colors.sun[1], Math.min(colors.sun[2] + 5, 100)], 0.95);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawStars() {
    const hour = ((timeOfDay % 24) + 24) % 24;
    // Stars visible from 19h to 6h
    let starAlpha = 0;
    if (hour >= 20 || hour <= 4) {
      starAlpha = 1;
    } else if (hour > 18 && hour < 20) {
      starAlpha = (hour - 18) / 2;
    } else if (hour > 4 && hour < 6) {
      starAlpha = 1 - (hour - 4) / 2;
    }
    if (starAlpha <= 0) return;

    ctx.save();
    for (const star of stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(animTime * 0.001 * star.twinkleSpeed + star.twinklePhase);
      const alpha = starAlpha * star.brightness * twinkle;
      if (alpha < 0.05) continue;
      const sx = star.x * width * dpr;
      const sy = star.y * height * dpr;
      ctx.beginPath();
      ctx.arc(sx, sy, star.size * dpr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 250, 240, ${alpha})`;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTerrainLayer(layer, color, index) {
    const pts = layer.points;
    const px = (mouseX - 0.5) * layer.parallaxFactor * width * dpr;
    const py = (mouseY - 0.5) * layer.parallaxFactor * 0.3 * height * dpr;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-20 * dpr + px, height * dpr);

    for (let i = 0; i < pts.length; i++) {
      const x = pts[i].x * width * dpr + px;
      const y = pts[i].y * height * dpr + py;
      if (i === 0) {
        ctx.lineTo(x, y);
      } else {
        // Smooth curve through points
        const prev = pts[i - 1];
        const cpx = (prev.x * width * dpr + px + x) * 0.5;
        const cpy = (prev.y * height * dpr + py + y) * 0.5;
        ctx.quadraticCurveTo(prev.x * width * dpr + px, prev.y * height * dpr + py, cpx, cpy);
      }
    }

    ctx.lineTo((width + 20) * dpr + px, height * dpr);
    ctx.closePath();

    // Atmospheric perspective: farther layers get hazier
    const depth = layer.depth;
    const haze = (1 - depth) * 0.35;
    const colors = getColorsForTime(timeOfDay);
    const hazeColor = colors.sky;

    // Base fill
    ctx.fillStyle = hslString(color);
    ctx.fill();

    // Haze overlay
    if (haze > 0.02) {
      ctx.fillStyle = hslString(hazeColor, haze);
      ctx.fill();
    }

    // Draw trees
    if (layer.trees && layer.trees.length > 0) {
      for (const tree of layer.trees) {
        const tx = tree.x * width * dpr + px;
        const ty = tree.baseY * height * dpr + py;
        const th = tree.height * height * dpr;
        const tw = tree.width * width * dpr;

        // Slightly darker color for trees
        const treeColor = [color[0], color[1], Math.max(color[2] - 4, 0)];

        ctx.fillStyle = hslString(treeColor);
        if (tree.type === 'pine') {
          // Triangle pine tree
          ctx.beginPath();
          ctx.moveTo(tx, ty - th);
          ctx.lineTo(tx - tw * 2, ty);
          ctx.lineTo(tx + tw * 2, ty);
          ctx.closePath();
          ctx.fill();
          // Second layer
          ctx.beginPath();
          ctx.moveTo(tx, ty - th * 0.7);
          ctx.lineTo(tx - tw * 2.5, ty - th * 0.1);
          ctx.lineTo(tx + tw * 2.5, ty - th * 0.1);
          ctx.closePath();
          ctx.fill();
        } else {
          // Round deciduous tree
          ctx.beginPath();
          ctx.arc(tx, ty - th * 0.5, tw * 2.5, 0, Math.PI * 2);
          ctx.fill();
          // Trunk
          ctx.fillRect(tx - tw * 0.3, ty - th * 0.15, tw * 0.6, th * 0.15);
        }
      }
    }

    ctx.restore();
  }

  function render() {
    const colors = getColorsForTime(timeOfDay);

    // Smooth mouse
    mouseX = lerp(mouseX, targetMouseX, 0.05);
    mouseY = lerp(mouseY, targetMouseY, 0.05);

    // Draw sky
    drawSky(colors);

    // Draw stars
    drawStars();

    // Draw sun/moon
    drawSunMoon(colors);

    // Draw terrain layers back to front
    for (let i = 0; i < layers.length; i++) {
      drawTerrainLayer(layers[i], colors.layerColors[i], i);
    }

    // Subtle fog/mist at the bottom
    const fogGrad = ctx.createLinearGradient(0, height * 0.85 * dpr, 0, height * dpr);
    const fogColor = colors.layerColors[colors.layerColors.length - 1];
    fogGrad.addColorStop(0, hslString(fogColor, 0));
    fogGrad.addColorStop(1, hslString(fogColor, 0.3));
    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, height * 0.7 * dpr, width * dpr, height * 0.3 * dpr);
  }

  // ---------------------------------------------------------------------------
  // Animation loop
  // ---------------------------------------------------------------------------
  function loop() {
    if (!running) return;
    animTime += 16;
    render();
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
    overline.textContent = 'Procedural Color & Tone';
    overline.style.cssText = `
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: rgba(100,140,255,0.8);
      margin-bottom: 12px;
    `;

    const title = document.createElement('h2');
    title.textContent = 'Color and tone are the key concepts';
    title.style.cssText = `
      font-size: 28px;
      font-weight: 600;
      color: #e8e6e3;
      margin: 0 0 10px;
      line-height: 1.3;
    `;

    const desc = document.createElement('p');
    desc.textContent = 'Inspired by Firewatch \u2014 drag the time-of-day slider to see the entire landscape palette shift. Adjust temperature and saturation to art-direct the mood. Move your mouse over the scene for subtle parallax.';
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

    const canvasContainer = document.createElement('div');
    canvasContainer.style.cssText = `
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.08);
    `;

    canvas = document.createElement('canvas');
    canvas.style.cssText = `
      display: block;
      width: 100%;
      height: 450px;
      cursor: default;
    `;

    // Time display overlay
    const timeDisplay = document.createElement('div');
    timeDisplay.id = 'fw-time-display';
    timeDisplay.style.cssText = `
      position: absolute;
      top: 16px;
      right: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: rgba(255,255,255,0.6);
      background: rgba(0,0,0,0.25);
      padding: 4px 10px;
      border-radius: 4px;
      pointer-events: none;
      backdrop-filter: blur(4px);
    `;
    timeDisplay.textContent = formatTime(timeOfDay);

    canvasContainer.appendChild(canvas);
    canvasContainer.appendChild(timeDisplay);
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
      gap: 24px;
      align-items: flex-start;
      box-sizing: border-box;
    `;

    // Time of Day slider
    const timeGroup = createSlider('Time of Day', 0, 24, timeOfDay, 0.1, (v) => {
      timeOfDay = v;
      const td = container.querySelector('#fw-time-display');
      if (td) td.textContent = formatTime(v);
    }, formatTime);

    // Temperature slider
    const tempGroup = createSlider('Temperature', -1, 1, temperature, 0.01, (v) => {
      temperature = v;
    }, (v) => v < 0 ? 'Cool' : v > 0 ? 'Warm' : 'Neutral');

    // Saturation slider
    const satGroup = createSlider('Saturation', -1, 1, saturation, 0.01, (v) => {
      saturation = v;
    }, (v) => v < 0 ? 'Muted' : v > 0 ? 'Vivid' : 'Normal');

    controls.appendChild(timeGroup);
    controls.appendChild(tempGroup);
    controls.appendChild(satGroup);
    canvasWrap.appendChild(controls);

    // Mouse parallax events
    canvasContainer.addEventListener('mousemove', (e) => {
      const rect = canvasContainer.getBoundingClientRect();
      targetMouseX = (e.clientX - rect.left) / rect.width;
      targetMouseY = (e.clientY - rect.top) / rect.height;
    });
    canvasContainer.addEventListener('mouseleave', () => {
      targetMouseX = 0.5;
      targetMouseY = 0.5;
    });
  }

  function formatTime(v) {
    const hours = Math.floor(v) % 24;
    const mins = Math.floor((v % 1) * 60);
    const period = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${h12}:${mins.toString().padStart(2, '0')} ${period}`;
  }

  function createSlider(labelText, min, max, value, step, onChange, displayFn) {
    const group = document.createElement('div');
    group.style.cssText = 'display: flex; flex-direction: column; gap: 6px; min-width: 180px; flex: 1;';

    const labelRow = document.createElement('div');
    labelRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

    const label = document.createElement('label');
    label.textContent = labelText;
    label.style.cssText = `
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: rgba(232,230,227,0.45);
    `;

    const valDisplay = document.createElement('span');
    valDisplay.textContent = displayFn ? displayFn(value) : value.toFixed(2);
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

    const styleId = 'fw-slider-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .fw-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px;
          border-radius: 50%;
          background: rgba(100,140,255,0.9);
          cursor: pointer;
          border: none;
        }
        .fw-slider::-moz-range-thumb {
          width: 14px; height: 14px;
          border-radius: 50%;
          background: rgba(100,140,255,0.9);
          cursor: pointer;
          border: none;
        }
      `;
      document.head.appendChild(style);
    }
    slider.className = 'fw-slider';

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      valDisplay.textContent = displayFn ? displayFn(v) : v.toFixed(2);
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
    height = 450;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    init(containerEl) {
      buildDOM(containerEl);
      sizeCanvas();
      ctx = canvas.getContext('2d');
      generateLayers();
      generateStars();
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
      if (!canvas) return;
      sizeCanvas();
      generateLayers();
      generateStars();
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FirewatchSection;
