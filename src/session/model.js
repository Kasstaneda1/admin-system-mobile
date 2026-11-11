// The technician's session without React Native: what a token and a server answer mean, when
// the app starts signed in, what it says when the session ends. session.js acts on these;
// model.test.mjs tests them on node (npm test).
//
// The server (backend routes/auth.js, middleware/auth.js): login gives an access token for 15
// minutes and a refresh token for 7 days; POST /api/auth/refresh swaps the refresh token for a
// new one (the old one is revoked) and gives a new access token; POST /api/auth/logout revokes it.

export const ACCESS_MARGIN_MS = 30 * 1000;            // refresh this long before the access token ends
export const REFRESH_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // the server's refresh token life
export const CHECK_GAP_MS = 5 * 60 * 1000;            // GET /api/me on return to the app, at most this often
// A refresh lost on the way (no answer or a timeout: status 0) is sent again with the same
// token after these pauses, no later than this after the first try (the server's repeat
// window is 60 seconds); no answer after that: 'later'. A 5xx or 429 is not repeated.
export const REFRESH_RETRY_DELAYS_MS = [2000, 10000];
export const REFRESH_RETRY_WINDOW_MS = 45 * 1000;

export const NOTICE = {
  blocked: 'Your account was turned off. Please contact the office.',
  expired: 'Your session has ended. Please sign in again.',
};

// The server's answers. Since backend #132 each refusal has a machine `code` next to its text.
// The code decides whenever there is one, even one the app does not know; the server's words
// are only the way to read an older server that has no codes. So the app works with both:
//   403 account_blocked — any request of a turned-off or deleted user (and /api/login);
//   /api/auth/refresh: 401 account_deactivated, refresh_invalid, refresh_expired;
//                      400 refresh_required; 429 refresh_rate_limited.
const CODE_OUTCOME = {
  account_blocked: 'blocked',
  account_deactivated: 'blocked',
  refresh_invalid: 'expired',
  refresh_expired: 'expired',
  refresh_required: 'expired',
  refresh_rate_limited: 'later',
};
// The words of a server without codes: 403 «Access to system blocked. Contact
// administrator.» on every request of a turned-off user, 401 «Account is deactivated» from refresh
const BLOCKED_WORDS = 'Access to system blocked';
const DEACTIVATED_WORDS = 'Account is deactivated';

const startsWith = (body, words) => typeof body?.error === 'string' && body.error.startsWith(words);
const codeOf = (body) => (typeof body?.code === 'string' && body.code ? body.code : null);

// base64url → text, byte by byte (Hermes in React Native has no atob). Letters beyond ASCII
// come out as single bytes, which is enough to read the token's numbers.
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function base64urlText(part) {
  let value = 0;
  let bits = 0;
  let text = '';
  for (const char of part) {
    if (char === '=') break;
    const index = BASE64URL.indexOf(char === '+' ? '-' : char === '/' ? '_' : char);
    if (index < 0) throw new Error('not base64url');
    value = ((value << 6) | index) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      text += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  return text;
}

// The JWT's own times in ms: { exp, iat } (iat null when absent); null if it is not readable
function accessTimes(token) {
  if (typeof token !== 'string') return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const { exp, iat } = JSON.parse(base64urlText(part));
    if (!Number.isFinite(exp)) return null;
    return { exp: exp * 1000, iat: Number.isFinite(iat) ? iat * 1000 : null };
  } catch {
    return null;
  }
}

// When the access token ends (ms), from its own `exp`; null if it is not a readable JWT
export function accessExpiresAt(token) {
  const times = accessTimes(token);
  return times ? times.exp : null;
}

// The access token can still go out: it lives at least ACCESS_MARGIN_MS longer — or a quarter
// of its whole life if that is shorter, so a short token is not refreshed on every request
export function accessUsable(token, now) {
  const times = accessTimes(token);
  if (!times) return false;
  const life = times.iat !== null && times.exp > times.iat ? times.exp - times.iat : null;
  const margin = life === null ? ACCESS_MARGIN_MS : Math.min(ACCESS_MARGIN_MS, life / 4);
  return times.exp - margin > now;
}

// What an answer to an ordinary request means for the session:
//  'refresh' — the access token was refused (401): refresh once and send the request again;
//  'blocked' — the user was turned off (403 account_blocked; without a code, the server's
//              words): the session ends now;
//  'pass'    — anything else: the screen gets the answer as it is.
export function answerKind(status, body) {
  if (status === 401) return 'refresh';
  if (status === 403) {
    const code = codeOf(body);
    if (code) return code === 'account_blocked' ? 'blocked' : 'pass';
    if (startsWith(body, BLOCKED_WORDS)) return 'blocked';
  }
  return 'pass';
}

// What the answer of POST /api/auth/refresh means:
//  'ok'      — new tokens;
//  'blocked' — the user was turned off: the session ends;
//  'expired' — the refresh token is unknown, revoked or old: the session ends;
//  'later'   — no network, a server failure, too many refreshes: keep the session, try again later.
// The code decides when there is one (an unknown code on a 401 or 403: 'expired'); without a
// code, the status and the server's words.
export function refreshOutcome(status, body) {
  if (status >= 200 && status < 300) {
    return typeof body?.accessToken === 'string' && typeof body?.refreshToken === 'string' ? 'ok' : 'later';
  }
  const code = codeOf(body);
  if (code) {
    if (CODE_OUTCOME[code]) return CODE_OUTCOME[code];
    return status === 401 || status === 403 || status === 400 ? 'expired' : 'later';
  }
  if (status === 401 || status === 403) {
    return startsWith(body, DEACTIVATED_WORDS) || startsWith(body, BLOCKED_WORDS) ? 'blocked' : 'expired';
  }
  if (status === 400) return 'expired';
  return 'later';
}

// How the app starts from what the phone keeps. Signed in without the network when there is a
// refresh token, the profile, and the refresh token is younger than the server's 7 days.
// `wipe`: what is kept is of no use (a token without a profile: the iOS keychain outlives a
// deleted app; a profile without a token: the app before APP-1) and is cleared.
export function startState({ refresh, savedAt, user, now }) {
  if (!refresh || !user) return { signedIn: false, notice: null, wipe: !!(refresh || user) };
  if (!Number.isFinite(savedAt) || now - savedAt >= REFRESH_LIFE_MS) {
    return { signedIn: false, notice: NOTICE.expired, wipe: true };
  }
  return { signedIn: true, notice: null, wipe: false };
}

// GET /api/me again on return to the app?
export function checkDue(lastCheckAt, now) {
  return !Number.isFinite(lastCheckAt) || now - lastCheckAt >= CHECK_GAP_MS;
}

// The kept profile (the shape /api/login gives, which the screens read) with what GET /api/me says
export function profileFromMe(me, kept) {
  return {
    ...kept,
    id: me.id,
    username: me.username,
    role: me.role,
    fullName: me.full_name,
    isSuperAdmin: !!me.is_super_admin,
  };
}

// Requests the session leaves alone: sign in, refresh, sign out
export function isAuthPath(url) {
  return typeof url === 'string' && /^(https?:\/\/[^/]+)?\/?api\/(login([/?#]|$)|auth\/)/.test(url);
}
