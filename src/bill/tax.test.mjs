import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taxCents, taxChoicesOf, taxPick, taxRefusal, taxSection } from './tax.js';

// The design's draft (design-mockups/payments app-fee-draft-off, app-tax-pick): $161.00 taxable
// at Tax NY 8.875 % = $14.29, the company's default; three rates to choose from
const CHOICES = [
  { id: 7, name: 'bank fee', rate_milli: 4000 },
  { id: 3, name: 'Tax + bank fee NY', rate_milli: 11875 },
  { id: 2, name: 'Tax NY', rate_milli: 8875 },
];
const DRAFT = {
  id: 9, status: 'draft', prices_visible: true, company: { id: 1, name: 'SEMIX CORP', state: 'NY' },
  taxable_cents: 16100, tax_name: 'Tax NY', tax_rate: 8875, tax_cents: 1429, total_cents: 17529,
  tax: { source: 'company', tax_id: 2, name: 'Tax NY', rate_milli: 8875 }, tax_off: false,
  can_change_tax: true, tax_choices: CHOICES,
};
const OFF = { ...DRAFT, tax: { source: 'off', tax_id: null, name: null, rate_milli: null }, tax_off: true, tax_name: null, tax_rate: null, tax_cents: 0, total_cents: 16100 };
const PICKED = { ...DRAFT, tax: { source: 'bill', tax_id: 3, name: 'Tax + bank fee NY', rate_milli: 11875 }, tax_name: 'Tax + bank fee NY', tax_rate: 11875, tax_cents: 1912 };

test('taxCents: the server\'s rounding (billTax.js), half away from zero', () => {
  assert.equal(taxCents(16100, 8875), 1429);   // 1428.875
  assert.equal(taxCents(16100, 11875), 1912);  // 1911.875
  assert.equal(taxCents(16100, 4000), 644);
  assert.equal(taxCents(23000, 8875), 2041);   // 2041.25
  assert.equal(taxCents(23000, 6625), 1524);   // 1523.75
  assert.equal(taxCents(1, 50000), 1);         // 0.5
  assert.equal(taxCents(-23000, 6625), -1524);
  assert.equal(taxCents(16100, null), 0);
  assert.equal(taxCents(null, 8875), 0);
});

test('taxSection: the switch and the rate row, as the design draws them', () => {
  assert.deepEqual(taxSection(DRAFT), {
    change: true,
    taxable: { on: true, sub: 'Sales tax on this bill', note: null },
    rate: { title: 'Tax NY (8.875%)', sub: 'On $161.00 · company default · tap to change', amount: '$14.29', open: true, locked: false },
  });
  assert.equal(taxSection(PICKED).rate.sub, 'On $161.00 · chosen for this bill · tap to change');
  assert.equal(taxSection(PICKED).rate.amount, '$19.12');
  // switched off: no rate row, the words for the office (app-tax-off)
  assert.deepEqual(taxSection(OFF), {
    change: true,
    taxable: { on: false, sub: 'Off: no sales tax on this bill', note: 'The office sees «Tax turned off» on this bill. Turn it on again any time before you issue.' },
    rate: null,
  });
  // the company has no default: choose one, or nothing to choose
  const none = { ...DRAFT, tax: { source: 'company', tax_id: null, name: null, rate_milli: null }, tax_name: null, tax_rate: null, tax_cents: 0 };
  assert.deepEqual(taxSection(none).rate, { title: 'No tax rate yet', sub: 'The company has no default · tap to choose', amount: '', open: true, locked: false });
  assert.equal(taxSection({ ...none, tax_choices: [] }).rate.open, false);
});

test('taxSection: without the leave the rate is locked «set by the office» (app-tax-readonly)', () => {
  const ro = { ...DRAFT, can_change_tax: false, tax_choices: [] };
  assert.deepEqual(taxSection(ro), {
    change: false, taxable: null,
    rate: { title: 'Tax NY (8.875%)', sub: 'On $161.00 · set by the office', amount: '$14.29', open: false, locked: true },
  });
  // the office switched it off: said so, locked
  assert.deepEqual(taxSection({ ...OFF, can_change_tax: false }).rate, { title: 'Tax · turned off', sub: 'No sales tax on this bill · set by the office', amount: '$0.00', open: false, locked: true });
  assert.equal(taxSection({ ...ro, tax_rate: null, tax_name: null }).rate.title, 'No sales tax');
  // a sent can_change_tax that is not true is no leave
  assert.equal(taxSection({ ...DRAFT, can_change_tax: undefined }).change, false);
});

test('taxSection: nothing for an issued bill or with the prices hidden', () => {
  assert.equal(taxSection({ ...DRAFT, status: 'issued', can_change_tax: false }), null);
  assert.equal(taxSection({ ...DRAFT, status: 'void' }), null);
  assert.equal(taxSection({ ...DRAFT, prices_visible: false, can_change_tax: false, tax: null }), null);
  assert.equal(taxSection(null), null);
});

test('taxChoicesOf: the server\'s list, the tax on this bill, the default marked (app-tax-pick)', () => {
  const { rows, current } = taxChoicesOf(DRAFT);
  assert.equal(current, 't2');
  assert.deepEqual(rows.map((r) => [r.key, r.title, r.sub]), [
    ['t7', 'bank fee · 4%', '$6.44'],
    ['t3', 'Tax + bank fee NY · 11.875%', '$19.12'],
    ['t2', 'Tax NY · 8.875%', 'Company default · $14.29'],
  ]);
  // the order is the server's: the app does not sort or filter
  assert.deepEqual(rows.map((r) => r.id), [7, 3, 2]);
});

test('taxChoicesOf: a rate of its own — «Company default» first, the picked one on', () => {
  const { rows, current } = taxChoicesOf(PICKED);
  assert.equal(current, 't3');
  assert.deepEqual(rows[0], { key: 'default', id: null, title: 'Company default', sub: 'The rate the office set for this company', send: { tax_id: null } });
  // the default is not known by id here: no mark
  assert.ok(rows.every((r) => !/Company default ·/.test(r.sub)));
  // its rate hidden since: kept on the list, on, not sent again
  const hidden = { ...PICKED, tax: { source: 'bill', tax_id: 5, name: 'Old NY', rate_milli: 8625 }, tax_choices: CHOICES };
  const h = taxChoicesOf(hidden);
  assert.equal(h.current, 't5');
  assert.deepEqual(h.rows[0], { key: 't5', id: 5, title: 'Old NY · 8.625%', sub: 'Hidden by the office · stays on this bill · $13.89', send: null });
  assert.equal(taxPick(hidden, 't5'), null);
  // broken entries are left out
  // (the bill's own rate stays shown, on — here the company's default)
  const broken = taxChoicesOf({ ...DRAFT, tax_choices: [null, { id: 'x', rate_milli: 1 }, { id: 4, rate_milli: null }] });
  assert.deepEqual(broken.rows.map((r) => [r.key, r.sub, r.send]), [['t2', 'Company default · $14.29', null]]);
  assert.deepEqual(taxChoicesOf({ ...PICKED, tax_choices: undefined }).rows.map((r) => r.key), ['t3', 'default']);
});

test('taxPick: what Done sends', () => {
  assert.deepEqual(taxPick(DRAFT, 't3'), { tax_id: 3 });
  assert.equal(taxPick(DRAFT, 't2'), null);           // the default it has already
  assert.equal(taxPick(DRAFT, null), null);
  assert.equal(taxPick(DRAFT, 't99'), null);          // not on the list
  assert.deepEqual(taxPick(PICKED, 'default'), { tax_id: null });
  assert.deepEqual(taxPick(PICKED, 't2'), { tax_id: 2 });
  assert.equal(taxPick(PICKED, 't3'), null);
  // no default yet: picking one
  const none = { ...DRAFT, tax: { source: 'company', tax_id: null, name: null, rate_milli: null }, tax_rate: null };
  assert.equal(taxChoicesOf(none).current, null);
  assert.deepEqual(taxPick(none, 't2'), { tax_id: 2 });
});

test('taxRefusal: the server\'s no in words', () => {
  const err = (status, data) => ({ response: { status, data } });
  assert.equal(taxRefusal(err(403, { code: 'no_tax_permission', error: 'x' })), 'The office sets the tax of your bills. Ask the office to change it.');
  assert.equal(taxRefusal(err(400, { code: 'tax_not_allowed' })), 'This rate is no longer in the list. Choose another one.');
  assert.equal(taxRefusal(err(403, { code: 'prices_off' })), null);
  assert.equal(taxRefusal(err(400, {})), null);
  assert.equal(taxRefusal({}), null);
});
