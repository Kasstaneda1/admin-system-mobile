// Push to the technician's phone, without React Native (model.test.mjs runs it on node).
// NOTIFICATIONS_DESIGN.md §6.3, the server's word (P2-BE, be#252):
//   POST /api/my/push-devices { token, platform, app_version?, expo_project } — after every sign in
//   and at every start of the app (one row per token; a phone a new person signed in on moves to
//   them); expo_project always, else the server writes NULL; other fields — 400; 403 (grace
//   period, blocked, not a technician) — quietly, no error on a screen.
//   DELETE /api/my/push-devices { token } in the body — on Sign out, before the session goes;
//   sign out whatever the answer.
//   A push carries in data only visit_id and its kind: the visit itself comes from the server.

// An Expo push token as getExpoPushTokenAsync gives it
const TOKEN = /^Expo(nent)?PushToken\[[^\]\s]+\]$/;
export const isPushToken = (token) => typeof token === 'string' && token.length <= 200 && TOKEN.test(token);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const expoOf = (config) => (config && config.expo) || config || {};

// The Expo project the token is made for (app.json extra.eas.projectId), the same one the
// server sends with; not a UUID — none (no push)
export function projectIdOf(config) {
  const expo = expoOf(config);
  const id = expo.extra && expo.extra.eas ? expo.extra.eas.projectId : null;
  return typeof id === 'string' && UUID.test(id) ? id : null;
}

// «1.0.0 (2)» for the server's app_version (letters, digits, space . + ( ) _ -, up to 40): the
// installed build's own numbers (native: { version, build }, utils/nativeVersion.js) — after an
// update without a build app.json is main's; app.json only on a build without that module
const VERSION_CHARS = /^[A-Za-z0-9 .+()_-]{1,40}$/;
export function appVersionOf(config, native = null) {
  const expo = expoOf(config);
  const fromNative = native && typeof native.version === 'string' && native.version.trim();
  const version = fromNative ? native.version.trim() : typeof expo.version === 'string' ? expo.version.trim() : '';
  if (!version) return null;
  const raw = fromNative ? native.build : expo.ios && expo.ios.buildNumber;
  const build = raw === undefined || raw === null ? '' : String(raw).trim();
  const line = build ? `${version} (${build})` : version;
  return VERSION_CHARS.test(line) ? line : null;
}

// The body of POST /api/my/push-devices; null when there is nothing the server would take
export function deviceBody({ token, platform, config, native = null }) {
  if (!isPushToken(token)) return null;
  if (platform !== 'ios' && platform !== 'android') return null;
  const project = projectIdOf(config);
  if (!project) return null;
  const body = { token, platform, expo_project: project };
  const version = appVersionOf(config, native);
  if (version) body.app_version = version;
  return body;
}

// What to do with the phone's permission (expo-notifications getPermissionsAsync):
//   'granted' — notifications allowed (iOS: authorized, provisional or ephemeral);
//   'ask' — never asked yet: the system asks once;
//   'off' — the technician said no (only Settings can change it): no token, nothing to say.
const IOS_ALLOWED = [2, 3, 4]; // IosAuthorizationStatus AUTHORIZED, PROVISIONAL, EPHEMERAL
export function permissionStep(permission) {
  if (!permission) return 'off';
  if (permission.granted === true) return 'granted';
  if (permission.ios && IOS_ALLOWED.includes(permission.ios.status)) return 'granted';
  if (permission.status === 'undetermined' && permission.canAskAgain !== false) return 'ask';
  return 'off';
}

// iOS asks for notifications only once, so the app asks first in its own words (the Designer,
// design-mockups/app-more README «Уведомления»): a sheet over My day once after the first sign in;
// «Turn on notifications» brings the system window, «Not now» closes it for good.
export const PUSH_PROMPT = {
  title: 'Know when a visit is added or moved',
  text: 'The office changes your day as calls come in. We’ll tell you right away, even when the app is closed.',
  yes: 'Turn on notifications',
  no: 'Not now',
};
export const promptDue = (state, shownBefore) => state === 'ask' && !shownBefore;

// The More card while notifications are not on: refused in the system window ('off') — only
// Settings can turn them on; not asked yet or «Not now» ('ask') — the system window. On, or a
// build without push — no card. action: 'settings' | 'ask'
export const PUSH_ROWS = {
  off: { title: 'Notifications are off', text: 'Turn them on in Settings to hear about new and moved visits.', button: 'Open Settings', action: 'settings' },
  ask: { title: 'Notifications are not on', text: 'Turn them on to hear about new and moved visits.', button: 'Turn on notifications', action: 'ask' },
};
export const pushRowOf = (state) => PUSH_ROWS[state] || null;

// The server's answer to POST: 'ok'; 'quiet' — not for this person now (403) or the session is
// gone (401): nothing to show; 'later' — no network or the server failed: the next start tries
// again; 'bad' — the body was refused (400): a mistake of the app, logged
export function registerOutcome(status) {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401 || status === 403) return 'quiet';
  if (!status || status === 429 || status >= 500) return 'later';
  return 'bad';
}

// The visit a tapped push opens: data.visit_id, a whole number above 0 (or its digits); only
// the tap on the push itself, not one of its buttons
const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';
export function visitOfResponse(response) {
  if (!response || (response.actionIdentifier && response.actionIdentifier !== DEFAULT_ACTION)) return null;
  const request = response.notification && response.notification.request;
  const data = request && request.content ? request.content.data : null;
  const raw = data ? data.visit_id : null;
  const id = typeof raw === 'string' && /^\d{1,12}$/.test(raw) ? Number(raw) : raw;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// The same tap answered once: the push's own id, so a tap seen both at start and by the
// listener opens the visit one time
export function responseKey(response) {
  const request = response && response.notification ? response.notification.request : null;
  return request && typeof request.identifier === 'string' ? request.identifier : null;
}
