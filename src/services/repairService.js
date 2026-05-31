import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('hs_session_token');
  if (token) config.headers['X-Session-Token'] = token;
  return config;
});

// Lots
export const createRepairLot = ({ brand_group, vendor_name, notes } = {}) => {
  return api.post('/repairs/lots', { brand_group, vendor_name, notes });
};

export const getRepairLots = ({
  search = '',
  brand_group = '',
  status = '',
  start_sent_date = '',
  end_sent_date = '',
  start_received_date = '',
  end_received_date = '',
  page = 1,
  limit = 20,
  sort_order = 'DESC',
} = {}) => {
  const params = { page, limit, sort_order };
  if (search) params.search = search;
  if (brand_group) params.brand_group = brand_group;
  if (status) params.status = status;
  if (start_sent_date) params.start_sent_date = start_sent_date;
  if (end_sent_date) params.end_sent_date = end_sent_date;
  if (start_received_date) params.start_received_date = start_received_date;
  if (end_received_date) params.end_received_date = end_received_date;

  return api.get('/repairs/lots', { params });
};

export const getRepairLotById = (id) => {
  return api.get(`/repairs/lots/${id}`);
};

export const addItemsToRepairLot = (lotId, headset_ids = []) => {
  return api.post(`/repairs/lots/${lotId}/items`, { headset_ids });
};

export const removeRepairLotItem = (lotId, itemId) => {
  return api.delete(`/repairs/lots/${lotId}/items/${itemId}`);
};

export const sendRepairLot = (lotId) => {
  return api.post(`/repairs/lots/${lotId}/send`);
};

export const receiveRepairLotItems = (lotId, items = []) => {
  // items: [{ headset_id, condition_after, receive_notes }]
  return api.post(`/repairs/lots/${lotId}/receive`, { items });
};

// Replacements
export const getTempReplacements = ({
  status = 'active', // active|inactive
  search = '',
  page = 1,
  limit = 20,
  sort_order = 'DESC',
} = {}) => {
  const params = { status, page, limit, sort_order };
  if (search) params.search = search;
  return api.get('/repairs/replacements', { params });
};

// Workflow actions
export const startRepairReplacement = (payload) => api.post('/repairs/start-replacement', payload);
export const rehandoverRepairedHeadset = (payload) => api.post('/repairs/re-handover', payload);

// ✅ Agenda A: agent exit closure (no rehandover later)
export const closeReplacementAgentExit = (payload) => api.post('/repairs/close-replacement-agent-exit', payload);