import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moneyError, parseMoney } from './money.js';
import { amountOf, commaHint, moneyCents } from '../pay/model.js';
import { editError, editTotal, priceCents } from '../bill/model.js';

// The same cases as the office's (frontend tests/bills/money.test.mjs, fe#337): one rule for
// money typed on the site and in the app
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

test('a comma used for cents is refused, not read as thousands', () => {
  for (const text of ['25,00', '25,0', '25,', '12,5', '1,5', '$25,00', '1.234,56', '1,234,5', '1,23']) {
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

test('moneyError: a comma for cents gets its own words with the person\'s number, the rest keeps the screen\'s', () => {
  assert.equal(moneyError('25,00', 'Type a price like 12.50.'), 'Use a dot before the cents: 25.00.');
  assert.equal(moneyError(' $12,5 ', 'Type a price like 12.50'), 'Use a dot before the cents: 12.50');
  assert.equal(moneyError('1.234,56', 'Type an amount like 75.29'), 'Use a dot before the cents: 1234.56');
  assert.equal(moneyError('1,234,5', 'Type an amount like 75.29'), 'Use a dot before the cents: 1234.50');
  assert.equal(moneyError('25,', 'Type an amount like 75.29'), 'Use a dot before the cents: 25.00');
  assert.equal(moneyError('0,07', 'Type an amount like 75.29'), 'Use a dot before the cents: 0.07');
  assert.equal(moneyError('123456789,5', 'Type a price like 12.50.'), 'Use a dot before the cents, like 25.00.');
  assert.equal(moneyError('1x2,50', 'Type a price like 12.50'), 'Use a dot before the cents, like 25.00');
  assert.equal(moneyError('abc', 'Type a price like 12.50.'), 'Type a price like 12.50.');
  assert.equal(moneyError('1,2345', 'Type a price like 12.50'), 'Type a price like 12.50');
  assert.equal(moneyError('0,500', 'Type a price like 12.50'), 'Type a price like 12.50');
  assert.equal(moneyError('25,00', null), 'Use a dot before the cents: 25.00');
  assert.equal(moneyError('25.00', null), null);
});

// Every money field of the app reads by this rule
test('the payment, its part, the Custom tip and a line\'s price: «25,00» is never $2,500', () => {
  for (const read of [moneyCents, priceCents]) {
    assert.equal(read('25,00'), null);
    assert.equal(read('0,500'), null);
    assert.equal(read('1,234.5,6'), null);
    assert.equal(read('1,000'), 100000);
    assert.equal(read('$1,234'), 123400);
    assert.equal(read('10,000,000'), null);
  }
  // the payment and its part (PayScreen): refused with the words, Next stays off
  const due = 300000;
  const part = amountOf({ full: false, typed: '25,00', note: 'x' }, due);
  assert.deepEqual([part.cents, part.error], [null, 'Use a dot before the cents: 25.00.']);
  assert.equal(amountOf({ full: false, typed: '0,500', note: 'x' }, due).error, 'Type the amount: dollars and cents, like 100.00.');
  assert.equal(amountOf({ full: false, typed: '25.00', note: 'x' }, due).cents, 2500);
  // the Custom tip (PayTip, CashTip): the hint under the field, else none
  assert.equal(commaHint('5,50'), 'Use a dot before the cents: 5.50');
  assert.equal(commaHint('5.50'), null);
  assert.equal(commaHint(''), null);
  // a line's price (Edit line): refused with the words, no total shown
  const edit = { kind: 'labor', name: 'Labor', price: '25,00', qty: 1000, warranty: false };
  assert.equal(editError(edit), 'Use a dot before the cents: 25.00.');
  assert.equal(editTotal(edit), null);
  assert.equal(editError({ ...edit, price: '0,500' }), 'Price: dollars and cents, like 120.00.');
  assert.equal(editTotal({ ...edit, price: '1,000' }), 100000);
});
