// node --test: the session's decisions (model.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTICE, ACCESS_MARGIN_MS, REFRESH_LIFE_MS, CHECK_GAP_MS,
  accessExpiresAt, accessUsable, answerKind, refreshOutcome, startState, checkDue, profileFromMe, isAuthPath,
} from './model.js';

const NOW = Date.parse('2026-11-10T17:00:00Z');
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.signature`;

test('accessExpiresAt reads `exp` of a JWT, base64url with a name in any letters', () => {
  assert.equal(accessExpiresAt(jwt({ id: 1, exp: 1800000000, fullName: 'Нина Ñ' })), 1800000000 * 1000);
  assert.equal(accessExpiresAt(jwt({ id: 1 })), null);
  assert.equal(accessExpiresAt('not.a-json.token'), null);
  assert.equal(accessExpiresAt('one-part'), null);
  assert.equal(accessExpiresAt(null), null);
  assert.equal(accessExpiresAt(undefined), null);
});

test('the token is read without atob, as on Hermes in the app', () => {
  const kept = globalThis.atob;
  delete globalThis.atob;
  try {
    assert.equal(typeof globalThis.atob, 'undefined');
    assert.equal(accessExpiresAt(jwt({ id: 1, exp: 1800000000, fullName: 'Нина Ñ' })), 1800000000 * 1000);
    const iat = Math.floor(NOW / 1000);
    assert.equal(accessUsable(jwt({ iat, exp: iat + 30 }), NOW), true);
    // every padding length: payloads of 1..6 extra characters
    for (let n = 1; n <= 6; n += 1) assert.equal(accessExpiresAt(jwt({ exp: 1800000000, x: 'y'.repeat(n) })), 1800000000 * 1000, `pad ${n}`);
    assert.equal(accessExpiresAt('a.%%%.c'), null);
  } finally {
    globalThis.atob = kept;
  }
});

test('accessUsable: the token must outlive the 30-second margin', () => {
  const at = (ms) => jwt({ exp: Math.floor((NOW + ms) / 1000) });
  assert.equal(ACCESS_MARGIN_MS, 30000);
  assert.equal(accessUsable(at(15 * 60 * 1000), NOW), true);
  assert.equal(accessUsable(at(31 * 1000), NOW), true);
  assert.equal(accessUsable(at(30 * 1000), NOW), false);
  assert.equal(accessUsable(at(-60 * 1000), NOW), false);
  assert.equal(accessUsable(null, NOW), false);
  assert.equal(accessUsable('garbage', NOW), false);
});

test('accessUsable: a token shorter than 2 minutes keeps a quarter of its life as the margin', () => {
  const iat = Math.floor(NOW / 1000);
  const short = jwt({ iat, exp: iat + 30 });                  // 30 s: margin 7.5 s
  assert.equal(accessUsable(short, NOW), true, 'a new 30-second token can go out');
  assert.equal(accessUsable(short, NOW + 22000), true);
  assert.equal(accessUsable(short, NOW + 23000), false);
  const usual = jwt({ iat, exp: iat + 15 * 60 });             // 15 min: margin 30 s
  assert.equal(accessUsable(usual, NOW + 15 * 60 * 1000 - 31000), true);
  assert.equal(accessUsable(usual, NOW + 15 * 60 * 1000 - 30000), false);
});

test('answerKind: 401 refreshes, the turned-off 403 ends the session, the rest goes to the screen', () => {
  assert.equal(answerKind(401, { error: 'Invalid or expired token' }), 'refresh');
  assert.equal(answerKind(401, { error: 'Token not provided' }), 'refresh');
  assert.equal(answerKind(401, null), 'refresh');
  assert.equal(answerKind(403, { error: 'Access to system blocked. Contact administrator.' }), 'blocked');
  assert.equal(answerKind(403, { error: 'Access denied. Office staff only' }), 'pass');
  assert.equal(answerKind(403, { error: 'Account blocked. Your subscription has expired.' }), 'pass');
  assert.equal(answerKind(403, null), 'pass');
  for (const status of [undefined, 0, 400, 404, 409, 429, 500, 503]) assert.equal(answerKind(status, { error: 'x' }), 'pass');
});

test('refreshOutcome: the server\'s answers to /api/auth/refresh', () => {
  assert.equal(refreshOutcome(200, { accessToken: 'a', refreshToken: 'r', token: 'a' }), 'ok');
  assert.equal(refreshOutcome(200, { accessToken: 'a' }), 'later');
  assert.equal(refreshOutcome(200, null), 'later');
  assert.equal(refreshOutcome(401, { error: 'Account is deactivated' }), 'blocked');
  assert.equal(refreshOutcome(403, { error: 'Access to system blocked. Contact administrator.' }), 'blocked');
  assert.equal(refreshOutcome(401, { error: 'Invalid refresh token' }), 'expired');
  assert.equal(refreshOutcome(401, { error: 'Refresh token expired' }), 'expired');
  assert.equal(refreshOutcome(401, null), 'expired');
  assert.equal(refreshOutcome(400, { error: 'Refresh token required' }), 'expired');
  assert.equal(refreshOutcome(0, null), 'later');
  assert.equal(refreshOutcome(429, { error: 'Too many token refresh requests, please try again later' }), 'later');
  assert.equal(refreshOutcome(500, { error: 'Server error' }), 'later');
  assert.equal(refreshOutcome(502, null), 'later');
});

test('startState: signed in without the network while the refresh token is younger than 7 days', () => {
  const user = { id: 7, fullName: 'Nia Test', role: 'technician' };
  assert.deepEqual(startState({ refresh: 'r', savedAt: NOW - 60000, user, now: NOW }), { signedIn: true, notice: null, wipe: false });
  assert.deepEqual(startState({ refresh: 'r', savedAt: NOW - REFRESH_LIFE_MS + 60000, user, now: NOW }), { signedIn: true, notice: null, wipe: false });
  assert.deepEqual(startState({ refresh: 'r', savedAt: NOW - REFRESH_LIFE_MS, user, now: NOW }), { signedIn: false, notice: NOTICE.expired, wipe: true });
  assert.deepEqual(startState({ refresh: 'r', savedAt: null, user, now: NOW }), { signedIn: false, notice: NOTICE.expired, wipe: true });
  assert.deepEqual(startState({ refresh: 'r', savedAt: NaN, user, now: NOW }), { signedIn: false, notice: NOTICE.expired, wipe: true });
});

test('startState: nothing kept, a token without a profile, a profile without a token', () => {
  assert.deepEqual(startState({ refresh: null, savedAt: null, user: null, now: NOW }), { signedIn: false, notice: null, wipe: false });
  // the iOS keychain outlives a deleted app: the token is there, the profile is not
  assert.deepEqual(startState({ refresh: 'r', savedAt: NOW, user: null, now: NOW }), { signedIn: false, notice: null, wipe: true });
  // the app before APP-1: a profile, its token in AsyncStorage, no refresh token
  assert.deepEqual(startState({ refresh: null, savedAt: null, user: { id: 1 }, now: NOW }), { signedIn: false, notice: null, wipe: true });
});

test('checkDue: GET /api/me on return to the app at most once per 5 minutes', () => {
  assert.equal(CHECK_GAP_MS, 5 * 60 * 1000);
  assert.equal(checkDue(null, NOW), true);
  assert.equal(checkDue(NOW - CHECK_GAP_MS, NOW), true);
  assert.equal(checkDue(NOW - CHECK_GAP_MS + 1, NOW), false);
  assert.equal(checkDue(NOW, NOW), false);
});

test('profileFromMe: /api/me in the shape the screens read (fullName), the rest kept', () => {
  const kept = { id: 7, username: 'nia', role: 'technician', fullName: 'Nia', subdomain: 'semix', isSuperAdmin: false };
  const me = { id: 7, username: 'nia', role: 'technician', full_name: 'Nia Test', is_super_admin: false };
  assert.deepEqual(profileFromMe(me, kept), { ...kept, fullName: 'Nia Test' });
  assert.deepEqual(profileFromMe(me, null), { id: 7, username: 'nia', role: 'technician', fullName: 'Nia Test', isSuperAdmin: false });
});

test('isAuthPath: sign in, refresh and sign out only', () => {
  for (const url of ['/api/login', 'api/login', '/api/auth/refresh', '/api/auth/logout', 'http://127.0.0.1:8291/api/auth/refresh']) assert.equal(isAuthPath(url), true, url);
  for (const url of ['/api/me', '/api/my-parts', '/api/technicians/salary', '/api/loginx', '/api/authors', undefined, null]) {
    assert.equal(isAuthPath(url), false, String(url));
  }
});

test('the notices are short English sentences', () => {
  assert.equal(NOTICE.blocked, 'Your account was turned off. Please contact the office.');
  assert.equal(NOTICE.expired, 'Your session has ended. Please sign in again.');
});
