// «Deposit» in the technician app (DEP-APP; look: design-mockups/deposits app-states, app-visit,
// app-take, app-done, app-visit-after, app-repair-pay, app-blocked; rules BILLS_MV_DESIGN.md
// §2.4а), without React Native (model.test.mjs runs it on node). The server keeps the money:
//   GET  /api/my/visits/:id                — visit.deposits (DEP-1c, be#223): null for a helper
//                                            and for a technician without «Takes payments»; else
//                                            { enabled, can_take, refused_code, open_cents,
//                                            items[] } (the job's deposits as the technician sees
//                                            them: applied_cents, applied_to, open_cents, can_void);
//                                            refused_code: 'bill_issued' | 'job_closed' | null;
//   POST /api/my/visits/:id/deposits       — { amount_cents, method, method_note?, note?,
//                                            check_number?, check_photo_file_id?,
//                                            client_request_id } → 201 { created, deposit,
//                                            deposit_warnings, deposits_open_cents } (DEP-1);
//   POST /api/my/visits/:id/payments/:pid/void — { reason }: their own deposit, 15 minutes.
// A deposit belongs to the job, not the visit: the same row on every visit of the job. Not a
// bill: no tax, no number. The repair or installation bill of the job takes every open deposit at
// its issue (DEP-2: deposits_applied_cents); after that a new deposit is refused (bill_issued:
// take it as a payment on the bill).
import { usd } from '../bill/model.js';
import { canPay, methodWord, paymentBody, shortPerson, minutesLeft } from '../pay/model.js';
import { clockAmPm as clock, momentWall } from '../myDay/model.js';
import { monthDay } from '../myDay/visit.js';
import { moneyError, parseMoney } from '../utils/money.js';

// The job's deposits as the visit carries them, or null (no row at all)
export function depositsOf(visit) {
  if (!canPay(visit) || !visit.job_id) return null;
  const d = visit.deposits;
  if (!d || typeof d !== 'object') return null;
  const items = Array.isArray(d.items) ? d.items : [];
  // take: why a new one is refused, 'off' (the company's switch), or 'yes'
  const take = d.refused_code || (d.enabled === false ? 'off' : 'yes');
  return {
    take,
    canTake: take === 'yes' && d.can_take !== false,
    openCents: Number.isFinite(d.open_cents) ? d.open_cents : 0,
    items,
    live: items.filter((row) => !row.voided_at),
  };
}
const appliedOf = (row) => (Number.isFinite(row.applied_cents) ? row.applied_cents : row.applied_to ? row.amount_cents : 0);
const refundedOf = (row) => (Number.isFinite(row.refunded_cents) ? row.refunded_cents : 0);
// What is left of a live deposit: its amount less live refunds and live allocations (the server's)
const openOf = (row) => (row.voided_at ? 0
  : Number.isFinite(row.open_cents) ? row.open_cents : Math.max(0, row.amount_cents - refundedOf(row) - appliedOf(row)));
// Open toward the final bill: live, nothing of it applied, something left (a refunded one is not)
const towardBill = (row) => !row.voided_at && appliedOf(row) === 0 && openOf(row) > 0;

const howOf = (row) => (row.method === 'check' && row.check_number ? `Check #${row.check_number}`
  : row.method === 'other' ? (row.method_note || 'Other') : methodWord(row.method, row.method_note).replace(/^./, (c) => c.toUpperCase()));
const methodLow = (row) => (row.method === 'other' ? (row.method_note || 'other') : methodWord(row.method, row.method_note));
const dayOf = (iso) => { const at = momentWall(iso); return at ? monthDay(at.date) : null; };

// ---------- the Deposit row under Approve / Bill / Pay (design app-states) ----------
// → null (no row) or { line, kind: 'wait' | 'ok' | 'mute', done, off, tap: 'take' | 'open' | 'blocked' | null }
export function depositRow(visit, { offline = false } = {}) {
  const d = depositsOf(visit);
  if (!d) return null;
  if (offline) return { line: 'Needs the internet', kind: 'mute', done: false, off: true, tap: null };
  const applied = d.live.filter((row) => appliedOf(row) > 0);
  // Open toward the bill: not taken by a bill, not refunded (after the bill — the office's refund)
  const open = d.take === 'bill_issued' ? [] : d.items.filter(towardBill);
  if (d.take === 'bill_issued') {
    if (applied.length) {
      const sum = applied.reduce((s, row) => s + appliedOf(row), 0);
      return { line: `${usd(sum)} applied to ${applied[0].applied_to}`, kind: 'ok', done: true, off: false, tap: 'open' };
    }
    return { line: 'Take it as a payment', kind: 'mute', done: false, off: true, tap: 'blocked' };
  }
  if (open.length) {
    if (open.length === 1) {
      const row = open[0];
      return { line: [usd(openOf(row)), methodLow(row), dayOf(row.received_at)].filter(Boolean).join(' · '), kind: 'ok', done: true, off: false, tap: 'open' };
    }
    return { line: `${usd(open.reduce((s, row) => s + openOf(row), 0))} · ${open.length} deposits`, kind: 'ok', done: true, off: false, tap: 'open' };
  }
  if (d.take === 'job_closed' || d.take === 'off') return null;
  return { line: 'Take one for the repair', kind: 'wait', done: false, off: false, tap: 'take' };
}

// ---------- recording ----------
// The body of POST …/deposits, or { error } in words: a payment's fields without its kind, tip
// and «before delivery»
export function depositBody({ cents, method, name = null, note = '', checkNumber = '', photoId = null, requestId }) {
  const built = paymentBody({ cents, method, name, note, checkNumber, requestId });
  if (built.error) return built;
  const { kind, ...body } = built.body;
  if (method === 'check' && photoId) body.check_photo_file_id = photoId;
  return { body };
}
// Who has the money, under the Record button (design app-take: as a payment)
// (the same words as a payment's: turn it in, no list promised)
export function depositHolderLine(method) {
  if (!method) return null;
  if (['card', 'zelle', 'venmo', 'bank_transfer'].includes(method)) return 'Money on hand: the office. Nothing to turn in.';
  return 'Money on hand: you. Turn it in to the office.';
}
export const TAKE_HINT = 'Any amount the customer agrees to.';
export const NOT_A_BILL = 'Not a bill, no tax. The repair or installation bill of this job takes it off.';
export const VISIT_HINT = 'A part to order? Take a deposit now. It goes toward the repair bill of this job.';

// ---------- the job's deposits as rows (design app-done, app-visit-after) ----------
// → [{ key, row, title, sub, amount, voided, voidLeft, applied }], oldest first
export function depositRows(visit, nowMs) {
  const d = depositsOf(visit);
  if (!d) return [];
  return d.items.map((row) => {
    const at = momentWall(row.received_at);
    const refunded = refundedOf(row);
    const applied = appliedOf(row);
    const open = openOf(row);
    // where its money is: void · applied to NY-1048 · refunded ($40.00) · the rest open toward the bill,
    // or — once the final bill is issued — the office refunds it («$24.71 to refund by the office»)
    const where = row.voided_at ? ['void'] : [
      applied > 0 && row.applied_to ? `applied to ${row.applied_to}` : null,
      refunded > 0 ? (open === 0 && applied === 0 ? 'refunded in full' : `refunded ${usd(refunded)}`) : null,
      open > 0 ? (applied > 0 || d.take === 'bill_issued' ? `${usd(open)} to refund by the office` : 'open until the repair bill') : null,
    ].filter(Boolean);
    return {
      key: `d${row.id}`,
      row,
      title: [at ? clock(at.minutes) : null, howOf(row)].filter(Boolean).join(' · '),
      sub: [shortPerson(row.recorded_by_name), row.note ? `“${row.note}”` : null, ...where].filter(Boolean).join(' · '),
      amount: usd(row.amount_cents),
      voided: !!row.voided_at,
      applied: !!row.applied_to,
      voidLeft: row.can_void && !row.voided_at ? minutesLeft(row.void_until, nowMs) : 0,
    };
  });
}
// The green banner after a record: 'Job #2215 · $100.00 · 11:58 AM'
export function recordedLine(deposit, jobNumber) {
  const at = momentWall(deposit && deposit.received_at);
  return [jobNumber ? `Job #${jobNumber}` : null, deposit ? usd(deposit.amount_cents) : null, at ? clock(at.minutes) : null].filter(Boolean).join(' · ');
}

// ---------- the server's refusals in words (design README «Что сверить») ----------
export function depositError(error, { company = 'the company', billLabel = null } = {}) {
  const res = error && error.response;
  if (!res) return { kind: 'offline', text: 'No connection. Nothing was recorded: try again when online.' };
  const code = res.data && res.data.code;
  switch (code) {
    case 'deposits_off': return { kind: 'refused', text: `Deposits are off for ${company}. An admin turns them on in Company profile.` };
    case 'job_closed': return { kind: 'refused', text: 'This job is closed or cancelled.' };
    case 'bill_issued': return { kind: 'refused', text: `${billLabel ? `Bill ${billLabel}` : 'The final bill'} is final. Take the money as a payment on the bill.` };
    case 'deposit_applied': return { kind: 'refused', text: `Applied to ${billLabel || 'the bill'}. Void the bill to change it.` };
    case 'request_used': return { kind: 'refused', text: 'This deposit was already sent with other details. Open the visit again.' };
    case 'payments_off': return { kind: 'refused', text: 'Taking money is off for you. Ask the office.' };
    default: break;
  }
  if (res.status === 404) return { kind: 'gone', text: 'This visit is no longer yours.' };
  const text = res.data && typeof res.data.error === 'string' ? res.data.error : null;
  if (res.status >= 500 || !text) return { kind: 'failed', text: 'Something went wrong. Nothing was recorded: try again.' };
  return { kind: 'refused', text };
}

// ---------- Deposit taken with no deposit (design-mockups/finish-choice f3) ----------
// «How did it end?» with Deposit taken marked and nothing open on the job: one yellow line under
// it, «No deposit on this job yet.», and «Take a deposit» (the usual Deposit screen) where a new one
// may be taken here. Finish visit still works: a warning, not a wall (the app only, the server
// does not check it). → null (no line: another outcome, a deposit open, or the visit carries no
// deposits — a helper, no «Takes payments») or { text, take } — take: the link is there
export function noDepositYet(visit, outcome, { offline = false } = {}) {
  if (outcome !== 'deposit') return null;
  const d = depositsOf(visit);
  if (!d) return null;
  const open = d.live.reduce((sum, row) => sum + openOf(row), 0);
  // a deposit already taken by a bill is there too, only not open any more
  if (open > 0 || d.openCents > 0 || d.live.some((row) => appliedOf(row) > 0)) return null;
  const row = depositRow(visit, { offline });
  return { text: 'No deposit on this job yet.', take: !!row && row.tap === 'take' };
}

// ---------- the amount typed (design app-take: any amount above $0.00, no bill to bound it) ----------
export function depositAmount(typed) {
  const cents = parseMoney(typed);
  if (cents === null || cents <= 0) return { cents: null, error: moneyError(typed, 'Type the amount: dollars and cents, like 100.00.') };
  return { cents, error: null };
}

// ---------- the money with the technician (design app-done «With you now») ----------
// Their own live deposits by cash, check or other, applied to a bill too (applying does not hand the
// money to the office: BILLS_MV_DESIGN.md §3.7), less refunds — taken as given back by whoever has
// the money; nothing left — no row → [{ key, title, amount }]
export function withYouRows(visit) {
  const d = depositsOf(visit);
  if (!d) return [];
  return d.live.filter((row) => row.holder_is_me && row.amount_cents - refundedOf(row) > 0)
    .map((row) => ({ key: `y${row.id}`, title: `${howOf(row)} · deposit`, amount: usd(row.amount_cents - refundedOf(row)) }));
}

// ---------- the head of the deposits screen ----------
// Before the final bill: DEPOSITS $100.00 | FOR THE REPAIR Open. After it: APPLIED TO NY-1048
// $175.29 and, when some is left over, TO REFUND $24.71 → Numbers rows
export function depositHead(visit) {
  const d = depositsOf(visit);
  if (!d) return [];
  const applied = d.live.filter((row) => appliedOf(row) > 0);
  if (d.take === 'bill_issued' || applied.length) {
    const label = applied.length ? applied[0].applied_to : null;
    return [
      { key: 'applied', label: label ? `Applied to ${label}` : 'Applied', value: usd(applied.reduce((s, row) => s + appliedOf(row), 0)) },
      d.openCents > 0 ? { key: 'refund', label: 'To refund', value: usd(d.openCents) } : null,
    ].filter(Boolean);
  }
  return [
    { key: 'deposits', label: 'Deposits', value: usd(d.openCents) },
    { key: 'for', label: 'For the repair', value: d.openCents > 0 ? 'Open' : 'None open' },
  ];
}

// ---------- Pay of the bill that took them (design app-repair-pay History) ----------
// The deposits applied to the bill labelled label, as History rows: 'Nov 11 · Deposit · Check #1038',
// 'Ivan P. · applied to this bill', the part the bill took; no void (a void of the bill takes it back)
export function depositPayRows(visit, label) {
  const d = depositsOf(visit);
  if (!d || !label) return [];
  return d.live.filter((row) => row.applied_to === label && appliedOf(row) > 0).map((row) => ({
    key: `d${row.id}`,
    deposit: true,
    title: [dayOf(row.received_at), 'Deposit', howOf(row)].filter(Boolean).join(' · '),
    sub: [shortPerson(row.recorded_by_name), 'applied to this bill'].filter(Boolean).join(' · '),
    amount: usd(appliedOf(row)),
    voided: false,
    voidLeft: 0,
  }));
}
// HISTORY · 1 DEPOSIT · 1 PAYMENT
export function historyLabel(rows, countWord) {
  const deposits = rows.filter((r) => r.deposit).length;
  const rest = rows.filter((r) => !r.deposit);
  if (!rows.length) return 'History';
  const parts = [deposits ? (deposits === 1 ? '1 deposit' : `${deposits} deposits`) : null, rest.length ? countWord(rest) : null];
  return `History · ${parts.filter(Boolean).join(' · ')}`;
}

// ---------- the grey row tapped (design app-blocked) ----------
// bill: this visit's bill as the visit knows it, or null. → { title, text, pay } — pay: Open Pay
// leads to this visit's bill (only when it is the issued one that stops new deposits)
export function blockedOf(visit, bill) {
  const own = bill && bill.status === 'issued' ? (bill.label || (bill.bill_number ? `#${bill.bill_number}` : null)) : null;
  return {
    title: own ? `Bill ${own} is final` : 'The bill is final',
    text: own ? 'Money for this job now goes to the bill. Take it with Pay: it lowers what is due.'
      : 'Money for this job now goes to the repair or installation bill. Take it with Pay on that visit.',
    pay: !!own,
  };
}
