# Baron e2e tests

Automated API and UI tests for the Baron Learning platform, built with Playwright. They run against **staging** by default.

The tests check the rules documented in [`front/AGENTS.md`](../front/AGENTS.md) and [`backend/AGENTS.md`](../backend/AGENTS.md), plus regressions for the bugs in [`front/QA-REPORT-auth-staging.md`](../front/QA-REPORT-auth-staging.md). Tests named `(BUG-NN)` map to that report.

## Setup

```bash
cd e2e-tests
npm install
npx playwright install chromium   # skip if browsers are already cached
cp .env.example .env              # then fill in the student credentials
```

## Run

| Command | What it runs |
|---|---|
| `npm test` | Everything |
| `npm run test:api` | API tests only (fast, no browser) |
| `npm run test:ui` | UI tests at desktop 1440×900, plus the `@responsive` subset at 375×667 |
| `npm run test:headed` | Desktop UI tests in a visible browser |
| `npm run report` | Opens the HTML report from the last run |

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `BARON_WEB_URL` / `BARON_API_URL` | staging | Where to run. Production is refused unless `ALLOW_PRODUCTION=1` |
| `BARON_STUDENT_USERNAME` / `_PASSWORD` | – | An **active** student on the target. Without it, logged-in tests are skipped |
| `BARON_HEALTH_API_KEY` | – | Enables the authorized health-check test |
| `ALLOW_WRITES=1` | off | Registers one `@mailinator.com` account and sends one contact-us message |
| `ALLOW_CHECKOUT=1` | off | Starts and resumes one real XPay **test-mode** checkout. It never enters payment details |

By default a run creates **no data** on the target. The registration-validation tests always send an invalid email, so an account cannot be created even when a validation rule is missing.

## Layout

```
tests/setup/auth.setup.js   logs the student in once through the UI and saves the session (.auth/)
tests/api/                  one spec per backend app: auth, courses, payments, configuration
tests/ui/                   navigation + landing, courses + pricing, auth forms, contact, student flows
support/                    env loading, fixtures (api, studentApi, catalog, consoleErrors), session
```

- UI assertions read live data from the API (the `catalog` fixture). Price, offer and slider checks follow whatever staging currently serves, not hard-coded values.
- The login throttle and the 2-requests-per-15-minutes health endpoint are respected: the student logs in only once per run, and every health test makes at most one request.
- `workers: 2` keeps the load on the shared staging server low.
