// What the phone keeps of My day for offline (TECH_APP_MY_DAY_SPEC.md §3 «Без сети»): the
// latest weeks loaded and the visit cards opened, in AsyncStorage under one key (model.js
// keepWeek / keptWeek and visit.js keepCard / keptCard give its shape). It goes with the
// session: the session's store.clear() calls clearMyDay at sign out and when the session
// ends (session/deviceStore.test.mjs).
// Every change goes through updateMyDay, one at a time (cacheQueue.js): the day screen and
// the visit screen under it may write at the same moment. A screen takes myDayMark() before
// it asks the server and passes it with the change: an answer that comes after sign out is
// dropped, not written back.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MY_DAY_KEY } from './keys.js';
import { makeCacheQueue } from './cacheQueue.js';

export { MY_DAY_KEY };

export async function readMyDay() {
  try {
    const json = await AsyncStorage.getItem(MY_DAY_KEY);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

async function writeMyDay(cache) {
  try {
    await AsyncStorage.setItem(MY_DAY_KEY, JSON.stringify(cache));
  } catch {
    // a full phone or a broken store: the day still shows, only offline loses it
  }
}

async function removeMyDay() {
  await AsyncStorage.removeItem(MY_DAY_KEY);
}

// updateMyDay((cache) => newCache, mark): the change sees the cache as it is at its turn;
// clearMyDay(): sign out; myDayMark(): before asking the server
export const { update: updateMyDay, clear: clearMyDay, mark: myDayMark } = makeCacheQueue({
  read: readMyDay, write: writeMyDay, remove: removeMyDay,
});
