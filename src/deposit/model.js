// «Deposit» in the technician app (DEP-APP; look: design-mockups/deposits app-states, app-visit,
// app-take, app-done, app-visit-after, app-repair-pay, app-blocked; rules BILLS_MV_DESIGN.md
// §2.4а), without React Native (model.test.mjs runs it on node). The server keeps the money:
//   GET  /api/my/visits/:id                — visit.deposits (DEP-1c): absent when the company has
//                                            deposits off, for a helper and for a technician
//                                            without «Takes payments»; else { take, open_cents,
//                                            items[] } (the job's deposits as the technician sees
//                                            them); take: 'yes' | 'bill_issued' | 'job_closed';
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

// The job's deposits as the visit carries them, or null (no row at all)
export function depositsOf(visit) {
  if (!canPay(visit) || !visit.job_id) return null;
  const d = visit.deposits;
  if (!d || typeof d !== 'object') return null;
  const items = Array.isArray(d.items) ? d.items : [];
  return {
    take: d.take || 'yes',
    openCents: Number.isFinite(d.open_cents) ? d.open_cents : 0,
    items,
    live: items.filter((row) => !row.voided_at),
  };
}

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
  const applied = d.live.filter((row) => row.applied_to);
  const open = d.live.filter((row) => !row.applied_to);
  if (d.take === 'bill_issued' && !open.length) {
    if (applied.length) {
      const sum = applied.reduce((s, row) => s + row.amount_cents, 0);
      return { line: `${usd(sum)} applied to ${applied[0].applied_to}`, kind: 'ok', done: true, off: false, tap: 'open' };
    }
    return { line: 'Take it as a payment', kind: 'mute', done: false, off: true, tap: 'blocked' };
  }
  if (open.length) {
    if (open.length === 1) {
      const row = open[0];
      return { line: [usd(row.amount_cents), methodLow(row), dayOf(row.received_at)].filter(Boolean).join(' · '), kind: 'ok', done: true, off: false, tap: 'open' };
    }
    return { line: `${usd(d.openCents || open.reduce((s, row) => s + row.amount_cents, 0))} · ${open.length} deposits`, kind: 'ok', done: true, off: false, tap: 'open' };
  }
  if (d.take === 'job_closed') return null;
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
export function depositHolderLine(method, me = '') {
  if (!method) return null;
  if (['card', 'zelle', 'venmo', 'bank_transfer'].includes(method)) return 'Money on hand: the office. Nothing to turn in.';
  if (method === 'check') return 'Money on hand: you. The office sees it in your checks to turn in.';
  return `Money on hand: you. The office sees it as ${method === 'cash' ? 'cash' : 'money'} with ${me || 'you'} until you turn it in.`;
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
    return {
      key: `d${row.id}`,
      row,
      title: [at ? clock(at.minutes) : null, howOf(row)].filter(Boolean).join(' · '),
      sub: [shortPerson(row.recorded_by_name), row.note ? `“${row.note}”` : null,
        row.voided_at ? 'void' : row.applied_to ? `applied to ${row.applied_to}` : 'open until the repair bill'].filter(Boolean).join(' · '),
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
    case 'bill_issued': return { kind: 'refused', text: `${billLabel ? `Bill ${billLabel}` : 'The final bill'} is issued. Take the money as a payment on the bill.` };
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
