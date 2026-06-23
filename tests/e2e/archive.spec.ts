import { test, expect } from '@playwright/test';

test.describe('archive by month/year', () => {
  test('archive index lists the year and month', async ({ page }) => {
    await page.goto('/archive');

    await expect(page.getByRole('heading', { level: 2, name: '2026' })).toBeVisible();

    const monthLink = page.getByRole('link', { name: /junho de 2026/i });
    await expect(monthLink).toBeVisible();
    await monthLink.click();
    await expect(page).toHaveURL(/\/archive\/2026\/06$/);
  });

  test('month page shows its writeups', async ({ page }) => {
    await page.goto('/archive/2026/06');

    await expect(
      page.getByRole('heading', { level: 1, name: /junho de 2026/i }),
    ).toBeVisible();

    const card = page.getByRole('article').filter({ hasText: 'NØVA CTF Challenge' });
    await expect(card).toBeVisible();
  });
});
