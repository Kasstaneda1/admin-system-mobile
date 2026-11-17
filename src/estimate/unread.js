// How many of this technician's Parts estimates have messages they have not read (spec §5): the
// count on the Parts tab. Parts sets it from its own list; My day asks the server for it, at most
// once a minute (the same query as Parts, estimate/model.js unreadCount).
import { useSyncExternalStore } from 'react';
import { partsAPI } from '../services/api';
import { estimatesOf, partsQuery } from '../parts/model';
import { unreadCount } from './model';

const REFRESH_MS = 60 * 1000;
let count = 0;
let asked = 0;
const listeners = new Set();

export function setUnread(n) {
  const next = Number.isInteger(n) && n > 0 ? n : 0;
  if (next === count) return;
  count = next;
  listeners.forEach((l) => l());
}

// From a list the app already has (Parts)
export const setUnreadFrom = (estimates) => { asked = Date.now(); setUnread(unreadCount(estimates)); };

// From the server, not more than once a minute; no answer — the count stays
export async function refreshUnread(fullName, { force = false } = {}) {
  if (!force && Date.now() - asked < REFRESH_MS) return;
  asked = Date.now();
  try {
    setUnread(unreadCount(estimatesOf(await partsAPI.list(partsQuery(fullName)))));
  } catch {
    // offline or a server failure: keep what was shown
  }
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const useUnread = () => useSyncExternalStore(subscribe, () => count);
