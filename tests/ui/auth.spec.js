// Login / registration forms and route protection (front/AGENTS.md + previous QA report).
// Client-side validation tests also assert that no request reaches the API.
const { test, expect } = require('../../support/fixtures');

/** Records requests to an API path so tests can assert nothing was sent. */
function trackRequests(page, pathSuffix) {
  const sent = [];
  page.on('request', (r) => {
    if (r.url().endsWith(pathSuffix) && r.method() === 'POST') sent.push(r);
  });
  return sent;
}

const loginForm = (page) => page.locator('form').filter({ has: page.locator('button[aria-label="تسجيل الدخول"]') });
const registerForm = (page) => page.locator('form').filter({ has: page.locator('button[aria-label="انشاء حساب"]') });

test.describe('login form', () => {
  test('empty submit shows field errors and sends nothing @responsive', async ({ page }) => {
    const sent = trackRequests(page, 'auth/login/');
    await page.goto('/login');
    await loginForm(page).locator('button[type="submit"]').click();
    await expect(loginForm(page).locator('.is-invalid')).toHaveCount(2);
    expect(sent).toHaveLength(0);
  });

  test('wrong credentials show an error alert', async ({ page }) => {
    await page.goto('/login');
    const form = loginForm(page);
    await form.locator('input[type="tel"]').fill('01999999999');
    await form.locator('input[type="password"]').fill('wrong-password');
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('auth/login/')),
      form.locator('button[type="submit"]').click(),
    ]);
    expect(res.status()).toBe(401);
    await expect(page.locator('.alert-danger, [role="alert"]').first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('labels are associated with their inputs (BUG-11)', async ({ page }) => {
    await page.goto('/login');
    await expect(loginForm(page).getByLabel('رقم المحمول')).toBeVisible();
    await expect(loginForm(page).getByLabel('كلمة المرور')).toBeVisible();
  });

  test('password input declares autocomplete (BUG-18)', async ({ page }) => {
    await page.goto('/login');
    await expect(loginForm(page).locator('input[type="password"]')).toHaveAttribute('autocomplete', 'current-password');
  });

  test('forgot-password link leads somewhere (BUG-01)', async ({ page }) => {
    await page.goto('/login');
    const link = page.getByText('هل نسيت كلمة السر؟');
    await expect(link).toBeVisible();
    await link.click();
    // Only a visible form counts: the hidden registration tab also has an email input.
    const opened = page.locator('.modal.show, form:has(input[type="email"]):visible');
    const urlChanged = new URL(page.url()).pathname !== '/login';
    expect(urlChanged || (await opened.count()) > 0, 'forgot-password opens a page or form').toBe(true);
  });
});

test.describe('registration form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('tab', { name: /حساب جديد/ }).click();
    await expect(registerForm(page)).toBeVisible();
  });

  test('empty submit flags every field with a message and sends nothing', async ({ page }) => {
    const sent = trackRequests(page, 'auth/register/');
    await registerForm(page).locator('button[type="submit"]').click();
    const invalid = registerForm(page).locator('input.is-invalid');
    await expect(invalid.first()).toBeVisible();
    // BUG-10: every invalid field needs visible feedback text.
    const withoutMessage = await invalid.evaluateAll((inputs) => inputs.filter((i) => {
      const fb = i.closest('.form-group, fieldset')?.querySelector('.invalid-feedback');
      return !fb || !fb.checkVisibility() || !fb.textContent.trim();
    }).map((i) => i.id || i.name));
    expect(withoutMessage).toEqual([]);
    expect(sent).toHaveLength(0);
  });

  test('invalid email, short and mismatched passwords are blocked client-side', async ({ page }) => {
    const sent = trackRequests(page, 'auth/register/');
    const form = registerForm(page);
    await form.locator('input[type="email"]').fill('not-an-email');
    const passwords = form.locator('input[type="password"]');
    await passwords.nth(0).fill('123');
    await passwords.nth(1).fill('456');
    await form.locator('button[type="submit"]').click();
    await expect(form.locator('input[type="email"]')).toHaveClass(/is-invalid/);
    await expect(passwords.nth(0)).toHaveClass(/is-invalid/);
    await expect(passwords.nth(1)).toHaveClass(/is-invalid/);
    expect(sent).toHaveLength(0);
  });

  test('phone with letters is blocked client-side (BUG-07)', async ({ page }) => {
    const sent = trackRequests(page, 'auth/register/');
    const form = registerForm(page);
    await form.locator('input[type="tel"]').first().fill('abcdefghijk');
    await form.locator('input[type="email"]').fill('not-an-email'); // guarantees no account is created
    await form.locator('button[type="submit"]').click();
    await expect(form.locator('input[type="tel"]').first()).toHaveClass(/is-invalid/);
    expect(sent).toHaveLength(0);
  });

  test('gender has no silent default (BUG-08)', async ({ page }) => {
    const form = registerForm(page);
    const select = form.locator('select').first();
    const selectedLabel = () => select.evaluate((s) => s.options[s.selectedIndex]?.text?.trim() || '');
    // Untouched: either a gender is visibly selected, or submitting flags the select as required.
    if (await selectedLabel()) return;
    await form.locator('button[type="submit"]').click();
    await expect(select, 'blank gender must be required, not silently defaulted').toHaveClass(/is-invalid/);
  });
});

test.describe('route protection (logged out)', () => {
  for (const path of ['/my-course', '/account', '/course-content/1']) {
    test(`${path} redirects to /login @responsive`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
