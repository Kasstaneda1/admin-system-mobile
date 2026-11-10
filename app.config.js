// The app's config: app.json plus the server address, which depends on the build.
//
// EXPO_PUBLIC_API_URL is the server the app talks to (src/services/api.js reads it; Metro
// writes it into the JS when it bundles). eas.json sets it per profile: development — a
// local stand, preview and production — the live server. Without it no Expo command runs,
// so a build never lands on the live server by accident:
//   EXPO_PUBLIC_API_URL=http://127.0.0.1:8291 npx expo start
// Plain http only for this Mac or the local network; anything else must be https.
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[a-z0-9-]+\.local)$/i;

function checkApiUrl() {
  const value = process.env.EXPO_PUBLIC_API_URL;
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
  if (url.protocol === 'http:' && !LOCAL_HOST.test(url.hostname)) {
    throw new Error(`EXPO_PUBLIC_API_URL: plain http is only for a local stand, use https: ${value}`);
  }
}

module.exports = ({ config }) => {
  checkApiUrl();
  return config;
};
