import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AWAY_DAYS, AWAY_MS, awayOf, awaySince } from './away.js';

const H = 60 * 60 * 1000;
const NOW = Date.parse('2026-11-11T16:20:00Z');            // 11:20 AM in New York
const TODAY = '2026-11-11';
const item = (o = {}) => ({ id: 1, kind: 'T1', target: { type: 'visit', id: 41 }, read_at: null, removed: false,
  event_at: '2026-11-10T23:00:00Z', data: { visit_kind: 'repair', customer: 'Kim Brooks', start: '2026-11-11T15:00', end: '2026-11-11T18:00' }, ...o });

test('awaySince: the last opening 16 hours ago or more; the first opening — nothing', () => {
  assert.equal(AWAY_MS, 16 * H);
  assert.equal(awaySince(NOW - 16 * H, NOW), NOW - 16 * H);
  assert.equal(awaySince(NOW - 15.9 * H, NOW), null);
  assert.equal(awaySince(NOW - 72 * H, NOW), NOW - 72 * H);
  for (const none of [null, 0, NaN, undefined]) assert.equal(awaySince(none, NOW), null);
});

test('awayOf: unread T1, T2, T4, T5 newer than the last opening, not deeper than 14 days; the line of counts', () => {
  const since = NOW - 40 * H;
  const items = [
    item({ id: 1 }),
    item({ id: 2, data: { visit_kind: 'diagnostics', customer: 'Paula Silva', start: '2026-11-11T17:00', end: '2026-11-11T20:00' } }),
    item({ id: 3, kind: 'T2', target: { type: 'visit', id: 9 }, data: { customer: 'Lena Haddad', start: '2026-11-12T09:00', end: '2026-11-12T12:00', was_start: '2026-11-11T17:00', was_end: '2026-11-11T20:00' } }),
    item({ id: 4, kind: 'T5', data: { customer: 'Thanh Nguyen', text: 'The gate code is 7788 now.', start: '2026-11-11T13:00', end: '2026-11-11T16:00' } }),
    item({ id: 5, kind: 'T5', data: { customer: 'Paula Silva', text: 'Call the customer 10 min before.', start: '2026-11-11T17:00', end: '2026-11-11T20:00' } }),
    item({ id: 6, kind: 'T4', data: { customer: 'Min Lee', reason: 'cancelled', start: '2026-11-12T10:00', end: '2026-11-12T13:00' } }),
    // not counted: read, removed, older than the last opening, another kind
    item({ id: 7, read_at: '2026-11-11T10:00:00Z' }),
    item({ id: 8, removed: true }),
    item({ id: 9, event_at: new Date(since - H).toISOString() }),
    item({ id: 10, kind: 'M1', target: { type: 'estimate', id: 3 } }),
    item({ id: 11, kind: 'T6' }),
  ];
  const a = awayOf(items, { since, nowMs: NOW, today: TODAY });
  assert.equal(a.line, '2 new visits · 1 moved · 1 cancelled · 2 office notes');
  assert.deepEqual(a.rows.map((r) => [r.key, r.mark]), [[1, 'new'], [2, 'new'], [3, 'moved'], [6, 'cancelled'], [4, 'note'], [5, 'note']]);
  assert.deepEqual(a.rows[0], { key: 1, mark: 'new', title: 'Brooks K. · today 3–6 PM', sub: 'New visit · Repair', visitId: 41 });
  assert.equal(a.rows[2].title, 'Haddad L. · tomorrow 9–12 PM');
  assert.equal(a.rows[2].sub, 'Moved · was today 5–8 PM');
  assert.equal(a.rows[4].sub, '“The gate code is 7788 now.”');
  assert.equal(a.rows[3].sub, 'Cancelled by the office');
  assert.equal(a.rows[3].visitId, null, 'not their visit any more: nothing to open');
});

test('awayOf: one of a kind in the singular; nothing new — no panel; 14 days at most', () => {
  assert.equal(awayOf([item()], { since: NOW - 20 * H, nowMs: NOW, today: TODAY }).line, '1 new visit');
  assert.equal(awayOf([item({ kind: 'T5', data: { customer: 'X Y' } })], { since: NOW - 20 * H, nowMs: NOW, today: TODAY }).line, '1 office note');
  assert.equal(awayOf([], { since: NOW - 20 * H, nowMs: NOW, today: TODAY }), null);
  assert.equal(awayOf([item({ read_at: 'x' })], { since: NOW - 20 * H, nowMs: NOW, today: TODAY }), null);
  assert.equal(awayOf([item()], { since: null, nowMs: NOW, today: TODAY }), null);
  // away 30 days: only the last 14 count
  const old = item({ event_at: new Date(NOW - (AWAY_DAYS + 1) * 24 * H).toISOString() });
  assert.equal(awayOf([old], { since: NOW - 30 * 24 * H, nowMs: NOW, today: TODAY }), null);
  assert.equal(awayOf([item({ kind: 'T4', data: { customer: 'Min Lee', reason: 'client_rescheduled' } })], { since: NOW - 20 * H, nowMs: NOW, today: TODAY }).rows[0].sub, 'The customer rescheduled');
});
