// How the app reads a typed amount of money — the payment, a part of it, a Custom tip, the
// price of a bill line. No React Native: money.test.mjs runs it on node.
//
// The office's rule (frontend js/admin/features/bills/money.js, fe#337), plus one thing for the
// phone (QUEUE 8-6, the Architect's option A, the lead's decision): an iPhone in a European or
// Russian region has only a comma on the decimal pad, no dot — so ONE comma with 1–2 digits
// after it is the cents. The site does not take it (a computer has a dot).
//   «25.00», «$1,234.56»     — as on the site: a dot before the cents, commas between thousands;
//   «25,00» → $25.00, «12,5» → $12.50, «0,07» → $0.07 — the comma for the cents;
//   «1,500» → $1,500         — a comma with exactly three digits is still the thousands;
//   «0,500» (thousands do not start with 0), «25,» (no cents after it), «1,234,5» and
//   «1.234,56» (a comma for the cents with other separators), «1,2345» — refused.
// At most 7 whole digits and 2 cents.

const SITE = /^(\d{1,7}|[1-9]\d{0,2}(,\d{3}){1,2})(\.\d{0,2})?$/;
const COMMA_CENTS = /^(\d{1,7}),(\d{1,2})$/;

// «$1,234.5» → 123450 cents, «25,00» → 2500; null when it is not an amount
export function parseMoney(text) {
  const raw = String(text ?? '').trim().replace(/^\$/, '').trim();
  const cents = COMMA_CENTS.exec(raw);
  if (cents) return Number(cents[1]) * 100 + Number(cents[2].padEnd(2, '0'));
  if (!SITE.test(raw)) return null;
  const [whole, part = ''] = raw.replace(/,/g, '').split('.');
  if (whole.length > 7) return null;
  return Number(whole) * 100 + Number(part.padEnd(2, '0'));
}

// The words for a refused amount: one ending in a comma and up to two digits («25,»,
// «1,234,5», «1.234,56») gets its own — «Type it like this:» with the person's
// own number written right when it makes money («1,234,5» → 1234.50; «25.00» otherwise);
// anything else gets the screen's own words (fallback, may be null). It ends with a period
// when the screen's own words do, or when it is the only words (a hint under a field).
export function moneyError(text, fallback) {
  const raw = String(text ?? '').trim();
  // an amount the app takes («25,00») is no comma in a wrong place
  if (parseMoney(raw) !== null || !/\d,\d{0,2}$/.test(raw)) return fallback;
  const end = fallback === null || String(fallback).endsWith('.') ? '.' : '';
  const cut = raw.lastIndexOf(',');
  const cents = parseMoney(`${raw.slice(0, cut).replace(/[.,]/g, '')}.${raw.slice(cut + 1)}`);
  if (cents === null) return `Type an amount like 25.00${end}`;
  return `Type it like this: ${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}${end}`;
}
