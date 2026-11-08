import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api.ts';
import { useStore } from '../store.ts';
import type { Dispute } from '../types.ts';
import { loadAll } from '../useStream.ts';
import { Modal } from './Modal.tsx';

interface BundleView {
  id: string;
  sha256: string;
  notes: string | null;
  files: Array<{ name: string; mime: string; sha256: string; bytes: number }>;
  reviewedBy: string | null;
  submittedAt: string | null;
}
interface DisputeDetail { dispute: Dispute; bundle: BundleView | null }
type Plan = { status: 'BUILT'; bundle: BundleView } | { status: 'BLOCKED'; missing: string[]; reason: string };

/**
 * The seller's side of a dispute. Evidence is drafted from our own records and rendered to PDF, but nothing is sent until
 * a person has read the exact files and ticked the attestation: the server records it against the bundle's hash.
 */
export function EvidenceModal({ disputeId, onClose }: { disputeId: string; onClose: () => void }) {
  const toast = useStore((s) => s.toast);
  const [detail, setDetail] = useState<DisputeDetail | null>(null);
  const [blocked, setBlocked] = useState<{ missing: string[]; reason: string } | null>(null);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setDetail(await api<DisputeDetail>('GET', `/api/disputes/${encodeURIComponent(disputeId)}`));
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [disputeId]);
  useEffect(() => { void load(); }, [load]);

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const sync = () => act('sync', async () => { await api('POST', `/api/disputes/${encodeURIComponent(disputeId)}/sync`, {}); await load(); await loadAll(); });
  const plan = () => act('plan', async () => {
    const r = await api<Plan>('POST', `/api/disputes/${encodeURIComponent(disputeId)}/plan`, {});
    setBlocked(r.status === 'BLOCKED' ? { missing: r.missing, reason: r.reason } : null);
    setAttested(false);
    await load();
  });
  const submit = () => act('submit', async () => {
    if (!detail?.bundle) return;
    await api('POST', `/api/disputes/${encodeURIComponent(disputeId)}/submit`, { bundleId: detail.bundle.id, attested: true });
    toast('ok', 'Evidence submitted to PayPal');
    await load();
    await loadAll();
  });

  const b = detail?.bundle ?? null;
  return (
    <Modal title={`Dispute ${disputeId}`} onClose={onClose} wide>
      {error && <p className="note">{error}</p>}
      {detail && <p>Status <strong>{detail.dispute.status}</strong>{detail.dispute.reason ? ` · reason ${String(detail.dispute.reason)}` : ''}</p>}
      <div className="actions left">
        <button disabled={!!busy} onClick={sync}>{busy === 'sync' ? 'Syncing…' : 'Sync from PayPal'}</button>
        <button disabled={!!busy || !!b?.submittedAt} onClick={plan} data-testid="plan">{busy === 'plan' ? 'Drafting…' : b ? 'Draft again' : 'Draft evidence'}</button>
      </div>

      {blocked && (
        <div className="note" data-testid="plan-blocked">
          <strong>Cannot defend yet:</strong> {blocked.reason}
          <ul>{blocked.missing.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}

      {b && (
        <div data-testid="bundle">
          <h3>Evidence bundle <code title={b.sha256}>{b.sha256.slice(0, 12)}…</code></h3>
          {b.notes && <blockquote>{b.notes}</blockquote>}
          <ul>
            {b.files.map((f) => (
              <li key={f.name}>
                <a href={`/api/evidence/${b.id}/files/${encodeURIComponent(f.name)}`} target="_blank" rel="noreferrer">{f.name}</a>
                <small className="muted"> {f.mime} · {f.bytes} bytes · {f.sha256.slice(0, 10)}…</small>
              </li>
            ))}
          </ul>
          {b.submittedAt ? (
            <p className="gate pass">✓ Submitted {new Date(b.submittedAt).toLocaleString()}</p>
          ) : (
            <>
              <label className="check">
                <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} data-testid="attest" />
                I’ve checked these facts against the files above and they are true.
              </label>
              <div className="actions">
                <button className="primary" disabled={!attested || !!busy} onClick={submit} data-testid="submit-evidence">
                  {busy === 'submit' ? 'Submitting…' : 'Submit to PayPal'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
