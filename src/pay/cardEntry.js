// «Card details» in the app (ONL-APP2, ONLINE_PAYMENT_SPEC.md §9 п. 2; backend #241): as in
// Housecall Pro — Tip → Card details (Stripe's Payment Sheet, customFlow: the form only takes the
// card) → the customer signs under «I authorize <Company> to charge $X …» → Charge → the result.
// The card number goes from the phone to Stripe only; the app never records the payment: Stripe's
// webhook payment_intent.succeeded writes it (and the tips), the screen waits for it on the bill.
// Without React Native: cardEntry.test.mjs runs it on node.
//
// The server (routes/scheduler/cardEntry.js):
//   GET  …/bill/card-setup     → { publishable_key, stripe_account, merchant_display_name, balance_cents }
//   POST …/bill/card-signature { signature_png } → 201 { file_id }
//   POST …/bill/card-intent    { payment_method_id, amount_cents, tips: [{ user_id, cents }],
//        client_request_id, signature_file_id, signer_name, consent_text } → 201 (new) or 200 (a
//        retry) { status, client_secret }
// The retry rule (§9, the Teamlead on #241): a client_secret kept from before is never confirmed.
// After a send without an answer the next Charge sends card-intent again with the same
// client_request_id, and only a fresh answer with an open status and a client_secret is confirmed;
// succeeded / processing — the payment is going, never charged twice; 409 attempt_closed — a new
// client_request_id and a new signature; 409 balance_changed — the form again for the new amount;
// 409 payment_processing — wait for the result.
import { usd } from '../bill/model.js';
import { firstName } from '../myDay/model.js';
import { helperIdOf, shortPerson } from './model.js';

// ---------- may it be offered ----------
// The server's flag (the company's «Card entry in the app» on, Stripe connected, takes_payments,
// an issued bill with something due) and this build has Stripe's native module (an older build
// runs the same JS without it: no button, never a crash — pay/stripeSdk.js)
export const canEnterCard = (bill, sdkReady) => !!sdkReady && !!(bill && bill.online_payments && bill.online_payments.card === true);

// Stripe's native module in this build: `get` looks a native module up by name without throwing
// (TurboModuleRegistry.get), `load` requires the package. The package itself throws on import
// when the module is missing (getEnforcing), so it is required only after `get` found it.
export function pickSdk({ get, load }) {
  try {
    if (!get || !get('StripeSdk')) return null;
    return load() || null;
  } catch (e) {
    return null;
  }
}

// ---------- the words the customer signs under ----------
// Exactly the server's consentText (cardEntry.js): it compares and refuses another text (400
// consent_text_mismatch). Dollars as usd(): $1,234.50.
export function consentText(company, amountCents, tipsCents) {
  const name = String(company || '').trim() || 'the company';
  if (tipsCents > 0) {
    return `I authorize ${name} to charge ${usd(amountCents + tipsCents)} (bill ${usd(amountCents)} + tip ${usd(tipsCents)}) to this card.`;
  }
  return `I authorize ${name} to charge ${usd(amountCents)} to this card.`;
}

// ---------- the tip by card ----------
// Who gets a tip by card: the main technician (you) or split with the helper — the server takes
// only these two people (tip_person), so «The whole team» is not offered here
export function cardTipChoices(visit, meName) {
  const me = shortPerson(meName) || firstName(meName) || 'You';
  const out = [{ key: 'me', title: `${me} · you`, sub: 'The main technician of this visit' }];
  if (helperIdOf(visit)) out.push({ key: 'split', title: 'Split with the helper', sub: `Half for you, half for ${firstName(visit.helper_name) || 'the helper'}` });
  return out;
}
// The tips of card-intent: [{ user_id, cents }]. Split: half each, the odd cent to you.
export function cardTips(cents, forKey, visit, meId) {
  if (!(cents > 0) || !Number.isInteger(meId)) return [];
  const helper = helperIdOf(visit);
  if (forKey === 'split' && helper) {
    const half = Math.floor(cents / 2);
    return [{ user_id: meId, cents: cents - half }, ...(half > 0 ? [{ user_id: helper, cents: half }] : [])];
  }
  return [{ user_id: meId, cents }];
}

// ---------- the attempt (in memory by bill, as pay/attempts.js) ----------
// { billId, requestId, amountCents, tipCents, forKey, signatureFileId, paymentMethodId,
//   sent: card-intent went out (the tip and the amount do not change now), uncertain: its answer
//   was lost, going: the server said the payment is on its way, unclear: the SDK's confirm of our
//   client_secret failed without a clear no of the card — it may have charged, so only Charge
//   (the server) decides now: no «Change», no new attempt from the screen (the Architect on #66),
//   formLost: while unclear, the SDK's sheet failed before our handler (it was lost or set up
//   for another bill) — the card may be entered again on the same attempt, the same ids,
//   card: the card line the sheet took, kept for the screen coming back }
const attempts = new Map();
export const entryOf = (billId) => attempts.get(billId) || null;
export function startEntry(billId, { requestId, amountCents, tipCents, forKey }) {
  const attempt = { billId, requestId, amountCents, tipCents, forKey, signatureFileId: null, paymentMethodId: null, sent: false, uncertain: false, going: false, unclear: false, formLost: false, card: null };
  attempts.set(billId, attempt);
  return attempt;
}
export function dropEntry(billId) { attempts.delete(billId); }
// Pay read the bill again: an attempt that never reached the server is forgotten; one that did
// (or may have) stays until the result is known
export function forgetEntry(billId) {
  const attempt = attempts.get(billId);
  if (attempt && !attempt.sent && !attempt.uncertain) attempts.delete(billId);
}
// May the amount, the tip, the card or the signature still change: not after card-intent went out
export const entryLocked = (attempt) => !!attempt && (attempt.sent || attempt.uncertain || attempt.going);
// The tip screen of a locked attempt: the tip that went, as lockedTipOf of pay/attempts.js
export function entryTipLock(attempt, buttons = []) {
  if (!entryLocked(attempt)) return null;
  const { amountCents: cents, tipCents } = attempt;
  const button = tipCents > 0 ? buttons.find((b) => b.cents === tipCents) : null;
  const picked = tipCents === 0 ? 'none' : button ? button.key : 'custom';
  return {
    picked,
    typed: picked === 'custom' ? (tipCents / 100).toFixed(2) : '',
    cents,
    tipCents,
    title: `Tip ${usd(tipCents)} is locked`,
    text: `The card charge of ${usd(cents + tipCents)} was sent to Stripe. Wait for its result; the tip cannot change now.`,
  };
}

// ---------- card-intent ----------
export function intentBody({ attempt, tips, signerName, consent }) {
  return {
    payment_method_id: attempt.paymentMethodId,
    amount_cents: attempt.amountCents,
    tips,
    client_request_id: attempt.requestId,
    signature_file_id: attempt.signatureFileId,
    signer_name: String(signerName || '').trim().slice(0, 200),
    consent_text: consent,
  };
}

const OPEN = ['requires_payment_method', 'requires_confirmation', 'requires_action'];
// The answer of card-intent (201 new, 200 a retry): what to do now
//   { kind: 'confirm', clientSecret } — an open PaymentIntent: the SDK confirms it now;
//   { kind: 'going' }                 — succeeded / processing: the payment is on its way, wait;
//   { kind: 'closed' }                — anything else: start again
export function intentOutcome(data) {
  const status = data && data.status;
  if (status === 'succeeded' || status === 'processing') return { kind: 'going' };
  if (OPEN.includes(status) && typeof data.client_secret === 'string' && data.client_secret) return { kind: 'confirm', clientSecret: data.client_secret };
  return { kind: 'closed' };
}

// The server's no (card-setup, card-signature, card-intent), in the technician's words, with what
// the screen does next — next: 'again' (a new request id and a new signature), 'restart' (back to
// Pay: the amount changed), 'wait' (the payment is going), 'retry' (the same press again), null
export function cardError(error) {
  const response = error && error.response;
  const status = response ? response.status : 0;
  const data = (response && response.data) || {};
  const code = data.code || null;
  if (!status) return { kind: 'offline', next: 'retry', text: 'No answer from the server. Press Charge again: the card is never charged twice.' };
  switch (code) {
    case 'balance_changed': return { kind: 'refused', code, next: 'restart', balance: data.balance_cents, text: `The balance is ${usd(data.balance_cents || 0)} now: someone recorded a payment. Start the card payment again.` };
    case 'attempt_closed': return { kind: 'refused', code, next: 'again', text: 'This card charge was closed. Enter the card and sign again.' };
    case 'payment_processing': return { kind: 'refused', code, next: 'wait', text: 'A payment is being processed. Wait for its result.' };
    case 'consent_text_mismatch': return { kind: 'refused', code, next: 'again', text: 'The words above the signature changed. Ask the customer to sign again.' };
    case 'signature_stale': return { kind: 'refused', code, next: 'again', text: 'The signature is older than an hour. Ask the customer to sign again.' };
    case 'signature_used':
    case 'signature_unknown': return { kind: 'refused', code, next: 'again', text: 'Ask the customer to sign again.' };
    case 'request_used': return { kind: 'refused', code, next: 'again', text: 'This press went to another charge. Enter the card and sign again.' };
    case 'card_entry_off': return { kind: 'refused', code, next: null, text: 'Card entry in the app is off for this company. Take the payment another way.' };
    case 'online_payments_unavailable':
    case 'online_payments_off':
    case 'publishable_key_off': return { kind: 'refused', code, next: null, text: 'Card payments are not set up for this company. Take the payment another way.' };
    case 'tip_person': return { kind: 'refused', code, next: null, text: 'A tip by card goes to you or the helper of this visit.' };
    case 'nothing_due': return { kind: 'refused', code, next: 'restart', text: 'Nothing is due on this bill now.' };
    case 'bill_void': return { kind: 'refused', code, next: 'restart', text: 'This bill is void. Take the money on the bill that replaced it.' };
    case 'payments_off': return { kind: 'refused', code, next: null, text: 'Payments are turned off for you. Ask the office.' };
    case 'stripe_error': return { kind: 'refused', code, next: 'retry', text: typeof data.error === 'string' && data.error ? data.error : 'Stripe did not answer. Try again.' };
    default: break;
  }
  if (status === 404) return { kind: 'gone', next: null, text: 'This visit was changed by the office' };
  if (status >= 500) return { kind: 'failed', next: 'retry', text: 'No answer from the server. Press Charge again: the card is never charged twice.' };
  return { kind: 'refused', code, next: null, text: typeof data.error === 'string' && data.error ? `${data.error.replace(/[.\s]*$/, '')}.` : 'The card was not charged.' };
}

// A send that may have gone through: no answer, a timeout, a 5xx — the next press asks again
// with the same client_request_id
export const noAnswer = (error) => {
  const status = error && error.response ? error.response.status : 0;
  return !status || status >= 500;
};

// Stripe's sheet: { error: { code, message } } — the customer closed it (Canceled) is not an error
export function sheetError(result) {
  const error = result && result.error;
  if (!error) return null;
  if (error.code === 'Canceled') return null;
  return typeof error.message === 'string' && error.message ? error.message : 'The card form did not open. Try again.';
}

// The sheet's confirm failed after our client_secret (the Architect on #66). A clear no of the
// card — a decline code, a card error, 3-D Secure failed — means nothing was charged: a new
// attempt (again(), Pay opens). Anything else may have charged: the attempt stays locked and
// the next Charge asks the server first; the SDK's words are not shown then.
const CARD_CODES = ['card_declined', 'expired_card', 'incorrect_cvc', 'invalid_cvc', 'incorrect_number', 'invalid_number', 'invalid_expiry_month',
  'invalid_expiry_year', 'insufficient_funds', 'payment_intent_authentication_failure', 'authentication_required', 'card_not_supported', 'currency_not_supported'];
export function sdkFailure(error) {
  if (!error) return null;
  const words = typeof error.localizedMessage === 'string' && error.localizedMessage ? error.localizedMessage
    : typeof error.message === 'string' && error.message ? error.message : '';
  if (error.declineCode || error.type === 'card_error' || CARD_CODES.includes(error.stripeErrorCode)) {
    return { kind: 'declined', text: `${words ? `${words.replace(/[.\s]*$/, '')}. ` : 'The card was declined. '}Enter the card again or another one; the customer signs again.` };
  }
  return { kind: 'unclear', text: 'No answer from Stripe. Press Charge again: the card is never charged twice.' };
}

// The result, one sum as charged (the Designer on #66): «Paid $205.98 by card: bill $195.98 +
// tip $10.00.» The payment row is the bill's part; when Stripe took another sum the webhook writes
// it all as one payment without tips — then just that sum.
export function paidLine(paidCents, billCents, tipCents) {
  if (tipCents > 0 && paidCents === billCents) return `Paid ${usd(paidCents + tipCents)} by card: bill ${usd(paidCents)} + tip ${usd(tipCents)}.`;
  return `Paid ${usd(paidCents)} by card.`;
}

// The card the sheet took: { label: 'Visa ···· 4242' } from paymentOption, or null
export function cardLine(paymentOption) {
  if (!paymentOption || typeof paymentOption.label !== 'string' || !paymentOption.label) return null;
  return paymentOption.label.replace(/•+/g, '····');
}

// What the screen does after the sheet's confirm (confirmPaymentSheetPayment's result and what
// our handler left in attempt.outcome):
//   { step: 'wait' }           — it went or is going: wait for Stripe's webhook;
//   { step: 'again', text }    — closed, or a clear no of the card: a new attempt, a new signature;
//   { step: 'refusal', error } — the server's no (cardError) — afterRefusal;
//   { step: 'form', text }     — the sheet failed before our handler ran (no outcome): nothing
//                                went to the server, nothing is locked by it (the Architect on #66);
//   { step: 'unclear', text }  — the SDK failed after our client_secret: may have charged
export function confirmStep(result, outcome) {
  const error = result && result.error;
  if (!error || (outcome && outcome.kind === 'going')) return { step: 'wait' };
  if (!outcome) return { step: 'form', text: 'The card form failed. Try again.' };
  if (outcome.kind === 'closed') return { step: 'again', text: 'This card charge was closed. Enter the card and sign again.' };
  if (outcome.kind === 'error') return { step: 'refusal', error: outcome.error };
  const failure = sdkFailure(error);
  if (failure.kind === 'declined') return { step: 'again', text: failure.text };
  return { step: 'unclear', text: failure.text };
}
// May the card be changed on the screen («Change», «Card details»): not while a confirm of our
// client_secret is unclear — the server's answer to the next Charge decides; but when the sheet
// itself is lost then (Charge gives the form's error each time), the card is entered again
// (the Architect on #67)
export const cardChangeable = (attempt) => !attempt || !attempt.unclear || !!attempt.formLost;
// What a new card does to the attempt: 'again' — a sent one starts anew (a new request id, a new
// signature: another card does not go on the old PaymentIntent); 'same' — an unclear one keeps its
// ids and its signature: the next Charge asks the server with them, and its answer decides
// (going — wait, open — the SDK checks the card against it, closed — again); null — nothing to do
export function cardReopen(attempt) {
  if (!entryLocked(attempt)) return null;
  return attempt.unclear ? 'same' : 'again';
}

// The hint above the card when the customer has not signed for the bill «after the work» (§9 п. 2,
// the Architect on #66): the card does not wait for it — no second signature inside the card
// flow — but the signed bill proves the work in a dispute. `ack`: GET …/bill/acknowledgment's
// acknowledgment — null: not signed; undefined: not known (not read, no answer) — no hint then.
export function ackHint(ack) {
  if (ack !== null) return null;
  return {
    title: 'Not signed for the bill yet',
    text: 'The card does not need it, but the customer’s signature for the bill proves the work if the charge is disputed.',
    link: 'Customer signs for the bill',
  };
}

// The marker the confirm handler hands Stripe when our server said not to confirm: the sheet
// fails with it, and the screen knows it was ours, not the bank's
export const NOT_CONFIRMED = 'semix-not-confirmed';
const NOT_CONFIRMED_ERROR = Object.freeze({ code: 'Failed', message: NOT_CONFIRMED, localizedMessage: NOT_CONFIRMED });

// The handler of the sheet's confirm (intentConfiguration.confirmHandler): Stripe calls it with
// the card's PaymentMethod at Charge. It reads the attempt by bill (getAttempt), asks the server
// (sendIntent(body) → card-intent's answer) and hands the SDK a client_secret only on a fresh
// open answer; else it fails the confirm with our marker and leaves attempt.outcome for the
// screen: { kind: 'confirm' | 'going' | 'closed' } or { kind: 'error', error: cardError(…) }.
//   - only after the screen pressed Charge (attempt.ready), once per press;
//   - a retry keeps the first card's PaymentMethod id: the server matches it with the request
//     (request_used otherwise) and answers by the PaymentIntent's state at Stripe;
//   - no answer — attempt.uncertain: the next press asks again with the same ids; a clear no
//     (the server made nothing or cancelled it) unlocks the attempt, but payment_processing.
export function makeConfirmHandler({ getAttempt, sendIntent }) {
  return async (paymentMethod, _save, callback) => {
    const attempt = getAttempt();
    if (!attempt || !attempt.ready) { callback({ error: NOT_CONFIRMED_ERROR }); return; }
    attempt.ready = false;
    if (!attempt.paymentMethodId) attempt.paymentMethodId = paymentMethod && paymentMethod.id;
    attempt.sent = true;
    try {
      const data = await sendIntent(intentBody({ attempt, tips: attempt.tips, signerName: attempt.signer, consent: attempt.consent }));
      attempt.uncertain = false;
      const out = intentOutcome(data);
      attempt.outcome = out;
      if (out.kind === 'confirm') { callback({ clientSecret: out.clientSecret }); return; }
      if (out.kind === 'going') attempt.going = true;
      else attempt.sent = false;
      callback({ error: NOT_CONFIRMED_ERROR });
    } catch (error) {
      const lost = noAnswer(error);
      const no = cardError(error);
      attempt.uncertain = lost;
      if (!lost && no.code !== 'payment_processing') attempt.sent = false;
      attempt.outcome = { kind: 'error', error: no };
      callback({ error: NOT_CONFIRMED_ERROR });
    }
  };
}
