// =============================================================================
// SEMANTIC LIGHTING SECTION — Intent-Driven Scene Illumination
// Control lights & shadows through semantic parameters (time, weather, drama,
// season) instead of raw coordinates. Inspired by Autodesk Flame / Promethean AI.
// =============================================================================

const SemanticLightingSection = (() => {
  // ---- State ----
  let container, canvas, ctx;
  let running = false, animFrameId = null;
  let dpr = 1, W = 0, H = 0;
  let time = 0; // animation time

  // ---- Semantic Controls ----
  let timeOfDay = 10;      // 0-24
  let weather = 'Clear';   // Clear | Cloudy | Stormy
  let drama = 0.3;         // 0-1
  let season = 'Summer';   // Spring | Summer | Fall | Winter

  // ---- Show direct controls toggle ----
  let showDirect = false;
  let directPanel = null;

  // ---- Lightning flash ----
  let lightningTimer = 0;
  let lightningFlash = 0;

  // ---- Rain drops (for stormy weather) ----
  const raindrops = [];
  const MAX_RAIN = 300;

  // ---- DOM refs ----
  let timeSlider = null, dramaSlider = null;
  let timeLabel = null, dramaLabel = null;
  let weatherBtns = {}, seasonBtns = {};

  // ---- Helpers ----
  function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function rgbStr(r, g, b, a) {
    if (a !== undefined) return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  }

  function lerpColor(c1, c2, t) {
    return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
  }

  // ---- DOM helper ----
  function el(tag, styles, parent) {
    const e = document.createElement(tag);
    if (styles) Object.assign(e.style, styles);
    if (parent) parent.appendChild(e);
    return e;
  }

  // ==========================================================================
  //  SKY PRESETS — interpolated by time + weather
  // ==========================================================================
  // Each key is an hour, value is [top color, mid color, bottom/horizon color]
  const SKY_PRESETS = {
    0:  [[8, 10, 25],   [12, 15, 35],   [15, 18, 45]],     // midnight
    5:  [[15, 15, 40],  [40, 30, 60],   [80, 50, 70]],     // pre-dawn
    6:  [[60, 40, 70],  [180, 100, 80], [240, 150, 90]],   // dawn
    8:  [[80, 140, 220],[130, 180, 240],[200, 210, 230]],   // morning
    12: [[60, 130, 230],[100, 170, 245],[180, 210, 250]],   // noon
    17: [[60, 120, 200],[180, 140, 100],[240, 160, 80]],    // late afternoon
    19: [[40, 40, 80],  [180, 80, 60],  [240, 120, 60]],   // sunset
    20: [[20, 20, 50],  [40, 30, 60],   [80, 50, 70]],     // dusk
    22: [[10, 12, 30],  [15, 15, 40],   [20, 20, 50]],     // night
    24: [[8, 10, 25],   [12, 15, 35],   [15, 18, 45]],     // midnight wrap
  };

  function getSkyColors(hour) {
    const keys = Object.keys(SKY_PRESETS).map(Number).sort((a, b) => a - b);
    let lo = keys[0], hi = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (hour >= keys[i] && hour <= keys[i + 1]) {
        lo = keys[i]; hi = keys[i + 1]; break;
      }
    }
    const t = hi === lo ? 0 : (hour - lo) / (hi - lo);
    const pLo = SKY_PRESETS[lo], pHi = SKY_PRESETS[hi];
    return [
      lerpColor(pLo[0], pHi[0], t),
      lerpColor(pLo[1], pHi[1], t),
      lerpColor(pLo[2], pHi[2], t),
    ];
  }

  // ==========================================================================
  //  SUN / MOON POSITION
  // ==========================================================================
  function getSunPos(hour, w, h) {
    // Sun moves in a semicircle arc from left to right, 6am=left, 12=top, 18=right
    // Below horizon at night
    const groundY = h * 0.72;
    const dayFrac = (hour - 6) / 12; // 0 at 6am, 1 at 6pm
    const angle = Math.PI * (1 - dayFrac); // pi to 0
    const cx = w * 0.5;
    const radiusX = w * 0.45;
    const radiusY = groundY * 0.75;
    const x = cx + Math.cos(angle) * radiusX;
    const y = groundY - Math.sin(angle) * radiusY;
    return { x, y, aboveHorizon: hour >= 5.5 && hour <= 18.5 };
  }

  function getMoonPos(hour, w, h) {
    const groundY = h * 0.72;
    // Moon arc: rises at 19, peaks at 0/24, sets at 5
    let moonHour = hour < 12 ? hour + 24 : hour;
    const frac = (moonHour - 19) / 10;
    const angle = Math.PI * (1 - frac);
    const cx = w * 0.5;
    const x = cx + Math.cos(angle) * w * 0.4;
    const y = groundY - Math.sin(angle) * groundY * 0.6;
    return { x, y, visible: hour >= 19 || hour <= 5 };
  }

  // ==========================================================================
  //  AMBIENT & SHADOW CALCULATIONS
  // ==========================================================================
  function getAmbientLevel(hour, weatherType) {
    // Base ambient from time of day
    let ambient;
    if (hour >= 7 && hour <= 17) {
      ambient = 0.9;
    } else if (hour >= 5 && hour < 7) {
      ambient = lerp(0.15, 0.9, (hour - 5) / 2);
    } else if (hour > 17 && hour <= 19.5) {
      ambient = lerp(0.9, 0.15, (hour - 17) / 2.5);
    } else {
      ambient = 0.15;
    }

    // Weather modifier
    if (weatherType === 'Cloudy') ambient *= 0.7;
    if (weatherType === 'Stormy') ambient *= 0.45;

    return clamp(ambient, 0.05, 1.0);
  }

  function getShadowAngle(sunX, sunY, objX, groundY) {
    const dx = objX - sunX;
    const dy = groundY - sunY;
    return Math.atan2(dy, dx);
  }

  function getShadowStretch(sunY, groundY) {
    const alt = (groundY - sunY) / groundY;
    if (alt <= 0) return 5; // sun at or below horizon
    return clamp(1 / alt, 0.5, 5);
  }

  // ==========================================================================
  //  BUILD DOM
  // ==========================================================================
  function buildDOM(root) {
    container = root;
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.background = '#06080f';
    container.style.width = '100%';
    container.style.minHeight = '100vh';
    container.style.fontFamily = "'Inter', system-ui, -apple-system, sans-serif";
    container.style.color = '#e0e0e0';

    // Header
    const header = el('div', {
      maxWidth: '900px', margin: '0 auto', padding: '60px 24px 20px',
      textAlign: 'center',
    }, container);

    const overline = el('div', {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase',
      color: 'rgba(100,140,255,0.8)', marginBottom: '12px',
    }, header);
    overline.textContent = 'Semantic Lighting';

    const h2 = el('h2', {
      fontSize: '32px', fontWeight: '700', lineHeight: '1.2',
      margin: '0 0 12px', color: '#ffffff',
    }, header);
    h2.textContent = 'Teaching Machines About Lights & Shadows';

    const desc = el('p', {
      fontSize: '15px', lineHeight: '1.6', color: 'rgba(255,255,255,0.55)',
      maxWidth: '640px', margin: '0 auto 0',
    }, header);
    desc.textContent = 'Describe intent, not coordinates. Adjust time, weather, drama, and season — the system computes sun position, shadow angles, sky gradients, and atmospheric effects. Inspired by Autodesk Flame and Promethean AI.';

    // Controls panel
    const controls = el('div', {
      maxWidth: '900px', margin: '20px auto 12px', padding: '0 24px',
      display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start',
      justifyContent: 'center',
    }, container);

    // -- Time of Day slider --
    const timeGroup = buildControlGroup(controls, 'Time of Day');
    const timeRow = el('div', { display: 'flex', alignItems: 'center', gap: '10px' }, timeGroup);
    timeSlider = buildSlider(timeRow, 0, 24, timeOfDay, 0.1, (v) => {
      timeOfDay = parseFloat(v);
      updateLabels();
    });
    timeLabel = el('span', {
      fontFamily: "'JetBrains Mono', monospace", fontSize: '12px',
      color: 'rgba(100,140,255,0.9)', minWidth: '48px',
    }, timeRow);

    // -- Weather buttons --
    const weatherGroup = buildControlGroup(controls, 'Weather');
    const weatherRow = el('div', { display: 'flex', gap: '6px' }, weatherGroup);
    ['Clear', 'Cloudy', 'Stormy'].forEach(w => {
      weatherBtns[w] = buildToggleBtn(weatherRow, w, weather === w, () => {
        weather = w;
        updateButtonStates();
      });
    });

    // -- Drama slider --
    const dramaGroup = buildControlGroup(controls, 'Drama');
    const dramaRow = el('div', { display: 'flex', alignItems: 'center', gap: '10px' }, dramaGroup);
    dramaSlider = buildSlider(dramaRow, 0, 1, drama, 0.01, (v) => {
      drama = parseFloat(v);
      updateLabels();
    });
    dramaLabel = el('span', {
      fontFamily: "'JetBrains Mono', monospace", fontSize: '12px',
      color: 'rgba(100,140,255,0.9)', minWidth: '36px',
    }, dramaRow);

    // -- Season buttons --
    const seasonGroup = buildControlGroup(controls, 'Season');
    const seasonRow = el('div', { display: 'flex', gap: '6px' }, seasonGroup);
    ['Spring', 'Summer', 'Fall', 'Winter'].forEach(s => {
      seasonBtns[s] = buildToggleBtn(seasonRow, s, season === s, () => {
        season = s;
        updateButtonStates();
      });
    });

    // -- Show Direct Controls toggle --
    const directGroup = el('div', {
      display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px',
    }, controls);
    const directToggle = el('button', {
      padding: '5px 12px', border: '1px solid rgba(100,140,255,0.3)',
      borderRadius: '6px', background: 'transparent',
      color: 'rgba(100,140,255,0.8)', cursor: 'pointer', fontSize: '11px',
      fontFamily: "'JetBrains Mono', monospace", transition: 'all 0.2s',
    }, directGroup);
    directToggle.textContent = 'Show Direct Controls';
    directToggle.addEventListener('click', () => {
      showDirect = !showDirect;
      directToggle.textContent = showDirect ? 'Hide Direct Controls' : 'Show Direct Controls';
      directToggle.style.background = showDirect ? 'rgba(100,140,255,0.12)' : 'transparent';
      directPanel.style.display = showDirect ? 'flex' : 'none';
    });

    // Direct controls panel
    directPanel = el('div', {
      maxWidth: '900px', margin: '0 auto 8px', padding: '8px 24px',
      display: 'none', flexWrap: 'wrap', gap: '16px',
      justifyContent: 'center',
      background: 'rgba(100,140,255,0.04)',
      borderRadius: '8px', border: '1px solid rgba(100,140,255,0.1)',
    }, container);
    directPanel._values = {};
    ['Sun X', 'Sun Y', 'Shadow Angle', 'Ambient Level'].forEach(k => {
      const item = el('div', {
        fontFamily: "'JetBrains Mono', monospace", fontSize: '11px',
        color: 'rgba(255,255,255,0.55)', display: 'flex', gap: '6px', alignItems: 'center',
      }, directPanel);
      const lbl = document.createTextNode(k + ': ');
      item.appendChild(lbl);
      const val = el('span', { color: 'rgba(100,140,255,0.9)' }, item);
      directPanel._values[k] = val;
    });

    // Canvas
    const canvasWrap = el('div', {
      maxWidth: '1100px', margin: '0 auto', padding: '0 24px 60px',
    }, container);

    canvas = el('canvas', {
      width: '100%', display: 'block', borderRadius: '10px',
      border: '1px solid rgba(255,255,255,0.06)',
    }, canvasWrap);
    ctx = canvas.getContext('2d');

    updateLabels();
    updateButtonStates();
  }

  function buildControlGroup(parent, label) {
    const group = el('div', { display: 'flex', flexDirection: 'column', gap: '4px' }, parent);
    const lbl = el('div', {
      fontFamily: "'JetBrains Mono', monospace", fontSize: '10px',
      letterSpacing: '2px', textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.55)',
    }, group);
    lbl.textContent = label;
    return group;
  }

  function buildSlider(parent, min, max, value, step, onChange) {
    const slider = el('input', {
      width: '140px', cursor: 'pointer', accentColor: 'rgba(100,140,255,0.8)',
    }, parent);
    slider.type = 'range';
    slider.min = min; slider.max = max; slider.step = step; slider.value = value;
    slider.addEventListener('input', () => onChange(slider.value));
    return slider;
  }

  function buildToggleBtn(parent, label, active, onClick) {
    const btn = el('button', {
      padding: '5px 12px', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '5px',
      background: active ? 'rgba(100,140,255,0.15)' : 'rgba(255,255,255,0.04)',
      color: active ? 'rgba(100,140,255,0.9)' : 'rgba(255,255,255,0.55)',
      cursor: 'pointer', fontSize: '12px',
      fontFamily: "'Inter', sans-serif", transition: 'all 0.2s',
    }, parent);
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function updateButtonStates() {
    Object.keys(weatherBtns).forEach(k => {
      const active = weather === k;
      weatherBtns[k].style.background = active ? 'rgba(100,140,255,0.15)' : 'rgba(255,255,255,0.04)';
      weatherBtns[k].style.color = active ? 'rgba(100,140,255,0.9)' : 'rgba(255,255,255,0.5)';
      weatherBtns[k].style.borderColor = active ? 'rgba(100,140,255,0.4)' : 'rgba(255,255,255,0.12)';
    });
    Object.keys(seasonBtns).forEach(k => {
      const active = season === k;
      seasonBtns[k].style.background = active ? 'rgba(100,140,255,0.15)' : 'rgba(255,255,255,0.04)';
      seasonBtns[k].style.color = active ? 'rgba(100,140,255,0.9)' : 'rgba(255,255,255,0.5)';
      seasonBtns[k].style.borderColor = active ? 'rgba(100,140,255,0.4)' : 'rgba(255,255,255,0.12)';
    });
  }

  function updateLabels() {
    const h = Math.floor(timeOfDay);
    const m = Math.round((timeOfDay - h) * 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    timeLabel.textContent = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    dramaLabel.textContent = drama.toFixed(2);
  }

  // ==========================================================================
  //  SIZING
  // ==========================================================================
  function sizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const parent = canvas.parentElement;
    const w = parent.clientWidth || 800;
    const h = Math.round(w * 0.5);
    W = w; H = h;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ==========================================================================
  //  SCENE DRAWING
  // ==========================================================================
  function drawScene(dt) {
    const w = W, h = H;
    if (w === 0 || h === 0) return;
    const groundY = h * 0.72;

    time += dt;

    // ---- Computed values ----
    const sun = getSunPos(timeOfDay, w, h);
    const moon = getMoonPos(timeOfDay, w, h);
    const ambient = getAmbientLevel(timeOfDay, weather);
    const isNight = timeOfDay >= 19 || timeOfDay <= 5.5;
    const shadowAngle = sun.aboveHorizon ? getShadowAngle(sun.x, sun.y, w * 0.5, groundY) : 0;

    // Update direct controls panel
    if (showDirect && directPanel._values) {
      directPanel._values['Sun X'].textContent = Math.round(sun.x);
      directPanel._values['Sun Y'].textContent = Math.round(sun.y);
      directPanel._values['Shadow Angle'].textContent = (shadowAngle * 180 / Math.PI).toFixed(1) + '\u00B0';
      directPanel._values['Ambient Level'].textContent = ambient.toFixed(2);
    }

    ctx.clearRect(0, 0, w, h);

    // ================================================================
    //  SKY
    // ================================================================
    const skyColors = getSkyColors(timeOfDay);
    // Weather tint
    if (weather === 'Cloudy') {
      skyColors[0] = lerpColor(skyColors[0], [120, 120, 130], 0.4);
      skyColors[1] = lerpColor(skyColors[1], [140, 140, 145], 0.35);
      skyColors[2] = lerpColor(skyColors[2], [160, 160, 160], 0.3);
    } else if (weather === 'Stormy') {
      skyColors[0] = lerpColor(skyColors[0], [30, 30, 45], 0.7);
      skyColors[1] = lerpColor(skyColors[1], [50, 50, 60], 0.65);
      skyColors[2] = lerpColor(skyColors[2], [60, 55, 65], 0.6);
    }

    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    skyGrad.addColorStop(0, rgbStr(...skyColors[0]));
    skyGrad.addColorStop(0.5, rgbStr(...skyColors[1]));
    skyGrad.addColorStop(1, rgbStr(...skyColors[2]));
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, groundY);

    // Lightning flash overlay
    if (weather === 'Stormy') {
      lightningTimer -= dt;
      if (lightningTimer <= 0) {
        lightningTimer = 3 + Math.random() * 5;
        lightningFlash = 0.7 + Math.random() * 0.3;
      }
      if (lightningFlash > 0) {
        ctx.fillStyle = `rgba(200,210,255,${lightningFlash * 0.35})`;
        ctx.fillRect(0, 0, w, h);
        lightningFlash *= 0.85;
        if (lightningFlash < 0.01) lightningFlash = 0;
      }
    }

    // ================================================================
    //  SUN / MOON
    // ================================================================
    if (sun.aboveHorizon && sun.y < groundY + 20) {
      // Sun glow
      const glowR = 60 + drama * 40;
      const sunGlow = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, glowR);
      const sunBright = weather === 'Clear' ? 1.0 : weather === 'Cloudy' ? 0.5 : 0.3;
      sunGlow.addColorStop(0, `rgba(255,240,200,${sunBright})`);
      sunGlow.addColorStop(0.3, `rgba(255,200,100,${sunBright * 0.5})`);
      sunGlow.addColorStop(1, 'rgba(255,200,100,0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Sun disc
      ctx.fillStyle = `rgba(255,240,210,${sunBright})`;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    if (moon.visible) {
      // Moon
      ctx.fillStyle = 'rgba(220,225,240,0.85)';
      ctx.beginPath();
      ctx.arc(moon.x, moon.y, 12, 0, Math.PI * 2);
      ctx.fill();

      // Moon glow
      const moonGlow = ctx.createRadialGradient(moon.x, moon.y, 8, moon.x, moon.y, 50);
      moonGlow.addColorStop(0, 'rgba(180,190,220,0.15)');
      moonGlow.addColorStop(1, 'rgba(180,190,220,0)');
      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(moon.x, moon.y, 50, 0, Math.PI * 2);
      ctx.fill();

      // Stars at night
      if (isNight) {
        const starSeed = 12345;
        let ss = starSeed;
        const sRng = () => { ss ^= ss << 13; ss ^= ss >> 17; ss ^= ss << 5; return ((ss < 0 ? ~ss + 1 : ss) % 10000) / 10000; };
        const cloudDim = weather === 'Clear' ? 1 : weather === 'Cloudy' ? 0.3 : 0.1;
        for (let i = 0; i < 80; i++) {
          const sx = sRng() * w;
          const sy = sRng() * groundY * 0.8;
          const sb = (0.3 + sRng() * 0.7) * cloudDim;
          const twinkle = 0.7 + 0.3 * Math.sin(time * 2 + i * 0.7);
          ctx.fillStyle = `rgba(255,255,255,${sb * twinkle})`;
          ctx.beginPath();
          ctx.arc(sx, sy, 0.8 + sRng(), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ================================================================
    //  CLOUDS (weather overlay)
    // ================================================================
    if (weather !== 'Clear') {
      const cloudAlpha = weather === 'Cloudy' ? 0.35 : 0.55;
      const cloudColor = weather === 'Stormy' ? [50, 50, 60] : [180, 180, 190];
      for (let i = 0; i < 6; i++) {
        const cx = w * (0.1 + i * 0.16) + Math.sin(time * 0.1 + i) * 15;
        const cy = h * 0.08 + i * 12 + Math.cos(time * 0.07 + i * 2) * 5;
        const cw = 80 + i * 20;
        const ch = 25 + i * 5;
        ctx.fillStyle = rgbStr(...cloudColor, cloudAlpha);
        ctx.beginPath();
        ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2);
        ctx.fill();
        // Sub-puffs
        for (let j = 0; j < 3; j++) {
          ctx.beginPath();
          ctx.ellipse(cx + (j - 1) * cw * 0.5, cy - ch * 0.3, cw * 0.4, ch * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ================================================================
    //  GOD RAYS (when drama > 0.5 and sun is visible)
    // ================================================================
    if (drama > 0.5 && sun.aboveHorizon && sun.y < groundY && weather === 'Clear') {
      const rayIntensity = (drama - 0.5) * 2; // 0 to 1
      const numRays = 7;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < numRays; i++) {
        const angle = -Math.PI * 0.3 + (i / (numRays - 1)) * Math.PI * 0.6;
        const rayLen = h * 0.9;
        const spread = 0.04 + i * 0.01;

        const x1 = sun.x + Math.cos(angle - spread) * rayLen;
        const y1 = sun.y + Math.sin(angle - spread) * rayLen;
        const x2 = sun.x + Math.cos(angle + spread) * rayLen;
        const y2 = sun.y + Math.sin(angle + spread) * rayLen;

        const grad = ctx.createLinearGradient(sun.x, sun.y, sun.x + Math.cos(angle) * rayLen, sun.y + Math.sin(angle) * rayLen);
        grad.addColorStop(0, `rgba(255,230,170,${0.12 * rayIntensity})`);
        grad.addColorStop(0.5, `rgba(255,220,150,${0.06 * rayIntensity})`);
        grad.addColorStop(1, 'rgba(255,220,150,0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(sun.x, sun.y);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // ================================================================
    //  BACKGROUND MOUNTAINS (silhouettes)
    // ================================================================
    const mtColor = lerpColor([40, 45, 60], [25, 28, 40], isNight ? 1 : 0);
    const mtAmbient = lerpColor(mtColor, [80, 85, 100], ambient * 0.3);

    // Far mountains
    ctx.fillStyle = rgbStr(...lerpColor(mtAmbient, [50, 55, 75], 0.3));
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.bezierCurveTo(w * 0.1, groundY - h * 0.22, w * 0.2, groundY - h * 0.32, w * 0.3, groundY - h * 0.18);
    ctx.bezierCurveTo(w * 0.4, groundY - h * 0.08, w * 0.45, groundY - h * 0.28, w * 0.55, groundY - h * 0.35);
    ctx.bezierCurveTo(w * 0.65, groundY - h * 0.42, w * 0.72, groundY - h * 0.25, w * 0.8, groundY - h * 0.2);
    ctx.bezierCurveTo(w * 0.88, groundY - h * 0.15, w * 0.95, groundY - h * 0.22, w, groundY - h * 0.12);
    ctx.lineTo(w, groundY);
    ctx.closePath();
    ctx.fill();

    // Near mountains
    ctx.fillStyle = rgbStr(...mtAmbient);
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.bezierCurveTo(w * 0.08, groundY - h * 0.1, w * 0.15, groundY - h * 0.2, w * 0.25, groundY - h * 0.14);
    ctx.bezierCurveTo(w * 0.35, groundY - h * 0.06, w * 0.42, groundY - h * 0.15, w * 0.5, groundY - h * 0.22);
    ctx.bezierCurveTo(w * 0.58, groundY - h * 0.28, w * 0.68, groundY - h * 0.12, w * 0.78, groundY - h * 0.16);
    ctx.bezierCurveTo(w * 0.88, groundY - h * 0.2, w * 0.95, groundY - h * 0.08, w, groundY - h * 0.05);
    ctx.lineTo(w, groundY);
    ctx.closePath();
    ctx.fill();

    // ================================================================
    //  GROUND PLANE
    // ================================================================
    const groundColors = {
      Spring: [[80, 140, 60], [60, 110, 45]],
      Summer: [[55, 120, 40], [45, 95, 30]],
      Fall:   [[130, 100, 50], [100, 75, 35]],
      Winter: [[180, 185, 195], [150, 155, 165]],
    };
    const gc = groundColors[season] || groundColors.Summer;
    const gcLit = lerpColor(gc[0], [30, 30, 35], 1 - ambient);
    const gcDark = lerpColor(gc[1], [20, 20, 25], 1 - ambient);

    const groundGrad = ctx.createLinearGradient(0, groundY, 0, h);
    groundGrad.addColorStop(0, rgbStr(...gcLit));
    groundGrad.addColorStop(1, rgbStr(...gcDark));
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, groundY, w, h - groundY);

    // ================================================================
    //  SHADOWS (before objects so they render under them)
    // ================================================================
    if (sun.aboveHorizon && weather === 'Clear') {
      const stretch = getShadowStretch(sun.y, groundY);
      const shadowAlpha = clamp(0.25 + drama * 0.35, 0, 0.6) * ambient;
      const shadowDir = sun.x < w * 0.5 ? 1 : -1;
      const shadowLen = stretch * 40;

      ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;

      // House shadow
      const houseX = w * 0.55, houseW2 = 50, houseBot = groundY;
      ctx.beginPath();
      ctx.moveTo(houseX - houseW2, houseBot);
      ctx.lineTo(houseX + houseW2, houseBot);
      ctx.lineTo(houseX + houseW2 + shadowDir * shadowLen, houseBot + 8);
      ctx.lineTo(houseX - houseW2 + shadowDir * shadowLen, houseBot + 8);
      ctx.closePath();
      ctx.fill();

      // Tree shadow
      const treeX = w * 0.28;
      ctx.beginPath();
      ctx.moveTo(treeX - 6, houseBot);
      ctx.lineTo(treeX + 6, houseBot);
      ctx.lineTo(treeX + 6 + shadowDir * shadowLen * 1.2, houseBot + 6);
      ctx.lineTo(treeX - 6 + shadowDir * shadowLen * 1.2, houseBot + 6);
      ctx.closePath();
      ctx.fill();

      // Canopy shadow (larger, softer ellipse)
      ctx.fillStyle = `rgba(0,0,0,${shadowAlpha * 0.6})`;
      ctx.beginPath();
      ctx.ellipse(treeX + shadowDir * shadowLen * 0.8, houseBot + 4, 35, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (weather === 'Cloudy') {
      // Soft ambient shadow (very faint)
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      const houseX = w * 0.55;
      ctx.beginPath();
      ctx.ellipse(houseX, groundY + 4, 55, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ================================================================
    //  TREE
    // ================================================================
    const treeX = w * 0.28;
    const trunkH = 55;
    const trunkW = 10;

    // Trunk
    const trunkColor = lerpColor([80, 55, 30], [40, 28, 15], 1 - ambient);
    ctx.fillStyle = rgbStr(...trunkColor);
    ctx.fillRect(treeX - trunkW / 2, groundY - trunkH, trunkW, trunkH);

    // Canopy
    const canopyColors = {
      Spring: [220, 160, 180],  // cherry blossom pink
      Summer: [50, 130, 50],
      Fall:   [200, 120, 40],
      Winter: null, // bare
    };
    const canopyR = 35;
    const canopyCenter = groundY - trunkH - canopyR * 0.6;
    const canopyCol = canopyColors[season];

    if (canopyCol) {
      const litCanopy = lerpColor(canopyCol, [20, 20, 20], 1 - ambient);
      ctx.fillStyle = rgbStr(...litCanopy);
      // Main canopy circle
      ctx.beginPath();
      ctx.arc(treeX, canopyCenter, canopyR, 0, Math.PI * 2);
      ctx.fill();
      // Sub-circles for organic shape
      ctx.beginPath();
      ctx.arc(treeX - 20, canopyCenter + 5, canopyR * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(treeX + 18, canopyCenter + 3, canopyR * 0.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(treeX - 5, canopyCenter - 18, canopyR * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Winter: bare branches
      ctx.strokeStyle = rgbStr(...trunkColor);
      ctx.lineWidth = 2.5;
      const drawBranch = (x, y, angle, len, depth) => {
        if (depth > 4 || len < 4) return;
        const ex = x + Math.cos(angle) * len;
        const ey = y + Math.sin(angle) * len;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        drawBranch(ex, ey, angle - 0.4 - depth * 0.1, len * 0.7, depth + 1);
        drawBranch(ex, ey, angle + 0.35 + depth * 0.08, len * 0.65, depth + 1);
      };
      drawBranch(treeX, groundY - trunkH, -Math.PI / 2 - 0.3, 25, 0);
      drawBranch(treeX, groundY - trunkH, -Math.PI / 2 + 0.25, 22, 0);
      drawBranch(treeX, groundY - trunkH + 15, -Math.PI / 2 - 0.5, 18, 1);
    }

    // ================================================================
    //  HOUSE
    // ================================================================
    const houseX = w * 0.55;
    const houseW2 = 50, houseH = 55;
    const roofH = 35;
    const houseBot = groundY;
    const houseTop = houseBot - houseH;
    const roofPeak = houseTop - roofH;

    // Determine lit side
    const houseLitSide = sun.aboveHorizon ? (sun.x < houseX ? 'left' : 'right') : 'none';

    // Walls
    const wallBase = lerpColor([160, 145, 130], [60, 55, 50], 1 - ambient);
    const wallLit = lerpColor(wallBase, [200, 190, 170], 0.2 * ambient);
    const wallShade = lerpColor(wallBase, [40, 35, 30], 0.3 * (1 - ambient));

    // Left wall
    ctx.fillStyle = rgbStr(...(houseLitSide === 'left' ? wallLit : wallShade));
    ctx.fillRect(houseX - houseW2, houseTop, houseW2, houseH);
    // Right wall
    ctx.fillStyle = rgbStr(...(houseLitSide === 'right' ? wallLit : wallShade));
    ctx.fillRect(houseX, houseTop, houseW2, houseH);

    // Roof
    const roofColor = lerpColor([120, 50, 40], [50, 20, 15], 1 - ambient);
    ctx.fillStyle = rgbStr(...roofColor);
    ctx.beginPath();
    ctx.moveTo(houseX - houseW2 - 10, houseTop);
    ctx.lineTo(houseX, roofPeak);
    ctx.lineTo(houseX + houseW2 + 10, houseTop);
    ctx.closePath();
    ctx.fill();

    // Door
    ctx.fillStyle = rgbStr(...lerpColor([70, 45, 25], [30, 20, 10], 1 - ambient));
    const doorW = 16, doorH = 28;
    ctx.fillRect(houseX - doorW / 2, houseBot - doorH, doorW, doorH);

    // Doorknob
    ctx.fillStyle = 'rgba(200,180,100,0.6)';
    ctx.beginPath();
    ctx.arc(houseX + doorW / 2 - 4, houseBot - doorH / 2, 2, 0, Math.PI * 2);
    ctx.fill();

    // Windows
    const winSize = 14;
    const windowPositions = [
      [houseX - houseW2 + 16, houseTop + 15],
      [houseX + houseW2 - 16 - winSize, houseTop + 15],
    ];

    const windowGlowOn = isNight;
    windowPositions.forEach(([wx, wy]) => {
      if (windowGlowOn) {
        // Warm glow
        const glow = ctx.createRadialGradient(wx + winSize / 2, wy + winSize / 2, 2, wx + winSize / 2, wy + winSize / 2, 35);
        glow.addColorStop(0, 'rgba(255,200,80,0.25)');
        glow.addColorStop(1, 'rgba(255,200,80,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(wx + winSize / 2, wy + winSize / 2, 35, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,210,100,0.9)';
      } else {
        ctx.fillStyle = rgbStr(...lerpColor([140, 180, 220], [60, 80, 100], 1 - ambient));
      }
      ctx.fillRect(wx, wy, winSize, winSize);

      // Window frame
      ctx.strokeStyle = rgbStr(...lerpColor([90, 70, 50], [40, 30, 20], 1 - ambient));
      ctx.lineWidth = 1.5;
      ctx.strokeRect(wx, wy, winSize, winSize);
      // Cross panes
      ctx.beginPath();
      ctx.moveTo(wx + winSize / 2, wy);
      ctx.lineTo(wx + winSize / 2, wy + winSize);
      ctx.moveTo(wx, wy + winSize / 2);
      ctx.lineTo(wx + winSize, wy + winSize / 2);
      ctx.stroke();
    });

    // ================================================================
    //  RAIN (stormy weather)
    // ================================================================
    if (weather === 'Stormy') {
      // Manage raindrops
      while (raindrops.length < MAX_RAIN) {
        raindrops.push({
          x: Math.random() * w * 1.2 - w * 0.1,
          y: Math.random() * h * -0.3,
          speed: 4 + Math.random() * 4,
          len: 8 + Math.random() * 12,
        });
      }
      ctx.strokeStyle = 'rgba(150,170,200,0.35)';
      ctx.lineWidth = 1;
      for (const drop of raindrops) {
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - 2, drop.y + drop.len);
        ctx.stroke();
        drop.y += drop.speed;
        drop.x -= 0.5;
        if (drop.y > h) {
          drop.y = -drop.len - Math.random() * h * 0.3;
          drop.x = Math.random() * w * 1.2 - w * 0.1;
        }
      }
    } else {
      raindrops.length = 0;
    }

    // ================================================================
    //  VIGNETTE (drama)
    // ================================================================
    if (drama > 0.3) {
      const vi = (drama - 0.3) / 0.7; // 0-1
      const vignette = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.25, w * 0.5, h * 0.5, w * 0.7);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, `rgba(0,0,0,${vi * 0.5})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
    }

    // ================================================================
    //  AMBIENT DARKNESS OVERLAY
    // ================================================================
    if (ambient < 0.8) {
      ctx.fillStyle = `rgba(5,5,15,${(1 - ambient) * 0.35})`;
      ctx.fillRect(0, 0, w, h);
    }

    // ================================================================
    //  SNOW PARTICLES (winter weather clear/cloudy)
    // ================================================================
    if (season === 'Winter' && weather !== 'Stormy') {
      ctx.fillStyle = 'rgba(230,235,245,0.6)';
      for (let i = 0; i < 50; i++) {
        const sx = ((i * 97 + time * 15) % (w + 40)) - 20;
        const sy = ((i * 131 + time * 25 + i * i * 3) % (h + 40)) - 20;
        const sz = 1 + (i % 3);
        ctx.beginPath();
        ctx.arc(sx, sy, sz, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ==========================================================================
  //  ANIMATION LOOP
  // ==========================================================================
  let lastTime = 0;
  function tick(timestamp) {
    if (!running) return;
    animFrameId = requestAnimationFrame(tick);

    const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : 0.016;
    lastTime = timestamp;

    drawScene(dt);
  }

  // ==========================================================================
  //  PUBLIC API
  // ==========================================================================
  return {
    init(containerEl) {
      buildDOM(containerEl);
      sizeCanvas();
    },

    start() {
      if (running) return;
      running = true;
      lastTime = 0;
      animFrameId = requestAnimationFrame(tick);
    },

    stop() {
      running = false;
      if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    },

    resize() {
      sizeCanvas();
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SemanticLightingSection;
