import { useEffect, useRef, useState } from 'react';
import { ApiError, api, errorMessage } from '../api.ts';
import { formatDay, money } from '../format.ts';
import { useStore } from '../store.ts';
import type { OrderRow } from '../types.ts';
import { loadAll } from '../useStream.ts';
import { Modal } from './Modal.tsx';

type Phase = 'loading' | 'ready' | 'unavailable' | 'authorizing';
type OneTimeSession = { start: (o?: { presentationMode: 'auto' }, p?: Promise<{ orderId: string }>) => Promise<unknown> };

/** Where a buyer approves an order outside the SDK, per PayPal environment (the server only ever reports `sandbox`). */
const CHECKOUT_HOST = { sandbox: 'https://www.sandbox.paypal.com' } as const;

/**
 * The buyer approves the PayPal order, then the server authorizes it (a hold; nothing is captured). The PayPal JS SDK v6
 * session is created up front and `start` runs inside the click handler so the popup is not blocked. The sandbox
 * checkout link is always offered as well: if the SDK cannot load, approving there and pressing "I approved it" does the
 * same job, because the server reads the PayPal order id from its own database, never from the browser.
 */
export function PayPalApproveDialog({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const session = useStore((s) => s.session);
  const toast = useStore((s) => s.toast);
  const [phase, setPhase] = useState<Phase>('loading');
  const [note, setNote] = useState('');
  const [declined, setDeclined] = useState(false);
  const sdkSession = useRef<OneTimeSession | null>(null);
  const paypalOrderId = order.paypalOrderId;

  const authorize = async () => {
    setPhase('authorizing');
    try {
      await api('POST', `/api/orders/${order.id}/authorize`, {});
      toast('ok', 'Approved: the hold is in place');
      await loadAll();
      onClose();
    } catch (e) {
      // 422 INSTRUMENT_DECLINED: PayPal refused the funding source the buyer picked. Trying it again cannot work, so the
      // buyer goes back into PayPal (same order) to choose another way to pay. A popup needs a click, so we ask for one.
      const wasDeclined = e instanceof ApiError && e.code === 'INSTRUMENT_DECLINED';
      setDeclined(wasDeclined);
      setNote(wasDeclined ? 'PayPal declined that payment method. Choose another way to pay; nothing has been held.' : errorMessage(e));
      setPhase(sdkSession.current ? 'ready' : 'unavailable');
    }
  };
  const authorizeRef = useRef(authorize);
  authorizeRef.current = authorize;

  useEffect(() => {
    if (!session || !paypalOrderId) return;
    let cancelled = false;
    (async () => {
      try {
        const { loadCoreSdkScript } = await import('@paypal/paypal-js/sdk-v6');
        const ns = await loadCoreSdkScript({ environment: session.paypalEnv });
        if (!ns) throw new Error('PayPal SDK did not load');
        const sdk = await ns.createInstance({ clientId: session.paypalClientId, components: ['paypal-payments'], pageType: 'checkout' });
        // Ask PayPal which methods this buyer can use for this currency before offering the button.
        const methods = await sdk.findEligibleMethods({ currencyCode: order.currency });
        if (!methods.isEligible('paypal')) throw new Error('PayPal is not offered for this currency here');
        sdkSession.current = sdk.createPayPalOneTimePaymentSession({
          onApprove: async () => authorizeRef.current(),
          onCancel: () => setNote('Approval cancelled: the hold has not been placed.'),
          onError: (err) => setNote(`PayPal reported an error: ${errorMessage(err)}`),
        }) as unknown as OneTimeSession;
        if (!cancelled) setPhase('ready');
      } catch (e) {
        if (!cancelled) {
          setNote(`The PayPal button could not load (${errorMessage(e)}). Use the sandbox checkout link instead.`);
          setPhase('unavailable');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [session, paypalOrderId, order.currency]);

  const start = async () => {
    if (!sdkSession.current || !paypalOrderId) return;
    setDeclined(false);
    try {
      // The order already exists on the server, so the promise passed to start() resolves to it ({ orderId }, v6 shape).
      await sdkSession.current.start({ presentationMode: 'auto' }, Promise.resolve({ orderId: paypalOrderId }));
    } catch (e) {
      setNote(errorMessage(e));
    }
  };

  // Without a PayPal order there is nothing to approve and the SDK never starts, so say so instead of "Loading…" forever.
  if (!paypalOrderId) {
    return (
      <Modal title="Approve this hold" onClose={onClose}>
        <p className="note" role="status">
          This order has no PayPal order yet, so it can’t be approved. Cancel it and draft the purchase again.
        </p>
        <div className="actions">
          <button onClick={onClose}>Close</button>
        </div>
      </Modal>
    );
  }

  const link = `${CHECKOUT_HOST[session?.paypalEnv ?? 'sandbox']}/checkoutnow?token=${encodeURIComponent(paypalOrderId)}`;
  return (
    <Modal title="Approve this hold" onClose={onClose}>
      <p>
        <strong>Hold {money(order.amountMinor, order.currency)}</strong> for {order.title ?? 'this order'}
        {order.domain ? ` from ${order.domain}` : ''}. Capture happens only after delivery is recorded and the proof gate
        passes; if the supplier misses {formatDay(order.deliverBy)} you can void the hold.
      </p>
      <div className="actions stack">
        <button className="paypal" disabled={phase !== 'ready'} onClick={start} data-testid="paypal-button">
          {phase === 'loading' ? 'Loading PayPal…' : phase === 'authorizing' ? 'Placing the hold…' : declined ? 'Choose another way to pay' : 'Approve with PayPal'}
        </button>
        <a href={link} target="_blank" rel="noreferrer" data-testid="paypal-link">Open the sandbox checkout in a new tab</a>
        <button onClick={authorize} disabled={phase === 'authorizing'} data-testid="paypal-authorize">I approved it: place the hold</button>
      </div>
      {note && <p className="note" role="status">{note}</p>}
    </Modal>
  );
}
