/* ============================================================
   EmergentSection — Multi-Agent Emergent Behavior Simulation
   Simple rules, complex outcomes. Continuous-space agents with
   pheromone trails, flocking, signal pulses, and builder logic.
   Pure vanilla JS + Canvas API. Zero dependencies.
   ============================================================ */
const EmergentSection = (() => {
  /* ---- private state ---- */
  let container, canvas, ctx, trailCanvas, trailCtx;
  let running = false, animFrameId = null, dpr = 1;
  let W = 900, H = 500;

  /* simulation state */
  let agents = [];
  let foods = [];
  let obstacles = [];
  let bases = [];
  let structures = [];
  let signals = [];
  let stats = { foodCollected: 0, activeAgents: 0, trailCoverage: 0 };
  let frameCount = 0;
  let lastTime = 0;

  /* config – mutable via controls */
  const cfg = {
    foragerCount: 35,
    builderCount: 18,
    scoutCount: 12,
    speedMult: 1.0,
    pheromoneDecay: 0.985,
    flocking: true,
    trailFollowing: true,
    signalsEnabled: true,
    interactionMode: 'observe', // 'observe' | 'food' | 'obstacle'
  };

  /* colors */
  const C = {
    bg: '#06080f',
    forager: '#4a9eff',
    foragerCarrying: '#7dbaff',
    builder: '#3ddc84',
    scout: '#ff9f43',
    food: '#ffd700',
    foodGlow: 'rgba(255,215,0,0.15)',
    obstacle: '#1a1e2e',
    obstacleBorder: '#2a2e3e',
    signal: 'rgba(255,159,67,0.6)',
    structure: '#2a8a52',
    trail: 'rgba(74,158,255,0.35)',
    baseColors: ['rgba(74,158,255,0.1)', 'rgba(61,220,132,0.1)', 'rgba(255,159,67,0.1)'],
    baseBorders: ['rgba(74,158,255,0.3)', 'rgba(61,220,132,0.3)', 'rgba(255,159,67,0.3)'],
    text: '#e0e6ed',
    textDim: '#6b7a8d',
    accent: '#4a9eff',
    panel: 'rgba(10,14,24,0.85)',
    panelBorder: 'rgba(74,158,255,0.15)',
  };

  /* ---- utilities ---- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;

  function vec(x, y) { return { x, y }; }
  function vecAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
  function vecSub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
  function vecMul(a, s) { return { x: a.x * s, y: a.y * s }; }
  function vecLen(a) { return Math.hypot(a.x, a.y); }
  function vecNorm(a) { const l = vecLen(a) || 1; return { x: a.x / l, y: a.y / l }; }
  function vecLimit(a, max) {
    const l = vecLen(a);
    if (l > max) { const s = max / l; return { x: a.x * s, y: a.y * s }; }
    return a;
  }
  function vecDist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  /* ---- pheromone grid (low-res for performance) ---- */
  const GRID_RES = 6;
  let gridW, gridH, pheromoneGrid;

  function initPheromoneGrid() {
    gridW = Math.ceil(W / GRID_RES);
    gridH = Math.ceil(H / GRID_RES);
    pheromoneGrid = new Float32Array(gridW * gridH);
  }

  function depositPheromone(x, y, amount) {
    const gx = Math.floor(x / GRID_RES);
    const gy = Math.floor(y / GRID_RES);
    if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) {
      pheromoneGrid[gy * gridW + gx] = Math.min(1.0, pheromoneGrid[gy * gridW + gx] + amount);
    }
  }

  function samplePheromone(x, y) {
    const gx = Math.floor(x / GRID_RES);
    const gy = Math.floor(y / GRID_RES);
    if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) {
      return pheromoneGrid[gy * gridW + gx];
    }
    return 0;
  }

  function samplePheromoneArea(x, y, r) {
    let total = 0, count = 0;
    const gr = Math.ceil(r / GRID_RES);
    const cx = Math.floor(x / GRID_RES);
    const cy = Math.floor(y / GRID_RES);
    for (let dy = -gr; dy <= gr; dy++) {
      for (let dx = -gr; dx <= gr; dx++) {
        const gx = cx + dx, gy = cy + dy;
        if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) {
          total += pheromoneGrid[gy * gridW + gx];
          count++;
        }
      }
    }
    return count > 0 ? total / count : 0;
  }

  /* gradient direction of pheromone around a point */
  function pheromoneGradient(x, y, r) {
    let bestDir = { x: 0, y: 0 };
    let bestVal = -1;
    const samples = 8;
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * TAU;
      const sx = x + Math.cos(a) * r;
      const sy = y + Math.sin(a) * r;
      const v = samplePheromone(sx, sy);
      if (v > bestVal) {
        bestVal = v;
        bestDir = { x: Math.cos(a), y: Math.sin(a) };
      }
    }
    return bestVal > 0.01 ? vecMul(bestDir, bestVal) : { x: 0, y: 0 };
  }

  function decayPheromones() {
    const decay = cfg.pheromoneDecay;
    for (let i = 0; i < pheromoneGrid.length; i++) {
      pheromoneGrid[i] *= decay;
      if (pheromoneGrid[i] < 0.005) pheromoneGrid[i] = 0;
    }
  }

  /* ---- agent creation ---- */
  function createAgent(type) {
    let x, y, maxSpd, senseR, baseIdx;
    if (type === 'forager') {
      baseIdx = randInt(0, bases.length - 1);
      x = bases[baseIdx].x + rand(-40, 40);
      y = bases[baseIdx].y + rand(-40, 40);
      maxSpd = rand(1.4, 2.0);
      senseR = 80;
    } else if (type === 'builder') {
      x = rand(50, W - 50);
      y = rand(50, H - 50);
      maxSpd = rand(0.8, 1.3);
      senseR = 50;
    } else {
      x = rand(50, W - 50);
      y = rand(50, H - 50);
      maxSpd = rand(2.2, 3.0);
      senseR = 120;
    }
    return {
      type,
      x, y,
      vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5),
      ax: 0, ay: 0,
      maxSpeed: maxSpd,
      senseRadius: senseR,
      carrying: false,
      baseIdx: baseIdx || 0,
      wanderAngle: rand(0, TAU),
      explored: new Set(),
      signalCooldown: 0,
      buildCooldown: 0,
      age: rand(0, 200),
    };
  }

  /* ---- environment creation ---- */
  function initBases() {
    bases = [
      { x: 120, y: H * 0.3, r: 40, color: 0 },
      { x: W - 120, y: H * 0.7, r: 40, color: 1 },
      { x: W * 0.5, y: H * 0.15, r: 35, color: 2 },
    ];
  }

  function spawnFood(count) {
    for (let i = 0; i < count; i++) {
      let x, y, tries = 0, valid = false;
      while (!valid && tries < 30) {
        x = rand(60, W - 60);
        y = rand(60, H - 60);
        valid = true;
        for (const b of bases) {
          if (vecDist({ x, y }, b) < 70) { valid = false; break; }
        }
        for (const o of obstacles) {
          if (vecDist({ x, y }, o) < o.r + 20) { valid = false; break; }
        }
        tries++;
      }
      if (valid) {
        foods.push({ x, y, amount: rand(0.7, 1.0), maxAmount: 1.0, regenRate: 0.0004 + Math.random() * 0.0003, r: rand(8, 14) });
      }
    }
  }

  function spawnObstacles(count) {
    for (let i = 0; i < count; i++) {
      let x = rand(100, W - 100), y = rand(80, H - 80);
      const isRect = Math.random() > 0.5;
      obstacles.push({
        x, y,
        r: rand(18, 35),
        w: isRect ? rand(30, 70) : 0,
        h: isRect ? rand(20, 45) : 0,
        isRect,
      });
    }
  }

  function initSimulation() {
    agents = [];
    foods = [];
    obstacles = [];
    structures = [];
    signals = [];
    stats = { foodCollected: 0, activeAgents: 0, trailCoverage: 0 };
    frameCount = 0;

    initBases();
    initPheromoneGrid();
    spawnObstacles(5);
    spawnFood(12);

    for (let i = 0; i < cfg.foragerCount; i++) agents.push(createAgent('forager'));
    for (let i = 0; i < cfg.builderCount; i++) agents.push(createAgent('builder'));
    for (let i = 0; i < cfg.scoutCount; i++) agents.push(createAgent('scout'));

    /* clear trail canvas */
    if (trailCtx) {
      trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    }
  }

  /* ---- collision / obstacle helpers ---- */
  function pointInObstacle(px, py, pad) {
    for (const o of obstacles) {
      if (o.isRect) {
        if (px > o.x - o.w / 2 - pad && px < o.x + o.w / 2 + pad &&
            py > o.y - o.h / 2 - pad && py < o.y + o.h / 2 + pad) return true;
      } else {
        if (vecDist({ x: px, y: py }, o) < o.r + pad) return true;
      }
    }
    return false;
  }

  function obstacleAvoidance(agent) {
    let steer = { x: 0, y: 0 };
    const ahead = 30;
    for (const o of obstacles) {
      const d = vecDist(agent, o);
      const effectR = o.isRect ? Math.max(o.w, o.h) * 0.6 + 10 : o.r + 10;
      if (d < effectR + ahead) {
        const away = vecNorm(vecSub(agent, o));
        const strength = 1.0 - clamp((d - effectR) / ahead, 0, 1);
        steer = vecAdd(steer, vecMul(away, strength * 3));
      }
    }
    return steer;
  }

  /* ---- flocking helpers ---- */
  function flockingForce(agent, neighbors) {
    if (!cfg.flocking || neighbors.length === 0) return { x: 0, y: 0 };
    let align = { x: 0, y: 0 }, cohesion = { x: 0, y: 0 }, sep = { x: 0, y: 0 };
    let aC = 0, cC = 0, sC = 0;
    for (const n of neighbors) {
      const d = vecDist(agent, n);
      if (d < 60 && d > 0) {
        align = vecAdd(align, { x: n.vx, y: n.vy });
        aC++;
      }
      if (d < 80) {
        cohesion = vecAdd(cohesion, n);
        cC++;
      }
      if (d < 18 && d > 0) {
        const away = vecSub(agent, n);
        sep = vecAdd(sep, vecMul(vecNorm(away), 1 / (d + 0.1)));
        sC++;
      }
    }
    let force = { x: 0, y: 0 };
    if (aC > 0) {
      align = vecMul(align, 1 / aC);
      force = vecAdd(force, vecMul(vecNorm(align), 0.3));
    }
    if (cC > 0) {
      cohesion = vecMul(cohesion, 1 / cC);
      const toCenter = vecSub(cohesion, agent);
      force = vecAdd(force, vecMul(vecNorm(toCenter), 0.15));
    }
    if (sC > 0) {
      force = vecAdd(force, vecMul(sep, 1.5));
    }
    return force;
  }

  /* ---- wander force ---- */
  function wanderForce(agent) {
    agent.wanderAngle += rand(-0.4, 0.4);
    return { x: Math.cos(agent.wanderAngle) * 0.5, y: Math.sin(agent.wanderAngle) * 0.5 };
  }

  /* ---- boundary force ---- */
  function boundaryForce(agent) {
    let f = { x: 0, y: 0 };
    const margin = 30;
    if (agent.x < margin) f.x += (margin - agent.x) * 0.05;
    if (agent.x > W - margin) f.x -= (agent.x - (W - margin)) * 0.05;
    if (agent.y < margin) f.y += (margin - agent.y) * 0.05;
    if (agent.y > H - margin) f.y -= (agent.y - (H - margin)) * 0.05;
    return f;
  }

  /* ---- update functions per type ---- */
  function updateForager(a, dt, sameType, allAgents) {
    let force = { x: 0, y: 0 };

    if (a.carrying) {
      /* return to base */
      const base = bases[a.baseIdx];
      const toBase = vecSub(base, a);
      force = vecAdd(force, vecMul(vecNorm(toBase), 1.5));
      /* deposit pheromone */
      depositPheromone(a.x, a.y, 0.12);
      /* check arrival */
      if (vecDist(a, base) < base.r + 5) {
        a.carrying = false;
        stats.foodCollected++;
      }
    } else {
      /* seek food */
      let nearest = null, nearD = Infinity;
      for (const f of foods) {
        if (f.amount < 0.1) continue;
        const d = vecDist(a, f);
        if (d < a.senseRadius && d < nearD) { nearest = f; nearD = d; }
      }
      if (nearest) {
        const toFood = vecSub(nearest, a);
        force = vecAdd(force, vecMul(vecNorm(toFood), 1.8));
        /* pick up food */
        if (nearD < nearest.r + 4) {
          nearest.amount -= 0.12;
          a.carrying = true;
        }
      } else if (cfg.trailFollowing) {
        /* follow pheromone gradient */
        const grad = pheromoneGradient(a.x, a.y, 20);
        force = vecAdd(force, vecMul(grad, 2.5));
        if (vecLen(grad) < 0.02) force = vecAdd(force, wanderForce(a));
      } else {
        force = vecAdd(force, wanderForce(a));
      }

      /* respond to scout signals */
      if (cfg.signalsEnabled) {
        for (const s of signals) {
          const d = vecDist(a, s);
          if (d < s.radius && d > s.radius - 40) {
            const toSignal = vecSub(s, a);
            force = vecAdd(force, vecMul(vecNorm(toSignal), 1.2));
          }
        }
      }
    }

    /* flocking */
    const neighbors = sameType.filter(n => n !== a && vecDist(a, n) < 60);
    force = vecAdd(force, flockingForce(a, neighbors));
    force = vecAdd(force, obstacleAvoidance(a));
    force = vecAdd(force, boundaryForce(a));

    return force;
  }

  function updateBuilder(a, dt) {
    let force = { x: 0, y: 0 };
    /* follow strong pheromone trails */
    const grad = pheromoneGradient(a.x, a.y, 25);
    const pLevel = samplePheromoneArea(a.x, a.y, 15);

    if (vecLen(grad) > 0.02) {
      force = vecAdd(force, vecMul(grad, 2.0));
    } else {
      force = vecAdd(force, wanderForce(a));
    }

    /* build at high pheromone concentration */
    if (a.buildCooldown <= 0 && pLevel > 0.15) {
      /* check we don't have too many structures nearby */
      let nearStructs = 0;
      for (const s of structures) {
        if (vecDist(a, s) < 12) nearStructs++;
      }
      if (nearStructs < 3 && structures.length < 500) {
        structures.push({ x: a.x, y: a.y, age: 0, opacity: 0.8 });
        a.buildCooldown = 40 + randInt(0, 30);
      }
    }
    if (a.buildCooldown > 0) a.buildCooldown -= dt;

    force = vecAdd(force, obstacleAvoidance(a));
    force = vecAdd(force, boundaryForce(a));
    return force;
  }

  function updateScout(a, dt, scouts) {
    let force = { x: 0, y: 0 };

    /* explore — prefer unvisited areas */
    force = vecAdd(force, wanderForce(a));

    /* mark explored zone */
    const gridKey = Math.floor(a.x / 40) + ',' + Math.floor(a.y / 40);
    a.explored.add(gridKey);

    /* steer away from explored areas toward unexplored */
    let unexploredDir = { x: 0, y: 0 };
    const samples = 6;
    for (let i = 0; i < samples; i++) {
      const ang = (i / samples) * TAU;
      const sx = a.x + Math.cos(ang) * 60;
      const sy = a.y + Math.sin(ang) * 60;
      const key = Math.floor(sx / 40) + ',' + Math.floor(sy / 40);
      if (!a.explored.has(key)) {
        unexploredDir = vecAdd(unexploredDir, { x: Math.cos(ang), y: Math.sin(ang) });
      }
    }
    if (vecLen(unexploredDir) > 0) {
      force = vecAdd(force, vecMul(vecNorm(unexploredDir), 0.6));
    }

    /* check for food nearby → emit signal */
    if (cfg.signalsEnabled && a.signalCooldown <= 0) {
      for (const f of foods) {
        if (f.amount > 0.2 && vecDist(a, f) < a.senseRadius) {
          signals.push({ x: f.x, y: f.y, radius: 0, maxRadius: 180, speed: 2.5, opacity: 0.7 });
          a.signalCooldown = 120;
          break;
        }
      }
    }
    if (a.signalCooldown > 0) a.signalCooldown -= dt;

    /* spread out from other scouts */
    for (const s of scouts) {
      if (s === a) continue;
      const d = vecDist(a, s);
      if (d < 80 && d > 0) {
        const away = vecSub(a, s);
        force = vecAdd(force, vecMul(vecNorm(away), 0.8 / (d * 0.05 + 1)));
      }
    }

    force = vecAdd(force, obstacleAvoidance(a));
    force = vecAdd(force, boundaryForce(a));
    return force;
  }

  /* ---- main simulation step ---- */
  function step(dt) {
    const spd = cfg.speedMult;
    const foragers = agents.filter(a => a.type === 'forager');
    const builders = agents.filter(a => a.type === 'builder');
    const scouts = agents.filter(a => a.type === 'scout');

    /* update each agent */
    for (const a of agents) {
      let force;
      if (a.type === 'forager') force = updateForager(a, dt, foragers, agents);
      else if (a.type === 'builder') force = updateBuilder(a, dt);
      else force = updateScout(a, dt, scouts);

      /* apply force to velocity */
      a.vx += force.x * 0.15 * dt;
      a.vy += force.y * 0.15 * dt;

      /* damping */
      a.vx *= 0.96;
      a.vy *= 0.96;

      /* speed limit */
      const v = { x: a.vx, y: a.vy };
      const limited = vecLimit(v, a.maxSpeed * spd);
      a.vx = limited.x;
      a.vy = limited.y;

      /* integrate position */
      a.x += a.vx * dt;
      a.y += a.vy * dt;

      /* hard boundary clamp */
      a.x = clamp(a.x, 4, W - 4);
      a.y = clamp(a.y, 4, H - 4);

      a.age += dt;
    }

    /* decay pheromones */
    decayPheromones();

    /* update signals */
    for (let i = signals.length - 1; i >= 0; i--) {
      signals[i].radius += signals[i].speed * dt;
      signals[i].opacity -= 0.004 * dt;
      if (signals[i].radius > signals[i].maxRadius || signals[i].opacity <= 0) {
        signals.splice(i, 1);
      }
    }

    /* regenerate food */
    for (const f of foods) {
      if (f.amount < f.maxAmount) {
        f.amount = Math.min(f.maxAmount, f.amount + f.regenRate * dt);
      }
    }

    /* age structures — slowly fade old ones */
    for (let i = structures.length - 1; i >= 0; i--) {
      structures[i].age += dt;
      if (structures[i].age > 800) {
        structures[i].opacity -= 0.002 * dt;
        if (structures[i].opacity <= 0) { structures.splice(i, 1); }
      }
    }

    /* update stats */
    stats.activeAgents = agents.length;
    let trailPx = 0;
    for (let i = 0; i < pheromoneGrid.length; i++) {
      if (pheromoneGrid[i] > 0.02) trailPx++;
    }
    stats.trailCoverage = Math.round((trailPx / pheromoneGrid.length) * 100);

    frameCount++;
  }

  /* ---- sync agent count to cfg ---- */
  function syncAgentCounts() {
    const counts = { forager: 0, builder: 0, scout: 0 };
    for (const a of agents) counts[a.type]++;

    const targets = { forager: cfg.foragerCount, builder: cfg.builderCount, scout: cfg.scoutCount };
    for (const type of ['forager', 'builder', 'scout']) {
      while (counts[type] < targets[type]) {
        agents.push(createAgent(type));
        counts[type]++;
      }
      while (counts[type] > targets[type]) {
        const idx = agents.findIndex(a => a.type === type);
        if (idx >= 0) { agents.splice(idx, 1); counts[type]--; }
      }
    }
  }

  /* ---- rendering ---- */
  function renderTrailCanvas() {
    /* fade existing trails */
    trailCtx.fillStyle = 'rgba(6,8,15,0.06)';
    trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);

    /* draw pheromone grid */
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        const val = pheromoneGrid[gy * gridW + gx];
        if (val > 0.015) {
          const alpha = Math.min(0.45, val * 0.5);
          const px = gx * GRID_RES * dpr;
          const py = gy * GRID_RES * dpr;
          const sz = GRID_RES * dpr;
          trailCtx.fillStyle = `rgba(74,158,255,${alpha})`;
          trailCtx.fillRect(px, py, sz, sz);
        }
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    /* draw trail canvas as underlay */
    renderTrailCanvas();
    ctx.drawImage(trailCanvas, 0, 0);

    ctx.save();
    ctx.scale(dpr, dpr);

    /* bases */
    for (let i = 0; i < bases.length; i++) {
      const b = bases[i];
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fillStyle = C.baseColors[b.color];
      ctx.fill();
      ctx.strokeStyle = C.baseBorders[b.color];
      ctx.lineWidth = 1;
      ctx.stroke();

      /* base icon - small diamond */
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 6);
      ctx.lineTo(b.x + 5, b.y);
      ctx.lineTo(b.x, b.y + 6);
      ctx.lineTo(b.x - 5, b.y);
      ctx.closePath();
      ctx.fillStyle = C.baseBorders[b.color];
      ctx.fill();
    }

    /* structures */
    for (const s of structures) {
      ctx.fillStyle = `rgba(42,138,82,${s.opacity * 0.7})`;
      ctx.fillRect(s.x - 2.5, s.y - 2.5, 5, 5);
    }

    /* obstacles */
    for (const o of obstacles) {
      ctx.beginPath();
      if (o.isRect) {
        const r = 5;
        const x = o.x - o.w / 2, y = o.y - o.h / 2;
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + o.w - r, y);
        ctx.quadraticCurveTo(x + o.w, y, x + o.w, y + r);
        ctx.lineTo(x + o.w, y + o.h - r);
        ctx.quadraticCurveTo(x + o.w, y + o.h, x + o.w - r, y + o.h);
        ctx.lineTo(x + r, y + o.h);
        ctx.quadraticCurveTo(x, y + o.h, x, y + o.h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
      } else {
        ctx.arc(o.x, o.y, o.r, 0, TAU);
      }
      ctx.fillStyle = C.obstacle;
      ctx.fill();
      ctx.strokeStyle = C.obstacleBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    /* food */
    for (const f of foods) {
      if (f.amount < 0.05) continue;
      const a = clamp(f.amount / f.maxAmount, 0.2, 1);
      /* glow */
      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 2.5);
      grad.addColorStop(0, `rgba(255,215,0,${0.12 * a})`);
      grad.addColorStop(1, 'rgba(255,215,0,0)');
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 2.5, 0, TAU);
      ctx.fillStyle = grad;
      ctx.fill();
      /* body */
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * a, 0, TAU);
      ctx.fillStyle = `rgba(255,215,0,${0.6 + 0.4 * a})`;
      ctx.fill();
    }

    /* signal pulses */
    for (const s of signals) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, TAU);
      ctx.strokeStyle = `rgba(255,159,67,${s.opacity})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    /* agents */
    for (const a of agents) {
      let color;
      let size = 3.5;
      if (a.type === 'forager') {
        color = a.carrying ? C.foragerCarrying : C.forager;
        size = 3.5;
      } else if (a.type === 'builder') {
        color = C.builder;
        size = 3.2;
      } else {
        color = C.scout;
        size = 4;
      }

      /* body */
      ctx.beginPath();
      ctx.arc(a.x, a.y, size, 0, TAU);
      ctx.fillStyle = color;
      ctx.fill();

      /* direction indicator */
      const speed = Math.hypot(a.vx, a.vy);
      if (speed > 0.1) {
        const nx = a.vx / speed, ny = a.vy / speed;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + nx * (size + 4), a.y + ny * (size + 4));
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      /* carrying indicator */
      if (a.carrying) {
        ctx.beginPath();
        ctx.arc(a.x, a.y, size + 2, 0, TAU);
        ctx.strokeStyle = C.food;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /* ---- animation loop ---- */
  function loop(ts) {
    if (!running) return;
    const dt = Math.min((ts - (lastTime || ts)) / 16.67, 3); // normalize to ~60fps steps
    lastTime = ts;

    step(dt);
    render();

    animFrameId = requestAnimationFrame(loop);
  }

  /* ---- DOM / UI building ---- */
  function buildDOM(containerEl) {
    container = containerEl;
    container.style.cssText = `
      position: relative; width: 100%;
      background: ${C.bg}; color: ${C.text};
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      overflow: hidden; padding: 0; margin: 0;
    `;

    container.innerHTML = `
      <div style="max-width:1100px; margin:0 auto; padding:48px 32px 32px;">
        <!-- header -->
        <div style="margin-bottom:28px;">
          <div style="
            font-family:'JetBrains Mono',monospace; font-size:11px; letter-spacing:3px;
            text-transform:uppercase; color:${C.accent}; margin-bottom:10px;
          ">Multi-Agent Systems</div>
          <h2 style="
            font-size:32px; font-weight:700; margin:0 0 12px; line-height:1.2; color:#fff;
          ">Emergent Behavior</h2>
          <p style="
            font-size:14px; line-height:1.65; color:${C.textDim}; max-width:620px; margin:0;
          ">Simple rules, complex outcomes &mdash; emergent tool use from multi-agent interaction.
          Design at runtime through simulation. Click to place food or obstacles.</p>
        </div>

        <!-- canvas wrapper -->
        <div id="em-canvas-wrap" style="
          position:relative; width:100%; border-radius:8px; overflow:hidden;
          border:1px solid ${C.panelBorder}; background:#080c18;
        ">
          <canvas id="em-trail-canvas" style="position:absolute;top:0;left:0;width:100%;height:100%;"></canvas>
          <canvas id="em-canvas" style="position:relative; display:block; width:100%; height:100%;cursor:crosshair;"></canvas>
          <!-- mode indicator -->
          <div id="em-mode-badge" style="
            position:absolute; top:10px; left:10px; padding:4px 10px;
            font-family:'JetBrains Mono',monospace; font-size:10px;
            background:rgba(6,8,15,0.8); border:1px solid ${C.panelBorder};
            border-radius:4px; color:${C.textDim}; pointer-events:none;
          ">OBSERVE</div>
          <!-- live stats overlay -->
          <div id="em-stats" style="
            position:absolute; top:10px; right:10px; padding:6px 12px;
            font-family:'JetBrains Mono',monospace; font-size:10px;
            background:rgba(6,8,15,0.8); border:1px solid ${C.panelBorder};
            border-radius:4px; color:${C.textDim}; pointer-events:none; line-height:1.6;
          "></div>
        </div>

        <!-- controls -->
        <div id="em-controls" style="
          margin-top:16px; display:grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap:12px; font-size:12px;
        "></div>
      </div>
    `;

    canvas = container.querySelector('#em-canvas');
    ctx = canvas.getContext('2d');
    trailCanvas = container.querySelector('#em-trail-canvas');
    trailCtx = trailCanvas.getContext('2d');

    buildControls();
    setupCanvasEvents();
  }

  /* ---- control panel building ---- */
  function buildControls() {
    const wrap = container.querySelector('#em-controls');

    function makeSlider(label, min, max, step, value, onChange) {
      const id = 'em-' + label.replace(/\s/g, '-').toLowerCase();
      const div = document.createElement('div');
      div.style.cssText = `
        background:${C.panel}; border:1px solid ${C.panelBorder}; border-radius:6px;
        padding:10px 14px;
      `;
      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span style="color:${C.textDim};font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:1px;">${label}</span>
          <span id="${id}-val" style="color:${C.text};font-family:'JetBrains Mono',monospace;font-size:11px;">${value}</span>
        </div>
        <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" style="
          width:100%; -webkit-appearance:none; background:rgba(74,158,255,0.1);
          height:4px; border-radius:2px; outline:none; cursor:pointer;
        ">
      `;
      wrap.appendChild(div);
      const inp = div.querySelector(`#${id}`);
      const valEl = div.querySelector(`#${id}-val`);
      inp.addEventListener('input', () => {
        const v = parseFloat(inp.value);
        valEl.textContent = v;
        onChange(v);
      });
      /* style thumb via stylesheet once */
      return div;
    }

    function makeToggleGroup() {
      const div = document.createElement('div');
      div.style.cssText = `
        background:${C.panel}; border:1px solid ${C.panelBorder}; border-radius:6px;
        padding:10px 14px; display:flex; flex-direction:column; gap:6px;
      `;
      div.innerHTML = `<span style="color:${C.textDim};font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Behaviors</span>`;

      function addToggle(label, key) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; justify-content:space-between;';
        row.innerHTML = `
          <span style="color:${C.text};font-size:12px;">${label}</span>
          <button style="
            width:36px; height:20px; border-radius:10px; border:none; cursor:pointer;
            background:${cfg[key] ? C.accent : 'rgba(255,255,255,0.1)'};
            position:relative; transition:background 0.2s;
          ">
            <span style="
              position:absolute; top:2px; left:${cfg[key] ? '18px' : '2px'};
              width:16px; height:16px; border-radius:50%; background:#fff;
              transition: left 0.2s;
            "></span>
          </button>
        `;
        const btn = row.querySelector('button');
        const dot = btn.querySelector('span');
        btn.addEventListener('click', () => {
          cfg[key] = !cfg[key];
          btn.style.background = cfg[key] ? C.accent : 'rgba(255,255,255,0.1)';
          dot.style.left = cfg[key] ? '18px' : '2px';
        });
        div.appendChild(row);
      }

      addToggle('Flocking', 'flocking');
      addToggle('Trail Following', 'trailFollowing');
      addToggle('Scout Signals', 'signalsEnabled');
      wrap.appendChild(div);
    }

    function makeModeButtons() {
      const div = document.createElement('div');
      div.style.cssText = `
        background:${C.panel}; border:1px solid ${C.panelBorder}; border-radius:6px;
        padding:10px 14px; display:flex; flex-direction:column; gap:6px;
      `;
      div.innerHTML = `<span style="color:${C.textDim};font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Interaction</span>`;

      const modes = [
        { label: 'Observe', value: 'observe' },
        { label: 'Add Food', value: 'food' },
        { label: 'Add Obstacle', value: 'obstacle' },
      ];
      const btns = [];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; gap:4px; flex-wrap:wrap;';
      for (const m of modes) {
        const b = document.createElement('button');
        b.textContent = m.label;
        b.dataset.mode = m.value;
        b.style.cssText = `
          flex:1; padding:6px 8px; border-radius:4px; border:1px solid ${C.panelBorder};
          background:${m.value === cfg.interactionMode ? 'rgba(74,158,255,0.2)' : 'transparent'};
          color:${m.value === cfg.interactionMode ? C.accent : C.textDim};
          cursor:pointer; font-size:11px; font-family:'JetBrains Mono',monospace;
          transition: all 0.15s;
        `;
        b.addEventListener('click', () => {
          cfg.interactionMode = m.value;
          for (const ob of btns) {
            const active = ob.dataset.mode === m.value;
            ob.style.background = active ? 'rgba(74,158,255,0.2)' : 'transparent';
            ob.style.color = active ? C.accent : C.textDim;
          }
          const badge = container.querySelector('#em-mode-badge');
          badge.textContent = m.label.toUpperCase();
        });
        btns.push(b);
        row.appendChild(b);
      }
      div.appendChild(row);

      /* clear all button */
      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'Reset Simulation';
      clearBtn.style.cssText = `
        margin-top:4px; padding:6px 8px; border-radius:4px;
        border:1px solid rgba(255,100,100,0.25); background:rgba(255,100,100,0.08);
        color:rgba(255,100,100,0.7); cursor:pointer; font-size:11px;
        font-family:'JetBrains Mono',monospace; transition: all 0.15s;
      `;
      clearBtn.addEventListener('click', () => {
        initSimulation();
      });
      div.appendChild(clearBtn);

      wrap.appendChild(div);
    }

    /* build all controls */
    makeSlider('Foragers', 5, 60, 1, cfg.foragerCount, v => { cfg.foragerCount = v; syncAgentCounts(); });
    makeSlider('Builders', 0, 35, 1, cfg.builderCount, v => { cfg.builderCount = v; syncAgentCounts(); });
    makeSlider('Scouts', 0, 25, 1, cfg.scoutCount, v => { cfg.scoutCount = v; syncAgentCounts(); });
    makeSlider('Speed', 0.2, 3.0, 0.1, cfg.speedMult, v => { cfg.speedMult = v; });
    makeSlider('Trail Decay', 0.95, 0.999, 0.001, cfg.pheromoneDecay, v => { cfg.pheromoneDecay = v; });
    makeToggleGroup();
    makeModeButtons();

    /* inject slider thumb styles */
    const style = document.createElement('style');
    style.textContent = `
      #em-controls input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none; width: 12px; height: 12px;
        background: ${C.accent}; border-radius: 50%; cursor: pointer;
        border: 2px solid #fff;
      }
      #em-controls input[type=range]::-moz-range-thumb {
        width: 12px; height: 12px; background: ${C.accent};
        border-radius: 50%; cursor: pointer; border: 2px solid #fff;
      }
    `;
    container.appendChild(style);
  }

  /* ---- canvas interaction ---- */
  function setupCanvasEvents() {
    canvas.addEventListener('click', e => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (W / rect.width);
      const y = (e.clientY - rect.top) * (H / rect.height);

      if (cfg.interactionMode === 'food') {
        foods.push({
          x, y,
          amount: 1.0, maxAmount: 1.0,
          regenRate: 0.0004 + Math.random() * 0.0003,
          r: rand(9, 13),
        });
      } else if (cfg.interactionMode === 'obstacle') {
        const isRect = Math.random() > 0.5;
        obstacles.push({
          x, y,
          r: rand(18, 30),
          w: isRect ? rand(25, 55) : 0,
          h: isRect ? rand(20, 40) : 0,
          isRect,
        });
      }
    });
  }

  /* ---- stats display ---- */
  function updateStatsDisplay() {
    const el = container.querySelector('#em-stats');
    if (el) {
      el.innerHTML = `
        Food: ${stats.foodCollected} &nbsp;|&nbsp; Agents: ${stats.activeAgents} &nbsp;|&nbsp; Trails: ${stats.trailCoverage}%
      `;
    }
  }

  /* ---- wrapped loop with stats update ---- */
  function mainLoop(ts) {
    if (!running) return;
    const dt = Math.min((ts - (lastTime || ts)) / 16.67, 3);
    lastTime = ts;

    step(dt);
    render();
    if (frameCount % 15 === 0) updateStatsDisplay();

    animFrameId = requestAnimationFrame(mainLoop);
  }

  /* ---- public API ---- */
  return {
    init(containerEl) {
      buildDOM(containerEl);
      this.resize();
      initSimulation();
      window.addEventListener('resize', () => this.resize());
    },

    start() {
      if (running) return;
      running = true;
      lastTime = 0;
      animFrameId = requestAnimationFrame(mainLoop);
    },

    stop() {
      running = false;
      if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    },

    resize() {
      if (!canvas) return;
      dpr = window.devicePixelRatio || 1;
      const wrap = container.querySelector('#em-canvas-wrap');
      const rect = wrap.getBoundingClientRect();
      W = Math.min(rect.width, 1100);
      H = Math.max(400, Math.min(W * 0.55, 550));

      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';

      trailCanvas.width = W * dpr;
      trailCanvas.height = H * dpr;
      trailCanvas.style.width = W + 'px';
      trailCanvas.style.height = H + 'px';

      initPheromoneGrid();
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = EmergentSection;
