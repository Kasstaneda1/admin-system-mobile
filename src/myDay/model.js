// «My day» without React Native (TECH_APP_MY_DAY_SPEC.md §3–4, design A3 of
// design-mockups/tech-app/final-a3.html): New York time, the day of a technician as the
// screen shows it (numbers, the strip, the list, «now», the free time, the summary), the
// week, the words, and what the phone keeps for offline. model.test.mjs tests it on node.
//
// The server (backend routes/scheduler/my.js, GET /api/my/visits?from&to):
//   windows and plans (scheduled_start, scheduled_end, planned_start) are New York wall clock
//   «as written», strings 'YYYY-MM-DD HH:MM:SS'; moments (omw_at, updated_at, server_time)
//   are UTC with Z. Statuses: scheduled, omw, in_progress, completed (with an outcome),
//   cancelled. The list leaves out cancelled visits and those the customer moved.

export const DEFAULT_DURATION = 60;   // the server's default when a visit has no duration
export const DAY_START = 8 * 60;      // the strip and the free time: 8 AM ...
export const DAY_END = 19 * 60;       // ... to 7 PM
const GAP_BETWEEN = 75;               // free time between visits shown from this long
const GAP_END = 60;                   // free time after the last visit shown from this long
export const MAX_WEEKS_KEPT = 2;      // weeks the phone keeps for offline

// ---------- New York time ----------
// The phone may be in another zone and Hermes may not know time zones, so the New York
// offset comes from the US rule (since 2007): daylight time from the second Sunday of March,
// 2 AM, to the first Sunday of November, 2 AM.
function nthSunday(year, month, n) {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + (n - 1) * 7;
}
export function nyOffsetMinutes(utcMs) {
  const year = new Date(utcMs).getUTCFullYear();
  const start = Date.UTC(year, 2, nthSunday(year, 2, 2), 7);   // 2:00 EST = 7:00 UTC
  const end = Date.UTC(year, 10, nthSunday(year, 10, 1), 6);   // 2:00 EDT = 6:00 UTC
  return utcMs >= start && utcMs < end ? -240 : -300;
}

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// A moment (ms) as New York wall clock: { date 'YYYY-MM-DD', minutes from midnight }
export function nyWall(utcMs) {
  const d = new Date(utcMs + nyOffsetMinutes(utcMs) * 60000);
  return { date: isoDate(d), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

// A moment string with Z (or ms) as New York wall clock; null when it is not a moment
export function momentWall(value) {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? nyWall(ms) : null;
}

// A wall clock string of the server ('YYYY-MM-DD HH:MM[:SS]', also with T) as
// { date, minutes }; null when it is not one
export function parseWall(value) {
  const m = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  return m ? { date: m[1], minutes: Number(m[2]) * 60 + Number(m[3]) } : null;
}

const dayMs = (date) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
export function addDays(date, n) { return isoDate(new Date(dayMs(date) + n * 86400000)); }
export function daysBetween(a, b) { return Math.round((dayMs(b) - dayMs(a)) / 86400000); }
export function weekdayOf(date) { return new Date(dayMs(date)).getUTCDay(); }
// The week (Sunday to Saturday) a day is in, as 7 dates
export function weekOf(date) {
  const sunday = addDays(date, -weekdayOf(date));
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const weekdayLetter = (date) => 'SMTWTFS'[weekdayOf(date)];
export const dayOfMonth = (date) => Number(date.slice(8, 10));
// 'Tue, Nov 10'
export function dayLabel(date) {
  return `${WEEKDAYS[weekdayOf(date)]}, ${MONTHS[Number(date.slice(5, 7)) - 1]} ${dayOfMonth(date)}`;
}
export const weekdayName = (date) => WEEKDAYS_LONG[weekdayOf(date)];

// ---------- clock words ----------
const hour12 = (minutes) => Math.floor(minutes / 60) % 12 || 12;
const ampm = (minutes) => (((minutes % 1440) + 1440) % 1440 >= 720 ? 'PM' : 'AM');
// '11:45' (no AM/PM)
export function clock(minutes) { return `${hour12(minutes)}:${pad(((minutes % 60) + 60) % 60)}`; }
// '11:45 AM'
export function clockAmPm(minutes) { return `${clock(minutes)} ${ampm(minutes)}`; }
// '11' on the hour, '9:30' otherwise
function short(minutes) { return minutes % 60 ? clock(minutes) : String(hour12(minutes)); }
// The window as in the design: '11–2', '9:30–12'. Across midnight or when both ends are on
// the same side of noon is still short; a window longer than 12 hours says AM/PM.
export function windowText(start, end) {
  if (!start || !end) return '';
  if (start.date !== end.date || end.minutes - start.minutes >= 720) {
    return `${short(start.minutes)} ${ampm(start.minutes)}–${short(end.minutes)} ${ampm(end.minutes)}`;
  }
  return `${short(start.minutes)}–${short(end.minutes)}`;
}
// '1h', '45m', '1h 15m'
export function durationText(minutes) {
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;
  return `${minutes}m`;
}
export function greeting(minutes) {
  if (minutes < 12 * 60) return 'Good morning';
  if (minutes < 17 * 60) return 'Good afternoon';
  return 'Good evening';
}
export const firstName = (name) => (typeof name === 'string' && name.trim() ? name.trim().split(/\s+/)[0] : '');

// The customer in the day's list, short as in the design: 'Sanjay Patel' → 'Patel S.' (the
// surname and the first initial; 'Patel, Sanjay' too). One word, or a business ('… LLC'), stays
// as it is; the full name is on the visit card.
const TITLES = /^(mr|mrs|ms|miss|dr)\.?$/i;
const SUFFIXES = /^(jr|sr|ii|iii|iv)\.?,?$/i;
const BUSINESS = /^(llc|inc|corp|corporation|co|ltd|company|group|&)\.?,?$/i;
export function shortName(name) {
  const full = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (!full) return 'Customer';
  let surname;
  let first;
  const comma = full.match(/^([^,]+),\s*(.+)$/);
  if (comma && !BUSINESS.test(comma[2].split(' ')[0])) {
    surname = comma[1];
    first = comma[2].split(' ').filter((w) => !TITLES.test(w))[0];
  } else {
    const words = full.split(' ');
    if (words.some((w) => BUSINESS.test(w))) return full;
    const parts = words.filter((w) => !TITLES.test(w));
    while (parts.length > 2 && SUFFIXES.test(parts[parts.length - 1])) parts.pop();
    if (parts.length < 2) return full;
    // already short ('Rossi A.'): the last word is one initial
    if (parts[parts.length - 1].replace(/\.$/, '').length === 1) return full;
    surname = parts[parts.length - 1].replace(/,$/, '');
    first = parts[0];
  }
  // the first letter (any cased alphabet), not a bracket or a quote
  const initial = [...(first || '')].find((ch) => ch.toLowerCase() !== ch.toUpperCase());
  return initial ? `${surname} ${initial.toUpperCase()}.` : surname;
}

// ---------- a visit ----------
const KINDS = { diagnostics: 'Diagnostics', repair: 'Repair', installation: 'Installation', recall: 'Recall' };
// The outcome of a closed visit: [long word, short word in the list, icon, colour family]
export const OUTCOMES = {
  done: ['Repaired', 'Repaired', 'checkc', 'done'],
  diagnostics_only: ['Diagnostics only', 'Diagnostics', 'search', 'diagnostics'],
  deposit: ['Deposit taken', 'Deposit taken', 'money', 'deposit'],
  installation: ['Installed', 'Installed', 'install', 'installation'],
  recall: ['Recall checked', 'Recall checked', 'replay', 'recall'],
  no_access: ['No access', 'No access', 'door', 'neutral'],
  client_rescheduled: ['Moved', 'Moved', 'moved', 'neutral'],
};

// When the visit's work is planned: { start, end } as wall clock; the plan, else the window start
export function planOf(visit) {
  const start = parseWall(visit.planned_start) || parseWall(visit.scheduled_start);
  if (!start) return null;
  const duration = Number.isFinite(visit.duration_minutes) && visit.duration_minutes > 0 ? visit.duration_minutes : DEFAULT_DURATION;
  return { start, duration, endMinutes: start.minutes + duration };
}
// The day a visit is listed on: the day of its planned start (else of its window)
export function visitDay(visit) {
  const plan = planOf(visit);
  return plan ? plan.start.date : null;
}
// The state the screen draws: closed, onway, onsite, sched, cancelled
// Old tasks (legacy) may still hold the old scheduler's statuses: after the work
// (invoiced, awaiting_payment, paid) they are closed; rescheduled is moved (no number).
const OLD_CLOSED = { invoiced: 'Invoiced', awaiting_payment: 'Awaiting payment', paid: 'Paid' };
export function stateOf(visit) {
  if (visit.status === 'completed' || OLD_CLOSED[visit.status]) return 'closed';
  if (visit.status === 'omw') return 'onway';
  if (visit.status === 'in_progress') return 'onsite';
  if (visit.status === 'cancelled') return 'cancelled';
  if (visit.status === 'rescheduled') return 'moved';
  return 'sched';
}
const isCurrentState = (state) => state === 'onway' || state === 'onsite';

// 'Repair 2/2'; an old task (legacy) has no kind and no number (its tag says «Old task»)
export function kindText(visit) {
  if (visit.legacy) return '';
  const kind = KINDS[visit.visit_kind] || 'Visit';
  return visit.visit_number && visit.visit_count ? `${kind} ${visit.visit_number}/${visit.visit_count}` : kind;
}
// Where, in a few words: the city; an old task has its address in one line
export function areaOf(visit) {
  if (visit.city) return visit.city;
  return typeof visit.address_line === 'string' ? visit.address_line : '';
}

// The tag of a visit in the list: { kind, icon, text } or null. kind is the colour family.
export function tagOf(visit, { long = false } = {}) {
  const state = stateOf(visit);
  if (state === 'closed') {
    const out = OUTCOMES[visit.outcome];
    if (out) return { kind: out[3], icon: out[2], text: long ? out[0] : out[1] };
    if (OLD_CLOSED[visit.status]) return { kind: 'done', icon: 'checkc', text: OLD_CLOSED[visit.status] };
    return { kind: 'neutral', icon: 'checkc', text: 'Closed' };
  }
  if (state === 'moved') return { kind: 'neutral', icon: 'moved', text: 'Rescheduled' };
  if (state === 'onway') {
    const at = momentWall(visit.omw_at);
    const time = at ? ` ${clock(at.minutes)}` : '';
    return { kind: 'onway', icon: 'car', text: at ? (long ? `On the way since${time}` : `On the way${time}`) : 'On the way' };
  }
  if (state === 'onsite') return { kind: 'onway', icon: 'pin', text: 'On site' };
  if (state === 'cancelled') return { kind: 'neutral', icon: 'moved', text: 'Cancelled' };
  if (visit.role === 'helper') {
    const main = firstName(visit.main_technician_name);
    return { kind: 'helper', icon: 'people', text: main ? `Helping ${main}` : 'Helping' };
  }
  if (visit.legacy) return { kind: 'neutral', icon: 'history', text: 'Old task' };
  return null;
}

// ---------- the day ----------
// The day as the screen draws it. visits: the server's list (any days); date: the day
// shown; now: New York wall clock { date, minutes } of this moment.
// Returns {
//   date, isToday, isPast, rows: [row], current: row|null, next: row|null,
//   summary: { big, small }, gaps: [{ afterId, from, to, text }], count, done
// }
// row: { id, key, n, visit, state, current, next, helper, legacy, client (short), clientFull, area, kind, window,
//        timeText, tag, start, end (minutes of the plan), winStart, winEnd (minutes on this
//        day, clamped to it) }
// Numbers go by planned time, 1..n, the same in the strip and in the list; only live visits
// get one (a moved one shows «–», is not counted and is not in the strip, as in the design).
export function buildDay(visits, date, now) {
  const isToday = date === now.date;
  const isPast = date < now.date;
  // A visit the office took off this technician's day (office_change, coming from the server)
  // will be a grey row of its own; until the screen draws it, it is left out as before.
  const day = (visits || [])
    .filter((v) => v && !v.office_change && stateOf(v) !== 'cancelled' && visitDay(v) === date)
    .map((v) => ({ v, plan: planOf(v) }))
    .sort((a, b) => a.plan.start.minutes - b.plan.start.minutes || a.v.id - b.v.id);

  let number = 0;
  const all = day.map(({ v, plan }) => {
    const state = stateOf(v);
    const ws = parseWall(v.scheduled_start);
    const we = parseWall(v.scheduled_end);
    const onDay = (w, fallback) => (!w ? fallback : w.date < date ? 0 : w.date > date ? 1440 : w.minutes);
    let timeText = `plan ${clock(plan.start.minutes)}`;
    if (state === 'closed') {
      // closed_at (backend #138): the moment it was closed, null when the server does not know
      // it (then no time); only a server without the field (or a week kept from one): the last change
      const at = 'closed_at' in v ? momentWall(v.closed_at) : momentWall(v.updated_at);
      timeText = at && at.date === date ? `done ${clock(at.minutes)}` : 'done';
    }
    if (state === 'moved') timeText = 'moved';
    return {
      id: v.id,
      // the list's key: one visit may come twice in a range (moved by the office: a grey row on
      // the old day, a live one on the new), so the id and the window it has on this day
      key: `${v.id}@${v.scheduled_start || ''}`,
      n: state === 'moved' ? null : ++number,
      visit: v,
      state,
      current: false,
      next: false,
      helper: v.role === 'helper',
      legacy: !!v.legacy,
      client: shortName(v.client_name),
      clientFull: (typeof v.client_name === 'string' && v.client_name.trim()) || 'Customer',
      area: areaOf(v),
      kind: kindText(v),
      duration: state === 'sched' && v.role !== 'helper' ? durationText(plan.duration) : null,
      window: windowText(ws, we),
      timeText,
      tag: tagOf(v),
      start: plan.start.minutes,
      end: plan.endMinutes,
      winStart: onDay(ws, plan.start.minutes),
      winEnd: onDay(we, plan.endMinutes),
    };
  });
  const rows = all.filter((r) => r.state !== 'moved');

  // Now: the visit on the way or on site; else, today, the next one to go to
  const current = isToday ? rows.find((r) => isCurrentState(r.state)) || null : null;
  const nextRow = rows.find((r) => r.state === 'sched' && r !== current) || null;
  if (current) current.current = true;
  else if (isToday && nextRow) nextRow.next = true;

  const done = rows.filter((r) => r.state === 'closed').length;
  const count = rows.length;
  const visitsWord = `${count} visit${count === 1 ? '' : 's'}`;
  let summary;
  if (!count) summary = { big: 'No visits', small: '' };
  else if (isToday) {
    summary = { big: visitsWord, small: [done ? `${done} done` : null, nextRow ? `next ${clockAmPm(nextRow.start)}` : null].filter(Boolean).join(' · ') };
  } else if (isPast) {
    summary = { big: visitsWord, small: done ? `${done} done` : '' };
  } else {
    const last = rows.reduce((m, r) => Math.max(m, r.end), 0);
    summary = { big: visitsWord, small: `${clockAmPm(rows[0].start)} – ${clockAmPm(last)}` };
  }

  // rows: every visit of the list, moved ones too; the counts and free time are of live ones
  return { date, isToday, isPast, rows: all, live: rows, current, next: nextRow, summary, gaps: freeTime(rows, { isToday, isPast, now }), count, done };
}

// Free time on the day: today between the visits still ahead (from now), and after the last
// visit until 7 PM, on today and days ahead. [{ afterId (row it follows, null = before the
// first), from, to, text }]
export function freeTime(rows, { isToday, isPast, now }) {
  if (isPast || !rows.length) return [];
  const gaps = [];
  const nowMin = isToday ? now.minutes : null;
  let cursor = isToday ? nowMin : -Infinity;
  let prevId = null;
  if (isToday) {
    for (const row of rows) {
      if (row.state === 'sched') {
        const from = Math.max(cursor, nowMin);
        if (row.start - from >= GAP_BETWEEN) gaps.push(gap(prevId, from, row.start));
      }
      cursor = Math.max(cursor, row.end);
      prevId = row.id;
    }
  } else {
    cursor = rows.reduce((m, r) => Math.max(m, r.end), 0);
    prevId = rows[rows.length - 1].id;
  }
  const from = Math.max(cursor, isToday ? nowMin : -Infinity);
  if (DAY_END - from >= GAP_END) gaps.push(gap(prevId, from, DAY_END));
  return gaps;
}
function gap(afterId, from, to) {
  return { afterId, from, to, text: `Free ${clock(from)}–${clockAmPm(to)} · ${durationText(to - from)}` };
}

// The list in order: [{ type: 'row', row } | { type: 'gap', gap }]; a gap follows the row
// it comes after (afterId), one before the first row comes first
export function listItems(day) {
  const items = day.gaps.filter((g) => g.afterId === null).map((g) => ({ type: 'gap', gap: g }));
  for (const row of day.rows) {
    items.push({ type: 'row', row });
    for (const g of day.gaps) if (g.afterId === row.id) items.push({ type: 'gap', gap: g });
  }
  return items;
}

// The strip of the day, 8 AM to 7 PM in fractions 0..1: for each row its window (two tracks,
// so neighbours do not touch) and its planned work; the now line; ticks 8a .. 6p.
// Known limit: when the plans themselves overlap, their blocks overlap on the strip too.
export function stripOf(day, now) {
  const span = DAY_END - DAY_START;
  const x = (m) => Math.min(1, Math.max(0, (m - DAY_START) / span));
  return {
    items: day.live.map((r, i) => ({
      id: r.id, key: r.key, n: r.n, state: r.state, helper: r.helper, current: r.current || r.next,
      track: i % 2, winFrom: x(r.winStart), winTo: x(r.winEnd), from: x(r.start), to: x(r.end),
    })),
    now: day.isToday && now.minutes >= DAY_START && now.minutes <= DAY_END ? x(now.minutes) : null,
    ticks: [8, 10, 12, 14, 16, 18].map((h) => ({ at: x(h * 60), text: h === 12 ? 'noon' : `${h % 12 || 12}${h < 12 ? 'a' : 'p'}` })),
  };
}

// The header's first line: 'Good morning, Ivan · Tue, Nov 10', 'Tomorrow · Wed, Nov 11'
export function headerLine(date, now, name) {
  const label = dayLabel(date);
  if (date === now.date) {
    const who = firstName(name);
    return `${greeting(now.minutes)}${who ? `, ${who}` : ''} · ${label}`;
  }
  if (date === addDays(now.date, 1)) return `Tomorrow · ${label}`;
  if (date === addDays(now.date, -1)) return `Yesterday · ${label}`;
  return label;
}

// Visits per day of the week: { 'YYYY-MM-DD': n }, the same rows the day shows
export function weekCounts(visits, week, now) {
  const counts = {};
  for (const date of week) counts[date] = buildDay(visits, date, now).count;
  return counts;
}

// The empty day's offer: the next day of the loaded week with visits, after `date`
export function nextBusyDay(counts, date) {
  const later = Object.keys(counts).filter((d) => d > date && counts[d] > 0).sort();
  return later.length ? { date: later[0], count: counts[later[0]] } : null;
}

// The empty day's offer in words: the button (long) and the line under the header (short)
// design final-empty: «See Wednesday · 3 visits», «No visits · Next: Wed · 3 visits»
export function offerText(offer, { long = false } = {}) {
  if (!offer) return '';
  const visits = `${offer.count} visit${offer.count === 1 ? '' : 's'}`;
  return long ? `See ${weekdayName(offer.date)} · ${visits}` : `Next: ${WEEKDAYS[weekdayOf(offer.date)]} · ${visits}`;
}

// The empty day's words
export function emptyText(date, now) {
  if (date === now.date) return 'No visits today';
  if (date === addDays(now.date, 1)) return 'No visits tomorrow';
  return `No visits on ${dayLabel(date)}`;
}

// ---------- what the phone keeps (offline) ----------
// The cache: { v: 1, userId, weeks: { sunday: { visits, savedAt } } }, at most MAX_WEEKS_KEPT
// weeks, the latest saved. The screen reads its week from it when the server cannot be reached.
export function keepWeek(cache, userId, sunday, visits, savedAt) {
  const same = cache && cache.v === 1 && cache.userId === userId ? cache.weeks : {};
  const weeks = { ...same, [sunday]: { visits, savedAt } };
  const kept = Object.keys(weeks).sort((a, b) => weeks[b].savedAt - weeks[a].savedAt).slice(0, MAX_WEEKS_KEPT);
  return { v: 1, userId, weeks: Object.fromEntries(kept.map((k) => [k, weeks[k]])) };
}
export function keptWeek(cache, userId, sunday) {
  if (!cache || cache.v !== 1 || cache.userId !== userId || !cache.weeks) return null;
  return cache.weeks[sunday] || null;
}
// The offline line: 'Offline · from 9:41 AM · Call and Directions work' (another day: 'from Mon 9:41 AM')
function savedWhen(savedAt, now) {
  const at = momentWall(savedAt);
  if (!at) return null;
  return at.date === now.date ? clockAmPm(at.minutes) : `${WEEKDAYS[weekdayOf(at.date)]} ${clockAmPm(at.minutes)}`;
}
export function offlineText(savedAt, now) {
  const when = savedWhen(savedAt, now);
  return when ? `Offline · from ${when} · Call and Directions work` : 'Offline · Call and Directions work';
}
// The server answered with a failure (not offline): 'Could not update · showing 9:41 AM'
export function failedText(savedAt, now) {
  const when = savedWhen(savedAt, now);
  return when ? `Could not update · showing ${when}` : 'Could not update';
}
// '3 visits · updated 2:41 PM' is the spec's words; the design shows the summary instead.
export function updatedText(savedAt) {
  const at = momentWall(savedAt);
  return at ? `updated ${clockAmPm(at.minutes)}` : '';
}

// ---------- the clock of the phone against the server ----------
// The phone's clock may be off; the server's moment of the last answer corrects it.
// skew = server - phone at that answer (ms); now = phone + skew, as New York wall clock.
export function skewOf(serverTime, phoneMs) {
  const server = Date.parse(serverTime);
  return Number.isFinite(server) && Number.isFinite(phoneMs) ? server - phoneMs : 0;
}
export function nowWall(phoneMs, skew = 0) { return nyWall(phoneMs + skew); }

// ---------- the phone's links ----------
// The address in one line for the maps: street, unit, city, state, ZIP
export function addressLine(visit) {
  const street = [visit.address_line, visit.address_unit ? `Apt ${visit.address_unit}`.replace(/^Apt (apt|unit|#)/i, '$1') : null].filter(Boolean).join(', ');
  const cityLine = [visit.city, [visit.state, visit.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [street, cityLine].filter(Boolean).join(', ');
}
// Directions: Apple Maps and Google Maps by web link (they open the app when it is there)
export function directionsLinks(visit) {
  const line = addressLine(visit);
  const hasPoint = Number.isFinite(visit.lat) && Number.isFinite(visit.lng);
  if (!line && !hasPoint) return null;
  const q = encodeURIComponent(line || `${visit.lat},${visit.lng}`);
  return {
    apple: `https://maps.apple.com/?daddr=${q}`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
  };
}
// tel: link of a phone number as typed by the office ('(718) 555-0142' -> 'tel:7185550142')
export function telLink(number) {
  if (typeof number !== 'string') return null;
  const digits = number.replace(/[^\d+]/g, '');
  return digits.replace(/\+/g, '').length >= 3 ? `tel:${digits}` : null;
}
