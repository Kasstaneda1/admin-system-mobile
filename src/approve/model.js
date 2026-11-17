// «Approve» before the work in the technician app (design-mockups/app-invoice approve,
// visit-done), without React Native (model.test.mjs runs it on node). The server keeps the
// customer's consent and checks it (backend routes/scheduler/billConsents.js, billApproval.js):
// GET /api/my/visits/:id/terms?kind=authorization, GET/POST /api/my/visits/:id/authorizations,
// and the copy of it (billCopies.js) …/authorizations/:aid/pdf and …/copies.
//
// What the technician does (decisions of «Руководитель проекта», 2026-11-17):
//   - the customer signs with a finger for the amount WITHOUT tax of the visit's bill draft
//     (amount_source bill; the draft is the server's, BillScreen shows and changes it); the
//     amount the customer saw goes with it (expected_amount_cents), so a draft changed
//     meanwhile is refused (409 amount_changed) and the customer signs again — never silently;
//   - the company's latest approval terms go by their version (terms_version_id); none
//     published — none sent;
//   - in NYC the customer chooses about the written estimate (§2-255): estimate_choice and its
//     price, without them the server refuses;
//   - an approval by phone is the office's (the technician gets 403): the screen says so;
//   - the rule of the place (NYC more than 20 %, NJ any excess) is the server's: it stops the
//     issue of a bill over the approved amount (409 authorization_exceeded, src/bill/model.js
//     billError → reapprove). The app does not count the rule itself.
import { canBill, usd } from '../bill/model.js';
import { clock, momentWall } from '../myDay/model.js';

// ---------- who signs where ----------
// The approval is taken by the main technician of a visit of the new schedule that still has
// work (the same as the bill: canBill); a helper, an old task, a cancelled visit — none
export const canApprove = (visit) => canBill(visit);

// ---------- the amount the customer agrees to ----------
// The draft as the customer sees it: { amount (cents without tax), withTax, summary, count }
// or null when there is nothing to approve. amount is the server's netOf: total less tax.
export function agreedOf(bill) {
  if (!bill || bill.status !== 'draft') return null;
  const lines = Array.isArray(bill.lines) ? bill.lines : [];
  if (!lines.length) return null;
  const total = Number(bill.total_cents) || 0;
  const tax = Number(bill.tax_cents) || 0;
  const names = lines.map((line) => (typeof line.name === 'string' && line.name.trim()) || null).filter(Boolean);
  const summary = names.map((name, i) => (i === 0 ? name : name.charAt(0).toLowerCase() + name.slice(1))).join(', ');
  return { amount: Math.max(0, total - tax), withTax: total, tax, summary, count: lines.length };
}
export const countText = (n) => `See ${n} ${n === 1 ? 'line' : 'lines'}`;

// ---------- the rule of the place ----------
// The words under the signature, by the rule the server names for the job (locationRule)
export function ruleText(rule) {
  if (rule === 'nyc_20') return 'If the bill grows more than 20% over this amount, the customer signs again (NYC rule).';
  if (rule === 'nj_any') return 'If the bill grows over this amount at all, the customer signs again (NJ rule).';
  return 'If the bill grows over this amount, ask the customer again before the work.';
}
export const needsEstimateChoice = (rule) => rule === 'nyc_20';

// ---------- the written estimate (NYC, §2-255) ----------
export const ESTIMATE_CHOICES = [
  { choice: 'written', title: 'Wants a written estimate' },
  { choice: 'waived', title: 'Waives the written estimate' },
];
export const estimatePriceText = (cents) => (cents > 0 ? usd(cents) : 'free');

// ---------- the terms ----------
// The line of the company's approval terms: { title, sub } or null when none is published
export function termsLineOf(terms, companyName) {
  if (!terms) return null;
  const title = (typeof terms.title === 'string' && terms.title.trim()) || `${companyName || 'Company'} repair terms`;
  return { title, sub: `Version ${terms.version} · the customer gets a copy` };
}

// ---------- the request ----------
// The body of POST …/authorizations, or { error } in words before anything is sent
export function authBody({ name, png, agreed, terms, rule, estimate, requestId }) {
  const signer = String(name || '').trim();
  if (!signer) return { error: 'Type the customer’s name.' };
  if (!png) return { error: 'The customer signs in the box first.' };
  if (!agreed) return { error: 'There is no amount to approve yet.' };
  const body = {
    method: 'signature',
    signer_name: signer.slice(0, 200),
    signature_png: png,
    amount_source: 'bill',
    expected_amount_cents: agreed.amount,
    client_request_id: requestId,
  };
  if (terms) body.terms_version_id = terms.id;
  if (needsEstimateChoice(rule)) {
    if (!estimate || !ESTIMATE_CHOICES.some((c) => c.choice === estimate.choice)) return { error: 'Choose about the written estimate.' };
    if (!Number.isInteger(estimate.price) || estimate.price < 0) return { error: 'The written estimate has no price yet: ask the office.' };
    body.estimate_choice = estimate.choice;
    body.estimate_price_cents = estimate.price;
  }
  return { body };
}

// ---------- the approvals the visit's job has ----------
// The newest approval (the server answers newest first; by id to be sure)
export function latestOf(authorizations) {
  const list = Array.isArray(authorizations) ? authorizations.filter(Boolean) : [];
  return list.reduce((best, a) => (!best || Number(a.id) > Number(best.id) ? a : best), null);
}
// 'Signed 11:31', 'Signed Nov 6 · 11:31' on another day; 'Agreed by phone …' for the office's
export function signedText(auth, today) {
  if (!auth) return '';
  const at = momentWall(auth.authorized_at || auth.created_at);
  const when = at ? (today && at.date !== today ? `${shortDay(at.date)} · ${clock(at.minutes)}` : clock(at.minutes)) : '';
  const how = auth.method === 'oral' ? 'Agreed by phone' : 'Signed';
  return when ? `${how} ${when}` : how;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDay(date) {
  const [, m, d] = String(date).split('-').map(Number);
  return m && d ? `${MONTHS[m - 1]} ${d}` : date;
}

// The Approve tile of the visit: { title, line, warn?, kind } or null (nobody signs here).
//   known: { status: 'loading' | 'unknown' | 'ok', list } as GET …/authorizations answered;
//   pending: a signature kept on this phone, not sent yet (queue.js)
export function approveTile(visit, known, pending, today) {
  if (!canApprove(visit)) return null;
  if (pending) return { title: 'Approve', line: 'Signed on this phone', warn: pending.failed ? 'not accepted' : 'not sent yet', kind: 'pending' };
  const status = known ? known.status : 'loading';
  if (status === 'ok') {
    const latest = latestOf(known.list);
    if (latest) return { title: 'Approve', line: `${signedText(latest, today)} · ${usd(latest.amount_cents)}`, warn: null, kind: 'signed' };
    return { title: 'Approve', line: 'Not signed yet', warn: null, kind: 'none' };
  }
  if (status === 'unknown') return { title: 'Approve', line: 'Needs connection', warn: null, kind: 'unknown' };
  return { title: 'Approve', line: '…', warn: null, kind: 'loading' };
}

// ---------- a failed request ----------
// { kind, text, amount? }:
//   offline — no answer (the signature waits on the phone and goes again);
//   resign — the draft or the terms changed: the customer sees the new and signs again;
//   refused — the server's reason in words; gone — the visit is no longer this technician's;
//   failed — the server broke.
export const RESIGN_WORDS = 'The amount changed — the customer signs again.';
export function approveError(error) {
  const response = error && error.response;
  const status = response ? response.status : 0;
  const data = (response && response.data) || {};
  const said = typeof data.error === 'string' && data.error ? data.error : '';
  if (!status) return { kind: 'offline', text: 'No connection. The signature is kept on this phone and goes to the office by itself.' };
  if (status === 409 && data.code === 'amount_changed') {
    const amount = Number.isFinite(data.amount_cents) ? data.amount_cents : null;
    return { kind: 'resign', text: amount === null ? RESIGN_WORDS : `${RESIGN_WORDS} It is ${usd(amount)} now.`, amount };
  }
  if (status === 409 && data.code === 'terms_changed') return { kind: 'resign', text: 'The company’s terms changed — the customer reads them and signs again.' };
  if (status === 409 && (data.code === 'no_draft' || data.code === 'no_lines')) return { kind: 'refused', text: 'The bill has nothing to approve yet. Add the work to it first.' };
  if (status === 400 && data.code === 'estimate_choice_missing') return { kind: 'refused', text: 'In NYC the customer chooses about the written estimate first.' };
  if (status === 404) return { kind: 'gone', text: 'This visit was changed by the office' };
  if (status === 409 || status === 403 || status === 400) {
    return { kind: 'refused', text: said ? `${said.replace(/[.\s]*$/, '')}.` : 'The approval was not saved.' };
  }
  return { kind: 'failed', text: 'Something went wrong. Try again.' };
}

// The PDF file of an approval's copy: 'approval-412.pdf'
export const copyName = (auth) => `approval-${String(auth && auth.id).replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;
