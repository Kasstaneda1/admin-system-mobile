// The tax of a bill draft in the technician app (TAX-APP; BILLS_MV_DESIGN.md §2.9–2.10,
// design-mockups/payments: app-fee-draft-off, app-tax-pick, app-tax-off, app-tax-readonly),
// without React Native (tax.test.mjs runs it on node). The server keeps the rule (backend
// billTax.js billTaxOf): Taxable off → no tax; else the rate picked in this bill; else the
// company's default. Its answer says it all:
//   tax: { source: 'bill' | 'company' | 'off', tax_id, name, rate_milli } (a draft; issued — its snapshot)
//   tax_off: the Taxable switch is off
//   can_change_tax: this technician may pick the rate and switch the tax off (changes_bill_tax)
//   tax_choices: [{ id, name, rate_milli }] — what may be picked here; the app does not filter
//   tax_name / tax_rate / tax_cents / taxable_cents: the tax as counted now
// The app sends PUT { tax_id } (null — the company's default) or { tax_off } and shows the
// bill it answers. The amount beside each rate in the list is counted here only to show it
// (the same rounding as the server's taxCents); the bill's own tax is the server's.
import { percentText, rateName, usd } from './model.js';

const RATE_DIVISOR = 100000; // a rate in thousandths of a percent → a share

// The tax in cents on taxableCents at rateMilli, half away from zero (backend billTax.js taxCents)
export function taxCents(taxableCents, rateMilli) {
  if (!Number.isInteger(taxableCents) || !Number.isInteger(rateMilli) || rateMilli < 0) return 0;
  const product = Math.abs(taxableCents) * rateMilli;
  const whole = Math.floor(product / RATE_DIVISOR);
  const rounded = (product - whole * RATE_DIVISOR) * 2 >= RATE_DIVISOR ? whole + 1 : whole;
  return taxableCents < 0 ? -rounded : rounded;
}

const hasRate = (rate) => Number.isInteger(rate);
const isOff = (bill) => bill.tax_off === true || (bill.tax && bill.tax.source === 'off');

// The TAX section of a draft (null when there is none to show: an issued or void bill — its
// totals say the tax —, or prices hidden from this technician):
//   { change, taxable: { on, sub, note } | null, rate: { title, sub, amount, open, locked } | null }
// change: the technician may pick and switch (can_change_tax): the Taxable switch and the rate
// row that opens the list. Without it: one locked row «set by the office».
export function taxSection(bill) {
  if (!bill || bill.status !== 'draft' || bill.prices_visible === false) return null;
  const change = bill.can_change_tax === true;
  const off = isOff(bill);
  const tax = bill.tax || {};
  const choices = Array.isArray(bill.tax_choices) ? bill.tax_choices : [];
  const base = `On ${usd(bill.taxable_cents || 0)}`;
  if (!change) {
    if (off) return { change, taxable: null, rate: { title: 'Tax · turned off', sub: 'No sales tax on this bill · set by the office', amount: usd(0), open: false, locked: true } };
    if (!hasRate(bill.tax_rate)) return { change, taxable: null, rate: { title: 'No sales tax', sub: 'Set by the office', amount: '', open: false, locked: true } };
    return { change, taxable: null, rate: { title: rateName(bill.tax_name, bill.tax_rate), sub: `${base} · set by the office`, amount: usd(bill.tax_cents || 0), open: false, locked: true } };
  }
  const taxable = off
    ? { on: false, sub: 'Off: no sales tax on this bill', note: 'The office sees «Tax turned off» on this bill. Turn it on again any time before you issue.' }
    : { on: true, sub: 'Sales tax on this bill', note: null };
  if (off) return { change, taxable, rate: null };
  if (!hasRate(bill.tax_rate)) {
    return {
      change, taxable,
      rate: choices.length
        ? { title: 'No tax rate yet', sub: 'The company has no default · tap to choose', amount: '', open: true, locked: false }
        : { title: 'No sales tax', sub: 'No rates to choose from · the office adds them', amount: '', open: false, locked: false },
    };
  }
  const whose = tax.source === 'company' ? 'company default' : 'chosen for this bill';
  return {
    change, taxable,
    rate: { title: rateName(bill.tax_name, bill.tax_rate), sub: `${base} · ${whose} · tap to change`, amount: usd(bill.tax_cents || 0), open: true, locked: false },
  };
}

// The list of the Tax rate sheet: [{ key, id, title, sub, send }] and which is on now.
// send: the body of the PUT that picks it ({ tax_id } — null is the company's default).
//   - the rates the server lists (active, of this company or of all), each with the tax it
//     makes on this bill; the company's default is marked when the bill follows it (the answer
//     names it only then: tax.source 'company');
//   - a bill on its own rate gets «Company default» first: back to whatever the office sets;
//   - its own rate hidden by the office since stays on the list (on) until another is picked.
export function taxChoicesOf(bill) {
  const tax = (bill && bill.tax) || {};
  const taxable = (bill && bill.taxable_cents) || 0;
  const listed = Array.isArray(bill && bill.tax_choices) ? bill.tax_choices : [];
  const defaultId = tax.source === 'company' && Number.isInteger(tax.tax_id) ? tax.tax_id : null;
  const current = tax.source === 'bill' && Number.isInteger(tax.tax_id) ? `t${tax.tax_id}` : defaultId !== null ? `t${defaultId}` : null;
  const rows = [];
  if (tax.source === 'bill') {
    rows.push({ key: 'default', id: null, title: 'Company default', sub: 'The rate the office set for this company', send: { tax_id: null } });
  }
  for (const c of listed) {
    if (!c || !Number.isInteger(c.id) || !hasRate(c.rate_milli)) continue;
    const mark = c.id === defaultId ? 'Company default' : null;
    rows.push({
      key: `t${c.id}`, id: c.id, title: `${(c.name || 'Sales tax').trim()} · ${percentText(c.rate_milli)}`,
      sub: [mark, usd(taxCents(taxable, c.rate_milli))].filter(Boolean).join(' · '), send: { tax_id: c.id },
    });
  }
  if (current && !rows.some((r) => r.key === current) && hasRate(tax.rate_milli)) {
    rows.unshift({
      key: current, id: tax.tax_id, title: `${(tax.name || 'Sales tax').trim()} · ${percentText(tax.rate_milli)}`,
      sub: [tax.source === 'company' ? 'Company default' : 'Hidden by the office · stays on this bill', usd(taxCents(taxable, tax.rate_milli))].join(' · '), send: null,
    });
  }
  return { rows, current };
}

// What a tap on Done sends: the body, or null when the choice is the bill's already
export function taxPick(bill, key) {
  const { rows, current } = taxChoicesOf(bill);
  if (!key || key === current) return null;
  const row = rows.find((r) => r.key === key);
  return row && row.send ? row.send : null;
}

// The server's no to a change of the tax, in words (null — not about the tax: billError says it)
export function taxRefusal(error) {
  const response = error && error.response;
  const data = (response && response.data) || {};
  if (response && response.status === 403 && data.code === 'no_tax_permission') return 'The office sets the tax of your bills. Ask the office to change it.';
  if (response && response.status === 400 && data.code === 'tax_not_allowed') return 'This rate is no longer in the list. Choose another one.';
  return null;
}
