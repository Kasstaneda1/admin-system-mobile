// «Seen» of the office's messages (backend #141: POST /api/my/visits/:id/office-messages/seen
// { ids }). The app tells the server which messages the technician has really had on the
// screen: in the card as the server gave it, not behind «+N more», at least the first line
// inside the visible part of the scroll, and still there when the scroll rests
// (VisitScreen waits SEEN_REST_MS). Opening a card marks nothing: the server's rule, the app
// may load a card it never shows. A repeat changes nothing on the server, so a send that got
// no answer goes again after the next fresh card. No React Native here (officeSeen.test.mjs).

// How much of a message must be on the screen: its first line, or all of a shorter one (px)
export const SEEN_MIN_PX = 24;
// The scroll rests this long with the message on the screen
export const SEEN_REST_MS = 500;

// The messages on the screen. rows: [{ id, top, height }] in the scroll's content (px);
// view: { top (the scroll's offset), height (the scroll's own height) }. → [id]
export function onScreen(rows, view) {
  if (!view || !Number.isFinite(view.top) || !(view.height > 0)) return [];
  const bottom = view.top + view.height;
  return (rows || [])
    .filter((r) => r && Number.isInteger(r.id) && Number.isFinite(r.top) && r.height > 0)
    .filter((r) => Math.min(r.top + r.height, bottom) - Math.max(r.top, view.top) >= Math.min(r.height, SEEN_MIN_PX))
    .map((r) => r.id);
}

// The ids to send: on the screen, still unseen in the card shown, and neither sent nor
// refused before (done: a Set). In order, each once.
export function toSend(visible, unseen, done) {
  const open = new Set(unseen || []);
  return [...new Set(visible || [])].filter((id) => open.has(id) && !(done && done.has(id))).sort((a, b) => a - b);
}

// A send that failed: 'gone' (404: the visit is no longer the technician's; the card's own
// refresh says so), 'refused' (400, 409: these ids are not taken; not sent again), 'failed'
// (the server's own failure) or 'offline' (no answer): both go again after a fresh card.
export function seenError(error) {
  const status = error && error.response ? error.response.status : null;
  if (!status) return { kind: 'offline' };
  if (status === 404) return { kind: 'gone' };
  if (status === 400 || status === 409 || status === 403) return { kind: 'refused' };
  return { kind: 'failed' };
}
