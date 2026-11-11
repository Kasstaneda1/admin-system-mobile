// «New» and «Updated» on the rows of My day, and their count on the My day tab
// (NOTIFICATIONS_DESIGN.md §6.2 «Что считает приложение», N3-APP; design
// design-mockups/notifications/app.html and its README «Приложение техника»). No push here:
// the app sees a change when it reads the list (back from the background, every minute on
// My day, pull down). Without React Native (fresh.test.mjs); seenStore.js keeps the state.
//
// What the phone keeps (SEEN_KEY, apart from the day's cache): visit ids, days and moments,
// no customer data. { v: 1, userId, weeks: { sunday: at }, seen: { id: { at, day } }, days: { date: at } }
//   weeks — the weeks this phone has read from the server for this technician, and when it
//           first did. The first read of a week only learns its visits: nothing on it is new
//           to the technician (the first day with the app, a week opened for the first time).
//   seen  — per visit, the moment of the data the technician last had of it (when the phone
//           first learned of it, then each time its card was opened: the card's data moment)
//           and the day it was on then (null: known only as a grey row of the day log).
//   days  — per day, the moment of the data of the last time the day's list was on the screen.
// Moments are by the server's clock (savedAt: the phone's clock + skew).
//
// NEW on a live row — the technician has not had the visit on this day: the phone did not
//           know it (the office gave it to him, or moved it here from a week never opened),
//           or knew it on another day (moved here), or only as a grey row (given back to him).
// UPDATED — the office changed what the visit says, or moved its time on the same day, after
//           the moment seen: content_changed_at (backend #150: the last `updated`,
//           `customer_updated` or `rescheduled` by someone else) later than it. A server
//           without the field: no UPDATED, NEW still works.
//           One mark a row, NEW first. Both go when the technician opens the card
//           (VisitScreen → markSeen). Live rows: planned, on the way, on site.
// NEW on a grey row of the day log (backend #139: moved off the day, given to another,
//           cancelled, «the customer moved it») — the office did it after the day's list was
//           last on the screen (office_change.changed_at later than days[date], or than the
//           week's first read for a day not shown yet). Such a row cannot be opened and says
//           all there is, so its NEW goes when the day is shown the next time: while the day
//           stays on the screen the screen keeps the moment it had when the showing began.
// NOTE    — a live row with office messages this technician has not seen yet
//           (unseen_office_messages, backend #152: per technician, 0 on grey rows). The server
//           counts it, so NOTE goes when the messages are seen (the card marks those really on
//           the screen, officeSeen.js) and the list is read again. It needs nothing the phone
//           keeps: a week read for the first time shows it too. One mark a row: NEW, then
//           UPDATED, then NOTE.
// Today and later only; a closed visit gets none.
import { isLogged, rowKey, stateOf, visitDay } from './model.js';

export const SEEN_V = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_KEEP_MS = 60 * DAY_MS;   // a week or a day not read for this long is learned anew
export const SEEN_KEEP_MS = 120 * DAY_MS;  // a visit seen this long ago is forgotten
export const SEEN_MAX = 3000;              // and never more than this many visits

const LIVE = new Set(['sched', 'onway', 'onsite']);

const validId = (id) => Number.isInteger(id) && id > 0;
const validAt = (at) => Number.isFinite(at) && at > 0;
const validDay = (day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day);
const isMine = (state, userId) => !!(userId != null && state && state.v === SEEN_V && state.userId === userId && state.weeks && state.seen);

// The state of this technician, or a fresh one (another technician signed in on the phone,
// an unknown shape); a state from before `days` gets it
function own(state, userId) {
  if (!isMine(state, userId)) return { v: SEEN_V, userId, weeks: {}, seen: {}, days: {} };
  return state.days ? state : { ...state, days: {} };
}

// Old weeks, days and visits go; the most recent SEEN_MAX visits stay
function pruned(state, at) {
  const recent = (map, keep) => Object.fromEntries(Object.entries(map).filter(([, t]) => at - t < keep));
  let entries = Object.entries(state.seen).filter(([, e]) => e && at - e.at < SEEN_KEEP_MS);
  if (entries.length > SEEN_MAX) entries = entries.sort((a, b) => b[1].at - a[1].at).slice(0, SEEN_MAX);
  return { ...state, weeks: recent(state.weeks, WEEK_KEEP_MS), days: recent(state.days, WEEK_KEEP_MS), seen: Object.fromEntries(entries) };
}

// The server's answer for a week (MyDayScreen, after every read). The first read of the week
// learns every visit in it that the phone does not know yet, on its day, seen at `at`: nothing
// new. Later reads change nothing here: what the phone does not know stays new until the card
// is opened. Returns the same object when nothing changes (nothing to write).
export function noteWeek(state, userId, sunday, visits, at) {
  if (userId == null || !validDay(sunday) || !validAt(at)) return state;
  const mine = own(state, userId);
  if (mine.weeks[sunday]) return mine === state ? state : mine;
  const liveDay = new Map();
  for (const v of visits || []) if (v && validId(v.id) && !isLogged(v)) liveDay.set(v.id, visitDay(v));
  const seen = { ...mine.seen };
  for (const v of visits || []) {
    if (v && validId(v.id) && !(v.id in seen)) seen[v.id] = { at, day: liveDay.get(v.id) || null };
  }
  return pruned({ ...mine, weeks: { ...mine.weeks, [sunday]: at }, seen }, at);
}

// The technician had these visits on the screen with the data of the moment `at` (the card
// opened): items [{ id, day }], day: the day the visit was on in that data. They are no longer
// new, and what the office changed before `at` is seen. A moment never goes back: a card shown
// from an older read (offline) changes nothing.
export function markSeen(state, userId, items, at) {
  if (userId == null || !validAt(at)) return state;
  const mine = own(state, userId);
  const todo = (items || []).filter((it) => it && validId(it.id) && !(mine.seen[it.id] && mine.seen[it.id].at >= at));
  if (!todo.length) return mine === state ? state : mine;
  const seen = { ...mine.seen };
  for (const it of todo) seen[it.id] = { at, day: validDay(it.day) ? it.day : null };
  return pruned({ ...mine, seen }, at);
}

// The day's list was on the screen with the data of the moment `at`: the grey rows the office
// made before it are seen (their NEW goes at the day's next showing). Never goes back.
export function noteShown(state, userId, date, at) {
  if (userId == null || !validDay(date) || !validAt(at)) return state;
  const mine = own(state, userId);
  if (mine.days[date] >= at) return mine === state ? state : mine;
  return pruned({ ...mine, days: { ...mine.days, [date]: at } }, at);
}

// The moment a day was last shown, else the first read of its week; null: the week is not read
// yet (no marks at all). The screen takes it when a showing of the day begins.
export function shownAt(state, userId, sunday, date) {
  if (!isMine(state, userId) || !state.weeks[sunday]) return null;
  const day = state.days && state.days[date];
  return Number.isFinite(day) ? day : state.weeks[sunday];
}

const momentOf = (iso) => (typeof iso === 'string' ? Date.parse(iso) : NaN);

// The marks of a week's list: { [rowKey]: 'new' | 'updated' | 'note' } (rowKey: model.js, the
// list's key: a visit moved within the week has a grey row and a live row). Today and later
// only. A week this phone has not read yet (its first answer is on the way) has only NOTE.
// visits: the server's list of the week (GET /api/my/visits); now: New York { date, minutes };
// showing: { day, before } of the day on the screen — the moment it had when the showing
// began (null: the week was not read yet then), so the day's grey rows keep their NEW while
// it stays there.
export function freshMarks(state, userId, sunday, visits, now, showing = null) {
  const marks = {};
  const known = isMine(state, userId) && !!state.weeks[sunday];
  for (const v of visits || []) {
    if (!v || !validId(v.id)) continue;
    const day = visitDay(v);
    if (!day || day < now.date) continue;
    const unseen = !isLogged(v) && LIVE.has(stateOf(v)) && Number(v.unseen_office_messages) > 0;
    if (!known) {
      if (unseen) marks[rowKey(v)] = 'note';
      continue;
    }
    if (isLogged(v)) {
      // a showing that began before the week's first read has no moment: the first read is it
      const before = showing && showing.day === day ? (Number.isFinite(showing.before) ? showing.before : state.weeks[sunday]) : shownAt(state, userId, sunday, day);
      const at = momentOf(v.office_change.changed_at);
      if (Number.isFinite(before) && Number.isFinite(at) && at > before) marks[rowKey(v)] = 'new';
      continue;
    }
    if (!LIVE.has(stateOf(v))) continue;
    const entry = state.seen[v.id];
    if (!entry || entry.day !== day) {
      marks[rowKey(v)] = 'new';
      continue;
    }
    const changed = momentOf(v.content_changed_at);
    if (Number.isFinite(changed) && changed > entry.at) marks[rowKey(v)] = 'updated';
    else if (unseen) marks[rowKey(v)] = 'note';
  }
  return marks;
}

// The days with a mark { 'YYYY-MM-DD': n } (the week's dots) and how many visits have one in
// all (the tab's count): a visit with a grey row on one day and NEW on another is one
export function freshCounts(marks, visits) {
  const byDay = {};
  const ids = new Set();
  const rows = new Set();
  for (const v of visits || []) {
    if (!v) continue;
    const key = rowKey(v);
    if (!marks[key] || rows.has(key)) continue;
    rows.add(key);
    ids.add(v.id);
    const day = visitDay(v);
    byDay[day] = (byDay[day] || 0) + 1;
  }
  return { byDay, total: ids.size };
}

// The words: the row's pill (in capitals there, as the design's) and VoiceOver, the tab's count
export const FRESH_TEXT = { new: 'New', updated: 'Updated', note: 'Note' };
export const badgeText = (total) => (total > 9 ? '9+' : String(total));
export function tabLabel(total) {
  return total > 0 ? `My day, ${total} new or changed` : 'My day';
}
// VoiceOver of a mark: NOTE says what it is
export function markLabel(kind) {
  return kind === 'note' ? 'New office note' : FRESH_TEXT[kind] || '';
}
