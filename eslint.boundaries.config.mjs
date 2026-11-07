import babelParser from '@babel/eslint-parser';

/**
 * Architecture boundaries, enforced in CI (`pnpm lint`). "Agents cannot pay" is a checked property of the codebase.
 * The rules mirror the dependency table in the technical design (docs/spec) and the "Boundaries / Time / PayPal POSTs"
 * conventions. Only boundary rules are on here: this is not a style linter.
 *
 * Built on ESLint's own `no-restricted-imports` / `no-restricted-syntax` rather than eslint-plugin-boundaries (see
 * docs/DEVIATIONS.md): the parser is Babel because TypeScript 7 no longer ships the JS compiler API that typescript-eslint
 * needs. Static imports, `import type`, dynamic `import()` and `require()` are all covered.
 *
 * This file is passed explicitly (`eslint -c eslint.boundaries.config.mjs`), so a style config can later live in
 * `eslint.config.mjs` without the two colliding.
 */

const IGNORES = [
  '**/node_modules/**',
  '**/dist/**',
  'apps/api/public/**',
  'coverage/**',
  'graphify-out/**',
  'test-results/**',
  'e2e/playwright-report/**',
  'scripts/spike/**',
  '.claude/**',
];

/** A regex over an import specifier, written once and used for static imports, `import()` and `require()`. */
export function banImports(regex, message) {
  return { regex, message };
}

export function boundaryRules({ imports = [], paypalHost = false, pure = false }) {
  const rules = {};
  const syntax = [];

  if (imports.length > 0) {
    rules['no-restricted-imports'] = ['error', { patterns: imports.map((i) => ({ regex: i.regex, message: i.message })) }];
    for (const i of imports) {
      // esquery regex literals: forward slashes must be escaped.
      const re = i.regex.replace(/\//g, '\\/');
      syntax.push({ selector: `ImportExpression > Literal[value=/${re}/]`, message: i.message });
      syntax.push({ selector: `CallExpression[callee.name='require'] > Literal[value=/${re}/]`, message: i.message });
    }
  }

  if (paypalHost) {
    const message = 'PayPal API hosts are only called from packages/payments (request ids, retries and audit live in payments/src/call.ts).';
    syntax.push({ selector: 'Literal[value=/api-m\\.(sandbox\\.)?paypal\\.com/]', message });
    syntax.push({ selector: 'TemplateElement[value.raw=/api-m\\.(sandbox\\.)?paypal\\.com/]', message });
  }

  if (pure) {
    const why = 'The gatekeeper is a pure function: no clock, no I/O, no randomness. Time is passed in.';
    rules['no-restricted-properties'] = [
      'error',
      { object: 'Date', property: 'now', message: why },
      { object: 'Math', property: 'random', message: why },
      { object: 'performance', property: 'now', message: why },
    ];
    rules['no-restricted-globals'] = [
      'error',
      ...['fetch', 'process', 'setTimeout', 'setInterval', 'performance', 'XMLHttpRequest', 'WebSocket'].map((name) => ({ name, message: why })),
    ];
    // `new Date(ms)` only formats a value that was passed in; `new Date()` and `Date()` read the clock.
    syntax.push({ selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: why });
    syntax.push({ selector: "CallExpression[callee.name='Date']", message: why });
  }

  if (syntax.length > 0) rules['no-restricted-syntax'] = ['error', ...syntax];
  return rules;
}

const tsParser = (isTSX) => ({
  parser: babelParser,
  sourceType: 'module',
  parserOptions: {
    requireConfigFile: false,
    babelOptions: {
      babelrc: false,
      configFile: false,
      // Parsing only: no transform runs, so the syntax plugins are all that is needed.
      parserOpts: { plugins: isTSX ? ['typescript', 'jsx'] : ['typescript'] },
    },
  },
});

const NOT_PAYMENTS = 'The agents package may not import payments: agents propose, they never touch money.';
const NOT_PAYPAL_SDK = 'The agents package may not use the PayPal server SDK: it can create holds and capture money.';

/** The same file glob can only carry one config object per rule, so each package gets exactly one entry here. */
export default [
  { ignores: IGNORES },

  // TypeScript / TSX parsing for everything we lint.
  { files: ['**/*.ts', '**/*.mts', '**/*.cts'], languageOptions: tsParser(false) },
  { files: ['**/*.tsx'], languageOptions: tsParser(true) },
  { files: ['**/*.mjs', '**/*.js'], languageOptions: { sourceType: 'module' } },

  // core: the root of the graph. Imports nothing internal.
  {
    files: ['packages/core/src/**'],
    rules: boundaryRules({
      imports: [banImports('^@aegis/', 'core is the root of the dependency graph and imports no other @aegis package.')],
      paypalHost: true,
    }),
  },

  // gatekeeper: pure policy engine. Imports only core, and no clock, network or randomness.
  {
    files: ['packages/gatekeeper/src/**'],
    rules: boundaryRules({
      imports: [banImports('^(?!\\.|@aegis/core(/|$)).', 'gatekeeper imports only @aegis/core (and relative files). Anything else would put I/O or a clock on the safety path.')],
      paypalHost: true,
      pure: true,
    }),
  },

  // db: depends on core only (the gatekeeper's Mandate shape is mirrored structurally, never imported).
  {
    files: ['packages/db/src/**'],
    rules: boundaryRules({
      imports: [banImports('^@aegis/(?!core(/|$))', 'db depends on @aegis/core only. Money calls live in payments, policy in gatekeeper.')],
      paypalHost: true,
    }),
  },

  // payments: may import core and db. Never agents.
  {
    files: ['packages/payments/src/**'],
    rules: boundaryRules({
      imports: [banImports('^@aegis/agents(/|$)', 'payments may not import agents: nothing a model produces reaches the code that moves money.')],
    }),
  },

  // agents: may import core and db (read). Never payments, never the PayPal server SDK.
  {
    files: ['packages/agents/src/**'],
    rules: boundaryRules({
      imports: [
        banImports('^@aegis/payments(/|$)', NOT_PAYMENTS),
        banImports('^@paypal/paypal-server-sdk(/|$)', NOT_PAYPAL_SDK),
      ],
      paypalHost: true,
    }),
  },

  // jobs: queue names, payload schemas and the sender. Core only.
  {
    files: ['packages/jobs/src/**'],
    rules: boundaryRules({
      imports: [banImports('^@aegis/(?!core(/|$))', 'jobs depends on @aegis/core only.')],
      paypalHost: true,
    }),
  },

  // api / worker: may import any package, but only payments talks to PayPal's API hosts.
  {
    files: ['apps/api/src/**', 'apps/worker/src/**'],
    rules: boundaryRules({ paypalHost: true }),
  },

  // web: the browser bundle must not pull in server packages or the PayPal server SDK.
  {
    files: ['apps/web/src/**'],
    rules: boundaryRules({
      imports: [
        banImports('^@aegis/', 'The browser bundle imports no server package.'),
        banImports('^@paypal/paypal-server-sdk(/|$)', 'The browser only ever receives the public PayPal client id.'),
      ],
    }),
  },
];
