// The steps of a visit, in order (usability п. 1, design design-mockups/tech-app/shots/
// usab-u1-next-step.png), without React Native (steps.test.mjs runs it on node).
//
// THE ONE PLACE of the steps: their order and what each one is. The big button at the bottom of
// the visit, the second button beside it and the strip of steps over the tiles read only
// stepsOf() below; the screen has no ifs of its own about what comes next.
//
// A step:
//   key      — what the screen opens for it (VisitScreen stepPress): approve, finish, bill, give,
//              pay, signs, next;
//   label    — its word in the strip; null — not in the strip (Finish shows on the visit's tag,
//              Next is not a step of this visit);
//   required — false: the technician may go past it while it is not done, so the step after it
//              shows too, as the second button (Approve: Finish stays possible without the
//              signature — the server puts «no signature» into the office's Needs action; the
//              signature for the parts: the customer may not want to);
//   on(ctx)  — the step is there for this visit and this company;
//   state(ctx) — 'done' | 'todo' | 'unknown' (not known yet: loading, no connection);
//   can(ctx) — its button may be pressed now (the server allows it); absent — always;
//   server   — its press goes to the server (waits for the connection, a spinner on it); else it
//              opens a screen, which says itself what works without the connection;
//   button(ctx, state) — { label, icon, tone? } of its button (tone 'brand': the dark button of
//              «all done», not the amber one);
//   blocks(ctx) — the step is back to do and nothing after it can go now: the big button is its
//              (Approve while the bill draft is over the customer's approval — the issue refuses it,
//              bill/model overApproval, usability п. 6; the Designer on #87).
//
// What a company has is worked out today from what the app already knows: a recall and a
// diagnostics visit have no Approve step (at diagnostics nothing is found yet: the Approve tile stays,
// the technician opens it if they repair on the spot — Дизайнер, #84); «Bill before payment» off — no Give before Pay; a bill without parts — no signature
// for them. A company's own settings of the steps (on or off, the order, required or not) will
// replace on, required and the order of this list — here and nowhere else.
//
// ctx (VisitScreen):
//   visit    — the visit as shown;
//   approve  — approve/model approveTile() or null (nobody signs here, or no money permission);
//   known    — the bill as the visit knows it (bill/model knownOf): { status, bill } or null;
//   ack      — the signature after the work: { status: 'loading' | 'ok' | 'unknown', signed } or null;
//   money    — this technician takes the money (src/perms visitView money);
//   next     — the next visit of the day (nextOfDay) or null.
import { billFirst, canBill, overApproval, usd } from '../bill/model.js';
import { billHasParts } from '../ack/model.js';
import { NO_APPROVE_KINDS } from '../approve/model.js';
import { clock, finishLabel, stateOf } from './model.js';
import { dueOf } from '../pay/model.js';

const closed = (ctx) => stateOf(ctx.visit) === 'closed';
const finishAllowed = (ctx) => Array.isArray(ctx.visit.actions) && ctx.visit.actions.includes('finish');
const billOf = (ctx) => (ctx.known && ctx.known.bill ? ctx.known.bill : null);
const issuedOf = (ctx) => {
  const bill = billOf(ctx);
  return ctx.known && ctx.known.status === 'issued' && bill ? bill : null;
};
// the draft is over the customer's approval by the rule of the place (the server's needs_new)
const overBill = (ctx) => !!(ctx.known && ctx.known.status === 'draft' && overApproval(ctx.known.bill));
const billUnknown = (ctx) => !ctx.known || ctx.known.status === 'loading' || ctx.known.status === 'unknown';
const PAID = ['paid', 'overpaid', 'no_charge'];

export const VISIT_STEPS = [
  {
    key: 'approve',
    label: 'Approve',
    required: false,
    on: (ctx) => !!ctx.approve && !NO_APPROVE_KINDS.includes(ctx.visit.visit_kind),
    // signed, but the bill grew over it: to do again (a signature still on the phone covers it)
    state: (ctx) => (ctx.approve.kind === 'pending' ? 'done'
      : overBill(ctx) ? 'todo'
        : ctx.approve.kind === 'signed' ? 'done' : ['unknown', 'loading'].includes(ctx.approve.kind) ? 'unknown' : 'todo'),
    blocks: (ctx) => ctx.approve.kind !== 'pending' && overBill(ctx),
    // the signature before the work goes with today's open visit, as Finish; a new one over a grown
    // bill also after it (the server takes it, marked late)
    can: (ctx) => finishAllowed(ctx) || overBill(ctx),
    // «Customer approves» beside the lit Finish, plain (design-mockups/tech-bill-plain d0)
    button: (ctx) => (overBill(ctx) ? { label: 'Approve again', icon: 'doc' } : { label: 'Customer approves', icon: 'doc' }),
  },
  {
    key: 'finish',
    label: null,
    required: true,
    server: true,
    on: () => true,
    state: (ctx) => (closed(ctx) ? 'done' : 'todo'),
    can: (ctx) => finishAllowed(ctx),
    button: (ctx) => ({ label: finishLabel(ctx.visit), icon: 'check' }),
  },
  {
    key: 'bill',
    label: 'Bill',
    required: true,
    on: () => true,
    state: (ctx) => (issuedOf(ctx) ? 'done' : billUnknown(ctx) ? 'unknown' : 'todo'),
    // not known yet: the bill opens as it is, and says itself what is next
    button: (ctx, state) => (state === 'unknown' ? { label: 'Open the bill', icon: 'doc' } : { label: 'Issue the bill', icon: 'doc' }),
  },
  {
    key: 'give',
    label: 'Given',
    required: true,
    // the company's «Bill before payment» (bill/model billFirst; not known yet — the stricter rule)
    on: (ctx) => billFirst(billOf(ctx)),
    state: (ctx) => {
      const issued = issuedOf(ctx);
      if (issued) return issued.delivered_at ? 'done' : 'todo';
      return billUnknown(ctx) ? 'unknown' : 'todo';
    },
    button: () => ({ label: 'Give the bill', icon: 'share' }),
  },
  {
    key: 'pay',
    label: 'Pay',
    required: true,
    on: () => true,
    state: (ctx) => {
      const issued = issuedOf(ctx);
      if (issued) return PAID.includes(issued.payment_status) ? 'done' : 'todo';
      return billUnknown(ctx) ? 'unknown' : 'todo';
    },
    button: (ctx) => {
      const issued = issuedOf(ctx);
      return { label: issued ? `Collect ${usd(dueOf(issued))}` : 'Collect the payment', icon: 'money' };
    },
  },
  {
    key: 'signs',
    label: 'Signs',
    required: false,
    // only when the bill has replaced parts (ack/model billHasParts)
    on: (ctx) => billHasParts(billOf(ctx)),
    state: (ctx) => (ctx.ack && ctx.ack.status === 'ok' ? (ctx.ack.signed ? 'done' : 'todo') : 'unknown'),
    // note: the set has no pen; the Designer's pen, if one is added (viewBox 24, the same stroke):
    // <path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>
    button: () => ({ label: 'Customer signs for parts', icon: 'note' }),
  },
  {
    key: 'next',
    label: null,
    required: true,
    on: () => true,
    state: () => 'todo',
    button: (ctx) => (ctx.next
      ? { label: `Next: ${ctx.next.client} · ${clock(ctx.next.start)}`, icon: 'nav', tone: 'brand' }
      : { label: 'Back to My day', icon: 'back', tone: 'brand' }),
  },
];

// The steps of this visit: null when it has none (a helper, an old task, a cancelled or moved
// visit, closed without work, or no money permission: then the bottom of the visit is as before).
// { strip: [{ key, label, n, mark: 'done' | 'now' | 'todo' }],
//   main: { key, label, icon, tone?, server } | null — the big button: the first step after the last one done
//         (before Finish: Finish, the step that may be passed before it is the second);
//         null when the server does not allow it now (an open visit of another day);
//   second: { key, label, icon, tone?, server } | null — the step after it, when the main one may be passed }
export function stepsOf(ctx, steps = VISIT_STEPS) {
  if (!ctx || !ctx.visit || !ctx.money || !canBill(ctx.visit)) return null;
  const list = steps.filter((s) => s.on(ctx)).map((s) => ({ step: s, state: s.state(ctx) }));
  let last = -1;
  list.forEach((s, i) => { if (s.state === 'done') last = i; });
  // a step back to do that holds the rest (blocks) is the one to do now; else the first after the last done
  const held = list.findIndex((s) => s.step.blocks && s.step.blocks(ctx));
  const at = held >= 0 ? held : Math.min(last + 1, list.length - 1);
  const current = list[at];
  const buttonOf = (s) => (!s.step.can || s.step.can(ctx) ? { key: s.step.key, server: !!s.step.server, ...s.step.button(ctx, s.state) } : null);
  let lit = current;
  let after = !current.step.required && list[at + 1] ? list[at + 1] : null;
  // before Finish the lit button is Finish: a step that may be passed before it (Approve) stands
  // beside it plain (design-mockups/tech-bill-plain d0), unless it holds the rest (Approve again)
  if (after && after.step.key === 'finish' && held !== at) [lit, after] = [after, current];
  const main = buttonOf(lit);
  const second = main && after ? buttonOf(after) : null;
  const strip = [];
  list.forEach((s, i) => {
    if (!s.step.label) return;
    strip.push({ key: s.step.key, label: s.step.label, n: strip.length + 1, mark: s.state === 'done' ? 'done' : s === lit ? 'now' : 'todo' });
  });
  return { strip, main, second };
}

// VoiceOver: 'Steps: Approve, done. Bill, done. Given, next. Pay. Signs.'
export function stripLabel(strip) {
  return `Steps: ${strip.map((s) => `${s.label}${s.mark === 'done' ? ', done' : s.mark === 'now' ? ', next' : ''}`).join('. ')}.`;
}

// The visit to go to after this one, from the day the phone keeps (myDay/model buildDay):
// the one on the way or on site, else the next planned one; only on today's day, never this
// visit itself. { id, n, client, start, visit } or null
export function nextOfDay(day, id) {
  if (!day || !day.isToday) return null;
  const rows = Array.isArray(day.live) ? day.live : [];
  const others = rows.filter((r) => r.id !== id);
  const row = others.find((r) => r.state === 'onway' || r.state === 'onsite') || others.find((r) => r.state === 'sched') || null;
  return row ? { id: row.id, n: row.n, client: row.client, start: row.start, visit: row.visit } : null;
}

// «Next: Nguyen T. · 11:30» (or «Back to My day») as the big button of a visit whose three bill
// buttons are all done (T3, design-mockups/tech-bill-plain d7): the step «next» of the list above
export function nextButtonOf(next) {
  const step = VISIT_STEPS.find((s) => s.key === 'next');
  return { key: 'next', server: false, ...step.button({ next }) };
}

// «What to do now» under the visit's data (README tech-bill-plain, the Designer after mobile #95):
// only for the main technician on the way or on site; before it and after Finish — none
const NOW_WORDS = {
  diagnostics: 'Find the problem, write the diagnosis, then tap Finish.',
  repair: 'Fix it, add parts to the bill, then tap Finish.',
  installation: 'Install and test the new unit, then tap Finish.',
  recall: 'Check the earlier work, then tap Finish.',
};
export function nowWordsOf(visit) {
  if (!visit || visit.legacy || visit.role === 'helper') return null;
  const state = stateOf(visit);
  if (state !== 'onway' && state !== 'onsite') return null;
  return NOW_WORDS[visit.visit_kind] || null;
}
