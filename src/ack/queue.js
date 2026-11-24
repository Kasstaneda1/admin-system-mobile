// The customer's signature «after the work» kept on this phone until the server has it
// (USABILITY_2026-11-24 §10): the same queue as the approval's (approve/queue.js
// makeSignatureQueue), without React Native (queue.test.mjs): store.js passes AsyncStorage and the
// API, the tests pass stand-ins.
//   Kept first, then sent. No answer or a server error — it stays and goes again by itself: when
//   the app opens or comes back with the network, and when its visit opens. The server takes the
//   same client_request_id once (200 created: false), so a repeat never gives a second signature.
//   Before a send from the queue the phone reads the visit's bill: the customer signed for one bill
//   (its id in the entry); the office voided it or issued another meanwhile — the entry is marked
//   (bill_changed), the customer signs for the bill there is now. The server posts the signature to
//   the visit's bill of the moment and has no field for which one.
//   Refused — the terms changed, the bill is not ready (draft, void, not delivered), another reason:
//   marked, never sent again by itself; the customer signs again on the screen, which replaces it.
//   The customer already signed (409 already_signed, another request) or the visit is not this
//   technician's (404): dropped — the screen reads what the server has.
//   The moment the customer signed (at, this phone's clock) stays in the entry. The server does
//   not take signed_at for this signature yet (recordAcknowledgment): the copy says the moment the
//   server got it. ACK_SIGNED_AT turns it on, when the server takes it (sends from the queue only,
//   as the approval's).
//   The list goes with the session (session/store.js).
//
// makeAckQueue({ queue, api: { sign(visitId, body), bill(visitId) } }) — as makeApproveQueue:
//   sign({ visitId, userId, body, at, billId }) →
//     { result: 'sent', acknowledgment } | { result: 'waiting', failed } |
//     { result: 'resign' | 'stage' | 'refused' | 'bill_changed' | 'signed' | 'gone', failed } | { result: 'busy' };
//   list(), pendingOf(visitId, userId), flushAll(userId), drop(visitId, userId).
import { makeSignatureQueue } from '../approve/queue.js';
import { withSignedAt } from '../approve/model.js';
import { ackError } from './model.js';

export const ACK_SIGNED_AT = false;

export const BILL_CHANGED = 'The bill changed after the customer signed: they sign for the bill there is now.';

export function makeAckQueue({ queue, api, signedAt = ACK_SIGNED_AT }) {
  return makeSignatureQueue({
    queue,
    api,
    errorOf: ackError,
    withMoment: signedAt ? withSignedAt : (body) => body,
    drops: ['gone', 'signed'],
    before: async (entry) => {
      if (entry.billId === undefined || entry.billId === null) return null;
      const data = await api.bill(entry.visitId);
      const bill = data && data.bill;
      return bill && String(bill.id) === String(entry.billId) && bill.status === 'issued'
        ? null
        : { kind: 'bill_changed', text: BILL_CHANGED };
    },
    sentOf: (data) => ({ acknowledgment: (data && data.acknowledgment) || null }),
  });
}
