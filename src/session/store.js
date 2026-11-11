// Where the phone keeps the session (session.js `store`): both tokens and their save time in
// the secure store (iOS keychain, Android keystore), only on this device; the profile in
// AsyncStorage under 'user', the shape /api/login gives, which the screens read.
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = { access: 'semix.session.access', refresh: 'semix.session.refresh', savedAt: 'semix.session.savedAt' };
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const PROFILE = 'user';
const OLD_TOKEN = 'token'; // the app before APP-1 kept its token here, in the clear

function parse(json) {
  try { return json ? JSON.parse(json) : null; } catch { return null; }
}

export const deviceStore = {
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

  async clear() {
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.refresh, OPTIONS),
      SecureStore.deleteItemAsync(KEYS.access, OPTIONS),
      SecureStore.deleteItemAsync(KEYS.savedAt, OPTIONS),
      AsyncStorage.multiRemove([PROFILE, OLD_TOKEN]),
    ]);
  },
};
