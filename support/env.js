// Central test configuration. Values come from e2e-tests/.env (see .env.example).
const path = require('path');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // No .env file: defaults below apply.
}

const flag = (name) => ['1', 'true', 'yes'].includes(String(process.env[name] || '').toLowerCase());
const withSlash = (url) => (url.endsWith('/') ? url : `${url}/`);

const env = {
  webUrl: (process.env.BARON_WEB_URL || 'https://staging.baronlearning.com').replace(/\/$/, ''),
  apiUrl: withSlash(process.env.BARON_API_URL || 'https://api.staging.baronlearning.com/'),
  student: {
    username: process.env.BARON_STUDENT_USERNAME || '',
    password: process.env.BARON_STUDENT_PASSWORD || '',
  },
  healthApiKey: process.env.BARON_HEALTH_API_KEY || '',
  allowWrites: flag('ALLOW_WRITES'),
  allowCheckout: flag('ALLOW_CHECKOUT'),
  allowProduction: flag('ALLOW_PRODUCTION'),
};

env.hasStudentCredentials = Boolean(env.student.username && env.student.password);
env.isStaging = env.webUrl.includes('staging');

// Business rules from backend/AGENTS.md.
env.rules = {
  MIN_COURSE_PRICE: 50,
  CURRENCIES: ['EGP', 'SAR'],
};

module.exports = { env };
