// What the phone remembers of a day's route while the app runs (route.js): the latest route
// the server gave, shown at once and offline with its time, and the hints answered on this
// phone (It's OK, Tell the office). Per technician and day, in memory only: nothing is
// written to the phone's storage, so a new start asks the server again and shows the hints
// again (v1).
const routes = new Map();
const marks = new Map();
const keyOf = (userId, date) => `${userId}|${date}`;

export function keepRoute(userId, date, route, savedAt) {
  routes.set(keyOf(userId, date), { route, savedAt });
}
export function keptRoute(userId, date) {
  return routes.get(keyOf(userId, date)) || null;
}
// { [flagKey]: 'ok' | 'sent' }
export function marksOf(userId, date) {
  return { ...(marks.get(keyOf(userId, date)) || {}) };
}
export function markHint(userId, date, key, mark) {
  marks.set(keyOf(userId, date), { ...(marks.get(keyOf(userId, date)) || {}), [key]: mark });
}
