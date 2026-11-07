import { expect, test } from '@playwright/test';

/**
 * Real browser, real server, real PayPal sandbox, real model. These tests never approve a PayPal hold (that needs a
 * sandbox buyer's login) and never reset the demo, so they are safe to run against the hosted demo.
 */

test('serves the page and connects the live stream', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/AegisPay/);
  await expect(page.getByTestId('stream-status')).toContainText('Live');
  await expect(page.getByTestId('mandate-strip')).toBeVisible();
  await expect(page.getByTestId('grid')).toBeVisible();
});

test('the API stays behind its session, and the page itself does not need one', async ({ request, page }) => {
  // A client with no cookies: the page and the health check are public, the data is not.
  expect((await request.get('/healthz')).ok()).toBe(true);
  const denied = await request.get('/api/orders');
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error.code).toBeTruthy();

  // Loading the page opens a session; with it, the same route answers.
  await page.goto('/');
  await expect(page.getByTestId('stream-status')).toContainText('Live');
  expect((await page.request.get('/api/orders')).ok()).toBe(true);
});

test('the audit hash chain verifies', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('stream-status')).toContainText('Live');
  const r = await page.request.get('/api/audit/verify');
  expect(r.ok()).toBe(true);
  expect((await r.json()).ok).toBe(true);
});

test('the live self-check reports real probes', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('selfcheck-dot').click();
  // Probes are real calls (database, PayPal token, webhook, order, catalog), so there is more than one row.
  await expect(page.locator('[data-testid^="probe-"]')).not.toHaveCount(0);
  expect(await page.locator('[data-testid^="probe-"]').count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId('probe-db').locator('.dot-green')).toBeVisible();
});

test('Judge Mode moves only the app clock, and puts it back', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByTestId('judge-banner');
  const judgeOn = await banner.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false);
  test.skip(!judgeOn, 'Judge Mode is off on this server');

  const realTime = page.getByRole('button', { name: 'Real time' });
  try {
    await page.getByTestId('clock-plus1').click();
    await expect(banner).toContainText('+1d (simulated)');
    await realTime.click();
    await expect(banner).toContainText('Clock real');
  } finally {
    // Never leave the shared demo clock moved.
    if (await realTime.isEnabled().catch(() => false)) await realTime.click();
  }
});

test('free text becomes a reviewable mandate draft (the model drafts, a human confirms)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Example' }).click();
  await page.getByTestId('mandate-parse').click();

  const chips = page.getByTestId('mandate-chips');
  const noModel = page.getByText(/No language model is configured/);
  await expect(chips.or(noModel)).toBeVisible({ timeout: 60_000 });
  test.skip(await noModel.isVisible(), 'No language model key on this server');

  // "at most 15 dollars" is 1500 minor units; the draft is editable and nothing is saved until the human confirms.
  await expect(page.getByLabel(/Ceiling per unit/)).toHaveValue('1500');
  await expect(page.getByTestId('mandate-confirm')).toBeEnabled();
  await expect(page.getByTestId('proposals')).toHaveCount(0);
});
