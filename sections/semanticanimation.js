// ============================================================
// Semantic Animation — Interactive Demo Section
// Control animation through meaning, not individual joint angles
// Split-view: Direct Control (8 params) vs Semantic Control (4 dims)
// ============================================================

const SemanticAnimationSection = (() => {
  let container, canvas, ctx;
  let running = false, animFrameId = null;
  let width = 0, height = 0, dpr = 1;
  let time = 0;

  // ---- Mouse / touch state ----
  let mouse = { x: 0, y: 0 };
  let mouseDown = false;
  let activeSlider = null; // { side: 'left'|'right', index: number }
  let hoveredSlider = null;

  // ---- Bound event handlers ----
  let boundMouseDown, boundMouseMove, boundMouseUp;
  let boundTouchStart, boundTouchMove, boundTouchEnd;
  let boundDraw;

  // ================================================================
  //  SKELETON DEFINITION — Joint Tree
  // ================================================================
  // Joints defined as a tree. Each joint has a name, parent, and bone length (relative units).
  // Position is computed from root outward using angles.
  const JOINT_NAMES = [
    'root',        // 0: pelvis center (root of skeleton)
    'spine',       // 1
    'neck',        // 2
    'head',        // 3
    'shoulder_l',  // 4
    'elbow_l',     // 5
    'hand_l',      // 6
    'shoulder_r',  // 7
    'elbow_r',     // 8
    'hand_r',      // 9
    'hip_l',       // 10
    'knee_l',      // 11
    'foot_l',      // 12
    'hip_r',       // 13
    'knee_r',      // 14
    'foot_r',      // 15
  ];

  const JOINT_PARENT = [
    -1, // root
    0,  // spine -> root
    1,  // neck -> spine
    2,  // head -> neck
    2,  // shoulder_l -> neck
    4,  // elbow_l -> shoulder_l
    5,  // hand_l -> elbow_l
    2,  // shoulder_r -> neck
    7,  // elbow_r -> shoulder_r
    8,  // hand_r -> elbow_r
    0,  // hip_l -> root
    10, // knee_l -> hip_l
    11, // foot_l -> knee_l
    0,  // hip_r -> root
    13, // knee_r -> hip_r
    14, // foot_r -> knee_r
  ];

  // Bone lengths in pixels (will be scaled)
  const BONE_LENGTHS = [
    0,    // root (no bone)
    50,   // spine
    15,   // neck
    0,    // head (drawn as circle)
    18,   // shoulder_l
    30,   // elbow_l (upper arm)
    28,   // hand_l (forearm)
    18,   // shoulder_r
    30,   // elbow_r
    28,   // hand_r
    12,   // hip_l
    35,   // knee_l (thigh)
    32,   // foot_l (shin)
    12,   // hip_r
    35,   // knee_r
    32,   // foot_r
  ];

  const HEAD_RADIUS = 14;

  // ================================================================
  //  ANIMATION PARAMETERS (8 direct controls)
  // ================================================================
  const DEFAULT_PARAMS = {
    strideLength: 0.55,
    armSwing: 0.5,
    bounceHeight: 0.45,
    headTilt: 0.35,
    speed: 0.5,
    leanForward: 0.3,
    hipSway: 0.3,
    footLift: 0.5,
  };

  const PARAM_DEFS = [
    { key: 'strideLength', label: 'Stride Length', min: 0.05, max: 1.0 },
    { key: 'armSwing',     label: 'Arm Swing',     min: 0.0,  max: 1.0 },
    { key: 'bounceHeight', label: 'Bounce Height', min: 0.0,  max: 1.0 },
    { key: 'headTilt',     label: 'Head Tilt',     min: 0.0,  max: 1.0 },
    { key: 'speed',        label: 'Speed',         min: 0.1,  max: 1.0 },
    { key: 'leanForward',  label: 'Lean Forward',  min: 0.0,  max: 0.8 },
    { key: 'hipSway',      label: 'Hip Sway',      min: 0.0,  max: 1.0 },
    { key: 'footLift',     label: 'Foot Lift',     min: 0.0,  max: 1.0 },
  ];

  // ---- Left side (direct) params ----
  let directParams = { ...DEFAULT_PARAMS };

  // ---- Right side (semantic) sliders ----
  const SEMANTIC_DEFS = [
    { key: 'mood',   label: 'Mood',   left: 'Sad',        right: 'Happy',      color: '#ff6eb4' },
    { key: 'energy', label: 'Energy', left: 'Tired',      right: 'Energetic',  color: '#6effb4' },
    { key: 'weight', label: 'Weight', left: 'Light',      right: 'Heavy',      color: '#ffb86e' },
    { key: 'style',  label: 'Style',  left: 'Realistic',  right: 'Exaggerated', color: '#6ec3ff' },
  ];

  let semanticSliders = {
    mood: 0.65,
    energy: 0.5,
    weight: 0.35,
    style: 0.3,
  };

  // ---- Slider hit rects ----
  let leftSliderRects = [];
  let rightSliderRects = [];

  // ---- Connection lines alpha ----
  let connectionAlpha = 0;
  let connectionTarget = 0.3;

  // ================================================================
  //  SEMANTIC -> DIRECT PARAMETER MAPPING
  // ================================================================
  function semanticToParams(s) {
    const mood = s.mood;       // 0=sad, 1=happy
    const energy = s.energy;   // 0=tired, 1=energetic
    const weight = s.weight;   // 0=light, 1=heavy
    const style = s.style;     // 0=realistic, 1=exaggerated

    const exaggeration = 1 + style * 0.8;

    return {
      strideLength: (0.2 + mood * 0.25 + energy * 0.35 - weight * 0.15) * exaggeration,
      armSwing:     (0.1 + mood * 0.4 + energy * 0.35 - weight * 0.1) * exaggeration,
      bounceHeight: (0.1 + mood * 0.25 + energy * 0.3 - weight * 0.2) * exaggeration,
      headTilt:     (0.1 + mood * 0.45 - (1 - energy) * 0.15) * exaggeration,
      speed:        Math.max(0.15, 0.2 + energy * 0.55 - weight * 0.2 + mood * 0.1),
      leanForward:  Math.max(0, 0.05 + (1 - mood) * 0.2 + (1 - energy) * 0.15 + weight * 0.1),
      hipSway:      (0.1 + weight * 0.35 + style * 0.2) * exaggeration,
      footLift:     (0.15 + energy * 0.45 - weight * 0.15 + mood * 0.1) * exaggeration,
    };
  }

  // Mapping connections: which semantic dims affect which params
  const SEMANTIC_CONNECTIONS = {
    mood:   ['strideLength', 'armSwing', 'bounceHeight', 'headTilt', 'speed', 'leanForward'],
    energy: ['strideLength', 'armSwing', 'bounceHeight', 'speed', 'leanForward', 'footLift'],
    weight: ['strideLength', 'bounceHeight', 'speed', 'hipSway', 'footLift', 'leanForward'],
    style:  ['strideLength', 'armSwing', 'bounceHeight', 'hipSway', 'footLift'],
  };

  // ================================================================
  //  WALK CYCLE — Compute joint angles from params + time
  // ================================================================
  function computeWalkPose(params, t) {
    const spd = params.speed * 4.0;
    const phase = t * spd;
    const sin = Math.sin;
    const cos = Math.cos;

    const stride = params.strideLength;
    const arm = params.armSwing;
    const bounce = params.bounceHeight;
    const head = params.headTilt;
    const lean = params.leanForward;
    const sway = params.hipSway;
    const lift = params.footLift;

    // Root vertical bounce (double frequency of walk)
    const rootY = -sin(phase * 2) * bounce * 8;
    // Root lateral sway
    const rootX = sin(phase) * sway * 4;

    // Torso lean
    const torsoAngle = -Math.PI / 2 - lean * 0.35 + sin(phase * 2) * 0.02;

    // Joint angles (in radians, relative to parent bone direction)
    const angles = new Float64Array(16);

    // Root angle (unused since root is positioned)
    angles[0] = 0;

    // Spine: lean forward + slight bounce wobble
    angles[1] = torsoAngle;

    // Neck: slight counter-rotation
    angles[2] = sin(phase * 2) * 0.04 + lean * 0.15;

    // Head: tilt based on bounce & mood
    angles[3] = sin(phase * 2) * head * 0.15 - (1 - head) * 0.12;

    // Shoulders spread out from neck
    angles[4] = Math.PI * 0.4;  // left shoulder angle from neck
    angles[7] = -Math.PI * 0.4; // right shoulder angle from neck

    // Arms swing opposite to legs
    const armAngleL = sin(phase) * arm * 0.7;
    const armAngleR = sin(phase + Math.PI) * arm * 0.7;
    angles[5] = armAngleL;  // left elbow
    angles[6] = -Math.abs(sin(phase)) * arm * 0.3 - 0.1; // left hand (forearm bends)
    angles[8] = armAngleR;
    angles[9] = -Math.abs(sin(phase + Math.PI)) * arm * 0.3 - 0.1;

    // Hips spread from root
    angles[10] = Math.PI * 0.5 + sin(phase) * 0.08; // left hip base
    angles[13] = -Math.PI * 0.5 - sin(phase) * 0.08; // right hip base

    // Legs: walking cycle
    // Left leg leads with sin(phase), right with sin(phase + PI)
    const legSwingL = sin(phase) * stride * 0.6;
    const legSwingR = sin(phase + Math.PI) * stride * 0.6;

    // Thigh angles
    angles[11] = legSwingL;
    angles[14] = legSwingR;

    // Knee bend: more bend when leg is behind (recovery) and when lifting
    const kneeBendL = Math.max(0, -sin(phase - 0.3)) * stride * 0.7 + lift * Math.max(0, sin(phase - 0.5)) * 0.4;
    const kneeBendR = Math.max(0, -sin(phase + Math.PI - 0.3)) * stride * 0.7 + lift * Math.max(0, sin(phase + Math.PI - 0.5)) * 0.4;
    angles[12] = kneeBendL;
    angles[15] = kneeBendR;

    return { angles, rootX, rootY };
  }

  // ================================================================
  //  FORWARD KINEMATICS — Compute joint positions from angles
  // ================================================================
  function forwardKinematics(angles, rootX, rootY, scale, baseX, baseY) {
    const positions = [];
    const worldAngles = new Float64Array(16);

    for (let i = 0; i < 16; i++) {
      const parent = JOINT_PARENT[i];
      if (parent === -1) {
        // Root
        positions.push({ x: baseX + rootX * scale, y: baseY + rootY * scale });
        worldAngles[i] = 0;
      } else {
        const parentPos = positions[parent];
        const parentWorldAngle = worldAngles[parent];
        const boneLen = BONE_LENGTHS[i] * scale;
        const worldAngle = parentWorldAngle + angles[i];
        worldAngles[i] = worldAngle;

        positions.push({
          x: parentPos.x + Math.cos(worldAngle) * boneLen,
          y: parentPos.y + Math.sin(worldAngle) * boneLen,
        });
      }
    }

    return positions;
  }

  // ================================================================
  //  DRAW STICK FIGURE
  // ================================================================
  function drawStickFigure(ctx, positions, scale, alpha, groundY) {
    const jointR = Math.max(3, 5 * scale);
    const boneW = Math.max(2, 3.5 * scale);
    const headR = HEAD_RADIUS * scale;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Ground shadow
    const rootPos = positions[0];
    ctx.save();
    ctx.globalAlpha = alpha * 0.15;
    ctx.fillStyle = 'rgba(100, 140, 255, 0.5)';
    ctx.beginPath();
    ctx.ellipse(rootPos.x, groundY + 2, 25 * scale, 4 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Ground line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rootPos.x - 60 * scale, groundY);
    ctx.lineTo(rootPos.x + 60 * scale, groundY);
    ctx.stroke();

    // Draw bones
    ctx.strokeStyle = 'rgba(180, 200, 255, 0.85)';
    ctx.lineWidth = boneW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const bonePairs = [
      [0, 1],   // root -> spine
      [1, 2],   // spine -> neck
      [2, 4],   // neck -> shoulder_l
      [4, 5],   // shoulder_l -> elbow_l
      [5, 6],   // elbow_l -> hand_l
      [2, 7],   // neck -> shoulder_r
      [7, 8],   // shoulder_r -> elbow_r
      [8, 9],   // hand_r -> elbow_r
      [0, 10],  // root -> hip_l
      [10, 11], // hip_l -> knee_l
      [11, 12], // knee_l -> foot_l
      [0, 13],  // root -> hip_r
      [13, 14], // hip_r -> knee_r
      [14, 15], // knee_r -> foot_r
    ];

    for (const [a, b] of bonePairs) {
      ctx.beginPath();
      ctx.moveTo(positions[a].x, positions[a].y);
      ctx.lineTo(positions[b].x, positions[b].y);
      ctx.stroke();
    }

    // Draw joints
    ctx.fillStyle = 'rgba(100, 140, 255, 0.9)';
    for (let i = 0; i < positions.length; i++) {
      if (i === 3) continue; // head drawn separately
      ctx.beginPath();
      ctx.arc(positions[i].x, positions[i].y, jointR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw head
    const headPos = positions[3];
    const neckPos = positions[2];
    ctx.strokeStyle = 'rgba(180, 200, 255, 0.85)';
    ctx.lineWidth = boneW;
    ctx.beginPath();
    ctx.moveTo(neckPos.x, neckPos.y);
    ctx.lineTo(headPos.x, headPos.y);
    ctx.stroke();

    // Head circle
    const headGrad = ctx.createRadialGradient(
      headPos.x - headR * 0.2, headPos.y - headR * 0.2, headR * 0.1,
      headPos.x, headPos.y, headR
    );
    headGrad.addColorStop(0, 'rgba(140, 170, 255, 0.4)');
    headGrad.addColorStop(1, 'rgba(80, 110, 200, 0.15)');
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(headPos.x, headPos.y, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140, 170, 255, 0.7)';
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.stroke();

    ctx.restore();
  }

  // ================================================================
  //  DRAW SLIDERS (reused for both sides)
  // ================================================================
  function drawSliders(ctx, defs, values, rects, startX, startY, sliderW, spacing, side) {
    rects.length = 0;
    const sliderH = 6;
    const fontSize = 11;
    const labelColor = 'rgba(255, 255, 255, 0.6)';

    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      const sy = startY + i * spacing;
      const val = typeof values[d.key] === 'number' ? values[d.key] : 0.5;
      // Normalize to 0-1 for display
      const norm = d.min !== undefined ? (val - d.min) / (d.max - d.min) : val;
      const displayNorm = Math.max(0, Math.min(1, norm));

      const isHovered = hoveredSlider && hoveredSlider.side === side && hoveredSlider.index === i;
      const isActive = activeSlider && activeSlider.side === side && activeSlider.index === i;
      const color = d.color || 'rgba(100, 140, 255, 0.8)';

      rects.push({
        x: startX,
        y: sy - 12,
        w: sliderW,
        h: spacing,
        key: d.key,
        side: side,
        index: i,
        trackY: sy + fontSize + 4,
        min: d.min !== undefined ? d.min : 0,
        max: d.max !== undefined ? d.max : 1,
      });

      // Label
      ctx.font = `500 ${fontSize}px "Inter", -apple-system, sans-serif`;
      ctx.fillStyle = isActive ? color : labelColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(d.label, startX, sy);

      // Value text
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = `400 ${fontSize - 1}px "JetBrains Mono", "SF Mono", monospace`;
      ctx.fillText(val.toFixed(2), startX + sliderW, sy);

      // Range labels
      if (d.left && d.right) {
        ctx.font = `400 ${fontSize - 2}px "Inter", -apple-system, sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(d.left, startX, sy + fontSize + sliderH + 8);
        ctx.textAlign = 'right';
        ctx.fillText(d.right, startX + sliderW, sy + fontSize + sliderH + 8);
      }

      const trackY = sy + fontSize + 4;

      // Track bg
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath();
      ctx.roundRect(startX, trackY, sliderW, sliderH, sliderH / 2);
      ctx.fill();

      // Filled portion
      const fillW = sliderW * displayNorm;
      if (fillW > 0) {
        const grad = ctx.createLinearGradient(startX, 0, startX + fillW, 0);
        grad.addColorStop(0, color + '30');
        grad.addColorStop(1, color + 'bb');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(startX, trackY, fillW, sliderH, sliderH / 2);
        ctx.fill();
      }

      // Thumb
      const thumbX = startX + sliderW * displayNorm;
      const thumbR = isActive ? 7 : isHovered ? 6 : 5;

      if (isActive) {
        ctx.fillStyle = color + '25';
        ctx.beginPath();
        ctx.arc(thumbX, trackY + sliderH / 2, thumbR * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(thumbX, trackY + sliderH / 2, thumbR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(thumbX, trackY + sliderH / 2, thumbR * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ================================================================
  //  DRAW CONNECTION VISUALIZATION (semantic -> direct mapping)
  // ================================================================
  function drawConnections(ctx, rightSliderX, rightSliderY, rightSpacing, leftSliderX, leftSliderY, leftSpacing, t) {
    if (connectionAlpha < 0.01) return;

    const semKeys = SEMANTIC_DEFS.map(d => d.key);
    const paramKeys = PARAM_DEFS.map(d => d.key);
    const colors = {};
    SEMANTIC_DEFS.forEach(d => { colors[d.key] = d.color; });

    ctx.save();

    for (let si = 0; si < semKeys.length; si++) {
      const sKey = semKeys[si];
      const linked = SEMANTIC_CONNECTIONS[sKey];
      const color = colors[sKey];
      const sy = rightSliderY + si * rightSpacing + 15;

      for (let pi = 0; pi < paramKeys.length; pi++) {
        if (linked.indexOf(paramKeys[pi]) === -1) continue;
        const py = leftSliderY + pi * leftSpacing + 15;

        const wave = Math.sin(t * 2 + si + pi * 0.7) * 0.2 + 0.8;
        ctx.strokeStyle = color;
        ctx.globalAlpha = connectionAlpha * 0.2 * wave;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);

        // Draw curved line from right slider to left slider
        const sx = rightSliderX;
        const ex = leftSliderX + 180; // end at right edge of left sliders

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        const midX = (sx + ex) / 2;
        ctx.bezierCurveTo(sx - 30, sy, ex + 30, py, ex, py);
        ctx.stroke();
      }
    }

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ================================================================
  //  DRAW HEADER
  // ================================================================
  function drawHeader(ctx, w) {
    const headerY = 20;

    // Overline
    ctx.font = '600 11px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = 'rgba(100, 140, 255, 0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.letterSpacing = '2px';
    ctx.fillText('SEMANTIC ANIMATION', w / 2, headerY);

    // Title
    ctx.font = '700 24px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.letterSpacing = '0px';
    ctx.fillText('Semantic Animation', w / 2, headerY + 18);

    // Description
    ctx.font = '400 13px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    const desc = 'Control motion through meaning \u2014 mood, energy, weight \u2014 not individual joint angles.';
    ctx.fillText(desc, w / 2, headerY + 48);

    ctx.font = '400 12px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillText('Inspired by Disney and Pixar semantic animation research', w / 2, headerY + 66);
  }

  // ================================================================
  //  INPUT HANDLING
  // ================================================================
  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function findSlider(mx, my) {
    // Check right (semantic) sliders first, then left (direct)
    const allRects = rightSliderRects.concat(leftSliderRects);
    for (let i = 0; i < allRects.length; i++) {
      const r = allRects[i];
      if (mx >= r.x - 5 && mx <= r.x + r.w + 5 &&
          my >= r.y && my <= r.y + r.h) {
        return { side: r.side, index: r.index, rect: r };
      }
    }
    return null;
  }

  function updateSliderValue(info, mx) {
    const r = info.rect;
    let norm = (mx - r.x) / r.w;
    norm = Math.max(0, Math.min(1, norm));
    const val = r.min + norm * (r.max - r.min);

    if (info.side === 'left') {
      directParams[PARAM_DEFS[info.index].key] = val;
    } else {
      semanticSliders[SEMANTIC_DEFS[info.index].key] = val;
    }
  }

  function onMouseDown(e) {
    const pos = getCanvasPos(e);
    mouseDown = true;
    const hit = findSlider(pos.x, pos.y);
    if (hit) {
      activeSlider = hit;
      updateSliderValue(hit, pos.x);
      canvas.style.cursor = 'grabbing';
    }
  }

  function onMouseMove(e) {
    const pos = getCanvasPos(e);
    mouse = pos;

    if (activeSlider) {
      updateSliderValue(activeSlider, pos.x);
      return;
    }

    const hit = findSlider(pos.x, pos.y);
    hoveredSlider = hit;
    canvas.style.cursor = hit ? 'grab' : 'default';
  }

  function onMouseUp() {
    activeSlider = null;
    mouseDown = false;
    canvas.style.cursor = hoveredSlider ? 'grab' : 'default';
  }

  function onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
      const t = e.touches[0];
      onMouseDown({ clientX: t.clientX, clientY: t.clientY });
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
      const t = e.touches[0];
      onMouseMove({ clientX: t.clientX, clientY: t.clientY });
    }
  }

  function onTouchEnd() {
    onMouseUp();
  }

  // ================================================================
  //  MAIN DRAW LOOP
  // ================================================================
  function draw(timestamp) {
    if (!running) return;
    animFrameId = requestAnimationFrame(draw);

    time = timestamp * 0.001;
    const t = time;
    const w = width / dpr;
    const h = height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#06080f';
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let gx = 0; gx < w; gx += gridSize) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }

    // Header
    drawHeader(ctx, w);

    // Layout: two halves
    const divX = w / 2;
    const leftCenterX = w * 0.25;
    const rightCenterX = w * 0.75;
    const figureY = h * 0.38;
    const scale = Math.min(w / 900, h / 700, 1.0) * 0.85;
    const groundY = figureY + 85 * scale;

    // VS divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(divX, 95);
    ctx.lineTo(divX, h - 10);
    ctx.stroke();
    ctx.setLineDash([]);

    // VS badge
    const vsY = 110;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath();
    ctx.arc(divX, vsY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 11px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VS', divX, vsY);

    // Column titles
    const titleY = 96;
    ctx.font = '600 14px "Inter", -apple-system, sans-serif';
    ctx.textBaseline = 'top';

    ctx.fillStyle = 'rgba(100, 140, 255, 0.8)';
    ctx.textAlign = 'center';
    ctx.fillText('Direct Control (8 params)', leftCenterX, titleY);

    ctx.fillStyle = 'rgba(255, 110, 180, 0.8)';
    ctx.fillText('Semantic Control (4 dimensions)', rightCenterX, titleY);

    // Subtitle
    ctx.font = '400 11px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillText('Individual joint angle parameters', leftCenterX, titleY + 18);
    ctx.fillText('High-level meaning maps to all parameters', rightCenterX, titleY + 18);

    // ---- LEFT SIDE: Direct-controlled character ----
    const leftPose = computeWalkPose(directParams, t);
    const leftPositions = forwardKinematics(
      leftPose.angles, leftPose.rootX, leftPose.rootY,
      scale, leftCenterX, figureY
    );
    drawStickFigure(ctx, leftPositions, scale, 1.0, groundY);

    // ---- RIGHT SIDE: Semantic-controlled character ----
    const semParams = semanticToParams(semanticSliders);
    const rightPose = computeWalkPose(semParams, t);
    const rightPositions = forwardKinematics(
      rightPose.angles, rightPose.rootX, rightPose.rootY,
      scale, rightCenterX, figureY
    );
    drawStickFigure(ctx, rightPositions, scale, 1.0, groundY);

    // ---- SLIDERS ----
    const sliderW = Math.min(180, (w / 2 - 60));
    const leftSliderX = leftCenterX - sliderW / 2;
    const rightSliderX = rightCenterX - sliderW / 2;
    const sliderStartY = groundY + 25;
    const leftSpacing = Math.min(34, (h - sliderStartY - 20) / 8);
    const rightSpacing = Math.min(52, (h - sliderStartY - 20) / 4);

    // Left sliders (8 direct params)
    drawSliders(ctx, PARAM_DEFS, directParams, leftSliderRects,
      leftSliderX, sliderStartY, sliderW, leftSpacing, 'left');

    // Right sliders (4 semantic dims)
    drawSliders(ctx, SEMANTIC_DEFS, semanticSliders, rightSliderRects,
      rightSliderX, sliderStartY, sliderW, rightSpacing, 'right');

    // Connection lines animation
    if (activeSlider && activeSlider.side === 'right') {
      connectionTarget = 0.85;
    } else {
      connectionTarget = 0.25;
    }
    connectionAlpha += (connectionTarget - connectionAlpha) * 0.06;
    drawConnections(ctx, rightSliderX, sliderStartY, rightSpacing,
      leftSliderX, sliderStartY, leftSpacing, t);

    // Hint text
    ctx.font = '400 10px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Adjust each parameter individually', leftCenterX, figureY - 65 * scale);
    ctx.fillText('One slider controls many parameters', rightCenterX, figureY - 65 * scale);

    ctx.restore();
  }

  // ================================================================
  //  PUBLIC API
  // ================================================================
  return {
    init(containerEl) {
      container = containerEl;
      container.style.position = 'relative';
      container.style.overflow = 'hidden';
      container.style.background = '#06080f';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.cursor = 'default';
      container.style.userSelect = 'none';

      canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.appendChild(canvas);

      ctx = canvas.getContext('2d');

      boundMouseDown = onMouseDown;
      boundMouseMove = onMouseMove;
      boundMouseUp = onMouseUp;
      boundTouchStart = onTouchStart;
      boundTouchMove = onTouchMove;
      boundTouchEnd = onTouchEnd;

      canvas.addEventListener('mousedown', boundMouseDown);
      canvas.addEventListener('mousemove', boundMouseMove);
      window.addEventListener('mouseup', boundMouseUp);
      canvas.addEventListener('touchstart', boundTouchStart, { passive: false });
      canvas.addEventListener('touchmove', boundTouchMove, { passive: false });
      window.addEventListener('touchend', boundTouchEnd);

      this.resize();
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
      if (!container) return;
      const rect = container.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      width = rect.width * dpr;
      height = rect.height * dpr;
      canvas.width = width;
      canvas.height = height;
    },

    destroy() {
      this.stop();
      if (canvas) {
        canvas.removeEventListener('mousedown', boundMouseDown);
        canvas.removeEventListener('mousemove', boundMouseMove);
        window.removeEventListener('mouseup', boundMouseUp);
        canvas.removeEventListener('touchstart', boundTouchStart);
        canvas.removeEventListener('touchmove', boundTouchMove);
        window.removeEventListener('touchend', boundTouchEnd);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SemanticAnimationSection;
