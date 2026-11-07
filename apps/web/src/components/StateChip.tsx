import { STATE_LABEL, STATE_TONE } from '../format.ts';
import type { OrderState } from '../types.ts';

export function StateChip({ state }: { state: OrderState }) {
  return (
    <span className={`chip chip-${STATE_TONE[state]}`} data-testid="state-chip" data-state={state}>
      {STATE_LABEL[state]}
    </span>
  );
}
