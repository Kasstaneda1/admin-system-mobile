import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PUSH_PROMPT, PUSH_ROWS, appVersionOf, deviceBody, isPushToken, permissionStep, projectIdOf, pushRowOf, registerOutcome, responseKey, visitOfResponse, promptDue,
  WAKE_AGAIN_MS, wakeRegisterDue,
  pushStatusRow, pushWhen, thisPhoneOn,
} from './model.js';

const PROJECT = 'fb311ee4-83cd-412b-9432-227f5210af87';
const CONFIG = { expo: { version: '1.0.0', ios: { buildNumber: '2' }, extra: { eas: { projectId: PROJECT } } } };
const TOKEN = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';

test('isPushToken: both Expo forms, nothing else', () => {
  assert.equal(isPushToken(TOKEN), true);
  assert.equal(isPushToken('ExpoPushToken[abc-123_X]'), true);
  assert.equal(isPushToken('ExponentPushToken[]'), false);
  assert.equal(isPushToken('ExponentPushToken[a b]'), false);
  assert.equal(isPushToken('a1b2c3d4e5'), false, 'a raw APNs token is not ours');
  assert.equal(isPushToken(`ExponentPushToken[${'x'.repeat(200)}]`), false);
  assert.equal(isPushToken(null), false);
});

test('projectIdOf: the UUID of extra.eas.projectId, else none', () => {
  assert.equal(projectIdOf(CONFIG), PROJECT);
  assert.equal(projectIdOf(CONFIG.expo), PROJECT);
  assert.equal(projectIdOf({ expo: { extra: { eas: { projectId: 'semix-technician' } } } }), null);
  assert.equal(projectIdOf({ expo: { extra: {} } }), null);
  assert.equal(projectIdOf(null), null);
});

test('the real app.json names the Expo project', () => {
  const config = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8'));
  assert.equal(projectIdOf(config), PROJECT);
  assert.equal(config.expo.owner, 'semix-pro', 'the Expo organisation of the project');
  assert.equal(config.expo.slug, 'semix-technician');
  // no updates without a build for now (the lead, 24.11): fixes come as builds through TestFlight,
  // so the app never asks Expo for an update
  assert.equal(config.expo.updates, undefined, 'no expo-updates settings');
  assert.equal(config.expo.runtimeVersion, undefined, 'no runtimeVersion');
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies['expo-updates'], undefined, 'expo-updates is not in the build');
  // aps-environment stays «development» in the entitlements (the plugin's default): the archive is
  // signed for development, the App Store export makes it «production» (testflight-ios.sh checks the .ipa)
  assert.ok(config.expo.plugins.includes('expo-notifications'));
});

test('appVersionOf: «1.0.0 (2)» in the server\'s letters, version alone, none', () => {
  assert.equal(appVersionOf(CONFIG), '1.0.0 (2)');
  assert.equal(appVersionOf({ expo: { version: '1.0.0', ios: { buildNumber: 0 } } }), '1.0.0 (0)');
  assert.equal(appVersionOf({ expo: { version: ' 1.0.0 ' } }), '1.0.0');
  assert.equal(appVersionOf({ expo: { version: '1.0.0', ios: { buildNumber: 'a/b' } } }), null, 'a letter the server refuses');
  assert.equal(appVersionOf({ expo: { version: '1'.repeat(41) } }), null, 'over 40');
  assert.equal(appVersionOf({ expo: { version: '1'.repeat(40) } }), '1'.repeat(40));
  assert.equal(appVersionOf({ expo: {} }), null);
  // the installed build's numbers win over app.json
  assert.equal(appVersionOf(CONFIG, { version: '1.0.0', build: '3' }), '1.0.0 (3)');
  assert.equal(appVersionOf(CONFIG, { version: '1.1.0', build: null }), '1.1.0');
  assert.equal(appVersionOf(CONFIG, { version: '', build: '9' }), '1.0.0 (2)', 'no native version — app.json');
  assert.equal(appVersionOf(CONFIG, null), '1.0.0 (2)');
});

test('deviceBody: token, platform, the project always, the version when known; nothing else', () => {
  assert.deepEqual(deviceBody({ token: TOKEN, platform: 'ios', config: CONFIG }),
    { token: TOKEN, platform: 'ios', expo_project: PROJECT, app_version: '1.0.0 (2)' });
  assert.deepEqual(deviceBody({ token: TOKEN, platform: 'ios', config: CONFIG, native: { version: '1.0.0', build: '5' } }),
    { token: TOKEN, platform: 'ios', expo_project: PROJECT, app_version: '1.0.0 (5)' });
  assert.deepEqual(deviceBody({ token: TOKEN, platform: 'android', config: { expo: { extra: { eas: { projectId: PROJECT } } } } }),
    { token: TOKEN, platform: 'android', expo_project: PROJECT });
  assert.equal(deviceBody({ token: TOKEN, platform: 'web', config: CONFIG }), null);
  assert.equal(deviceBody({ token: 'bad', platform: 'ios', config: CONFIG }), null);
  assert.equal(deviceBody({ token: TOKEN, platform: 'ios', config: { expo: { version: '1.0.0' } } }), null, 'no project — no push');
});

test('permissionStep: allowed, ask once, off', () => {
  assert.equal(permissionStep({ granted: true, status: 'granted' }), 'granted');
  assert.equal(permissionStep({ granted: false, status: 'granted', ios: { status: 3 } }), 'granted', 'provisional');
  assert.equal(permissionStep({ granted: false, status: 'undetermined', ios: { status: 4 } }), 'granted', 'ephemeral');
  assert.equal(permissionStep({ granted: false, status: 'undetermined', canAskAgain: true, ios: { status: 0 } }), 'ask');
  assert.equal(permissionStep({ granted: false, status: 'undetermined' }), 'ask');
  assert.equal(permissionStep({ granted: false, status: 'undetermined', canAskAgain: false }), 'off');
  assert.equal(permissionStep({ granted: false, status: 'denied', canAskAgain: false, ios: { status: 1 } }), 'off');
  assert.equal(permissionStep({ granted: false, status: 'denied', canAskAgain: true }), 'off', 'said no: only Settings');
  assert.equal(permissionStep(null), 'off');
});

test('registerOutcome: ok, quiet 401/403, later on no network and 5xx/429, bad on the rest', () => {
  assert.equal(registerOutcome(201), 'ok');
  assert.equal(registerOutcome(200), 'ok');
  assert.equal(registerOutcome(403), 'quiet');
  assert.equal(registerOutcome(401), 'quiet');
  assert.equal(registerOutcome(0), 'later');
  assert.equal(registerOutcome(undefined), 'later');
  assert.equal(registerOutcome(429), 'later');
  assert.equal(registerOutcome(500), 'later');
  assert.equal(registerOutcome(503), 'later');
  assert.equal(registerOutcome(400), 'bad');
  assert.equal(registerOutcome(404), 'bad');
});

const tap = (data, extra = {}) => ({
  actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
  notification: { request: { identifier: 'n-1', content: { data } } },
  ...extra,
});

test('visitOfResponse: the visit of a tapped push, only a real id', () => {
  assert.equal(visitOfResponse(tap({ visit_id: 42, kind: 'moved' })), 42);
  assert.equal(visitOfResponse(tap({ visit_id: '42' })), 42);
  assert.equal(visitOfResponse(tap({ visit_id: 0 })), null);
  assert.equal(visitOfResponse(tap({ visit_id: -3 })), null);
  assert.equal(visitOfResponse(tap({ visit_id: 4.5 })), null);
  assert.equal(visitOfResponse(tap({ visit_id: '42abc' })), null);
  assert.equal(visitOfResponse(tap({ visit_id: '1'.repeat(13) })), null);
  assert.equal(visitOfResponse(tap({ kind: 'digest' })), null, 'a push without a visit opens nothing');
  assert.equal(visitOfResponse(tap(null)), null);
  assert.equal(visitOfResponse(tap({ visit_id: 42 }, { actionIdentifier: 'snooze' })), null, 'a button of the push is not the tap');
  assert.equal(visitOfResponse({ notification: { request: { content: { data: { visit_id: 7 } } } } }), 7, 'no action given — the tap');
  assert.equal(visitOfResponse(null), null);
});

test('responseKey: the push\'s own id', () => {
  assert.equal(responseKey(tap({ visit_id: 1 })), 'n-1');
  assert.equal(responseKey({ notification: { request: {} } }), null);
  assert.equal(responseKey({ notification: { request: { identifier: 5 } } }), null);
  assert.equal(responseKey(null), null);
});

test('pushRowOf: the More card while notifications are not on — two kinds; none when on', () => {
  assert.deepEqual(pushRowOf('off'), { title: 'Notifications are off', text: 'Turn them on in Settings to hear about new and moved visits.', button: 'Open Settings', action: 'settings' });
  assert.deepEqual(pushRowOf('ask'), { title: 'Notifications are not on', text: 'Turn them on to hear about new and moved visits.', button: 'Turn on notifications', action: 'ask' });
  assert.equal(pushRowOf('off'), PUSH_ROWS.off);
  for (const state of ['on', 'none', 'later', null, undefined]) assert.equal(pushRowOf(state), null, String(state));
});

test('the sheet before the system window: once, only while never asked', () => {
  assert.equal(promptDue('ask', false), true);
  assert.equal(promptDue('ask', true), false, 'shown before (Not now) — never again by itself');
  for (const state of ['on', 'off', 'none', null]) assert.equal(promptDue(state, false), false, String(state));
  assert.deepEqual(PUSH_PROMPT, {
    title: 'Know when a visit is added or moved',
    text: 'The office changes your day as calls come in. We’ll tell you right away, even when the app is closed.',
    yes: 'Turn on notifications',
    no: 'Not now',
  });
});

test('wakeRegisterDue: a return to the app registers until it got there; then again after 6 hours', () => {
  const t = 1_800_000_000_000;
  // never tried in this run, or not there yet: every return
  assert.equal(wakeRegisterDue(null, t), true);
  for (const outcome of ['later', 'ask', 'off', 'none']) assert.equal(wakeRegisterDue({ outcome, at: t }, t + 1000), true, outcome);
  // there, or refused for good: not again before 6 hours
  for (const outcome of ['ok', 'quiet', 'bad']) {
    assert.equal(wakeRegisterDue({ outcome, at: t }, t + 1000), false, outcome);
    assert.equal(wakeRegisterDue({ outcome, at: t }, t + WAKE_AGAIN_MS - 1), false, outcome);
    assert.equal(wakeRegisterDue({ outcome, at: t }, t + WAKE_AGAIN_MS), true, outcome);
  }
  // a broken time: tries
  assert.equal(wakeRegisterDue({ outcome: 'ok', at: NaN }, t), true);
});

// PN-APP п. 1: «Notifications: on» in More by GET /api/my/push-devices/status (PN-BE)
const DEV = (id, o = {}) => ({ id, platform: 'ios', app_version: '1.0.0 (3)', last_seen_at: '2026-11-25T03:00:00Z', active: true, disabled_reason: null, ...o });
const STATUS = (o = {}) => ({ registered: true, devices: [DEV(7)], last_push: { at: '2026-11-25T03:24:00Z', kind: 'visit', status: 'ok', code: null }, waiting: null, sender_on: true, ...o });

test('pushWhen: New York wall clock, «Nov 24, 10:24 PM»; unknown — null', () => {
  assert.equal(pushWhen('2026-11-25T03:24:00Z'), 'Nov 24, 10:24 PM');
  assert.equal(pushWhen('2026-07-04T16:05:00Z'), 'Jul 4, 12:05 PM');
  assert.equal(pushWhen(null), null);
  assert.equal(pushWhen('soon'), null);
});

test('thisPhoneOn: the row of this run\'s POST, active; without it only a single phone on counts', () => {
  assert.equal(thisPhoneOn(STATUS(), 7), true);
  assert.equal(thisPhoneOn(STATUS(), 8), false, 'another phone of the same person');
  assert.equal(thisPhoneOn(STATUS({ devices: [DEV(7, { active: false, disabled_reason: 'DeviceNotRegistered' })] }), 7), false);
  assert.equal(thisPhoneOn(STATUS(), null), true, 'one phone on: it is this one');
  assert.equal(thisPhoneOn(STATUS({ devices: [DEV(7), DEV(9)] }), null), false, 'two phones and no id: not known which');
  assert.equal(thisPhoneOn(STATUS({ devices: [] }), null), false);
  assert.equal(thisPhoneOn(null, 7), false);
});

test('pushStatusRow: on, registered, last push; not registered — tap to retry; failed; the sender off; no answer', () => {
  // no row while notifications are not allowed (the card above says it) or there is no push in the build
  for (const state of [null, 'off', 'ask', 'none']) assert.equal(pushStatusRow({ state, status: STATUS(), deviceId: 7 }), null);
  assert.deepEqual(pushStatusRow({ state: 'on', status: STATUS(), deviceId: 7 }),
    { tone: 'ok', title: 'Notifications: on', text: 'This phone registered · last push Nov 24, 10:24 PM', retry: false });
  assert.equal(pushStatusRow({ state: 'on', status: STATUS({ last_push: null }), deviceId: 7 }).text, 'This phone registered · no push yet');
  // sent and not yet confirmed, or no receipt in a day: still the time of the last push
  for (const status of ['sending', 'sent', 'unknown']) {
    assert.equal(pushStatusRow({ state: 'on', status: STATUS({ last_push: { at: '2026-11-25T03:24:00Z', status } }), deviceId: 7 }).tone, 'ok');
  }
  assert.deepEqual(pushStatusRow({ state: 'on', status: STATUS({ registered: false, devices: [] }), deviceId: null }),
    { tone: 'warn', title: 'Notifications: not working', text: 'This phone is not registered — tap to retry', retry: true });
  assert.equal(pushStatusRow({ state: 'on', status: STATUS(), deviceId: 8 }).retry, true);
  for (const status of ['failed', 'no_device', 'inactive']) {
    assert.deepEqual(pushStatusRow({ state: 'on', status: STATUS({ last_push: { at: '2026-11-25T03:24:00Z', status, code: 'http_400' } }), deviceId: 7 }),
      { tone: 'warn', title: 'Notifications: not working', text: 'This phone registered · last push failed Nov 24, 10:24 PM', retry: false });
  }
  assert.deepEqual(pushStatusRow({ state: 'on', status: STATUS({ sender_on: false }), deviceId: 7 }),
    { tone: 'warn', title: 'Notifications: not working', text: 'The server is not sending notifications right now', retry: false });
  // no answer yet; no answer at all (no network, the server failed)
  assert.deepEqual(pushStatusRow({ state: 'on', status: null }), { tone: 'mute', title: 'Notifications: on', text: 'Checking this phone…', retry: false });
  assert.deepEqual(pushStatusRow({ state: 'on', status: null, failed: true }),
    { tone: 'warn', title: 'Notifications: not working', text: 'Couldn’t check this phone — tap to retry', retry: true });
  // no token in the words, ever
  assert.equal(JSON.stringify(pushStatusRow({ state: 'on', status: STATUS(), deviceId: 7 })).includes('Token'), false);
});
