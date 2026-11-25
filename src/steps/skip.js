// «Skip» on a visit (VS-APP; look: design-mockups/app-skip, README «Для Фулстека», shots k1–k8),
// without React Native (skip.test.mjs runs it on node). The server (VS-BE3, routes/scheduler/my.js):
//   POST /api/my/visits/:id/steps/:key/skip { reason (1–300 characters, one line), client_request_id }
//     → 201 { success, changed: true, visit }; the same id again → 200 changed: false;
//     409 step_not_skippable { step, mode } (finish, off, required — except collect: its skip is
//     «Customer didn't pay · why»); 403 — a helper.
//   visit.steps[].skipped = { at, reason } — the last skip of the step.
// The quiet link stands only under the orange button and only when its step may be skipped:
// omw (On my way, Optional), signs, collect (Optional or Required), give (Optional). Approve,
// diagnosis and issue have none (README). A skip is not an action: the bill does not become
// final; a skipped button still opens its action, and done wins over skipped.
import { clock, momentWall } from '../myDay/model.js';

export const REASON_MAX = 300;
const OTHER = 'Other…';

// key: the step of the server; the words of the link, the sheet and the skipped button
export const SKIPS = {
  omw: {
    link: 'Skip On my way',
    title: 'Why no “On my way”?',
    sub: 'Tap a reason — it is saved at once. The office sees it on the visit.',
    reasons: ['I’m already at the address', 'The customer asked for no text', 'No signal on the road'],
    skipped: 'On my way skipped',
    hint: 'On my way',
    opens: null,
  },
  signs: {
    link: 'Skip the signature',
    title: 'Why no signature?',
    sub: 'Tap a reason — it is saved at once. The office sees it on the visit. You can still get the signature later.',
    reasons: ['The customer isn’t here', 'The customer doesn’t want to sign', 'Signed on a paper copy'],
    skipped: 'Signature skipped',
    hint: 'the signature',
    opens: 'Opens the signature.',
  },
  collect: {
    link: 'Customer didn’t pay',
    title: 'Why no payment?',
    sub: 'Tap a reason — it is saved at once. The office sees the bill as unpaid. You can still take the payment later.',
    reasons: ['Pays the office later', 'Pays online by the link', 'The customer isn’t here', 'Refused to pay'],
    skipped: 'Not paid',
    hint: 'the payment',
    opens: 'Opens the payment.',
  },
  give: {
    link: 'Skip sending the bill',
    title: 'Why no copy?',
    sub: 'Tap a reason — it is saved at once. The office sees it on the visit. You can still send the bill later.',
    reasons: ['The customer doesn’t want one', 'The office sends it', 'The customer isn’t here'],
    skipped: 'Bill not sent',
    hint: 'sending the bill',
    opens: 'Opens sending.',
  },
};
export const OTHER_REASON = OTHER;

const stepsOf = (visit) => (visit && Array.isArray(visit.steps) ? visit.steps : null);
export function stepOf(visit, key) {
  const steps = stepsOf(visit);
  return steps ? steps.find((s) => s && s.key === key) || null : null;
}
// The step's last skip { at, reason } or null
export function skippedOf(visit, key) {
  const s = stepOf(visit, key);
  const k = s && s.skipped && typeof s.skipped === 'object' ? s.skipped : null;
  return k && typeof k.reason === 'string' && k.reason.trim() ? { at: k.at || null, reason: k.reason.trim() } : null;
}
// The link may stand for this step on this visit: the main technician, the company's mode allows it
export function canSkip(visit, key) {
  if (!visit || visit.role === 'helper' || !SKIPS[key]) return false;
  const s = stepOf(visit, key);
  if (!s) return false;
  if (key === 'collect') return s.mode === 'optional' || s.mode === 'required';
  return s.mode === 'optional';
}
// The grey line of a skipped step: 'The customer isn’t here · 10:31' (no time when unknown)
export function skippedLine(skipped) {
  if (!skipped) return null;
  const at = momentWall(skipped.at);
  return at ? `${skipped.reason} · ${clock(at.minutes)}` : skipped.reason;
}
// VoiceOver of a skipped button: 'Signature skipped: the customer isn’t here, at 10:31. Opens the signature.'
export function skippedLabel(key, skipped) {
  const words = SKIPS[key];
  if (!words || !skipped) return null;
  const at = momentWall(skipped.at);
  const reason = skipped.reason.charAt(0).toLowerCase() + skipped.reason.slice(1);
  return `${words.skipped}: ${reason}${at ? `, at ${clock(at.minutes)}` : ''}.${words.opens ? ` ${words.opens}` : ''}`;
}

// What is sent: the reason as one line, cut to the server's limit; null when there is nothing
export function skipReason(text) {
  const one = String(text || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return one ? one.slice(0, REASON_MAX) : null;
}
// One client_request_id for an open sheet and a chosen reason (the Architect on #102): the same
// reason pressed again after a lost answer goes with the same id, and the server answers 200
// «nothing new» instead of a second skip. ids: the sheet's own map (new each time it opens);
// make() — a new id (actions.js newRequestId)
export function requestIdFor(ids, reason, make) {
  const key = skipReason(reason);
  if (!key) return null;
  if (!ids[key]) ids[key] = make();
  return ids[key];
}
export function skipBody(text, requestId) {
  const reason = skipReason(text);
  return reason ? { reason, client_request_id: requestId } : null;
}

// The answer to a failed skip: { kind: 'offline' | 'refused' | 'gone', text, close }
//   offline — no answer: the sheet stays, «No signal: not saved. …»;
//   refused — the server's words: «Not saved: …»; close — the step cannot be skipped any more
//     (the company made it Required meanwhile): the sheet goes, the visit is read again;
//   gone — 404: the visit is not this technician's any more.
export function skipError(error) {
  const status = error && error.response ? error.response.status : 0;
  const data = error && error.response ? error.response.data || {} : {};
  if (!status) return { kind: 'offline', text: 'No signal: not saved. Try again when you have signal.', close: false };
  if (status === 404) return { kind: 'gone', text: 'This visit is not yours any more.', close: true };
  const said = typeof data.error === 'string' && data.error.trim() ? data.error.trim().replace(/[.\s]*$/, '') : 'the server refused it';
  return { kind: 'refused', text: `Not saved: ${said}.`, close: data.code === 'step_not_skippable' };
}
