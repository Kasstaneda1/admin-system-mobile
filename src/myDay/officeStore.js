// «Call the office»: the last answer of GET /api/my/office kept on the phone under OFFICE_KEY
// (office.js gives its shape), so the button dials offline too. My day asks the server once
// per app start (primeOffice); a tap dials what is kept and asks again for the next time, or
// asks first when nothing is kept yet or the office had no phone last time.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking } from 'react-native';
import { myDayAPI } from '../services/api';
import { OFFICE_KEY } from './keys.js';
import { officeCall, officeFrom, officeOf } from './office.js';

let kept;                 // undefined: not read from the phone yet
const primed = new Set(); // technicians asked for in this app start
let busy = false;

async function readKept() {
  if (kept !== undefined) return kept;
  try {
    const json = await AsyncStorage.getItem(OFFICE_KEY);
    kept = json ? JSON.parse(json) : null;
  } catch {
    kept = null;
  }
  return kept;
}

// Ask the server and keep the answer; null when it could not be had
async function refreshOffice(userId) {
  try {
    const office = officeFrom(await myDayAPI.office(), userId, Date.now());
    if (!office) return null;
    kept = office;
    try {
      await AsyncStorage.setItem(OFFICE_KEY, JSON.stringify(office));
    } catch {
      // a full phone: the number still works while the app runs
    }
    return office;
  } catch {
    return null;
  }
}

// My day after a read: the office's phone for later, once per app start
export function primeOffice(userId) {
  if (userId == null || primed.has(userId)) return;
  primed.add(userId);
  refreshOffice(userId);
}

// The tap on «Call the office»
export async function callOffice(userId) {
  if (busy) return;
  busy = true;
  try {
    let todo = officeCall(officeOf(await readKept(), userId));
    if (!todo || todo.missing) {
      const office = await refreshOffice(userId);
      if (office) todo = officeCall(office);
    } else {
      refreshOffice(userId);
    }
    if (!todo) {
      Alert.alert('No connection', 'Could not get the office phone. Try again when you are online.');
    } else if (todo.missing) {
      Alert.alert('No office phone', 'Ask the office to add the phone.');
    } else {
      try {
        await Linking.openURL(todo.call);
      } catch {
        Alert.alert('Calls are not available on this device');
      }
    }
  } finally {
    busy = false;
  }
}
