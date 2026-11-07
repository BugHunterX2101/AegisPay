import {
  ArrowCounterClockwise, ArrowUUpLeft, CheckCircle, FileText, Gavel, HourglassMedium, LockSimple, Package, ProhibitInset,
  ShieldCheck, Trophy, Truck, WarningOctagon, XCircle,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { STATE_LABEL, STATE_TONE } from '../format.ts';
import type { OrderState } from '../types.ts';

/** Status never rides on colour alone: each state has its own glyph as well as its label. */
const GLYPH: Record<OrderState, Icon> = {
  GATED: ShieldCheck,
  REJECTED: ProhibitInset,
  AWAITING_APPROVAL: HourglassMedium,
  CANCELLED: XCircle,
  HELD: LockSimple,
  IN_TRANSIT: Truck,
  DELIVERED: Package,
  SETTLED: CheckCircle,
  FAILED: WarningOctagon,
  VOIDED: ArrowUUpLeft,
  DISPUTED: Gavel,
  EVIDENCE_SUBMITTED: FileText,
  RESOLVED_WON: Trophy,
  RESOLVED_LOST: XCircle,
  REFUNDED: ArrowCounterClockwise,
};

export function StateChip({ state }: { state: OrderState }) {
  const G = GLYPH[state];
  return (
    <span className={`chip chip-${STATE_TONE[state]}`} data-testid="state-chip" data-state={state}>
      <G size={13} weight="bold" aria-hidden="true" />
      {STATE_LABEL[state]}
    </span>
  );
}
