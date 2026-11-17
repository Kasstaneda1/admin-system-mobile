// Salary, the rows of a month that open their own screen (design-mockups/app-salary-parts
// salary-payments, salary-receipts, salary-unpaid; site technician-payments.js,
// technician-receipts.js, technician-unpaid.js). Only what the server already gives; no salary
// is counted here. Without React Native (money.test.mjs).
//   Payments: GET /api/technician-payments/:name → { payments: [{ id, payment_date, amount }] },
//     the newest first; the screen shows one month (the month the Paid row belongs to).
//   Receipts: GET /api/my-receipts → [{ id, date, client_name, work_status, check_amount }],
//     this technician's checks not handed in yet, of every month.
//   Unpaid Clients: GET /api/technician-unpaid/unpaid/:name → { pending: [...], declined: [...] },
//     rows { id, client_name, record_date, amount, manager_notes }, of every month.
// The server takes the technician from the login; the name in the address is not trusted.
import { MONTHS, dateText, money, tagOf } from './model.js';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const clean = (v) => (v === null || v === undefined ? '' : String(v).trim());
const sum = (rows, field) => rows.reduce((s, r) => s + Math.round(num(r[field]) * 100), 0) / 100;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------- Payments ----------
// The month of a 'YYYY-MM-DD' date as [year, month 0–11], or null
function yearMonth(value) {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(String(value || ''));
  return m ? [Number(m[1]), Number(m[2]) - 1] : null;
}

// One month of payouts (design salary-payments): Total Payments, «November 2026 · 2 payments»,
// the payouts by date, the newest first
export function paymentsOf(answer, year, month) {
  const all = answer && Array.isArray(answer.payments) ? answer.payments : Array.isArray(answer) ? answer : [];
  const rows = all
    .filter((p) => {
      const ym = p && yearMonth(p.payment_date);
      return ym && ym[0] === year && ym[1] === month;
    })
    .sort((a, b) => String(b.payment_date).slice(0, 10).localeCompare(String(a.payment_date).slice(0, 10)) || num(b.id) - num(a.id));
  return {
    total: money(sum(rows, 'amount')),
    line: `${MONTHS[month]} ${year} · ${plural(rows.length, 'payment')}`,
    count: rows.length,
    rows: rows.map((p, i) => ({ key: p.id !== undefined && p.id !== null ? String(p.id) : `p${i}`, date: dateText(p.payment_date), amount: money(p.amount) })),
  };
}
export const NO_PAYMENTS = { title: 'No payments this month', text: 'Payments for this month will appear here' };

// ---------- Receipts ----------
// Checks not handed in (design salary-receipts): Total Unsubmitted, «1 check waiting for
// submission», a row per check — the customer, the work status badge, the date, «Waiting for
// submission», the amount
export function receiptsOf(answer) {
  const all = (Array.isArray(answer) ? answer : []).filter(Boolean);
  return {
    total: money(sum(all, 'check_amount')),
    line: `${plural(all.length, 'check')} waiting for submission`,
    count: all.length,
    rows: all.map((r, i) => ({
      key: r.id !== undefined && r.id !== null ? String(r.id) : `r${i}`,
      client: clean(r.client_name) || 'N/A',
      date: dateText(r.date),
      tag: tagOf(clean(r.work_status) || null),
      amount: money(r.check_amount),
    })),
  };
}
export const WAITING = 'Waiting for submission';
export const NO_RECEIPTS = { title: 'All receipts submitted!', text: 'You have no pending checks to submit' };

// ---------- Unpaid Clients ----------
const unpaidRow = (r, i, status) => ({
  key: r.id !== undefined && r.id !== null ? String(r.id) : `${status}${i}`,
  client: clean(r.client_name) || 'N/A',
  date: dateText(r.record_date),
  amount: money(r.amount),
  note: clean(r.manager_notes) || null,
  status: status === 'declined' ? 'Declined' : 'Pending',
});

// The two tabs (design salary-unpaid) with their counts; empty — the site's words
export function unpaidOf(answer) {
  const a = answer && typeof answer === 'object' ? answer : {};
  const pending = (Array.isArray(a.pending) ? a.pending : []).filter(Boolean).map((r, i) => unpaidRow(r, i, 'pending'));
  const declined = (Array.isArray(a.declined) ? a.declined : []).filter(Boolean).map((r, i) => unpaidRow(r, i, 'declined'));
  return {
    tabs: [
      { key: 'pending', label: 'Pending', count: pending.length },
      { key: 'declined', label: 'Declined', count: declined.length },
    ],
    pending,
    declined,
    none: !pending.length && !declined.length,
  };
}
export const NO_UNPAID = 'No unpaid clients';
export const UNPAID_EMPTY = {
  pending: { title: 'All Clear!', text: 'No pending unpaid records' },
  declined: { title: 'No Declined Records', text: 'Keep up the good work!' },
};
export const MANAGER_NOTES = 'Manager Notes';

// ---------- where the screens open ----------
// The month a screen belongs to: the one it was opened for, else this month (from More)
export function monthOfParams(params, today = new Date()) {
  const p = params || {};
  const year = Number.isInteger(p.year) ? p.year : today.getFullYear();
  const month = Number.isInteger(p.month) && p.month >= 0 && p.month <= 11 ? p.month : today.getMonth();
  return { year, month };
}

// Why a screen has no data (salaryError has Salary's own words)
export function moneyError(error, what) {
  const status = error && error.response ? error.response.status : 0;
  if (!status) return { kind: 'offline', title: 'No connection', text: `${what} come from the office’s server. Try again when you are back online.` };
  return { kind: 'failed', title: `Could not load ${what}`, text: 'Something went wrong. Try again.' };
}
