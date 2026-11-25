import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REPLACED_PARTS, ackBody, ackTermsLine, billHasParts, initialParts, partsChoicesOf, pickParts, ackCopyName, ackError, ackStage, billHeadOf, partsNote, partsOf, signedLine, stageText,
} from './model.js';

const BILL = { id: 77, status: 'issued', label: 'NY-1048', bill_number: 1048, total_cents: 25041, delivered_at: '2026-11-17T17:42:00Z' };
const fail = (status, data) => ({ response: { status, data } });

test('the replaced parts: the server\'s three choices, the copy\'s words', () => {
  assert.deepEqual(REPLACED_PARTS.map((p) => p.choice), ['returned', 'waived', 'none']);
  assert.equal(partsOf('returned').words, 'The replaced parts were returned to me.');
  assert.equal(partsOf('waived').words, 'I give up the replaced parts and do not want them returned.');
  assert.equal(partsOf('none').words, null);
  assert.equal(partsOf('none').title, 'No parts were replaced');
  assert.equal(partsOf('kept'), null);
  assert.equal(partsOf(null), null);
  assert.equal(partsNote('nyc_20'), 'The customer chooses. Giving them up is only in writing, after the bill (NYC).');
  assert.equal(partsNote('nj_any'), 'The customer chooses.');
  assert.equal(partsNote(undefined), 'The customer chooses.');
});

test('the customer signs only for an issued bill that was delivered', () => {
  assert.equal(ackStage(BILL), 'open');
  assert.equal(ackStage({ ...BILL, delivered_at: null }), 'undelivered');
  assert.equal(ackStage({ ...BILL, status: 'draft', delivered_at: null }), 'draft');
  assert.equal(ackStage({ ...BILL, status: 'void' }), 'void');
  assert.equal(ackStage({ ...BILL, status: 'strange' }), 'none');
  assert.equal(ackStage(null), 'none');
  assert.equal(stageText('open'), null);
  assert.match(stageText('undelivered'), /^Give the bill to the customer first/);
  assert.match(stageText('draft'), /^Make the bill final/);
  assert.equal(stageText('none'), stageText('draft'));
  assert.match(stageText('void'), /void/);
});

test('the top of the screen: the bill, its total, when it was delivered (New York time)', () => {
  assert.deepEqual(billHeadOf(BILL, '2026-11-17'), { label: 'Bill NY-1048', total: '$250.41', delivered: 'Bill NY-1048 · delivered 12:42' });
  assert.equal(billHeadOf(BILL, '2026-11-18').delivered, 'Bill NY-1048 · delivered Nov 17 · 12:42');
  assert.equal(billHeadOf({ ...BILL, label: null }, '2026-11-17').label, 'Bill #1048');
  assert.equal(billHeadOf({ ...BILL, delivered_at: null }, '2026-11-17').delivered, null);
  assert.equal(billHeadOf(null), null);
});

test('the request: name, a choice about the parts and a signature, or words before sending', () => {
  const terms = { id: 5 };
  assert.deepEqual(ackBody({ name: '  Sanjay Patel ', png: 'data:image/png;base64,AA', parts: 'returned', terms, requestId: 'r1' }), {
    body: { signer_name: 'Sanjay Patel', signature_png: 'data:image/png;base64,AA', replaced_parts: 'returned', client_request_id: 'r1', terms_version_id: 5 },
  });
  assert.equal(ackBody({ name: 'A', png: 'p', parts: 'none', terms: null, requestId: 'r' }).body.terms_version_id, undefined);
  assert.equal(ackBody({ name: ' ', png: 'p', parts: 'none' }).error, 'Type the customer’s name.');
  assert.equal(ackBody({ name: 'A', png: 'p', parts: null }).error, 'Choose what happened to the replaced parts.');
  assert.equal(ackBody({ name: 'A', png: 'p', parts: 'kept' }).error, 'Choose what happened to the replaced parts.');
  assert.equal(ackBody({ name: 'A', png: null, parts: 'none' }).error, 'The customer signs in the box first.');
  assert.equal(ackBody({ name: 'x'.repeat(250), png: 'p', parts: 'waived' }).body.signer_name.length, 200);
});

test('the signature there is, in one line', () => {
  const ack = { signed_at: '2026-11-17T17:50:00Z', replaced_parts: 'returned' };
  assert.equal(signedLine(ack, '2026-11-17'), 'Signed 12:50 · parts returned');
  assert.equal(signedLine({ ...ack, replaced_parts: 'waived' }, '2026-11-17'), 'Signed 12:50 · parts given up');
  assert.equal(signedLine({ ...ack, replaced_parts: 'none' }, '2026-11-18'), 'Signed Nov 17 · 12:50 · no parts replaced');
  assert.equal(signedLine({ created_at: '2026-11-17T17:51:00Z', replaced_parts: 'none' }, '2026-11-17'), 'Signed 12:51 · no parts replaced');
  assert.equal(signedLine({ replaced_parts: 'odd' }), 'Signed');
  assert.equal(signedLine(null), '');
});

test('the server\'s refusals in words', () => {
  assert.equal(ackError(new Error('Network Error')).kind, 'offline');
  assert.deepEqual(ackError(fail(409, { code: 'already_signed', acknowledgment_id: 3 })), { kind: 'signed', text: 'The customer already signed for this bill.' });
  assert.deepEqual(ackError(fail(409, { code: 'not_issued' })), { kind: 'stage', text: stageText('draft') });
  assert.deepEqual(ackError(fail(409, { code: 'not_delivered' })), { kind: 'stage', text: stageText('undelivered') });
  assert.deepEqual(ackError(fail(409, { code: 'void' })), { kind: 'stage', text: stageText('void') });
  assert.equal(ackError(fail(409, { code: 'terms_changed', terms_version_id: 9 })).kind, 'resign');
  assert.equal(ackError(fail(404, { error: 'This visit has no bill yet: draft it first' })).kind, 'gone');
  assert.deepEqual(ackError(fail(400, { error: 'replaced_parts is required: returned, waived, none' })), { kind: 'refused', text: 'replaced_parts is required: returned, waived, none.' });
  assert.deepEqual(ackError(fail(403, {})), { kind: 'refused', text: 'The signature was not saved.' });
  assert.equal(ackError(fail(500, { error: 'boom' })).kind, 'failed');
});

test('the copy\'s file name', () => {
  assert.equal(ackCopyName(BILL), 'bill-receipt-NY-1048.pdf');
  assert.equal(ackCopyName({ id: 77 }), 'bill-receipt-77.pdf');
  assert.equal(ackCopyName({ label: 'NY/10 48' }), 'bill-receipt-NY_10_48.pdf');
});

test('the acknowledgment terms: their title or a plain one, none when the company has none', () => {
  assert.equal(ackTermsLine(null), null);
  assert.deepEqual(ackTermsLine({ id: 4, version: 2, title: 'Receipt terms' }), { title: 'Receipt terms', sub: 'Version 2 · the customer gets a copy' });
  assert.deepEqual(ackTermsLine({ id: 4, version: 1, title: '  ' }), { title: 'Bill acknowledgment terms', sub: 'Version 1 · the customer gets a copy' });
});

test('the choices follow the bill: parts on it — returned or given up; none — only «no parts»', () => {
  const withPart = { ...BILL, lines: [{ kind: 'labor' }, { kind: 'part', warranty: false }] };
  const withWarrantyPart = { ...BILL, lines: [{ kind: 'part', warranty: true }] };
  const noPart = { ...BILL, lines: [{ kind: 'labor' }, { kind: 'diagnostics_credit' }, { kind: 'extra' }] };
  assert.equal(billHasParts(withPart), true);
  assert.equal(billHasParts(withWarrantyPart), true);
  assert.equal(billHasParts(noPart), false);
  assert.equal(billHasParts({ ...BILL, lines: undefined }), false);
  assert.equal(billHasParts(null), false);
  assert.deepEqual(partsChoicesOf(withPart).map((p) => p.choice), ['returned', 'waived']);
  assert.deepEqual(partsChoicesOf(withWarrantyPart).map((p) => p.choice), ['returned', 'waived']);
  assert.deepEqual(partsChoicesOf(noPart).map((p) => p.choice), ['none']);
  assert.equal(partsNote('nyc_20', false), 'This bill has no parts: nothing was replaced.');
  assert.equal(partsNote('nyc_20', true), 'The customer chooses. Giving them up is only in writing, after the bill (NYC).');
  // the request refuses a choice the bill does not allow
  const sign = { name: 'Sanjay Patel', png: 'data:image/png;base64,AAAA', requestId: 'r1' };
  assert.equal(ackBody({ ...sign, parts: 'none', bill: withPart }).error, 'Choose what happened to the replaced parts.');
  assert.equal(ackBody({ ...sign, parts: 'returned', bill: noPart }).error, 'Choose what happened to the replaced parts.');
  assert.equal(ackBody({ ...sign, parts: 'waived', bill: withPart }).body.replaced_parts, 'waived');
  assert.equal(ackBody({ ...sign, parts: 'none', bill: noPart }).body.replaced_parts, 'none');
});

test('a different choice after the signature is drawn wipes it: the customer signs again', () => {
  assert.deepEqual(pickParts(null, 'returned', false), { parts: 'returned', clear: false });
  assert.deepEqual(pickParts('returned', 'waived', true), { parts: 'waived', clear: true });
  assert.deepEqual(pickParts('returned', 'waived', false), { parts: 'waived', clear: false });
  assert.deepEqual(pickParts('returned', 'returned', true), { parts: 'returned', clear: false });
});

test('one card (no parts on the bill) is chosen at once; with parts nothing is chosen', () => {
  assert.equal(initialParts({ ...BILL, lines: [{ kind: 'labor' }] }), 'none');
  assert.equal(initialParts({ ...BILL, lines: [] }), 'none');
  assert.equal(initialParts({ ...BILL, lines: [{ kind: 'labor' }, { kind: 'part' }] }), null);
  assert.equal(initialParts({ ...BILL, lines: [{ kind: 'part', warranty: true }] }), null);
});

test('ACK-T: the body carries the PDF the customer was shown; the server refusing the bill or the time', async () => {
  const { ACK_BILL_CHANGED, ACK_CLOCK_WORDS } = await import('./model.js');
  const bill = { status: 'issued', lines: [], pdf: { sha256: 'cd'.repeat(32) } };
  assert.equal(ackBody({ name: 'A', png: 'p', parts: 'none', requestId: 'r', bill }).body.pdf_sha256, 'cd'.repeat(32));
  assert.equal('pdf_sha256' in ackBody({ name: 'A', png: 'p', parts: 'none', requestId: 'r', bill: { ...bill, pdf: null } }).body, false);
  assert.equal('pdf_sha256' in ackBody({ name: 'A', png: 'p', parts: 'none', requestId: 'r' }).body, false);
  const err = (status, data, headers = {}) => ({ response: { status, data, headers } });
  assert.deepEqual(ackError(err(409, { code: 'bill_changed', bill_id: 9 })), { kind: 'bill_changed', text: ACK_BILL_CHANGED });
  const now = Date.UTC(2026, 10, 24, 20, 0);
  const fine = ackError(err(400, { code: 'signed_at_out_of_bounds' }, { date: new Date(now).toUTCString() }), now);
  assert.deepEqual([fine.kind, fine.clock, fine.text], ['clock', false, ACK_CLOCK_WORDS]);
  const off = ackError(err(400, { code: 'signed_at_out_of_bounds' }, { date: new Date(now - 3600000).toUTCString() }), now);
  assert.deepEqual([off.kind, off.clock], ['clock', true]);
  assert.match(off.text, /^The phone’s clock is off/);
  assert.equal(ackError(err(400, { code: 'signed_at_out_of_bounds' })).clock, null, 'no Date header: not known');
});

// The Architect on #97: the signature waits for the copy by Give the bill Required in visit.steps
// (the server's 409 not_delivered, whatever the order); bill_before_payment only without steps
test('ackStage: the copy before the signature where Give the bill is Required (visit.steps)', () => {
  const steps = (give) => ({ steps: [{ key: 'issue', mode: 'optional' }, { key: 'collect', mode: 'optional' }, { key: 'give', mode: give }] });
  const notGiven = { ...BILL, delivered_at: null };
  // give required below collect: bill_before_payment is false (payment does not wait), the signature still does
  assert.equal(ackStage({ ...notGiven, bill_before_payment: false }, steps('required')), 'undelivered');
  assert.equal(ackStage({ ...notGiven, bill_before_payment: true }, steps('optional')), 'open');
  assert.equal(ackStage({ ...notGiven, bill_before_payment: true }, steps('off')), 'open');
  // no steps (an older server, a kept visit): bill_before_payment as before
  assert.equal(ackStage({ ...notGiven, bill_before_payment: false }), 'open');
  assert.equal(ackStage({ ...notGiven, bill_before_payment: false }, { steps: null }), 'open');
  assert.equal(ackStage(notGiven, {}), 'undelivered');
  assert.equal(stageText('draft', { bill_before_payment: true }, steps('optional')), 'Make the bill final first. Then the customer signs for it.');
  assert.equal(stageText('draft', { bill_before_payment: false }, steps('required')), 'Make the bill final and give it to the customer first. Then they sign that they got it.');
});
