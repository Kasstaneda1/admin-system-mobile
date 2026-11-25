// «Since you were off» over My day (APP-1 part 2; look: design-mockups/notifications/shots
// app-bell-off, app-bell-off-open; rules — the Architect's «NT», QUEUE), without React Native
// (away.test.mjs runs it on node). No server call of its own: the app puts it together from the
// bell's unread items.
//   When: the app comes back after 16 hours or more since it was last open (a night off, a
//     weekend, days off), not deeper than 14 days.
//   What: the unread T1 (a new visit), T2 (moved), T4 (cancelled or the customer rescheduled) and
//     T5 (an office note) newer than the last opening; nothing of them — no panel.
//   One line of counts folded; a tap opens the list in place (each row opens its visit), «Got it»
//   puts it away until the next return. The bell's items stay unread (§7.2).
import { kindText, shortName } from '../myDay/model.js';
import { windowWords } from './model.js';

export const AWAY_MS = 16 * 60 * 60 * 1000;
export const AWAY_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const KINDS = ['T1', 'T2', 'T4', 'T5'];

// The moment the panel counts from: the last opening when it was 16 hours ago or more, else null
// (the first opening on this phone has nothing to compare with)
export function awaySince(lastOpenMs, nowMs) {
  if (!Number.isFinite(lastOpenMs) || lastOpenMs <= 0 || !Number.isFinite(nowMs)) return null;
  return nowMs - lastOpenMs >= AWAY_MS ? lastOpenMs : null;
}

const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// → null (nothing to say) or { line: '3 new visits · 1 moved · 2 office notes', rows: [{ key,
//   mark: 'new' | 'moved' | 'cancelled' | 'note', title, sub, visitId | null }] } in the bell's order
export function awayOf(items, { since, nowMs, today }) {
  if (!Number.isFinite(since) || !Array.isArray(items)) return null;
  const floor = Math.max(since, nowMs - AWAY_DAYS * DAY_MS);
  const fresh = items.filter((i) => i && KINDS.includes(i.kind) && !i.read_at && !i.removed
    && Date.parse(i.event_at) > floor);
  if (!fresh.length) return null;
  const count = { T1: 0, T2: 0, T4: 0, T5: 0 };
  const rows = fresh.map((i) => {
    count[i.kind] += 1;
    const data = i.data && typeof i.data === 'object' ? i.data : {};
    const who = str(data.customer, 60) ? shortName(str(data.customer, 60)) : 'A visit';
    const win = windowWords(data.start, data.end, today);
    const title = win ? `${who} · ${win}` : who;
    const visitId = i.target && i.target.type === 'visit' ? i.target.id : null;
    const kind = kindText({ visit_kind: data.visit_kind });
    if (i.kind === 'T1') return { key: i.id, mark: 'new', title, sub: `New visit · ${kind}`, visitId };
    if (i.kind === 'T2') {
      const was = windowWords(data.was_start, data.was_end, today);
      return { key: i.id, mark: 'moved', title, sub: was ? `Moved · was ${was}` : 'Moved', visitId };
    }
    if (i.kind === 'T4') {
      return { key: i.id, mark: 'cancelled', title, sub: data.reason === 'client_rescheduled' ? 'The customer rescheduled' : 'Cancelled by the office', visitId: null };
    }
    const text = str(data.text, 80);
    return { key: i.id, mark: 'note', title, sub: text ? `“${text}”` : 'A note from the office', visitId };
  });
  const parts = [
    count.T1 ? plural(count.T1, 'new visit', 'new visits') : null,
    count.T2 ? `${count.T2} moved` : null,
    count.T4 ? `${count.T4} cancelled` : null,
    count.T5 ? plural(count.T5, 'office note', 'office notes') : null,
  ].filter(Boolean);
  // the rows in the line's order — new, moved, cancelled, notes — the feed's order inside each (the Designer on #104)
  const ORDER = ['new', 'moved', 'cancelled', 'note'];
  const sorted = ORDER.flatMap((mark) => rows.filter((r) => r.mark === mark));
  return { line: parts.join(' · '), rows: sorted };
}

