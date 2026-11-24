// «Bill before payment» by the company's flag (BILLS_MV_DESIGN §3.2а): bill_before_payment in the
// bill's answer. false — the payment and the signature «after the work» go without the bill given
// and nothing warns about it; true or no flag (an older server) — as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billFirst, billTile, issuedText, pdfReadyText } from '../bill/model.js';
import { chipOf, laterOf, noBillText, payTile, stageOf } from './model.js';
import { ackError, ackStage, stageText } from '../ack/model.js';

const VISIT = { id: 31, role: 'main', status: 'closed', legacy: false };
const NOT_GIVEN = {
  id: 5, status: 'issued', label: 'NY-1048', bill_number: 1048, total_cents: 17529, deposits_applied_cents: 0,
  issued_at: '2026-11-17T19:20:00Z', delivered_at: null,
  paid_cents: 0, balance_cents: 17529, payment_status: 'unpaid', tips_cents: 0, payments: [],
};
const ON = { ...NOT_GIVEN, bill_before_payment: true };
const OFF = { ...NOT_GIVEN, bill_before_payment: false };
const NOW = { date: '2026-11-17', minutes: 14 * 60 + 25 };
const LATER_PAID = {
  id: 1, kind: 'payment', method: 'cash', amount_cents: 10000, received_at: '2026-11-17T19:24:00Z', voided_at: null,
  before_delivery: true, before_delivery_reason: 'Customer asked for email',
};

test('the rule: only an explicit false turns it off; true, no flag (older server) or no bill — on', () => {
  assert.equal(billFirst(OFF), false);
  assert.equal(billFirst(ON), true);
  assert.equal(billFirst(NOT_GIVEN), true);
  assert.equal(billFirst(null), true);
  assert.equal(billFirst({ ...NOT_GIVEN, bill_before_payment: 0 }), true, 'not a boolean false — the stricter rule');
  assert.equal(billFirst({ ...NOT_GIVEN, bill_before_payment: 'false' }), true);
});

test('Pay tile of the visit: «Give the bill first» only with the rule', () => {
  const tile = (bill) => payTile(VISIT, { status: 'issued', bill });
  assert.deepEqual(tile(ON), { title: 'Pay', line: 'Give the bill first', kind: 'show', off: false });
  assert.equal(tile(NOT_GIVEN).kind, 'show');
  assert.deepEqual(tile(OFF), { title: 'Pay', line: '$175.29 due', kind: 'due', off: false });
  assert.equal(tile({ ...OFF, paid_cents: 10000, balance_cents: 7529, payment_status: 'partly_paid' }).line, '$75.29 left');
});

test('Bill tile: «not given yet» warns only with the rule', () => {
  const tile = (bill) => billTile(VISIT, { status: 'issued', bill });
  assert.equal(tile(ON).warn, 'not given yet');
  assert.equal(tile(NOT_GIVEN).warn, 'not given yet');
  assert.equal(tile(OFF).warn, null);
  assert.equal(tile(OFF).line, 'NY-1048 · $175.29');
  assert.equal(tile({ ...OFF, delivered_at: '2026-11-17T19:22:00Z' }).line, 'NY-1048 · delivered');
});

test('Pay screen: the chip and the stage', () => {
  assert.deepEqual(chipOf(ON, NOW), { text: 'Bill NY-1048 · issued 2:20 PM, not given', kind: 'warn' });
  assert.deepEqual(chipOf(NOT_GIVEN, NOW), { text: 'Bill NY-1048 · issued 2:20 PM, not given', kind: 'warn' });
  assert.deepEqual(chipOf(OFF, NOW), { text: 'Bill NY-1048 · issued 2:20 PM', kind: 'neutral' });
  assert.deepEqual(chipOf({ ...OFF, delivered_at: '2026-11-17T19:22:00Z' }, NOW), { text: 'Bill NY-1048 · given 2:22 PM', kind: 'done' });
  assert.equal(stageOf(ON), 'show');
  assert.equal(stageOf(NOT_GIVEN), 'show');
  assert.equal(stageOf(OFF), 'collect');
  assert.equal(stageOf({ ...OFF, payment_status: 'paid', paid_cents: 17529, balance_cents: 0 }), 'paid');
  assert.equal(stageOf({ ...OFF, status: 'draft' }), 'none');
});

test('before_delivery: asked only with the rule; never sent for a company without it', () => {
  const own = { reason: 'Customer asked for email' };
  assert.deepEqual(laterOf(ON, own), own);
  assert.deepEqual(laterOf({ ...ON, payments: [LATER_PAID] }, null), { reason: 'The bill is sent later, as with the first payment' });
  assert.equal(laterOf(ON, null), null);
  assert.equal(laterOf({ ...ON, delivered_at: '2026-11-17T19:22:00Z', payments: [LATER_PAID] }, null), null);
  assert.equal(laterOf(OFF, own), null);
  assert.equal(laterOf({ ...OFF, payments: [LATER_PAID] }, null), null);
});

test('words without an issued bill and after issuing', () => {
  assert.equal(noBillText(null), 'The customer pays an issued bill. Open the bill, issue it, then give it to the customer.');
  assert.equal(noBillText({ status: 'draft', bill_before_payment: true }), 'The customer pays an issued bill. Open the bill, issue it, then give it to the customer.');
  assert.equal(noBillText({ status: 'draft', bill_before_payment: false }), 'The customer pays an issued bill. Open the bill and issue it.');
  assert.equal(issuedText(ON), 'It is frozen and has its PDF. Give it to the customer before taking the payment.');
  assert.equal(issuedText(NOT_GIVEN), 'It is frozen and has its PDF. Give it to the customer before taking the payment.');
  assert.equal(issuedText(OFF), 'It is frozen and has its PDF.');
  assert.equal(pdfReadyText(ON), 'The PDF is ready. Give it to the customer before taking the payment.');
  assert.equal(pdfReadyText(NOT_GIVEN), 'The PDF is ready. Give it to the customer before taking the payment.');
  assert.equal(pdfReadyText(OFF), 'The PDF is ready.');
});

test('the signature «after the work»: open without the bill given only when the rule is off', () => {
  assert.equal(ackStage(ON), 'undelivered');
  assert.equal(ackStage(NOT_GIVEN), 'undelivered');
  assert.equal(ackStage(OFF), 'open');
  assert.equal(ackStage({ ...OFF, status: 'draft' }), 'draft');
  assert.equal(ackStage({ ...OFF, status: 'void' }), 'void');
  assert.equal(stageText('draft', { status: 'draft', bill_before_payment: false }), 'Issue the bill first. Then the customer signs for it.');
  assert.equal(stageText('draft', { status: 'draft', bill_before_payment: true }), 'Issue the bill and give it to the customer first. Then they sign that they got it.');
  assert.equal(stageText('draft'), 'Issue the bill and give it to the customer first. Then they sign that they got it.');
  assert.equal(stageText('void', OFF), 'This bill is void. The customer does not sign for it.');
  // the server still says not_delivered (the office turned the rule on meanwhile): its words stay
  assert.equal(ackError({ response: { status: 409, data: { code: 'not_delivered' } } }).kind, 'stage');
});
