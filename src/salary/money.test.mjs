import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_RECEIPTS, NO_UNPAID, UNPAID_EMPTY, cameFrom, moneyError, monthOfParams, paymentsOf, receiptsOf, unpaidOf } from './money.js';

test('payments: the month asked, newest first, the total and the count (design salary-payments)', () => {
  const answer = { payments: [
    { id: 7, payment_date: '2026-11-16T00:00:00.000Z', amount: '400.00' },
    { id: 5, payment_date: '2026-11-06', amount: '850' },
    { id: 4, payment_date: '2026-10-30', amount: '600' },
    { id: 9, payment_date: '2025-11-10', amount: '100' },
    { id: 3, payment_date: null, amount: '5' },
  ] };
  const p = paymentsOf(answer, 2026, 10);
  assert.equal(p.total, '$1,250.00');
  assert.equal(p.line, 'November 2026 · 2 payments');
  assert.deepEqual(p.rows.map((r) => [r.date, r.amount]), [['Nov 16, 2026', '$400.00'], ['Nov 6, 2026', '$850.00']]);
  assert.equal(paymentsOf(answer, 2026, 9).line, 'October 2026 · 1 payment');
  const none = paymentsOf({ payments: [] }, 2026, 11);
  assert.deepEqual([none.total, none.count, none.line], ['$0.00', 0, 'December 2026 · 0 payments']);
  assert.equal(paymentsOf(null, 2026, 10).count, 0);
});

test('payments the same day: the later one (higher id) first', () => {
  const p = paymentsOf({ payments: [{ id: 1, payment_date: '2026-11-06', amount: 1 }, { id: 2, payment_date: '2026-11-06', amount: 2 }] }, 2026, 10);
  assert.deepEqual(p.rows.map((r) => r.key), ['2', '1']);
});

test('receipts: total unsubmitted, «1 check waiting for submission», the work status badge', () => {
  const r = receiptsOf([{ id: 3, date: '2026-11-09', client_name: 'Rossi A.', work_status: 'Done', check_amount: '350.00' }]);
  assert.equal(r.total, '$350.00');
  assert.equal(r.line, '1 check waiting for submission');
  assert.deepEqual(r.rows[0], { key: '3', client: 'Rossi A.', date: 'Nov 9, 2026', tag: { kind: 'done', icon: 'wrench', text: 'Done' }, amount: '$350.00' });
  const two = receiptsOf([{ check_amount: '0.10' }, { check_amount: '0.20', work_status: 'Weird' }]);
  assert.equal(two.total, '$0.30');
  assert.equal(two.line, '2 checks waiting for submission');
  assert.equal(two.rows[0].client, 'N/A');
  assert.deepEqual(two.rows[1].tag, { kind: 'neutral', icon: 'doc', text: 'Weird' });
  assert.equal(receiptsOf(null).count, 0);
  assert.equal(NO_RECEIPTS.title, 'All receipts submitted!');
});

test('unpaid: two tabs with counts, the manager’s notes, the site’s empty words', () => {
  const u = unpaidOf({
    pending: [{ id: 1, client_name: 'Lee H.', record_date: '2026-11-11', amount: '185', manager_notes: '  Call after 5 PM ' }, { id: 2, client_name: 'Silva P.', record_date: '2026-10-28', amount: 120, manager_notes: ' ' }],
    declined: [],
  });
  assert.deepEqual(u.tabs, [{ key: 'pending', label: 'Pending', count: 2 }, { key: 'declined', label: 'Declined', count: 0 }]);
  assert.deepEqual(u.pending[0], { key: '1', client: 'Lee H.', date: 'Nov 11, 2026', amount: '$185.00', note: 'Call after 5 PM', status: 'Pending' });
  assert.equal(u.pending[1].note, null);
  assert.equal(u.none, false);
  assert.equal(unpaidOf({ declined: [{ amount: 1 }] }).declined[0].status, 'Declined');
  assert.equal(unpaidOf({ pending: [], declined: [{ amount: 1 }] }).none, false);
  assert.equal(unpaidOf(null).none, true);
  assert.equal(NO_UNPAID, 'No unpaid clients');
  assert.equal(UNPAID_EMPTY.pending.title, 'All Clear!');
});

test('the month of a screen: the one asked, else this month (opened from More)', () => {
  const today = new Date(2026, 10, 17);
  assert.deepEqual(monthOfParams({ year: 2025, month: 0 }, today), { year: 2025, month: 0 });
  assert.deepEqual(monthOfParams({}, today), { year: 2026, month: 10 });
  assert.deepEqual(monthOfParams({ year: 2026, month: 12 }, today), { year: 2026, month: 10 });
  assert.deepEqual(monthOfParams(undefined, today), { year: 2026, month: 10 });
});

test('errors: offline or failed, with the screen’s name', () => {
  assert.deepEqual(moneyError(new Error('Network Error'), 'Payments'), { kind: 'offline', title: 'No connection', text: 'Payments come from the office’s server. Try again when you are back online.' });
  assert.equal(moneyError({ response: { status: 500 } }, 'Receipts').title, 'Could not load Receipts');
});

test('cameFrom: opened from More keeps the More tab and back word, else Salary', () => {
  assert.equal(cameFrom({ from: 'More' }), 'More');
  assert.equal(cameFrom({ from: 'Salary', year: 2026, month: 10 }), 'Salary');
  assert.equal(cameFrom({}), 'Salary');
  assert.equal(cameFrom(undefined), 'Salary');
});
