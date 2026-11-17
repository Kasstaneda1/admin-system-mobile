// Where the phone keeps the customer's signatures not yet on the server (queue.js):
// AsyncStorage under one key (on iOS a big value is a file of its own), in its own queue
// (myDay/cacheQueue.js) — the screen and the start of the app may write at the same moment.
// Apart from store.js so the session's store (session/store.js) can clear it at sign out
// without the API (no require cycle).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { APPROVE_QUEUE_KEY } from '../myDay/keys.js';
import { makeCacheQueue } from '../myDay/cacheQueue.js';

export const approveQueueStore = makeCacheQueue({
  read: async () => {
    try {
      const json = await AsyncStorage.getItem(APPROVE_QUEUE_KEY);
      return json ? JSON.parse(json) : null;
    } catch {
      return null;
    }
  },
  write: async (box) => {
    try {
      await AsyncStorage.setItem(APPROVE_QUEUE_KEY, JSON.stringify(box));
    } catch {
      // a full phone: the signature still goes while the screen is open
    }
  },
  remove: () => AsyncStorage.removeItem(APPROVE_QUEUE_KEY),
});

// Sign out, the end of the session: a customer's name and signature do not stay on the phone
export const clearApprovals = () => approveQueueStore.clear();
