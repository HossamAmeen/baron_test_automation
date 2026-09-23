// Course catalog and details, including offer price rendering (front/AGENTS.md → CoursePrice.vue,
// backend/AGENTS.md → "Pricing").
const { test, expect } = require('../../support/fixtures');

const CURRENCY_NAMES = { EGP: 'جنيه مصري', SAR: 'ريال سعودي' };

test.describe('courses list', () => {
  test('lists subjects with prices and opens a course @responsive', async ({ page }) => {
    await page.goto('/courses');
    const cards = page.locator('.courses-list-section .custom-card');
    await expect(cards.first()).toBeVisible();
    await expect(cards.first().locator('.course-price')).toBeVisible();

    // Available courses render a "details" link; unavailable ones a disabled "soon" button.
    const details = page.locator('.courses-list-section a[href^="/course/"]').first();
    const href = await details.getAttribute('href');
    await details.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test('country tabs switch without errors', async ({ page, consoleErrors }) => {
    await page.goto('/courses');
    await page.getByRole('tab', { name: /السعودية/ }).click();
    await page.getByRole('tab', { name: /مصر/ }).click();
    await page.waitForLoadState('networkidle');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('course details', () => {
  test('shows the effective price, hours and start date', async ({ page, catalog }) => {
    const course = catalog.courses[0];
    await page.goto(`/course/${course.id}`);
    await expect(page.locator('.course-title')).toHaveText(course.name);
    await expect(page.locator('.current-price')).toHaveText(`${course.price} ${CURRENCY_NAMES[course.currency]}`);
    await expect(page.getByText(`${course.hours_count} ساعة`)).toBeVisible();
    await expect(page.getByText(course.start_date)).toBeVisible();
  });

  test('offer course shows struck-through old price and the discount badge', async ({ page, catalog }) => {
    const course = catalog.offerCourse;
    test.skip(!course, 'no course with an applicable same-currency offer right now');
    await page.goto(`/course/${course.id}`);
    await expect(page.locator('del.old-price')).toContainText(String(course.original_price));
    const percent = Math.round((1 - course.price / course.original_price) * 100);
    await expect(page.locator('.discount-badge')).toHaveText(`خصم ${percent}%`);
  });

  test('course without an offer shows no old price', async ({ page, catalog }) => {
    const course = catalog.plainCourse;
    test.skip(!course, 'every course has an offer right now');
    await page.goto(`/course/${course.id}`);
    await expect(page.locator('.current-price')).toBeVisible();
    await expect(page.locator('del.old-price')).toHaveCount(0);
    await expect(page.locator('.discount-badge')).toHaveCount(0);
  });

  test('logged-out visitors are sent to login and back @responsive', async ({ page, catalog }) => {
    const course = catalog.courses[0];
    await page.goto(`/course/${course.id}`);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(page).toHaveURL(new RegExp(`/login\\?redirect=.*course.*${course.id}`));
  });

  test('unknown course id does not crash the page', async ({ page, consoleErrors }) => {
    await page.goto('/course/99999999');
    await page.waitForLoadState('networkidle');
    expect(consoleErrors.filter((e) => e.startsWith('pageerror'))).toEqual([]);
  });
});
