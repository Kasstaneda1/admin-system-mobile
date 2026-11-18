// The text under a line of the bill in the technician app (QUEUE 8-5, BILL_LINE_TEXTS_SPEC.md
// step 1): the technician writes or edits the text of a line of their draft — «the control
// board needs to be replaced» — for this bill only; the price book's text stays as it is. The
// server takes `description` in POST and PATCH of the line (backend billDraft.js LINE_FIELDS,
// text up to 5000) and marks the line changed by the technician: the office sees «Changed by».
// No React Native: lineText.test.mjs runs it on node.

export const TEXT_MAX = 5000;
export const THIS_BILL_ONLY = 'Changes apply to this bill only.';

const clean = (text) => (typeof text === 'string' ? text.trim() : '');

// The price book's item of a line, from the loaded book ({ items }) — null while it is not
// loaded, or the item is no longer in the book (hidden by the office)
export function bookItemOf(line, book) {
  if (!line || !line.price_item_id || !book || !Array.isArray(book.items)) return null;
  return book.items.find((i) => i && i.id === line.price_item_id) || null;
}

// Where the text of the line comes from, as the editor says it, and whether «Reset to default»
// is there: { label, reset }
//   - a line of the technician's own (no price book item): 'Written for this line' (none when empty);
//   - a price book line, its text as the book's: 'From the price book · version 2';
//   - otherwise 'Edited for this bill', with Reset when the book's text is known.
// The book's text is the item's as loaded now; until it loads, the line's text as it came.
export function textSourceOf(line, text, item) {
  const now = clean(text);
  if (!line || !line.price_item_id) return { label: now ? 'Written for this line' : null, reset: false };
  const base = item ? clean(item.description) : clean(line.description);
  if (now === base) {
    const version = line.price_item_version ? ` · version ${line.price_item_version}` : '';
    return { label: now ? `From the price book${version}` : null, reset: false };
  }
  return { label: 'Edited for this bill', reset: !!item };
}

// The text «Reset to default» puts back: the book item's, or '' when it has none
export const defaultTextOf = (item) => clean(item && item.description);

// The field of the PATCH body, or undefined when the text did not change (null clears it)
export function textPatch(line, text) {
  const now = clean(text);
  if (now === clean(line && line.description)) return undefined;
  return now || null;
}

// '12 / 5000'; over the limit the field stops typing (maxLength), so this is the count
export const countText = (text) => `${String(text || '').length} / ${TEXT_MAX}`;
