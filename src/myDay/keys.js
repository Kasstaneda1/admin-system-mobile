// The AsyncStorage key of what the phone keeps of My day for offline (storage.js): the
// latest weeks and the visit cards opened. Customers' names, phones and addresses are in
// it, so it goes with the session (session/deviceStore.js clear()). Kept apart from
// storage.js so node tests can read it without React Native.
export const MY_DAY_KEY = 'semix.myday';
// What the phone keeps of «New» and «Updated» (fresh.js, seenStore.js): visit ids, days and
// moments only, no customer data, per technician; it stays after sign out, so a visit given
// while signed out is still NEW at the next sign in.
export const SEEN_KEY = 'semix.myday.seen';
// The office's phone and name for «Call the office» (office.js, officeStore.js): the
// company's own number, no customer data, per technician; it stays after sign out.
export const OFFICE_KEY = 'semix.office';
// The technician's messages to the office not yet on the server (estimate/outbox.js): what
// they wrote about an estimate, so it goes with the session (session/deviceStore.js clear())
export const ESTIMATE_OUTBOX_KEY = 'semix.estimate.outbox';
// The customer's signatures not yet on the server (approve/queue.js): a name and a signature,
// so they go with the session too (session/store.js)
export const APPROVE_QUEUE_KEY = 'semix.approve.queue';
