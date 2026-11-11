// What the phone keeps of «New» and «Updated» (fresh.js gives the shape and the rules) in
// AsyncStorage under SEEN_KEY. Two screens write it — My day after each read of a week and
// the visit card when it shows — so every change goes through one queue (cacheQueue.js):
// each reads the state as it is at its turn. It holds no customer data and is per technician
// (fresh.js own), so sign out does not clear it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SEEN_KEY } from './keys.js';
import { makeCacheQueue } from './cacheQueue.js';

export async function readSeen() {
  try {
    const json = await AsyncStorage.getItem(SEEN_KEY);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

async function writeSeen(state) {
  try {
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(state));
  } catch {
    // a full phone or a broken store: the marks come back with the next read
  }
}

async function removeSeen() {
  await AsyncStorage.removeItem(SEEN_KEY);
}

// updateSeen((state) => newState, seenMark()): the change sees the state as it is at its turn
export const { update: updateSeen, mark: seenMark } = makeCacheQueue({ read: readSeen, write: writeSeen, remove: removeSeen });
