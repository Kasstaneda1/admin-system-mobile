import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSub, noteOf, shownOf } from './method.js';
import { attemptOf, dropAttempt, runAttempt, startAttempt } from './attempts.js';

const picked = { tile: 'cash', otherKey: null, otherName: '', checkNumber: '', note: '', photo: null };
const lost = () => Object.assign(new Error('Network Error'), { response: undefined });

// An attempt of the method flow whose send went without an answer
async function uncertain(billId, view) {
  const attempt = startAttempt(billId, 'method', { lines: [{ rid: 'r1', body: { amount_cents: view.cents, method: 'cash', client_request_id: 'r1' } }], view });
  await runAttempt(attempt, { record: async () => { throw lost(); } });
  return attempt;
}

test('shownOf: nothing sent — the technician\'s choice, not locked', () => {
  const shown = shownOf({ kept: null, picked });
  assert.equal(shown.locked, false);
  assert.equal(shown.tile, 'cash');
  assert.equal(shown.cents, null);
});

test('shownOf: a card payment already gone keeps the Card tile', () => {
  assert.equal(shownOf({ picked: { ...picked, tile: 'cash' }, cardKept: true }).tile, 'card');
  assert.equal(shownOf({ picked: { ...picked, tile: null }, entryKept: true }).tile, 'card');
});

test('shownOf: a send without an answer shows what went — amount, part, method, fields — locked', async () => {
  const attempt = await uncertain(901, { cents: 10000, part: true, tile: 'check', otherKey: null, otherName: '', checkNumber: '1042', note: 'Rest by check', photo: null });
  assert.equal(attemptOf(901, 'method'), attempt);
  const shown = shownOf({ kept: attempt, picked: { ...picked, tile: 'zelle', checkNumber: '9' } });
  assert.deepEqual(shown, { locked: true, tile: 'check', otherKey: null, otherName: '', checkNumber: '1042', note: 'Rest by check', photo: null, cents: 10000, part: true });
  dropAttempt(attempt);
});

test('shownOf: an attempt still on its way (no answer yet, not uncertain) is not locked', () => {
  const attempt = startAttempt(902, 'method', { lines: [{ rid: 'r2', body: {} }], view: { cents: 500, tile: 'cash' } });
  assert.equal(shownOf({ kept: attempt, picked }).locked, false);
  dropAttempt(attempt);
});

test('noteOf: a part sends the «Why only part?» note, a full payment the method\'s note', () => {
  assert.equal(noteOf(true, '  Has $100 cash ', 'Conf 77'), 'Has $100 cash');
  assert.equal(noteOf(false, 'Has $100 cash', ' Conf 77 '), 'Conf 77');
  assert.equal(noteOf(false, 'left from a part', ''), '');
  assert.equal(noteOf(false, '', null), '');
});

test('collectSub: full balance, or the part and what is left', () => {
  assert.equal(collectSub(false, 33207, 33207), 'Full balance');
  assert.equal(collectSub(true, 10000, 33207), 'Part of $332.07 · $232.07 left after this');
});
