// The three buttons of a visit's bill (T3, design-mockups/tech-bill-plain README «Для Фулстека»,
// shots d0, d1, d3, d7): Get signature · Get paid · Send the bill, in any order, before Finish
// too. The first of them makes the bill final (POST …/bill/issue — the word «issue» is not on the
// screen); until then the lines change by «Change» on the bill's row. Without React Native
// (three.test.mjs runs it on node).
//
// The order and the modes come with the visit (visit.steps, VS-BE2: [{ key, mode }], mode required
// | optional | off): signs → Get signature, collect → Get paid, give → Send the bill — always the
// company's order (the Architect, QUEUE «SO»; the server's default becomes issue → give → signs →
// collect). Give required stands last: the signature's and the payment's screens give the copy
// first (d2-ny, d5). Signs or collect off — no button; give off — Send the bill stays, calm. No
// steps (an older server) — signature, payment, sending, all optional.
// Issue off (the office makes the bill final): the three are not there until the office has
// issued it, then only Get paid, plain (the Architect, QUEUE «T3-СЕРВЕР» п. 4).
//
// threeOf(ctx) → null (nothing of the bill here: a helper, an old task, no money permission,
// cancelled, closed without work) |
//   { kind: 'nobill', title, line } — closed with no bill on this visit (a recall, Deposit taken) |
//   { kind: 'three', row, buttons, lit, allDone, empty }
//     row: the bill's row { title, line, change } (change: «Change» opens the lines) or null;
//     buttons: [{ key: 'sign' | 'pay' | 'send', title, line, state: 'todo' | 'done' | 'part' |
//                 'wait' | 'unknown', lit, icon, required, label (VoiceOver) }] in the company's order;
//     lit: the key of the orange one — after Finish litOf(), before Finish none (the orange
//          button then is On my way / Finish);
//     allDone: every button there is done (the visit's foot offers the next visit);
//     empty: a draft with nothing to charge for — every press opens «Change».
//
// ctx: { visit, known (bill/model knownOf, or { status: 'loading' | 'unknown' }), ack ({ status:
//   'loading' | 'unknown' | 'ok', signed, name, at, parts } — GET …/acknowledgment, or a signature
//   still on this phone: { status: 'ok', signed: true, pending: true }), money (takes_payments),
//   deposits (the job's open deposits in cents, for Deposit taken), now ({ date, minutes }) }
import { canBill, usd } from './model.js';
import { clock, closedMoment, momentWall, stateOf } from '../myDay/model.js';
import { dueOf } from '../pay/model.js';
import { SKIPS, canSkip, skippedLabel, skippedLine, skippedOf } from '../steps/skip.js';

export const THREE_KEYS = { sign: 'signs', pay: 'collect', send: 'give' };
const DEFAULT_ORDER = ['sign', 'pay', 'send'];
const PAID = ['paid', 'overpaid', 'no_charge'];
const ICONS = { sign: 'pen', pay: 'money', send: 'mail' };

// The three in the company's order with their modes: [{ key, mode }]; issue: its mode
export function orderOf(visit) {
  const steps = visit && Array.isArray(visit.steps) ? visit.steps : null;
  if (!steps) return { list: DEFAULT_ORDER.map((key) => ({ key, mode: 'optional' })), issue: 'optional' };
  const modeOf = (k) => { const s = steps.find((x) => x && x.key === k); return s && s.mode ? s.mode : 'optional'; };
  const at = (key) => {
    const i = steps.findIndex((x) => x && x.key === THREE_KEYS[key]);
    // give required last, whatever its place (its copy goes with the signature or the payment)
    if (key === 'send' && modeOf('give') === 'required') return 1000;
    return i < 0 ? 100 + DEFAULT_ORDER.indexOf(key) : i;
  };
  const list = DEFAULT_ORDER.map((key) => ({ key, mode: modeOf(THREE_KEYS[key]) }))
    .filter((s) => s.key === 'send' || s.mode !== 'off')
    .sort((a, b) => at(a.key) - at(b.key));
  return { list, issue: modeOf('issue') };
}

// The orange one: the first not done in the order. Send the bill: never when give is off; when
// give is required only once the signature is done or not there (until then the signature's or the
// payment's screen gives the copy) — the Architect, «SO»
// A skipped step counts as finished here (VS-APP, design app-skip): not lit, «all done» with it
const finished = (b) => b.state === 'done' || b.state === 'skipped';
function litOf(buttons) {
  const sign = buttons.find((b) => b.key === 'sign');
  const signOpen = !!sign && !finished(sign);
  return buttons.find((b) => {
    if (finished(b)) return false;
    if (b.key !== 'send') return true;
    if (b.mode === 'off') return false;
    return !(b.mode === 'required' && signOpen);
  }) || null;
}

const whenOf = (value, now) => {
  const at = momentWall(value);
  if (!at) return '';
  return now && at.date !== now.date ? '' : clock(at.minutes);
};
const linesOf = (bill) => (bill && Array.isArray(bill.lines) ? bill.lines : []);
const KIND = { diagnostics: 'Diagnostics', repair: 'Repair', installation: 'Installation', recall: 'Recall' };

// The draft's lines in a few words: 'Diagnostics $125.00 + tax', 'Labor $180.00 + 2 more + tax'
export function linesLine(bill) {
  const lines = linesOf(bill);
  if (!lines.length) return 'Nothing to charge for yet';
  const first = lines[0];
  const amount = Number.isFinite(first.amount_cents) ? ` ${usd(first.amount_cents)}` : '';
  const more = lines.length > 1 ? ` + ${lines.length - 1} more` : '';
  const tax = Number(bill.tax_cents) > 0 ? ' + tax' : '';
  return `${first.name || 'Line'}${amount}${more}${tax}`;
}

// The bill's row over the three (d0, d1, d3, d7)
export function billRow(known, { issueOff = false } = {}) {
  const status = known ? known.status : 'loading';
  const bill = known ? known.bill : null;
  if (status === 'loading') return { title: 'Bill', line: 'Loading…', change: false };
  if (status === 'unknown') return { title: 'Bill', line: 'Needs connection', change: false };
  if (status === 'issued' && bill) {
    const label = bill.label || `#${bill.bill_number}`;
    if (PAID.includes(bill.payment_status)) return { title: `Bill ${label} · Paid`, line: `${usd(bill.total_cents)} · final`, change: false };
    return { title: `Bill ${label} · ${usd(bill.total_cents)}`, line: 'Final · the office can correct it', change: false };
  }
  if (issueOff) return { title: 'Bill', line: 'The office makes it final', change: false };
  if (status === 'draft' && bill) return { title: `Bill · ${usd(bill.total_cents)}`, line: linesLine(bill), change: true };
  return { title: 'Bill', line: 'Nothing to charge for yet', change: true };
}

function signButton(ack, issued, now) {
  if (ack && ack.status === 'ok' && ack.signed) {
    const at = ack.at ? whenOf(ack.at, now) : '';
    const parts = ack.parts === 'returned' ? ' · parts returned' : ack.parts === 'waived' ? ' · parts given up' : '';
    if (ack.pending) return { state: 'done', title: at ? `Signed ${at}` : 'Signed', line: 'Waiting for signal — it sends by itself', warn: true };
    return { state: 'done', title: at ? `Signed ${at}` : 'Signed', line: `${ack.name || ''}${parts}` || null };
  }
  if (issued && ack && ack.status === 'unknown') return { state: 'unknown', title: 'Get signature', line: 'Needs connection' };
  return { state: 'todo', title: 'Get signature', line: null };
}

function payButton(bill, issued, empty) {
  if (empty) return { state: 'wait', title: 'Get paid', line: 'Add the work first' };
  if (!bill) return { state: 'todo', title: 'Get paid', line: null };
  if (!issued) return { state: 'todo', title: 'Get paid', line: Number.isFinite(bill.total_cents) ? usd(bill.total_cents) : null };
  if (PAID.includes(bill.payment_status)) {
    const paid = (Array.isArray(bill.payments) ? bill.payments : []).filter((p) => p && p.kind === 'payment' && !p.voided_at);
    const last = paid[paid.length - 1];
    if (bill.payment_status === 'no_charge') return { state: 'done', title: 'Nothing to pay', line: null };
    const sum = paid.reduce((s, p) => s + (Number(p.amount_cents) || 0), 0);
    const method = last && last.method ? ` ${last.method}` : '';
    const at = last ? momentWall(last.received_at) : null;
    const where = last && ['cash', 'check'].includes(last.method) ? 'with you, turn it in' : 'with the office';
    return { state: 'done', title: `Paid ${usd(sum || bill.total_cents)}${paid.length === 1 ? method : ''}`, line: [at ? clock(at.minutes) : null, where].filter(Boolean).join(' · ') };
  }
  if (bill.payment_status === 'partly_paid') {
    const paidSum = (Array.isArray(bill.payments) ? bill.payments : []).filter((p) => p && p.kind === 'payment' && !p.voided_at)
      .reduce((s, p) => s + (Number(p.amount_cents) || 0), 0);
    return { state: 'part', title: `Paid ${usd(paidSum)}`, line: `${usd(dueOf(bill))} left` };
  }
  return { state: 'todo', title: 'Get paid', line: usd(dueOf(bill)) };
}

function sendButton(issued, giveRequired, now) {
  if (issued && issued.delivered_at) {
    const at = whenOf(issued.delivered_at, now);
    if (issued.delivered_via === 'email' && issued.delivered_to) return { state: 'done', title: `Sent to ${issued.delivered_to}`, line: [at, 'PDF'].filter(Boolean).join(' · ') };
    if (issued.delivered_via === 'handed') return { state: 'done', title: 'Printed copy handed', line: at || null };
    return { state: 'done', title: 'Shared as PDF', line: at || null };
  }
  return { state: 'todo', title: 'Send the bill', line: giveRequired ? 'Email, share or print' : 'Email, share, print or show' };
}

const LABELS = {
  sign: (b) => (b.state === 'done' ? `${b.title}${b.line ? ` by ${b.line}` : ''}. Done. Opens the signature` : 'Get signature'),
  pay: (b) => (b.state === 'done' ? `${b.title}${b.line ? ` at ${b.line}` : ''}. Done` : `${b.title}${b.line ? `, ${b.line}` : ''}`),
  send: (b) => (b.state === 'done' ? `${b.title}${b.line ? `, ${b.line}` : ''}. Done` : 'Send the bill, by email, share or print'),
};

export function threeOf(ctx) {
  if (!ctx || !ctx.visit || !ctx.money || !canBill(ctx.visit)) return null;
  const { visit, known, ack, now } = ctx;
  const closed = stateOf(visit) === 'closed';
  // no bill on this visit: a recall (always free) — nothing before Finish, a green line after;
  // closed as Deposit taken — the green line with the job's deposit. Only while no bill is issued:
  // a bill the office issued there (the Architect on #96) has the three as usual — the money can
  // be taken, as the Pay tile on main lets it
  const kind = visit.visit_kind;
  const issuedHere = !!known && known.status === 'issued' && !!known.bill;
  if (!issuedHere && (kind === 'recall' || (closed && visit.outcome === 'deposit'))) {
    if (!closed) return null;
    const deposit = visit.outcome === 'deposit' && Number(ctx.deposits) > 0 ? `Deposit ${usd(ctx.deposits)} on the job` : null;
    // the time in the line itself (the Designer on #98): the bar's own «Finished at …» box is gone then
    const at = closedMoment(visit);
    return { kind: 'nobill', title: `Finished${at ? ` ${clock(at.minutes)}` : ''} · no bill`, line: deposit };
  }
  const { list, issue } = orderOf(visit);
  const issueOff = issue === 'off';
  const bill = known && known.bill ? known.bill : null;
  const issued = bill && known.status === 'issued' ? bill : null;
  const row = billRow(known, { issueOff });
  // Issue off: nothing before the office makes the bill final; then Get paid alone, plain
  const shown = issueOff ? (issued ? list.filter((s) => s.key === 'pay') : []) : list;
  // nothing to charge for: no bill yet (none), or a draft without lines
  const empty = !issued && !!known && (known.status === 'none' || (!!bill && bill.status === 'draft' && linesOf(bill).length === 0));
  const give = list.find((s) => s.key === 'send');
  const buttons = shown.map((s) => {
    const b = s.key === 'sign' ? signButton(ack, issued, now)
      : s.key === 'pay' ? payButton(bill, issued, empty)
        : sendButton(issued, !!give && give.mode === 'required', now);
    // skipped (visit.steps[].skipped) and not done since: grey, still opens its action — done wins
    const skipped = b.state !== 'done' && b.state !== 'part' ? skippedOf(visit, THREE_KEYS[s.key]) : null;
    const shownAs = skipped ? { state: 'skipped', title: SKIPS[THREE_KEYS[s.key]].skipped, line: skippedLine(skipped), skipped } : b;
    return { key: s.key, icon: skipped ? 'skipc' : ICONS[s.key], mode: s.mode, required: s.mode === 'required', lit: false, ...shownAs };
  });
  const open = (b) => !finished(b);
  // nothing to charge for yet (an empty bill): the three are calm, none lit — so no Skip under one
  // either; «Change» on the bill's row is what to do (the Designer on #102)
  const litOne = closed && !issueOff && !empty ? litOf(buttons) : null;
  if (litOne) litOne.lit = true;
  for (const b of buttons) b.label = b.state === 'skipped' ? skippedLabel(THREE_KEYS[b.key], b.skipped) : LABELS[b.key](b);
  // the quiet link under the orange one, when its step may be skipped (only one on the screen)
  const skipKey = litOne ? THREE_KEYS[litOne.key] : null;
  return {
    kind: 'three',
    row,
    buttons,
    lit: litOne ? litOne.key : null,
    skip: skipKey && canSkip(visit, skipKey) ? { key: skipKey, words: SKIPS[skipKey].link } : null,
    // done: every one there — Send the bill with give off is a service, not a step
    allDone: buttons.length > 0 && buttons.every((b) => !open(b) || (b.key === 'send' && b.mode === 'off')),
    empty,
    issueOff,
    kindWord: KIND[kind] || 'Visit',
  };
}

// What a press does first (VisitScreen): 'change' — the lines (an empty draft, no bill yet);
// 'issue' — make the bill final, then open the button's screen; 'open' — the screen straight away
export function pressOf(three, key, known) {
  if (!three || three.kind !== 'three') return null;
  const button = three.buttons.find((b) => b.key === key);
  if (!button) return null;
  if (button.state === 'done') return 'open';
  const status = known ? known.status : 'loading';
  if (three.empty || status === 'none') return 'change';
  if (status === 'draft') return 'issue';
  return 'open';
}

// The words under the three when a press did not go through (README «Тексты всех состояний»):
// failed: bill/model billError() of the issue; offline — its own words
export function issueFailText(failed) {
  if (!failed) return null;
  if (failed.kind === 'offline') return 'No signal: the bill can’t be made final now. Try again when you have signal.';
  return `The bill can’t be made final: ${String(failed.text || '').replace(/[.\s]*$/, '')}.`;
}
// Busy words on the pressed button
export const BUSY_WORDS = { sign: 'Saving…', pay: 'Recording…', send: 'Sending…' };
