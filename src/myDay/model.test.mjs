// node --test: «My day» without the screen (model.js). The days are the design's
// (design-mockups/tech-app/final-a3.html: Ivan Petrov, Tuesday Nov 10 2026, 11:20).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nyOffsetMinutes, nyWall, momentWall, parseWall, addDays, weekOf, dayLabel, weekdayLetter, dayOfMonth,
  clock, clockAmPm, windowText, durationText, greeting, firstName, shortName, planOf, visitDay, stateOf, kindText, areaOf, tagOf,
  buildDay, listItems, stripOf, headerLine, weekCounts, nextBusyDay, offerText, emptyText, keepWeek, keptWeek, offlineText, failedText,
  skewOf, nowWall, addressLine, directionsLinks, telLink, MAX_WEEKS_KEPT, DAY_START, DAY_END, isLogged, movedToText, loggedTag,
} from './model.js';

const TUE = '2026-11-10';
const NOW = { date: TUE, minutes: 11 * 60 + 20 };
// A visit as GET /api/my/visits gives it (only the fields the model reads)
let nextId = 1;
function visit(o) {
  const date = o.date || TUE;
  return {
    id: o.id || nextId++, job_id: o.legacy ? null : 100, legacy: !!o.legacy, role: o.role || 'main',
    status: o.status || 'scheduled', outcome: o.outcome || null, visit_kind: o.kind || 'repair',
    visit_number: o.n ?? 1, visit_count: o.of ?? 1,
    scheduled_start: `${date} ${o.w0}:00`, scheduled_end: `${o.w1date || date} ${o.w1}:00`,
    planned_start: o.p ? `${date} ${o.p}:00` : null, duration_minutes: o.dur ?? null,
    omw_at: o.omw_at || null, updated_at: o.updated_at || '2026-11-10T13:00:00.000Z',
    client_name: o.client || 'Client', city: 'city' in o ? o.city : 'Bayside', address_line: o.street || '1 Main St',
    address_unit: o.unit || null, state: 'NY', zip: '11361', lat: null, lng: null,
    main_technician_name: o.main || 'Ivan Petrov', helper_name: o.helper || null,
    ...('closed_at' in o ? { closed_at: o.closed_at } : {}),
    ...('office_change' in o ? { office_change: o.office_change } : {}),
  };
}
// The design's Tuesday: two closed, Patel on the way, Nguyen as helper, Chen later
const DAY5 = () => [
  visit({ id: 1, client: 'Anna Rossi', city: 'Forest Hills', w0: '08:00', w1: '10:00', p: '08:15', dur: 45, status: 'completed', outcome: 'diagnostics_only', kind: 'diagnostics', updated_at: '2026-11-10T14:02:00Z' }),
  visit({ id: 2, client: 'Marta Kowalski', city: 'Forest Hills', w0: '09:00', w1: '11:00', p: '09:40', dur: 70, status: 'completed', outcome: 'done', updated_at: '2026-11-10T15:52:00Z' }),
  visit({ id: 3, client: 'Sanjay Patel', w0: '11:00', w1: '14:00', p: '11:45', dur: 75, status: 'omw', omw_at: '2026-11-10T16:08:00Z', n: 2, of: 2 }),
  visit({ id: 4, client: 'Thanh Nguyen', city: 'Rego Park', w0: '13:00', w1: '16:00', p: '13:30', dur: 120, role: 'helper', main: 'Alex Kim', kind: 'installation', n: 2, of: 2 }),
  visit({ id: 5, client: 'Wei Chen', w0: '15:00', w1: '18:00', p: '15:45', dur: 60, kind: 'recall', n: 3, of: 3 }),
];

test('New York offset follows the US daylight rule, the same as Intl', () => {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const intl = (ms) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
  };
  // every 7 hours 13 minutes over 2025–2028, and the minutes around each change
  let checked = 0;
  for (let ms = Date.UTC(2025, 0, 1); ms < Date.UTC(2029, 0, 1); ms += (7 * 60 + 13) * 60000) { assert.deepEqual(nyWall(ms), intl(ms), new Date(ms).toISOString()); checked++; }
  for (const edge of [Date.UTC(2026, 2, 8, 7), Date.UTC(2026, 10, 1, 6), Date.UTC(2027, 2, 14, 7), Date.UTC(2027, 10, 7, 6)]) {
    for (const d of [-60001, -1, 0, 1, 60000]) { assert.deepEqual(nyWall(edge + d), intl(edge + d)); checked++; }
  }
  assert.ok(checked > 4000);
  assert.equal(nyOffsetMinutes(Date.UTC(2026, 6, 1)), -240);
  assert.equal(nyOffsetMinutes(Date.UTC(2026, 11, 1)), -300);
});

test('the New York day at the UTC midnight: 10:30 PM on Tuesday is still Tuesday', () => {
  assert.deepEqual(nyWall(Date.parse('2026-11-11T03:30:00Z')), { date: '2026-11-10', minutes: 22 * 60 + 30 });
  assert.deepEqual(nyWall(Date.parse('2026-11-11T05:00:00Z')), { date: '2026-11-11', minutes: 0 });
  assert.deepEqual(momentWall('2026-11-10T16:08:00.000Z'), { date: TUE, minutes: 11 * 60 + 8 });
  assert.equal(momentWall('not a time'), null);
  assert.equal(momentWall(null), null);
});

test('the server wall clock strings', () => {
  assert.deepEqual(parseWall('2026-11-10 11:45:00'), { date: TUE, minutes: 705 });
  assert.deepEqual(parseWall('2026-11-10T08:05'), { date: TUE, minutes: 485 });
  assert.equal(parseWall(null), null);
  assert.equal(parseWall('11:45'), null);
});

test('days and words', () => {
  assert.deepEqual(weekOf(TUE), ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']);
  assert.deepEqual(weekOf('2026-11-08')[0], '2026-11-08');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.equal(dayLabel(TUE), 'Tue, Nov 10');
  assert.equal(weekdayLetter(TUE), 'T');
  assert.equal(dayOfMonth(TUE), 10);
  assert.equal(clock(11 * 60 + 45), '11:45');
  assert.equal(clock(12 * 60 + 5), '12:05');
  assert.equal(clock(0), '12:00');
  assert.equal(clockAmPm(13 * 60 + 30), '1:30 PM');
  assert.equal(clockAmPm(8 * 60 + 30), '8:30 AM');
  assert.equal(windowText(parseWall('2026-11-10 11:00'), parseWall('2026-11-10 14:00')), '11–2');
  assert.equal(windowText(parseWall('2026-11-10 09:30'), parseWall('2026-11-10 12:00')), '9:30–12');
  assert.equal(windowText(parseWall('2026-11-10 22:00'), parseWall('2026-11-11 01:00')), '10 PM–1 AM');
  assert.equal(windowText(null, null), '');
  assert.equal(durationText(45), '45m');
  assert.equal(durationText(60), '1h');
  assert.equal(durationText(75), '1h 15m');
  assert.equal(greeting(11 * 60), 'Good morning');
  assert.equal(greeting(13 * 60), 'Good afternoon');
  assert.equal(greeting(18 * 60), 'Good evening');
  assert.equal(firstName('Alex Kim'), 'Alex');
  assert.equal(firstName(''), '');
  assert.equal(firstName(null), '');
});

test('a visit: plan, day, state, kind, area, tag', () => {
  const v = visit({ w0: '11:00', w1: '14:00', p: '11:45', dur: 75 });
  assert.deepEqual(planOf(v), { start: { date: TUE, minutes: 705 }, duration: 75, endMinutes: 780 });
  // no plan: the window start and the default hour
  assert.deepEqual(planOf(visit({ w0: '09:00', w1: '12:00' })), { start: { date: TUE, minutes: 540 }, duration: 60, endMinutes: 600 });
  assert.equal(visitDay(visit({ date: '2026-11-11', w0: '08:00', w1: '11:00' })), '2026-11-11');
  assert.equal(stateOf({ status: 'completed' }), 'closed');
  assert.equal(stateOf({ status: 'omw' }), 'onway');
  assert.equal(stateOf({ status: 'in_progress' }), 'onsite');
  assert.equal(stateOf({ status: 'scheduled' }), 'sched');
  assert.equal(kindText(visit({ w0: '9', w1: '10', kind: 'repair', n: 2, of: 2 })), 'Repair 2/2');
  assert.equal(kindText({ legacy: true }), '', 'the tag says Old task');
  assert.equal(kindText({ visit_kind: 'recall' }), 'Recall');
  assert.equal(areaOf({ city: 'Bayside', address_line: 'x' }), 'Bayside');
  assert.equal(areaOf({ city: null, address_line: '41-22 Bell Blvd, Bayside' }), '41-22 Bell Blvd, Bayside');
  assert.deepEqual(tagOf({ status: 'omw', omw_at: '2026-11-10T16:08:00Z' }), { kind: 'onway', icon: 'car', text: 'On the way 11:08' });
  assert.equal(tagOf({ status: 'omw', omw_at: '2026-11-10T16:08:00Z' }, { long: true }).text, 'On the way since 11:08');
  assert.deepEqual(tagOf({ status: 'in_progress' }), { kind: 'onway', icon: 'pin', text: 'On site' });
  assert.deepEqual(tagOf({ status: 'completed', outcome: 'done' }), { kind: 'done', icon: 'checkc', text: 'Repaired' });
  assert.equal(tagOf({ status: 'completed', outcome: 'diagnostics_only' }).text, 'Diagnostics');
  assert.equal(tagOf({ status: 'completed', outcome: 'diagnostics_only' }, { long: true }).text, 'Diagnostics only');
  assert.equal(tagOf({ status: 'completed', outcome: 'no_access' }).text, 'No access');
  assert.deepEqual(tagOf({ status: 'scheduled', role: 'helper', main_technician_name: 'Alex Kim' }), { kind: 'helper', icon: 'people', text: 'Helping Alex' });
  assert.deepEqual(tagOf({ status: 'scheduled', legacy: true }), { kind: 'neutral', icon: 'history', text: 'Old task' });
  assert.equal(tagOf({ status: 'scheduled', role: 'main' }), null);
});

test('the design day: 5 visits, 2 done, on the way to Patel, next 1:30 PM', () => {
  const day = buildDay(DAY5(), TUE, NOW);
  assert.equal(day.isToday, true);
  assert.deepEqual(day.rows.map((r) => r.n), [1, 2, 3, 4, 5]);
  assert.deepEqual(day.rows.map((r) => r.client), ['Rossi A.', 'Kowalski M.', 'Patel S.', 'Nguyen T.', 'Chen W.']);
  assert.deepEqual(day.summary, { big: '5 visits', small: '2 done · next 1:30 PM' });
  assert.equal(day.current.client, 'Patel S.');
  assert.equal(day.next.client, 'Nguyen T.');
  assert.equal(day.rows[2].current, true);
  assert.equal(day.rows.filter((r) => r.next).length, 0, 'NEXT is marked only when nobody is on the way');
  assert.deepEqual(day.rows.map((r) => r.window), ['8–10', '9–11', '11–2', '1–4', '3–6']);
  assert.deepEqual(day.rows.map((r) => r.timeText), ['done 9:02', 'done 10:52', 'plan 11:45', 'plan 1:30', 'plan 3:45']);
  assert.deepEqual(day.rows.map((r) => r.tag && r.tag.text), ['Diagnostics', 'Repaired', 'On the way 11:08', 'Helping Alex', null]);
  assert.deepEqual(day.rows.map((r) => r.kind), ['Diagnostics 1/1', 'Repair 1/1', 'Repair 2/2', 'Installation 2/2', 'Recall 3/3']);
  // the duration only for a visit still ahead that is the technician's own
  assert.deepEqual(day.rows.map((r) => r.duration), [null, null, null, null, '1h']);
  // free time: after Chen (ends 4:45) until 7 PM
  assert.deepEqual(day.gaps, [{ afterId: 5, from: 16 * 60 + 45, to: DAY_END, text: 'Free 4:45–7:00 PM · 2h 15m' }]);
});

test('the busy day: 7 visits, on site at Patel, the free time at the end', () => {
  const vs = [
    visit({ id: 11, w0: '08:00', w1: '10:00', p: '08:00', dur: 40, status: 'completed', outcome: 'diagnostics_only' }),
    visit({ id: 12, w0: '08:00', w1: '11:00', p: '09:00', dur: 55, status: 'completed', outcome: 'done' }),
    visit({ id: 13, client: 'Patel S.', w0: '10:00', w1: '13:00', p: '10:50', dur: 60, status: 'in_progress' }),
    visit({ id: 14, w0: '12:00', w1: '15:00', p: '12:15', dur: 60, role: 'helper', main: 'Alex' }),
    visit({ id: 15, w0: '13:00', w1: '16:00', p: '13:40', dur: 50 }),
    visit({ id: 16, w0: '14:00', w1: '17:00', p: '15:00', dur: 45 }),
    visit({ id: 17, w0: '16:00', w1: '19:00', p: '16:20', dur: 60 }),
  ];
  const day = buildDay(vs, TUE, NOW);
  assert.equal(day.count, 7);
  assert.deepEqual(day.summary, { big: '7 visits', small: '2 done · next 12:15 PM' });
  assert.equal(day.current.id, 13);
  assert.equal(day.current.tag.text, 'On site');
  assert.deepEqual(day.gaps.map((g) => g.text), ['Free 5:20–7:00 PM · 1h 40m']);
});

test('tomorrow: no now, the summary is the time span, free time at the end', () => {
  const W = '2026-11-11';
  const vs = [
    visit({ date: W, id: 21, w0: '08:00', w1: '11:00', p: '08:30', dur: 60, kind: 'diagnostics' }),
    visit({ date: W, id: 22, w0: '10:00', w1: '13:00', p: '11:00', dur: 60, n: 2, of: 2 }),
    visit({ date: W, id: 23, w0: '14:00', w1: '17:00', p: '14:30', dur: 90, role: 'helper', main: 'Mark Lee', kind: 'installation' }),
  ];
  const day = buildDay(vs, W, NOW);
  assert.equal(day.isToday, false);
  assert.equal(day.current, null);
  assert.equal(day.rows.some((r) => r.current || r.next), false);
  assert.deepEqual(day.summary, { big: '3 visits', small: '8:30 AM – 4:00 PM' });
  assert.deepEqual(day.gaps.map((g) => g.text), ['Free 4:00–7:00 PM · 3h']);
  assert.equal(day.rows[2].tag.text, 'Helping Mark');
  assert.equal(day.rows[2].duration, null);
  assert.equal(headerLine(W, NOW, 'Ivan Petrov'), 'Tomorrow · Wed, Nov 11');
});

test('an empty day, the offer of the next busy day', () => {
  const day = buildDay([], TUE, NOW);
  assert.deepEqual(day.summary, { big: 'No visits', small: '' });
  assert.deepEqual(day.gaps, []);
  assert.equal(emptyText(TUE, NOW), 'No visits today');
  assert.equal(emptyText('2026-11-11', NOW), 'No visits tomorrow');
  assert.equal(emptyText('2026-11-12', NOW), 'No visits on Thu, Nov 12');
  assert.deepEqual(nextBusyDay({ '2026-11-10': 0, '2026-11-11': 3, '2026-11-12': 6 }, TUE), { date: '2026-11-11', count: 3 });
  assert.equal(nextBusyDay({ '2026-11-10': 0 }, TUE), null);
  assert.equal(offerText({ date: '2026-11-11', count: 3 }), 'Next: Wed · 3 visits');
  assert.equal(offerText({ date: '2026-11-12', count: 1 }, { long: true }), 'See Thursday · 1 visit');
  assert.equal(offerText(null), '');
});

test('nobody on the way: the next visit is marked NEXT, today only', () => {
  const vs = [
    visit({ id: 31, w0: '08:00', w1: '10:00', p: '08:30', status: 'completed', outcome: 'done' }),
    visit({ id: 32, w0: '11:00', w1: '14:00', p: '11:00' }), // late: planned 11:00, still next
    visit({ id: 33, w0: '13:00', w1: '16:00', p: '14:00' }),
  ];
  const day = buildDay(vs, TUE, NOW);
  assert.equal(day.current, null);
  assert.equal(day.next.id, 32);
  assert.equal(day.rows[1].next, true);
  assert.deepEqual(day.summary, { big: '3 visits', small: '1 done · next 11:00 AM' });
  // the late visit still holds its hour (to 12:00); then free until the next at 2 PM; after 3 PM until 7 PM
  assert.deepEqual(day.gaps.map((g) => g.text), ['Free 12:00–2:00 PM · 2h', 'Free 3:00–7:00 PM · 4h']);
});

test('free time between visits from now, today', () => {
  const vs = [
    visit({ id: 41, w0: '08:00', w1: '10:00', p: '09:00', status: 'completed', outcome: 'done' }),
    visit({ id: 42, w0: '13:00', w1: '16:00', p: '14:00', dur: 60 }),
  ];
  const day = buildDay(vs, TUE, NOW);
  assert.deepEqual(day.gaps.map((g) => [g.afterId, g.text]), [[41, 'Free 11:20–2:00 PM · 2h 40m'], [42, 'Free 3:00–7:00 PM · 4h']]);
  // late in the evening: nothing free any more
  assert.deepEqual(buildDay(vs, TUE, { date: TUE, minutes: 18 * 60 + 30 }).gaps, []);
});

test('the list in order: free time sits after the visit it follows', () => {
  const vs = [
    visit({ id: 41, w0: '08:00', w1: '10:00', p: '09:00', status: 'completed', outcome: 'done' }),
    visit({ id: 42, w0: '13:00', w1: '16:00', p: '14:00', dur: 60 }),
  ];
  const items = listItems(buildDay(vs, TUE, NOW));
  assert.deepEqual(items.map((i) => (i.type === 'row' ? `row ${i.row.id}` : `gap ${i.gap.text}`)),
    ['row 41', 'gap Free 11:20–2:00 PM · 2h 40m', 'row 42', 'gap Free 3:00–7:00 PM · 4h']);
  // a free gap ahead of the first visit (nothing before it today) comes first
  const later = listItems(buildDay([visit({ id: 43, w0: '14:00', w1: '17:00', p: '15:00' })], TUE, NOW));
  assert.deepEqual(later.map((i) => i.type), ['gap', 'row', 'gap']);
  assert.equal(later[0].gap.text, 'Free 11:20–3:00 PM · 3h 40m');
});

test('the list leaves out cancelled visits and those of other days; old tasks and helpers', () => {
  const vs = [
    visit({ id: 51, w0: '09:00', w1: '12:00', status: 'cancelled' }),
    visit({ id: 52, date: '2026-11-11', w0: '09:00', w1: '12:00' }),
    visit({ id: 53, w0: '10:00', w1: '13:00', legacy: true, city: null, street: '41-22 Bell Blvd, Bayside, NY' }),
    visit({ id: 54, w0: '14:00', w1: '17:00', role: 'helper', main: 'Alex Kim' }),
  ];
  const day = buildDay(vs, TUE, NOW);
  assert.deepEqual(day.rows.map((r) => r.id), [53, 54]);
  assert.equal(day.rows[0].kind, '');
  assert.equal(day.rows[0].area, '41-22 Bell Blvd, Bayside, NY');
  assert.equal(day.rows[0].legacy, true);
  assert.equal(day.rows[0].tag.text, 'Old task');
  assert.equal(day.rows[1].helper, true);
  assert.equal(day.rows[1].tag.text, 'Helping Alex');
});

test('old tasks with the old statuses: after the work closed, rescheduled moved without a number', () => {
  const vs = [
    visit({ id: 81, w0: '08:00', w1: '10:00', p: '08:30', legacy: true, status: 'paid', updated_at: '2026-11-10T14:40:00Z' }),
    visit({ id: 82, w0: '09:00', w1: '12:00', p: '10:00', legacy: true, status: 'rescheduled' }),
    visit({ id: 83, w0: '11:00', w1: '14:00', p: '12:00' }),
    visit({ id: 84, w0: '13:00', w1: '16:00', p: '15:00', legacy: true, status: 'invoiced' }),
  ];
  assert.equal(stateOf({ status: 'awaiting_payment' }), 'closed');
  assert.equal(stateOf({ status: 'rescheduled' }), 'moved');
  const day = buildDay(vs, TUE, NOW);
  assert.deepEqual(day.rows.map((r) => [r.id, r.n]), [[81, 1], [82, null], [83, 2], [84, 3]]);
  assert.deepEqual(day.rows.map((r) => r.tag && r.tag.text), ['Paid', 'Rescheduled', null, 'Invoiced']);
  assert.equal(day.rows[1].timeText, 'moved');
  assert.deepEqual(day.summary, { big: '3 visits', small: '2 done · next 12:00 PM' });
  assert.deepEqual(day.live.map((r) => r.id), [81, 83, 84]);
  assert.deepEqual(stripOf(day, NOW).items.map((i) => i.n), [1, 2, 3]);
  assert.equal(weekCounts(vs, weekOf(TUE), NOW)[TUE], 3);
  // the moved row stays in the list, in its place
  assert.deepEqual(listItems(day).filter((i) => i.type === 'row').map((i) => i.row.id), [81, 82, 83, 84]);
});

test('a visit planned before midnight is on its own day; one planned after midnight on the next', () => {
  const late = visit({ id: 61, w0: '22:00', w1: '01:00', w1date: '2026-11-11', p: '22:30' });
  const early = visit({ id: 62, date: '2026-11-11', w0: '00:30', w1: '02:00' });
  assert.deepEqual(buildDay([late, early], TUE, NOW).rows.map((r) => r.id), [61]);
  assert.deepEqual(buildDay([late, early], '2026-11-11', NOW).rows.map((r) => r.id), [62]);
  assert.equal(buildDay([late], TUE, NOW).rows[0].window, '10 PM–1 AM');
  // its window runs to the end of the strip
  assert.equal(buildDay([late], TUE, NOW).rows[0].winEnd, 1440);
});

test('a past day: closed visits, no free time', () => {
  const MON = '2026-11-09';
  const vs = [visit({ date: MON, id: 71, w0: '09:00', w1: '12:00', status: 'completed', outcome: 'done', updated_at: '2026-11-09T15:00:00Z' })];
  const day = buildDay(vs, MON, NOW);
  assert.equal(day.isPast, true);
  assert.deepEqual(day.summary, { big: '1 visit', small: '1 done' });
  assert.deepEqual(day.gaps, []);
  assert.equal(day.rows[0].timeText, 'done 10:00');
  assert.equal(headerLine(MON, NOW), 'Yesterday · Mon, Nov 9');
});

test('the close time: closed_at; updated_at only when the server has no such field', () => {
  // closed at 9:41, changed later at 11:30: the list says when it was closed
  const closed = (o) => visit({ w0: '08:00', w1: '10:00', p: '08:30', status: 'completed', outcome: 'done', updated_at: '2026-11-10T16:30:00Z', ...o });
  assert.equal(buildDay([closed({ id: 81, closed_at: '2026-11-10T14:41:00Z' })], TUE, NOW).rows[0].timeText, 'done 9:41');
  // the server has the field but does not know the moment: no time rather than the last change
  assert.equal(buildDay([closed({ id: 82, closed_at: null })], TUE, NOW).rows[0].timeText, 'done');
  // a server before backend #138 (or a week kept on the phone from it): the last change
  assert.equal(buildDay([closed({ id: 83 })], TUE, NOW).rows[0].timeText, 'done 11:30');
});

test('the customer in the list: the surname and the first initial, as in the design', () => {
  assert.equal(shortName('Sanjay Patel'), 'Patel S.');
  assert.equal(shortName('Maximiliana Rodriguez-Villanueva'), 'Rodriguez-Villanueva M.');
  assert.equal(shortName('  Anna   Rossi '), 'Rossi A.');
  assert.equal(shortName('Mary Ann Smith'), 'Smith M.');
  assert.equal(shortName('John Smith Jr.'), 'Smith J.');
  assert.equal(shortName('Dr. Wei Chen'), 'Chen W.');
  assert.equal(shortName('Patel, Sanjay'), 'Patel S.');
  assert.equal(shortName('sanjay patel'), 'patel S.');
  assert.equal(shortName('Ольга Иванова'), 'Иванова О.');
  // as it is: one word, already short, a business, nothing
  assert.equal(shortName('Cher'), 'Cher');
  assert.equal(shortName('Rossi A.'), 'Rossi A.');
  assert.equal(shortName('Acme Plumbing LLC'), 'Acme Plumbing LLC');
  assert.equal(shortName('Smith & Sons'), 'Smith & Sons');
  assert.equal(shortName(''), 'Customer');
  assert.equal(shortName(null), 'Customer');
  // the row keeps the full name for the card and VoiceOver
  const row = buildDay([visit({ id: 85, client: 'Maximiliana Rodriguez-Villanueva', w0: '13:00', w1: '16:00', p: '13:30' })], TUE, NOW).rows[0];
  assert.deepEqual([row.client, row.clientFull], ['Rodriguez-Villanueva M.', 'Maximiliana Rodriguez-Villanueva']);
});

// The day log (backend #139): office_change of a visit the office took off a day
const moved = (o = {}) => ({ kind: 'moved', changed_at: '2026-11-10T15:40:00.000Z', to_date: '2026-11-12', to_window: { start: '2026-11-12 09:00:00', end: '2026-11-12 12:00:00' }, ...o });
const change = (kind) => ({ kind, changed_at: '2026-11-10T15:40:00.000Z', to_date: null, to_window: null });

test('the day log: a visit the office moved stays a grey row in its place, not counted', () => {
  const vs = [
    visit({ id: 91, w0: '08:00', w1: '10:00', p: '08:30', status: 'completed', outcome: 'done', closed_at: '2026-11-10T14:00:00Z' }),
    visit({ id: 92, client: 'Lina Haddad', city: 'Little Neck', kind: 'diagnostics', w0: '09:00', w1: '12:00', p: '09:30', office_change: moved() }),
    visit({ id: 93, w0: '13:00', w1: '16:00', p: '13:30', office_change: null }),
  ];
  const day = buildDay(vs, TUE, NOW);
  assert.deepEqual(day.rows.map((r) => [r.id, r.n, r.state, r.logged]), [[91, 1, 'closed', false], [92, null, 'moved', true], [93, 2, 'sched', false]]);
  const row = day.rows[1];
  assert.equal(row.key, '92@2026-11-10 09:00:00');
  assert.equal(row.window, '9–12');                 // the window it had on this day
  assert.equal(row.timeText, 'was today');
  assert.deepEqual(row.tag, { kind: 'logged', icon: 'moved', text: 'Moved · Thu 9–12' });
  assert.equal(row.duration, null);
  assert.equal(row.label, 'Lina Haddad, Diagnostics 1/1, 9–12 was today, Moved to Thu, Nov 12 · 9–12');
  assert.equal(day.rows[0].label, null);
  // not counted, not done, not next, not in the strip, no free time of its own
  assert.equal(day.count, 2);
  assert.equal(day.done, 1);
  assert.deepEqual(day.summary, { big: '2 visits', small: '1 done · next 1:30 PM' });
  assert.equal(day.next.id, 93);
  assert.deepEqual(day.live.map((r) => r.id), [91, 93]);
  assert.deepEqual(stripOf(day, NOW).items.map((i) => [i.id, i.n]), [[91, 1], [93, 2]]);
  assert.equal(weekCounts(vs, weekOf(TUE), NOW)[TUE], 2);
  assert.deepEqual(listItems(day).filter((i) => i.type === 'row').map((i) => i.row.id), [91, 92, 93]);
});

test('the day log: grey whatever the status now; reassigned, cancelled, customer rescheduled', () => {
  const vs = [
    // moved to Thursday and closed there: on Tuesday still the grey row, not «Repaired»
    visit({ id: 101, w0: '08:00', w1: '10:00', p: '08:30', status: 'completed', outcome: 'done', closed_at: '2026-11-12T15:00:00Z', office_change: moved() }),
    // given to another while this technician was on the way: not NOW
    visit({ id: 102, w0: '10:00', w1: '13:00', p: '11:00', status: 'omw', omw_at: null, office_change: change('reassigned') }),
    visit({ id: 103, w0: '11:00', w1: '14:00', p: '12:00', status: 'cancelled', office_change: change('cancelled') }),
    visit({ id: 104, w0: '12:00', w1: '15:00', p: '13:00', status: 'completed', outcome: 'client_rescheduled', office_change: change('client_rescheduled') }),
    visit({ id: 105, w0: '13:00', w1: '16:00', p: '14:00', role: 'helper', office_change: change('reassigned') }),
    visit({ id: 106, w0: '14:00', w1: '17:00', p: '15:00', office_change: change('something_new') }),
    visit({ id: 107, w0: '15:00', w1: '18:00', p: '16:00' }),
    // cancelled, not of the day log: still left out
    visit({ id: 108, w0: '15:00', w1: '18:00', p: '16:30', status: 'cancelled' }),
  ];
  const day = buildDay(vs, TUE, NOW);
  assert.deepEqual(day.rows.map((r) => r.id), [101, 102, 103, 104, 105, 106, 107]);
  assert.deepEqual(day.rows.map((r) => r.state), ['moved', 'moved', 'moved', 'moved', 'moved', 'moved', 'sched']);
  assert.deepEqual(day.rows.map((r) => r.n), [null, null, null, null, null, null, 1]);
  assert.deepEqual(day.rows.map((r) => r.tag && [r.tag.kind, r.tag.icon, r.tag.text]), [
    ['logged', 'moved', 'Moved · Thu 9–12'],
    ['logged', 'people', 'Reassigned'],
    ['logged', 'xcal', 'Cancelled'],
    ['logged', 'moved', 'Rescheduled'],
    ['logged', 'people', 'Reassigned'],
    ['logged', 'moved', 'Changed'],
    null,
  ]);
  // the row's words are short (who did it is on the card); VoiceOver says it all
  assert.deepEqual(['reassigned', 'cancelled', 'client_rescheduled', 'something_new'].map((k) => loggedTag(change(k), TUE, { long: true }).text),
    ['Reassigned by the office', 'Cancelled by the office', 'Customer rescheduled', 'Changed by the office']);
  assert.deepEqual(day.rows.map((r) => r.timeText), ['was today', 'was today', 'was today', 'was today', 'was today', 'was today', 'plan 4:00']);
  assert.equal(day.current, null);
  assert.equal(day.next.id, 107);
  assert.equal(day.rows[1].current, false);
  assert.deepEqual([day.count, day.done], [1, 0]);
  assert.deepEqual(day.summary, { big: '1 visit', small: 'next 4:00 PM' });
});

test('the day log on a past day, and the same visit twice in a week', () => {
  const MON = '2026-11-09';
  const THU = '2026-11-12';
  // moved from Monday to Thursday: the grey row on Monday, the visit itself on Thursday
  const vs = [
    visit({ id: 111, date: MON, w0: '09:00', w1: '12:00', p: '10:00', office_change: moved() }),
    visit({ id: 111, date: THU, w0: '09:00', w1: '12:00', p: '09:30', office_change: null }),
    visit({ id: 112, date: MON, w0: '13:00', w1: '15:00', p: '13:00', status: 'completed', outcome: 'done', closed_at: '2026-11-09T19:00:00Z' }),
  ];
  const mon = buildDay(vs, MON, NOW);
  assert.equal(mon.isPast, true);
  assert.deepEqual(mon.rows.map((r) => [r.id, r.state, r.timeText]), [[111, 'moved', 'was Mon'], [112, 'closed', 'done 2:00']]);
  assert.equal(mon.rows[0].tag.text, 'Moved · Thu 9–12');
  assert.deepEqual(mon.summary, { big: '1 visit', small: '1 done' });
  const thu = buildDay(vs, THU, NOW);
  assert.deepEqual(thu.rows.map((r) => [r.id, r.n, r.state, r.logged]), [[111, 1, 'sched', false]]);
  assert.notEqual(mon.rows[0].key, thu.rows[0].key);
  assert.deepEqual(weekCounts(vs, weekOf(TUE), NOW), { '2026-11-08': 0, '2026-11-09': 1, '2026-11-10': 0, '2026-11-11': 0, '2026-11-12': 1, '2026-11-13': 0, '2026-11-14': 0 });
});

test('the day log only: grey rows, «No visits», no free time, the offer of the next busy day', () => {
  const vs = [
    visit({ id: 121, w0: '09:00', w1: '12:00', p: '09:30', office_change: moved() }),
    visit({ id: 122, date: '2026-11-12', w0: '09:00', w1: '12:00', p: '09:30' }),
  ];
  const day = buildDay(vs, TUE, NOW);
  assert.deepEqual(day.rows.map((r) => r.id), [121]);
  assert.deepEqual(day.live, []);
  assert.deepEqual(day.summary, { big: 'No visits', small: '' });
  assert.deepEqual(day.gaps, []);
  assert.deepEqual(listItems(day).map((i) => i.type), ['row']);
  assert.deepEqual(nextBusyDay(weekCounts(vs, weekOf(TUE), NOW), TUE), { date: '2026-11-12', count: 1 });
  // the same on a day ahead: no free time without a live visit
  assert.deepEqual(buildDay([visit({ id: 123, date: '2026-11-11', w0: '09:00', w1: '12:00', office_change: change('cancelled') })], '2026-11-11', NOW).gaps, []);
});

test('where a moved visit is now, in words', () => {
  assert.equal(movedToText(moved(), TUE), 'Thu 9–12');
  assert.equal(movedToText(moved(), TUE, { long: true }), 'Thu, Nov 12 · 9–12');
  // six days away still the weekday; a week and more the date
  assert.equal(movedToText(moved({ to_date: '2026-11-16', to_window: { start: '2026-11-16 13:30:00', end: '2026-11-16 16:00:00' } }), TUE), 'Mon 1:30–4');
  assert.equal(movedToText(moved({ to_date: '2026-11-17', to_window: { start: '2026-11-17 09:00:00', end: '2026-11-17 12:00:00' } }), TUE), 'Nov 17 9–12');
  assert.equal(movedToText(moved({ to_date: '2026-12-03', to_window: { start: '2026-12-03 08:00:00', end: '2026-12-03 20:00:00' } }), TUE), 'Dec 3 8 AM–8 PM');
  // back to an earlier day
  assert.equal(movedToText(moved({ to_date: '2026-11-09', to_window: { start: '2026-11-09 09:00:00', end: '2026-11-09 12:00:00' } }), TUE), 'Mon 9–12');
  // what the server may leave out
  assert.equal(movedToText(moved({ to_window: null }), TUE), 'Thu');
  assert.equal(movedToText(moved({ to_date: null }), TUE), 'Thu 9–12');
  assert.equal(movedToText(moved({ to_date: null, to_window: null }), TUE), '');
  assert.equal(movedToText(null, TUE), '');
  assert.deepEqual(loggedTag(moved({ to_date: null, to_window: null }), TUE), { kind: 'logged', icon: 'moved', text: 'Moved' });
  assert.equal(loggedTag(moved({ to_date: null, to_window: null }), TUE, { long: true }).text, 'Moved by the office');
  assert.equal(loggedTag(moved({ to_window: null }), TUE, { long: true }).text, 'Moved to Thu, Nov 12');
  assert.equal(isLogged(visit({ w0: '09:00', w1: '12:00', office_change: null })), false);
  assert.equal(isLogged(visit({ w0: '09:00', w1: '12:00' })), false);
});

test('the strip: windows on two tracks, plans, now, ticks', () => {
  const day = buildDay(DAY5(), TUE, NOW);
  const strip = stripOf(day, NOW);
  const span = DAY_END - DAY_START;
  assert.equal(strip.items.length, 5);
  assert.deepEqual(strip.items.map((i) => i.track), [0, 1, 0, 1, 0]);
  assert.equal(strip.items[2].current, true);
  assert.equal(strip.items[0].from, (8 * 60 + 15 - DAY_START) / span);
  assert.equal(strip.now, (11 * 60 + 20 - DAY_START) / span);
  assert.deepEqual(strip.ticks.map((t) => t.text), ['8a', '10a', 'noon', '2p', '4p', '6p']);
  // outside the strip: clamped, not drawn past the ends
  const early = buildDay([visit({ w0: '06:00', w1: '07:00' })], TUE, NOW);
  assert.equal(stripOf(early, NOW).items[0].from, 0);
  assert.equal(stripOf(buildDay([], '2026-11-11', NOW), NOW).now, null);
});

test('the header line', () => {
  assert.equal(headerLine(TUE, NOW, 'Ivan Petrov'), 'Good morning, Ivan · Tue, Nov 10');
  assert.equal(headerLine(TUE, { date: TUE, minutes: 15 * 60 }, ''), 'Good afternoon · Tue, Nov 10');
  assert.equal(headerLine('2026-11-13', NOW, 'Ivan'), 'Fri, Nov 13');
});

test('the week: visits per day, as the days show them', () => {
  const vs = [...DAY5(), visit({ date: '2026-11-11', w0: '08:00', w1: '11:00' }), visit({ date: '2026-11-11', w0: '09:00', w1: '10:00', status: 'cancelled' })];
  assert.deepEqual(weekCounts(vs, weekOf(TUE), NOW), { '2026-11-08': 0, '2026-11-09': 0, '2026-11-10': 5, '2026-11-11': 1, '2026-11-12': 0, '2026-11-13': 0, '2026-11-14': 0 });
});

test('what the phone keeps: per technician, the latest weeks', () => {
  let cache = keepWeek(null, 7, '2026-11-08', [{ id: 1 }], 1000);
  assert.deepEqual(keptWeek(cache, 7, '2026-11-08'), { visits: [{ id: 1 }], savedAt: 1000 });
  assert.equal(keptWeek(cache, 8, '2026-11-08'), null, 'another technician on this phone sees nothing');
  assert.equal(keptWeek(cache, 7, '2026-11-15'), null);
  cache = keepWeek(cache, 7, '2026-11-15', [], 2000);
  cache = keepWeek(cache, 7, '2026-11-01', [], 3000);
  assert.equal(Object.keys(cache.weeks).length, MAX_WEEKS_KEPT);
  assert.equal(keptWeek(cache, 7, '2026-11-08'), null, 'the oldest saved goes');
  // another technician signs in: the old cache is dropped, not merged
  const other = keepWeek(cache, 9, '2026-11-08', [{ id: 5 }], 4000);
  assert.deepEqual(Object.keys(other.weeks), ['2026-11-08']);
  assert.equal(keptWeek({ v: 2, userId: 7, weeks: {} }, 7, '2026-11-08'), null);
});

test('the offline line', () => {
  assert.equal(offlineText(Date.parse('2026-11-10T14:41:00Z'), NOW), 'Offline · from 9:41 AM · Call and Directions work');
  assert.equal(offlineText(Date.parse('2026-11-09T22:05:00Z'), NOW), 'Offline · from Mon 5:05 PM · Call and Directions work');
  assert.equal(offlineText(null, NOW), 'Offline · Call and Directions work');
  assert.equal(failedText(Date.parse('2026-11-10T14:41:00Z'), NOW), 'Could not update · showing 9:41 AM');
  assert.equal(failedText(null, NOW), 'Could not update');
});

test('the phone clock against the server', () => {
  const phone = Date.parse('2026-11-10T16:15:00Z');
  const skew = skewOf('2026-11-10T16:20:00.000Z', phone);
  assert.equal(skew, 5 * 60000);
  assert.deepEqual(nowWall(phone, skew), NOW);
  assert.equal(skewOf('bad', phone), 0);
});

test('address, directions and the phone link', () => {
  const v = { address_line: '41-22 Bell Blvd', address_unit: '3C', city: 'Bayside', state: 'NY', zip: '11361', lat: null, lng: null };
  assert.equal(addressLine(v), '41-22 Bell Blvd, Apt 3C, Bayside, NY 11361');
  assert.equal(addressLine({ ...v, address_unit: 'Apt 3C' }), '41-22 Bell Blvd, Apt 3C, Bayside, NY 11361');
  assert.equal(addressLine({ ...v, address_unit: '#5' }), '41-22 Bell Blvd, #5, Bayside, NY 11361');
  assert.equal(addressLine({ address_line: '41-22 Bell Blvd, Bayside, NY 11361' }), '41-22 Bell Blvd, Bayside, NY 11361');
  const links = directionsLinks(v);
  assert.equal(links.apple, 'https://maps.apple.com/?daddr=41-22%20Bell%20Blvd%2C%20Apt%203C%2C%20Bayside%2C%20NY%2011361');
  assert.equal(links.google, 'https://www.google.com/maps/dir/?api=1&destination=41-22%20Bell%20Blvd%2C%20Apt%203C%2C%20Bayside%2C%20NY%2011361');
  assert.equal(directionsLinks({ lat: 40.7, lng: -73.8 }).apple, 'https://maps.apple.com/?daddr=40.7%2C-73.8');
  assert.equal(directionsLinks({}), null);
  assert.equal(telLink('(718) 555-0142'), 'tel:7185550142');
  assert.equal(telLink('+1 718 555 0142'), 'tel:+17185550142');
  assert.equal(telLink('n/a'), null);
  assert.equal(telLink(null), null);
});
