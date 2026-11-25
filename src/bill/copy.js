// How the customer gets their copy of the bill (T3, design-mockups/tech-bill-plain README «NY:
// копия обязательна», shots d2-ny, d5, d6): one choice of the same ways on three screens —
//   - d2-ny: under the signature, when the copy is required («Done · signed»: the copy, then the
//     signature);
//   - d5: before the payment, when the copy is required and not given yet («Email the copy · Get
//     paid»; «Take payment now, send the copy later» skips it);
//   - d6: «Send the bill» (a sheet over the visit, or the Send screen from the bill).
// The ways (the server's: POST …/bill/email { to, consent? }, POST …/bill/delivered { via: handed |
// shared, consent }):
//   - Email the PDF — only when the server sends customer emails now (the bill's can_email, MAIL-1):
//     until the company's email works the row is not there, nothing says «Soon» (the lead, after
//     the Product's HCP_TAP_AUDIT); the address is the job's, «Change» edits it for this bill only;
//   - Share the PDF — iOS sharing from this phone; counts once the sheet says it went; the server
//     takes it with the customer's consent to electronic documents only (the tick);
//   - Printed copy handed;
//   - Show it on this phone — only when the copy is not required: a look, nothing is written.
// Required = Give the bill Required in visit.steps (bill/model giveRequired; the Architect on #97):
// the signature for the bill waits for the copy there (409 not_delivered), «shown» does not count;
// the payment waits for it only by bill_before_payment (Give required and over Collect, pay/model).
// The email consent: the bill does not say whether the job holds one, so the tick is under Email
// always, not ticked — without it the email goes on the consent the job has; none → the server's
// consent_required → «Tick the agreement or choose another way.». Without React Native
// (copy.test.mjs runs it on node).
import { CONSENT_WORDS, giveRequired, percentText, usd } from './model.js';
import { momentWall } from '../myDay/model.js';

export const EMAIL_CONSENT_WORDS = CONSENT_WORDS; // one phrase everywhere (the Designer on #97)
export const SHARE_CONSENT_WORDS = CONSENT_WORDS;
export const LATER_REASON = 'The customer gets the copy later';

// The customer's address on the job, as the bill has it ('' — none, or hidden from this technician)
export const jobEmailOf = (bill) => (bill && bill.contacts_hidden !== true && bill.customer && typeof bill.customer.email === 'string' ? bill.customer.email.trim() : '');

// The rows of the choice: [{ way, icon, title, line }]
//   bill — the issued bill (can_email, customer); required — the copy is required (copyRequired);
//   to — the address chosen for Email now
export function copyWaysOf({ bill, required, to = '' }) {
  const ways = [];
  if (bill && bill.can_email === true) {
    const address = String(to || '').trim();
    ways.push({ way: 'email', icon: 'mail', title: 'Email the PDF', line: address ? `${address} · Change` : 'Add the address' });
  }
  ways.push({ way: 'share', icon: 'share', title: 'Share the PDF', line: 'Text, AirDrop or another app' });
  ways.push({ way: 'handed', icon: 'print', title: 'Printed copy handed', line: null });
  if (!required) ways.push({ way: 'show', icon: 'eye', title: 'Show it on this phone', line: 'Just a look, no copy' });
  return ways;
}

// Chosen at first: Email when it is there and the job has an address; else Share the PDF.
// quiet — the copy on the customer's screens (Get signature, Get paid in NY): the bill does not say
// whether the job holds the customer's agreement to emails, and Email or Share without it stops
// at «Tick the agreement…» (QA 25.11: the tick was under the fold, the first «Done · signed»
// always failed) — so the way without a tick, Printed copy handed, until the technician picks one
export function firstWay(ways, to, quiet = false) {
  if (quiet && ways.some((w) => w.way === 'handed')) return 'handed';
  if (String(to || '').trim() && ways.some((w) => w.way === 'email')) return 'email';
  return 'share';
}

// The copy is required before the signature and the payment, and not given yet
export const copyRequired = (bill, visit = null) => giveRequired(visit, bill);
export const copyMissing = (bill, visit = null) => !!bill && bill.status === 'issued' && copyRequired(bill, visit) && !bill.delivered_at;

// The tick under the chosen way: { words, must } — must: without it nothing goes (Share); Email:
// it goes on the job's consent, if it has one. null — no tick (handed, show).
export function tickOf(way) {
  if (way === 'email') return { words: EMAIL_CONSENT_WORDS, must: false };
  if (way === 'share') return { words: SHARE_CONSENT_WORDS, must: true };
  return null;
}

// The main button by the screen and the way (README d2-ny, d5, d6)
const WORDS = {
  send: { email: 'Send', share: 'Share', handed: 'Done · handed', show: 'Show' },
  pay: { email: 'Email the copy · Get paid', share: 'Share the PDF · Get paid', handed: 'Copy handed · Get paid' },
};
const BUTTON_ICONS = { email: 'mail', share: 'share', handed: 'check', show: 'eye' };
export function buttonOf(screen, way) {
  if (screen === 'sign') return { text: 'Done · signed', icon: 'check' };
  const text = (WORDS[screen] || WORDS.send)[way] || 'Send';
  return { text, icon: BUTTON_ICONS[way] || 'send' };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// What stops the chosen way before anything goes: words, or null
export function copyCheck({ way, to, ticked }) {
  if (!way) return 'Choose how the customer gets the copy.';
  if (way === 'email') {
    const address = String(to || '').trim();
    if (!address) return 'Add the customer’s email address.';
    if (address.length > 255 || !EMAIL_RE.test(address)) return 'Check the email address.';
  }
  if (way === 'share' && !ticked) return 'Tick the agreement or choose another way.';
  return null;
}

// The body of POST …/bill/email
export const emailBody = (to, ticked) => (ticked ? { to: String(to).trim(), consent: true } : { to: String(to).trim() });

// The words when the copy did not go (README «Тексты всех состояний», Send the bill)
export function copyFailText(error) {
  const response = error && error.response;
  if (!response) return 'No signal: the bill is not sent. Try again when you have signal.';
  const data = response.data || {};
  if (data.code === 'consent_required') return 'Tick the agreement or choose another way.';
  if (data.code === 'email_off') return 'Not sent: email is not working right now. Share the PDF or hand a printed copy.';
  const said = typeof data.error === 'string' && data.error ? data.error.replace(/[.\s]*$/, '') : 'something went wrong, try again';
  return `Not sent: ${said}.`;
}
// A delivery mark the server already has (another phone, the office): nothing to write again
export const alreadyGiven = (error) => {
  const response = error && error.response;
  return !!response && response.status === 409 && /already marked delivered/i.test(String((response.data || {}).error || ''));
};

// After the copy: what the Send the bill button says (three.js sendButton reads the bill), here
// the words of the moment for the screens: 'Sent to a@b.c' | 'Shared as PDF' | 'Printed copy handed'
export function gaveWords(way, to) {
  if (way === 'email') return `Sent to ${String(to || '').trim()}`;
  if (way === 'share') return 'Shared as PDF';
  if (way === 'handed') return 'Printed copy handed';
  return null;
}

// The words over the signature (README «Текст согласия», the Architect: the app's default now;
// the company's own line later): with terms on the bill or the company — the link «Terms and
// conditions»; without — no tail
export const SIGN_WORDS = 'By signing, you confirm the work on this bill is done';
export function signWordsOf(hasTerms) {
  return hasTerms
    ? { before: `${SIGN_WORDS} and you agree to its `, link: 'Terms and conditions', after: '.' }
    : { before: `${SIGN_WORDS}.`, link: null, after: '' };
}

// The bill on the customer's screens (d2: in full; d2-ny, d5: compact, one row):
//   { company, who: 'Test Customer · Nov 24', lines: [{ key, name, sub, amount }], tax: { label,
//     amount } | null, total, one: { name, sub, amount } (compact) }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayOf = (date) => {
  const [, m, d] = String(date || '').split('-').map(Number);
  return m >= 1 && m <= 12 && d ? `${MONTHS[m - 1]} ${d}` : '';
};
export function billCardOf(bill, today = null) {
  if (!bill) return null;
  const company = (bill.company && (bill.company.name || bill.company.legal_name)) || '';
  const customer = (bill.customer && bill.customer.name) || '';
  const at = momentWall(bill.issued_at);
  const who = [customer, dayOf(at ? at.date : today)].filter(Boolean).join(' · ');
  const lines = (Array.isArray(bill.lines) ? bill.lines : []).map((l, i) => ({
    key: String(l.id ?? i),
    name: l.name || 'Line',
    sub: typeof l.description === 'string' && l.description.trim() ? l.description.trim().split('\n')[0] : null,
    amount: usd(Number(l.amount_cents) || 0),
  }));
  const taxCents = Number(bill.tax_cents) || 0;
  const taxName = (typeof bill.tax_name === 'string' && bill.tax_name.trim()) || 'Sales tax';
  const tax = taxCents > 0
    ? { label: bill.tax_rate !== null && bill.tax_rate !== undefined ? `${taxName} ${percentText(bill.tax_rate)}` : taxName, amount: usd(taxCents), short: `${taxName} ${usd(taxCents)}` }
    : null;
  const first = lines[0];
  const more = lines.length > 1 ? `${lines.length - 1} more` : null;
  const one = {
    name: first ? first.name : 'Bill',
    sub: [more || (first && first.sub), tax && tax.short].filter(Boolean).join(' · ') || null,
    amount: usd(Number(bill.total_cents) || 0),
  };
  return { company, who, lines, tax, total: usd(Number(bill.total_cents) || 0), one };
}
