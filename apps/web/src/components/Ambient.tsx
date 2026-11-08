import { CAPTURED_STATES, HELD_STATES } from '../format.ts';
import { useStore } from '../store.ts';

const DISPUTED = new Set(['DISPUTED', 'EVIDENCE_SUBMITTED', 'RESOLVED_LOST']);
const OPEN_HOLDS_AT_FULL = 5;

/**
 * The room behind the page: the ledger ruling on its edges and two corner lights, fixed to the viewport.
 * Nothing here moves with the scroll or the pointer. What it does carry is the ledger itself: the lower light takes the
 * colour of the books (brass while money is on hold, green once captured, garnet while a dispute is open) and its
 * strength follows how many holds are open. It settles over a second or so and never animates on its own.
 */
export function Ambient() {
  // Both selectors return primitives, so the page behind the console re-renders only when the tone or the load steps.
  const tone = useStore((s) => {
    const states = Object.values(s.orders).map((o) => o.state);
    if (states.some((st) => DISPUTED.has(st))) return 'dispute';
    if (states.some((st) => (HELD_STATES as readonly string[]).includes(st))) return 'hold';
    if (states.some((st) => (CAPTURED_STATES as readonly string[]).includes(st))) return 'captured';
    return 'idle';
  });
  const open = useStore((s) => Object.values(s.orders).filter((o) => (HELD_STATES as readonly string[]).includes(o.state)).length);
  const load = Math.min(1, open / OPEN_HOLDS_AT_FULL);

  return (
    <div className="ambient" aria-hidden="true" data-tone={tone} style={{ ['--amb-load' as string]: load }}>
      <div className="amb-grid" />
      <div className="amb-glow amb-a" />
      <div className="amb-glow amb-b" />
    </div>
  );
}
