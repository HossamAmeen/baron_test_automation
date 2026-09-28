// Logged-in student flows. Skipped when no student session is available.
const { test, expect, env, useStudent } = require('../../support/fixtures');

useStudent(test);

test.describe('logged-in student', () => {
  test('navbar shows the account menu instead of login @responsive', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#dropdown-1').first()).toBeAttached();
  });

  test('/login redirects home when already logged in', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/$/);
  });

  test('my courses loads enrolled courses', async ({ page }) => {
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('users/student/courses/')),
      page.goto('/my-course'),
    ]);
    expect(res.status()).toBe(200);
    await expect(page).toHaveURL(/\/my-course/);
  });

  test('account page shows the profile from the API', async ({ page }) => {
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('auth/profile/') && r.request().method() === 'GET'),
      page.goto('/account'),
    ]);
    expect(res.status()).toBe(200);
    const profile = (await res.json()).data;
    await expect(page.getByText(profile.email).first()).toBeVisible();
  });

  test('change password form blocks a mismatch client-side', async ({ page }) => {
    const sent = [];
    page.on('request', (r) => r.url().endsWith('auth/change-password/') && sent.push(r));
    await page.goto('/account');
    await page.getByRole('button', { name: /كلمة المرور/ }).first().click();
    const inputs = page.locator('input[type="password"]');
    await inputs.nth(0).fill(env.student.password);
    await inputs.nth(1).fill('N3w-Passw0rd!');
    await inputs.nth(2).fill('Different-1!');
    await page.locator('button[type="submit"].btn-success').click();
    await expect(inputs.nth(2)).toHaveClass(/is-invalid/);
    expect(sent).toHaveLength(0);
  });

  test('course details offers subscribe or lessons, never the login CTA', async ({ page, catalog }) => {
    await page.goto(`/course/${catalog.courses[0].id}`);
    await expect(page.getByRole('button', { name: /اشترك الان|الدروس/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'تسجيل الدخول' })).toHaveCount(0);
  });

  test('checkout redirects to the hosted payment page (ALLOW_CHECKOUT)', async ({ page, catalog }) => {
    test.skip(!env.allowCheckout, 'opens a real XPay test-mode checkout; set ALLOW_CHECKOUT=1');
    const course = catalog.plainCourse || catalog.courses[0];
    await page.goto(`/course/${course.id}`);
    const subscribe = page.getByRole('button', { name: 'اشترك الان' });
    test.skip(!(await subscribe.isVisible()), 'student already owns this course');
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`payments/course/${course.id}/payment/`)),
      subscribe.click(),
    ]);
    expect([200, 201]).toContain(res.status());
    const { data } = await res.json();
    await page.waitForURL((url) => url.href.startsWith(new URL(data.iframe_url).origin), { timeout: 20_000 });
    // Stop here: never enter payment details.
  });
});

// Runs last and in its own browser context so the shared session file stays valid.
test.describe('logout', () => {
  test('clears the session and re-protects routes', async ({ browser }) => {
    const { STORAGE_STATE } = require('../../support/session');
    const context = await browser.newContext({ storageState: STORAGE_STATE });
    const page = await context.newPage();
    await page.goto('/');
    await page.locator('#dropdown-1').first().click();
    await page.getByText('تسجيل الخروج').first().click();
    await page.getByRole('button', { name: 'الخروج' }).click();
    await expect(page).toHaveURL(/\/login/);
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('vuex') || '{}').token);
    expect(token).toBeFalsy();
    await page.goto('/my-course');
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });
});
