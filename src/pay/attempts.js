// A record of money on a bill that may have gone through without an answer (PR 14б-2, the
// Architect's rules on mobile #49 and #50). Without React Native: attempts.test.mjs runs it on node.
//
// The danger: the request reached the server, its answer was lost (no connection, a timeout, a
// 5xx). If the technician then changes the method, the amount or who gets the tip and presses
// again, the app makes new client_request_ids and the server records the money a second time.
// So:
//   - an attempt keeps its lines (each body with its own client_request_id) from the first send;
//     after the first line the server took, and after a send without an answer, the screen shows
//     them and does not let them change;
//   - the next press sends the lines still unanswered again, with the same ids. The server looks
//     a client_request_id up before anything else (billPayments.js: before the balance) and
//     answers a repeat with the row it made the first time and created: false — so a line that
//     did go is never written twice, and one that did not is written now. Lines that all come back
//     created: false went through the first time: «Already recorded», back to Pay. Nothing is
//     counted on the bill, so another phone's record can never be taken for this one;
//   - a clear refusal (400, 403, 409) before any line was taken lets the screen change the lines;
//   - attempts live in memory by bill, not in the screen: Back on Card and Next again, or Back to
//     the method screen, find the same lines. Pay forgets the bill's attempts once it has read
//     the bill again (its history and balance show what went through);
//   - nothing is kept across a restart of the app: Pay reads the bill when it opens.
import { payError } from './model.js';

const attempts = new Map(); // `${billId}:${flow}` → attempt
const keyOf = (billId, flow) => `${billId}:${flow}`;

// The attempt of one flow on a bill ('method': a payment of the method screen, 'card': the card
// payment with its tip lines, 'tip': a tip after the bill is paid), or null
export const attemptOf = (billId, flow) => attempts.get(keyOf(billId, flow)) || null;

// A new attempt: lines [{ rid, body }], view — what the screen showed for them (to show them again)
export function startAttempt(billId, flow, { lines, view }) {
  const attempt = { billId, flow, lines, view, answered: {}, uncertain: false };
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

// Sends the attempt's unanswered lines in order. record(body) → the server's answer
// ({ payment, bill, created }). Returns
//   { done: true, data }            — every line is recorded now (data: the last answer);
//   { already: [payments], bill }   — every line of the attempt came back created: false: it had
//                                     gone through before, the answer was lost;
//   { failed }                      — payError of what stopped it; the attempt says what now:
//                                     uncertain (the next press sends the same lines) or, a clear
//                                     refusal with nothing taken, dropped (the lines may change).
export async function runAttempt(attempt, { record }) {
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
    attempt.answered[line.rid] = { payment: data && data.payment ? data.payment : null, created: !(data && data.created === false) };
  }
  dropAttempt(attempt);
  const answers = attempt.lines.map((line) => attempt.answered[line.rid]);
  if (answers.every((answer) => !answer.created)) return { already: answers.map((answer) => answer.payment).filter(Boolean), bill: data ? data.bill : null };
  return { done: true, data };
}

// The words under the button for a send without an answer
export const LOOK_AGAIN = 'Press again: the same payment goes, the server records it once.';
