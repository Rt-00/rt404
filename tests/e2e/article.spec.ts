import { test, expect } from '@playwright/test';

const NOVA = '/writeups/hackingclub/nova';

test.describe('article page', () => {
  test('renders the Nova writeup with metadata header', async ({ page }) => {
    await page.goto(NOVA);

    const h1 = page.getByRole('heading', { level: 1, name: /NØVA CTF Challenge/ });
    await expect(h1).toBeVisible();
    // The "#" marker must be spaced from the title (regression: collapsed whitespace).
    await expect(h1).toHaveText(/^#\s+NØVA CTF Challenge$/);

    // Metadata header: platform badge present
    await expect(page.getByText('HackingClub').first()).toBeVisible();
  });

  test('never exposes the flag and shows a redacted bar instead', async ({ page }) => {
    await page.goto(NOVA);

    // The flag must not appear anywhere in the served HTML, including the body
    // code blocks and the base64 derivation. (The real flag never reaches the
    // source either — frontmatter carries a placeholder — so we assert the
    // placeholder and its base64 are both redacted.)
    const html = await page.content();
    expect(html).not.toContain('hackingclub{REDACTED}');
    expect(html).not.toContain('aGFja2luZ2NsdWJ7UkVEQUNURUR9');

    // The metadata header shows a blurred redacted bar...
    await expect(page.locator('.flag-redacted').first()).toBeVisible();
    // ...and the body occurrences are replaced by a censor bar.
    expect(html).toContain('█');
  });

  test('renders a table of contents from headings', async ({ page }) => {
    await page.goto(NOVA);
    const toc = page.getByRole('navigation', { name: 'Índice' });
    await expect(toc).toBeVisible();
    const link = toc.getByRole('link').first();
    await expect(link).toHaveAttribute('href', /^#/);
  });

  test('highlights code blocks via Shiki', async ({ page }) => {
    await page.goto(NOVA);
    const code = page.locator('pre.astro-code').first();
    await expect(code).toBeVisible();
    // Shiki sets an inline background color on the <pre>.
    await expect(code).toHaveAttribute('style', /background-color/);
  });

  test('TOC highlights the current section and updates on scroll', async ({ page }) => {
    await page.goto(NOVA);
    const toc = page.getByRole('navigation', { name: 'Índice' });
    const links = toc.locator('a.toc-link');

    // Position a section's heading inside the activation band (~120px from top).
    const activate = async (n: number) => {
      const slug = decodeURIComponent(
        (await links.nth(n).getAttribute('href'))!.slice(1),
      );
      await page.evaluate((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const y = el.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top: y, behavior: 'instant' });
      }, slug);
    };

    await activate(2);
    await expect(links.nth(2)).toHaveClass(/toc-active/);

    // Scrolling to another section moves the highlight there.
    await activate(6);
    await expect(links.nth(6)).toHaveClass(/toc-active/);
    await expect(links.nth(2)).not.toHaveClass(/toc-active/);
  });

  test('code inside <pre> has no inline-code padding (no first-line shift)', async ({
    page,
  }) => {
    await page.goto(NOVA);
    const style = await page
      .locator('pre.astro-code code')
      .first()
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return { paddingLeft: s.paddingLeft, background: s.backgroundColor };
      });
    expect(style.paddingLeft).toBe('0px');
    // No inline-code background box behind block code.
    expect(style.background).toBe('rgba(0, 0, 0, 0)');
  });
});
