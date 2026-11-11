// node --test: the session at work (session.js) inside a real axios client, against a fake
// server (an axios adapter), a fake refresh / logout and a store in memory. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import axios, { AxiosError } from 'axios';
import { createSession } from './session.js';
import { NOTICE, REFRESH_LIFE_MS, accessExpiresAt } from './model.js';

const START = Date.parse('2026-11-10T17:00:00Z');
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
let serial = 0;
// A JWT-shaped access token that ends `ms` from `at`
const access = (at, ms) => `${b64url({ alg: 'HS256' })}.${b64url({ id: 7, exp: Math.floor((at + ms) / 1000), n: (serial += 1) })}.sig`;
const USER = { id: 7, username: 'nia', role: 'technician', fullName: 'Nia Test' };
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
// A request the end of the session cut off never answers: still pending after `ms`
const stillPending = async (promise, ms = 60) => {
  const outcome = await Promise.race([promise.then(() => 'answered', () => 'failed'), tick(ms).then(() => 'pending')]);
  return outcome === 'pending';
};

function world({ accessLeftMs = 15 * 60 * 1000 } = {}) {
  let clock = START;
  const now = () => clock;
  const first = { access: access(clock, accessLeftMs), refresh: 'r0', savedAt: clock - 60000 };

  const store = {
    kept: { ...first, user: { ...USER } },
    writes: 0,
    clears: 0,
    async read() { return { ...this.kept }; },
    async writeTokens(t) { this.writes += 1; Object.assign(this.kept, t); },
    async writeUser(u) { this.kept.user = u; },
    async clear() { this.clears += 1; this.kept = { access: null, refresh: null, savedAt: null, user: null }; },
  };

  // The server: which access tokens it takes, which refresh token is current, how it answers
  const server = {
    valid: new Set([first.access]),
    currentRefresh: 'r0',
    refreshAnswer: null,      // null: rotate normally; else { status, data }
    refreshDelay: 5,
    answer403: null,          // a 403 body for every API request
    always401: false,
    requests: [],             // [url, Authorization]
    refreshes: [],
    logouts: [],
  };

  const http = {
    async refresh(token) {
      server.refreshes.push(token);
      await tick(server.refreshDelay);
      if (server.refreshAnswer) return server.refreshAnswer;
      if (token !== server.currentRefresh) return { status: 401, data: { error: 'Invalid refresh token' } };
      const fresh = access(clock, 15 * 60 * 1000);
      server.valid.add(fresh);
      server.currentRefresh = `r${server.refreshes.length}`;
      return { status: 200, data: { accessToken: fresh, refreshToken: server.currentRefresh, token: fresh } };
    },
    async logout(token) {
      server.logouts.push(token);
      return server.logoutAnswer || { status: 200, data: { success: true } };
    },
  };

  const adapter = async (config) => {
    await tick(1);
    const auth = config.headers?.Authorization || config.headers?.get?.('Authorization') || null;
    server.requests.push([config.url, auth]);
    const reply = (status, data) => {
      const response = { status, statusText: String(status), data, headers: {}, config, request: {} };
      if (status >= 200 && status < 300) return response;
      throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, {}, response);
    };
    if (config.url === '/api/login') return reply(401, { error: 'Invalid username or password' });
    if (server.network === 'down') throw new AxiosError('Network Error', 'ERR_NETWORK', config, {});
    const token = auth ? auth.replace(/^Bearer /, '') : null;
    // like the server: an unknown or ended token is refused
    if (server.always401 || !server.valid.has(token) || accessExpiresAt(token) <= clock) return reply(401, { error: 'Invalid or expired token' });
    if (server.answer403) return reply(403, server.answer403);
    return reply(200, { ok: true, url: config.url });
  };

  const api = axios.create({ baseURL: 'http://stand.test', adapter });
  const session = createSession({ store, http, now });
  session.attach(api);
  const ends = [];
  session.onEnd((reason) => ends.push(reason));
  return { api, session, store, server, ends, first, advance(ms) { clock += ms; }, now };
}

const sentWith = (server, url) => server.requests.filter(([u]) => u === url).map(([, auth]) => auth);

test('a live access token goes out as it is, no refresh', async () => {
  const w = world();
  assert.deepEqual(await w.session.load(), { signedIn: true, notice: null, user: USER });
  const res = await w.api.get('/api/me');
  assert.equal(res.status, 200);
  assert.deepEqual(sentWith(w.server, '/api/me'), [`Bearer ${w.first.access}`]);
  assert.equal(w.server.refreshes.length, 0);
});

test('an access token about to end: five requests at once share one refresh', async () => {
  const w = world({ accessLeftMs: 10 * 1000 });
  await w.session.load();
  const results = await Promise.all([1, 2, 3, 4, 5].map((n) => w.api.get(`/api/r${n}`)));
  assert.equal(results.every((r) => r.status === 200), true);
  assert.deepEqual(w.server.refreshes, ['r0']);
  const used = new Set(w.server.requests.map(([, auth]) => auth));
  assert.equal(used.size, 1, 'all five with the same new token');
  assert.notEqual([...used][0], `Bearer ${w.first.access}`);
  assert.equal(w.store.kept.refresh, 'r1', 'the turned refresh token is kept');
  assert.equal(w.store.kept.savedAt, w.now());
  assert.deepEqual(w.ends, []);
});

test('the server refuses a token that looks alive: one refresh, each request sent again once', async () => {
  const w = world();
  await w.session.load();
  w.server.valid.clear(); // e.g. the server's secret changed
  const results = await Promise.all([1, 2, 3, 4, 5].map((n) => w.api.get(`/api/r${n}`)));
  assert.equal(results.every((r) => r.status === 200), true);
  assert.equal(w.server.refreshes.length, 1);
  assert.equal(w.server.requests.length, 10, 'five refused, five sent again');
  for (let n = 1; n <= 5; n += 1) {
    const [before, after] = sentWith(w.server, `/api/r${n}`);
    assert.equal(before, `Bearer ${w.first.access}`);
    assert.notEqual(after, before);
  }
});

test('a request that the server keeps refusing is sent again only once', async () => {
  const w = world();
  await w.session.load();
  w.server.always401 = true;
  await assert.rejects(w.api.get('/api/me'), (e) => e.response?.status === 401);
  assert.equal(w.server.refreshes.length, 1);
  assert.equal(sentWith(w.server, '/api/me').length, 2);
  assert.deepEqual(w.ends, []);
});

test('the access token runs out later on: the next request refreshes, the work goes on', async () => {
  const w = world();
  await w.session.load();
  await w.api.get('/api/a');
  w.advance(16 * 60 * 1000);
  await w.api.get('/api/b');
  w.advance(16 * 60 * 1000);
  await w.api.get('/api/c');
  assert.deepEqual(w.server.refreshes, ['r0', 'r1']);
  assert.equal(w.store.kept.refresh, 'r2');
  assert.equal(w.session.signedIn, true);
});

test('refresh refused, the account is turned off: the session ends once and everything kept goes', async () => {
  const w = world({ accessLeftMs: -1000 });
  await w.session.load();
  w.server.refreshAnswer = { status: 401, data: { error: 'Account is deactivated' } };
  const cut = [w.api.get('/api/a'), w.api.get('/api/b'), w.api.get('/api/c')];
  for (const request of cut) assert.equal(await stillPending(request), true, 'no answer, no error alert over sign in');
  assert.deepEqual(w.ends, ['blocked']);
  assert.equal(w.server.refreshes.length, 1);
  assert.equal(w.server.requests.length, 0, 'nothing reached the server');
  assert.deepEqual(w.store.kept, { access: null, refresh: null, savedAt: null, user: null });
  assert.equal(w.session.signedIn, false);
  assert.equal(await stillPending(w.api.get('/api/d')), true);
  assert.equal(w.server.requests.length, 0);
});

for (const error of ['Invalid refresh token', 'Refresh token expired']) {
  test(`refresh refused («${error}»): the session ends as expired`, async () => {
    const w = world();
    await w.session.load();
    w.server.valid.clear();
    w.server.refreshAnswer = { status: 401, data: { error } };
    assert.equal(await stillPending(w.api.get('/api/me')), true);
    assert.deepEqual(w.ends, ['expired']);
    assert.equal(w.store.kept.refresh, null);
  });
}

for (const [label, answer] of [['no network', { status: 0, data: null }], ['a server failure', { status: 500, data: { error: 'Server error' } }], ['too many refreshes', { status: 429, data: { error: 'Too many token refresh requests, please try again later' } }]]) {
  test(`refresh fails with ${label}: the session stays, the screen gets the failure, later it works`, async () => {
    const w = world({ accessLeftMs: -1000 });
    await w.session.load();
    w.server.refreshAnswer = answer;
    await assert.rejects(w.api.get('/api/me'), (e) => e.response?.status === 401);
    assert.equal(w.server.refreshes.length, 1, 'no second refresh for the same request');
    assert.deepEqual(w.ends, []);
    assert.equal(w.session.signedIn, true);
    assert.equal(w.store.kept.refresh, 'r0');
    w.server.refreshAnswer = null;
    const res = await w.api.get('/api/me');
    assert.equal(res.status, 200);
    assert.equal(w.store.kept.refresh, 'r2');
  });
}

test('no network at all: the request fails, nothing is refreshed, the session stays', async () => {
  const w = world();
  await w.session.load();
  w.server.network = 'down';
  await assert.rejects(w.api.get('/api/me'), (e) => e.code === 'ERR_NETWORK');
  assert.equal(w.server.refreshes.length, 0);
  assert.equal(w.session.signedIn, true);
});

test('403 «Access to system blocked» on any request ends the session at once, once', async () => {
  const w = world();
  await w.session.load();
  w.server.answer403 = { error: 'Access to system blocked. Contact administrator.' };
  const cut = [w.api.get('/api/a'), w.api.get('/api/b')];
  for (const request of cut) assert.equal(await stillPending(request), true);
  assert.deepEqual(w.ends, ['blocked']);
  assert.equal(w.server.refreshes.length, 0);
  assert.equal(w.store.kept.refresh, null);
});

test('another 403 goes to the screen and the session stays', async () => {
  const w = world();
  await w.session.load();
  w.server.answer403 = { error: 'Access denied. Office staff only' };
  await assert.rejects(w.api.get('/api/estimates'), (e) => e.response?.status === 403 && e.response.data.error === 'Access denied. Office staff only');
  assert.deepEqual(w.ends, []);
  assert.equal(w.session.signedIn, true);
});

test('sign in is left alone: its 401 goes to the screen without a refresh', async () => {
  const w = world();
  await w.session.load();
  await assert.rejects(w.api.post('/api/login', { username: 'x', password: 'y' }), (e) => e.response?.status === 401);
  assert.equal(w.server.refreshes.length, 0);
  assert.equal(sentWith(w.server, '/api/login')[0], null, 'no token on sign in');
});

test('sign in keeps the tokens and the profile; the next start is signed in', async () => {
  const w = world();
  await w.session.signOut();
  await w.session.signIn({ accessToken: access(w.now(), 15 * 60 * 1000), refreshToken: 'rX', user: USER });
  assert.equal(w.store.kept.refresh, 'rX');
  assert.equal(w.store.kept.savedAt, w.now());
  assert.deepEqual(w.store.kept.user, USER);
  const again = createSession({ store: w.store, http: {}, now: w.now });
  assert.deepEqual(await again.load(), { signedIn: true, notice: null, user: USER });
});

test('sign out: what is kept goes at once, the server revokes the refresh token; without the network too', async () => {
  const w = world();
  await w.session.load();
  w.server.logoutAnswer = { status: 0, data: null };
  await w.session.signOut();
  assert.deepEqual(w.server.logouts, ['r0']);
  assert.deepEqual(w.store.kept, { access: null, refresh: null, savedAt: null, user: null });
  assert.equal(w.session.signedIn, false);
  assert.deepEqual(w.ends, [], 'signing out is not an end with a notice');
  assert.equal(await stillPending(w.api.get('/api/me')), true);
  assert.equal(w.server.requests.length, 0);
});

test('sign out while a refresh runs: its answer is dropped, its new token revoked', async () => {
  const w = world({ accessLeftMs: -1000 });
  await w.session.load();
  w.server.refreshDelay = 30;
  const pending = w.api.get('/api/me');
  await tick(5);
  await w.session.signOut();
  assert.equal(await stillPending(pending, 80), true);
  assert.deepEqual(w.store.kept, { access: null, refresh: null, savedAt: null, user: null }, 'nothing written back');
  assert.deepEqual(w.server.logouts, ['r0', 'r1']);
});

test('start: 7 days after the last save the session is over, with the notice', async () => {
  const w = world();
  w.store.kept.savedAt = START - REFRESH_LIFE_MS;
  assert.deepEqual(await w.session.load(), { signedIn: false, notice: NOTICE.expired, user: null });
  assert.equal(w.store.clears, 1);
  assert.equal(await stillPending(w.api.get('/api/me')), true);
  assert.equal(w.server.requests.length, 0);
});

test('start: a token without a profile (app deleted, keychain kept) is wiped quietly', async () => {
  const w = world();
  w.store.kept.user = null;
  assert.deepEqual(await w.session.load(), { signedIn: false, notice: null, user: null });
  assert.equal(w.store.kept.refresh, null);
});

test('updateUser keeps the new profile while signed in only', async () => {
  const w = world();
  await w.session.load();
  await w.session.updateUser({ ...USER, fullName: 'Nia T.' });
  assert.equal(w.store.kept.user.fullName, 'Nia T.');
  assert.equal(w.session.user.fullName, 'Nia T.');
  await w.session.signOut();
  await w.session.updateUser(USER);
  assert.equal(w.store.kept.user, null);
});
