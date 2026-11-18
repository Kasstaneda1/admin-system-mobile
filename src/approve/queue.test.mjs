import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApproveQueue } from './queue.js';
import { makeCacheQueue } from '../myDay/cacheQueue.js';

// The phone's store in memory, as storeQueue.js keeps it
function memoryQueue() {
  let box = null;
  return makeCacheQueue({ read: async () => box, write: async (b) => { box = b; }, remove: async () => { box = null; } });
}
const err = (status, data = {}) => Object.assign(new Error('x'), { response: { status, data } });
const offline = () => Object.assign(new Error('Network Error'), {});
const body = (id) => ({ method: 'signature', signer_name: 'Sanjay Patel', signature_png: 'p', amount_source: 'bill', expected_amount_cents: 23000, client_request_id: id });

test('sent at once: nothing stays on the phone', async () => {
  const calls = [];
  const q = makeApproveQueue({ queue: memoryQueue(), api: { sign: async (v, b) => { calls.push([v, b.client_request_id]); return { authorization: { id: 7 } }; } } });
  const r = await q.sign({ visitId: 31, userId: 2, body: body('r1'), at: 1 });
  assert.deepEqual(r, { result: 'sent', authorization: { id: 7 } });
  assert.deepEqual(calls, [['31', 'r1']]);
  assert.deepEqual(await q.list(), []);
});

test('no connection: kept on the phone, goes with flushAll under the same request id', async () => {
  let up = false;
  const calls = [];
  const q = makeApproveQueue({ queue: memoryQueue(), api: { sign: async (v, b) => { calls.push(b.client_request_id); if (!up) throw offline(); return { authorization: { id: 8 } }; } } });
  const r = await q.sign({ visitId: 31, userId: 2, body: body('r1'), at: 1 });
  assert.equal(r.result, 'waiting');
  assert.equal((await q.pendingOf(31, 2)).key, 'r1');
  assert.equal(await q.pendingOf(31, 3), null);              // another technician's visit: not theirs
  up = true;
  await q.flushAll(3);                                        // another technician's flush: not sent
  assert.deepEqual(calls, ['r1']);
  await q.flushAll(2);
  assert.deepEqual(calls, ['r1', 'r1']);
  assert.deepEqual(await q.list(), []);
});

test('a server error is kept too; the draft changed — marked, never sent again by itself', async () => {
  let answer = err(500);
  const calls = [];
  const q = makeApproveQueue({ queue: memoryQueue(), api: { sign: async (v, b) => { calls.push(b.client_request_id); throw answer; } } });
  assert.equal((await q.sign({ visitId: 31, userId: 2, body: body('r1'), at: 1 })).result, 'waiting');
  answer = err(409, { code: 'amount_changed', amount_cents: 26000 });
  await q.flushAll(2);
  const kept = await q.pendingOf(31, 2);
  assert.equal(kept.failed.kind, 'resign');
  assert.match(kept.failed.text, /signs again/);
  await q.flushAll(2);
  assert.deepEqual(calls, ['r1', 'r1']);                      // the refused one is not repeated
});

test('a new signature replaces the visit\'s kept one; the visit gone — dropped; drop forgets it', async () => {
  let answer = offline();
  const q = makeApproveQueue({ queue: memoryQueue(), api: { sign: async () => { throw answer; } } });
  await q.sign({ visitId: 31, userId: 2, body: body('r1'), at: 1 });
  await q.sign({ visitId: 31, userId: 2, body: body('r2'), at: 2 });
  await q.sign({ visitId: 40, userId: 2, body: body('r3'), at: 3 });
  assert.deepEqual((await q.list()).map((e) => e.key), ['r2', 'r3']);
  answer = err(404, { error: 'Visit not found' });
  await q.flushAll(2);
  assert.deepEqual(await q.list(), []);
  answer = offline();
  await q.sign({ visitId: 31, userId: 2, body: body('r4'), at: 4 });
  await q.drop(31, 2);
  assert.deepEqual(await q.list(), []);
});

test('two sends of the same signature at once: one request', async () => {
  let release;
  const calls = [];
  const q = makeApproveQueue({ queue: memoryQueue(), api: { sign: (v, b) => { calls.push(b.client_request_id); return new Promise((res) => { release = res; }); } } });
  const first = q.sign({ visitId: 31, userId: 2, body: body('r1'), at: 1 });
  await new Promise((r) => setTimeout(r, 10));
  const second = await q.flushAll(2);
  release({ authorization: { id: 9 } });
  assert.equal((await first).result, 'sent');
  assert.equal(second, undefined);
  assert.deepEqual(calls, ['r1']);
});

// ---------- the moment of the signature (PR 13г) ----------
const AT = Date.parse('2026-11-17T15:00:00.000Z');

test('signed_at: the moment of the press goes with the first try and with every send from the queue', async () => {
  let up = false;
  const sent = [];
  const q = makeApproveQueue({ queue: memoryQueue(), api: { sign: async (v, b) => { sent.push(b); if (!up) throw offline(); return { authorization: { id: 9 } }; } } });
  await q.sign({ visitId: 31, userId: 2, body: body('r1'), at: AT });
  up = true;
  await q.flushAll(2);
  assert.deepEqual(sent.map((b) => [b.client_request_id, b.signed_at]), [['r1', '2026-11-17T15:00:00.000Z'], ['r1', '2026-11-17T15:00:00.000Z']]);
  // kept apart from the body: the phone's store keeps the body as it was signed
  assert.equal('signed_at' in body('r1'), false);
});

test('signed_at: a signature kept by an older app (no signed_at in its body) goes with the moment it was kept', async () => {
  const store = memoryQueue();
  await store.update(() => [{ key: 'old', visitId: '31', userId: '2', body: body('old'), at: AT, failed: null }], store.mark());
  const sent = [];
  const q = makeApproveQueue({ queue: store, api: { sign: async (v, b) => { sent.push(b); return { authorization: { id: 10 } }; } } });
  await q.flushAll(2);
  assert.equal(sent[0].signed_at, '2026-11-17T15:00:00.000Z');
});

test('signed_at refused (400 out of bounds): marked «clock», kept, never sent again by itself — and never without its moment', async () => {
  const sent = [];
  const q = makeApproveQueue({ queue: memoryQueue(), api: { sign: async (v, b) => { sent.push(b); throw err(400, { code: 'signed_at_out_of_bounds', error: 'signed_at is out of bounds' }); } } });
  const r = await q.sign({ visitId: 31, userId: 2, body: body('r1'), at: AT });
  assert.equal(r.result, 'clock');
  const kept = await q.pendingOf(31, 2);
  assert.equal(kept.failed.kind, 'clock');
  await q.flushAll(2);
  assert.equal(sent.length, 1, 'a marked signature does not go again by itself');
  assert.ok(sent.every((b) => b.signed_at === '2026-11-17T15:00:00.000Z'));
});

test('signedAtFirst false: the first try goes without signed_at, the sends from the queue with it', async () => {
  let up = false;
  const sent = [];
  const q = makeApproveQueue({ signedAtFirst: false, queue: memoryQueue(), api: { sign: async (v, b) => { sent.push(b); if (!up) throw offline(); return { authorization: { id: 11 } }; } } });
  await q.sign({ visitId: 31, userId: 2, body: body('r2'), at: AT });
  up = true;
  await q.flushAll(2);
  assert.deepEqual(sent.map((b) => b.signed_at), [undefined, '2026-11-17T15:00:00.000Z']);
});
