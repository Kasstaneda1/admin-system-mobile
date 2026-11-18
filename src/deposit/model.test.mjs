import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockedOf, depositAmount, depositBody, depositError, depositHolderLine, depositPayRows, depositRow, depositRows, depositsOf, historyLabel, recordedLine, withYouRows } from './model.js';
import { countWord } from '../pay/model.js';

// The design's job (design-mockups/deposits): job #2215, Javier Ortiz; Ivan takes $100.00 by
// check #1038 at 11:58 AM on Nov 11 (16:58Z), «Drain pump»; the repair bill NY-1048 takes it
const DEP = {
  id: 9, amount_cents: 10000, method: 'check', method_note: null, check_number: '1038', note: 'Drain pump',
  received_at: '2026-11-11T16:58:00Z', recorded_by_name: 'Ivan Petrov', voided_at: null, applied_to: null,
  can_void: true, void_until: '2026-11-11T17:13:00Z',
};
const VISIT = { id: 31, job_id: 2215, role: 'main', status: 'on_site', legacy: false };
const withDeposits = (d) => ({ ...VISIT, deposits: d });
const on = (refused, open, items) => ({ enabled: true, can_take: refused === null, refused_code: refused, open_cents: open, items });
const NONE = withDeposits(on(null, 0, []));
const TAKEN = withDeposits(on(null, 10000, [DEP]));
const APPLIED = withDeposits(on('bill_issued', 0, [{ ...DEP, applied_cents: 10000, applied_to: 'NY-1048', open_cents: 0, can_void: false }]));
const ISSUED_NONE = withDeposits(on('bill_issued', 0, []));
const err = (status, data = {}) => ({ response: { status, data } });

test('no row: deposits null, the company off, helper, legacy, no job', () => {
  assert.equal(depositRow(VISIT), null);
  assert.equal(depositRow({ ...NONE, role: 'helper' }), null);
  assert.equal(depositRow({ ...NONE, legacy: true }), null);
  assert.equal(depositRow({ ...NONE, job_id: null }), null);
  assert.equal(depositRow(withDeposits(on('job_closed', 0, []))), null);
  assert.equal(depositRow({ ...VISIT, deposits: null }), null, 'a helper or no «Takes payments»: null');
  assert.equal(depositRow(withDeposits({ enabled: false, can_take: false, refused_code: null, open_cents: 0, items: [] })), null, 'the company off');
});

test('the company switched off with a deposit open: the row shows it, nothing new to take', () => {
  const off = withDeposits({ enabled: false, can_take: false, refused_code: null, open_cents: 10000, items: [DEP] });
  assert.equal(depositRow(off).line, '$100.00 · check · Nov 11');
  assert.equal(depositsOf(off).canTake, false);
  assert.equal(depositsOf(NONE).canTake, true);
});

test('a deposit above the bill: the row shows what the bill took', () => {
  const part = withDeposits(on('bill_issued', 2500, [{ ...DEP, applied_cents: 7500, applied_to: 'NY-1048', open_cents: 2500, can_void: false }]));
  assert.equal(depositRow(part).line, '$75.00 applied to NY-1048');
});

test('the seven states of the row (design app-states)', () => {
  assert.deepEqual(depositRow(NONE), { line: 'Take one for the repair', kind: 'wait', done: false, off: false, tap: 'take' });
  assert.deepEqual(depositRow(TAKEN), { line: '$100.00 · check · Nov 11', kind: 'ok', done: true, off: false, tap: 'open' });
  assert.deepEqual(depositRow(APPLIED), { line: '$100.00 applied to NY-1048', kind: 'ok', done: true, off: false, tap: 'open' });
  assert.deepEqual(depositRow(ISSUED_NONE), { line: 'Take it as a payment', kind: 'mute', done: false, off: true, tap: 'blocked' });
  assert.deepEqual(depositRow(TAKEN, { offline: true }), { line: 'Needs the internet', kind: 'mute', done: false, off: true, tap: null });
});

test('a void deposit does not count; two open ones sum', () => {
  const voided = withDeposits(on(null, 0, [{ ...DEP, voided_at: '2026-11-11T17:00:00Z' }]));
  assert.equal(depositRow(voided).line, 'Take one for the repair');
  const two = withDeposits(on(null, 15000, [DEP, { ...DEP, id: 10, amount_cents: 5000, method: 'cash', check_number: null }]));
  assert.equal(depositRow(two).line, '$150.00 · 2 deposits');
  assert.equal(depositsOf(two).live.length, 2);
});

test('the body: a payment without kind; the check photo only for a check', () => {
  assert.deepEqual(depositBody({ cents: 10000, method: 'check', checkNumber: ' 1038 ', note: ' Drain pump ', photoId: 'f1', requestId: 'r1' }).body,
    { amount_cents: 10000, method: 'check', client_request_id: 'r1', note: 'Drain pump', check_number: '1038', check_photo_file_id: 'f1' });
  assert.deepEqual(depositBody({ cents: 5000, method: 'cash', photoId: 'f1', requestId: 'r2' }).body,
    { amount_cents: 5000, method: 'cash', client_request_id: 'r2' });
  assert.equal(depositBody({ cents: 5000, method: 'other', name: '', requestId: 'r3' }).error, 'Other: type what the customer used.');
  assert.equal(depositBody({ cents: 0, method: 'cash', requestId: 'r4' }).error, 'The amount is more than $0.00.');
  assert.equal('kind' in depositBody({ cents: 100, method: 'zelle', requestId: 'r5' }).body, false);
});

test('who has the money', () => {
  assert.equal(depositHolderLine('check'), 'Money on hand: you. The office sees it in your checks to turn in.');
  assert.equal(depositHolderLine('zelle'), 'Money on hand: the office. Nothing to turn in.');
  assert.equal(depositHolderLine('cash', 'Ivan P.'), 'Money on hand: you. The office sees it as cash with Ivan P. until you turn it in.');
  assert.equal(depositHolderLine(null), null);
});

test('rows of the job deposits and the recorded line', () => {
  const now = Date.parse('2026-11-11T16:59:00Z');
  const [row] = depositRows(TAKEN, now);
  assert.equal(row.title, '11:58 AM · Check #1038');
  assert.equal(row.sub, 'Ivan P. · “Drain pump” · open until the repair bill');
  assert.equal(row.amount, '$100.00');
  assert.equal(row.voidLeft, 14);
  assert.equal(depositRows(APPLIED, now)[0].sub, 'Ivan P. · “Drain pump” · applied to NY-1048');
  assert.equal(depositRows(APPLIED, now)[0].voidLeft, 0);
  assert.equal(recordedLine(DEP, 2215), 'Job #2215 · $100.00 · 11:58 AM');
});

test('refusals in words', () => {
  assert.equal(depositError(err(409, { code: 'deposits_off' }), { company: 'SEMIX CORP' }).text, 'Deposits are off for SEMIX CORP. An admin turns them on in Company profile.');
  assert.equal(depositError(err(409, { code: 'job_closed' })).text, 'This job is closed or cancelled.');
  assert.equal(depositError(err(409, { code: 'bill_issued' }), { billLabel: 'NY-1048' }).text, 'Bill NY-1048 is issued. Take the money as a payment on the bill.');
  assert.equal(depositError(err(409, { code: 'deposit_applied' }), { billLabel: 'NY-1048' }).text, 'Applied to NY-1048. Void the bill to change it.');
  assert.equal(depositError({}).kind, 'offline');
  assert.equal(depositError(err(500, { error: 'x' })).kind, 'failed');
  assert.equal(depositError(err(404, {})).kind, 'gone');
  assert.equal(depositError(err(400, { error: 'amount_cents must be above 0' })).text, 'amount_cents must be above 0');
});

test('the amount: above $0.00, a comma as cents', () => {
  assert.deepEqual(depositAmount('100'), { cents: 10000, error: null });
  assert.deepEqual(depositAmount('25,50'), { cents: 2550, error: null });
  assert.equal(depositAmount('0').cents, null);
  assert.equal(depositAmount('').error, 'Type the amount: dollars and cents, like 100.00.');
});

test('with you now: own open cash or check, not the office\'s, not applied, not void', () => {
  const mine = { ...DEP, holder_is_me: true, open_cents: 10000 };
  const visit = withDeposits(on(null, 32500, [mine, { ...DEP, id: 11, method: 'zelle', holder_is_me: false, open_cents: 20000 },
    { ...DEP, id: 12, holder_is_me: true, voided_at: '2026-11-11T17:00:00Z', open_cents: 0 }, { ...DEP, id: 13, holder_is_me: true, open_cents: 0, applied_cents: 2500 }]));
  assert.deepEqual(withYouRows(visit), [{ key: 'y9', title: 'Check #1038 · deposit', amount: '$100.00' }]);
});

test('Pay of the bill that took them: History rows and their count', () => {
  const visit = withDeposits(on('bill_issued', 0, [{ ...DEP, applied_cents: 10000, applied_to: 'NY-1048', open_cents: 0 },
    { ...DEP, id: 10, applied_cents: 5000, applied_to: 'NY-2000', open_cents: 0 }]));
  const rows = depositPayRows(visit, 'NY-1048');
  assert.deepEqual(rows.map((r) => [r.title, r.sub, r.amount, r.voidLeft]), [['Nov 11 · Deposit · Check #1038', 'Ivan P. · applied to this bill', '$100.00', 0]]);
  assert.equal(historyLabel(rows, countWord), 'History · 1 deposit');
  assert.equal(historyLabel([...rows, { key: 'p1', tip: false }], countWord), 'History · 1 deposit · 1 payment');
  assert.equal(historyLabel([], countWord), 'History');
  assert.deepEqual(depositPayRows(visit, null), []);
});

test('the grey row tapped: this visit\'s issued bill opens Pay; another visit\'s — words only', () => {
  assert.deepEqual(blockedOf(APPLIED, { status: 'issued', label: 'NY-1048' }),
    { title: 'Bill NY-1048 is issued', text: 'Money for this job now goes to the bill. Take it with Pay: it lowers what is due.', pay: true });
  assert.equal(blockedOf(APPLIED, { status: 'draft', label: null }).pay, false);
  assert.equal(blockedOf(APPLIED, null).title, 'The final bill is issued');
});
