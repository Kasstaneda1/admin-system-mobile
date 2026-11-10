// node --test: the server address rule of app.config.js (config/apiUrl.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkApiUrl } = require('./apiUrl');

const LIVE = 'https://admin-system-backend-production.up.railway.app';
const STAND = 'http://127.0.0.1:8291';
const LAN = 'http://192.168.1.20:8291';
const LOCAL_HTTPS = 'https://localhost:8443';

const ok = (value, profile) => assert.doesNotThrow(() => checkApiUrl(value, profile), `${profile || 'no profile'} + ${value}`);
const bad = (value, profile, words) => assert.throws(() => checkApiUrl(value, profile), (e) => e.message.includes(words), `${profile || 'no profile'} + ${value}`);

test('no profile (expo start on this Mac): the six wrong addresses are refused', () => {
  bad(undefined, undefined, 'is not set');
  bad('', undefined, 'is not set');
  bad('notaurl', undefined, 'is not a URL');
  bad('ftp://x.y', undefined, 'must be http or https');
  bad(`${STAND}/`, undefined, 'without a path');
  bad(`${STAND}/api`, undefined, 'without a path');
  bad('http://example.com', undefined, 'plain http is only for a local stand');
});

test('no profile: the three right addresses pass, and https to a local name', () => {
  ok(STAND);
  ok(LAN);
  ok(LIVE);
  ok(LOCAL_HTTPS);
});

test('development: a local stand only', () => {
  ok(STAND, 'development');
  ok(LAN, 'development');
  ok(LOCAL_HTTPS, 'development');
  ok('http://10.0.2.2:8291', 'development');
  bad(LIVE, 'development', 'local stand only');
  bad('https://example.com', 'development', 'local stand only');
});

for (const profile of ['preview', 'production']) {
  test(`${profile}: https to a server that is not local`, () => {
    ok(LIVE, profile);
    bad(STAND, profile, `a ${profile} build talks to the live server`);
    bad(LAN, profile, `a ${profile} build talks to the live server`);
    bad(LOCAL_HTTPS, profile, `a ${profile} build talks to the live server`);
    bad('http://example.com', profile, 'plain http is only for a local stand');
  });
}

test('the general rules hold under every profile', () => {
  for (const profile of [undefined, 'development', 'preview', 'production', 'staging']) {
    bad(undefined, profile, 'is not set');
    bad(`${LIVE}/`, profile, 'without a path');
  }
});

test('a profile without its own rule gets only the general ones', () => {
  ok(STAND, 'staging');
  ok(LIVE, 'staging');
});

test('the eas.json profiles pass their own rule', () => {
  const eas = require('../eas.json');
  for (const [name, profile] of Object.entries(eas.build)) {
    if (name === 'base') continue;
    ok(profile.env.EXPO_PUBLIC_API_URL, name);
  }
});
