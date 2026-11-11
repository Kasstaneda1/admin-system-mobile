// node --test: the visit card without the screen (visit.js). The visits are the design's
// (design-mockups/tech-app/shots/final-visit-*.png: Ivan Petrov, Tuesday Nov 10 2026, 11:20).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  techName, monthDay, dayWord, money, unitText, addressLines, cardTag, kindLine, tilesOf, appliancesOf,
  teamOf, historyOf, notesOf, visitCard, keepCard, keptCard, dropCard, MAX_CARDS_KEPT,
} from './visit.js';
import { keepWeek, keptWeek } from './model.js';

const TUE = '2026-11-10';
const NOW = { date: TUE, minutes: 11 * 60 + 20 };

// A visit as GET /api/my/visits/:id gives it
function card(o = {}) {
  const date = o.date || TUE;
  return {
    id: o.id || 3, job_id: o.legacy ? null : 100, legacy: !!o.legacy, role: o.role || 'main',
    status: o.status || 'scheduled', outcome: o.outcome || null, visit_kind: o.kind || 'repair',
    visit_number: o.legacy ? null : (o.n ?? 1), visit_count: o.legacy ? null : (o.of ?? 1),
    scheduled_start: `${date} ${o.w0 || '11:00'}:00`, scheduled_end: `${date} ${o.w1 || '14:00'}:00`,
    planned_start: o.p === null ? null : `${date} ${o.p || '11:45'}:00`, duration_minutes: o.dur ?? 75,
    omw_at: o.omw_at || null, closed_at: 'closed_at' in o ? o.closed_at : null, updated_at: '2026-11-10T21:30:00.000Z',
    client_name: o.client || 'Sanjay Patel', phone: '(718) 555-0142', additional_phones: [],
    address_line: o.street || '41-22 Bell Blvd', address_unit: o.legacy ? null : ('unit' in o ? o.unit : '3C'),
    city: o.legacy ? null : 'Bayside', state: o.legacy ? null : 'NY', zip: o.legacy ? null : '11361', lat: null, lng: null,
    access_notes: o.legacy ? null : ('access' in o ? o.access : 'Buzz 3C, door code 4521. Park on 42nd Ave.'),
    description: 'problem' in o ? o.problem : 'Washer stops mid-cycle and shows 4C.',
    appliances: o.legacy ? [] : [{ appliance_type: 'Washer', brand: 'Samsung', model: 'WF45R6100AW', serial_number: null }],
    main_technician_name: o.main || 'Ivan Petrov', helper_name: o.helper || null, company_name: o.company || null,
    service_call_fee_quoted_cents: 'fee' in o ? o.fee : 9500, actions: [], undo_until: null,
    ...(o.list ? {} : {
      job_visits: o.jobVisits || [],
      notes: o.notes || [],
      office_notes: o.officeNotes || null,
    }),
  };
}
const PATEL = () => card({
  status: 'omw', omw_at: '2026-11-10T16:08:00Z', n: 2, of: 2,
  jobVisits: [{ id: 1, visit_kind: 'diagnostics', visit_number: 1, status: 'completed', outcome: 'diagnostics_only', scheduled_start: '2026-11-06 09:00:00', scheduled_end: '2026-11-06 12:00:00', main_technician_name: 'Ivan Petrov', description: 'Drain pump DC31-00178A ordered' }],
  notes: [{ id: 41, visit_id: 1, author_name: 'Ivan Petrov', created_at: '2026-11-06T15:10:00.000Z', text: 'Pump is clogged and the motor hums. Customer agreed to the repair.' }],
});

test('words: technicians, days, money, units', () => {
  assert.equal(techName('Ivan Petrov'), 'Ivan P.');
  assert.equal(techName('Mary Ann Lee'), 'Mary L.');
  assert.equal(techName('Alex'), 'Alex');
  assert.equal(techName(null), '');
  assert.equal(monthDay('2026-11-06'), 'Nov 6');
  assert.deepEqual(['2026-11-10', '2026-11-11', '2026-11-09', '2026-11-12', '2026-11-16', '2026-11-06', '2026-11-03', '2026-11-20'].map((d) => dayWord(d, NOW)),
    ['Today', 'Tomorrow', 'Yesterday', 'Thu', 'Mon', 'Nov 6', 'Nov 3', 'Nov 20']);
  assert.deepEqual([9500, 12550, 125000, 5, 0, null, undefined].map(money), ['$95', '$125.50', '$1,250', '$0.05', '$0', null, null]);
  assert.deepEqual(['3C', 'Unit 4', '#12', 'apt 5', 'Suite 200', ' ', null].map(unitText), ['Apt 3C', 'Unit 4', '#12', 'apt 5', 'Suite 200', '', '']);
});

test('the design card: on the way to Patel, repair 2 of 2', () => {
  const c = visitCard(PATEL(), { n: 3, now: NOW });
  assert.equal(c.full, true);
  assert.equal(c.state, 'onway');
  assert.deepEqual(c.tag, { kind: 'onway', icon: 'car', text: 'On the way since 11:08' });
  assert.equal(c.kindLine, 'Repair · visit 2 of 2');
  assert.equal(c.name, 'Sanjay Patel');
  assert.deepEqual(c.address, { line1: '41-22 Bell Blvd, Apt 3C', line2: 'Bayside, NY 11361' });
  assert.deepEqual(c.tiles.map((t) => [t.label, t.big, t.small]), [['Window', '11–2', ''], ['Plan', '11:45', '1h 15m'], ['Fee', '$95', 'told']]);
  assert.equal(c.access, 'Buzz 3C, door code 4521. Park on 42nd Ave.');
  assert.equal(c.problem, 'Washer stops mid-cycle and shows 4C.');
  assert.deepEqual(c.appliances, [{ key: '0', type: 'Washer', model: 'Samsung WF45R6100AW', serial: '' }]);
  assert.equal(c.historyTitle, 'This job · 2 visits');
  assert.deepEqual(c.history.map((h) => [h.title, h.text, h.mark]), [
    ['Nov 6 · Diagnostics · Ivan P.', 'Diagnostics only · Drain pump DC31-00178A ordered', 'past'],
    ['Today · Repair', 'This visit', 'this'],
  ]);
  assert.equal(c.notesTitle, 'Notes · 1');
  assert.deepEqual(c.notes, [{ key: 'n41', head: 'Ivan P. · Nov 6', text: 'Pump is clogged and the motor hums. Customer agreed to the repair.' }]);
});

test('planned: the stop of the day, a recall costs nothing', () => {
  const chen = card({ id: 9, client: 'Wei Chen', kind: 'recall', n: 3, of: 3, w0: '15:00', w1: '18:00', p: '15:45', dur: 60 });
  assert.deepEqual(cardTag(chen, { n: 5, now: NOW }), { kind: 'neutral', icon: 'cal', text: 'Stop 5 · today' });
  assert.equal(kindLine(chen), 'Recall · visit 3 of 3');
  assert.deepEqual(tilesOf(chen, NOW).map((t) => [t.label, t.big, t.small]), [['Window', '3–6', ''], ['Plan', '3:45', '1h'], ['Fee', 'No charge', 'recall']]);
  // another day: the tag and the window say which
  const thu = card({ date: '2026-11-12', w0: '09:00', w1: '12:00', p: '09:30' });
  assert.equal(cardTag(thu, { n: 1, now: NOW }).text, 'Stop 1 · thu');
  assert.equal(cardTag(card({ date: '2026-11-11' }), { n: 2, now: NOW }).text, 'Stop 2 · tomorrow');
  assert.equal(cardTag(thu, { now: NOW }).text, 'Thu');
  assert.deepEqual(tilesOf(thu, NOW)[0], { key: 'window', label: 'Window', big: '9–12', small: 'Thu', struck: false });
  // no fee told yet
  assert.deepEqual(tilesOf(card({ fee: null }), NOW)[2], { key: 'fee', label: 'Fee', big: '—', small: 'not set', struck: false });
});

test('closed: when, the outcome, the plan it had', () => {
  const kowalski = card({ client: 'Marta Kowalski', status: 'completed', outcome: 'done', w0: '09:00', w1: '11:00', p: '09:40', closed_at: '2026-11-10T15:52:00.000Z' });
  assert.deepEqual(cardTag(kowalski, { now: NOW }), { kind: 'done', icon: 'checkc', text: 'Closed · Repaired 10:52' });
  assert.deepEqual(tilesOf(kowalski, NOW)[1], { key: 'done', label: 'Done', big: '10:52', small: 'plan 9:40', struck: false });
  // the server does not know when: no time rather than a wrong one
  const unknown = card({ status: 'completed', outcome: 'diagnostics_only', closed_at: null });
  assert.equal(cardTag(unknown, { now: NOW }).text, 'Closed · Diagnostics only');
  assert.equal(tilesOf(unknown, NOW)[1].big, '—');
  // closed on another day
  assert.equal(cardTag(card({ status: 'completed', outcome: 'done', closed_at: '2026-11-11T14:00:00.000Z' }), { now: NOW }).text, 'Closed · Repaired Nov 11 9:00');
  // an old status after the work, no outcome
  assert.equal(cardTag(card({ legacy: true, status: 'paid', closed_at: null }), { now: NOW }).text, 'Closed · Paid');
});

test('the helper sees whom they help; the main technician sees the helper and the company', () => {
  const helping = card({ role: 'helper', main: 'Alex Kim', kind: 'installation' });
  assert.deepEqual(cardTag(helping, { n: 4, now: NOW }), { kind: 'helper', icon: 'people', text: 'Helping Alex' });
  assert.deepEqual(teamOf(helping), [{ label: 'Main technician', value: 'Alex Kim' }]);
  assert.deepEqual(teamOf(card({ helper: 'Nia Test', company: 'SEMIX NY' })), [{ label: 'Helper', value: 'Nia Test' }, { label: 'Company', value: 'SEMIX NY' }]);
  assert.deepEqual(teamOf(card()), []);
});

test('an old task: the address in one line, no fee, no job history', () => {
  const old = card({ legacy: true, street: '35-12 Union St, Flushing NY 11354', p: null });
  const c = visitCard(old, { n: 2, now: NOW });
  assert.deepEqual(c.tag, { kind: 'neutral', icon: 'history', text: 'Old task' });
  assert.equal(c.kindLine, '');
  assert.deepEqual(c.address, { line1: '35-12 Union St, Flushing NY 11354', line2: '' });
  assert.deepEqual(c.tiles.map((t) => t.label), ['Window', 'Plan']);
  assert.equal(c.tiles[1].big, '11:00', 'no plan: the window start');
  assert.deepEqual(c.history, []);
  assert.equal(c.historyTitle, '');
  assert.equal(c.access, null);
  assert.deepEqual(c.appliances, []);
});

test('history: by window, later visits after this one, the moved one says so', () => {
  const v = card({ id: 20, kind: 'diagnostics', n: 1, of: 2, jobVisits: [
    { id: 21, visit_kind: 'repair', visit_number: 2, status: 'scheduled', outcome: null, scheduled_start: '2026-11-13 10:00:00', scheduled_end: '2026-11-13 13:00:00', main_technician_name: 'Alex Kim', description: null },
    { id: 19, visit_kind: 'diagnostics', visit_number: 0, status: 'rescheduled', outcome: null, scheduled_start: '2026-11-03 10:00:00', scheduled_end: '2026-11-03 13:00:00', main_technician_name: 'Ivan Petrov', description: null },
  ] });
  assert.deepEqual(historyOf(v, NOW).map((h) => [h.key, h.title, h.text, h.mark]), [
    ['v19', 'Nov 3 · Diagnostics · Ivan P.', 'Rescheduled', 'past'],
    ['v20', 'Today · Diagnostics', 'This visit', 'this'],
    ['v21', 'Fri · Repair · Alex K.', 'Planned', 'later'],
  ]);
  // the problem copied into an earlier visit is not said twice
  const copied = card({ jobVisits: [{ id: 1, visit_kind: 'diagnostics', visit_number: 1, status: 'completed', outcome: 'diagnostics_only', scheduled_start: '2026-11-06 09:00:00', scheduled_end: '2026-11-06 12:00:00', main_technician_name: 'Ivan Petrov', description: ' Washer stops mid-cycle and shows 4C. ' }] });
  assert.equal(historyOf(copied, NOW)[0].text, 'Diagnostics only');
});

test('notes: today says the time; the office note; the list visit is not the full card', () => {
  const v = card({ notes: [{ id: 7, visit_id: 3, author_name: 'Alex Kim', created_at: '2026-11-10T15:40:00.000Z', text: 'Bring the long hose.' }], officeNotes: '  Customer asks to call 10 min before.  ' });
  assert.deepEqual(notesOf(v, NOW), [{ key: 'n7', head: 'Alex K. · 10:40 AM', text: 'Bring the long hose.' }]);
  assert.equal(visitCard(v, { now: NOW }).officeNote, 'Customer asks to call 10 min before.');
  const fromList = visitCard(card({ list: true }), { now: NOW });
  assert.equal(fromList.full, false);
  assert.deepEqual([fromList.history, fromList.notes, fromList.notesTitle], [[], [], 'Notes · 0']);
  assert.equal(visitCard(card({ notes: [] }), { now: NOW }).notesTitle, 'Notes · 0');
});

test('a cancelled visit: its times are struck', () => {
  const tiles = tilesOf(card({ status: 'cancelled' }), NOW);
  assert.deepEqual(tiles.map((t) => t.struck), [true, true, true]);
  assert.deepEqual(addressLines(card({ unit: null })), { line1: '41-22 Bell Blvd', line2: 'Bayside, NY 11361' });
});

test('what the phone keeps: the cards beside the weeks, per technician, the latest 40', () => {
  const at = Date.parse('2026-11-10T16:20:00Z');
  let cache = keepWeek(null, 7, '2026-11-08', [card({ list: true })], at);
  cache = keepCard(cache, 7, PATEL(), at + 1);
  assert.equal(keptCard(cache, 7, 3).card.notes.length, 1);
  assert.equal(keptCard(cache, 8, 3), null, 'another technician sees nothing');
  // a new week kept keeps the cards
  cache = keepWeek(cache, 7, '2026-11-15', [], at + 2);
  assert.equal(keptCard(cache, 7, 3).savedAt, at + 1);
  assert.ok(keptWeek(cache, 7, '2026-11-08'));
  // another technician on the phone: their own, nothing of the first
  const other = keepCard(cache, 8, card({ id: 50 }), at + 3);
  assert.equal(keptCard(other, 7, 3), null);
  assert.deepEqual(Object.keys(other.cards), ['50']);
  // the 41st card pushes out the oldest
  let many = null;
  for (let i = 1; i <= MAX_CARDS_KEPT + 1; i += 1) many = keepCard(many, 7, card({ id: i }), at + i);
  assert.equal(Object.keys(many.cards).length, MAX_CARDS_KEPT);
  assert.equal(keptCard(many, 7, 1), null);
  assert.ok(keptCard(many, 7, MAX_CARDS_KEPT + 1));
  // a visit no longer the technician's goes
  const dropped = dropCard(cache, 7, 3);
  assert.equal(keptCard(dropped, 7, 3), null);
  assert.ok(keptWeek(dropped, 7, '2026-11-08'), 'the weeks stay');
  assert.equal(dropCard(cache, 7, 999), cache);
});

test('appliances: type, make and model, serial', () => {
  assert.deepEqual(appliancesOf({ appliances: [{ appliance_type: 'Dryer', brand: 'Whirlpool', model: null, serial_number: 'XY12' }, { appliance_type: null, brand: null, model: null, serial_number: null }] }),
    [{ key: '0', type: 'Dryer', model: 'Whirlpool', serial: 'S/N XY12' }, { key: '1', type: 'Appliance', model: '', serial: '' }]);
  assert.deepEqual(appliancesOf({}), []);
});
