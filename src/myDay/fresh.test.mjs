// node --test: «New» and «Updated» on My day without the screen (fresh.js). The week is the
// design's: Sunday Nov 8 2026, today Tuesday Nov 10, 11:20 in New York.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  noteWeek, markSeen, noteShown, shownAt, freshMarks, freshCounts, tabLabel, badgeText, markLabel, FRESH_TEXT, SEEN_V, SEEN_MAX, WEEK_KEEP_MS, SEEN_KEEP_MS,
} from './fresh.js';
import { buildDay, rowKey } from './model.js';

const SUN = '2026-11-08';
const TUE = '2026-11-10';
const WED = '2026-11-11';
const NOW = { date: TUE, minutes: 11 * 60 + 20 };
const AT = (iso) => Date.parse(iso);
const T0 = AT('2026-11-10T13:00:00Z');   // 8:00 in New York: the first read of the day
const HOUR = 60 * 60 * 1000;
const ME = 7;

// A visit as GET /api/my/visits gives it (the fields fresh.js reads)
function visit(id, o = {}) {
  const date = o.date || TUE;
  return {
    id, role: o.role || 'main', status: o.status || 'scheduled', outcome: null,
    scheduled_start: `${date} ${o.w0 || '13:00'}:00`, scheduled_end: `${date} ${o.w1 || '16:00'}:00`,
    planned_start: null, duration_minutes: 60,
    ...('changed' in o ? { content_changed_at: o.changed } : {}),
    ...('unseen' in o ? { unseen_office_messages: o.unseen } : {}),
    ...('office_change' in o ? { office_change: o.office_change } : {}),
  };
}
// The marks by visit, to read the tests: a live row by its id, a grey row as 'id@day'
const DAY_NAME = { [TUE]: 'TUE', [WED]: 'WED' };
function byVisit(marks, list) {
  const out = {};
  for (const v of list) {
    if (!marks[rowKey(v)]) continue;
    const day = v.scheduled_start.slice(0, 10);
    out[v.office_change ? `${v.id}@${DAY_NAME[day] || day}` : String(v.id)] = marks[rowKey(v)];
  }
  return out;
}
const WEEK = () => [visit(1, { status: 'completed' }), visit(2, { status: 'omw' }), visit(3), visit(4, { date: WED })];
const marked = (s, list, showing) => byVisit(freshMarks(s, ME, SUN, list, NOW, showing), list);

test('the first read of a week learns it: nothing on it is new', () => {
  const s = noteWeek(null, ME, SUN, WEEK(), T0);
  assert.equal(s.v, SEEN_V);
  assert.equal(s.userId, ME);
  assert.deepEqual(s.weeks, { [SUN]: T0 });
  assert.deepEqual(s.seen, { 1: { at: T0, day: TUE }, 2: { at: T0, day: TUE }, 3: { at: T0, day: TUE }, 4: { at: T0, day: WED } });
  assert.deepEqual(s.days, {});
  assert.deepEqual(marked(s, WEEK()), {});
  // a week not read yet (its answer is on the way) has no marks at all
  assert.deepEqual(freshMarks(s, ME, '2026-11-15', [visit(9, { date: '2026-11-16' })], NOW), {});
  assert.deepEqual(freshMarks(null, ME, SUN, WEEK(), NOW), {});
  assert.equal(shownAt(s, ME, '2026-11-15', '2026-11-16'), null);
});

test('a visit the phone did not know is NEW; reading again changes nothing; opening it clears it', () => {
  let s = noteWeek(null, ME, SUN, WEEK(), T0);
  const later = [...WEEK(), visit(5, { date: WED, w0: '09:00', w1: '12:00' })];
  const t1 = T0 + HOUR;
  assert.equal(noteWeek(s, ME, SUN, later, t1), s, 'a later read writes nothing');
  assert.deepEqual(marked(s, later), { 5: 'new' });
  // the card opened: the moment of its data
  s = markSeen(s, ME, [{ id: 5, day: WED }], t1 + 1000);
  assert.deepEqual(marked(s, later), {});
  assert.deepEqual(s.seen[5], { at: t1 + 1000, day: WED });
});

test('UPDATED: the office changed the visit after the moment seen; the card opened clears it', () => {
  let s = noteWeek(null, ME, SUN, WEEK(), T0);
  const edited = (changed) => [visit(1, { status: 'completed' }), visit(2, { status: 'omw' }), visit(3, { changed }), visit(4, { date: WED })];
  assert.deepEqual(marked(s, edited('2026-11-10T14:30:00Z')), { 3: 'updated' });
  // a change before the first read, at the same moment, none, or nonsense: nothing
  assert.deepEqual(marked(s, edited('2026-11-10T12:00:00Z')), {});
  assert.deepEqual(marked(s, edited(new Date(T0).toISOString())), {});
  assert.deepEqual(marked(s, edited(null)), {});
  assert.deepEqual(marked(s, edited('soon')), {});
  assert.deepEqual(marked(s, WEEK()), {}, 'a server without the field: no UPDATED');
  s = markSeen(s, ME, [{ id: 3, day: TUE }], AT('2026-11-10T14:31:00Z'));
  assert.deepEqual(marked(s, edited('2026-11-10T14:30:00Z')), {});
  // the office changes it again after the card was opened
  assert.deepEqual(marked(s, edited('2026-11-10T15:00:00Z')), { 3: 'updated' });
  // a card shown from an older read (offline) does not take the moment back
  assert.equal(markSeen(s, ME, [{ id: 3, day: TUE }], T0), s);
  assert.equal(s.seen[3].at, AT('2026-11-10T14:31:00Z'));
});

test('NEW wins over UPDATED', () => {
  const s = noteWeek(null, ME, SUN, WEEK(), T0);
  const list = [...WEEK(), visit(6, { changed: '2026-11-10T15:00:00Z' })];
  assert.deepEqual(marked(s, list), { 6: 'new' });
});

test('live rows of today and later only: not closed, cancelled, an old task moved, or a past day', () => {
  const s = noteWeek(null, ME, SUN, [], T0);
  const list = [
    visit(11),                                                    // planned today: NEW
    visit(12, { status: 'omw' }),                                 // on the way: NEW
    visit(13, { status: 'in_progress' }),                         // on site: NEW
    visit(14, { role: 'helper', date: WED }),                     // helper tomorrow: NEW
    visit(15, { status: 'completed' }),                           // closed
    visit(16, { status: 'cancelled' }),                           // cancelled
    visit(17, { status: 'rescheduled' }),                         // an old task moved
    visit(18, { date: '2026-11-09' }),                            // yesterday
  ];
  assert.deepEqual(marked(s, list), { 11: 'new', 12: 'new', 13: 'new', 14: 'new' });
});

test('moved: to another day it is NEW there, its time on the same day is UPDATED, and back again is UPDATED', () => {
  let s = noteWeek(null, ME, SUN, WEEK(), T0);
  const changed = '2026-11-10T15:00:00Z';
  // the office moved 4 from Wednesday to today: NEW today (its grey row on Wednesday: below)
  const movedHere = [...WEEK().filter((v) => v.id !== 4), visit(4, { date: TUE, w0: '16:00', w1: '18:00', changed })];
  assert.deepEqual(marked(s, movedHere), { 4: 'new' });
  s = noteWeek(s, ME, SUN, movedHere, T0 + 3 * HOUR);
  assert.deepEqual(marked(s, movedHere), { 4: 'new' }, 'reading again does not clear it');
  // opened on its new day: gone
  assert.deepEqual(marked(markSeen(s, ME, [{ id: 4, day: TUE }], AT('2026-11-10T15:05:00Z')), movedHere), {});
  // 3 moved later on the same day: UPDATED
  const later = [visit(1, { status: 'completed' }), visit(2, { status: 'omw' }), visit(3, { w0: '15:00', w1: '18:00', changed }), visit(4, { date: WED })];
  assert.deepEqual(marked(s, later), { 3: 'updated' });
  // 4 moved to today and back to Wednesday before it was opened: where he saw it, UPDATED
  assert.deepEqual(marked(s, [...WEEK().filter((v) => v.id !== 4), visit(4, { date: WED, changed })]), { 4: 'updated' });
});

test('a visit from a week never opened is NEW; one given back after it was taken away is NEW', () => {
  // 8 was on a week this phone never read; the office moved it to today
  let s = noteWeek(null, ME, SUN, WEEK(), T0);
  assert.deepEqual(marked(s, [...WEEK(), visit(8, { changed: '2026-11-10T15:00:00Z' })]), { 8: 'new' });
  // 9 was taken from him before the first read (only its grey row), then given back
  const taken = [...WEEK(), visit(9, { office_change: { kind: 'reassigned', changed_at: '2026-11-10T12:00:00Z' } })];
  s = noteWeek(null, ME, SUN, taken, T0);
  assert.deepEqual(s.seen[9], { at: T0, day: null });
  assert.deepEqual(marked(s, [...WEEK(), visit(9)]), { 9: 'new' });
  // a week read for the first time learns a visit the phone knew on another day as it was: NEW there
  s = noteWeek(null, ME, SUN, WEEK(), T0);
  const next = [visit(4, { date: '2026-11-16' })];
  s = noteWeek(s, ME, '2026-11-15', next, T0 + 1000);
  assert.deepEqual(s.seen[4], { at: T0, day: WED });
  assert.deepEqual(freshMarks(s, ME, '2026-11-15', next, NOW), { [rowKey(next[0])]: 'new' });
});

test('a grey row of the day log is NEW when the office made it after the day was last shown', () => {
  let s = noteWeek(null, ME, SUN, WEEK(), T0);
  const change = (kind, iso, extra = {}) => ({ office_change: { kind, changed_at: iso, ...extra } });
  // at 10:00 the office moved 4 (Wednesday) to today, cancelled 3 and gave 2 to another
  const list = [
    visit(1, { status: 'completed' }),
    visit(2, { status: 'omw', ...change('reassigned', '2026-11-10T15:00:00Z') }),
    visit(3, { ...change('cancelled', '2026-11-10T15:00:00Z') }),
    visit(4, { date: WED, ...change('moved', '2026-11-10T15:00:00Z', { to_date: TUE }) }),
    visit(4, { date: TUE, w0: '16:00', w1: '18:00', changed: '2026-11-10T15:00:00Z' }),
  ];
  assert.deepEqual(marked(s, list), { '2@TUE': 'new', '3@TUE': 'new', '4@WED': 'new', 4: 'new' });
  // a change made before the week was first read, or at that very moment: nothing
  assert.deepEqual(marked(s, [visit(3, change('cancelled', '2026-11-10T12:00:00Z'))]), {});
  assert.deepEqual(marked(s, [visit(3, change('cancelled', new Date(T0).toISOString()))]), {});
  // today shown at 10:05 (its data of 10:05): while the showing goes on it keeps the moment it
  // began with, so the rows stay NEW; Wednesday was not shown, its row is still NEW
  const before = shownAt(s, ME, SUN, TUE);
  assert.equal(before, T0);
  s = noteShown(s, ME, TUE, AT('2026-11-10T15:05:00Z'));
  assert.deepEqual(marked(s, list, { day: TUE, before }), { '2@TUE': 'new', '3@TUE': 'new', '4@WED': 'new', 4: 'new' });
  // the next showing of today: the grey rows are seen; the live NEW stays until it is opened
  assert.deepEqual(marked(s, list, { day: TUE, before: shownAt(s, ME, SUN, TUE) }), { '4@WED': 'new', 4: 'new' });
  assert.deepEqual(marked(s, list), { '4@WED': 'new', 4: 'new' });
  // the shown moment never goes back; a past day's grey rows are never NEW
  assert.equal(noteShown(s, ME, TUE, T0), s);
  assert.deepEqual(marked(s, [visit(5, { date: '2026-11-09', ...change('cancelled', '2026-11-10T15:00:00Z') })]), {});
  // the first showing ever began before the week's first read (before: null), and the day was
  // noted while it went on: what the office did after the first read is NEW for this showing
  let first = noteWeek(null, ME, SUN, WEEK(), T0);
  first = noteShown(first, ME, TUE, AT('2026-11-10T15:05:00Z'));
  assert.deepEqual(marked(first, list, { day: TUE, before: null }), { '2@TUE': 'new', '3@TUE': 'new', '4@WED': 'new', 4: 'new' });
  // a grey row without a moment: nothing
  assert.deepEqual(marked(s, [visit(6, { date: WED, ...change('cancelled', null) })]), {});
  // the screen's list keys are the same as the marks' (model.js buildDay)
  const shownMarks = freshMarks(s, ME, SUN, list, NOW, { day: TUE, before });
  assert.deepEqual(buildDay(list, TUE, NOW).rows.filter((r) => shownMarks[r.key]).map((r) => `${r.id}${r.logged ? '@log' : ''}`), ['2@log', '3@log', '4']);
});

test('the counts: the days with a mark, and each visit once in all', () => {
  const s = noteWeek(null, ME, SUN, [], T0);
  const list = [visit(21), visit(22, { date: WED }), visit(23, { date: WED }),
    visit(23, { office_change: { kind: 'moved', changed_at: '2026-11-10T15:00:00Z', to_date: WED } }), visit(24, { status: 'completed' })];
  const marks = freshMarks(s, ME, SUN, list, NOW);
  // 23: NEW on Wednesday and its grey row today — two days with a dot, one visit in the count
  assert.deepEqual(freshCounts(marks, list), { byDay: { [TUE]: 2, [WED]: 2 }, total: 3 });
  assert.deepEqual(freshCounts({}, list), { byDay: {}, total: 0 });
  assert.deepEqual(freshCounts(marks, null), { byDay: {}, total: 0 });
  // the same row twice in an answer (never expected): still one
  assert.deepEqual(freshCounts(marks, [...list, visit(21)]), { byDay: { [TUE]: 2, [WED]: 2 }, total: 3 });
  assert.equal(tabLabel(0), 'My day');
  assert.equal(tabLabel(3), 'My day, 3 new or changed');
  assert.deepEqual([1, 9, 10, 42].map(badgeText), ['1', '9', '9+', '9+']);
});

test('another technician on the phone starts afresh; the first one\'s marks are not shown to him', () => {
  const s = noteWeek(null, ME, SUN, WEEK(), T0);
  assert.deepEqual(freshMarks(s, 8, SUN, WEEK(), NOW), {});
  assert.equal(shownAt(s, 8, SUN, TUE), null);
  const his = noteWeek(s, 8, SUN, [visit(31)], T0 + 1000);
  assert.equal(his.userId, 8);
  assert.deepEqual(his.seen, { 31: { at: T0 + 1000, day: TUE } });
  assert.deepEqual(markSeen(null, 8, [{ id: 31, day: TUE }], T0).seen, { 31: { at: T0, day: TUE } });
  assert.deepEqual(markSeen(null, 8, [{ id: 31, day: 'soon' }], T0).seen, { 31: { at: T0, day: null } });
  assert.deepEqual(noteShown(null, 8, TUE, T0).days, { [TUE]: T0 });
  // a state kept before `days` came gets it
  const old = { v: SEEN_V, userId: ME, weeks: { [SUN]: T0 }, seen: {} };
  assert.deepEqual(noteShown(old, ME, TUE, T0 + 1).days, { [TUE]: T0 + 1 });
  assert.equal(shownAt(old, ME, SUN, TUE), T0);
  // no technician, no moment, an odd id or day: nothing
  assert.equal(noteWeek(s, null, SUN, WEEK(), T0), s);
  assert.equal(noteWeek(s, ME, SUN, WEEK(), NaN), s);
  assert.equal(noteWeek(s, ME, 'Sunday', WEEK(), T0 + 5), s);
  assert.equal(markSeen(s, ME, [{ id: 'x' }, { id: -1 }, null], T0 + 5), s);
  assert.equal(noteShown(s, ME, 'today', T0 + 5), s);
  assert.equal(noteShown(s, null, TUE, T0 + 5), s);
});

test('the phone forgets old weeks, days and visits, and keeps at most SEEN_MAX visits', () => {
  let s = noteWeek(null, ME, '2026-08-30', [visit(41, { date: '2026-08-31' })], T0 - WEEK_KEEP_MS - 1000);
  s = noteShown(s, ME, '2026-08-31', T0 - WEEK_KEEP_MS - 1000);
  s = markSeen(s, ME, [{ id: 42, day: '2026-07-01' }], T0 - SEEN_KEEP_MS - 1000);
  s = noteWeek(s, ME, SUN, WEEK(), T0);
  assert.deepEqual(Object.keys(s.weeks), [SUN]);
  assert.deepEqual(s.days, {});
  assert.ok(41 in s.seen, 'a visit seen within SEEN_KEEP_MS stays');
  assert.ok(!(42 in s.seen));
  const many = Array.from({ length: SEEN_MAX + 5 }, (_, i) => visit(1000 + i));
  const big = noteWeek(null, ME, SUN, many, T0);
  assert.equal(Object.keys(big.seen).length, SEEN_MAX);
});

test('NOTE: an office message not seen yet, the third mark — after NEW and UPDATED, before nothing', () => {
  const s = noteWeek(null, ME, SUN, WEEK(), T0);
  const changed = '2026-11-10T15:00:00Z';
  const list = [
    visit(1, { status: 'completed', unseen: 2 }),                // closed: none
    visit(2, { status: 'omw', unseen: 1 }),                      // on the way: NOTE
    visit(3, { unseen: 3, changed }),                            // changed too: UPDATED wins
    visit(4, { date: WED, unseen: 0 }),                          // all seen: none
    visit(5, { unseen: 1 }),                                     // a visit the phone did not know: NEW wins
    visit(6, { date: '2026-11-09', unseen: 1 }),                 // yesterday: none
    visit(7, { unseen: 2, office_change: { kind: 'reassigned', changed_at: '2026-11-10T12:00:00Z' } }), // a grey row: none
    visit(8, { date: WED, unseen: '2' }),                        // a number as text still counts
    visit(9, { date: WED, unseen: null }),                       // a server without the field: none
  ];
  // 8 and 9 are new to the phone (not in WEEK): NEW
  assert.deepEqual(marked(s, list), { 2: 'note', 3: 'updated', 5: 'new', 8: 'new', 9: 'new' });
  // 8 known: its NOTE shows
  const s8 = markSeen(s, ME, [{ id: 8, day: WED }, { id: 9, day: WED }], T0 + 1000);
  assert.deepEqual(marked(s8, list), { 2: 'note', 3: 'updated', 5: 'new', 8: 'note' });
  // NOTE needs nothing the phone keeps: the week's first answer, another technician, no state at all
  const first = [visit(2, { status: 'omw', unseen: 1 }), visit(3, { changed }), visit(4, { date: WED, unseen: 1 }),
    visit(7, { unseen: 2, office_change: { kind: 'cancelled', changed_at: changed } }), visit(1, { status: 'completed', unseen: 1 })];
  assert.deepEqual(marked(null, first), { 2: 'note', 4: 'note' });
  assert.deepEqual(byVisit(freshMarks(s, 99, SUN, first, NOW), first), { 2: 'note', 4: 'note' });
  // counted like the others
  assert.deepEqual(freshCounts(freshMarks(s8, ME, SUN, list, NOW), list), { byDay: { [TUE]: 3, [WED]: 1 }, total: 4 });
  // the words
  assert.equal(FRESH_TEXT.note, 'Note');
  assert.deepEqual(['new', 'updated', 'note', 'x'].map(markLabel), ['New', 'Updated', 'New office note', '']);
});
