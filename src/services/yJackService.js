import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('hs_session_token');
  if (token) config.headers['X-Session-Token'] = token;
  return config;
});

export const getYJacks = ({ search = '', page = 1, limit = 20 } = {}) =>
  api.get('/yjacks', { params: { search, page, limit } });

export const assignYJack = ({ headset_id, trainer_name, notes = '' }) =>
  api.post('/yjacks/assign', { headset_id, trainer_name, notes });

export const unassignYJack = ({ headset_id, notes = '' }) =>
  api.post('/yjacks/unassign', { headset_id, notes });