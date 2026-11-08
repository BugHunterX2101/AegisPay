import { Suspense, lazy, useEffect, useState } from 'react';
import { api, errorMessage, getSession } from './api.ts';
import { AgentDrawer } from './components/AgentDrawer.tsx';
import { Ambient } from './components/Ambient.tsx';
import { CancelDialog, ShipDialog, VoidDialog } from './components/Dialogs.tsx';
import { EvidenceModal } from './components/EvidenceModal.tsx';
import { Footer } from './components/Footer.tsx';
import { Hero } from './components/Hero.tsx';
import { Lifecycle } from './components/Lifecycle.tsx';
import { MandateStrip } from './components/MandateStrip.tsx';
import { PayPalApproveDialog } from './components/PayPalApprove.tsx';
import { JudgeBanner, TopBar, refreshSelfCheck } from './components/TopBar.tsx';
import { useStore } from './store.ts';
import type { OrderRow } from './types.ts';
import { loadAll, useStream } from './useStream.ts';

// AG Grid Enterprise is most of the bundle; it loads in its own chunk so the hero and copy paint first.
const CommandGrid = lazy(() => import('./components/CommandGrid.tsx').then((m) => ({ default: m.CommandGrid })));

/** Mounted only once the session cookie exists, so the stream is opened as the same visitor as every other request. */
function Stream() {
  useStream();
  return null;
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  // A confirmation clears itself; an error stays until it is dismissed, because it is the one thing a person must not miss.
  useEffect(() => {
    const next = toasts.find((t) => t.kind === 'ok');
    if (!next) return;
    const t = setTimeout(() => dismiss(next.id), 5000);
    return () => clearTimeout(t);
  }, [toasts, dismiss]);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} type="button" className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)} aria-label={`${t.text}. Dismiss`}>{t.text}</button>
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
  const [cancelFor, setCancelFor] = useState<OrderRow | null>(null);
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

  if (fatal) return <main className="center"><p className="note" role="alert">Could not reach the AegisPay API: {fatal}. Check that it is running, then reload this page.</p></main>;

  const close = () => { setShip(null); setVoidFor(null); setCancelFor(null); };
  return (
    <>
      {session && <Stream />}
      <Ambient />
      <a className="skip" href="#console">Skip to the console</a>
      <TopBar />
      <main id="main">
        <div className="wrap">
          <Hero />
        </div>
        <section id="console" className="console" aria-labelledby="console-title" tabIndex={-1}>
          <div className="wrap console-inner">
            <header className="section-head">
              <p className="eyebrow">02 · Console</p>
              <h2 id="console-title" className="section-title">Run one purchase, end to end.</h2>
            </header>
            <JudgeBanner />
            <MandateStrip onApprove={setApprove} />
            <Suspense fallback={<div className="grid-wrap grid-loading" aria-busy="true">Loading the command grid…</div>}>
              <CommandGrid approve={setApprove} ship={setShip} voidHold={setVoidFor} cancel={setCancelFor} evidence={openEvidence} />
            </Suspense>
          </div>
        </section>
        <div className="wrap">
          <Lifecycle />
        </div>
      </main>
      <Footer />
      <AgentDrawer />
      {ship && <ShipDialog order={ship} onClose={close} />}
      {voidFor && <VoidDialog order={voidFor} onClose={close} />}
      {cancelFor && <CancelDialog order={cancelFor} onClose={close} />}
      {approve && <PayPalApproveDialog order={approve} onClose={() => setApprove(null)} />}
      {evidenceFor && <EvidenceModal disputeId={evidenceFor} onClose={() => openEvidence(null)} />}
      <Toasts />
    </>
  );
}
