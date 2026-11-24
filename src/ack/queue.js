// The customer's signature «after the work» kept on this phone until the server has it
// (USABILITY_2026-11-24 §10, contract ACK-T — BILLS_MV_DESIGN.md §5а-2): the same queue as the
// approval's (approve/queue.js makeSignatureQueue), without React Native (queue.test.mjs):
// store.js passes AsyncStorage and the API, the tests pass stand-ins.
//   Kept first, then sent. No answer or a server error — it stays and goes again by itself: when
//   the app opens or comes back with the network, and when its visit, the bill's Send screen or
//   the signature screen opens. The server takes the same client_request_id once (200 created:
//   false), so a repeat never gives a second signature.
//   Every send carries signed_at — the moment the customer signed, by this phone (the lead's rule
//   on mobile #56: a signature never goes without its moment) — and the body carries pdf_sha256,
//   the issued PDF the customer was shown (ack/model ackBody): the office voided the bill or
//   issued another meanwhile → 409 bill_changed.
//   Refused — the terms or the bill changed, its time does not fit the bill (400
//   signed_at_out_of_bounds), the bill is not ready, another reason: marked, never sent again by
//   itself; the visit's Bill tile says so, the customer signs again on the screen, which replaces
//   it. The customer already signed (409 already_signed, another request) or the visit is not
//   this technician's (404): dropped — the screen reads what the server has.
//   The list goes with the session (session/store.js).
//
// makeAckQueue({ queue, api: { sign(visitId, body) } }) — as makeApproveQueue:
//   sign({ visitId, userId, body, at }) →
//     { result: 'sent', acknowledgment } | { result: 'waiting', failed } |
//     { result: 'resign' | 'stage' | 'refused' | 'bill_changed' | 'clock' | 'signed' | 'gone', failed } | { result: 'busy' };
//   list(), pendingOf(visitId, userId), flushAll(userId), drop(visitId, userId).
import { makeSignatureQueue } from '../approve/queue.js';
import { withSignedAt } from '../approve/model.js';
import { ackError } from './model.js';

export function makeAckQueue({ queue, api }) {
  return makeSignatureQueue({
    queue,
    api,
    errorOf: ackError,
    withMoment: withSignedAt,
    momentFirst: true,
    drops: ['gone', 'signed'],
    sentOf: (data) => ({ acknowledgment: (data && data.acknowledgment) || null }),
  });
}
