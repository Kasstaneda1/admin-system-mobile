// The map library (react-native-maps), loaded only by the Route screen and only when this build
// of the app has the native map in it (route.js hasNativeMap). An app built before the map came
// gets the new screens with an update but no native map: there the Route screen shows its list
// and «Update the app to see the map», and the rest of the app works as before. Nothing else
// imports the library (route.test.mjs checks it), so it is never loaded at the app's start.
// Android: no map yet (it needs a Google key), the list only.
import { NativeModules, Platform, UIManager } from 'react-native';
import { hasNativeMap } from './route';

let maps; // undefined: not asked yet; null: no map in this build; else the library
export function loadMaps() {
  if (maps !== undefined) return maps;
  maps = null;
  if (Platform.OS !== 'ios' || !hasNativeMap({ UIManager, NativeModules })) return maps;
  try {
    maps = require('react-native-maps');
  } catch {
    maps = null;
  }
  return maps;
}
