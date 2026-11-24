// The technician's four permissions in the app (the Architect's contract «ЧЕТЫРЕ ПРАВА ТЕХНИКА»,
// handoff/QUEUE.md; server be#257). The office switches them per technician; the app hides the
// buttons by the flags, the server still refuses with 403 (payments_off, bill_lines_off,
// no_tax_permission) — the words below answer those too.
//   takes_payments         — Approve, Pay, Issue, the PDF and its delivery, deposits, card, QR,
//                            tips, every amount; without it the bill shows its lines, no money;
//   sees_customer_contacts — the customer's phone and e-mail: without it no Call to the
//                            customer, the office's phone instead;
//   edits_bill_lines       — Add line, change, remove, the price book; without it the lines read only;
//   changes_bill_tax       — the Taxable switch and the rate (src/bill/tax.js, can_change_tax).
// Where a flag comes from: the answer that is on the screen says it as it is at that moment
// (a visit contacts_hidden; a bill can_take_payments, can_edit_lines, prices_visible); GET
// /api/me gives the four for what has no such answer (the fee on the visit card, a visit before
// its bill is read). An older server says none of them: everything on, as before.

export const PAYMENTS_OFF_LINE = 'Payments and prices are the office’s for you.';
export const CONTACTS_HIDDEN_LINE = 'Customer contacts are hidden. Call the office.';
export const LINES_OFF_LINE = 'Bill lines are set by the office.';

export const PERMISSION_FLAGS = ['takes_payments', 'sees_customer_contacts', 'edits_bill_lines', 'changes_bill_tax'];

// The four of GET /api/me as the profile keeps them: only booleans; one missing or not a boolean
// — on (no row of permissions on the server means all on). Not an object — null (an older
// server, or not a technician): the screens then go by the answers alone.
export function permissionsOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(PERMISSION_FLAGS.map((flag) => [flag, value[flag] !== false]));
}

const flagOf = (user, flag) => {
  const p = user && user.permissions ? permissionsOf(user.permissions) : null;
  return p ? p[flag] : true;
};

// Money: the bill's own flags win (can_take_payments, then prices_visible — the server took the
// prices out), else the profile's takes_payments.
export function takesPayments(user, bill = null) {
  if (bill && typeof bill.can_take_payments === 'boolean') return bill.can_take_payments;
  if (bill && bill.prices_visible === false) return false;
  return flagOf(user, 'takes_payments');
}

// The amounts of a bill: shown only when the server gave them (prices_visible false: null in
// their place, and null is no line — never «$0.00»).
export const pricesShown = (bill) => !(bill && bill.prices_visible === false);

// The customer's contacts: the visit's or the bill's own contacts_hidden wins, else the profile.
export function contactsHidden(user, ...answers) {
  for (const a of answers) {
    if (a && typeof a.contacts_hidden === 'boolean') return a.contacts_hidden;
  }
  return !flagOf(user, 'sees_customer_contacts');
}

// The lines of a bill: the server's can_edit_lines (the permission and a draft) wins; an older
// server — a draft, as before.
export function editsLines(user, bill) {
  if (!bill) return false;
  if (typeof bill.can_edit_lines === 'boolean') return bill.can_edit_lines;
  return bill.status === 'draft' && flagOf(user, 'edits_bill_lines');
}

// The server's refusals of the permissions, in the app's words; null for any other code
export function permissionRefusal(code) {
  switch (code) {
    case 'bill_lines_off': return LINES_OFF_LINE;
    case 'payments_off': return 'Payments are turned off for you. Ask the office.';
    default: return null;
  }
}

// What the visit card shows by the permissions (VisitScreen): money tiles (Approve, Pay,
// Deposit) and the Fee tile only with payments; the customer's Call, or the office's with the
// line about hidden contacts. bill: the visit's bill as last read (or null).
export function visitView(user, visit, bill = null) {
  const payments = takesPayments(user, bill);
  const hidden = contactsHidden(user, visit);
  return {
    money: payments,
    call: hidden ? 'office' : 'customer',
    contactsLine: hidden ? CONTACTS_HIDDEN_LINE : null,
    paymentsLine: payments ? null : PAYMENTS_OFF_LINE,
  };
}

// What the bill screen offers by the permissions (BillScreen): the lines' editing (Add, Price
// book, a tap on a line), the money (the totals and the foot come from bill/model: none without
// prices) and giving the bill (Preview, PDF, delivery, what stops the issue).
export function billView(user, bill) {
  const payments = takesPayments(user, bill);
  const edit = editsLines(user, bill);
  return {
    edit,
    give: payments,
    linesLine: bill && bill.status === 'draft' && !edit ? LINES_OFF_LINE : null,
    paymentsLine: payments ? null : PAYMENTS_OFF_LINE,
  };
}
