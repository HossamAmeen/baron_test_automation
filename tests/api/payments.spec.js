// Payments app: checkout start/resume and webhooks (backend/AGENTS.md → "Payments App").
const { test, expect, env } = require('../../support/fixtures');

test.describe('checkout', () => {
  test('requires authentication', async ({ api, catalog }) => {
    const res = await api.post(`payments/course/${catalog.courses[0].id}/payment/`);
    expect(res.status()).toBe(401);
  });

  test('unknown course returns 404', async ({ studentApi }) => {
    const res = await studentApi.post('payments/course/99999999/payment/', { data: {} });
    expect(res.status()).toBe(404);
  });

  test('starts a checkout, then resumes the same transaction (ALLOW_CHECKOUT)', async ({ studentApi, catalog }) => {
    test.skip(!env.allowCheckout, 'opens a real XPay test-mode checkout; set ALLOW_CHECKOUT=1');
    const course = catalog.plainCourse || catalog.courses[0];

    const first = await studentApi.post(`payments/course/${course.id}/payment/`, { data: {} });
    expect([200, 201]).toContain(first.status());
    const firstBody = await first.json();
    test.skip(/already paid/i.test(firstBody.message || ''), 'student already owns this course');
    expect(firstBody.data.iframe_url).toMatch(/^https:\/\//);
    expect(firstBody.data.transaction_id).toBeTruthy();

    const second = await studentApi.post(`payments/course/${course.id}/payment/`, { data: {} });
    expect(second.status()).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.data.transaction_id).toBe(firstBody.data.transaction_id);
    expect(secondBody.data.iframe_url).toBe(firstBody.data.iframe_url);
  });
});

test.describe('webhooks', () => {
  test('XPay rejects an unsigned payload', async ({ api }) => {
    const res = await api.post('payments/webhooks/xpay/', { data: { type: 'checkout.session.completed' } });
    expect(res.status()).toBe(400);
  });

  test('XPay rejects a forged signature', async ({ api }) => {
    const t = Math.floor(Date.now() / 1000);
    const res = await api.post('payments/webhooks/xpay/', {
      headers: { 'XPay-Signature': `t=${t},v1=${'0'.repeat(64)}` },
      data: { id: 'evt_qa', type: 'checkout.session.completed', data: { object: { id: 'cs_test_qa' } } },
    });
    expect(res.status()).toBe(400);
  });

  test('the mock gateway is disabled where XPay is configured', async ({ api }) => {
    const res = await api.post('payments/webhooks/mock/', { data: {} });
    expect(res.status()).toBe(404);
  });

  test('unknown gateways return 404', async ({ api }) => {
    const res = await api.post('payments/webhooks/unknown-gateway/', { data: {} });
    expect(res.status()).toBe(404);
  });
});
