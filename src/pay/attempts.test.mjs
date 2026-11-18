import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOK_AGAIN, answeredCount, attemptOf, dropAttempt, forgetBill, linesLocked, lockedTipOf, noAnswer, runAttempt, startAttempt } from './attempts.js';
import { alreadyLine, payError, tipButtons } from './model.js';

// Errors as axios gives them: no response (no connection, a timeout), or the server's answer
const lost = () => Object.assign(new Error('Network Error'), { response: undefined });
const server = (status, data = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

const row = (id, extra = {}) => ({ id, kind: 'payment', method: 'cash', amount_cents: 6000, mine: true, voided_at: null, received_at: '2026-11-17T16:31:00Z', ...extra });
const line = (rid, extra = {}) => ({ rid, body: { amount_cents: 6000, method: 'cash', client_request_id: rid, ...extra } });

// A fake server that keeps rows by client_request_id, as billPayments.js does: a repeat answers
// the row it made, created: false. lose: the ids whose FIRST answer is lost after the row is
// written; fail: the ids whose first try fails before anything is written (an error to throw).
function fakeServer({ lose = [], fail = {} } = {}) {
  const rows = new Map();
  const sent = [];
  let next = 100;
  const once = { lose: new Set(lose), fail: { ...fail } };
  return {
    sent,
    rows,
    record: async (body) => {
      const rid = body.client_request_id;
      sent.push(rid);
      if (once.fail[rid]) { const error = once.fail[rid]; delete once.fail[rid]; throw error; }
      const known = rows.get(rid);
      const payment = known || row(next++, { kind: body.kind || 'payment', amount_cents: body.amount_cents, method: body.method });
      if (!known) rows.set(rid, payment);
      if (once.lose.has(rid)) { once.lose.delete(rid); throw lost(); }
      return { payment, bill: { id: 77 }, created: !known };
    },
  };
}

test('which failures may have gone through', () => {
  assert.equal(noAnswer(payError(lost())), true, 'no connection, a timeout');
  assert.equal(noAnswer(payError(server(500))), true);
  assert.equal(noAnswer(payError(server(502))), true);
  assert.equal(noAnswer(payError(server(409, { code: 'over_balance', balance_cents: 0 }))), false);
  assert.equal(noAnswer(payError(server(400, { error: 'bad' }))), false);
  assert.equal(noAnswer(payError(server(403, { code: 'payments_off' }))), false);
});

test('one line: recorded, the attempt is gone', async () => {
  const a = startAttempt(77, 'method', { lines: [line('r-1')], view: { cents: 6000 } });
  const s = fakeServer();
  const result = await runAttempt(a, s);
  assert.deepEqual([result.done, result.data.payment.id, s.sent, attemptOf(77, 'method')], [true, 100, ['r-1'], null]);
});

test('the answer was lost after the row was written: locked; the next press sends the same id — «Already recorded», one row', async () => {
  const a = startAttempt(77, 'method', { lines: [line('r-2')], view: { cents: 6000 } });
  const s = fakeServer({ lose: ['r-2'] });
  const first = await runAttempt(a, s);
  assert.equal(first.failed.kind, 'offline');
  assert.deepEqual([a.uncertain, linesLocked(a), attemptOf(77, 'method')], [true, true, a], 'kept by bill: the screen opened again finds it');
  const second = await runAttempt(attemptOf(77, 'method'), s);
  assert.deepEqual([second.already.map((p) => p.id), s.sent, s.rows.size, attemptOf(77, 'method')], [[100], ['r-2', 'r-2'], 1, null]);
  assert.equal(alreadyLine(second.already), 'Already recorded: $60.00 cash · 11:31 AM');
});

test('it failed before anything was written (a 5xx): the same id again records it now', async () => {
  const a = startAttempt(77, 'method', { lines: [line('r-3')], view: {} });
  const s = fakeServer({ fail: { 'r-3': server(503) } });
  assert.equal((await runAttempt(a, s)).failed.kind, 'failed');
  const again = await runAttempt(a, s);
  assert.deepEqual([again.done, s.sent, s.rows.size], [true, ['r-3', 'r-3'], 1]);
});

test('still no connection: still uncertain, the lines stay', async () => {
  const a = startAttempt(77, 'method', { lines: [line('r-4')], view: {} });
  const s = fakeServer({ fail: { 'r-4': lost() } });
  await runAttempt(a, s);
  assert.deepEqual([a.uncertain, linesLocked(a), attemptOf(77, 'method')], [true, true, a]);
  dropAttempt(a);
});

test('a clear refusal before anything was taken: the lines may change', async () => {
  const a = startAttempt(77, 'method', { lines: [line('r-5')], view: {} });
  const s = fakeServer({ fail: { 'r-5': server(409, { code: 'over_balance', balance_cents: 1000 }) } });
  const result = await runAttempt(a, s);
  assert.deepEqual([result.failed.code, attemptOf(77, 'method'), linesLocked(attemptOf(77, 'method'))], ['over_balance', null, false]);
});

test('card: the payment went, the tip had no answer — the layout stays, only the tip goes again with its id', async () => {
  const lines = [line('pay-1', { method: 'card' }), line('tip-1', { kind: 'tip', amount_cents: 500 }), line('tip-2', { kind: 'tip', amount_cents: 500 })];
  const a = startAttempt(77, 'card', { lines, view: { cents: 6000, tipCents: 1000, forKey: 'split' } });
  const s = fakeServer({ fail: { 'tip-1': lost() } });
  await runAttempt(a, s);
  assert.deepEqual([answeredCount(a), a.uncertain, linesLocked(a)], [1, true, true]);
  // Back to Tip, Next again: the same attempt
  assert.equal(attemptOf(77, 'card'), a);
  const again = await runAttempt(a, s);
  assert.deepEqual([again.done, s.sent, s.rows.size], [true, ['pay-1', 'tip-1', 'tip-1', 'tip-2'], 3], 'the payment is not sent again');
});

test('card: the first tip did go, its answer was lost — sent again it is one row; a line made now is not «Already recorded»', async () => {
  const a = startAttempt(77, 'card', { lines: [line('pay-2'), line('tip-3', { kind: 'tip' }), line('tip-4', { kind: 'tip' })], view: {} });
  const s = fakeServer({ lose: ['tip-3'] });
  await runAttempt(a, s);
  const again = await runAttempt(a, s);
  assert.deepEqual([again.done, s.sent, s.rows.size], [true, ['pay-2', 'tip-3', 'tip-3', 'tip-4'], 3]);

  // every line had gone, every answer was lost on the way back
  const b = startAttempt(77, 'card', { lines: [line('pay-3'), line('tip-5', { kind: 'tip', amount_cents: 500 })], view: {} });
  const t = fakeServer({ lose: ['pay-3'] });
  t.rows.set('tip-5', row(41, { kind: 'tip', amount_cents: 500 }));
  await runAttempt(b, t);
  const found = await runAttempt(b, t);
  assert.deepEqual([found.already.map((p) => p.id), t.sent, t.rows.size], [[100, 41], ['pay-3', 'pay-3', 'tip-5'], 2]);
  assert.equal(alreadyLine(found.already), 'Already recorded: $60.00 cash · 11:31 AM, $5.00 tip · 11:31 AM');
});

test('card: the payment went, the tip was refused — the attempt stays, the layout does not change', async () => {
  const a = startAttempt(77, 'card', { lines: [line('pay-9'), line('tip-9', { kind: 'tip' })], view: { forKey: 'me' } });
  const s = fakeServer({ fail: { 'tip-9': server(400, { error: 'tip_for_user_id must be a technician of the visit' }) } });
  const result = await runAttempt(a, s);
  assert.deepEqual([result.failed.kind, attemptOf(77, 'card'), linesLocked(a), a.uncertain], ['refused', a, true, false]);
  const again = await runAttempt(a, s);
  assert.deepEqual([again.done, s.sent], [true, ['pay-9', 'tip-9', 'tip-9']], 'only the tip goes again');
});

test('Pay read the bill again: its attempts are forgotten, other bills keep theirs', () => {
  startAttempt(77, 'method', { lines: [line('f-1')], view: {} });
  startAttempt(77, 'card', { lines: [line('f-2')], view: {} });
  const other = startAttempt(78, 'method', { lines: [line('f-3')], view: {} });
  forgetBill(77);
  assert.deepEqual([attemptOf(77, 'method'), attemptOf(77, 'card'), attemptOf(78, 'method')], [null, null, other]);
  forgetBill(78);
  assert.equal(linesLocked(null), false);
});

test('Pay read the bill again: an attempt without an answer stays (its line may still be on the way), the rest go', async () => {
  // the tip's answer is lost after the payment went: the card attempt is uncertain
  const s = fakeServer({ lose: ['tip-u'] });
  const card = startAttempt(81, 'card', { lines: [line('pay-u'), line('tip-u', { kind: 'tip' })], view: { cents: 16041, tipCents: 1000, forKey: 'me' } });
  await runAttempt(card, s);
  // a refused attempt after a recorded line: locked, but settled — Pay forgets it
  const method = startAttempt(81, 'method', { lines: [line('m-1'), line('m-2')], view: {} });
  await runAttempt(method, fakeServer({ fail: { 'm-2': server(409, { code: 'over_balance' }) } }));
  assert.deepEqual([card.uncertain, linesLocked(card), method.uncertain, linesLocked(method)], [true, true, false, true]);
  forgetBill(81);
  assert.equal(attemptOf(81, 'card'), card, 'the uncertain one lives');
  assert.equal(attemptOf(81, 'method'), null);
  // the next press settles it with the same ids: one row each
  const again = await runAttempt(card, s);
  assert.equal(again.done, true);
  assert.deepEqual(s.sent, ['pay-u', 'tip-u', 'tip-u']);
  assert.equal(s.rows.size, 2);
  forgetBill(81);
  assert.equal(attemptOf(81, 'card'), null);
});

test('the tip screen while the card attempt is locked: the tip that went, marked; the yellow box words', async () => {
  const buttons = tipButtons(null, 15041);                // $5 / $10 / $20
  const view = { cents: 15041, tipCents: 1000, forKey: 'me' };
  const fresh = startAttempt(90, 'card', { lines: [line('c-1'), line('c-2', { kind: 'tip' })], view });
  assert.equal(lockedTipOf(fresh, buttons), null, 'nothing sent yet: the tip may change');
  await runAttempt(fresh, fakeServer({ lose: ['c-1'] }));
  assert.deepEqual(lockedTipOf(attemptOf(90, 'card'), buttons), {
    picked: buttons.find((b) => b.cents === 1000).key, typed: '', cents: 15041, tipCents: 1000,
    title: 'Tip $10.00 is locked',
    text: 'The card charge of $160.41 already went out. To change the tip, void it after it is recorded.',
  });
  // a typed tip: Custom with its dollars; no tip: No tip
  const typed = startAttempt(91, 'card', { lines: [line('d-1'), line('d-2', { kind: 'tip' })], view: { ...view, tipCents: 1250 } });
  await runAttempt(typed, fakeServer({ lose: ['d-2'] }));
  assert.deepEqual([lockedTipOf(typed, buttons).picked, lockedTipOf(typed, buttons).typed], ['custom', '12.50']);
  const none = startAttempt(92, 'card', { lines: [line('e-1')], view: { ...view, tipCents: 0 } });
  await runAttempt(none, fakeServer({ lose: ['e-1'] }));
  assert.deepEqual([lockedTipOf(none, buttons).picked, lockedTipOf(none, buttons).title], ['none', 'Tip $0.00 is locked']);
  // only the card's attempt locks the tip screen
  const cash = startAttempt(93, 'tip', { lines: [line('t-1', { kind: 'tip' })], view: {} });
  await runAttempt(cash, fakeServer({ lose: ['t-1'] }));
  assert.equal(lockedTipOf(cash, buttons), null);
  assert.equal(lockedTipOf(null, buttons), null);
  for (const id of [90, 91, 92, 93]) for (const flow of ['card', 'tip']) dropAttempt(attemptOf(id, flow));
});

test('the words under the button (the Designer on #50)', () => {
  assert.equal(LOOK_AGAIN, 'Press again: the same payment is sent, and the server records it only once.');
});
