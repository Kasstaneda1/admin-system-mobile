import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answeredCount, attemptOf, dropAttempt, forgetBill, linesLocked, mineIds, newRecords, noAnswer, runAttempt, startAttempt } from './attempts.js';
import { alreadyLine, payError } from './model.js';

// Errors as axios gives them: no response (no connection, a timeout), or the server's answer
const lost = () => Object.assign(new Error('Network Error'), { response: undefined });
const server = (status, data = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

const row = (id, extra = {}) => ({ id, kind: 'payment', method: 'cash', amount_cents: 6000, mine: true, voided_at: null, received_at: '2026-11-17T16:31:00Z', ...extra });
const BILL = { id: 77, payments: [row(1), row(2, { mine: false })] };
const line = (rid, extra = {}) => ({ rid, body: { amount_cents: 6000, method: 'cash', client_request_id: rid, ...extra } });

// A fake server: answers in order (a function, or an error to throw); records what was sent
function fakeServer(answers, bills = []) {
  const sent = [];
  let read = 0;
  return {
    sent,
    get reads() { return read; },
    record: async (body) => {
      sent.push(body.client_request_id);
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    readBill: async () => {
      read += 1;
      const next = bills.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
}
const ok = (paymentId) => ({ payment: { id: paymentId }, bill: { id: 77 } });

test('which failures may have gone through', () => {
  assert.equal(noAnswer(payError(lost())), true, 'no connection, a timeout');
  assert.equal(noAnswer(payError(server(500))), true);
  assert.equal(noAnswer(payError(server(502))), true);
  assert.equal(noAnswer(payError(server(409, { code: 'over_balance', balance_cents: 0 }))), false);
  assert.equal(noAnswer(payError(server(400, { error: 'bad' }))), false);
  assert.equal(noAnswer(payError(server(403, { code: 'payments_off' }))), false);
});

test('one line: recorded, the attempt is gone', async () => {
  const a = startAttempt(77, 'method', { bill: BILL, lines: [line('r-1')], view: { cents: 6000 } });
  assert.deepEqual(a.baseline, [1], 'only my own records');
  const s = fakeServer([ok(10)]);
  const result = await runAttempt(a, s);
  assert.deepEqual([result.done, result.data.payment.id, s.sent, attemptOf(77, 'method')], [true, 10, ['r-1'], null]);
});

test('no answer: locked; the next press looks first and finds it — «Already recorded», nothing sent again', async () => {
  const a = startAttempt(77, 'method', { bill: BILL, lines: [line('r-2')], view: { cents: 6000 } });
  const s = fakeServer([lost()], [{ id: 77, payments: [...BILL.payments, row(11, { received_at: '2026-11-17T16:31:00Z' })] }]);
  const first = await runAttempt(a, s);
  assert.equal(first.failed.kind, 'offline');
  assert.deepEqual([a.uncertain, linesLocked(a), attemptOf(77, 'method')], [true, true, a], 'kept by bill: the screen opened again finds it');
  const second = await runAttempt(attemptOf(77, 'method'), s);
  assert.deepEqual([second.already.map((p) => p.id), s.sent, s.reads, attemptOf(77, 'method')], [[11], ['r-2'], 1, null]);
  assert.equal(alreadyLine(second.already), 'Already recorded: $60.00 cash · 11:31 AM');
});

test('no answer, nothing on the bill: the same request again, with the same id', async () => {
  const a = startAttempt(77, 'method', { bill: BILL, lines: [line('r-3')], view: {} });
  const s = fakeServer([server(503), ok(12)], [{ id: 77, payments: BILL.payments }]);
  assert.equal((await runAttempt(a, s)).failed.kind, 'failed');
  const again = await runAttempt(a, s);
  assert.deepEqual([again.done, s.sent, s.reads], [true, ['r-3', 'r-3'], 1]);
});

test('the look itself fails: still uncertain, nothing sent', async () => {
  const a = startAttempt(77, 'method', { bill: BILL, lines: [line('r-4')], view: {} });
  const s = fakeServer([lost()], [lost()]);
  await runAttempt(a, s);
  const again = await runAttempt(a, s);
  assert.deepEqual([again.failed.kind, a.uncertain, s.sent], ['offline', true, ['r-4']]);
  dropAttempt(a);
});

test('a clear refusal before anything was taken: the lines may change', async () => {
  const a = startAttempt(77, 'method', { bill: BILL, lines: [line('r-5')], view: {} });
  const s = fakeServer([server(409, { code: 'over_balance', balance_cents: 1000 })]);
  const result = await runAttempt(a, s);
  assert.deepEqual([result.failed.code, attemptOf(77, 'method'), linesLocked(attemptOf(77, 'method'))], ['over_balance', null, false]);
});

test('card: the payment went, the tip had no answer — the layout stays, only the tip goes again with its id', async () => {
  const lines = [line('pay-1', { method: 'card' }), line('tip-1', { kind: 'tip', amount_cents: 500 }), line('tip-2', { kind: 'tip', amount_cents: 500 })];
  const a = startAttempt(77, 'card', { bill: BILL, lines, view: { cents: 6000, tipCents: 1000, forKey: 'split' } });
  // the bill after: the card payment (answered, so not «new») and nothing else
  const s = fakeServer([ok(20), lost(), ok(21), ok(22)], [{ id: 77, payments: [...BILL.payments, row(20, { method: 'card' })] }]);
  await runAttempt(a, s);
  assert.deepEqual([answeredCount(a), a.uncertain, linesLocked(a)], [1, true, true]);
  // Back to Tip, Next again: the same attempt
  assert.equal(attemptOf(77, 'card'), a);
  const again = await runAttempt(a, s);
  assert.deepEqual([again.done, s.sent], [true, ['pay-1', 'tip-1', 'tip-1', 'tip-2']], 'the payment is not sent again');
});

test('card: one of two tips is on the bill — both unanswered go again with their ids; all of them — «Already recorded»', async () => {
  const lines = [line('pay-2'), line('tip-3', { kind: 'tip' }), line('tip-4', { kind: 'tip' })];
  const a = startAttempt(77, 'card', { bill: BILL, lines, view: {} });
  const s = fakeServer([ok(30), lost(), ok(31), ok(32)], [{ id: 77, payments: [...BILL.payments, row(30), row(31, { kind: 'tip' })] }]);
  await runAttempt(a, s);
  const again = await runAttempt(a, s);
  assert.deepEqual([again.done, s.sent], [true, ['pay-2', 'tip-3', 'tip-3', 'tip-4']]);

  const b = startAttempt(77, 'card', { bill: BILL, lines: [line('pay-3'), line('tip-5', { kind: 'tip' })], view: {} });
  const t = fakeServer([lost()], [{ id: 77, payments: [...BILL.payments, row(40), row(41, { kind: 'tip', amount_cents: 500 })] }]);
  await runAttempt(b, t);
  const found = await runAttempt(b, t);
  assert.deepEqual([found.already.map((p) => p.id), t.sent], [[40, 41], ['pay-3']]);
  assert.equal(alreadyLine(found.already), 'Already recorded: $60.00 cash · 11:31 AM, $5.00 tip · 11:31 AM');
});

test('what counts as new: my own, not void, not there at the start, not named by an answer', () => {
  const a = startAttempt(77, 'tip', { bill: { id: 77, payments: [row(1), row(2, { voided_at: '2026-11-17T16:00:00Z' })] }, lines: [line('x-1')], view: {} });
  assert.deepEqual(mineIds({ payments: [row(1), row(2, { mine: false })] }), [1]);
  a.answered['x-0'] = 5;
  const bill = { id: 77, payments: [row(1), row(2, { voided_at: 'x' }), row(3, { mine: false }), row(4, { voided_at: '2026-11-17T16:40:00Z' }), row(5), row(6)] };
  assert.deepEqual(newRecords(bill, a).map((p) => p.id), [6]);
  assert.deepEqual(newRecords({ id: 77 }, a), [], 'a bill without payments');
});

test('Pay read the bill again: its attempts are forgotten, other bills keep theirs', () => {
  startAttempt(77, 'method', { bill: BILL, lines: [line('f-1')], view: {} });
  startAttempt(77, 'card', { bill: BILL, lines: [line('f-2')], view: {} });
  const other = startAttempt(78, 'method', { bill: { id: 78, payments: [] }, lines: [line('f-3')], view: {} });
  forgetBill(77);
  assert.deepEqual([attemptOf(77, 'method'), attemptOf(77, 'card'), attemptOf(78, 'method')], [null, null, other]);
  forgetBill(78);
  assert.equal(linesLocked(null), false);
});
