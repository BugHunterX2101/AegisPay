import { useEffect, useState } from 'react';

/** The same rhythm as the CSS tokens in tokens.css, for GSAP and the 3D scene. Seconds, not milliseconds. */
export const dur = { fast: 0.15, base: 0.24, exit: 0.14, slow: 0.64, enter: 1.1, travel: 1.6 } as const;
/** GSAP names for the CSS curves: --ease-out and --ease-io. */
export const ease = { out: 'expo.out', settle: 'power3.out', io: 'power2.inOut' } as const;

const query = '(prefers-reduced-motion: reduce)';

export const prefersReducedMotion = (): boolean => window.matchMedia(query).matches;

/** True while the viewer asks the OS for reduced motion. Updates live if they change it. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
