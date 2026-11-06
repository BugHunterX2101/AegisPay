import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.sandbox.test.ts', '**/e2e/**'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/index.ts', '**/*.d.ts'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: {
        // TDD §5: 100% branch coverage on the gatekeeper, enforced in CI.
        'packages/gatekeeper/src/**': { branches: 100, lines: 100, functions: 100, statements: 100 },
      },
    },
  },
});
