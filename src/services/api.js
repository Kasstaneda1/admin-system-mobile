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

// Estimates API
export const estimatesAPI = {
  getMyEstimates: async () => {
    // Backend /api/estimates returns paginated data
    // Backend doesn't filter by role automatically - returns all estimates
    // TODO: Backend needs to add role-based filtering or create /api/my-estimates endpoint
    const response = await api.get('/api/estimates');
    return response.data.data || []; // Extract data array from pagination response
  },

  getEstimateById: async (id) => {
    const response = await api.get(`/api/estimates/${id}`);
    return response.data;
  },

  updateEstimate: async (id, data) => {
    const response = await api.put(`/api/estimates/${id}`, data);
    return response.data;
  },

  // Parts - get estimates by status for current technician
  getPartsByStatus: async (status) => {
    const response = await api.get('/api/my-parts', {
      params: { status }
    });
    return response.data;
  },

  // Get comments for an estimate
  getEstimateComments: async (estimateId) => {
    const response = await api.get(`/api/estimates/${estimateId}/comments`);
    return response.data;
  },
};

// Salary API
export const salaryAPI = {
  getSalaryData: async (startDate, endDate) => {
    const response = await api.get('/api/technicians/salary', {
      params: { start_date: startDate, end_date: endDate },
    });
    return response.data;
  },

  getPayments: async (technicianName) => {
    const response = await api.get(`/api/technicians/payments/${technicianName}`);
    return response.data;
  },
};

// Unpaid Records API
export const unpaidAPI = {
  getUnpaidRecords: async (technicianName) => {
    const response = await api.get(`/api/technician-unpaid/unpaid/${technicianName}`);
    return response.data;
  },
};

// Receipts API
export const receiptsAPI = {
  getMyReceipts: async () => {
    const response = await api.get('/api/my-receipts');
    return response.data;
  },
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
//   message — PUT { message }; addLine — POST { price_item_id } or { kind, name, … };
//   changeLine — PATCH the fields that changed; removeLine — DELETE;
//   issue — POST { expected_total_cents }: the number, the snapshot and the PDF; 409 with a
//           code when the draft is not ready (tax_missing, profile_missing, no_lines, …);
//   priceBook — the active items of the price book of the job's company.
const billPath = (id) => `/api/my/visits/${encodeURIComponent(id)}/bill`;
export const billAPI = {
  get: async (id) => (await api.get(billPath(id), { timeout: 15000 })).data,
  draft: async (id) => (await api.post(billPath(id), {}, { timeout: 15000 })).data,
  message: async (id, message) => (await api.put(billPath(id), { message }, { timeout: 15000 })).data,
  addLine: async (id, body) => (await api.post(`${billPath(id)}/lines`, body, { timeout: 15000 })).data,
  changeLine: async (id, lineId, body) => (await api.patch(`${billPath(id)}/lines/${encodeURIComponent(lineId)}`, body, { timeout: 15000 })).data,
  removeLine: async (id, lineId) => (await api.delete(`${billPath(id)}/lines/${encodeURIComponent(lineId)}`, { timeout: 15000 })).data,
  issue: async (id, expectedTotal) => (await api.post(`${billPath(id)}/issue`, { expected_total_cents: expectedTotal }, { timeout: 30000 })).data,
  priceBook: async (id) => (await api.get(`/api/my/visits/${encodeURIComponent(id)}/price-items`, { timeout: 15000 })).data,
  // { via: 'handed' | 'shared', to?, consent? (shared: true) }: the issued bill reached the
  // customer; once per bill (409 again). The PDF itself: src/bill/pdf.js
  delivered: async (id, body) => (await api.post(`${billPath(id)}/delivered`, body, { timeout: 15000 })).data,
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
