// ============================================================
// Animation Spectrum — Interactive Demo Section
// The full Procedural+AI progression: IK -> PFNN -> RL+Physics
// -> DeepMimic -> RL+IL+Procedural
// ============================================================

const AnimSpectrumSection = (() => {
  let container, canvas, ctx;
  let running = false, animFrameId = null;
  let width = 0, height = 0, dpr = 1;
  let time = 0;

  // ---- Mouse / touch state ----
  let mouse = { x: 0, y: 0 };
  let mouseDown = false;
  let artSliderActive = false;
  let artSliderHovered = false;
  let artSliderRect = null;
  let artDirection = 0.5; // 0-1 for RL+IL+P art direction slider

  // ---- Bound handlers ----
  let boundMouseDown, boundMouseMove, boundMouseUp;
  let boundTouchStart, boundTouchMove, boundTouchEnd;

  // ================================================================
  //  SKELETON DEFINITION (shared across all 5 methods)
  // ================================================================
  const JOINT_NAMES = [
    'root', 'spine', 'neck', 'head',
    'shoulder_l', 'elbow_l', 'hand_l',
    'shoulder_r', 'elbow_r', 'hand_r',
    'hip_l', 'knee_l', 'foot_l',
    'hip_r', 'knee_r', 'foot_r',
  ];

  const JOINT_PARENT = [
    -1, 0, 1, 2,
    2, 4, 5,
    2, 7, 8,
    0, 10, 11,
    0, 13, 14,
  ];

  const BONE_LENGTHS = [
    0, 45, 14, 0,
    16, 26, 24,
    16, 26, 24,
    11, 32, 28,
    11, 32, 28,
  ];

  const HEAD_RADIUS = 12;

  // ================================================================
  //  METHOD DEFINITIONS
  // ================================================================
  const METHODS = [
    {
      id: 'ik',
      title: 'Procedural IK',
      subtitle: 'Controllable but stiff',
      color: '#8b9cff',
    },
    {
      id: 'pfnn',
      title: 'Supervised Learning',
      subtitle: 'Smooth, no physics',
      color: '#6effb4',
    },
    {
      id: 'rl_physics',
      title: 'RL + Physics',
      subtitle: 'Generalizable but unnatural',
      color: '#ff9d6e',
    },
    {
      id: 'deepmimic',
      title: 'RL + Imitation',
      subtitle: 'Natural gait, faithful',
      color: '#ff6eb4',
    },
    {
      id: 'rl_il_proc',
      title: 'RL + IL + Procedural',
      subtitle: 'Natural + artist control',
      color: '#c896ff',
    },
  ];

  // ================================================================
  //  COMPARISON MATRIX DATA
  // ================================================================
  const MATRIX_PROPS = ['Controllability', 'Naturalness', 'Physics Response', 'Art Direction'];
  const MATRIX_DATA = [
    [5, 2, 1, 2, 4], // Controllability
    [1, 4, 2, 5, 5], // Naturalness
    [0, 0, 5, 4, 4], // Physics Response
    [3, 1, 0, 1, 5], // Art Direction
  ];

  // ================================================================
  //  FORWARD KINEMATICS
  // ================================================================
  function forwardKinematics(angles, rootX, rootY, scale, baseX, baseY) {
    const positions = [];
    const worldAngles = new Float64Array(16);

    for (let i = 0; i < 16; i++) {
      const parent = JOINT_PARENT[i];
      if (parent === -1) {
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
  //  BASE WALK CYCLE (common timing, method modifies output)
  // ================================================================
  function baseWalkAngles(phase, stride, armSwing, bounce, leanFwd) {
    const sin = Math.sin;
    const cos = Math.cos;
    const angles = new Float64Array(16);

    const torsoAngle = -Math.PI / 2 - leanFwd * 0.3;
    angles[1] = torsoAngle + sin(phase * 2) * 0.02;
    angles[2] = sin(phase * 2) * 0.03 + leanFwd * 0.1;
    angles[3] = sin(phase * 2) * 0.08;

    angles[4] = Math.PI * 0.38;
    angles[7] = -Math.PI * 0.38;

    angles[5] = sin(phase) * armSwing * 0.65;
    angles[6] = -Math.abs(sin(phase)) * armSwing * 0.25 - 0.08;
    angles[8] = sin(phase + Math.PI) * armSwing * 0.65;
    angles[9] = -Math.abs(sin(phase + Math.PI)) * armSwing * 0.25 - 0.08;

    angles[10] = Math.PI * 0.5 + sin(phase) * 0.06;
    angles[13] = -Math.PI * 0.5 - sin(phase) * 0.06;

    angles[11] = sin(phase) * stride * 0.55;
    angles[14] = sin(phase + Math.PI) * stride * 0.55;

    const kneeBendL = Math.max(0, -sin(phase - 0.3)) * stride * 0.6;
    const kneeBendR = Math.max(0, -sin(phase + Math.PI - 0.3)) * stride * 0.6;
    angles[12] = kneeBendL;
    angles[15] = kneeBendR;

    const rootY = -sin(phase * 2) * bounce * 6;
    const rootX = sin(phase) * 2;

    return { angles, rootX, rootY };
  }

  // ================================================================
  //  METHOD-SPECIFIC ANIMATION GENERATORS
  // ================================================================

  // State for RL+Physics perturbation
  let rlPerturbState = new Float64Array(16);
  let rlPerturbVel = new Float64Array(16);

  // State for DeepMimic tracking error
  let deepMimicError = new Float64Array(16);

  function computeMethodPose(methodId, t, artDir) {
    const speed = 3.2;
    const phase = t * speed;

    switch (methodId) {
      case 'ik': {
        // Pure IK: stiff, mechanical, snappy interpolation
        // Quantize phase to create stepping feel
        const quantPhase = Math.floor(phase * 4) / 4;
        // Mix between quantized and smooth with bias toward snappy
        const snapPhase = quantPhase * 0.6 + phase * 0.4;
        const base = baseWalkAngles(snapPhase, 0.5, 0.25, 0.05, 0.15);

        // Remove secondary motion — zero out subtle oscillations
        base.angles[2] = 0.15 * 0.1; // minimal neck
        base.angles[3] = 0; // no head bob
        base.rootY = 0; // no bounce
        base.rootX = 0; // no sway

        return base;
      }

      case 'pfnn': {
        // PFNN: very smooth phase-based interpolation, fluid, floaty
        // Use smooth sinusoidal with additional harmonics for organic feel
        const smoothPhase = phase;
        const base = baseWalkAngles(smoothPhase, 0.55, 0.45, 0.35, 0.12);

        // Add smooth secondary harmonics
        base.angles[3] += Math.sin(smoothPhase * 1.7) * 0.06; // head float
        base.angles[2] += Math.sin(smoothPhase * 2.3) * 0.04; // neck flow
        base.rootY += Math.sin(smoothPhase * 1.5) * 2; // extra float

        // Slight foot slide effect: reduce knee bend precision
        base.angles[12] *= 0.85;
        base.angles[15] *= 0.85;

        return base;
      }

      case 'rl_physics': {
        // RL + Physics: perturbations + spring-damper recovery
        const base = baseWalkAngles(phase, 0.6, 0.35, 0.25, 0.2);

        // Apply perturbation noise
        const dt = 0.016;
        const springK = 12;
        const damping = 3.5;
        const noiseAmp = 0.8;

        for (let i = 1; i < 16; i++) {
          // Random perturbation force (deterministic from time+joint)
          const seed = Math.sin(t * 7.3 + i * 31.7) * Math.cos(t * 3.1 + i * 17.3);
          const perturbForce = seed * noiseAmp * dt;

          // Spring-damper: try to return to base angles
          const error = rlPerturbState[i];
          const springForce = -springK * error * dt;
          const dampForce = -damping * rlPerturbVel[i] * dt;

          rlPerturbVel[i] += springForce + dampForce + perturbForce;
          rlPerturbState[i] += rlPerturbVel[i] * dt;

          // Clamp
          rlPerturbState[i] = Math.max(-0.3, Math.min(0.3, rlPerturbState[i]));

          base.angles[i] += rlPerturbState[i];
        }

        // Wider, more awkward stance
        base.angles[10] += 0.08;
        base.angles[13] -= 0.08;

        // Occasional stumble
        const stumble = Math.sin(t * 0.7) > 0.92 ? Math.sin(t * 15) * 0.1 : 0;
        base.rootX += stumble * 8;
        base.rootY += Math.abs(stumble) * 5;

        return base;
      }

      case 'deepmimic': {
        // DeepMimic: reference tracking with smooth error correction
        // Hand-crafted "ideal" reference walk
        const refStride = 0.55;
        const refArm = 0.4;
        const refBounce = 0.3;
        const refLean = 0.1;
        const ref = baseWalkAngles(phase, refStride, refArm, refBounce, refLean);

        // Tracking with subtle variation
        const dt = 0.016;
        const trackingSpeed = 8;

        for (let i = 1; i < 16; i++) {
          // Smooth error correction toward reference
          const target = ref.angles[i];
          const current = target + deepMimicError[i];

          // Add small natural variation
          const variation = Math.sin(t * 2.3 + i * 5.7) * 0.015;
          const errorTarget = variation;

          deepMimicError[i] += (errorTarget - deepMimicError[i]) * trackingSpeed * dt;
          ref.angles[i] = current;
        }

        // Natural weight transfer — subtle hip shift
        ref.rootX += Math.sin(phase) * 1.5;
        // Add realistic secondary head bob
        ref.angles[3] += Math.sin(phase * 2) * 0.05 + Math.sin(phase * 3) * 0.02;

        return ref;
      }

      case 'rl_il_proc': {
        // RL + IL + Procedural: DeepMimic base + artist-controllable overlays
        const refStride = 0.45 + artDir * 0.35;
        const refArm = 0.3 + artDir * 0.35;
        const refBounce = 0.2 + artDir * 0.35;
        const refLean = 0.08 + (1 - artDir) * 0.12;
        const ref = baseWalkAngles(phase, refStride, refArm, refBounce, refLean);

        // Same natural tracking as DeepMimic
        for (let i = 1; i < 16; i++) {
          const variation = Math.sin(t * 2.1 + i * 4.3) * 0.012;
          ref.angles[i] += variation;
        }

        // Artist direction affects secondary motion intensity
        ref.angles[3] += Math.sin(phase * 2) * (0.03 + artDir * 0.06);
        ref.rootX += Math.sin(phase) * (1 + artDir * 2);
        ref.rootY += Math.sin(phase * 3) * artDir * 2;

        // Foot lift modulation from art direction
        ref.angles[12] *= (0.8 + artDir * 0.5);
        ref.angles[15] *= (0.8 + artDir * 0.5);

        return ref;
      }

      default:
        return baseWalkAngles(phase, 0.5, 0.4, 0.3, 0.1);
    }
  }

  // ================================================================
  //  DRAW STICK FIGURE
  // ================================================================
  function drawStickFigure(ctx, positions, scale, alpha, color, groundY) {
    const jointR = Math.max(2.5, 4 * scale);
    const boneW = Math.max(2, 3 * scale);
    const headR = HEAD_RADIUS * scale;

    ctx.save();
    ctx.globalAlpha = alpha;

    const rootPos = positions[0];

    // Ground shadow
    ctx.save();
    ctx.globalAlpha = alpha * 0.12;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(rootPos.x, groundY + 2, 20 * scale, 3 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Ground line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rootPos.x - 35 * scale, groundY);
    ctx.lineTo(rootPos.x + 35 * scale, groundY);
    ctx.stroke();

    // Draw bones
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * 0.8;
    ctx.lineWidth = boneW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const bonePairs = [
      [0, 1], [1, 2], [2, 4], [4, 5], [5, 6],
      [2, 7], [7, 8], [8, 9],
      [0, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15],
    ];

    for (const [a, b] of bonePairs) {
      ctx.beginPath();
      ctx.moveTo(positions[a].x, positions[a].y);
      ctx.lineTo(positions[b].x, positions[b].y);
      ctx.stroke();
    }

    // Joints
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = color;
    for (let i = 0; i < positions.length; i++) {
      if (i === 3) continue;
      ctx.beginPath();
      ctx.arc(positions[i].x, positions[i].y, jointR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Head
    const headPos = positions[3];
    const neckPos = positions[2];
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * 0.8;
    ctx.lineWidth = boneW;
    ctx.beginPath();
    ctx.moveTo(neckPos.x, neckPos.y);
    ctx.lineTo(headPos.x, headPos.y);
    ctx.stroke();

    const headGrad = ctx.createRadialGradient(
      headPos.x - headR * 0.2, headPos.y - headR * 0.2, headR * 0.1,
      headPos.x, headPos.y, headR
    );
    headGrad.addColorStop(0, color + '55');
    headGrad.addColorStop(1, color + '15');
    ctx.fillStyle = headGrad;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(headPos.x, headPos.y, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * 0.7;
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.stroke();

    ctx.restore();
  }

  // ================================================================
  //  DRAW COMPARISON MATRIX
  // ================================================================
  function drawMatrix(ctx, startX, startY, totalW, scale) {
    const cols = 5;
    const rows = MATRIX_PROPS.length;
    const colW = totalW / cols;
    const rowH = 24;
    const dotR = 3.5;
    const dotSpacing = 10;
    const labelW = 110;

    // Matrix header divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX - labelW, startY - 2);
    ctx.lineTo(startX + totalW, startY - 2);
    ctx.stroke();

    // Row labels
    ctx.font = '400 10px "Inter", -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < rows; r++) {
      const ry = startY + r * rowH + rowH / 2;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillText(MATRIX_PROPS[r], startX - 12, ry);

      // Draw dots for each method
      for (let c = 0; c < cols; c++) {
        const rating = MATRIX_DATA[r][c];
        const cx = startX + c * colW + colW / 2;
        const color = METHODS[c].color;
        const totalDotW = 4 * dotSpacing;
        const dotStartX = cx - totalDotW / 2;

        for (let d = 0; d < 5; d++) {
          const dx = dotStartX + d * dotSpacing;
          if (d < rating) {
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.75;
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.globalAlpha = 1;
          }
          ctx.beginPath();
          ctx.arc(dx, ry, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // Row separator
      if (r < rows - 1) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.beginPath();
        ctx.moveTo(startX - labelW, ry + rowH / 2);
        ctx.lineTo(startX + totalW, ry + rowH / 2);
        ctx.stroke();
      }
    }
  }

  // ================================================================
  //  DRAW ART DIRECTION SLIDER (for method 5)
  // ================================================================
  function drawArtSlider(ctx, cx, y, sliderW) {
    const sliderH = 5;
    const sx = cx - sliderW / 2;
    const color = METHODS[4].color;

    artSliderRect = {
      x: sx,
      y: y - 10,
      w: sliderW,
      h: 30,
      trackY: y,
    };

    // Label
    ctx.font = '500 9px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = 'rgba(200, 150, 255, 0.5)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Art Direction', cx, y - 5);

    // Track bg
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.beginPath();
    ctx.roundRect(sx, y, sliderW, sliderH, sliderH / 2);
    ctx.fill();

    // Filled
    const fillW = sliderW * artDirection;
    if (fillW > 0) {
      const grad = ctx.createLinearGradient(sx, 0, sx + fillW, 0);
      grad.addColorStop(0, color + '30');
      grad.addColorStop(1, color + 'bb');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(sx, y, fillW, sliderH, sliderH / 2);
      ctx.fill();
    }

    // Thumb
    const thumbX = sx + sliderW * artDirection;
    const thumbR = artSliderActive ? 6 : artSliderHovered ? 5 : 4;

    if (artSliderActive) {
      ctx.fillStyle = color + '25';
      ctx.beginPath();
      ctx.arc(thumbX, y + sliderH / 2, thumbR * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(thumbX, y + sliderH / 2, thumbR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(thumbX, y + sliderH / 2, thumbR * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Range labels
    ctx.font = '400 8px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Subtle', sx, y + sliderH + 4);
    ctx.textAlign = 'right';
    ctx.fillText('Expressive', sx + sliderW, y + sliderH + 4);
  }

  // ================================================================
  //  DRAW HEADER
  // ================================================================
  function drawHeader(ctx, w) {
    const headerY = 16;

    ctx.font = '600 11px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = 'rgba(100, 140, 255, 0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('THE ANIMATION SPECTRUM', w / 2, headerY);

    ctx.font = '700 22px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillText('The Animation Spectrum', w / 2, headerY + 16);

    ctx.font = '400 12px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillText(
      'From purely procedural to AI-driven \u2014 each approach has trade-offs in controllability,',
      w / 2, headerY + 44
    );
    ctx.fillText(
      'naturalness, and physics response',
      w / 2, headerY + 60
    );
  }

  // ================================================================
  //  DRAW METHOD VISUAL INDICATORS
  // ================================================================
  function drawMethodIndicator(ctx, method, cx, indicatorY, scale, t) {
    const id = method.id;
    const color = method.color;
    const indicatorR = 3;

    switch (id) {
      case 'ik': {
        // Mechanical gear/grid icon
        ctx.strokeStyle = color + '40';
        ctx.lineWidth = 1;
        const gridN = 3;
        const gridS = 5;
        const gx = cx - gridN * gridS / 2;
        const gy = indicatorY - gridN * gridS / 2;
        for (let i = 0; i <= gridN; i++) {
          ctx.beginPath();
          ctx.moveTo(gx + i * gridS, gy);
          ctx.lineTo(gx + i * gridS, gy + gridN * gridS);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(gx, gy + i * gridS);
          ctx.lineTo(gx + gridN * gridS, gy + i * gridS);
          ctx.stroke();
        }
        break;
      }
      case 'pfnn': {
        // Smooth wave
        ctx.strokeStyle = color + '50';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = -15; i <= 15; i++) {
          const x = cx + i;
          const y = indicatorY + Math.sin((i + t * 40) * 0.3) * 4;
          if (i === -15) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        break;
      }
      case 'rl_physics': {
        // Noisy signal
        ctx.strokeStyle = color + '50';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = -15; i <= 15; i++) {
          const x = cx + i;
          const noise = Math.sin(i * 1.7 + t * 8) * Math.cos(i * 0.9 + t * 5) * 5;
          const y = indicatorY + noise;
          if (i === -15) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        break;
      }
      case 'deepmimic': {
        // Reference tracking — two overlapping curves
        ctx.lineWidth = 1;
        // Reference (dashed)
        ctx.strokeStyle = color + '30';
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        for (let i = -15; i <= 15; i++) {
          const x = cx + i;
          const y = indicatorY + Math.sin(i * 0.35) * 4;
          if (i === -15) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        // Tracked (solid)
        ctx.strokeStyle = color + '60';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = -15; i <= 15; i++) {
          const x = cx + i;
          const y = indicatorY + Math.sin(i * 0.35) * 4 + Math.sin(i * 2 + t * 3) * 0.5;
          if (i === -15) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        break;
      }
      case 'rl_il_proc': {
        // Layered signal with adjustable amplitude
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = color + '50';
        ctx.beginPath();
        for (let i = -15; i <= 15; i++) {
          const x = cx + i;
          const base = Math.sin(i * 0.35) * 3;
          const artist = Math.sin(i * 0.7 + t * 2) * 2 * artDirection;
          const y = indicatorY + base + artist;
          if (i === -15) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        break;
      }
    }
  }

  // ================================================================
  //  INPUT HANDLING
  // ================================================================
  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function hitTestArtSlider(mx, my) {
    if (!artSliderRect) return false;
    const r = artSliderRect;
    return mx >= r.x - 5 && mx <= r.x + r.w + 5 && my >= r.y && my <= r.y + r.h;
  }

  function updateArtSlider(mx) {
    if (!artSliderRect) return;
    let norm = (mx - artSliderRect.x) / artSliderRect.w;
    artDirection = Math.max(0, Math.min(1, norm));
  }

  function onMouseDown(e) {
    const pos = getCanvasPos(e);
    mouseDown = true;
    if (hitTestArtSlider(pos.x, pos.y)) {
      artSliderActive = true;
      updateArtSlider(pos.x);
      canvas.style.cursor = 'grabbing';
    }
  }

  function onMouseMove(e) {
    const pos = getCanvasPos(e);
    mouse = pos;
    if (artSliderActive) {
      updateArtSlider(pos.x);
      return;
    }
    artSliderHovered = hitTestArtSlider(pos.x, pos.y);
    canvas.style.cursor = artSliderHovered ? 'grab' : 'default';
  }

  function onMouseUp() {
    artSliderActive = false;
    mouseDown = false;
    canvas.style.cursor = artSliderHovered ? 'grab' : 'default';
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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.012)';
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

    // Layout: 5 columns
    const marginX = 40;
    const usableW = w - marginX * 2;
    const colW = usableW / 5;
    const figureScale = Math.min(colW / 140, h / 800, 0.85) * 0.75;
    const figureY = h * 0.34;
    const groundY = figureY + 75 * figureScale;
    const labelY = 85;

    // Draw column separators
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const sx = marginX + i * colW;
      ctx.beginPath();
      ctx.moveTo(sx, labelY);
      ctx.lineTo(sx, groundY + 30);
      ctx.stroke();
    }

    // Progressive arrow at top
    ctx.strokeStyle = 'rgba(100, 140, 255, 0.12)';
    ctx.lineWidth = 1.5;
    const arrowY = labelY - 4;
    ctx.beginPath();
    ctx.moveTo(marginX + colW * 0.3, arrowY);
    ctx.lineTo(marginX + colW * 4.7, arrowY);
    ctx.stroke();
    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(marginX + colW * 4.7, arrowY);
    ctx.lineTo(marginX + colW * 4.6, arrowY - 4);
    ctx.moveTo(marginX + colW * 4.7, arrowY);
    ctx.lineTo(marginX + colW * 4.6, arrowY + 4);
    ctx.stroke();

    ctx.font = '400 9px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = 'rgba(100, 140, 255, 0.5)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('More procedural', marginX + colW * 0.3, arrowY - 4);
    ctx.textAlign = 'right';
    ctx.fillText('More AI-driven', marginX + colW * 4.7, arrowY - 4);

    // Draw each method
    for (let m = 0; m < 5; m++) {
      const method = METHODS[m];
      const cx = marginX + (m + 0.5) * colW;

      // Method title
      ctx.font = '600 11px "Inter", -apple-system, sans-serif';
      ctx.fillStyle = method.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(method.title, cx, labelY + 4);

      // Subtitle
      ctx.font = '400 10px "Inter", -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillText(method.subtitle, cx, labelY + 20);

      // Method-specific visual indicator
      drawMethodIndicator(ctx, method, cx, labelY + 42, figureScale, t);

      // Compute pose
      const pose = computeMethodPose(method.id, t, artDirection);
      const positions = forwardKinematics(
        pose.angles, pose.rootX, pose.rootY,
        figureScale, cx, figureY
      );

      // Draw character
      drawStickFigure(ctx, positions, figureScale, 0.9, method.color, groundY);

      // Method number badge
      ctx.save();
      ctx.fillStyle = method.color + '15';
      ctx.beginPath();
      ctx.arc(cx, figureY - 55 * figureScale, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '700 9px "Inter", -apple-system, sans-serif';
      ctx.fillStyle = method.color + '60';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(m + 1), cx, figureY - 55 * figureScale);
      ctx.restore();
    }

    // Art Direction slider for method 5
    const method5cx = marginX + 4.5 * colW;
    const artSliderY = groundY + 18;
    const artSliderW = colW * 0.7;
    drawArtSlider(ctx, method5cx, artSliderY, artSliderW);

    // ---- COMPARISON MATRIX ----
    const matrixY = groundY + 58;
    const matrixW = usableW;
    const matrixLabelW = 110;

    // Matrix title
    ctx.font = '600 11px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = 'rgba(100, 140, 255, 0.4)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('COMPARISON', marginX, matrixY - 16);

    drawMatrix(ctx, marginX + matrixLabelW, matrixY, matrixW - matrixLabelW, figureScale);

    // Method name headers for matrix columns
    ctx.font = '500 9px "Inter", -apple-system, sans-serif';
    ctx.textBaseline = 'bottom';
    const matrixColW = (matrixW - matrixLabelW) / 5;
    for (let m = 0; m < 5; m++) {
      const cx = marginX + matrixLabelW + (m + 0.5) * matrixColW;
      ctx.fillStyle = METHODS[m].color + '70';
      ctx.textAlign = 'center';
      ctx.fillText(METHODS[m].title, cx, matrixY - 4);
    }

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

      // Reset perturbation state
      rlPerturbState = new Float64Array(16);
      rlPerturbVel = new Float64Array(16);
      deepMimicError = new Float64Array(16);

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

if (typeof module !== 'undefined' && module.exports) module.exports = AnimSpectrumSection;
