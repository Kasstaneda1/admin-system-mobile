import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alreadyGiven, billCardOf, buttonOf, copyCheck, copyFailText, copyMissing, copyRequired, copyWaysOf, emailBody, firstWay, jobEmailOf, signWordsOf, tickOf } from './copy.js';

const bill = (o = {}) => ({ status: 'issued', can_email: true, bill_before_payment: true, delivered_at: null, customer: { email: 'test@example.com' }, ...o });
const ways = (list) => list.map((w) => w.way).join(' ');
const refused = (status, data) => ({ response: { status, data } });

test('the ways: Email only while the server sends emails; Show only when the copy is not required', () => {
  assert.equal(ways(copyWaysOf({ bill: bill(), required: true, to: 'test@example.com' })), 'email share handed');
  assert.equal(ways(copyWaysOf({ bill: bill({ can_email: false }), required: true })), 'share handed');
  assert.equal(ways(copyWaysOf({ bill: bill(), required: false, to: 'a@b.co' })), 'email share handed show');
  assert.equal(ways(copyWaysOf({ bill: bill({ can_email: false }), required: false })), 'share handed show');
  const email = copyWaysOf({ bill: bill(), required: true, to: 'test@example.com' })[0];
  assert.deepEqual(email, { way: 'email', icon: 'mail', title: 'Email the PDF', line: 'test@example.com · Change' });
  assert.equal(copyWaysOf({ bill: bill(), required: true, to: '' })[0].line, 'Add the address');
});

test('chosen at first: Email with an address, else Share', () => {
  const list = copyWaysOf({ bill: bill(), required: true, to: 'x@y.z' });
  assert.equal(firstWay(list, 'x@y.z'), 'email');
  assert.equal(firstWay(list, ''), 'share');
  assert.equal(firstWay(copyWaysOf({ bill: bill({ can_email: false }), required: true }), 'x@y.z'), 'share');
  // Printed copy handed is never chosen ahead (the lead 25.11): Email with an address, else nothing
  assert.equal(firstWay(list, 'x@y.z', true), 'email');
  assert.equal(firstWay(list, '', true), null);
  assert.equal(firstWay(copyWaysOf({ bill: bill({ can_email: false }), required: true }), 'x@y.z', true), null);
  assert.deepEqual(buttonOf('pay', null), { text: 'Get paid', icon: 'money' });
  assert.equal(copyCheck({ way: null, to: '', ticked: false }), 'Choose how the customer gets the copy.');
});

test('the job’s address: hidden contacts give none', () => {
  assert.equal(jobEmailOf(bill()), 'test@example.com');
  assert.equal(jobEmailOf(bill({ contacts_hidden: true })), '');
  assert.equal(jobEmailOf(bill({ customer: {} })), '');
});

test('the copy is missing: issued, required, not delivered', () => {
  assert.equal(copyMissing(bill()), true);
  assert.equal(copyMissing(bill({ delivered_at: '2026-11-25T10:00:00Z' })), false);
  assert.equal(copyMissing(bill({ bill_before_payment: false })), false);
  assert.equal(copyMissing(bill({ status: 'draft' })), false);
  assert.equal(copyMissing(null), false);
});

test('the tick: Email may go without it, Share not; handed and show have none', () => {
  assert.equal(tickOf('email').must, false);
  // one phrase for both (the Designer on #97)
  assert.equal(tickOf('email').words, 'The customer agreed to get the documents of this job electronically.');
  assert.equal(tickOf('share').words, tickOf('email').words);
  assert.equal(tickOf('share').must, true);
  assert.equal(tickOf('handed'), null);
  assert.equal(tickOf('show'), null);
});

test('the button follows the choice (d2-ny, d5, d6)', () => {
  assert.equal(buttonOf('sign', 'email').text, 'Done · signed');
  assert.equal(buttonOf('pay', 'email').text, 'Email the copy · Get paid');
  assert.equal(buttonOf('pay', 'share').text, 'Share the PDF · Get paid');
  assert.equal(buttonOf('pay', 'handed').text, 'Copy handed · Get paid');
  assert.equal(buttonOf('send', 'email').text, 'Send');
  assert.equal(buttonOf('send', 'share').text, 'Share');
  assert.equal(buttonOf('send', 'handed').text, 'Done · handed');
  assert.equal(buttonOf('send', 'show').text, 'Show');
});

test('the check before anything goes', () => {
  assert.equal(copyCheck({ way: 'email', to: '', ticked: false }), 'Add the customer’s email address.');
  assert.equal(copyCheck({ way: 'email', to: 'not an email', ticked: true }), 'Check the email address.');
  assert.equal(copyCheck({ way: 'email', to: 'a@b.co', ticked: false }), null);
  assert.equal(copyCheck({ way: 'share', to: '', ticked: false }), 'Tick the agreement or choose another way.');
  assert.equal(copyCheck({ way: 'share', to: '', ticked: true }), null);
  assert.equal(copyCheck({ way: 'handed' }), null);
  assert.equal(copyCheck({ way: null }), 'Choose how the customer gets the copy.');
});

test('the email body: consent only when ticked', () => {
  assert.deepEqual(emailBody(' a@b.co ', true), { to: 'a@b.co', consent: true });
  assert.deepEqual(emailBody('a@b.co', false), { to: 'a@b.co' });
});

test('the words when it did not go', () => {
  assert.equal(copyFailText({}), 'No signal: the bill is not sent. Try again when you have signal.');
  assert.equal(copyFailText(refused(409, { code: 'consent_required', error: 'x' })), 'Tick the agreement or choose another way.');
  assert.match(copyFailText(refused(503, { code: 'email_off' })), /^Not sent: email is not working/);
  assert.equal(copyFailText(refused(502, { code: 'email_not_sent', error: 'The email was not sent: timeout.' })), 'Not sent: The email was not sent: timeout.');
  assert.equal(alreadyGiven(refused(409, { error: 'This bill is already marked delivered' })), true);
  assert.equal(alreadyGiven(refused(409, { error: 'other' })), false);
});

test('the words over the signature: with terms the link, without no tail', () => {
  const withTerms = signWordsOf(true);
  assert.equal(`${withTerms.before}${withTerms.link}${withTerms.after}`, 'By signing, you confirm the work on this bill is done and you agree to its Terms and conditions.');
  const none = signWordsOf(false);
  assert.equal(none.before, 'By signing, you confirm the work on this bill is done.');
  assert.equal(none.link, null);
});

test('the bill on the customer’s screen: in full and in one row', () => {
  const b = { company: { name: 'SEMIX CORP' }, customer: { name: 'Test Customer' }, issued_at: '2026-11-24T15:26:00Z', total_cents: 13609, tax_cents: 1109, tax_name: 'NY tax', tax_rate: 8875,
    lines: [{ id: 1, name: 'Diagnostics', description: 'Service call', amount_cents: 12500 }] };
  const card = billCardOf(b);
  assert.equal(card.company, 'SEMIX CORP');
  assert.equal(card.who, 'Test Customer · Nov 24');
  assert.deepEqual(card.lines, [{ key: '1', name: 'Diagnostics', sub: 'Service call', amount: '$125.00' }]);
  assert.equal(card.tax.amount, '$11.09');
  assert.equal(card.total, '$136.09');
  assert.deepEqual(card.one, { name: 'Diagnostics', sub: 'Service call · NY tax $11.09', amount: '$136.09' });
  const two = billCardOf({ ...b, tax_cents: 0, lines: [...b.lines, { id: 2, name: 'Part', amount_cents: 100 }] });
  assert.equal(two.tax, null);
  assert.equal(two.one.sub, '1 more');
  assert.equal(billCardOf(null), null);
});

test('copyMissing / copyRequired: Give the bill Required in visit.steps decides; without steps — bill_before_payment', () => {
  const visit = (give) => ({ steps: [{ key: 'give', mode: give }, { key: 'collect', mode: 'optional' }] });
  assert.equal(copyMissing(bill({ bill_before_payment: false }), visit('required')), true);
  assert.equal(copyMissing(bill({ bill_before_payment: true }), visit('optional')), false);
  assert.equal(copyMissing(bill({ bill_before_payment: true }), visit('off')), false);
  assert.equal(copyMissing(bill({ bill_before_payment: true, delivered_at: '2026-11-25T10:00:00Z' }), visit('required')), false);
  assert.equal(copyMissing(bill({ bill_before_payment: false }), { steps: null }), false);
  assert.equal(copyRequired(bill({ bill_before_payment: false }), visit('required')), true);
  assert.equal(copyRequired(bill({ bill_before_payment: true }), visit('optional')), false);
  assert.equal(copyRequired(bill({ bill_before_payment: true })), true);
});

test('the signature asks for the copy only when Give is Required (the lead 25.11: Optional and Off never ask)', () => {
  const steps = (mode) => [{ key: 'give', mode }];
  const b = bill({ status: 'issued', delivered_at: null });
  assert.equal(copyMissing(b, { steps: steps('required') }), true);
  assert.equal(copyMissing(b, { steps: steps('optional') }), false);
  assert.equal(copyMissing(b, { steps: steps('off') }), false);
  assert.equal(copyMissing({ ...b, delivered_at: '2026-11-25T14:00:00Z' }, { steps: steps('required') }), false);
});
