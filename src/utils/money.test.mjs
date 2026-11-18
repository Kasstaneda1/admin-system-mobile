import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moneyError, parseMoney } from './money.js';
import { amountOf, commaHint, moneyCents } from '../pay/model.js';
import { editError, editTotal, priceCents } from '../bill/model.js';

// The office's cases (frontend tests/bills/money.test.mjs, fe#337), and the app's own one
// (QUEUE 8-6): one comma with 1–2 digits after it is the cents
test('plain amounts', () => {
  assert.equal(parseMoney('25'), 2500);
  assert.equal(parseMoney('25.5'), 2550);
  assert.equal(parseMoney('25.'), 2500);
  assert.equal(parseMoney('0.07'), 7);
  assert.equal(parseMoney('$ 75.29'), 7529);
  assert.equal(parseMoney(' $75.29 '), 7529);
  assert.equal(parseMoney('9999999.99'), 999999999);
});

test('a comma with three digits after it is a thousands separator', () => {
  assert.equal(parseMoney('1,234'), 123400);
  assert.equal(parseMoney('1,000'), 100000);
  assert.equal(parseMoney('$1,234'), 123400);
  assert.equal(parseMoney('1,234.56'), 123456);
  assert.equal(parseMoney('$1,200.00'), 120000);
  assert.equal(parseMoney('9,999,999.99'), 999999999);
  assert.equal(parseMoney('12,345'), 1234500);
  assert.equal(parseMoney('123,456.7'), 12345670);
});

test('what the app prints in a field goes back in unchanged', () => {
  // moneyText / priceText: '1250.00'; usd(): '$1,250.00'
  for (const cents of [0, 5, 1250, 99999, 123456, 100000000, 999999999]) {
    const field = (cents / 100).toFixed(2);
    const shown = `$${Math.floor(cents / 100).toLocaleString('en-US')}.${String(cents % 100).padStart(2, '0')}`;
    assert.equal(parseMoney(field), cents, field);
    assert.equal(parseMoney(shown), cents, shown);
  }
});

test('one comma with 1–2 digits is the cents (a European iPhone has no dot)', () => {
  assert.equal(parseMoney('25,00'), 2500);
  assert.equal(parseMoney('25,0'), 2500);
  assert.equal(parseMoney('12,5'), 1250);
  assert.equal(parseMoney('1,5'), 150);
  assert.equal(parseMoney('1,23'), 123);
  assert.equal(parseMoney('0,07'), 7);
  assert.equal(parseMoney('0,5'), 50);
  assert.equal(parseMoney('$25,00'), 2500);
  assert.equal(parseMoney(' $ 175,29 '), 17529);
  assert.equal(parseMoney('1234567,89'), 123456789);
  // never thousands: «25,00» is not $2,500
  assert.notEqual(parseMoney('25,00'), 250000);
});

test('a comma for the cents with anything else is refused', () => {
  for (const text of ['25,', '1.234,56', '1,234,5', '1,234,56', '12345678,5', ',50', '25,,0', '25,0.5', '1,5.0']) {
    assert.equal(parseMoney(text), null, text);
  }
});

test('commas in the wrong places are refused', () => {
  for (const text of ['1,2345', '1234,567', ',123', '1,,234', '1,234,', '12,34,567', '1,234.567', '1 234', '0,500', '0,500.00', '00,500', '012,345', '1,234.5,6']) {
    assert.equal(parseMoney(text), null, text);
  }
});

test('other text that is not money is refused', () => {
  for (const text of ['', ' ', '$', 'abc', '-5', '+5', '.5', '5.123', '1e3', '12345678', '10,000,000', '0x10', null, undefined]) {
    assert.equal(parseMoney(text), null, String(text));
  }
});

test('moneyError: a comma in a wrong place gets its own words with the person\'s number, the rest keeps the screen\'s', () => {
  assert.equal(moneyError('25,', 'Type a price like 12.50.'), 'Type it like this: 25.00.');
  assert.equal(moneyError('1.234,56', 'Type an amount like 75.29'), 'Type it like this: 1234.56');
  assert.equal(moneyError('1,234,5', 'Type an amount like 75.29'), 'Type it like this: 1234.50');
  assert.equal(moneyError(' $1,234,56 ', 'Type an amount like 75.29'), 'Type it like this: 1234.56');
  assert.equal(moneyError('123456789,5', 'Type a price like 12.50.'), 'Type an amount like 25.00.');
  assert.equal(moneyError('1x2,50', 'Type a price like 12.50'), 'Type an amount like 25.00');
  assert.equal(moneyError('abc', 'Type a price like 12.50.'), 'Type a price like 12.50.');
  assert.equal(moneyError('1,2345', 'Type a price like 12.50'), 'Type a price like 12.50');
  assert.equal(moneyError('0,500', 'Type a price like 12.50'), 'Type a price like 12.50');
  assert.equal(moneyError('25,', null), 'Type it like this: 25.00.');
  assert.equal(moneyError('25.00', null), null);
  assert.equal(moneyError('25,00', null), null);
  assert.equal(moneyError('12,5', 'Type a price like 12.50'), 'Type a price like 12.50');
});

// Every money field of the app reads by this rule
test('the payment, its part, the Custom tip and a line\'s price: «25,00» is $25.00, never $2,500', () => {
  for (const read of [moneyCents, priceCents]) {
    assert.equal(read('25,00'), 2500);
    assert.equal(read('12,5'), 1250);
    assert.equal(read('1,500'), 150000);
    assert.equal(read('0,500'), null);
    assert.equal(read('1,234.5,6'), null);
    assert.equal(read('1,000'), 100000);
    assert.equal(read('$1,234'), 123400);
    assert.equal(read('10,000,000'), null);
  }
  // the payment and its part (PayScreen): refused with the words, Next stays off
  const due = 300000;
  const part = amountOf({ full: false, typed: '25,00', note: 'x' }, due);
  assert.deepEqual([part.cents, part.error], [2500, null]);
  const wrong = amountOf({ full: false, typed: '1,234,5', note: 'x' }, due);
  assert.deepEqual([wrong.cents, wrong.error], [null, 'Type it like this: 1234.50.']);
  assert.equal(amountOf({ full: false, typed: '0,500', note: 'x' }, due).error, 'Type the amount: dollars and cents, like 100.00.');
  assert.equal(amountOf({ full: false, typed: '25.00', note: 'x' }, due).cents, 2500);
  // the Custom tip (PayTip, CashTip): the hint under the field, else none
  assert.equal(commaHint('5,50'), null);
  assert.equal(commaHint('5,'), 'Type it like this: 5.00.');
  assert.equal(commaHint('5.50'), null);
  assert.equal(commaHint(''), null);
  // a line's price (Edit line): refused with the words, no total shown
  const edit = { kind: 'labor', name: 'Labor', price: '25,00', qty: 1000, warranty: false };
  assert.equal(editError(edit), null);
  assert.equal(editTotal(edit), 2500);
  assert.equal(editError({ ...edit, price: '1.234,56' }), 'Type it like this: 1234.56.');
  assert.equal(editTotal({ ...edit, price: '1.234,56' }), null);
  assert.equal(editError({ ...edit, price: '0,500' }), 'Price: dollars and cents, like 120.00.');
  assert.equal(editTotal({ ...edit, price: '1,000' }), 100000);
});
