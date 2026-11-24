// Picking the day on My day without React Native (design-mockups/app-myday-date: the date bar
// ‹ [Today · Tue, Nov 10 ▾] › [Today], and the sheet «Pick a day» with a month). The month is
// drawn here, no calendar library. datePick.test.mjs tests it on node.
//
// The dots of the month: only the weeks the phone already has (the week on the screen and the
// weeks kept for offline, model.js keepWeek), no request for them. A day of another week has no
// dot: not «no visits», only «not known here» (the legend says «Days with your visits»).
import { addDays, buildDay, dayLabel, keptWeek, weekOf, weekdayOf } from './model.js';

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');

// The date button: 'Today · Tue, Nov 10' on today, 'Wed, Nov 11' on another day
export function dateButtonText(date, today) {
  return date === today ? `Today · ${dayLabel(date)}` : dayLabel(date);
}

// A month is 'YYYY-MM'
export const monthOf = (date) => date.slice(0, 7);
export function addMonths(month, n) {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}
// 'November 2026'
export const monthTitle = (month) => `${MONTHS_LONG[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
// 'November 11'
export const longDay = (date) => `${MONTHS_LONG[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;

// The month as rows of 7 (Sunday first): a date, or null before the 1st and after the last day
export function monthRows(month) {
  const first = `${month}-01`;
  const cells = Array.from({ length: weekdayOf(first) }, () => null);
  for (let date = first; monthOf(date) === month; date = addDays(date, 1)) cells.push(date);
  while (cells.length % 7) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

// Visits per day of the weeks the phone has: { 'YYYY-MM-DD': n }. cache — what storage.js
// keeps; shown — { sunday, visits } of the week on the screen (fresher than the kept one).
export function knownCounts(cache, userId, shown, now) {
  const weeks = {};
  const keptWeeks = cache && cache.v === 1 && cache.userId === userId && cache.weeks ? Object.keys(cache.weeks) : [];
  for (const sunday of keptWeeks) {
    const kept = keptWeek(cache, userId, sunday);
    if (kept && Array.isArray(kept.visits)) weeks[sunday] = kept.visits;
  }
  if (shown && Array.isArray(shown.visits)) weeks[shown.sunday] = shown.visits;
  const counts = {};
  for (const [sunday, visits] of Object.entries(weeks)) {
    for (const date of weekOf(sunday)) counts[date] = buildDay(visits, date, now).count;
  }
  return counts;
}

// The words a screen reader says for a day of the month: 'November 11, today, 3 visits'
export function dayCellLabel(date, today, count) {
  const parts = [longDay(date)];
  if (date === today) parts.push('today');
  if (count > 0) parts.push(`${count} ${count === 1 ? 'visit' : 'visits'}`);
  return parts.join(', ');
}
