// What a technician presses on a visit (TECH_APP_MY_DAY_SPEC.md §2 POST /api/my/visits/:id/actions,
// §4; design A3: final-visit-onway, final-finish, final-noaccess), without React Native
// (actions.test.mjs). The server decides what may be pressed (visit.actions) and until when
// an undo holds (visit.undo_until); the app only draws it and says it in words.
//   main technician: omw, finish (an outcome), no_access, undo_omw, undo_finish;
//   helper: omw and undo_omw (their own «On my way», the visit's status does not change).
// No queue without the network: a button waits for the answer; with none, «No connection.
// Try again» sends the same request again (the same client_request_id, written once).
import { clock, closedMoment, firstName, kindText, momentWall, shortName, stateOf } from './model.js';
import { keepCard } from './visit.js';

export const UNDO_MINUTES = 15;

// client_request_id: 8 to 64 letters, digits, - or _ (the server's format), new for each press
export function newRequestId(nowMs = Date.now(), random = Math.random) {
  let tail = '';
  while (tail.length < 12) tail += Math.floor(random() * 36 ** 4).toString(36).padStart(4, '0');
  return `app-${Math.max(0, Math.floor(nowMs)).toString(36)}-${tail.slice(0, 12)}`;
}

// ---------- Finish ----------
const CHOICES = {
  done: { title: 'Repaired', hint: 'The problem is fixed', icon: 'checkc', kind: 'done' },
  diagnostics_only: { title: 'Diagnostics only', hint: 'Found the cause, no repair today', icon: 'search', kind: 'diagnostics' },
  deposit: { title: 'Deposit taken', hint: 'Parts on order, deposit received', icon: 'money', kind: 'deposit' },
  installation: { title: 'Installation done', hint: 'New unit is in and working', icon: 'install', kind: 'installation' },
  recall: { title: 'Recall checked', hint: 'The earlier work was checked', icon: 'replay', kind: 'recall' },
};
// «How did it end?»: the outcomes the server allows for this kind of visit, in its order, the
// first one marked (backend #145: visit.finish_outcomes; the owner's table is in the server's
// visitActions.js, not here). An outcome the app has no words for is left out. A visit without
// the list (kept on the phone before the server had it) offers every outcome, the kind's own
// marked, and the server checks the press: a refused outcome comes back with the list
// (actionError kind 'outcome') and the sheet opens again with it.
const ALL_OUTCOMES = ['done', 'diagnostics_only', 'deposit', 'installation', 'recall'];
const KIND_OUTCOME = { repair: 'done', diagnostics: 'diagnostics_only', installation: 'installation', recall: 'recall' };
function allowedOutcomes(list) {
  return (Array.isArray(list) ? list : []).filter((o, i, all) => Object.prototype.hasOwnProperty.call(CHOICES, o) && all.indexOf(o) === i);
}
export function finishChoices(visit) {
  const allowed = allowedOutcomes(visit.finish_outcomes);
  return (allowed.length ? allowed : ALL_OUTCOMES).map((outcome) => ({ outcome, ...CHOICES[outcome] }));
}
// The choice marked when the sheet opens: the server's first, else what the visit was booked for
export function defaultOutcome(visit) {
  const allowed = allowedOutcomes(visit.finish_outcomes);
  return allowed.length ? allowed[0] : KIND_OUTCOME[visit.visit_kind] || 'done';
}
// The words of a refused outcome: 'This visit can be finished as: Repaired, Deposit taken or Diagnostics only.'
export function outcomesText(list) {
  const titles = allowedOutcomes(list).map((o) => CHOICES[o].title);
  if (!titles.length) return 'The office changed this visit. Pull down to refresh.';
  const words = titles.length === 1 ? titles[0] : `${titles.slice(0, -1).join(', ')} or ${titles[titles.length - 1]}`;
  return `This visit can be finished as: ${words}.`;
}
// 'Stop 3 · Patel S. · Repair 2/2'
export function finishSubtitle(visit, n = null) {
  return [n ? `Stop ${n}` : null, shortName(visit.client_name), kindText(visit)].filter(Boolean).join(' · ');
}

// ---------- No access ----------
// Step 1 «Call the customer first?», step 2 «Close as no access?»
export function noAccessWords(visit) {
  const name = (typeof visit.client_name === 'string' && visit.client_name.trim()) || 'the customer';
  const first = firstName(visit.client_name) || 'the customer';
  return {
    call: {
      step: 'No access · step 1 of 2',
      title: 'Call the customer first?',
      text: [name, visit.phone].filter(Boolean).join(' · ') + '. Next step: close the visit as no access.',
      button: `Call ${first}`,
      skip: 'Skip the call',
    },
    close: {
      step: 'No access · step 2 of 2',
      title: 'Close as no access?',
      text: `${name} · the visit closes without work. The office sees it at once.`,
      button: 'Close as no access',
    },
  };
}

// ---------- the bar at the bottom of the visit ----------
// How a closed visit ended, in a few words
function closedWord(visit) {
  if (visit.outcome === 'no_access') return 'Closed as no access';
  if (visit.outcome === 'client_rescheduled') return 'Customer rescheduled';
  return 'Finished';
}

// What the bar shows, from the server's actions and undo_until (nowMs: this moment by the
// server's clock):
// { primary: { action, label, icon } | null, noAccess, undo: { action, text, left } | null,
//   closed: { text, note } | null, line, empty }
//   primary — the big amber button: On my way, else Finish;
//   noAccess — the «No access» link under it;
//   undo — «On my way at 11:08 · 3 min to undo» while the server's undo_until holds;
//   closed — the green box of a closed visit once its undo is over: «Finished at 10:52 · undo
//            closed after 15 min» (a helper did not close it: no note);
//   line — a quiet line: why an old or cancelled visit has no buttons, and for a helper who
//          closes the visit.
export function barOf(visit, nowMs) {
  const actions = Array.isArray(visit.actions) ? visit.actions : [];
  const state = stateOf(visit);
  let primary = null;
  if (actions.includes('omw')) primary = { action: 'omw', label: 'On my way', icon: 'car' };
  else if (actions.includes('finish')) primary = { action: 'finish', label: 'Finish', icon: 'check' };
  const noAccess = actions.includes('no_access');

  let undo = null;
  const undoAction = actions.find((a) => a === 'undo_omw' || a === 'undo_finish') || null;
  const until = Date.parse(visit.undo_until);
  if (undoAction && Number.isFinite(until) && until > nowMs) {
    const at = momentWall(until - UNDO_MINUTES * 60 * 1000);
    const what = undoAction === 'undo_omw' ? 'On my way' : closedWord(visit);
    const left = Math.max(1, Math.ceil((until - nowMs) / 60000));
    undo = { action: undoAction, text: at ? `${what} at ${clock(at.minutes)}` : what, left: `${left} min to undo` };
  }

  let line = null;
  let closed = null;
  if (visit.legacy) line = 'Old task: change it in the old technician portal';
  else if (state === 'cancelled') line = 'The office cancelled this visit';
  else if (state === 'closed') {
    if (!undo) {
      const at = closedMoment(visit);
      closed = {
        text: at ? `${closedWord(visit)} at ${clock(at.minutes)}` : closedWord(visit),
        note: visit.role === 'helper' ? null : `undo closed after ${UNDO_MINUTES} min`,
      };
    }
  } else if (visit.role === 'helper') {
    line = `${firstName(visit.main_technician_name) || 'The main technician'} finishes the visit`;
  }
  return { primary, noAccess, undo, closed, line, empty: !primary && !noAccess && !undo && !closed && !line };
}

// What a press asks the server: { action, outcome } (outcome only with finish)
export function actionBody(action, outcome, requestId) {
  return action === 'finish' ? { action, outcome, client_request_id: requestId } : { action, client_request_id: requestId };
}

// A failed press, as the screen handles it: { kind, text, visit, retry }
//   offline — no answer: «No connection. Try again.», the same request again;
//   gone — 404, not the technician's visit any more: back to the day;
//   outcome — 400 outcome_not_allowed (backend #145): the outcome is not one for this kind of
//             visit (the office changed it meanwhile); the app's words, the fresh visit and the
//             outcomes it allows (outcomes), the sheet opens again with them;
//   refused — 409/403 (the server's words and the fresh visit) or 400 (its words);
//   failed — the server broke (5xx and the rest): try again later, the same request.
export function actionError(error) {
  const response = error && error.response;
  const status = response ? response.status : 0;
  const data = (response && response.data) || {};
  if (!status) return { kind: 'offline', text: 'No connection. Try again.', visit: null, retry: true };
  if (status === 404) return { kind: 'gone', text: 'This visit was changed by the office', visit: null, retry: false };
  if (status === 400 && data.code === 'outcome_not_allowed') {
    const outcomes = allowedOutcomes(data.finish_outcomes);
    return { kind: 'outcome', text: outcomesText(outcomes), visit: data.visit || null, outcomes, retry: false };
  }
  if (status === 409 || status === 403 || status === 400) {
    return { kind: 'refused', text: typeof data.error === 'string' && data.error ? data.error : 'The visit could not be changed', visit: data.visit || null, retry: false };
  }
  return { kind: 'failed', text: 'Something went wrong. Try again.', visit: null, retry: true };
}

// After an answer: the card kept for offline, and the visit in the kept weeks, so the day
// shows it right before its own refresh
const CARD_ONLY = ['job_visits', 'notes', 'office_notes', 'office_messages'];
export function keepActed(cache, userId, visit, savedAt) {
  const kept = keepCard(cache, userId, visit, savedAt);
  if (!kept.weeks) return kept;
  const listVisit = Object.fromEntries(Object.entries(visit).filter(([k]) => !CARD_ONLY.includes(k)));
  const weeks = {};
  for (const [sunday, week] of Object.entries(kept.weeks)) {
    const visits = Array.isArray(week.visits) ? week.visits : [];
    weeks[sunday] = { ...week, visits: visits.map((v) => (v && v.id === visit.id && !v.office_change ? listVisit : v)) };
  }
  return { ...kept, weeks };
}
