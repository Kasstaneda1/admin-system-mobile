// Which server a build may talk to: EXPO_PUBLIC_API_URL, checked against the EAS build
// profile (EAS_BUILD_PROFILE, set by EAS while it builds). app.config.js runs this on every
// Expo command, so the rule is a check, not an agreement in eas.json:
//   - always: a URL, http or https, just the server (no path, no slash at the end), and plain
//     http only for this Mac or the local network;
//   - development: a local stand only;
//   - preview, production: https to a server that is not local.
// Outside EAS (no profile) only the first rule applies: `npx expo start` on this Mac.
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[a-z0-9-]+\.local)$/i;
const LIVE_PROFILES = ['preview', 'production'];

function checkApiUrl(value, profile) {
  if (!value) {
    throw new Error('EXPO_PUBLIC_API_URL is not set. Name the server, e.g. EXPO_PUBLIC_API_URL=http://127.0.0.1:8291 for a local stand (eas.json sets it for each build profile).');
  }
  let url;
  try { url = new URL(value); } catch {
    throw new Error(`EXPO_PUBLIC_API_URL is not a URL: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`EXPO_PUBLIC_API_URL must be http or https: ${value}`);
  }
  if (url.origin !== value) {
    throw new Error(`EXPO_PUBLIC_API_URL must be just the server, without a path or a slash at the end: ${url.origin}`);
  }
  const local = LOCAL_HOST.test(url.hostname);
  if (url.protocol === 'http:' && !local) {
    throw new Error(`EXPO_PUBLIC_API_URL: plain http is only for a local stand, use https: ${value}`);
  }
  if (profile === 'development' && !local) {
    throw new Error(`EXPO_PUBLIC_API_URL: a development build talks to a local stand only, not ${value}`);
  }
  if (LIVE_PROFILES.includes(profile) && (url.protocol !== 'https:' || local)) {
    throw new Error(`EXPO_PUBLIC_API_URL: a ${profile} build talks to the live server over https, not ${value}`);
  }
}

module.exports = { checkApiUrl };
