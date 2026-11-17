// The phone's messages to the office not yet on the server (TECH_APP_ESTIMATE_SCREEN_SPEC.md
// §4.3), without React Native (outbox.test.mjs): outboxStore.js passes AsyncStorage and the
// API, the tests pass stand-ins.
//   A message shows at once with «Sending…». Sent — it goes from the list. No answer or a
//   server error — «Not sent · Tap to retry»; it also stays on the phone and goes the next
//   time the app is open with the network (flushAll), the screen closed or not.
//   The server takes no request id for a comment: before a message is sent again, the
//   estimate's comments are read and a message the server already has is taken as sent
//   (model.js settle) — the same message never lands twice.
//   The list goes with the session (session/deviceStore.js clear): what a technician wrote
//   is not left for the next one on this phone.
//
// makeOutbox({ queue, api: { comments(id), post(id, body) }, timeZone(), now() }):
//   list() — every entry;
//   send({ key, estimateId, userId, text }) — keeps the entry, posts it; resolves to
//     { result: 'sent', comment } | { result: 'failed' } | { result: 'gone' | 'refused' };
//   retry(key) — the same entry again, checked against the comments first;
//   settleWith(estimateId, userId, comments) — drops the entries the server has;
//   flushAll(userId) — every entry of this technician, estimate by estimate.
import { commentBody, entriesOf, newEntry, sendFailure, settle, withEntry, withState, withoutKeys } from './model.js';

export function makeOutbox({ queue, api, timeZone = () => null, now = () => Date.now() }) {
  const running = new Set(); // keys being sent right now: a second press waits for the first

  const list = async () => {
    const box = await queue.update((b) => b, queue.mark());
    return Array.isArray(box) ? box : [];
  };
  const change = (fn) => queue.update((b) => fn(Array.isArray(b) ? b : []), queue.mark());

  async function post(entry) {
    try {
      const answer = await api.post(entry.estimateId, commentBody(entry.text, timeZone()));
      await change((b) => withoutKeys(b, [entry.key]));
      return { result: 'sent', comment: answer && answer.comment ? answer.comment : null };
    } catch (error) {
      const why = sendFailure(error);
      if (why === 'retry') {
        await change((b) => withState(b, entry.key, 'failed'));
        return { result: 'failed' };
      }
      await change((b) => withoutKeys(b, [entry.key]));
      return { result: why };
    }
  }

  async function guarded(key, run) {
    if (running.has(key)) return { result: 'busy' };
    running.add(key);
    try { return await run(); } finally { running.delete(key); }
  }

  async function send({ key, estimateId, userId, text }) {
    const entry = newEntry({ key, estimateId, userId, text, at: now() });
    if (!entry.text) return { result: 'refused' };
    await change((b) => withEntry(b, entry));
    return guarded(key, () => post(entry));
  }

  // Is the entry on the server already? Reads the comments; no answer — not known, so
  // nothing is sent (it would maybe be a second copy) and the entry stays failed
  async function checked(entry) {
    let comments;
    try {
      comments = await api.comments(entry.estimateId);
    } catch (error) {
      if (sendFailure(error) === 'gone') {
        await change((b) => withoutKeys(b, [entry.key]));
        return 'gone';
      }
      return 'unknown';
    }
    const { delivered } = settle([entry], comments, entry.userId);
    if (delivered.length) {
      await change((b) => withoutKeys(b, delivered));
      return 'delivered';
    }
    return 'missing';
  }

  async function retry(key) {
    return guarded(key, async () => {
      const entry = (await list()).find((p) => p.key === key);
      if (!entry) return { result: 'sent', comment: null };
      await change((b) => withState(b, key, 'sending'));
      const known = await checked(entry);
      if (known === 'delivered') return { result: 'sent', comment: null };
      if (known === 'gone') return { result: 'gone' };
      if (known === 'unknown') {
        await change((b) => withState(b, key, 'failed'));
        return { result: 'failed' };
      }
      return post(entry);
    });
  }

  async function settleWith(estimateId, userId, comments) {
    const mine = entriesOf(await list(), estimateId, userId).filter((p) => !running.has(p.key));
    const { delivered } = settle(mine, comments, userId);
    if (delivered.length) await change((b) => withoutKeys(b, delivered));
    return delivered;
  }

  // One estimate at a time, oldest first: the office reads them in the order written
  async function flushAll(userId) {
    const me = userId === null || userId === undefined ? null : String(userId);
    const mine = (await list()).filter((p) => p.userId === me).sort((a, b) => a.at - b.at);
    const results = [];
    for (const p of mine) {
      if (running.has(p.key)) continue;
      results.push({ key: p.key, ...(await retry(p.key)) });
    }
    return results;
  }

  return { list, send, retry, settleWith, flushAll };
}
