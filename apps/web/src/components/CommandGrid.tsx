import { useQuery } from '@tanstack/react-query';
import {
  CellStyleModule,
  ClientSideRowModelModule,
  CsvExportModule,
  HighlightChangesModule,
  ModuleRegistry,
  PinnedRowModule,
  RowAutoHeightModule,
  ValidationModule,
  colorSchemeVariable,
  themeQuartz,
} from 'ag-grid-community';
import type { ColDef, GetRowIdParams, ProcessCellForExportParams } from 'ag-grid-community';
import { LicenseManager, MasterDetailModule } from 'ag-grid-enterprise';
import { AgGridReact } from 'ag-grid-react';
import type { CustomCellRendererProps, CustomDetailCellRendererProps } from 'ag-grid-react';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { api, errorMessage } from '../api.ts';
import { CAPTURED_STATES, HELD_STATES, VOIDED_STATES, endOfDay, formatDay, formatStamp, humanize, money, remaining, shortHash, sumMinor, useAppNow, useWallNow } from '../format.ts';
import { useStore } from '../store.ts';
import type { AuditEvent, OrderRow } from '../types.ts';
import { loadAll } from '../useStream.ts';
import { StateChip } from './StateChip.tsx';

// AG Grid Enterprise runs without a key (it shows a watermark); a key can be baked in at build time.
const licenseKey = import.meta.env.VITE_AG_GRID_LICENSE_KEY as string | undefined;
if (licenseKey) LicenseManager.setLicenseKey(licenseKey);
// Only the features this grid uses. AllEnterpriseModule would ship charts, pivoting, Excel, formulas and side bars that
// nothing here renders (about 2 MB of the chunk). ValidationModule, in development only, names any module a grid option
// needs but is missing, so a feature added later fails loudly instead of silently doing nothing.
ModuleRegistry.registerModules([
  ClientSideRowModelModule, // rowData
  CellStyleModule, // the rightAligned column type is applied as a cellClass
  MasterDetailModule, // masterDetail + the audit-trail detail row + agGroupCellRenderer
  PinnedRowModule, // pinnedBottomRowData: the ledger foot row
  RowAutoHeightModule, // autoHeight on the wrapping Order column, detailRowAutoHeight
  CsvExportModule, // Export CSV
  HighlightChangesModule, // enableCellChangeFlash when the stream changes a cell
  ...(import.meta.env.DEV ? [ValidationModule] : []),
]);

// The grid wears the page's tokens; the CSS variables switch with the theme, so one param set serves both modes.
const theme = themeQuartz.withPart(colorSchemeVariable).withParams({
  backgroundColor: 'var(--card)',
  foregroundColor: 'var(--foreground)',
  chromeBackgroundColor: 'var(--card-2)',
  headerBackgroundColor: 'var(--card-2)',
  headerTextColor: 'var(--muted-foreground)',
  borderColor: 'var(--border)',
  accentColor: 'var(--primary)',
  rowHoverColor: 'var(--tone-brass-bg)',
  fontFamily: 'var(--font-ui)',
  headerFontFamily: 'var(--font-ui)',
  headerFontWeight: 600,
  fontSize: 13,
  borderRadius: 3,
  wrapperBorderRadius: 3,
  spacing: 7,
});

interface GridCtx {
  approve: (o: OrderRow) => void;
  ship: (o: OrderRow) => void;
  voidHold: (o: OrderRow) => void;
  cancel: (o: OrderRow) => void;
  evidence: (disputeId: string) => void;
}

// On a phone a pinned 230px actions column would leave the order title ~120px; there it scrolls with the row instead.
const NARROW = window.matchMedia('(max-width: 719px)');
const subscribeNarrow = (cb: () => void) => {
  NARROW.addEventListener('change', cb);
  return () => NARROW.removeEventListener('change', cb);
};
const isNarrow = () => NARROW.matches;

const FIT_ROWS = 8;
const DISPUTE_STATES = new Set(['DISPUTED', 'EVIDENCE_SUBMITTED', 'RESOLVED_WON', 'RESOLVED_LOST', 'REFUNDED']);

/** The pinned foot row is not an order: renderers that act on an order skip it. */
const TOTAL_ROW_ID = '__ledger_total';
const isOrder = (p: { node?: { rowPinned?: unknown } | null; data?: OrderRow | undefined }) => !!p.data && !p.node?.rowPinned;

function ActionsCell(p: CustomCellRendererProps<OrderRow>) {
  const toast = useStore((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const o = p.data;
  if (!o || !isOrder(p)) return null;
  const ctx = p.context as GridCtx;

  const post = async (path: string, ok: string) => {
    setBusy(true);
    try {
      // The route answers with the updated grid row: apply it directly instead of reloading every order and dispute
      // (two more round trips before the button came back). The stream's copy of the same change is then a no-op.
      const r = await api<{ order?: OrderRow | null }>('POST', `/api/orders/${o.id}/${path}`, {});
      if (r.order) useStore.getState().upsertOrder(r.order);
      else await loadAll();
      toast('ok', ok);
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="row-actions">
      {o.state === 'AWAITING_APPROVAL' && (
        <>
          <button className="primary sm" onClick={() => ctx.approve(o)} data-testid="approve">Approve</button>
          <button className="sm" onClick={() => ctx.cancel(o)} data-testid="cancel">Cancel</button>
        </>
      )}
      {o.state === 'HELD' && <button className="sm" onClick={() => ctx.ship(o)} data-testid="ship">Ship</button>}
      {o.state === 'IN_TRANSIT' && (
        <button className="sm" disabled={busy} onClick={() => post('deliver', 'Delivery recorded: the proof gate is running')} data-testid="deliver">Delivered</button>
      )}
      {(o.state === 'HELD' || o.state === 'IN_TRANSIT') && (
        <button className="danger sm" onClick={() => ctx.voidHold(o)} data-testid="void">Void</button>
      )}
      {DISPUTE_STATES.has(o.state) && o.disputeId && (
        <button className="sm" onClick={() => ctx.evidence(o.disputeId!)} data-testid="evidence">Evidence</button>
      )}
    </div>
  );
}

function SlaCell(p: CustomCellRendererProps<OrderRow>) {
  const now = useAppNow(); // the delivery SLA follows the demo clock, as the worker's breach sweep does
  const wall = useWallNow(); // the authorization expires on PayPal's real clock; time travel does not move it
  const o = p.data;
  if (!o || !isOrder(p) || (o.state !== 'HELD' && o.state !== 'IN_TRANSIT')) return null;
  const r = remaining(endOfDay(o.deliverBy), now);
  if (!r) return null;
  const auth = remaining(o.authExpiresAt, wall);
  return (
    <span className={r.overdue ? 'overdue' : ''} title={auth ? `Authorization expires in ${auth.text}` : undefined} data-testid="sla">
      {r.overdue ? 'SLA breached ' : 'SLA '}
      {r.text}
    </span>
  );
}

function GateCell(p: CustomCellRendererProps<OrderRow>) {
  const o = p.data;
  if (!o || !isOrder(p) || o.gatePass == null) return null;
  return (
    <span className={`gate ${o.gatePass ? 'pass' : 'fail'}`} title={`decision sha256 ${o.decisionSha256 ?? ''}`}>
      {o.gatePass ? '✓ passed' : '✗ blocked'} <small>{shortHash(o.decisionSha256)}</small>
    </span>
  );
}

function AuditDetail(p: CustomDetailCellRendererProps<OrderRow>) {
  const o = p.data;
  const events = useQuery({
    queryKey: ['audit', o?.id, o?.rowVersion],
    queryFn: () => api<{ events: AuditEvent[] }>('GET', `/api/orders/${o!.id}/audit`),
    enabled: !!o,
  });
  const chain = useQuery({
    queryKey: ['verify', o?.rowVersion],
    queryFn: () => api<{ ok: boolean; count?: number; firstBadSeq?: string; reason?: string }>('GET', '/api/audit/verify'),
    enabled: !!o,
  });
  return (
    <div className="detail" data-testid="audit-detail">
      <div className="detail-head">
        <strong>Audit trail</strong>
        {chain.data && (
          <span className={`gate ${chain.data.ok ? 'pass' : 'fail'}`} data-testid="chain-badge">
            {chain.data.ok ? `✓ hash chain verified (all ${chain.data.count} rows)` : `✗ chain broken at ${chain.data.firstBadSeq}: ${chain.data.reason}`}
          </span>
        )}
      </div>
      {events.isLoading && <p className="muted">Loading…</p>}
      {events.error && <p className="note">{errorMessage(events.error)}</p>}
      <table>
        <thead><tr><th>#</th><th>Time</th><th>Event</th><th>Actor</th><th>Hash</th></tr></thead>
        <tbody>
          {events.data?.events.map((e) => (
            <tr key={e.seq}>
              <td>{e.seq}</td>
              <td>{formatStamp(e.ts)}</td>
              <td>{e.type}</td>
              <td>{e.actor}</td>
              <td title={e.hash}><code>{shortHash(e.hash)}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A stable component: an inline arrow here would be a new component type on every render, remounting the overlay.
const NoOrders = () => <span className="muted">No orders yet. Describe what you need above.</span>;

// Grid options defined once. AgGridReact compares props by reference, and a new defaultColDef object counts as new
// column definitions: the grid rebuilt every column on each render, i.e. on every order the stream delivered.
const DEFAULT_COL_DEF: ColDef<OrderRow> = { resizable: true, sortable: true, enableCellChangeFlash: true, suppressHeaderMenuButton: true };
const getRowId = (p: GetRowIdParams<OrderRow>) => p.data.id;
const isRowMaster = (d: OrderRow | undefined) => !!d && d.id !== TOTAL_ROW_ID;

export function CommandGrid({ approve, ship, voidHold, cancel, evidence }: GridCtx) {
  // The parent passes stable setters, so the context object only changes if one of them does.
  const ctx = useMemo<GridCtx>(() => ({ approve, ship, voidHold, cancel, evidence }), [approve, ship, voidHold, cancel, evidence]);
  const ordersMap = useStore((s) => s.orders);
  const rows = useMemo(
    () => Object.values(ordersMap).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [ordersMap],
  );

  // A short list is as tall as its rows, so there is no blank slab under it; a long one keeps a fixed, scrolling box.
  const fit = rows.length > 0 && rows.length <= FIT_ROWS;
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow);
  const columnDefs = useMemo<ColDef<OrderRow>[]>(
    () => [
      {
        headerName: 'Order',
        field: 'title',
        cellRenderer: 'agGroupCellRenderer',
        cellRendererParams: { suppressCount: true },
        valueFormatter: (p) => p.value ?? '(untitled)',
        // A product title is the thing being bought: it wraps rather than being cut with an ellipsis.
        wrapText: true,
        autoHeight: true,
        minWidth: 220,
        flex: 2,
      },
      { headerName: 'State', field: 'state', cellRenderer: (p: CustomCellRendererProps<OrderRow>) => (isOrder(p) ? <StateChip state={p.data!.state} /> : null), width: 190 },
      { headerName: 'Hold', field: 'amountMinor', valueFormatter: (p) => (p.data ? money(p.data.amountMinor, p.data.currency) : ''), width: 90, type: 'rightAligned' },
      { headerName: 'Supplier', field: 'domain', width: 180 },
      // The value getter is what the CSV export writes; the renderer is what the screen shows.
      { headerName: 'Gate', colId: 'gate', valueGetter: (p) => (p.data?.gatePass == null ? '' : `${p.data.gatePass ? 'passed' : 'blocked'} ${p.data.decisionSha256 ?? ''}`.trim()), cellRenderer: GateCell, width: 150 },
      { headerName: 'Deliver by', field: 'deliverBy', valueFormatter: (p) => formatDay(p.value as string | null), width: 140 },
      { headerName: 'Timer', colId: 'timer', cellRenderer: SlaCell, width: 220, enableCellChangeFlash: false },
      { headerName: 'Tracking', colId: 'tracking', valueGetter: (p) => (p.data?.trackingNumber ? `${p.data.carrier ?? ''} ${p.data.trackingNumber}` : ''), width: 190 },
      { headerName: 'PayPal order', field: 'paypalOrderId', width: 190 },
      { headerName: 'Authorization', field: 'authorizationId', width: 170, hide: true },
      { headerName: 'Capture', field: 'captureId', width: 170, hide: true },
      { headerName: 'Dispute', colId: 'dispute', valueGetter: (p) => (p.data?.disputeId ? `${p.data.disputeId} · ${humanize(p.data.disputeStatus)}` : ''), width: 250 },
      { headerName: '', colId: 'actions', cellRenderer: ActionsCell, width: 230, pinned: narrow ? null : 'right', sortable: false, enableCellChangeFlash: false },
    ],
    [narrow],
  );

  // Ledger foot: money held or captured right now (the same figures as the strip above, so they cannot disagree).
  const totalRow = useMemo<OrderRow[]>(() => {
    if (rows.length === 0) return [];
    const committed = rows.filter((r) => HELD_STATES.includes(r.state) || CAPTURED_STATES.includes(r.state));
    const sum = committed.reduce((a, r) => a + BigInt(r.amountMinor), 0n);
    return [{ id: TOTAL_ROW_ID, title: `Held + captured · ${committed.length} of ${rows.length} orders`, amountMinor: sum.toString(), currency: rows[0]!.currency } as OrderRow];
  }, [rows]);

  const grid = useRef<AgGridReact<OrderRow>>(null);
  // An audit-friendly export of what is on screen, including the PayPal ids, the decision hash and the foot row.
  const exportCsv = () =>
    grid.current?.api.exportDataAsCsv({
      fileName: `aegispay-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      allColumns: true,
      columnKeys: columnDefs.map((c) => c.colId ?? c.field).filter((k): k is string => !!k && k !== 'actions' && k !== 'timer'),
      processCellCallback: (p: ProcessCellForExportParams<OrderRow>) => {
        if (p.column.getColId() === 'deliverBy' || p.column.getColId() === 'amountMinor') return p.formatValue(p.value) as string;
        return p.value == null ? '' : String(p.value);
      },
    });

  return (
    <section aria-label="Command grid">
      <div className="totals" data-testid="totals">
        <span>On hold <strong>{sumMinor(rows, HELD_STATES)}</strong></span>
        <span>Captured <strong>{sumMinor(rows, CAPTURED_STATES)}</strong></span>
        <span>Voided <strong>{sumMinor(rows, VOIDED_STATES)}</strong></span>
        <span>{rows.length} order{rows.length === 1 ? '' : 's'}</span>
        <button className="sm" onClick={exportCsv} disabled={rows.length === 0} data-testid="export-csv">Export CSV</button>
      </div>
      <div className="grid-wrap" data-testid="grid" data-fit={fit ? 'rows' : 'scroll'}>
        <AgGridReact<OrderRow>
          ref={grid}
          domLayout={fit ? 'autoHeight' : 'normal'}
          theme={theme}
          rowData={rows}
          pinnedBottomRowData={totalRow}
          columnDefs={columnDefs}
          defaultColDef={DEFAULT_COL_DEF}
          getRowId={getRowId}
          context={ctx}
          masterDetail
          isRowMaster={isRowMaster}
          detailCellRenderer={AuditDetail}
          detailRowAutoHeight
          noRowsOverlayComponent={NoOrders}
        />
      </div>
    </section>
  );
}
