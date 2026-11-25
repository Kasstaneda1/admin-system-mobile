// The customer signs on the whole screen (design tech-app USABILITY_2026-11-24 §3, picture
// shots/usab-u3-sign.png): «Sign» on the form opens sign/SignSheet.js — what and how much they
// sign on top, the box on almost the whole screen, «Done · save the signature» at the bottom.
// Nothing scrolls there, so every touch is ink. One screen for both signatures: Approve (before
// the work) and «Customer signs for the bill» (Ack, after). Without React Native (model.test.mjs
// runs it on node).
//
// Ack: the customer agrees to the terms the bill printed (2P-BE п. 4, design-mockups/bill-terms
// README): the line «By signing, you agree to the Terms and conditions of bill NY-1052.» and
// «Read the terms» — the terms as the bill printed them (the server's printed_terms). No
// checkbox: the signature is the agreement, the words are beside it. printed_terms null — the
// bill printed no terms: no line, no link. The body of the signature does not change (the bill's
// pdf_sha256 ties it to the terms).
import { usd } from '../bill/model.js';

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

// The top of the sign screen: { title: 'Sanjay Patel signs', sub: 'Approves the repair · $305.00 before tax' }
//   approve: { kind: 'approve', name, amountCents }
//   ack:     { kind: 'ack', name, bill }        → 'Got bill NY-1052 · $396.31'
export function signHeadOf({ kind, name, amountCents = null, bill = null }) {
  const who = String(name || '').trim();
  const title = who ? `${who} signs` : 'The customer signs';
  if (kind === 'approve') {
    return { title, sub: Number.isFinite(amountCents) ? `Approves the repair · ${usd(amountCents)} before tax` : 'Approves the repair' };
  }
  const label = billLabel(bill);
  const total = bill && Number.isFinite(Number(bill.total_cents)) ? usd(Number(bill.total_cents)) : null;
  return { title, sub: [label ? `Got bill ${label}` : 'Got the bill', total].filter(Boolean).join(' · ') };
}

// Under the line in the box: 'Sanjay Patel · Nov 24, 2026'
export const signerLine = (name, today) => [String(name || '').trim(), dayText(today)].filter(Boolean).join(' · ');

// The terms the issued bill printed (the server's printed_terms) for the line over the signature
// and «Read the terms»; null — no line: a draft, a bill that printed no terms, an older server.
// Sections with neither title nor text are left out; Replaced parts goes last, as on the paper.
export function consentOf(bill) {
  const printed = bill && bill.printed_terms;
  if (!printed || typeof printed !== 'object') return null;
  const clean = (s) => ({
    title: s && typeof s.title === 'string' && s.title.trim() ? s.title.trim() : null,
    text: s && typeof s.text === 'string' && s.text.trim() ? s.text.trim() : null,
  });
  const sections = (Array.isArray(printed.sections) ? printed.sections : []).map(clean).filter((s) => s.title || s.text);
  if (printed.replaced_parts) {
    const parts = clean(printed.replaced_parts);
    if (parts.title || parts.text) sections.push(parts);
  }
  if (!sections.length) return null;
  const label = billLabel(bill);
  const of = label ? `bill ${label}` : 'this bill';
  return {
    line: `By signing, you agree to the Terms and conditions of ${of}.`,
    link: 'Read the terms',
    title: 'Terms and conditions',
    sub: `As printed on ${of}`,
    sections,
  };
}
