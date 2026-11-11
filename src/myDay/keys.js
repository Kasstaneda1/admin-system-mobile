// The AsyncStorage key of what the phone keeps of My day for offline (storage.js): the
// latest weeks and the visit cards opened. Customers' names, phones and addresses are in
// it, so it goes with the session (session/deviceStore.js clear()). Kept apart from
// storage.js so node tests can read it without React Native.
export const MY_DAY_KEY = 'semix.myday';
// What the phone keeps of «New» and «Updated» (fresh.js, seenStore.js): visit ids, days and
// moments only, no customer data, per technician; it stays after sign out, so a visit given
// while signed out is still NEW at the next sign in.
export const SEEN_KEY = 'semix.myday.seen';
