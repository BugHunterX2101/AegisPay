import { useState } from 'react';
import { api, errorMessage } from '../api.ts';
import { money } from '../format.ts';
import { useStore } from '../store.ts';
import type { MandateDraft, OrderRow, Proposal } from '../types.ts';
import { loadAll } from '../useStream.ts';

const EXAMPLE = 'Buy one usb-c cable for at most 15 dollars, delivered within two weeks';

/**
 * Free text in, signed mandate out. The language model only drafts the mandate (it never touches money); the human
 * reviews the chips, confirms, and the deterministic gatekeeper checks every offer sourced against it.
 */
export function MandateStrip({ onApprove }: { onApprove: (o: OrderRow) => void }) {
  const toast = useStore((s) => s.toast);
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<MandateDraft | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [mandateId, setMandateId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const parse = () =>
    run('parse', async () => {
      const r = await api<{ draft: MandateDraft; warnings: unknown[] }>('POST', '/api/mandates/parse', { text });
      setDraft(r.draft);
      setWarnings((r.warnings ?? []).map((w) => (typeof w === 'string' ? w : JSON.stringify(w))));
      setMandateId(null);
      setProposals(null);
    });

  const confirm = () =>
    run('confirm', async () => {
      if (!draft) return;
      const { mandate } = await api<{ mandate: { id: string } }>('POST', '/api/mandates', { draft, sourceText: text });
      setMandateId(mandate.id);
      const r = await api<{ proposals: Proposal[] }>('POST', `/api/mandates/${mandate.id}/source`, {});
      setProposals(r.proposals);
      if (r.proposals.length === 0) toast('error', 'The live catalog returned no offers for that search');
    });

  const hold = (p: Proposal) =>
    run(`hold:${p.id}`, async () => {
      const r = await api<{ orderRowId: string }>('POST', `/api/proposals/${p.id}/orders`, { decisionSha256: p.decisionSha256 });
      await loadAll();
      const order = useStore.getState().orders[r.orderRowId];
      if (order) onApprove(order);
    });

  const set = <K extends keyof MandateDraft>(k: K, v: MandateDraft[K]) => draft && setDraft({ ...draft, [k]: v });
  const cur = draft?.currency ?? 'USD';

  return (
    <section className="strip" aria-label="Mandate" data-testid="mandate-strip">
      <div className="strip-row">
        <input
          className="grow"
          aria-label="What should the agent buy?"
          name="mandate"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && text.trim().length > 3 && !busy && parse()}
          placeholder="What should the agent buy? e.g. one steel water bottle, at most $25, by the 20th…"
          data-testid="mandate-text"
        />
        <button onClick={() => setText(EXAMPLE)}>Example</button>
        <button className="primary" disabled={!!busy || text.trim().length < 4} onClick={parse} data-testid="mandate-parse">
          {busy === 'parse' ? 'Reading…' : 'Draft mandate'}
        </button>
      </div>

      {draft && (
        <div className="chips" data-testid="mandate-chips">
          <label>Keywords
            <input name="keywords" autoComplete="off" value={draft.spec.keywords.join(', ')} onChange={(e) => set('spec', { ...draft.spec, keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })} />
          </label>
          <label>Quantity
            <input name="quantity" autoComplete="off" type="number" min={1} value={draft.quantity} onChange={(e) => set('quantity', Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <label>Ceiling per unit ({money(draft.unitCeiling, cur)})
            <input name="unitCeiling" autoComplete="off" spellCheck={false} value={draft.unitCeiling} onChange={(e) => set('unitCeiling', e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
          </label>
          <label>Budget ({money(draft.budget, cur)})
            <input name="budget" autoComplete="off" spellCheck={false} value={draft.budget} onChange={(e) => set('budget', e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
          </label>
          <label>Deliver by
            <input name="deliverBy" autoComplete="off" type="date" value={draft.deliverBy} onChange={(e) => set('deliverBy', e.target.value)} />
          </label>
          <button className="primary" disabled={!!busy || !!mandateId} onClick={confirm} data-testid="mandate-confirm">
            {busy === 'confirm' ? 'Searching live catalog…' : mandateId ? 'Mandate signed' : 'Confirm and search'}
          </button>
        </div>
      )}
      {warnings.length > 0 && <p className="note">{warnings.join(' · ')}</p>}

      {proposals && proposals.length > 0 && (
        <table className="proposals" data-testid="proposals">
          <thead><tr><th>Offer</th><th>Supplier</th><th>Unit</th><th>Gatekeeper</th><th><span className="sr-only">Action</span></th></tr></thead>
          <tbody>
            {proposals.map((p) => (
              <tr key={p.id} className={p.gatePass ? '' : 'blocked'}>
                <td>{p.title}</td>
                <td>{p.domain}</td>
                <td>{money(p.unitPriceMinor, cur)}</td>
                <td><span className={`gate ${p.gatePass ? 'pass' : 'fail'}`}>{p.gatePass ? '✓ passed' : '✗ blocked'}</span></td>
                <td>
                  {p.gatePass && (
                    <button className="primary sm" disabled={!!busy} onClick={() => hold(p)} data-testid="hold">
                      {busy === `hold:${p.id}` ? 'Placing…' : 'Place hold'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
