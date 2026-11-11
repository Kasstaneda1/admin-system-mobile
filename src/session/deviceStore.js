// Where the phone keeps the session (session.js `store`), without React Native: store.js
// passes in expo-secure-store and AsyncStorage, deviceStore.test.mjs passes stand-ins.
// Both tokens and their save time in the secure store (iOS keychain, Android keystore), only
// on this device; the profile in AsyncStorage under 'user', the shape /api/login gives,
// which the screens read.
import { MY_DAY_KEY } from '../myDay/keys.js';

const KEYS = { access: 'semix.session.access', refresh: 'semix.session.refresh', savedAt: 'semix.session.savedAt' };
const PROFILE = 'user';
const OLD_TOKEN = 'token'; // the app before APP-1 kept its token here, in the clear

function parse(json) {
  try { return json ? JSON.parse(json) : null; } catch { return null; }
}

export function makeDeviceStore({ SecureStore, AsyncStorage }) {
  const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  return {
    async read() {
      await AsyncStorage.removeItem(OLD_TOKEN);
      const [access, refresh, savedAt, profile] = await Promise.all([
        SecureStore.getItemAsync(KEYS.access, OPTIONS),
        SecureStore.getItemAsync(KEYS.refresh, OPTIONS),
        SecureStore.getItemAsync(KEYS.savedAt, OPTIONS),
        AsyncStorage.getItem(PROFILE),
      ]);
      return { access, refresh, savedAt: savedAt ? Number(savedAt) : null, user: parse(profile) };
    },

    // The refresh token first: if the app stops halfway, the next refresh still has the new one
    async writeTokens({ access, refresh, savedAt }) {
      await SecureStore.setItemAsync(KEYS.refresh, refresh, OPTIONS);
      await SecureStore.setItemAsync(KEYS.access, access, OPTIONS);
      await SecureStore.setItemAsync(KEYS.savedAt, String(savedAt), OPTIONS);
    },

    async writeUser(user) {
      await AsyncStorage.setItem(PROFILE, JSON.stringify(user));
    },

    // Sign out, the end of the session, a start after it ran out: nothing of it stays
    async clear() {
      await Promise.all([
        SecureStore.deleteItemAsync(KEYS.refresh, OPTIONS),
        SecureStore.deleteItemAsync(KEYS.access, OPTIONS),
        SecureStore.deleteItemAsync(KEYS.savedAt, OPTIONS),
        // My day kept for offline (customers' names, phones, addresses) goes with the session
        AsyncStorage.multiRemove([PROFILE, OLD_TOKEN, MY_DAY_KEY]),
      ]);
    },
  };
}
