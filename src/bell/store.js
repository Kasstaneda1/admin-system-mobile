// The bell's unread count: the number on the Notifications tab (APP-1). The list sets it from
// every answer of the server (feed, read, unread); the other tabs ask the server for it, at most
// once a minute (the feed's first item only: unread_count comes with it). As estimate/unread.js.
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bellAPI } from '../services/api';
import { awaySince } from './away';
import { unreadOf } from './model';

const REFRESH_MS = 60 * 1000;
let count = 0;
let asked = 0;
const listeners = new Set();

export function setBellCount(n) {
  const next = Number.isInteger(n) && n > 0 ? n : 0;
  if (next === count) return;
  count = next;
  listeners.forEach((l) => l());
}
// From an answer of the server that says it (nothing when it did not)
export function setBellFrom(answer) {
  const n = unreadOf(answer);
  if (n !== null) { asked = Date.now(); setBellCount(n); }
}

// From the server, not more than once a minute; no answer — the count stays
export async function refreshBell({ force = false } = {}) {
  if (!force && Date.now() - asked < REFRESH_MS) return;
  asked = Date.now();
  try {
    setBellFrom(await bellAPI.feed('unread', null, 1));
  } catch {
    // offline, signed out or a server failure: keep what was shown
  }
}

// A visit opened: its items are read on the server (NT §7 — the app sends it on every opening);
// quiet, the count follows the answer
export async function readVisit(id) {
  if (!Number.isSafeInteger(Number(id))) return;
  try {
    setBellFrom(await bellAPI.read({ target: { type: 'visit', id: Number(id) } }));
  } catch {
    // nothing: the next opening sends it again
  }
}

// Sign out: the next person starts from nothing
export function clearBell() { asked = 0; setBellCount(0); setAway(null); }

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const useBellCount = () => useSyncExternalStore(subscribe, () => count);

// ---------- «Since you were off» (bell/away.js) ----------
// The last time this person had the app open, on this phone; at a return after 16 hours or more
// the unread items are read once and the panel shows on My day until «Got it»
const LAST_OPEN = (userId) => `bell.lastOpen.${userId}`;
let away = null;               // { since, items } or null
const awayListeners = new Set();
const setAway = (next) => { away = next; awayListeners.forEach((l) => l()); };

export async function checkAway(userId, nowMs = Date.now()) {
  if (userId === null || userId === undefined) return;
  let last = null;
  try { last = Number(await AsyncStorage.getItem(LAST_OPEN(userId))); } catch { last = null; }
  try { await AsyncStorage.setItem(LAST_OPEN(userId), String(nowMs)); } catch { /* the next return compares with an older moment */ }
  const since = awaySince(last, nowMs);
  if (since === null) return;
  try {
    const page = await bellAPI.feed('unread', null, 100);
    setBellFrom(page);
    setAway({ since, items: Array.isArray(page.items) ? page.items : [] });
  } catch {
    // no answer: nothing to show this time
  }
}
export function dismissAway() { setAway(null); }
const subscribeAway = (l) => { awayListeners.add(l); return () => awayListeners.delete(l); };
export const useAway = () => useSyncExternalStore(subscribeAway, () => away);
