// Student session produced once per run by tests/setup/auth.setup.js.
const fs = require('fs');
const path = require('path');

const AUTH_DIR = path.join(__dirname, '..', '.auth');
const STORAGE_STATE = path.join(AUTH_DIR, 'student.json');
const SESSION_INFO = path.join(AUTH_DIR, 'session.json');

function readSession() {
  try {
    return JSON.parse(fs.readFileSync(SESSION_INFO, 'utf8'));
  } catch {
    return { ok: false, reason: 'auth setup did not run' };
  }
}

function writeSession(info) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(SESSION_INFO, JSON.stringify(info));
}

/** The JWT access token that the SPA persisted under localStorage["vuex"]. */
function readToken() {
  try {
    const state = JSON.parse(fs.readFileSync(STORAGE_STATE, 'utf8'));
    for (const origin of state.origins || []) {
      const vuex = (origin.localStorage || []).find((item) => item.name === 'vuex');
      if (vuex) return JSON.parse(vuex.value).token || null;
    }
  } catch {
    // fall through
  }
  return null;
}

module.exports = { AUTH_DIR, STORAGE_STATE, readSession, writeSession, readToken };
