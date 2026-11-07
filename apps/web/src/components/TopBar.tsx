import { useState } from 'react';
import { api, errorMessage } from '../api.ts';
import { endOfDay } from '../format.ts';
import { useStore } from '../store.ts';
import type { SelfCheck } from '../types.ts';
import { loadAll } from '../useStream.ts';
import { Modal } from './Modal.tsx';

const DAY_MS = 86_400_000;

export async function refreshSelfCheck(): Promise<void> {
  const r = await api<SelfCheck>('GET', '/api/selfcheck');
  useStore.getState().setSelfcheck(r);
}

function SelfCheckDot() {
  const sc = useStore((s) => s.selfcheck);
  const toast = useStore((s) => s.toast);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const failing = sc?.probes.filter((p) => !p.ok).length ?? 0;
  const tone = !sc ? 'grey' : failing === 0 ? 'green' : 'red';

  const rerun = async () => {
    setBusy(true);
    try {
      await refreshSelfCheck();
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="pill" onClick={() => setOpen(true)} data-testid="selfcheck-dot" aria-label="Live self-check">
        <span className={`dot dot-${tone}`} /> Live check{sc ? (failing === 0 ? ': all pass' : `: ${failing} failing`) : ''}
      </button>
      {open && (
        <Modal title="Live self-check" onClose={() => setOpen(false)}>
          <p className="muted">Real calls to the database, PayPal sandbox, webhook verification and the Channel3 catalog.</p>
          <table>
            <tbody>
              {sc?.probes.map((p) => (
                <tr key={p.name} data-testid={`probe-${p.name}`}>
                  <td><span className={`dot dot-${p.ok ? 'green' : 'red'}`} /> {p.name}</td>
                  <td>{p.ms} ms</td>
                  <td className="muted">{p.detail}{p.debugId ? ` · paypal-debug-id ${p.debugId}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="actions">
            {sc && <small className="muted">checked {new Date(sc.checkedAt).toLocaleTimeString()}</small>}
            <button disabled={busy} onClick={rerun}>{busy ? 'Running…' : 'Run again'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Time travel and reset: only the app's own timers move, never PayPal's, and the audit chain is always kept. */
function JudgePanel() {
  const offsetDays = useStore((s) => s.offsetDays);
  const setOffsetDays = useStore((s) => s.setOffsetDays);
  const orders = useStore((s) => s.orders);
  const toast = useStore((s) => s.toast);
  const [busy, setBusy] = useState(false);

  const setClock = async (days: number) => {
    setBusy(true);
    try {
      const r = await api<{ offsetDays: number }>('POST', '/api/demo/clock', { offsetDays: Math.max(0, Math.min(60, days)) });
      setOffsetDays(r.offsetDays);
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Jump just past the earliest open delivery deadline so the SLA breach flow can be shown for real.
  const pastSla = () => {
    const open = Object.values(orders).filter((o) => o.state === 'HELD' || o.state === 'IN_TRANSIT');
    if (open.length === 0) return toast('error', 'No held order is waiting on delivery');
    const earliest = Math.min(...open.map((o) => new Date(endOfDay(o.deliverBy)).getTime()));
    return setClock(Math.floor((earliest - Date.now()) / DAY_MS) + 1);
  };

  const reset = async () => {
    if (!window.confirm('Clear all demo orders, mandates and disputes? The audit chain is kept.')) return;
    setBusy(true);
    try {
      await api('POST', '/api/demo/reset', {});
      setOffsetDays(0);
      await loadAll();
      toast('ok', 'Demo cleared; the audit chain was kept');
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="judge" data-testid="judge-panel">
      <span className="tag">Judge Mode</span>
      <span className="muted">Clock {offsetDays === 0 ? 'real' : <strong className="overdue">+{offsetDays}d (simulated)</strong>}</span>
      <button className="sm" disabled={busy || offsetDays >= 60} onClick={() => setClock(offsetDays + 1)} data-testid="clock-plus1">+1 day</button>
      <button className="sm" disabled={busy} onClick={pastSla} data-testid="clock-sla">+SLA</button>
      <button className="sm" disabled={busy || offsetDays === 0} onClick={() => setClock(0)}>Real time</button>
      <button className="sm danger" disabled={busy} onClick={reset} data-testid="reset-demo">Reset demo</button>
    </div>
  );
}

function AgentToggle() {
  const open = useStore((s) => s.drawerOpen);
  const setDrawer = useStore((s) => s.setDrawer);
  const n = useStore((s) => s.feed.length);
  return (
    <button className="pill" onClick={() => setDrawer(!open)} data-testid="drawer-toggle">
      Agent activity <span className="count">{n}</span>
    </button>
  );
}

export function TopBar() {
  const stream = useStore((s) => s.stream);
  return (
    <header className="topbar">
      <div className="brand">
        <strong>AegisPay</strong>
        <span className="muted">agents propose, humans approve, PayPal holds the money</span>
      </div>
      <div className="topbar-right">
        <span className="tag" title="Money only ever moves in the PayPal sandbox">PayPal Sandbox</span>
        <span className="pill" data-testid="stream-status"><span className={`dot dot-${stream === 'live' ? 'green' : 'amber'}`} /> {stream === 'live' ? 'Live' : stream}</span>
        <SelfCheckDot />
        <AgentToggle />
      </div>
    </header>
  );
}

export function JudgeBanner() {
  const session = useStore((s) => s.session);
  const orders = useStore((s) => s.orders);
  const feed = useStore((s) => s.feed);
  if (!session?.judgeMode) return null;
  const list = Object.values(orders);
  const past = (...states: string[]) => list.some((o) => states.includes(o.state));
  const steps: Array<[string, boolean]> = [
    ['Mandate drafted', list.length > 0 || feed.some((f) => f.kind === 'mandate.draft')],
    ['Gatekeeper passed an offer', list.some((o) => o.gatePass === true)],
    ['Buyer approved: hold placed', past('HELD', 'IN_TRANSIT', 'DELIVERED', 'SETTLED', 'VOIDED', 'DISPUTED', 'EVIDENCE_SUBMITTED', 'RESOLVED_WON', 'RESOLVED_LOST', 'REFUNDED')],
    ['Delivery recorded', list.some((o) => o.deliveredAt) || past('DELIVERED', 'SETTLED')],
    ['Captured after the proof gate', past('SETTLED', 'DISPUTED', 'EVIDENCE_SUBMITTED', 'RESOLVED_WON', 'RESOLVED_LOST')],
  ];
  return (
    <div className="banner" data-testid="judge-banner">
      <div>
        <strong>Try it:</strong> everything runs for real against the PayPal sandbox. Approve holds with a sandbox buyer
        account (developer.paypal.com, Testing tools, Sandbox accounts). No real money moves.
      </div>
      <ol className="steps">
        {steps.map(([label, done], i) => (
          <li key={label} className={done ? 'done' : ''} data-testid={`step-${i + 1}`}>{done ? '✓' : i + 1}. {label}</li>
        ))}
      </ol>
      <JudgePanel />
    </div>
  );
}
