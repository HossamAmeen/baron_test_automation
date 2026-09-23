// Contact-us page (front Contactus.vue → POST configuration/contact-us/).
const { test, expect, env } = require('../../support/fixtures');

const submitButton = (page) => page.getByRole('button', { name: 'ارسال الرسالة' });

test.describe('contact us', () => {
  test('shows contact details from the configuration API', async ({ page, api }) => {
    const config = await (await api.get('configuration/configuration/')).json();
    await page.goto('/contactus');
    await expect(page.getByText(config.email).first()).toBeVisible();
  });

  test('empty submit shows field errors and sends nothing @responsive', async ({ page }) => {
    const sent = [];
    page.on('request', (r) => r.url().endsWith('configuration/contact-us/') && r.method() === 'POST' && sent.push(r));
    await page.goto('/contactus');
    await submitButton(page).click();
    await expect(page.locator('form .is-invalid').first()).toBeVisible();
    expect(sent).toHaveLength(0);
  });

  test('valid submission succeeds (ALLOW_WRITES)', async ({ page }) => {
    test.skip(!env.allowWrites, 'sends a real admin email; set ALLOW_WRITES=1');
    await page.goto('/contactus');
    await page.getByPlaceholder('الاسم الاول').fill('QA');
    await page.getByPlaceholder('اسم العائلة').fill('Automation');
    await page.getByPlaceholder('رقم الهاتف المحمول').fill('01000000000');
    await page.getByPlaceholder('عنوان الرسالة').fill('QA automated test - please ignore');
    await page.getByPlaceholder('الرسالة', { exact: true }).fill(`Automated e2e run ${new Date().toISOString()}`);
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('configuration/contact-us/')),
      submitButton(page).click(),
    ]);
    expect(res.status()).toBe(201);
    await expect(page.locator('.alert-success, [role="alert"]').first()).toBeVisible();
  });
});
