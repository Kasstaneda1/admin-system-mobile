// A repair takes the diagnosis of the job's diagnostics visit (VISIT_DIAGNOSIS_SPEC §3.7):
// inherited_diagnosis on the visit and on the bill's draft; the words are the site's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OWN_LABEL, billDiagnosis, diagnosisBlock, fromWords, inheritedOf, previewDiagnosis, replacesWords, whereWords } from './model.js';

const EMPTY = { text: null, version: 0, updated_at: null, updated_by_name: null, edited_by_office: false, locked: false, addenda: [] };
const INH = {
  from_visit_id: 11, from_visit_kind: 'diagnostics', from_visit_date: '2026-11-12', text: 'Compressor start relay failed.',
  addenda: [{ id: 901, text: 'Part ordered.', author_name: 'Ivan Petrov', created_at: '2026-11-12T21:12:00Z' }],
  updated_by_name: 'Ivan Petrov', updated_at: '2026-11-12T15:05:00Z',
};
const repair = (o = {}) => ({ id: 12, job_id: 6, legacy: false, role: 'main', status: 'scheduled', outcome: null, visit_kind: 'repair', diagnosis: EMPTY, inherited_diagnosis: INH, ...o });
const TODAY = '2026-11-24';

test('taken only when the visit has none of its own and the source has text', () => {
  assert.deepEqual(inheritedOf(repair()), {
    text: 'Compressor start relay failed.', kind: 'diagnostics', date: '2026-11-12', by: 'Ivan Petrov',
    addenda: [{ id: 901, text: 'Part ordered.', author: 'Ivan Petrov', at: '2026-11-12T21:12:00Z' }],
  });
  assert.equal(inheritedOf(repair({ diagnosis: { ...EMPTY, text: 'Own words' } })), null, 'its own text wins');
  assert.equal(inheritedOf(repair({ diagnosis: { ...EMPTY, addenda: [{ id: 1, text: 'own addition' }] } })), null);
  assert.equal(inheritedOf(repair({ inherited_diagnosis: null })), null);
  assert.equal(inheritedOf(repair({ inherited_diagnosis: { ...INH, text: '  ' } })), null);
  assert.equal(inheritedOf(repair({ inherited_diagnosis: [] })), null);
  assert.equal(inheritedOf(null), null);
});

test('the words: where it comes from and where it is changed', () => {
  assert.equal(fromWords('diagnostics', '2026-11-12', TODAY), 'From the diagnostics visit, Nov 12');
  assert.equal(fromWords('repair', '2025-12-30', TODAY), 'From the repair visit, Dec 30, 2025');
  assert.equal(fromWords(null, null, TODAY), 'From the diagnostics visit');
  assert.equal(fromWords('something', 'Nov 12', TODAY), 'From the diagnostics visit');
  assert.equal(whereWords({ by: 'Ivan Petrov', kind: 'diagnostics' }), 'Ivan Petrov · change it on the diagnostics visit');
  assert.equal(whereWords({ by: null, kind: 'recall' }), 'Change it on the recall visit');
  assert.equal(replacesWords('diagnostics'), 'Saved here, it replaces the one from the diagnostics visit on this visit’s bill.');
});

test('visit block: the text read only; its own text may be written until the bill is issued', () => {
  const b = diagnosisBlock(repair(), TODAY);
  assert.equal(b.text, 'Compressor start relay failed.');
  assert.equal(b.from, 'From the diagnostics visit, Nov 12');
  assert.equal(b.by, 'Ivan Petrov · change it on the diagnostics visit');
  assert.deepEqual(b.addenda.map((a) => a.text), ['Part ordered.']);
  assert.equal(b.mode, 'own');
  assert.equal(b.opens, 'write', 'the sheet is the ordinary «Add diagnosis»: PUT diagnosis of this visit');
  assert.equal(b.button, OWN_LABEL);
  assert.equal(b.hint, replacesWords('diagnostics'));
  // the bill is issued: no «Add to diagnosis» (it would go to this visit, not the source)
  const locked = diagnosisBlock(repair({ diagnosis: { ...EMPTY, locked: true } }), TODAY);
  assert.equal(locked.mode, null);
  assert.equal(locked.button, null);
  assert.equal(locked.text, 'Compressor start relay failed.');
  // a helper's card reads it too; a cancelled visit — read only
  assert.equal(diagnosisBlock(repair({ role: 'helper' }), TODAY).mode, 'own');
  assert.equal(diagnosisBlock(repair({ status: 'cancelled' }), TODAY).mode, null);
  assert.equal(diagnosisBlock(repair({ status: 'cancelled' }), TODAY).text, 'Compressor start relay failed.');
  // its own: as before, no «from»
  const own = diagnosisBlock(repair({ diagnosis: { ...EMPTY, text: 'Own words', version: 1 } }), TODAY);
  assert.equal(own.from, null);
  assert.equal(own.mode, 'edit');
  assert.equal(own.opens, 'edit');
  // no source: the empty block «Add diagnosis», as before
  const none = diagnosisBlock(repair({ inherited_diagnosis: null }), TODAY);
  assert.equal(none.mode, 'write');
  assert.equal(none.opens, 'write');
  assert.equal(none.button, 'Add diagnosis');
});

test('the bill: the draft shows the taken text, an issued one its printed mark', () => {
  const draft = { status: 'draft', diagnosis: EMPTY, inherited_diagnosis: INH };
  const b = billDiagnosis(draft, TODAY);
  assert.equal(b.text, 'Compressor start relay failed.');
  assert.equal(b.from, 'From the diagnostics visit, Nov 12');
  assert.equal(b.mode, 'own');
  assert.equal(b.opens, 'write');
  assert.equal(billDiagnosis({ ...draft, diagnosis: { ...EMPTY, locked: true } }, TODAY).mode, null);
  assert.equal(billDiagnosis({ ...draft, diagnosis: null }, TODAY).mode, null);
  assert.equal(billDiagnosis({ ...draft, diagnosis: { ...EMPTY, text: 'Own' } }, TODAY).from, null);
  const issued = { status: 'issued', printed_diagnosis: { text: 'Compressor start relay failed.', addenda: [], from_visit: { id: 11, kind: 'diagnostics', date: '2026-11-12' } } };
  assert.equal(billDiagnosis(issued, TODAY).from, 'From the diagnostics visit, Nov 12');
  assert.equal(billDiagnosis(issued, TODAY).mode, null);
  assert.equal(billDiagnosis({ status: 'issued', printed_diagnosis: { text: 'Own', addenda: [] } }, TODAY).from, null);
});

test('what the customer gets: signed as the PDF signs a taken text', () => {
  const visit = { scheduled_start: '2026-11-20T10:00:00' };
  const draft = { status: 'draft', technician: { name: 'Mike Torres' }, diagnosis: EMPTY, inherited_diagnosis: INH };
  const p = previewDiagnosis(draft, visit);
  assert.equal(p.text, 'Compressor start relay failed.');
  assert.equal(p.signature, '— Diagnostics visit, Nov 12, 2026');
  assert.equal(p.addenda.length, 1);
  const issued = { status: 'issued', technician: { name: 'Mike Torres' }, printed_diagnosis: { text: 'Relay.', addenda: [], from_visit: { id: 11, kind: 'repair', date: '2026-11-12' } } };
  assert.equal(previewDiagnosis(issued, visit).signature, '— Repair visit, Nov 12, 2026');
  // its own: the technician and the visit's day, as before
  assert.equal(previewDiagnosis({ ...draft, diagnosis: { ...EMPTY, text: 'Own' } }, visit).signature, '— Mike Torres, Nov 20, 2026');
});
