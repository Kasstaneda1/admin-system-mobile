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
    const response = await api.post('/api/auth/login', { username, password });
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
    const response = await api.get('/api/estimates/my-estimates');
    return response.data;
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
export const salaryAPI = {
  getSalaryData: async (startDate, endDate) => {
    const response = await api.get('/api/technicians/salary', {
      params: { start_date: startDate, end_date: endDate },
    });
    return response.data;
  },

  getPayments: async () => {
    const response = await api.get('/api/technicians/payments');
    return response.data;
  },
};

// Receipts API
export const receiptsAPI = {
  submitReceipt: async (formData) => {
    const response = await api.post('/api/technicians/submit-receipt', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

export default api;
