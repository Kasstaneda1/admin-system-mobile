import axios from 'axios';
import { createSession } from '../session/session';
import { deviceStore } from '../session/store';

// The server comes from the build: EXPO_PUBLIC_API_URL, checked by app.config.js and set per
// profile in eas.json (a local stand for development, the live server for preview and
// production). Metro writes the value in when it bundles the app.
const API_URL = process.env.EXPO_PUBLIC_API_URL;

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Refresh and sign out go past the session (it calls them itself); answered, never thrown
const authCalls = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});
const answer = (request) => request.then(
  (response) => ({ status: response.status, data: response.data }),
  (error) => ({ status: error.response?.status || 0, data: error.response?.data || null }),
);

// The technician's session (src/session): tokens in the secure store, one refresh for every
// request that needs it, one repeat of a refused request, sign in again when the server says so
export const session = createSession({
  store: deviceStore,
  http: {
    refresh: (refreshToken) => answer(authCalls.post('/api/auth/refresh', { refreshToken })),
    logout: (refreshToken) => answer(authCalls.post('/api/auth/logout', { refreshToken })),
  },
});
session.attach(api);

// Auth API
export const authAPI = {
  login: async (username, password) => {
    const response = await api.post('/api/login', { username, password });
    return response.data;
  },

  // Gives up a refresh token the app does not keep (someone who is not a technician signed in)
  revoke: (refreshToken) => answer(authCalls.post('/api/auth/logout', { refreshToken })),

  // Who is signed in; also checks that the session still holds (AuthContext)
  me: async () => {
    const response = await api.get('/api/me');
    return response.data;
  },
};

// One estimate of this technician (TECH_APP_ESTIMATE_SCREEN_SPEC.md, estimate/model.js): the
// server gives a technician only their own estimates (404 for the rest) and only the fields
// of routes/estimates/access.js.
//   get — the estimate; comments — its messages, the oldest first;
//   send — POST { commentText, author_tz }: 201 { comment }; 400 empty; 404 not theirs;
//   viewed — the technician has seen the messages (has_unread_comments goes false).
export const estimateAPI = {
  get: async (id) => (await api.get(`/api/estimates/${encodeURIComponent(id)}`, { timeout: 15000 })).data,
  comments: async (id) => (await api.get(`/api/estimates/${encodeURIComponent(id)}/comments`, { timeout: 15000 })).data,
  send: async (id, body) => (await api.post(`/api/estimates/${encodeURIComponent(id)}/comments`, body, { timeout: 15000 })).data,
  viewed: async (id) => (await api.post(`/api/estimates/${encodeURIComponent(id)}/mark-viewed`, {}, { timeout: 15000 })).data,
};

// Salary API
// Parts (site js/technician-parts.js): this technician's estimates with parts in the four
// stages; params from parts/model.js partsQuery
export const partsAPI = {
  list: async (params) => (await api.get('/api/estimates', { params, timeout: 15000 })).data,
};

export const salaryAPI = {
  // The technician portal's Salary (site js/technician-salary.js): the server takes the
  // technician from the login. A year: its jobs; a month (0–11): its jobs and its money —
  // totalPaid, totalCash, totalChecks, totalUnpaid and the balance totalToPay
  year: async (year) => (await api.post('/api/technician-salary', { year }, { timeout: 15000 })).data,
  month: async (year, month) => (await api.post('/api/technician-salary', { year, month }, { timeout: 15000 })).data,
};

// The rows of a Salary month that open their own screen (salary/money.js reads the answers);
// the server takes the technician from the login, the name in the address is not trusted
// (the site's technician portal sends it the same way).
//   payments — { payments: [{ id, payment_date, amount }] }, every payout, the newest first;
//   receipts — [{ id, date, client_name, work_status, check_amount }], checks not handed in;
//   unpaid — { pending: [...], declined: [...] } of the unpaid records.
const named = (name) => encodeURIComponent(name || 'me');
export const salaryMoneyAPI = {
  payments: async (name) => (await api.get(`/api/technician-payments/${named(name)}`, { timeout: 15000 })).data,
  receipts: async () => (await api.get('/api/my-receipts', { timeout: 15000 })).data,
  unpaid: async (name) => (await api.get(`/api/technician-unpaid/unpaid/${named(name)}`, { timeout: 15000 })).data,
};

// Warehouse API
export const warehouseAPI = {
  getWarehouses: async () => {
    const response = await api.get('/api/warehouse/warehouses?with_stats=true');
    return response.data;
  },

  getParts: async (warehouseId, params = {}) => {
    const response = await api.get('/api/warehouse/parts', {
      params: { warehouse_id: warehouseId, ...params },
    });
    return response.data;
  },

  getStats: async (warehouseId) => {
    const response = await api.get('/api/warehouse/parts/stats', {
      params: { warehouse_id: warehouseId },
    });
    return response.data;
  },

  getPartById: async (id) => {
    const response = await api.get(`/api/warehouse/parts/${id}`);
    return response.data;
  },

  deductPart: async (partId, warehouseId, quantity) => {
    const response = await api.post(`/api/warehouse/parts/${partId}/deduct`, {
      warehouse_id: warehouseId,
      quantity,
    });
    return response.data;
  },
};

// My day (backend routes/scheduler/my.js): the technician's own visits, their actions and notes.
// visits(from, to): New York days 'YYYY-MM-DD', both included, at most 7.
// Answers { success, server_time, today, from, to, visits }.
// visit(id): one visit with its job's other visits, the notes and the office's words:
// { success, server_time, visit: { ...as in visits, job_visits, notes, office_notes, office_messages } };
// 404 when it is no longer the technician's.
export const myDayAPI = {
  visits: async (from, to) => {
    const response = await api.get('/api/my/visits', { params: { from, to }, timeout: 15000 });
    return response.data;
  },
  visit: async (id) => {
    const response = await api.get(`/api/my/visits/${encodeURIComponent(id)}`, { timeout: 15000 });
    return response.data;
  },
  // A press on the visit: body { action, outcome?, client_request_id } (actions.js actionBody).
  // 200 { success, changed, visit }; 409/403 { error, visit }; 404 { error }; 400 { error }.
  act: async (id, body) => {
    const response = await api.post(`/api/my/visits/${encodeURIComponent(id)}/actions`, body, { timeout: 15000 });
    return response.data;
  },
  // A note: body { text, client_request_id } (notesPhotos.js noteBody).
  // 201 { success, created: true, note, visit }; 200 created: false for the same id again
  // (also a success); 400 { error }; 404 { error }; 409 { error, visit }.
  note: async (id, body) => {
    const response = await api.post(`/api/my/visits/${encodeURIComponent(id)}/notes`, body, { timeout: 15000 });
    return response.data;
  },
  // The visit's diagnosis (src/diagnosis/model.js diagnosisBody): { text, base_version,
  // client_request_id }. 200 { success, changed, diagnosis, visit } (changed: false for the
  // same text or the same id again); 409 { error, code, diagnosis, visit } — diagnosis_conflict
  // (diagnosis: their text), diagnosis_locked (the bill is issued: add to it); 400; 404.
  diagnosis: async (id, body) => {
    const response = await api.put(`/api/my/visits/${encodeURIComponent(id)}/diagnosis`, body, { timeout: 15000 });
    return response.data;
  },
  // An addition to the diagnosis after the bill: { text, client_request_id }. 201 { success,
  // created: true, addendum, diagnosis, visit }; 200 created: false for the same id again;
  // 409 { error, code, visit } — diagnosis_not_locked, addenda_limit; 400; 404.
  addToDiagnosis: async (id, body) => {
    const response = await api.post(`/api/my/visits/${encodeURIComponent(id)}/diagnosis/addenda`, body, { timeout: 15000 });
    return response.data;
  },
  // The route of a New York day (backend routes/scheduler/route.js, route.js here): { success,
  // date, today, stops, total_miles, stops_without_point, flags }; 400 for a bad date.
  route: async (date) => {
    const response = await api.get('/api/my/route', { params: { date }, timeout: 15000 });
    return response.data;
  },
  // The office's messages the technician has had on the screen (officeSeen.js): ids.
  // 200 { success, marked, visit }; again, nothing changes; 400 { error } for an id that is
  // not a message of this visit; 404, 409 (an old task) { error }.
  seen: async (id, ids) => {
    const response = await api.post(`/api/my/visits/${encodeURIComponent(id)}/office-messages/seen`, { ids }, { timeout: 15000 });
    return response.data;
  },
  // «Call the office» (office.js): { success, phone, company_name }; phone null until the
  // office fills it in its invoice settings. A short wait: the technician is on the button.
  office: async () => {
    const response = await api.get('/api/my/office', { timeout: 8000 });
    return response.data;
  },
};

// The visit's bill (backend routes/scheduler/bills.js, the main technician of the visit only;
// src/bill/model.js reads the answers). Every change answers the whole bill
// { success, bill: { status, lines, totals…, company, customer, technician, warnings } }:
//   get — 404 'This visit has no bill yet' before it is drafted;
//   draft — POST: the server assembles a new draft (201, created: true) or answers the one
//           the visit has (200); 409 for a visit that has an issued bill or no work;
//   message — PUT { message }; tax — PUT { tax_id } (null: the company's default) or
//           { tax_off }: 403 no_tax_permission without changes_bill_tax, 400 tax_not_allowed;
//   addLine — POST { price_item_id } or { kind, name, … };
//   changeLine — PATCH the fields that changed; removeLine — DELETE;
//   issue — POST { expected_total_cents }: the number, the snapshot and the PDF; 409 with a
//           code when the draft is not ready (tax_missing, profile_missing, no_lines, …);
//   priceBook — the active items of the price book of the job's company.
const billPath = (id) => `/api/my/visits/${encodeURIComponent(id)}/bill`;
export const billAPI = {
  get: async (id) => (await api.get(billPath(id), { timeout: 15000 })).data,
  draft: async (id) => (await api.post(billPath(id), {}, { timeout: 15000 })).data,
  message: async (id, message) => (await api.put(billPath(id), { message }, { timeout: 15000 })).data,
  tax: async (id, body) => (await api.put(billPath(id), body, { timeout: 15000 })).data,
  addLine: async (id, body) => (await api.post(`${billPath(id)}/lines`, body, { timeout: 15000 })).data,
  changeLine: async (id, lineId, body) => (await api.patch(`${billPath(id)}/lines/${encodeURIComponent(lineId)}`, body, { timeout: 15000 })).data,
  removeLine: async (id, lineId) => (await api.delete(`${billPath(id)}/lines/${encodeURIComponent(lineId)}`, { timeout: 15000 })).data,
  issue: async (id, expectedTotal) => (await api.post(`${billPath(id)}/issue`, { expected_total_cents: expectedTotal }, { timeout: 30000 })).data,
  priceBook: async (id) => (await api.get(`/api/my/visits/${encodeURIComponent(id)}/price-items`, { timeout: 15000 })).data,
  // { via: 'handed' | 'shared', to?, consent? (shared: true) }: the issued bill reached the
  // customer; once per bill (409 again). The PDF itself: src/bill/pdf.js
  delivered: async (id, body) => (await api.post(`${billPath(id)}/delivered`, body, { timeout: 15000 })).data,
};

// «Approve» before the work (backend routes/scheduler/billConsents.js, billCopies.js; the main
// technician of a visit of the new schedule only: a helper 403, a visit not theirs 404):
//   terms — GET ?kind=authorization: { terms: { id, version, title, body, … } | null };
//   list — GET: { rule: nyc_20 | nj_any | none, authorizations: newest first };
//   sign — POST { method: signature, signer_name, signature_png, amount_source: bill,
//          expected_amount_cents, terms_version_id?, estimate_choice?, estimate_price_cents?,
//          client_request_id }: 201 created, 200 created: false for the same id again; 409
//          amount_changed / terms_changed (the customer signs again), 400 with the reason;
//   copies — POST { via: handed | shared, to?, consent? }: the customer got a copy (§2-258);
//          the PDF itself: src/approve/pdf.js
const authPath = (id) => `/api/my/visits/${encodeURIComponent(id)}/authorizations`;
export const approveAPI = {
  terms: async (id) => (await api.get(`/api/my/visits/${encodeURIComponent(id)}/terms`, { params: { kind: 'authorization' }, timeout: 15000 })).data,
  list: async (id) => (await api.get(authPath(id), { timeout: 15000 })).data,
  sign: async (id, body) => (await api.post(authPath(id), body, { timeout: 30000 })).data,
  copies: async (id, authId, body) => (await api.post(`${authPath(id)}/${encodeURIComponent(authId)}/copies`, body, { timeout: 15000 })).data,
};

// The customer's signature «after the work» (backend billConsents.js, billCopies.js): the
// customer got the visit's issued and delivered bill and signs that they did, choosing about the
// replaced parts. One per bill. No queue on the phone: the delivery before it needs the server
// too, so without the connection the screen says «Try again online».
//   terms — GET ?kind=acknowledgment: { terms | null }; get — { acknowledgment | null } (404 —
//   no bill); sign — 201 { acknowledgment }, the same client_request_id again 200, 409
//   not_issued / not_delivered / void / already_signed / terms_changed; copies — { via, consent }
//   (as the approval's). The PDF of the copy: src/ack/pdf.js
const ackPath = (id) => `/api/my/visits/${encodeURIComponent(id)}/bill/acknowledgment`;
export const ackAPI = {
  terms: async (id) => (await api.get(`/api/my/visits/${encodeURIComponent(id)}/terms`, { params: { kind: 'acknowledgment' }, timeout: 15000 })).data,
  get: async (id) => (await api.get(ackPath(id), { timeout: 15000 })).data,
  sign: async (id, body) => (await api.post(ackPath(id), body, { timeout: 30000 })).data,
  copies: async (id, body) => (await api.post(`${ackPath(id)}/copies`, body, { timeout: 15000 })).data,
};

// The money of the visit's issued bill (backend routes/scheduler/billPayments.js, PR 13а; the
// main technician only: a helper 403, takes_payments off 403 payments_off). The balance and the
// list come with the bill too (billAPI.get: paid_cents, balance_cents, payment_status, payments).
//   record — POST { kind?: payment | tip, amount_cents, method, method_note?, note?,
//            check_number?, before_delivery?, before_delivery_reason?, tip_for_user_id?,
//            client_request_id }: 201 { payment, bill, payment_warnings }, the same id again 200;
//            409 not_issued / bill_void / not_delivered / over_balance, 400 note_required;
//   void — POST { reason }: their own record within 15 minutes (403 void_window_passed after).
const payPath = (id) => `/api/my/visits/${encodeURIComponent(id)}/payments`;
export const payAPI = {
  record: async (id, body) => (await api.post(payPath(id), body, { timeout: 30000 })).data,
  void: async (id, paymentId, reason) => (await api.post(`${payPath(id)}/${encodeURIComponent(paymentId)}/void`, { reason }, { timeout: 15000 })).data,
};

// The visit's photos (backend routes/scheduler/photos.js; a technician only on their own
// visit). list: the server's rows, the newest first. upload(file { uri, name, type }): the
// field 'photo', JPEG/PNG/GIF/WebP up to 10 MB; 201 { photo }. A photo itself is
// GET …/photos/:photoId/file with the token: photoUri(path) gives the full address for the
// screen's Image, session.authHeader() its header.
export const photosAPI = {
  list: async (id) => {
    const response = await api.get(`/api/scheduler/tasks/${encodeURIComponent(id)}/photos`, { timeout: 15000 });
    return response.data;
  },
  upload: async (id, file) => {
    const form = new FormData();
    form.append('photo', { uri: file.uri, name: file.name, type: file.type });
    // multipart, not the client's JSON: React Native writes the boundary itself
    const response = await api.post(`/api/scheduler/tasks/${encodeURIComponent(id)}/photos`, form, {
      timeout: 60000,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};
export const photoUri = (path) => `${API_URL}${path}`;

export default api;
