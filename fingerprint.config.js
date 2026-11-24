// What makes the native part of the app (expo-updates runtimeVersion, policy fingerprint). An
// update reaches only builds with the same fingerprint, so what the release script changes per
// build must stay out of it: the build number (testflight-ios.sh writes it into app.json) and the
// version; and the Expo project (owner, extra.eas, updates.url): the organisation's name comes
// later than the build and does not change the native code. The channel is not in app.json at all:
// the release script writes it into Expo.plist. Native changes — a module, a plugin, a permission,
// the SDK — still change the fingerprint.
const { SourceSkips } = require('expo/fingerprint');

/** @type {import('expo/fingerprint').Config} */
module.exports = {
  sourceSkips: SourceSkips.ExpoConfigVersions
    | SourceSkips.ExpoConfigEASProject
    | SourceSkips.PackageJsonAndroidAndIosScriptsIfNotContainRun,
};
