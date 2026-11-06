import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { DomainError, sha256Hex } from '@aegis/core';
import { bundleSha256, renderPdfs, winAnsiSafe } from '../src/evidence/pdf.ts';
import type { RenderFacts } from '../src/evidence/pdf.ts';
import { buildEvidenceInput, planEvidence } from '../src/evidence/plan.ts';
import type { DocumentKind, PlanResult } from '../src/evidence/plan.ts';

const T0 = new Date('2026-11-06T10:00:00.000Z');

const FACTS: RenderFacts = {
  disputeId: 'PP-D-1',
  orderId: '0192-order',
  captureId: 'CAP-1',
  generatedAt: T0,
  fulfillment: {
    carrier: 'FEDEX',
    trackingNumber: '122533485',
    shippedAt: new Date('2026-11-02T08:00:00.000Z'),
    deliveredAt: new Date('2026-11-04T16:30:00.000Z'),
    source: 'SIMULATED',
  },
  mandate: {
    id: 'mandate-1',
    hash: 'a'.repeat(64),
    approvedBy: 'owner@example.com',
    approvedAt: new Date('2026-11-01T09:00:00.000Z'),
    payerApprovedAt: new Date('2026-11-01T09:05:00.000Z'),
    gateChecks: [
      { name: 'budget', passed: true, detail: 'within cap' },
      { name: 'supplier', passed: true, detail: 'on allow-list' },
    ],
  },
  snapshot: {
    title: 'Standing desk',
    features: ['Electric', 'Memory presets'],
    priceMinor: 24999n,
    url: 'https://example.com/item/1',
    capturedAt: new Date('2026-11-01T08:55:00.000Z'),
    hash: 'b'.repeat(64),
  },
  ledger: {
    approvedAt: new Date('2026-11-01T09:05:00.000Z'),
    paypalOrderId: 'ORDER-1',
    authorizationId: 'AUTH-1',
    authorizedAt: new Date('2026-11-01T09:06:00.000Z'),
    capturedAt: new Date('2026-11-04T17:00:00.000Z'),
    amountMinor: 24999n,
    refunds: [{ id: 'REF-1', amountMinor: 1000n, status: 'COMPLETED' }],
  },
};

const FULL = {
  tracking: { carrierName: 'FEDEX', trackingNumber: '122533485' },
  hasMandate: true,
  hasSnapshot: true,
  hasLedger: true,
  refundIds: [] as string[],
};
const planned = (r: PlanResult) => {
  if (r.status !== 'PLANNED') throw new Error('expected PLANNED');
  return r;
};
const planFor = (documents: DocumentKind[]) =>
  ({ status: 'PLANNED', reason: 'X', evidences: [{ evidenceType: 'OTHER' }], documents, manualReview: false }) as Extract<PlanResult, { status: 'PLANNED' }>;

/**
 * pdf-lib compresses page content (Flate) and writes drawText as hex strings `<..> Tj`.
 * Inflating every stream and decoding those strings gives the text actually on the page, in drawing order.
 */
function pageText(base64: string): string {
  const buf = Buffer.from(base64, 'base64');
  const raw = buf.toString('latin1'); // latin1 is 1:1 with the bytes, so string offsets are buffer offsets
  const out: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    let content: string;
    try {
      content = inflateSync(buf.subarray(start, end)).toString('latin1');
    } catch {
      continue; // not a Flate stream (fonts are not embedded here, so this is rare)
    }
    for (const t of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out.push(Buffer.from(t[1]!, 'hex').toString('latin1'));
  }
  return out.join('\n');
}

describe('winAnsiSafe', () => {
  it('maps typographic characters to ASCII', () => {
    expect(winAnsiSafe('‘a’ “b” – — … €')).toBe(`'a' "b" - - ... EUR`);
  });
  it('replaces anything WinAnsi cannot encode with ? and keeps Latin-1', () => {
    expect(winAnsiSafe('café 中文 \u{1F600}')).toBe('café ?? ?');
  });
  it('turns tabs and carriage returns into spaces and keeps newlines', () => {
    expect(winAnsiSafe('a\tb\r\nc')).toBe('a b \nc');
  });
  it('is idempotent', () => {
    const once = winAnsiSafe('“hi” 中');
    expect(winAnsiSafe(once)).toBe(once);
  });
});

describe('renderPdfs', () => {
  it('renders each planned document, in plan order, as a real PDF', async () => {
    const files = await renderPdfs(planFor(['LEDGER_EXTRACT', 'MANDATE_APPROVAL', 'FULFILLMENT_RECORD']), FACTS);
    expect(files.map((f) => f.name)).toEqual(['ledger-extract.pdf', 'mandate-approval.pdf', 'fulfillment-record.pdf']);
    for (const f of files) {
      expect(f.mime).toBe('application/pdf');
      const bytes = Buffer.from(f.bytes_base64, 'base64');
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(f.sha256).toBe(sha256Hex(bytes));
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    }
  });

  it('is deterministic: same facts, same bytes, same hash', async () => {
    const plan = planFor(['LEDGER_EXTRACT', 'MANDATE_APPROVAL', 'FULFILLMENT_RECORD']);
    const a = await renderPdfs(plan, FACTS);
    const b = await renderPdfs(plan, FACTS);
    expect(a.map((f) => f.sha256)).toEqual(b.map((f) => f.sha256));
    expect(a.map((f) => f.bytes_base64)).toEqual(b.map((f) => f.bytes_base64));
  });

  it('changes the hash when a fact changes', async () => {
    const plan = planFor(['LEDGER_EXTRACT']);
    const a = await renderPdfs(plan, FACTS);
    const b = await renderPdfs(plan, { ...FACTS, ledger: { ...FACTS.ledger!, amountMinor: 25000n } });
    expect(a[0]!.sha256).not.toBe(b[0]!.sha256);
  });

  it('pins the metadata dates to generatedAt', async () => {
    const [f] = await renderPdfs(planFor(['LEDGER_EXTRACT']), FACTS);
    // updateMetadata:false, or load() itself rewrites ModDate/Producer/Creator and hides what was saved
    const doc = await PDFDocument.load(Buffer.from(f!.bytes_base64, 'base64'), { updateMetadata: false });
    expect(doc.getCreationDate()?.toISOString()).toBe(T0.toISOString());
    expect(doc.getModificationDate()?.toISOString()).toBe(T0.toISOString());
    expect(doc.getCreator()).toBe('AegisPay');
  });

  it('states the facts on the page: fulfillment record', async () => {
    const [f] = await renderPdfs(planFor(['FULFILLMENT_RECORD']), FACTS);
    const t = pageText(f!.bytes_base64);
    expect(t).toContain('FEDEX');
    expect(t).toContain('122533485');
    expect(t).toContain('2026-11-04T16:30:00.000Z');
    expect(t).toContain('SIMULATED - sandbox run, no real carrier feed');
    expect(t).toContain('dispute PP-D-1');
  });

  it('says plainly when no delivery has been recorded', async () => {
    const facts: RenderFacts = { ...FACTS, fulfillment: { ...FACTS.fulfillment!, deliveredAt: null } };
    const [f] = await renderPdfs(planFor(['FULFILLMENT_RECORD']), facts);
    expect(pageText(f!.bytes_base64)).toContain('no delivery has been recorded');
  });

  it('does not label a non-simulated source as simulated', async () => {
    const facts: RenderFacts = { ...FACTS, fulfillment: { ...FACTS.fulfillment!, source: 'CARRIER_FEED' } };
    const [f] = await renderPdfs(planFor(['FULFILLMENT_RECORD']), facts);
    const t = pageText(f!.bytes_base64);
    expect(t).toContain('CARRIER_FEED');
    expect(t).not.toContain('SIMULATED');
  });

  it('states the facts on the page: mandate, snapshot, ledger', async () => {
    const [m, s, l] = await renderPdfs(planFor(['MANDATE_APPROVAL', 'PRODUCT_SNAPSHOT', 'LEDGER_EXTRACT']), FACTS);
    const mt = pageText(m!.bytes_base64);
    expect(mt).toContain('mandate-1');
    expect(mt.replace(/\n/g, '')).toContain('a'.repeat(64)); // the 64-char hash wraps onto a second line
    expect(mt).toContain('PASS - within cap');
    const st = pageText(s!.bytes_base64);
    expect(st).toContain('Standing desk');
    expect(st).toContain('249.99');
    expect(st).toContain('- Memory presets');
    const lt = pageText(l!.bytes_base64);
    expect(lt).toContain('AUTH-1');
    expect(lt).toContain('CAP-1');
    expect(lt).toContain('249.99');
    expect(lt).toContain('10.00 USD, COMPLETED');
  });

  it('marks a failed gate check as FAIL', async () => {
    const facts: RenderFacts = { ...FACTS, mandate: { ...FACTS.mandate!, gateChecks: [{ name: 'budget', passed: false, detail: 'over cap' }] } };
    const [m] = await renderPdfs(planFor(['MANDATE_APPROVAL']), facts);
    expect(pageText(m!.bytes_base64)).toContain('FAIL - over cap');
  });

  it('says so when there are no refunds', async () => {
    const facts: RenderFacts = { ...FACTS, ledger: { ...FACTS.ledger!, refunds: [] } };
    const [l] = await renderPdfs(planFor(['LEDGER_EXTRACT']), facts);
    expect(pageText(l!.bytes_base64)).toContain('No refund has been issued against this capture.');
  });

  it('does not throw on text WinAnsi cannot encode', async () => {
    const facts: RenderFacts = { ...FACTS, snapshot: { ...FACTS.snapshot!, title: 'Bureau 中文 “pro” \u{1F600}', features: ['— quiet'] } };
    const [s] = await renderPdfs(planFor(['PRODUCT_SNAPSHOT']), facts);
    const t = pageText(s!.bytes_base64);
    expect(t).toContain('Bureau ?? "pro" ?');
    expect(t).toContain('- - quiet');
  });

  it('wraps a long unbroken word (a URL or hash) inside the margins instead of running off the page', async () => {
    const url = 'https://example.com/' + 'x'.repeat(400);
    const facts: RenderFacts = { ...FACTS, snapshot: { ...FACTS.snapshot!, url } };
    const [s] = await renderPdfs(planFor(['PRODUCT_SNAPSHOT']), facts);
    const joined = pageText(s!.bytes_base64).replace(/\n/g, '');
    expect(joined).toContain(url); // nothing lost when the word is split
  });

  it('paginates and puts "page i of n" on every page', async () => {
    const features = Array.from({ length: 140 }, (_, i) => `Feature number ${i + 1}`);
    const facts: RenderFacts = { ...FACTS, snapshot: { ...FACTS.snapshot!, features } };
    const [s] = await renderPdfs(planFor(['PRODUCT_SNAPSHOT']), facts);
    const doc = await PDFDocument.load(Buffer.from(s!.bytes_base64, 'base64'));
    const n = doc.getPageCount();
    expect(n).toBeGreaterThan(1);
    const t = pageText(s!.bytes_base64);
    for (let i = 1; i <= n; i++) expect(t).toContain(`page ${i} of ${n}`);
    expect(t).toContain('Feature number 140');
  });

  it('refuses to render a document whose facts are missing, naming the document', async () => {
    const { fulfillment: _f, ...rest } = FACTS;
    await expect(renderPdfs(planFor(['FULFILLMENT_RECORD']), rest as RenderFacts)).rejects.toThrow(/cannot render FULFILLMENT_RECORD: fulfillment is missing/);
    const { ledger: _l, ...noLedger } = FACTS;
    await expect(renderPdfs(planFor(['LEDGER_EXTRACT']), noLedger as RenderFacts)).rejects.toBeInstanceOf(DomainError);
  });

  it('renders nothing for a plan without documents', async () => {
    expect(await renderPdfs(planFor([]), FACTS)).toEqual([]);
  });

  it('stays far below the 10 MB per-file and 50 MB per-call limits', async () => {
    const files = await renderPdfs(planFor(['LEDGER_EXTRACT', 'MANDATE_APPROVAL', 'FULFILLMENT_RECORD']), FACTS);
    for (const f of files) expect(Buffer.from(f.bytes_base64, 'base64').byteLength).toBeLessThan(100 * 1024);
  });
});

describe('end to end with the plan', () => {
  it('UNAUTHORISED -> two PDFs whose hashes feed the bundle hash', async () => {
    const plan = planned(planEvidence('UNAUTHORISED', FULL));
    const input = buildEvidenceInput(plan, 'Delivered, approved by the owner.');
    const files = await renderPdfs(plan, FACTS);
    expect(files.map((f) => f.name)).toEqual(['fulfillment-record.pdf', 'mandate-approval.pdf']);
    const h = bundleSha256(input, files);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(bundleSha256(input, files)).toBe(h);
  });
});

describe('bundleSha256', () => {
  const files = [
    { name: 'a.pdf', sha256: '1'.repeat(64) },
    { name: 'b.pdf', sha256: '2'.repeat(64) },
  ];
  const input = { evidences: [{ evidence_type: 'OTHER', notes: 'n' }] };

  it('changes when the notes change', () => {
    const other = { evidences: [{ evidence_type: 'OTHER', notes: 'changed' }] };
    expect(bundleSha256(other, files)).not.toBe(bundleSha256(input, files));
  });
  it('changes when a file hash, a file name or the file order changes', () => {
    const base = bundleSha256(input, files);
    expect(bundleSha256(input, [files[0]!, { name: 'b.pdf', sha256: '3'.repeat(64) }])).not.toBe(base);
    expect(bundleSha256(input, [files[0]!, { name: 'c.pdf', sha256: files[1]!.sha256 }])).not.toBe(base);
    expect(bundleSha256(input, [files[1]!, files[0]!])).not.toBe(base);
  });
  it('does not depend on object key order inside the input', () => {
    const a = { evidences: [{ evidence_type: 'OTHER', notes: 'n' }] };
    const b = { evidences: [{ notes: 'n', evidence_type: 'OTHER' }] };
    expect(bundleSha256(a, files)).toBe(bundleSha256(b, files));
  });
  it('ignores the file bytes themselves (only name and sha256 count)', () => {
    const withBytes = files.map((f) => ({ ...f, bytes_base64: 'AAAA' }));
    expect(bundleSha256(input, withBytes)).toBe(bundleSha256(input, files));
  });
});
