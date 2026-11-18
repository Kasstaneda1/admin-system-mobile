import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEXT_MAX, bookItemOf, countText, defaultTextOf, textPatch, textSourceOf } from './lineText.js';
import { editOf, newEdit, newLineBody, patchOf } from './model.js';

const TERMS = 'Parts ordered for this repair cannot be returned.';
const BOOK_LINE = { id: 11, kind: 'labor', name: 'Washer repair — labor', description: TERMS, quantity: '1', unit: null, unit_price_cents: 18000, price_item_id: 5, price_item_version: 2, locked: false };
const OWN_LINE = { ...BOOK_LINE, id: 12, name: 'Control board check', description: null, price_item_id: null, price_item_version: null };
const BOOK = { items: [{ id: 4, description: 'x' }, { id: 5, description: `  ${TERMS} `, version: 3 }] };

test('bookItemOf: the line\'s item in the loaded book', () => {
  assert.equal(bookItemOf(BOOK_LINE, BOOK).id, 5);
  assert.equal(bookItemOf(BOOK_LINE, null), null);                 // not loaded yet
  assert.equal(bookItemOf(BOOK_LINE, { items: [{ id: 4 }] }), null); // hidden by the office since
  assert.equal(bookItemOf(OWN_LINE, BOOK), null);
  assert.equal(bookItemOf(null, BOOK), null);
});

test('textSourceOf: where the text comes from, and Reset', () => {
  const item = bookItemOf(BOOK_LINE, BOOK);
  assert.deepEqual(textSourceOf(BOOK_LINE, TERMS, item), { label: 'From the price book · version 2', reset: false });
  // the owner's case: the technician adds a sentence
  const added = `${TERMS}\nThe control board needs to be replaced.`;
  assert.deepEqual(textSourceOf(BOOK_LINE, added, item), { label: 'Edited for this bill', reset: true });
  // the book not loaded: compared with the line as it came, no Reset to offer
  assert.deepEqual(textSourceOf(BOOK_LINE, added, null), { label: 'Edited for this bill', reset: false });
  assert.deepEqual(textSourceOf(BOOK_LINE, TERMS, null), { label: 'From the price book · version 2', reset: false });
  // emptied on a book line: edited, Reset brings it back
  assert.deepEqual(textSourceOf(BOOK_LINE, '', item), { label: 'Edited for this bill', reset: true });
  // a book item without text and none here: nothing to say
  assert.deepEqual(textSourceOf({ ...BOOK_LINE, description: null }, '', { id: 5, description: null }), { label: null, reset: false });
  // the technician's own line, or a new one
  assert.deepEqual(textSourceOf(OWN_LINE, 'Checked the board', null), { label: 'Written for this line', reset: false });
  assert.deepEqual(textSourceOf(OWN_LINE, '  ', null), { label: null, reset: false });
  assert.deepEqual(textSourceOf(null, 'New text', null), { label: 'Written for this line', reset: false });
  assert.equal(textSourceOf({ ...BOOK_LINE, price_item_version: null }, TERMS, item).label, 'From the price book');
});

test('defaultTextOf: the book\'s text, trimmed', () => {
  assert.equal(defaultTextOf(bookItemOf(BOOK_LINE, BOOK)), TERMS);
  assert.equal(defaultTextOf({ description: null }), '');
  assert.equal(defaultTextOf(null), '');
});

test('textPatch and patchOf: only a changed text goes, an emptied one is null', () => {
  assert.equal(textPatch(BOOK_LINE, TERMS), undefined);
  assert.equal(textPatch(BOOK_LINE, ` ${TERMS}  `), undefined);
  assert.equal(textPatch(BOOK_LINE, 'New'), 'New');
  assert.equal(textPatch(BOOK_LINE, '   '), null);
  assert.equal(textPatch(OWN_LINE, ''), undefined);
  const edit = editOf(BOOK_LINE);
  assert.deepEqual(patchOf(BOOK_LINE, edit), {});
  assert.deepEqual(patchOf(BOOK_LINE, { ...edit, description: `${TERMS} The control board needs to be replaced.` }),
    { description: `${TERMS} The control board needs to be replaced.` });
  assert.deepEqual(patchOf(BOOK_LINE, { ...edit, description: '' }), { description: null });
  // with another change: both go
  assert.deepEqual(patchOf(BOOK_LINE, { ...edit, name: 'Labor', description: 'Short' }), { name: 'Labor', description: 'Short' });
});

test('newLineBody: a new line takes its text when there is one', () => {
  const edit = { ...newEdit('labor'), name: 'Board check', price: '50' };
  assert.equal('description' in newLineBody(edit), false);
  assert.equal('description' in newLineBody({ ...edit, description: '   ' }), false);
  assert.equal(newLineBody({ ...edit, description: ' The control board needs to be replaced. ' }).description, 'The control board needs to be replaced.');
});

test('countText: the letters against the server\'s 5000', () => {
  assert.equal(TEXT_MAX, 5000);
  assert.equal(countText('abc'), '3 / 5000');
  assert.equal(countText(null), '0 / 5000');
});
