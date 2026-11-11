// The AsyncStorage key of what the phone keeps of My day for offline (storage.js): the
// latest weeks and the visit cards opened. Customers' names, phones and addresses are in
// it, so it goes with the session (session/deviceStore.js clear()). Kept apart from
// storage.js so node tests can read it without React Native.
export const MY_DAY_KEY = 'semix.myday';
