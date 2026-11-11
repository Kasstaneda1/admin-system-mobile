// node --test: what the technician presses on a visit, without the screen (actions.js).
// Times are New York: Tuesday Nov 10 2026, EST (UTC−5).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newRequestId, finishChoices, defaultOutcome, finishSubtitle, noAccessWords, barOf, actionBody, actionError, keepActed, UNDO_MINUTES,
} from './actions.js';
import { keepWeek, keptWeek } from './model.js';
import { keepCard, keptCard } from './visit.js';

const at = (iso) => Date.parse(iso);
const NOW = at('2026-11-10T16:11:00Z');           // 11:11 AM
function visit(o = {}) {
  return {
    id: 4, job_id: 3, legacy: false, role: 'main', status: 'scheduled', outcome: null, visit_kind: 'repair',
    visit_number: 2, visit_count: 2, scheduled_start: '2026-11-10 11:00:00', scheduled_end: '2026-11-10 14:00:00',
    planned_start: '2026-11-10 11:45:00', duration_minutes: 75, omw_at: null, closed_at: null,
    updated_at: '2026-11-10T16:00:00.000Z', client_name: 'Sanjay Patel', phone: '(718) 555-0142',
    main_technician_name: 'Ivan Petrov', helper_name: null, actions: [], undo_until: null, ...o,
  };
}

test('a request id per press, in the server\'s format', () => {
  const ids = new Set();
  for (let i = 0; i < 200; i += 1) {
    const id = newRequestId();
    assert.match(id, /^[A-Za-z0-9_-]{8,64}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 200);
  assert.equal(newRequestId(0, () => 0), 'app-0-000000000000');
});

test('Finish: four outcomes, «Recall checked» only on a recall; the booked kind is marked', () => {
  assert.deepEqual(finishChoices(visit()).map((c) => c.outcome), ['done', 'diagnostics_only', 'deposit', 'installation']);
  assert.deepEqual(finishChoices(visit({ visit_kind: 'recall' })).map((c) => c.outcome), ['done', 'diagnostics_only', 'deposit', 'installation', 'recall']);
  // an installation visit: «Installation done» only, marked (the owner, 2026-11-11)
  const installation = visit({ visit_kind: 'installation' });
  assert.deepEqual(finishChoices(installation), [{ outcome: 'installation', title: 'Installation done', hint: 'New unit is in and working', icon: 'install', kind: 'installation' }]);
  assert.equal(defaultOutcome(installation), 'installation');
  assert.deepEqual(['diagnostics', 'other'].map((k) => finishChoices(visit({ visit_kind: k })).length), [4, 4]);
  assert.deepEqual(finishChoices(visit())[0], { outcome: 'done', title: 'Repaired', hint: 'The problem is fixed', icon: 'checkc', kind: 'done' });
  assert.deepEqual(['repair', 'diagnostics', 'installation', 'recall', 'other'].map((k) => defaultOutcome(visit({ visit_kind: k }))),
    ['done', 'diagnostics_only', 'installation', 'recall', 'done']);
  assert.equal(finishSubtitle(visit(), 3), 'Stop 3 · Patel S. · Repair 2/2');
  assert.equal(finishSubtitle(visit()), 'Patel S. · Repair 2/2');
});

test('No access: two steps in words', () => {
  const w = noAccessWords(visit());
  assert.equal(w.call.text, 'Sanjay Patel · (718) 555-0142. Next step: close the visit as no access.');
  assert.equal(w.call.button, 'Call Sanjay');
  assert.equal(w.close.title, 'Close as no access?');
  assert.equal(noAccessWords(visit({ client_name: null, phone: null })).call.button, 'Call the customer');
});

test('the bar, planned: On my way and No access', () => {
  const bar = barOf(visit({ actions: ['omw', 'finish', 'no_access'] }), NOW);
  assert.deepEqual(bar, { primary: { action: 'omw', label: 'On my way', icon: 'car' }, noAccess: true, undo: null, closed: null, line: null, empty: false });
});

test('the bar, on the way: Finish, No access and the undo while the server allows it', () => {
  const onway = visit({ status: 'omw', omw_at: '2026-11-10T16:08:00.000Z', actions: ['finish', 'no_access', 'undo_omw'], undo_until: '2026-11-10T16:23:00.000Z' });
  const bar = barOf(onway, NOW);
  assert.deepEqual(bar.primary, { action: 'finish', label: 'Finish', icon: 'check' });
  assert.equal(bar.noAccess, true);
  assert.deepEqual(bar.undo, { action: 'undo_omw', text: 'On my way at 11:08', left: '12 min to undo' });
  // the last seconds still say 1 min; past undo_until it is gone (the server would refuse)
  assert.equal(barOf(onway, at('2026-11-10T16:22:30Z')).undo.left, '1 min to undo');
  assert.equal(barOf(onway, at('2026-11-10T16:23:00Z')).undo, null);
  assert.equal(barOf({ ...onway, undo_until: null }, NOW).undo, null);
});

test('the bar, closed: undo for 15 minutes, then the green box of how it ended', () => {
  const closed = visit({ status: 'completed', outcome: 'done', closed_at: '2026-11-10T15:52:00.000Z', actions: ['undo_finish'], undo_until: '2026-11-10T16:07:00.000Z' });
  assert.deepEqual(barOf(closed, at('2026-11-10T15:55:00Z')).undo, { action: 'undo_finish', text: 'Finished at 10:52', left: '12 min to undo' });
  assert.equal(barOf(closed, at('2026-11-10T15:55:00Z')).closed, null, 'while the undo holds, no box');
  assert.deepEqual(barOf({ ...closed, actions: [], undo_until: null }, NOW),
    { primary: null, noAccess: false, undo: null, closed: { text: 'Finished at 10:52', note: 'undo closed after 15 min' }, line: null, empty: false });
  // the server still lists the undo but its time is over: the box, not a dead button
  assert.equal(barOf(closed, at('2026-11-10T16:07:00Z')).closed.text, 'Finished at 10:52');
  // right after the press the phone's clock may be a moment before the server's: never more
  // than the window (it read «16 min to undo»); then down by the minute as before
  for (const early of ['2026-11-10T15:51:59.950Z', '2026-11-10T15:51:00Z', '2026-11-10T15:52:00Z']) {
    assert.equal(barOf(closed, at(early)).undo.left, '15 min to undo', early);
  }
  assert.equal(barOf(closed, at('2026-11-10T15:52:00.001Z')).undo.left, '15 min to undo');
  assert.equal(barOf(closed, at('2026-11-10T15:53:00.001Z')).undo.left, '14 min to undo');
  const noAccess = visit({ status: 'completed', outcome: 'no_access', closed_at: '2026-11-10T16:05:00.000Z', actions: ['undo_finish'], undo_until: '2026-11-10T16:20:00.000Z' });
  assert.equal(barOf(noAccess, NOW).undo.text, 'Closed as no access at 11:05');
  assert.equal(barOf({ ...noAccess, actions: [] }, NOW).closed.text, 'Closed as no access at 11:05');
  assert.equal(barOf(visit({ status: 'completed', outcome: 'done', closed_at: null }), NOW).closed.text, 'Finished');
});

test('the bar, helper: their own On my way, its undo; the main technician closes', () => {
  const helping = visit({ role: 'helper', main_technician_name: 'Alex Kim', actions: ['omw'] });
  assert.deepEqual(barOf(helping, NOW), { primary: { action: 'omw', label: 'On my way', icon: 'car' }, noAccess: false, undo: null, closed: null, line: 'Alex finishes the visit', empty: false });
  const marked = { ...helping, actions: ['undo_omw'], undo_until: '2026-11-10T16:20:00.000Z' };
  const bar = barOf(marked, NOW);
  assert.equal(bar.primary, null);
  assert.deepEqual(bar.undo, { action: 'undo_omw', text: 'On my way at 11:05', left: '9 min to undo' });
  assert.equal(bar.line, 'Alex finishes the visit');
  // the visit closed by the main technician: nothing to press, the box without the undo note
  const done = barOf({ ...helping, status: 'completed', outcome: 'done', closed_at: '2026-11-10T16:00:00.000Z', actions: [] }, NOW);
  assert.deepEqual([done.closed, done.line], [{ text: 'Finished at 11:00', note: null }, null]);
});

test('the bar, an old task and a cancelled visit: no buttons, a line says why', () => {
  assert.deepEqual(barOf(visit({ legacy: true, job_id: null }), NOW), { primary: null, noAccess: false, undo: null, closed: null, line: 'Old task: change it in the old technician portal', empty: false });
  assert.equal(barOf(visit({ status: 'cancelled' }), NOW).line, 'The office cancelled this visit');
  assert.equal(barOf(visit(), NOW).empty, true, 'a closed job: the server allows nothing, nothing shows');
});

test('the request: an outcome only with finish', () => {
  assert.deepEqual(actionBody('finish', 'done', 'app-x-1'), { action: 'finish', outcome: 'done', client_request_id: 'app-x-1' });
  assert.deepEqual(actionBody('omw', 'done', 'app-x-2'), { action: 'omw', client_request_id: 'app-x-2' });
});

test('a failed press: no answer, gone, refused with the fresh visit, broken server', () => {
  assert.deepEqual(actionError(new Error('Network Error')), { kind: 'offline', text: 'No connection. Try again.', visit: null, retry: true });
  assert.equal(actionError({ response: { status: 404, data: { error: 'Visit not found' } } }).kind, 'gone');
  const fresh = visit({ status: 'cancelled' });
  assert.deepEqual(actionError({ response: { status: 409, data: { error: 'The office cancelled this visit', visit: fresh } } }),
    { kind: 'refused', text: 'The office cancelled this visit', visit: fresh, retry: false });
  assert.equal(actionError({ response: { status: 409, data: { error: `Undo is possible only for ${UNDO_MINUTES} minutes`, visit: fresh } } }).text, 'Undo is possible only for 15 minutes');
  assert.equal(actionError({ response: { status: 403, data: { error: 'Only the main technician can do this', visit: fresh } } }).kind, 'refused');
  assert.deepEqual(actionError({ response: { status: 400, data: {} } }), { kind: 'refused', text: 'The visit could not be changed', visit: null, retry: false });
  assert.equal(actionError({ response: { status: 502, data: '' } }).kind, 'failed');
});

test('after an answer the phone keeps the card and the visit in its week', () => {
  const savedAt = at('2026-11-10T16:00:00Z');
  let cache = keepWeek(null, 7, '2026-11-08', [visit(), visit({ id: 9 })], savedAt);
  cache = keepCard(cache, 7, { ...visit(), job_visits: [], notes: [], office_notes: null }, savedAt);
  const acted = { ...visit({ status: 'omw', actions: ['finish'] }), job_visits: [], notes: [{ id: 1 }], office_notes: 'x', office_messages: [{ id: 5, text: 'y', seen_at: null }] };
  const after = keepActed(cache, 7, acted, savedAt + 1000);
  assert.equal(keptCard(after, 7, 4).card.status, 'omw');
  assert.equal(keptCard(after, 7, 4).card.notes.length, 1);
  const week = keptWeek(after, 7, '2026-11-08').visits;
  assert.deepEqual(week.map((v) => [v.id, v.status]), [[4, 'omw'], [9, 'scheduled']]);
  assert.equal('notes' in week[0], false, 'the list keeps the list\'s fields');
  assert.deepEqual(['job_visits', 'office_notes', 'office_messages'].filter((k) => k in week[0]), [], 'nor the card\'s');
  assert.equal(keptCard(after, 7, 4).card.office_messages.length, 1);
  // another technician's phone cache: only their own card, nothing of the first
  assert.equal(keptCard(keepActed(cache, 8, acted, savedAt), 7, 4), null);
});
