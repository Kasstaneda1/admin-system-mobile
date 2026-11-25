import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_WORDS, bellTabLabel, dayWord, daysOf, initialsOf, itemView, lineText, markedAllRead, markedRead, markedUnread,
  mergeItems, unreadOf, windowWords,
} from './model.js';

const TODAY = '2026-11-11';
// 11:02 AM in New York is 16:02Z in November
const item = (o = {}) => ({ id: 1, kind: 'M1', target: { type: 'estimate', id: 1234 }, anchor_id: 77, data: {}, actor_ids: [5], actor_count: 1,
  event_at: '2026-11-11T16:02:00.000Z', read_at: null, removed: false, version: 3, ...o });
const words = (view) => view.line.map((p) => p.text).join('');

test('dayWord / windowWords: today, tomorrow, a weekday within a week, a date further', () => {
  assert.equal(dayWord('2026-11-11', TODAY), 'today');
  assert.equal(dayWord('2026-11-12', TODAY), 'tomorrow');
  assert.equal(dayWord('2026-11-10', TODAY), 'yesterday');
  assert.equal(dayWord('2026-11-13', TODAY), 'Fri');
  assert.equal(dayWord('2026-11-20', TODAY), 'Nov 20');
  assert.equal(windowWords('2026-11-11T15:00', '2026-11-11T18:00', TODAY), 'today 3–6 PM');
  assert.equal(windowWords('2026-11-12T09:00', '2026-11-12T12:00', TODAY), 'tomorrow 9–12 PM');
  assert.equal(windowWords('2026-11-11T09:00', null, TODAY), 'today 9:00 AM');
  assert.equal(windowWords(null, null, TODAY), '');
});

test('initialsOf: two letters from the first and last word', () => {
  assert.equal(initialsOf('Anna S.'), 'AS');
  assert.equal(initialsOf('Mike'), 'M');
  assert.equal(initialsOf('  '), null);
  assert.equal(initialsOf(null), null);
});

test('M1: the author, the estimate, the words in quotes; opens the estimate at the message', () => {
  const v = itemView(item({ data: { estimate_number: 1234, author: 'Anna S.', text: 'Ivan, is the pump the same as on Rossi’s washer?', customer: 'Anna Rossi' } }), { today: TODAY });
  assert.equal(words(v), 'Anna S. mentioned you in Estimate #1234:');
  assert.equal(v.quote, 'Ivan, is the pump the same as on Rossi’s washer?');
  assert.deepEqual(v.avatar, { initials: 'AS' });
  assert.equal(v.sub, 'Rossi A. · 11:02 AM');
  assert.deepEqual(v.open, { screen: 'Estimate', id: 1234, focus: 'messages', commentId: 77 });
  assert.equal(v.unread, true);
  assert.equal(lineText(v), 'Anna S. mentioned you in Estimate #1234: “Ivan, is the pump the same as on Rossi’s washer?”');
});

test('E1 and T7 as the server writes them today (only the number) and with author, customer, part', () => {
  assert.equal(words(itemView(item({ kind: 'E1', data: { estimate_number: 1201 } }))), 'You were assigned Estimate #1201');
  const e1 = itemView(item({ kind: 'E1', data: { estimate_number: 1201, author: 'Anna S.', customer: 'Javier Ortiz' } }));
  assert.equal(words(e1), 'Anna S. assigned you Estimate #1201');
  assert.equal(e1.sub, 'Ortiz J. · 11:02 AM');
  const t7 = itemView(item({ kind: 'T7', data: { estimate_number: 1188 } }));
  assert.equal(words(t7), 'Part arrived for Estimate #1188');
  assert.deepEqual(t7.avatar, { icon: 'box', tone: 'part' });
  assert.equal(t7.sub, '11:02 AM');
  assert.deepEqual(t7.open, { screen: 'Estimate', id: 1234, highlight: 'arrived' });
  const t7full = itemView(item({ kind: 'T7', data: { estimate_number: 1188, part: 'drain pump', part_number: 'DC97-17025', customer: 'Kim Jones', author: null } }));
  assert.equal(words(t7full), 'Part arrived for Estimate #1188: drain pump DC97-17025');
  assert.equal(t7full.sub, 'Jones K. · 11:02 AM');
  assert.equal(words(itemView(item({ kind: 'T7', data: { estimate_number: 1188, part_number: 'DC97-17025' } }))), 'Part arrived for Estimate #1188: DC97-17025');
});

test('T1–T6 by the Architect\'s data (NT): the office\'s words, the window, opens the visit', () => {
  const visit = { type: 'visit', id: 41 };
  const t1 = itemView(item({ kind: 'T1', target: visit, data: { visit_kind: 'repair', customer: 'Kim Brooks', start: '2026-11-11T15:00', end: '2026-11-11T18:00' } }), { today: TODAY });
  assert.equal(words(t1), 'The office added a visit for you: Brooks K. · today 3–6 PM');
  assert.equal(t1.sub, 'Repair · 11:02 AM');
  assert.deepEqual(t1.open, { screen: 'Visit', id: 41 });
  const t2 = itemView(item({ kind: 'T2', target: visit, data: { customer: 'Lena Haddad', start: '2026-11-12T09:00', end: '2026-11-12T12:00', was_start: '2026-11-11T17:00', was_end: '2026-11-11T20:00' } }), { today: TODAY });
  assert.equal(words(t2), 'The office moved Haddad L. to tomorrow 9–12 PM');
  assert.equal(t2.sub, 'Was today 5–8 PM · 11:02 AM');
  const t5 = itemView(item({ kind: 'T5', target: visit, data: { customer: 'Paula Silva', author: 'Mike T.', text: 'Call the customer 10 min before.', start: '2026-11-11T17:00', end: '2026-11-11T20:00' } }), { today: TODAY });
  assert.equal(words(t5), 'Mike T. left a note on Silva P.:');
  assert.equal(t5.quote, 'Call the customer 10 min before.');
  assert.deepEqual(t5.avatar, { initials: 'MT' });
  assert.equal(t5.sub, 'Visit today 5–8 PM · 11:02 AM');
  const t6 = itemView(item({ kind: 'T6', target: visit, data: { customer: 'Thanh Nguyen', fields: ['address', 'access'], start: '2026-11-11T13:00', end: '2026-11-11T16:00' } }), { today: TODAY });
  assert.equal(words(t6), 'The office changed the address and the access notes of Nguyen T.');
  const t3 = itemView(item({ kind: 'T3', target: visit, data: { customer: 'Min Lee', reason: 'reassigned', start: '2026-11-12T10:00', end: '2026-11-12T13:00' } }), { today: TODAY });
  assert.equal(words(t3), 'Lee M. · tomorrow 10–1 PM went to another technician');
  assert.deepEqual(t3.open, { screen: 'MyDay', date: '2026-11-12' }, 'not their visit any more: the day where its grey row is');
  assert.equal(words(itemView(item({ kind: 'T3', target: visit, data: { customer: 'Min Lee', reason: 'helper_removed' } }))), 'You are off Lee M.: no helper needed');
  assert.equal(words(itemView(item({ kind: 'T4', target: visit, data: { customer: 'Min Lee', reason: 'cancelled', start: '2026-11-13T10:00', end: '2026-11-13T13:00' } }), { today: TODAY })),
    'The office cancelled Lee M. · Fri 10–1 PM');
  assert.equal(words(itemView(item({ kind: 'T4', target: visit, data: { customer: 'Min Lee', reason: 'client_rescheduled' } }))), 'Lee M. rescheduled');
});

test('a kind the app does not know: one plain line that still opens its target', () => {
  const v = itemView(item({ kind: 'T10', target: { type: 'visit', id: 9 } }));
  assert.equal(words(v), 'Your visit changed');
  assert.deepEqual(v.open, { screen: 'Visit', id: 9 });
  assert.equal(words(itemView(item({ kind: 'Z9', target: { type: 'task', id: 3 } }))), 'Something changed for you');
  assert.equal(itemView(item({ kind: 'Z9', target: { type: 'task', id: 3 } })).open, null);
  // no data at all
  assert.equal(words(itemView(item({ data: null }))), 'Someone mentioned you in an estimate');
});

test('mergeItems: one per id, the newer version wins, removed out, newest first', () => {
  const a = item({ id: 1, event_at: '2026-11-11T10:00:00Z', version: 1 });
  const b = item({ id: 2, event_at: '2026-11-11T12:00:00Z', version: 2 });
  const a2 = item({ id: 1, event_at: '2026-11-11T13:00:00Z', version: 5 });
  assert.deepEqual(mergeItems([a, b], [a2]).map((i) => [i.id, i.version]), [[1, 5], [2, 2]]);
  assert.deepEqual(mergeItems([a2], [a]).map((i) => i.version), [5], 'an older copy from a later page does not win');
  assert.deepEqual(mergeItems([a, b], [item({ id: 2, removed: true, version: 9 })]).map((i) => i.id), [1]);
  assert.deepEqual(mergeItems(null, [b, item({ id: 3, event_at: '2026-11-11T12:00:00Z' })]).map((i) => i.id), [3, 2], 'the same moment: the bigger id first');
});

test('daysOf: Today, Yesterday, then the date', () => {
  const list = [item({ id: 1, event_at: '2026-11-11T16:02:00Z' }), item({ id: 2, event_at: '2026-11-11T05:30:00Z' }),
    item({ id: 3, event_at: '2026-11-10T21:00:00Z' }), item({ id: 4, event_at: '2026-11-08T15:00:00Z' })];
  assert.deepEqual(daysOf(list, TODAY).map((d) => [d.title, d.items.map((i) => i.id)]), [['Today', [1, 2]], ['Yesterday', [3]], ['Sun, Nov 8', [4]]]);
});

test('read and unread on the phone at once; the count from the answer; the tab\'s words', () => {
  const list = [item({ id: 1 }), item({ id: 2, read_at: '2026-11-11T10:00:00Z' })];
  assert.deepEqual(markedRead(list, [1], 'X').map((i) => i.read_at), ['X', '2026-11-11T10:00:00Z']);
  assert.deepEqual(markedUnread(list, 2).map((i) => i.read_at), [null, null]);
  assert.deepEqual(markedAllRead(list, 'X').map((i) => i.read_at), ['X', '2026-11-11T10:00:00Z']);
  assert.equal(unreadOf({ unread_count: 4 }), 4);
  assert.equal(unreadOf({ unread_count: -1 }), null);
  assert.equal(unreadOf(null), null);
  assert.equal(bellTabLabel(4), 'Notifications, 4 unread');
  assert.equal(bellTabLabel(0), 'Notifications');
  assert.equal(EMPTY_WORDS.title, 'You’re all caught up.');
});
