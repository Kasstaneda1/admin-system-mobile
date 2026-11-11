// What a failure says in the app's log: its message and, when the server answered, the status.
// Never the error object itself: an axios error carries the request it was made from, and the
// request carries the Authorization header with the technician's token (on /api/login, the
// password too). Every log of the app goes through here; logError.test.mjs keeps it so.

export function errorSummary(error) {
  let message = 'Unknown error';
  if (typeof error === 'string' && error) message = error;
  else if (typeof error?.message === 'string' && error.message) message = error.message;
  const status = error?.response?.status;
  return Number.isInteger(status) ? `${message} (status ${status})` : message;
}

export function logError(label, error) {
  console.error(label, errorSummary(error));
}
