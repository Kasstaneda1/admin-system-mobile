// Where the phone keeps its unsent estimate messages (outbox.js): AsyncStorage under one key,
// in their own queue (myDay/cacheQueue.js) — the screen and the start of the app may write at
// the same moment. Apart from outboxStore.js so the session's store (session/store.js) can clear
// it at sign out without the API (no require cycle).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ESTIMATE_OUTBOX_KEY } from '../myDay/keys.js';
import { makeCacheQueue } from '../myDay/cacheQueue.js';

export const outboxQueue = makeCacheQueue({
  read: async () => {
    try {
      const json = await AsyncStorage.getItem(ESTIMATE_OUTBOX_KEY);
      return json ? JSON.parse(json) : null;
    } catch {
      return null;
    }
  },
  write: async (box) => {
    try {
      await AsyncStorage.setItem(ESTIMATE_OUTBOX_KEY, JSON.stringify(box));
    } catch {
      // a full phone: the message still goes while the screen is open
    }
  },
  remove: () => AsyncStorage.removeItem(ESTIMATE_OUTBOX_KEY),
});

// Sign out, the end of the session: what this technician wrote does not stay on the phone
export const clearOutbox = () => outboxQueue.clear();
