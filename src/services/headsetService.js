import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('hs_session_token'); // ✅ matches AuthContext
  if (token) config.headers['X-Session-Token'] = token;
  return config;
});

export const getAllHeadsets = ({
  search = '',
  headset_type = '',
  status = '',
  condition = '',
  is_brand_new = '',
  brand_id = '',
  page = 1,
  limit = 20,
  sort_by = 'headset_number',
  sort_order = 'ASC',
} = {}) => {
  const params = { page, limit, sort_by, sort_order };

  if (search) params.search = search;
  if (headset_type) params.headset_type = headset_type;
  if (status) params.status = status;
  if (condition) params.condition = condition;
  if (is_brand_new !== '' && is_brand_new !== null && is_brand_new !== undefined) params.is_brand_new = is_brand_new;
  if (brand_id) params.brand_id = brand_id;

  return api.get('/headsets', { params });
};
export const addHeadset = (formData) => {
  return api.post('/headsets', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const getAvailableHeadsets = ({ headset_type = '', brand_id = '' } = {}) => {
  const params = {};
  if (headset_type) params.headset_type = headset_type;
  if (brand_id) params.brand_id = brand_id;

  return api.get('/headsets/available', { params });
};
export const getHeadsetAssignments = (headsetId) => api.get(`/headsets/${headsetId}/assignments`);
export const getHeadsetRepairs = (headsetId) => api.get(`/headsets/${headsetId}/repairs`);
export const getHeadsetById = (id) => api.get(`/headsets/${id}`);

export const getHeadsetBrands = () => api.get('/headsets/brands');

export const getInventorySummary = () => api.get('/headsets/summary');

export const markHeadsetLost = (id, body = {}) => api.post(`/headsets/${id}/mark-lost`, body);
export const markHeadsetDamaged = (id, body = {}) => api.post(`/headsets/${id}/mark-damaged`, body);
export const retireHeadset = (id, body = {}) => api.post(`/headsets/${id}/retire`, body);

export const searchDamagedOrRepairHeadsets = async ({ q = '', brand_group = '' } = {}) => {
  const [r1, r2] = await Promise.all([
    getAllHeadsets({
      search: q,
      status: 'damaged',
      page: 1,
      limit: 20,
      sort_by: 'headset_number',
      sort_order: 'ASC',
    }),
    getAllHeadsets({
      search: q,
      status: 'repair',
      page: 1,
      limit: 20,
      sort_by: 'headset_number',
      sort_order: 'ASC',
    }),
  ]);

  const rows = [...(r1.data?.data || []), ...(r2.data?.data || [])];

  const filtered =
    brand_group === 'voix'
      ? rows.filter((h) => String(h.headsetType || '').toLowerCase().startsWith('voix'))
      : brand_group === 'tech'
        ? rows.filter((h) => !String(h.headsetType || '').toLowerCase().startsWith('voix'))
        : rows;

  // de-dup by id
  const map = new Map();
  filtered.forEach((x) => map.set(String(x.id), x));
  return Array.from(map.values());
};

