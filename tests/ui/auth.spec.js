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
    await form.locator('#admin-edit-username').fill('01999999999');
    await form.locator('input[type="password"]').fill('wrong-password');
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('auth/login/')),
      form.locator('button[type="submit"]').click(),
    ]);
    expect(res.status()).toBe(401);
    await expect(page.locator('.alert-danger, [role="alert"]').first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('login field accepts an email as well as a phone number', async ({ page }) => {
    await page.route('**/auth/login/', (route) => route.fulfill({
      status: 401, contentType: 'application/json', body: '{"success":false,"code":"invalid_credentials","errors":{}}',
    }));
    const sent = [];
    page.on('request', (r) => r.url().endsWith('auth/login/') && sent.push(r.postDataJSON()));
    await page.goto('/login');
    const form = loginForm(page);
    await form.locator('#admin-edit-username').fill('someone@example.com');
    await form.locator('input[type="password"]').fill('x');
    await form.locator('button[type="submit"]').click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].username).toBe('someone@example.com');
    await expect(form.locator('#admin-edit-username')).not.toHaveClass(/is-invalid/);
  });

  test('wrong-credentials alert does not push the form down', async ({ page }) => {
    await page.route('**/auth/login/', (route) => route.fulfill({
      status: 401, contentType: 'application/json', body: '{"success":false,"code":"invalid_credentials","errors":{}}',
    }));
    await page.goto('/login');
    const form = loginForm(page);
    const input = form.locator('#admin-edit-username');
    const before = (await input.boundingBox()).y;
    await input.fill('01999999999');
    await form.locator('input[type="password"]').fill('wrong');
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('.alert-danger')).toBeVisible();
    const after = (await input.boundingBox()).y;
    expect(Math.abs(after - before)).toBeLessThan(2);
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

  test('phone has a country-code picker defaulting to +20', async ({ page }) => {
    const form = registerForm(page);
    const codes = form.locator('select[aria-label="رمز الدولة"]');
    await expect(codes).toHaveCount(2); // phone + parent phone
    await expect(codes.first()).toHaveValue('+20');
  });

  test('registration sends phones as country code + number without the local 0', async ({ page }) => {
    // Stubbed: no account is created on the target.
    let body;
    await page.route('**/auth/register/', (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({ status: 400, contentType: 'application/json', body: '{"success":false,"errors":{}}' });
    });
    const form = registerForm(page);
    const tels = form.locator('input[type="tel"]');
    await form.locator('select[aria-label="رمز الدولة"]').first().selectOption('+966');
    await tels.nth(0).fill('0512345678');
    await tels.nth(1).fill('01000000001'); // parent phone keeps the +20 default
    await form.locator('input[placeholder="الاسم الأول"]').fill('Qa');
    await form.locator('input[placeholder="اسم العائلة"]').fill('Tester');
    await form.locator('input[type="email"]').fill('qa.phone@mailinator.com');
    const passwords = form.locator('input[type="password"]');
    await passwords.nth(0).fill('Qa-Passw0rd!');
    await passwords.nth(1).fill('Qa-Passw0rd!');
    await Promise.all([
      page.waitForRequest('**/auth/register/'),
      form.locator('button[type="submit"]').click(),
    ]);
    expect(body.phone).toBe('+966512345678');
    expect(body.parent_phone).toBe('+201000000001');
  });

  test('parent phone must differ from the student phone', async ({ page }) => {
    const sent = trackRequests(page, 'auth/register/');
    const form = registerForm(page);
    const tels = form.locator('input[type="tel"]');
    await tels.nth(0).fill('01000000000');
    await tels.nth(1).fill('01000000000');
    await form.locator('button[type="submit"]').click();
    await expect(tels.nth(1)).toHaveClass(/is-invalid/);
    expect(sent).toHaveLength(0);
  });

  test('form is cleared after a successful registration', async ({ page }) => {
    await page.route('**/auth/register/', (route) => route.fulfill({
      status: 201, contentType: 'application/json', body: '{"success":true,"data":{}}',
    }));
    const form = registerForm(page);
    const tels = form.locator('input[type="tel"]');
    await form.locator('select[aria-label="رمز الدولة"]').first().selectOption('+966');
    await tels.nth(0).fill('0512345678');
    await tels.nth(1).fill('01000000001');
    await form.locator('input[placeholder="الاسم الأول"]').fill('Qa');
    await form.locator('input[placeholder="اسم العائلة"]').fill('Tester');
    await form.locator('input[type="email"]').fill('qa.reset@mailinator.com');
    const passwords = form.locator('input[type="password"]');
    await passwords.nth(0).fill('Qa-Passw0rd!');
    await passwords.nth(1).fill('Qa-Passw0rd!');
    await form.locator('button[type="submit"]').click();
    await expect(tels.nth(0)).toHaveValue('');
    await expect(tels.nth(1)).toHaveValue('');
    await expect(form.locator('input[placeholder="الاسم الأول"]')).toHaveValue('');
    await expect(form.locator('input[type="email"]')).toHaveValue('');
    await expect(passwords.nth(0)).toHaveValue('');
    await expect(form.locator('select[aria-label="رمز الدولة"]').first()).toHaveValue('+20');
    await expect(form.locator('.is-invalid')).toHaveCount(0);
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
