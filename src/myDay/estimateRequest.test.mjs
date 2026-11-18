import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateRequestOf } from './estimateRequest.js';

test('estimateRequestOf: the row under the card (design app-after)', () => {
  assert.deepEqual(estimateRequestOf({ estimate_request: { id: 14, number: 'EST-202611-014', status: 'diagnostics' } }),
    { id: 14, title: 'Estimate requested · EST-202611-014', line: 'Diagnostics · the office prices it' });
  // later in its life: only its status
  assert.equal(estimateRequestOf({ estimate_request: { id: 14, number: 'EST-202611-014', status: 'sold' } }).line, 'Sold');
  assert.equal(estimateRequestOf({ estimate_request: { id: 14, number: 'EST-202611-014', status: 'no_answer' } }).line, 'No Answer');
  // no number (never from the server, but safe)
  assert.equal(estimateRequestOf({ estimate_request: { id: 14, number: '', status: 'diagnostics' } }).title, 'Estimate requested · #14');
  // none, or not the technician's to open (the server sends null), or broken
  for (const v of [null, {}, { estimate_request: null }, { estimate_request: { id: 'x' } }]) assert.equal(estimateRequestOf(v), null);
});
