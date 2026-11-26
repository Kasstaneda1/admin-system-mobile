// The people one may mention on an estimate (mentions.js), the last list the server gave, kept
// on the phone per estimate: «@» still lists them without a connection. Names of the company's
// people only; it goes with the session (session/store.js). AsyncStorage under one key, in its
// own queue (myDay/cacheQueue.js); at most 30 estimates, the oldest go.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ESTIMATE_PEOPLE_KEY } from '../myDay/keys.js';
import { makeCacheQueue } from '../myDay/cacheQueue.js';
import { peopleOf } from './mentions.js';

const MAX_ESTIMATES = 30;

const queue = makeCacheQueue({
  read: async () => {
    try {
      const json = await AsyncStorage.getItem(ESTIMATE_PEOPLE_KEY);
      return json ? JSON.parse(json) : null;
    } catch {
      return null;
    }
  },
  write: async (box) => {
    try {
      await AsyncStorage.setItem(ESTIMATE_PEOPLE_KEY, JSON.stringify(box));
    } catch {
      // a full phone: the list still works while the app is open
    }
  },
  remove: () => AsyncStorage.removeItem(ESTIMATE_PEOPLE_KEY),
});

const boxOf = (b) => (b && typeof b === 'object' && !Array.isArray(b) ? b : {});

// The saved list of an estimate, or null
export async function savedPeople(estimateId) {
  const box = boxOf(await queue.update((b) => b, queue.mark()));
  const kept = box[String(estimateId)];
  return kept ? peopleOf(kept.people) : null;
}

// mark: peopleMark() taken before the request, so an answer that comes after sign out is
// not written back
export const peopleMark = () => queue.mark();
export function savePeople(estimateId, people, mark, at = Date.now()) {
  return queue.update((b) => {
    const box = { ...boxOf(b), [String(estimateId)]: { people: peopleOf(people), at } };
    const keys = Object.keys(box).sort((x, y) => (box[y].at || 0) - (box[x].at || 0));
    keys.slice(MAX_ESTIMATES).forEach((k) => { delete box[k]; });
    return box;
  }, mark);
}

export const clearPeople = () => queue.clear();
