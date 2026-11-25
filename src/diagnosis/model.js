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
import { clockAmPm, dayLabel, momentWall, nowWall, parseWall, stateOf } from '../myDay/model.js';
import { cleanNote } from '../myDay/notesPhotos.js';
import { diagnosisModeOf } from '../steps/skip.js';
import { monthDay, techName } from '../myDay/visit.js';

export const DIAGNOSIS_MAX = 2000;
// Visits closed without work have no diagnosis (the server refuses it there)
const NO_WORK = ['no_access', 'client_rescheduled'];
// Outcomes that ask for the diagnosis in «How did it end?» on a visit that is not a
// diagnostics visit (spec §3.2: Diagnostics only, Deposit taken; Estimate needed with D3)
const FINISH_ASKS = ['diagnostics_only', 'deposit', 'estimate_needed'];

export const DIAGNOSIS_HINT = 'What did you find, and what needs to be done? The customer will see this.';
export const LOCKED_HINT = 'The bill is already final. Your note is added to the visit and the estimate; the office can make a new bill if the customer needs it on paper.';

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

// ---------- the diagnosis of the diagnostics visit (spec §3.7) ----------
// A visit that needs no diagnosis of its own (a repair) and has none shows what the job's
// diagnostics found: the server's inherited_diagnosis { from_visit_id, from_visit_kind,
// from_visit_date 'YYYY-MM-DD', text, addenda, updated_by_name, updated_at } | null, on the visit
// (GET /my/visits/:id) and on the bill's draft. Read only: it is changed on that visit. The
// visit's own text always wins; one written here replaces it on this visit's bill. The words are
// the site's (fe billDiagnosisModel.js).
const KIND_WORDS = { diagnostics: 'diagnostics', repair: 'repair', recall: 'recall', installation: 'installation' };
const visitWords = (kind) => `the ${KIND_WORDS[kind] || 'diagnostics'} visit`;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// 'YYYY-MM-DD' → 'Nov 12' (this year) or 'Nov 12, 2025'; '' when it is not such a date
function dayWords(day, today) {
  const m = DAY_RE.exec(String(day || ''));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return '';
  const text = `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
  return today && String(today).slice(0, 4) === m[1] ? text : `${text}, ${m[1]}`;
}
// The diagnosis taken from another visit of the job, made safe, or null: none given, no text, or
// the holder (the visit, the draft) has its own (text or additions)
// { text, addenda: [{ id, text, author, at }], kind, date, by }
export function inheritedOf(holder) {
  if (!holder) return null;
  const own = diagnosisOf(holder);
  if (own && (own.text || own.addenda.length)) return null;
  const inh = holder.inherited_diagnosis;
  if (!inh || typeof inh !== 'object' || Array.isArray(inh) || !words(inh.text)) return null;
  const { addenda } = diagnosisOf({ diagnosis: { text: inh.text, addenda: inh.addenda } });
  return { text: words(inh.text), addenda, kind: inh.from_visit_kind || null, date: inh.from_visit_date || null, by: words(inh.updated_by_name) };
}
// 'From the diagnostics visit, Nov 12' (no date: 'From the diagnostics visit'); today: 'YYYY-MM-DD'
export function fromWords(kind, date, today = nowWall(Date.now()).date) {
  const day = dayWords(date, today);
  return `From ${visitWords(kind)}${day ? `, ${day}` : ''}`;
}
// Under the text: 'Ivan Petrov · change it on the diagnostics visit'
export function whereWords(inherited) {
  const where = visitWords(inherited && inherited.kind);
  return inherited && inherited.by ? `${inherited.by} · change it on ${where}` : `Change it on ${where}`;
}
export const OWN_LABEL = 'Write its own diagnosis';
export const replacesWords = (kind) => `Saved here, it replaces the one from ${visitWords(kind)} on this visit’s bill.`;
// The block of a taken diagnosis: may the visit still get its own text (no issued bill yet) —
// then «Write its own diagnosis» opens the sheet as «Add diagnosis» (mode 'own', opens 'write')
function inheritedBlock(inh, writable, today) {
  const mode = writable ? 'own' : null;
  return {
    text: inh.text,
    from: fromWords(inh.kind, inh.date, today),
    by: whereWords(inh),
    addenda: inh.addenda.map(addendumRow),
    mode,
    opens: mode ? 'write' : null,
    button: mode ? OWN_LABEL : null,
    hint: mode ? replacesWords(inh.kind) : null,
    empty: false,
  };
}

// What the Diagnosis block of the visit shows (design app-visit-empty, app-after,
// app-after-bill), or null when the visit has no diagnosis in it, or none may be written and
// none was:
// { text, from, by, addenda: [{ key, head, text }], mode, opens, button, hint, empty }
//   from — 'From the diagnostics visit, Nov 12' over a taken text (§3.7), else null;
//   mode — what the button does: 'write' (none yet: «Add diagnosis»), 'edit' («Edit»), 'add'
//          (the bill is issued: «Add to diagnosis»), 'own' (a taken text: «Write its own
//          diagnosis»), or null (nothing may be written here); opens — the sheet it opens;
//   hint — the line of the design under the title (none yet) or under the button (issued).
export function diagnosisBlock(visit, today) {
  const d = diagnosisOf(visit);
  if (!d) return null;
  const writable = canWriteDiagnosis(visit);
  // a repair without its own: the diagnostics visit's (§3.7); its own text only before the bill
  const inh = inheritedOf(visit);
  if (inh) return inheritedBlock(inh, writable && !d.locked, today);
  // a visit where nothing may be written and nothing was: no block (no access, cancelled); the
  // company's Diagnosis Off and nothing written: no block either (steps/skip.js diagnosisModeOf)
  if (!d.text && !d.addenda.length && (!writable || diagnosisModeOf(visit) === 'off')) return null;
  let mode = null;
  if (writable) mode = d.locked ? 'add' : d.text ? 'edit' : 'write';
  const button = { write: 'Add diagnosis', edit: 'Edit', add: 'Add to diagnosis' }[mode] || null;
  let hint = null;
  if (mode === 'write') hint = DIAGNOSIS_HINT;
  else if (mode === 'add') hint = LOCKED_HINT;
  return {
    text: d.text,
    from: null,
    by: byLine(d),
    addenda: d.addenda.map(addendumRow),
    mode,
    opens: mode,
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
    return { kind: 'locked', text: 'The bill became final meanwhile. Send your text as an addition to the diagnosis.', visit: data.visit || null, theirs, diagnosis: raw };
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
// every outcome; on the rest at Diagnostics only, Estimate needed and Deposit taken (spec §3.2).
// Required where finishNeedsDiagnosis. Only where the technician may write the text itself.
export function finishAsksDiagnosis(visit, outcome) {
  if (!canWriteDiagnosis(visit)) return false;
  const d = diagnosisOf(visit);
  if (d.locked) return false;
  // the company's Diagnosis Off for this group (steps/skip.js diagnosisModeOf): no field
  if (diagnosisModeOf(visit, outcome) === 'off') return false;
  return visit.visit_kind === 'diagnostics' || FINISH_ASKS.includes(outcome);
}

// Д-2 (VISIT_DIAGNOSIS_DESIGN.md §3.8, the server since D2-BE): a diagnostics visit, or one
// closed as Estimate needed, is not finished without the diagnosis — the field says «required»
// and Finish waits for a text (the server refuses it too: 409 diagnosis_required)
export const DIAGNOSIS_REQUIRED_HINT = 'Write what you found — it is printed on the bill, and the office prices the estimate from it.';
// With the company's steps: required only where its mode is Required (the server: visitSteps
// diagnosisMode); without them (an older server) — as before
export function finishNeedsDiagnosis(visit, outcome) {
  if (!visit) return false;
  const mode = diagnosisModeOf(visit, outcome);
  if (mode) return mode === 'required';
  return visit.visit_kind === 'diagnostics' || outcome === 'estimate_needed';
}
// Finish waits: the outcome needs the diagnosis and the field in the sheet is empty
export function finishWaitsForDiagnosis(visit, outcome, text) {
  return finishAsksDiagnosis(visit, outcome) && finishNeedsDiagnosis(visit, outcome) && !diagnosisToSend(text);
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
export function billDiagnosis(bill, today) {
  if (!bill) return null;
  if (bill.status === 'draft') {
    const d = diagnosisOf(bill);
    // a repair without its own: the issue prints the diagnostics visit's (§3.7)
    const inh = inheritedOf(bill);
    if (inh) return inheritedBlock(inh, !!d && !d.locked, today);
    if (!d) return null;
    const mode = d.locked ? null : d.text ? 'edit' : 'write';
    return {
      text: d.text,
      from: null,
      addenda: d.addenda.map(addendumRow),
      mode,
      opens: mode,
      button: { write: 'Add diagnosis', edit: 'Edit' }[mode] || null,
      hint: mode === 'write' ? DIAGNOSIS_HINT : null,
    };
  }
  const printed = diagnosisOf({ diagnosis: bill.printed_diagnosis });
  if (!printed || (!printed.text && !printed.addenda.length)) return null;
  // printed from the diagnostics visit (the snapshot's from_visit { id, kind, date })
  const from = bill.printed_diagnosis.from_visit || null;
  return {
    text: printed.text, from: from && printed.text ? fromWords(from.kind, from.date, today) : null,
    addenda: printed.addenda.map(addendumRow), mode: null, opens: null, button: null, hint: null,
  };
}

// What the PDF prints (backend billPdf.js, the Designer's sheet): the text; '— Ivan Petrov,
// Nov 18, 2026' (the bill's technician and the visit's day); each addition 'Added by Ivan
// Petrov, Nov 18, 2026, 4:12 PM ET: …'. A draft prints the visit's diagnosis as it is now, an
// issued bill its own copy. null — no block, no empty heading.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDay = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`;
export function previewDiagnosis(bill, visit) {
  if (!bill) return null;
  // taken from the diagnostics visit (§3.7): a draft prints it when it has none of its own, an
  // issued bill printed it with from_visit; signed as the PDF does — '— Diagnostics visit, Nov 12, 2026'
  const inh = bill.status === 'draft' ? inheritedOf(bill) : null;
  const printedFrom = bill.status !== 'draft' && bill.printed_diagnosis ? bill.printed_diagnosis.from_visit || null : null;
  const from = inh ? { kind: inh.kind, date: inh.date } : printedFrom;
  const d = inh || (bill.status === 'draft' ? diagnosisOf(bill) : diagnosisOf({ diagnosis: bill.printed_diagnosis }));
  if (!d || (!d.text && !d.addenda.length)) return null;
  const start = visit ? parseWall(visit.scheduled_start) : null;
  const who = bill.technician && words(bill.technician.name);
  const fromKind = from ? `${(KIND_WORDS[from.kind] || 'diagnostics')[0].toUpperCase()}${(KIND_WORDS[from.kind] || 'diagnostics').slice(1)} visit` : null;
  const fromDay = from && DAY_RE.test(String(from.date || '')) ? longDay(from.date) : null;
  const signature = !d.text ? '' : from ? [fromKind, fromDay].filter(Boolean).join(', ')
    : [who, start ? longDay(start.date) : null].filter(Boolean).join(', ');
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
