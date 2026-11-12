// The visit's bill in the technician app (design-mockups/app-invoice: visit-done, bill-draft,
// bill-totals, price-book, line-edit, preview, preview-low), without React Native
// (model.test.mjs runs it on node). The server keeps the bill and counts it (backend
// routes/scheduler/bills.js, billDraft.js, billIssue.js): GET/POST /api/my/visits/:id/bill,
// its lines, the price book of the job's company and the issue. Nothing here counts money
// the server has not counted, but the line being edited, before it is saved.
//
// What the technician may do (the server checks it again): add a line from the price book or
// their own, change the name, the price and the quantity of a line, delete it; a discount only
// from the price book, as it is; the diagnostics credit and the deposits are the server's
// (locked); the tax is the office's — the technician sees it and does not change it (no
// Taxable switch here). Payments, the approve signature and the technician's signature come
// later (BILLS_PLAN.md, PR 11–13).
import { clock, kindWord, momentWall, parseWall, stateOf, firstName } from '../myDay/model.js';
import { monthDay, unitText } from '../myDay/visit.js';

export const CHARGE_KINDS = ['diagnostics', 'service_call', 'labor', 'part', 'installation', 'shop_supplies', 'estimate_fee', 'extra'];
const DEDUCTION_KINDS = ['discount', 'diagnostics_credit'];
const NO_WORK_OUTCOMES = ['no_access', 'client_rescheduled'];
export const KIND_WORDS = {
  diagnostics: 'Diagnostics', service_call: 'Service call', labor: 'Labor', part: 'Part', installation: 'Installation',
  shop_supplies: 'Shop supplies', estimate_fee: 'Estimate fee', extra: 'Other', discount: 'Discount', diagnostics_credit: 'Diagnostics credit',
};
const CONDITIONS = { new: 'New', used: 'Used', rebuilt: 'Rebuilt' };

// ---------- money and numbers ----------
// 25041 → '$250.41', -9500 → '−$95.00' (the design's minus), 125000 → '$1,250.00'
export function usd(cents) {
  if (!Number.isFinite(cents)) return '—';
  const abs = Math.abs(Math.round(cents));
  const dollars = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${cents < 0 ? '−' : ''}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}
// 8875 → '8.875%', 10000 → '10%'
export function percentText(milli) {
  if (!Number.isFinite(milli)) return '';
  const whole = Math.floor(milli / 1000);
  const rest = String(milli % 1000).padStart(3, '0').replace(/0+$/, '');
  return `${whole}${rest ? `.${rest}` : ''}%`;
}
// The server's quantity '1.5' / '2' (or a number) → thousandths; null when it is not one
export function qtyMilli(value) {
  const m = /^(\d{1,7})(?:\.(\d{1,3}))?$/.exec(String(value === null || value === undefined ? '' : value).trim());
  if (!m) return null;
  const milli = Number(m[1]) * 1000 + Number((m[2] || '').padEnd(3, '0'));
  return milli > 0 ? milli : null;
}
// 1500 → '1.5', 2000 → '2'
export function qtyText(milli) {
  const rest = String(milli % 1000).padStart(3, '0').replace(/0+$/, '');
  return `${Math.floor(milli / 1000)}${rest ? `.${rest}` : ''}`;
}
// What the technician types as a price: '120', '120.5', '$120.00', '1,250.00' → cents; null else
export function priceCents(text) {
  const m = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d{1,7})(?:\.(\d{0,2}))?$/.exec(String(text || '').trim());
  if (!m) return null;
  return Number(m[1].replace(/,/g, '')) * 100 + Number((m[2] || '').padEnd(2, '0'));
}
// 12000 → '120.00': the price in the field
export const priceText = (cents) => (Number.isFinite(cents) ? (cents / 100).toFixed(2) : '');
// round(price × quantity), half up, in integers (as the server's lineAmount)
export function amountOf(priceCentsValue, milli) {
  const product = priceCentsValue * milli;
  const whole = Math.floor(product / 1000);
  return (product - whole * 1000) * 2 >= 1000 ? whole + 1 : whole;
}

// ---------- a line ----------
const isHour = (unit) => /^(h|hr|hrs|hour|hours)$/i.test(String(unit || '').trim());
// The unit after a price: '/ h' for hours, '/ visit' for another, nothing for 'each' or none
function perUnit(unit) {
  const u = String(unit || '').trim();
  if (!u || /^each$/i.test(u)) return '';
  return isHour(u) ? ' / h' : ` / ${u}`;
}
// What the line is called: a part with its number 'Drain pump · DC31-00178A'
export function lineName(line) {
  const name = (typeof line.name === 'string' && line.name.trim()) || KIND_WORDS[line.kind] || 'Line';
  return line.kind === 'part' && line.part_number ? `${name} · ${line.part_number}` : name;
}
// The line under it: '1.5 h × $120.00 / h', 'New · 1 × $145.00', 'Warranty — no charge', '10% off the charges'
export function lineSub(line) {
  const q = qtyText(qtyMilli(line.quantity) || 1000);
  const price = usd(line.unit_price_cents);
  switch (line.kind) {
    case 'discount':
      return line.discount_percent ? `${percentText(line.discount_percent)} off the charges` : 'From the price book';
    case 'diagnostics_credit':
      return line.credit_bill_id
        ? 'Paid on an earlier bill of this job — counts toward the repair'
        : 'The diagnostics on this bill counts toward the repair';
    case 'part': {
      const cond = CONDITIONS[line.part_condition] || null;
      return [cond, line.warranty ? 'Warranty — no charge' : `${q} × ${price}`].filter(Boolean).join(' · ');
    }
    default:
      return isHour(line.unit) ? `${q} h × ${price} / h` : `${q} × ${price}${perUnit(line.unit)}`;
  }
}
// Where a line came from, when it says something: a part of this visit, of the estimate
export function lineBadge(line) {
  if (line.kind !== 'part') return null;
  if (line.estimate_id) return 'From the estimate';
  if (line.part_id && !line.price_item_id) return 'From this visit’s parts';
  return null;
}
// «Changed by Ivan»: the technician's mark the office sees ('you' for this technician)
export function changedText(line, userId) {
  if (!line.changed_by) return null;
  if (userId !== null && userId !== undefined && Number(line.changed_by) === Number(userId)) return 'Changed by you';
  return `Changed by ${firstName(line.changed_by_name) || 'a technician'}`;
}

// The bill's lines in the design's sections: { services, materials, credits, discounts },
// each a list of rows { key, line, name, sub, amount, deduction, locked, badge, changed, editable }
export function sectionsOf(bill, userId = null) {
  const draft = bill.status === 'draft';
  const row = (line) => ({
    key: `l${line.id}`,
    line,
    name: lineName(line),
    sub: lineSub(line),
    amount: usd(line.amount_cents),
    deduction: DEDUCTION_KINDS.includes(line.kind),
    locked: !!line.locked,
    badge: lineBadge(line),
    changed: changedText(line, userId),
    editable: draft && !line.locked,
  });
  const lines = Array.isArray(bill.lines) ? bill.lines : [];
  return {
    services: lines.filter((l) => CHARGE_KINDS.includes(l.kind) && l.kind !== 'part').map(row),
    materials: lines.filter((l) => l.kind === 'part').map(row),
    credits: lines.filter((l) => l.kind === 'diagnostics_credit').map(row),
    discounts: lines.filter((l) => l.kind === 'discount').map(row),
  };
}

// ---------- the totals ----------
// The tax as the technician sees it (set by the office, by the job's company):
// { label: 'Sales tax · 8.875%', sub: 'Queens County, NY · by the job’s company' } or none
export function taxOf(bill) {
  if (bill.tax_rate === null || bill.tax_rate === undefined) {
    return { label: 'Sales tax', sub: 'None: the company has no default tax', none: true };
  }
  return { label: `Sales tax · ${percentText(bill.tax_rate)}`, sub: [bill.tax_name, 'by the job’s company'].filter(Boolean).join(' · '), none: false };
}
// [{ key, label, sub?, value, kind: 'plain' | 'deduction' | 'total' | 'balance' }]
export function totalsOf(bill) {
  const rows = [{ key: 'subtotal', label: 'Subtotal', value: usd(bill.subtotal_cents), kind: 'plain' }];
  if (bill.discount_cents > 0) rows.push({ key: 'discount', label: 'Discounts', value: usd(-bill.discount_cents), kind: 'deduction' });
  if (bill.credit_cents > 0) rows.push({ key: 'credit', label: 'Diagnostics credit', value: usd(-bill.credit_cents), kind: 'deduction' });
  const tax = taxOf(bill);
  rows.push({ key: 'tax', label: tax.label, sub: tax.sub, value: usd(bill.tax_cents || 0), kind: 'plain' });
  rows.push({ key: 'total', label: 'Total', value: usd(bill.total_cents), kind: 'total' });
  if (bill.deposits_applied_cents > 0) rows.push({ key: 'deposits', label: 'Deposits applied', value: usd(-bill.deposits_applied_cents), kind: 'deduction' });
  rows.push({ key: 'balance', label: 'Balance due', value: usd(balanceOf(bill)), kind: 'balance' });
  return rows;
}
export const balanceOf = (bill) => (Number.isFinite(bill.balance_cents) ? bill.balance_cents : (bill.total_cents || 0) - (bill.deposits_applied_cents || 0));
// The line over the main button: 'Total $250.41 · balance due' and '$150.41'
export function footOf(bill) {
  return { text: `Total ${usd(bill.total_cents)} · balance due`, big: usd(balanceOf(bill)) };
}

// ---------- the head of the bill ----------
// The chip and the time beside it: { chip: { text, icon, kind }, saved: 'Saved 12:45' }
export function statusOf(bill, now) {
  if (bill.status === 'issued') {
    const at = momentWall(bill.issued_at);
    return { chip: { text: `Issued · ${bill.label || `#${bill.bill_number}`}`, icon: 'checkc', kind: 'done' }, saved: at ? `Frozen ${whenText(at, now)}` : '' };
  }
  if (bill.status === 'void') return { chip: { text: 'Void', icon: 'doc', kind: 'neutral' }, saved: '' };
  const at = momentWall(bill.updated_at);
  return { chip: { text: 'Draft · no number yet', icon: 'doc', kind: 'neutral' }, saved: at ? `Saved ${whenText(at, now)}` : '' };
}
// today '12:45', another day 'Nov 6'
function whenText(at, now) {
  return now && at.date === now.date ? clock(at.minutes) : monthDay(at.date);
}
// FROM / TO / APPLIANCE of the card at the top. visit: the visit the bill was opened from
// (its appliances; the bill answer has none), or null
export function partiesOf(bill, visit) {
  const company = bill.company || null;
  const customer = bill.customer || {};
  const address = customer.address || {};
  const town = [address.city, [address.state, address.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const appliances = (visit && Array.isArray(visit.appliances) ? visit.appliances : []).map((a, i) => ({
    key: `a${i}`,
    title: [a.appliance_type || 'Appliance', [a.brand, a.model].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
    serial: a.serial_number ? `Serial ${a.serial_number}` : '',
  }));
  return {
    from: company ? { title: [company.name, company.state].filter(Boolean).join(' · '), sub: 'Company of this job' } : { title: 'No company', sub: 'The office sets it' },
    to: { title: customer.name || 'Customer', sub: town },
    appliances,
  };
}

// ---------- what stops the issue ----------
const BLOCKING = {
  company_missing: () => 'The job has no company. Ask the office to set one.',
  profile_missing: () => 'The office has not filled in the company details yet.',
  tax_missing: (company) => taxWords(company),
};
// No tax: the technician cannot issue without it (only the office may), so the words say who
// sets it: 'No sales tax set for SEMIX CORP. The office sets it, then you can issue.'
export const taxWords = (company) => `No sales tax set for ${company || 'the company'}. The office sets it, then you can issue.`;
const companyName = (bill) => (bill && bill.company && (bill.company.name || bill.company.legal_name)) || null;
// The warnings of a draft that only the office can fix: [{ code, text, hard }]. hard: the
// technician's issue cannot go (no company, no company details, no tax, nothing to charge).
// The draft keeps the tax of its last change: when the office sets the tax later, the screen
// still says «no tax» until the issue counts the bill again (retryTax: the quiet «try again»).
export function blockersOf(bill) {
  if (bill.status !== 'draft') return [];
  const out = (Array.isArray(bill.warnings) ? bill.warnings : []).filter((w) => w && BLOCKING[w.code])
    .map((w) => ({ code: w.code, text: BLOCKING[w.code](companyName(bill)), hard: true }));
  const charges = (Array.isArray(bill.lines) ? bill.lines : []).filter((l) => CHARGE_KINDS.includes(l.kind));
  if (!charges.length) out.push({ code: 'no_lines', text: 'Add a service or a part: the bill has nothing to charge for.', hard: true });
  return out;
}
// The credit's warning, under the credit: 'Bill #1031 is not marked paid yet'
export function creditNote(bill) {
  const w = (Array.isArray(bill.warnings) ? bill.warnings : []).find((x) => x && x.code === 'credit_not_paid');
  return w && typeof w.message === 'string' ? w.message.replace(/^Diagnostics credit:\s*/i, '').replace(/^./, (c) => c.toUpperCase()) : null;
}

// «The bill is drafted for you»: what the server put into a new draft, while nobody has changed
// it. null once a line was changed or added by hand, or for an issued bill.
export function draftedFrom(bill) {
  if (bill.status !== 'draft') return null;
  const lines = Array.isArray(bill.lines) ? bill.lines : [];
  if (lines.some((l) => l.changed_by)) return null;
  const parts = [];
  const services = [...new Set(lines.filter((l) => CHARGE_KINDS.includes(l.kind) && l.kind !== 'part').map((l) => KIND_WORDS[l.kind].toLowerCase()))];
  parts.push(...services);
  const visitParts = lines.filter((l) => l.kind === 'part' && l.part_id && !l.estimate_id && !l.price_item_id).length;
  if (visitParts) parts.push(`${visitParts === 1 ? 'the part' : `${visitParts} parts`} from this visit’s parts`);
  if (lines.some((l) => l.kind === 'part' && l.estimate_id)) parts.push('the part from the estimate');
  if (lines.some((l) => l.kind === 'diagnostics_credit')) parts.push('the diagnostics credit');
  const kind = kindWord({ visit_kind: bill.visit_kind });
  if (!parts.length) return { title: 'The bill is started for you', text: `Nothing was found for a ${kind.toLowerCase()} visit. Add the lines from the price book.` };
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return { title: 'The bill is drafted for you', text: `Made from the visit kind ${kind}: ${list}. Check it with the customer, then issue.` };
}

// ---------- the visit's Bill button ----------
// Whether this technician works on the bill of this visit (the server's rules: the main
// technician of a visit of the new schedule that was not cancelled or closed without work)
export function canBill(visit) {
  if (!visit || visit.legacy || visit.role === 'helper') return false;
  const state = stateOf(visit);
  if (state === 'cancelled' || state === 'moved') return false;
  return !NO_WORK_OUTCOMES.includes(visit.outcome);
}
// The bill as the visit knows it: { status: 'loading' | 'none' | 'draft' | 'issued' | 'unknown', bill }
// → the tile under the visit's buttons { title: 'Bill', line, warn?, off, kind } or null (no bill
// for this technician). Before Finish there is no bill yet: the tile waits for it (off).
export function billTile(visit, known) {
  if (!canBill(visit)) return null;
  const status = known ? known.status : 'loading';
  const bill = known ? known.bill : null;
  if (status === 'draft' && bill) return { title: 'Bill', line: `Draft · ${usd(bill.total_cents)}`, off: false, kind: 'draft' };
  if (status === 'issued' && bill) {
    const label = bill.label || `#${bill.bill_number}`;
    // not given yet: in warning colour on the tile — the payment waits until the customer has it
    return bill.delivered_at
      ? { title: 'Bill', line: `${label} · delivered`, warn: null, off: false, kind: 'issued' }
      : { title: 'Bill', line: `${label} · ${usd(bill.total_cents)}`, warn: 'not given yet', off: false, kind: 'issued' };
  }
  const closed = stateOf(visit) === 'closed';
  if (!closed) return { title: 'Bill', line: 'After Finish', off: true, kind: 'wait' };
  if (status === 'none') return { title: 'Bill', line: 'Not started', off: false, kind: 'none' };
  if (status === 'unknown') return { title: 'Bill', line: 'Needs connection', off: false, kind: 'unknown' };
  return { title: 'Bill', line: '…', off: false, kind: 'loading' };
}
// The answer of GET …/bill as the visit keeps it
export function knownOf(bill) {
  if (!bill) return { status: 'none', bill: null };
  return { status: bill.status === 'issued' ? 'issued' : bill.status === 'draft' ? 'draft' : 'none', bill };
}

// ---------- editing a line ----------
// The fields of the line editor: { kind, name, price (text), qty (thousandths), unit, warranty, description, fromBook }
export function editOf(line) {
  return {
    kind: line.kind,
    name: typeof line.name === 'string' ? line.name : '',
    price: priceText(line.unit_price_cents),
    qty: qtyMilli(line.quantity) || 1000,
    unit: line.unit || '',
    warranty: !!line.warranty,
    description: typeof line.description === 'string' ? line.description.trim() : '',
    fromBook: !!line.price_item_id,
    version: line.price_item_version || null,
  };
}
// A new line of the technician's own (from the price book's «Add your own line»):
// a service is Labor, Service call or Other; a material is a new part
export function newEdit(kind) {
  return { kind, name: '', price: '', qty: 1000, unit: kind === 'labor' ? 'hour' : '', warranty: false, description: '', fromBook: false, version: null };
}
export const OWN_SERVICE_KINDS = ['labor', 'service_call', 'extra'];
// What − and + add: half an hour for hours, one for the rest
export const qtyStep = (edit) => (isHour(edit.unit) ? 500 : 1000);
// The unit beside the price: '/ hour', '/ each' …
export const unitWord = (edit) => (isHour(edit.unit) ? 'hour' : String(edit.unit || '').trim() || 'each');
// The line's total as it is being typed, in cents; null while the price is not a price
export function editTotal(edit) {
  const cents = priceCents(edit.price);
  if (cents === null || !(edit.qty > 0)) return null;
  return edit.kind === 'part' && edit.warranty ? 0 : amountOf(cents, edit.qty);
}
// Why it cannot be saved yet, or null
export function editError(edit) {
  if (!edit.name.trim()) return 'Name the line as the customer will read it.';
  if (priceCents(edit.price) === null) return 'Price: dollars and cents, like 120.00.';
  if (!(edit.qty > 0)) return 'Quantity is more than 0.';
  return null;
}
// PATCH body of the changes (only what changed); {} when nothing did
export function patchOf(line, edit) {
  const body = {};
  const name = edit.name.trim();
  if (name !== (line.name || '')) body.name = name;
  const cents = priceCents(edit.price);
  if (cents !== null && cents !== line.unit_price_cents) body.unit_price_cents = cents;
  if (edit.qty !== (qtyMilli(line.quantity) || 1000)) body.quantity = qtyText(edit.qty);
  return body;
}
// POST body of a new line of the technician's own
export function newLineBody(edit) {
  const body = { kind: edit.kind, name: edit.name.trim(), unit_price_cents: priceCents(edit.price), quantity: qtyText(edit.qty) };
  if (edit.unit && edit.kind !== 'part') body.unit = edit.unit;
  if (edit.kind === 'part') body.part_condition = 'new';
  return body;
}
// The words under the fields: the price book's price, and that the office sees the change
export function editHint(line, edit, userName) {
  const who = firstName(userName) || 'you';
  const seen = `If you change it, the office sees “changed by ${who}”.`;
  if (!line || !line.price_item_id) return line ? seen : `The office sees this line as “added by ${who}”.`;
  return `Price book price: ${usd(line.unit_price_cents)}${perUnit(line.unit)}. ${seen}`;
}

// ---------- the price book ----------
export const BOOK_TABS = [
  { key: 'service', label: 'Services' },
  { key: 'material', label: 'Materials' },
  { key: 'discount', label: 'Discounts' },
];
// The rows of a tab, filtered by the search: [{ key, item, name, sub, onBill }]. onBill: the
// item is already a line of this bill (the design's tick); it is not added twice from here.
export function bookRows(items, tab, query, bill) {
  const on = new Set((bill && Array.isArray(bill.lines) ? bill.lines : []).map((l) => l.price_item_id).filter(Boolean));
  const q = String(query || '').trim().toLowerCase();
  return (Array.isArray(items) ? items : [])
    .filter((it) => it && it.kind === tab && (!q || String(it.name || '').toLowerCase().includes(q)))
    .map((it) => ({ key: `p${it.id}`, item: it, name: it.name, sub: bookSub(it), onBill: on.has(it.id) }));
}
function bookSub(item) {
  if (item.kind === 'discount') return item.discount_percent ? `${percentText(item.discount_percent)} off` : `${usd(item.unit_price_cents)} off`;
  return `${usd(item.unit_price_cents)}${perUnit(item.unit)}${item.taxable ? ' · taxable' : ''}`;
}
export const searchHint = (tab) => (tab === 'material' ? 'Search materials' : tab === 'discount' ? 'Search discounts' : 'Search services');

// ---------- what the customer gets ----------
// The document as the PDF will print it (backend billPdf.js), from the bill and the visit:
// a draft says DRAFT and «Given when issued» for the number. today: 'YYYY-MM-DD'.
export function previewOf(bill, visit, today) {
  const company = bill.company || {};
  const customer = bill.customer || {};
  const address = customer.address || {};
  const street = [address.line, unitText(address.unit)].filter(Boolean).join(', ');
  const town = [address.city, [address.state, address.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const billing = customer.billing_address && customer.billing_address.line ? customer.billing_address.line : null;
  const issued = bill.status !== 'draft';
  const issuedAt = momentWall(bill.issued_at);
  const facts = [
    ['Bill #', issued ? (bill.label || `#${bill.bill_number}`) : 'Given when issued', !issued],
    ['Job #', bill.job_id ? String(bill.job_id) : ''],
    ['Bill date', dateText(issuedAt ? issuedAt.date : today)],
    [visitDates(visit).length > 1 ? 'Visits' : 'Visit', visitDates(visit).join(' · ')],
    ['Payment terms', company.payment_terms || ''],
  ].filter(([, value]) => value).map(([label, value, quiet]) => ({ label, value, quiet: !!quiet }));
  const groups = [
    { key: 'labor', title: 'Service call & labor', lines: (bill.lines || []).filter((l) => CHARGE_KINDS.includes(l.kind) && l.kind !== 'part') },
    { key: 'parts', title: 'Parts', lines: (bill.lines || []).filter((l) => l.kind === 'part') },
    { key: 'credits', title: 'Credits & discounts', lines: (bill.lines || []).filter((l) => DEDUCTION_KINDS.includes(l.kind)) },
  ].filter((g) => g.lines.length).map((g) => ({
    key: g.key,
    title: g.title,
    rows: g.lines.map((l) => ({
      key: `l${l.id}`,
      name: l.name || KIND_WORDS[l.kind],
      tag: l.kind === 'part' ? CONDITIONS[l.part_condition] || null : null,
      sub: previewSub(l),
      amount: usd(l.amount_cents),
      deduction: DEDUCTION_KINDS.includes(l.kind),
    })),
  }));
  const totals = [{ label: 'Subtotal', value: usd(bill.subtotal_cents) }];
  if (bill.discount_cents > 0) totals.push({ label: 'Discounts', value: usd(-bill.discount_cents) });
  if (bill.credit_cents > 0) totals.push({ label: 'Diagnostics credit', value: usd(-bill.credit_cents) });
  totals.push(bill.tax_rate !== null && bill.tax_rate !== undefined
    ? { label: `Sales tax · ${[bill.tax_name, percentText(bill.tax_rate)].filter(Boolean).join(' ')}`, value: usd(bill.tax_cents || 0) }
    : { label: 'Tax', value: 'none' });
  return {
    stamp: issued ? null : 'DRAFT',
    company: {
      name: company.legal_name || company.name || 'No company yet',
      lines: [company.address, [company.phone, company.email].filter(Boolean).join(' · '), company.website].filter(Boolean),
      licence: company.licence_number ? `${company.licence_label || 'Licence'} · Lic. #${company.licence_number}` : null,
      hic: company.nj_hic_number ? `NJ HIC #${company.nj_hic_number}` : null,
    },
    facts,
    amountDue: usd(balanceOf(bill)),
    billTo: [customer.name, billing || street, billing ? null : town, customer.phone, customer.email].filter(Boolean),
    service: { address: billing ? [street, town].filter(Boolean) : ['Same as bill to'], technician: bill.technician && bill.technician.name ? bill.technician.name : null },
    appliances: (visit && Array.isArray(visit.appliances) ? visit.appliances : []).map((a) => [a.appliance_type, a.brand, a.model ? `Model ${a.model}` : null, a.serial_number ? `Serial ${a.serial_number}` : null].filter(Boolean).join(' · ')).filter(Boolean),
    groups,
    totals,
    total: usd(bill.total_cents),
    deposits: bill.deposits_applied_cents > 0 ? usd(-bill.deposits_applied_cents) : null,
    message: typeof bill.message === 'string' && bill.message.trim() ? bill.message.trim() : null,
    warranty: typeof company.warranty_text === 'string' && company.warranty_text.trim() ? company.warranty_text.trim() : null,
  };
}
function previewSub(line) {
  if (line.kind === 'part') {
    return [line.part_number ? `Part # ${line.part_number}` : null, line.warranty ? 'Warranty — no charge' : `${qtyText(qtyMilli(line.quantity) || 1000)} × ${usd(line.unit_price_cents)}`].filter(Boolean).join(' · ');
  }
  if (line.kind === 'diagnostics_credit') return line.credit_bill_id ? 'Diagnostics paid on an earlier bill' : 'Diagnostics on this bill';
  if (line.kind === 'discount') return line.discount_percent ? `${percentText(line.discount_percent)} off` : '';
  return lineSub(line);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// '2026-11-11' → 'Nov 11, 2026'
export function dateText(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date || '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : '';
}
// The days of the job's visits that were not cancelled, this one among them: ['Nov 6', 'Nov 11']
export function visitDates(visit) {
  if (!visit) return [];
  const all = [...(Array.isArray(visit.job_visits) ? visit.job_visits : []), visit]
    .filter((v) => v && stateOf(v) !== 'cancelled')
    .map((v) => parseWall(v.scheduled_start))
    .filter(Boolean)
    .map((w) => w.date);
  return [...new Set(all)].sort().map(monthDay);
}

// ---------- when the server says no ----------
const ISSUE_WORDS = {
  profile_missing: 'The office has not filled in the company details yet. Ask the office, then issue.',
  company_missing: 'The job has no company. Ask the office to set one, then issue.',
  no_lines: 'The bill has nothing to charge for. Add a service or a part.',
  credit_changed: 'The diagnostics credit changed meanwhile. Check the bill and issue again.',
};
// A failed request on the bill: { kind, text, total? }
//   offline — no answer (the same request may go again); none — the visit has no bill yet;
//   gone — the visit is no longer this technician's; refused — the server's reason, in words;
//   failed — the server broke.
// A bill that has only the missing tax against it: the office may have set the tax since
export const retryTax = (blockers) => blockers.length > 0 && blockers.every((b) => b.code === 'tax_missing');
export function billError(error, { issue = false, company = null } = {}) {
  const response = error && error.response;
  const status = response ? response.status : 0;
  const data = (response && response.data) || {};
  const said = typeof data.error === 'string' && data.error ? data.error : '';
  if (!status) {
    return { kind: 'offline', text: issue ? 'No connection. The bill is issued only online: the number comes from the server.' : 'No connection. Try again.' };
  }
  if (status === 404) {
    if (/no bill yet/i.test(said)) return { kind: 'none', text: 'This visit has no bill yet.' };
    if (/line not found/i.test(said)) return { kind: 'refused', text: 'This line is no longer on the bill.' };
    return { kind: 'gone', text: 'This visit was changed by the office' };
  }
  if (status === 409 && /already marked delivered/i.test(said)) return { kind: 'refused', text: 'This bill is already marked delivered.' };
  if (status === 409 && data.code === 'total_changed') {
    return { kind: 'refused', text: `The total changed to ${usd(data.total_cents)}. Check the bill and issue again.`, total: data.total_cents };
  }
  if ((status === 409 || status === 400) && data.code === 'tax_missing') return { kind: 'refused', text: taxWords(company) };
  if ((status === 409 || status === 400) && ISSUE_WORDS[data.code]) return { kind: 'refused', text: ISSUE_WORDS[data.code] };
  if (status === 409 || status === 403 || status === 400) {
    return { kind: 'refused', text: said ? `${said.replace(/[.\s]*$/, '')}.` : 'The bill could not be changed.' };
  }
  return { kind: 'failed', text: 'Something went wrong. Try again.' };
}

// ---------- giving the bill to the customer (design app-invoice send) ----------
// How the bill reached the customer, as the server's «delivered» takes it (backend
// billIssue.js): handed — a printed copy; shared — the PDF from the company's email, a message
// or AirDrop, only with the customer's consent to electronic documents (E-SIGN / NY ESRA).
export const DELIVERY_CHOICES = [
  { via: 'handed', title: 'Printed and handed to the customer', hint: 'A paper copy at the visit' },
  { via: 'shared', title: 'Sent the PDF', hint: 'From the company email or AirDrop, not from your personal number' },
];
export const CONSENT_WORDS = 'The customer agreed to get the documents of this job electronically.';
// The body of POST …/bill/delivered, or { error } in words
export function deliverBody(via, to, consent) {
  if (!DELIVERY_CHOICES.some((c) => c.via === via)) return { error: 'Choose how the customer got the bill.' };
  const sentTo = String(to || '').trim();
  if (sentTo.length > 255) return { error: 'Sent to: at most 255 characters.' };
  if (via === 'shared' && !consent) return { error: 'Tick that the customer agreed to get the documents electronically.' };
  const body = { via };
  if (sentTo) body.to = sentTo;
  if (via === 'shared') body.consent = true;
  return { body };
}
// The delivery mark of an issued bill: { title: 'Delivered 12:42', line: 'Printed and handed · by Ivan' } or null
export function deliveryOf(bill, now) {
  if (!bill || !bill.delivered_at) return null;
  const at = momentWall(bill.delivered_at);
  const how = bill.delivered_via === 'shared' ? 'PDF sent' : bill.delivered_via === 'handed' ? 'Printed and handed' : 'Delivered';
  return {
    title: at ? `Delivered ${whenText(at, now)}` : 'Delivered',
    line: [how, bill.delivered_to || null, bill.delivered_by_name ? `by ${firstName(bill.delivered_by_name)}` : null].filter(Boolean).join(' · '),
  };
}
// The email the customer will get once the company's email works (shown, not sent)
export function emailOf(bill) {
  const company = (bill.company && (bill.company.legal_name || bill.company.name)) || 'the company';
  const customer = bill.customer || {};
  const label = bill.label || `#${bill.bill_number}`;
  const due = usd(balanceOf(bill));
  const terms = bill.company && bill.company.payment_terms ? `, ${String(bill.company.payment_terms).toLowerCase()}` : '';
  const phone = bill.company && bill.company.phone ? ` Questions: ${bill.company.phone}.` : '';
  return {
    to: customer.email ? `${customer.email} · from the job` : 'No email on the job',
    subject: `Bill ${label} from ${company} — ${due} due`,
    message: `Hi ${firstName(customer.name) || 'there'}, thank you for choosing ${company}. Your bill ${label} is attached. Amount due: ${due}${terms}.${phone}`,
  };
}
// The PDF's file name on the phone: 'bill-NY-1048.pdf'
export const pdfName = (bill) => `bill-${String(bill.label || bill.bill_number || bill.id).replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;
