import gsap from 'gsap';

/**
 * The ledger relief behind the hero: dead-straight ruled rows in real perspective, like a ledger page laid flat
 * and seen from a low desk. There is one flat-topped ridge per lane (awaiting, held, captured, blocked, released)
 * and each ridge stands as high as the live count of orders in that lane, so the background is the ledger itself
 * and nothing in it is decoration. Ridge lines take their lane's colour. The rows glide slowly toward you, a gate
 * decision sends one band of light down the field, and the pointer leans the camera a few pixels.
 *
 * It is a different object from the hold scene on purpose: the scene is a ring of orbits seen from above, this is
 * straight rulings in deep perspective with their own camera. They never overlap: the relief has its own band, the
 * clean ground at the foot of the hero, below the copy and below the figure, so nothing is drawn behind any text and
 * nothing needs to be faded out around the figure. It is out of sight when the page loads, so it rises once, the
 * first time the band scrolls into view.
 *
 * Cost: two draw calls (one writes depth only, for hidden-line removal), about 120k vertices, no textures, 30fps at
 * most, and only while the band is on screen, the tab is visible and motion is allowed. Phones and reduced motion
 * get one still frame. Without WebGL the caller simply has no relief; the page ground stays.
 */

export type PlatePulse = 'pass' | 'block' | 'webhook';

export interface Plate {
  /** Order counts per lane, in the order of LANES (proposed, held, settled, gate, released). */
  setLanes(counts: readonly number[]): void;
  setPaused(paused: boolean): void;
  setReduced(reduced: boolean): void;
  refreshTheme(): void;
  pulse(kind: PlatePulse): void;
  dispose(): void;
}

interface Opts {
  host: HTMLElement; // the hero: the pointer leans the camera a few pixels while it is over the hero
  reduced: boolean;
}

const LANE_COUNT = 5;
const ROWS = 150;
const COLS = 400;
const Z0 = 3.0; // nearest row
const DZ = 0.25; // row spacing
const HALF_W = 40; // half width of the field, world units
const LANE_GAP = 2.4;
const SPEED = 0.3; // rows per second toward the viewer, in world units
const PIXEL_BUDGET = 2.4e6;

const VERT = `#version 300 es
precision highp float;
in vec3 a_v;              // x in -1..1 across the field, row index, 1 for the foot of the curtain
uniform vec2 u_size;      // CSS px
uniform vec2 u_vp;        // where the horizon axis lands on screen, CSS px
uniform float u_f;        // focal length, CSS px
uniform float u_cam;      // camera height
uniform float u_pitch;
uniform float u_time;
uniform float u_rev;      // 0..1 the relief rises once
uniform float u_amp[5];   // ridge height per lane
uniform vec3 u_laneCol[5];
uniform vec3 u_ink;
uniform float u_pulse;    // seconds since the last pulse, large when none
uniform vec3 u_pulseCol;
uniform float u_bias;
uniform float u_alpha;
out vec4 v_col;

const float Z0 = ${Z0.toFixed(2)};
const float DZ = ${DZ.toFixed(2)};
const float HALF_W = ${HALF_W.toFixed(1)};
const float GAP = ${LANE_GAP.toFixed(2)};
const float ROWS_F = ${ROWS.toFixed(1)};
const float HALF_RIDGE = 0.95;

void main() {
  float x = a_v.x * HALF_W;
  float travel = u_time * ${SPEED.toFixed(2)};
  float z = Z0 + a_v.y * DZ - mod(travel, DZ);

  // the relief is the data and nothing else: the field is dead flat, and each lane is one flat-topped ridge whose
  // height is its order count. A ridge is a plateau (flat on top) with steep, short shoulders, the same all along
  // its length, so the only thing that ever changes the shape is an order changing lane.
  float h = 0.0;
  vec3 col = u_ink;
  float tint = 0.0;
  for (int i = 0; i < 5; i++) {
    float xi = (float(i) - 2.0) * GAP;
    float dx = abs(x - xi) / HALF_RIDGE;
    float g = 1.0 - smoothstep(0.78, 1.0, dx);
    h += u_amp[i] * g;
    col = mix(col, u_laneCol[i], g * 0.95);
    tint = max(tint, g);
  }

  // one band of light down the field when the gate decides
  float zp = Z0 + u_pulse * 14.0;
  float life = 1.0 - smoothstep(1.6, 3.0, u_pulse);
  float band = exp(-pow((z - zp) / 1.1, 2.0)) * life;
  h += 0.12 * band;
  col = mix(col, u_pulseCol, clamp(band * 1.2, 0.0, 1.0));

  float rise = 1.0 - pow(1.0 - clamp(u_rev * 1.25, 0.0, 1.0), 3.0);
  h *= rise;
  float y = a_v.z > 0.5 ? -8.0 : h;

  // camera: height u_cam above the field, pitched down
  float sp = sin(u_pitch), cp = cos(u_pitch);
  vec3 d = vec3(x, y - u_cam, z);
  float vz = -d.y * sp + d.z * cp;
  float vy = d.y * cp + d.z * sp;
  float sx = u_vp.x + u_f * d.x / vz;
  float sy = u_vp.y - u_f * vy / vz;
  vec2 ndc = vec2(sx / u_size.x * 2.0 - 1.0, 1.0 - sy / u_size.y * 2.0);
  const float N = 0.5, F = 140.0;
  float zn = (F + N) / (F - N) - 2.0 * F * N / ((F - N) * vz) - u_bias;
  gl_Position = vec4(ndc * vz, zn * vz, vz);

  float kn = a_v.y / ROWS_F;
  float far = exp(-(z - Z0) * 0.11);
  float near = smoothstep(Z0 - 0.4, Z0 + 0.5, z);
  // the field runs off both sides of the screen; it thins out over the last tenth so it never ends in a hard cut
  float ux = sx / u_size.x;
  float edge = smoothstep(0.0, 0.1, ux) * (1.0 - smoothstep(0.9, 1.0, ux));
  float shown = smoothstep(0.0, 1.0, u_rev * 1.7 - kn * 0.7);
  float a = u_alpha * far * near * edge * shown * (1.0 + 0.7 * tint) + band * 0.5 * edge;
  v_col = vec4(col, clamp(a, 0.0, 1.0));
}`;

const FRAG = `#version 300 es
precision highp float;
in vec4 v_col;
out vec4 fragColor;

void main() {
  fragColor = vec4(v_col.rgb * v_col.a, v_col.a);
}`;

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  const n = Number.parseInt(v, 16);
  return Number.isFinite(n) ? [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] : [0.5, 0.5, 0.5];
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('plate shader:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

/** A ridge's height for a lane holding n orders: always visible, so an empty lane is a low swell, not a gap. */
const ridge = (n: number) => 0.22 + 0.34 * Math.sqrt(Math.max(0, Math.min(n, 12)));

export function createPlate(canvas: HTMLCanvasElement, opts: Opts): Plate | null {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, depth: true, stencil: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('plate program:', gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  // vertices: for each row and column a point on the line and a point at the foot of its curtain
  const verts = new Float32Array(ROWS * COLS * 2 * 3);
  let o = 0;
  for (let k = 0; k < ROWS; k++) {
    for (let j = 0; j < COLS; j++) {
      const x = (j / (COLS - 1)) * 2 - 1;
      verts[o++] = x; verts[o++] = k; verts[o++] = 0;
      verts[o++] = x; verts[o++] = k; verts[o++] = 1;
    }
  }
  const top = (k: number, j: number) => (k * COLS + j) * 2;
  const lineIdx = new Uint32Array(ROWS * (COLS - 1) * 2);
  const triIdx = new Uint32Array(ROWS * (COLS - 1) * 6);
  let li = 0;
  let ti = 0;
  for (let k = 0; k < ROWS; k++) {
    for (let j = 0; j < COLS - 1; j++) {
      const a = top(k, j), b = top(k, j + 1);
      lineIdx[li++] = a; lineIdx[li++] = b;
      triIdx[ti++] = a; triIdx[ti++] = a + 1; triIdx[ti++] = b;
      triIdx[ti++] = b; triIdx[ti++] = a + 1; triIdx[ti++] = b + 1;
    }
  }
  const vbuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a_v');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
  const lbuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lbuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lineIdx, gl.STATIC_DRAW);
  const tbuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tbuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, triIdx, gl.STATIC_DRAW);

  const U: Record<string, WebGLUniformLocation | null> = {};
  for (const name of ['size', 'vp', 'f', 'cam', 'pitch', 'time', 'rev', 'amp', 'laneCol', 'ink', 'pulse', 'pulseCol', 'bias', 'alpha']) {
    U[name] = gl.getUniformLocation(prog, `u_${name}`);
  }

  const phoneQ = window.matchMedia('(max-width: 719px), (pointer: coarse)');
  const fineQ = window.matchMedia('(pointer: fine)');
  let reduced = opts.reduced;
  let paused = false;
  let visible = true;
  let lost = false;
  let raf = 0;
  let last = performance.now();
  let lastDraw = 0;
  let pulseAt = -1e9;
  // time-driven state; GSAP tweens these and each update asks for a frame. px, py: pointer lean, -1..1.
  const s = { time: 0, rev: reduced || phoneQ.matches ? 1 : 0, px: 0, py: 0 };
  const amp = new Float32Array(LANE_COUNT).fill(ridge(0));
  const ampTween: number[] = new Array<number>(LANE_COUNT).fill(ridge(0));
  const geo = { w: 1, h: 1, dpr: 1 };
  let pal = { ink: [0, 0, 0], lanes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], green: [0, 0, 0], garnet: [0, 0, 0], teal: [0, 0, 0], dark: 0 };
  let pulseCol = [0, 0, 0];

  const still = () => reduced || phoneQ.matches;
  const animating = () => !still() && !paused && visible && !document.hidden && !lost;

  function readTheme(): void {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => hexRgb(cs.getPropertyValue(`--sc-${n}`) || '#888888');
    const paper = v('paper');
    const dark = 0.2126 * paper[0] + 0.7152 * paper[1] + 0.0722 * paper[2] < 0.4 ? 1 : 0;
    // the same lane colours as the legend: awaiting teal, held brass, captured green, blocked garnet, released slate
    pal = { ink: v('ink'), lanes: [...v('teal'), ...v('brass'), ...v('green'), ...v('garnet'), ...v('slate')], green: v('green'), garnet: v('garnet'), teal: v('teal'), dark };
  }

  function measure(): void {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    geo.w = w;
    geo.h = h;
    geo.dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(PIXEL_BUDGET / (w * h)));
    const W = Math.round(w * geo.dpr);
    const Hh = Math.round(h * geo.dpr);
    if (canvas.width !== W || canvas.height !== Hh) {
      canvas.width = W;
      canvas.height = Hh;
    }
  }

  function draw(now: number): void {
    if (lost) return;
    const age = (now - pulseAt) / 1000;
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clearDepth(1);
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
    gl!.uniform2f(U.size!, geo.w, geo.h);
    // The camera is aimed so the nearest row stands 24px above the foot of the band and the five lane ridges stand
    // in it, about 170px apart on desktop; 0.76 is where the nearest row lands for this pitch and height. The
    // pointer leans the camera a few pixels.
    const f = Math.min(446, Math.max(190, geo.w * 0.31)); // the floor keeps the five ridges readable on a phone
    gl!.uniform2f(U.vp!, geo.w / 2 + s.px * 36, geo.h - 24 - 0.76 * f + s.py * 14);
    gl!.uniform1f(U.f!, f);
    gl!.uniform1f(U.cam!, 4.2);
    gl!.uniform1f(U.pitch!, 0.3);
    gl!.uniform1f(U.time!, s.time);
    gl!.uniform1f(U.rev!, s.rev);
    gl!.uniform1fv(U.amp!, amp);
    gl!.uniform3fv(U.laneCol!, pal.lanes);
    gl!.uniform3fv(U.ink!, pal.ink);
    gl!.uniform1f(U.alpha!, pal.dark ? 0.5 : 0.55);
    gl!.uniform1f(U.pulse!, still() ? 99 : age);
    gl!.uniform3fv(U.pulseCol!, pulseCol);

    // pass 1: the curtains under every row write depth only, so a row hides the rows behind its ridge
    gl!.enable(gl!.DEPTH_TEST);
    gl!.depthFunc(gl!.LEQUAL);
    gl!.colorMask(false, false, false, false);
    gl!.depthMask(true);
    gl!.uniform1f(U.bias!, 0);
    gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, tbuf);
    gl!.drawElements(gl!.TRIANGLES, triIdx.length, gl!.UNSIGNED_INT, 0);
    // pass 2: the ruled lines, a hair in front of their own curtain
    gl!.colorMask(true, true, true, true);
    gl!.depthMask(false);
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA);
    gl!.uniform1f(U.bias!, 0.0006);
    gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, lbuf);
    gl!.drawElements(gl!.LINES, lineIdx.length, gl!.UNSIGNED_INT, 0);
    gl!.disable(gl!.BLEND);
    lastDraw = now;
  }

  // one frame when something changed; a 30fps loop while the relief is alive
  let queued = false;
  function request(): void {
    if (queued || lost) return;
    queued = true;
    requestAnimationFrame((now) => {
      queued = false;
      draw(now);
    });
  }
  function tick(now: number): void {
    raf = 0;
    if (!animating()) return;
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); // a first frame can carry a timestamp older than `last`
    last = now;
    s.time += dt;
    if (now - lastDraw >= 33) draw(now);
    raf = requestAnimationFrame(tick);
  }
  function sync(): void {
    if (animating()) {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    } else {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      request();
    }
  }

  readTheme();
  measure();

  const ro = new ResizeObserver(() => {
    measure();
    request();
  });
  ro.observe(canvas);
  // The band is below the fold on load, so the relief rises the first time it is actually in view, not before.
  let reveal: gsap.core.Tween | null = null;
  let revealed = s.rev >= 1;
  const io = new IntersectionObserver(
    (entries) => {
      // a batch can hold [out of view, in view] when the page is already scrolled here at load: the newest entry wins
      visible = !!entries[entries.length - 1]?.isIntersecting;
      if (visible && !revealed) {
        revealed = true;
        reveal = gsap.to(s, { rev: 1, duration: 2.6, delay: 0.1, ease: 'power2.out', onUpdate: request });
      }
      sync();
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  io.observe(canvas);
  const onVis = () => sync();
  document.addEventListener('visibilitychange', onVis);
  const onPhone = () => {
    if (still()) {
      revealed = true;
      s.rev = 1;
    }
    sync();
  };
  phoneQ.addEventListener('change', onPhone);

  // the camera leans toward the pointer, eased like the scene's parallax
  const pxTo = gsap.quickTo(s, 'px', { duration: 1.1, ease: 'power3', onUpdate: request });
  const pyTo = gsap.quickTo(s, 'py', { duration: 1.1, ease: 'power3', onUpdate: request });
  const onMove = (e: PointerEvent) => {
    if (!fineQ.matches || still() || paused) return;
    const r = opts.host.getBoundingClientRect();
    pxTo(((e.clientX - r.left) / r.width - 0.5) * 2);
    pyTo(((e.clientY - r.top) / r.height - 0.5) * 2);
  };
  const onLeave = () => {
    pxTo(0);
    pyTo(0);
  };
  opts.host.addEventListener('pointermove', onMove);
  opts.host.addEventListener('pointerleave', onLeave);
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    sync();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  sync();

  let laneTween: gsap.core.Tween | null = null;
  return {
    setLanes(counts) {
      const to = Array.from({ length: LANE_COUNT }, (_, i) => ridge(counts[i] ?? 0));
      laneTween?.kill();
      if (still()) {
        amp.set(to);
        to.forEach((v, i) => { ampTween[i] = v; });
        request();
        return;
      }
      // ridges grow or settle over a second, so a new order is something you see arrive
      laneTween = gsap.to(ampTween, {
        ...Object.fromEntries(to.map((v, i) => [i, v])),
        duration: 1.1,
        ease: 'power3.out',
        onUpdate: () => {
          amp.set(ampTween);
          request();
        },
      });
    },
    setPaused(p) {
      paused = p;
      sync();
    },
    setReduced(r) {
      reduced = r;
      if (r) {
        reveal?.progress(1);
        revealed = true;
        s.rev = 1;
      }
      sync();
    },
    refreshTheme() {
      readTheme();
      request();
    },
    pulse(kind) {
      if (still() || paused) return;
      pulseCol = kind === 'pass' ? pal.green : kind === 'block' ? pal.garnet : pal.teal;
      pulseAt = performance.now();
      request();
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      lost = true;
      reveal?.kill();
      laneTween?.kill();
      gsap.killTweensOf(s);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      phoneQ.removeEventListener('change', onPhone);
      opts.host.removeEventListener('pointermove', onMove);
      opts.host.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.deleteBuffer(vbuf);
      gl.deleteBuffer(lbuf);
      gl.deleteBuffer(tbuf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}
