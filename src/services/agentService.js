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

// Full list (paginated) — used for “Manage employees/agents” style pages
export const getAllAgents = ({
  search = '',
  status = '',            // agents.status
  user_is_active = '',    // users.is_active: true/false/''(all)
  process_id = '',
  manager_id = '',
  tl_id = '',
  has_headset = '',
  pending_employee_id = '',
  page = 1,
  limit = 20,
  sort_by = 'name',
  sort_order = 'ASC',
} = {}) => {
  const params = { page, limit, sort_by, sort_order };

  if (search) params.search = search;
  if (status) params.status = status;

  if (user_is_active !== '' && user_is_active !== null && user_is_active !== undefined) {
    params.user_is_active = user_is_active;
  }

  if (process_id) params.process_id = process_id;
  if (manager_id) params.manager_id = manager_id;
  if (tl_id) params.tl_id = tl_id;

  if (has_headset !== '' && has_headset !== null && has_headset !== undefined) {
    params.has_headset = has_headset; // 'true' | 'false'
  }

  if (pending_employee_id) params.pending_employee_id = pending_employee_id;

  return api.get('/agents', { params });
};

// Dropdown list — best for Assign Headset
export const getAgentsForDropdown = ({
  status = '',
  has_headset = 'false', // default: show only agents without active headset
  process_id = '',
  include_inactive = 'false',
} = {}) => {
  const params = {};
  if (status) params.status = status;
  if (process_id) params.process_id = process_id;

  if (include_inactive !== '' && include_inactive !== null && include_inactive !== undefined) {
    params.include_inactive = include_inactive; // 'true' | 'false'
  }

  if (has_headset !== '' && has_headset !== null && has_headset !== undefined) {
    params.has_headset = has_headset;
  }

  return api.get('/agents/dropdown', { params });
};

export const getPendingEmployeeIds = () => {
  return api.get('/agents/pending-ids');
};

export const updateEmployeeId = (userId, employee_id) => {
  return api.patch(`/agents/${userId}/employee-id`, { employee_id });
};

// Processes dropdown (existing backend endpoint)
export const getProcessesForDropdown = ({ category = '', headset_brand = '' } = {}) => {
  const params = {};
  if (category) params.category = category;
  if (headset_brand) params.headset_brand = headset_brand;

  return api.get('/agents/processes', { params });
};

export const createAgent = ({
  name,
  employee_id,
  temp_employee_id,
  process_id,
  email,
  phone,
  status = 'active',
}) => {
  return api.post('/agents', {
    name,
    employee_id,
    temp_employee_id,
    process_id,
    email,
    phone,
    status,
  });
};