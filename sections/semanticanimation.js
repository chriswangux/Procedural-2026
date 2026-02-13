// ============================================================
// Semantic Animation -- Split-View Interactive Demo
// LEFT:  Direct Control -- static stick figure, drag joints manually
// RIGHT: Semantic Control -- animated walk cycle driven by 4 sliders
// ============================================================

const SemanticAnimationSection = (() => {
  let container, canvas, ctx;
  let running = false, animFrameId = null;
  let width = 0, height = 0, dpr = 1;
  let time = 0;
  let sliderEls = [];       // DOM slider elements (right side)
  let sliderContainer = null;

  // ================================================================
  //  STICK FIGURE GEOMETRY (shared by both sides)
  // ================================================================
  // Joint indices
  const J = {
    HEAD: 0, NECK: 1,
    L_SHOULDER: 2, L_ELBOW: 3, L_HAND: 4,
    R_SHOULDER: 5, R_ELBOW: 6, R_HAND: 7,
    HIP: 8,
    L_KNEE: 9, L_FOOT: 10,
    R_KNEE: 11, R_FOOT: 12,
  };
  const JOINT_COUNT = 13;

  // Bone connections: [from, to]
  const BONES = [
    [J.HEAD, J.NECK],
    [J.NECK, J.HIP],           // torso
    [J.NECK, J.L_SHOULDER],
    [J.L_SHOULDER, J.L_ELBOW],
    [J.L_ELBOW, J.L_HAND],
    [J.NECK, J.R_SHOULDER],
    [J.R_SHOULDER, J.R_ELBOW],
    [J.R_ELBOW, J.R_HAND],
    [J.HIP, J.L_KNEE],
    [J.L_KNEE, J.L_FOOT],
    [J.HIP, J.R_KNEE],
    [J.R_KNEE, J.R_FOOT],
  ];

  // Default T-pose positions (relative to hip center at 0,0, y-down)
  // Figure is ~200px tall: head top at about -190, feet at +10
  const HEAD_RADIUS = 18;
  const BONE_WIDTH = 3;
  const JOINT_RADIUS = 5;

  function defaultPose() {
    const p = new Array(JOINT_COUNT);
    // Torso: hip at 0,0; neck at 0,-80; head at 0,-105
    p[J.HIP]         = { x: 0,   y: 0 };
    p[J.NECK]        = { x: 0,   y: -80 };
    p[J.HEAD]        = { x: 0,   y: -105 };
    // Arms: shoulders slightly out from neck
    p[J.L_SHOULDER]  = { x: -20, y: -76 };
    p[J.L_ELBOW]     = { x: -42, y: -50 };
    p[J.L_HAND]      = { x: -38, y: -14 };
    p[J.R_SHOULDER]  = { x: 20,  y: -76 };
    p[J.R_ELBOW]     = { x: 42,  y: -50 };
    p[J.R_HAND]      = { x: 38,  y: -14 };
    // Legs
    p[J.L_KNEE]      = { x: -14, y: 42 };
    p[J.L_FOOT]      = { x: -16, y: 88 };
    p[J.R_KNEE]      = { x: 14,  y: 42 };
    p[J.R_FOOT]      = { x: 16,  y: 88 };
    return p;
  }

  // Joint names (12 draggable joints + head = 13 total, but "12 joints" label
  // counts the ones you'd actually drag to pose the figure)
  const JOINT_NAMES = [
    'head', 'neck',
    'L shoulder', 'L elbow', 'L hand',
    'R shoulder', 'R elbow', 'R hand',
    'hip',
    'L knee', 'L foot',
    'R knee', 'R foot',
  ];

  // ================================================================
  //  LEFT SIDE STATE -- Draggable puppet
  // ================================================================
  let leftJoints = null;     // array of {x, y} in local coords
  let dragJoint = -1;        // index of joint being dragged, -1 = none
  let hoverJoint = -1;       // index of joint being hovered
  let leftDragCount = 0;     // how many drags performed (for hint)

  // ================================================================
  //  RIGHT SIDE STATE -- Semantic walk cycle
  // ================================================================
  let semanticSliders = {
    mood: 0.65,     // 0 = sad, 1 = happy
    energy: 0.5,    // 0 = tired, 1 = energetic
    weight: 0.35,   // 0 = light, 1 = heavy
    style: 0.4,     // 0 = subtle, 1 = exaggerated
  };

  const SLIDER_DEFS = [
    { key: 'mood',   label: 'Mood',   left: 'Sad',    right: 'Happy',      color: '#ff6eb4' },
    { key: 'energy', label: 'Energy', left: 'Tired',  right: 'Energetic',  color: '#6effb4' },
    { key: 'weight', label: 'Weight', left: 'Light',  right: 'Heavy',      color: '#ffb86e' },
    { key: 'style',  label: 'Style',  left: 'Subtle', right: 'Exaggerated', color: '#6ec3ff' },
  ];

  // ================================================================
  //  LAYOUT HELPERS
  // ================================================================
  function getLayout() {
    const w = width / dpr;
    const h = height / dpr;
    const divX = Math.floor(w / 2);
    const leftCX = Math.floor(w * 0.25);
    const rightCX = Math.floor(w * 0.75);
    // Figure vertical center -- in the upper portion of each half
    const figureCY = Math.min(h * 0.42, 320);
    const groundY = figureCY + 95;
    const scale = Math.min(w / 1000, h / 750, 1.0) * 0.9;
    return { w, h, divX, leftCX, rightCX, figureCY, groundY, scale };
  }

  // ================================================================
  //  WALK CYCLE -- sinusoidal joint angles from semantic params
  // ================================================================
  function computeWalkPose(sliders, t) {
    const mood   = sliders.mood;
    const energy = sliders.energy;
    const wt     = sliders.weight;
    const style  = sliders.style;

    // Style multiplier: subtle=0.3x .. exaggerated=2x
    const styleMul = 0.3 + style * 1.7;

    // Cycle speed: influenced by energy (faster) and weight (slower)
    const baseSpeed = 1.8 + energy * 3.0 - wt * 1.2 + mood * 0.5;
    const speed = Math.max(0.8, baseSpeed);
    const phase = t * speed;
    const sin = Math.sin;
    const cos = Math.cos;

    // Stride width: mood (happy = wider), energy (more = wider), weight (heavy = narrower)
    const strideBase = 12 + mood * 10 + energy * 12 - wt * 6;
    const stride = strideBase * styleMul;

    // Bounce height: mood (happy = more), energy (more bounce), weight (heavy = less)
    const bounceBase = 2 + mood * 4 + energy * 5 - wt * 3;
    const bounce = Math.max(0.5, bounceBase) * styleMul;

    // Arm swing amplitude
    const armBase = 8 + mood * 12 + energy * 10 - wt * 4;
    const armSwing = armBase * styleMul;

    // Foot lift height
    const liftBase = 5 + energy * 18 - wt * 6 + mood * 4;
    const footLift = Math.max(2, liftBase) * styleMul;

    // Head tilt: sad = down, happy = up
    const headTilt = (-8 + mood * 16 + energy * 4 - (1 - mood) * 6) * styleMul * 0.3;

    // Torso lean: tired = slouch forward, energetic = upright
    const torsoLean = (4 - energy * 6 + (1 - mood) * 4 + wt * 2) * styleMul * 0.15;

    // Stance width: weight makes it wider
    const stanceOffset = 10 + wt * 6;

    // Step duration modifier for weight (heavy = more deliberate foot plant)
    const plantPhase = wt * 0.3;

    // --- Compute joint positions ---
    const p = new Array(JOINT_COUNT);

    // Root bounce
    const rootBounce = -Math.abs(sin(phase * 2)) * bounce;
    const rootSway = sin(phase) * 2 * styleMul;

    // Hip center
    const hipY = 0 + rootBounce;
    const hipX = rootSway;
    p[J.HIP] = { x: hipX, y: hipY };

    // Torso: lean
    const torsoTopX = hipX + sin(torsoLean) * 80;
    const torsoTopY = hipY - cos(torsoLean) * 80;
    p[J.NECK] = { x: torsoTopX + sin(phase * 2) * 1 * styleMul, y: torsoTopY };

    // Head
    const headAngle = headTilt * (Math.PI / 180);
    p[J.HEAD] = {
      x: p[J.NECK].x + sin(headAngle) * 25 + sin(phase * 2) * 0.5 * styleMul,
      y: p[J.NECK].y - cos(headAngle) * 25 + sin(phase * 2) * 1 * styleMul,
    };

    // Shoulders
    p[J.L_SHOULDER] = { x: p[J.NECK].x - 18, y: p[J.NECK].y + 4 };
    p[J.R_SHOULDER] = { x: p[J.NECK].x + 18, y: p[J.NECK].y + 4 };

    // Left arm: swings opposite to left leg
    const lArmAngle = sin(phase) * armSwing * (Math.PI / 180) * 2;
    const lUpperLen = 38;
    const lForeLen = 36;
    const lElbowBend = (0.15 + Math.abs(sin(phase)) * 0.4) * styleMul;
    p[J.L_ELBOW] = {
      x: p[J.L_SHOULDER].x + sin(lArmAngle) * lUpperLen - 6,
      y: p[J.L_SHOULDER].y + cos(lArmAngle) * lUpperLen,
    };
    p[J.L_HAND] = {
      x: p[J.L_ELBOW].x + sin(lArmAngle + lElbowBend) * lForeLen - 2,
      y: p[J.L_ELBOW].y + cos(lArmAngle + lElbowBend) * lForeLen,
    };

    // Right arm: swings opposite to right leg (opposite phase from left arm)
    const rArmAngle = sin(phase + Math.PI) * armSwing * (Math.PI / 180) * 2;
    const rElbowBend = (0.15 + Math.abs(sin(phase + Math.PI)) * 0.4) * styleMul;
    p[J.R_ELBOW] = {
      x: p[J.R_SHOULDER].x + sin(rArmAngle) * lUpperLen + 6,
      y: p[J.R_SHOULDER].y + cos(rArmAngle) * lUpperLen,
    };
    p[J.R_HAND] = {
      x: p[J.R_ELBOW].x + sin(rArmAngle + rElbowBend) * lForeLen + 2,
      y: p[J.R_ELBOW].y + cos(rArmAngle + rElbowBend) * lForeLen,
    };

    // Legs -- walk cycle
    // Left leg: phase 0
    const lLegPhase = phase;
    const lHipAngle = sin(lLegPhase) * stride * (Math.PI / 180) * 2;
    const lKneeBend = Math.max(0, -sin(lLegPhase - 0.6 - plantPhase)) * 0.7 * styleMul +
                      Math.max(0, sin(lLegPhase - 0.3)) * footLift * 0.02;
    const thighLen = 44;
    const calfLen = 44;

    p[J.L_KNEE] = {
      x: hipX - stanceOffset * 0.5 + sin(lHipAngle) * thighLen,
      y: hipY + cos(lHipAngle) * thighLen,
    };
    const lKneeAngle = lHipAngle + lKneeBend;
    const lFootBaseY = p[J.L_KNEE].y + cos(lKneeAngle) * calfLen;
    const lFootLiftAmount = Math.max(0, sin(lLegPhase - 0.2)) * footLift;
    p[J.L_FOOT] = {
      x: p[J.L_KNEE].x + sin(lKneeAngle) * calfLen,
      y: lFootBaseY - lFootLiftAmount,
    };

    // Right leg: phase PI (opposite)
    const rLegPhase = phase + Math.PI;
    const rHipAngle = sin(rLegPhase) * stride * (Math.PI / 180) * 2;
    const rKneeBend = Math.max(0, -sin(rLegPhase - 0.6 - plantPhase)) * 0.7 * styleMul +
                      Math.max(0, sin(rLegPhase - 0.3)) * footLift * 0.02;
    p[J.R_KNEE] = {
      x: hipX + stanceOffset * 0.5 + sin(rHipAngle) * thighLen,
      y: hipY + cos(rHipAngle) * thighLen,
    };
    const rKneeAngle = rHipAngle + rKneeBend;
    const rFootBaseY = p[J.R_KNEE].y + cos(rKneeAngle) * calfLen;
    const rFootLiftAmount = Math.max(0, sin(rLegPhase - 0.2)) * footLift;
    p[J.R_FOOT] = {
      x: p[J.R_KNEE].x + sin(rKneeAngle) * calfLen,
      y: rFootBaseY - rFootLiftAmount,
    };

    return p;
  }

  // ================================================================
  //  DRAW STICK FIGURE (used by both sides)
  //  joints: array of {x,y} in local coords
  //  cx, cy: center position on canvas
  //  opts: { jointColor, boneColor, boneAlpha, showHandles, hoverIdx, headFill }
  // ================================================================
  function drawFigure(joints, cx, groundY, opts) {
    const jc = opts.jointColor || 'rgba(100,150,255,0.9)';
    const bc = opts.boneColor || 'rgba(220,230,255,0.8)';
    const ba = opts.boneAlpha !== undefined ? opts.boneAlpha : 0.8;
    const showHandles = opts.showHandles || false;
    const hoverIdx = opts.hoverIdx !== undefined ? opts.hoverIdx : -1;
    const headFill = opts.headFill || 'rgba(200,215,255,0.85)';

    // Transform joints to canvas coords: centered at cx, with feet near groundY
    // Find the lowest foot y in local coords to align to ground
    const footMaxY = Math.max(joints[J.L_FOOT].y, joints[J.R_FOOT].y);
    const offsetY = groundY - footMaxY - 4;

    const pts = joints.map(j => ({
      x: cx + j.x,
      y: offsetY + j.y,
    }));

    ctx.save();

    // Ground shadow
    const shadowCX = (pts[J.L_FOOT].x + pts[J.R_FOOT].x) / 2;
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = 'rgba(100,160,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(shadowCX, groundY + 2, 30, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Ground line
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 70, groundY);
    ctx.lineTo(cx + 70, groundY);
    ctx.stroke();

    // Draw bones
    ctx.strokeStyle = bc;
    ctx.globalAlpha = ba;
    ctx.lineWidth = BONE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const [a, b] of BONES) {
      // Skip the head-neck bone; we draw it manually with the head
      if (a === J.HEAD && b === J.NECK) continue;
      if (a === J.NECK && b === J.HEAD) continue;
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Draw head
    const headP = pts[J.HEAD];
    const neckP = pts[J.NECK];
    // Neck line
    ctx.strokeStyle = bc;
    ctx.globalAlpha = ba;
    ctx.lineWidth = BONE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(neckP.x, neckP.y);
    ctx.lineTo(headP.x, headP.y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Head circle
    ctx.fillStyle = headFill;
    ctx.beginPath();
    ctx.arc(headP.x, headP.y, HEAD_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = bc;
    ctx.globalAlpha = ba;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Draw joints
    for (let i = 0; i < JOINT_COUNT; i++) {
      if (i === J.HEAD) continue; // head is the circle
      const p = pts[i];
      let r = JOINT_RADIUS;
      let col = jc;

      if (showHandles) {
        const isHover = (i === hoverIdx);
        const isDrag = (i === dragJoint);
        r = isDrag ? 9 : isHover ? 8 : 6;
        col = isDrag ? '#ffffff' :
              isHover ? 'rgba(120,180,255,1)' :
              'rgba(80,140,255,0.85)';
        // Outer glow on hover/drag
        if (isHover || isDrag) {
          ctx.fillStyle = 'rgba(80,140,255,0.15)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Head handle (if showing handles)
    if (showHandles) {
      const isHover = (J.HEAD === hoverIdx);
      const isDrag = (J.HEAD === dragJoint);
      if (isHover || isDrag) {
        ctx.strokeStyle = isDrag ? '#ffffff' : 'rgba(120,180,255,1)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(headP.x, headP.y, HEAD_RADIUS + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
    return pts; // return canvas-space positions for hit testing
  }

  // ================================================================
  //  HIT TEST -- find joint near canvas point
  // ================================================================
  let leftCanvasJoints = null; // cached canvas-space positions from last draw

  function hitTestJoint(canvasJoints, mx, my, threshold) {
    if (!canvasJoints) return -1;
    let bestIdx = -1, bestDist = Infinity;
    for (let i = 0; i < canvasJoints.length; i++) {
      const dx = canvasJoints[i].x - mx;
      const dy = canvasJoints[i].y - my;
      const d2 = dx * dx + dy * dy;
      // For head, use head radius
      const r = (i === J.HEAD) ? HEAD_RADIUS + 4 : threshold;
      if (d2 < r * r && d2 < bestDist) {
        bestDist = d2;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  // ================================================================
  //  INPUT -- Mouse & Touch (for left side joint dragging)
  // ================================================================
  let boundMouseDown, boundMouseMove, boundMouseUp;
  let boundTouchStart, boundTouchMove, boundTouchEnd;

  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left),
      y: (e.clientY - rect.top),
    };
  }

  function onMouseDown(e) {
    const pos = getCanvasPos(e);
    const lay = getLayout();
    // Only handle left half
    if (pos.x < lay.divX) {
      const hit = hitTestJoint(leftCanvasJoints, pos.x, pos.y, 18);
      if (hit >= 0) {
        dragJoint = hit;
        leftDragCount++;
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
      }
    }
  }

  function onMouseMove(e) {
    const pos = getCanvasPos(e);
    const lay = getLayout();

    if (dragJoint >= 0) {
      // Move the dragged joint in local coords
      // Convert canvas pos to local coords
      const footMaxY = Math.max(leftJoints[J.L_FOOT].y, leftJoints[J.R_FOOT].y);
      const offsetY = lay.groundY - footMaxY - 4;
      leftJoints[dragJoint] = {
        x: pos.x - lay.leftCX,
        y: pos.y - offsetY,
      };
      e.preventDefault();
      return;
    }

    // Hover detection
    if (pos.x < lay.divX) {
      const hit = hitTestJoint(leftCanvasJoints, pos.x, pos.y, 18);
      hoverJoint = hit;
      canvas.style.cursor = hit >= 0 ? 'grab' : 'default';
    } else {
      hoverJoint = -1;
      canvas.style.cursor = 'default';
    }
  }

  function onMouseUp() {
    dragJoint = -1;
    canvas.style.cursor = hoverJoint >= 0 ? 'grab' : 'default';
  }

  function onTouchStart(e) {
    if (e.touches.length > 0) {
      const t = e.touches[0];
      onMouseDown({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => e.preventDefault() });
    }
  }

  function onTouchMove(e) {
    if (e.touches.length > 0) {
      const t = e.touches[0];
      onMouseMove({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => e.preventDefault() });
    }
  }

  function onTouchEnd() {
    onMouseUp();
  }

  // ================================================================
  //  DRAW HEADER
  // ================================================================
  function drawHeader(w) {
    const headerY = 22;

    // Overline
    ctx.save();
    ctx.font = '600 11px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = 'rgba(100, 140, 255, 0.55)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('SEMANTIC ANIMATION', w / 2, headerY);

    // Title
    ctx.font = '700 26px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillText('Semantic Animation', w / 2, headerY + 20);

    // Subtitle
    ctx.font = '400 13px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillText(
      'How Disney & Pixar think about motion -- meaning, not math.',
      w / 2, headerY + 52
    );
    ctx.restore();
  }

  // ================================================================
  //  DRAW VS DIVIDER
  // ================================================================
  function drawDivider(divX, topY, botY) {
    ctx.save();

    // Dashed line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(divX, topY);
    ctx.lineTo(divX, botY);
    ctx.stroke();
    ctx.setLineDash([]);

    // VS badge
    const badgeY = topY + 30;
    const badgeR = 18;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(divX, badgeY, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 12px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VS', divX, badgeY);

    ctx.restore();
  }

  // ================================================================
  //  DRAW COLUMN LABELS
  // ================================================================
  function drawColumnLabels(lay) {
    const labelY = 88;
    ctx.save();

    // Left column: Direct Control
    ctx.font = '600 14px "Inter", -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(80, 140, 255, 0.85)';
    ctx.fillText('Direct Control (12 joints)', lay.leftCX, labelY);

    ctx.font = '400 11px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillText('Drag each joint individually', lay.leftCX, labelY + 20);

    // Right column: Semantic Control
    ctx.font = '600 14px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 100, 180, 0.85)';
    ctx.fillText('Semantic Control (4 dimensions)', lay.rightCX, labelY);

    ctx.font = '400 11px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillText('Move any slider to change the walk', lay.rightCX, labelY + 20);

    ctx.restore();
  }

  // ================================================================
  //  DRAW HINTS
  // ================================================================
  function drawHints(lay) {
    ctx.save();
    ctx.font = '400 11px "Inter", -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // Left hint
    if (leftDragCount === 0) {
      ctx.fillStyle = 'rgba(80, 140, 255, 0.55)';
      ctx.fillText('Drag any joint to pose the figure', lay.leftCX, lay.figureCY - 110);
      // Draw animated arrow pointing at a joint
      const arrowPhase = Math.sin(time * 3) * 4;
      const targetJ = leftCanvasJoints ? leftCanvasJoints[J.R_HAND] : null;
      if (targetJ) {
        ctx.strokeStyle = 'rgba(80, 140, 255, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(lay.leftCX, lay.figureCY - 108);
        ctx.lineTo(targetJ.x, targetJ.y - 12 + arrowPhase);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (leftDragCount < 4) {
      const alpha = 0.4 + Math.sin(time * 2) * 0.1;
      ctx.fillStyle = `rgba(80, 140, 255, ${alpha})`;
      ctx.fillText(
        `${leftDragCount}/12 joints moved -- see how tedious this is?`,
        lay.leftCX, lay.figureCY - 110
      );
    } else {
      ctx.fillStyle = 'rgba(80, 140, 255, 0.4)';
      ctx.fillText(
        'Tedious, right? Now look at the right side.',
        lay.leftCX, lay.figureCY - 110
      );
    }

    ctx.restore();
  }

  // ================================================================
  //  CREATE / UPDATE DOM SLIDERS (right side)
  // ================================================================
  function createSliders() {
    if (sliderContainer) return;

    sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = `
      position: absolute;
      pointer-events: auto;
      z-index: 10;
    `;

    for (const def of SLIDER_DEFS) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        flex-direction: column;
        margin-bottom: 14px;
      `;

      // Label row
      const labelRow = document.createElement('div');
      labelRow.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 4px;
      `;
      const lbl = document.createElement('span');
      lbl.textContent = def.label;
      lbl.style.cssText = `
        font: 600 12px "Inter", -apple-system, sans-serif;
        color: ${def.color};
        opacity: 0.9;
      `;
      const val = document.createElement('span');
      val.className = 'slider-val-' + def.key;
      val.textContent = semanticSliders[def.key].toFixed(2);
      val.style.cssText = `
        font: 400 10px "JetBrains Mono", "SF Mono", monospace;
        color: rgba(255,255,255,0.55);
      `;
      labelRow.appendChild(lbl);
      labelRow.appendChild(val);
      row.appendChild(labelRow);

      // Range labels (left/right)
      const rangeRow = document.createElement('div');
      rangeRow.style.cssText = `
        display: flex;
        justify-content: space-between;
        margin-bottom: 2px;
      `;
      const rl = document.createElement('span');
      rl.textContent = def.left;
      rl.style.cssText = `
        font: 400 9px "Inter", sans-serif;
        color: rgba(255,255,255,0.4);
      `;
      const rr = document.createElement('span');
      rr.textContent = def.right;
      rr.style.cssText = `
        font: 400 9px "Inter", sans-serif;
        color: rgba(255,255,255,0.4);
      `;
      rangeRow.appendChild(rl);
      rangeRow.appendChild(rr);
      row.appendChild(rangeRow);

      // Slider input
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '1';
      slider.step = '0.01';
      slider.value = String(semanticSliders[def.key]);
      slider.dataset.key = def.key;

      // Style the slider
      const thumbColor = def.color;
      slider.style.cssText = `
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 6px;
        border-radius: 3px;
        background: rgba(255,255,255,0.06);
        outline: none;
        cursor: pointer;
        margin: 0;
      `;

      // We need to add a style element for the thumb since
      // inline styles can't target pseudo-elements
      const styleEl = document.createElement('style');
      styleEl.textContent = `
        .sa-slider-${def.key}::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${thumbColor};
          cursor: pointer;
          box-shadow: 0 0 8px ${thumbColor}44, 0 2px 4px rgba(0,0,0,0.3);
          border: 2px solid rgba(255,255,255,0.2);
          transition: transform 0.1s ease;
        }
        .sa-slider-${def.key}::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 0 14px ${thumbColor}66, 0 2px 6px rgba(0,0,0,0.4);
        }
        .sa-slider-${def.key}::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${thumbColor};
          cursor: pointer;
          box-shadow: 0 0 8px ${thumbColor}44, 0 2px 4px rgba(0,0,0,0.3);
          border: 2px solid rgba(255,255,255,0.2);
        }
        .sa-slider-${def.key}::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 3px;
        }
        .sa-slider-${def.key}::-moz-range-track {
          height: 6px;
          border-radius: 3px;
          background: rgba(255,255,255,0.06);
        }
      `;
      slider.className = 'sa-slider-' + def.key;

      slider.addEventListener('input', (e) => {
        const k = e.target.dataset.key;
        semanticSliders[k] = parseFloat(e.target.value);
        const valEl = sliderContainer.querySelector('.slider-val-' + k);
        if (valEl) valEl.textContent = semanticSliders[k].toFixed(2);

        // Update slider background gradient to show filled portion
        updateSliderFill(e.target, def.color);
      });

      row.appendChild(styleEl);
      row.appendChild(slider);
      sliderEls.push(slider);
      sliderContainer.appendChild(row);

      // Initial fill
      requestAnimationFrame(() => updateSliderFill(slider, def.color));
    }

    container.appendChild(sliderContainer);
  }

  function updateSliderFill(slider, color) {
    const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.background = `linear-gradient(to right, ${color}55 0%, ${color}aa ${pct}%, rgba(255,255,255,0.06) ${pct}%)`;
  }

  function positionSliders() {
    if (!sliderContainer) return;
    const lay = getLayout();
    const sliderW = Math.min(220, (lay.w / 2) - 60);
    const sliderX = lay.rightCX - sliderW / 2;
    const sliderY = lay.groundY + 28;

    sliderContainer.style.left = sliderX + 'px';
    sliderContainer.style.top = sliderY + 'px';
    sliderContainer.style.width = sliderW + 'px';

    // Refresh fills
    for (let i = 0; i < sliderEls.length; i++) {
      updateSliderFill(sliderEls[i], SLIDER_DEFS[i].color);
    }
  }

  // ================================================================
  //  SUBTLE GRID BACKGROUND
  // ================================================================
  function drawGrid(w, h) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
    ctx.lineWidth = 1;
    const gs = 40;
    for (let gx = 0; gx < w; gx += gs) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += gs) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }
  }

  // ================================================================
  //  MAIN DRAW LOOP
  // ================================================================
  function draw(timestamp) {
    if (!running) return;
    animFrameId = requestAnimationFrame(draw);

    time = timestamp * 0.001;
    const lay = getLayout();
    const { w, h, divX, leftCX, rightCX, figureCY, groundY } = lay;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#06080f';
    ctx.fillRect(0, 0, w, h);

    // Grid
    drawGrid(w, h);

    // Header
    drawHeader(w);

    // VS divider
    drawDivider(divX, 82, h - 10);

    // Column labels
    drawColumnLabels(lay);

    // ---- LEFT SIDE: Static draggable puppet ----
    leftCanvasJoints = drawFigure(leftJoints, leftCX, groundY, {
      jointColor: 'rgba(80, 140, 255, 0.85)',
      boneColor: 'rgba(200, 215, 255, 0.8)',
      boneAlpha: 0.8,
      showHandles: true,
      hoverIdx: hoverJoint,
      headFill: 'rgba(180, 200, 255, 0.8)',
    });

    // Left side hint
    drawHints(lay);

    // ---- RIGHT SIDE: Animated walk cycle ----
    const walkPose = computeWalkPose(semanticSliders, time);
    drawFigure(walkPose, rightCX, groundY, {
      jointColor: 'rgba(255, 100, 180, 0.7)',
      boneColor: 'rgba(255, 210, 230, 0.8)',
      boneAlpha: 0.8,
      showHandles: false,
      headFill: 'rgba(255, 200, 220, 0.8)',
    });

    // Right side: "Move any slider" hint (above figure, only if sliders haven't been touched much)
    ctx.save();
    ctx.font = '400 11px "Inter", -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255, 100, 180, 0.45)';
    ctx.fillText('One slider changes all 12 joints at once', rightCX, figureCY - 110);
    ctx.restore();

    ctx.restore();

    // Position DOM sliders
    positionSliders();
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
      container.style.webkitUserSelect = 'none';

      // Create canvas
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
      container.appendChild(canvas);
      ctx = canvas.getContext('2d');

      // Initialize left-side puppet with default pose
      leftJoints = defaultPose();
      leftDragCount = 0;
      dragJoint = -1;
      hoverJoint = -1;

      // Create DOM sliders for right side
      createSliders();

      // Bind events
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
      positionSliders();
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
      if (sliderContainer && sliderContainer.parentNode) {
        sliderContainer.parentNode.removeChild(sliderContainer);
      }
      // Remove any style elements we added
      const styles = container ? container.querySelectorAll('style') : [];
      styles.forEach(s => s.remove());
      sliderContainer = null;
      sliderEls = [];
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SemanticAnimationSection;
