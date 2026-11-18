// «Pay online» on the phone (ONL-APP1, ONLINE_PAYMENT_SPEC.md §9 п. 1; backend #236): the
// technician shows a QR code of the bill's pay link, the customer pays on their own phone on
// Stripe's page (card or Apple Pay). The app never records this payment: Stripe's webhook writes
// it (backend #237, «Online payment», online: true), and the screen sees it on the bill.
//   - the button: only when the server says so — bill.online_payments.link (the company takes
//     cards, the bill is issued with something due, the technician takes payments);
//   - the link: POST /api/my/visits/:id/bill/pay-link { amount_cents? } — without it the balance
//     at the moment of Pay, with it a part (≤ the balance). Each code is a new link: it revokes
//     the technician's earlier links of the bill, never the office's;
//   - waiting: the bill is read again every few seconds while the screen is open, for 10 minutes;
//     a payment that comes later is written all the same.
import { qrMatrix } from './qr/qrMatrix.js';
import { usd } from '../bill/model.js';

export const POLL_MS = 3000;
export const WAIT_MS = 10 * 60 * 1000;

// May this bill be paid online now (the server's flag; no flag — no button)
export const canPayOnline = (bill) => !!(bill && bill.online_payments && bill.online_payments.link === true);

// The body of the link: the full balance goes without an amount (the server counts it at Pay)
export function linkBody({ part, cents }) {
  return part && Number.isInteger(cents) && cents > 0 ? { amount_cents: cents } : {};
}

// The link of the answer (201 { link: { id, url, amount_cents }, balance_cents }), or null when it
// is not one we can show
export function linkOf(data) {
  const link = data && data.link;
  if (!link || typeof link.url !== 'string' || !/^https:\/\/\S+$/i.test(link.url)) return null;
  return { id: link.id, url: link.url, cents: Number.isInteger(link.amount_cents) ? link.amount_cents : null, balance: Number.isInteger(data.balance_cents) ? data.balance_cents : null };
}

// The online payments of a bill that are not voided: { id, cents }
const onlinePaid = (bill) => ((bill && bill.payments) || [])
  .filter((p) => p && p.kind === 'payment' && p.online === true && !p.voided_at)
  .map((p) => ({ id: p.id, cents: p.amount_cents || 0 }));

// The ids of the online payments the bill had when the code was shown
export const onlineIds = (bill) => onlinePaid(bill).map((p) => p.id);

// What came since the code was shown: { cents, paid } — cents of the new online payments,
// paid: the bill has nothing due now. null while nothing came.
export function arrivedOf(bill, knownIds) {
  const known = new Set(knownIds || []);
  const fresh = onlinePaid(bill).filter((p) => !known.has(p.id));
  if (!fresh.length) return null;
  const status = bill.payment_status;
  return { cents: fresh.reduce((sum, p) => sum + p.cents, 0), paid: status === 'paid' || status === 'overpaid' };
}

// The words of the result
export function arrivedLine(arrived) {
  return `Paid ${usd(arrived.cents)} online`;
}

// The server's no, in the technician's words
export function linkError(error) {
  const response = error && error.response;
  const status = response ? response.status : 0;
  const data = (response && response.data) || {};
  const code = data.code || null;
  if (!status) return { kind: 'offline', text: 'No connection. The code needs the internet: try again when you are back online.' };
  switch (code) {
    case 'online_payments_unavailable': return { kind: 'refused', code, text: 'This company does not take online payments now. Take the payment another way.' };
    case 'online_payments_off': return { kind: 'refused', code, text: 'Online payments are not set up. Take the payment another way.' };
    case 'nothing_due': return { kind: 'refused', code, text: 'Nothing is due on this bill now.' };
    case 'over_balance': return { kind: 'refused', code, text: data.balance_cents > 0 ? `Only ${usd(data.balance_cents)} is due now. Someone recorded a payment meanwhile: check the amount.` : 'Nothing is due on this bill now.' };
    case 'bill_void': return { kind: 'refused', code, text: 'This bill is void. Take the money on the bill that replaced it.' };
    case 'not_issued': return { kind: 'refused', code, text: 'Issue the bill first: the customer pays an issued bill.' };
    case 'payments_off': return { kind: 'refused', code, text: 'Payments are turned off for you. Ask the office.' };
    default: break;
  }
  if (status === 404) return { kind: 'gone', text: 'This visit was changed by the office' };
  if (status === 429) return { kind: 'failed', text: 'Too many codes in a row. Wait a minute and try again.' };
  return { kind: 'failed', text: 'Could not make the code. Try again.' };
}

// The dark modules of the QR code as runs per row, for drawing with plain views:
// { size, runs: [{ row, col, len }] } — size counts the modules without the quiet zone
export function qrRuns(text) {
  const { size, modules } = qrMatrix(text);
  const runs = [];
  for (let row = 0; row < size; row += 1) {
    let col = 0;
    while (col < size) {
      if (!modules[row][col]) { col += 1; continue; }
      const start = col;
      while (col < size && modules[row][col]) col += 1;
      runs.push({ row, col: start, len: col - start });
    }
  }
  return { size, runs };
}

// The quiet zone of light modules around the code (the standard: 4)
export const QUIET = 4;

// The side of one module in whole points for a code of `size` modules in `room` points: whole
// points keep the edges sharp; never below 2 pt
export function moduleSide(size, room) {
  return Math.max(2, Math.floor(room / (size + QUIET * 2)));
}
