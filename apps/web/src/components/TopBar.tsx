import { Monitor, Moon, Pulse, Sun } from '@phosphor-icons/react';
import { useState } from 'react';
import { api, errorMessage } from '../api.ts';
import { endOfDay, formatClock } from '../format.ts';
import { useStore } from '../store.ts';
import { setThemePref, useTheme } from '../theme.ts';
import type { ThemePref } from '../theme.ts';
import type { SelfCheck } from '../types.ts';
import { loadAll } from '../useStream.ts';
import { Modal } from './Modal.tsx';
import { Seal } from './Seal.tsx';

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
      <button className="pill" onClick={() => setOpen(true)} data-testid="selfcheck-dot" aria-haspopup="dialog">
        <span className={`dot dot-${tone}`} aria-hidden="true" /> Live check{sc ? (failing === 0 ? ': all pass' : `: ${failing} failing`) : ''}
      </button>
      {open && (
        <Modal title="Live self-check" onClose={() => setOpen(false)}>
          <p className="muted">Real calls to the database, PayPal sandbox, webhook verification and the Channel3 catalog.</p>
          <table>
            <tbody>
              {sc?.probes.map((p) => (
                <tr key={p.name} data-testid={`probe-${p.name}`}>
                  <td><span className={`dot dot-${p.ok ? 'green' : 'red'}`} aria-hidden="true" /><span className="sr-only">{p.ok ? 'Passing: ' : 'Failing: '}</span> {p.name}</td>
                  <td>{p.ms} ms</td>
                  <td className="muted">{p.detail}{p.debugId ? ` · paypal-debug-id ${p.debugId}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="actions">
            {sc && <small className="muted">checked {formatClock(sc.checkedAt)}</small>}
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
    // floor(x) + 1 > x, so real now + needed days is strictly past the deadline (both sides UTC, like the worker's sweep).
    const needed = Math.floor((earliest - Date.now()) / DAY_MS) + 1;
    if (needed > 60) return toast('error', `The earliest deadline is ${needed} days out; the demo clock goes up to +60 days`);
    // Already past in real time: there is nothing to jump to, and a silent no-op click would look broken.
    if (needed <= offsetDays) return toast('ok', 'The earliest open hold is already past its delivery deadline; the SLA watch flags it on its next pass');
    // needed > offsetDays here, so the clock only ever moves forward (moving it back would un-breach a deadline).
    return setClock(needed);
  };

  const [confirmReset, setConfirmReset] = useState(false);
  const reset = async () => {
    setBusy(true);
    try {
      await api('POST', '/api/demo/reset', {});
      setOffsetDays(0);
      await loadAll();
      setConfirmReset(false);
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
      <button className="sm danger" disabled={busy} onClick={() => setConfirmReset(true)} data-testid="reset-demo">Reset demo</button>
      {confirmReset && (
        <Modal title="Reset the demo?" onClose={() => setConfirmReset(false)}>
          <p>This clears every demo order, mandate and dispute. The audit chain is kept, so what happened stays provable.</p>
          <div className="actions">
            <button onClick={() => setConfirmReset(false)}>Keep the demo</button>
            <button className="danger" disabled={busy} onClick={reset} data-testid="reset-confirm">{busy ? 'Clearing…' : 'Reset the demo'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AgentToggle() {
  const open = useStore((s) => s.drawerOpen);
  const setDrawer = useStore((s) => s.setDrawer);
  const n = useStore((s) => s.feed.length);
  return (
    <button className="pill" onClick={() => setDrawer(!open)} aria-expanded={open} data-testid="drawer-toggle">
      <Pulse size={15} aria-hidden="true" /> Agent activity <span className="count">{n}</span>
    </button>
  );
}

/** System, then light, then dark. The label names the next state, so the button is never ambiguous. */
function ThemeToggle() {
  const { pref } = useTheme();
  const next: ThemePref = pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system';
  const Icon = pref === 'system' ? Monitor : pref === 'light' ? Sun : Moon;
  return (
    <button className="pill pill-icon" onClick={() => setThemePref(next)} aria-label={`Theme: ${pref}. Switch to ${next}.`} title={`Theme: ${pref}`}>
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

export function TopBar() {
  const stream = useStore((s) => s.stream);
  return (
    <header className="topbar" id="top">
      <div className="wrap topbar-row">
        <a className="brand" href="#top" aria-label="AegisPay, top of page">
          <Seal size={26} />
          <span className="wordmark" translate="no">AegisPay</span>
        </a>
        <nav className="topnav" aria-label="Sections">
          <a href="#console">Console</a>
          <a href="#lifecycle">How a hold moves</a>
        </nav>
        <div className="topbar-right">
          <span className="tag" title="Money only ever moves in the PayPal sandbox">PayPal Sandbox</span>
          <span className="pill" data-testid="stream-status" role="status">
            <span className={`dot dot-${stream === 'live' ? 'green' : 'amber'}`} aria-hidden="true" /> {stream === 'live' ? 'Live' : stream === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
          </span>
          <SelfCheckDot />
          <AgentToggle />
          <ThemeToggle />
        </div>
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
    // Every state at or after the step counts (order-state.ts): FAILED is only reachable from DELIVERED, and REFUNDED only
    // from SETTLED or DISPUTED, so a failed capture still placed a hold and recorded delivery, and a refund was captured.
    ['Buyer approved: hold placed', past('HELD', 'IN_TRANSIT', 'DELIVERED', 'SETTLED', 'FAILED', 'VOIDED', 'DISPUTED', 'EVIDENCE_SUBMITTED', 'RESOLVED_WON', 'RESOLVED_LOST', 'REFUNDED')],
    ['Delivery recorded', list.some((o) => o.deliveredAt) || past('DELIVERED', 'SETTLED', 'FAILED', 'DISPUTED', 'EVIDENCE_SUBMITTED', 'RESOLVED_WON', 'RESOLVED_LOST', 'REFUNDED')],
    ['Captured after the proof gate', past('SETTLED', 'DISPUTED', 'EVIDENCE_SUBMITTED', 'RESOLVED_WON', 'RESOLVED_LOST', 'REFUNDED')],
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
