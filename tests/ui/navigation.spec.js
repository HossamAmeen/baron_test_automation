// Global navigation, routing, 404, staging badge and layout (front/AGENTS.md).
const { test, expect, env } = require('../../support/fixtures');

const PUBLIC_PAGES = ['/', '/courses', '/aboutus', '/contactus', '/login'];

test.describe('navigation', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} loads without JS errors @responsive`, async ({ page, consoleErrors }) => {
      const res = await page.goto(path);
      expect(res.status()).toBe(200); // Nginx SPA fallback serves index.html for every route
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveTitle(/.+/);
      expect(consoleErrors.filter((e) => !/autocomplete/i.test(e))).toEqual([]);
    });

    test(`${path} has no horizontal scroll @responsive`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('page is right-to-left Arabic by default', async ({ page }) => {
    await page.goto('/');
    const dir = await page.evaluate(() => getComputedStyle(document.body).direction);
    expect(dir).toBe('rtl');
  });

  const NAV = [
    ['المواد', /\/courses$/],
    ['من نحن', /\/aboutus$/],
    ['تواصل معنا', /\/contactus$/],
    ['الرئيسية', /\/$/],
  ];

  test('navbar links route to their pages', async ({ page }) => {
    await page.goto('/aboutus');
    for (const [label, url] of NAV) {
      await page.locator('.navBar').getByText(label, { exact: true }).first().click();
      await expect(page).toHaveURL(url);
    }
  });

  test('navbar links have real hrefs (BUG-17)', async ({ page }) => {
    await page.goto('/');
    for (const [label] of NAV) {
      const href = await page.locator('.navBar a').filter({ hasText: label }).first().getAttribute('href');
      expect(href, `href of ${label}`).not.toBe('#');
    }
  });

  test('version badge shows "test -" only on staging hosts', async ({ page }) => {
    await page.goto('/');
    const badge = page.locator('.brand-version').first();
    await expect(badge).toContainText(/V\s*\d/);
    if (env.isStaging) await expect(badge).toContainText('test -');
    else await expect(badge).not.toContainText('test');
  });

  test('unknown routes render the 404 page with a way home @responsive', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-qa');
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
    await page.getByRole('button', { name: 'العودة للصفحة الرئيسية' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('landing page', () => {
  test('renders sliders, reviews and contact data from the API', async ({ page, api }) => {
    const [sliders, reviews, config] = await Promise.all(
      ['configuration/sliders/', 'configuration/reviews/', 'configuration/configuration/'].map(async (p) => (await (await api.get(p)).json()).data),
    );
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    if (sliders.length) {
      const srcs = await page.locator('img').evaluateAll((imgs) => imgs.map((i) => i.currentSrc || i.src));
      expect(srcs.some((src) => sliders.some((s) => src === s.image)), 'a slider image is rendered').toBe(true);
    }
    if (reviews.length) await expect(page.getByText(reviews[0].name).first()).toBeAttached();
    // Footer renders the WhatsApp link from the configuration record.
    if (config.whatsapp_number) {
      const digits = String(config.whatsapp_number).replaceAll(' ', '');
      await expect(page.locator(`a[href="https://wa.me/${digits}"]`).first()).toBeAttached();
    }
  });

  test('images are not broken @responsive', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState('networkidle');
    const broken = await page.locator('img').evaluateAll((imgs) =>
      imgs.filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src));
    expect(broken).toEqual([]);
  });

  test('images have alt text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const missing = await page.locator('img:not([alt]), img[alt=""]').evaluateAll((imgs) => imgs.map((i) => i.src));
    expect(missing).toEqual([]);
  });
});
