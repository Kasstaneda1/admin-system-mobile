import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTIMATE_CHOICES, RESIGN_WORDS, agreedOf, approveError, approveTile, approveTileAfterIssue, authBody, canApprove, copyName, countText, estimatePriceOf, estimatePriceText, estimateText, writtenText,
  latestOf, needsEstimateChoice, pickEstimate, ruleText, signHead, signedText, keptEstimate, termsLineOf, signedAtOf, withSignedAt, CLOCK_SKEW_MS, CLOCK_QUEUED_WORDS, clockOff, queuedClockText, clockBoxNow,
} from './model.js';

// The design's draft (design-mockups/app-invoice «Числа сходятся»): $230.00 before tax, $250.41 with it
const DRAFT = {
  id: 9, status: 'draft', total_cents: 25041, tax_cents: 2041, company: { name: 'SEMIX CORP' },
  lines: [{ kind: 'labor', name: 'Washer repair labor' }, { kind: 'part', name: 'Drain pump' }, { kind: 'diagnostics_credit', name: 'Diagnostics credit' }],
};
const VISIT = { id: 31, role: 'main', status: 'on_site', legacy: false };
const err = (status, data = {}) => ({ response: { status, data } });

test('who signs: the main technician of a visit of the new schedule with work, as the bill', () => {
  assert.equal(canApprove(VISIT), true);
  assert.equal(canApprove({ ...VISIT, role: 'helper' }), false);
  assert.equal(canApprove({ ...VISIT, legacy: true }), false);
  assert.equal(canApprove(null), false);
});

test('the amount: the draft without tax (the server\'s netOf), with tax, the lines in one line', () => {
  assert.deepEqual(agreedOf(DRAFT), { amount: 23000, withTax: 25041, tax: 2041, summary: 'Washer repair labor, drain pump, diagnostics credit', count: 3 });
  assert.equal(agreedOf({ ...DRAFT, lines: [] }), null);
  assert.equal(agreedOf({ ...DRAFT, status: 'issued' }), null);
  assert.equal(agreedOf(null), null);
  assert.equal(agreedOf({ ...DRAFT, total_cents: 100, tax_cents: 300 }).amount, 0); // never below zero
  assert.equal(countText(3), 'See 3 lines');
  assert.equal(countText(1), 'See 1 line');
});

test('the rule of the place: words only, the server counts it', () => {
  assert.match(ruleText('nyc_20'), /more than 20%.*NYC rule/);
  assert.match(ruleText('nj_any'), /at all.*NJ rule/);
  assert.match(ruleText('none'), /ask the customer again/);
  assert.equal(needsEstimateChoice('nyc_20'), true);
  assert.equal(needsEstimateChoice('nj_any'), false);
  assert.deepEqual(ESTIMATE_CHOICES.map((c) => c.choice), ['written', 'waived']);
  assert.equal(ESTIMATE_CHOICES[0].title, 'Yes, I want a written estimate');
  assert.equal(estimateText(0), 'You have the right to a written estimate before any repair. It is free.');
  assert.equal(estimateText(2500), 'You have the right to a written estimate before any repair. It costs $25.00.');
  assert.equal(estimatePriceText(4500), 'It costs $45.00.');
  assert.equal(estimatePriceText(0), 'It is free.');
  assert.deepEqual(ESTIMATE_CHOICES.map((c) => c.sub), ['We write it before the repair', 'Go ahead with the repair']);
  assert.equal(writtenText({ estimate_choice: 'written', estimate_price_cents: 4500 }), 'The customer asked for it ($45.00). The copy of this approval is the written estimate.');
  assert.equal(writtenText({ estimate_choice: 'written', estimate_price_cents: 0 }), 'The customer asked for it (free). The copy of this approval is the written estimate.');
  assert.equal(writtenText({ estimate_choice: 'waived', estimate_price_cents: 4500 }), null);
  assert.equal(writtenText({ estimate_choice: null }), null);
  assert.equal(writtenText(null), null);
  // the price: the first item of line_kind estimate_fee in the book's order; none — free
  const book = [{ line_kind: 'labor', unit_price_cents: 18000 }, { line_kind: 'estimate_fee', unit_price_cents: 2500 }, { line_kind: 'estimate_fee', unit_price_cents: 4000 }];
  assert.equal(estimatePriceOf(book), 2500);
  assert.equal(estimatePriceOf(book.slice(0, 1)), 0);
  assert.equal(estimatePriceOf(undefined), 0);
});

test('the terms line: the title, or «<company> repair terms»; none published — null', () => {
  assert.deepEqual(termsLineOf({ id: 4, version: 3, title: 'Repair terms' }, 'SEMIX CORP'), { title: 'Repair terms', sub: 'Version 3 · the customer gets a copy' });
  assert.equal(termsLineOf({ id: 4, version: 1, title: ' ' }, 'SEMIX CORP').title, 'SEMIX CORP repair terms');
  assert.equal(termsLineOf(null, 'SEMIX CORP'), null);
});

test('the body: a signature for the draft\'s amount without tax, the terms version, the request id', () => {
  const agreed = agreedOf(DRAFT);
  const { body } = authBody({ name: '  Sanjay Patel ', png: 'data:image/png;base64,AAAA', agreed, terms: { id: 4 }, rule: 'none', requestId: 'r1' });
  assert.deepEqual(body, {
    method: 'signature', signer_name: 'Sanjay Patel', signature_png: 'data:image/png;base64,AAAA', amount_source: 'bill',
    expected_amount_cents: 23000, client_request_id: 'r1', terms_version_id: 4,
  });
  // no terms published: no version sent (the server refuses one)
  assert.equal('terms_version_id' in authBody({ name: 'A', png: 'p', agreed, terms: null, rule: 'none', requestId: 'r' }).body, false);
  assert.equal(authBody({ name: ' ', png: 'p', agreed, rule: 'none' }).error, 'Type the customer’s name.');
  assert.equal(authBody({ name: 'A', png: null, agreed, rule: 'none' }).error, 'The customer signs in the box first.');
  assert.equal(authBody({ name: 'A', png: 'p', agreed: null, rule: 'none' }).error, 'There is no amount to approve yet.');
});

test('NYC: the choice about the written estimate and its price go with it; none — not sent', () => {
  const agreed = agreedOf(DRAFT);
  const base = { name: 'A', png: 'p', agreed, terms: null, rule: 'nyc_20', requestId: 'r' };
  assert.equal(authBody(base).error, 'Choose about the written estimate.');
  assert.equal(authBody({ ...base, estimate: { choice: 'written', price: null } }).error, 'The written estimate has no price yet: ask the office.');
  const { body } = authBody({ ...base, estimate: { choice: 'waived', price: 0 } });
  assert.equal(body.estimate_choice, 'waived');
  assert.equal(body.estimate_price_cents, 0);
  // NJ: no such choice
  assert.equal('estimate_choice' in authBody({ ...base, rule: 'nj_any', estimate: { choice: 'waived', price: 0 } }).body, false);
});

test('the latest approval and its time (New York wall clock)', () => {
  const a1 = { id: 3, method: 'signature', amount_cents: 20000, authorized_at: '2026-11-06T16:31:00.000Z' };
  const a2 = { id: 7, method: 'oral', amount_cents: 23000, authorized_at: '2026-11-11T16:31:00.000Z' };
  assert.equal(latestOf([a1, a2]).id, 7);
  assert.equal(latestOf([a2, a1]).id, 7);
  assert.equal(latestOf([]), null);
  assert.equal(latestOf(undefined), null);
  assert.equal(signedText(a1, '2026-11-06'), 'Signed 11:31');
  assert.equal(signedText(a1, '2026-11-11'), 'Signed Nov 6 · 11:31');
  assert.equal(signedText(a2, '2026-11-11'), 'Agreed by phone 11:31');
});

test('the Approve tile: kept on the phone, signed, not yet, no connection; none for a helper', () => {
  const ok = (list) => ({ status: 'ok', list });
  const a = { id: 7, method: 'signature', amount_cents: 23000, authorized_at: '2026-11-11T16:31:00.000Z' };
  assert.deepEqual(approveTile(VISIT, ok([a]), null, '2026-11-11'), { title: 'Approve', line: 'Signed 11:31 · $230.00', warn: null, kind: 'signed' });
  assert.equal(approveTile(VISIT, ok([]), null, '2026-11-11').line, 'Not signed yet');
  assert.equal(approveTile(VISIT, { status: 'unknown', list: [] }, null).line, 'Needs connection');
  assert.equal(approveTile(VISIT, null, null).kind, 'loading');
  assert.deepEqual(approveTile(VISIT, ok([a]), { failed: null }), { title: 'Approve', line: 'Signed on this phone', warn: 'not sent yet', kind: 'pending' });
  assert.equal(approveTile(VISIT, ok([]), { failed: { kind: 'resign' } }).warn, 'not accepted');
  assert.equal(approveTile({ ...VISIT, role: 'helper' }, ok([a]), null), null);
});

test('the Approve tile after the bill is issued: gone at diagnostics and a recall unless signed', () => {
  const none = { title: 'Approve', line: 'Not signed yet', warn: null, kind: 'none' };
  const signed = { title: 'Approve', line: 'Signed 11:31 · $230.00', warn: null, kind: 'signed' };
  const pending = { title: 'Approve', line: 'Signed on this phone', warn: 'not sent yet', kind: 'pending' };
  const unknown = { title: 'Approve', line: 'Needs connection', warn: null, kind: 'unknown' };
  const issued = { status: 'issued', bill: { id: 4, status: 'issued' } };
  const draft = { status: 'draft', bill: { id: 4, status: 'draft' } };
  const diag = { ...VISIT, visit_kind: 'diagnostics' };
  assert.equal(approveTileAfterIssue(none, diag, issued), null);
  assert.equal(approveTileAfterIssue(unknown, diag, issued), null);
  assert.equal(approveTileAfterIssue(none, { ...VISIT, visit_kind: 'recall' }, issued), null);
  assert.equal(approveTileAfterIssue(signed, diag, issued), signed);
  assert.equal(approveTileAfterIssue(pending, diag, issued), pending);
  // before the issue it stays (a repair on the spot), and a repair keeps it as it was
  assert.equal(approveTileAfterIssue(none, diag, draft), none);
  assert.equal(approveTileAfterIssue(none, diag, null), none);
  assert.equal(approveTileAfterIssue(none, diag, { status: 'unknown', bill: null }), none);
  assert.equal(approveTileAfterIssue(none, { ...VISIT, visit_kind: 'repair' }, issued), none);
  assert.equal(approveTileAfterIssue(null, diag, issued), null);
});

test('a refusal in words: offline keeps it, amount or terms changed — the customer signs again', () => {
  assert.equal(approveError(new Error('Network Error')).kind, 'offline');
  assert.deepEqual(approveError(err(409, { code: 'amount_changed', amount_cents: 26000 })), { kind: 'resign', text: `${RESIGN_WORDS} It is $260.00 now.`, amount: 26000 });
  assert.equal(approveError(err(409, { code: 'amount_changed' })).text, RESIGN_WORDS);
  assert.equal(approveError(err(409, { code: 'terms_changed', terms_version_id: 5 })).kind, 'resign');
  assert.equal(approveError(err(409, { code: 'no_draft' })).kind, 'refused');
  assert.match(approveError(err(400, { code: 'estimate_choice_missing' })).text, /written estimate/);
  assert.deepEqual(approveError(err(403, { error: 'Only the main technician of the visit takes the customer\'s signature' })),
    { kind: 'refused', text: 'Only the main technician of the visit takes the customer\'s signature.' });
  assert.equal(approveError(err(404, { error: 'Visit not found' })).kind, 'gone');
  assert.equal(approveError(err(500)).kind, 'failed');
  assert.equal(copyName({ id: 412 }), 'approval-412.pdf');
});

test('a different written-estimate choice after the signature is drawn wipes it', () => {
  assert.deepEqual(pickEstimate(null, 'written', false), { estimate: 'written', clear: false });
  assert.deepEqual(pickEstimate('written', 'waived', true), { estimate: 'waived', clear: true });
  assert.deepEqual(pickEstimate('written', 'waived', false), { estimate: 'waived', clear: false });
  assert.deepEqual(pickEstimate('waived', 'waived', true), { estimate: 'waived', clear: false });
});

test('signed_at (13г): the phone\'s moment as ISO in UTC; none for no moment', () => {
  assert.equal(signedAtOf(Date.parse('2026-11-17T10:00:00-05:00')), '2026-11-17T15:00:00.000Z');
  assert.equal(signedAtOf(NaN), null);
  assert.equal(signedAtOf(undefined), null);
  assert.equal(signedAtOf(0), null);
  assert.deepEqual(withSignedAt({ a: 1 }, Date.parse('2026-11-17T15:00:00Z')), { a: 1, signed_at: '2026-11-17T15:00:00.000Z' });
  assert.deepEqual(withSignedAt({ a: 1 }, null), { a: 1 });
});

const NOW = Date.parse('2026-11-17T15:00:00Z');
const outOfBounds = (date) => ({ response: { status: 400, headers: date === undefined ? {} : { date }, data: { code: 'signed_at_out_of_bounds', error: 'signed_at is out of bounds: not later than now…' } } });

test('400 signed_at_out_of_bounds: its own kind; the clock blamed only when the server\'s Date says so', () => {
  // the server's Date 10 min after this phone's clock: off
  const off = approveError(outOfBounds(new Date(NOW + 10 * 60000).toUTCString()), NOW);
  assert.deepEqual([off.kind, off.clock], ['clock', true]);
  assert.equal(off.text, `The phone’s clock was off when it was signed. ${CLOCK_QUEUED_WORDS}`);
  // 1 min apart: the clock agrees
  const fine = approveError(outOfBounds(new Date(NOW - 60000).toUTCString()), NOW);
  assert.deepEqual([fine.kind, fine.clock, fine.text], ['clock', false, CLOCK_QUEUED_WORDS]);
  // no Date header: not known
  assert.equal(approveError(outOfBounds(undefined), NOW).clock, null);
  assert.equal(approveError(outOfBounds('junk'), NOW).clock, null);
  // the words never say «server» or the field's name
  for (const f of [off, fine]) assert.doesNotMatch(f.text, /server|signed_at/i);
  // another 400 stays a refusal with the server's words
  assert.equal(approveError({ response: { status: 400, data: { error: 'Something else' } } }).kind, 'refused');
});

test('clockOff: more than 2 min either way', () => {
  const at = (ms) => ({ response: { headers: { date: new Date(ms).toUTCString() } } });
  assert.equal(clockOff(at(NOW + CLOCK_SKEW_MS + 1000), NOW), true);
  assert.equal(clockOff(at(NOW - CLOCK_SKEW_MS - 1000), NOW), true);
  assert.equal(clockOff(at(NOW + CLOCK_SKEW_MS - 1000), NOW), false);
  assert.equal(clockOff({ response: { headers: { Date: new Date(NOW).toUTCString() } } }, NOW), false);
  assert.equal(clockOff(null, NOW), null);
  assert.equal(queuedClockText(null), CLOCK_QUEUED_WORDS);
});

test('right after Approve: the clock, a visit not started, or the words for both', () => {
  assert.equal(clockBoxNow({ clock: true }, { omw_at: null }).title, 'Signature not saved: the phone’s clock is off');
  assert.equal(clockBoxNow({ clock: true }, { omw_at: null }).text, 'Set the date and time to automatic in the phone’s settings. Then ask the customer to sign again.');
  assert.deepEqual(clockBoxNow({ clock: false }, { omw_at: null }),
    { title: 'Signature not saved: the visit hasn’t started', text: 'Tap On my way, then ask the customer to sign again.' });
  const general = { title: 'Signature not saved: its time doesn’t fit this visit', text: 'Check that the phone’s date and time are automatic and the visit is marked On my way. Then ask the customer to sign again.' };
  // On my way pressed and the clock agrees: neither is known
  assert.deepEqual(clockBoxNow({ clock: false }, { omw_at: '2026-11-17T14:00:00Z' }), general);
  // the clock not known: not blamed, and the visit's start not blamed either
  assert.deepEqual(clockBoxNow({ clock: null }, { omw_at: null }), general);
  assert.deepEqual(clockBoxNow({ clock: false }, null), general);
});

// USABILITY_2026-11-24 §6, QA Б5: the head over a new signature
test('signHead: the first signature before the work; a new one for the new total, after the work once the visit is finished', () => {
  assert.equal(signHead(null, { status: 'completed' }), 'BEFORE WORK · THE CUSTOMER AGREES TO');
  assert.equal(signHead(null, null), 'BEFORE WORK · THE CUSTOMER AGREES TO');
  assert.equal(signHead({ id: 3 }, { status: 'completed' }), 'THE WORK IS DONE · THE CUSTOMER AGREES TO THE NEW TOTAL');
  assert.equal(signHead({ id: 3 }, { status: 'in_progress' }), 'BEFORE WORK · THE CUSTOMER AGREES TO THE NEW TOTAL');
  assert.equal(signHead({ id: 3 }, null), 'BEFORE WORK · THE CUSTOMER AGREES TO THE NEW TOTAL');
});

// «Архитектор ПО» on #87: a new NYC signature after the work keeps the earlier answer about the
// written estimate, said in a line — never asked again, never copied silently
test('keptEstimate: after Finish the earlier answer goes with the new signature, in words', () => {
  const done = { status: 'completed' };
  const earlier = { id: 3, estimate_choice: 'waived', estimate_price_cents: 0, authorized_at: '2026-11-20 11:31:00' };
  assert.deepEqual(keptEstimate(earlier, done, 'nyc_20'),
    { choice: 'waived', price: 0, text: 'No, not needed — chosen before the work, Nov 20.' });
  assert.deepEqual(keptEstimate({ ...earlier, estimate_choice: 'written', estimate_price_cents: 4500 }, done, 'nyc_20'),
    { choice: 'written', price: 4500, text: 'Yes, asked for ($45.00) — chosen before the work, Nov 20.' });
  assert.equal(keptEstimate({ ...earlier, estimate_choice: 'written' }, done, 'nyc_20').text, 'Yes, asked for (free) — chosen before the work, Nov 20.');
  // the day the customer signed on the phone comes first; UTC late evening is still Nov 20 in New York
  assert.equal(keptEstimate({ ...earlier, signed_on_device_at: '2026-11-21T02:10:00.000Z', authorized_at: '2026-11-21T09:00:00.000Z' }, done, 'nyc_20').text,
    'No, not needed — chosen before the work, Nov 20.');
});

test('keptEstimate: asked as before — no earlier answer, not finished, not NYC', () => {
  const done = { status: 'completed' };
  const earlier = { id: 3, estimate_choice: 'waived', estimate_price_cents: 0, authorized_at: '2026-11-20 11:31:00' };
  assert.equal(keptEstimate(null, done, 'nyc_20'), null);
  assert.equal(keptEstimate(earlier, { status: 'in_progress' }, 'nyc_20'), null);
  assert.equal(keptEstimate(earlier, null, 'nyc_20'), null);
  assert.equal(keptEstimate(earlier, done, 'nj_any'), null);
  // an earlier approval without the choice (by phone, before the rule): ask
  assert.equal(keptEstimate({ ...earlier, estimate_choice: null }, done, 'nyc_20'), null);
  assert.equal(keptEstimate({ ...earlier, estimate_price_cents: null }, done, 'nyc_20'), null);
});

test('authBody: the kept answer goes as the estimate choice of the new signature', () => {
  const kept = keptEstimate({ id: 3, estimate_choice: 'waived', estimate_price_cents: 0, authorized_at: '2026-11-20 11:31:00' }, { status: 'completed' }, 'nyc_20');
  const { body } = authBody({ name: 'Sanjay Patel', png: 'data:image/png;base64,AA==', agreed: { amount: 30500 }, terms: null, rule: 'nyc_20',
    estimate: { choice: kept.choice, price: kept.price }, requestId: 'r1' });
  assert.equal(body.estimate_choice, 'waived');
  assert.equal(body.estimate_price_cents, 0);
});
