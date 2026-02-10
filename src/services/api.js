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
};

// Salary API
// TODO: Backend needs new endpoints for mobile app:
// - GET /api/my-salary?start_date=X&end_date=Y (returns current user's salary)
// - GET /api/my-payments (returns current user's payments)
export const salaryAPI = {
  getSalaryData: async (startDate, endDate) => {
    // Temporary: return mock data until backend endpoints are created
    return {
      totalSalary: 0,
      totalEarned: 0,
      totalDebt: 0,
      totalPaid: 0,
    };
  },

  getPayments: async () => {
    // Temporary: return empty array until backend endpoints are created
    return [];
  },
};

// Receipts API
// TODO: Backend needs POST /api/my-receipts endpoint
export const receiptsAPI = {
  submitReceipt: async (formData) => {
    // Temporary: return success until backend endpoint is created
    return { success: true, message: 'Receipt endpoint not implemented yet' };
  },
};

export default api;
