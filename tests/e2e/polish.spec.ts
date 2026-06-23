import { test, expect } from '@playwright/test';

test.describe('tags, rss and 404', () => {
  test('tags index lists tags and links to a tag page', async ({ page }) => {
    await page.goto('/tags');
    const link = page.getByRole('link', { name: /vite/ });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/tags\/vite$/);
    const card = page.getByRole('article').filter({ hasText: 'NØVA CTF Challenge' });
    await expect(card).toBeVisible();
  });

  test('serves an RSS feed with the writeup', async ({ request }) => {
    const res = await request.get('/rss.xml');
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toContain('xml');
    const body = await res.text();
    expect(body).toContain('<rss');
    expect(body).toContain('NØVA CTF Challenge');
  });

  test('renders a styled 404 page for unknown routes', async ({ page }) => {
    const res = await page.goto('/this/does/not/exist');
    expect(res?.status()).toBe(404);
    await expect(page.getByText('No such file or directory')).toBeVisible();
    await expect(page.getByRole('main').getByText('404', { exact: true })).toBeVisible();
  });
});
