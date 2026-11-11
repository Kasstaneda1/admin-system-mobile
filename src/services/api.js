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

// My day (backend routes/scheduler/my.js): the technician's own visits, read only.
// visits(from, to): New York days 'YYYY-MM-DD', both included, at most 7.
// Answers { success, server_time, today, from, to, visits }.
// visit(id): one visit with its job's other visits, the notes and the office's notes:
// { success, server_time, visit: { ...as in visits, job_visits, notes, office_notes } };
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
};

export default api;
