// Off at the company's steps (the lead 25.11 after the owner on build 3): the step is not in the
// technician's chain — no button, no link, no tile, no field, even if the server offers the action
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnosisModeOf, modeOfStep, stepOff } from './skip.js';
import { barOf } from '../myDay/actions.js';
import { approveTileAfterIssue } from '../approve/model.js';
import { diagnosisBlock, finishAsksDiagnosis, finishNeedsDiagnosis } from '../diagnosis/model.js';

const KEYS = ['omw', 'diagnosis', 'approve', 'finish', 'issue', 'give', 'collect', 'signs'];
const steps = (modes = {}, extra = {}) => KEYS.map((key) => ({ key, mode: modes[key] || (key === 'finish' ? 'required' : 'optional'), skipped: null, ...(extra[key] || {}) }));
const visit = (o = {}) => ({ id: 7, role: 'main', legacy: false, status: 'scheduled', visit_kind: 'repair', outcome: null,
  actions: ['omw', 'finish', 'no_access'], steps: steps(), diagnosis: { text: null, addenda: [], locked: false }, ...o });

test('modeOfStep / stepOff: the step\'s mode, null without steps', () => {
  assert.equal(modeOfStep(visit({ steps: steps({ omw: 'off' }) }), 'omw'), 'off');
  assert.equal(stepOff(visit({ steps: steps({ omw: 'off' }) }), 'omw'), true);
  assert.equal(stepOff(visit(), 'omw'), false);
  assert.equal(modeOfStep(visit({ steps: undefined }), 'omw'), null);
});

test('On my way Off: no button, no Skip link — Finish is the orange one at once (server still offers omw)', () => {
  const off = barOf(visit({ steps: steps({ omw: 'off' }) }), Date.now());
  assert.equal(off.primary.action, 'finish');
  assert.equal(off.secondary, null);
  assert.equal(off.skip, undefined);
  const on = barOf(visit(), Date.now());
  assert.equal(on.primary.action, 'omw');
  assert.equal(on.pair, true);
  // no steps (an older server): as before
  assert.equal(barOf(visit({ steps: undefined }), Date.now()).primary.action, 'omw');
});

test('Approve Off: no tile on a repair unless signed already', () => {
  const tile = { title: 'Approve', line: 'Not signed yet', kind: 'none' };
  assert.equal(approveTileAfterIssue(tile, visit({ steps: steps({ approve: 'off' }) })), null);
  const signed = { title: 'Approve', line: 'Signed 10:20 · $300.00', kind: 'signed' };
  assert.equal(approveTileAfterIssue(signed, visit({ steps: steps({ approve: 'off' }) })), signed);
  assert.equal(approveTileAfterIssue(tile, visit()), tile);
});

test('Diagnosis: the two groups, Off — no field and no empty block; Optional — not required', () => {
  const diag = (modes, me, kind = 'diagnostics') => visit({ visit_kind: kind, steps: steps(modes, { diagnosis: { mode_estimate_needed: me } }) });
  // diagnostics visit, the group Off
  const dOff = diag({ diagnosis: 'off' }, 'off');
  assert.equal(diagnosisModeOf(dOff, 'diagnostics_only'), 'off');
  assert.equal(finishAsksDiagnosis(dOff, 'diagnostics_only'), false);
  assert.equal(finishNeedsDiagnosis(dOff, 'diagnostics_only'), false);
  assert.equal(diagnosisBlock(dOff, '2026-11-25'), null);
  // the group Optional: asked, not required
  const dOpt = diag({ diagnosis: 'optional' }, 'optional');
  assert.equal(finishAsksDiagnosis(dOpt, 'diagnostics_only'), true);
  assert.equal(finishNeedsDiagnosis(dOpt, 'diagnostics_only'), false);
  // the default (Required): as before
  const dReq = diag({ diagnosis: 'required' }, 'required');
  assert.equal(finishNeedsDiagnosis(dReq, 'diagnostics_only'), true);
  // a repair: the others' mode is the step's; Estimate needed takes mode_estimate_needed
  const rep = diag({ diagnosis: 'off' }, 'required', 'repair');
  assert.equal(diagnosisModeOf(rep, 'done'), 'off');
  assert.equal(finishAsksDiagnosis(rep, 'done'), false);
  assert.equal(diagnosisModeOf(rep, 'estimate_needed'), 'required');
  assert.equal(finishNeedsDiagnosis(rep, 'estimate_needed'), true);
  // Off, but a text written before: the block stays (read and change)
  const written = visit({ visit_kind: 'diagnostics', steps: steps({ diagnosis: 'off' }, { diagnosis: { mode_estimate_needed: 'off' } }), diagnosis: { text: 'Pump clogged', addenda: [], locked: false } });
  assert.notEqual(diagnosisBlock(written, '2026-11-25'), null);
  // no steps: the old rule
  const old = visit({ visit_kind: 'diagnostics', steps: undefined });
  assert.equal(finishNeedsDiagnosis(old, 'diagnostics_only'), true);
});

test('the «now» line of a diagnostics visit with Diagnosis Off: nothing to write', async () => {
  const { nowWordsOf } = await import('../myDay/steps.js');
  const v = (modes) => visit({ visit_kind: 'diagnostics', status: 'in_progress', steps: steps(modes, { diagnosis: { mode_estimate_needed: modes.diagnosis } }) });
  assert.equal(nowWordsOf(v({ diagnosis: 'off' })), 'Find the problem, then tap Finish.');
  assert.equal(nowWordsOf(v({ diagnosis: 'required' })), 'Find the problem, then tap Finish and write what you found.');
});

test('Optional made visible (design app-dock m5, m6): the now line before the drive, the orange tile «next · optional»', async () => {
  const { nowWordsOf } = await import('../myDay/steps.js');
  const { tileOf } = await import('../bill/three.js');
  assert.equal(nowWordsOf(visit()), 'Tap On my way to tell the office you’re driving — or skip it and tap Finish when the work is done.');
  assert.equal(nowWordsOf(visit({ steps: steps({ omw: 'required' }) })), null);
  assert.deepEqual(tileOf({ key: 'sign', state: 'todo', lit: true, mode: 'optional' }), { word: 'Signature', line: 'next · optional' });
  assert.deepEqual(tileOf({ key: 'send', state: 'todo', lit: true, mode: 'required' }), { word: 'Send bill', line: 'next' });
});
