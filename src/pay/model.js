// «Pay» on the visit in the technician app (design-mockups/payments: pay-states, pay, pay-part,
// method-*, card-tip, card-summary, recorded, paid, tip, void, offline, not-given, later),
// without React Native (model.test.mjs runs it on node). The server keeps the money and counts
// it (backend routes/scheduler/billPayments.js, billBalance.js, PR 13а-1):
//   GET  /api/my/visits/:id/bill            — the bill with paid_cents, balance_cents,
//                                             payment_status, tips_cents, payments;
//   POST /api/my/visits/:id/payments        — { kind?, amount_cents, method, method_note?, note?,
//                                             check_number?, before_delivery?, before_delivery_reason?,
//                                             tip_for_user_id?, client_request_id };
//   POST /api/my/visits/:id/payments/:pid/void — { reason }: their own record, 15 minutes.
//
// What the app does not count (BILLS_MV_DESIGN.md §2.5, §3): the balance, the status, who holds
// the money — all the server's. The screen shows them and the words. No payment without the
// connection: the server checks the balance so two phones never count the same money twice.
// One record — one method; two methods are two records one after another. A tip (kind tip) is
// not the bill's money: never in paid, balance or status.
import { canBill, usd } from '../bill/model.js';
import { clockAmPm as clock, firstName, momentWall } from '../myDay/model.js';
import { monthDay } from '../myDay/visit.js';

// ---------- who takes the money ----------
// The main technician of a visit of the new schedule, as the bill (a helper takes none)
export const canPay = (visit) => canBill(visit);

// ---------- the methods (design method-*: six tiles; bank transfer inside Other) ----------
export const METHODS = [
  { method: 'cash', word: 'Cash', icon: 'cash' },
  { method: 'check', word: 'Check', icon: 'checkp' },
  { method: 'card', word: 'Card', icon: 'card' },
  { method: 'zelle', word: 'Zelle', icon: 'zap' },
  { method: 'venmo', word: 'Venmo', icon: 'vee' },
  { method: 'other', word: 'Other', icon: 'more' },
];
// Other, which one: bank transfer is its own method (bank_transfer), the rest method other with
// the name in method_note (required)
export const OTHER_CHOICES = [
  { key: 'bank_transfer', title: 'Bank transfer', sub: 'To the company’s bank account', method: 'bank_transfer', name: null },
  { key: 'cash_app', title: 'Cash App', sub: null, method: 'other', name: 'Cash App' },
  { key: 'paypal', title: 'PayPal', sub: null, method: 'other', name: 'PayPal' },
  { key: 'else', title: 'Something else', sub: 'Type what the customer used', method: 'other', name: '' },
];
const WORDS = { cash: 'cash', check: 'check', card: 'card', zelle: 'Zelle', venmo: 'Venmo', bank_transfer: 'bank transfer', other: 'other' };
const TITLES = { cash: 'Cash', check: 'Check', card: 'Card', zelle: 'Zelle', venmo: 'Venmo', bank_transfer: 'Bank transfer', other: 'Other' };
// What stays in the technician's hands (the server's IN_HAND_METHODS): cash, check, other
const IN_HAND = ['cash', 'check', 'other'];
export const inHand = (method) => IN_HAND.includes(method);

// The method that will be recorded: { method, name } from the tile and the choice in Other
export function chosenMethod(tile, otherKey, otherName) {
  if (tile !== 'other') return { method: tile, name: null };
  const choice = OTHER_CHOICES.find((c) => c.key === otherKey);
  if (!choice) return { method: null, name: null };
  if (choice.method === 'bank_transfer') return { method: 'bank_transfer', name: null };
  return { method: 'other', name: choice.key === 'else' ? String(otherName || '').trim() : choice.name };
}
// The word in the button and the banner: 'cash', 'check', 'bank transfer', 'Cash App'
export const methodWord = (method, name = null) => (method === 'other' ? (name || 'other') : WORDS[method] || method);
// The line under the main button: who has the money now (the server sets holder by the method)
export function holderLine(method, { kind = 'payment', me = '' } = {}) {
  if (!method) return null;
  if (!inHand(method)) return 'Money on hand: the office. Nothing to turn in.';
  if (kind === 'tip') return 'Money on hand: you. The office sees it under Tips on the bill.';
  if (method === 'check') return 'Money on hand: you. The office sees it in your checks to turn in.';
  return `Money on hand: you. The office sees it as ${method === 'cash' ? 'cash' : 'money'} with ${me || 'you'} until you turn it in.`;
}

// ---------- the Pay button of the visit (design pay-states) ----------
// The bill as the visit knows it (src/bill/model.js knownOf, or { status: 'unknown', bill } of
// the last answer) → { title, line, kind, off } or null (no Pay for this technician):
//   wait — no issued bill (a draft, none, void); show — issued, not given («Give the bill first»); due — unpaid;
//   left — partly paid; paid — paid in full (green); free — nothing to pay; offline — the last
//   known balance without the connection; loading.
export function payTile(visit, known, { offline = false } = {}) {
  if (!canPay(visit)) return null;
  const bill = known ? known.bill : null;
  const issued = bill && bill.status === 'issued' ? bill : null;
  if (!known || known.status === 'loading') return { title: 'Pay', line: '…', kind: 'loading', off: true };
  if (!issued) {
    if (known.status === 'unknown') return { title: 'Pay', line: 'Needs connection', kind: 'offline', off: false };
    return { title: 'Pay', line: 'Bill first', kind: 'wait', off: false };
  }
  const due = Number.isFinite(issued.balance_cents) ? issued.balance_cents : issued.total_cents;
  if (offline || known.status === 'unknown') {
    if (issued.payment_status === 'paid') return { title: 'Pay', line: 'Paid · offline', kind: 'offline', off: false };
    return { title: 'Pay', line: `${usd(due)} due · offline`, kind: 'offline', off: false };
  }
  if (!issued.delivered_at && !paymentsOf(issued).some((p) => p.kind === 'payment' && !p.voided_at)) {
    return { title: 'Pay', line: 'Give the bill first', kind: 'show', off: false };
  }
  switch (issued.payment_status) {
    case 'no_charge': return { title: 'Pay', line: 'Nothing to pay', kind: 'free', off: false };
    case 'paid': {
      const at = paidAt(issued);
      return { title: 'Pay', line: at ? `Paid ${clock(at.minutes)}` : 'Paid', kind: 'paid', off: false };
    }
    case 'overpaid': return { title: 'Pay', line: 'Paid · the office refunds the rest', kind: 'paid', off: false };
    case 'partly_paid': return { title: 'Pay', line: `${usd(due)} left`, kind: 'left', off: false };
    default: return { title: 'Pay', line: `${usd(due)} due`, kind: 'due', off: false };
  }
}
const paymentsOf = (bill) => (bill && Array.isArray(bill.payments) ? bill.payments : []);
// When the bill was paid in full: the latest payment that counts ({ date, minutes }) or null
export function paidAt(bill) {
  const last = paymentsOf(bill).filter((p) => p.kind === 'payment' && !p.voided_at).map((p) => p.received_at).filter(Boolean).sort().pop();
  return last ? momentWall(last) : null;
}

// ---------- the head of the Pay screen ----------
// The chip over the numbers: { text, kind: 'done' | 'warn' | 'neutral' }
export function chipOf(bill, now) {
  const label = bill.label || `#${bill.bill_number}`;
  if (bill.status === 'draft') return { text: 'Bill · draft, not issued', kind: 'neutral' };
  if (bill.status === 'void') return { text: `Bill ${label} · void`, kind: 'neutral' };
  if (bill.delivered_at) {
    const at = momentWall(bill.delivered_at);
    return { text: `Bill ${label} · given${at ? ` ${whenText(at, now)}` : ''}`, kind: 'done' };
  }
  const at = momentWall(bill.issued_at);
  return { text: `Bill ${label} · issued${at ? ` ${whenText(at, now)}` : ''}, not given`, kind: 'warn' };
}
function whenText(at, now) {
  return now && at.date === now.date ? clock(at.minutes) : monthDay(at.date);
}
// TOTAL / PAID / DUE
export function numbersOf(bill) {
  const due = Number.isFinite(bill.balance_cents) ? bill.balance_cents : (bill.total_cents || 0) - (bill.deposits_applied_cents || 0);
  return [
    { key: 'total', label: 'Total', value: usd(bill.total_cents) },
    { key: 'paid', label: 'Paid', value: usd(bill.paid_cents || 0) },
    { key: 'due', label: 'Due', value: usd(Math.max(0, due)) },
  ];
}
export const dueOf = (bill) => Math.max(0, Number.isFinite(bill.balance_cents) ? bill.balance_cents : (bill.total_cents || 0) - (bill.deposits_applied_cents || 0));
// What the screen is about: none (no issued bill) · void · show (not given, nothing paid) ·
// free (nothing to pay) · paid · collect
export function stageOf(bill) {
  if (!bill || bill.status === 'draft') return 'none';
  if (bill.status === 'void') return 'void';
  if (bill.payment_status === 'no_charge') return 'free';
  if (bill.payment_status === 'paid' || bill.payment_status === 'overpaid') return 'paid';
  if (!bill.delivered_at && !paymentsOf(bill).some((p) => p.kind === 'payment' && !p.voided_at && p.before_delivery)) return 'show';
  return 'collect';
}
// A payment of this bill already went «before delivery» (the bill sent later): the next one may too
export const laterReasonGiven = (bill) => paymentsOf(bill).some((p) => p.kind === 'payment' && !p.voided_at && p.before_delivery);

// ---------- the history ----------
// The bill's payments and tips, oldest first, as rows: { key, payment, title, sub, amount, tip,
// voided, voidLine, voidLeft (minutes the technician may still void it, or 0) }
export function historyOf(bill, nowMs) {
  return paymentsOf(bill).map((p) => {
    const at = momentWall(p.received_at);
    const how = p.method === 'check' && p.check_number ? `Check #${p.check_number}` : p.method === 'other' ? (p.method_note || 'Other') : TITLES[p.method] || p.method;
    const who = shortPerson(p.recorded_by_name);
    const voidedAt = p.voided_at ? momentWall(p.voided_at) : null;
    return {
      key: `p${p.id}`,
      payment: p,
      title: [at ? clock(at.minutes) : null, p.kind === 'tip' ? `Tip for ${shortPerson(p.tip_for_name) || 'the team'}` : null, how].filter(Boolean).join(' · '),
      sub: [who, p.note ? `“${p.note}”` : null, p.before_delivery ? 'bill sent later' : null].filter(Boolean).join(' · '),
      amount: usd(p.amount_cents),
      tip: p.kind === 'tip',
      voided: !!p.voided_at,
      voidLine: p.voided_at ? `Void${voidedAt ? ` ${clock(voidedAt.minutes)}` : ''}${p.voided_by_name ? ` by ${shortPerson(p.voided_by_name)}` : ''}${p.void_reason ? `: ${p.void_reason}` : ''}` : null,
      voidLeft: p.can_void ? minutesLeft(p.void_until, nowMs) : 0,
    };
  });
}
// 'Ivan Petrov' → 'Ivan P.'; one word stays; 'Team' stays
export function shortPerson(name) {
  const words = typeof name === 'string' ? name.trim().split(/\s+/).filter(Boolean) : [];
  if (!words.length) return '';
  return words.length === 1 ? words[0] : `${words[0]} ${words[words.length - 1].charAt(0)}.`;
}
// Whole minutes left until the moment (rounded up), 0 when it passed or is unknown
export function minutesLeft(until, nowMs) {
  const end = Date.parse(until || '');
  if (!Number.isFinite(end) || !Number.isFinite(nowMs) || end <= nowMs) return 0;
  return Math.ceil((end - nowMs) / 60000);
}
// HISTORY · 2 PAYMENTS · 1 TIP: a tip is not a payment, it is counted on its own
export const countWord = (rows) => {
  const n = rows.filter((r) => !r.tip).length;
  const tips = rows.filter((r) => r.tip).length;
  const payments = n === 1 ? '1 payment' : `${n} payments`;
  return tips ? `${payments} · ${tips === 1 ? '1 tip' : `${tips} tips`}` : payments;
};

// What the card charge is of the bill (design card-tip, card-summary): the whole bill, the rest
// after earlier payments, or a part. { tipLabel (over the amount on the tip screen), title, sub }
export function chargeOf(bill, part) {
  const label = bill.label || `#${bill.bill_number}`;
  const paid = bill.paid_cents || 0;
  const totals = `Total ${usd(bill.total_cents)}${paid > 0 ? ` · ${usd(paid)} paid` : ''}`;
  if (part) return { tipLabel: `Part of ${label}`, title: `Part of ${label}`, sub: totals };
  if (paid > 0) return { tipLabel: `Left on ${label}`, title: `Rest of ${label}`, sub: totals };
  return { tipLabel: `Bill ${label}`, title: `Bill ${label}`, sub: 'Total with tax' };
}

// ---------- how much now (design pay, pay-part) ----------
// What the technician types: '100', '100.5', '$1,250.00' → cents; null else
export function moneyCents(text) {
  const m = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d{1,7})(?:\.(\d{0,2}))?$/.exec(String(text || '').trim());
  if (!m) return null;
  return Number(m[1].replace(/,/g, '')) * 100 + Number((m[2] || '').padEnd(2, '0'));
}
export const moneyText = (cents) => (Number.isFinite(cents) ? (cents / 100).toFixed(2) : '');
export const PART_REASONS = ['Rest by another method now', 'Customer pays the office later', 'Rest when the job is done'];
// The amount step: { cents, part, left, error } — error in words, null when Next can go
export function amountOf({ full, typed, note }, due) {
  if (full) return { cents: due, part: false, left: 0, error: due > 0 ? null : 'Nothing is due on this bill.' };
  const cents = moneyCents(typed);
  if (cents === null || cents <= 0) return { cents: null, part: true, left: due, error: 'Type the amount: dollars and cents, like 100.00.' };
  if (cents > due) return { cents, part: true, left: 0, error: `Only ${usd(due)} is due. A tip is recorded on its own.` };
  const part = cents < due;
  if (part && !String(note || '').trim()) return { cents, part, left: due - cents, error: 'Why only part? Pick a reason or type a note.' };
  return { cents, part, left: due - cents, error: null };
}

// ---------- tips (design card-tip, tip; BILLS_MV_DESIGN.md §3.7) ----------
// The company's buttons (pd_company_profiles.tip_presets: { mode: amount | percent, values });
// until the bill brings them — $5, $10, $20 (the owner's choice). Percent of the total with tax,
// half away from zero. → [{ key, label, sub, cents }]
export const DEFAULT_TIPS = { mode: 'amount', values: [500, 1000, 2000] };
export function tipButtons(presets, totalCents) {
  const ok = presets && (presets.mode === 'amount' || presets.mode === 'percent') && Array.isArray(presets.values)
    && presets.values.length >= 1 && presets.values.length <= 6 && presets.values.every((v) => Number.isInteger(v) && v > 0);
  const use = ok ? presets : DEFAULT_TIPS;
  return use.values.map((v, i) => {
    if (use.mode === 'percent') {
      const cents = Math.round((Math.abs(totalCents) * v) / 100000) * Math.sign(totalCents || 1);
      return { key: `t${i}`, label: percentWord(v), sub: usd(cents), cents };
    }
    return { key: `t${i}`, label: v % 100 === 0 ? `$${v / 100}` : usd(v), sub: null, cents: v };
  });
}
const percentWord = (milli) => {
  const whole = Math.floor(milli / 1000);
  const rest = String(milli % 1000).padStart(3, '0').replace(/0+$/, '');
  return `${whole}${rest ? `.${rest}` : ''}%`;
};
// Who the tip is for: [{ key, title, sub }]; split only with a helper on the visit
export function tipForChoices(visit, meName) {
  const me = shortPerson(meName) || firstName(meName) || 'You';
  const out = [{ key: 'me', title: `${me} · you`, sub: 'The main technician of this visit' }];
  if (visit && visit.second_technician_id) out.push({ key: 'split', title: 'Split with the helper', sub: `Two lines, one for you and one for ${firstName(visit.helper_name) || 'the helper'}` });
  out.push({ key: 'team', title: 'The whole team', sub: 'The office shares it' });
  return out;
}
// The tip lines to record: [{ cents, tip_for_user_id? }] — the main technician is the server's
// default (no field), the helper by id, the team null. Split: half each, the odd cent to you.
export function tipParts(cents, forKey, visit) {
  if (!(cents > 0)) return [];
  if (forKey === 'team') return [{ cents, tip_for_user_id: null }];
  if (forKey === 'split' && visit && visit.second_technician_id) {
    const helper = Math.floor(cents / 2);
    const mine = cents - helper;
    return [{ cents: mine }, ...(helper > 0 ? [{ cents: helper, tip_for_user_id: Number(visit.second_technician_id) }] : [])];
  }
  return [{ cents }];
}
export function tipForLine(forKey, visit, meName) {
  if (forKey === 'team') return 'For the whole team · no tax';
  if (forKey === 'split') return `For ${shortPerson(meName) || 'you'} and ${firstName(visit && visit.helper_name) || 'the helper'} · no tax`;
  return `For ${shortPerson(meName) || 'you'} · no tax`;
}

// ---------- the request ----------
// The body of POST …/payments, or { error } in words.
//   kind payment | tip; cents; method (+ name for other); note; checkNumber; later: { reason } —
//   the bill is sent later (before_delivery); tipFor: { tip_for_user_id? } of tipParts.
export function paymentBody({ kind = 'payment', cents, method, name = null, note = '', checkNumber = '', later = null, tipFor = null, requestId }) {
  if (!(Number.isInteger(cents) && cents > 0)) return { error: 'The amount is more than $0.00.' };
  if (!TITLES[method]) return { error: 'Choose how the customer pays.' };
  const body = { kind, amount_cents: cents, method, client_request_id: requestId };
  if (method === 'other') {
    const n = String(name || '').trim();
    if (!n) return { error: 'Other: type what the customer used.' };
    if (n.length > 60) return { error: 'Other: at most 60 characters.' };
    body.method_note = n;
  }
  const text = String(note || '').trim();
  if (text.length > 500) return { error: 'The note: at most 500 characters.' };
  if (text) body.note = text;
  const number = String(checkNumber || '').trim();
  if (method === 'check' && number) {
    if (number.length > 30) return { error: 'The check number: at most 30 characters.' };
    body.check_number = number;
  }
  if (later) {
    const reason = String(later.reason || '').trim();
    if (!reason) return { error: 'Say why the bill is sent later.' };
    body.before_delivery = true;
    body.before_delivery_reason = reason.slice(0, 300);
  }
  if (kind === 'tip' && tipFor && 'tip_for_user_id' in tipFor) body.tip_for_user_id = tipFor.tip_for_user_id;
  return { body };
}
// The green banner after a record: '$100.00 cash recorded · 2:24 PM'
function paymentWhat(payment) {
  return payment.kind === 'tip' ? `${usd(payment.amount_cents)} tip` : `${usd(payment.amount_cents)} ${methodWord(payment.method, payment.method_note)}`;
}
const paymentAt = (payment) => {
  const at = momentWall(payment.received_at);
  return at ? ` · ${clock(at.minutes)}` : '';
};
export function recordedLine(payment) {
  if (!payment) return null;
  return `${paymentWhat(payment)} recorded${paymentAt(payment)}`;
}
// Lines that went through without an answer and were found on the bill (pay/attempts.js):
// «Already recorded: $60.00 cash · 11:31», several joined with «, »
export function alreadyLine(payments) {
  return `Already recorded: ${payments.map((p) => `${paymentWhat(p)}${paymentAt(p)}`).join(', ')}`;
}

// ---------- voiding one's own record (design void) ----------
export const VOID_REASONS = ['Wrong amount', 'Wrong method', 'Customer took it back'];
// { reason } from the chip and the words typed, or { error }
export function voidBody(chip, typed) {
  const words = String(typed || '').trim();
  const reason = [chip, words].filter(Boolean).join(': ');
  if (!reason) return { error: 'Say why it is voided: pick one or type it.' };
  if (reason.length > 500) return { error: 'At most 500 characters.' };
  return { body: { reason } };
}

// ---------- when the server says no ----------
// { kind, text, code?, balance? }: offline — no answer (the same request may go again, the
// server answers a repeat with the same row); gone — the visit is not this technician's;
// refused — the server's reason in words; failed — the server broke.
export function payError(error) {
  const response = error && error.response;
  const status = response ? response.status : 0;
  const data = (response && response.data) || {};
  const said = typeof data.error === 'string' && data.error ? data.error : '';
  const code = data.code || null;
  if (!status) return { kind: 'offline', text: 'No connection. A payment needs the internet: try again when you are back online.' };
  if (status === 404) {
    if (/no bill yet/i.test(said)) return { kind: 'refused', code: 'no_bill', text: 'This visit has no bill yet. Issue the bill first.' };
    if (/payment not found/i.test(said)) return { kind: 'refused', code: 'not_found', text: 'This payment is no longer on the bill.' };
    return { kind: 'gone', text: 'This visit was changed by the office' };
  }
  switch (code) {
    case 'not_issued': return { kind: 'refused', code, text: 'Issue the bill first: the payment goes on an issued bill.' };
    case 'bill_void': return { kind: 'refused', code, text: 'This bill is void. Take the money on the bill that replaced it.' };
    case 'not_delivered': return { kind: 'refused', code, text: 'Give the bill to the customer first, or say why it is sent later.' };
    case 'over_balance': return { kind: 'refused', code, balance: data.balance_cents, text: data.balance_cents > 0 ? `Only ${usd(data.balance_cents)} is due now. Someone recorded a payment meanwhile: check the amount.` : 'Nothing is due on this bill now.' };
    case 'note_required': return { kind: 'refused', code, balance: data.balance_cents, text: 'Part of the balance: say why in the note.' };
    case 'reason_required': return { kind: 'refused', code, text: 'Say why the bill is sent later.' };
    case 'payments_off': return { kind: 'refused', code, text: 'Payments are turned off for you. Ask the office.' };
    case 'void_window_passed': return { kind: 'refused', code, text: 'More than 15 minutes passed. Ask the office: an admin voids it now.' };
    case 'not_yours': return { kind: 'refused', code, text: 'Only an admin voids a payment someone else recorded.' };
    case 'already_void': return { kind: 'refused', code, text: 'This payment is already void.' };
    case 'request_used': return { kind: 'refused', code, text: 'This press went to another bill. Open the payment again.' };
    default: break;
  }
  if (status === 409 || status === 403 || status === 400) return { kind: 'refused', code, text: said ? `${said.replace(/[.\s]*$/, '')}.` : 'The payment was not recorded.' };
  return { kind: 'failed', text: 'Something went wrong. Try again.' };
}
