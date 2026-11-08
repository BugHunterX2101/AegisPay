import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRef } from 'react';
import { dur, ease } from '../motion.ts';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const CHAPTERS = [
  {
    verb: 'Propose',
    title: 'You say what to buy. A model drafts the mandate.',
    body: 'Plain words in; keywords, quantity, unit ceiling, budget and deadline out. You edit it and sign it. The model never touches money.',
    mark: 'mandate.signed',
  },
  {
    verb: 'Gate',
    title: 'Every offer meets a gatekeeper that is not a model.',
    body: 'Price, budget, supplier and deadline are checked by fixed rules. The decision is hashed, so it cannot be swapped after you approve.',
    mark: 'gate.decision · sha256',
  },
  {
    verb: 'Hold',
    title: 'You approve in PayPal. The money is held, not moved.',
    body: 'An authorization places a hold on the buyer’s funds, tied to the signed mandate by its hash. The delivery deadline is enforced here, not by PayPal.',
    mark: 'intent: AUTHORIZE',
  },
  {
    verb: 'Prove',
    title: 'Delivery is proven, then the hold is captured.',
    body: 'This is the one step where money moves. If the deadline passes first, a person confirms the breach and the hold is voided instead.',
    mark: 'capture · or void',
  },
  {
    verb: 'Answer',
    title: 'A dispute is answered from the ledger.',
    body: 'The evidence comes from a hash-chained audit log. A named person attests to the bundle hash before anything is sent to PayPal.',
    mark: 'bundle.attested',
  },
] as const;

const num = (i: number) => String(i + 1).padStart(2, '0');

/**
 * The one scroll moment on the page: on a wide screen without reduced motion the section pins and scrubbing steps
 * through the five chapters. Everywhere else it is a plain ordered list, which is also what assistive tech reads.
 */
export function Lifecycle() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
        el.dataset.mode = 'pinned';
        const panels = gsap.utils.toArray<HTMLElement>('.chapter', el);
        const ticks = gsap.utils.toArray<HTMLElement>('.rail-tick', el);
        const last = panels.length - 1;
        const mark = (active: number) => ticks.forEach((t, i) => (t.dataset.state = i < active ? 'done' : i === active ? 'active' : 'todo'));
        mark(0);
        // opacity, not autoAlpha: autoAlpha adds visibility:hidden, which would hide chapters 2 to 5 from screen readers.
        gsap.set(panels.slice(1), { opacity: 0, y: 32 });

        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: el.querySelector('.lc-stage'),
            start: 'top top',
            end: () => `+=${window.innerHeight * last * 0.8}`,
            pin: true,
            scrub: 0.5,
            snap: { snapTo: 1 / last, inertia: false, duration: { min: 0.2, max: dur.slow }, ease: ease.io, delay: 0.05 },
            invalidateOnRefresh: true,
            onUpdate: (self) => mark(Math.round(self.progress * last)),
          },
        });
        tl.to('.rail-fill', { scaleY: 1, duration: last }, 0);
        panels.forEach((p, i) => {
          if (i === 0) return;
          tl.to(panels[i - 1]!, { opacity: 0, y: -32, duration: 0.35 }, i - 0.6).to(p, { opacity: 1, y: 0, duration: 0.35 }, i - 0.4);
        });

        // Fonts change line heights, which moves the pin's start and end.
        document.fonts?.ready.then(() => ScrollTrigger.refresh()).catch(() => undefined);
        return () => {
          delete el.dataset.mode;
          ticks.forEach((t) => delete t.dataset.state);
        };
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section id="lifecycle" className="lifecycle" ref={root} aria-labelledby="lifecycle-title">
      <div className="lc-stage">
        <header className="lc-head">
          <p className="eyebrow">03 · How a hold moves</p>
          <h2 id="lifecycle-title" className="section-title">Five steps, and money moves in only one of them.</h2>
          <div className="rail" aria-hidden="true">
            <span className="rail-line"><span className="rail-fill" /></span>
            <ol>
              {CHAPTERS.map((c, i) => (
                <li key={c.verb} className="rail-tick"><span className="rail-n">{num(i)}</span> {c.verb}</li>
              ))}
            </ol>
          </div>
        </header>
        <ol className="chapters">
          {CHAPTERS.map((c, i) => (
            <li key={c.verb} className="chapter">
              <p className="chapter-n"><span>{num(i)}</span> {c.verb}</p>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
              <code className="chapter-mark">{c.mark}</code>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
