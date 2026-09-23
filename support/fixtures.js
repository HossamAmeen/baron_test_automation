// Shared fixtures: `api` (anonymous API client), `studentApi` (authenticated API client),
// `catalog` (live course data used to drive UI assertions) and `consoleErrors`.
const base = require('@playwright/test');
const { env } = require('./env');
const { STORAGE_STATE, readSession, readToken } = require('./session');

const test = base.test.extend({
  api: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({ baseURL: env.apiUrl });
    await use(ctx);
    await ctx.dispose();
  },

  studentApi: async ({ playwright }, use) => {
    const session = readSession();
    const token = readToken();
    base.test.skip(!session.ok || !token, `No student session: ${session.reason || 'token missing'}`);
    const ctx = await playwright.request.newContext({
      baseURL: env.apiUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    await use(ctx);
    await ctx.dispose();
  },

  catalog: async ({ api }, use) => {
    const res = await api.get('courses/courses/');
    base.expect(res.status()).toBe(200);
    const courses = (await res.json()).results;
    await use({
      courses,
      offerCourse: courses.find((c) => c.has_offer && c.original_currency === c.currency && c.original_price > c.price),
      plainCourse: courses.find((c) => !c.has_offer),
    });
  },

  /** Collects page errors and console errors; assert on it at the end of a test. */
  consoleErrors: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
    });
    await use(errors);
  },
});

/** Use in a UI spec to run it as the logged-in student (skips when no session). */
function useStudent(t) {
  t.use({ storageState: STORAGE_STATE });
  t.beforeEach(() => {
    const session = readSession();
    t.skip(!session.ok, `No student session: ${session.reason}`);
  });
}

module.exports = { test, expect: base.expect, env, useStudent };
