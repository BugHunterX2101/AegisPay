import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * "Agents cannot pay" is a checked property of the codebase, so the check itself is tested: every boundary rule must
 * flag a violating snippet and must stay quiet on the imports that are allowed. A rule that silently stopped matching
 * (a renamed package, a changed glob, a parser regression) would otherwise pass `pnpm lint` forever.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const eslint = new ESLint({ cwd: root, overrideConfigFile: join(root, 'eslint.boundaries.config.mjs') });

/** Lint `code` as if it lived at `file` (repo-relative). A parse failure counts as a failure of the test, not a hit. */
async function lint(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(root, file) });
  const fatal = result!.messages.filter((m) => m.fatal);
  expect(fatal.map((m) => m.message), `parse error in the ${file} snippet`).toEqual([]);
  return result!.messages.map((m) => m.ruleId ?? '');
}

const violations: Array<[string, string, string]> = [
  // agents propose; they never touch money.
  ['agents imports payments', 'packages/agents/src/x.ts', "import { createHold } from '@aegis/payments';"],
  ['agents imports a payments sub-path (type-only)', 'packages/agents/src/x.ts', "import type { Y } from '@aegis/payments/src/orders';"],
  ['agents imports the PayPal server SDK', 'packages/agents/src/x.ts', "import { PaymentsController } from '@paypal/paypal-server-sdk';"],
  ['agents dynamic-imports payments', 'packages/agents/src/x.ts', "export const load = () => import('@aegis/payments');"],
  ['agents require()s the PayPal server SDK', 'packages/agents/src/x.ts', "const sdk = require('@paypal/paypal-server-sdk');"],
  // nothing a model produces reaches the code that moves money.
  ['payments imports agents', 'packages/payments/src/x.ts', "import { parseMandate } from '@aegis/agents';"],
  // layering.
  ['core imports db', 'packages/core/src/x.ts', "import { withTx } from '@aegis/db';"],
  ['db imports payments', 'packages/db/src/x.ts', "import { capture } from '@aegis/payments';"],
  ['db imports gatekeeper', 'packages/db/src/x.ts', "import { evaluate } from '@aegis/gatekeeper';"],
  ['jobs imports db', 'packages/jobs/src/x.ts', "import { withTx } from '@aegis/db';"],
  // the gatekeeper is pure and imports only core.
  ['gatekeeper imports db', 'packages/gatekeeper/src/x.ts', "import { withTx } from '@aegis/db';"],
  ['gatekeeper imports a third-party package', 'packages/gatekeeper/src/x.ts', "import { z } from 'zod';"],
  ['gatekeeper imports a node builtin', 'packages/gatekeeper/src/x.ts', "import { readFileSync } from 'node:fs';"],
  ['gatekeeper reads the clock (Date.now)', 'packages/gatekeeper/src/x.ts', 'export const t = () => Date.now();'],
  ['gatekeeper reads the clock (new Date())', 'packages/gatekeeper/src/x.ts', 'export const t = () => new Date();'],
  ['gatekeeper reads the clock (Date())', 'packages/gatekeeper/src/x.ts', 'export const t = () => Date();'],
  ['gatekeeper uses randomness', 'packages/gatekeeper/src/x.ts', 'export const t = () => Math.random();'],
  ['gatekeeper does I/O (fetch)', 'packages/gatekeeper/src/x.ts', "export const t = () => fetch('https://example.com');"],
  ['gatekeeper reads the environment', 'packages/gatekeeper/src/x.ts', 'export const t = () => process.env.X;'],
  // the browser bundle never pulls in server code.
  ['web imports a server package', 'apps/web/src/x.tsx', "import { withTx } from '@aegis/db';\nexport const A = () => <div />;"],
  ['web imports the PayPal server SDK', 'apps/web/src/x.ts', "import { Client } from '@paypal/paypal-server-sdk';"],
  // only payments talks to PayPal's API hosts.
  ['api calls a PayPal API host', 'apps/api/src/x.ts', "export const t = () => fetch('https://api-m.sandbox.paypal.com/v2/checkout/orders');"],
  ['worker builds a PayPal API URL in a template', 'apps/worker/src/x.ts', 'export const u = (id: string) => `https://api-m.paypal.com/v2/${id}`;'],
  ['agents hardcodes a PayPal API host', 'packages/agents/src/x.ts', "export const u = 'https://api-m.sandbox.paypal.com';"],
];

const allowed: Array<[string, string, string]> = [
  ['agents imports core', 'packages/agents/src/x.ts', "import { usd } from '@aegis/core';"],
  ['agents imports db', 'packages/agents/src/x.ts', "import { getOrder } from '@aegis/db';"],
  ['agents imports the agent toolkit (read tools)', 'packages/agents/src/x.ts', "import { x } from '@paypal/agent-toolkit/ai-sdk';"],
  ['payments imports core and db', 'packages/payments/src/x.ts', "import { usd } from '@aegis/core';\nimport { withTx } from '@aegis/db';"],
  ['payments uses the PayPal server SDK and its own hosts', 'packages/payments/src/x.ts', "import { Client } from '@paypal/paypal-server-sdk';\nexport const h = 'https://api-m.sandbox.paypal.com';"],
  ['db imports core', 'packages/db/src/x.ts', "import { DomainError } from '@aegis/core';"],
  ['gatekeeper imports core and relative files', 'packages/gatekeeper/src/x.ts', "import { sha256Hex } from '@aegis/core';\nimport { dateMs } from './rules.js';"],
  ['gatekeeper formats a passed-in timestamp', 'packages/gatekeeper/src/x.ts', 'export const f = (ms: number) => new Date(ms).toISOString();'],
  ['api imports every package', 'apps/api/src/x.ts', "import { createHold } from '@aegis/payments';\nimport { parseMandate } from '@aegis/agents';\nimport { evaluate } from '@aegis/gatekeeper';"],
  ['web imports react and the PayPal browser SDK', 'apps/web/src/x.tsx', "import { useState } from 'react';\nexport const load = () => import('@paypal/paypal-js/sdk-v6');\nexport const A = () => <div>{useState(0)[0]}</div>;"],
];

describe('architecture boundaries (pnpm lint)', () => {
  it.each(violations)('flags: %s', async (_name, file, code) => {
    const hits = await lint(file, code);
    expect(hits.length).toBeGreaterThan(0);
  });

  it.each(allowed)('allows: %s', async (_name, file, code) => {
    expect(await lint(file, code)).toEqual([]);
  });
});
