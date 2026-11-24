// node --test: «How to get in» where the hand is (access.js, usability п. 2).
// Times are New York: Tuesday Nov 24 2026.
import test from 'node:test';
import assert from 'node:assert/strict';
import { accessUp, accessParts, accessLine } from './access.js';
import { visitCard } from './visit.js';

const now = (hhmm, date = '2026-11-24') => ({ date, minutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) });
function visit(o = {}) {
  return {
    id: 4, legacy: false, role: 'main', status: 'scheduled', visit_kind: 'repair', client_name: 'Sanjay Patel',
    scheduled_start: '2026-11-24 11:00:00', scheduled_end: '2026-11-24 14:00:00', planned_start: '2026-11-24 11:45:00',
    access_notes: 'Buzz 3C · door code 4521\nPark on 42nd Ave, not in the driveway', ...o,
  };
}

test('under the address on the way and on site, whatever the hour', () => {
  assert.equal(accessUp(visit({ status: 'omw' }), now('09:00')), true);
  assert.equal(accessUp(visit({ status: 'in_progress' }), now('16:30')), true);
});

test('a planned visit: only inside its window today', () => {
  assert.equal(accessUp(visit(), now('10:59')), false);
  assert.equal(accessUp(visit(), now('11:00')), true);
  assert.equal(accessUp(visit(), now('13:59')), true);
  assert.equal(accessUp(visit(), now('14:00')), false);
  // another day: not up
  assert.equal(accessUp(visit(), now('12:00', '2026-11-25')), false);
  // no end: the rest of the day
  assert.equal(accessUp(visit({ scheduled_end: null }), now('22:00')), true);
});

test('closed, cancelled, nothing known: in its old place', () => {
  assert.equal(accessUp(visit({ status: 'completed' }), now('12:00')), false);
  assert.equal(accessUp(visit({ status: 'cancelled' }), now('12:00')), false);
  assert.equal(accessUp(null, now('12:00')), false);
  assert.equal(accessUp(visit(), null), false);
});

test('the card says it', () => {
  assert.equal(visitCard(visit({ status: 'omw' }), { now: now('09:00') }).accessUp, true);
  assert.equal(visitCard(visit(), { now: now('09:00') }).accessUp, false);
});

test('the codes apart, in large digits; 42nd, 3C and phone numbers stay small', () => {
  assert.deepEqual(accessParts('Buzz 3C · door code 4521, park on 42nd'), [
    { text: 'Buzz 3C · door code ', big: false }, { text: '4521', big: true }, { text: ', park on 42nd', big: false },
  ]);
  assert.deepEqual(accessParts('Gate #78901'), [{ text: 'Gate #', big: false }, { text: '78901', big: true }]);
  assert.deepEqual(accessParts('Super 718-555-0142, apt 12'), [{ text: 'Super 718-555-0142, apt 12', big: false }]);
  assert.deepEqual(accessParts('Lockbox 123456789'), [{ text: 'Lockbox 123456789', big: false }]);
  // the text stays the same, piece by piece
  const text = 'Code 1234\nthen 5678.';
  assert.equal(accessParts(text).map((p) => p.text).join(''), text);
  assert.deepEqual(accessParts(''), []);
  assert.deepEqual(accessParts(null), []);
});

test('one line for the NOW card', () => {
  assert.equal(accessLine('Buzz 3C · door code 4521\n\n  Park on 42nd   Ave '), 'Buzz 3C · door code 4521 · Park on 42nd Ave');
  assert.equal(accessLine('  \n '), null);
  assert.equal(accessLine(null), null);
});

// The Designer on #86: the visit marked NEXT on today's My day — where the technician drives
// without pressing On my way — has the block up before its window too
test('NEXT today: up before the window; not on another day, not when closed', () => {
  assert.equal(accessUp(visit(), now('10:20'), { nextToday: true }), true);
  assert.equal(accessUp(visit(), now('10:20'), { nextToday: false }), false);
  assert.equal(accessUp(visit(), now('10:20', '2026-11-23'), { nextToday: true }), false);
  assert.equal(accessUp(visit({ status: 'completed' }), now('10:20'), { nextToday: true }), false);
  assert.equal(visitCard(visit(), { now: now('10:20'), nextToday: true }).accessUp, true);
  assert.equal(visitCard(visit(), { now: now('10:20') }).accessUp, false);
});
