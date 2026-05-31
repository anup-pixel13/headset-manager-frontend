import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const SESSION_KEY = 'hs_session_token';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000
});

// Attach session token automatically (uses sessionStorage to match AuthContext)
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem(SESSION_KEY);
    if (token) {
      config.headers['X-Session-Token'] = token;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 globally (auto logout)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      sessionStorage.removeItem(SESSION_KEY);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const setSessionToken = (token) => sessionStorage.setItem(SESSION_KEY, token);
export const getSessionToken = () => sessionStorage.getItem(SESSION_KEY);
export const clearSessionToken = () => sessionStorage.removeItem(SESSION_KEY);

export default api;