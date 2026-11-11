// node --test: what the phone keeps goes with the session (deviceStore.js under session.js).
// The phone's secure store and AsyncStorage are stand-ins in memory; My day kept for offline
// (MY_DAY_KEY: customers' names, phones, addresses) must not outlive a sign out or the end of
// the session, nor come back with an answer that was on its way. My day's real queue
// (cacheQueue.js) runs on the stand-in AsyncStorage. Drop clearMyDay from deviceStore.clear()
// and these tests fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import axios, { AxiosError } from 'axios';
import { makeDeviceStore } from './deviceStore.js';
import { createSession } from './session.js';
import { MY_DAY_KEY } from '../myDay/keys.js';
import { makeCacheQueue } from '../myDay/cacheQueue.js';

const NOW = Date.parse('2026-11-10T17:00:00Z');
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const access = (at, ms) => `${b64url({ alg: 'HS256' })}.${b64url({ id: 7, exp: Math.floor((at + ms) / 1000) })}.sig`;
const USER = { id: 7, username: 'nia', role: 'technician', fullName: 'Nia Test' };
const DAY_KEPT = JSON.stringify({ v: 1, userId: 7, weeks: { '2026-11-08': { visits: [{ id: 1, client_name: 'Sanjay Patel', phone: '(718) 555-0142' }], savedAt: NOW } } });

function memory() {
  const items = new Map();
  return {
    items,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
    async getItemAsync(key) { return items.has(key) ? items.get(key) : null; },
    async setItemAsync(key, value) { items.set(key, value); },
    async deleteItemAsync(key) { items.delete(key); },
    async getItem(key) { return items.has(key) ? items.get(key) : null; },
    async setItem(key, value) { items.set(key, value); },
    async removeItem(key) { items.delete(key); },
    async multiRemove(keys) { for (const key of keys) items.delete(key); },
  };
}

// A phone signed in `savedAgoMs` ago with My day kept, and a session on it whose API answers
// every request with `answer` ({ status, data }) and refresh with `refreshAnswer`
async function phone({ savedAgoMs = 60000, accessLeftMs = 15 * 60 * 1000, answer = { status: 200, data: {} }, refreshAnswer = null } = {}) {
  const SecureStore = memory();
  const AsyncStorage = memory();
  // My day's queue, as storage.js makes it, on the same AsyncStorage
  const myDay = makeCacheQueue({
    read: async () => JSON.parse((await AsyncStorage.getItem(MY_DAY_KEY)) || 'null'),
    write: async (cache) => AsyncStorage.setItem(MY_DAY_KEY, JSON.stringify(cache)),
    remove: async () => AsyncStorage.removeItem(MY_DAY_KEY),
  });
  const store = makeDeviceStore({ SecureStore, AsyncStorage, clearMyDay: myDay.clear });
  await store.writeTokens({ access: access(NOW, accessLeftMs), refresh: 'r0', savedAt: NOW - savedAgoMs });
  await store.writeUser(USER);
  await AsyncStorage.setItem(MY_DAY_KEY, DAY_KEPT);
  const http = {
    async refresh() { return refreshAnswer || { status: 401, data: { error: 'Invalid refresh token', code: 'refresh_invalid' } }; },
    async logout() { return { status: 200, data: { success: true } }; },
  };
  const session = createSession({ store, http, now: () => NOW, sleep: async () => {} });
  const api = axios.create({
    baseURL: 'http://stand.test',
    adapter: async (config) => {
      const response = { ...answer, statusText: String(answer.status), headers: {}, config, request: {} };
      if (answer.status < 300) return response;
      throw new AxiosError(`Request failed with status code ${answer.status}`, 'ERR_BAD_RESPONSE', config, {}, response);
    },
  });
  session.attach(api);
  const ended = new Promise((resolve) => session.onEnd(resolve));
  return { SecureStore, AsyncStorage, store, session, api, ended, myDay };
}

const nothingKept = (p) => {
  assert.equal(p.AsyncStorage.items.has(MY_DAY_KEY), false, 'My day kept for offline is gone');
  assert.equal(p.AsyncStorage.items.has('user'), false, 'the profile is gone');
  assert.deepEqual([...p.SecureStore.items.keys()], [], 'the tokens are gone');
};
const within = (promise, ms = 2000) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('timeout'), ms))]);

test('clear() takes My day kept for offline along with the tokens and the profile', async () => {
  const p = await phone();
  assert.equal(p.AsyncStorage.items.get(MY_DAY_KEY), DAY_KEPT);
  await p.store.clear();
  nothingKept(p);
});

test('sign out: My day kept for offline goes', async () => {
  const p = await phone();
  assert.equal((await p.session.load()).signedIn, true);
  await p.session.signOut();
  nothingKept(p);
});

test('the server ends the session (account blocked): My day kept for offline goes', async () => {
  const p = await phone({ answer: { status: 403, data: { error: 'Access to system blocked. Contact administrator.' } } });
  await p.session.load();
  p.api.get('/api/my/visits').catch(() => {});
  assert.equal(await within(p.ended), 'blocked');
  nothingKept(p);
});

test('the refresh token is refused: the session ends, My day kept for offline goes', async () => {
  const p = await phone({ accessLeftMs: -1000 });
  await p.session.load();
  p.api.get('/api/my/visits').catch(() => {});
  assert.equal(await within(p.ended), 'expired');
  nothingKept(p);
});

test('a start after the session ran out (7 days): My day kept for offline goes', async () => {
  const p = await phone({ savedAgoMs: 8 * 24 * 60 * 60 * 1000 });
  assert.equal((await p.session.load()).signedIn, false);
  nothingKept(p);
});

test('sign out while My day is on its way: the answer that comes after is not kept', async () => {
  const p = await phone();
  assert.equal((await p.session.load()).signedIn, true);
  const asked = p.myDay.mark();                     // the day screen asks the server
  await p.session.signOut();
  nothingKept(p);
  // the answer comes now, and the screen keeps it as it always does
  const week = JSON.parse(DAY_KEPT).weeks;
  await p.myDay.update((cache) => ({ v: 1, userId: 7, ...(cache || {}), weeks: week }), asked);
  nothingKept(p);
});

test('a write running when the session ends: My day goes after it', async () => {
  const p = await phone({ answer: { status: 403, data: { error: 'Access to system blocked. Contact administrator.' } } });
  assert.equal((await p.session.load()).signedIn, true);
  const writing = p.myDay.update((cache) => ({ ...cache, cards: { 4: { card: { id: 4 } } } }), p.myDay.mark());
  p.api.get('/api/my/visits').catch(() => {});       // the server has turned the account off
  assert.equal(await within(p.ended), 'blocked');
  await writing;
  nothingKept(p);
});
