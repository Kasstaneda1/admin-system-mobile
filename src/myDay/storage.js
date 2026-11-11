// What the phone keeps of My day for offline (TECH_APP_MY_DAY_SPEC.md §3 «Без сети»): the
// latest weeks loaded, in AsyncStorage (model.js keepWeek / keptWeek give its shape). It goes
// with the session: the session's store.clear() removes MY_DAY_KEY at sign out and when the
// server ends the session.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const MY_DAY_KEY = 'semix.myday';

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
