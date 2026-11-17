// Parts of the technician app = Parts of the technician portal on the site (design-mockups/
// app-salary-parts parts-*; site js/technician-parts.js): the technician's estimates with parts in
// the four stages the portal shows — In Transit, Arrived, On Board, Scheduled — with the words of
// the site. Arrived comes first and amber: only that stage waits for the technician (at the
// office). Sold and Installed are a second step (they need a date of the status change from the
// server). Nothing here draws.
import { money } from '../salary/model.js';

export const STAGES = ['in_transit', 'arrived', 'on_board', 'scheduled'];
// [word, tag family, icon, group line]
const STAGE = {
  sold: ['Sold', 'deposit', 'doc', 'the office orders the parts'],
  in_transit: ['In Transit', 'onway', 'truck', 'on the way to the office'],
  arrived: ['Arrived', 'diagnostics', 'store', 'at the office'],
  on_board: ['On Board', 'done', 'toolbox', 'in your van'],
  scheduled: ['Scheduled', 'neutral', 'calok', 'install date set'],
  installed: ['Installed', 'neutral', 'checkc', 'installed'],
};
// Groups of the All list: Arrived first (design parts-all)
export const GROUP_ORDER = ['arrived', 'in_transit', 'on_board', 'scheduled'];

export const stageWord = (status) => (STAGE[status] ? STAGE[status][0] : String(status || ''));
export function stageTag(status) {
  const s = STAGE[status];
  return s ? { kind: s[1], icon: s[2], text: s[0] } : { kind: 'neutral', icon: 'box', text: String(status || '') };
}

// The query of the portal (site loadPartsData): this technician's estimates with parts in the
// four stages; the server keeps a technician to their own estimates anyway
export function partsQuery(fullName) {
  const q = { status_in: STAGES.join(','), has_parts: '1', limit: '1000' };
  if (fullName) q.technician = fullName;
  return q;
}

// The server answers { data: [...] } (or a plain array, as the site allows); keep the four
// stages and estimates that really have parts (site filter)
export function estimatesOf(answer) {
  const rows = Array.isArray(answer) ? answer : (answer && Array.isArray(answer.data) ? answer.data : []);
  return rows.filter((e) => e && STAGES.includes(e.status) && typeof e.name_parts === 'string' && e.name_parts.trim());
}

const lines = (text) => String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

// The parts of an estimate: one per line of name_parts, with the part number of the same line
// of part_number when there is one (a single number with a single part goes with it)
export function partsOf(estimate) {
  const names = lines(estimate.name_parts);
  const numbers = lines(estimate.part_number);
  return names.map((name, i) => ({ key: `${i}`, name, number: numbers[i] || null }));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// 'Nov 2' (with the year when it is not this year)
export function shortDate(value, thisYear) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return null;
  const text = `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
  return Number(m[1]) === thisYear ? text : `${text}, ${m[1]}`;
}

// The other technician of the estimate, from this technician's side
export function partnerOf(estimate, me) {
  const main = estimate.technician_name || null;
  const helper = estimate.technician2_name || null;
  if (me && helper && helper === me) return main;
  return helper && helper !== me ? helper : null;
}

// A card (design parts-all): the customer, «Nov 2 · E-1176 · Dryer · with Alex K.», the stage,
// the parts with their numbers, the office's note, Estimate total
export function cardOf(estimate, { me = null, thisYear } = {}) {
  const partner = partnerOf(estimate, me);
  const sub = [shortDate(estimate.date, thisYear), estimate.number || null, estimate.name ? String(estimate.name).trim() : null, partner ? `with ${partner}` : null]
    .filter(Boolean).join(' · ');
  const note = estimate.admin_notes && String(estimate.admin_notes).trim() ? String(estimate.admin_notes).trim() : null;
  return {
    key: String(estimate.id),
    id: estimate.id,
    client: estimate.client || 'N/A',
    sub,
    tag: stageTag(estimate.status),
    need: estimate.status === 'arrived',
    parts: partsOf(estimate),
    note,
    total: money(estimate.total),
    // messages from the office this technician has not read (TECH_APP_ESTIMATE_SCREEN_SPEC.md §5)
    unread: estimate.has_unread_comments === true,
  };
}

// The filter chips (design parts-all): All and the four stages with their counts; Arrived is
// marked while something waits there
export function chipsOf(estimates) {
  const count = (s) => estimates.filter((e) => e.status === s).length;
  return [
    { key: 'all', label: 'All', count: estimates.length, need: false },
    ...GROUP_ORDER.map((s) => ({ key: s, label: stageWord(s), count: count(s), need: s === 'arrived' && count(s) > 0 })),
  ];
}

// The list under a chip: All = groups in GROUP_ORDER with a title «Arrived · 1» and its line;
// one stage = that group only. Newest first inside a group, as the server sorts.
export function groupsOf(estimates, filter = 'all') {
  const stages = filter === 'all' ? GROUP_ORDER : [filter];
  return stages
    .map((s) => {
      const items = estimates.filter((e) => e.status === s);
      return { key: s, title: `${stageWord(s)} · ${items.length}`, line: STAGE[s][3], items };
    })
    .filter((g) => g.items.length);
}

export const EMPTY = { all: 'No parts right now', stage: 'No parts in this status' };
export const EMPTY_TEXT = 'Parts for your estimates show up here when the office orders them.';

export function partsError(error) {
  const status = error && error.response ? error.response.status : 0;
  if (!status) return { kind: 'offline', title: 'No connection', text: 'Parts come from the office’s server. Try again when you are back online.' };
  return { kind: 'failed', title: 'Could not load Parts', text: 'Something went wrong. Try again.' };
}
