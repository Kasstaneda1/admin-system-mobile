// The customer's signatures kept on this phone until the server has them (design
// app-invoice offline: «Signed · saved on this phone»), without React Native (queue.test.mjs):
// store.js passes AsyncStorage and the API, the tests pass stand-ins.
//   A signature is kept first, then sent. No answer or a server error — it stays and goes
//   again: when the app opens or comes back with the network (flushAll), and when its visit
//   opens. The server takes the same client_request_id once (200 created: false), so a
//   repeat never gives a second approval.
//   The server refused it (the draft or the terms changed meanwhile, or another reason): it
//   stays, marked with the reason, never sent again by itself — the customer signs again on
//   the Approve screen, which replaces it. The visit gone from this technician: dropped.
//   The list goes with the session (session/store.js): a signature is not left for the next
//   technician on this phone.
//
// makeApproveQueue({ queue, api: { sign(visitId, body) } }):
//   list() — every entry { key, visitId, userId, body, at, failed: null | { kind, text } };
//   pendingOf(visitId, userId) — this visit's entry or null;
//   sign({ visitId, userId, body, at }) — keeps the entry (in place of the visit's earlier one)
//     and sends it: { result: 'sent', authorization } | { result: 'waiting', failed } |
//     { result: 'resign' | 'refused' | 'gone', failed } | { result: 'busy' };
//   flushAll(userId) — every entry of this technician not refused;
//   drop(visitId, userId) — forgets the visit's entry.
import { approveError } from './model.js';

export function makeApproveQueue({ queue, api }) {
  const running = new Set(); // keys being sent right now

  const list = async () => {
    const box = await queue.update((b) => b, queue.mark());
    return Array.isArray(box) ? box : [];
  };
  const change = (fn) => queue.update((b) => fn(Array.isArray(b) ? b : []), queue.mark());
  const sameVisit = (e, visitId, userId) => String(e.visitId) === String(visitId) && String(e.userId) === String(userId);

  async function post(entry) {
    if (running.has(entry.key)) return { result: 'busy' };
    running.add(entry.key);
    try {
      const data = await api.sign(entry.visitId, entry.body);
      await change((b) => b.filter((e) => e.key !== entry.key));
      return { result: 'sent', authorization: (data && data.authorization) || null };
    } catch (error) {
      const failed = approveError(error);
      if (failed.kind === 'offline' || failed.kind === 'failed') return { result: 'waiting', failed };
      if (failed.kind === 'gone') {
        await change((b) => b.filter((e) => e.key !== entry.key));
        return { result: 'gone', failed };
      }
      await change((b) => b.map((e) => (e.key === entry.key ? { ...e, failed: { kind: failed.kind, text: failed.text } } : e)));
      return { result: failed.kind, failed };
    } finally {
      running.delete(entry.key);
    }
  }

  async function pendingOf(visitId, userId) {
    return (await list()).find((e) => sameVisit(e, visitId, userId)) || null;
  }

  async function sign({ visitId, userId, body, at }) {
    const entry = { key: body.client_request_id, visitId: String(visitId), userId: String(userId), body, at, failed: null };
    await change((b) => [...b.filter((e) => !sameVisit(e, visitId, userId)), entry]);
    return post(entry);
  }

  async function flushAll(userId) {
    const mine = (await list()).filter((e) => String(e.userId) === String(userId) && !e.failed);
    for (const entry of mine) await post(entry);
  }

  const drop = (visitId, userId) => change((b) => b.filter((e) => !sameVisit(e, visitId, userId)));

  return { list, pendingOf, sign, flushAll, drop };
}
