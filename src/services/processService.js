import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('hs_session_token'); // ✅ match AuthContext
  if (token) config.headers['X-Session-Token'] = token;
  return config;
});

export const getAllProcesses = () => api.get('/processes');