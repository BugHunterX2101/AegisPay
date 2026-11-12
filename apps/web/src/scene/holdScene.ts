import gsap from 'gsap';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { dur, ease } from '../motion.ts';
import { LANE_OF } from './lanes.ts';
import type { HoldScene, Lane, SceneOrder } from './lanes.ts';

/**
 * The hero's one 3D scene: every live order is a token on a ring, and the ring it sits on is its money state.
 * The core seal grows with the funds on hold, the gate ring flashes on each gatekeeper verdict and the shell flashes
 * on each verified PayPal webhook. All driven by the live store, nothing scripted.
 *
 * Frames are drawn only while the canvas is on screen, the tab is visible, motion is allowed and the viewer has not
 * paused it; otherwise a change is applied at once and drawn a single time.
 */

const RADIUS: Record<Lane, number> = { held: 1.12, gate: 2.35, settled: 3.2, proposed: 4.05, released: 4.85 };
const TILT = 0.62;
const MAX_TOKENS = 60;

type Tone = 'ink' | 'paper' | 'accent' | 'brass' | 'teal' | 'green' | 'garnet' | 'slate';
const TONES: Tone[] = ['ink', 'paper', 'accent', 'brass', 'teal', 'green', 'garnet', 'slate'];

function readPalette(): { c: Record<Tone, THREE.Color>; env: number } {
  const cs = getComputedStyle(document.documentElement);
  const c = {} as Record<Tone, THREE.Color>;
  for (const t of TONES) c[t] = new THREE.Color(cs.getPropertyValue(`--sc-${t}`).trim() || '#888888');
  const env = Number.parseFloat(cs.getPropertyValue('--sc-env')) || 0.5;
  return { c, env };
}

/** FNV-1a: a stable angle, height and phase per order id, so a token never jumps on reload. */
function hash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface Token {
  id: string;
  lane: Lane;
  mesh: THREE.Mesh;
  p: { a: number; r: number; y: number; s: number };
  phase: number;
  tw?: gsap.core.Animation;
}

export function createHoldScene(canvas: HTMLCanvasElement, opts: { reduced: boolean }): HoldScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null; // no WebGL: the hero shows its still fallback
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTex = pmrem.fromScene(room, 0.04).texture;
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(4, 6, 8);
  scene.add(sun);

  let { c: col, env } = readPalette();
  scene.environmentIntensity = env;

  // tilt (pointer parallax) > spin (slow turn) > rings and tokens
  const tilt = new THREE.Group();
  tilt.rotation.x = TILT;
  scene.add(tilt);
  const spin = new THREE.Group();
  tilt.add(spin);

  // ---- the core seal: scales with funds on hold
  const core = new THREE.Group();
  const discMat = new THREE.MeshStandardMaterial({ color: col.accent, metalness: 0.25, roughness: 0.45 });
  const rimMat = new THREE.MeshStandardMaterial({ color: col.brass, metalness: 0.9, roughness: 0.25 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 64), discMat);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.035, 12, 96), rimMat);
  rim.rotation.x = Math.PI / 2;
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.02, 10, 64), rimMat);
  inner.rotation.x = Math.PI / 2;
  inner.position.y = 0.07;
  core.add(disc, rim, inner);
  spin.add(core);

  // ---- the vault shell around the held lane
  const shellMat = new THREE.LineBasicMaterial({ color: col.ink, transparent: true, opacity: 0.22 });
  const shell2Mat = new THREE.LineBasicMaterial({ color: col.ink, transparent: true, opacity: 0.1 });
  const shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.68, 1)), shellMat);
  const shell2 = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.94, 0)), shell2Mat);
  tilt.add(shell, shell2); // outside spin: the shell turns against the rings

  // ---- the gate ring with 48 ticks
  const gateMat = new THREE.MeshBasicMaterial({ color: col.ink, transparent: true, opacity: 0.55 });
  const gateRing = new THREE.Mesh(new THREE.TorusGeometry(RADIUS.gate, 0.012, 6, 160), gateMat);
  gateRing.rotation.x = Math.PI / 2;
  const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.14, 0.018), gateMat, 48);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    m4.makeTranslation(Math.cos(a) * RADIUS.gate, 0, Math.sin(a) * RADIUS.gate);
    ticks.setMatrixAt(i, m4);
  }
  const gate = new THREE.Group();
  gate.add(gateRing, ticks);
  spin.add(gate);

  // ---- the ledger ring (captured), the dashed proposal track and the faint released orbit.
  // Each ring takes its lane's legend colour (styles.css .swatch-*), so the figure and its key read as one thing.
  const ledgerMat = new THREE.MeshStandardMaterial({ color: col.green, metalness: 0.4, roughness: 0.35 });
  const ledger = new THREE.Mesh(new THREE.TorusGeometry(RADIUS.settled, 0.018, 8, 200), ledgerMat);
  ledger.rotation.x = Math.PI / 2;
  spin.add(ledger);
  const circle = (r: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  };
  const trackMat = new THREE.LineDashedMaterial({ color: col.teal, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.7 });
  const track = new THREE.Line(circle(RADIUS.proposed), trackMat);
  track.computeLineDistances();
  spin.add(track);
  const releasedMat = new THREE.LineDashedMaterial({ color: col.slate, dashSize: 0.04, gapSize: 0.14, transparent: true, opacity: 0.45 });
  const releasedTrack = new THREE.Line(circle(RADIUS.released), releasedMat);
  releasedTrack.computeLineDistances();
  spin.add(releasedTrack);

  // ---- token shapes and materials, shared by every token in a lane
  const geo: Record<Lane, THREE.BufferGeometry> = {
    proposed: new THREE.TorusGeometry(0.11, 0.022, 8, 32),
    held: new THREE.CylinderGeometry(0.14, 0.14, 0.045, 32),
    settled: new THREE.TorusGeometry(0.1, 0.045, 10, 32),
    gate: new THREE.OctahedronGeometry(0.14),
    released: new THREE.SphereGeometry(0.06, 16, 12),
  };
  const mat: Record<Lane, THREE.MeshStandardMaterial> = {
    proposed: new THREE.MeshStandardMaterial({ color: col.teal, metalness: 0.2, roughness: 0.55 }),
    held: new THREE.MeshStandardMaterial({ color: col.brass, metalness: 0.85, roughness: 0.28 }),
    settled: new THREE.MeshStandardMaterial({ color: col.green, metalness: 0.3, roughness: 0.4, emissive: col.green, emissiveIntensity: 0.15 }),
    gate: new THREE.MeshStandardMaterial({ color: col.garnet, metalness: 0.3, roughness: 0.35, emissive: col.garnet, emissiveIntensity: 0.2 }),
    released: new THREE.MeshStandardMaterial({ color: col.slate, transparent: true, opacity: 0.6, depthWrite: false }),
  };

  const tokens = new Map<string, Token>();
  let reduced = opts.reduced;
  let paused = false;
  let visible = false;
  let raf = 0;
  let elapsed = 0;
  // THREE.Clock is deprecated in r18x; a plain timestamp delta does the same job.
  let last = performance.now();
  const clock = {
    getDelta(): number {
      const now = performance.now();
      const d = (now - last) / 1000;
      last = now;
      return d;
    },
  };
  let coreTween: gsap.core.Tween | undefined;
  const pulses: gsap.core.Animation[] = [];

  const animating = () => raf !== 0;

  /**
   * Frame pacing. At rest the only motion is a 0.05 rad/s turn and a small bob, which looks the same at 30 fps as at
   * the display's 120 or 144 Hz; drawing every vsync was pure GPU and main-thread cost (measured: the scene ran at
   * 120 fps idle). Full rate comes back the moment anything transitions: a token moving lane, the seal resizing, a
   * verdict pulse or pointer parallax. The ledger relief behind the hero (plate.ts) is capped at 30 fps the same way.
   */
  const IDLE_FRAME_MS = 1000 / 30;
  let lastDraw = 0;
  function transitioning(): boolean {
    if (coreTween?.isActive() || gsap.isTweening(tilt.rotation)) return true;
    for (let i = pulses.length - 1; i >= 0; i--) {
      if (pulses[i]!.isActive()) return true;
      pulses.splice(i, 1); // finished: drop it so the list does not grow for the life of the page
    }
    for (const t of tokens.values()) if (t.tw?.isActive()) return true;
    return false;
  }

  function place(t: Token): void {
    const bob = animating() ? Math.sin(elapsed * 1.3 + t.phase) * 0.03 : 0;
    t.mesh.position.set(Math.cos(t.p.a) * t.p.r, t.p.y + bob, Math.sin(t.p.a) * t.p.r);
    t.mesh.scale.setScalar(Math.max(t.p.s, 0.001));
  }

  function render(): void {
    for (const t of tokens.values()) place(t);
    renderer.render(scene, camera);
  }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    // 1 ms slack so a 33.3 ms vsync pair on a 60 Hz display is not skipped by rounding.
    if (now - lastDraw < IDLE_FRAME_MS - 1 && !transitioning()) return;
    lastDraw = now;
    // dt keeps the 0.05 s cap: a skipped frame at 30 fps is ~0.033 s, so motion speed is the same at any frame rate.
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    spin.rotation.y += dt * 0.05;
    shell.rotation.y -= dt * 0.03;
    shell2.rotation.y += dt * 0.02;
    for (const t of tokens.values()) t.mesh.rotation.y += dt * 0.8;
    render();
  }

  /** Finish every running tween at once: used when frames stop, so the still frame shows the end state. */
  function settleAll(): void {
    for (const t of tokens.values()) t.tw?.progress(1);
    coreTween?.progress(1);
    for (const p of pulses.splice(0)) p.progress(1);
  }

  function sync(): void {
    const want = visible && !paused && !reduced && !document.hidden;
    if (want && !raf) {
      clock.getDelta();
      raf = requestAnimationFrame(frame);
    } else if (!want && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      settleAll();
      render();
    }
  }

  function setShape(t: Token, lane: Lane): void {
    t.lane = lane;
    t.mesh.geometry = geo[lane];
    t.mesh.material = mat[lane];
    t.mesh.rotation.set(lane === 'held' ? Math.PI / 2 : 0, 0, 0);
  }

  function spawn(o: SceneOrder, lane: Lane): void {
    const h = hash(o.id);
    const mesh = new THREE.Mesh(geo[lane], mat[lane]);
    const t: Token = {
      id: o.id,
      lane,
      mesh,
      p: { a: ((h % 3600) / 3600) * Math.PI * 2, r: RADIUS[lane], y: (((h >>> 12) % 100) / 100 - 0.5) * 0.24, s: 1 },
      phase: ((h >>> 20) % 628) / 100,
    };
    setShape(t, lane);
    tokens.set(o.id, t);
    spin.add(mesh);
    if (animating()) {
      t.p.r = RADIUS[lane] + 0.8;
      t.p.s = 0;
      t.tw = gsap.to(t.p, { r: RADIUS[lane], s: 1, duration: dur.enter, ease: ease.out });
    }
  }

  function move(t: Token, lane: Lane): void {
    t.tw?.kill();
    if (!animating()) {
      setShape(t, lane);
      t.p.r = RADIUS[lane];
      t.p.s = 1;
      return;
    }
    // shrink, swap the shape while it is smallest, then travel to the new ring and grow back
    t.tw = gsap
      .timeline()
      .to(t.p, { s: 0, duration: dur.base, ease: ease.io })
      .add(() => setShape(t, lane))
      .to(t.p, { r: RADIUS[lane], duration: dur.travel, ease: ease.io })
      .to(t.p, { s: 1, duration: dur.slow, ease: ease.out }, `-=${dur.slow}`);
  }

  function drop(t: Token): void {
    t.tw?.kill();
    tokens.delete(t.id);
    if (!animating()) {
      spin.remove(t.mesh);
      return;
    }
    gsap.to(t.p, { s: 0, duration: dur.slow, ease: ease.io, onUpdate: () => place(t), onComplete: () => spin.remove(t.mesh) });
  }

  function resize(): void {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, 0.3, Math.max(11.5, 13.6 / camera.aspect));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    if (!animating()) render();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // pointer parallax: fine pointers only, never under reduced motion
  const host = canvas.parentElement ?? canvas;
  const fine = window.matchMedia('(pointer: fine)').matches;
  const tiltX = gsap.quickTo(tilt.rotation, 'x', { duration: 0.9, ease: 'power3' });
  const tiltZ = gsap.quickTo(tilt.rotation, 'z', { duration: 0.9, ease: 'power3' });
  const onMove = (e: PointerEvent) => {
    if (!fine || reduced || !animating()) return;
    const r = host.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5;
    const dy = (e.clientY - r.top) / r.height - 0.5;
    tiltX(TILT + dy * 0.12);
    tiltZ(-dx * 0.08);
  };
  const onLeave = () => {
    tiltX(TILT);
    tiltZ(0);
  };
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerleave', onLeave);
  document.addEventListener('visibilitychange', sync);

  function flash(c: THREE.Color, to: THREE.Color, back: THREE.Color): void {
    const tl = gsap
      .timeline()
      .to(c, { r: to.r, g: to.g, b: to.b, duration: dur.fast, ease: ease.out })
      .to(c, { r: back.r, g: back.g, b: back.b, duration: dur.slow, ease: ease.io });
    pulses.push(tl);
  }

  render();

  return {
    setOrders(orders) {
      const list = orders.slice(0, MAX_TOKENS);
      const seen = new Set<string>();
      let heldMinor = 0;
      for (const o of list) {
        seen.add(o.id);
        const lane = LANE_OF[o.state];
        if (lane === 'held') heldMinor += Number(o.amountMinor) || 0;
        const t = tokens.get(o.id);
        if (!t) spawn(o, lane);
        else if (t.lane !== lane) move(t, lane);
      }
      for (const t of [...tokens.values()]) if (!seen.has(t.id)) drop(t);
      // the seal grows with what is on hold, on a log scale so one large order cannot swamp the scene
      const target = 1 + Math.min(0.4, Math.log10(1 + heldMinor / 100) * 0.12);
      coreTween?.kill();
      if (animating()) coreTween = gsap.to(core.scale, { x: target, y: target, z: target, duration: dur.travel, ease: ease.out });
      else core.scale.setScalar(target);
      if (!animating()) render();
    },
    pulse(kind) {
      if (!animating()) return; // a still frame has nothing to flash
      if (kind === 'webhook') {
        const tl = gsap
          .timeline()
          .to(shellMat, { opacity: 0.7, duration: dur.fast, ease: ease.out })
          .to(shellMat, { opacity: 0.22, duration: dur.slow, ease: ease.io });
        pulses.push(tl);
        return;
      }
      flash(gateMat.color, kind === 'pass' ? col.green : col.garnet, col.ink);
      pulses.push(gsap.fromTo(gate.scale, { x: 1.04, z: 1.04 }, { x: 1, z: 1, duration: dur.slow, ease: ease.out }));
    },
    setPaused(p) {
      paused = p;
      sync();
    },
    setVisible(v) {
      visible = v;
      sync();
    },
    setReduced(r) {
      reduced = r;
      if (r) onLeave();
      sync();
    },
    refreshTheme() {
      ({ c: col, env } = readPalette());
      scene.environmentIntensity = env;
      discMat.color.copy(col.accent);
      rimMat.color.copy(col.brass);
      shellMat.color.copy(col.ink);
      shell2Mat.color.copy(col.ink);
      gateMat.color.copy(col.ink);
      ledgerMat.color.copy(col.green);
      trackMat.color.copy(col.teal);
      releasedMat.color.copy(col.slate);
      mat.proposed.color.copy(col.teal);
      mat.held.color.copy(col.brass);
      mat.settled.color.copy(col.green);
      mat.settled.emissive.copy(col.green);
      mat.gate.color.copy(col.garnet);
      mat.gate.emissive.copy(col.garnet);
      mat.released.color.copy(col.slate);
      if (!animating()) render();
    },
    dispose() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', sync);
      for (const t of tokens.values()) t.tw?.kill();
      coreTween?.kill();
      for (const p of pulses) p.kill();
      gsap.killTweensOf([tilt.rotation, gate.scale, shellMat, gateMat.color]);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments || o instanceof THREE.Line) o.geometry.dispose();
      });
      for (const g of Object.values(geo)) g.dispose();
      for (const m of [...Object.values(mat), discMat, rimMat, shellMat, shell2Mat, gateMat, ledgerMat, trackMat, releasedMat]) m.dispose();
      envTex.dispose();
      pmrem.dispose();
      room.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
