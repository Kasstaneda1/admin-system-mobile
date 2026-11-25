// Push on this phone (P2-APP; the rules are in model.js): the permission, the token to the
// server, the token off the server on Sign out, a push shown while the app is open, a tap that
// opens the visit.
//
// expo-notifications only when this build has its native module: the JS may run on a build made
// before it was added (a dev build with Metro), where the package throws on import. So it is
// never imported at the top of a file (as stripeSdk.js does for Stripe); no module — push is
// simply not there.
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import appConfig from '../../app.json';
import { pushAPI } from '../services/api';
import { logError } from '../utils/logError';
import { nativeVersion } from '../utils/nativeVersion';
import { deviceBody, permissionStep, projectIdOf, registerOutcome, responseKey, visitOfResponse, wakeRegisterDue } from './model';

let lib;
function notifications() {
  if (lib === undefined) {
    lib = null;
    try {
      if (requireOptionalNativeModule('ExpoPushTokenManager')) lib = require('expo-notifications');
    } catch (error) {
      lib = null;
    }
  }
  return lib;
}

const within = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);

// The token this run gave the server (or got from Expo): Sign out takes it off the server
let known = null;
let running = null;

async function tokenOf(N, ms) {
  const projectId = projectIdOf(appConfig);
  if (!projectId) return null;
  const answer = await within(N.getExpoPushTokenAsync({ projectId }), ms);
  return answer && typeof answer.data === 'string' ? answer.data : null;
}

async function register() {
  const N = notifications();
  if (!N) return 'none';
  // the system window is asked only by askPush (the sheet over My day, the card in More)
  const step = permissionStep(await N.getPermissionsAsync());
  if (step !== 'granted') return step;
  const token = await tokenOf(N, 15000);
  if (!token) return 'later';
  known = token;
  const body = deviceBody({ token, platform: Platform.OS, config: appConfig, native: nativeVersion() });
  if (!body) return 'none';
  let status = 0;
  try {
    status = (await pushAPI.register(body)).status;
  } catch (error) {
    status = error && error.response ? error.response.status : 0;
  }
  const outcome = registerOutcome(status);
  if (outcome === 'bad') logError('Push device refused:', `status ${status}`);
  return outcome;
}

// The last try of this run of the app: { outcome, at } (model wakeRegisterDue)
let last = null;

// After every sign in and at every start of the app while signed in; one at a time; never throws.
// fresh: the permission has just changed (the system window, Settings) — a try already running
// read the permission before that, so one more goes after it (it would answer 'ask' for good)
export function registerDevice({ fresh = false } = {}) {
  if (running) return fresh ? running.then(() => registerDevice()) : running;
  running = register().catch((error) => {
    // no network for Expo, a simulator without a token: the next return to the app tries again
    logError('Push registration failed:', error);
    return 'later';
  }).then((outcome) => {
    last = { outcome, at: Date.now() };
    return outcome;
  }).finally(() => { running = null; });
  return running;
}

// Every return of the app to the screen (App.js): the phone to the server again when the last
// try did not get there (PN-APP п. 2: the owner allowed push and got none until he restarted
// the app)
export function registerOnWake() {
  if (wakeRegisterDue(last, Date.now())) registerDevice();
}

// Sign out: the token off the server before the session goes, so this phone stops getting the
// technician's pushes. Bounded in time and quiet: signing out never waits on it or fails by it.
export async function forgetDevice() {
  const N = notifications();
  if (!N) return;
  try {
    const token = known || await tokenOf(N, 3000);
    known = null;
    last = null; // the next person signed in on this phone registers at every return until it is there
    if (!token) return;
    await within(pushAPI.forget(token).catch(() => null), 5000);
  } catch (error) {
    // nothing: the server drops a phone it has not seen for long
  }
}

// The system window (once in the phone's life), then this phone to the server; the state after it
export async function askPush() {
  const N = notifications();
  if (!N) return 'none';
  try {
    await N.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
  } catch (error) {
    logError('Push permission failed:', error);
  }
  // right after Allow: a token may be slow on the very first grant, so one more try a little
  // later while the technician is still in the app (and at every return to it after that)
  const outcome = await registerDevice({ fresh: true });
  if (outcome === 'later') setTimeout(() => registerDevice(), RETRY_AFTER_ALLOW_MS);
  return pushState();
}
const RETRY_AFTER_ALLOW_MS = 30000;

// The sheet before the system window shows once on this phone
const PROMPTED = 'push.prompted.v1';
export async function promptShown() {
  try { return (await AsyncStorage.getItem(PROMPTED)) === '1'; } catch (error) { return false; }
}
export async function markPromptShown() {
  try { await AsyncStorage.setItem(PROMPTED, '1'); } catch (error) { /* shows again next time */ }
}

// Push on this phone now: 'on', 'off' (said no: only Settings), 'ask' (not asked yet), 'none'
// (a build without push). Never throws.
export async function pushState() {
  const N = notifications();
  if (!N) return 'none';
  try {
    const step = permissionStep(await N.getPermissionsAsync());
    return step === 'granted' ? 'on' : step;
  } catch (error) {
    return 'none';
  }
}

// The app's page in iOS Settings (Notifications is on it)
export function openPushSettings() {
  Linking.openSettings().catch(() => {});
}

// A push that comes while the app is open is shown as a banner too
export function showWhileOpen() {
  const N = notifications();
  if (!N) return;
  N.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

// A tap on a push opens its visit: the tap that started the app and every tap after. Each push
// once. Returns the unsubscribe.
const handled = new Set();
export function listenTaps(open) {
  const N = notifications();
  if (!N) return () => {};
  const take = (response) => {
    const id = visitOfResponse(response);
    if (!id) return;
    const key = responseKey(response);
    if (key) {
      if (handled.has(key)) return;
      handled.add(key);
    }
    open(id);
  };
  try {
    const last = N.getLastNotificationResponse();
    if (last) {
      N.clearLastNotificationResponse();
      take(last);
    }
  } catch (error) {
    // no last tap
  }
  const sub = N.addNotificationResponseReceivedListener(take);
  return () => sub.remove();
}
