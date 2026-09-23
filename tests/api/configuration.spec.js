// Configuration app (backend/AGENTS.md → "Configuration App").
const { test, expect, env } = require('../../support/fixtures');

const isSortedBy = (items, key) => items.every((item, i) => i === 0 || items[i - 1][key] <= item[key]);

test.describe('configuration', () => {
  test('site configuration returns contact details', async ({ api }) => {
    const res = await api.get('configuration/configuration/');
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const key of ['eg_number', 'ksa_number', 'email', 'about_us']) {
      expect(body, `configuration.${key}`).toHaveProperty(key);
    }
    expect(body.email).toMatch(/@/);
  });

  test('sliders are read-only and ordered by `ordering`', async ({ api }) => {
    const res = await api.get('configuration/sliders/');
    expect(res.status()).toBe(200);
    const { count, results } = await res.json();
    expect(count).toBe(results.length);
    expect(isSortedBy(results, 'ordering')).toBe(true);
    for (const slide of results) expect(slide.image).toMatch(/^https?:\/\//);

    expect((await api.post('configuration/sliders/', { data: {} })).status()).toBeGreaterThanOrEqual(400);
  });

  test('reviews are read-only, ordered, and rated 1-5', async ({ api }) => {
    const res = await api.get('configuration/reviews/');
    expect(res.status()).toBe(200);
    const { results } = await res.json();
    expect(isSortedBy(results, 'ordering')).toBe(true);
    for (const review of results) {
      expect(review.rate).toBeGreaterThanOrEqual(1);
      expect(review.rate).toBeLessThanOrEqual(5);
    }
    expect((await api.post('configuration/reviews/', { data: {} })).status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('contact us', () => {
  test('is create-only', async ({ api }) => {
    expect((await api.get('configuration/contact-us/')).status()).toBe(405);
  });

  test('rejects an empty submission with every required field', async ({ api }) => {
    const res = await api.post('configuration/contact-us/', { data: {} });
    expect(res.status()).toBe(400);
    const body = await res.json();
    for (const key of ['first_name', 'last_name', 'phone', 'subject', 'description']) {
      expect(body, `error for ${key}`).toHaveProperty(key);
    }
  });

  test('accepts a valid submission (ALLOW_WRITES)', async ({ api }) => {
    test.skip(!env.allowWrites, 'sends a real admin email; set ALLOW_WRITES=1');
    const res = await api.post('configuration/contact-us/', {
      data: {
        first_name: 'QA',
        last_name: 'Automation',
        phone: '01000000000',
        subject: 'QA automated test - please ignore',
        description: `Automated e2e run ${new Date().toISOString()}`,
      },
    });
    expect(res.status()).toBe(201);
  });
});

test.describe('health check', () => {
  // The endpoint allows 2 requests per 15 minutes, so each test makes at most one call.
  test('rejects a missing API key', async ({ api }) => {
    const res = await api.get('api/health/');
    expect([401, 429]).toContain(res.status());
    expect(JSON.stringify(await res.json())).not.toContain('healthy');
  });

  test('reports healthy with a valid API key', async ({ api }) => {
    test.skip(!env.healthApiKey, 'set BARON_HEALTH_API_KEY');
    const res = await api.get('api/health/', { headers: { 'x-API-Key': env.healthApiKey } });
    test.skip(res.status() === 429, 'rate-limited (2 req / 15 min); rerun later');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(Number.isNaN(Date.parse(body.datetime))).toBe(false);
  });
});
