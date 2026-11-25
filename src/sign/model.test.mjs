import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_INK, choiceWords, consentOf, dayText, signHeadOf, signerLine } from './model.js';

const BILL = { id: 52, status: 'issued', label: 'NY-1052', bill_number: 1052, total_cents: 39631 };

test('a signature is a real stroke: about 2 cm of ink', () => {
  assert.ok(MIN_INK >= 100 && MIN_INK <= 140);
});

test('the top of the sign screen: who signs, what and how much', () => {
  assert.deepEqual(signHeadOf({ kind: 'approve', name: ' Sanjay Patel ', amountCents: 30500, choice: 'waived' }),
    { title: 'Sanjay Patel signs', sub: 'Approves the repair · $305.00 before tax', choice: '“No written estimate. Go ahead with the repair.”' });
  assert.deepEqual(signHeadOf({ kind: 'approve', name: '', amountCents: null }),
    { title: 'The customer signs', sub: 'Approves the repair', choice: null });
  assert.deepEqual(signHeadOf({ kind: 'ack', name: 'Javier Ortiz', bill: BILL, choice: 'returned' }),
    { title: 'Javier Ortiz signs', sub: 'Got bill NY-1052 · $396.31', choice: '“The replaced parts were returned to me.”' });
  assert.equal(signHeadOf({ kind: 'ack', name: 'J', bill: { bill_number: 7, total_cents: 100 } }).sub, 'Got bill #7 · $1.00');
  assert.equal(signHeadOf({ kind: 'ack', name: 'J', bill: null }).sub, 'Got the bill');
});

test('what the customer chose, in their words, over the signature', () => {
  assert.equal(choiceWords('approve', 'waived'), '“No written estimate. Go ahead with the repair.”');
  assert.equal(choiceWords('approve', 'written'), '“I want a written estimate first.”');
  assert.equal(choiceWords('approve', null), null);                // not NYC: no choice
  assert.equal(choiceWords('ack', 'returned'), '“The replaced parts were returned to me.”');
  assert.equal(choiceWords('ack', 'waived'), '“I give up the replaced parts and do not want them returned.”');
  assert.equal(choiceWords('ack', 'none'), null);                  // no parts: no line
  assert.equal(choiceWords('ack', null), null);
  assert.equal(choiceWords('approve', 'returned'), null);
});

test('the line under the signature: the name and the day', () => {
  assert.equal(dayText('2026-11-24'), 'Nov 24, 2026');
  assert.equal(dayText('2026-01-05'), 'Jan 5, 2026');
  assert.equal(dayText(''), '');
  assert.equal(dayText('2026-13-01'), '');
  assert.equal(signerLine(' Sanjay Patel ', '2026-11-24'), 'Sanjay Patel · Nov 24, 2026');
  assert.equal(signerLine('', '2026-11-24'), 'Nov 24, 2026');
});

test('the terms the bill printed: the line and Read the terms', () => {
  const bill = { ...BILL, printed_terms: {
    sections: [{ title: 'Warranty', text: '90 days on parts and labor.' }, { title: null, text: null }, { title: '  ', text: 'Payment is due on completion.' }],
    replaced_parts: { title: 'Replaced parts', text: 'Replaced parts are returned on request.' },
  } };
  const c = consentOf(bill);
  assert.equal(c.line, 'By signing, you agree to the Terms and conditions of bill NY-1052.');
  assert.equal(c.link, 'Read the terms');
  assert.equal(c.title, 'Terms and conditions');
  assert.equal(c.sub, 'As printed on bill NY-1052');
  assert.deepEqual(c.sections, [
    { title: 'Warranty', text: '90 days on parts and labor.' },
    { title: null, text: 'Payment is due on completion.' },
    { title: 'Replaced parts', text: 'Replaced parts are returned on request.' },
  ]);
  // Replaced parts alone is still terms the bill printed
  assert.deepEqual(consentOf({ ...BILL, printed_terms: { sections: [], replaced_parts: { title: 'Replaced parts', text: 'x' } } }).sections,
    [{ title: 'Replaced parts', text: 'x' }]);
});

test('no printed terms — no line, no link', () => {
  assert.equal(consentOf({ ...BILL, printed_terms: null }), null);
  assert.equal(consentOf({ ...BILL }), null);                       // an older server
  assert.equal(consentOf(null), null);
  assert.equal(consentOf({ ...BILL, printed_terms: { sections: [{ title: null, text: '' }], replaced_parts: null } }), null);
  assert.equal(consentOf({ ...BILL, printed_terms: 'terms' }), null);
});

test('no label: «this bill»', () => {
  const c = consentOf({ total_cents: 1, printed_terms: { sections: [{ title: 'A', text: 'b' }], replaced_parts: null } });
  assert.equal(c.line, 'By signing, you agree to the Terms and conditions of this bill.');
  assert.equal(c.sub, 'As printed on this bill');
});
