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

// ✅ Process Change / Replace Headset (v2)
export const processChangeV2 = ({
  agent_id,
  to_process_id,
  new_headset_id, // optional
  deposit_amount, // ✅ required (editable)
  payment_mode = 'salary_deduction',
  receipt_number = '',
  notes = '',
  tl_name,
  manager_name,

  // ✅ NEW: old headset return info (required by backend when old_headset_received === true)
  old_headset_received = true,
  old_return_condition,
}) => {
  return api.post('/transfers/process-change-v2', {
    agent_id,
    to_process_id,
    new_headset_id: new_headset_id || undefined,
    deposit_amount,
    payment_mode,
    receipt_number: receipt_number?.trim() || undefined,
    notes: notes?.trim() || undefined,
    tl_name,
    manager_name,

    // ✅ send these always to avoid backend defaults breaking frontend
    old_headset_received: Boolean(old_headset_received),
    old_return_condition: Boolean(old_headset_received)
      ? (old_return_condition || 'good')
      : 'lost',
  });
};