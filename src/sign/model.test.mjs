import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_INK, choiceWords, companyTerms, consentOf, dayText, signHeadOf, signerLine } from './model.js';

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

const PRINTED = {
  sections: [{ title: 'Warranty', text: '90 days on parts and labor.' }, { title: null, text: null }, { title: '  ', text: 'Payment is due on completion.' }],
  replaced_parts: { title: 'Replaced parts', text: 'Replaced parts are returned on request.' },
};
const ACK_TERMS = { id: 9, version: 3, title: 'SEMIX CORP bill acknowledgment terms', body: '  I got the bill.  ' };

test('the terms the bill printed: the line and Read the terms', () => {
  const c = consentOf({ bill: { ...BILL, printed_terms: PRINTED } });
  assert.equal(c.line, 'By signing, you agree to the Terms and conditions of bill NY-1052.');
  assert.equal(c.link, 'Read the terms');
  assert.equal(c.title, 'Terms and conditions');
  assert.deepEqual(c.docs, [{ title: 'Terms and conditions', sub: 'As printed on bill NY-1052', sections: [
    { title: 'Warranty', text: '90 days on parts and labor.' },
    { title: null, text: 'Payment is due on completion.' },
    { title: 'Replaced parts', text: 'Replaced parts are returned on request.' },
  ] }]);
  // Replaced parts alone is still terms the bill printed
  assert.deepEqual(consentOf({ bill: { ...BILL, printed_terms: { sections: [], replaced_parts: { title: 'Replaced parts', text: 'x' } } } }).docs[0].sections,
    [{ title: 'Replaced parts', text: 'x' }]);
});

test('Approve: the company\'s approval terms over the signature', () => {
  const company = companyTerms({ id: 1, version: 1, title: 'ignored', body: 'Repairs are warranted 90 days.' }, 'SEMIX CORP repair terms');
  const c = consentOf({ company });
  assert.equal(c.line, 'By signing, you agree to SEMIX CORP repair terms.');
  assert.equal(c.title, 'SEMIX CORP repair terms');
  assert.deepEqual(c.docs, [{ title: 'SEMIX CORP repair terms', sub: 'Version 1', sections: [{ title: null, text: 'Repairs are warranted 90 days.' }] }]);
  // a draft has no printed terms: the company's alone
  assert.equal(consentOf({ bill: { ...BILL, status: 'draft', printed_terms: null }, company }).docs.length, 1);
  // no company terms published — no line
  assert.equal(companyTerms(null, 'SEMIX CORP repair terms'), null);
  assert.equal(companyTerms({ version: 1, body: 'x' }, null), null);
  assert.equal(consentOf({ company: null }), null);
  // an empty body: the line still says what they agree to
  assert.deepEqual(companyTerms({ version: 2, body: '' }, 'T').sections, []);
});

test('Ack: the bill\'s terms and the company\'s acknowledgment terms, both in sight', () => {
  const company = companyTerms(ACK_TERMS, 'SEMIX CORP bill acknowledgment terms');
  const c = consentOf({ bill: { ...BILL, printed_terms: PRINTED }, company });
  assert.equal(c.line, 'By signing, you agree to the Terms and conditions of bill NY-1052 and to SEMIX CORP bill acknowledgment terms.');
  assert.equal(c.title, 'Terms');
  assert.deepEqual(c.docs.map((d) => [d.title, d.sub]), [['Terms and conditions', 'As printed on bill NY-1052'], ['SEMIX CORP bill acknowledgment terms', 'Version 3']]);
  assert.deepEqual(c.docs[1].sections, [{ title: null, text: 'I got the bill.' }]);
  // the bill printed none: the company's alone
  assert.equal(consentOf({ bill: { ...BILL, printed_terms: null }, company }).line, 'By signing, you agree to SEMIX CORP bill acknowledgment terms.');
});

test('no printed terms, no company terms — no line, no link', () => {
  assert.equal(consentOf({ bill: { ...BILL, printed_terms: null } }), null);
  assert.equal(consentOf({ bill: { ...BILL } }), null);                       // an older server
  assert.equal(consentOf({ bill: null }), null);
  assert.equal(consentOf(), null);
  assert.equal(consentOf({ bill: { ...BILL, printed_terms: { sections: [{ title: null, text: '' }], replaced_parts: null } } }), null);
  assert.equal(consentOf({ bill: { ...BILL, printed_terms: 'terms' } }), null);
});

test('no label: «this bill»', () => {
  const c = consentOf({ bill: { total_cents: 1, printed_terms: { sections: [{ title: 'A', text: 'b' }], replaced_parts: null } } });
  assert.equal(c.line, 'By signing, you agree to the Terms and conditions of this bill.');
  assert.equal(c.docs[0].sub, 'As printed on this bill');
});
