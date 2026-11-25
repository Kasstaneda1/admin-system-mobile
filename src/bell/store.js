// The bell's unread count: the number on the Notifications tab (APP-1). The list sets it from
// every answer of the server (feed, read, unread); the other tabs ask the server for it, at most
// once a minute (the feed's first item only: unread_count comes with it). As estimate/unread.js.
import { useSyncExternalStore } from 'react';
import { bellAPI } from '../services/api';
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
export function clearBell() { asked = 0; setBellCount(0); }

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const useBellCount = () => useSyncExternalStore(subscribe, () => count);
