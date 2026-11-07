import { useState } from 'react';
import { api, errorMessage } from '../api.ts';
import { loadAll } from '../useStream.ts';
import { money } from '../format.ts';
import { useStore } from '../store.ts';
import type { OrderRow } from '../types.ts';
import { Modal } from './Modal.tsx';

const CARRIERS = ['FEDEX', 'UPS', 'USPS', 'DHL', 'DHL_API', 'OTHER'] as const;

/** Record a shipment: the carrier and tracking number the supplier gave. The gatekeeper reads these before capture. */
export function ShipDialog({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const toast = useStore((s) => s.toast);
  const [carrier, setCarrier] = useState<(typeof CARRIERS)[number]>('UPS');
  const [trackingNumber, setTracking] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api('POST', `/api/orders/${order.id}/ship`, { carrier, trackingNumber: trackingNumber.trim() });
      toast('ok', 'Shipment recorded');
      await loadAll();
      onClose();
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Record shipment" onClose={onClose}>
      <p className="muted">{order.title} · hold {money(order.amountMinor, order.currency)}</p>
      <label>Carrier
        <select name="carrier" autoComplete="off" value={carrier} onChange={(e) => setCarrier(e.target.value as (typeof CARRIERS)[number])} data-testid="ship-carrier">
          {CARRIERS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label>Tracking number
        <input name="trackingNumber" autoComplete="off" spellCheck={false} value={trackingNumber} onChange={(e) => setTracking(e.target.value)} placeholder="1Z999AA10123456784…" data-testid="ship-tracking" />
      </label>
      <div className="actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy || trackingNumber.trim().length < 3} onClick={submit} data-testid="ship-submit">Record shipment</button>
      </div>
    </Modal>
  );
}

/** Voiding releases the buyer's hold. It is human-confirmed on purpose: the server refuses without `confirm: true`. */
export function VoidDialog({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const toast = useStore((s) => s.toast);
  const [reason, setReason] = useState<'SLA_BREACH' | 'CANCEL'>('SLA_BREACH');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api('POST', `/api/orders/${order.id}/void`, { reason, confirm: true });
      toast('ok', 'Void requested: the hold is being released');
      await loadAll();
      onClose();
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Void this hold?" onClose={onClose}>
      <p>
        This releases the {money(order.amountMinor, order.currency)} hold on the buyer&apos;s PayPal account. Nothing is
        charged. It cannot be undone.
      </p>
      <label>Reason
        <select value={reason} onChange={(e) => setReason(e.target.value as 'SLA_BREACH' | 'CANCEL')} data-testid="void-reason">
          <option value="SLA_BREACH">Delivery SLA breached</option>
          <option value="CANCEL">Cancelled by the buyer</option>
        </select>
      </label>
      <div className="actions">
        <button onClick={onClose}>Keep the hold</button>
        <button className="danger" disabled={busy} onClick={submit} data-testid="void-confirm">Void the hold</button>
      </div>
    </Modal>
  );
}
