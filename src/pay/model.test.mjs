import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  METHODS, OTHER_CHOICES, PART_REASONS, VOID_REASONS, amountOf, canPay, chargeOf, chipOf, chosenMethod, countWord, dueOf, historyOf, holderLine, inHand,
  laterReasonGiven, methodWord, minutesLeft, moneyCents, numbersOf, paidAt, payError, payTile, paymentBody, recordedLine, shortPerson, stageOf,
  tipButtons, tipForChoices, tipForLine, tipParts, voidBody, tipPresetsOf, paymentInstructionsOf, helperIdOf, SPLIT_WITH_HELPER,
} from './model.js';

// The design's bill (design-mockups/payments): NY-1048, $175.29, Ivan Petrov; $100.00 cash at
// 2:24 PM (19:24Z on Nov 17), then $75.29 by check #1042 at 2:26 PM
const VISIT = { id: 31, role: 'main', status: 'closed', legacy: false, helper_id: 7, helper_name: 'Mike Torres' };
const ISSUED = {
  id: 5, status: 'issued', label: 'NY-1048', bill_number: 1048, total_cents: 17529, deposits_applied_cents: 0,
  issued_at: '2026-11-17T19:20:00Z', delivered_at: '2026-11-17T19:22:00Z',
  paid_cents: 0, balance_cents: 17529, payment_status: 'unpaid', tips_cents: 0, payments: [],
};
const CASH = {
  id: 1, kind: 'payment', method: 'cash', method_note: null, amount_cents: 10000, note: 'Has $100 cash, rest by check', check_number: null,
  received_at: '2026-11-17T19:24:00Z', recorded_by_name: 'Ivan Petrov', mine: true, voided_at: null, can_void: true, void_until: '2026-11-17T19:39:00Z',
  before_delivery: false, tip_for_name: null,
};
const CHECK = { ...CASH, id: 2, method: 'check', amount_cents: 7529, note: null, check_number: '1042', received_at: '2026-11-17T19:26:00Z', void_until: '2026-11-17T19:41:00Z' };
const PART = { ...ISSUED, paid_cents: 10000, balance_cents: 7529, payment_status: 'partly_paid', payments: [CASH] };
const PAID = { ...ISSUED, paid_cents: 17529, balance_cents: 0, payment_status: 'paid', payments: [CASH, CHECK] };
const err = (status, data = {}) => ({ response: { status, data } });
const NOW = { date: '2026-11-17', minutes: 14 * 60 + 25 };

test('who takes the money: the main technician of a visit of the new schedule, as the bill', () => {
  assert.equal(canPay(VISIT), true);
  assert.equal(canPay({ ...VISIT, role: 'helper' }), false);
  assert.equal(canPay({ ...VISIT, legacy: true }), false);
  assert.equal(canPay({ ...VISIT, outcome: 'no_access' }), false);
});

test('the Pay button says the bill\'s payment status (design pay-states)', () => {
  const tile = (bill, status = 'issued', o) => payTile(VISIT, { status, bill }, o);
  assert.deepEqual(tile({ ...ISSUED, status: 'draft' }, 'draft'), { title: 'Pay', line: 'Bill first', kind: 'wait', off: false });
  assert.equal(payTile(VISIT, { status: 'none', bill: null }).line, 'Bill first');
  assert.equal(tile({ ...ISSUED, delivered_at: null }).line, 'Give the bill first');
  assert.equal(tile(ISSUED).line, '$175.29 due');
  assert.equal(tile(ISSUED).kind, 'due');
  assert.equal(tile(PART).line, '$75.29 left');
  assert.equal(tile(PAID).line, 'Paid 2:26 PM');
  assert.equal(tile(PAID).kind, 'paid');
  assert.equal(tile({ ...ISSUED, total_cents: 0, balance_cents: 0, payment_status: 'no_charge' }).line, 'Nothing to pay');
  assert.equal(tile(ISSUED, 'issued', { offline: true }).line, '$175.29 due · offline');
  assert.equal(tile(ISSUED, 'unknown').line, '$175.29 due · offline');
  assert.equal(payTile(VISIT, { status: 'unknown', bill: null }).line, 'Needs connection');
  assert.equal(payTile(VISIT, null).kind, 'loading');
  assert.equal(payTile({ ...VISIT, role: 'helper' }, { status: 'issued', bill: ISSUED }), null);
  // sent later with a reason: the payment went before delivery, the button counts the money
  const later = { ...PART, delivered_at: null, payments: [{ ...CASH, before_delivery: true }] };
  assert.equal(tile(later).line, '$75.29 left');
});

test('paid at: the latest payment that counts, tips and void ones not', () => {
  const tip = { ...CHECK, id: 3, kind: 'tip', received_at: '2026-11-17T19:30:00Z' };
  const voided = { ...CHECK, id: 4, voided_at: '2026-11-17T19:31:00Z', received_at: '2026-11-17T19:31:00Z' };
  assert.equal(paidAt({ ...PAID, payments: [CASH, CHECK, tip, voided] }).minutes, 14 * 60 + 26);
  assert.equal(paidAt(ISSUED), null);
});

test('the head: chip, numbers, due and the stage', () => {
  assert.deepEqual(chipOf(ISSUED, NOW), { text: 'Bill NY-1048 · given 2:22 PM', kind: 'done' });
  assert.deepEqual(chipOf({ ...ISSUED, delivered_at: null }, NOW), { text: 'Bill NY-1048 · issued 2:20 PM, not given', kind: 'warn' });
  assert.equal(chipOf(ISSUED, { date: '2026-11-18', minutes: 0 }).text, 'Bill NY-1048 · given Nov 17');
  assert.deepEqual(numbersOf(PART).map((n) => n.value), ['$175.29', '$100.00', '$75.29']);
  assert.equal(dueOf({ ...ISSUED, balance_cents: -500 }), 0);
  assert.equal(stageOf(null), 'none');
  assert.equal(stageOf({ ...ISSUED, status: 'draft' }), 'none');
  assert.equal(stageOf({ ...ISSUED, status: 'void' }), 'void');
  assert.equal(stageOf({ ...ISSUED, delivered_at: null }), 'show');
  assert.equal(stageOf(ISSUED), 'collect');
  assert.equal(stageOf(PART), 'collect');
  assert.equal(stageOf(PAID), 'paid');
  assert.equal(stageOf({ ...ISSUED, payment_status: 'overpaid' }), 'paid');
  assert.equal(stageOf({ ...ISSUED, payment_status: 'no_charge' }), 'free');
  const later = { ...PART, delivered_at: null, payments: [{ ...CASH, before_delivery: true }] };
  assert.equal(stageOf(later), 'collect');
  assert.equal(laterReasonGiven(later), true);
  assert.equal(laterReasonGiven(PART), false);
});

test('the history: time, method, who, note; void link with the minutes left; a void row says why', () => {
  const now = Date.parse('2026-11-17T19:25:10Z');
  const rows = historyOf(PAID, now);
  assert.equal(rows[0].title, '2:24 PM · Cash');
  assert.equal(rows[0].sub, 'Ivan P. · “Has $100 cash, rest by check”');
  assert.equal(rows[0].amount, '$100.00');
  assert.equal(rows[0].voidLeft, 14);
  assert.equal(rows[1].title, '2:26 PM · Check #1042');
  assert.equal(countWord(rows), '2 payments');
  const other = historyOf({ payments: [{ ...CASH, method: 'other', method_note: 'Cash App', note: null, can_void: false }] }, now)[0];
  assert.equal(other.title, '2:24 PM · Cash App');
  assert.equal(other.voidLeft, 0);
  const tip = historyOf({ payments: [{ ...CASH, kind: 'tip', tip_for_name: 'Ivan Petrov', note: null }] }, now)[0];
  assert.equal(tip.title, '2:24 PM · Tip for Ivan P. · Cash');
  assert.equal(tip.tip, true);
  assert.equal(countWord([tip]), '0 payments · 1 tip');
  assert.equal(countWord([...rows, tip]), '2 payments · 1 tip');
  assert.equal(countWord([...rows, tip, tip]), '2 payments · 2 tips');
  const voided = historyOf({ payments: [{ ...CASH, voided_at: '2026-11-17T19:25:00Z', voided_by_name: 'Ivan Petrov', void_reason: 'Wrong amount', can_void: false }] }, now)[0];
  assert.equal(voided.voided, true);
  assert.equal(voided.voidLine, 'Void 2:25 PM by Ivan P.: Wrong amount');
  assert.equal(historyOf({ payments: [{ ...CASH, before_delivery: true, note: null }] }, now)[0].sub, 'Ivan P. · bill sent later');
});

test('what the card charge is of the bill: whole, the rest, a part', () => {
  assert.deepEqual(chargeOf(ISSUED, false), { tipLabel: 'Bill NY-1048', title: 'Bill NY-1048', sub: 'Total with tax' });
  assert.deepEqual(chargeOf(PART, false), { tipLabel: 'Left on NY-1048', title: 'Rest of NY-1048', sub: 'Total $175.29 · $100.00 paid' });
  assert.deepEqual(chargeOf(ISSUED, true), { tipLabel: 'Part of NY-1048', title: 'Part of NY-1048', sub: 'Total $175.29' });
  assert.equal(chargeOf(PART, true).sub, 'Total $175.29 · $100.00 paid');
});

test('minutes left and short names', () => {
  assert.equal(minutesLeft('2026-11-17T19:39:00Z', Date.parse('2026-11-17T19:24:00Z')), 15);
  assert.equal(minutesLeft('2026-11-17T19:39:00Z', Date.parse('2026-11-17T19:38:59Z')), 1);
  assert.equal(minutesLeft('2026-11-17T19:39:00Z', Date.parse('2026-11-17T19:39:00Z')), 0);
  assert.equal(minutesLeft(null, 0), 0);
  // the phone's clock 70 s behind the server's: still 15, not 16 (the Designer on #62)
  assert.equal(minutesLeft('2026-11-17T19:39:00Z', Date.parse('2026-11-17T19:22:50Z')), 15);
  assert.equal(shortPerson('Ivan Petrov'), 'Ivan P.');
  assert.equal(shortPerson('Team'), 'Team');
  assert.equal(shortPerson(''), '');
});

test('how much: full, part with a note, never over the balance', () => {
  assert.deepEqual(amountOf({ full: true }, 17529), { cents: 17529, part: false, left: 0, error: null });
  assert.match(amountOf({ full: true }, 0).error, /Nothing is due/);
  assert.equal(amountOf({ full: false, typed: '100', note: '' }, 17529).error, 'Why only part? Pick a reason or type a note.');
  assert.deepEqual(amountOf({ full: false, typed: '100.00', note: PART_REASONS[0] }, 17529), { cents: 10000, part: true, left: 7529, error: null });
  assert.equal(amountOf({ full: false, typed: '175.29', note: '' }, 17529).error, null); // the whole balance typed: no note needed
  assert.match(amountOf({ full: false, typed: '200', note: 'x' }, 17529).error, /Only \$175\.29 is due/);
  assert.match(amountOf({ full: false, typed: '175.30', note: 'x' }, 17529).error, /Only \$175\.29 is due/); // a cent over
  assert.match(amountOf({ full: false, typed: '0', note: 'x' }, 17529).error, /Type the amount/);
  assert.match(amountOf({ full: false, typed: 'abc', note: 'x' }, 17529).error, /Type the amount/);
  assert.equal(moneyCents('$1,250.5'), 125050);
  assert.equal(moneyCents('12.345'), null);
});

test('the methods: six tiles, bank transfer inside Other, who has the money', () => {
  assert.deepEqual(METHODS.map((m) => m.method), ['cash', 'check', 'card', 'zelle', 'venmo', 'other']);
  assert.deepEqual(chosenMethod('cash'), { method: 'cash', name: null });
  assert.deepEqual(chosenMethod('other', 'bank_transfer'), { method: 'bank_transfer', name: null });
  assert.deepEqual(chosenMethod('other', 'cash_app'), { method: 'other', name: 'Cash App' });
  assert.deepEqual(chosenMethod('other', 'else', '  Apple Pay '), { method: 'other', name: 'Apple Pay' });
  assert.deepEqual(chosenMethod('other', null), { method: null, name: null });
  assert.equal(OTHER_CHOICES.length, 4);
  assert.deepEqual(['cash', 'check', 'other', 'card', 'zelle', 'venmo', 'bank_transfer'].map(inHand), [true, true, true, false, false, false, false]);
  assert.equal(methodWord('bank_transfer'), 'bank transfer');
  assert.equal(methodWord('other', 'PayPal'), 'PayPal');
  // no list of checks to turn in and no «turned in» mark: the words promise neither
  assert.equal(holderLine('cash'), 'Money on hand: you. Turn it in to the office.');
  assert.equal(holderLine('check'), 'Money on hand: you. Turn it in to the office.');
  assert.equal(holderLine('other'), 'Money on hand: you. Turn it in to the office.');
  assert.equal(holderLine('zelle'), 'Money on hand: the office. Nothing to turn in.');
  assert.equal(holderLine('cash', { kind: 'tip' }), 'Money on hand: you. The office sees it under Tips on the bill.');
  assert.equal(holderLine(null), null);
});

test('tip buttons: the company\'s amounts or percent of the total with tax; $5 $10 $20 by default', () => {
  assert.deepEqual(tipButtons(null, 17529).map((b) => [b.label, b.cents]), [['$5', 500], ['$10', 1000], ['$20', 2000]]);
  assert.deepEqual(tipButtons({ mode: 'percent', values: [10000, 15000, 20000] }, 17529).map((b) => [b.label, b.sub, b.cents]),
    [['10%', '$17.53', 1753], ['15%', '$26.29', 2629], ['20%', '$35.06', 3506]]);
  assert.deepEqual(tipButtons({ mode: 'amount', values: [750] }, 100).map((b) => b.label), ['$7.50']);
  assert.equal(tipButtons({ mode: 'amount', values: [] }, 100).length, 3); // a broken setting: the default
  assert.equal(tipButtons({ mode: 'amount', values: [1, 2, 3, 4, 5, 6, 7] }, 100).length, 3);
  assert.equal(tipButtons({ mode: 'weird', values: [5] }, 100)[0].cents, 500);
});

test('who the tip is for: you, split with the helper (odd cent yours), the team', () => {
  // «Split with the helper» is hidden until the owner decides (8б): not even with a helper
  assert.equal(SPLIT_WITH_HELPER, false);
  assert.deepEqual(tipForChoices(VISIT, 'Ivan Petrov').map((c) => c.key), ['me', 'team']);
  assert.deepEqual(tipForChoices(VISIT, 'Ivan Petrov', { split: true }).map((c) => c.key), ['me', 'split', 'team']);
  assert.equal(tipForChoices(VISIT, 'Ivan Petrov')[0].title, 'Ivan P. · you');
  assert.deepEqual(tipForChoices({ ...VISIT, helper_id: null }, 'Ivan Petrov', { split: true }).map((c) => c.key), ['me', 'team']);
  // the helper's id is the card's helper_id (backend #192), not the office's second_technician_id
  assert.deepEqual(tipForChoices({ ...VISIT, helper_id: undefined, second_technician_id: 7 }, 'Ivan Petrov', { split: true }).map((c) => c.key), ['me', 'team']);
  assert.deepEqual([helperIdOf(VISIT), helperIdOf({ helper_id: '7' }), helperIdOf({ helper_id: 0 }), helperIdOf(null)], [7, null, null, null]);
  assert.deepEqual(tipParts(1000, 'me', VISIT), [{ cents: 1000 }]);
  assert.deepEqual(tipParts(1001, 'split', VISIT), [{ cents: 501 }, { cents: 500, tip_for_user_id: 7 }]);
  assert.deepEqual(tipParts(1, 'split', VISIT), [{ cents: 1 }]);
  assert.deepEqual(tipParts(1000, 'split', { ...VISIT, helper_id: null }), [{ cents: 1000 }]);
  assert.deepEqual(tipParts(1000, 'team', VISIT), [{ cents: 1000, tip_for_user_id: null }]);
  assert.deepEqual(tipParts(0, 'me', VISIT), []);
  assert.equal(tipForLine('me', VISIT, 'Ivan Petrov'), 'For Ivan P. · no tax');
  assert.equal(tipForLine('split', VISIT, 'Ivan Petrov'), 'For Ivan P. and Mike · no tax');
});

test('the body of a payment: as the server takes it, refusals in words', () => {
  assert.deepEqual(paymentBody({ cents: 10000, method: 'cash', note: ' Has $100 ', requestId: 'r1' }).body,
    { kind: 'payment', amount_cents: 10000, method: 'cash', client_request_id: 'r1', note: 'Has $100' });
  assert.deepEqual(paymentBody({ cents: 7529, method: 'check', checkNumber: '1042', requestId: 'r2' }).body,
    { kind: 'payment', amount_cents: 7529, method: 'check', client_request_id: 'r2', check_number: '1042' });
  assert.equal(paymentBody({ cents: 7529, method: 'check', requestId: 'r' }).body.check_number, undefined); // the server warns, does not refuse
  assert.equal(paymentBody({ cents: 7529, method: 'cash', checkNumber: '1042', requestId: 'r' }).body.check_number, undefined);
  assert.deepEqual(paymentBody({ cents: 7529, method: 'other', name: 'Cash App', requestId: 'r' }).body.method_note, 'Cash App');
  assert.match(paymentBody({ cents: 7529, method: 'other', name: ' ', requestId: 'r' }).error, /type what/);
  assert.equal(paymentBody({ cents: 7529, method: 'bank_transfer', requestId: 'r' }).body.method_note, undefined);
  assert.deepEqual(paymentBody({ cents: 100, method: 'cash', later: { reason: 'Printer is out' }, requestId: 'r' }).body,
    { kind: 'payment', amount_cents: 100, method: 'cash', client_request_id: 'r', before_delivery: true, before_delivery_reason: 'Printer is out' });
  assert.match(paymentBody({ cents: 100, method: 'cash', later: { reason: '' }, requestId: 'r' }).error, /why the bill is sent later/);
  assert.match(paymentBody({ cents: 0, method: 'cash', requestId: 'r' }).error, /more than/);
  assert.match(paymentBody({ cents: 100, method: 'bitcoin', requestId: 'r' }).error, /Choose how/);
  assert.match(paymentBody({ cents: 100, method: 'cash', note: 'x'.repeat(501), requestId: 'r' }).error, /500/);
  // tips: the main technician by the server's default (no field), the helper by id, the team null
  assert.equal('tip_for_user_id' in paymentBody({ kind: 'tip', cents: 500, method: 'card', tipFor: { cents: 500 }, requestId: 'r' }).body, false);
  assert.equal(paymentBody({ kind: 'tip', cents: 500, method: 'card', tipFor: { cents: 500, tip_for_user_id: 7 }, requestId: 'r' }).body.tip_for_user_id, 7);
  assert.equal(paymentBody({ kind: 'tip', cents: 500, method: 'card', tipFor: { cents: 500, tip_for_user_id: null }, requestId: 'r' }).body.tip_for_user_id, null);
  assert.equal(paymentBody({ kind: 'payment', cents: 500, method: 'card', tipFor: { tip_for_user_id: 7 }, requestId: 'r' }).body.tip_for_user_id, undefined);
});

test('the banner after a record', () => {
  assert.equal(recordedLine(CASH), '$100.00 cash recorded · 2:24 PM');
  assert.equal(recordedLine({ ...CASH, kind: 'tip', amount_cents: 2000 }), '$20.00 tip recorded · 2:24 PM');
  assert.equal(recordedLine({ ...CASH, method: 'other', method_note: 'PayPal' }), '$100.00 PayPal recorded · 2:24 PM');
  assert.equal(recordedLine(null), null);
});

test('voiding one\'s own record: a reason from the chips or typed', () => {
  assert.deepEqual(voidBody(VOID_REASONS[0], 'Typed 100, customer gave 80'), { body: { reason: 'Wrong amount: Typed 100, customer gave 80' } });
  assert.deepEqual(voidBody(null, ' Typed wrong '), { body: { reason: 'Typed wrong' } });
  assert.deepEqual(voidBody('Wrong method', ''), { body: { reason: 'Wrong method' } });
  assert.match(voidBody(null, '  ').error, /Say why/);
});

test('the server\'s refusals in words', () => {
  assert.equal(payError(new Error('Network Error')).kind, 'offline');
  assert.match(payError(err(409, { code: 'not_delivered' })).text, /Give the bill/);
  assert.deepEqual(payError(err(409, { code: 'over_balance', balance_cents: 7529 })), {
    kind: 'refused', code: 'over_balance', balance: 7529, text: 'Only $75.29 is due now. Someone recorded a payment meanwhile: check the amount.' });
  assert.equal(payError(err(409, { code: 'over_balance', balance_cents: 0 })).text, 'Nothing is due on this bill now.');
  assert.match(payError(err(400, { code: 'note_required' })).text, /note/);
  assert.match(payError(err(403, { code: 'void_window_passed' })).text, /an admin voids it/);
  assert.match(payError(err(403, { code: 'payments_off' })).text, /turned off/);
  assert.match(payError(err(409, { code: 'not_issued' })).text, /The bill is not final yet/);
  assert.match(payError(err(409, { code: 'bill_void' })).text, /void/);
  assert.equal(payError(err(404, { error: 'This visit has no bill yet: draft it first' })).code, 'no_bill');
  assert.equal(payError(err(404, { error: 'Payment not found' })).code, 'not_found');
  assert.equal(payError(err(404, { error: 'Visit not found' })).kind, 'gone');
  assert.equal(payError(err(400, { error: 'method is required: cash, check' })).text, 'method is required: cash, check.');
  assert.equal(payError(err(500)).kind, 'failed');
});

test('the company\'s settings from the bill answer: tip buttons and how to pay (backend #192)', () => {
  const presets = { mode: 'percent', values: [15000, 20000] };
  assert.deepEqual(tipPresetsOf({ tip_presets: presets }), presets);
  assert.equal(tipPresetsOf({ company: { tip_presets: presets } }), null, 'at the top of the answer, not in company');
  assert.deepEqual([tipPresetsOf({}), tipPresetsOf(null), tipPresetsOf({ tip_presets: 'x' })], [null, null, null]);
  assert.deepEqual(tipButtons(tipPresetsOf({ tip_presets: presets, total_cents: 10000 }), 10000).map((b) => [b.label, b.cents]), [['15%', 1500], ['20%', 2000]]);
  assert.equal(paymentInstructionsOf({ payment_instructions: '  Zelle (718) 555-0100 ' }), 'Zelle (718) 555-0100');
  assert.deepEqual([paymentInstructionsOf({ payment_instructions: '   ' }), paymentInstructionsOf({ payment_instructions: null }), paymentInstructionsOf({}), paymentInstructionsOf(null)],
    [null, null, null, null]);
});

test('numbers of a bill that took a deposit (DEP-2, design deposits app-repair-pay)', () => {
  const took = { ...ISSUED, deposits_applied_cents: 10000, balance_cents: 7529 };
  assert.deepEqual(numbersOf(took).map((n) => [n.label, n.value]), [['Total', '$175.29'], ['Deposit', '−$100.00'], ['Due', '$75.29']]);
  const partly = { ...took, paid_cents: 5000, balance_cents: 2529 };
  assert.deepEqual(numbersOf(partly).map((n) => n.label), ['Total', 'Deposit', 'Paid', 'Due']);
  assert.deepEqual(numbersOf(ISSUED).map((n) => n.label), ['Total', 'Paid', 'Due']);
});

test('a check with no number: asked once (QA 25.11), not a ban; cash and a number never asked', async () => {
  const { askCheckNumber, NO_CHECK_NUMBER } = await import('./model.js');
  assert.equal(askCheckNumber('check', ''), true);
  assert.equal(askCheckNumber('check', '   '), true);
  assert.equal(askCheckNumber('check', '1042'), false);
  assert.equal(askCheckNumber('cash', ''), false);
  assert.equal(NO_CHECK_NUMBER.go, 'Record without a number');
});
