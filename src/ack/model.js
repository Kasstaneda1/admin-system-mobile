// The customer's signature «after the work» in the technician app (design-mockups/app-invoice
// ack): the customer got the Final Bill and signs that they did, and chooses about the replaced
// parts. Without React Native (model.test.mjs runs it on node). The server keeps it and checks it
// (backend routes/scheduler/billApproval.js recordAcknowledgment, billConsents.js myRouter):
// GET/POST /api/my/visits/:id/bill/acknowledgment, the copy …/bill/acknowledgment/pdf and /copies.
//
// The rules are the server's:
//   - only an issued bill that was delivered (409 not_issued / void / not_delivered); delivered —
//     only for a company with «Bill before payment» (bill_before_payment, BILLS_MV_DESIGN §3.2а);
//   - one signature per bill (409 already_signed; the same client_request_id again → 200, no
//     second one);
//   - replaced_parts is required: returned / waived (giving them up is only in writing, NYC
//     §2-259) / none; nothing is chosen until the customer chooses;
//   - the company's latest acknowledgment terms go by their version (409 when they changed).
import { billFirst, usd } from '../bill/model.js';
import { clock, momentWall } from '../myDay/model.js';
import { clockOff } from '../approve/model.js';

// ---------- the replaced parts ----------
// The title the technician reads and, under it, the customer's words exactly as the copy prints
// them (backend billCopies.js REPLACED_PARTS_TEXT); «none» has no words of its own
export const REPLACED_PARTS = [
  { choice: 'returned', title: 'Returned to the customer', words: 'The replaced parts were returned to me.' },
  { choice: 'waived', title: 'The customer gives them up', words: 'I give up the replaced parts and do not want them returned.' },
  { choice: 'none', title: 'No parts were replaced', words: null },
];
export const partsOf = (choice) => REPLACED_PARTS.find((p) => p.choice === choice) || null;
// Does the bill the customer signs for have parts (a line of kind 'part', a warranty one too)?
// The bill's PDF decides its parts wording by the same sign («Архитектор ПО», #46)
export const billHasParts = (bill) => !!bill && Array.isArray(bill.lines) && bill.lines.some((l) => l && l.kind === 'part');
// The choices the customer has, by the bill (NYC §2-259): parts on it — returned or given up;
// none — only «No parts were replaced». The customer cannot sign that nothing was replaced when
// the bill has parts.
export const partsChoicesOf = (bill) => (billHasParts(bill)
  ? REPLACED_PARTS.filter((p) => p.choice !== 'none')
  : REPLACED_PARTS.filter((p) => p.choice === 'none'));
// The line under «Replaced parts», by the rule the server names for the job (locationRule) and
// whether the bill has parts
export const partsNote = (rule, hasParts = true) => {
  if (!hasParts) return 'This bill has no parts: nothing was replaced.';
  return rule === 'nyc_20'
    ? 'The customer chooses. Giving them up is only in writing, after the bill (NYC).'
    : 'The customer chooses.';
};
// The choice the screen starts with: the bill without parts has one card, «No parts were
// replaced» — a fact of the bill, not a waiver, so it is chosen at once; with parts nothing is
// chosen until the customer chooses (giving them up is their written choice, §2-259) —
// «Архитектор ПО», #46
export function initialParts(bill) {
  const choices = partsChoicesOf(bill);
  return choices.length === 1 ? choices[0].choice : null;
}
// A tap on a choice: { parts, clear }. The customer signs under one choice: a different choice
// after the signature is drawn wipes it (and the request id with it), the customer signs again.
// The name is not part of it («Тимлид», «Архитектор ПО», #46)
export function pickParts(current, next, drawn) {
  if (next === current) return { parts: current, clear: false };
  return { parts: next, clear: !!drawn };
}

// ---------- may the customer sign now ----------
// By the visit's bill as GET /my/visits/:id/bill answers it:
//   'none' — no bill; 'draft' — not issued yet; 'void'; 'undelivered' — issued, not given to the
//   customer yet (only with «Bill before payment», bill/model.js billFirst); 'open' — the customer
//   can sign
export function ackStage(bill) {
  if (!bill) return 'none';
  if (bill.status === 'draft') return 'draft';
  if (bill.status === 'void') return 'void';
  if (bill.status !== 'issued') return 'none';
  return bill.delivered_at || !billFirst(bill) ? 'open' : 'undelivered';
}
// What the technician reads when the customer cannot sign yet (null when they can); `bill` — the
// visit's bill, for the company's «Bill before payment» (without it giving the bill is not asked)
export function stageText(stage, bill = null) {
  if ((stage === 'draft' || stage === 'none') && !billFirst(bill)) return 'Issue the bill first. Then the customer signs for it.';
  if (stage === 'draft' || stage === 'none') return 'Issue the bill and give it to the customer first. Then they sign that they got it.';
  if (stage === 'undelivered') return 'Give the bill to the customer first: share the PDF or hand a printed copy. Then they sign that they got it.';
  if (stage === 'void') return 'This bill is void. The customer does not sign for it.';
  return null;
}

// ---------- the bill the customer signs for ----------
// { label, total, delivered } for the top of the screen: 'Bill NY-1048 · delivered 12:42'
export function billHeadOf(bill, today) {
  if (!bill) return null;
  const label = bill.label || (bill.bill_number ? `#${bill.bill_number}` : '');
  const at = momentWall(bill.delivered_at);
  const when = at ? (today && at.date !== today ? `${shortDay(at.date)} · ${clock(at.minutes)}` : clock(at.minutes)) : '';
  return {
    label: `Bill ${label}`.trim(),
    total: usd(Number(bill.total_cents) || 0),
    delivered: when ? `Bill ${label} · delivered ${when}`.replace(/\s+/g, ' ') : null,
  };
}

// ---------- the company's terms ----------
// The line of the latest acknowledgment terms the customer can read before signing (null when the
// company has published none: then no terms_version_id goes with the signature)
export function ackTermsLine(terms) {
  if (!terms) return null;
  const title = (typeof terms.title === 'string' && terms.title.trim()) || 'Bill acknowledgment terms';
  return { title, sub: `Version ${terms.version} · the customer gets a copy` };
}

// ---------- the request ----------
// The body of POST …/bill/acknowledgment, or { error } in words before anything is sent
export function ackBody({ name, png, parts, terms, requestId, bill }) {
  const signer = String(name || '').trim();
  if (!signer) return { error: 'Type the customer’s name.' };
  if (!partsOf(parts)) return { error: 'Choose what happened to the replaced parts.' };
  if (bill !== undefined && !partsChoicesOf(bill).some((p) => p.choice === parts)) return { error: 'Choose what happened to the replaced parts.' };
  if (!png) return { error: 'The customer signs in the box first.' };
  const body = { signer_name: signer.slice(0, 200), signature_png: png, replaced_parts: parts, client_request_id: requestId };
  if (terms) body.terms_version_id = terms.id;
  // ACK-T: the issued PDF the customer was shown — the server refuses the signature for another
  // one (409 bill_changed: the office voided the bill or issued another while it waited)
  const sha = bill && bill.pdf && typeof bill.pdf.sha256 === 'string' ? bill.pdf.sha256 : null;
  if (sha) body.pdf_sha256 = sha;
  return { body };
}

// ---------- the signature there is ----------
// 'Signed 12:50 · parts returned', 'Signed Nov 6 · 12:50 · no parts replaced'
const PARTS_SHORT = { returned: 'parts returned', waived: 'parts given up', none: 'no parts replaced' };
export function signedLine(ack, today) {
  if (!ack) return '';
  const at = momentWall(ack.signed_at || ack.created_at);
  const when = at ? (today && at.date !== today ? `${shortDay(at.date)} · ${clock(at.minutes)}` : clock(at.minutes)) : '';
  const parts = PARTS_SHORT[ack.replaced_parts];
  return [when ? `Signed ${when}` : 'Signed', parts].filter(Boolean).join(' · ');
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDay(date) {
  const [, m, d] = String(date).split('-').map(Number);
  return m && d ? `${MONTHS[m - 1]} ${d}` : date;
}

// ---------- a failed request ----------
// { kind, text }:
//   offline — no answer (the signature waits on the phone, ack/queue.js); signed — the customer already signed for this bill (read it again);
//   stage — the bill is not ready for a signature (draft, void, not delivered);
//   resign — the company's terms changed: the customer reads them and signs again;
//   bill_changed — the PDF the customer saw is not the bill's any more (ACK-T); clock — the time of
//   the signature does not fit the bill (signed_at_out_of_bounds);
//   refused — the server's reason in words; gone — the visit is no longer this technician's or
//   has no bill; failed — the server broke.
// The time of the signature refused (400 signed_at_out_of_bounds): the clock first when it is
// known to be off (the answer's Date header, approve/model clockOff)
export const ACK_CLOCK_WORDS = 'The signing time doesn’t match this bill. Ask the customer to sign again.';
export const ACK_BILL_CHANGED = 'The bill changed after the customer signed. They sign again for the bill as it is now.';
export function ackError(error, nowMs = Date.now()) {
  const response = error && error.response;
  const status = response ? response.status : 0;
  const data = (response && response.data) || {};
  const said = typeof data.error === 'string' && data.error ? data.error : '';
  if (!status) return { kind: 'offline', text: 'No connection. The signature is kept on this phone and goes to the office by itself.' };
  if (status === 409 && data.code === 'already_signed') return { kind: 'signed', text: 'The customer already signed for this bill.' };
  if (status === 409 && data.code === 'not_issued') return { kind: 'stage', text: stageText('draft') };
  if (status === 409 && data.code === 'not_delivered') return { kind: 'stage', text: stageText('undelivered') };
  if (status === 409 && data.code === 'void') return { kind: 'stage', text: stageText('void') };
  if (status === 409 && data.code === 'bill_changed') return { kind: 'bill_changed', text: ACK_BILL_CHANGED };
  if (status === 400 && data.code === 'signed_at_out_of_bounds') {
    const off = clockOff(error, nowMs);
    return { kind: 'clock', clock: off, text: off === true ? `The phone’s clock is off: set the date and time to automatic. ${ACK_CLOCK_WORDS}` : ACK_CLOCK_WORDS };
  }
  if (status === 409 && data.code === 'terms_changed') return { kind: 'resign', text: 'The company’s terms changed — the customer reads them and signs again.' };
  if (status === 404) return { kind: 'gone', text: 'This visit was changed by the office' };
  if (status === 409 || status === 403 || status === 400) {
    return { kind: 'refused', text: said ? `${said.replace(/[.\s]*$/, '')}.` : 'The signature was not saved.' };
  }
  return { kind: 'failed', text: 'Something went wrong. Try again.' };
}

// The PDF file of the signature's copy: 'bill-receipt-77.pdf'
export const ackCopyName = (bill) => `bill-receipt-${String(bill && (bill.label || bill.id)).replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;
