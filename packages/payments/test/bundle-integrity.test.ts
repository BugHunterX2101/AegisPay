import { describe, expect, it } from 'vitest';
import { DomainError, sha256Hex } from '@aegis/core';
import type { EvidenceBundleRow, EvidenceFile } from '@aegis/db';
import { assertBundleIntegrity } from '../src/disputes.ts';
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES, bundleSha256 } from '../src/evidence/pdf.ts';
import { MAX_FILES, MAX_NOTES_CHARS } from '../src/evidence/plan.ts';

/** A file whose recorded hash really is the hash of its bytes, so only the property under test can fail. */
function file(name: string, bytes: number | Buffer, mime = 'application/pdf'): EvidenceFile {
  const buf = typeof bytes === 'number' ? Buffer.alloc(bytes, 0x41) : bytes;
  return { name, mime, sha256: sha256Hex(buf), bytes_base64: buf.toString('base64') };
}

function bundle(o: { files?: EvidenceFile[]; input?: unknown; sha256?: string } = {}): EvidenceBundleRow {
  const files = o.files ?? [file('ledger-extract.pdf', 100)];
  const inputJson = o.input ?? { evidences: [{ evidence_type: 'PROOF_OF_FULFILLMENT', notes: 'Delivered on 2026-11-04.' }] };
  return {
    id: 'bundle-1',
    disputeId: 'PP-D-1',
    plan: {},
    inputJson,
    files,
    sha256: o.sha256 ?? bundleSha256(inputJson, files),
    reviewedBy: null,
    submittedAt: null,
    paypalResponse: null,
  };
}

/** The reason the check failed, or '' if it passed. */
const why = (b: EvidenceBundleRow): string => {
  try {
    assertBundleIntegrity(b);
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    return (e as DomainError).message;
  }
  return '';
};

describe('assertBundleIntegrity', () => {
  it('accepts a well-formed bundle', () => {
    expect(why(bundle())).toBe('');
  });

  describe('per-file size (PayPal: under 10 MB each)', () => {
    it('accepts a file one byte under the limit', () => {
      expect(why(bundle({ files: [file('ledger-extract.pdf', MAX_FILE_BYTES - 1)] }))).toBe('');
    });
    it('rejects a file exactly at the limit', () => {
      expect(why(bundle({ files: [file('ledger-extract.pdf', MAX_FILE_BYTES)] }))).toMatch(/ledger-extract\.pdf is over 10 MB/);
    });
    it('rejects the oversized file even when it is not the first', () => {
      const files = [file('mandate-approval.pdf', 100), file('ledger-extract.pdf', MAX_FILE_BYTES + 1)];
      expect(why(bundle({ files }))).toMatch(/ledger-extract\.pdf is over 10 MB/);
    });
  });

  describe('per-call size (PayPal: under 50 MB in total)', () => {
    it('cannot be reached while the file count and per-file limits hold: that is why it is a backstop', () => {
      // 3 files, each strictly under 10 MB, can never reach 50 MB. The total check guards a future change to either limit.
      expect(MAX_FILES * (MAX_FILE_BYTES - 1)).toBeLessThan(MAX_TOTAL_BYTES);
    });
    it('three files just under the per-file limit are fine', () => {
      const files = ['a', 'b', 'c'].map((n) => file(`${n}-doc.pdf`, MAX_FILE_BYTES - 1));
      expect(why(bundle({ files }))).toBe('');
    });
  });

  describe('file count', () => {
    it(`accepts ${MAX_FILES} files`, () => {
      expect(why(bundle({ files: ['a', 'b', 'c'].map((n) => file(`${n}-doc.pdf`, 10)) }))).toBe('');
    });
    it(`rejects ${MAX_FILES + 1} files`, () => {
      expect(why(bundle({ files: ['a', 'b', 'c', 'd'].map((n) => file(`${n}-doc.pdf`, 10)) }))).toMatch(/4 files, the limit is 3/);
    });
  });

  describe('file identity', () => {
    it('rejects anything but a PDF', () => {
      expect(why(bundle({ files: [file('ledger-extract.pdf', 10, 'text/html')] }))).toMatch(/only PDFs are built/);
    });
    it('rejects an unexpected file name (path tricks, wrong extension, upper case)', () => {
      for (const name of ['../ledger.pdf', 'ledger extract.pdf', 'ledger.exe', 'Ledger.pdf', 'a/b.pdf']) {
        expect(why(bundle({ files: [file(name, 10)] })), name).toMatch(/unexpected file name/);
      }
    });
    it('rejects bytes that no longer match the recorded hash', () => {
      const good = bundle();
      const tampered: EvidenceBundleRow = {
        ...good,
        files: [{ ...good.files[0]!, bytes_base64: Buffer.alloc(100, 0x42).toString('base64') }],
      };
      expect(why(tampered)).toMatch(/does not match its recorded hash/);
    });
  });

  describe('bundle hash (what the human reviewed is what PayPal receives)', () => {
    it('rejects a stored hash that does not match the input and files', () => {
      expect(why(bundle({ sha256: 'f'.repeat(64) }))).toMatch(/do not match the bundle hash/);
    });
    it('rejects an input edited after the hash was taken', () => {
      const original = bundle();
      const edited = { ...original, inputJson: { evidences: [{ evidence_type: 'PROOF_OF_FULFILLMENT', notes: 'Edited later.' }] } };
      expect(why(edited)).toMatch(/do not match the bundle hash/);
    });
  });

  describe('notes (PayPal: at most 2,000 characters)', () => {
    const withNotes = (notes: unknown) => bundle({ input: { evidences: [{ evidence_type: 'OTHER', notes }] } });
    it('accepts exactly the limit', () => {
      expect(why(withNotes('x'.repeat(MAX_NOTES_CHARS)))).toBe('');
    });
    it('rejects one character over', () => {
      expect(why(withNotes('x'.repeat(MAX_NOTES_CHARS + 1)))).toMatch(/notes are 2001 characters/);
    });
    it('rejects missing or empty notes', () => {
      expect(why(withNotes(undefined))).toMatch(/has no notes/);
      expect(why(withNotes(''))).toMatch(/has no notes/);
    });
    it('rejects a bundle with no evidences at all', () => {
      expect(why(bundle({ input: { evidences: [] } }))).toMatch(/no evidences/);
      expect(why(bundle({ input: {} }))).toMatch(/no evidences/);
    });
  });
});
