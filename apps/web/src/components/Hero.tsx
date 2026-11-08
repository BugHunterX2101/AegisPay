import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CAPTURED_STATES, HELD_STATES, VOIDED_STATES, sumMinor } from '../format.ts';
import { dur, ease, useReducedMotion } from '../motion.ts';
import { LANES, LANE_LABEL, laneCounts, sceneOrders } from '../scene/lanes.ts';
import type { HoldScene } from '../scene/lanes.ts';
import { createPlate } from '../scene/plate.ts';
import type { Plate, PlatePulse } from '../scene/plate.ts';
import { useStore } from '../store.ts';
import { onThemeChange } from '../theme.ts';

type StoreState = ReturnType<typeof useStore.getState>;

/** The newest feed item as a pulse. Only the newest: a replay after reconnect must not flash the whole history. */
function feedPulse(st: StoreState, prev: StoreState): PlatePulse | null {
  const f = st.feed[0];
  if (st.feed === prev.feed || !f || f.key === prev.feed[0]?.key) return null;
  if (f.kind === 'webhook.verified') return 'webhook';
  if (f.kind === 'gate.decision') return f.data.pass === true || f.data.gatePass === true ? 'pass' : 'block';
  return null;
}

gsap.registerPlugin(useGSAP);

/** Still picture for a browser without WebGL: the same five lanes as the 3D scene, as rings. */
function RingsFallback() {
  const rings: Array<[string, number]> = [
    ['var(--sc-slate)', 46], ['var(--sc-garnet)', 38], ['var(--sc-green)', 30], ['var(--sc-brass)', 22], ['var(--sc-teal)', 14],
  ];
  return (
    <svg className="hero-fallback" viewBox="0 0 100 100" aria-hidden="true">
      {rings.map(([c, r]) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke={c} strokeWidth="1.2" strokeDasharray={r === 22 ? '0' : '2 3'} />
      ))}
      <circle cx="50" cy="50" r="5" fill="var(--sc-accent)" />
    </svg>
  );
}

/** Opens the live hold scene once it is near the viewport; the three.js bundle never blocks first paint. */
function useHoldScene(canvas: React.RefObject<HTMLCanvasElement | null>, paused: boolean, reduced: boolean) {
  const scene = useRef<HoldScene | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let cancelled = false;
    let unsub: Array<() => void> = [];

    const io = new IntersectionObserver((entries) => scene.current?.setVisible(!!entries[entries.length - 1]?.isIntersecting), { rootMargin: '120px' });
    io.observe(el);

    import('../scene/holdScene.ts')
      .then(({ createHoldScene }) => {
        if (cancelled) return;
        const s = createHoldScene(el, { reduced });
        if (!s) return setFailed(true);
        scene.current = s;
        s.setOrders(sceneOrders(useStore.getState().orders));
        unsub = [
          onThemeChange(() => s.refreshTheme()),
          useStore.subscribe((st, prev) => {
            if (st.orders !== prev.orders) s.setOrders(sceneOrders(st.orders));
            const kind = feedPulse(st, prev);
            if (kind) s.pulse(kind);
          }),
        ];
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      io.disconnect();
      unsub.forEach((u) => u());
      scene.current?.dispose();
      scene.current = null;
    };
    // The scene is built once; paused and reduced are pushed in by the effects below.
  }, [canvas]);

  useEffect(() => scene.current?.setPaused(paused), [paused]);
  useEffect(() => scene.current?.setReduced(reduced), [reduced]);
  return failed;
}

/** The ledger relief at the foot of the hero (scene/plate.ts): one ridge per lane, risen with the live order counts. It has its own band of clean ground, so it needs nothing else to lay out. */
function usePlate(
  canvas: React.RefObject<HTMLCanvasElement | null>,
  host: React.RefObject<HTMLElement | null>,
  paused: boolean,
  reduced: boolean,
) {
  const plate = useRef<Plate | null>(null);
  useEffect(() => {
    const c = canvas.current, h = host.current;
    if (!c || !h) return;
    const p = createPlate(c, { host: h, reduced });
    if (!p) return; // no WebGL: the page ground carries on alone
    plate.current = p;
    const lanesOf = (orders: StoreState['orders']) => {
      const c = laneCounts(orders);
      return LANES.map((l) => c[l]);
    };
    p.setLanes(lanesOf(useStore.getState().orders));
    const unsub = [
      onThemeChange(() => p.refreshTheme()),
      useStore.subscribe((st, prev) => {
        if (st.orders !== prev.orders) p.setLanes(lanesOf(st.orders));
        const kind = feedPulse(st, prev);
        if (kind) p.pulse(kind);
      }),
    ];
    return () => {
      unsub.forEach((u) => u());
      p.dispose();
      plate.current = null;
    };
    // Built once, like the scene; paused and reduced are pushed in below.
  }, [canvas, host]);
  useEffect(() => plate.current?.setPaused(paused), [paused]);
  useEffect(() => plate.current?.setReduced(reduced), [reduced]);
}

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const plateCanvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const failed = useHoldScene(canvas, paused || reduced, reduced);
  usePlate(plateCanvas, root, paused, reduced);

  const orders = useStore((s) => s.orders);
  const rows = useMemo(() => Object.values(orders), [orders]);
  const lanes = useMemo(() => laneCounts(orders), [orders]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap
          .timeline({ defaults: { ease: ease.out, duration: dur.enter } })
          .from('[data-enter="line"]', { yPercent: 105, stagger: 0.09 })
          .from('[data-enter="fade"]', { autoAlpha: 0, y: 14, stagger: 0.07, duration: dur.slow }, '-=0.7')
          .from('.hero-stage', { autoAlpha: 0, scale: 0.96, duration: dur.travel }, 0.1);
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  const toConsole = () => {
    document.getElementById('console')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    // Focus after the scroll starts so the browser does not jump twice.
    window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-testid="mandate-text"]')?.focus({ preventScroll: true }), reduced ? 0 : 450);
  };

  return (
    <section className="hero" ref={root} aria-labelledby="hero-title">
      <canvas ref={plateCanvas} className="hero-plate" aria-hidden="true" />
      <div className="hero-copy">
        <p className="eyebrow" data-enter="fade">Spend control for AI purchasing agents <span aria-hidden="true">·</span> PayPal sandbox</p>
        <h1 id="hero-title" className="hero-title">
          <span className="line"><span data-enter="line">Give agents the buying.</span></span>
          <span className="line"><em data-enter="line">Keep the wallet.</em></span>
        </h1>
        <p className="lede" data-enter="fade">
          Agents find the offer. A deterministic gatekeeper checks it against your mandate. You approve a PayPal hold, and it
          is captured only after delivery is proven. Miss the deadline and the hold is voided.
        </p>
        <div className="hero-actions" data-enter="fade">
          <button className="primary lg" onClick={toConsole}>Draft a mandate</button>
          <a className="link-arrow" href="#lifecycle">How a hold moves <span aria-hidden="true">→</span></a>
        </div>
        <dl className="figures" data-enter="fade" aria-label="Money in this demo">
          <div><dt>On hold</dt><dd className="fig-brass">{sumMinor(rows, HELD_STATES)}</dd></div>
          <div><dt>Captured</dt><dd className="fig-green">{sumMinor(rows, CAPTURED_STATES)}</dd></div>
          <div><dt>Voided</dt><dd className="fig-slate">{sumMinor(rows, VOIDED_STATES)}</dd></div>
        </dl>
      </div>

      <figure className="hero-stage" aria-label="Live view of every order in this demo, grouped by where its money is">
        <div className="stage-frame">
          {failed ? <RingsFallback /> : <canvas ref={canvas} className="hero-canvas" aria-hidden="true" />}
          {/* One control for everything that moves on its own in the hero: the scene and the plate. */}
          {!reduced && (
            <button className="stage-pause sm" onClick={() => setPaused((p) => !p)}>
              {paused ? 'Play motion' : 'Pause motion'}
            </button>
          )}
        </div>
        <figcaption>
          <ul className="legend">
            {LANES.map((l) => (
              <li key={l}>
                <span className={`swatch swatch-${l}`} aria-hidden="true" />
                {LANE_LABEL[l]} <span className="legend-n">{lanes[l]}</span>
              </li>
            ))}
          </ul>
        </figcaption>
      </figure>
    </section>
  );
}
