import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUIET, arrivedLine, arrivedOf, canPayOnline, linkBody, linkError, linkOf, moduleSide, onlineIds, qrRuns } from './online.js';
import { qrMatrix } from './qr/qrMatrix.js';
import { historyOf } from './model.js';

const URL = 'https://app.semix.example/pay/q3VbX9kz2Lm7Tn4Rw8Yd1Pc6Hs0Gf5JaEo_-uiKt3Mx';

test('the button: only when the server says link: true', () => {
  assert.equal(canPayOnline({ online_payments: { link: true, card: false } }), true);
  assert.equal(canPayOnline({ online_payments: { link: false, card: false } }), false);
  assert.equal(canPayOnline({ online_payments: { link: 'yes' } }), false);
  assert.equal(canPayOnline({}), false);            // an older server: no flag, no button
  assert.equal(canPayOnline(null), false);
});

test('the link body: the full balance goes without an amount, a part with it', () => {
  assert.deepEqual(linkBody({ part: false, cents: 16100 }), {});
  assert.deepEqual(linkBody({ part: true, cents: 5000 }), { amount_cents: 5000 });
  assert.deepEqual(linkBody({ part: true, cents: 0 }), {});
  assert.deepEqual(linkBody({ part: true, cents: 50.5 }), {});
});

test('the answer: only an https link is shown', () => {
  assert.deepEqual(linkOf({ link: { id: 7, url: URL, amount_cents: 16100 }, balance_cents: 16100 }), { id: 7, url: URL, cents: 16100, balance: 16100 });
  assert.equal(linkOf({ link: { id: 7, url: 'http://app.example/pay/x' } }), null);
  assert.equal(linkOf({ link: { id: 7, url: 'javascript:alert(1)' } }), null);
  assert.equal(linkOf({ link: { id: 7 } }), null);
  assert.equal(linkOf({}), null);
  assert.equal(linkOf({ link: { id: 7, url: URL } }).cents, null);
});

const bill = (payments, status = 'unpaid') => ({ payment_status: status, payments });
const online = (id, cents, extra = {}) => ({ id, kind: 'payment', method: 'card', online: true, amount_cents: cents, voided_at: null, ...extra });

test('what came: only online payments that were not there when the code was shown', () => {
  const before = bill([online(1, 2000), { id: 2, kind: 'payment', method: 'cash', online: false, amount_cents: 3000, voided_at: null }]);
  const known = onlineIds(before);
  assert.deepEqual(known, [1]);
  assert.equal(arrivedOf(before, known), null);
  // cash recorded meanwhile is not the customer's online payment
  assert.equal(arrivedOf(bill([...before.payments, { id: 3, kind: 'payment', method: 'cash', amount_cents: 100, voided_at: null }]), known), null);
  // a tip or a voided row is not a payment that came
  assert.equal(arrivedOf(bill([...before.payments, online(4, 500, { kind: 'tip' })]), known), null);
  assert.equal(arrivedOf(bill([...before.payments, online(5, 500, { voided_at: '2026-11-18T20:00:00Z' })]), known), null);
  assert.deepEqual(arrivedOf(bill([...before.payments, online(6, 16100)], 'paid'), known), { cents: 16100, paid: true });
  assert.deepEqual(arrivedOf(bill([...before.payments, online(6, 5000)], 'partially_paid'), known), { cents: 5000, paid: false });
  assert.deepEqual(arrivedOf(bill([online(6, 100)], 'overpaid'), []), { cents: 100, paid: true });
  assert.equal(arrivedLine({ cents: 16100 }), 'Paid $161.00 online');
  assert.equal(arrivedOf({ payment_status: 'unpaid' }, []), null);
});

test('the server’s no in the technician’s words', () => {
  const no = (status, code, extra = {}) => linkError({ response: { status, data: { error: 'x', code, ...extra } } });
  assert.equal(linkError(new Error('Network Error')).kind, 'offline');
  assert.match(no(409, 'online_payments_unavailable').text, /does not take online payments/);
  assert.match(no(503, 'online_payments_off').text, /not set up/);
  assert.match(no(409, 'nothing_due').text, /Nothing is due/);
  assert.match(no(409, 'over_balance', { balance_cents: 4000 }).text, /Only \$40\.00 is due now/);
  assert.match(no(409, 'bill_void').text, /void/);
  assert.match(no(409, 'not_issued').text, /Issue the bill first/);
  assert.match(no(403, 'payments_off').text, /turned off/);
  assert.equal(no(404).kind, 'gone');
  assert.match(no(429).text, /Wait a minute/);
  assert.equal(no(500).kind, 'failed');
  // no address for Stripe's page: its own words, not «Try again» (the Teamlead on #65)
  const off = no(503, 'site_address_off');
  assert.equal(off.kind, 'refused');
  assert.equal(off.text, 'Card payments are not ready yet. Take the payment another way and tell the office.');
  assert.doesNotMatch(off.text, /Try again/);
});

test('the quiet zone is the standard 4 modules (the Teamlead on #65)', () => {
  assert.equal(QUIET, 4);
});

test('the runs of dark modules give back the matrix exactly', () => {
  const { size, modules } = qrMatrix(URL);
  const { size: s, runs } = qrRuns(URL);
  assert.equal(s, size);
  const drawn = Array.from({ length: size }, () => Array(size).fill(false));
  for (const r of runs) {
    assert.ok(r.len > 0 && r.col + r.len <= size);
    for (let c = r.col; c < r.col + r.len; c += 1) {
      assert.equal(drawn[r.row][c], false, 'runs do not overlap');
      drawn[r.row][c] = true;
    }
  }
  assert.deepEqual(drawn, modules);
  // runs are as long as they can be: no two touch in a row
  const key = new Set(runs.map((r) => `${r.row}:${r.col}`));
  for (const r of runs) assert.ok(!key.has(`${r.row}:${r.col + r.len}`));
});

test('a module is whole points, the code with its quiet zone fits the room, at least 240 pt on a 390 phone', () => {
  const { size } = qrRuns(URL);
  const room = Math.min(390 - 64, 320);
  const cell = moduleSide(size, room);
  assert.ok(Number.isInteger(cell));
  assert.ok(cell * (size + QUIET * 2) <= room);
  assert.ok(cell * (size + QUIET * 2) >= 240, `${cell * (size + QUIET * 2)} pt`);
  assert.equal(moduleSide(57, 10), 2);
});

test('history: an online payment is «Card · online», without «Online p.»', () => {
  const [row] = historyOf({ payments: [online(9, 16100, { received_at: '2026-11-18T19:05:00Z', recorded_by_name: 'Online payment', holder: 'office', can_void: false })] }, Date.now());
  assert.match(row.title, /Card · online$/);
  assert.equal(row.sub, '');
  assert.equal(row.voidLeft, 0);
  const [cash] = historyOf({ payments: [{ id: 1, kind: 'payment', method: 'cash', amount_cents: 100, recorded_by_name: 'Ivan Petrov', received_at: '2026-11-18T19:05:00Z' }] }, Date.now());
  assert.equal(cash.sub, 'Ivan P.');
  assert.doesNotMatch(cash.title, /online/);
});
