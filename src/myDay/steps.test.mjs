// node --test: the steps of a visit and the big button (steps.js, usability п. 1).
// Times are New York: Tuesday Nov 24 2026, EST (UTC−5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { VISIT_STEPS, stepsOf, stripLabel, nextOfDay } from './steps.js';
import { buildDay } from './model.js';

function visit(o = {}) {
  return {
    id: 4, job_id: 3, legacy: false, role: 'main', status: 'in_progress', outcome: null, visit_kind: 'repair',
    visit_number: 2, visit_count: 2, scheduled_start: '2026-11-24 10:00:00', scheduled_end: '2026-11-24 12:00:00',
    client_name: 'Sanjay Patel', actions: ['finish', 'no_access'], undo_until: null, ...o,
  };
}
const done = (o = {}) => visit({ status: 'completed', outcome: 'done', closed_at: '2026-11-24T15:22:00Z', actions: [], ...o });
function bill(o = {}) {
  return {
    id: 9, status: 'issued', label: 'NY-1048', total_cents: 33207, balance_cents: 33207, payment_status: 'unpaid',
    delivered_at: null, bill_before_payment: true, lines: [{ kind: 'labor' }, { kind: 'part' }], payments: [], ...o,
  };
}
const signed = { kind: 'signed' };
const notSigned = { kind: 'none' };
const ctx = (o = {}) => ({ visit: visit(), approve: notSigned, known: { status: 'loading', bill: null }, ack: null, money: true, next: null, ...o });
const keys = (s) => (s ? [s.main && s.main.key, s.second && s.second.key] : null);
const marks = (s) => s.strip.map((x) => `${x.label}:${x.mark}`).join(' ');

test('the list is one, in the order of the visit', () => {
  assert.deepEqual(VISIT_STEPS.map((s) => s.key), ['approve', 'finish', 'bill', 'give', 'pay', 'signs', 'next']);
});

test('not signed yet: Approve the repair, Finish beside it (Approve may be passed)', () => {
  const s = stepsOf(ctx());
  assert.deepEqual(keys(s), ['approve', 'finish']);
  assert.equal(s.main.label, 'Approve the repair');
  assert.equal(s.second.label, 'Finish');
  // no bill yet: whether parts get replaced is not known, so no «Signs» yet
  assert.equal(marks(s), 'Approve:now Bill:todo Given:todo Pay:todo');
});

test('signed: Finish, nothing beside it', () => {
  const s = stepsOf(ctx({ approve: signed }));
  assert.deepEqual(keys(s), ['finish', null]);
  assert.equal(marks(s), 'Approve:done Bill:todo Given:todo Pay:todo');
});

test('a signature kept on this phone counts as signed', () => {
  assert.deepEqual(keys(stepsOf(ctx({ approve: { kind: 'pending' } }))), ['finish', null]);
});

test('finished: Issue the bill; finished without the signature — Approve is past, not asked again', () => {
  const s = stepsOf(ctx({ visit: done(), known: { status: 'draft', bill: bill({ status: 'draft' }) } }));
  assert.deepEqual(keys(s), ['bill', null]);
  assert.equal(s.main.label, 'Issue the bill');
  assert.equal(marks(s), 'Approve:todo Bill:now Given:todo Pay:todo Signs:todo');
  assert.equal(stepsOf(ctx({ visit: done(), known: { status: 'none', bill: null } })).main.label, 'Issue the bill');
});

test('the bill not known yet (no connection): Open the bill', () => {
  for (const status of ['loading', 'unknown']) {
    const s = stepsOf(ctx({ visit: done(), approve: signed, known: { status, bill: null } }));
    assert.deepEqual(keys(s), ['bill', null]);
    assert.equal(s.main.label, 'Open the bill');
  }
});

test('issued: Give the bill; given: Collect the balance', () => {
  let s = stepsOf(ctx({ visit: done(), approve: signed, known: { status: 'issued', bill: bill() } }));
  assert.deepEqual(keys(s), ['give', null]);
  assert.equal(s.main.label, 'Give the bill');
  s = stepsOf(ctx({ visit: done(), approve: signed, known: { status: 'issued', bill: bill({ delivered_at: '2026-11-24T15:25:00Z' }) } }));
  assert.deepEqual(keys(s), ['pay', null]);
  assert.equal(s.main.label, 'Collect $332.07');
  assert.equal(marks(s), 'Approve:done Bill:done Given:done Pay:now Signs:todo');
});

test('partly paid: Collect what is left', () => {
  const s = stepsOf(ctx({ visit: done(), known: { status: 'issued', bill: bill({ delivered_at: 'x', payment_status: 'partly_paid', balance_cents: 13207 }) } }));
  assert.equal(s.main.label, 'Collect $132.07');
});

test('«Bill before payment» off: no Give, Pay right after the bill', () => {
  const s = stepsOf(ctx({ visit: done(), approve: signed, known: { status: 'issued', bill: bill({ bill_before_payment: false }) } }));
  assert.deepEqual(keys(s), ['pay', null]);
  assert.equal(marks(s), 'Approve:done Bill:done Pay:now Signs:todo');
});

test('paid before the bill was given (the bill later): Give is past', () => {
  const s = stepsOf(ctx({ visit: done(), known: { status: 'issued', bill: bill({ payment_status: 'paid' }) }, ack: { status: 'ok', signed: false } }));
  assert.deepEqual(keys(s), ['signs', 'next']);
});

test('paid, parts replaced: Customer signs for parts, Next beside it', () => {
  const s = stepsOf(ctx({
    visit: done(), approve: signed, known: { status: 'issued', bill: bill({ delivered_at: 'x', payment_status: 'paid' }) },
    ack: { status: 'ok', signed: false }, next: { id: 5, n: 3, client: 'Nguyen T.', start: 13 * 60 + 30 },
  }));
  assert.deepEqual(keys(s), ['signs', 'next']);
  assert.equal(s.main.label, 'Customer signs for parts');
  assert.equal(s.second.label, 'Next: Nguyen T. · 1:30');
  assert.equal(marks(s), 'Approve:done Bill:done Given:done Pay:done Signs:now');
});

test('the parts signature not known yet: the same button (the screen says itself)', () => {
  const s = stepsOf(ctx({ visit: done(), known: { status: 'issued', bill: bill({ delivered_at: 'x', payment_status: 'paid' }) }, ack: { status: 'loading' } }));
  assert.equal(s.main.key, 'signs');
});

test('no parts on the bill: no parts signature; all done — Next', () => {
  const s = stepsOf(ctx({
    visit: done(), approve: signed, known: { status: 'issued', bill: bill({ delivered_at: 'x', payment_status: 'paid', lines: [{ kind: 'labor' }] }) },
    next: { id: 5, n: 3, client: 'Nguyen T.', start: 13 * 60 + 30 },
  }));
  assert.deepEqual(keys(s), ['next', null]);
  assert.equal(s.main.label, 'Next: Nguyen T. · 1:30');
  assert.equal(marks(s), 'Approve:done Bill:done Given:done Pay:done');
});

test('all done and no visit after it: Back to My day', () => {
  const s = stepsOf(ctx({ visit: done(), known: { status: 'issued', bill: bill({ delivered_at: 'x', payment_status: 'no_charge', lines: [] }) } }));
  assert.equal(s.main.label, 'Back to My day');
});

test('signed for the parts: all done', () => {
  const s = stepsOf(ctx({ visit: done(), known: { status: 'issued', bill: bill({ delivered_at: 'x', payment_status: 'overpaid' }) }, ack: { status: 'ok', signed: true } }));
  assert.equal(s.main.key, 'next');
});

test('a recall has no Approve', () => {
  const s = stepsOf(ctx({ visit: visit({ visit_kind: 'recall' }) }));
  assert.deepEqual(keys(s), ['finish', null]);
  assert.equal(marks(s), 'Bill:todo Given:todo Pay:todo');
});

test('an open visit the server does not let finish now (another day): no button', () => {
  const s = stepsOf(ctx({ visit: visit({ status: 'scheduled', actions: [] }) }));
  assert.equal(s.main, null);
  assert.equal(s.second, null);
  // signed already: Finish is the step, still not allowed
  assert.equal(stepsOf(ctx({ approve: signed, visit: visit({ actions: [] }) })).main, null);
});

test('no steps: a helper, an old task, cancelled, closed without work, no money permission', () => {
  assert.equal(stepsOf(ctx({ visit: visit({ role: 'helper' }) })), null);
  assert.equal(stepsOf(ctx({ visit: visit({ legacy: true }) })), null);
  assert.equal(stepsOf(ctx({ visit: visit({ status: 'cancelled' }) })), null);
  assert.equal(stepsOf(ctx({ visit: done({ outcome: 'no_access' }) })), null);
  assert.equal(stepsOf(ctx({ money: false, approve: null })), null);
  assert.equal(stepsOf(null), null);
});

test('a company\'s own list replaces the default one (order, required)', () => {
  const own = VISIT_STEPS.filter((s) => s.key !== 'give').map((s) => (s.key === 'pay' ? { ...s, required: false } : s));
  const s = stepsOf(ctx({ visit: done(), approve: signed, known: { status: 'issued', bill: bill() }, ack: { status: 'ok', signed: false } }), own);
  assert.deepEqual(keys(s), ['pay', 'signs']);
});

test('the strip for VoiceOver', () => {
  const s = stepsOf(ctx({ approve: signed }));
  assert.equal(stripLabel(s.strip), 'Steps: Approve, done. Bill. Given. Pay.');
});

test('the next visit of today: the one on the way, else the next planned; never this one', () => {
  const now = { date: '2026-11-24', minutes: 11 * 60 };
  const v = (id, start, o = {}) => visit({ id, status: 'scheduled', scheduled_start: `2026-11-24 ${start}:00`, scheduled_end: `2026-11-24 ${start}:00`, planned_start: `2026-11-24 ${start}:00`, client_name: `Client ${id}`, ...o });
  const visits = [done({ id: 4, scheduled_start: '2026-11-24 09:00:00' }), v(7, '15:00'), v(6, '13:30', { client_name: 'Tran Nguyen' })];
  const day = buildDay(visits, '2026-11-24', now);
  const next = nextOfDay(day, 4);
  assert.equal(next.id, 6);
  assert.equal(next.client, day.live.find((r) => r.id === 6).client);
  assert.equal(next.start, 13 * 60 + 30);
  // another one already on the way goes first
  const day2 = buildDay([...visits, v(8, '16:00', { status: 'omw' })], '2026-11-24', now);
  assert.equal(nextOfDay(day2, 4).id, 8);
  // this visit itself is never the next one, closed ones neither
  assert.equal(nextOfDay(buildDay([visits[0], v(6, '13:30')], '2026-11-24', now), 6), null);
  // not today: none
  assert.equal(nextOfDay(buildDay(visits, '2026-11-25', now), 4), null);
  assert.equal(nextOfDay(null, 4), null);
});
