// Where the phone keeps the session (session.js `store`): deviceStore.js on the phone's own
// secure store (iOS keychain, Android keystore) and AsyncStorage; My day's cache goes through
// its own queue (myDay/storage.js clearMyDay).
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeDeviceStore } from './deviceStore.js';
import { clearMyDay } from '../myDay/storage';

export const deviceStore = makeDeviceStore({ SecureStore, AsyncStorage, clearMyDay });
