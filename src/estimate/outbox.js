// The phone's messages to the office not yet on the server (TECH_APP_ESTIMATE_SCREEN_SPEC.md
// §4.3), without React Native (outbox.test.mjs): outboxStore.js passes AsyncStorage and the
// API, the tests pass stand-ins.
//   A message shows at once with «Sending…». Sent — it goes from the list. No answer or a
//   server error — «Not sent · Tap to retry»; it also stays on the phone and goes the next
//   time the app is open with the network (flushAll), the screen closed or not.
//   Every try sends the entry's key as client_request_id: the server answers a repeat with the
//   comment it wrote the first time, never a second copy (N3-BE). Before a message is sent
//   again the estimate's comments are still read and a message the server already has is taken
//   as sent (model.js settle), and a try with no answer is left a minute (RECENT_MS): the app's
//   own repeats (flushAll, the screen opening) skip such a message, a press on «Tap to retry»
//   waits and reads the comments again.
//   Mentions (mentions.js): the people picked go as ids. A person who can no longer open the
//   estimate (400 mention_not_allowed) is left out and the message goes without them, at once:
//   it is never lost for a mention; the answer names them (notNotified).
//   The list goes with the session (session/deviceStore.js clear): what a technician wrote
//   is not left for the next one on this phone.
//
// makeOutbox({ queue, api: { comments(id), post(id, body) }, timeZone(), now() }):
//   list() — every entry;
//   send({ key, estimateId, userId, text, afterId, mentions }) — keeps the entry, posts it;
//     resolves to { result: 'sent', comment, notNotified: [{ user_id, name }] } |
//     { result: 'failed' } | { result: 'gone' | 'refused' };
//   retry(key) — the same entry again, checked against the comments first;
//   settleWith(estimateId, userId, comments) — drops the entries the server has;
//   flushAll(userId) — every entry of this technician, estimate by estimate.
import { commentBody, entriesOf, newEntry, sendFailure, settle, withEntry, withState, withoutKeys } from './model.js';
import { refusedMentions } from './mentions.js';

// A try older than this that got no answer is taken as lost (the request times out at 15 s)
export const RECENT_MS = 60 * 1000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function makeOutbox({ queue, api, timeZone = () => null, now = () => Date.now(), sleep = pause }) {
  const running = new Set(); // keys being sent right now: a second press waits for the first

  const list = async () => {
    const box = await queue.update((b) => b, queue.mark());
    return Array.isArray(box) ? box : [];
  };
  const change = (fn) => queue.update((b) => fn(Array.isArray(b) ? b : []), queue.mark());

  async function post(first) {
    let entry = first;
    const tried = now();
    await change((b) => b.map((p) => (p.key === entry.key ? { ...p, tried } : p)));
    for (;;) {
      const mentions = Array.isArray(entry.mentions) ? entry.mentions : [];
      try {
        const answer = await api.post(entry.estimateId, commentBody(entry.text, timeZone(), { mentions, requestId: entry.key }));
        await change((b) => withoutKeys(b, [entry.key]));
        return { result: 'sent', comment: answer && answer.comment ? answer.comment : null, notNotified: entry.notNotified || [] };
      } catch (error) {
        const refused = refusedMentions(error);
        // Nothing was written: the same key goes again, without the people refused (no ids —
        // without any), so this loop ends
        if (refused !== null && mentions.length) {
          const named = mentions.filter((m) => refused.includes(Number(m.user_id)));
          // the server named nobody of ours: every mention goes, so the next try has none
          const out = named.length ? named : mentions;
          const next = { ...entry, mentions: mentions.filter((m) => !out.includes(m)), notNotified: [...(entry.notNotified || []), ...out] };
          entry = next;
          await change((b) => b.map((p) => (p.key === next.key ? { ...p, mentions: next.mentions, notNotified: next.notNotified } : p)));
          continue;
        }
        return failed(entry, error);
      }
    }
  }

  async function failed(entry, error) {
    const why = sendFailure(error);
    if (why === 'retry') {
      await change((b) => withState(b, entry.key, 'failed'));
      return { result: 'failed' };
    }
    await change((b) => withoutKeys(b, [entry.key]));
    return { result: why };
  }

  async function guarded(key, run) {
    if (running.has(key)) return { result: 'busy' };
    running.add(key);
    try { return await run(); } finally { running.delete(key); }
  }

  // afterId: the highest comment id the screen had when the message was written (model.js settle);
  // mentions: [{ user_id, name }] picked and still in the text (mentions.js mentionsIn)
  async function send({ key, estimateId, userId, text, afterId = null, mentions = [] }) {
    const entry = newEntry({ key, estimateId, userId, text, at: now(), afterId, mentions });
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

  const recent = (entry) => Number.isFinite(entry.tried) && now() - entry.tried < RECENT_MS;

  // auto: the app's own repeat — a message tried less than a minute ago is left for later
  async function retry(key, { auto = false } = {}) {
    return guarded(key, async () => {
      const entry = (await list()).find((p) => p.key === key);
      if (!entry) return { result: 'sent', comment: null };
      if (recent(entry)) {
        if (auto) return { result: 'later' };
        await change((b) => withState(b, key, 'sending'));
        await sleep(entry.tried + RECENT_MS - now());
      }
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
      results.push({ key: p.key, ...(await retry(p.key, { auto: true })) });
    }
    return results;
  }

  return { list, send, retry, settleWith, flushAll };
}
