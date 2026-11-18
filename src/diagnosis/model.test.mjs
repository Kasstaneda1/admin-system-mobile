// node --test: the visit's diagnosis without the screen (model.js).
// Times are New York: Wednesday Nov 11 2026, EST (UTC−5).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAGNOSIS_MAX, DIAGNOSIS_HINT, LOCKED_HINT, diagnosisOf, canWriteDiagnosis, whenText, diagnosisBlock, diagnosisToSend,
  diagnosisReady, diagnosisRequest, diagnosisBody, diagnosisError, conflictOf, finishAsksDiagnosis, finishDiagnosisChanged,
  billDiagnosis, previewDiagnosis,
} from './model.js';

const TEXT = 'Compressor start relay failed; fridge not cooling.';
const D = (o = {}) => ({ text: TEXT, version: 2, updated_at: '2026-11-11T15:05:00Z', updated_by_name: 'Ivan Petrov', edited_by_office: false, locked: false, addenda: [], ...o });
const visit = (o = {}) => ({ id: 11, job_id: 6, legacy: false, role: 'main', status: 'scheduled', outcome: null, closed_at: null, visit_kind: 'diagnostics', diagnosis: D(), ...o });
const ADD = { id: 901, text: 'Customer told not to turn the water on.', author_name: 'Ivan Petrov', created_at: '2026-11-11T21:12:00Z' };
const httpError = (status, data = {}) => ({ response: { status, data } });

test('diagnosisOf: the server block made safe; null where the visit has none', () => {
  assert.equal(diagnosisOf(visit({ diagnosis: undefined })), null);
  assert.equal(diagnosisOf(visit({ diagnosis: null })), null);
  assert.equal(diagnosisOf(visit({ diagnosis: [] })), null);
  assert.equal(diagnosisOf(null), null);
  const d = diagnosisOf(visit({ diagnosis: D({ text: '  ', version: -1, addenda: [ADD, { id: 2, text: ' ' }, null] }) }));
  assert.equal(d.text, null);
  assert.equal(d.version, 0);
  assert.deepEqual(d.addenda, [{ id: 901, text: ADD.text, author: 'Ivan Petrov', at: ADD.created_at }]);
  // a printed one (snapshot.diagnosis) keeps its additions' time under `at`
  assert.equal(diagnosisOf({ diagnosis: { text: TEXT, addenda: [{ text: 'x', author_name: 'A', at: '2026-11-11T21:12:00Z' }] } }).addenda[0].at, '2026-11-11T21:12:00Z');
});

test('who may write: main and helper, closed visits too; not cancelled, an old task, closed without work, or without the block', () => {
  assert.equal(canWriteDiagnosis(visit()), true);
  assert.equal(canWriteDiagnosis(visit({ role: 'helper' })), true);
  assert.equal(canWriteDiagnosis(visit({ status: 'completed', outcome: 'diagnostics_only', closed_at: '2026-11-11T16:00:00Z' })), true);
  assert.equal(canWriteDiagnosis(visit({ status: 'cancelled' })), false);
  assert.equal(canWriteDiagnosis(visit({ legacy: true, job_id: null })), false);
  assert.equal(canWriteDiagnosis(visit({ status: 'completed', outcome: 'no_access', closed_at: '2026-11-11T16:00:00Z' })), false);
  assert.equal(canWriteDiagnosis(visit({ status: 'completed', outcome: 'client_rescheduled', closed_at: '2026-11-11T16:00:00Z' })), false);
  assert.equal(canWriteDiagnosis(visit({ diagnosis: undefined })), false);
  assert.equal(canWriteDiagnosis(null), false);
});

test('the block: none yet — the hint and «Add diagnosis»', () => {
  const b = diagnosisBlock(visit({ diagnosis: D({ text: null, version: 0, updated_at: null, updated_by_name: null }) }));
  assert.deepEqual(b, { text: null, by: null, addenda: [], mode: 'write', button: 'Add diagnosis', hint: DIAGNOSIS_HINT, empty: true });
  assert.equal(diagnosisBlock(visit({ diagnosis: undefined })), null);
});

test('the block: a text — who wrote it and when, «Edit»; the office — «Edited by»', () => {
  const b = diagnosisBlock(visit());
  assert.equal(b.text, TEXT);
  assert.equal(b.by, 'Ivan Petrov · Wed, Nov 11, 10:05 AM');
  assert.equal(b.mode, 'edit');
  assert.equal(b.button, 'Edit');
  assert.equal(b.hint, null);
  assert.equal(diagnosisBlock(visit({ diagnosis: D({ edited_by_office: true, updated_by_name: 'Anna Lee' }) })).by, 'Edited by Anna L., Nov 11, 10:05 AM');
  assert.equal(whenText('2026-11-11T15:05:00Z'), 'Wed, Nov 11, 10:05 AM');
  assert.equal(whenText(null), '');
});

test('the block: the bill issued — the additions in order, «Add to diagnosis» and the hint under it', () => {
  const second = { ...ADD, id: 902, text: 'Valve ordered.', author_name: 'Alex Kim', created_at: '2026-11-12T14:00:00Z' };
  const b = diagnosisBlock(visit({ status: 'completed', outcome: 'diagnostics_only', closed_at: '2026-11-11T16:00:00Z', diagnosis: D({ locked: true, addenda: [ADD, second] }) }));
  assert.equal(b.mode, 'add');
  assert.equal(b.button, 'Add to diagnosis');
  assert.equal(b.hint, LOCKED_HINT);
  assert.deepEqual(b.addenda, [
    { key: 'a901', head: 'Added by Ivan P., Nov 11, 4:12 PM', text: ADD.text },
    { key: 'a902', head: 'Added by Alex K., Nov 12, 9:00 AM', text: 'Valve ordered.' },
  ]);
  assert.equal(b.empty, false);
});

test('the block: nothing may be written — the text without a button; nothing written — no block', () => {
  const b = diagnosisBlock(visit({ status: 'cancelled' }));
  assert.deepEqual([b.text, b.mode, b.button, b.hint, b.empty], [TEXT, null, null, null, false]);
  assert.equal(diagnosisBlock(visit({ status: 'cancelled', diagnosis: D({ text: null }) })), null);
  assert.equal(diagnosisBlock(visit({ status: 'completed', outcome: 'no_access', closed_at: '2026-11-11T16:00:00Z', diagnosis: D({ text: null }) })), null);
  // additions only (the text cleared by the office): still shown
  assert.equal(diagnosisBlock(visit({ status: 'cancelled', diagnosis: D({ text: null, addenda: [ADD] }) })).addenda.length, 1);
});

test('what is sent: control characters out, trimmed; Save only for a change, at most 2000', () => {
  assert.equal(diagnosisToSend('  relay\u0007 failed\n\tok  '), 'relay failed\n\tok');
  assert.equal(diagnosisReady('edit', TEXT, TEXT), false);
  assert.equal(diagnosisReady('edit', ` ${TEXT} `, TEXT), false);
  assert.equal(diagnosisReady('edit', `${TEXT} More.`, TEXT), true);
  // an empty field clears a text (Д-2 is not on yet), but not «nothing» into nothing
  assert.equal(diagnosisReady('edit', '', TEXT), true);
  assert.equal(diagnosisReady('write', '  ', null), false);
  assert.equal(diagnosisReady('write', 'x'.repeat(DIAGNOSIS_MAX), null), true);
  assert.equal(diagnosisReady('write', 'x'.repeat(DIAGNOSIS_MAX + 1), null), false);
  // an emoji is one character, as the server counts
  assert.equal(diagnosisReady('write', '🔧'.repeat(DIAGNOSIS_MAX), null), true);
  assert.equal(diagnosisReady('add', '   ', TEXT), false);
  assert.equal(diagnosisReady('add', TEXT, TEXT), true);
});

test('the request: the same id for Try again; a new one for another text, version or kind', () => {
  const rnd = () => 0.5;
  const first = diagnosisRequest(null, { mode: 'edit', text: ` ${TEXT} `, baseVersion: 2 }, 1000, rnd);
  assert.deepEqual({ ...first, requestId: undefined }, { mode: 'edit', text: TEXT, baseVersion: 2, requestId: undefined });
  assert.match(first.requestId, /^app-[a-z0-9]+-[a-z0-9]{12}$/);
  assert.equal(diagnosisRequest(first, { mode: 'edit', text: TEXT, baseVersion: 2 }, 9999).requestId, first.requestId);
  // 'write' and 'edit' are one request kind
  assert.equal(diagnosisRequest(first, { mode: 'write', text: TEXT, baseVersion: 2 }, 9999).requestId, first.requestId);
  assert.notEqual(diagnosisRequest(first, { mode: 'edit', text: `${TEXT}!`, baseVersion: 2 }, 9999).requestId, first.requestId);
  assert.notEqual(diagnosisRequest(first, { mode: 'edit', text: TEXT, baseVersion: 3 }, 9999).requestId, first.requestId);
  assert.notEqual(diagnosisRequest(first, { mode: 'add', text: TEXT }, 9999).requestId, first.requestId);
  const add = diagnosisRequest(null, { mode: 'add', text: 'Valve', baseVersion: 7 }, 1000);
  assert.equal(add.baseVersion, null);
  assert.equal(diagnosisRequest(add, { mode: 'add', text: 'Valve', baseVersion: 8 }, 2000).requestId, add.requestId);
});

test('the bodies: an edit with base_version (empty → null), an addition without it', () => {
  assert.deepEqual(diagnosisBody({ mode: 'edit', text: TEXT, baseVersion: 2, requestId: 'app-1-abc' }), { text: TEXT, base_version: 2, client_request_id: 'app-1-abc' });
  assert.deepEqual(diagnosisBody({ mode: 'edit', text: '', baseVersion: 0, requestId: 'app-1-abc' }), { text: null, base_version: 0, client_request_id: 'app-1-abc' });
  assert.deepEqual(diagnosisBody({ mode: 'add', text: 'Valve', baseVersion: null, requestId: 'app-1-abc' }), { text: 'Valve', client_request_id: 'app-1-abc' });
});

test('a failed save: no answer, gone, their text, the bill issued meanwhile, the server says no', () => {
  assert.equal(diagnosisError(new Error('Network Error')).kind, 'offline');
  assert.equal(diagnosisError(new Error('Network Error')).text, 'No connection. Try again.');
  assert.equal(diagnosisError(httpError(404, { error: 'Visit not found' })).kind, 'gone');
  assert.equal(diagnosisError(httpError(500)).kind, 'failed');

  const theirs = D({ text: 'Their text', version: 3, edited_by_office: true, updated_by_name: 'Anna Lee' });
  const conflict = diagnosisError(httpError(409, { code: 'diagnosis_conflict', error: 'x', diagnosis: theirs, visit: { id: 11 } }));
  assert.equal(conflict.kind, 'conflict');
  assert.equal(conflict.theirs.text, 'Their text');
  assert.equal(conflict.theirs.version, 3);
  assert.deepEqual(conflict.visit, { id: 11 });
  assert.equal(conflict.diagnosis, theirs);
  // a conflict without their text cannot be chosen from: the server's words instead
  assert.equal(diagnosisError(httpError(409, { code: 'diagnosis_conflict', error: 'Someone changed it' })).kind, 'refused');

  const locked = diagnosisError(httpError(409, { code: 'diagnosis_locked', error: 'The bill is already issued', diagnosis: D({ locked: true }), visit: { id: 11 } }));
  assert.equal(locked.kind, 'locked');
  assert.match(locked.text, /addition/);

  const limit = diagnosisError(httpError(409, { code: 'addenda_limit', error: 'At most 30 additions on one visit: ask the office', visit: { id: 11 } }));
  assert.deepEqual([limit.kind, limit.text], ['refused', 'At most 30 additions on one visit: ask the office']);
  assert.equal(diagnosisError(httpError(400, {})).text, 'The diagnosis could not be saved');
});

test('their text in the conflict: who and when', () => {
  assert.deepEqual(conflictOf(diagnosisOf({ diagnosis: D({ text: 'Theirs', edited_by_office: true, updated_by_name: 'Anna Lee' }) })),
    { text: 'Theirs', by: 'Anna L. (office) · Wed, Nov 11, 10:05 AM' });
  assert.deepEqual(conflictOf(diagnosisOf({ diagnosis: D({ text: null, updated_by_name: 'Alex Kim' }) })), { text: null, by: 'Alex Kim · Wed, Nov 11, 10:05 AM' });
  assert.equal(conflictOf(null), null);
});

test('«How did it end?»: the field on a diagnostics visit always, elsewhere for Diagnostics only and Deposit taken', () => {
  for (const outcome of ['diagnostics_only', 'done', 'deposit']) assert.equal(finishAsksDiagnosis(visit(), outcome), true, outcome);
  const repair = visit({ visit_kind: 'repair' });
  assert.equal(finishAsksDiagnosis(repair, 'done'), false);
  assert.equal(finishAsksDiagnosis(repair, 'diagnostics_only'), true);
  assert.equal(finishAsksDiagnosis(repair, 'deposit'), true);
  assert.equal(finishAsksDiagnosis(visit({ visit_kind: 'installation' }), 'installation'), false);
  // no field where it cannot be written now
  assert.equal(finishAsksDiagnosis(visit({ diagnosis: undefined }), 'diagnostics_only'), false);
  assert.equal(finishAsksDiagnosis(visit({ diagnosis: D({ locked: true }) }), 'diagnostics_only'), false);
  assert.equal(finishAsksDiagnosis(visit({ status: 'cancelled' }), 'diagnostics_only'), false);
});

test('«How did it end?»: only a changed text is saved before the finish', () => {
  assert.equal(finishDiagnosisChanged(visit(), ` ${TEXT}\n`), false);
  assert.equal(finishDiagnosisChanged(visit(), `${TEXT} Part on order.`), true);
  assert.equal(finishDiagnosisChanged(visit({ diagnosis: D({ text: null }) }), '  '), false);
  assert.equal(finishDiagnosisChanged(visit({ diagnosis: D({ text: null }) }), 'Found it'), true);
  assert.equal(finishDiagnosisChanged(visit({ diagnosis: undefined }), 'Found it'), false);
});

test('the bill screen: a draft shows the visit\'s text with Edit; an issued bill what it printed', () => {
  assert.equal(billDiagnosis(null), null);
  assert.equal(billDiagnosis({ status: 'draft' }), null);
  const draft = billDiagnosis({ status: 'draft', diagnosis: D() });
  assert.deepEqual([draft.text, draft.mode, draft.button, draft.hint], [TEXT, 'edit', 'Edit', null]);
  const none = billDiagnosis({ status: 'draft', diagnosis: D({ text: null }) });
  assert.deepEqual([none.text, none.mode, none.button, none.hint], [null, 'write', 'Add diagnosis', DIAGNOSIS_HINT]);
  // a draft of a visit with a void bill (issued before): nothing to edit on the bill
  assert.equal(billDiagnosis({ status: 'draft', diagnosis: D({ locked: true }) }).mode, null);

  const printed = { text: 'Printed text', addenda: [{ text: 'Old addition', author_name: 'Ivan Petrov', at: '2026-11-11T21:12:00Z' }], updated_by_name: 'Ivan Petrov', updated_at: '2026-11-11T15:05:00Z' };
  const issued = billDiagnosis({ status: 'issued', diagnosis: D({ text: 'Changed after', locked: true }), printed_diagnosis: printed });
  assert.equal(issued.text, 'Printed text');
  assert.equal(issued.mode, null);
  assert.deepEqual(issued.addenda, [{ key: 'a0', head: 'Added by Ivan P., Nov 11, 4:12 PM', text: 'Old addition' }]);
  assert.equal(billDiagnosis({ status: 'issued', diagnosis: D(), printed_diagnosis: null }), null);
  assert.equal(billDiagnosis({ status: 'void', printed_diagnosis: printed }).text, 'Printed text');
});

test('what the customer gets: the text, «— technician, day», the additions as the PDF prints them', () => {
  const bill = { status: 'draft', technician: { name: 'Ivan Petrov' }, diagnosis: D({ addenda: [ADD] }) };
  const v = { scheduled_start: '2026-11-11 09:00:00' };
  assert.deepEqual(previewDiagnosis(bill, v), {
    text: TEXT,
    signature: '— Ivan Petrov, Nov 11, 2026',
    addenda: [{ key: 'p901', lead: 'Added by Ivan Petrov, Nov 11, 2026, 4:12 PM ET: ', text: ADD.text }],
  });
  // no text, only additions: no signature
  assert.equal(previewDiagnosis({ ...bill, diagnosis: D({ text: null, addenda: [ADD] }) }, v).signature, null);
  // nothing: no block
  assert.equal(previewDiagnosis({ ...bill, diagnosis: D({ text: null }) }, v), null);
  assert.equal(previewDiagnosis({ ...bill, diagnosis: undefined }, v), null);
  // without the visit or the technician: what there is
  assert.equal(previewDiagnosis({ ...bill, technician: null }, v).signature, '— Nov 11, 2026');
  assert.equal(previewDiagnosis(bill, null).signature, '— Ivan Petrov');
  // an issued bill: its own copy
  const issued = { status: 'issued', technician: { name: 'Ivan Petrov' }, diagnosis: D({ text: 'Now' }), printed_diagnosis: { text: 'Then', addenda: [] } };
  assert.equal(previewDiagnosis(issued, v).text, 'Then');
});

// Д-2 in the Finish sheet (be#211): a diagnostics visit, or Estimate needed, needs the text
test('finishNeedsDiagnosis and finishWaitsForDiagnosis: «required», Finish waits for a text', async () => {
  const { finishNeedsDiagnosis, finishWaitsForDiagnosis, finishAsksDiagnosis, DIAGNOSIS_REQUIRED_HINT } = await import('./model.js');
  const empty = { text: null, version: 0, by_name: null, at: null, locked: false, addenda: [] };
  const diag = { id: 1, visit_kind: 'diagnostics', role: 'main', status: 'in_progress', legacy: false, diagnosis: empty };
  const repair = { ...diag, visit_kind: 'repair' };
  assert.equal(finishNeedsDiagnosis(diag, 'done'), true);
  assert.equal(finishNeedsDiagnosis(repair, 'estimate_needed'), true);
  assert.equal(finishNeedsDiagnosis(repair, 'diagnostics_only'), false);
  assert.equal(finishNeedsDiagnosis(null, 'estimate_needed'), false);
  assert.equal(finishAsksDiagnosis(repair, 'estimate_needed'), true);
  assert.equal(finishWaitsForDiagnosis(diag, 'diagnostics_only', ''), true);
  assert.equal(finishWaitsForDiagnosis(diag, 'diagnostics_only', '   '), true);
  assert.equal(finishWaitsForDiagnosis(diag, 'diagnostics_only', 'Relay failed'), false);
  assert.equal(finishWaitsForDiagnosis(repair, 'estimate_needed', ''), true);
  assert.equal(finishWaitsForDiagnosis(repair, 'diagnostics_only', ''), false);   // asked, not required
  assert.equal(finishWaitsForDiagnosis(repair, 'done', ''), false);
  assert.equal(DIAGNOSIS_REQUIRED_HINT, 'Write what you found — it is printed on the bill, and the office prices the estimate from it.');
});
