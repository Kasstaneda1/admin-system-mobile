// «Call the office» (backend #153: GET /api/my/office → { success, phone, company_name }): the
// phone of the technician's own company, which the office fills in its invoice settings; null
// until it does, and then the app says «Ask the office to add the phone». The phone keeps the
// last answer per technician (officeStore.js), so the button works offline too, as Call and
// Directions do. Without React Native (office.test.mjs).
import { telLink } from './model.js';

export const OFFICE_V = 1;

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

// The server's answer → what the phone keeps: { v, userId, phone, name, at }; null for an
// answer of another shape (an old server, an error page)
export function officeFrom(answer, userId, at) {
  if (userId == null || !answer || typeof answer !== 'object' || !('phone' in answer)) return null;
  return { v: OFFICE_V, userId, phone: text(answer.phone), name: text(answer.company_name), at };
}

// What the phone keeps, if it is this technician's
export function officeOf(kept, userId) {
  return kept && kept.v === OFFICE_V && userId != null && kept.userId === userId ? kept : null;
}

// What a tap does: { call: 'tel:…' }, { missing: true } (the office has no phone in its
// settings, or one that cannot be dialled) or null (nothing known yet: ask the server)
export function officeCall(office) {
  if (!office) return null;
  const url = telLink(office.phone);
  return url ? { call: url } : { missing: true };
}
