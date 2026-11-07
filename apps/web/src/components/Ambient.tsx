import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRef } from 'react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * The room behind the page: a faint ledger ruling, two soft lights and paper grain, fixed to the viewport.
 * Nothing here loops by itself. The lights travel with the scroll position and one follows the pointer, so
 * the background only moves when the visitor does, and reduced motion gets the still version.
 */
export function Ambient() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // Negative priority: measure after the Lifecycle pin has added its spacer, or the range is too short.
        const scroll = { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 1, invalidateOnRefresh: true, refreshPriority: -1 } as const;
        const refresh = () => ScrollTrigger.refresh();
        window.addEventListener('load', refresh, { once: true });
        gsap.fromTo('.amb-a', { x: '4vw', y: '8vh' }, { x: '62vw', y: '52vh', ease: 'none', scrollTrigger: scroll });
        gsap.fromTo('.amb-b', { x: '64vw', y: '58vh' }, { x: '8vw', y: '14vh', ease: 'none', scrollTrigger: scroll });
        gsap.fromTo('.amb-grid', { y: 0 }, { y: -160, ease: 'none', scrollTrigger: scroll });

        // The spot is only for a fine pointer; a touch screen has nothing to follow.
        if (!window.matchMedia('(pointer: fine)').matches) return;
        const spot = root.current?.querySelector<HTMLElement>('.amb-spot');
        if (!spot) return;
        gsap.set(spot, { xPercent: -50, yPercent: -50, x: window.innerWidth / 2, y: window.innerHeight / 3 });
        const qx = gsap.quickTo(spot, 'x', { duration: 0.9, ease: 'power3.out' });
        const qy = gsap.quickTo(spot, 'y', { duration: 0.9, ease: 'power3.out' });
        const move = (e: PointerEvent) => { qx(e.clientX); qy(e.clientY); };
        window.addEventListener('pointermove', move, { passive: true });
        return () => window.removeEventListener('pointermove', move);
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className="ambient" aria-hidden="true">
      <div className="amb-grid" />
      <div className="amb-glow amb-a" />
      <div className="amb-glow amb-b" />
      <div className="amb-spot" />
      <div className="amb-grain" />
    </div>
  );
}
