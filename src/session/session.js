// The technician's session at work, without React Native (session.test.mjs runs it on node):
// the tokens in memory and in the phone's store, one refresh shared by every request that needs
// it, one repeat of a refused request, and the end of the session.
//
// createSession({ store, http, now, sleep })
//   store — where the phone keeps it (store.js: SecureStore for the tokens, AsyncStorage for
//           the profile the screens read):
//           read() → { access, refresh, savedAt, user }; writeTokens({ access, refresh, savedAt });
//           writeUser(user); clear()
//   http  — the two calls outside the API client, answered as { status, data }, never thrown
//           (no network: status 0): refresh(refreshToken), logout(refreshToken)
//   now   — the clock (ms); sleep(ms) — a pause (both stand-ins in the tests)
// attach(axiosInstance) puts the session into the API client (api.js).
//
// A refresh whose answer is lost on the way (no answer or a timeout: status 0) is sent again
// with the same old token inside the same shared refresh, after about 2 s and 10 s, never
// later than 45 s after the first send; still no answer: 'later', the session stays. A server
// with the repeat window (backend #134) gives the same new pair again; one without it says
// refresh_invalid, and the session ends as it would anyway. A 5xx or 429 is not repeated.
//
// A request the end of the session cuts off (or one made while signed out) never answers: the
// screen that asked is gone already, and an answer would only show its error alert on top of
// the sign-in screen, which says why in its own words.
import {
  accessUsable, answerKind, refreshOutcome, startState, isAuthPath,
  REFRESH_RETRY_DELAYS_MS, REFRESH_RETRY_WINDOW_MS,
} from './model.js';

const silence = () => new Promise(() => {});

const EMPTY = { access: null, refresh: null, savedAt: null };

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createSession({ store, http, now = () => Date.now(), sleep = pause }) {
  let tokens = EMPTY;
  let user = null;
  let ended = true;
  let generation = 0;        // a sign in, sign out or end makes an answer of an older refresh stale
  let inFlight = null;       // the one refresh every request waits for
  const endListeners = new Set();

  async function load() {
    const kept = await store.read();
    const start = startState({ ...kept, now: now() });
    if (start.wipe) await store.clear();
    if (!start.signedIn) {
      tokens = EMPTY;
      user = null;
      ended = true;
      return { signedIn: false, notice: start.notice, user: null };
    }
    tokens = { access: kept.access, refresh: kept.refresh, savedAt: kept.savedAt };
    user = kept.user;
    ended = false;
    return { signedIn: true, notice: null, user };
  }

  async function signIn({ accessToken, refreshToken, user: profile }) {
    generation += 1;
    inFlight = null;
    tokens = { access: accessToken, refresh: refreshToken, savedAt: now() };
    user = profile;
    ended = false;
    await store.writeTokens(tokens);
    await store.writeUser(profile);
  }

  async function updateUser(profile) {
    if (ended) return;
    user = profile;
    await store.writeUser(profile);
  }

  // The session ends by the server's word: everything kept goes, the app shows sign in
  async function end(reason) {
    if (ended) return;
    ended = true;
    generation += 1;
    inFlight = null;
    tokens = EMPTY;
    user = null;
    await store.clear().catch(() => {});
    for (const listener of endListeners) listener(reason);
  }

  // Sign out: kept tokens go at once, then the server revokes the refresh token if it can be
  // reached (no network: it simply runs out in 7 days)
  async function signOut() {
    const refresh = tokens.refresh;
    ended = true;
    generation += 1;
    inFlight = null;
    tokens = EMPTY;
    user = null;
    await store.clear().catch(() => {});
    if (refresh) await http.logout(refresh);
  }

  async function doRefresh() {
    const started = generation;
    const sent = tokens.refresh;
    if (ended || !sent) return { outcome: 'ended', reason: null };
    const first = now();
    let answer = await http.refresh(sent);
    for (const delay of REFRESH_RETRY_DELAYS_MS) {
      if (answer.status !== 0 || started !== generation) break;
      if (now() + delay - first > REFRESH_RETRY_WINDOW_MS) break;
      await sleep(delay);
      if (started !== generation) break;
      answer = await http.refresh(sent); // the same old token: the lost answer may come again
    }
    if (started !== generation) {
      // Signed out or in again meanwhile: this answer is of no use; its new token is revoked
      if (answer.status === 200 && typeof answer.data?.refreshToken === 'string') http.logout(answer.data.refreshToken);
      return !ended && tokens.access ? { outcome: 'ok', access: tokens.access } : { outcome: 'ended', reason: null };
    }
    const outcome = refreshOutcome(answer.status, answer.data);
    if (outcome === 'ok') {
      tokens = { access: answer.data.accessToken, refresh: answer.data.refreshToken, savedAt: now() };
      await store.writeTokens(tokens);
      return { outcome: 'ok', access: tokens.access };
    }
    if (outcome === 'later') return { outcome: 'later' };
    await end(outcome);
    return { outcome: 'ended', reason: outcome };
  }

  // One refresh at a time: whoever asks while it runs waits for the same answer
  function refreshOnce() {
    if (!inFlight) {
      const run = doRefresh();
      inFlight = run;
      run.then(() => { if (inFlight === run) inFlight = null; }, () => { if (inFlight === run) inFlight = null; });
    }
    return inFlight;
  }

  function attach(api) {
    api.interceptors.request.use(async (config) => {
      if (isAuthPath(config.url)) return config;
      if (ended) return silence();
      let access = tokens.access;
      if (!accessUsable(access, now())) {
        const result = await refreshOnce();
        if (result.outcome === 'ok') access = result.access;
        else if (result.outcome === 'later') config._refreshTried = true; // sent as it is: the screen shows its failure
        else return silence();
      }
      if (access) config.headers.Authorization = `Bearer ${access}`;
      config._sentWith = access;
      return config;
    });

    api.interceptors.response.use(undefined, async (error) => {
      const config = error?.config;
      if (!config || isAuthPath(config.url)) throw error;
      const kind = answerKind(error.response?.status, error.response?.data);
      if (kind === 'blocked') {
        await end('blocked');
        return silence();
      }
      if (kind !== 'refresh' || config._retried) throw error;
      if (ended) return silence();
      config._retried = true;
      // Another request may have refreshed already: then just send this one again
      const refreshedMeanwhile = tokens.access && tokens.access !== config._sentWith && accessUsable(tokens.access, now());
      if (!refreshedMeanwhile) {
        if (config._refreshTried) throw error;
        const result = await refreshOnce();
        if (result.outcome === 'later') throw error;
        if (result.outcome !== 'ok') return silence();
      }
      return api.request(config);
    });
  }

  return {
    load,
    signIn,
    signOut,
    updateUser,
    attach,
    onEnd(listener) { endListeners.add(listener); return () => endListeners.delete(listener); },
    get user() { return user; },
    get signedIn() { return !ended; },
  };
}
