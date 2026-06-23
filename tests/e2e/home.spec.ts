import { test, expect } from '@playwright/test';

test.describe('home / index', () => {
  test('lists the Nova writeup and links to it', async ({ page }) => {
    await page.goto('/');

    const card = page.getByRole('article').filter({ hasText: 'NØVA CTF Challenge' });
    await expect(card).toBeVisible();

    const link = card.getByRole('link', { name: /NØVA CTF Challenge/ });
    await expect(link).toHaveAttribute('href', /\/writeups\/hackingclub\/nova$/);

    await link.click();
    await expect(
      page.getByRole('heading', { level: 1, name: /NØVA CTF Challenge/ }),
    ).toBeVisible();
  });

  test('shows the writeups/platforms counters', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('writeups:')).toBeVisible();
    await expect(page.getByText('platforms:')).toBeVisible();
  });
});
