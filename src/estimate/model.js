// The Estimate screen of the technician app (TECH_APP_ESTIMATE_SCREEN_SPEC.md): one estimate of
// this technician — its number, status and path, what is installed, the parts, the office's
// note, what the customer pays — and the messages with the office under it. Without React
// Native (model.test.mjs); EstimateScreen.js draws it.
//   Data: GET /api/estimates/:id (the fields a technician may see, routes/estimates/access.js),
//   GET /api/estimates/:id/comments, POST …/comments { commentText, author_tz, mentions,
//   client_request_id }, POST …/mark-viewed, GET /api/mentionable (mentions.js). A technician
//   gets 404 for an estimate that is not theirs.
//   Not here yet (no data on the server): the visits of the estimate, the diagnosis, dates under
//   the path (estimate_events).
import { money } from '../salary/model.js';
import { notifiedLine, segments } from './mentions.js';
import { partsOf, partnerOf, shortDate } from '../parts/model.js';

// ---------- status ----------
// The path of an estimate (spec §3.4), with the site's words (its Estimates menu); Thinking,
// No Answer and Declined stand off it
export const PATH = ['diagnostics', 'sold', 'in_transit', 'arrived', 'on_board', 'scheduled', 'installed'];
const OFF_PATH = ['thinking', 'no_answer', 'declined'];
// [word, tag family (myDay/parts.js TAG_FAMILIES), icon]; the four stages as on Parts
const STATUS = {
  diagnostics: ['Diagnostics', 'diagnostics', 'search'],
  thinking: ['Thinking', 'neutral', 'clock'],
  no_answer: ['No Answer', 'neutral', 'phone'],
  declined: ['Declined', 'neutral', 'xcal'],
  sold: ['Sold', 'deposit', 'doc'],
  in_transit: ['In Transit', 'onway', 'truck'],
  arrived: ['Arrived', 'diagnostics', 'store'],
  on_board: ['On Board', 'done', 'toolbox'],
  scheduled: ['Scheduled', 'neutral', 'calok'],
  installed: ['Installed', 'neutral', 'checkc'],
};

export const statusWord = (status) => (STATUS[status] ? STATUS[status][0] : String(status || ''));
export function statusTag(status) {
  const s = STATUS[status];
  return s ? { kind: s[1], icon: s[2], text: s[0] } : { kind: 'neutral', icon: 'doc', text: String(status || '') };
}

// The path: one row of seven points, the ones before the status done, the status now; under
// it one line — seven words do not fit 390 (design est-main): the step before, the status, the
// step after, «step 3 of 7». Off the path (Thinking, No Answer, Declined, or a status the app
// does not know): { off: tag }, no points.
export function pathOf(status) {
  const at = PATH.indexOf(status);
  if (at < 0) return { off: statusTag(status), steps: [], line: null };
  return {
    off: null,
    steps: PATH.map((s, i) => ({ key: s, label: statusWord(s), state: i < at ? 'done' : i === at ? 'now' : 'todo' })),
    line: {
      before: at > 0 ? statusWord(PATH[at - 1]) : null,
      now: statusWord(status),
      after: at < PATH.length - 1 ? statusWord(PATH[at + 1]) : null,
      step: `step ${at + 1} of ${PATH.length}`,
    },
  };
}
export const isOffPath = (status) => OFF_PATH.includes(status) || PATH.indexOf(status) < 0;

// ---------- the estimate ----------
const clean = (value) => (value === null || value === undefined ? '' : String(value).trim());

// What is installed or repaired: «Washer» bold, «Samsung WF45R6100AW» under it (design
// est-main); the office writes it in one field, «Washer · Samsung …» or on two lines
export function whatOf(name) {
  const text = clean(name);
  if (!text) return null;
  const m = /^(.+?)(?:\s+·\s+|\s*\r?\n\s*)(.+)$/s.exec(text);
  return m ? { main: m[1].trim(), sub: m[2].replace(/\s*\r?\n\s*/g, ' ').trim() } : { main: text, sub: null };
}

// The top of the screen and its blocks (spec §3). total: null when the server gives none
// (the owner may hide it from technicians, question Т-1), so the block goes.
export function headOf(estimate, { me = null, thisYear } = {}) {
  const e = estimate || {};
  const parts = partsOf(e);
  const hasTotal = e.total !== null && e.total !== undefined && e.total !== '';
  return {
    id: e.id,
    number: clean(e.number) || 'Estimate',
    tag: statusTag(e.status),
    client: clean(e.client) || 'N/A',
    date: shortDate(e.date, thisYear),
    what: whatOf(e.name),
    parts,
    noPart: parts.length === 0,
    partner: partnerOf(e, me),
    note: clean(e.admin_notes) || null,
    total: hasTotal ? money(e.total) : null,
    path: pathOf(e.status),
    unread: e.has_unread_comments === true,
  };
}

// The estimate as the server answers it: an object with an id, or null
export function estimateOf(answer) {
  return answer && typeof answer === 'object' && !Array.isArray(answer) && answer.id !== undefined ? answer : null;
}

// Why the screen has no estimate: 404 — no longer this technician's (spec §2); no answer —
// offline; anything else — failed
export function estimateError(error) {
  const status = error && error.response ? error.response.status : 0;
  if (status === 404) return { kind: 'gone', title: 'This estimate is no longer assigned to you.', text: null };
  if (!status) return { kind: 'offline', title: 'No connection', text: 'The estimate comes from the office’s server. Try again when you are back online.' };
  return { kind: 'failed', title: 'Could not load the estimate', text: 'Something went wrong. Try again.' };
}

// Where the screen opens (spec §2): from the bell M1 — at the messages, on that comment;
// T7 — the top, the Arrived point marked; E1, a visit, Parts — the top
export function landingOf(params = {}) {
  const p = params || {};
  const commentId = p.commentId !== undefined && p.commentId !== null ? String(p.commentId) : null;
  return {
    messages: p.focus === 'messages' || commentId !== null,
    commentId,
    highlight: p.highlight === 'arrived' ? 'arrived' : null,
  };
}

// ---------- messages ----------
const ROLE = { admin: 'Admin', manager: 'Manager', technician: 'Technician' };
export const roleWord = (role) => ROLE[String(role || '').toLowerCase()] || null;

// The moment of a comment, ms; NaN when it has none. created_at_utc is ISO with Z; created_at
// without a zone is the UTC wall clock (db/index.js)
export function commentMs(c) {
  if (!c) return NaN;
  if (c.created_at_utc) {
    const ms = Date.parse(c.created_at_utc);
    if (!Number.isNaN(ms)) return ms;
  }
  const raw = clean(c.created_at);
  if (!raw) return NaN;
  return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`);
}

// The list of the screen: the server's comments by time (the oldest first, new at the bottom),
// then this phone's messages not yet on the server. mine: on the right. formatTime(c) gives
// the author's own time with their zone (utils/dateUtils formatAuthorTime), passed in so the
// tests need no Intl zones. parts: the text cut into plain and «@Name» pieces (mentions.js
// segments, me — the reader's own name); notified: «Notified: …» under my sent messages;
// notNotified (pending only): people the server would not take, mentions.js notNotifiedLine.
export function messagesOf(comments, { meId = null, pending = [], formatTime = () => '' } = {}) {
  const rows = (Array.isArray(comments) ? comments : [])
    .filter((c) => c && clean(c.comment_text))
    .map((c, i) => ({ c, i, ms: commentMs(c) }))
    .sort((a, b) => ((Number.isNaN(a.ms) ? 0 : a.ms) - (Number.isNaN(b.ms) ? 0 : b.ms)) || a.i - b.i)
    .map(({ c }) => ({
      key: `c${c.id}`,
      id: c.id !== undefined && c.id !== null ? String(c.id) : null,
      mine: meId !== null && c.user_id !== undefined && String(c.user_id) === String(meId),
      author: clean(c.user_name) || 'Unknown',
      role: roleWord(c.user_role),
      text: String(c.comment_text).trim(),
      parts: segments(String(c.comment_text).trim(), c.mentions, meId),
      notified: meId !== null && String(c.user_id) === String(meId) ? notifiedLine(c) : '',
      time: formatTime(c),
      state: 'sent',
    }));
  const waiting = (Array.isArray(pending) ? pending : []).map((p) => ({
    key: `p${p.key}`,
    id: null,
    pendingKey: p.key,
    mine: true,
    author: null,
    role: null,
    text: p.text,
    parts: segments(p.text, p.mentions, meId),
    notified: '',
    time: null,
    state: p.state === 'failed' ? 'failed' : 'sending',
  }));
  return [...rows, ...waiting];
}

export const EMPTY_MESSAGES = 'No messages yet. Ask the office anything about this estimate here.';
export const MESSAGE_HINT = 'Message the office…';
export const SENDING = 'Sending…';
export const NOT_SENT = 'Not sent · Tap to retry';

// Control characters the server would keep but nobody can read (a paste), tab and breaks stay
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
// The text as it is sent: cleaned and trimmed; '' — nothing to send (no limit, as on the site)
export function messageToSend(text) {
  return typeof text === 'string' ? text.replace(CONTROL, '').trim() : '';
}
export const messageReady = (text) => messageToSend(text).length > 0;

// The body of POST /api/estimates/:id/comments (the site sends the same): mentions — the ids of
// the people picked (mentions.js mentionsIn), client_request_id — the entry's key, so a repeat
// of a request that did reach the server is the same comment, not a second one (N3-BE)
export function commentBody(text, timeZone, { mentions = [], requestId = null } = {}) {
  const body = { commentText: messageToSend(text), author_tz: timeZone || null };
  const ids = (Array.isArray(mentions) ? mentions : []).map((m) => Number(m && m.user_id)).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length) body.mentions = [...new Set(ids)];
  if (requestId) body.client_request_id = String(requestId);
  return body;
}

// «1 new message ↓» while the technician reads above the bottom (spec §4.5)
export const newMessagesText = (n) => (n === 1 ? '1 new message ↓' : `${n} new messages ↓`);

// How many messages of others came after the ones the screen had (by key)
export function newSince(beforeKeys, messages) {
  const had = new Set(beforeKeys || []);
  return (messages || []).filter((m) => m.state === 'sent' && !m.mine && !had.has(m.key)).length;
}

// ---------- the phone's unsent messages (spec §4.3) ----------
// An entry: { key, estimateId, userId, text, mentions: [{ user_id, name }], at (ms the first try
// started), state: 'sending' | 'failed' }. The key goes as client_request_id, so the server
// answers a repeat with the comment it wrote the first time. The app's builds before that, and
// a server without it, still rely on this check: a try that may
// have reached it (no answer) is checked against the comments before it is sent again: a
// comment of mine with the same text, newer than every comment the screen had when the message
// was written (afterId: the highest id then), is that message — no second copy. A comment the
// screen already had is never taken for it: «Yes» and, half a minute later, «Yes» again stay two.
// Without afterId (the screen had no comments yet): made at or after the first try, a minute of
// clock difference allowed.
export const SKEW_MS = 60 * 1000;

// The highest comment id of a list (the server's ids are numbers); null — none
export function lastCommentId(comments) {
  const ids = (Array.isArray(comments) ? comments : []).map((c) => Number(c && c.id)).filter(Number.isFinite);
  return ids.length ? Math.max(...ids) : null;
}

export function newEntry({ key, estimateId, userId, text, at, afterId = null, mentions = [] }) {
  const after = afterId === null || afterId === undefined || !Number.isFinite(Number(afterId)) ? null : Number(afterId);
  const people = (Array.isArray(mentions) ? mentions : [])
    .filter((m) => m && Number.isInteger(Number(m.user_id)) && Number(m.user_id) > 0)
    .map((m) => ({ user_id: Number(m.user_id), name: String(m.name || '') }));
  return { key, estimateId: String(estimateId), userId: userId === null || userId === undefined ? null : String(userId), text: messageToSend(text), mentions: people, at, afterId: after, state: 'sending' };
}

// The entries of one estimate and one technician
export function entriesOf(outbox, estimateId, userId) {
  return (Array.isArray(outbox) ? outbox : []).filter((p) => p && p.estimateId === String(estimateId) && p.userId === (userId === null || userId === undefined ? null : String(userId)));
}

// The entries the server already has: each matched to its own comment (two same texts sent
// twice stay two). Answers { delivered: [keys], left: [entries] }.
export function settle(entries, comments, meId) {
  const mine = (Array.isArray(comments) ? comments : [])
    .filter((c) => c && meId !== null && meId !== undefined && String(c.user_id) === String(meId))
    .map((c) => ({ c, ms: commentMs(c), used: false }));
  const delivered = [];
  const left = [];
  [...(entries || [])].sort((a, b) => a.at - b.at).forEach((p) => {
    const newer = (m) => (Number.isFinite(p.afterId)
      ? Number(m.c.id) > p.afterId
      : !Number.isNaN(m.ms) && m.ms >= p.at - SKEW_MS);
    const hit = mine.find((m) => !m.used && String(m.c.comment_text || '').trim() === p.text && newer(m));
    if (hit) { hit.used = true; delivered.push(p.key); } else left.push(p);
  });
  return { delivered, left };
}

// Outbox changes (pure; outbox.js keeps the list)
export const withEntry = (outbox, entry) => [...(outbox || []).filter((p) => p.key !== entry.key), entry];
export const withoutKeys = (outbox, keys) => (outbox || []).filter((p) => !(keys || []).includes(p.key));
export const withState = (outbox, key, state) => (outbox || []).map((p) => (p.key === key ? { ...p, state } : p));

// A send that got no answer or a server error may be tried again; 400 (empty) and 404 (not
// this technician's any more) may not — the entry goes
export function sendFailure(error) {
  const status = error && error.response ? error.response.status : 0;
  if (status === 404) return 'gone';
  if (status === 400) return 'refused';
  return 'retry';
}

// ---------- unread ----------
// Estimates with messages the technician has not seen (has_unread_comments of the list): the
// count on the Parts tab
export function unreadCount(estimates) {
  return (Array.isArray(estimates) ? estimates : []).filter((e) => e && e.has_unread_comments === true).length;
}

// Polling while the screen is open (spec §4.5)
export const POLL_MS = 20 * 1000;

// «Read» (spec §4.4): the server marks every message read at once (mark-viewed), so the app
// asks only when the newest message of the others has been on the screen (officeSeen.js
// onScreen, the scroll at rest). The key of that message; null — nothing of others to read.
export function lastOtherKey(messages) {
  const others = (messages || []).filter((m) => m.state === 'sent' && !m.mine);
  return others.length ? others[others.length - 1].key : null;
}
