import type { Currency, Minor } from '@aegis/core';

export interface Mandate {
  id: string;
  version: number;
  sha256: string;
  spec: { keywords: string[]; mustInclude?: string[]; mustExclude?: string[] };
  quantity: number; // integer >= 1
  unitCeiling: Minor;
  budget: Minor;
  currency: Currency;
  deliverBy: string; // ISO date (YYYY-MM-DD)
  minRating?: number; // 0..5
  allowedDomains?: string[]; // supplier allow-list
  approvalThreshold: Minor; // above this, second approver (P1)
  expiresAt: string; // ISO datetime
  status: 'ACTIVE' | 'PAUSED' | 'CLOSED';
}

export interface Proposal {
  mandateId: string;
  mandateVersion: number;
  productId: string;
  title: string;
  domain: string;
  unitPrice: Minor;
  currency: Currency;
  quantity: number;
  shipping: Minor;
  tax: Minor;
  etaDate: string; // ISO date
  rating?: number;
  inStock: boolean;
  snapshotSha256: string;
}

export interface Context {
  now: string; // ISO datetime, injected by the caller (the gatekeeper has no clock)
  spentSoFar: Minor;
}

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9' | 'R10' | 'R11';

export interface RuleResult {
  id: RuleId;
  pass: boolean;
  label: string;
  expected: string;
  actual: string;
}

export interface Decision {
  pass: boolean;
  results: RuleResult[];
  total: Minor;
  decisionSha256: string;
}
