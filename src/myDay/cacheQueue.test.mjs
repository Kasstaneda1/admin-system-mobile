// node --test: changes of the kept My day go one after another (cacheQueue.js), so the day
// screen and the visit screen writing at once do not lose each other's work.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCacheQueue } from './cacheQueue.js';

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A store whose reads are slow, as AsyncStorage can be: a second reader starting before the
// first has written would read the old cache
function slowStore(initial) {
  const store = { value: initial, writes: 0 };
  return {
    store,
    read: async () => { const v = store.value; await tick(10); return v; },
    write: async (v) => { await tick(5); store.value = v; store.writes += 1; },
  };
}

test('two changes at once: both are kept', async () => {
  const { store, read, write } = slowStore({ weeks: {}, cards: {} });
  const queue = makeCacheQueue({ read, write });
  // the day screen keeps a week while the visit screen keeps a card
  const week = queue.update((c) => ({ ...c, weeks: { ...c.weeks, '2026-11-08': [1, 2, 3] } }));
  const card = queue.update((c) => ({ ...c, cards: { ...c.cards, 4: { id: 4 } } }));
  await Promise.all([week, card]);
  assert.deepEqual(store.value, { weeks: { '2026-11-08': [1, 2, 3] }, cards: { 4: { id: 4 } } });
  assert.equal(store.writes, 2);
});

test('without the queue the same two writes lose one (why it is needed)', async () => {
  const { store, read, write } = slowStore({ weeks: {}, cards: {} });
  const raw = async (change) => write(change(await read()));
  await Promise.all([
    raw((c) => ({ ...c, weeks: { '2026-11-08': [1] } })),
    raw((c) => ({ ...c, cards: { 4: { id: 4 } } })),
  ]);
  assert.notDeepEqual(store.value, { weeks: { '2026-11-08': [1] }, cards: { 4: { id: 4 } } });
});

test('nothing to change: no write; a change that throws is skipped and the queue goes on', async () => {
  const { store, read, write } = slowStore({ n: 1 });
  const queue = makeCacheQueue({ read, write });
  assert.deepEqual(await queue.update((c) => c), { n: 1 });
  assert.deepEqual(await queue.update(() => null), { n: 1 });
  assert.deepEqual(await queue.update(() => { throw new Error('bad'); }), { n: 1 });
  assert.deepEqual(await queue.update((c) => ({ n: c.n + 1 })), { n: 2 });
  assert.equal(store.writes, 1);
});

test('a failed write does not stop the next change', async () => {
  let fail = true;
  const store = { value: { n: 1 } };
  const queue = makeCacheQueue({
    read: async () => store.value,
    write: async (v) => { if (fail) { fail = false; throw new Error('disk full'); } store.value = v; },
  });
  assert.equal(await queue.update((c) => ({ n: c.n + 10 })), null);
  assert.deepEqual(await queue.update((c) => ({ n: c.n + 1 })), { n: 2 });
});
