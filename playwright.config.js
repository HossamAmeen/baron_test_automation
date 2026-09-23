// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const { env } = require('./support/env');

const isProduction = /(^|\/\/)(www\.)?(api\.)?baronlearning\.com/.test(env.webUrl + ' ' + env.apiUrl)
  && !env.webUrl.includes('staging') && !env.apiUrl.includes('staging');
if (isProduction && !env.allowProduction) {
  throw new Error('Refusing to run against production. Set ALLOW_PRODUCTION=1 if you really mean it.');
}

module.exports = defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Shared staging environment: stay gentle with it.
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: env.webUrl,
    locale: 'ar-EG',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testDir: './tests/setup',
      testMatch: /.*\.setup\.js/,
    },
    {
      name: 'api',
      testDir: './tests/api',
      dependencies: ['setup'],
      use: { baseURL: env.apiUrl },
    },
    {
      name: 'ui-desktop',
      testDir: './tests/ui',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'ui-mobile',
      testDir: './tests/ui',
      dependencies: ['setup'],
      grep: /@responsive/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true },
    },
  ],
});
