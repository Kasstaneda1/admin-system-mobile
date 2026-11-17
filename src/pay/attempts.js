// A record of money on a bill that may have gone through without an answer (PR 14б-2, the
// Architect's rules on mobile #49). Without React Native: attempts.test.mjs runs it on node.
//
// The danger: the request reached the server, its answer was lost (no connection, a timeout, a
// 5xx). If the technician then changes the method, the amount or who gets the tip and presses
// again, the app makes new client_request_ids and the server records the money a second time.
// So:
//   - an attempt keeps its lines (each body with its own client_request_id) from the first send;
//     while it lives the screen shows them and does not let them change — after the first line
//     the server took, and after a send without an answer, until the app has looked again;
//   - after a send without an answer the next press first reads the bill again: the technician's
//     own records that were not there when the attempt began and that no answer named are the
//     lines that went through. As many as the lines still unanswered — «Already recorded», back
//     to Pay. Fewer — the unanswered lines go again with the same ids: the server answers each
//     once, so one that did go is not written twice;
//   - a clear refusal (400, 403, 409) before any line was taken lets the screen change the lines;
//   - attempts live in memory by bill, not in the screen: Back on Card and Next again, or Back to
//     the method screen, find the same lines. Pay forgets the bill's attempts once it has read
//     the bill again (its history and balance show what went through);
//   - nothing is kept across a restart of the app: Pay reads the bill when it opens.
import { payError } from './model.js';

const attempts = new Map(); // `${billId}:${flow}` → attempt
const keyOf = (billId, flow) => `${billId}:${flow}`;

// The ids of the technician's own records on the bill (voided ones too: they are not new)
export const mineIds = (bill) => (bill && Array.isArray(bill.payments) ? bill.payments.filter((p) => p.mine).map((p) => p.id) : []);

// The attempt of one flow on a bill ('method': a payment of the method screen, 'card': the card
// payment with its tip lines, 'tip': a tip after the bill is paid), or null
export const attemptOf = (billId, flow) => attempts.get(keyOf(billId, flow)) || null;

// A new attempt: lines [{ rid, body }], view — what the screen showed for them (to show them
// again); baseline — the technician's records on the bill when it began
export function startAttempt(billId, flow, { bill, lines, view }) {
  const attempt = { billId, flow, baseline: mineIds(bill), lines, view, answered: {}, uncertain: false };
  attempts.set(keyOf(billId, flow), attempt);
  return attempt;
}

export function dropAttempt(attempt) {
  if (attempt && attempts.get(keyOf(attempt.billId, attempt.flow)) === attempt) attempts.delete(keyOf(attempt.billId, attempt.flow));
}

// Pay read the bill again: what went through is in its history now
export function forgetBill(billId) {
  for (const key of [...attempts.keys()]) if (key.startsWith(`${billId}:`)) attempts.delete(key);
}

export const answeredCount = (attempt) => (attempt ? Object.keys(attempt.answered).length : 0);
const unanswered = (attempt) => attempt.lines.filter((line) => !(line.rid in attempt.answered));
// The screen may not change the lines
export const linesLocked = (attempt) => !!attempt && (attempt.uncertain || answeredCount(attempt) > 0);

// No answer from the server: the request may have gone through
export const noAnswer = (failure) => failure.kind === 'offline' || failure.kind === 'failed';

// The technician's records that came since the attempt began and that no answer named
export function newRecords(bill, attempt) {
  const known = new Set([...attempt.baseline, ...Object.values(attempt.answered)]);
  return (bill && Array.isArray(bill.payments) ? bill.payments : []).filter((p) => p.mine && !p.voided_at && !known.has(p.id));
}

// Sends the attempt's unanswered lines in order. record(body) → the server's answer
// ({ payment, bill }); readBill() → the bill. Returns
//   { done: true, data }            — every line is recorded (data: the last answer);
//   { already: [payments], bill }   — after no answer, the lines were found on the bill;
//   { failed }                      — payError of what stopped it; the attempt says what now:
//                                     uncertain (look first on the next press) or, a clear
//                                     refusal with nothing taken, dropped (the lines may change).
export async function runAttempt(attempt, { record, readBill }) {
  if (attempt.uncertain) {
    let bill;
    try {
      bill = await readBill();
    } catch (error) {
      return { failed: payError(error), error };
    }
    const found = newRecords(bill, attempt);
    const left = unanswered(attempt);
    if (left.length > 0 && found.length >= left.length) {
      dropAttempt(attempt);
      return { already: found, bill };
    }
    attempt.uncertain = false;
  }
  let data = null;
  for (const line of unanswered(attempt)) {
    try {
      data = await record(line.body);
    } catch (error) {
      const failed = payError(error);
      if (noAnswer(failed)) attempt.uncertain = true;
      else if (answeredCount(attempt) === 0) dropAttempt(attempt);
      return { failed, error };
    }
    attempt.answered[line.rid] = data && data.payment ? data.payment.id : null;
  }
  dropAttempt(attempt);
  return { done: true, data };
}

// The words under the button for a send without an answer
export const LOOK_AGAIN = 'Press again: the app first checks what is already recorded.';
