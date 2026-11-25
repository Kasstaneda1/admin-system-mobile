// Where the phone keeps the customer's signatures «after the work» not yet on the server
// (ack/queue.js): AsyncStorage under one key, in its own queue (myDay/cacheQueue.js), as the
// approvals' (approve/storeQueue.js). Apart from store.js so the session's store
// (session/store.js) can clear it at sign out without the API.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACK_QUEUE_KEY } from '../myDay/keys.js';
import { makeCacheQueue } from '../myDay/cacheQueue.js';

export const ackQueueStore = makeCacheQueue({
  read: async () => {
    try {
      const json = await AsyncStorage.getItem(ACK_QUEUE_KEY);
      return json ? JSON.parse(json) : null;
    } catch {
      return null;
    }
  },
  write: async (box) => {
    try {
      await AsyncStorage.setItem(ACK_QUEUE_KEY, JSON.stringify(box));
    } catch {
      // a full phone: the signature still goes while the screen is open
    }
  },
  remove: () => AsyncStorage.removeItem(ACK_QUEUE_KEY),
});

// Sign out, the end of the session: a customer's name and signature do not stay on the phone
export const clearAcks = () => ackQueueStore.clear();
