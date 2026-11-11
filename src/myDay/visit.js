// The visit card, read only (TECH_APP_MY_DAY_SPEC.md §3 «Visit», design A3:
// design-mockups/tech-app/shots/final-visit-*.png): what VisitScreen shows, without React
// Native (visit.test.mjs runs it on node). The visit is GET /api/my/visits/:id
// ({ ...the list's fields, job_visits, notes, office_notes }) or, before it answers or
// without the network, the list's visit or the card kept on the phone.
// Not here (APP-3): the actions bar, Finish, No access, Undo, adding a note or a photo.
import {
  OUTCOMES, clock, clockAmPm, closedMoment, dayLabel, daysBetween, durationText, kindWord,
  momentWall, parseWall, planOf, stateOf, tagOf, visitDay, windowText,
} from './model.js';

export const MAX_CARDS_KEPT = 40;   // visit cards the phone keeps for offline
const OLD_CLOSED = { invoiced: 'Invoiced', awaiting_payment: 'Awaiting payment', paid: 'Paid' };

// ---------- words ----------
// A technician as the design writes them: 'Ivan Petrov' → 'Ivan P.'; one word as it is
export function techName(name) {
  const words = typeof name === 'string' ? name.trim().split(/\s+/).filter(Boolean) : [];
  if (!words.length) return '';
  if (words.length === 1) return words[0];
  const initial = [...words[words.length - 1]].find((ch) => ch.toLowerCase() !== ch.toUpperCase());
  return initial ? `${words[0]} ${initial.toUpperCase()}.` : words[0];
}

// 'Nov 6'
export const monthDay = (date) => dayLabel(date).replace(/^[A-Za-z]+, /, '');

// A day next to now: 'Today', 'Tomorrow', 'Yesterday', in the coming week 'Thu', else 'Nov 6'
// (a past weekday would read as the coming one)
export function dayWord(date, now) {
  if (!date) return '';
  const diff = daysBetween(now.date, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return dayLabel(date).slice(0, 3);
  return monthDay(date);
}

// The service call fee: 9500 → '$95', 12550 → '$125.50', 125000 → '$1,250'
export function money(cents) {
  if (!Number.isFinite(cents)) return null;
  const whole = Math.floor(Math.abs(cents) / 100);
  const rest = Math.abs(cents) % 100;
  const sign = cents < 0 ? '-' : '';
  const dollars = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${dollars}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

// 'Apt 3C'; a unit that already says what it is ('Unit 4', '#12', 'Suite 200') as it is
export function unitText(unit) {
  const text = typeof unit === 'string' ? unit.trim() : '';
  if (!text) return '';
  return /^(apt|apartment|unit|#|suite|ste|fl|floor|rm|room)\b/i.test(text) || text.startsWith('#') ? text : `Apt ${text}`;
}

// The address in two lines: '41-22 Bell Blvd, Apt 3C' / 'Bayside, NY 11361'. An old task
// has it in one line.
export function addressLines(visit) {
  const line1 = [visit.address_line, unitText(visit.address_unit)].filter(Boolean).join(', ');
  const stateZip = [visit.state, visit.zip].filter(Boolean).join(' ');
  const line2 = [visit.city, stateZip].filter(Boolean).join(', ');
  return { line1, line2 };
}

// ---------- the card ----------
// The tag over the name: as the list's, longer; a planned visit of one's own says where it
// is in the day ('Stop 5 · today'), a closed one when it closed ('Closed · Repaired 10:52')
export function cardTag(visit, { n = null, now }) {
  const state = stateOf(visit);
  const date = visitDay(visit);
  if (state === 'closed') {
    const tag = tagOf(visit, { long: true });
    const at = closedMoment(visit);
    const when = at ? ` ${at.date === date ? '' : `${monthDay(at.date)} `}${clock(at.minutes)}` : '';
    return { ...tag, text: tag.text === 'Closed' ? `Closed${when}` : `Closed · ${tag.text}${when}` };
  }
  const tag = tagOf(visit, { long: true });
  if (tag) return tag;
  const day = dayWord(date, now);
  const words = n ? `Stop ${n} · ${day.toLowerCase()}` : day;
  return { kind: 'neutral', icon: 'cal', text: words || 'Planned' };
}

// 'Repair · visit 2 of 2'; an old task: nothing (its tag says «Old task»)
export function kindLine(visit) {
  if (visit.legacy) return '';
  const kind = kindWord(visit);
  return visit.visit_number && visit.visit_count ? `${kind} · visit ${visit.visit_number} of ${visit.visit_count}` : kind;
}

// The three tiles under the buttons: window, plan (a closed visit: done), fee (an old task
// has no fee). struck: the visit was called off, its times no longer hold.
export function tilesOf(visit, now) {
  const state = stateOf(visit);
  const date = visitDay(visit);
  const plan = planOf(visit);
  const ws = parseWall(visit.scheduled_start);
  const we = parseWall(visit.scheduled_end);
  const struck = state === 'cancelled' || state === 'moved';
  const tiles = [{ key: 'window', label: 'Window', big: ws ? windowText(ws, we) : '—', small: date && date !== now.date ? dayWord(date, now) : '', struck }];
  if (state === 'closed') {
    const at = closedMoment(visit);
    tiles.push({ key: 'done', label: 'Done', big: at ? clock(at.minutes) : '—', small: plan ? `plan ${clock(plan.start.minutes)}` : '', struck: false });
  } else {
    tiles.push({ key: 'plan', label: 'Plan', big: plan ? clock(plan.start.minutes) : '—', small: plan ? durationText(plan.duration) : '', struck });
  }
  if (!visit.legacy) {
    if (visit.visit_kind === 'recall') tiles.push({ key: 'fee', label: 'Fee', big: 'No charge', small: 'recall', struck });
    else {
      const fee = money(visit.service_call_fee_quoted_cents);
      tiles.push({ key: 'fee', label: 'Fee', big: fee || '—', small: fee ? 'told' : 'not set', struck });
    }
  }
  return tiles;
}

// The appliances: [{ key, type: 'Washer', model: 'Samsung WF45R6100AW', serial: 'S/N …' }]
export function appliancesOf(visit) {
  return (Array.isArray(visit.appliances) ? visit.appliances : []).map((a, i) => ({
    key: `${i}`,
    type: (a && a.appliance_type) || 'Appliance',
    model: [a && a.brand, a && a.model].filter(Boolean).join(' '),
    serial: a && a.serial_number ? `S/N ${a.serial_number}` : '',
  }));
}

// Who else and for whom: [{ label, value }]
export function teamOf(visit) {
  const lines = [];
  if (visit.role === 'helper' && visit.main_technician_name) lines.push({ label: 'Main technician', value: visit.main_technician_name });
  if (visit.role !== 'helper' && visit.helper_name) lines.push({ label: 'Helper', value: visit.helper_name });
  if (visit.company_name) lines.push({ label: 'Company', value: visit.company_name });
  return lines;
}

// This job's visits, this one among them, by window: [{ key, title, text, mark }]
// title 'Nov 6 · Diagnostics · Ivan P.' (this visit: 'Today · Repair'); mark: 'past' (closed
// or earlier), 'this', 'later'. An old task has no job: [].
export function historyOf(visit, now) {
  if (visit.legacy || !Array.isArray(visit.job_visits)) return [];
  const thisDate = visitDay(visit);
  // a visit's description is often the job's problem copied: said once, under Problem
  const said = typeof visit.description === 'string' ? visit.description.trim() : '';
  const own = (text) => (typeof text === 'string' && text.trim() && text.trim() !== said ? text.trim() : '');
  // the windows are 'YYYY-MM-DD HH:MM:SS' wall clock strings: as text they sort by time
  const byWindow = (a, b) => String(a.v.scheduled_start || '').localeCompare(String(b.v.scheduled_start || '')) || a.v.id - b.v.id;
  const all = [...visit.job_visits.map((v) => ({ v, mine: false })), { v: visit, mine: true }]
    .sort(byWindow)
    .map((x) => ({ ...x, start: parseWall(x.v.scheduled_start) }));
  return all.map(({ v, mine, start }) => {
    const date = start ? start.date : null;
    const state = stateOf(v);
    if (mine) return { key: `v${v.id}`, title: [dayWord(date, now), kindWord(v)].filter(Boolean).join(' · '), text: 'This visit', mark: 'this' };
    let result;
    if (state === 'closed') result = (OUTCOMES[v.outcome] || [])[0] || OLD_CLOSED[v.status] || 'Closed';
    else if (state === 'moved') result = 'Rescheduled';
    const text = [result, own(v.description)].filter(Boolean).join(' · ') || 'Planned';
    const mark = state === 'closed' || (date && thisDate && date < thisDate) ? 'past' : 'later';
    return { key: `v${v.id}`, title: [dayWord(date, now), kindWord(v), techName(v.main_technician_name)].filter(Boolean).join(' · '), text, mark };
  });
}

// The technicians' notes as the server gives them (oldest first): [{ key, head: 'Ivan P. · Nov 6', text }]
// A note of today says its time instead: 'Ivan P. · 10:42 AM'.
export function notesOf(visit, now) {
  return (Array.isArray(visit.notes) ? visit.notes : []).map((note) => {
    const at = momentWall(note.created_at);
    const when = at ? (at.date === now.date ? clockAmPm(at.minutes) : monthDay(at.date)) : '';
    return { key: `n${note.id}`, head: [techName(note.author_name) || 'Technician', when].filter(Boolean).join(' · '), text: typeof note.text === 'string' ? note.text : '' };
  });
}

// Everything the card shows. visit: the card from the server, or the list's visit (no
// job_visits, notes: full false, the screen says those need the connection).
export function visitCard(visit, { n = null, now }) {
  const history = historyOf(visit, now);
  const notes = notesOf(visit, now);
  const noteText = typeof visit.office_notes === 'string' ? visit.office_notes.trim() : '';
  return {
    id: visit.id,
    full: Array.isArray(visit.job_visits) && Array.isArray(visit.notes),
    state: stateOf(visit),
    tag: cardTag(visit, { n, now }),
    kindLine: kindLine(visit),
    name: (typeof visit.client_name === 'string' && visit.client_name.trim()) || 'Customer',
    address: addressLines(visit),
    tiles: tilesOf(visit, now),
    access: typeof visit.access_notes === 'string' && visit.access_notes.trim() ? visit.access_notes.trim() : null,
    problem: typeof visit.description === 'string' && visit.description.trim() ? visit.description.trim() : null,
    appliances: appliancesOf(visit),
    team: teamOf(visit),
    officeNote: noteText || null,
    history,
    historyTitle: history.length ? `This job · ${history.length} visit${history.length === 1 ? '' : 's'}` : '',
    notes,
    notesTitle: `Notes · ${notes.length}`,
  };
}

// ---------- what the phone keeps ----------
// Cards opened, beside the weeks in the same cache (model.js keepWeek keeps them):
// { ...cache, cards: { [id]: { card, savedAt } } }, the latest MAX_CARDS_KEPT.
export function keepCard(cache, userId, card, savedAt) {
  const same = cache && cache.v === 1 && cache.userId === userId;
  const base = same ? cache : { v: 1, userId, weeks: {} };
  const cards = { ...(same && cache.cards ? cache.cards : {}), [card.id]: { card, savedAt } };
  const kept = Object.keys(cards).sort((a, b) => cards[b].savedAt - cards[a].savedAt).slice(0, MAX_CARDS_KEPT);
  return { ...base, cards: Object.fromEntries(kept.map((k) => [k, cards[k]])) };
}
export function keptCard(cache, userId, id) {
  if (!cache || cache.v !== 1 || cache.userId !== userId || !cache.cards) return null;
  return cache.cards[id] || null;
}
// A visit no longer the technician's (404): its card goes from the phone
export function dropCard(cache, userId, id) {
  if (!keptCard(cache, userId, id)) return cache;
  const cards = { ...cache.cards };
  delete cards[id];
  return { ...cache, cards };
}
