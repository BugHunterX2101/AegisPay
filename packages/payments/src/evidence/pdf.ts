import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';
import { DomainError, canonicalJson, sha256Hex, usd } from '@aegis/core';
import type { EvidenceFile } from '@aegis/db';
import type { DocumentKind, PlanResult } from './plan.ts';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

/** Everything the PDFs may state. Each block is optional; a document that needs a missing block refuses to render. */
export interface RenderFacts {
  disputeId: string;
  orderId: string;
  captureId: string;
  /** Pins the PDF metadata dates, so the same facts always produce the same bytes (and the same SHA-256). */
  generatedAt: Date;
  fulfillment?: {
    carrier: string;
    trackingNumber: string;
    shippedAt: Date | null;
    deliveredAt: Date | null;
    /** 'SIMULATED' in the sandbox. Anything but a real carrier feed is labelled on the page. */
    source: string;
  };
  mandate?: {
    id: string;
    hash: string;
    approvedBy: string;
    approvedAt: Date;
    /** When the buyer approved the PayPal order, if PayPal told us. */
    payerApprovedAt: Date | null;
    gateChecks: { name: string; passed: boolean; detail: string }[];
  };
  snapshot?: { title: string; features: string[]; priceMinor: bigint | null; url: string; capturedAt: Date; hash: string };
  ledger?: {
    approvedAt: Date | null;
    paypalOrderId: string | null;
    authorizationId: string | null;
    authorizedAt: Date | null;
    capturedAt: Date | null;
    amountMinor: bigint;
    refunds: { id: string; amountMinor: bigint; status: string }[];
  };
}

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 54;
const BODY = 10;

/** The standard Helvetica font only encodes WinAnsi. Anything else would throw mid-render, so it is mapped first. */
export function winAnsiSafe(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/€/g, 'EUR')
    .replace(/[\r\t]/g, ' ')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/gu, '?');
}

const iso = (d: Date | null | undefined, none = 'not recorded') => (d ? d.toISOString() : none);

class Page {
  private page!: PDFPage;
  private y = 0;
  readonly pages: PDFPage[] = [];
  constructor(
    private readonly pdf: PDFDocument,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.next();
  }
  private next() {
    this.page = this.pdf.addPage([A4.w, A4.h]);
    this.pages.push(this.page);
    this.y = A4.h - MARGIN;
  }
  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of winAnsiSafe(text).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        let w = word;
        // a word wider than the line (a long URL or hash) is split by characters
        while (font.widthOfTextAtSize(w, size) > width) {
          let cut = w.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
          if (line) {
            out.push(line);
            line = '';
          }
          out.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        const trial = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(trial, size) <= width) line = trial;
        else {
          out.push(line);
          line = w;
        }
      }
      out.push(line);
    }
    return out;
  }
  private draw(text: string, font: PDFFont, size: number, x: number, width: number, gap: number) {
    for (const l of this.wrap(text, font, size, width)) {
      if (this.y < MARGIN + 30) this.next();
      this.page.drawText(l, { x, y: this.y, size, font, color: rgb(0, 0, 0) });
      this.y -= size + gap;
    }
  }
  title(text: string) {
    this.draw(text, this.bold, 16, MARGIN, A4.w - 2 * MARGIN, 6);
    this.y -= 4;
  }
  heading(text: string) {
    this.y -= 8;
    this.draw(text, this.bold, 11, MARGIN, A4.w - 2 * MARGIN, 4);
  }
  field(label: string, value: string) {
    const labelW = 150;
    const lines = this.wrap(value, this.font, BODY, A4.w - 2 * MARGIN - labelW);
    if (this.y < MARGIN + 30) this.next();
    this.page.drawText(winAnsiSafe(label), { x: MARGIN, y: this.y, size: BODY, font: this.bold, color: rgb(0, 0, 0) });
    for (const l of lines) {
      if (this.y < MARGIN + 30) this.next();
      this.page.drawText(l, { x: MARGIN + labelW, y: this.y, size: BODY, font: this.font, color: rgb(0, 0, 0) });
      this.y -= BODY + 3;
    }
  }
  para(text: string) {
    this.draw(text, this.font, BODY, MARGIN, A4.w - 2 * MARGIN, 3);
  }
}

function need<T>(v: T | undefined, what: string, kind: DocumentKind): T {
  if (v === undefined) throw new DomainError('INTERNAL', `cannot render ${kind}: ${what} is missing`);
  return v;
}

type Writer = (p: Page, f: RenderFacts) => { title: string; file: string };

const WRITERS: Record<DocumentKind, Writer> = {
  FULFILLMENT_RECORD: (p, f) => {
    const x = need(f.fulfillment, 'fulfillment', 'FULFILLMENT_RECORD');
    p.title('Fulfillment record');
    p.heading('Shipment');
    p.field('Carrier', x.carrier);
    p.field('Tracking number', x.trackingNumber);
    p.field('Shipped at (UTC)', iso(x.shippedAt));
    p.field('Delivered at (UTC)', iso(x.deliveredAt, 'no delivery has been recorded'));
    p.heading('Where this record comes from');
    p.field('Source', x.source === 'SIMULATED' ? 'SIMULATED - sandbox run, no real carrier feed' : x.source);
    p.para('This record is exactly what AegisPay stored for the order. It states no fact beyond the fields above.');
    return { title: 'Fulfillment record', file: 'fulfillment-record.pdf' };
  },

  MANDATE_APPROVAL: (p, f) => {
    const m = need(f.mandate, 'mandate', 'MANDATE_APPROVAL');
    p.title('Mandate and approval record');
    p.heading('Mandate');
    p.field('Mandate id', m.id);
    p.field('Mandate SHA-256', m.hash);
    p.heading('Human approval');
    p.field('Approved by', m.approvedBy);
    p.field('Approved at (UTC)', iso(m.approvedAt));
    p.field('Buyer approved PayPal order', iso(m.payerApprovedAt));
    p.heading('Deterministic checks at the time of the proposal');
    if (!m.gateChecks.length) p.para('No check results were stored.');
    for (const c of m.gateChecks) p.field(c.name, `${c.passed ? 'PASS' : 'FAIL'} - ${c.detail}`);
    return { title: 'Mandate and approval record', file: 'mandate-approval.pdf' };
  },

  PRODUCT_SNAPSHOT: (p, f) => {
    const s = need(f.snapshot, 'product snapshot', 'PRODUCT_SNAPSHOT');
    p.title('Product snapshot');
    p.heading('Product as it was listed at purchase time');
    p.field('Title', s.title);
    p.field('Listed price (USD)', s.priceMinor === null ? 'not recorded' : usd.toPayPal(s.priceMinor));
    p.field('Item URL', s.url);
    p.field('Captured at (UTC)', iso(s.capturedAt));
    p.field('Snapshot SHA-256', s.hash);
    p.heading('Listed features');
    if (!s.features.length) p.para('No feature list was stored.');
    for (const feat of s.features) p.para(`- ${feat}`);
    return { title: 'Product snapshot', file: 'product-snapshot.pdf' };
  },

  LEDGER_EXTRACT: (p, f) => {
    const l = need(f.ledger, 'ledger', 'LEDGER_EXTRACT');
    p.title('Ledger extract');
    p.heading('One approval, one authorization, one capture');
    p.field('PayPal order', l.paypalOrderId ?? 'not recorded');
    p.field('Buyer approval (UTC)', iso(l.approvedAt));
    p.field('Authorization', l.authorizationId ?? 'not recorded');
    p.field('Authorized at (UTC)', iso(l.authorizedAt));
    p.field('Capture', f.captureId);
    p.field('Captured at (UTC)', iso(l.capturedAt));
    p.field('Captured amount (USD)', usd.toPayPal(l.amountMinor));
    p.heading('Refunds');
    if (!l.refunds.length) p.para('No refund has been issued against this capture.');
    for (const r of l.refunds) p.field(r.id, `${usd.toPayPal(r.amountMinor)} USD, ${r.status}`);
    return { title: 'Ledger extract', file: 'ledger-extract.pdf' };
  },
};

async function renderOne(kind: DocumentKind, f: RenderFacts): Promise<EvidenceFile> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = new Page(pdf, font, bold);
  const { title, file } = WRITERS[kind](page, f);
  const total = page.pages.length;
  page.pages.forEach((pg, i) => {
    pg.drawText(winAnsiSafe(`AegisPay | dispute ${f.disputeId} | order ${f.orderId} | page ${i + 1} of ${total}`), {
      x: MARGIN,
      y: 28,
      size: 8,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
  });
  pdf.setTitle(winAnsiSafe(title));
  pdf.setCreator('AegisPay');
  pdf.setProducer('AegisPay');
  pdf.setCreationDate(f.generatedAt);
  pdf.setModificationDate(f.generatedAt);
  const bytes = await pdf.save({ useObjectStreams: false });
  if (bytes.byteLength >= MAX_FILE_BYTES) throw new DomainError('VALIDATION', `${file} is ${bytes.byteLength} bytes, PayPal's limit is 10 MB per file`);
  return { name: file, mime: 'application/pdf', sha256: sha256Hex(bytes), bytes_base64: Buffer.from(bytes).toString('base64') };
}

/** Renders the plan's documents, in plan order. Text-only PDFs, so they are small and carry no executable content. */
export async function renderPdfs(plan: Extract<PlanResult, { status: 'PLANNED' }>, facts: RenderFacts): Promise<EvidenceFile[]> {
  const files: EvidenceFile[] = [];
  for (const kind of plan.documents) files.push(await renderOne(kind, facts));
  const total = files.reduce((n, f) => n + Buffer.from(f.bytes_base64, 'base64').byteLength, 0);
  if (total >= MAX_TOTAL_BYTES) throw new DomainError('VALIDATION', `evidence is ${total} bytes, PayPal's limit is 50 MB per call`);
  return files;
}

/**
 * The bundle's identity: the exact `input` JSON plus each file's name and hash. Stored with the bundle before anything is
 * sent, and re-checked at submit time, so what a human reviewed is what PayPal receives.
 */
export function bundleSha256(input: unknown, files: readonly Pick<EvidenceFile, 'name' | 'sha256'>[]): string {
  return sha256Hex(canonicalJson({ input, files: files.map((f) => ({ name: f.name, sha256: f.sha256 })) }));
}
