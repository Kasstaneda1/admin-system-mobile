import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amountOf, balanceOf, retryTax, billError, billTile, blockersOf, bookRows, canBill, changedText, creditNote, dateText, draftedFrom,
  editError, editHint, editOf, editTotal, footOf, knownOf, lineBadge, lineName, lineSub, newEdit, newLineBody, partiesOf,
  patchOf, percentText, previewOf, priceCents, priceText, qtyMilli, qtyStep, qtyText, sectionsOf, statusOf, taxOf, totalsOf,
  unitWord, usd, visitDates,
} from './model.js';

// The design's bill (design-mockups/app-invoice README «Числа сходятся»), as the server answers it
const LABOR = { id: 11, position: 1, kind: 'labor', name: 'Repair labor — washer', description: 'The diagnostic fee paid on the first visit counts toward this repair.', quantity: '1.5', unit: 'hour', unit_price_cents: 12000, discount_percent: null, amount_cents: 18000, taxable: true, part_id: null, part_number: null, part_condition: null, warranty: false, price_item_id: 5, price_item_version: 2, credit_bill_id: null, credit_line_id: null, estimate_id: null, locked: false, changed_by: null, changed_by_name: null };
const PUMP = { id: 12, position: 2, kind: 'part', name: 'Drain pump', description: null, quantity: '1', unit: 'each', unit_price_cents: 14500, discount_percent: null, amount_cents: 14500, taxable: true, part_id: 7, part_number: 'DC31-00178A', part_condition: 'new', warranty: false, price_item_id: null, price_item_version: null, credit_bill_id: null, credit_line_id: null, estimate_id: null, locked: false, changed_by: null, changed_by_name: null };
const CREDIT = { id: 13, position: 3, kind: 'diagnostics_credit', name: 'Diagnostics credit', description: null, quantity: '1', unit: null, unit_price_cents: 9500, discount_percent: null, amount_cents: -9500, taxable: true, part_id: null, part_number: null, part_condition: null, warranty: false, price_item_id: null, price_item_version: null, credit_bill_id: 4, credit_line_id: null, estimate_id: null, locked: true, changed_by: null, changed_by_name: null };
const BILL = {
  id: 9, job_id: 20871, visit_id: 31, visit_kind: 'repair', company_id: 1, status: 'draft', bill_number: null, label: null, message: 'Thank you, Sanjay!',
  subtotal_cents: 32500, discount_cents: 0, credit_cents: 9500, taxable_cents: 23000, tax_name: 'Queens County, NY', tax_rate: 8875, tax_cents: 2041,
  total_cents: 25041, deposits_applied_cents: 0, balance_cents: 25041,
  company: { id: 1, name: 'SEMIX CORP', state: 'NY', legal_name: 'SEMIX CORP', address: '123 Example Ave, Suite 4, Queens, NY 11101', phone: '(718) 555-0100', email: 'office@example.com', website: null, licence_label: 'NYC DCWP Electronic & Home Appliance Service Dealer', licence_number: '0000000-DCA', nj_hic_number: null, warranty_text: 'Parts 90 days, labor 30 days.', footer_text: null, payment_terms: 'Upon completion', has_profile: true },
  customer: { name: 'Sanjay Patel', phone: '(718) 555-0142', email: 'customer@example.com', address: { line: '41-22 Bell Blvd', unit: '3C', city: 'Bayside', state: 'NY', zip: '11361', county: 'Queens' }, billing_address: null },
  technician: { id: 2, name: 'Ivan Petrov' },
  lines: [LABOR, PUMP, CREDIT],
  warnings: [{ code: 'credit_not_paid', bill_id: 4, message: 'Diagnostics credit: bill #1031 is not marked paid yet' }],
  issued_at: null, updated_at: '2026-11-11T17:45:00.000Z', delivered_at: null, pdf: null,
};
const VISIT = {
  id: 31, status: 'completed', outcome: 'done', visit_kind: 'repair', role: 'main', legacy: false, scheduled_start: '2026-11-11 11:00:00',
  appliances: [{ appliance_type: 'Washer', brand: 'Samsung', model: 'WF45R6100AW', serial_number: 'Y3K5B9A00456' }],
  job_visits: [
    { id: 30, status: 'completed', scheduled_start: '2026-11-06 09:00:00' },
    { id: 29, status: 'cancelled', scheduled_start: '2026-11-04 09:00:00' },
  ],
};
const NOW = { date: '2026-11-11', minutes: 12 * 60 + 46 };

test('usd: cents with the design\'s minus and thousands', () => {
  assert.equal(usd(25041), '$250.41');
  assert.equal(usd(-9500), '−$95.00');
  assert.equal(usd(125000), '$1,250.00');
  assert.equal(usd(0), '$0.00');
  assert.equal(usd(null), '—');
});

test('percents, quantities and prices are read and written without floats', () => {
  assert.equal(percentText(8875), '8.875%');
  assert.equal(percentText(10000), '10%');
  assert.equal(percentText(6625), '6.625%');
  assert.equal(qtyMilli('1.5'), 1500);
  assert.equal(qtyMilli(2), 2000);
  assert.equal(qtyMilli('0'), null);
  assert.equal(qtyMilli('1.2345'), null);
  assert.equal(qtyText(1500), '1.5');
  assert.equal(qtyText(2000), '2');
  assert.equal(qtyText(1125), '1.125');
  assert.equal(priceCents('120'), 12000);
  assert.equal(priceCents('$120.5'), 12050);
  assert.equal(priceCents('1,250.00'), 125000);
  assert.equal(priceCents(' 0.99 '), 99);
  assert.equal(priceCents('12.345'), null);
  assert.equal(priceCents('abc'), null);
  assert.equal(priceCents(''), null);
  assert.equal(priceText(12000), '120.00');
  // as the server: 1.5 × $120.00 = $180.00; 0.333 × $1.00 rounds half up
  assert.equal(amountOf(12000, 1500), 18000);
  assert.equal(amountOf(100, 335), 34);
  assert.equal(amountOf(100, 334), 33);
});

test('a line says what it is and how it is counted', () => {
  assert.equal(lineName(LABOR), 'Repair labor — washer');
  assert.equal(lineName(PUMP), 'Drain pump · DC31-00178A');
  assert.equal(lineSub(LABOR), '1.5 h × $120.00 / h');
  assert.equal(lineSub(PUMP), 'New · 1 × $145.00');
  assert.equal(lineSub({ ...PUMP, warranty: true, part_condition: 'rebuilt' }), 'Rebuilt · Warranty — no charge');
  assert.equal(lineSub({ ...LABOR, kind: 'service_call', unit: null, quantity: '1', unit_price_cents: 9500 }), '1 × $95.00');
  assert.equal(lineSub({ ...LABOR, kind: 'extra', unit: 'visit', quantity: '2', unit_price_cents: 5000 }), '2 × $50.00 / visit');
  assert.equal(lineSub(CREDIT), 'Paid on an earlier bill of this job — counts toward the repair');
  assert.equal(lineSub({ ...CREDIT, credit_bill_id: null, credit_line_id: 3 }), 'The diagnostics on this bill counts toward the repair');
  assert.equal(lineSub({ ...LABOR, kind: 'discount', discount_percent: 10000 }), '10% off the charges');
  assert.equal(lineBadge(PUMP), 'From this visit’s parts');
  assert.equal(lineBadge({ ...PUMP, estimate_id: 3, part_id: null }), 'From the estimate');
  assert.equal(lineBadge({ ...PUMP, price_item_id: 8 }), null);
  assert.equal(lineBadge(LABOR), null);
  assert.equal(changedText(LABOR, 2), null);
  assert.equal(changedText({ ...LABOR, changed_by: 2, changed_by_name: 'Ivan Petrov' }, 2), 'Changed by you');
  assert.equal(changedText({ ...LABOR, changed_by: 5, changed_by_name: 'Alex Kim' }, 2), 'Changed by Alex');
});

test('sectionsOf puts the lines where the design has them; the credit is locked', () => {
  const s = sectionsOf(BILL, 2);
  assert.deepEqual(s.services.map((r) => r.line.id), [11]);
  assert.deepEqual(s.materials.map((r) => r.line.id), [12]);
  assert.deepEqual(s.credits.map((r) => r.line.id), [13]);
  assert.deepEqual(s.discounts, []);
  assert.equal(s.services[0].amount, '$180.00');
  assert.equal(s.services[0].editable, true);
  assert.equal(s.credits[0].amount, '−$95.00');
  assert.equal(s.credits[0].deduction, true);
  assert.equal(s.credits[0].locked, true);
  assert.equal(s.credits[0].editable, false);
  // an issued bill is frozen: nothing to edit
  assert.equal(sectionsOf({ ...BILL, status: 'issued' }).services[0].editable, false);
});

test('totals: the design\'s numbers, the tax is the company\'s', () => {
  const rows = totalsOf(BILL);
  assert.deepEqual(rows.map((r) => [r.label, r.value]), [
    ['Subtotal', '$325.00'],
    ['Diagnostics credit', '−$95.00'],
    ['Sales tax · 8.875%', '$20.41'],
    ['Total', '$250.41'],
    ['Balance due', '$250.41'],
  ]);
  assert.equal(rows[2].sub, 'Queens County, NY · by the job’s company');
  const withDeposit = totalsOf({ ...BILL, deposits_applied_cents: 10000, balance_cents: 15041, discount_cents: 500 });
  assert.deepEqual(withDeposit.map((r) => r.label), ['Subtotal', 'Discounts', 'Diagnostics credit', 'Sales tax · 8.875%', 'Total', 'Deposits applied', 'Balance due']);
  assert.equal(withDeposit.at(-1).value, '$150.41');
  assert.deepEqual(taxOf({ ...BILL, tax_rate: null, tax_name: null }), { label: 'Sales tax', sub: 'None: the company has no default tax', none: true });
  assert.equal(balanceOf({ total_cents: 25041, deposits_applied_cents: 10000 }), 15041);
  assert.deepEqual(footOf({ ...BILL, balance_cents: 15041 }), { text: 'Total $250.41 · balance due', big: '$150.41' });
});

test('statusOf: draft with the time it was saved, issued with its number', () => {
  assert.deepEqual(statusOf(BILL, NOW), { chip: { text: 'Draft · no number yet', icon: 'doc', kind: 'neutral' }, saved: 'Saved 12:45' });
  assert.equal(statusOf(BILL, { date: '2026-11-12', minutes: 600 }).saved, 'Saved Nov 11');
  const issued = statusOf({ ...BILL, status: 'issued', label: 'NY-1048', issued_at: '2026-11-11T17:41:00Z' }, NOW);
  assert.deepEqual(issued, { chip: { text: 'Issued · NY-1048', icon: 'checkc', kind: 'done' }, saved: 'Frozen 12:41' });
});

test('partiesOf: from, to and the appliance of the visit', () => {
  const p = partiesOf(BILL, VISIT);
  assert.deepEqual(p.from, { title: 'SEMIX CORP · NY', sub: 'Company of this job' });
  assert.deepEqual(p.to, { title: 'Sanjay Patel', sub: 'Bayside, NY 11361' });
  assert.deepEqual(p.appliances, [{ key: 'a0', title: 'Washer · Samsung WF45R6100AW', serial: 'Serial Y3K5B9A00456' }]);
  assert.deepEqual(partiesOf({ ...BILL, company: null }, null).from, { title: 'No company', sub: 'The office sets it' });
});

test('blockersOf: what only the office can fix stops the technician\'s issue', () => {
  assert.deepEqual(blockersOf(BILL), []);
  const noTax = { ...BILL, warnings: [{ code: 'tax_missing', message: '…' }, { code: 'credit_not_paid', message: '…' }] };
  assert.deepEqual(blockersOf(noTax), [{ code: 'tax_missing', text: 'No sales tax set for SEMIX CORP. The office sets it, then you can issue.', hard: true }]);
  assert.equal(retryTax(blockersOf(noTax)), true);
  assert.equal(retryTax(blockersOf({ ...noTax, lines: [CREDIT] })), false);
  assert.equal(retryTax([]), false);
  assert.deepEqual(blockersOf({ ...BILL, warnings: [{ code: 'profile_missing' }], lines: [CREDIT] }).map((b) => [b.code, b.hard]), [['profile_missing', true], ['no_lines', true]]);
  assert.deepEqual(blockersOf({ ...BILL, status: 'issued', warnings: [{ code: 'tax_missing' }] }), []);
  assert.equal(creditNote(BILL), 'Bill #1031 is not marked paid yet');
  assert.equal(creditNote({ ...BILL, warnings: [] }), null);
});

test('draftedFrom says what the server put in, until someone changes it', () => {
  assert.deepEqual(draftedFrom(BILL), {
    title: 'The bill is drafted for you',
    text: 'Made from the visit kind Repair: labor, the part from this visit’s parts and the diagnostics credit. Check it with the customer, then issue.',
  });
  assert.equal(draftedFrom({ ...BILL, lines: [{ ...LABOR, changed_by: 2 }, PUMP] }), null);
  assert.equal(draftedFrom({ ...BILL, status: 'issued' }), null);
  assert.equal(draftedFrom({ ...BILL, lines: [] }).title, 'The bill is started for you');
  assert.match(draftedFrom({ ...BILL, lines: [LABOR, PUMP, { ...PUMP, id: 14 }] }).text, /labor and 2 parts from this visit’s parts\./);
});

test('canBill and the visit\'s Bill tile', () => {
  assert.equal(canBill(VISIT), true);
  assert.equal(canBill({ ...VISIT, role: 'helper' }), false);
  assert.equal(canBill({ ...VISIT, legacy: true }), false);
  assert.equal(canBill({ ...VISIT, status: 'cancelled' }), false);
  assert.equal(canBill({ ...VISIT, outcome: 'no_access' }), false);
  assert.equal(canBill({ ...VISIT, outcome: 'client_rescheduled' }), false);
  assert.equal(billTile({ ...VISIT, role: 'helper' }, null), null);
  assert.deepEqual(billTile(VISIT, knownOf(BILL)), { title: 'Bill', line: 'Draft · $250.41', off: false, kind: 'draft' });
  assert.deepEqual(billTile(VISIT, knownOf({ ...BILL, status: 'issued', label: 'NY-1048' })), { title: 'Bill', line: 'NY-1048 · $250.41', off: false, kind: 'issued' });
  assert.deepEqual(billTile(VISIT, knownOf(null)), { title: 'Bill', line: 'Not started', off: false, kind: 'none' });
  assert.equal(billTile(VISIT, { status: 'unknown', bill: null }).line, 'Needs connection');
  assert.equal(billTile(VISIT, null).line, '…');
  // before Finish: no bill yet, the tile waits; a draft the office made shows anyway
  const open = { ...VISIT, status: 'omw', outcome: null };
  assert.deepEqual(billTile(open, knownOf(null)), { title: 'Bill', line: 'After Finish', off: true, kind: 'wait' });
  assert.equal(billTile(open, knownOf(BILL)).line, 'Draft · $250.41');
});

test('editing a line: the fields, the total as it is typed, the PATCH of what changed', () => {
  const edit = editOf(LABOR);
  assert.deepEqual(edit, { kind: 'labor', name: 'Repair labor — washer', price: '120.00', qty: 1500, unit: 'hour', warranty: false, description: LABOR.description, fromBook: true, version: 2 });
  assert.equal(qtyStep(edit), 500);
  assert.equal(qtyStep(editOf(PUMP)), 1000);
  assert.equal(unitWord(edit), 'hour');
  assert.equal(unitWord(editOf(PUMP)), 'each');
  assert.equal(editTotal(edit), 18000);
  assert.equal(editTotal({ ...edit, price: '12.3x' }), null);
  assert.equal(editTotal({ ...editOf(PUMP), warranty: true }), 0);
  assert.equal(editError(edit), null);
  assert.equal(editError({ ...edit, name: '  ' }), 'Name the line as the customer will read it.');
  assert.equal(editError({ ...edit, price: '' }), 'Price: dollars and cents, like 120.00.');
  assert.deepEqual(patchOf(LABOR, edit), {});
  assert.deepEqual(patchOf(LABOR, { ...edit, qty: 2000, price: '125' }), { unit_price_cents: 12500, quantity: '2' });
  assert.deepEqual(patchOf(LABOR, { ...edit, name: ' Labor ' }), { name: 'Labor' });
  assert.equal(editHint(LABOR, edit, 'Ivan Petrov'), 'Price book price: $120.00 / h. If you change it, the office sees “changed by Ivan”.');
  assert.equal(editHint(PUMP, editOf(PUMP), 'Ivan Petrov'), 'If you change it, the office sees “changed by Ivan”.');
  assert.equal(editHint(null, newEdit('extra'), 'Ivan Petrov'), 'The office sees this line as “added by Ivan”.');
});

test('a new line of the technician\'s own', () => {
  assert.deepEqual(newEdit('labor'), { kind: 'labor', name: '', price: '', qty: 1000, unit: 'hour', warranty: false, description: '', fromBook: false, version: null });
  assert.deepEqual(newLineBody({ ...newEdit('labor'), name: ' Extra hour ', price: '90', qty: 1500 }), { kind: 'labor', name: 'Extra hour', unit_price_cents: 9000, quantity: '1.5', unit: 'hour' });
  assert.deepEqual(newLineBody({ ...newEdit('part'), name: 'Hose', price: '12.50' }), { kind: 'part', name: 'Hose', unit_price_cents: 1250, quantity: '1', part_condition: 'new' });
});

test('bookRows: a tab, the search, and what is already on the bill', () => {
  const items = [
    { id: 5, kind: 'service', line_kind: 'labor', name: 'Repair labor — washer', unit_price_cents: 12000, unit: 'hour', taxable: true },
    { id: 6, kind: 'service', line_kind: 'service_call', name: 'Service call', unit_price_cents: 9500, unit: null, taxable: true },
    { id: 7, kind: 'material', line_kind: 'part', name: 'Drain hose', unit_price_cents: 2400, unit: 'each', taxable: false },
    { id: 8, kind: 'discount', line_kind: 'discount', name: 'Senior', unit_price_cents: 0, discount_percent: 10000 },
    { id: 9, kind: 'discount', line_kind: 'discount', name: 'Returning customer', unit_price_cents: 2500, discount_percent: null },
  ];
  const services = bookRows(items, 'service', '', BILL);
  assert.deepEqual(services.map((r) => [r.name, r.sub, r.onBill]), [
    ['Repair labor — washer', '$120.00 / h · taxable', true],
    ['Service call', '$95.00 · taxable', false],
  ]);
  assert.deepEqual(bookRows(items, 'service', 'CALL', BILL).map((r) => r.item.id), [6]);
  assert.deepEqual(bookRows(items, 'material', '', BILL).map((r) => r.sub), ['$24.00']);
  assert.deepEqual(bookRows(items, 'discount', '', BILL).map((r) => r.sub), ['10% off', '$25.00 off']);
  assert.deepEqual(bookRows(null, 'service', '', BILL), []);
});

test('previewOf: the document as the PDF prints it', () => {
  const doc = previewOf(BILL, VISIT, '2026-11-11');
  assert.equal(doc.stamp, 'DRAFT');
  assert.equal(doc.company.name, 'SEMIX CORP');
  assert.deepEqual(doc.company.lines, ['123 Example Ave, Suite 4, Queens, NY 11101', '(718) 555-0100 · office@example.com']);
  assert.equal(doc.company.licence, 'NYC DCWP Electronic & Home Appliance Service Dealer · Lic. #0000000-DCA');
  assert.deepEqual(doc.facts.map((f) => [f.label, f.value]), [
    ['Bill #', 'Given when issued'], ['Job #', '20871'], ['Bill date', 'Nov 11, 2026'], ['Visits', 'Nov 6 · Nov 11'], ['Payment terms', 'Upon completion'],
  ]);
  assert.equal(doc.facts[0].quiet, true);
  assert.equal(doc.amountDue, '$250.41');
  assert.deepEqual(doc.billTo, ['Sanjay Patel', '41-22 Bell Blvd, Apt 3C', 'Bayside, NY 11361', '(718) 555-0142', 'customer@example.com']);
  assert.deepEqual(doc.service, { address: ['Same as bill to'], technician: 'Ivan Petrov' });
  assert.deepEqual(doc.appliances, ['Washer · Samsung · Model WF45R6100AW · Serial Y3K5B9A00456']);
  assert.deepEqual(doc.groups.map((g) => g.title), ['Service call & labor', 'Parts', 'Credits & discounts']);
  assert.deepEqual(doc.groups[1].rows[0], { key: 'l12', name: 'Drain pump', tag: 'New', sub: 'Part # DC31-00178A · 1 × $145.00', amount: '$145.00', deduction: false });
  assert.deepEqual(doc.totals.map((t) => [t.label, t.value]), [
    ['Subtotal', '$325.00'], ['Diagnostics credit', '−$95.00'], ['Sales tax · Queens County, NY 8.875%', '$20.41'],
  ]);
  assert.equal(doc.total, '$250.41');
  assert.equal(doc.deposits, null);
  assert.equal(doc.message, 'Thank you, Sanjay!');
  assert.equal(doc.warranty, 'Parts 90 days, labor 30 days.');
  const issued = previewOf({ ...BILL, status: 'issued', label: 'NY-1048', issued_at: '2026-11-11T17:41:00Z' }, VISIT, '2026-11-12');
  assert.equal(issued.stamp, null);
  assert.deepEqual(issued.facts.slice(0, 3).map((f) => f.value), ['NY-1048', '20871', 'Nov 11, 2026']);
  assert.deepEqual(previewOf({ ...BILL, tax_rate: null, tax_name: null }, null, '2026-11-11').totals.at(-1), { label: 'Tax', value: 'none' });
  assert.equal(dateText('2026-01-05'), 'Jan 5, 2026');
  assert.deepEqual(visitDates(null), []);
});

test('billError: the server\'s no in words', () => {
  const err = (status, data) => ({ response: status ? { status, data } : undefined });
  assert.deepEqual(billError(err(0)), { kind: 'offline', text: 'No connection. Try again.' });
  assert.equal(billError(err(0), { issue: true }).text, 'No connection. The bill is issued only online: the number comes from the server.');
  assert.equal(billError(err(404, { error: 'This visit has no bill yet: draft it first' })).kind, 'none');
  assert.equal(billError(err(404, { error: 'Visit not found' })).kind, 'gone');
  assert.deepEqual(billError(err(404, { error: 'Line not found' })), { kind: 'refused', text: 'This line is no longer on the bill.' });
  assert.deepEqual(billError(err(409, { code: 'tax_missing', error: 'The company has no default tax: the office sets it or issues the bill' }), { issue: true, company: 'SEMIX CORP' }),
    { kind: 'refused', text: 'No sales tax set for SEMIX CORP. The office sets it, then you can issue.' });
  assert.equal(billError(err(409, { code: 'tax_missing' })).text, 'No sales tax set for the company. The office sets it, then you can issue.');
  assert.equal(billError(err(409, { code: 'profile_missing' })).text, 'The office has not filled in the company details yet. Ask the office, then issue.');
  assert.equal(billError(err(409, { code: 'no_lines' })).text, 'The bill has nothing to charge for. Add a service or a part.');
  assert.deepEqual(billError(err(409, { code: 'total_changed', total_cents: 26041 })), { kind: 'refused', text: 'The total changed to $260.41. Check the bill and issue again.', total: 26041 });
  assert.equal(billError(err(400, { error: 'A technician takes a discount as the price book gives it' })).text, 'A technician takes a discount as the price book gives it.');
  assert.equal(billError(err(403, { error: 'Only the main technician of the visit works on its bill' })).kind, 'refused');
  assert.equal(billError(err(409, {})).text, 'The bill could not be changed.');
  assert.deepEqual(billError(err(500, {})), { kind: 'failed', text: 'Something went wrong. Try again.' });
});
