import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('hs_session_token');
  if (token) config.headers['X-Session-Token'] = token;
  return config;
});

export const generateDepositFormPdf = (assignmentId) => {
  return api.post(`/pdf/deposit-form/${assignmentId}`);
};

// keep only if you still use process change PDFs
export const generateProcessChangeFormPdf = (depositId) => {
  return api.post(`/pdf/process-change-form/${depositId}`);
};