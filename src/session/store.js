// Where the phone keeps the session (session.js `store`): deviceStore.js on the phone's own
// secure store (iOS keychain, Android keystore) and AsyncStorage; My day's cache goes through
// its own queue (myDay/storage.js clearMyDay), the unsent estimate messages too
// (estimate/outboxQueue.js clearOutbox), the customers' signatures not sent yet
// (approve/store.js clearApprovals).
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeDeviceStore } from './deviceStore.js';
import { clearMyDay } from '../myDay/storage';
import { clearOutbox } from '../estimate/outboxQueue';
import { clearApprovals } from '../approve/storeQueue';

const clearUnsent = () => Promise.all([clearOutbox(), clearApprovals()]);
export const deviceStore = makeDeviceStore({ SecureStore, AsyncStorage, clearMyDay, clearOutbox: clearUnsent });
