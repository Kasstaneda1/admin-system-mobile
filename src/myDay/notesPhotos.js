// Notes and photos of a visit (TECH_APP_MY_DAY_SPEC.md §1, §2 POST /api/my/visits/:id/notes,
// §3 «Notes», «Photos»; design A3 final-note: «Add a note»), without React Native
// (notesPhotos.test.mjs).
//   A note: plain text, 1–2000 characters, written once per client_request_id (the same id
//   again: 200 created:false, also a success). No queue without the network, as with the
//   actions: «No connection. Try again» sends the same text with the same id.
//   A photo: taken or chosen, sent as JPEG to POST /api/scheduler/tasks/:id/photos (the
//   server makes it 1200 px); the visit's photos come from GET …/photos and show through
//   GET …/photos/:photoId/file with the technician's token.
// Both on the technician's own visit, main or helper, closed ones too; not on a cancelled
// visit or an old task (the server refuses notes there; photos follow the same rule).
import { actionError, newRequestId } from './actions.js';
import { stateOf } from './model.js';
import { noteWhen } from './visit.js';

export const NOTE_MAX = 2000;
// Ready words under the field (design final-note)
export const NOTE_CHIPS = ['Needs a part', 'Customer not home', 'Call before next visit'];

// May the technician add notes and photos to this visit now?
export function canAddExtras(visit) {
  if (!visit || visit.legacy) return false;
  return stateOf(visit) !== 'cancelled';
}

// Control characters the server refuses (\p{Cc} but tab and line breaks), e.g. from a paste
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
export function cleanNote(text) {
  return typeof text === 'string' ? text.replace(CONTROL, '') : '';
}

// The text as it is sent: cleaned and trimmed; '' when there is nothing to send
export function noteToSend(text) {
  return cleanNote(text).trim();
}

// Characters as the server counts them (code points, not UTF-16 units)
export function noteLength(text) {
  return [...noteToSend(text)].length;
}

export function noteReady(text) {
  const n = noteLength(text);
  return n > 0 && n <= NOTE_MAX;
}

// A chip adds its words to what is typed: 'Customer not home' → 'Pump replaced. Customer not home'
export function withChip(text, chip) {
  const now = typeof text === 'string' ? text : '';
  const body = now.replace(/\s+$/, '');
  let next;
  if (!body) next = chip;
  else if (/[.!?]$/.test(body)) next = `${body} ${chip}`;
  else next = `${body}. ${chip}`;
  return [...next].slice(0, NOTE_MAX).join('');
}

// The request of a save: the same id while the text is the same (Try again after no answer
// must not write the note twice); a changed text is another note, with a new id.
// last: the previous { text, requestId } or null
export function noteRequest(last, text, nowMs = Date.now(), random = Math.random) {
  const send = noteToSend(text);
  if (last && last.text === send && last.requestId) return { text: send, requestId: last.requestId };
  return { text: send, requestId: newRequestId(nowMs, random) };
}

export function noteBody({ text, requestId }) {
  return { text, client_request_id: requestId };
}

// A failed save, as actionError (offline / gone / refused / failed), in a note's words
export function noteError(error) {
  const failed = actionError(error);
  if (failed.kind === 'refused' && failed.text === 'The visit could not be changed') return { ...failed, text: 'The note could not be saved' };
  return failed;
}

// ---------- photos ----------
const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
const ACCEPTED = new Set(Object.values(TYPES));

// The picked or taken image as the upload sends it: { uri, name, type }, or null for a type
// the server does not take (HEIC from the library when it was not converted)
export function photoFile(asset) {
  if (!asset || typeof asset.uri !== 'string' || !asset.uri) return null;
  const fromName = (s) => {
    const m = typeof s === 'string' ? /\.([A-Za-z0-9]+)(?:\?.*)?$/.exec(s) : null;
    return m ? TYPES[m[1].toLowerCase()] || `image/${m[1].toLowerCase()}` : null;
  };
  const mime = typeof asset.mimeType === 'string' && asset.mimeType ? asset.mimeType.toLowerCase() : null;
  const type = mime === 'image/jpg' ? 'image/jpeg' : mime || fromName(asset.fileName) || fromName(asset.uri);
  if (!ACCEPTED.has(type)) return null;
  const ext = Object.keys(TYPES).find((k) => TYPES[k] === type && k !== 'jpeg');
  return { uri: asset.uri, name: `photo.${ext}`, type };
}

// When a photo was sent, in ms. The photo rows come as the database keeps them: a TIMESTAMP
// without a zone, in UTC, as a bare string ('2026-11-11 13:09:37.114509', backend db/index.js
// gives type 1114 as text); read as the phone's own time it would be hours off. A string with
// a zone is read as it is. Fractions beyond milliseconds are cut (Hermes reads three digits).
export function photoMoment(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?$/.exec(value.trim());
  const ms = m ? Date.parse(`${m[1]}T${m[2]}:${m[3] || '00'}.${(m[4] || '0').padEnd(3, '0').slice(0, 3)}Z`) : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

// The visit's photos from GET /api/scheduler/tasks/:id/photos (the server's rows, the newest
// first) as the screen shows them: [{ id, key, when, path }]
export function photosOf(rows, visitId, now) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && Number.isInteger(row.id) && row.id > 0)
    .map((row) => {
      const at = photoMoment(row.created_at);
      return {
        id: row.id,
        key: `p${row.id}`,
        when: now && at !== null ? noteWhen(at, now) : '',
        path: photoPath(visitId, row.id),
      };
    });
}

export function photoPath(visitId, photoId) {
  return `/api/scheduler/tasks/${encodeURIComponent(visitId)}/photos/${encodeURIComponent(photoId)}/file`;
}

// The source of a photo for the screen's Image: its full address (api.js photoUri), the token,
// and never from the phone's cache. The server already says no-store (backend photos.js); this
// keeps it so if that ever changes, so that after sign out the next person on the same phone
// cannot get the photos of the one before from the cache (iOS cache 'reload').
export function photoSource(uri, header) {
  return { uri, headers: header || undefined, cache: 'reload' };
}

export function photosTitle(n) {
  return `Photos · ${n}`;
}

// A failed upload: { kind, text, retry }; the text stands beside Try again and Cancel
//   offline — no answer: «Photo not sent. No connection.» (the same photo again);
//   gone — 404, not the technician's visit any more;
//   refused — too large, or a type the server does not take;
//   failed — the server broke: try again.
export function photoError(error) {
  const response = error && error.response;
  const status = response ? response.status : 0;
  if (!status) return { kind: 'offline', text: 'Photo not sent. No connection.', retry: true };
  if (status === 404) return { kind: 'gone', text: 'This visit was changed by the office', retry: false };
  if (status === 413) return { kind: 'refused', text: 'The photo is too large', retry: false };
  if (status === 400) {
    const said = response.data && typeof response.data.error === 'string' ? response.data.error : '';
    return { kind: 'refused', text: said || 'The photo could not be saved', retry: false };
  }
  return { kind: 'failed', text: 'Photo not sent. The server did not answer.', retry: true };
}
