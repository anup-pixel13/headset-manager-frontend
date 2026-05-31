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

// GET /api/refunds
export const getAllRefundRequests = ({
  status = 'in_progress',
  search = '',
  start_date = '',
  end_date = '',
  page = 1,
  limit = 20,
  sort_by = 'created_at',
  sort_order = 'DESC',
} = {}) => {
  const params = { page, limit, sort_by, sort_order };
  if (status) params.status = status;
  if (search) params.search = search;
  if (start_date) params.start_date = start_date;
  if (end_date) params.end_date = end_date;

  return api.get('/refunds', { params });
};

// POST /api/refunds/:id/process
export const processRefundRequest = (id, { approved_amount, remarks = '' }) => {
  return api.post(`/refunds/${id}/process`, { approved_amount, remarks });
};

// ✅ POST /api/refunds/:id/reopen
export const reopenRefundRequest = (id, { remarks = '' } = {}) => {
  return api.post(`/refunds/${id}/reopen`, { remarks });
};

// ✅ POST /api/refunds/:id/not-eligible  (reversible via a future "move back to in_progress")
export const markRefundNotEligible = (id, { remarks = '' } = {}) => {
  return api.post(`/refunds/${id}/not-eligible`, { remarks });
};