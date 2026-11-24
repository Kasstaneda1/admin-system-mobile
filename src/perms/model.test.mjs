import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTACTS_HIDDEN_LINE, LINES_OFF_LINE, PAYMENTS_OFF_LINE,
  billView, contactsHidden, editsLines, permissionRefusal, permissionsOf, pricesShown, takesPayments, visitView,
} from './model.js';
import { billError, billTile, draftedFrom, emailOf, footOf, lineSub, sectionsOf, totalsOf } from '../bill/model.js';
import { tilesOf } from '../myDay/visit.js';
import { movedCard } from '../myDay/moved.js';
import { noAccessWords } from '../myDay/actions.js';
import { buildDay } from '../myDay/model.js';

const ALL_ON = { takes_payments: true, sees_customer_contacts: true, edits_bill_lines: true, changes_bill_tax: true };
const tech = (over = {}) => ({ id: 7, role: 'technician', permissions: { ...ALL_ON, ...over } });
const OLD = { id: 7, role: 'technician', permissions: null };   // an older server: no permissions in /me
const refusal = (status, code) => ({ response: { status, data: { error: 'x', code } } });

test('the words (the Designer\'s, #74)', () => {
  assert.equal(PAYMENTS_OFF_LINE, 'The office handles payments and prices.');
  assert.equal(CONTACTS_HIDDEN_LINE, 'Customer contacts are hidden. Call the office.');
  assert.equal(LINES_OFF_LINE, 'The office sets the bill lines.');
});

test('permissionsOf: four booleans, each on unless false; not an object — none', () => {
  assert.deepEqual(permissionsOf({ takes_payments: false }), { ...ALL_ON, takes_payments: false });
  assert.deepEqual(permissionsOf({ takes_payments: 0, sees_customer_contacts: 'no' }), ALL_ON, 'only false switches off');
  assert.deepEqual(permissionsOf({}), ALL_ON);
  assert.equal(permissionsOf(null), null);
  assert.equal(permissionsOf(undefined), null);
  assert.equal(permissionsOf([false]), null);
});

test('takesPayments: the bill\'s can_take_payments wins, then prices_visible, then /me; an older server — on', () => {
  assert.equal(takesPayments(tech(), null), true);
  assert.equal(takesPayments(tech({ takes_payments: false }), null), false);
  assert.equal(takesPayments(tech({ takes_payments: false }), { can_take_payments: true }), true, 'the answer is newer than /me');
  assert.equal(takesPayments(tech(), { can_take_payments: false }), false);
  assert.equal(takesPayments(tech(), { prices_visible: false }), false, 'a bill without prices');
  assert.equal(takesPayments(OLD, null), true);
  assert.equal(takesPayments(null, null), true);
  assert.equal(pricesShown({ prices_visible: false }), false);
  assert.equal(pricesShown({ prices_visible: true }), true);
  assert.equal(pricesShown(null), true);
});

test('contactsHidden: the visit\'s or the bill\'s flag wins, else /me', () => {
  assert.equal(contactsHidden(tech(), { contacts_hidden: true }), true);
  assert.equal(contactsHidden(tech({ sees_customer_contacts: false }), { contacts_hidden: false }), false, 'the answer is newer');
  assert.equal(contactsHidden(tech({ sees_customer_contacts: false }), {}), true, 'a visit kept from an older answer');
  assert.equal(contactsHidden(tech(), null, { contacts_hidden: true }), true, 'the bill\'s');
  assert.equal(contactsHidden(OLD, {}), false);
});

test('editsLines: the server\'s can_edit_lines; an older server — a draft', () => {
  assert.equal(editsLines(tech(), { status: 'draft', can_edit_lines: false }), false);
  assert.equal(editsLines(tech({ edits_bill_lines: false }), { status: 'draft', can_edit_lines: true }), true);
  assert.equal(editsLines(tech(), { status: 'issued', can_edit_lines: false }), false);
  assert.equal(editsLines(OLD, { status: 'draft' }), true);
  assert.equal(editsLines(OLD, { status: 'issued' }), false);
  assert.equal(editsLines(tech({ edits_bill_lines: false }), { status: 'draft' }), false);
  assert.equal(editsLines(tech(), null), false);
});

test('visitView: what the visit shows with each permission off', () => {
  const visit = { id: 1, phone: '718-555-0101', contacts_hidden: false };
  assert.deepEqual(visitView(tech(), visit, null), { money: true, call: 'customer', contactsLine: null, paymentsLine: null });
  assert.deepEqual(visitView(tech({ takes_payments: false }), visit, null),
    { money: false, call: 'customer', contactsLine: null, paymentsLine: PAYMENTS_OFF_LINE });
  assert.deepEqual(visitView(tech(), { ...visit, phone: null, contacts_hidden: true }, null),
    { money: true, call: 'office', contactsLine: CONTACTS_HIDDEN_LINE, paymentsLine: null });
  // the bill read for this visit says it again, as it is now
  assert.equal(visitView(tech(), visit, { can_take_payments: false }).money, false);
  // the lines and the tax do not change what the visit shows
  assert.deepEqual(visitView(tech({ edits_bill_lines: false, changes_bill_tax: false }), visit, null), visitView(tech(), visit, null));
});

test('billView: the lines read only, no giving without payments', () => {
  const draft = { status: 'draft', can_take_payments: true, can_edit_lines: true, can_change_tax: true };
  assert.deepEqual(billView(tech(), draft), { edit: true, give: true, linesLine: null, paymentsLine: null });
  assert.deepEqual(billView(tech(), { ...draft, can_edit_lines: false }), { edit: false, give: true, linesLine: LINES_OFF_LINE, paymentsLine: null });
  assert.deepEqual(billView(tech(), { ...draft, can_take_payments: false, prices_visible: false }),
    { edit: true, give: false, linesLine: null, paymentsLine: PAYMENTS_OFF_LINE });
  // an issued bill is read only anyway: no line about the permission
  assert.equal(billView(tech(), { status: 'issued', can_edit_lines: false, can_take_payments: true }).linesLine, null);
});

// the bill without prices as the server sends it to a technician without takes_payments
// (billDraft.withoutPrices): null in place of every amount
const NO_PRICES = {
  id: 5, status: 'draft', prices_visible: false, can_take_payments: false, can_edit_lines: true, can_change_tax: false,
  subtotal_cents: null, discount_cents: null, credit_cents: null, taxable_cents: null, tax_name: null, tax_rate: null, tax_cents: null,
  total_cents: null, deposits_applied_cents: null, balance_cents: null, tax: null, tax_off: null,
  lines: [
    { id: 1, kind: 'labor', name: 'Labor', quantity: '1.5', unit: 'hour', unit_price_cents: null, amount_cents: null },
    { id: 2, kind: 'part', name: 'Pump', quantity: '2', part_condition: 'new', unit_price_cents: null, amount_cents: null },
    { id: 3, kind: 'service_call', name: 'Service call', quantity: '1', unit_price_cents: null, amount_cents: null },
    { id: 4, kind: 'part', name: 'Belt', quantity: '1', warranty: true, unit_price_cents: null, amount_cents: null },
  ],
};

test('no prices: no amount anywhere, never $0.00 or a dash', () => {
  const rows = sectionsOf(NO_PRICES, 7, true);
  const all = [...rows.services, ...rows.materials];
  assert.deepEqual(all.map((r) => r.amount), [null, null, null, null]);
  assert.deepEqual(all.map((r) => r.sub), ['1.5 h', '', 'New · Qty 2', 'Warranty']);
  for (const r of all) assert.doesNotMatch(`${r.sub} ${r.amount}`, /\$|—/, r.name);
  assert.deepEqual(totalsOf(NO_PRICES), []);
  assert.equal(footOf(NO_PRICES), null);
  assert.equal(lineSub({ kind: 'discount', discount_percent: null }), 'From the price book');
  const visit = { id: 1, status: 'closed', closed_at: '2026-11-24T15:00:00Z', visit_kind: 'repair' };
  assert.equal(billTile(visit, { status: 'draft', bill: NO_PRICES }).line, 'Draft');
  const issued = { ...NO_PRICES, status: 'issued', label: 'NY-1048', bill_number: 1048, delivered_at: null };
  const tile = billTile(visit, { status: 'issued', bill: issued });
  assert.equal(tile.line, 'NY-1048');
  assert.equal(tile.warn, null, 'the office gives it: no «not given yet» for this technician');
  // with prices, as before
  const priced = { ...NO_PRICES, prices_visible: true, can_take_payments: true, total_cents: 25041, lines: [{ id: 1, kind: 'labor', name: 'Labor', quantity: '1', unit_price_cents: 25041, amount_cents: 25041 }] };
  assert.equal(billTile(visit, { status: 'draft', bill: priced }).line, 'Draft · $250.41');
  assert.equal(sectionsOf(priced, 7, true).services[0].amount, '$250.41');
  assert.ok(totalsOf(priced).length > 0);
});

test('sectionsOf: the lines are editable only with canEdit; a locked one never', () => {
  const bill = { status: 'draft', lines: [{ id: 1, kind: 'labor', quantity: '1', unit_price_cents: 100, amount_cents: 100 }, { id: 2, kind: 'labor', quantity: '1', unit_price_cents: 1, amount_cents: 1, locked: true }] };
  assert.deepEqual(sectionsOf(bill, 7, false).services.map((r) => r.editable), [false, false]);
  assert.deepEqual(sectionsOf(bill, 7, true).services.map((r) => r.editable), [true, false]);
  assert.deepEqual(sectionsOf(bill, 7).services.map((r) => r.editable), [true, false], 'an older caller: the draft');
  assert.deepEqual(sectionsOf({ ...bill, status: 'issued' }, 7).services.map((r) => r.editable), [false, false]);
});

test('the server\'s refusals: bill_lines_off and payments_off in the app\'s words', () => {
  assert.equal(permissionRefusal('bill_lines_off'), LINES_OFF_LINE);
  assert.equal(permissionRefusal('payments_off'), 'Payments are turned off for you. Ask the office.');
  assert.equal(permissionRefusal('other'), null);
  const lines = billError(refusal(403, 'bill_lines_off'));
  assert.equal(lines.kind, 'refused');
  assert.equal(lines.text, LINES_OFF_LINE);
  assert.equal(lines.linesOff, true);
  const pay = billError(refusal(403, 'payments_off'));
  assert.equal(pay.text, 'Payments are turned off for you. Ask the office.');
  assert.equal(pay.paymentsOff, true);
  assert.equal(billError(refusal(403, 'no_such')).linesOff, undefined, 'another 403 keeps the server\'s words');
});

test('the Fee tile: none without prices; the visit\'s other tiles stay', () => {
  const now = { date: '2026-11-24', minutes: 600 };
  const visit = { id: 1, status: 'scheduled', scheduled_start: '2026-11-24T14:00:00', scheduled_end: '2026-11-24T16:00:00', service_call_fee_quoted_cents: null };
  assert.deepEqual(tilesOf(visit, now, { prices: false }).map((t) => t.key), ['window', 'plan']);
  assert.deepEqual(tilesOf(visit, now).map((t) => t.key), ['window', 'plan', 'fee']);
  assert.deepEqual(tilesOf({ ...visit, visit_kind: 'recall' }, now, { prices: false }).map((t) => t.key), ['window', 'plan']);
  const moved = { ...visit, office_change: { kind: 'moved', to_date: '2026-11-25' } };
  assert.deepEqual(movedCard(moved, now, '2026-11-24', { prices: false }).tiles.map((t) => t.key), ['window', 'plan']);
  assert.ok(movedCard(moved, now, '2026-11-24').tiles.some((t) => t.key === 'fee'));
});

test('no access with contacts hidden: the first step calls the office, no phone in the words', () => {
  const visit = { client_name: 'Anna Rossi', phone: '718-555-0101' };
  const open = noAccessWords(visit);
  assert.equal(open.call.button, 'Call Anna');
  const hidden = noAccessWords({ ...visit, phone: null }, true);
  assert.equal(hidden.call.title, 'Call the office first?');
  assert.equal(hidden.call.button, 'Call the office');
  assert.doesNotMatch(hidden.call.text, /555/);
  assert.match(hidden.call.text, /Customer contacts are hidden/);
  assert.deepEqual(hidden.close, open.close);
});

test('the bill\'s email: with contacts hidden the customer says the address', () => {
  const bill = { bill_number: 1, label: 'NY-1', total_cents: 100, balance_cents: 100, customer: { name: 'Anna Rossi', email: null }, company: { name: 'SEMIX' } };
  assert.equal(emailOf({ ...bill, contacts_hidden: true }).to, 'Ask the customer for the address');
  assert.equal(emailOf(bill).to, 'No email on the job');
  assert.equal(emailOf({ ...bill, customer: { name: 'A', email: 'a@b.test' } }).to, 'a@b.test · from the job');
});

test('the day\'s rows say when the customer\'s contacts are hidden (Office in place of Call)', () => {
  const v = (id, hidden) => ({ id, status: 'scheduled', scheduled_start: `2026-11-24T${10 + id}:00:00`, scheduled_end: `2026-11-24T${11 + id}:00:00`, client_name: `C ${id}`, ...(hidden === undefined ? {} : { contacts_hidden: hidden }) });
  const day = buildDay([v(1, true), v(2, false), v(3)], '2026-11-24', { date: '2026-11-24', minutes: 480 });
  assert.deepEqual(day.rows.map((r) => r.contactsHidden), [true, false, false]);
});

test('the drafted bill\'s note: the office issues it, the office adds the lines', () => {
  const draft = { status: 'draft', visit_kind: 'repair', lines: [{ id: 1, kind: 'labor' }] };
  assert.match(draftedFrom(draft).text, /then issue\.$/);
  assert.match(draftedFrom({ ...draft, can_take_payments: false }).text, /The office issues it\.$/);
  assert.match(draftedFrom({ ...draft, prices_visible: false }).text, /The office issues it\.$/);
  const empty = { ...draft, lines: [] };
  assert.match(draftedFrom(empty).text, /Add the lines from the price book\.$/);
  assert.match(draftedFrom({ ...empty, can_edit_lines: false }).text, /The office adds the lines\.$/);
});
