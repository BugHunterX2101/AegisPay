import { X } from '@phosphor-icons/react';
import { memo, useEffect, useRef, useState } from 'react';
import { formatClock } from '../format.ts';
import { useStore } from '../store.ts';
import type { FeedItem } from '../types.ts';

const LABEL: Record<FeedItem['kind'], string> = {
  'agent.step': 'Agent step',
  'gate.decision': 'Gatekeeper',
  'webhook.verified': 'PayPal webhook verified',
  'mandate.draft': 'Mandate drafted',
};

function headline(f: FeedItem): string {
  const d = f.data;
  if (f.kind === 'gate.decision') return `${d.pass === true || d.gatePass === true ? 'PASS' : 'BLOCK'} · proposal ${String(d.proposalId ?? '').slice(0, 8)}`;
  if (f.kind === 'webhook.verified') return String(d.eventType ?? d.type ?? d.eventId ?? '');
  const name = d.step ?? d.name ?? d.tool ?? d.kind;
  return name ? String(name) : String(d.runId ?? '').slice(0, 8);
}

/**
 * One feed line. Feed items never change once written, so a memoised entry renders once, not on every new event; and the
 * pretty-printed payload is only built when its <details> is opened (up to 200 JSON.stringify calls per event before).
 */
const FeedEntry = memo(function FeedEntry({ f }: { f: FeedItem }) {
  const [open, setOpen] = useState(false);
  return (
    <li data-kind={f.kind}>
      <div className="feed-head">
        <span className={`kind kind-${f.kind.split('.')[0]}`}>{LABEL[f.kind]}</span>
        <time dateTime={new Date(f.at).toISOString()}>{formatClock(f.at)}</time>
      </div>
      <div>{headline(f)}</div>
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>Details</summary>
        {open && <pre>{JSON.stringify(f.data, null, 2)}</pre>}
      </details>
    </li>
  );
});

/** The agent's work and the gatekeeper's verdicts, as they are written to the audit log. */
export function AgentDrawer() {
  const open = useStore((s) => s.drawerOpen);
  const setDrawer = useStore((s) => s.setDrawer);
  const feed = useStore((s) => s.feed);

  useEffect(() => {
    if (!open) return;
    // A modal opened over the drawer handles its own Escape first (it stops propagation).
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role="dialog"]') && setDrawer(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setDrawer]);

  // Focus moves into the drawer when it opens and returns to whatever opened it when it closes.
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    box.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return (
    <aside className="drawer" ref={box} tabIndex={-1} aria-labelledby="drawer-title" data-testid="agent-drawer">
      <header>
        <h2 id="drawer-title">Agent activity</h2>
        <button className="icon" aria-label="Close agent activity" onClick={() => setDrawer(false)}><X size={18} aria-hidden="true" /></button>
      </header>
      {feed.length === 0 && <p className="muted">Nothing yet. Draft a mandate and the agent&apos;s steps appear here live.</p>}
      <ul>
        {feed.map((f) => <FeedEntry key={f.key} f={f} />)}
      </ul>
    </aside>
  );
}
