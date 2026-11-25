// The technician's bell (APP-1; look: design-mockups/notifications/shots/app-bell-*.png, README
// «APP-1»), without React Native (model.test.mjs runs it on node). The server keeps the items
// (N2-BE, routes/notifications.js; the technician's are /api/my/notifications):
//   GET  …?filter=all|unread&before=<cursor>&limit=30 → { items, next_cursor | null, unread_count, version }
//   POST …/read { ids } | { all: true } | { target: { type, id } } → { updated, version, unread_count }
//   POST …/:id/unread → { item, version, unread_count }
// An item: { id, kind, target: { type, id }, anchor_id, data, actor_ids, actor_count, event_at,
// read_at, removed, version }. data is only text the app puts together in English (no phone, no
// address); every word goes out through <Text>, never as markup.
//
// The kinds a technician gets (NOTIFICATIONS_DESIGN.md §7.3; the Architect's «NT», QUEUE):
//   M1 — mentioned in an estimate's messages: { estimate_number, author, text };
//   E1 — put on an estimate: { estimate_number } (author, customer when the server adds them);
//   T7 — a part of their estimate arrived: { estimate_number } (author, customer, part, part_number — NT п. 10);
//   T1–T6 — their visit (NT-BE, not on the server yet): { visit_kind, customer, start, end } and
//     T2 was_start / was_end, T3 reason reassigned | helper_removed, T4 reason cancelled |
//     client_rescheduled, T5 text / author, T6 fields ⊂ address, problem, access;
//   anything else — one plain line that still opens its target.
import { clockAmPm, daysBetween, kindText, momentWall, parseWall, shortName, windowText } from '../myDay/model.js';
import { monthDay } from '../myDay/visit.js';

export const FEED_LIMIT = 30;
export const BELL_FILTERS = ['all', 'unread'];
export const EMPTY_WORDS = {
  title: 'You’re all caught up.',
  text: 'New and moved visits, notes from the office and estimate messages for you show up here.',
};

const str = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The day of a visit's window from today (NY): 'today', 'tomorrow', 'yesterday', 'Thu' within a
// week, else 'Dec 3'
export function dayWord(date, today) {
  if (!date) return '';
  const d = today ? daysBetween(today, date) : null;
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  if (d !== null && Math.abs(d) <= 6) return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  return monthDay(date);
}
// A visit's window: 'today 3–6 PM', 'Thu 9–12 PM'; '' when unknown
export function windowWords(start, end, today) {
  const s = parseWall(start);
  const e = parseWall(end);
  if (!s) return '';
  const day = dayWord(s.date, today);
  if (!e) return `${day} ${clockAmPm(s.minutes)}`;
  const tail = clockAmPm(e.minutes).split(' ')[1];
  return `${day} ${windowText(s, e)} ${tail}`;
}

// 'Anna S.' → 'AS'; a single word → its first letter; none → null
export function initialsOf(name) {
  const words = (str(name) || '').split(/\s+/).map((w) => w.replace(/[^A-Za-z0-9]/g, '')).filter(Boolean);
  if (!words.length) return null;
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

// T7's part: 'drain pump DC97-17025' (name_parts up to 80, part_number up to 40; the Architect, NT п. 10)
const partOf = (data) => [str(data.part, 80), str(data.part_number, 40)].filter(Boolean).join(' ') || null;
const FIELD_WORDS = { address: 'the address', problem: 'the problem', access: 'the access notes' };
const joinAnd = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

// One item as its row shows it:
// { id, unread, avatar: { initials } | { icon, tone: 'sys' | 'part' }, line: [{ text, bold? }],
//   quote | null, sub, open: { screen: 'Visit' | 'Estimate' | 'MyDay', id?, date?, focus?, commentId?,
//   highlight? } | null } — the Estimate screen's own params (estimate/model.js landingOf)
export function itemView(item, { today = null } = {}) {
  const data = item && item.data && typeof item.data === 'object' ? item.data : {};
  const target = item && item.target ? item.target : {};
  const at = momentWall(item && item.event_at);
  const time = at ? clockAmPm(at.minutes) : '';
  const author = str(data.author, 80);
  const customer = str(data.customer, 60) ? shortName(str(data.customer, 60)) : null;
  const estimate = data.estimate_number !== undefined && data.estimate_number !== null ? `Estimate #${data.estimate_number}` : 'an estimate';
  const win = windowWords(data.start, data.end, today);
  const whoAvatar = author ? { initials: initialsOf(author) } : { icon: 'cal', tone: 'sys' };
  const office = author || 'The office';
  const subOf = (...parts) => parts.filter(Boolean).join(' · ');
  const visitOpen = target.type === 'visit' && target.id ? { screen: 'Visit', id: target.id } : null;
  const estimateOpen = target.type === 'estimate' && target.id ? { screen: 'Estimate', id: target.id } : null;
  const base = { id: item.id, unread: !item.read_at, quote: null };
  switch (item.kind) {
    case 'M1':
      return { ...base, avatar: whoAvatar.initials ? whoAvatar : { icon: 'doc', tone: 'sys' },
        line: [{ text: author || 'Someone', bold: true }, { text: ' mentioned you in ' }, { text: estimate, bold: true }, { text: str(data.text) ? ':' : '' }],
        quote: str(data.text, 80), sub: subOf(customer, time), open: estimateOpen ? { ...estimateOpen, focus: 'messages', commentId: item.anchor_id || null } : null };
    case 'E1':
      return { ...base, avatar: author ? whoAvatar : { icon: 'doc', tone: 'sys' },
        line: author ? [{ text: author, bold: true }, { text: ' assigned you ' }, { text: estimate, bold: true }]
          : [{ text: 'You were assigned ' }, { text: estimate, bold: true }],
        sub: subOf(customer, time), open: estimateOpen };
    case 'T7':
      return { ...base, avatar: { icon: 'box', tone: 'part' },
        line: [{ text: 'Part arrived', bold: true }, { text: ` for ${estimate}${partOf(data) ? `: ${partOf(data)}` : ''}` }],
        sub: subOf(customer, time), open: estimateOpen ? { ...estimateOpen, highlight: 'arrived' } : null };
    case 'T1':
      return { ...base, avatar: whoAvatar,
        line: [{ text: office, bold: !!author }, { text: ' added a visit for you: ' }, { text: customer || 'a customer', bold: true }, { text: win ? ` · ${win}` : '' }],
        sub: subOf(kindText({ visit_kind: data.visit_kind }), time), open: visitOpen };
    case 'T2': {
      const was = windowWords(data.was_start, data.was_end, today);
      return { ...base, avatar: whoAvatar,
        line: [{ text: office, bold: !!author }, { text: ' moved ' }, { text: customer || 'your visit', bold: true }, { text: win ? ` to ${win}` : '' }],
        sub: subOf(was ? `Was ${was}` : null, time), open: visitOpen };
    }
    case 'T3':
      return { ...base, avatar: { icon: 'xcal', tone: 'sys' },
        line: data.reason === 'helper_removed'
          ? [{ text: 'You are off ' }, { text: customer || 'a visit', bold: true }, { text: win ? ` · ${win}` : '' }, { text: ': no helper needed' }]
          : [{ text: customer || 'Your visit', bold: true }, { text: win ? ` · ${win}` : '' }, { text: ' went to another technician' }],
        sub: time, open: { screen: 'MyDay', date: (parseWall(data.start) || {}).date || null } };
    case 'T4':
      return { ...base, avatar: { icon: 'xcal', tone: 'sys' },
        line: data.reason === 'client_rescheduled'
          ? [{ text: customer || 'The customer', bold: true }, { text: ' rescheduled' }, { text: win ? ` · was ${win}` : '' }]
          : [{ text: office, bold: !!author }, { text: ' cancelled ' }, { text: customer || 'your visit', bold: true }, { text: win ? ` · ${win}` : '' }],
        sub: time, open: { screen: 'MyDay', date: (parseWall(data.start) || {}).date || null } };
    case 'T5':
      return { ...base, avatar: whoAvatar,
        line: [{ text: office, bold: !!author }, { text: ' left a note on ' }, { text: customer || 'your visit', bold: true }, { text: str(data.text) ? ':' : '' }],
        quote: str(data.text, 80), sub: subOf(win ? `Visit ${win}` : null, time), open: visitOpen };
    case 'T6': {
      const fields = (Array.isArray(data.fields) ? data.fields : []).map((f) => FIELD_WORDS[f]).filter(Boolean);
      return { ...base, avatar: whoAvatar,
        line: [{ text: office, bold: !!author }, { text: ` changed ${fields.length ? joinAnd(fields) : 'the visit'} of ` }, { text: customer || 'your visit', bold: true }],
        sub: subOf(win ? `Visit ${win}` : null, time), open: visitOpen };
    }
    default:
      return { ...base, avatar: { icon: 'info', tone: 'sys' },
        line: [{ text: target.type === 'visit' ? 'Your visit changed' : target.type === 'estimate' ? `${estimate} changed` : 'Something changed for you' }],
        sub: time, open: visitOpen || estimateOpen };
  }
}
// The whole line for VoiceOver and the «⋯» sheet
export const lineText = (view) => `${view.line.map((p) => p.text).join('')}${view.quote ? ` “${view.quote}”` : ''}`;

// The feed, one item per id (a glued item may rise between pages, the newer copy wins), removed
// ones out, newest first by (event_at, id) as the server orders it
export function mergeItems(had, got) {
  const byId = new Map();
  for (const item of [...(Array.isArray(had) ? had : []), ...(Array.isArray(got) ? got : [])]) {
    if (!item || !Number.isSafeInteger(item.id)) continue;
    const old = byId.get(item.id);
    if (!old || !(Number(old.version) > Number(item.version))) byId.set(item.id, item);
  }
  return [...byId.values()].filter((i) => !i.removed)
    .sort((a, b) => (Date.parse(b.event_at) - Date.parse(a.event_at)) || (b.id - a.id));
}

// The items in days: [{ title: 'Today' | 'Yesterday' | 'Mon, Nov 23', items }], in order
export function daysOf(items, today) {
  const out = [];
  for (const item of items) {
    const at = momentWall(item.event_at);
    const date = at ? at.date : null;
    const d = date && today ? daysBetween(date, today) : null;
    const title = d === 0 ? 'Today' : d === 1 ? 'Yesterday' : date ? monthDayLong(date) : 'Earlier';
    const last = out[out.length - 1];
    if (last && last.title === title) last.items.push(item);
    else out.push({ title, items: [item] });
  }
  return out;
}
function monthDayLong(date) {
  return `${WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]}, ${monthDay(date)}`;
}

// The same item marked read or unread on the phone at once (the server's answer follows)
export const markedRead = (items, ids, at) => items.map((i) => (ids.includes(i.id) ? { ...i, read_at: i.read_at || at } : i));
export const markedUnread = (items, id) => items.map((i) => (i.id === id ? { ...i, read_at: null } : i));
export const markedAllRead = (items, at) => items.map((i) => ({ ...i, read_at: i.read_at || at }));

// The unread count from an answer of the server, or null when it did not say
export function unreadOf(answer) {
  const n = answer && answer.unread_count;
  return Number.isInteger(n) && n >= 0 ? n : null;
}
// The tab's words: 'Notifications, 4 unread'
export const bellTabLabel = (n) => (n > 0 ? `Notifications, ${n} unread` : 'Notifications');

