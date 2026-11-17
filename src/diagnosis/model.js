// The diagnosis of a visit in the technician app (VISIT_DIAGNOSIS_SPEC.md §3, design
// VISIT_DIAGNOSIS_DESIGN.md §3–4, PR D1-APP; look: design-mockups/visit-diagnosis app-*),
// without React Native (model.test.mjs).
//   What the technician found and what needs to be done, one text for the customer, printed on
//   the bill. The server keeps it on the visit (backend D1-BE): GET /api/my/visits/:id and the
//   bill's answer carry `diagnosis` { text, version, updated_at, updated_by_name,
//   edited_by_office, locked, addenda: [{ id, text, author_name, created_at }] }.
//   - While the visit has no issued (or void) bill, the main technician and the helper edit the
//     text: PUT …/diagnosis { text, base_version, client_request_id }.
//   - Once it has one (locked), they only ADD to it: POST …/diagnosis/addenda { text,
//     client_request_id } — an addition with their name and the time, never changed.
//   - «Someone changed it before you»: an edit carries the version it was written on; another
//     one saved meanwhile comes back as 409 diagnosis_conflict with their text, and the
//     technician chooses: their text, or theirs replaced by this one.
//   No queue without the network, as with notes: «No connection. Try again» sends the same
//   text with the same id (the server writes it once); the text stays in the field until then.
//   Not here yet: the diagnosis required (Д-2, server PR D2-BE), Estimate needed (D3).
import { actionError, newRequestId } from '../myDay/actions.js';
import { clockAmPm, dayLabel, momentWall, parseWall, stateOf } from '../myDay/model.js';
import { cleanNote } from '../myDay/notesPhotos.js';
import { monthDay, techName } from '../myDay/visit.js';

export const DIAGNOSIS_MAX = 2000;
// Visits closed without work have no diagnosis (the server refuses it there)
const NO_WORK = ['no_access', 'client_rescheduled'];
// Outcomes that ask for the diagnosis in «How did it end?» on a visit that is not a
// diagnostics visit (spec §3.2: Diagnostics only, Deposit taken; Estimate needed with D3)
const FINISH_ASKS = ['diagnostics_only', 'deposit', 'estimate_needed'];

export const DIAGNOSIS_HINT = 'What did you find, and what needs to be done? The customer will see this.';
export const LOCKED_HINT = 'The bill is already issued. Your note is added to the visit and the estimate; the office can reissue the bill if the customer needs it on paper.';

const words = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

// The visit's diagnosis as the server gave it, made safe: { text, version, locked, updatedAt,
// updatedBy, editedByOffice, addenda: [{ id, text, author, at }] }; null when the visit has
// none in it (the list's visit, a card kept from before the server had it, an old task)
export function diagnosisOf(holder) {
  const d = holder && holder.diagnosis;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const addenda = (Array.isArray(d.addenda) ? d.addenda : [])
    .filter((a) => a && words(a.text))
    .map((a) => ({ id: a.id, text: a.text.trim(), author: words(a.author_name), at: a.created_at || a.at || null }));
  return {
    text: words(d.text),
    version: Number.isInteger(d.version) && d.version >= 0 ? d.version : 0,
    locked: d.locked === true,
    updatedAt: d.updated_at || null,
    updatedBy: words(d.updated_by_name),
    editedByOffice: d.edited_by_office === true,
    addenda,
  };
}

// May the technician write (or add to) this visit's diagnosis now? Their own visit, main or
// helper (the card is theirs), closed ones too; not a cancelled one, an old task or a visit
// closed without work; only once the server's card has the diagnosis in it
export function canWriteDiagnosis(visit) {
  if (!visit || visit.legacy || !diagnosisOf(visit)) return false;
  if (stateOf(visit) === 'cancelled') return false;
  return !NO_WORK.includes(visit.outcome);
}

// 'Tue, Nov 18, 10:05 AM' in New York; '' when unknown
export function whenText(value) {
  const at = momentWall(value);
  return at ? `${dayLabel(at.date)}, ${clockAmPm(at.minutes)}` : '';
}
// 'Nov 18, 4:12 PM'
function shortWhen(value) {
  const at = momentWall(value);
  return at ? `${monthDay(at.date)}, ${clockAmPm(at.minutes)}` : '';
}

// An addition as the card writes it: { key, head: 'Added by Ivan P., Nov 18, 4:12 PM', text }
function addendumRow(a, i) {
  const by = techName(a.author) || 'the technician';
  return { key: `a${a.id ?? i}`, head: [`Added by ${by}`, shortWhen(a.at)].filter(Boolean).join(', '), text: a.text };
}

// Under the text: who wrote it last and when. The office: 'Edited by Anna L., Nov 18, 10:05 AM'
// (spec §3.3); the visit's technician or helper: 'Ivan Petrov · Tue, Nov 18, 10:05 AM' (design)
function byLine(d) {
  if (!d.text) return null;
  if (d.editedByOffice) return [`Edited by ${techName(d.updatedBy) || 'the office'}`, shortWhen(d.updatedAt)].filter(Boolean).join(', ');
  return [d.updatedBy, whenText(d.updatedAt)].filter(Boolean).join(' · ') || null;
}

// What the Diagnosis block of the visit shows (design app-visit-empty, app-after,
// app-after-bill), or null when the visit has no diagnosis in it, or none may be written and
// none was:
// { text, by, addenda: [{ key, head, text }], mode, button, hint, empty }
//   mode — what the button does: 'write' (none yet: «Add diagnosis»), 'edit' («Edit»), 'add'
//          (the bill is issued: «Add to diagnosis»), or null (nothing may be written here);
//   hint — the line of the design under the title (none yet) or under the button (issued).
export function diagnosisBlock(visit) {
  const d = diagnosisOf(visit);
  if (!d) return null;
  const writable = canWriteDiagnosis(visit);
  // a visit where nothing may be written and nothing was: no block (no access, cancelled)
  if (!writable && !d.text && !d.addenda.length) return null;
  let mode = null;
  if (writable) mode = d.locked ? 'add' : d.text ? 'edit' : 'write';
  const button = { write: 'Add diagnosis', edit: 'Edit', add: 'Add to diagnosis' }[mode] || null;
  let hint = null;
  if (mode === 'write') hint = DIAGNOSIS_HINT;
  else if (mode === 'add') hint = LOCKED_HINT;
  return {
    text: d.text,
    by: byLine(d),
    addenda: d.addenda.map(addendumRow),
    mode,
    button,
    hint,
    empty: !d.text && !d.addenda.length,
  };
}

// ---------- writing ----------
// The text as it is sent: control characters out (as the server refuses them), trimmed
export function diagnosisToSend(text) {
  return cleanNote(text).trim();
}
export function diagnosisLength(text) {
  return [...diagnosisToSend(text)].length;
}

// May Save be pressed? mode 'add': 1 to DIAGNOSIS_MAX characters. 'write'/'edit': at most
// DIAGNOSIS_MAX and not the text the visit has (an empty field clears it — until Д-2)
export function diagnosisReady(mode, text, current = null) {
  const n = diagnosisLength(text);
  if (n > DIAGNOSIS_MAX) return false;
  if (mode === 'add') return n > 0;
  return diagnosisToSend(text) !== (current || '');
}

// The request of a save. The same id while the mode, the text and the version written on are
// the same (Try again after no answer must not write it twice, and the server answers the
// same id with 200, nothing written); anything else is a new request with a new id.
// last: the previous { mode, text, baseVersion, requestId } or null
export function diagnosisRequest(last, { mode, text, baseVersion = 0 }, nowMs = Date.now(), random = Math.random) {
  const send = diagnosisToSend(text);
  const kind = mode === 'add' ? 'add' : 'edit';
  const base = kind === 'add' ? null : baseVersion;
  if (last && last.mode === kind && last.text === send && last.baseVersion === base && last.requestId) {
    return { mode: kind, text: send, baseVersion: base, requestId: last.requestId };
  }
  return { mode: kind, text: send, baseVersion: base, requestId: newRequestId(nowMs, random) };
}

export function diagnosisBody({ mode, text, baseVersion, requestId }) {
  if (mode === 'add') return { text, client_request_id: requestId };
  return { text: text || null, base_version: baseVersion, client_request_id: requestId };
}

// A failed save, as the screen handles it: { kind, text, visit, theirs, diagnosis }
//   (diagnosis: the server's block as it is now, raw, for the bill screen; theirs: made safe)
//   offline / failed — no answer: the same request again (Try again);
//   gone — 404, not the technician's visit any more: back to the day;
//   conflict — someone saved another text meanwhile: theirs (diagnosisOf) to choose from;
//   locked — the bill was issued meanwhile: the text can go as an addition instead;
//   refused — the server's words (400, 403, 409: cancelled, closed without work, 30 additions…)
export function diagnosisError(error) {
  const failed = actionError(error);
  const data = (error && error.response && error.response.data) || {};
  if (failed.kind === 'offline' || failed.kind === 'gone' || failed.kind === 'failed') return { ...failed, theirs: null, diagnosis: null };
  const raw = data.diagnosis && typeof data.diagnosis === 'object' ? data.diagnosis : null;
  const theirs = raw ? diagnosisOf({ diagnosis: raw }) : null;
  if (data.code === 'diagnosis_conflict' && theirs) {
    return { kind: 'conflict', text: 'Someone changed the diagnosis before you', visit: data.visit || null, theirs, diagnosis: raw };
  }
  if (data.code === 'diagnosis_locked') {
    return { kind: 'locked', text: 'The bill was issued meanwhile. Send your text as an addition to the diagnosis.', visit: data.visit || null, theirs, diagnosis: raw };
  }
  const text = failed.text === 'The visit could not be changed' ? 'The diagnosis could not be saved' : failed.text;
  return { kind: 'refused', text, visit: data.visit || null, theirs, diagnosis: raw };
}

// The other text in «Someone changed it before you»: { text, by }
export function conflictOf(theirs) {
  if (!theirs) return null;
  const by = theirs.editedByOffice ? `${techName(theirs.updatedBy) || 'The office'} (office)` : theirs.updatedBy || 'Someone';
  return { text: theirs.text, by: [by, whenText(theirs.updatedAt)].filter(Boolean).join(' · ') };
}

// ---------- «How did it end?» ----------
// Does the Finish sheet show the diagnosis field for this outcome? On a diagnostics visit at
// every outcome; on the rest at Diagnostics only and Deposit taken (spec §3.2). Not required
// yet (Д-2 comes with D2-BE). Only where the technician may write the text itself.
export function finishAsksDiagnosis(visit, outcome) {
  if (!canWriteDiagnosis(visit)) return false;
  const d = diagnosisOf(visit);
  if (d.locked) return false;
  return visit.visit_kind === 'diagnostics' || FINISH_ASKS.includes(outcome);
}

// The field's text in the Finish sheet differs from the visit's: save it before the finish
export function finishDiagnosisChanged(visit, text) {
  const d = diagnosisOf(visit);
  if (!d) return false;
  return diagnosisToSend(text) !== (d.text || '');
}

// ---------- the bill ----------
// The Diagnosis block of the bill screen (spec §3.2 item 2, «Printed on the bill»), or null:
// a draft shows the visit's diagnosis as it is now (the issue prints it), with Edit while the
// technician may write it; an issued or void bill shows what it printed (printed_diagnosis),
// nothing to change there. { text, addenda: [{ key, head, text }], mode, button, hint }
export function billDiagnosis(bill) {
  if (!bill) return null;
  if (bill.status === 'draft') {
    const d = diagnosisOf(bill);
    if (!d) return null;
    const mode = d.locked ? null : d.text ? 'edit' : 'write';
    return {
      text: d.text,
      addenda: d.addenda.map(addendumRow),
      mode,
      button: { write: 'Add diagnosis', edit: 'Edit' }[mode] || null,
      hint: mode === 'write' ? DIAGNOSIS_HINT : null,
    };
  }
  const printed = diagnosisOf({ diagnosis: bill.printed_diagnosis });
  if (!printed || (!printed.text && !printed.addenda.length)) return null;
  return { text: printed.text, addenda: printed.addenda.map(addendumRow), mode: null, button: null, hint: null };
}

// What the PDF prints (backend billPdf.js, the Designer's sheet): the text; '— Ivan Petrov,
// Nov 18, 2026' (the bill's technician and the visit's day); each addition 'Added by Ivan
// Petrov, Nov 18, 2026, 4:12 PM ET: …'. A draft prints the visit's diagnosis as it is now, an
// issued bill its own copy. null — no block, no empty heading.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDay = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`;
export function previewDiagnosis(bill, visit) {
  if (!bill) return null;
  const d = bill.status === 'draft' ? diagnosisOf(bill) : diagnosisOf({ diagnosis: bill.printed_diagnosis });
  if (!d || (!d.text && !d.addenda.length)) return null;
  const start = visit ? parseWall(visit.scheduled_start) : null;
  const who = bill.technician && words(bill.technician.name);
  const signature = d.text ? [who, start ? longDay(start.date) : null].filter(Boolean).join(', ') : '';
  return {
    text: d.text,
    signature: signature ? `— ${signature}` : null,
    addenda: d.addenda.map((a, i) => {
      const at = momentWall(a.at);
      const when = at ? `${longDay(at.date)}, ${clockAmPm(at.minutes)} ET` : '';
      return { key: `p${a.id ?? i}`, lead: `Added by ${a.author || 'the technician'}${when ? `, ${when}` : ''}: `, text: a.text };
    }),
  };
}
