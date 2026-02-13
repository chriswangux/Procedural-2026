// ============================================================
// Semantic Manipulation — Interactive Demo Section
// Direct Manipulation (1982) vs Semantic Manipulation (2019+)
// ============================================================

const SemanticSection = {
  _container: null,
  _canvas: null,
  _ctx: null,
  _raf: null,
  _running: false,
  _width: 0,
  _height: 0,
  _dpr: 1,
  _time: 0,

  // ---- Direct manipulation: raw draggable handles ----
  _handles: [],
  _dragging: null,
  _dragOffset: { x: 0, y: 0 },
  _hovered: null,

  // ---- Semantic sliders ----
  _sliders: {
    mood: 0.5,
    energy: 0.3,
    age: 0.2,
    style: 0.4,
  },
  _activeSlider: null,
  _sliderRects: [],
  _sliderHovered: null,

  // ---- Connection lines animation ----
  _connectionAlpha: 0,
  _connectionTarget: 0.6,

  // ---- Quote fade ----
  _quotePhase: 0,

  // ---- Layout ----
  _leftCenter: { x: 0, y: 0 },
  _rightCenter: { x: 0, y: 0 },
  _faceRadius: 0,

  // ---- Mouse state ----
  _mouse: { x: 0, y: 0 },
  _mouseDown: false,

  // ================================================================
  //  INIT
  // ================================================================
  init(container) {
    this._container = container;
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.background = '#0a0a0f';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.cursor = 'default';
    container.style.userSelect = 'none';

    this._canvas = document.createElement('canvas');
    this._canvas.style.position = 'absolute';
    this._canvas.style.top = '0';
    this._canvas.style.left = '0';
    this._canvas.style.width = '100%';
    this._canvas.style.height = '100%';
    container.appendChild(this._canvas);

    this._ctx = this._canvas.getContext('2d');
    this._dpr = window.devicePixelRatio || 1;

    this._boundMouseDown = this._onMouseDown.bind(this);
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseUp = this._onMouseUp.bind(this);
    this._boundTouchStart = this._onTouchStart.bind(this);
    this._boundTouchMove = this._onTouchMove.bind(this);
    this._boundTouchEnd = this._onTouchEnd.bind(this);

    this._canvas.addEventListener('mousedown', this._boundMouseDown);
    this._canvas.addEventListener('mousemove', this._boundMouseMove);
    window.addEventListener('mouseup', this._boundMouseUp);
    this._canvas.addEventListener('touchstart', this._boundTouchStart, { passive: false });
    this._canvas.addEventListener('touchmove', this._boundTouchMove, { passive: false });
    window.addEventListener('touchend', this._boundTouchEnd);

    this._boundDraw = this._draw.bind(this);

    this.resize();
    this._initHandles();
  },

  // ================================================================
  //  HANDLE INITIALIZATION (Direct Manipulation side)
  // ================================================================
  _initHandles() {
    // We define handles relative to face center; they'll be offset in draw
    // Format: { id, rx, ry, label, color }
    // rx, ry are relative to face center, in units of faceRadius
    this._handles = [
      // Head shape (4 control points around the ellipse)
      { id: 'head_top', rx: 0, ry: -1.0, label: 'Head Top', color: '#6e7fff' },
      { id: 'head_right', rx: 0.85, ry: 0, label: 'Head Right', color: '#6e7fff' },
      { id: 'head_bottom', rx: 0, ry: 0.9, label: 'Head Bottom', color: '#6e7fff' },
      { id: 'head_left', rx: -0.85, ry: 0, label: 'Head Left', color: '#6e7fff' },

      // Eyes
      { id: 'eye_l', rx: -0.32, ry: -0.18, label: 'Left Eye', color: '#ff6eb4' },
      { id: 'eye_r', rx: 0.32, ry: -0.18, label: 'Right Eye', color: '#ff6eb4' },
      { id: 'eye_l_size', rx: -0.42, ry: -0.28, label: 'L Eye Size', color: '#ff6eb4' },
      { id: 'eye_r_size', rx: 0.42, ry: -0.28, label: 'R Eye Size', color: '#ff6eb4' },

      // Eyebrows
      { id: 'brow_l', rx: -0.36, ry: -0.40, label: 'Left Brow', color: '#ffb86e' },
      { id: 'brow_r', rx: 0.36, ry: -0.40, label: 'Right Brow', color: '#ffb86e' },

      // Nose
      { id: 'nose', rx: 0, ry: 0.08, label: 'Nose', color: '#7fffd4' },

      // Mouth (3 points: left, center curve, right)
      { id: 'mouth_l', rx: -0.28, ry: 0.38, label: 'Mouth L', color: '#ff6e6e' },
      { id: 'mouth_c', rx: 0, ry: 0.44, label: 'Mouth Curve', color: '#ff6e6e' },
      { id: 'mouth_r', rx: 0.28, ry: 0.38, label: 'Mouth R', color: '#ff6e6e' },

      // Cheeks
      { id: 'cheek_l', rx: -0.52, ry: 0.22, label: 'Left Cheek', color: '#ffb86e' },
      { id: 'cheek_r', rx: 0.52, ry: 0.22, label: 'Right Cheek', color: '#ffb86e' },
    ];
  },

  // ================================================================
  //  COMPUTE FACE PARAMS FROM SEMANTIC SLIDERS
  // ================================================================
  _semanticToFace(s) {
    const mood = s.mood;        // 0=sad, 1=happy
    const energy = s.energy;    // 0=calm, 1=excited
    const age = s.age;          // 0=young, 1=old
    const style = s.style;      // 0=minimal, 1=detailed

    const mouthCurve = -0.12 + mood * 0.24;      // -0.12 (frown) to +0.12 (smile)
    const mouthWidth = 0.22 + energy * 0.14;      // wider when energetic
    const eyeOpenness = 0.5 + energy * 0.5;        // more open when energetic
    const browLift = -0.40 + mood * 0.1 - (1 - energy) * 0.06;
    const eyeSize = 0.10 + (1 - age) * 0.05 + energy * 0.03;
    const headSquash = 1.0 - age * 0.08;           // slightly squashed when old
    const headStretch = 1.0 + age * 0.06;
    const cheekPuff = mood * 0.4 + energy * 0.2;
    const noseSize = 0.8 + age * 0.4;
    const wrinkles = age * style;
    const blush = mood * 0.6 * style;
    const pupilSize = 0.4 + energy * 0.3;
    const mouthOpenness = energy * 0.6 * mood;
    const browAngle = (1 - mood) * 0.15 * energy;

    return {
      mouthCurve, mouthWidth, eyeOpenness, browLift, eyeSize,
      headSquash, headStretch, cheekPuff, noseSize, wrinkles,
      blush, pupilSize, mouthOpenness, browAngle,
    };
  },

  // ================================================================
  //  COMPUTE FACE PARAMS FROM DIRECT HANDLES
  // ================================================================
  _handlesToFace() {
    const get = (id) => this._handles.find(h => h.id === id);
    const mouthC = get('mouth_c');
    const mouthL = get('mouth_l');
    const mouthR = get('mouth_r');
    const browL = get('brow_l');
    const browR = get('brow_r');
    const eyeL = get('eye_l');
    const eyeR = get('eye_r');
    const eyeLs = get('eye_l_size');
    const eyeRs = get('eye_r_size');
    const nose = get('nose');
    const headTop = get('head_top');
    const headRight = get('head_right');
    const cheekL = get('cheek_l');
    const cheekR = get('cheek_r');

    return {
      mouthCurve: mouthC.ry - 0.38,
      mouthWidth: (mouthR.rx - mouthL.rx) / 2,
      eyeOpenness: 0.7,
      browLift: browL.ry,
      eyeSize: Math.abs(eyeLs.ry - eyeL.ry) * 0.8 + 0.04,
      headSquash: headRight.rx / 0.85,
      headStretch: -headTop.ry / 1.0,
      cheekPuff: Math.max(0, (Math.abs(cheekL.rx) - 0.45) * 3),
      noseSize: 0.8 + (nose.ry - 0.08) * 2,
      wrinkles: 0,
      blush: Math.max(0, (Math.abs(cheekR.rx) - 0.45) * 2),
      pupilSize: 0.55,
      mouthOpenness: Math.max(0, (mouthC.ry - 0.38) * 4),
      browAngle: (browR.ry - browL.ry) * 0.5,
      // Carry raw positions for direct rendering
      _raw: true,
      _eyeL: { rx: eyeL.rx, ry: eyeL.ry },
      _eyeR: { rx: eyeR.rx, ry: eyeR.ry },
      _browL: { rx: browL.rx, ry: browL.ry },
      _browR: { rx: browR.rx, ry: browR.ry },
      _mouthL: { rx: mouthL.rx, ry: mouthL.ry },
      _mouthC: { rx: mouthC.rx, ry: mouthC.ry },
      _mouthR: { rx: mouthR.rx, ry: mouthR.ry },
      _nose: { rx: nose.rx, ry: nose.ry },
      _cheekL: { rx: cheekL.rx, ry: cheekL.ry },
      _cheekR: { rx: cheekR.rx, ry: cheekR.ry },
      _headTop: { rx: headTop.rx, ry: headTop.ry },
      _headRight: { rx: headRight.rx, ry: headRight.ry },
      _headBottom: { rx: this._handles.find(h => h.id === 'head_bottom').rx, ry: this._handles.find(h => h.id === 'head_bottom').ry },
      _headLeft: { rx: this._handles.find(h => h.id === 'head_left').rx, ry: this._handles.find(h => h.id === 'head_left').ry },
    };
  },

  // ================================================================
  //  DRAW FACE (shared renderer)
  // ================================================================
  _drawFace(ctx, cx, cy, r, params, t) {
    const raw = params._raw;

    // --- Head outline ---
    ctx.save();
    ctx.translate(cx, cy);

    const headW = r * (raw ? Math.abs(params._headRight.rx) / 0.85 : params.headSquash);
    const headH = r * (raw ? Math.abs(params._headTop.ry) / 1.0 : params.headStretch);

    // Glow behind head
    const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.6);
    glow.addColorStop(0, 'rgba(110, 127, 255, 0.06)');
    glow.addColorStop(1, 'rgba(110, 127, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);

    // Head shape using bezier for organic feel
    if (raw) {
      const ht = params._headTop;
      const hr = params._headRight;
      const hb = params._headBottom;
      const hl = params._headLeft;
      ctx.beginPath();
      ctx.moveTo(ht.rx * r, ht.ry * r);
      ctx.bezierCurveTo(
        hr.rx * r * 0.7, ht.ry * r * 0.5,
        hr.rx * r, hr.ry * r * 0.4,
        hr.rx * r, hr.ry * r
      );
      ctx.bezierCurveTo(
        hr.rx * r, hb.ry * r * 0.5,
        hb.rx * r * 0.6 + hr.rx * r * 0.3, hb.ry * r,
        hb.rx * r, hb.ry * r
      );
      ctx.bezierCurveTo(
        hl.rx * r * 0.3 + hb.rx * r * 0.1, hb.ry * r,
        hl.rx * r, hb.ry * r * 0.5,
        hl.rx * r, hl.ry * r
      );
      ctx.bezierCurveTo(
        hl.rx * r, ht.ry * r * 0.4,
        hl.rx * r * 0.7, ht.ry * r * 0.5,
        ht.rx * r, ht.ry * r
      );
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, headW * 0.85, headH, 0, 0, Math.PI * 2);
    }

    // Skin gradient
    const skinGrad = ctx.createLinearGradient(0, -headH, 0, headH);
    skinGrad.addColorStop(0, '#f7e8d5');
    skinGrad.addColorStop(1, '#ebd5be');
    ctx.fillStyle = skinGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(180, 150, 120, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // --- Wrinkles (age + style) ---
    if (params.wrinkles > 0.1) {
      ctx.globalAlpha = params.wrinkles * 0.4;
      ctx.strokeStyle = 'rgba(160, 130, 100, 0.5)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const wy = -headH * 0.55 + i * r * 0.06;
        ctx.beginPath();
        ctx.moveTo(-headW * 0.3, wy);
        ctx.quadraticCurveTo(0, wy - r * 0.02, headW * 0.3, wy);
        ctx.stroke();
      }
      // crow's feet
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          const sx = side * headW * 0.55;
          const sy = -r * 0.15 + i * r * 0.06;
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + side * r * 0.12, sy - r * 0.04 + i * r * 0.08);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // --- Cheeks / Blush ---
    if (params.blush > 0.05 || params.cheekPuff > 0.05) {
      for (let side = -1; side <= 1; side += 2) {
        let chx, chy;
        if (raw) {
          const ch = side < 0 ? params._cheekL : params._cheekR;
          chx = ch.rx * r;
          chy = ch.ry * r;
        } else {
          chx = side * headW * 0.52;
          chy = r * 0.22;
        }

        const blushGrad = ctx.createRadialGradient(chx, chy, 0, chx, chy, r * 0.22);
        blushGrad.addColorStop(0, `rgba(255, 140, 140, ${Math.min(params.blush, 0.6) * 0.5 + params.cheekPuff * 0.15})`);
        blushGrad.addColorStop(1, 'rgba(255, 140, 140, 0)');
        ctx.fillStyle = blushGrad;
        ctx.beginPath();
        ctx.arc(chx, chy, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- Eyes ---
    for (let side = -1; side <= 1; side += 2) {
      let ex, ey;
      if (raw) {
        const e = side < 0 ? params._eyeL : params._eyeR;
        ex = e.rx * r;
        ey = e.ry * r;
      } else {
        ex = side * r * 0.32;
        ey = -r * 0.18;
      }

      const eSize = params.eyeSize * r;
      const openness = params.eyeOpenness;
      const bounce = Math.sin(t * 3) * 0.01 * (1 + params.pupilSize);

      // Eye white
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(ex, ey, eSize, eSize * openness * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120, 100, 80, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Iris
      const irisR = eSize * 0.55;
      const irisGrad = ctx.createRadialGradient(
        ex + bounce * r, ey, irisR * 0.2,
        ex, ey, irisR
      );
      irisGrad.addColorStop(0, '#5b8fd9');
      irisGrad.addColorStop(0.7, '#3a6cb5');
      irisGrad.addColorStop(1, '#2a4a7a');
      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.arc(ex + bounce * r, ey, irisR, 0, Math.PI * 2);
      ctx.fill();

      // Pupil
      const pupR = irisR * params.pupilSize;
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(ex + bounce * r, ey, pupR, 0, Math.PI * 2);
      ctx.fill();

      // Eye highlight
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(ex + eSize * 0.2 + bounce * r, ey - eSize * 0.2, eSize * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Eyebrows ---
    for (let side = -1; side <= 1; side += 2) {
      let bx, by, angle;
      if (raw) {
        const b = side < 0 ? params._browL : params._browR;
        bx = b.rx * r;
        by = b.ry * r;
        angle = 0;
      } else {
        bx = side * r * 0.36;
        by = params.browLift * r;
        angle = side * params.browAngle;
      }

      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(angle);
      ctx.strokeStyle = 'rgba(80, 60, 40, 0.7)';
      ctx.lineWidth = 3 + params.eyeSize * 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.12, 0);
      ctx.quadraticCurveTo(0, -r * 0.04, r * 0.12, 0);
      ctx.stroke();
      ctx.restore();
    }

    // --- Nose ---
    let nx, ny;
    if (raw) {
      nx = params._nose.rx * r;
      ny = params._nose.ry * r;
    } else {
      nx = 0;
      ny = r * 0.08;
    }
    const ns = params.noseSize;
    ctx.strokeStyle = 'rgba(160, 130, 100, 0.5)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(nx - r * 0.04 * ns, ny - r * 0.04 * ns);
    ctx.quadraticCurveTo(nx + r * 0.02 * ns, ny + r * 0.06 * ns, nx + r * 0.05 * ns, ny);
    ctx.stroke();

    // --- Mouth ---
    let mlx, mly, mcx, mcy, mrx, mry;
    if (raw) {
      mlx = params._mouthL.rx * r;
      mly = params._mouthL.ry * r;
      mcx = params._mouthC.rx * r;
      mcy = params._mouthC.ry * r;
      mrx = params._mouthR.rx * r;
      mry = params._mouthR.ry * r;
    } else {
      mlx = -params.mouthWidth * r;
      mly = r * 0.38;
      mcx = 0;
      mcy = r * (0.38 + params.mouthCurve);
      mrx = params.mouthWidth * r;
      mry = r * 0.38;
    }

    // Mouth opening
    if (params.mouthOpenness > 0.05) {
      ctx.fillStyle = 'rgba(80, 30, 30, 0.8)';
      ctx.beginPath();
      ctx.moveTo(mlx, mly);
      ctx.quadraticCurveTo(mcx, mcy, mrx, mry);
      ctx.quadraticCurveTo(mcx, mcy - r * params.mouthOpenness * 0.15, mlx, mly);
      ctx.fill();
    }

    // Mouth line
    ctx.strokeStyle = 'rgba(180, 80, 80, 0.7)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mlx, mly);
    ctx.quadraticCurveTo(mcx, mcy, mrx, mry);
    ctx.stroke();

    // Lip color
    if (params.mouthOpenness > 0.05) {
      ctx.strokeStyle = 'rgba(200, 100, 100, 0.3)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(mlx * 0.8, mly);
      ctx.quadraticCurveTo(mcx, mcy - r * 0.02, mrx * 0.8, mry);
      ctx.stroke();
    }

    ctx.restore();
  },

  // ================================================================
  //  DRAW DIRECT MANIPULATION HANDLES
  // ================================================================
  _drawHandles(ctx, cx, cy, r) {
    const handleR = Math.max(6, r * 0.045);

    for (let i = 0; i < this._handles.length; i++) {
      const h = this._handles[i];
      const hx = cx + h.rx * r;
      const hy = cy + h.ry * r;
      const isHovered = this._hovered === i;
      const isDragging = this._dragging === i;

      // Connection line to center
      ctx.strokeStyle = `rgba(110, 127, 255, ${isHovered || isDragging ? 0.3 : 0.08})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Handle dot
      const pulse = isDragging ? 1.3 : isHovered ? 1.15 : 1;
      ctx.fillStyle = isDragging ? '#fff' : h.color;
      ctx.globalAlpha = isDragging ? 1 : isHovered ? 0.95 : 0.7;
      ctx.beginPath();
      ctx.arc(hx, hy, handleR * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Ring
      ctx.strokeStyle = isDragging ? h.color : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = isDragging ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(hx, hy, handleR * pulse + 2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 1;

      // Label on hover
      if (isHovered || isDragging) {
        ctx.font = `${Math.max(10, r * 0.08)}px "SF Mono", "Fira Code", monospace`;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.textAlign = 'center';
        ctx.fillText(h.label, hx, hy - handleR * 2);
      }
    }
  },

  // ================================================================
  //  DRAW SEMANTIC SLIDERS
  // ================================================================
  _drawSliders(ctx, cx, cy, r) {
    const sliderDefs = [
      { key: 'mood', label: 'Mood', left: 'Sad', right: 'Happy', color: '#ff6eb4' },
      { key: 'energy', label: 'Energy', left: 'Calm', right: 'Excited', color: '#6effb4' },
      { key: 'age', label: 'Age', left: 'Young', right: 'Old', color: '#ffb86e' },
      { key: 'style', label: 'Style', left: 'Minimal', right: 'Detailed', color: '#6ec3ff' },
    ];

    const sliderW = Math.min(r * 1.6, 280);
    const sliderH = Math.max(8, r * 0.06);
    const spacing = Math.max(42, r * 0.38);
    const startY = cy + r * 1.1;
    const startX = cx - sliderW / 2;

    this._sliderRects = [];

    for (let i = 0; i < sliderDefs.length; i++) {
      const sd = sliderDefs[i];
      const val = this._sliders[sd.key];
      const sy = startY + i * spacing;
      const isHovered = this._sliderHovered === i;
      const isActive = this._activeSlider === sd.key;

      this._sliderRects.push({
        key: sd.key,
        x: startX,
        y: sy - sliderH * 2,
        w: sliderW,
        h: sliderH * 4 + 10,
        trackY: sy,
        trackH: sliderH,
      });

      // Label
      const fontSize = Math.max(11, r * 0.09);
      ctx.font = `600 ${fontSize}px -apple-system, "Segoe UI", sans-serif`;
      ctx.fillStyle = isActive ? sd.color : 'rgba(255,255,255,0.75)';
      ctx.textAlign = 'left';
      ctx.fillText(sd.label, startX, sy - sliderH * 1.5);

      // Range labels
      ctx.font = `${fontSize * 0.8}px -apple-system, "Segoe UI", sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.textAlign = 'left';
      ctx.fillText(sd.left, startX, sy + sliderH * 2.8);
      ctx.textAlign = 'right';
      ctx.fillText(sd.right, startX + sliderW, sy + sliderH * 2.8);

      // Track background
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.roundRect(startX, sy - sliderH / 2, sliderW, sliderH, sliderH / 2);
      ctx.fill();

      // Filled portion
      const fillGrad = ctx.createLinearGradient(startX, 0, startX + sliderW, 0);
      fillGrad.addColorStop(0, sd.color + '40');
      fillGrad.addColorStop(val, sd.color + 'cc');
      ctx.fillStyle = fillGrad;
      ctx.beginPath();
      ctx.roundRect(startX, sy - sliderH / 2, sliderW * val, sliderH, sliderH / 2);
      ctx.fill();

      // Thumb
      const thumbX = startX + sliderW * val;
      const thumbR = isActive ? sliderH * 1.4 : isHovered ? sliderH * 1.2 : sliderH * 0.95;

      if (isActive) {
        ctx.fillStyle = sd.color + '30';
        ctx.beginPath();
        ctx.arc(thumbX, sy, thumbR * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(thumbX, sy, thumbR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = sd.color;
      ctx.beginPath();
      ctx.arc(thumbX, sy, thumbR * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  // ================================================================
  //  DRAW CONNECTION VISUALIZATION
  // ================================================================
  _drawConnections(ctx, cx, cy, r, params, t) {
    if (this._connectionAlpha < 0.01) return;

    const sliderDefs = ['mood', 'energy', 'age', 'style'];
    const paramNames = [
      'mouthCurve', 'mouthWidth', 'eyeOpenness', 'browLift',
      'eyeSize', 'headSquash', 'cheekPuff', 'noseSize',
      'pupilSize', 'mouthOpenness', 'blush', 'wrinkles',
    ];

    // Map which sliders affect which params (simplified)
    const connections = {
      mood: ['mouthCurve', 'cheekPuff', 'blush', 'mouthOpenness', 'browLift'],
      energy: ['mouthWidth', 'eyeOpenness', 'pupilSize', 'mouthOpenness', 'eyeSize'],
      age: ['headSquash', 'noseSize', 'wrinkles', 'eyeSize'],
      style: ['wrinkles', 'blush'],
    };

    const colors = {
      mood: '#ff6eb4',
      energy: '#6effb4',
      age: '#ffb86e',
      style: '#6ec3ff',
    };

    // Slider positions
    const sliderW = Math.min(r * 1.6, 280);
    const startY = cy + r * 1.1;
    const spacing = Math.max(42, r * 0.38);
    const sliderX = cx;

    // Param visualization positions (small dots in a row between face and sliders)
    const paramY = cy + r * 0.75;
    const paramSpacing = sliderW / (paramNames.length + 1);
    const paramStartX = cx - sliderW / 2;

    ctx.globalAlpha = this._connectionAlpha * 0.5;

    // Draw parameter dots
    for (let i = 0; i < paramNames.length; i++) {
      const px = paramStartX + (i + 1) * paramSpacing;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(px, paramY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw connection lines
    for (let si = 0; si < sliderDefs.length; si++) {
      const sKey = sliderDefs[si];
      const sy = startY + si * spacing;
      const linked = connections[sKey];
      const color = colors[sKey];

      for (let pi = 0; pi < paramNames.length; pi++) {
        if (linked.indexOf(paramNames[pi]) === -1) continue;
        const px = paramStartX + (pi + 1) * paramSpacing;

        const wave = Math.sin(t * 2 + si + pi * 0.5) * 0.15 + 0.85;

        ctx.strokeStyle = color;
        ctx.globalAlpha = this._connectionAlpha * 0.25 * wave;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sliderX, sy - 10);
        ctx.bezierCurveTo(
          sliderX, sy - 10 - (sy - paramY) * 0.3,
          px, paramY + (sy - paramY) * 0.3,
          px, paramY
        );
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  },

  // ================================================================
  //  DRAW LABELS & QUOTES
  // ================================================================
  _drawLabels(ctx, t) {
    const w = this._width / this._dpr;
    const h = this._height / this._dpr;
    const leftX = w * 0.25;
    const rightX = w * 0.75;
    const dividerX = w * 0.5;

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(dividerX, h * 0.05);
    ctx.lineTo(dividerX, h * 0.95);
    ctx.stroke();
    ctx.setLineDash([]);

    // "VS" badge
    const vsY = h * 0.08;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.arc(dividerX, vsY, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 12px -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VS', dividerX, vsY);

    // Section titles
    const titleSize = Math.max(14, Math.min(22, w * 0.018));
    ctx.font = `700 ${titleSize}px -apple-system, "Segoe UI", sans-serif`;

    ctx.fillStyle = 'rgba(110, 127, 255, 0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Direct Manipulation', leftX, h * 0.03);

    ctx.fillStyle = 'rgba(255, 110, 180, 0.9)';
    ctx.fillText('Semantic Manipulation', rightX, h * 0.03);

    // Year badges
    const badgeSize = Math.max(11, titleSize * 0.65);
    ctx.font = `600 ${badgeSize}px "SF Mono", "Fira Code", monospace`;
    ctx.fillStyle = 'rgba(110, 127, 255, 0.5)';
    ctx.fillText('1982', leftX, h * 0.03 + titleSize * 1.5);
    ctx.fillStyle = 'rgba(255, 110, 180, 0.5)';
    ctx.fillText('2019+', rightX, h * 0.03 + titleSize * 1.5);

    // Quotes at bottom
    const quoteAlpha = 0.4 + Math.sin(t * 0.5) * 0.1;
    const quoteSize = Math.max(9, Math.min(12, w * 0.01));
    ctx.font = `italic ${quoteSize}px Georgia, "Times New Roman", serif`;
    ctx.textBaseline = 'bottom';

    ctx.fillStyle = `rgba(110, 127, 255, ${quoteAlpha})`;
    ctx.textAlign = 'center';
    ctx.fillText('"The future of interactive systems', leftX, h - quoteSize * 2.5);
    ctx.fillText('and the emergence of Direct Manipulation."', leftX, h - quoteSize * 1.2);
    ctx.font = `${quoteSize * 0.9}px "SF Mono", "Fira Code", monospace`;
    ctx.fillStyle = `rgba(110, 127, 255, ${quoteAlpha * 0.6})`;
    ctx.fillText('-- Ben Shneiderman, 1982', leftX, h - 2);

    ctx.font = `italic ${quoteSize}px Georgia, "Times New Roman", serif`;
    ctx.fillStyle = `rgba(255, 110, 180, ${quoteAlpha})`;
    ctx.textAlign = 'center';
    ctx.fillText('"The future of interactive systems', rightX, h - quoteSize * 2.5);
    ctx.fillText('and the emergence of Semantic Manipulation."', rightX, h - quoteSize * 1.2);
    ctx.font = `${quoteSize * 0.9}px "SF Mono", "Fira Code", monospace`;
    ctx.fillStyle = `rgba(255, 110, 180, ${quoteAlpha * 0.6})`;
    ctx.fillText('-- 2019', rightX, h - 2);

    // "We are the conductor" — center bottom
    const conductorAlpha = 0.3 + Math.sin(t * 0.7 + 1) * 0.15;
    const condSize = Math.max(13, Math.min(20, w * 0.016));
    ctx.font = `300 ${condSize}px -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = `rgba(255, 255, 255, ${conductorAlpha})`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('We are the conductor.', dividerX, h - condSize * 3);

    // Handle count comparison
    const countSize = Math.max(9, Math.min(11, w * 0.009));
    ctx.font = `${countSize}px "SF Mono", "Fira Code", monospace`;
    ctx.textBaseline = 'top';

    ctx.fillStyle = 'rgba(110, 127, 255, 0.35)';
    ctx.textAlign = 'center';
    ctx.fillText(`${this._handles.length} control points`, leftX, h * 0.03 + titleSize * 2.6);

    ctx.fillStyle = 'rgba(255, 110, 180, 0.35)';
    ctx.textAlign = 'center';
    ctx.fillText('4 semantic dimensions', rightX, h * 0.03 + titleSize * 2.6);
  },

  // ================================================================
  //  DRAW INSTRUCTION HINTS
  // ================================================================
  _drawHints(ctx, leftX, rightX, faceY, r) {
    const hintSize = Math.max(9, r * 0.09);
    ctx.font = `${hintSize}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillText('Drag any handle to reshape', leftX, faceY - r * 1.28);
    ctx.fillText('Move the sliders below', rightX, faceY - r * 1.28);
  },

  // ================================================================
  //  MAIN DRAW
  // ================================================================
  _draw(timestamp) {
    if (!this._running) return;
    this._raf = requestAnimationFrame(this._boundDraw);

    this._time = timestamp * 0.001;
    const t = this._time;
    const ctx = this._ctx;
    const w = this._width / this._dpr;
    const h = this._height / this._dpr;

    ctx.save();
    ctx.scale(this._dpr, this._dpr);

    // Clear
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

    // Subtle background grid
    ctx.strokeStyle = 'rgba(255,255,255,0.015)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let gx = 0; gx < w; gx += gridSize) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    // Layout
    const leftX = w * 0.25;
    const rightX = w * 0.75;
    const faceY = h * 0.38;
    const fr = Math.min(w * 0.14, h * 0.2, 120);

    this._leftCenter = { x: leftX, y: faceY };
    this._rightCenter = { x: rightX, y: faceY };
    this._faceRadius = fr;

    // Draw labels
    this._drawLabels(ctx, t);
    this._drawHints(ctx, leftX, rightX, faceY, fr);

    // --- LEFT: Direct Manipulation Face ---
    const directParams = this._handlesToFace();
    this._drawFace(ctx, leftX, faceY, fr, directParams, t);
    this._drawHandles(ctx, leftX, faceY, fr);

    // --- RIGHT: Semantic Manipulation Face ---
    const semanticParams = this._semanticToFace(this._sliders);
    this._drawFace(ctx, rightX, faceY, fr, semanticParams, t);
    this._drawSliders(ctx, rightX, faceY, fr);

    // Connection visualization (animate in when slider active)
    if (this._activeSlider) {
      this._connectionTarget = 0.85;
    } else {
      this._connectionTarget = 0.3;
    }
    this._connectionAlpha += (this._connectionTarget - this._connectionAlpha) * 0.06;
    this._drawConnections(ctx, rightX, faceY, fr, semanticParams, t);

    ctx.restore();
  },

  // ================================================================
  //  INPUT HANDLING
  // ================================================================
  _getCanvasPos(e) {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * this._dpr,
      y: (e.clientY - rect.top) * this._dpr,
    };
  },

  _findHandle(mx, my) {
    const cx = this._leftCenter.x * this._dpr;
    const cy = this._leftCenter.y * this._dpr;
    const r = this._faceRadius * this._dpr;
    const hitR = Math.max(12, r * 0.08);

    for (let i = 0; i < this._handles.length; i++) {
      const h = this._handles[i];
      const hx = cx + h.rx * r;
      const hy = cy + h.ry * r;
      const dx = mx - hx;
      const dy = my - hy;
      if (dx * dx + dy * dy < hitR * hitR * 2.5) {
        return i;
      }
    }
    return null;
  },

  _findSlider(mx, my) {
    const d = this._dpr;
    for (let i = 0; i < this._sliderRects.length; i++) {
      const sr = this._sliderRects[i];
      if (mx / d >= sr.x && mx / d <= sr.x + sr.w &&
          my / d >= sr.y && my / d <= sr.y + sr.h) {
        return i;
      }
    }
    return null;
  },

  _updateSliderValue(sliderIdx, mx) {
    const sr = this._sliderRects[sliderIdx];
    const x = mx / this._dpr;
    let val = (x - sr.x) / sr.w;
    val = Math.max(0, Math.min(1, val));
    this._sliders[sr.key] = val;
  },

  _onMouseDown(e) {
    const pos = this._getCanvasPos(e);
    this._mouseDown = true;

    // Check handles first
    const hi = this._findHandle(pos.x, pos.y);
    if (hi !== null) {
      this._dragging = hi;
      const h = this._handles[hi];
      const cx = this._leftCenter.x * this._dpr;
      const cy = this._leftCenter.y * this._dpr;
      const r = this._faceRadius * this._dpr;
      this._dragOffset.x = pos.x - (cx + h.rx * r);
      this._dragOffset.y = pos.y - (cy + h.ry * r);
      this._canvas.style.cursor = 'grabbing';
      return;
    }

    // Check sliders
    const si = this._findSlider(pos.x, pos.y);
    if (si !== null) {
      this._activeSlider = this._sliderRects[si].key;
      this._updateSliderValue(si, pos.x);
      this._canvas.style.cursor = 'grabbing';
      return;
    }
  },

  _onMouseMove(e) {
    const pos = this._getCanvasPos(e);
    this._mouse = pos;

    if (this._dragging !== null) {
      const h = this._handles[this._dragging];
      const cx = this._leftCenter.x * this._dpr;
      const cy = this._leftCenter.y * this._dpr;
      const r = this._faceRadius * this._dpr;
      h.rx = (pos.x - this._dragOffset.x - cx) / r;
      h.ry = (pos.y - this._dragOffset.y - cy) / r;
      // Clamp
      h.rx = Math.max(-1.3, Math.min(1.3, h.rx));
      h.ry = Math.max(-1.3, Math.min(1.3, h.ry));
      return;
    }

    if (this._activeSlider) {
      for (let i = 0; i < this._sliderRects.length; i++) {
        if (this._sliderRects[i].key === this._activeSlider) {
          this._updateSliderValue(i, pos.x);
          break;
        }
      }
      return;
    }

    // Hover detection
    const hi = this._findHandle(pos.x, pos.y);
    this._hovered = hi;

    const si = this._findSlider(pos.x, pos.y);
    this._sliderHovered = si;

    if (hi !== null || si !== null) {
      this._canvas.style.cursor = 'grab';
    } else {
      this._canvas.style.cursor = 'default';
    }
  },

  _onMouseUp() {
    this._dragging = null;
    this._activeSlider = null;
    this._mouseDown = false;
    this._canvas.style.cursor = this._hovered !== null || this._sliderHovered !== null ? 'grab' : 'default';
  },

  _onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      this._onMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
    }
  },

  _onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      this._onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }
  },

  _onTouchEnd(e) {
    this._onMouseUp();
  },

  // ================================================================
  //  LIFECYCLE
  // ================================================================
  start() {
    if (this._running) return;
    this._running = true;
    this._raf = requestAnimationFrame(this._boundDraw);
  },

  stop() {
    this._running = false;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  },

  resize() {
    const rect = this._container.getBoundingClientRect();
    this._dpr = window.devicePixelRatio || 1;
    this._width = rect.width * this._dpr;
    this._height = rect.height * this._dpr;
    this._canvas.width = this._width;
    this._canvas.height = this._height;
  },

  destroy() {
    this.stop();
    this._canvas.removeEventListener('mousedown', this._boundMouseDown);
    this._canvas.removeEventListener('mousemove', this._boundMouseMove);
    window.removeEventListener('mouseup', this._boundMouseUp);
    this._canvas.removeEventListener('touchstart', this._boundTouchStart);
    this._canvas.removeEventListener('touchmove', this._boundTouchMove);
    window.removeEventListener('touchend', this._boundTouchEnd);
    if (this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }
  },
};

// Export for module systems or global use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SemanticSection;
} else if (typeof window !== 'undefined') {
  window.SemanticSection = SemanticSection;
}
