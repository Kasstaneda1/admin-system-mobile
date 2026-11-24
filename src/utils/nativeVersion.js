// The version and build number of the installed app as iOS knows them (expo-application:
// CFBundleShortVersionString, CFBundleVersion). Not app.json: after an update without a build
// (expo-updates) the JS carries main's app.json, while the phone still runs the build it got.
// A build without the module (made before it was added) — null, and the callers use app.json.
import { requireOptionalNativeModule } from 'expo';

let known;
export function nativeVersion() {
  if (known === undefined) {
    known = null;
    try {
      if (requireOptionalNativeModule('ExpoApplication')) {
        const app = require('expo-application');
        if (typeof app.nativeApplicationVersion === 'string' && app.nativeApplicationVersion) {
          known = { version: app.nativeApplicationVersion, build: app.nativeBuildVersion || null };
        }
      }
    } catch (error) {
      known = null;
    }
  }
  return known;
}
