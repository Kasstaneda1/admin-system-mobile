// The card of a grey row of the day log (backend #139): a visit the office took off this
// day — moved to another day, given to another technician, cancelled, or closed as «the
// customer moved it». Read only, and made from the row itself: the server's visit as it was
// on that day, with office_change. No request, so it opens offline too, and it shows nothing
// the row does not have (a visit given away comes with nothing of the new technician; the
// server's card of it has no job history and no notes either). Design final-a3, «Visit ·
// moved by the office»: the dashed tag, the box with what happened (.moved-box), the times
// struck through (.vwhen.struck); no Directions, no Call, no actions, no notes.
// Without React Native (moved.test.mjs).
import { clock, clockAmPm, daysBetween, dayLabel, durationText, momentWall, movedToText, parseWall, planOf, visitDay, weekdayName, windowText } from './model.js';
import { addressLines, appliancesOf, kindLine, money, monthDay, techName } from './visit.js';

// The tag over the name, as the design's «Moved by the office» (dashed grey, as the row's)
const TAGS = {
  moved: ['moved', 'Moved by the office'],
  reassigned: ['people', 'Reassigned by the office'],
  cancelled: ['xcal', 'Cancelled by the office'],
  client_rescheduled: ['moved', 'Customer rescheduled'],
};
export function movedTag(change) {
  const [icon, text] = TAGS[change && change.kind] || ['moved', 'Changed by the office'];
  return { kind: 'logged', icon, text };
}

const isDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

// A day from now, as the box says it: 'today', 'tomorrow', 'yesterday', 'on Thursday' (the
// coming week), else 'on Dec 3'
function onDay(date, now) {
  const diff = daysBetween(now.date, date);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1 && diff < 7) return `on ${weekdayName(date)}`;
  return `on ${monthDay(date)}`;
}

// When the office did it, New York time: ' at 10:40 AM'; another day ' on Nov 10 at 10:40 AM';
// '' when the server does not say
function whenText(changedAt, now) {
  const at = momentWall(changedAt);
  if (!at) return '';
  return at.date === now.date ? ` at ${clockAmPm(at.minutes)}` : ` on ${monthDay(at.date)} at ${clockAmPm(at.minutes)}`;
}

// What happened, the box under the address: { title, text }. date: the day of the row.
export function movedBox(change, date, now) {
  const at = whenText(change && change.changed_at, now);
  switch (change && change.kind) {
    case 'moved': {
      const to = movedToText(change, date, { long: true });
      const start = parseWall(change.to_window && change.to_window.start);
      const toDate = isDay(change.to_date) ? change.to_date : start ? start.date : null;
      return {
        title: to ? `Moved to ${to}` : 'Moved by the office',
        text: `The office moved it${at}.${toDate ? ` It now shows ${onDay(toDate, now)}.` : ''}`,
      };
    }
    case 'reassigned':
      return { title: 'Given to another technician', text: `The office gave it to another technician${at}. It is no longer yours.` };
    case 'cancelled':
      return { title: 'This visit is cancelled', text: `The office cancelled it${at}.` };
    case 'client_rescheduled':
      return { title: 'The customer asked for another time', text: `The office took it off this day${at}.` };
    default:
      return { title: 'Taken off this day', text: `The office took it off this day${at}.` };
  }
}

// Who the technician was on it: 'your visit', 'you were helping Alex K.'; a helper of a visit
// given away is not told whom they helped (the server sends nothing of the new technicians)
function whoText(visit) {
  if (visit.role !== 'helper') return 'your visit';
  const main = techName(visit.main_technician_name);
  return main ? `you were helping ${main}` : 'you were the helper';
}

// The times it had on the day, all struck through: window, plan, fee (an old task has no fee)
function tilesOf(visit) {
  const ws = parseWall(visit.scheduled_start);
  const we = parseWall(visit.scheduled_end);
  const plan = planOf(visit);
  const tiles = [
    { key: 'window', label: 'Window', big: ws ? windowText(ws, we) : '—', small: '', struck: true },
    { key: 'plan', label: 'Plan', big: plan ? clock(plan.start.minutes) : '—', small: plan ? durationText(plan.duration) : '', struck: true },
  ];
  if (!visit.legacy) {
    if (visit.visit_kind === 'recall') tiles.push({ key: 'fee', label: 'Fee', big: 'No charge', small: 'recall', struck: true });
    else {
      const fee = money(visit.service_call_fee_quoted_cents);
      tiles.push({ key: 'fee', label: 'Fee', big: fee || '—', small: fee ? 'told' : 'not set', struck: true });
    }
  }
  return tiles;
}

// Everything the card shows. visit: the row's visit (office_change set); now: New York
// { date, minutes }; date: the row's day (else the day of the visit's time then).
export function movedCard(visit, now, date = null) {
  const day = isDay(date) ? date : visitDay(visit);
  const change = visit.office_change || null;
  const box = movedBox(change, day, now);
  return {
    id: visit.id,
    tag: movedTag(change),
    kindLine: kindLine(visit),
    name: (typeof visit.client_name === 'string' && visit.client_name.trim()) || 'Customer',
    address: addressLines(visit),
    box,
    tiles: tilesOf(visit),
    was: day ? `Was on ${dayLabel(day)} · ${whoText(visit)}` : `Was ${whoText(visit)}`,
    problem: typeof visit.description === 'string' && visit.description.trim() ? visit.description.trim() : null,
    appliances: appliancesOf(visit),
  };
}
