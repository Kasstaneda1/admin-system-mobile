import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movedBox, movedCard, movedTag } from './moved.js';

// Wed, Nov 11 2026, 11:20 AM in New York
const now = { date: '2026-11-11', minutes: 11 * 60 + 20 };
// 10:40 AM in New York (EST) that day
const changedAt = '2026-11-11T15:40:00.000Z';

// A grey row as GET /api/my/visits gives it: the visit as it was on Wednesday
const row = (change, extra = {}) => ({
  id: 10, job_id: 7, role: 'main', status: 'scheduled', visit_kind: 'diagnostics', visit_number: 1, visit_count: 1,
  scheduled_start: '2026-11-11 17:00:00', scheduled_end: '2026-11-11 20:00:00', planned_start: '2026-11-11 17:30:00', duration_minutes: 60,
  client_name: 'Lena Haddad', phone: '(718) 555-0170', address_line: '254-11 Northern Blvd', address_unit: null,
  city: 'Little Neck', state: 'NY', zip: '11362', access_notes: 'Side door.', description: 'Dryer runs but does not heat.',
  appliances: [{ appliance_type: 'Dryer', brand: 'Whirlpool', model: 'WED5620HW', serial_number: null }],
  service_call_fee_quoted_cents: 9500, main_technician_name: 'Ivan Petrov', helper_name: null,
  actions: [], office_change: change, ...extra,
});
const moved = { kind: 'moved', changed_at: changedAt, to_date: '2026-11-12', to_window: { start: '2026-11-12 09:00:00', end: '2026-11-12 12:00:00' } };

test('the card of a visit moved to another day says where it went and what it was', () => {
  const card = movedCard(row(moved), now, '2026-11-11');
  assert.deepEqual(card, {
    id: 10,
    tag: { kind: 'logged', icon: 'moved', text: 'Moved by the office' },
    kindLine: 'Diagnostics · visit 1 of 1',
    name: 'Lena Haddad',
    address: { line1: '254-11 Northern Blvd', line2: 'Little Neck, NY 11362' },
    box: { title: 'Moved to Thu, Nov 12 · 9–12', text: 'The office moved it at 10:40 AM. It now shows tomorrow.' },
    tiles: [
      { key: 'window', label: 'Window', big: '5–8', small: '', struck: true },
      { key: 'plan', label: 'Plan', big: '5:30', small: '1h', struck: true },
      { key: 'fee', label: 'Fee', big: '$95', small: 'told', struck: true },
    ],
    was: 'Was on Wed, Nov 11 · your visit',
    problem: 'Dryer runs but does not heat.',
    appliances: [{ key: '0', type: 'Dryer', model: 'Whirlpool WED5620HW', serial: '' }],
  });
  // nothing to act on and nothing more of the customer: no phone, no access notes, no notes
  for (const key of ['phone', 'access', 'notes', 'history', 'office', 'actions', 'buttons']) assert.equal(key in card, false, key);
});

test('the row\'s day comes from the visit when the screen does not pass it', () => {
  assert.equal(movedCard(row(moved), now).was, 'Was on Wed, Nov 11 · your visit');
});

test('the box says when and where, from the day of the row', () => {
  // further days: the weekday, then the date
  assert.equal(movedBox({ ...moved, to_date: '2026-11-14', to_window: { start: '2026-11-14 13:00:00', end: '2026-11-14 16:00:00' } }, '2026-11-11', now).text,
    'The office moved it at 10:40 AM. It now shows on Saturday.');
  assert.equal(movedBox({ ...moved, to_date: '2026-12-03', to_window: { start: '2026-12-03 09:00:00', end: '2026-12-03 12:00:00' } }, '2026-11-11', now).title,
    'Moved to Thu, Dec 3 · 9–12');
  assert.equal(movedBox({ ...moved, to_date: '2026-12-03', to_window: { start: '2026-12-03 09:00:00', end: '2026-12-03 12:00:00' } }, '2026-11-11', now).text,
    'The office moved it at 10:40 AM. It now shows on Dec 3.');
  // moved here from Monday: the grey row of Monday says it is on today now
  assert.equal(movedBox({ ...moved, to_date: '2026-11-11', to_window: { start: '2026-11-11 09:00:00', end: '2026-11-11 12:00:00' } }, '2026-11-09', now).text,
    'The office moved it at 10:40 AM. It now shows today.');
  // done on another day: that day too
  assert.equal(movedBox({ ...moved, changed_at: '2026-11-10T20:05:00.000Z' }, '2026-11-11', now).text,
    'The office moved it on Nov 10 at 3:05 PM. It now shows tomorrow.');
  // the server does not say where or when: no made-up words
  assert.deepEqual(movedBox({ kind: 'moved', changed_at: null, to_date: null, to_window: null }, '2026-11-11', now),
    { title: 'Moved by the office', text: 'The office moved it.' });
});

test('given to another technician: nothing of the new one', () => {
  const change = { kind: 'reassigned', changed_at: changedAt, to_date: null, to_window: null };
  const card = movedCard(row(change), now, '2026-11-11');
  assert.deepEqual(card.tag, { kind: 'logged', icon: 'people', text: 'Reassigned by the office' });
  assert.deepEqual(card.box, { title: 'Given to another technician', text: 'The office gave it to another technician at 10:40 AM. It is no longer yours.' });
  assert.equal(card.was, 'Was on Wed, Nov 11 · your visit');
  // a helper of a visit given away: the server sends no names, the card says none
  assert.equal(movedCard(row(change, { role: 'helper', main_technician_name: null }), now).was, 'Was on Wed, Nov 11 · you were the helper');
  // a helper of a visit moved: whom they help
  assert.equal(movedCard(row(moved, { role: 'helper', main_technician_name: 'Alex Kim' }), now).was, 'Was on Wed, Nov 11 · you were helping Alex K.');
});

test('cancelled, the customer moved it, and a kind the app does not know', () => {
  const cancelled = movedCard(row({ kind: 'cancelled', changed_at: changedAt, to_date: null, to_window: null }, { status: 'cancelled' }), now);
  assert.deepEqual(cancelled.tag, { kind: 'logged', icon: 'xcal', text: 'Cancelled by the office' });
  assert.deepEqual(cancelled.box, { title: 'This visit is cancelled', text: 'The office cancelled it at 10:40 AM.' });
  const client = movedCard(row({ kind: 'client_rescheduled', changed_at: changedAt, to_date: null, to_window: null }, { status: 'completed' }), now);
  assert.deepEqual(client.tag, { kind: 'logged', icon: 'moved', text: 'Customer rescheduled' });
  assert.deepEqual(client.box, { title: 'The customer asked for another time', text: 'The office took it off this day at 10:40 AM.' });
  assert.deepEqual(movedTag({ kind: 'something_new' }), { kind: 'logged', icon: 'moved', text: 'Changed by the office' });
  assert.deepEqual(movedBox({ kind: 'something_new', changed_at: 'not a moment' }, '2026-11-11', now),
    { title: 'Taken off this day', text: 'The office took it off this day.' });
  // a closed visit (moved, then done on its new day) still shows its times of this day, struck
  const closed = movedCard(row(moved, { status: 'completed', closed_at: '2026-11-12T15:00:00.000Z' }), now);
  assert.deepEqual(closed.tiles.map((t) => [t.key, t.big, t.struck]), [['window', '5–8', true], ['plan', '5:30', true], ['fee', '$95', true]]);
});

test('a recall has no fee to tell, and a visit without a fee says so', () => {
  assert.deepEqual(movedCard(row(moved, { visit_kind: 'recall' }), now).tiles[2], { key: 'fee', label: 'Fee', big: 'No charge', small: 'recall', struck: true });
  assert.deepEqual(movedCard(row(moved, { service_call_fee_quoted_cents: null }), now).tiles[2], { key: 'fee', label: 'Fee', big: '—', small: 'not set', struck: true });
  assert.equal(movedCard(row(moved, { description: '  ', client_name: '' }), now).problem, null);
  assert.equal(movedCard(row(moved, { client_name: '' }), now).name, 'Customer');
});
