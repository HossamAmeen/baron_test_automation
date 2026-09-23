// Logs the student in through the real UI once per run and saves the browser storage.
// Never fails the run: when there are no (valid) credentials, logged-in tests are skipped
// and tests/api/auth.spec.js reports the invalid credentials instead.
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { env } = require('../../support/env');
const { AUTH_DIR, STORAGE_STATE, writeSession } = require('../../support/session');

test('log in as the test student', async ({ page }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));

  if (!env.hasStudentCredentials) {
    writeSession({ ok: false, reason: 'BARON_STUDENT_USERNAME / BARON_STUDENT_PASSWORD not set' });
    test.info().annotations.push({ type: 'skip-reason', description: 'no student credentials' });
    return;
  }

  await page.goto('/login');
  const form = page.locator('form').filter({ has: page.locator('button[aria-label="تسجيل الدخول"]') });
  await form.locator('input[type="tel"]').fill(env.student.username);
  await form.locator('input[type="password"]').fill(env.student.password);

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('auth/login/') && r.request().method() === 'POST'),
    form.locator('button[type="submit"]').click(),
  ]);

  if (response.status() !== 200) {
    writeSession({ ok: false, reason: `login returned ${response.status()}` });
    return;
  }

  await expect(page).not.toHaveURL(/\/login/);
  await page.context().storageState({ path: STORAGE_STATE });
  writeSession({ ok: true });
});
