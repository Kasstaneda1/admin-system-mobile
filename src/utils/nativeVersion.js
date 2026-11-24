// The version and build number of the installed app as iOS knows them (expo-application:
// CFBundleShortVersionString, CFBundleVersion). Not app.json: the build number is set by the
// release script at build time, and the phone's build is what the office needs to see.
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
