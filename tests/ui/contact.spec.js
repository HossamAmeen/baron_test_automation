// Contact-us page (front Contactus.vue → POST configuration/contact-us/).
const { test, expect, env } = require('../../support/fixtures');

const submitButton = (page) => page.getByRole('button', { name: 'ارسال الرسالة' });

test.describe('contact us', () => {
  test('shows contact details from the configuration API', async ({ page, api }) => {
    const config = (await (await api.get('configuration/configuration/')).json()).data;
    await page.goto('/contactus');
    await expect(page.getByText(config.email).first()).toBeVisible();
  });

  test('every control has a programmatically associated label (BUG-32)', async ({ page }) => {
    await page.goto('/contactus');
    for (const id of ['admin-edit-first_name', 'admin-edit-last_name', 'admin-edit-phone', 'admin-edit-subject', 'admin-edit-description']) {
      await expect(page.locator(`label[for="${id}"]`), `label for #${id}`).toHaveCount(1);
    }
  });

  test('empty submit shows field errors and sends nothing @responsive', async ({ page }) => {
    const sent = [];
    page.on('request', (r) => r.url().endsWith('configuration/contact-us/') && r.method() === 'POST' && sent.push(r));
    await page.goto('/contactus');
    await submitButton(page).click();
    await expect(page.locator('form .is-invalid').first()).toBeVisible();
    expect(sent).toHaveLength(0);
  });

  test('invalid phone and a 1-character message are rejected client-side (BUG-22)', async ({ page }) => {
    const sent = [];
    page.on('request', (r) => r.url().endsWith('configuration/contact-us/') && r.method() === 'POST' && sent.push(r));
    await page.goto('/contactus');
    await page.locator('#admin-edit-first_name').fill('QA');
    await page.locator('#admin-edit-last_name').fill('Automation');
    await page.locator('input[type="tel"]').fill('abc');
    await page.locator('#admin-edit-subject').fill('QA automated test');
    await page.locator('#admin-edit-description').fill('x');
    await submitButton(page).click();
    await page.waitForTimeout(500); // give a client-side validator a chance to block the request
    expect(sent, 'contact-us was submitted with an invalid phone and a 1-char message').toHaveLength(0);
  });

  test('phone has a country-code picker and sends it with the number', async ({ page }) => {
    let body;
    await page.route('**/configuration/contact-us/', (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{"success":true,"data":{}}' });
    });
    await page.goto('/contactus');
    await page.locator('#admin-edit-first_name').fill('QA');
    await page.locator('#admin-edit-last_name').fill('Automation');
    await page.locator('select[aria-label="رمز الدولة"]').selectOption('+966');
    await page.locator('input[type="tel"]').fill('0512345678');
    await page.locator('#admin-edit-subject').fill('subject');
    await page.locator('#admin-edit-description').fill('message');
    await Promise.all([page.waitForRequest('**/contact-us/'), submitButton(page).click()]);
    expect(body.phone).toBe('+966512345678');
    // Form (including the phone picker) is cleared after a successful send.
    await expect(page.locator('input[type="tel"]')).toHaveValue('');
    await expect(page.locator('select[aria-label="رمز الدولة"]')).toHaveValue('+20');
  });

  test('valid submission succeeds (ALLOW_WRITES)', async ({ page }) => {
    test.skip(!env.allowWrites, 'sends a real admin email; set ALLOW_WRITES=1');
    await page.goto('/contactus');
    await page.getByPlaceholder('الاسم الاول').fill('QA');
    await page.getByPlaceholder('اسم العائلة').fill('Automation');
    await page.locator('input[type="tel"]').fill('01000000000');
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
