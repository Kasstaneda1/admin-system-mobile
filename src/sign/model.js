// The customer signs on the whole screen (design tech-app USABILITY_2026-11-24 §3, picture
// shots/usab-u3-sign.png): «Sign» on the form opens sign/SignSheet.js — what and how much they
// sign on top, the box on almost the whole screen, «Done · save the signature» at the bottom.
// Nothing scrolls there, so every touch is ink. One screen for both signatures: Approve (before
// the work) and «Customer signs for the bill» (Ack, after). Without React Native (model.test.mjs
// runs it on node).
//
// Over the box, the terms the customer agrees to by signing (consentOf): Ack — the terms the bill
// printed (2P-BE п. 4, design-mockups/bill-terms README: «By signing, you agree to the Terms and
// conditions of bill NY-1052.» and «Read the terms») and the company's acknowledgment terms;
// Approve — the company's approval terms. The body of the signature does not change (the bill's
// pdf_sha256 and the terms' version tie it to them).
import { usd } from '../bill/model.js';
import { partsOf } from '../ack/model.js';

// The ink that makes a signature, in the box's points, all strokes together: about 2 cm on a
// phone (≈ 155 points an inch). A dot or the start of a scroll is not a signature (QA Б2).
export const MIN_INK = 120;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// '2026-11-24' → 'Nov 24, 2026'
export function dayText(date) {
  const [y, m, d] = String(date || '').split('-').map(Number);
  if (!y || !m || !d || m > 12) return '';
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

const billLabel = (bill) => (bill && (bill.label || (bill.bill_number ? `#${bill.bill_number}` : ''))) || '';

// What the customer chose on the form, in their words, under what they sign (the Designer on #93:
// the signature stands under these words — giving the parts up is only in writing, NYC §2-259):
//   approve: the written estimate — 'waived' | 'written'; ack: the replaced parts — 'returned' |
//   'waived' ('none' has no words of its own). Nothing chosen — null.
const ESTIMATE_WORDS = {
  waived: 'No written estimate. Go ahead with the repair.',
  written: 'I want a written estimate first.',
};
export function choiceWords(kind, choice) {
  const words = kind === 'approve' ? ESTIMATE_WORDS[choice] : (partsOf(choice) || {}).words;
  return words ? `“${words}”` : null;
}

// The top of the sign screen: { title: 'Sanjay Patel signs', sub: 'Approves the repair · $305.00 before tax', choice }
//   approve: { kind: 'approve', name, amountCents, choice }   choice: the written estimate's
//   ack:     { kind: 'ack', name, bill, choice }               → 'Got bill NY-1052 · $396.31'; choice: the parts'
export function signHeadOf({ kind, name, amountCents = null, bill = null, choice = null }) {
  const who = String(name || '').trim();
  const title = who ? `${who} signs` : 'The customer signs';
  if (kind === 'approve') {
    return { title, sub: Number.isFinite(amountCents) ? `Approves the repair · ${usd(amountCents)} before tax` : 'Approves the repair', choice: choiceWords(kind, choice) };
  }
  const label = billLabel(bill);
  const total = bill && Number.isFinite(Number(bill.total_cents)) ? usd(Number(bill.total_cents)) : null;
  return { title, sub: [label ? `Got bill ${label}` : 'Got the bill', total].filter(Boolean).join(' · '), choice: choiceWords(kind, choice) };
}

// Under the line in the box: 'Sanjay Patel · Nov 24, 2026'
export const signerLine = (name, today) => [String(name || '').trim(), dayText(today)].filter(Boolean).join(' · ');

// Every set of terms whose version goes with this signature is in sight over it («Архитектор ПО»
// on #93: on the form the box stood under them; the sign screen must show them too):
//   - the terms the issued bill printed (the server's printed_terms; Ack only) — null: a draft, a
//     bill that printed no terms, an older server. Sections with neither title nor text are left
//     out; Replaced parts goes last, as on the paper;
//   - the company's terms of this signature (Approve: approval terms; Ack: acknowledgment terms),
//     latest version — companyTerms(terms, title).
// One line «By signing, you agree to A and to B.» and one «Read the terms» that shows them all;
// none — null: no line, no link. No checkbox: the signature is the agreement.
const clean = (s) => ({
  title: s && typeof s.title === 'string' && s.title.trim() ? s.title.trim() : null,
  text: s && typeof s.text === 'string' && s.text.trim() ? s.text.trim() : null,
});
function printedDoc(bill) {
  const printed = bill && bill.printed_terms;
  if (!printed || typeof printed !== 'object') return null;
  const sections = (Array.isArray(printed.sections) ? printed.sections : []).map(clean).filter((s) => s.title || s.text);
  if (printed.replaced_parts) {
    const parts = clean(printed.replaced_parts);
    if (parts.title || parts.text) sections.push(parts);
  }
  if (!sections.length) return null;
  const label = billLabel(bill);
  const of = label ? `bill ${label}` : 'this bill';
  return { name: `the Terms and conditions of ${of}`, title: 'Terms and conditions', sub: `As printed on ${of}`, sections };
}
// The company's terms (the server's latest version, { title, version, body }) under the title the
// form shows them by (approve/model.js termsLineOf, ack/model.js ackTermsLine); none — null
export function companyTerms(terms, title) {
  if (!terms || !title) return null;
  const body = clean({ text: terms.body });
  return { name: title, title, sub: Number.isFinite(Number(terms.version)) && terms.version !== null ? `Version ${terms.version}` : null, sections: body.text ? [body] : [] };
}
export function consentOf({ bill = null, company = null } = {}) {
  const docs = [printedDoc(bill), company].filter(Boolean);
  if (!docs.length) return null;
  return {
    line: `By signing, you agree to ${docs.map((d) => d.name).join(' and to ')}.`,
    link: 'Read the terms',
    title: docs.length === 1 ? docs[0].title : 'Terms',
    docs: docs.map(({ title, sub, sections }) => ({ title, sub, sections })),
  };
}
