import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  appVersionOf, deviceBody, isPushToken, permissionStep, projectIdOf, registerOutcome, responseKey, visitOfResponse,
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
  assert.match(config.expo.updates.url, new RegExp(`^https://u\\.expo\\.dev/${PROJECT}$`), 'updates come from the same project');
  assert.equal(config.expo.updates.requestHeaders, undefined, 'the channel is the build\'s (Expo.plist), not app.json\'s: it would change the fingerprint');
  assert.deepEqual(config.expo.runtimeVersion, { policy: 'fingerprint' });
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
});

test('deviceBody: token, platform, the project always, the version when known; nothing else', () => {
  assert.deepEqual(deviceBody({ token: TOKEN, platform: 'ios', config: CONFIG }),
    { token: TOKEN, platform: 'ios', expo_project: PROJECT, app_version: '1.0.0 (2)' });
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
