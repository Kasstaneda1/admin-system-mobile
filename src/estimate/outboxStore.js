// The phone's unsent messages (outbox.js) in AsyncStorage under one key, in their own queue
// (myDay/cacheQueue.js): the screen and the start of the app may write at the same moment.
// It goes with the session: session/store.js passes clearOutbox to the device store.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ESTIMATE_OUTBOX_KEY } from '../myDay/keys.js';
import { makeCacheQueue } from '../myDay/cacheQueue.js';
import { estimateAPI } from '../services/api';
import { makeOutbox } from './outbox.js';

const queue = makeCacheQueue({
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

// The technician's own zone, as the site sends it (author_tz)
function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export const outbox = makeOutbox({
  queue,
  api: { comments: (id) => estimateAPI.comments(id), post: (id, body) => estimateAPI.send(id, body) },
  timeZone,
});
export const clearOutbox = () => queue.clear();
