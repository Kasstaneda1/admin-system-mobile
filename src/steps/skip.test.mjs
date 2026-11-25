import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REASON_MAX, SKIPS, canSkip, requestIdFor, skipBody, skipError, skipReason, skippedLabel, skippedLine, skippedOf, stepOf } from './skip.js';

const steps = (o = {}) => [
  { key: 'omw', mode: 'optional', skipped: null }, { key: 'diagnosis', mode: 'optional', skipped: null },
  { key: 'approve', mode: 'optional', skipped: null }, { key: 'finish', mode: 'required', skipped: null },
  { key: 'issue', mode: 'optional', skipped: null }, { key: 'give', mode: 'required', skipped: null },
  { key: 'signs', mode: 'optional', skipped: null }, { key: 'collect', mode: 'optional', skipped: null },
].map((s) => (o[s.key] ? { ...s, ...o[s.key] } : s));
const visit = (o = {}, st = {}) => ({ id: 7, role: 'main', steps: steps(st), ...o });
const fail = (status, data) => ({ response: { status, data } });

test('canSkip: the main technician, Optional (collect also Required); never approve, diagnosis, issue, finish, off', () => {
  assert.equal(canSkip(visit(), 'omw'), true);
  assert.equal(canSkip(visit(), 'signs'), true);
  assert.equal(canSkip(visit(), 'collect'), true);
  assert.equal(canSkip(visit({}, { collect: { mode: 'required' } }), 'collect'), true, 'collect: its skip is «Customer didn’t pay»');
  assert.equal(canSkip(visit(), 'give'), false, 'give Required (NY)');
  assert.equal(canSkip(visit({}, { give: { mode: 'optional' } }), 'give'), true);
  assert.equal(canSkip(visit({}, { signs: { mode: 'off' } }), 'signs'), false);
  assert.equal(canSkip(visit({}, { signs: { mode: 'required' } }), 'signs'), false);
  assert.equal(canSkip(visit({}, { collect: { mode: 'off' } }), 'collect'), false);
  for (const key of ['approve', 'diagnosis', 'issue', 'finish', 'nonsense']) assert.equal(canSkip(visit(), key), false, key);
  assert.equal(canSkip(visit({ role: 'helper' }), 'omw'), false, 'a helper: 403');
  assert.equal(canSkip(visit({ steps: null }), 'omw'), false, 'no steps (an older server): no link');
  assert.equal(canSkip(null, 'omw'), false);
});

test('skippedOf / skippedLine / skippedLabel: the last skip, its time in New York', () => {
  const v = visit({}, { signs: { skipped: { at: '2026-11-11T15:31:00Z', reason: ' The customer isn’t here ' } } });
  assert.deepEqual(skippedOf(v, 'signs'), { at: '2026-11-11T15:31:00Z', reason: 'The customer isn’t here' });
  assert.equal(skippedOf(v, 'collect'), null);
  assert.equal(skippedOf(visit({}, { signs: { skipped: { at: 'x', reason: '  ' } } }), 'signs'), null);
  assert.equal(skippedLine(skippedOf(v, 'signs')), 'The customer isn’t here · 10:31');
  assert.equal(skippedLine({ reason: 'Pays the office later', at: null }), 'Pays the office later');
  assert.equal(skippedLabel('signs', skippedOf(v, 'signs')), 'Signature skipped: the customer isn’t here, at 10:31. Opens the signature.');
  assert.equal(skippedLabel('collect', { reason: 'Pays the office later', at: '2026-11-11T15:33:00Z' }), 'Not paid: pays the office later, at 10:33. Opens the payment.');
  assert.equal(stepOf(visit({ steps: null }), 'omw'), null);
});

test('skipReason / skipBody: one line, cut to 300; nothing — no body', () => {
  assert.equal(skipReason('  Gate\nlocked \r\n again  '), 'Gate locked again');
  assert.equal(skipReason('x'.repeat(400)).length, REASON_MAX);
  assert.equal(skipReason('   '), null);
  assert.deepEqual(skipBody('The office sends it', 'app-1-abc'), { reason: 'The office sends it', client_request_id: 'app-1-abc' });
  assert.equal(skipBody('', 'app-1-abc'), null);
});

test('skipError: no signal stays; a refusal says the server\'s words; not skippable any more closes; 404 gone', () => {
  assert.deepEqual(skipError(new Error('Network Error')), { kind: 'offline', text: 'No signal: not saved. Try again when you have signal.', close: false });
  assert.deepEqual(skipError(fail(409, { error: 'This step cannot be skipped: do it, or call the office', code: 'step_not_skippable', step: 'signs', mode: 'required' })),
    { kind: 'refused', text: 'Not saved: This step cannot be skipped: do it, or call the office.', close: true });
  assert.deepEqual(skipError(fail(400, { error: 'reason: 1 to 300 characters.' })), { kind: 'refused', text: 'Not saved: reason: 1 to 300 characters.', close: false });
  assert.deepEqual(skipError(fail(500, {})), { kind: 'refused', text: 'Not saved: the server refused it.', close: false });
  assert.equal(skipError(fail(404, { error: 'Visit not found' })).kind, 'gone');
});

test('the words of every sheet: a link, a title, reasons, the skipped title (design app-skip)', () => {
  assert.deepEqual(Object.keys(SKIPS), ['omw', 'signs', 'collect', 'give']);
  assert.equal(SKIPS.collect.link, 'Customer didn’t pay');
  assert.deepEqual(SKIPS.signs.reasons, ['The customer isn’t here', 'The customer doesn’t want to sign', 'Signed on a paper copy']);
  for (const w of Object.values(SKIPS)) assert.ok(w.link && w.title && w.sub && w.reasons.length >= 3 && w.skipped);
});

test('requestIdFor: one id per open sheet and reason — a repeat after a lost answer goes with the same id', () => {
  let n = 0;
  const make = () => `app-id-${++n}`;
  const ids = {};
  assert.equal(requestIdFor(ids, 'Pays the office later', make), 'app-id-1');
  assert.equal(requestIdFor(ids, ' Pays the office  later ', make), 'app-id-1', 'the same reason as sent');
  assert.equal(requestIdFor(ids, 'Refused to pay', make), 'app-id-2', 'another reason: another skip');
  assert.equal(requestIdFor(ids, '   ', make), null);
  assert.equal(requestIdFor({}, 'Pays the office later', make), 'app-id-3', 'the sheet opened again: a new id');
});
