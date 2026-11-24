import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY, GROUP_ORDER, STAGES, cardOf, chipsOf, estimatesOf, groupsOf, partnerOf, partsError, partsOf, partsQuery,
  shortDate, stageTag, stageWord,
} from './model.js';

// The design's estimates (design-mockups/app-salary-parts parts-all), as GET /api/estimates
// answers a technician (TECHNICIAN_ESTIMATE_FIELDS on the server)
const E = (id, status, client, date, number, name, parts, partNumbers, total, extra = {}) => ({
  id, status, client, date, number, name, name_parts: parts, part_number: partNumbers, total: String(total),
  admin_notes: null, technician_name: 'Ivan Petrov', technician2_name: null, comment_count: '0', has_unread_comments: false, ...extra,
});
const ROWS = [
  E(1, 'arrived', 'Haddad L.', '2026-11-02', 'E-1176', 'Dryer', 'Control board', 'W10854220', 219.99, { admin_notes: 'On the shelf B3 at the office.' }),
  E(2, 'in_transit', 'Patel S.', '2026-11-06', 'E-1189', 'Washer', 'Drain pump\nDoor lock', 'DC31-00178A\nDC64-00519B', 186.4, { admin_notes: 'ETA Nov 13. Call the customer when it arrives.' }),
  E(3, 'in_transit', 'Green P.', '2026-11-03', 'E-1180', 'Washer', 'Water inlet valve', '34001256', 64.9),
  E(4, 'on_board', 'Ortiz J.', '2026-10-30', 'E-1168', 'Refrigerator', 'Control board', 'W10854220', 219.99),
  E(5, 'on_board', 'Kim D.', '2026-10-29', 'E-1166', 'Washer', 'Door gasket', 'DC64-02750A', 58),
  E(6, 'on_board', 'Lopez A.', '2026-10-27', 'E-1161', 'Refrigerator', 'Fan motor\nThermostat', 'W11373577\nWPW10225581', 1234.5, { technician2_name: 'Alex Kim' }),
  E(7, 'scheduled', 'Rossi A.', '2025-10-25', 'E-1158', 'Refrigerator', 'Compressor relay', 'W10613606', 35, { admin_notes: 'Install on Nov 14, 9–12.' }),
];

test('the query of the portal: four stages, with parts, up to 1000, the technician', () => {
  assert.deepEqual(partsQuery('Ivan Petrov'), { status_in: 'in_transit,arrived,on_board,scheduled', has_parts: '1', limit: '1000', technician: 'Ivan Petrov' });
  assert.equal('technician' in partsQuery(null), false);
  assert.deepEqual(STAGES, ['in_transit', 'arrived', 'on_board', 'scheduled']);
});

test('the answer: paginated or a plain array; other stages and empty parts dropped', () => {
  const extra = [E(8, 'sold', 'X', '2026-11-10', 'E-1', 'Dryer', 'Pump', '', 1), E(9, 'arrived', 'Y', '2026-11-10', 'E-2', 'Dryer', '  \n ', '', 1)];
  assert.equal(estimatesOf({ data: [...ROWS, ...extra], total: 9 }).length, 7);
  assert.equal(estimatesOf([...ROWS, ...extra]).length, 7);
  assert.deepEqual(estimatesOf(null), []);
  assert.deepEqual(estimatesOf({ error: 'x' }), []);
});

test('stages with the words of the site, Arrived amber', () => {
  assert.deepEqual(STAGES.map(stageWord), ['In Transit', 'Arrived', 'On Board', 'Scheduled']);
  assert.deepEqual(stageTag('arrived'), { kind: 'diagnostics', icon: 'store', text: 'Arrived' });
  assert.deepEqual(['in_transit', 'on_board', 'scheduled'].map((s) => stageTag(s).icon), ['truck', 'toolbox', 'calok']);
  assert.equal(stageTag('in_transit').kind, 'onway');
  assert.equal(stageTag('on_board').kind, 'done');
  assert.equal(stageTag('scheduled').kind, 'neutral');
  assert.deepEqual(stageTag('weird'), { kind: 'neutral', icon: 'box', text: 'weird' });
});

test('parts with their numbers, line by line', () => {
  assert.deepEqual(partsOf(ROWS[1]), [{ key: '0', name: 'Drain pump', number: 'DC31-00178A' }, { key: '1', name: 'Door lock', number: 'DC64-00519B' }]);
  assert.deepEqual(partsOf({ name_parts: 'Pump\r\nBelt\n', part_number: 'P-1' }), [{ key: '0', name: 'Pump', number: 'P-1' }, { key: '1', name: 'Belt', number: null }]);
  assert.deepEqual(partsOf({ name_parts: 'Pump', part_number: null }), [{ key: '0', name: 'Pump', number: null }]);
});

test('dates: this year short, another year with it', () => {
  assert.equal(shortDate('2026-11-02', 2026), 'Nov 2');
  assert.equal(shortDate('2025-10-25T00:00:00.000Z', 2026), 'Oct 25, 2025');
  assert.equal(shortDate(null, 2026), null);
});

test('cards of the design: sub line, partner, note, total, Arrived marked', () => {
  const me = 'Ivan Petrov';
  const c = cardOf(ROWS[0], { me, thisYear: 2026 });
  assert.deepEqual([c.client, c.sub, c.tag.text, c.need, c.note, c.total], ['Haddad L.', 'Nov 2 · E-1176 · Dryer', 'Arrived', true, 'On the shelf B3 at the office.', '$219.99']);
  assert.equal(cardOf(ROWS[5], { me, thisYear: 2026 }).sub, 'Oct 27 · E-1161 · Refrigerator · with Alex Kim');
  assert.equal(cardOf(ROWS[5], { me, thisYear: 2026 }).total, '$1,234.50');
  assert.equal(cardOf(ROWS[2], { me, thisYear: 2026 }).note, null);
  assert.equal(cardOf(ROWS[2], { me, thisYear: 2026 }).need, false);
  assert.equal(cardOf({ id: 3, status: 'on_board', name_parts: 'x', total: null }, { thisYear: 2026 }).sub, '');
  // no prices for this technician (takes_payments off): no amount, not «$0.00»
  assert.equal(cardOf({ id: 3, status: 'on_board', name_parts: 'x', total: null }, { thisYear: 2026 }).total, null);
  assert.equal(cardOf({ id: 3, status: 'on_board', name_parts: 'x' }, { thisYear: 2026 }).total, null);
  assert.equal(cardOf({ id: 3, status: 'on_board', name_parts: 'x', total: 0 }, { thisYear: 2026 }).total, '$0.00');
});

test('the partner from this technician\'s side', () => {
  assert.equal(partnerOf({ technician_name: 'Ivan Petrov', technician2_name: 'Alex Kim' }, 'Ivan Petrov'), 'Alex Kim');
  assert.equal(partnerOf({ technician_name: 'Alex Kim', technician2_name: 'Ivan Petrov' }, 'Ivan Petrov'), 'Alex Kim');
  assert.equal(partnerOf({ technician_name: 'Ivan Petrov', technician2_name: null }, 'Ivan Petrov'), null);
});

test('chips: All and four stages with counts; Arrived marked only when something is there', () => {
  const list = estimatesOf(ROWS);
  assert.deepEqual(chipsOf(list).map((c) => [c.label, c.count, c.need]), [
    ['All', 7, false], ['Arrived', 1, true], ['In Transit', 2, false], ['On Board', 3, false], ['Scheduled', 1, false],
  ]);
  assert.equal(chipsOf(list.filter((e) => e.status !== 'arrived'))[1].need, false);
});

test('groups: Arrived first, titles with counts, one stage alone, empty groups dropped', () => {
  const list = estimatesOf(ROWS);
  const all = groupsOf(list);
  assert.deepEqual(all.map((g) => [g.title, g.line, g.items.length]), [
    ['Arrived · 1', 'at the office', 1], ['In Transit · 2', 'on the way to the office', 2], ['On Board · 3', 'in your van', 3], ['Scheduled · 1', 'install date set', 1],
  ]);
  assert.deepEqual(GROUP_ORDER[0], 'arrived');
  assert.deepEqual(groupsOf(list, 'on_board').map((g) => g.title), ['On Board · 3']);
  assert.deepEqual(groupsOf(list.filter((e) => e.status !== 'arrived')).map((g) => g.key), ['in_transit', 'on_board', 'scheduled']);
  assert.deepEqual(groupsOf([], 'arrived'), []);
  assert.equal(EMPTY.stage, 'No parts in this status');
});

test('errors: no connection or a refusal', () => {
  assert.equal(partsError(new Error('Network Error')).kind, 'offline');
  assert.equal(partsError({ response: { status: 500 } }).kind, 'failed');
});
