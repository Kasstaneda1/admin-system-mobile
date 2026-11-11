// node --test: «Seen» of the office's messages without the screen (officeSeen.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { onScreen, toSend, seenError, SEEN_MIN_PX } from './officeSeen.js';

// The card: the office block 600 px down, a message 60 px tall every 70 px
const rows = [
  { id: 31, top: 600, height: 60 },
  { id: 30, top: 670, height: 60 },
  { id: 29, top: 740, height: 20 },
];

test('on the screen: at least the first line of a message inside the visible part', () => {
  // the whole card fits
  assert.deepEqual(onScreen(rows, { top: 0, height: 844 }), [31, 30, 29]);
  // the screen ends inside the second message: its first line is there, the third is not
  assert.deepEqual(onScreen(rows, { top: 0, height: 670 + SEEN_MIN_PX }), [31, 30]);
  assert.deepEqual(onScreen(rows, { top: 0, height: 670 + SEEN_MIN_PX - 1 }), [31]);
  // scrolled down past the first message: only its last pixels are left
  assert.deepEqual(onScreen(rows, { top: 600 + 60 - SEEN_MIN_PX + 1, height: 400 }), [30, 29]);
  // a message shorter than a line counts when all of it is there
  assert.deepEqual(onScreen(rows, { top: 0, height: 760 }), [31, 30, 29]);
  assert.deepEqual(onScreen(rows, { top: 0, height: 759 }), [31, 30]);
  // the block is below the screen
  assert.deepEqual(onScreen(rows, { top: 0, height: 500 }), []);
  // nothing measured yet
  assert.deepEqual(onScreen(rows, null), []);
  assert.deepEqual(onScreen(rows, { top: 0, height: 0 }), []);
  assert.deepEqual(onScreen([{ id: 1, top: NaN, height: 40 }, { id: 2, top: 10, height: 0 }, null], { top: 0, height: 844 }), []);
});

test('what to send: on the screen, unseen, not sent before; each once, in order', () => {
  const done = new Set([29]);
  assert.deepEqual(toSend([31, 30, 29, 31], [29, 30, 31], done), [30, 31]);
  // seen already (seen_at on the server): nothing
  assert.deepEqual(toSend([31, 30], [], new Set()), []);
  // behind «+N more» or below the screen: not on the screen, not sent
  assert.deepEqual(toSend([31], [31, 30, 28], new Set()), [31]);
  assert.deepEqual(toSend([], [31], new Set()), []);
  assert.deepEqual(toSend([31], [31], undefined), [31]);
});

test('a failed send: offline and the server\'s failure go again; refused do not', () => {
  assert.deepEqual(seenError(new Error('Network Error')), { kind: 'offline' });
  assert.deepEqual(seenError({ response: { status: 404 } }), { kind: 'gone' });
  for (const status of [400, 403, 409]) assert.deepEqual(seenError({ response: { status } }), { kind: 'refused' });
  assert.deepEqual(seenError({ response: { status: 500 } }), { kind: 'failed' });
  assert.deepEqual(seenError(null), { kind: 'offline' });
});
