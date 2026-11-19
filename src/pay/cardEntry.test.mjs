import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyOf } from './model.js';
import {
  NOT_CONFIRMED, ackHint, canEnterCard, cardChangeable, cardError, cardReopen, confirmStep, cardLine, cardTipChoices, cardTips, consentText, dropEntry, entryLocked, entryOf, entryTipLock, forgetEntry,
  intentBody, intentOutcome, makeConfirmHandler, noAnswer, paidLine, pickSdk, sdkFailure, sheetError, startEntry,
} from './cardEntry.js';

const err = (status, data = {}) => ({ response: { status, data } });

test('the button: the server\'s card flag and a build with Stripe\'s native module', () => {
  const bill = { online_payments: { link: true, card: true } };
  assert.equal(canEnterCard(bill, true), true);
  assert.equal(canEnterCard(bill, false), false);                       // an older build: no button
  assert.equal(canEnterCard({ online_payments: { link: true, card: false } }, true), false);
  assert.equal(canEnterCard({ online_payments: { card: 'yes' } }, true), false);
  assert.equal(canEnterCard({}, true), false);
  assert.equal(canEnterCard(null, true), false);
});

test('an older build: the package is never loaded without its native module, and a throw is no crash', () => {
  let loaded = 0;
  const load = () => { loaded += 1; return { initStripe() {} }; };
  assert.equal(pickSdk({ get: () => null, load }), null);
  assert.equal(loaded, 0, 'not required without the module (it throws on import there)');
  assert.ok(pickSdk({ get: (n) => (n === 'StripeSdk' ? {} : null), load }));
  assert.equal(loaded, 1);
  assert.equal(pickSdk({ get: () => { throw new Error('no registry'); }, load }), null);
  assert.equal(pickSdk({ get: () => ({}), load: () => { throw new Error('getEnforcing'); } }), null);
  assert.equal(pickSdk({ load }), null);
});

test('the consent is the server\'s words exactly (cardEntry.js consentText)', () => {
  assert.equal(consentText('SEMIX CORP', 17529, 1000), 'I authorize SEMIX CORP to charge $185.29 (bill $175.29 + tip $10.00) to this card.');
  assert.equal(consentText('SEMIX CORP', 17529, 0), 'I authorize SEMIX CORP to charge $175.29 to this card.');
  assert.equal(consentText('SEMIX NJ LLC', 123450, 5), 'I authorize SEMIX NJ LLC to charge $1,234.55 (bill $1,234.50 + tip $0.05) to this card.');
  assert.equal(consentText(' A ', 100000000, 0), 'I authorize A to charge $1,000,000.00 to this card.');
});

test('the server\'s own template gives the same text (its usd: toLocaleString en-US)', () => {
  const serverUsd = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const server = (company, a, t) => (t > 0 ? `I authorize ${company} to charge ${serverUsd(a + t)} (bill ${serverUsd(a)} + tip ${serverUsd(t)}) to this card.`
    : `I authorize ${company} to charge ${serverUsd(a)} to this card.`);
  for (const [a, t] of [[1, 0], [99, 1], [17529, 1000], [123450, 5], [999999, 1], [100000000, 2500], [5, 0], [1000000, 0]]) {
    assert.equal(consentText('SEMIX CORP', a, t), server('SEMIX CORP', a, t), `${a} + ${t}`);
  }
});

test('tips by card: you, or split with the helper; never «the whole team»', () => {
  const visit = { helper_id: 7, helper_name: 'Alex Kim' };
  assert.deepEqual(cardTipChoices(visit, 'Ivan Petrov').map((c) => c.key), ['me', 'split']);
  assert.deepEqual(cardTipChoices({}, 'Ivan Petrov').map((c) => c.key), ['me']);
  assert.deepEqual(cardTips(1000, 'me', visit, 3), [{ user_id: 3, cents: 1000 }]);
  assert.deepEqual(cardTips(1001, 'split', visit, 3), [{ user_id: 3, cents: 501 }, { user_id: 7, cents: 500 }]);
  assert.deepEqual(cardTips(1, 'split', visit, 3), [{ user_id: 3, cents: 1 }]);
  assert.deepEqual(cardTips(1000, 'split', {}, 3), [{ user_id: 3, cents: 1000 }]);
  assert.deepEqual(cardTips(0, 'me', visit, 3), []);
  assert.deepEqual(cardTips(1000, 'me', visit, null), []);
});

test('the attempt lives by bill; locked once card-intent went out; Pay forgets only one never sent', () => {
  const a = startEntry(41, { requestId: 'app-x-1', amountCents: 17529, tipCents: 1000, forKey: 'me' });
  assert.equal(entryOf(41), a);
  assert.equal(entryLocked(a), false);
  assert.equal(entryTipLock(a), null);
  forgetEntry(41);
  assert.equal(entryOf(41), null, 'not sent: forgotten');
  const b = startEntry(41, { requestId: 'app-x-2', amountCents: 17529, tipCents: 1000, forKey: 'me' });
  b.sent = true;
  forgetEntry(41);
  assert.equal(entryOf(41), b, 'sent: kept');
  const lock = entryTipLock(b, [{ key: 'b10', cents: 1000 }]);
  assert.equal(lock.picked, 'b10');
  assert.equal(lock.cents, 17529);
  assert.equal(entryTipLock({ ...b, tipCents: 0 }).picked, 'none');
  assert.equal(entryTipLock({ ...b, tipCents: 750 }).typed, '7.50');
  for (const flag of ['sent', 'uncertain', 'going']) assert.equal(entryLocked({ [flag]: true }), true, flag);
  dropEntry(41);
  assert.equal(entryOf(41), null);
});

test('card-intent body', () => {
  const attempt = { paymentMethodId: 'pm_123456', amountCents: 17529, requestId: 'app-x-3', signatureFileId: 9 };
  assert.deepEqual(intentBody({ attempt, tips: [{ user_id: 3, cents: 1000 }], signerName: '  Marta Kowalski ', consent: 'I authorize …' }), {
    payment_method_id: 'pm_123456', amount_cents: 17529, tips: [{ user_id: 3, cents: 1000 }], client_request_id: 'app-x-3',
    signature_file_id: 9, signer_name: 'Marta Kowalski', consent_text: 'I authorize …',
  });
});

test('the retry rule: confirm only a fresh open answer; succeeded / processing — never twice', () => {
  for (const status of ['requires_payment_method', 'requires_confirmation', 'requires_action']) {
    assert.deepEqual(intentOutcome({ status, client_secret: 'pi_1_secret_x' }), { kind: 'confirm', clientSecret: 'pi_1_secret_x' }, status);
  }
  assert.deepEqual(intentOutcome({ status: 'succeeded', client_secret: null }), { kind: 'going' });
  assert.deepEqual(intentOutcome({ status: 'processing', client_secret: 'pi_1_secret_x' }), { kind: 'going' }, 'processing: not confirmed even with a secret');
  assert.deepEqual(intentOutcome({ status: 'requires_payment_method', client_secret: null }), { kind: 'closed' }, 'open without a secret: not confirmed');
  assert.deepEqual(intentOutcome({ status: 'canceled', client_secret: 'pi_1_secret_x' }), { kind: 'closed' });
  assert.deepEqual(intentOutcome(null), { kind: 'closed' });
});

test('the server\'s no: what the screen does next', () => {
  assert.deepEqual([cardError(new Error('Network Error')).next, noAnswer(new Error('x'))], ['retry', true]);
  assert.equal(noAnswer(err(502)), true);
  assert.equal(noAnswer(err(409)), false);
  const changed = cardError(err(409, { code: 'balance_changed', balance_cents: 4000 }));
  assert.equal(changed.next, 'restart');
  assert.match(changed.text, /\$40\.00 now/);
  assert.equal(cardError(err(409, { code: 'attempt_closed' })).next, 'again');
  assert.equal(cardError(err(409, { code: 'payment_processing' })).next, 'wait');
  assert.equal(cardError(err(400, { code: 'consent_text_mismatch' })).next, 'again');
  for (const code of ['signature_stale', 'signature_used', 'signature_unknown', 'request_used']) assert.equal(cardError(err(409, { code })).next, 'again', code);
  assert.equal(cardError(err(409, { code: 'card_entry_off' })).next, null);
  assert.match(cardError(err(503, { code: 'publishable_key_off' })).text, /not set up/);
  assert.equal(cardError(err(409, { code: 'nothing_due' })).next, 'restart');
  assert.equal(cardError(err(502, { code: 'stripe_error', error: 'Stripe: Your card was declined.' })).text, 'Stripe: Your card was declined.');
  assert.equal(cardError(err(404)).kind, 'gone');
  assert.equal(cardError(err(500)).next, 'retry');
  // exactly 500 is «no answer» too: the next press asks again with the same id (the Teamlead on #66)
  assert.equal(cardError(err(500)).kind, 'failed');
  assert.equal(noAnswer(err(500)), true);
  assert.equal(noAnswer(err(499)), false);
  assert.equal(cardError(err(400, { error: 'signer_name is required: who signed' })).text, 'signer_name is required: who signed.');
});

test('the confirm handler: a lost answer, then the retry with the same ids; never a kept secret', async () => {
  const attempt = { requestId: 'app-r-1', amountCents: 17529, tipCents: 1000, tips: [{ user_id: 3, cents: 1000 }], signer: 'Marta K', consent: 'I authorize …', signatureFileId: 9, paymentMethodId: null, sent: false, uncertain: false, going: false };
  const sent = [];
  let answer;
  const handler = makeConfirmHandler({ getAttempt: () => attempt, sendIntent: async (body) => { sent.push(body); return answer(); } });
  const run = () => new Promise((resolve) => handler({ id: `pm_card${sent.length}` }, false, resolve));

  // not pressed Charge: nothing is asked
  assert.equal((await run()).error.message, NOT_CONFIRMED);
  assert.equal(sent.length, 0);

  // the first press: no answer — uncertain, locked, nothing confirmed
  attempt.ready = true;
  answer = () => { throw new Error('Network Error'); };
  let got = await run();
  assert.equal(got.error.message, NOT_CONFIRMED);
  assert.deepEqual([attempt.uncertain, attempt.sent, attempt.outcome.error.next], [true, true, 'retry']);
  assert.equal(sent[0].payment_method_id, 'pm_card0');

  // the retry: the same request id and the first card's id, though the sheet made a new one
  attempt.ready = true;
  answer = () => ({ status: 'requires_payment_method', client_secret: 'pi_9_secret_fresh' });
  got = await run();
  assert.deepEqual(got, { clientSecret: 'pi_9_secret_fresh' });
  assert.equal(sent[1].client_request_id, 'app-r-1');
  assert.equal(sent[1].payment_method_id, 'pm_card0');
  assert.equal(attempt.uncertain, false);
  assert.equal(attempt.ready, false, 'one press, one ask');

  // the payment went through meanwhile: never confirmed again
  attempt.ready = true;
  answer = () => ({ status: 'succeeded', client_secret: null });
  got = await run();
  assert.equal(got.error.message, NOT_CONFIRMED);
  assert.deepEqual([attempt.going, attempt.sent, attempt.outcome.kind], [true, true, 'going']);
});

test('the confirm handler: a clear no unlocks; payment_processing keeps the lock', async () => {
  const make = (status, data) => {
    const attempt = { requestId: 'app-r-2', amountCents: 100, tips: [], signer: 'A', consent: 'x', signatureFileId: 1, paymentMethodId: null, ready: true };
    const handler = makeConfirmHandler({ getAttempt: () => attempt, sendIntent: async () => { throw err(status, data); } });
    return new Promise((resolve) => handler({ id: 'pm_x1234567' }, false, () => resolve(attempt)));
  };
  let a = await make(409, { code: 'attempt_closed' });
  assert.deepEqual([a.sent, a.uncertain, a.outcome.error.next], [false, false, 'again']);
  a = await make(409, { code: 'payment_processing' });
  assert.deepEqual([a.sent, a.outcome.error.next], [true, 'wait']);
  a = await make(503, {});
  assert.deepEqual([a.sent, a.uncertain], [true, true]);
  const closed = { requestId: 'app-r-3', amountCents: 100, tips: [], signer: 'A', consent: 'x', signatureFileId: 1, ready: true };
  await new Promise((resolve) => makeConfirmHandler({ getAttempt: () => closed, sendIntent: async () => ({ status: 'canceled' }) })({ id: 'pm_x' }, false, resolve));
  assert.deepEqual([closed.sent, closed.outcome.kind], [false, 'closed']);
});

test('the sheet: closed by the customer is not an error; the card line', () => {
  assert.equal(sheetError({}), null);
  assert.equal(sheetError({ error: { code: 'Canceled', message: 'x' } }), null);
  assert.equal(sheetError({ error: { code: 'Failed', message: 'Your card was declined.' } }), 'Your card was declined.');
  assert.match(sheetError({ error: { code: 'Failed' } }), /did not open/);
  assert.equal(cardLine({ label: 'Visa •••• 4242', image: '' }), 'Visa ···· 4242');
  assert.equal(cardLine(null), null);
  assert.equal(typeof NOT_CONFIRMED, 'string');
});

test('history: a card taken in the app is «Card · in app» with who took it; by the link «Card · online»', () => {
  const at = '2026-11-18T19:05:00Z';
  const [app, tip, link] = historyOf({ payments: [
    { id: 1, kind: 'payment', method: 'card', online: true, amount_cents: 19598, recorded_by_name: 'Ivan Petrov', received_at: at },
    { id: 2, kind: 'tip', method: 'card', online: true, amount_cents: 500, recorded_by_name: 'Ivan Petrov', tip_for_name: 'Nia Test', received_at: at },
    { id: 3, kind: 'payment', method: 'card', online: true, amount_cents: 100, recorded_by_name: 'Online payment', received_at: at },
  ] }, Date.now());
  assert.match(app.title, /Card · in app$/);
  assert.equal(app.sub, 'Ivan P.');
  assert.match(tip.title, /Tip for Nia T\. · Card · in app$/);
  assert.match(link.title, /Card · online$/);
  assert.equal(link.sub, '');
});

test('the SDK failed after the secret: a clear no of the card opens a new attempt; anything else stays locked, no SDK words', () => {
  assert.equal(sdkFailure(null), null);
  const declined = sdkFailure({ code: 'Failed', declineCode: 'insufficient_funds', localizedMessage: 'Your card has insufficient funds.' });
  assert.equal(declined.kind, 'declined');
  assert.match(declined.text, /^Your card has insufficient funds\. Enter the card again/);
  assert.equal(sdkFailure({ code: 'Failed', type: 'card_error' }).kind, 'declined');
  assert.equal(sdkFailure({ code: 'Failed', stripeErrorCode: 'payment_intent_authentication_failure' }).kind, 'declined', '3-D Secure failed');
  assert.match(sdkFailure({ code: 'Failed', stripeErrorCode: 'card_declined' }).text, /^The card was declined\./);
  const unclear = sdkFailure({ code: 'Failed', message: 'The Internet connection appears to be offline.', stripeErrorCode: null });
  assert.equal(unclear.kind, 'unclear');
  assert.doesNotMatch(unclear.text, /Internet/);
  assert.match(unclear.text, /never charged twice/);
  assert.equal(sdkFailure({ code: 'Timeout' }).kind, 'unclear');
  assert.equal(sdkFailure({ code: 'Canceled' }).kind, 'unclear', 'closed 3-D Secure: ask the server first');
});

test('the result: one sum as charged, the bill and the tip inside', () => {
  assert.equal(paidLine(19598, 19598, 1000), 'Paid $205.98 by card: bill $195.98 + tip $10.00.');
  assert.equal(paidLine(19598, 19598, 0), 'Paid $195.98 by card.');
  assert.equal(paidLine(20598, 19598, 1000), 'Paid $205.98 by card.', 'Stripe took another sum: one payment, no tips');
});

test('after the sheet\'s confirm: what the screen does', () => {
  const failed = { error: { code: 'Failed', message: 'x' } };
  assert.deepEqual(confirmStep({}, { kind: 'confirm', clientSecret: 's' }), { step: 'wait' }, 'confirmed');
  assert.deepEqual(confirmStep(failed, { kind: 'going' }), { step: 'wait' }, 'the server: going');
  assert.equal(confirmStep(failed, { kind: 'closed' }).step, 'again');
  const no = cardError(err(409, { code: 'attempt_closed' }));
  assert.deepEqual(confirmStep(failed, { kind: 'error', error: no }), { step: 'refusal', error: no });
  // the sheet failed before our handler (no outcome): the form's words, nothing locked by it (the Architect on #66)
  const form = confirmStep(failed, null);
  assert.equal(form.step, 'form');
  assert.equal(form.text, 'The card form failed. Try again.');
  assert.doesNotMatch(form.text, /No answer from Stripe/);
  // after our client_secret: a clear no of the card — again; anything else — unclear
  assert.equal(confirmStep({ error: { code: 'Failed', declineCode: 'card_declined' } }, { kind: 'confirm', clientSecret: 's' }).step, 'again');
  const unclear = confirmStep({ error: { code: 'Timeout' } }, { kind: 'confirm', clientSecret: 's' });
  assert.equal(unclear.step, 'unclear');
  assert.match(unclear.text, /^No answer from Stripe/);
});

test('an unclear confirm: no «Change» until the server answers; a new attempt clears it', () => {
  const a = startEntry(4401, { requestId: 'r1', amountCents: 1000, tipCents: 0, forKey: 'me' });
  assert.equal(a.unclear, false);
  assert.equal(a.card, null);
  assert.equal(cardChangeable(a), true, 'a new attempt');
  a.sent = true;
  a.uncertain = true;
  assert.equal(cardChangeable(a), true, 'card-intent had no answer, no secret went to the SDK: Change is a new attempt, safe');
  a.unclear = true;
  assert.equal(cardChangeable(a), false, 'the SDK may have charged with our secret: only Charge decides');
  assert.equal(cardChangeable(null), true);
  assert.equal(a.formLost, false);
  // the sheet lost while unclear: the card again, but on the same attempt — never a new one (the Architect on #67)
  a.formLost = true;
  assert.equal(cardChangeable(a), true);
  assert.equal(cardReopen(a), 'same');
  a.unclear = false;
  a.formLost = false;
  assert.equal(cardReopen(a), 'again', 'sent, the secret never reached the SDK: a new attempt');
  a.sent = false;
  a.uncertain = false;
  assert.equal(cardReopen(a), null, 'nothing sent');
  dropEntry(4401);
});

test('the hint when the bill is not signed «after the work»', () => {
  const hint = ackHint(null);
  assert.equal(hint.link, 'Customer signs for the bill');
  assert.match(hint.text, /does not need it/);
  assert.equal(ackHint({ id: 1, signer_name: 'Ann' }), null, 'signed');
  assert.equal(ackHint(undefined), null, 'not known: no hint');
});
