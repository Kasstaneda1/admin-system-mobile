import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://admin-system-backend-production.up.railway.app';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      // Navigate to login (handle in component)
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: async (username, password) => {
    const response = await api.post('/api/login', { username, password });
    return response.data;
  },

  logout: async () => {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user');
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

export default api;
