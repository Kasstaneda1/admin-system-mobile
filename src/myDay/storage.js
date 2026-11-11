// What the phone keeps of My day for offline (TECH_APP_MY_DAY_SPEC.md §3 «Без сети»): the
// latest weeks loaded and the visit cards opened, in AsyncStorage under one key (model.js
// keepWeek / keptWeek and visit.js keepCard / keptCard give its shape). It goes with the
// session: the session's store.clear() removes MY_DAY_KEY at sign out and when the session
// ends (session/deviceStore.test.mjs).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MY_DAY_KEY } from './keys.js';

export { MY_DAY_KEY };

export async function readMyDay() {
  try {
    const json = await AsyncStorage.getItem(MY_DAY_KEY);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

export async function writeMyDay(cache) {
  try {
    await AsyncStorage.setItem(MY_DAY_KEY, JSON.stringify(cache));
  } catch {
    // a full phone or a broken store: the day still shows, only offline loses it
  }
}
