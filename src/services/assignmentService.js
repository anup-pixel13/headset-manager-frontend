import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('hs_session_token');
  if (token) config.headers['X-Session-Token'] = token;
  return config;
});

export const getAllAssignments = ({
  search = '',
  is_active = 'true',
  is_verified = '',
  process_id = '',
  headset_type = '',
  start_date = '',
  end_date = '',
  page = 1,
  limit = 20,
  sort_by = 'assignment_date',
  sort_order = 'DESC',
} = {}) => {
  const params = { page, limit, sort_by, sort_order };

  if (search) params.search = search;
  if (is_active !== '' && is_active !== null && is_active !== undefined) params.is_active = is_active;
  if (is_verified !== '' && is_verified !== null && is_verified !== undefined) params.is_verified = is_verified;
  if (process_id) params.process_id = process_id;
  if (headset_type) params.headset_type = headset_type;
  if (start_date) params.start_date = start_date;
  if (end_date) params.end_date = end_date;

  return api.get('/assignments', { params });
};

export const getPendingPermanentIds = () => api.get('/assignments/pending-permanent-ids');
export const getPendingSignatures = () => api.get('/assignments/pending-signatures');

export const assignHeadset = ({
  headset_id,
  agent_id,
  process_id,
  deposit_amount,
  payment_mode = 'cash',
  receipt_number,
  notes,
  tl_name,
  manager_name,
}) =>
  api.post('/assignments', {
    headset_id,
    agent_id,
    process_id,
    deposit_amount,
    payment_mode,
    receipt_number,
    notes,
    tl_name,
    manager_name,
  });

export const getSignatureStatus = (assignmentId) =>
  api.get(`/assignments/${assignmentId}/signature-status`);



export const getActiveAssignmentByAgent = (agentId) =>
  api.get(`/assignments/active-by-agent/${agentId}`);

export const uploadSignature = ({ assignmentId, signer_role, signer_name, file }) => {
  const fd = new FormData();
  fd.append('signer_role', signer_role);
  if (signer_name) fd.append('signer_name', signer_name);
  fd.append('signature', file);

  return api.post(`/assignments/${assignmentId}/signatures`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const getAssignmentDetails = (assignmentId) =>
  api.get(`/assignments/${assignmentId}/details`);

export const getAssignmentById = (assignmentId) => api.get(`/assignments/${assignmentId}`);