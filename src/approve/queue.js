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
//   The moment the customer signed (PR 13г): the entry keeps it (at); each send adds it to the
//   body as signed_at (model.js withSignedAt) on the sends from the queue — kept apart from the
//   body, so a signature kept by an older version of the app goes with its moment too. The first
//   try goes without it (SIGNED_AT_FIRST_SEND: the server's receipt is the moment then). The server refusing the moment (400 signed_at_out_of_bounds, kind 'clock') marks
//   the entry like any refusal: it never goes again without its moment.
//
// makeApproveQueue({ queue, api: { sign(visitId, body) } }):
//   list() — every entry { key, visitId, userId, body, at, failed: null | { kind, text } };
//   pendingOf(visitId, userId) — this visit's entry or null;
//   sign({ visitId, userId, body, at }) — keeps the entry (in place of the visit's earlier one)
//     and sends it; at: the moment the customer signed (ms, this phone's clock):
//     { result: 'sent', authorization } | { result: 'waiting', failed } |
//     { result: 'resign' | 'refused' | 'clock' | 'gone', failed } | { result: 'busy' };
//   flushAll(userId) — every entry of this technician not refused;
//   drop(visitId, userId) — forgets the visit's entry.
import { approveError, withSignedAt } from './model.js';

// Whether the first try carries signed_at too. No (the lead, 17.11, variant A): a signature sent
// at once is taken at the moment the server gets it, as before 13г; only a signature that waited
// on the phone carries its moment. The server's lower bound (an hour before On my way, else
// before the window) would refuse an honest signature of a technician who came early without
// On my way — the server widens it in its own PR (variant B).
export const SIGNED_AT_FIRST_SEND = false;

export function makeApproveQueue({ queue, api, signedAtFirst = SIGNED_AT_FIRST_SEND }) {
  return makeSignatureQueue({
    queue, api, errorOf: approveError, withMoment: withSignedAt, momentFirst: signedAtFirst,
    sentOf: (data) => ({ authorization: (data && data.authorization) || null }),
  });
}

// The queue itself, for any customer's signature the server takes once by client_request_id:
// the approval before the work (above) and the signature «after the work» (ack/queue.js).
//   errorOf(error) — { kind, text }: 'offline' and 'failed' wait, the kinds in `drops` take the
//     entry off the phone, any other marks it (never sent again by itself);
//   withMoment(body, at) — the body of a send from the queue (the first one too with momentFirst);
//   before(entry) — before a send from the queue (not the first one): null, or { kind, text } that
//     marks the entry without sending it (ack: the bill it was signed for is not the visit's any
//     more); a throw of it waits like the send's;
//   sentOf(data) — what a sent result carries of the server's answer ({ result: 'sent', ...sentOf });
//   sign({ visitId, userId, body, at, ...more }) keeps `more` in the entry (ack: the bill).
export function makeSignatureQueue({ queue, api, errorOf, withMoment = (body) => body, momentFirst = false, drops = ['gone'], before = null, sentOf = () => ({}) }) {
  const running = new Set(); // keys being sent right now

  const list = async () => {
    const box = await queue.update((b) => b, queue.mark());
    return Array.isArray(box) ? box : [];
  };
  const change = (fn) => queue.update((b) => fn(Array.isArray(b) ? b : []), queue.mark());
  const sameVisit = (e, visitId, userId) => String(e.visitId) === String(visitId) && String(e.userId) === String(userId);
  const mark = (entry, failed) => change((b) => b.map((e) => (e.key === entry.key ? { ...e, failed: { kind: failed.kind, text: failed.text } } : e)));

  async function post(entry, { first = false } = {}) {
    if (running.has(entry.key)) return { result: 'busy' };
    running.add(entry.key);
    try {
      if (!first && before) {
        const stop = await before(entry);
        if (stop) {
          await mark(entry, stop);
          return { result: stop.kind, failed: stop };
        }
      }
      const body = first && !momentFirst ? entry.body : withMoment(entry.body, entry.at);
      const data = await api.sign(entry.visitId, body);
      await change((b) => b.filter((e) => e.key !== entry.key));
      return { result: 'sent', ...sentOf(data) };
    } catch (error) {
      const failed = errorOf(error);
      if (failed.kind === 'offline' || failed.kind === 'failed') return { result: 'waiting', failed };
      if (drops.includes(failed.kind)) {
        await change((b) => b.filter((e) => e.key !== entry.key));
        return { result: failed.kind, failed };
      }
      await mark(entry, failed);
      return { result: failed.kind, failed };
    } finally {
      running.delete(entry.key);
    }
  }

  async function pendingOf(visitId, userId) {
    return (await list()).find((e) => sameVisit(e, visitId, userId)) || null;
  }

  async function sign({ visitId, userId, body, at, ...more }) {
    const entry = { ...more, key: body.client_request_id, visitId: String(visitId), userId: String(userId), body, at, failed: null };
    await change((b) => [...b.filter((e) => !sameVisit(e, visitId, userId)), entry]);
    return post(entry, { first: true });
  }

  async function flushAll(userId) {
    const mine = (await list()).filter((e) => String(e.userId) === String(userId) && !e.failed);
    for (const entry of mine) await post(entry);
  }

  const drop = (visitId, userId) => change((b) => b.filter((e) => !sameVisit(e, visitId, userId)));

  return { list, pendingOf, sign, flushAll, drop };
}
