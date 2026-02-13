// ============================================================
// Animation Spectrum — Narrative Storytelling Section
// "The Convergent Path": How character animation and AI
// independently discovered RL + human-aligned constraints.
// ============================================================

const AnimSpectrumSection = (() => {
  // ---- Private state ----
  let container, canvas, ctx;
  let running = false, animFrameId = null;
  let width = 0, height = 0, dpr = 1;
  let time = 0;
  let currentStep = 0;
  let autoAdvanceTimer = null;
  let idleResumeTimer = null;
  let autoAdvancePaused = false;
  let stepTransitioning = false;

  // ---- Art direction slider (Step 6) ----
  let artDirection = 0.5;

  // ---- Physics state ----
  let rlPerturbState = new Float64Array(16);
  let rlPerturbVel = new Float64Array(16);
  let deepMimicError = new Float64Array(16);

  // ---- Collapse state (Step 3) ----
  let collapsePhase = 0; // 0 = walking, 1 = fully collapsed
  let collapseTimer = 0;
  const COLLAPSE_WALK_DURATION = 2.0;
  const COLLAPSE_FALL_DURATION = 1.5;
  const COLLAPSE_STAY_DURATION = 1.5;
  const COLLAPSE_CYCLE = COLLAPSE_WALK_DURATION + COLLAPSE_FALL_DURATION + COLLAPSE_STAY_DURATION;

  // ---- DOM references ----
  let domWrapper, headerEl, stepNav, contentArea, timelineStrip;
  let leftCol, rightCol, canvasWrap;
  let stepDots = [];
  let stepContentEls = {};

  // ================================================================
  //  SKELETON DEFINITION
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
  //  STEP DATA — The 6-step narrative
  // ================================================================
  const STEPS = [
    {
      id: 'ik',
      num: 1,
      title: 'Purely Procedural',
      subtitle: 'Inverse Kinematics',
      color: '#8b9cff',
      description: 'Purely IK rigging-based animation. Hand-crafted rules drive each joint toward target positions. Looks good, but expensive to create and maintain. Has some generalization \u2014 rigs can work for characters of different sizes and body shapes \u2014 but fundamentally limited by what the programmer anticipates.',
      strengths: ['Full artist control', 'Predictable behavior'],
      weaknesses: ['Expensive to create', 'Limited generalization', 'Brittle to new situations'],
      insight: 'Like expert systems in AI: powerful within narrow domains, but every edge case must be hand-coded.',
      timelineCG: 'IK',
      timelineAI: 'Expert Systems',
    },
    {
      id: 'pfnn',
      num: 2,
      title: 'Supervised Learning',
      subtitle: 'Phase-Functioned Neural Networks (SIGGRAPH 2017)',
      color: '#6effb4',
      description: 'Daniel Holden, Taku Komura, and Jun Saito trained a neural network on massive motion capture datasets. The Phase-Functioned Neural Network produces remarkably smooth, appealing motion by learning the statistical patterns of human movement.',
      subtext: 'MoCap Data \u2192 Procedural Augmentation \u2192 PFNN \u2192 Motion Generation',
      strengths: ['Very smooth motion', 'Learns from real human data'],
      weaknesses: ['No physics awareness', 'Not easily art-directable', 'No agentive behavior (only control, no autonomy)'],
      insight: 'Like ImageNet-era deep learning: impressive pattern recognition, but no understanding of the underlying physics.',
      timelineCG: 'PFNN',
      timelineAI: 'ImageNet',
    },
    {
      id: 'sl_physics_fail',
      num: 3,
      title: 'The Failure Point',
      subtitle: 'When supervised learning meets physics',
      color: '#ff5555',
      description: 'Researchers at Nvidia took the PFNN work and added physics simulation. The character immediately falls down \u2014 it was never trained to react to physical forces. Without RL, there\'s no policy telling the character to stay upright. Supervised learning is brittle outside its training distribution.',
      strengths: [],
      weaknesses: ['Character collapses under physics', 'No recovery policy', 'SL can\'t generalize to unseen forces'],
      insight: 'The critical lesson: learning patterns is not the same as learning to act. A model trained on "what happens" cannot handle "what to do when things go wrong."',
      timelineCG: 'PFNN+Physics',
      timelineAI: 'AlphaGo',
    },
    {
      id: 'rl_physics',
      num: 4,
      title: 'RL + Physics',
      subtitle: 'DeepLoco (2017) \u00B7 Emergence of Locomotion (DeepMind, 2017)',
      color: '#ff9d6e',
      description: 'Let the character learn from scratch through trial and error in a physics simulation. RL discovers locomotion behaviors emergently \u2014 running, jumping, crouching \u2014 without being explicitly taught each one. More generalized and robust to perturbation. But the motions don\'t look natural. More joints and bones = more unnatural movement.',
      strengths: ['Handles perturbation', 'Emergent behaviors', 'Physics-aware'],
      weaknesses: ['Unnatural gaits', 'Alien movement strategies', 'No human-likeness guarantee'],
      insight: 'RL finds solutions that work but aren\'t human. Like early game-playing AI: it wins, but in ways no human would recognize.',
      timelineCG: 'DeepLoco',
      timelineAI: 'OpenAI Five',
    },
    {
      id: 'deepmimic',
      num: 5,
      title: 'The Breakthrough',
      subtitle: 'DeepMimic \u2014 Peng, Abbeel, Levine, van de Panne (SIGGRAPH 2018)',
      color: '#ff6eb4',
      description: 'DeepMimic combines RL with reference motion as a reward signal. The character learns to imitate expert motion capture while remaining robust to physics. Natural AND generalized. The key formula: RL for robustness + human-aligned constraints for quality.',
      strengths: ['Natural motion', 'Physics-robust', 'Generalizes to new situations'],
      weaknesses: ['Less art-directable than procedural', 'Depends on quality reference data'],
      insight: 'The same formula that would later transform AI: RL + human-aligned constraints. Reference motion in CG (2018). Human preferences in AI (2022). Both fields converged on the same insight independently.',
      timelineCG: 'DeepMimic',
      timelineAI: 'RLHF/ChatGPT',
    },
    {
      id: 'rl_il_proc',
      num: 6,
      title: 'Full Circle',
      subtitle: 'Adding artist control back \u2014 Overgrowth (~2019)',
      color: '#c896ff',
      description: 'The final step: adding procedural controls on top of learned behavior. The machine learns the hard part (physics, natural motion); the artist directs the expression (stride, energy, style). Art challenges technology, and technology inspires the art.',
      strengths: ['Natural motion', 'Physics-robust', 'Art-directable', 'Full circle'],
      weaknesses: ['Most complex pipeline'],
      insight: 'The endgame for both fields: AI handles the complexity, humans steer the intent. Constitutional AI in language models. Procedural overlays in animation. The human stays in the loop.',
      timelineCG: 'Overgrowth',
      timelineAI: 'Constitutional AI',
    },
  ];

  // ================================================================
  //  TIMELINE DATA
  // ================================================================
  const CG_MILESTONES = [
    { label: 'IK', year: 'pre-2010', x: 0.08, step: 0 },
    { label: 'PFNN', year: '2017', x: 0.28, step: 1 },
    { label: 'PFNN+Physics', year: '2018', x: 0.42, step: 2, fail: true },
    { label: 'DeepLoco', year: '2017', x: 0.55, step: 3 },
    { label: 'DeepMimic', year: '2018', x: 0.72, step: 4, breakthrough: true },
    { label: 'Overgrowth', year: '~2019', x: 0.9, step: 5 },
  ];

  const AI_MILESTONES = [
    { label: 'Expert Systems', year: '1970s', x: 0.08, step: 0 },
    { label: 'ImageNet', year: '2012', x: 0.28, step: 1 },
    { label: 'AlphaGo', year: '2016', x: 0.42, step: 2 },
    { label: 'OpenAI Five', year: '2018', x: 0.55, step: 3 },
    { label: 'RLHF/ChatGPT', year: '2022', x: 0.72, step: 4, breakthrough: true },
    { label: 'Constitutional AI', year: '2023', x: 0.9, step: 5 },
  ];

  // Connections between parallel milestones
  const TIMELINE_CONNECTIONS = [
    { cgIdx: 0, aiIdx: 0 },
    { cgIdx: 1, aiIdx: 1 },
    { cgIdx: 3, aiIdx: 2 },
    { cgIdx: 4, aiIdx: 4 },
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
  //  BASE WALK CYCLE
  // ================================================================
  function baseWalkAngles(phase, stride, armSwing, bounce, leanFwd) {
    const sin = Math.sin;
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
  function computeMethodPose(stepId, t, artDir) {
    const speed = 3.2;
    const phase = t * speed;

    switch (stepId) {
      case 'ik': {
        // Pure IK: stiff, mechanical, snappy
        const quantPhase = Math.floor(phase * 4) / 4;
        const snapPhase = quantPhase * 0.6 + phase * 0.4;
        const base = baseWalkAngles(snapPhase, 0.5, 0.25, 0.05, 0.15);
        base.angles[2] = 0.15 * 0.1;
        base.angles[3] = 0;
        base.rootY = 0;
        base.rootX = 0;
        return base;
      }

      case 'pfnn': {
        // PFNN: very smooth, fluid, slightly floaty
        const base = baseWalkAngles(phase, 0.55, 0.45, 0.35, 0.12);
        base.angles[3] += Math.sin(phase * 1.7) * 0.06;
        base.angles[2] += Math.sin(phase * 2.3) * 0.04;
        base.rootY += Math.sin(phase * 1.5) * 2;
        base.angles[12] *= 0.85;
        base.angles[15] *= 0.85;
        return base;
      }

      case 'sl_physics_fail': {
        // Starts smooth, then collapses
        collapseTimer = t % COLLAPSE_CYCLE;

        if (collapseTimer < COLLAPSE_WALK_DURATION) {
          // Walking phase (like PFNN)
          collapsePhase = 0;
          const base = baseWalkAngles(phase, 0.55, 0.45, 0.35, 0.12);
          base.angles[3] += Math.sin(phase * 1.7) * 0.06;
          base.angles[2] += Math.sin(phase * 2.3) * 0.04;
          // Add subtle instability near the end
          const instability = Math.max(0, (collapseTimer - COLLAPSE_WALK_DURATION * 0.6)) / (COLLAPSE_WALK_DURATION * 0.4);
          base.angles[1] += instability * 0.15 * Math.sin(t * 8);
          base.rootX += instability * 4;
          return base;
        } else if (collapseTimer < COLLAPSE_WALK_DURATION + COLLAPSE_FALL_DURATION) {
          // Falling phase
          const fallProgress = (collapseTimer - COLLAPSE_WALK_DURATION) / COLLAPSE_FALL_DURATION;
          collapsePhase = fallProgress;
          const eased = 1 - Math.pow(1 - fallProgress, 2); // ease-in quad

          const base = baseWalkAngles(phase, 0.55, 0.45, 0.35, 0.12);

          // Torso tilts forward and down
          base.angles[1] = -Math.PI / 2 + eased * 1.2;
          // Knees buckle
          base.angles[12] = eased * 1.4;
          base.angles[15] = eased * 1.2;
          // Arms flail then go limp
          base.angles[5] = Math.sin(t * 12) * (1 - eased) * 0.8 - eased * 0.5;
          base.angles[8] = Math.sin(t * 11 + 1) * (1 - eased) * 0.8 + eased * 0.3;
          // Head drops
          base.angles[3] = eased * 0.6;
          // Root drops
          base.rootY = eased * 55;
          base.rootX = eased * 8;

          return base;
        } else {
          // On the ground
          collapsePhase = 1;
          const base = baseWalkAngles(0, 0, 0, 0, 0);
          base.angles[1] = -Math.PI / 2 + 1.2;
          base.angles[12] = 1.4;
          base.angles[15] = 1.2;
          base.angles[5] = -0.5;
          base.angles[8] = 0.3;
          base.angles[3] = 0.6;
          base.rootY = 55;
          base.rootX = 8;
          // Subtle breathing/settling
          base.angles[1] += Math.sin(t * 2) * 0.02;
          return base;
        }
      }

      case 'rl_physics': {
        // RL + Physics: wide stance, over-corrections, spring-damper
        const base = baseWalkAngles(phase, 0.6, 0.35, 0.25, 0.2);
        const dt = 0.016;
        const springK = 12;
        const damping = 3.5;
        const noiseAmp = 0.8;

        for (let i = 1; i < 16; i++) {
          const seed = Math.sin(t * 7.3 + i * 31.7) * Math.cos(t * 3.1 + i * 17.3);
          const perturbForce = seed * noiseAmp * dt;
          const error = rlPerturbState[i];
          const springForce = -springK * error * dt;
          const dampForce = -damping * rlPerturbVel[i] * dt;

          rlPerturbVel[i] += springForce + dampForce + perturbForce;
          rlPerturbState[i] += rlPerturbVel[i] * dt;
          rlPerturbState[i] = Math.max(-0.3, Math.min(0.3, rlPerturbState[i]));
          base.angles[i] += rlPerturbState[i];
        }

        base.angles[10] += 0.08;
        base.angles[13] -= 0.08;

        const stumble = Math.sin(t * 0.7) > 0.92 ? Math.sin(t * 15) * 0.1 : 0;
        base.rootX += stumble * 8;
        base.rootY += Math.abs(stumble) * 5;

        return base;
      }

      case 'deepmimic': {
        // DeepMimic: reference tracking with natural variation
        const ref = baseWalkAngles(phase, 0.55, 0.4, 0.3, 0.1);
        const dt = 0.016;
        const trackingSpeed = 8;

        for (let i = 1; i < 16; i++) {
          const target = ref.angles[i];
          const current = target + deepMimicError[i];
          const variation = Math.sin(t * 2.3 + i * 5.7) * 0.015;
          deepMimicError[i] += (variation - deepMimicError[i]) * trackingSpeed * dt;
          ref.angles[i] = current;
        }

        ref.rootX += Math.sin(phase) * 1.5;
        ref.angles[3] += Math.sin(phase * 2) * 0.05 + Math.sin(phase * 3) * 0.02;

        return ref;
      }

      case 'rl_il_proc': {
        // RL + IL + Procedural: artist-controllable
        const refStride = 0.45 + artDir * 0.35;
        const refArm = 0.3 + artDir * 0.35;
        const refBounce = 0.2 + artDir * 0.35;
        const refLean = 0.08 + (1 - artDir) * 0.12;
        const ref = baseWalkAngles(phase, refStride, refArm, refBounce, refLean);

        for (let i = 1; i < 16; i++) {
          const variation = Math.sin(t * 2.1 + i * 4.3) * 0.012;
          ref.angles[i] += variation;
        }

        ref.angles[3] += Math.sin(phase * 2) * (0.03 + artDir * 0.06);
        ref.rootX += Math.sin(phase) * (1 + artDir * 2);
        ref.rootY += Math.sin(phase * 3) * artDir * 2;
        ref.angles[12] *= (0.8 + artDir * 0.5);
        ref.angles[15] *= (0.8 + artDir * 0.5);

        return ref;
      }

      default:
        return baseWalkAngles(phase, 0.5, 0.4, 0.3, 0.1);
    }
  }

  // ================================================================
  //  DRAW STICK FIGURE ON CANVAS
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
    ctx.globalAlpha = alpha * 0.15;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(rootPos.x, groundY + 2, 22 * scale, 3.5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Ground line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rootPos.x - 40 * scale, groundY);
    ctx.lineTo(rootPos.x + 40 * scale, groundY);
    ctx.stroke();

    // Draw bones
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * 0.85;
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
    ctx.globalAlpha = alpha * 0.85;
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
  //  CSS INJECTION
  // ================================================================
  function injectStyles() {
    const styleId = 'animspectrum-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .as-wrapper {
        position: relative;
        width: 100%;
        min-height: 100vh;
        background: #06080f;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        color: #fff;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        -webkit-font-smoothing: antialiased;
        padding-bottom: 40px;
      }

      .as-header {
        text-align: center;
        padding: 48px 24px 24px;
        flex-shrink: 0;
      }

      .as-overline {
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.15em;
        color: rgba(100, 140, 255, 0.65);
        margin-bottom: 12px;
        text-transform: uppercase;
      }

      .as-title {
        font-size: 32px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.94);
        margin: 0 0 10px;
        line-height: 1.2;
      }

      .as-subtitle {
        font-size: 15px;
        font-weight: 400;
        color: rgba(255, 255, 255, 0.58);
        max-width: 560px;
        margin: 0 auto;
        line-height: 1.5;
      }

      /* ---- Step Navigator ---- */
      .as-step-nav {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px 24px 28px;
        gap: 0;
        flex-shrink: 0;
        position: relative;
      }

      .as-step-line {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        height: 2px;
        background: rgba(255, 255, 255, 0.08);
        pointer-events: none;
      }

      .as-step-dot {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        position: relative;
        z-index: 1;
        transition: all 0.3s ease;
        border: 2px solid rgba(255, 255, 255, 0.3);
        background: transparent;
        color: rgba(255, 255, 255, 0.6);
        margin: 0 16px;
        user-select: none;
        -webkit-user-select: none;
      }

      .as-step-dot:hover {
        border-color: rgba(255, 255, 255, 0.5);
        color: rgba(255, 255, 255, 0.7);
      }

      .as-step-dot.completed {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.4);
        color: rgba(255, 255, 255, 0.7);
      }

      .as-step-dot.active {
        border-color: var(--step-color);
        background: color-mix(in srgb, var(--step-color) 15%, transparent);
        color: var(--step-color);
        box-shadow: 0 0 20px color-mix(in srgb, var(--step-color) 30%, transparent);
      }

      /* ---- Content Area ---- */
      .as-content {
        display: flex;
        gap: 32px;
        padding: 0 48px;
        min-height: 400px;
        align-items: flex-start;
      }

      .as-left-col {
        width: 40%;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .as-canvas-wrap {
        width: 100%;
        max-width: 420px;
        aspect-ratio: 400 / 350;
        position: relative;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.06);
        background: rgba(0, 0, 0, 0.3);
      }

      .as-canvas-wrap canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      .as-canvas-label {
        position: absolute;
        top: 12px;
        left: 14px;
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        font-size: 10px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.55);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        pointer-events: none;
      }

      /* Art Direction slider (Step 6) */
      .as-slider-wrap {
        width: 100%;
        max-width: 320px;
        margin-top: 16px;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
      }

      .as-slider-wrap.visible {
        opacity: 1;
        pointer-events: auto;
      }

      .as-slider-label {
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        font-size: 10px;
        font-weight: 500;
        color: rgba(200, 150, 255, 0.65);
        text-align: center;
        margin-bottom: 8px;
        letter-spacing: 0.06em;
      }

      .as-slider-track {
        position: relative;
        height: 6px;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 3px;
        cursor: pointer;
      }

      .as-slider-fill {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        border-radius: 3px;
        background: linear-gradient(90deg, rgba(200, 150, 255, 0.2), rgba(200, 150, 255, 0.7));
        pointer-events: none;
        transition: width 0.05s linear;
      }

      .as-slider-thumb {
        position: absolute;
        top: 50%;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #fff;
        transform: translate(-50%, -50%);
        cursor: grab;
        transition: box-shadow 0.2s ease;
        box-shadow: 0 0 0 3px rgba(200, 150, 255, 0.25);
      }

      .as-slider-thumb:active {
        cursor: grabbing;
        box-shadow: 0 0 0 6px rgba(200, 150, 255, 0.3);
      }

      .as-slider-thumb::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #c896ff;
        transform: translate(-50%, -50%);
      }

      .as-slider-labels {
        display: flex;
        justify-content: space-between;
        margin-top: 6px;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.55);
      }

      /* ---- Right Column: Narrative ---- */
      .as-right-col {
        width: 60%;
        padding-bottom: 24px;
      }

      .as-step-content {
        opacity: 0;
        transition: opacity 0.3s ease;
        display: none;
      }

      .as-step-content.active {
        display: block;
        opacity: 1;
      }

      .as-step-num {
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.1em;
        margin-bottom: 6px;
      }

      .as-step-title {
        font-size: 26px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.94);
        margin: 0 0 4px;
        line-height: 1.2;
      }

      .as-step-subtitle {
        font-size: 13px;
        font-weight: 400;
        color: rgba(255, 255, 255, 0.5);
        margin: 0 0 18px;
        font-style: italic;
      }

      .as-step-desc {
        font-size: 15px;
        line-height: 1.65;
        color: rgba(255, 255, 255, 0.72);
        margin: 0 0 16px;
        max-width: 520px;
      }

      .as-step-subtext {
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
        margin: 0 0 16px;
        padding: 10px 14px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 6px;
        border-left: 2px solid rgba(255, 255, 255, 0.1);
        max-width: 480px;
      }

      .as-tradeoffs {
        margin: 0 0 20px;
        padding: 0;
        list-style: none;
        max-width: 480px;
      }

      .as-tradeoffs li {
        font-size: 13px;
        line-height: 1.6;
        padding: 2px 0;
      }

      .as-tradeoffs li.strength {
        color: rgba(110, 255, 180, 0.78);
      }

      .as-tradeoffs li.strength::before {
        content: '\\2713  ';
        font-weight: 700;
      }

      .as-tradeoffs li.weakness {
        color: rgba(255, 130, 130, 0.72);
      }

      .as-tradeoffs li.weakness::before {
        content: '\\2717  ';
        font-weight: 700;
      }

      .as-tradeoffs li.no-strengths {
        color: rgba(255, 100, 100, 0.6);
        font-style: italic;
        font-size: 12px;
      }

      .as-insight {
        max-width: 480px;
        padding: 14px 18px;
        border-radius: 8px;
        border-left: 3px solid;
        font-size: 13.5px;
        line-height: 1.6;
        color: rgba(255, 255, 255, 0.68);
        margin-top: 8px;
      }

      .as-insight-label {
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        margin-bottom: 6px;
        display: block;
      }

      /* ---- Timeline Strip ---- */
      .as-timeline {
        flex-shrink: 0;
        height: 140px;
        padding: 0 48px;
        position: relative;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        margin-top: 32px;
      }

      .as-timeline-track {
        position: absolute;
        left: 80px;
        right: 48px;
        height: 2px;
        background: rgba(255, 255, 255, 0.06);
      }

      .as-timeline-track.cg {
        top: 34px;
      }

      .as-timeline-track.ai {
        top: 98px;
      }

      .as-timeline-track-label {
        position: absolute;
        left: 0;
        width: 72px;
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        font-size: 9px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        text-align: right;
        padding-right: 12px;
      }

      .as-timeline-track-label.cg {
        top: 26px;
        color: rgba(100, 180, 255, 0.55);
      }

      .as-timeline-track-label.ai {
        top: 90px;
        color: rgba(255, 150, 100, 0.55);
      }

      .as-milestone {
        position: absolute;
        transform: translateX(-50%);
        text-align: center;
        cursor: default;
        transition: opacity 0.3s ease;
      }

      .as-milestone.cg {
        top: 22px;
      }

      .as-milestone.ai {
        top: 86px;
      }

      .as-milestone-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        margin: 0 auto 4px;
        border: 2px solid rgba(255, 255, 255, 0.25);
        background: transparent;
        transition: all 0.3s ease;
      }

      .as-milestone.active .as-milestone-dot {
        border-color: var(--dot-color);
        background: var(--dot-color);
        box-shadow: 0 0 10px var(--dot-color);
      }

      .as-milestone.breakthrough .as-milestone-dot {
        width: 12px;
        height: 12px;
      }

      .as-milestone.fail .as-milestone-dot {
        border-style: dashed;
      }

      .as-milestone-label {
        font-size: 10px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.55);
        white-space: nowrap;
        transition: color 0.3s ease;
      }

      .as-milestone.active .as-milestone-label {
        color: rgba(255, 255, 255, 0.9);
      }

      .as-milestone-year {
        font-size: 9px;
        color: rgba(255, 255, 255, 0.45);
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
      }

      .as-milestone.dimmed {
        opacity: 0.5;
      }

      /* Dashed connection lines between tracks */
      .as-timeline-connection {
        position: absolute;
        width: 1px;
        border-left: 1px dashed rgba(255, 255, 255, 0.12);
        transition: border-color 0.3s ease, opacity 0.3s ease;
      }

      .as-timeline-connection.active {
        border-left-color: rgba(255, 255, 255, 0.35);
      }

      /* Callout between tracks */
      .as-timeline-callout {
        position: absolute;
        top: 50px;
        left: 50%;
        transform: translateX(-50%);
        text-align: center;
        max-width: 440px;
        padding: 8px 16px;
        background: rgba(255, 110, 180, 0.06);
        border: 1px solid rgba(255, 110, 180, 0.12);
        border-radius: 6px;
        font-size: 11.5px;
        line-height: 1.55;
        color: rgba(255, 255, 255, 0.58);
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
      }

      .as-timeline-callout.visible {
        opacity: 1;
      }

      .as-timeline-callout em {
        color: rgba(255, 110, 180, 0.85);
        font-style: normal;
        font-weight: 600;
      }

      /* ---- Responsive ---- */
      @media (max-width: 860px) {
        .as-content {
          flex-direction: column;
          padding: 0 24px;
        }
        .as-left-col,
        .as-right-col {
          width: 100%;
        }
        .as-canvas-wrap {
          max-width: 340px;
        }
        .as-step-dot {
          width: 30px;
          height: 30px;
          font-size: 12px;
          margin: 0 10px;
        }
        .as-header {
          padding: 32px 16px 16px;
        }
        .as-title {
          font-size: 24px;
        }
        .as-timeline {
          padding: 0 16px;
          height: 130px;
        }
        .as-timeline-track {
          left: 60px;
          right: 16px;
        }
      }

      @media (max-width: 560px) {
        .as-step-dot {
          width: 26px;
          height: 26px;
          font-size: 11px;
          margin: 0 6px;
        }
        .as-content {
          padding: 0 16px;
        }
        .as-step-title {
          font-size: 22px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ================================================================
  //  BUILD DOM
  // ================================================================
  function buildDOM() {
    injectStyles();

    domWrapper = document.createElement('div');
    domWrapper.className = 'as-wrapper';

    // ---- Header ----
    headerEl = document.createElement('div');
    headerEl.className = 'as-header';
    headerEl.innerHTML = `
      <div class="as-overline">INTUITIONS \u2014 PROCEDURAL AND AI</div>
      <h2 class="as-title">The Convergent Path</h2>
      <p class="as-subtitle">How character animation and artificial intelligence independently discovered the same breakthrough</p>
    `;
    domWrapper.appendChild(headerEl);

    // ---- Step Navigator ----
    stepNav = document.createElement('div');
    stepNav.className = 'as-step-nav';

    // Background line
    const lineEl = document.createElement('div');
    lineEl.className = 'as-step-line';
    stepNav.appendChild(lineEl);

    stepDots = [];
    for (let i = 0; i < 6; i++) {
      const dot = document.createElement('div');
      dot.className = 'as-step-dot';
      dot.textContent = String(i + 1);
      dot.style.setProperty('--step-color', STEPS[i].color);
      dot.addEventListener('click', () => goToStep(i, true));
      stepNav.appendChild(dot);
      stepDots.push(dot);
    }
    domWrapper.appendChild(stepNav);

    // ---- Content Area (two columns) ----
    contentArea = document.createElement('div');
    contentArea.className = 'as-content';

    // Left column: canvas
    leftCol = document.createElement('div');
    leftCol.className = 'as-left-col';

    canvasWrap = document.createElement('div');
    canvasWrap.className = 'as-canvas-wrap';

    const canvasLabel = document.createElement('div');
    canvasLabel.className = 'as-canvas-label';
    canvasLabel.textContent = 'Character Demo';
    canvasWrap.appendChild(canvasLabel);

    canvas = document.createElement('canvas');
    canvasWrap.appendChild(canvas);
    ctx = canvas.getContext('2d');

    leftCol.appendChild(canvasWrap);

    // Art direction slider (for step 6)
    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'as-slider-wrap';
    sliderWrap.id = 'as-art-slider';
    sliderWrap.innerHTML = `
      <div class="as-slider-label">Art Direction</div>
      <div class="as-slider-track">
        <div class="as-slider-fill" style="width: 50%"></div>
        <div class="as-slider-thumb" style="left: 50%"></div>
      </div>
      <div class="as-slider-labels">
        <span>Subtle</span>
        <span>Expressive</span>
      </div>
    `;
    leftCol.appendChild(sliderWrap);
    setupSlider(sliderWrap);

    contentArea.appendChild(leftCol);

    // Right column: narrative text
    rightCol = document.createElement('div');
    rightCol.className = 'as-right-col';

    stepContentEls = {};
    for (let i = 0; i < STEPS.length; i++) {
      const s = STEPS[i];
      const el = document.createElement('div');
      el.className = 'as-step-content';
      el.dataset.step = String(i);

      let tradeoffsHTML = '';
      if (s.strengths.length === 0 && s.weaknesses.length > 0) {
        tradeoffsHTML += '<li class="no-strengths">(No strengths \u2014 this approach fails)</li>';
      }
      for (const str of s.strengths) {
        tradeoffsHTML += `<li class="strength">${str}</li>`;
      }
      for (const w of s.weaknesses) {
        tradeoffsHTML += `<li class="weakness">${w}</li>`;
      }

      const subtextHTML = s.subtext
        ? `<div class="as-step-subtext">${s.subtext}</div>`
        : '';

      el.innerHTML = `
        <div class="as-step-num" style="color: ${s.color}">STEP ${s.num}</div>
        <h3 class="as-step-title">${s.title}</h3>
        <div class="as-step-subtitle">${s.subtitle}</div>
        <p class="as-step-desc">${s.description}</p>
        ${subtextHTML}
        <ul class="as-tradeoffs">${tradeoffsHTML}</ul>
        <div class="as-insight" style="border-color: ${s.color}; background: color-mix(in srgb, ${s.color} 6%, transparent);">
          <span class="as-insight-label" style="color: ${s.color}">Insight</span>
          ${s.insight}
        </div>
      `;

      rightCol.appendChild(el);
      stepContentEls[i] = el;
    }

    contentArea.appendChild(rightCol);
    domWrapper.appendChild(contentArea);

    // ---- Timeline Strip ----
    timelineStrip = document.createElement('div');
    timelineStrip.className = 'as-timeline';
    buildTimeline();
    domWrapper.appendChild(timelineStrip);

    container.appendChild(domWrapper);
  }

  // ================================================================
  //  BUILD TIMELINE
  // ================================================================
  function buildTimeline() {
    // Track labels
    const cgLabel = document.createElement('div');
    cgLabel.className = 'as-timeline-track-label cg';
    cgLabel.textContent = 'Computer Graphics';
    timelineStrip.appendChild(cgLabel);

    const aiLabel = document.createElement('div');
    aiLabel.className = 'as-timeline-track-label ai';
    aiLabel.textContent = 'AI Field';
    timelineStrip.appendChild(aiLabel);

    // Tracks
    const cgTrack = document.createElement('div');
    cgTrack.className = 'as-timeline-track cg';
    timelineStrip.appendChild(cgTrack);

    const aiTrack = document.createElement('div');
    aiTrack.className = 'as-timeline-track ai';
    timelineStrip.appendChild(aiTrack);

    // CG milestones
    for (let i = 0; i < CG_MILESTONES.length; i++) {
      const m = CG_MILESTONES[i];
      const el = document.createElement('div');
      el.className = 'as-milestone cg';
      if (m.breakthrough) el.classList.add('breakthrough');
      if (m.fail) el.classList.add('fail');
      el.dataset.step = String(m.step);
      el.dataset.track = 'cg';
      el.dataset.index = String(i);
      el.style.setProperty('--dot-color', 'rgba(100, 180, 255, 0.8)');
      // Position will be set in updateTimelinePositions
      el.innerHTML = `
        <div class="as-milestone-dot"></div>
        <div class="as-milestone-label">${m.label}</div>
        <div class="as-milestone-year">${m.year}</div>
      `;
      timelineStrip.appendChild(el);
    }

    // AI milestones
    for (let i = 0; i < AI_MILESTONES.length; i++) {
      const m = AI_MILESTONES[i];
      const el = document.createElement('div');
      el.className = 'as-milestone ai';
      if (m.breakthrough) el.classList.add('breakthrough');
      el.dataset.step = String(m.step);
      el.dataset.track = 'ai';
      el.dataset.index = String(i);
      el.style.setProperty('--dot-color', 'rgba(255, 150, 100, 0.8)');
      el.innerHTML = `
        <div class="as-milestone-dot"></div>
        <div class="as-milestone-label">${m.label}</div>
        <div class="as-milestone-year">${m.year}</div>
      `;
      timelineStrip.appendChild(el);
    }

    // Connection lines
    for (const conn of TIMELINE_CONNECTIONS) {
      const line = document.createElement('div');
      line.className = 'as-timeline-connection';
      line.dataset.cgIdx = String(conn.cgIdx);
      line.dataset.aiIdx = String(conn.aiIdx);
      timelineStrip.appendChild(line);
    }

    // Callout (visible at step 5)
    const callout = document.createElement('div');
    callout.className = 'as-timeline-callout';
    callout.id = 'as-timeline-callout';
    callout.innerHTML = 'Both fields discovered the same formula: <em>RL + human-aligned constraints</em>. Reference motion in CG (2018). Human preferences in AI (2022).';
    timelineStrip.appendChild(callout);
  }

  // ================================================================
  //  UPDATE TIMELINE POSITIONS
  // ================================================================
  function updateTimelinePositions() {
    if (!timelineStrip) return;
    const rect = timelineStrip.getBoundingClientRect();
    const trackLeft = 80;
    const trackRight = rect.width - 48;
    const trackWidth = trackRight - trackLeft;

    // Position milestones
    const milestones = timelineStrip.querySelectorAll('.as-milestone');
    milestones.forEach(el => {
      const track = el.dataset.track;
      const idx = parseInt(el.dataset.index);
      const data = track === 'cg' ? CG_MILESTONES[idx] : AI_MILESTONES[idx];
      const xPos = trackLeft + data.x * trackWidth;
      el.style.left = xPos + 'px';
    });

    // Position connections
    const connections = timelineStrip.querySelectorAll('.as-timeline-connection');
    connections.forEach(el => {
      const cgIdx = parseInt(el.dataset.cgIdx);
      const aiIdx = parseInt(el.dataset.aiIdx);
      const cgData = CG_MILESTONES[cgIdx];
      const aiData = AI_MILESTONES[aiIdx];
      // Use average x position of the two endpoints
      const avgX = (cgData.x + aiData.x) / 2;
      const xPos = trackLeft + avgX * trackWidth;
      el.style.left = xPos + 'px';
      el.style.top = '44px';
      el.style.height = '44px';
    });
  }

  // ================================================================
  //  STEP NAVIGATION
  // ================================================================
  function goToStep(idx, userInitiated) {
    if (idx < 0 || idx >= STEPS.length || (idx === currentStep && !userInitiated)) return;
    if (stepTransitioning) return;

    const prevStep = currentStep;
    currentStep = idx;

    if (userInitiated) {
      pauseAutoAdvance();
    }

    // Reset physics state on step change
    rlPerturbState = new Float64Array(16);
    rlPerturbVel = new Float64Array(16);
    deepMimicError = new Float64Array(16);
    collapseTimer = 0;

    // Transition: fade out old, fade in new
    stepTransitioning = true;

    // Update nav dots
    updateNavDots();

    // Fade out old content
    const oldContent = stepContentEls[prevStep];
    const newContent = stepContentEls[currentStep];

    if (oldContent) {
      oldContent.style.opacity = '0';
      setTimeout(() => {
        oldContent.classList.remove('active');
        oldContent.style.display = 'none';

        // Fade in new content
        newContent.style.display = 'block';
        newContent.style.opacity = '0';
        requestAnimationFrame(() => {
          newContent.classList.add('active');
          newContent.style.opacity = '1';
          stepTransitioning = false;
        });
      }, 200);
    } else {
      newContent.style.display = 'block';
      newContent.classList.add('active');
      newContent.style.opacity = '1';
      stepTransitioning = false;
    }

    // Show/hide art slider
    const slider = document.getElementById('as-art-slider');
    if (slider) {
      if (currentStep === 5) {
        slider.classList.add('visible');
      } else {
        slider.classList.remove('visible');
      }
    }

    // Update timeline highlights
    updateTimelineHighlights();
  }

  function updateNavDots() {
    for (let i = 0; i < stepDots.length; i++) {
      const dot = stepDots[i];
      dot.classList.remove('active', 'completed');
      dot.style.setProperty('--step-color', STEPS[i].color);
      if (i === currentStep) {
        dot.classList.add('active');
      } else if (i < currentStep) {
        dot.classList.add('completed');
      }
    }

    // Update step line width
    const lineEl = stepNav.querySelector('.as-step-line');
    if (lineEl && stepDots.length >= 2) {
      const firstRect = stepDots[0].getBoundingClientRect();
      const lastRect = stepDots[stepDots.length - 1].getBoundingClientRect();
      const navRect = stepNav.getBoundingClientRect();
      const lineWidth = lastRect.left + lastRect.width / 2 - (firstRect.left + firstRect.width / 2);
      lineEl.style.width = lineWidth + 'px';
    }
  }

  function updateTimelineHighlights() {
    const milestones = timelineStrip.querySelectorAll('.as-milestone');
    milestones.forEach(el => {
      const step = parseInt(el.dataset.step);
      el.classList.remove('active', 'dimmed');
      if (step === currentStep) {
        el.classList.add('active');
      } else {
        el.classList.add('dimmed');
      }
    });

    // Update connection lines
    const connections = timelineStrip.querySelectorAll('.as-timeline-connection');
    connections.forEach(el => {
      const cgIdx = parseInt(el.dataset.cgIdx);
      const cgStep = CG_MILESTONES[cgIdx].step;
      el.classList.toggle('active', cgStep === currentStep);
    });

    // Callout visibility at step 5
    const callout = document.getElementById('as-timeline-callout');
    if (callout) {
      callout.classList.toggle('visible', currentStep === 4);
    }
  }

  // ================================================================
  //  AUTO-ADVANCE
  // ================================================================
  function startAutoAdvance() {
    stopAutoAdvance();
    autoAdvancePaused = false;
    autoAdvanceTimer = setInterval(() => {
      if (!autoAdvancePaused && running) {
        const next = (currentStep + 1) % STEPS.length;
        goToStep(next, false);
      }
    }, 8000);
  }

  function stopAutoAdvance() {
    if (autoAdvanceTimer) {
      clearInterval(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }
    if (idleResumeTimer) {
      clearTimeout(idleResumeTimer);
      idleResumeTimer = null;
    }
  }

  function pauseAutoAdvance() {
    autoAdvancePaused = true;
    if (idleResumeTimer) clearTimeout(idleResumeTimer);
    idleResumeTimer = setTimeout(() => {
      autoAdvancePaused = false;
    }, 15000);
  }

  // ================================================================
  //  ART DIRECTION SLIDER SETUP
  // ================================================================
  function setupSlider(wrapEl) {
    const track = wrapEl.querySelector('.as-slider-track');
    const fill = wrapEl.querySelector('.as-slider-fill');
    const thumb = wrapEl.querySelector('.as-slider-thumb');
    let dragging = false;

    function updateSliderVisuals() {
      const pct = (artDirection * 100).toFixed(1);
      fill.style.width = pct + '%';
      thumb.style.left = pct + '%';
    }

    function onPointerDown(e) {
      dragging = true;
      e.preventDefault();
      pauseAutoAdvance();
      updateFromPointer(e);
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    }

    function onPointerMove(e) {
      if (!dragging) return;
      updateFromPointer(e);
    }

    function onPointerUp() {
      dragging = false;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    }

    function updateFromPointer(e) {
      const rect = track.getBoundingClientRect();
      let norm = (e.clientX - rect.left) / rect.width;
      norm = Math.max(0, Math.min(1, norm));
      artDirection = norm;
      updateSliderVisuals();
    }

    track.addEventListener('pointerdown', onPointerDown);
    thumb.addEventListener('pointerdown', onPointerDown);

    // Touch fallback
    track.addEventListener('touchstart', (e) => {
      e.preventDefault();
      dragging = true;
      pauseAutoAdvance();
      const touch = e.touches[0];
      const rect = track.getBoundingClientRect();
      let norm = (touch.clientX - rect.left) / rect.width;
      artDirection = Math.max(0, Math.min(1, norm));
      updateSliderVisuals();
    }, { passive: false });

    track.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!dragging) return;
      const touch = e.touches[0];
      const rect = track.getBoundingClientRect();
      let norm = (touch.clientX - rect.left) / rect.width;
      artDirection = Math.max(0, Math.min(1, norm));
      updateSliderVisuals();
    }, { passive: false });

    const endTouch = () => { dragging = false; };
    document.addEventListener('touchend', endTouch);
    document.addEventListener('touchcancel', endTouch);
  }

  // ================================================================
  //  CANVAS SIZING
  // ================================================================
  function sizeCanvas() {
    if (!canvas || !canvasWrap) return;
    const rect = canvasWrap.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    width = Math.round(rect.width * dpr);
    height = Math.round(rect.height * dpr);
    canvas.width = width;
    canvas.height = height;
  }

  // ================================================================
  //  CANVAS DRAW LOOP
  // ================================================================
  function drawCanvas(timestamp) {
    if (!running) return;
    animFrameId = requestAnimationFrame(drawCanvas);

    time = timestamp * 0.001;
    const t = time;
    const w = width / dpr;
    const h = height / dpr;

    if (w < 1 || h < 1) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = 'rgba(6, 8, 15, 1)';
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
    ctx.lineWidth = 1;
    const gridSize = 30;
    for (let gx = 0; gx < w; gx += gridSize) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }

    // Figure layout
    const step = STEPS[currentStep];
    const figureScale = Math.min(w / 180, h / 360, 1.2);
    const figureX = w / 2;
    const figureY = h * 0.42;
    const groundY = figureY + 80 * figureScale;

    // Compute pose
    const pose = computeMethodPose(step.id, t, artDirection);
    const positions = forwardKinematics(
      pose.angles, pose.rootX, pose.rootY,
      figureScale, figureX, figureY
    );

    // Draw character
    drawStickFigure(ctx, positions, figureScale, 0.92, step.color, groundY);

    // Step label at bottom of canvas
    ctx.font = '500 10px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = step.color + '60';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(step.title, w / 2, h - 10);

    // For step 3, show collapse indicator
    if (step.id === 'sl_physics_fail' && collapsePhase >= 1) {
      ctx.font = '600 11px "Inter", -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(255, 85, 85, 0.6)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('COLLAPSED', w / 2, h * 0.18);

      ctx.font = '400 9px "Inter", -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fillText('Restarting...', w / 2, h * 0.18 + 16);
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
      container.style.minHeight = '100vh';

      buildDOM();

      // Initialize first step
      goToStep(0, false);

      this.resize();
    },

    start() {
      if (running) return;
      running = true;
      sizeCanvas();
      animFrameId = requestAnimationFrame(drawCanvas);
      startAutoAdvance();

      // Ensure nav line is sized after layout
      requestAnimationFrame(() => {
        updateNavDots();
        updateTimelinePositions();
      });
    },

    stop() {
      running = false;
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      stopAutoAdvance();
    },

    resize() {
      if (!container) return;
      sizeCanvas();
      updateTimelinePositions();
      updateNavDots();
    },

    destroy() {
      this.stop();
      if (domWrapper && domWrapper.parentNode) {
        domWrapper.parentNode.removeChild(domWrapper);
      }
      domWrapper = null;
      canvas = null;
      ctx = null;
      stepDots = [];
      stepContentEls = {};
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AnimSpectrumSection;
