// node --test: picking the day on My day (datePick.js). Today is the design's Tue, Nov 10 2026.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, dateButtonText, dayCellLabel, knownCounts, longDay, monthOf, monthRows, monthTitle } from './datePick.js';
import { keepWeek } from './model.js';

const TUE = '2026-11-10';
const NOW = { date: TUE, minutes: 11 * 60 + 20 };
let nextId = 1;
const visit = (date, o = {}) => ({
  id: nextId++, job_id: 100, legacy: false, role: 'main', status: 'scheduled', outcome: null, visit_kind: 'repair',
  scheduled_start: `${date} 08:00:00`, scheduled_end: `${date} 10:00:00`, planned_start: null, customer_name: 'Ortiz J.', ...o,
});

test('the date button: Today and the day on today, the day alone on another day', () => {
  assert.equal(dateButtonText(TUE, TUE), 'Today · Tue, Nov 10');
  assert.equal(dateButtonText('2026-11-11', TUE), 'Wed, Nov 11');
  assert.equal(dateButtonText('2026-12-01', TUE), 'Tue, Dec 1');
});

test('months: the step over a year, the title', () => {
  assert.equal(monthOf(TUE), '2026-11');
  assert.equal(addMonths('2026-11', 1), '2026-12');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2027-01', -1), '2026-12');
  assert.equal(addMonths('2026-03', -15), '2024-12');
  assert.equal(monthTitle('2026-11'), 'November 2026');
  assert.equal(monthTitle('2027-01'), 'January 2027');
  assert.equal(longDay('2026-11-01'), 'November 1');
});

test('the month in rows of 7, Sunday first, blanks around', () => {
  // November 2026 begins on a Sunday: 5 rows, the last with Nov 29 and 30
  const nov = monthRows('2026-11');
  assert.equal(nov.length, 5);
  assert.deepEqual(nov[0], ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
  assert.deepEqual(nov[4], ['2026-11-29', '2026-11-30', null, null, null, null, null]);
  // December 2026 begins on a Tuesday
  const dec = monthRows('2026-12');
  assert.deepEqual(dec[0].slice(0, 3), [null, null, '2026-12-01']);
  assert.equal(dec.flat().filter(Boolean).length, 31);
  assert.ok(dec.every((row) => row.length === 7));
  // February 2026: 28 days from a Sunday, 4 full rows
  assert.equal(monthRows('2026-02').length, 4);
  assert.equal(monthRows('2028-02').flat().filter(Boolean).length, 29);   // a leap year
  // May 2026 begins on a Friday: 6 rows
  assert.equal(monthRows('2026-05').length, 6);
});

test('the dots: the kept weeks and the week on the screen, nothing else', () => {
  let cache = keepWeek(null, 7, '2026-11-15', [visit('2026-11-16'), visit('2026-11-16'), visit('2026-11-18')], 1000);
  cache = keepWeek(cache, 7, '2026-11-08', [visit('2026-11-09')], 900);
  // the week on the screen is fresher than its kept copy: two visits on Wednesday now
  const shown = { sunday: '2026-11-08', visits: [visit('2026-11-11'), visit('2026-11-11')] };
  const counts = knownCounts(cache, 7, shown, NOW);
  assert.equal(counts['2026-11-11'], 2);
  assert.equal(counts['2026-11-09'], 0);       // the kept copy is replaced, not added to
  assert.equal(counts['2026-11-16'], 2);
  assert.equal(counts['2026-11-18'], 1);
  assert.equal(counts['2026-11-14'], 0);       // a known day without visits
  assert.equal(counts['2026-11-22'], undefined); // a week the phone does not have
  assert.equal(Object.keys(counts).length, 14);
  // another technician's cache on this phone is not his
  assert.deepEqual(knownCounts(cache, 8, null, NOW), {});
  assert.deepEqual(knownCounts(null, 7, null, NOW), {});
  // the grey rows of the day log (the office moved the visit away) are not counted
  const moved = { sunday: '2026-11-22', visits: [visit('2026-11-23', { office_change: { kind: 'moved', to: '2026-11-25T08:00' } })] };
  assert.equal(knownCounts(null, 7, moved, NOW)['2026-11-23'], 0);
});

test('a day of the month for a screen reader', () => {
  assert.equal(dayCellLabel(TUE, TUE, 5), 'November 10, today, 5 visits');
  assert.equal(dayCellLabel('2026-11-11', TUE, 1), 'November 11, 1 visit');
  assert.equal(dayCellLabel('2026-11-14', TUE, 0), 'November 14');
  assert.equal(dayCellLabel('2026-11-22', TUE, undefined), 'November 22');
});
