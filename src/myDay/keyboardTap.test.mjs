import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyboardFirst } from './keyboardTap.js';

const kb = (up) => {
  const k = { up, dismissed: 0, isVisible: () => k.up, dismiss: () => { k.dismissed += 1; k.up = false; } };
  return k;
};

test('keyboard up: the first tap only puts it away, the second one does the thing', () => {
  const k = kb(true);
  const calls = [];
  const tap = keyboardFirst(k, (...a) => { calls.push(a); return 'done'; });
  assert.equal(tap('installed'), undefined);
  assert.equal(k.dismissed, 1);
  assert.deepEqual(calls, []);
  assert.equal(tap('installed'), 'done');
  assert.deepEqual(calls, [['installed']]);
  assert.equal(k.dismissed, 1);
});

test('keyboard down: the tap does the thing at once, with its arguments', () => {
  const k = kb(false);
  const calls = [];
  keyboardFirst(k, (...a) => calls.push(a))('estimate_needed', 2);
  assert.deepEqual(calls, [['estimate_needed', 2]]);
  assert.equal(k.dismissed, 0);
});

test('no keyboard API (old React Native, tests): the tap is never swallowed', () => {
  const calls = [];
  keyboardFirst(null, () => calls.push(1))();
  keyboardFirst({}, () => calls.push(2))();
  assert.deepEqual(calls, [1, 2]);
});

test('the keyboard says up but no field has the focus (a lost «hidden» event): the tap works', () => {
  const k = kb(true);
  const calls = [];
  const tap = keyboardFirst(k, () => calls.push(1), () => false);
  tap();
  assert.deepEqual(calls, [1]);
  assert.equal(k.dismissed, 0);
  // a field in focus: swallowed as before
  const k2 = kb(true);
  keyboardFirst(k2, () => calls.push(2), () => true)();
  assert.deepEqual(calls, [1]);
  assert.equal(k2.dismissed, 1);
});
