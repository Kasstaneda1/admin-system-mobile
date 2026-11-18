import { test } from 'node:test';
import assert from 'node:assert/strict';
import { depositBody, depositError, depositHolderLine, depositRow, depositRows, depositsOf, recordedLine } from './model.js';

// The design's job (design-mockups/deposits): job #2215, Javier Ortiz; Ivan takes $100.00 by
// check #1038 at 11:58 AM on Nov 11 (16:58Z), «Drain pump»; the repair bill NY-1048 takes it
const DEP = {
  id: 9, amount_cents: 10000, method: 'check', method_note: null, check_number: '1038', note: 'Drain pump',
  received_at: '2026-11-11T16:58:00Z', recorded_by_name: 'Ivan Petrov', voided_at: null, applied_to: null,
  can_void: true, void_until: '2026-11-11T17:13:00Z',
};
const VISIT = { id: 31, job_id: 2215, role: 'main', status: 'on_site', legacy: false };
const withDeposits = (d) => ({ ...VISIT, deposits: d });
const NONE = withDeposits({ take: 'yes', open_cents: 0, items: [] });
const TAKEN = withDeposits({ take: 'yes', open_cents: 10000, items: [DEP] });
const APPLIED = withDeposits({ take: 'bill_issued', open_cents: 0, items: [{ ...DEP, applied_to: 'NY-1048', can_void: false }] });
const ISSUED_NONE = withDeposits({ take: 'bill_issued', open_cents: 0, items: [] });
const err = (status, data = {}) => ({ response: { status, data } });

test('no row: deposits off (no field), helper, legacy, no job', () => {
  assert.equal(depositRow(VISIT), null);
  assert.equal(depositRow({ ...NONE, role: 'helper' }), null);
  assert.equal(depositRow({ ...NONE, legacy: true }), null);
  assert.equal(depositRow({ ...NONE, job_id: null }), null);
  assert.equal(depositRow(withDeposits({ take: 'job_closed', open_cents: 0, items: [] })), null);
});

test('the seven states of the row (design app-states)', () => {
  assert.deepEqual(depositRow(NONE), { line: 'Take one for the repair', kind: 'wait', done: false, off: false, tap: 'take' });
  assert.deepEqual(depositRow(TAKEN), { line: '$100.00 · check · Nov 11', kind: 'ok', done: true, off: false, tap: 'open' });
  assert.deepEqual(depositRow(APPLIED), { line: '$100.00 applied to NY-1048', kind: 'ok', done: true, off: false, tap: 'open' });
  assert.deepEqual(depositRow(ISSUED_NONE), { line: 'Take it as a payment', kind: 'mute', done: false, off: true, tap: 'blocked' });
  assert.deepEqual(depositRow(TAKEN, { offline: true }), { line: 'Needs the internet', kind: 'mute', done: false, off: true, tap: null });
});

test('a void deposit does not count; two open ones sum', () => {
  const voided = withDeposits({ take: 'yes', open_cents: 0, items: [{ ...DEP, voided_at: '2026-11-11T17:00:00Z' }] });
  assert.equal(depositRow(voided).line, 'Take one for the repair');
  const two = withDeposits({ take: 'yes', open_cents: 15000, items: [DEP, { ...DEP, id: 10, amount_cents: 5000, method: 'cash', check_number: null }] });
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
