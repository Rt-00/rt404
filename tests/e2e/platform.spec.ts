import { test, expect } from '@playwright/test';

test.describe('platform grouping', () => {
  test('platform index lists HackingClub with a count', async ({ page }) => {
    await page.goto('/platform');

    const link = page.getByRole('link').filter({ hasText: 'HackingClub' });
    await expect(link).toBeVisible();
    // Robust to the actual number of HackingClub writeups (singular/plural).
    await expect(link).toContainText(/\d+ writeups?/);

    await link.click();
    await expect(page).toHaveURL(/\/platform\/hackingclub$/);
  });

  test('platform page shows its writeups', async ({ page }) => {
    await page.goto('/platform/hackingclub');

    await expect(
      page.getByRole('heading', { level: 1, name: /HackingClub/ }),
    ).toBeVisible();

    const card = page.getByRole('article').filter({ hasText: 'NØVA CTF Challenge' });
    await expect(card).toBeVisible();
  });
});
