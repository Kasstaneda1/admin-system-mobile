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
//              «all done», not the amber one).
//
// What a company has is worked out today from what the app already knows: a recall has no
// Approve; «Bill before payment» off — no Give before Pay; a bill without parts — no signature
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
import { billFirst, canBill, usd } from '../bill/model.js';
import { billHasParts } from '../ack/model.js';
import { clock, stateOf } from './model.js';
import { dueOf } from '../pay/model.js';

const closed = (ctx) => stateOf(ctx.visit) === 'closed';
const finishAllowed = (ctx) => Array.isArray(ctx.visit.actions) && ctx.visit.actions.includes('finish');
const billOf = (ctx) => (ctx.known && ctx.known.bill ? ctx.known.bill : null);
const issuedOf = (ctx) => {
  const bill = billOf(ctx);
  return ctx.known && ctx.known.status === 'issued' && bill ? bill : null;
};
const billUnknown = (ctx) => !ctx.known || ctx.known.status === 'loading' || ctx.known.status === 'unknown';
const PAID = ['paid', 'overpaid', 'no_charge'];

export const VISIT_STEPS = [
  {
    key: 'approve',
    label: 'Approve',
    required: false,
    on: (ctx) => !!ctx.approve && ctx.visit.visit_kind !== 'recall',
    state: (ctx) => (['signed', 'pending'].includes(ctx.approve.kind) ? 'done' : ['unknown', 'loading'].includes(ctx.approve.kind) ? 'unknown' : 'todo'),
    // the signature before the work goes with today's open visit, as Finish
    can: (ctx) => finishAllowed(ctx),
    button: () => ({ label: 'Approve the repair', icon: 'doc' }),
  },
  {
    key: 'finish',
    label: null,
    required: true,
    server: true,
    on: () => true,
    state: (ctx) => (closed(ctx) ? 'done' : 'todo'),
    can: (ctx) => finishAllowed(ctx),
    button: () => ({ label: 'Finish', icon: 'check' }),
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
//   main: { key, label, icon, tone?, server } | null — the big button: the first step after the last one done;
//         null when the server does not allow it now (an open visit of another day);
//   second: { key, label, icon, tone?, server } | null — the step after it, when the main one may be passed }
export function stepsOf(ctx, steps = VISIT_STEPS) {
  if (!ctx || !ctx.visit || !ctx.money || !canBill(ctx.visit)) return null;
  const list = steps.filter((s) => s.on(ctx)).map((s) => ({ step: s, state: s.state(ctx) }));
  let last = -1;
  list.forEach((s, i) => { if (s.state === 'done') last = i; });
  const at = Math.min(last + 1, list.length - 1);
  const current = list[at];
  const buttonOf = (s) => (!s.step.can || s.step.can(ctx) ? { key: s.step.key, server: !!s.step.server, ...s.step.button(ctx, s.state) } : null);
  const main = buttonOf(current);
  const after = !current.step.required && list[at + 1] ? list[at + 1] : null;
  const second = main && after ? buttonOf(after) : null;
  const strip = [];
  list.forEach((s, i) => {
    if (!s.step.label) return;
    strip.push({ key: s.step.key, label: s.step.label, n: strip.length + 1, mark: s.state === 'done' ? 'done' : i === at ? 'now' : 'todo' });
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
