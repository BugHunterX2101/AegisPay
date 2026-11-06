import { defineConfig } from 'vitest/config';

/**
 * Live contract tests against the REAL PayPal sandbox (`pnpm test:sandbox`). Not part of `pnpm test`, because they
 * need network access and sandbox credentials in `.env`. Reads only unless a test file says otherwise and the kill
 * switch (PAYPAL_WRITES_ENABLED=true) is on.
 */
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.sandbox.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 90_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
