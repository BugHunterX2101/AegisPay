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

/** The agent's work and the gatekeeper's verdicts, as they are written to the audit log. */
export function AgentDrawer() {
  const open = useStore((s) => s.drawerOpen);
  const setDrawer = useStore((s) => s.setDrawer);
  const feed = useStore((s) => s.feed);
  if (!open) return null;
  return (
    <aside className="drawer" aria-label="Agent activity" data-testid="agent-drawer">
      <header>
        <h2>Agent activity</h2>
        <button className="icon" aria-label="Close" onClick={() => setDrawer(false)}>×</button>
      </header>
      {feed.length === 0 && <p className="muted">Nothing yet. Draft a mandate and the agent&apos;s steps appear here live.</p>}
      <ul>
        {feed.map((f) => (
          <li key={f.key} data-kind={f.kind}>
            <div className="feed-head">
              <span className={`kind kind-${f.kind.split('.')[0]}`}>{LABEL[f.kind]}</span>
              <time>{new Date(f.at).toLocaleTimeString()}</time>
            </div>
            <div>{headline(f)}</div>
            <details>
              <summary>Details</summary>
              <pre>{JSON.stringify(f.data, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ul>
    </aside>
  );
}
