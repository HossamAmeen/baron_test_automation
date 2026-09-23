// Auth app: register, login, activation, password reset, profile, change password
// (backend/AGENTS.md → "Auth App"). Validation tests pair the field under test with an
// invalid email so a request can never create an account, even if the rule is missing.
const { test, expect, env } = require('../../support/fixtures');
const { readSession } = require('../../support/session');

const validRegistration = (overrides = {}) => ({
  first_name: 'QA',
  last_name: 'Automation',
  gender: 'male',
  phone: '01000000000',
  parent_phone: '01000000001',
  email: 'not-an-email',
  password: 'Qa-Passw0rd!',
  password_confirmation: 'Qa-Passw0rd!',
  ...overrides,
});

test.describe('registration validation', () => {
  test('empty body lists every required field', async ({ api }) => {
    const res = await api.post('auth/register/', { data: {} });
    expect(res.status()).toBe(400);
    const body = await res.json();
    for (const key of ['first_name', 'last_name', 'phone', 'parent_phone', 'email', 'password', 'password_confirmation']) {
      expect(body, `error for ${key}`).toHaveProperty(key);
    }
  });

  test('invalid email is rejected', async ({ api }) => {
    const res = await api.post('auth/register/', { data: validRegistration() });
    expect(res.status()).toBe(400);
    expect(await res.json()).toHaveProperty('email');
  });

  // Random values so an "already exists" error from an earlier run can't mask a missing format rule.
  const randomLetters = (n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
  const randomDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
  for (const [label, phone] of [['letters', () => randomLetters(11)], ['too few digits', () => `9${randomDigits(3)}`]]) {
    test(`phone with ${label} is rejected (BUG-07)`, async ({ api }) => {
      const res = await api.post('auth/register/', { data: validRegistration({ phone: phone() }) });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body, 'phone format error').toHaveProperty('phone');
      expect(body.phone.join(' ')).not.toMatch(/already exists/i);
    });
  }

  test('names longer than 100 characters are rejected', async ({ api }) => {
    const res = await api.post('auth/register/', { data: validRegistration({ first_name: 'ا'.repeat(101) }) });
    expect(res.status()).toBe(400);
    expect(await res.json()).toHaveProperty('first_name');
  });

  test('script tags in names are rejected (BUG-09)', async ({ api }) => {
    const res = await api.post('auth/register/', { data: validRegistration({ first_name: '<script>alert(1)</script>' }) });
    expect(res.status()).toBe(400);
    expect(await res.json(), 'first_name error').toHaveProperty('first_name');
  });

  test('new registration is inactive until activated (ALLOW_WRITES)', async ({ api }) => {
    test.skip(!env.allowWrites, 'creates an account on the target; set ALLOW_WRITES=1');
    const stamp = Date.now().toString().slice(-9);
    const creds = { phone: `010${stamp.slice(-8)}`, password: 'Qa-Passw0rd!' };
    const res = await api.post('auth/register/', {
      data: validRegistration({ ...creds, parent_phone: `011${stamp.slice(-8)}`, email: `qa.e2e.${stamp}@mailinator.com` }),
    });
    expect(res.status()).toBe(201);
    test.info().annotations.push({ type: 'created-account', description: `qa.e2e.${stamp}@mailinator.com` });

    const login = await api.post('auth/login/', { data: { username: creds.phone, password: creds.password } });
    expect(login.status()).toBe(401);
    expect(JSON.stringify(await login.json())).toMatch(/not active/i);
  });
});

test.describe('login', () => {
  test('missing fields return 400', async ({ api }) => {
    const res = await api.post('auth/login/', { data: {} });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('username');
    expect(body).toHaveProperty('password');
  });

  test('unknown user returns 401 without tokens', async ({ api }) => {
    const res = await api.post('auth/login/', { data: { username: '01999999999', password: 'wrong-password' } });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).not.toHaveProperty('access');
    expect(body).not.toHaveProperty('refresh');
  });

  test('configured student credentials are valid', async () => {
    test.skip(!env.hasStudentCredentials, 'no student credentials configured');
    const session = readSession();
    expect(session.ok, `student login failed: ${session.reason}`).toBe(true);
  });

  test('password is compared exactly, without trimming (BUG-05)', async ({ api }) => {
    test.skip(!env.hasStudentCredentials, 'no student credentials configured');
    const res = await api.post('auth/login/', {
      data: { username: env.student.username, password: ` ${env.student.password} ` },
    });
    expect(res.status()).toBe(401);
  });

  test('refresh with an invalid token returns 401', async ({ api }) => {
    const res = await api.post('api/token/refresh/', { data: { refresh: 'not-a-token' } });
    expect(res.status()).toBe(401);
  });
});

test.describe('password reset', () => {
  test('requires an email', async ({ api }) => {
    const res = await api.post('auth/request-password-reset/', { data: {} });
    expect(res.status()).toBe(400);
  });

  test('unknown email gets the generic 200 response', async ({ api }) => {
    const res = await api.post('auth/request-password-reset/', { data: { email: 'qa.e2e.nobody@mailinator.com' } });
    expect(res.status()).toBe(200);
    expect((await res.json()).detail).toMatch(/if an account exists/i);
  });

  test('an invalid reset link shows an error page, not the form', async ({ api }) => {
    const res = await api.get('auth/password-reset/abc/invalid-token/');
    expect(res.status()).toBeLessThan(500);
    const html = await res.text();
    expect(html).toMatch(/invalid/i);
    expect(html).not.toMatch(/name="new_password1"/);
  });

  test('an invalid activation link does not crash', async ({ api }) => {
    const res = await api.get('auth/activate/abc/invalid-token/');
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('profile and change password', () => {
  test('require authentication', async ({ api }) => {
    expect((await api.get('auth/profile/')).status()).toBe(401);
    expect((await api.patch('auth/profile/', { data: {} })).status()).toBe(401);
    expect((await api.post('auth/change-password/', { data: {} })).status()).toBe(401);
    expect((await api.get('users/student/courses/')).status()).toBe(401);
  });

  test('student profile exposes the editable fields and no password', async ({ studentApi }) => {
    const res = await studentApi.get('auth/profile/');
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const key of ['first_name', 'last_name', 'phone', 'parent_phone', 'email', 'gender']) {
      expect(body, key).toHaveProperty(key);
    }
    expect(body).not.toHaveProperty('password');
  });

  test('PATCH ignores password fields and keeps the profile intact', async ({ studentApi }) => {
    const before = await (await studentApi.get('auth/profile/')).json();
    const res = await studentApi.patch('auth/profile/', {
      data: { first_name: before.first_name, password: 'Ignored-Passw0rd!' },
    });
    expect(res.status()).toBe(200);
    const after = await res.json();
    expect(after.first_name).toBe(before.first_name);
    expect(after).not.toHaveProperty('password');
  });

  const changePasswordCases = [
    ['wrong old password', () => ({ old_password: 'definitely-wrong', new_password: 'N3w-Passw0rd!', new_password_confirmation: 'N3w-Passw0rd!' }), 'old_password'],
    ['confirmation mismatch', () => ({ old_password: env.student.password, new_password: 'N3w-Passw0rd!', new_password_confirmation: 'Different-1!' }), 'new_password_confirmation'],
    ['same as old password', () => ({ old_password: env.student.password, new_password: env.student.password, new_password_confirmation: env.student.password }), 'new_password'],
    ['weak password', () => ({ old_password: env.student.password, new_password: '123', new_password_confirmation: '123' }), 'new_password'],
  ];

  for (const [label, body, field] of changePasswordCases) {
    test(`change password rejects ${label}`, async ({ studentApi }) => {
      const res = await studentApi.post('auth/change-password/', { data: body() });
      expect(res.status()).toBe(400);
      expect(Object.keys(await res.json()), `error keyed by ${field}`).toContain(field);
    });
  }
});
