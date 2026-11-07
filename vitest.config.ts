import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.sandbox.test.ts', '**/e2e/**'],
    testTimeout: 30_000,
    // Every file shares one Postgres. Each gets its own schema, but LISTEN/NOTIFY is per-database, so files running
    // at the same time hear each other's audit notifications. Run files one at a time; tests inside a file still can.
    fileParallelism: false,
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
