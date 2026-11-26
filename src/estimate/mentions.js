// «@» in an estimate's messages (TECH_APP_ESTIMATE_SCREEN_SPEC.md §4.1–4.2, NOTIFICATIONS_SPEC.md
// §4.2–4.3), without React Native (mentions.test.mjs). The same rules as the site
// (frontend js/mentions/mentionModel.js), so «@» works alike on the site and in the app.
//   The server decides who may be mentioned (GET /api/mentionable?target=estimate:<id>: admins,
//   managers, the technicians of this estimate) and keeps ids, not names. A message sends
//   mentions: [ids] — the people picked from the list whose «@Full Name» is still in the text;
//   «@name» typed by hand without the list stays plain text, nobody is notified.
//   queryAt — the «@…» being typed; matchPeople — who fits it; insertMention — «@Full Name »
//   in its place; mentionsIn — the ids to send; segments — a message cut into plain and
//   «@Name» pieces; notifiedLine — «Notified: Anna S., Mike T.»; pickerOf — what the list
//   over the field shows.

const str = (v) => (v === null || v === undefined ? '' : String(v));

// A letter or digit right after «@Name» means the name goes on («@Anna» inside «@Annabel»)
const WORD = /[\p{L}\p{N}_]/u;
const MAX_QUERY = 40;
export const MAX_MENTIONS = 20; // the server's limit

export const validUserId = (v) => /^[1-9]\d{0,9}$/.test(str(v));

// The «@…» being typed before the caret: the «@» at the start or after a space or an opening
// bracket, no line break and no more than 40 characters between it and the caret.
// { at, query } or null.
export function queryAt(text, caret) {
  const s = str(text);
  const end = Math.max(0, Math.min(Number.isInteger(caret) ? caret : s.length, s.length));
  const from = Math.max(0, end - MAX_QUERY - 1);
  for (let i = end - 1; i >= from; i--) {
    const ch = s[i];
    if (ch === '\n' || ch === '\r') return null;
    if (ch !== '@') continue;
    const before = i === 0 ? '' : s[i - 1];
    if (before && !/[\s([{"'«]/.test(before)) return null;
    const query = s.slice(i + 1, end);
    if (/^\s/.test(query) || /\s{2}/.test(query)) return null;
    return { at: i, query };
  }
  return null;
}

const fold = (v) => str(v).toLocaleLowerCase('en-US').normalize('NFKD').replace(/[̀-ͯ]/g, '');

// The people a list answer gives: [{ user_id, name, role }] with a good id and a name
export function peopleOf(answer) {
  const list = answer && Array.isArray(answer.people) ? answer.people : Array.isArray(answer) ? answer : [];
  return list
    .filter((p) => p && validUserId(p.user_id) && str(p.name).trim())
    .map((p) => ({ user_id: Number(p.user_id), name: str(p.name).trim(), role: str(p.role) || null }));
}

// Who fits the query, best first: the whole name starts with it, then a later word of the name
// does (search by first or last name); technicians of the estimate before the office inside
// each group, then by name. An empty query — everyone.
export function matchPeople(people, query) {
  const q = fold(query).trim();
  const rank = (p) => {
    if (!q) return 0;
    const name = fold(p.name).trim();
    if (name.startsWith(q)) return 0;
    const words = name.split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      if (words.slice(i).join(' ').startsWith(q)) return 1;
    }
    return -1;
  };
  return peopleOf(people)
    .map((p) => ({ p, r: rank(p) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r
      || (a.p.role === 'technician' ? 0 : 1) - (b.p.role === 'technician' ? 0 : 1)
      || a.p.name.localeCompare(b.p.name, 'en-US'))
    .map((x) => x.p);
}

// «@que|» → «@Full Name |»: the text and where the caret goes. A space after the name unless
// one is there already.
export function insertMention(text, at, caret, name) {
  const s = str(text);
  const tail = s.slice(caret);
  const glue = /^\s/.test(tail) ? '' : ' ';
  const put = `@${str(name)}${glue}`;
  return { text: s.slice(0, at) + put + tail, caret: at + put.length + (glue ? 0 : 1) };
}

function hasMention(text, name) {
  const s = str(text);
  const needle = `@${str(name)}`;
  if (needle.length < 2) return false;
  let i = s.indexOf(needle);
  while (i !== -1) {
    const after = s[i + needle.length];
    if (after === undefined || !WORD.test(after)) return true;
    i = s.indexOf(needle, i + 1);
  }
  return false;
}

// The people to send: picked from the list and their «@Name» still in the text, each once, at
// most 20. [{ user_id, name }]
export function mentionsIn(text, picked) {
  const out = [];
  for (const p of Array.isArray(picked) ? picked : []) {
    if (!p || !validUserId(p.user_id)) continue;
    const id = Number(p.user_id);
    if (out.some((m) => m.user_id === id)) continue;
    if (hasMention(text, p.name)) out.push({ user_id: id, name: str(p.name) });
  }
  return out.slice(0, MAX_MENTIONS);
}

// The message's text in pieces: { text } and { text, mention: { user_id, name }, me } — me: the
// reader's own name (drawn stronger). A longer name wins where two start alike.
export function segments(text, mentions, meId = null) {
  const s = str(text);
  const names = (Array.isArray(mentions) ? mentions : [])
    .filter((m) => m && str(m.name).trim())
    .sort((a, b) => str(b.name).length - str(a.name).length);
  const out = [];
  let plain = '';
  let i = 0;
  while (i < s.length) {
    let hit = null;
    if (s[i] === '@' && names.length) {
      for (const m of names) {
        const needle = `@${str(m.name)}`;
        const after = s[i + needle.length];
        if (s.startsWith(needle, i) && (after === undefined || !WORD.test(after))) { hit = { m, needle }; break; }
      }
    }
    if (hit) {
      if (plain) out.push({ text: plain });
      plain = '';
      const me = meId !== null && meId !== undefined && String(hit.m.user_id) === String(meId);
      out.push({ text: hit.needle, mention: { user_id: Number(hit.m.user_id), name: str(hit.m.name) }, me });
      i += hit.needle.length;
    } else {
      plain += s[i];
      i += 1;
    }
  }
  if (plain) out.push({ text: plain });
  return out;
}

// «Anna Smith» → «Anna S.»; one word stays as it is
export function shortName(name) {
  const words = str(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return words[0];
  return `${words[0]} ${Array.from(words[words.length - 1])[0].toLocaleUpperCase('en-US')}.`;
}

function namesLine(list, without = null) {
  const seen = new Set();
  const names = [];
  for (const m of Array.isArray(list) ? list : []) {
    if (!m || !validUserId(m.user_id)) continue;
    const id = Number(m.user_id);
    if (seen.has(id) || (without !== null && without !== undefined && String(id) === String(without))) continue;
    seen.add(id);
    const n = shortName(m.name);
    if (n) names.push(n);
  }
  return names.join(', ');
}

// «Notified: Anna S., Mike T.» under a sent message: its mentions but the author. '' — none.
export function notifiedLine(comment) {
  const c = comment || {};
  const names = namesLine(c.mentions, c.user_id);
  return names ? `Notified: ${names}` : '';
}

// «Not notified: Anna S. can’t open this estimate» — people the server would not take (they can
// no longer open the estimate); the message went without them. '' — none.
export function notNotifiedLine(people) {
  const names = namesLine(people);
  return names ? `Not notified: ${names} can’t open this estimate` : '';
}

// The second line of a person in the list
export function roleLine(person) {
  switch (person && person.role) {
    case 'technician': return 'Technician · on this estimate';
    case 'manager': return 'Manager';
    case 'admin': return 'Admin';
    default: return '';
  }
}

export const PEOPLE_LOADING = 'Loading people…';
export const PEOPLE_OFFLINE = 'No connection — type the name';
export const PEOPLE_FAILED = 'Could not load people. Type on, or try again.';
export const PEOPLE_NOBODY = 'Nobody by that name can open this estimate.';
const MAX_ROWS = 50;

// What the list over the field shows for the «@…» being typed:
//   null — no list (no «@», right after a picked name, a «@Ann Smth» nobody fits — writing on,
//   or the server has no list for this estimate);
//   { rows: [person] } — the people who fit;
//   { line } — one quiet line: loading, no connection, failed, nobody.
// people: the list (the server's or the one saved on the phone) or null; state: 'loading' |
// 'offline' | 'failed' | 'none' (404: no list) | 'ok'.
export function pickerOf({ query, picked = [], people = null, state = 'ok' }) {
  if (!query) return null;
  // Right after a picked name («@Ivan Petrov |») the person writes on, not picks again
  if ((picked || []).some((p) => p && query.query.startsWith(`${p.name} `))) return null;
  if (!people) {
    if (state === 'none') return null;
    if (state === 'offline') return { line: PEOPLE_OFFLINE };
    if (state === 'failed') return { line: PEOPLE_FAILED };
    return { line: PEOPLE_LOADING };
  }
  const fit = matchPeople(people, query.query);
  if (!fit.length) return /\s/.test(query.query) ? null : { line: PEOPLE_NOBODY };
  return { rows: fit.slice(0, MAX_ROWS) };
}

// A send the server refused for its mentions (400 mention_not_allowed): the ids it would not
// take, or null — another answer
export function refusedMentions(error) {
  const r = error && error.response;
  const data = r && r.data;
  if (!r || r.status !== 400 || !data || data.code !== 'mention_not_allowed') return null;
  return Array.isArray(data.user_ids) ? data.user_ids.map(Number).filter(Number.isFinite) : [];
}
