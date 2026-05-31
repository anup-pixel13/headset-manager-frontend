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

export const getDashboardStats = (startDate, endDate) => {
  const params = {};
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;

  return api.get('/dashboard/stats', { params });
};

export const getQuickStats = () => api.get('/dashboard/quick-stats');

export const getNotifications = ({ unreadOnly = false, limit = 20 } = {}) => {
  return api.get('/dashboard/notifications', {
    params: { unread_only: unreadOnly ? 'true' : 'false', limit },
  });
};

export const markNotificationRead = (id) => api.patch(`/dashboard/notifications/${id}/read`);

export const markAllNotificationsRead = () => api.patch('/dashboard/notifications/read-all');