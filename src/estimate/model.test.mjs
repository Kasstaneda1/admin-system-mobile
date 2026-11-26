import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_MESSAGES, PATH, SKEW_MS, lastCommentId, lastOtherKey, commentBody, commentMs, entriesOf, estimateError, estimateOf, headOf, isOffPath, landingOf,
  messageReady, messageToSend, messagesOf, newEntry, newMessagesText, newSince, pathOf, roleWord, sendFailure, settle,
  statusTag, statusWord, unreadCount, whatOf, withEntry, withState, withoutKeys,
} from './model.js';

// An estimate as GET /api/estimates/:id answers a technician (TECHNICIAN_ESTIMATE_FIELDS)
const EST = {
  id: 14, number: 'EST-202611-014', date: '2026-11-12', client: 'Patel S.', name: 'Refrigerator · Samsung RF28R7351SR',
  name_parts: 'Fan motor\nThermostat', part_number: 'W11373577\nWPW10225581', status: 'arrived', total: '1234.5',
  admin_notes: '  On the shelf B3.  ', technician_name: 'Ivan Petrov', technician2_name: 'Alex Kim', comment_count: '3', has_unread_comments: true,
};
// Comments as GET …/comments answers (created_at without a zone is the UTC wall clock)
const C = (id, userId, name, role, text, utc, extra = {}) => ({
  id, estimate_id: 14, user_id: userId, user_name: name, user_role: role, comment_text: text, created_at: utc.replace('T', ' ').replace('Z', ''), created_at_utc: utc, author_tz: 'America/New_York', ...extra,
});

test('the path: seven points, the ones before done, the status now', () => {
  assert.deepEqual(PATH, ['diagnostics', 'sold', 'in_transit', 'arrived', 'on_board', 'scheduled', 'installed']);
  const p = pathOf('arrived');
  assert.equal(p.off, null);
  assert.deepEqual(p.steps.map((s) => s.state), ['done', 'done', 'done', 'now', 'todo', 'todo', 'todo']);
  assert.deepEqual(p.steps.map((s) => s.label), ['Diagnostics', 'Sold', 'In Transit', 'Arrived', 'On Board', 'Scheduled', 'Installed']);
  assert.deepEqual(p.line, { before: 'In Transit', now: 'Arrived', after: 'On Board', step: 'step 4 of 7' });
  assert.deepEqual(pathOf('diagnostics').line, { before: null, now: 'Diagnostics', after: 'Sold', step: 'step 1 of 7' });
  assert.equal(pathOf('installed').line.after, null);
  assert.deepEqual(pathOf('diagnostics').steps.map((s) => s.state)[0], 'now');
  assert.deepEqual(pathOf('installed').steps.map((s) => s.state).slice(-2), ['done', 'now']);
});

test('Thinking, No answer, Declined and an unknown status: a tag instead of the path', () => {
  for (const s of ['thinking', 'no_answer', 'declined']) {
    const p = pathOf(s);
    assert.deepEqual(p.steps, []);
    assert.equal(p.line, null);
    assert.equal(p.off.text, statusWord(s));
    assert.equal(isOffPath(s), true);
  }
  assert.equal(statusWord('no_answer'), 'No Answer');
  assert.equal(statusTag('thinking').icon, 'clock');
  assert.deepEqual(pathOf('weird').off, { kind: 'neutral', icon: 'doc', text: 'weird' });
  assert.equal(isOffPath('sold'), false);
  assert.deepEqual(statusTag('arrived'), { kind: 'diagnostics', icon: 'store', text: 'Arrived' });
});

test('the head: number, status, customer, date, what, parts, note, total; the partner from my side', () => {
  const h = headOf(EST, { me: 'Ivan Petrov', thisYear: 2026 });
  assert.equal(h.number, 'EST-202611-014');
  assert.equal(h.tag.text, 'Arrived');
  assert.equal(h.client, 'Patel S.');
  assert.equal(h.date, 'Nov 12');
  assert.deepEqual(h.what, { main: 'Refrigerator', sub: 'Samsung RF28R7351SR' });
  assert.deepEqual(h.parts.map((p) => [p.name, p.number]), [['Fan motor', 'W11373577'], ['Thermostat', 'WPW10225581']]);
  assert.equal(h.noPart, false);
  assert.equal(h.partner, 'Alex Kim');
  assert.equal(h.note, 'On the shelf B3.');
  assert.equal(h.total, '$1,234.50');
  assert.equal(h.unread, true);
  assert.equal(headOf(EST, { me: 'Alex Kim', thisYear: 2026 }).partner, 'Ivan Petrov');
});

test('the head without parts, note, total: «No part yet», no blocks', () => {
  const h = headOf({ id: 3, status: 'diagnostics', name_parts: '', admin_notes: ' ', total: null, date: '2025-12-01' }, { thisYear: 2026 });
  assert.equal(h.number, 'Estimate');
  assert.equal(h.client, 'N/A');
  assert.equal(h.noPart, true);
  assert.equal(h.note, null);
  assert.equal(h.total, null);
  assert.equal(h.what, null);
  assert.equal(h.date, 'Dec 1, 2025');
  assert.equal(h.unread, false);
  assert.equal(headOf({ id: 4, total: '0' }).total, '$0.00');
});

test('what: one field split into the appliance and its model', () => {
  assert.deepEqual(whatOf('Washer'), { main: 'Washer', sub: null });
  assert.deepEqual(whatOf('Washer\nSamsung WF45R6100AW\n  2019'), { main: 'Washer', sub: 'Samsung WF45R6100AW 2019' });
  assert.deepEqual(whatOf(' Dryer · LG · DLEX3900W '), { main: 'Dryer', sub: 'LG · DLEX3900W' });
  assert.equal(whatOf('  '), null);
  assert.equal(whatOf(null), null);
});

test('the server answer: an estimate object or null', () => {
  assert.equal(estimateOf(EST), EST);
  assert.equal(estimateOf([EST]), null);
  assert.equal(estimateOf({ error: 'x' }), null);
  assert.equal(estimateOf(null), null);
});

test('errors: 404 — no longer yours; no answer — offline; else failed', () => {
  assert.deepEqual(estimateError({ response: { status: 404 } }), { kind: 'gone', title: 'This estimate is no longer assigned to you.', text: null });
  assert.equal(estimateError(new Error('Network Error')).kind, 'offline');
  assert.equal(estimateError({ response: { status: 500 } }).kind, 'failed');
});

test('landing: M1 at the messages on the comment, T7 marks Arrived, the rest at the top', () => {
  assert.deepEqual(landingOf({ commentId: 77 }), { messages: true, commentId: '77', highlight: null });
  assert.deepEqual(landingOf({ focus: 'messages' }), { messages: true, commentId: null, highlight: null });
  assert.deepEqual(landingOf({ highlight: 'arrived' }), { messages: false, commentId: null, highlight: 'arrived' });
  assert.deepEqual(landingOf({}), { messages: false, commentId: null, highlight: null });
  assert.deepEqual(landingOf(undefined), { messages: false, commentId: null, highlight: null });
  assert.equal(landingOf({ highlight: 'other' }).highlight, null);
});

test('roles in words', () => {
  assert.equal(roleWord('admin'), 'Admin');
  assert.equal(roleWord('MANAGER'), 'Manager');
  assert.equal(roleWord('technician'), 'Technician');
  assert.equal(roleWord('owner'), null);
  assert.equal(roleWord(null), null);
});

test('a comment moment: created_at_utc, else created_at as UTC, else NaN', () => {
  assert.equal(commentMs({ created_at_utc: '2026-11-17T15:00:00.000Z' }), Date.UTC(2026, 10, 17, 15));
  assert.equal(commentMs({ created_at: '2026-11-17 15:00:00.123' }), Date.UTC(2026, 10, 17, 15, 0, 0, 123));
  assert.equal(commentMs({ created_at: '2026-11-17T15:00:00+02:00' }), Date.UTC(2026, 10, 17, 13));
  assert.ok(Number.isNaN(commentMs({})));
  assert.ok(Number.isNaN(commentMs(null)));
});

test('messages: by time, new at the bottom, mine on the right, author time, then the phone’s unsent', () => {
  const comments = [
    C(3, 2, 'Mike T.', 'manager', 'It arrived, shelf B3.', '2026-11-17T15:00:00.000Z'),
    C(1, 9, 'Ivan Petrov', 'technician', ' Is the fan here? ', '2026-11-16T14:00:00.000Z'),
    C(2, 1, 'Anna', 'admin', '', '2026-11-16T15:00:00.000Z'),
  ];
  const pending = [{ key: 'k1', text: 'Thanks', state: 'sending' }, { key: 'k2', text: 'Coming at 3', state: 'failed' }];
  const list = messagesOf(comments, { meId: 9, pending, formatTime: (c) => `t${c.id}` });
  assert.deepEqual(list.map((m) => m.key), ['c1', 'c3', 'pk1', 'pk2']);
  assert.deepEqual(list.map((m) => m.mine), [true, false, true, true]);
  assert.equal(list[0].text, 'Is the fan here?');
  assert.equal(list[0].role, 'Technician');
  assert.equal(list[1].author, 'Mike T.');
  assert.equal(list[1].time, 't3');
  assert.equal(list[1].id, '3');
  assert.deepEqual(list.slice(2).map((m) => m.state), ['sending', 'failed']);
  assert.equal(list[2].pendingKey, 'k1');
  assert.deepEqual(messagesOf(null), []);
  assert.equal(messagesOf([C(5, 2, '', null, 'x', '2026-11-17T15:00:00Z')])[0].author, 'Unknown');
  assert.equal(EMPTY_MESSAGES, 'No messages yet. Ask the office anything about this estimate here.');
});

test('no meId: nothing is mine (the server’s user ids only match a known me)', () => {
  const list = messagesOf([C(1, 9, 'Ivan', 'technician', 'x', '2026-11-17T15:00:00Z')]);
  assert.equal(list[0].mine, false);
});

test('a message to send: cleaned and trimmed, empty never; the site’s body', () => {
  assert.equal(messageToSend('  hi\u0007 there \n'), 'hi there');
  assert.equal(messageReady('   '), false);
  assert.equal(messageReady('\u0000'), false);
  assert.equal(messageReady(' ok '), true);
  assert.equal(messageToSend(null), '');
  assert.deepEqual(commentBody(' Fan? ', 'America/New_York'), { commentText: 'Fan?', author_tz: 'America/New_York' });
  assert.deepEqual(commentBody('x'), { commentText: 'x', author_tz: null });
  // mentions as ids, each once; the entry's key as the request id (a repeat is the same comment)
  assert.deepEqual(commentBody('@Anna Smith fan?', 'America/New_York', { mentions: [{ user_id: 4, name: 'Anna Smith' }, { user_id: 4 }, { user_id: 'x' }], requestId: 'app-1-abc' }),
    { commentText: '@Anna Smith fan?', author_tz: 'America/New_York', mentions: [4], client_request_id: 'app-1-abc' });
  assert.deepEqual(commentBody('x', null, { mentions: [] }), { commentText: 'x', author_tz: null });
});

test('mentions in the messages: marked pieces, mine stronger, «Notified» under my own only', () => {
  const comments = [
    { ...C(1, 2, 'Mike T.', 'manager', '@Ivan Petrov the pump is here', '2026-11-17T15:00:00.000Z'), mentions: [{ user_id: 9, name: 'Ivan Petrov' }] },
    { ...C(2, 9, 'Ivan Petrov', 'technician', '@Mike Torres thanks', '2026-11-17T16:00:00.000Z'), mentions: [{ user_id: 2, name: 'Mike Torres' }] },
  ];
  const pending = [{ key: 'k1', text: '@Anna Smith call me', mentions: [{ user_id: 4, name: 'Anna Smith' }], state: 'sending' }];
  const list = messagesOf(comments, { meId: 9, pending });
  assert.deepEqual(list[0].parts[0], { text: '@Ivan Petrov', mention: { user_id: 9, name: 'Ivan Petrov' }, me: true });
  assert.equal(list[0].notified, '');
  assert.equal(list[1].parts[0].me, false);
  assert.equal(list[1].notified, 'Notified: Mike T.');
  assert.equal(list[2].parts[0].text, '@Anna Smith');
  assert.equal(list[2].notified, '');
  // an old comment without mentions: one plain piece
  assert.deepEqual(messagesOf([C(3, 2, 'Mike', 'manager', '@Ivan hi', '2026-11-17T15:00:00Z')], { meId: 9 })[0].parts, [{ text: '@Ivan hi' }]);
});

test('new messages below: the words and the count of others’ new ones', () => {
  assert.equal(newMessagesText(1), '1 new message ↓');
  assert.equal(newMessagesText(3), '3 new messages ↓');
  const list = messagesOf([
    C(1, 2, 'Mike', 'manager', 'a', '2026-11-17T15:00:00Z'),
    C(2, 9, 'Ivan', 'technician', 'b', '2026-11-17T15:01:00Z'),
    C(3, 2, 'Mike', 'manager', 'c', '2026-11-17T15:02:00Z'),
  ], { meId: 9, pending: [{ key: 'p', text: 'd' }] });
  assert.equal(newSince(['c1'], list), 1);
  assert.equal(newSince([], list), 2);
  assert.equal(newSince(null, []), 0);
});

test('outbox entries: per estimate and technician; add, remove, change state', () => {
  const a = newEntry({ key: 'a', estimateId: 14, userId: 9, text: ' Thanks ', at: 1000 });
  assert.deepEqual(a, { key: 'a', estimateId: '14', userId: '9', text: 'Thanks', mentions: [], at: 1000, afterId: null, state: 'sending' });
  assert.equal(newEntry({ key: 'z', estimateId: 1, userId: 1, text: 'x', at: 1, afterId: '12' }).afterId, 12);
  const b = newEntry({ key: 'b', estimateId: 15, userId: 9, text: 'x', at: 2000 });
  const c = newEntry({ key: 'c', estimateId: 14, userId: 3, text: 'y', at: 3000 });
  let box = withEntry(withEntry(withEntry([], a), b), c);
  assert.deepEqual(entriesOf(box, 14, 9).map((p) => p.key), ['a']);
  assert.deepEqual(entriesOf(box, '14', '3').map((p) => p.key), ['c']);
  assert.deepEqual(entriesOf(null, 14, 9), []);
  box = withState(box, 'a', 'failed');
  assert.equal(box.find((p) => p.key === 'a').state, 'failed');
  assert.equal(withEntry(box, { ...a, state: 'sending' }).filter((p) => p.key === 'a').length, 1);
  assert.deepEqual(withoutKeys(box, ['a', 'c']).map((p) => p.key), ['b']);
});

test('settle: a try the server has is delivered — same text, mine, at or after the first try', () => {
  const at = Date.UTC(2026, 10, 17, 15, 0, 0);
  const entries = [
    newEntry({ key: 'a', estimateId: 14, userId: 9, text: 'Thanks', at }),
    newEntry({ key: 'b', estimateId: 14, userId: 9, text: 'Thanks', at: at + 1000 }),
    newEntry({ key: 'c', estimateId: 14, userId: 9, text: 'Coming at 3', at }),
  ];
  const comments = [
    C(1, 9, 'Ivan', 'technician', 'Thanks', '2026-11-17T14:00:00Z'), // an older «Thanks»: not this one
    C(2, 9, 'Ivan', 'technician', 'Thanks', '2026-11-17T15:00:02Z'),
    C(3, 2, 'Mike', 'manager', 'Coming at 3', '2026-11-17T15:00:03Z'), // not mine
  ];
  const s = settle(entries, comments, 9);
  assert.deepEqual(s.delivered, ['a']);
  assert.deepEqual(s.left.map((p) => p.key), ['c', 'b']); // the oldest try first
  // two sent, both on the server: two delivered
  const both = settle(entries.slice(0, 2), [...comments, C(4, 9, 'Ivan', 'technician', 'Thanks', '2026-11-17T15:00:05Z')], 9);
  assert.deepEqual(both.delivered, ['a', 'b']);
  // the phone's clock a little ahead of the server's: still the same message
  const early = settle([newEntry({ key: 'd', estimateId: 14, userId: 9, text: 'Thanks', at: at + SKEW_MS - 1000 })], [comments[1]], 9);
  assert.deepEqual(early.delivered, ['d']);
  assert.deepEqual(settle(entries, comments, null).delivered, []);
  assert.deepEqual(settle([], null, 9), { delivered: [], left: [] });
});

test('a failed send: 404 gone, 400 refused, the rest tried again', () => {
  assert.equal(sendFailure({ response: { status: 404 } }), 'gone');
  assert.equal(sendFailure({ response: { status: 400 } }), 'refused');
  assert.equal(sendFailure({ response: { status: 500 } }), 'retry');
  assert.equal(sendFailure(new Error('timeout')), 'retry');
});

test('unread estimates: the count for the Parts tab', () => {
  assert.equal(unreadCount([{ has_unread_comments: true }, { has_unread_comments: false }, { has_unread_comments: true }, null]), 2);
  assert.equal(unreadCount(undefined), 0);
});

test('read: the newest message of the others', () => {
  const list = messagesOf([
    C(1, 2, 'Mike', 'manager', 'a', '2026-11-17T15:00:00Z'),
    C(2, 9, 'Ivan', 'technician', 'b', '2026-11-17T15:01:00Z'),
  ], { meId: 9, pending: [{ key: 'p', text: 'c' }] });
  assert.equal(lastOtherKey(list), 'c1');
  assert.equal(lastOtherKey(messagesOf([C(2, 9, 'Ivan', 'technician', 'b', '2026-11-17T15:01:00Z')], { meId: 9 })), null);
  assert.equal(lastOtherKey([]), null);
});

test('settle with afterId: only comments newer than the screen had — the same text sent again is not lost', () => {
  const at = Date.UTC(2026, 10, 17, 15, 0, 0);
  const old = C(20, 9, 'Ivan', 'technician', 'Yes', '2026-11-17T14:59:30Z'); // the first «Yes», already on the screen
  const second = newEntry({ key: 'b', estimateId: 14, userId: 9, text: 'Yes', at, afterId: 20 });
  assert.deepEqual(settle([second], [old], 9), { delivered: [], left: [second] });
  const landed = C(21, 9, 'Ivan', 'technician', 'Yes', '2026-11-17T15:00:01Z');
  assert.deepEqual(settle([second], [old, landed], 9).delivered, ['b']);
  // afterId wins over the clock: a phone clock far off does not matter
  const skewed = newEntry({ key: 'c', estimateId: 14, userId: 9, text: 'Yes', at: at + 3600 * 1000, afterId: 20 });
  assert.deepEqual(settle([skewed], [old, landed], 9).delivered, ['c']);
  // afterId 0: the screen had no comments
  assert.deepEqual(settle([newEntry({ key: 'd', estimateId: 14, userId: 9, text: 'Yes', at, afterId: 0 })], [old], 9).delivered, ['d']);
});

test('the highest comment id', () => {
  assert.equal(lastCommentId([{ id: 3 }, { id: '12' }, { id: 7 }, {}]), 12);
  assert.equal(lastCommentId([]), null);
  assert.equal(lastCommentId(null), null);
});
