import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests drive the real app in a real browser against a RUNNING instance: the local one (`pnpm build`,
 * `pnpm start:api`, `pnpm start:worker`) or the hosted demo. Nothing is mocked. Point it elsewhere with E2E_BASE_URL.
 *
 *   E2E_BASE_URL=https://aegispay-w12c.onrender.com pnpm e2e
 *
 * E2E_CHANNEL=chrome (or msedge) uses an installed browser instead of Playwright's own download.
 */
const channel = process.env.E2E_CHANNEL?.trim();

export default defineConfig({
  testDir: './tests',
  // One worker: the tests share one server-side demo clock and one demo dataset.
  workers: 1,
  fullyParallel: false,
  // A free Render service can take about a minute to wake after idling.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL?.trim() || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(channel ? { channel } : {}),
  },
});
