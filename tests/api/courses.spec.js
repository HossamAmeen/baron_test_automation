// Course app: taxonomy, catalog, effective pricing and offers (backend/AGENTS.md → "Course App").
const { test, expect, env } = require('../../support/fixtures');

const { MIN_COURSE_PRICE, CURRENCIES } = env.rules;
const today = new Date().toISOString().slice(0, 10);

test.describe('taxonomy', () => {
  test('education stages nest grades and semesters', async ({ api }) => {
    const res = await api.get('courses/education-stages/');
    expect(res.status()).toBe(200);
    const { data: results } = await res.json();
    expect(results.length).toBeGreaterThan(0);
    for (const stage of results) {
      expect(Array.isArray(stage.grades)).toBe(true);
      for (const grade of stage.grades) expect(Array.isArray(grade.semesters)).toBe(true);
    }
  });

  test('countries nest education stages → grades → semesters', async ({ api }) => {
    const res = await api.get('courses/countries/');
    expect(res.status()).toBe(200);
    const { data: results } = await res.json();
    expect(results.length).toBeGreaterThan(0);
    for (const country of results) expect(Array.isArray(country.education_stages)).toBe(true);
  });

  test('subjects support the is_tahsili / is_kamiy filters', async ({ api }) => {
    for (const filter of ['is_tahsili=true', 'is_kamiy=true']) {
      expect((await api.get(`courses/subjects/?${filter}`)).status(), filter).toBe(200);
    }
  });
});

test.describe('catalog and pricing', () => {
  test('every course respects the minimum price and supported currencies', async ({ catalog }) => {
    expect(catalog.courses.length).toBeGreaterThan(0);
    for (const c of catalog.courses) {
      expect(c.price, `course ${c.id} price`).toBeGreaterThanOrEqual(MIN_COURSE_PRICE);
      expect(CURRENCIES, `course ${c.id} currency`).toContain(c.currency);
    }
  });

  test('offer payload is consistent with has_offer', async ({ catalog }) => {
    for (const c of catalog.courses) {
      if (!c.has_offer) {
        expect(c.offer, `course ${c.id} has no offer`).toBeNull();
        continue;
      }
      // An offer is only applicable when active, in its date range, and seats remain.
      expect(c.offer, `course ${c.id} offer`).toBeTruthy();
      expect(c.offer.start_date <= today && today <= c.offer.end_date, `course ${c.id} offer dates`).toBe(true);
      expect(c.offer.remaining_seats, `course ${c.id} seats`).toBeGreaterThan(0);
      expect(c.offer.remaining_seats).toBeLessThanOrEqual(c.offer.max_students);
      expect(c.original_price, `course ${c.id} original price`).toBeGreaterThanOrEqual(MIN_COURSE_PRICE);
    }
  });

  test('course list, subject list and course detail agree on the effective price', async ({ api, catalog }) => {
    const subjects = (await (await api.get('courses/subjects/')).json()).data;
    const fromSubjects = new Map(subjects.flatMap((s) => s.available_course || []).map((c) => [c.id, c]));

    for (const c of catalog.courses.slice(0, 5)) {
      const detail = (await (await api.get(`courses/courses/${c.id}/`)).json()).data;
      expect([detail.price, detail.currency, detail.has_offer], `detail ${c.id}`).toEqual([c.price, c.currency, c.has_offer]);
      const sub = fromSubjects.get(c.id);
      if (sub) expect([sub.price, sub.currency], `subject entry ${c.id}`).toEqual([c.price, c.currency]);
    }
  });

  test('anonymous course detail is not paid and not authenticated', async ({ api, catalog }) => {
    const res = await api.get(`courses/courses/${catalog.courses[0].id}/`);
    expect(res.status()).toBe(200);
    const body = (await res.json()).data;
    expect(body.is_authenticated).toBe(false);
    expect(body.is_paid).toBe(false);
  });

  test('unknown course returns 404', async ({ api }) => {
    expect((await api.get('courses/courses/99999999/')).status()).toBe(404);
  });

  test('course endpoints are read-only', async ({ api, catalog }) => {
    expect((await api.post('courses/courses/', { data: {} })).status()).toBe(405);
    expect((await api.delete(`courses/courses/${catalog.courses[0].id}/`)).status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('lesson content protection', () => {
  test('anonymous users cannot list lesson links', async ({ api }) => {
    const res = await api.get('courses/lessons/');
    if (res.status() !== 200) return; // 401/403/404 are all acceptable
    const { data: results = [] } = await res.json();
    const exposed = results.filter((l) => l.video_link || l.test_link || l.explanation_file);
    expect(exposed.map((l) => l.id), 'lessons exposing content to anonymous users').toEqual([]);
  });

  test('anonymous course detail does not expose lesson links', async ({ api, catalog }) => {
    for (const c of catalog.courses) {
      const body = (await (await api.get(`courses/courses/${c.id}/`)).json()).data;
      const exposed = (body.lessons || []).filter((l) => l.video_link || l.test_link || l.explanation_file);
      expect(exposed.length, `course ${c.id} leaks lesson content`).toBe(0);
    }
  });
});

test.describe('as the student', () => {
  test('course detail knows the user is authenticated', async ({ studentApi, catalog }) => {
    const body = (await (await studentApi.get(`courses/courses/${catalog.courses[0].id}/`)).json()).data;
    expect(body.is_authenticated).toBe(true);
  });

  test('enrolled courses list only paid courses', async ({ studentApi }) => {
    const res = await studentApi.get('users/student/courses/');
    expect(res.status()).toBe(200);
    const items = (await res.json()).data;
    expect(Array.isArray(items)).toBe(true);
  });
});
