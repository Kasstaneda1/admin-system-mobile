import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCacheQueue } from '../myDay/cacheQueue.js';
import { RECENT_MS, makeOutbox } from './outbox.js';

// A stand-in store and server: comments per estimate; post fails as told
function setup({ at = Date.UTC(2026, 10, 17, 15) } = {}) {
  let stored = null;
  const queue = makeCacheQueue({
    read: async () => (stored ? JSON.parse(stored) : null),
    write: async (v) => { stored = JSON.stringify(v); },
    remove: async () => { stored = null; },
  });
  const server = { comments: { 14: [] }, fail: null, failComments: null, posts: 0, lostAnswer: false };
  let clock = at;
  let n = 100;
  const api = {
    comments: async (id) => {
      if (server.failComments) throw server.failComments;
      if (!server.comments[id]) throw { response: { status: 404 } };
      return server.comments[id];
    },
    post: async (id, body) => {
      server.posts += 1;
      if (server.fail) throw server.fail;
      const c = { id: n++, user_id: 9, user_name: 'Ivan', user_role: 'technician', comment_text: body.commentText, author_tz: body.author_tz, created_at_utc: new Date(clock + 2000).toISOString() };
      server.comments[id].push(c);
      // the server wrote it, but the answer never came back
      if (server.lostAnswer) throw new Error('timeout');
      return { message: 'Comment added successfully', comment: c };
    },
  };
  // the wait before a second try passes at once; what the server does meanwhile: server.during
  const sleep = async (ms) => { server.slept = (server.slept || 0) + ms; clock += ms; if (server.during) { server.during(); server.during = null; } };
  const outbox = makeOutbox({ queue, api, timeZone: () => 'America/New_York', now: () => clock, sleep });
  return { outbox, server, queue, tick: (ms) => { clock += ms; } };
}

test('send: shown, posted with the author zone, gone from the phone', async () => {
  const { outbox, server } = setup();
  const r = await outbox.send({ key: 'a', estimateId: 14, userId: 9, text: ' Is the fan here? ' });
  assert.equal(r.result, 'sent');
  assert.equal(r.comment.comment_text, 'Is the fan here?');
  assert.equal(r.comment.author_tz, 'America/New_York');
  assert.deepEqual(await outbox.list(), []);
  assert.equal(server.posts, 1);
});

test('an empty message is never sent', async () => {
  const { outbox, server } = setup();
  assert.equal((await outbox.send({ key: 'a', estimateId: 14, userId: 9, text: '  ' })).result, 'refused');
  assert.equal(server.posts, 0);
  assert.deepEqual(await outbox.list(), []);
});

test('no connection: kept as failed; retry sends it once the network is back', async () => {
  const { outbox, server } = setup();
  server.fail = new Error('Network Error');
  assert.equal((await outbox.send({ key: 'a', estimateId: 14, userId: 9, text: 'Coming at 3' })).result, 'failed');
  assert.deepEqual((await outbox.list()).map((p) => [p.key, p.state]), [['a', 'failed']]);
  server.fail = null;
  assert.equal((await outbox.retry('a')).result, 'sent');
  assert.equal(server.comments[14].length, 1);
  assert.deepEqual(await outbox.list(), []);
});

test('the server wrote it but the answer was lost: retry finds it, no second copy', async () => {
  const { outbox, server } = setup();
  server.lostAnswer = true;
  assert.equal((await outbox.send({ key: 'a', estimateId: 14, userId: 9, text: 'Thanks' })).result, 'failed');
  server.lostAnswer = false;
  assert.equal((await outbox.retry('a')).result, 'sent');
  assert.equal(server.posts, 1);
  assert.equal(server.comments[14].length, 1);
  assert.deepEqual(await outbox.list(), []);
});

test('a try still on its way: a press on retry waits a minute, then finds it — no second copy', async () => {
  const { outbox, server } = setup();
  server.fail = new Error('timeout');
  await outbox.send({ key: 'a', estimateId: 14, userId: 9, text: 'Will be there at 11' });
  server.fail = null;
  // the first request lands while the app waits
  server.during = () => server.comments[14].push({ id: 50, user_id: 9, comment_text: 'Will be there at 11', created_at_utc: new Date(Date.UTC(2026, 10, 17, 15, 0, 30)).toISOString() });
  assert.equal((await outbox.retry('a')).result, 'sent');
  assert.equal(server.slept, RECENT_MS);
  assert.equal(server.comments[14].length, 1);
  assert.equal(server.posts, 1);
});

test('retry without the comments (still offline): nothing posted, stays failed', async () => {
  const { outbox, server } = setup();
  server.fail = new Error('Network Error');
  await outbox.send({ key: 'a', estimateId: 14, userId: 9, text: 'Thanks' });
  server.failComments = new Error('Network Error');
  assert.equal((await outbox.retry('a')).result, 'failed');
  assert.equal(server.posts, 1);
  assert.equal((await outbox.list())[0].state, 'failed');
});

test('404 — no longer this technician’s estimate: the message goes', async () => {
  const { outbox, server } = setup();
  server.fail = { response: { status: 404 } };
  assert.equal((await outbox.send({ key: 'a', estimateId: 14, userId: 9, text: 'x' })).result, 'gone');
  assert.deepEqual(await outbox.list(), []);
  server.fail = new Error('Network Error');
  await outbox.send({ key: 'b', estimateId: 99, userId: 9, text: 'y' });
  assert.equal((await outbox.retry('b')).result, 'gone');
  assert.deepEqual(await outbox.list(), []);
});

test('settleWith: the screen’s fresh comments drop what the server has', async () => {
  const { outbox, server } = setup();
  server.lostAnswer = true;
  await outbox.send({ key: 'a', estimateId: 14, userId: 9, text: 'Thanks' });
  assert.deepEqual(await outbox.settleWith(14, 9, server.comments[14]), ['a']);
  assert.deepEqual(await outbox.list(), []);
});

test('flushAll: this technician’s messages, oldest first; others stay', async () => {
  const { outbox, server, tick } = setup();
  server.fail = new Error('Network Error');
  server.comments[15] = [];
  await outbox.send({ key: 'a', estimateId: 15, userId: 9, text: 'first' });
  tick(1000);
  await outbox.send({ key: 'b', estimateId: 14, userId: 9, text: 'second' });
  await outbox.send({ key: 'c', estimateId: 14, userId: 3, text: 'someone else' });
  server.fail = null;
  // tried less than a minute ago: the app's own repeat leaves them for later
  assert.deepEqual((await outbox.flushAll(9)).map((x) => x.result), ['later', 'later']);
  assert.equal(server.posts, 3);
  tick(RECENT_MS);
  const r = await outbox.flushAll(9);
  assert.deepEqual(r.map((x) => [x.key, x.result]), [['a', 'sent'], ['b', 'sent']]);
  assert.deepEqual((await outbox.list()).map((p) => p.key), ['c']);
  assert.equal(server.comments[15][0].comment_text, 'first');
});

test('two presses on retry at once: one post', async () => {
  const { outbox, server } = setup();
  server.fail = new Error('Network Error');
  await outbox.send({ key: 'a', estimateId: 14, userId: 9, text: 'Thanks' });
  server.fail = null;
  const [x, y] = await Promise.all([outbox.retry('a'), outbox.retry('a')]);
  assert.deepEqual([x.result, y.result].sort(), ['busy', 'sent']);
  assert.equal(server.comments[14].length, 1);
});

test('sign out clears the list; an answer after it writes nothing back', async () => {
  const { outbox, server, queue } = setup();
  server.fail = new Error('Network Error');
  await outbox.send({ key: 'a', estimateId: 14, userId: 9, text: 'Thanks' });
  await queue.clear();
  assert.deepEqual(await outbox.list(), []);
});

test('«Yes», then «Yes» again offline: the first is not taken for the second (Teamlead #42)', async () => {
  const { outbox, server, tick } = setup();
  server.comments[14].push({ id: 20, user_id: 9, comment_text: 'Yes', created_at_utc: new Date(Date.UTC(2026, 10, 17, 14, 59, 30)).toISOString() });
  server.fail = new Error('Network Error');
  await outbox.send({ key: 'b', estimateId: 14, userId: 9, text: 'Yes', afterId: 20 });
  // the screen's next read: nothing delivered, the message stays «Not sent»
  assert.deepEqual(await outbox.settleWith(14, 9, server.comments[14]), []);
  assert.equal((await outbox.list())[0].state, 'failed');
  server.fail = null;
  tick(RECENT_MS);
  assert.equal((await outbox.retry('b')).result, 'sent');
  assert.deepEqual(server.comments[14].map((c) => c.comment_text), ['Yes', 'Yes']);
});
