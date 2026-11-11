// node --test: changes of the kept My day go one after another (cacheQueue.js), so the day
// screen and the visit screen writing at once do not lose each other's work, and sign out
// clears it in the same queue, so an answer late for the sign out does not bring it back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCacheQueue } from './cacheQueue.js';

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A store whose reads are slow, as AsyncStorage can be: a second reader starting before the
// first has written would read the old cache
function slowStore(initial) {
  const store = { value: initial, writes: 0, removes: 0 };
  return {
    store,
    read: async () => { const v = store.value; await tick(10); return v; },
    write: async (v) => { await tick(5); store.value = v; store.writes += 1; },
    remove: async () => { await tick(2); store.value = null; store.removes += 1; },
  };
}

test('two changes at once: both are kept', async () => {
  const { store, read, write, remove } = slowStore({ weeks: {}, cards: {} });
  const queue = makeCacheQueue({ read, write, remove });
  // the day screen keeps a week while the visit screen keeps a card
  const week = queue.update((c) => ({ ...c, weeks: { ...c.weeks, '2026-11-08': [1, 2, 3] } }), queue.mark());
  const card = queue.update((c) => ({ ...c, cards: { ...c.cards, 4: { id: 4 } } }), queue.mark());
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
  const { store, read, write, remove } = slowStore({ n: 1 });
  const queue = makeCacheQueue({ read, write, remove });
  const mark = queue.mark();
  assert.deepEqual(await queue.update((c) => c, mark), { n: 1 });
  assert.deepEqual(await queue.update(() => null, mark), { n: 1 });
  assert.deepEqual(await queue.update(() => { throw new Error('bad'); }, mark), { n: 1 });
  assert.deepEqual(await queue.update((c) => ({ n: c.n + 1 }), mark), { n: 2 });
  assert.equal(store.writes, 1);
});

test('a failed write does not stop the next change', async () => {
  let fail = true;
  const store = { value: { n: 1 } };
  const queue = makeCacheQueue({
    read: async () => store.value,
    write: async (v) => { if (fail) { fail = false; throw new Error('disk full'); } store.value = v; },
    remove: async () => { store.value = null; },
  });
  assert.equal(await queue.update((c) => ({ n: c.n + 10 }), queue.mark()), null);
  assert.deepEqual(await queue.update((c) => ({ n: c.n + 1 }), queue.mark()), { n: 2 });
});

// ---------- sign out ----------
const DAY = { userId: 7, weeks: { '2026-11-08': [{ id: 4, client_name: 'Sanjay Patel' }] } };

test('sign out while the day is on its way: the late answer is dropped, nothing stays', async () => {
  const { store, read, write, remove } = slowStore(DAY);
  const queue = makeCacheQueue({ read, write, remove });
  const asked = queue.mark();                       // the day screen asks the server
  await queue.clear();                              // the technician signs out
  assert.equal(store.value, null);
  // the answer comes now and the screen keeps it, as it did before sign out
  assert.equal(await queue.update((c) => ({ ...(c || {}), userId: 7, weeks: DAY.weeks }), asked), null);
  assert.equal(store.value, null, 'the day did not come back');
  assert.equal(store.writes, 0);
});

test('a change already running at sign out: the cache goes after it', async () => {
  const { store, read, write, remove } = slowStore({ userId: 7, weeks: {} });
  const queue = makeCacheQueue({ read, write, remove });
  const keeping = queue.update((c) => ({ ...c, weeks: DAY.weeks }), queue.mark()); // reading now
  await tick(1);
  const signingOut = queue.clear();
  await Promise.all([keeping, signingOut]);
  assert.equal(store.value, null);
  assert.deepEqual([store.writes, store.removes], [1, 1], 'written, then removed');
});

test('after sign out the next session keeps its day; a change without a mark is dropped', async () => {
  const { store, read, write, remove } = slowStore(DAY);
  const queue = makeCacheQueue({ read, write, remove });
  const before = queue.mark();
  await queue.clear();
  const after = queue.mark();
  assert.notEqual(after, before);
  assert.deepEqual(await queue.update(() => ({ userId: 8, weeks: {} }), after), { userId: 8, weeks: {} });
  assert.equal(await queue.update(() => ({ userId: 7, weeks: DAY.weeks })), null);
  assert.deepEqual(store.value, { userId: 8, weeks: {} });
});

test('sign out never throws, even when the phone cannot remove', async () => {
  const queue = makeCacheQueue({ read: async () => DAY, write: async () => {}, remove: async () => { throw new Error('locked'); } });
  assert.equal(await queue.clear(), null);
  assert.notEqual(await queue.update((c) => c, queue.mark()), undefined, 'the queue goes on');
});

test('clearing outside the queue, as before: the late answer brings the day back (why)', async () => {
  const { store, read, write, remove } = slowStore(DAY);
  await remove();                                   // sign out removed the key itself
  await write({ ...DAY });                          // then the answer that was on its way
  assert.deepEqual(store.value, DAY, 'the customer\'s data is on the phone again');
});
