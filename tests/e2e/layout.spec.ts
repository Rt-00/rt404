import { test, expect } from '@playwright/test';

test.describe('terminal layout', () => {
  test('renders header brand, nav and footer', async ({ page }) => {
    await page.goto('/');

    // Brand
    await expect(page.getByRole('banner').getByText('rt', { exact: true })).toBeVisible();

    // Nav commands
    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    await expect(nav.getByRole('link', { name: 'ls platforms/' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'cd archive/' })).toBeVisible();

    // Footer
    await expect(page.getByRole('contentinfo')).toContainText('rt404');
  });

  test('applies the dark terminal background', async ({ page }) => {
    await page.goto('/');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // #0a0f0d -> rgb(10, 15, 13)
    expect(bg).toBe('rgb(10, 15, 13)');
  });

  test('uses a monospace font on the body', async ({ page }) => {
    await page.goto('/');
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(family.toLowerCase()).toContain('jetbrains mono');
  });
});
