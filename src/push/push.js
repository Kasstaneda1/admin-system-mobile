// Push on this phone (P2-APP; the rules are in model.js): the permission, the token to the
// server, the token off the server on Sign out, a push shown while the app is open, a tap that
// opens the visit.
//
// expo-notifications only when this build has its native module: the JS may run on a build made
// before it was added (a dev build with Metro), where the package throws on import. So it is
// never imported at the top of a file (as stripeSdk.js does for Stripe); no module — push is
// simply not there.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import appConfig from '../../app.json';
import { pushAPI } from '../services/api';
import { logError } from '../utils/logError';
import { deviceBody, permissionStep, projectIdOf, registerOutcome, responseKey, visitOfResponse } from './model';

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
  let step = permissionStep(await N.getPermissionsAsync());
  if (step === 'ask') {
    step = permissionStep(await N.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } }));
  }
  if (step !== 'granted') return 'off';
  const token = await tokenOf(N, 15000);
  if (!token) return 'later';
  known = token;
  const body = deviceBody({ token, platform: Platform.OS, config: appConfig });
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

// After every sign in and at every start of the app while signed in; one at a time; never throws
export function registerDevice() {
  if (!running) {
    running = register().catch((error) => {
      // no network for Expo, a simulator without a token: the next start tries again
      logError('Push registration failed:', error);
      return 'later';
    }).finally(() => { running = null; });
  }
  return running;
}

// Sign out: the token off the server before the session goes, so this phone stops getting the
// technician's pushes. Bounded in time and quiet: signing out never waits on it or fails by it.
export async function forgetDevice() {
  const N = notifications();
  if (!N) return;
  try {
    const token = known || await tokenOf(N, 3000);
    known = null;
    if (!token) return;
    await within(pushAPI.forget(token).catch(() => null), 5000);
  } catch (error) {
    // nothing: the server drops a phone it has not seen for long
  }
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
