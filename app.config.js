// The app's config: app.json plus the server address, which depends on the build.
//
// EXPO_PUBLIC_API_URL is the server the app talks to (src/services/api.js reads it; Metro
// writes it into the JS when it bundles). eas.json sets it per profile: development — a
// local stand, preview and production — the live server. config/apiUrl.js checks it against
// the EAS build profile; without it no Expo command runs, so a build never lands on the live
// server by accident:
//   EXPO_PUBLIC_API_URL=http://127.0.0.1:8291 npx expo start
const { checkApiUrl } = require('./config/apiUrl');

module.exports = ({ config }) => {
  checkApiUrl(process.env.EXPO_PUBLIC_API_URL, process.env.EAS_BUILD_PROFILE);
  return config;
};
