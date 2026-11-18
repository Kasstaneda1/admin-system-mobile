// How the app reads a typed amount of money — the payment, a part of it, a Custom tip, the
// price of a bill line. The same rule as the office's screens (frontend
// js/admin/features/bills/money.js, fe#337); no React Native: money.test.mjs runs it on node.
//
// A comma is only a thousands separator: «1,234.56» is $1,234.56. After each comma come
// exactly three digits, so «25,00» is not $2,500: it is refused, and moneyError() says to type
// a dot before the cents (an iPhone in a European region shows a comma on the decimal pad).
// A number with commas does not start with 0 («0,500» is refused). At most 7 whole digits and
// 2 after the dot.

// «$1,234.5» → 123450 cents; null when it is not an amount
export function parseMoney(text) {
  const raw = String(text ?? '').trim().replace(/^\$/, '').trim();
  if (!/^(\d{1,7}|[1-9]\d{0,2}(,\d{3}){1,2})(\.\d{0,2})?$/.test(raw)) return null;
  const [whole, part = ''] = raw.replace(/,/g, '').split('.');
  if (whole.length > 7) return null;
  return Number(whole) * 100 + Number(part.padEnd(2, '0'));
}

// The words for a refused amount: a comma used for cents («25,00», «12,5», «1.234,56») gets
// its own, with the person's own number written right («12,5» → «12.50»; «25.00» when it does
// not turn into money); anything else gets the screen's own words (fallback, may be null). It
// ends with a period when the screen's own words do.
export function moneyError(text, fallback) {
  const raw = String(text ?? '').trim();
  if (!/\d,\d{0,2}$/.test(raw)) return fallback;
  const end = String(fallback).endsWith('.') ? '.' : '';
  const cut = raw.lastIndexOf(',');
  const cents = parseMoney(`${raw.slice(0, cut).replace(/[.,]/g, '')}.${raw.slice(cut + 1)}`);
  if (cents === null) return `Use a dot before the cents, like 25.00${end}`;
  return `Use a dot before the cents: ${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}${end}`;
}
