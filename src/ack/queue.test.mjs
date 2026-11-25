import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAckQueue } from './queue.js';
import { makeCacheQueue } from '../myDay/cacheQueue.js';

function memoryQueue() {
  let box = null;
  return makeCacheQueue({ read: async () => box, write: async (b) => { box = b; }, remove: async () => { box = null; } });
}
const err = (status, data = {}) => Object.assign(new Error('x'), { response: { status, data } });
const offline = () => Object.assign(new Error('Network Error'), {});
const body = (id) => ({ signer_name: 'Sanjay Patel', signature_png: 'p', replaced_parts: 'returned', client_request_id: id });

// a stand-in API: sign answers by `answer` (a function of the call)
function stand({ answer }) {
  const calls = [];
  const api = {
    sign: async (v, b) => { calls.push(['sign', v, b.client_request_id, b]); return answer(b); },
  };
  return { api, calls, signs: () => calls.filter((c) => c[0] === 'sign') };
}

test('sent at once: the signature comes back, nothing stays on the phone', async () => {
  const s = stand({ answer: () => ({ acknowledgment: { id: 5 } }) });
  const q = makeAckQueue({ queue: memoryQueue(), api: s.api });
  const r = await q.sign({ visitId: 31, userId: 2, body: body('a1'), at: 1 });
  assert.deepEqual(r, { result: 'sent', acknowledgment: { id: 5 } });
  assert.deepEqual(s.calls.map((c) => c[0]), ['sign']);
  assert.deepEqual(await q.list(), []);
});

test('no connection: kept with its moment, goes by itself with the same request id and moment', async () => {
  let up = false;
  const s = stand({ answer: () => { if (!up) throw offline(); return { acknowledgment: { id: 6 } }; } });
  const q = makeAckQueue({ queue: memoryQueue(), api: s.api });
  const r = await q.sign({ visitId: 31, userId: 2, body: body('a1'), at: 1700000000000 });
  assert.equal(r.result, 'waiting');
  assert.match(r.failed.text, /kept on this phone/);
  const kept = await q.pendingOf(31, 2);
  assert.equal(kept.key, 'a1');
  assert.equal(kept.at, 1700000000000);
  assert.equal(kept.failed, null);
  assert.equal(await q.pendingOf(31, 3), null);              // another technician's: not theirs
  up = true;
  await q.flushAll(3);
  assert.equal(s.signs().length, 1);
  await q.flushAll(2);
  assert.deepEqual(s.calls.map((c) => c.slice(0, 3)), [['sign', '31', 'a1'], ['sign', '31', 'a1']]);
  assert.deepEqual(s.calls.map((c) => c[3].signed_at), ['2023-11-14T22:13:20.000Z', '2023-11-14T22:13:20.000Z'], 'the same moment each time');
  assert.deepEqual(await q.list(), []);
});

test('refusals: terms or bill changed, its time, the bill not ready, a 400 — marked; already signed, the visit gone — dropped', async () => {
  const cases = [
    [err(409, { code: 'bill_changed', bill_id: 78 }), 'bill_changed', true],
    [err(400, { code: 'signed_at_out_of_bounds' }), 'clock', true],
    [err(409, { code: 'terms_changed' }), 'resign', true],
    [err(409, { code: 'not_delivered' }), 'stage', true],
    [err(409, { code: 'void' }), 'stage', true],
    [err(400, { error: 'replaced_parts is required' }), 'refused', true],
    [err(409, { code: 'already_signed' }), 'signed', false],
    [err(404), 'gone', false],
  ];
  for (const [answer, kind, kept] of cases) {
    let first = true;
    const s = stand({ answer: () => { if (first) { first = false; throw offline(); } throw answer; } });
    const q = makeAckQueue({ queue: memoryQueue(), api: s.api });
    await q.sign({ visitId: 31, userId: 2, body: body('a1'), at: 1 });
    await q.flushAll(2);
    const left = await q.pendingOf(31, 2);
    if (kept) assert.equal(left.failed.kind, kind, kind);
    else assert.equal(left, null, kind);
    await q.flushAll(2);
    assert.equal(s.signs().length, 2, kind);                  // never a third
  }
});

test('the first try refused (the screen is open): the result says why, a 500 waits', async () => {
  const s = stand({ answer: () => { throw err(409, { code: 'terms_changed' }); } });
  const q = makeAckQueue({ queue: memoryQueue(), api: s.api });
  const r = await q.sign({ visitId: 31, userId: 2, body: body('a1'), at: 1 });
  assert.equal(r.result, 'resign');
  assert.equal((await q.pendingOf(31, 2)).failed.kind, 'resign');
  const s2 = stand({ answer: () => { throw err(500); } });
  const q2 = makeAckQueue({ queue: memoryQueue(), api: s2.api });
  assert.equal((await q2.sign({ visitId: 31, userId: 2, body: body('a2'), at: 1 })).result, 'waiting');
  assert.equal((await q2.pendingOf(31, 2)).failed, null);
});

test('a new signature replaces the visit\'s marked one', async () => {
  let answer = () => { throw err(409, { code: 'terms_changed' }); };
  const s = stand({ answer: (b) => answer(b) });
  const q = makeAckQueue({ queue: memoryQueue(), api: s.api });
  await q.sign({ visitId: 31, userId: 2, body: body('a1'), at: 1 });
  answer = () => { throw offline(); };
  await q.sign({ visitId: 31, userId: 2, body: body('a2'), at: 2 });
  assert.deepEqual((await q.list()).map((e) => [e.key, e.failed]), [['a2', null]]);
});

test('signed_at goes with every send, the first one too (ACK-T: never without its moment); the body is not changed in the queue', async () => {
  let up = false;
  const s = stand({ answer: () => { if (!up) throw offline(); return { acknowledgment: { id: 1 } }; } });
  const q = makeAckQueue({ queue: memoryQueue(), api: s.api });
  const at = Date.UTC(2026, 10, 24, 20, 0);
  await q.sign({ visitId: 31, userId: 2, body: { ...body('a1'), pdf_sha256: 'ab'.repeat(32) }, at });
  up = true;
  await q.flushAll(2);
  const sent = s.signs().map((c) => c[3]);
  assert.equal(sent.length, 2);
  for (const b of sent) {
    assert.equal(b.signed_at, '2026-11-24T20:00:00.000Z');
    assert.equal(b.pdf_sha256, 'ab'.repeat(32));
  }
  assert.ok(!('signed_at' in (await q.list()).concat([{ body: {} }])[0].body), 'kept apart from the body');
});
