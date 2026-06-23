import { test, expect } from '@playwright/test';

test('home page responds without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  const response = await page.goto('/');
  expect(response?.ok()).toBeTruthy();
  expect(errors).toEqual([]);
});
