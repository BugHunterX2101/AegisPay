import { useEffect, useState } from 'react';
import { api, errorMessage, getSession } from './api.ts';
import { AgentDrawer } from './components/AgentDrawer.tsx';
import { CommandGrid, GridDialogs } from './components/CommandGrid.tsx';
import { EvidenceModal } from './components/EvidenceModal.tsx';
import { MandateStrip } from './components/MandateStrip.tsx';
import { PayPalApproveDialog } from './components/PayPalApprove.tsx';
import { JudgeBanner, TopBar, refreshSelfCheck } from './components/TopBar.tsx';
import { useStore } from './store.ts';
import type { OrderRow } from './types.ts';
import { loadAll, useStream } from './useStream.ts';

/** Mounted only once the session cookie exists, so the stream is opened as the same visitor as every other request. */
function Stream() {
  useStream();
  return null;
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setTimeout(() => dismiss(toasts[0]!.id), 6000);
    return () => clearTimeout(t);
  }, [toasts, dismiss]);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role="status" onClick={() => dismiss(t.id)}>{t.text}</div>
      ))}
    </div>
  );
}

export function App() {
  const session = useStore((s) => s.session);
  const evidenceFor = useStore((s) => s.evidenceFor);
  const openEvidence = useStore((s) => s.openEvidence);
  const [approve, setApprove] = useState<OrderRow | null>(null);
  const [ship, setShip] = useState<OrderRow | null>(null);
  const [voidFor, setVoidFor] = useState<OrderRow | null>(null);
  const [fatal, setFatal] = useState('');

  useEffect(() => {
    const st = useStore.getState();
    (async () => {
      try {
        st.setSession(await getSession());
        await loadAll();
      } catch (e) {
        setFatal(errorMessage(e));
        return;
      }
      api<{ offsetDays: number }>('GET', '/api/demo/clock').then((c) => st.setOffsetDays(c.offsetDays)).catch(() => undefined);
      refreshSelfCheck().catch(() => undefined);
    })();
  }, []);

  if (fatal) return <main className="center"><p className="note">Could not reach the AegisPay API: {fatal}</p></main>;

  const close = () => { setShip(null); setVoidFor(null); };
  return (
    <>
      {session && <Stream />}
      <TopBar />
      <JudgeBanner />
      <main>
        <MandateStrip onApprove={setApprove} />
        <CommandGrid approve={setApprove} ship={setShip} voidHold={setVoidFor} evidence={openEvidence} />
      </main>
      <AgentDrawer />
      <GridDialogs ship={ship} voidFor={voidFor} close={close} />
      {approve && <PayPalApproveDialog order={approve} onClose={() => setApprove(null)} />}
      {evidenceFor && <EvidenceModal disputeId={evidenceFor} onClose={() => openEvidence(null)} />}
      <Toasts />
    </>
  );
}
