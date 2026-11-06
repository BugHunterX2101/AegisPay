import type { Context, Mandate, Proposal } from '../src/index.ts';

export const NOW = '2026-11-05T12:00:00Z';

export const mandate = (o: Partial<Mandate> = {}): Mandate => ({
  id: 'm1',
  version: 1,
  sha256: 'a'.repeat(64),
  spec: { keywords: ['usb-c cable'], mustInclude: ['cable'], mustExclude: ['refurbished'] },
  quantity: 10,
  unitCeiling: 18000n,
  budget: 200000n,
  currency: 'USD',
  deliverBy: '2026-11-25',
  minRating: 4,
  allowedDomains: ['shop.example.com'],
  approvalThreshold: 100000n,
  expiresAt: '2026-12-31T00:00:00Z',
  status: 'ACTIVE',
  ...o,
});

export const proposal = (o: Partial<Proposal> = {}): Proposal => ({
  mandateId: 'm1',
  mandateVersion: 1,
  productId: 'p1',
  title: 'Braided USB-C Cable 2m',
  domain: 'shop.example.com',
  unitPrice: 17000n,
  currency: 'USD',
  quantity: 10,
  shipping: 1000n,
  tax: 0n,
  etaDate: '2026-11-20',
  rating: 4.5,
  inStock: true,
  snapshotSha256: 'b'.repeat(64),
  ...o,
});

export const ctx = (o: Partial<Context> = {}): Context => ({ now: NOW, spentSoFar: 0n, ...o });
