import axios from 'axios';
import { getItem, setItem, removeItem, KEYS } from '../utils/storage';

// Simulator uses localhost, physical device needs actual IP
const API_BASE_URL = 'http://192.168.1.147:8000';
const REQUEST_TIMEOUT_MS = 20000;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

// Auth logout callback — set by AuthContext
let onAuthLogout = null;
export const setOnAuthLogout = (cb) => { onAuthLogout = cb; };

export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      setAuthToken(null);
      await removeItem(KEYS.TOKEN);
      await removeItem(KEYS.USER);
      if (onAuthLogout) onAuthLogout();
    }
    return Promise.reject(err);
  }
);

// Auth
export const login = (email, password) => api.post('/auth/login', { email, password });
export const register = (data) => api.post('/auth/register', data);
export const getMe = () => api.get('/auth/me');

// Portfolio
export const getPortfolioSummary = () => api.get('/portfolio/summary');
export const getPortfolioPositions = () => api.get('/portfolio/positions');

// Prices
export const fetchAllPrices = () => api.post('/prices/fetch-all');
export const fetchPrice = (instrumentId) => api.post(`/prices/fetch/${instrumentId}`);
export const updateManualPrice = (instrumentId, price) => api.post('/prices/manual', { instrument_id: instrumentId, price });

// FX
export const getFxRates = () => api.get('/fx/rates');

// Instruments
export const getInstruments = () => api.get('/instruments');
export const createInstrument = (data) => api.post('/instruments', data);
export const updateInstrument = (id, data) => api.put(`/instruments/${id}`, data);
export const deleteInstrument = (id) => api.delete(`/instruments/${id}`);

// Transactions
export const createTransaction = (data) => api.post('/transactions', data);
export const updateTransaction = (id, data) => api.put(`/transactions/${id}`, data);
export const deleteTransaction = (id) => api.delete(`/transactions/${id}`);
export const updateCashFlowNote = (id, note) => api.patch(`/transactions/${id}/cash-flow-note`, { note });
export const updateCashFlowAmount = (id, amount) => api.patch(`/transactions/${id}/cash-flow-amount`, { amount });

// Cash Flows (TWR)
export const getCashFlows = () => api.get('/cash-flows');
export const createCashFlow = (data) => api.post('/cash-flows', data);
export const updateCashFlow = (id, data) => api.put(`/cash-flows/${id}`, data);
export const deleteCashFlow = (id) => api.delete(`/cash-flows/${id}`);
export const getDebugTransactions = () => api.get('/debug/transactions');

// Brokers
export const getBrokers = () => api.get('/brokers');
export const createBroker = (data) => api.post('/brokers', data);
export const updateBroker = (id, data) => api.put(`/brokers/${id}`, data);
export const deleteBroker = (id) => api.delete(`/brokers/${id}`);

// Accounts
export const getAccounts = () => api.get('/accounts');
export const createAccount = (data) => api.post('/accounts', data);
export const updateAccount = (id, data) => api.put(`/accounts/${id}`, data);
export const deleteAccount = (id) => api.delete(`/accounts/${id}`);

// Portfolio Snapshots & Performance
export const createPortfolioSnapshot = () => api.post('/portfolio/snapshot');
export const getPortfolioPerformance = (period) => api.get(`/portfolio/performance/${period}`);
export const getPortfolioTWR = () => api.get('/portfolio/twr');
export const getTWRComparison = () => api.get('/portfolio/twr/comparison');
export const getPortfolioSnapshots = (limit = 30) => api.get(`/portfolio/snapshots?limit=${limit}`);
export const getSnapshotDetail = (snapshotId) => api.get(`/portfolio/snapshot/${snapshotId}`);
export const compareSnapshots = (snapshotId1, snapshotId2) => api.get(`/portfolio/compare/${snapshotId1}/${snapshotId2}`);
export const deleteSnapshot = (snapshotId) => api.delete(`/portfolio/snapshot/${snapshotId}`);
export const deleteAllSnapshots = () => api.delete('/portfolio/snapshots/all');

// AI Assistant
export const getAIStatus = async () => {
  try {
    const response = await api.get('/ai/status');
    return response.data;
  } catch {
    return { available: false, status: 'error' };
  }
};
export const chatWithAI = async (payload) => {
  const response = await api.post('/ai/chat', payload);
  return response.data;
};
export const getQuickAnalysis = async () => {
  const response = await api.post('/ai/quick-analysis');
  return response.data;
};

// Sale Records
export const getSaleRecords = () => api.get('/sales');
export const createSaleRecord = (data) => api.post('/sales', data);
export const deleteSaleRecord = (id) => api.delete(`/sales/${id}`);

// Price Alerts
export const getAlerts = () => api.get('/alerts');
export const getTriggeredAlerts = () => api.get('/alerts/triggered');
export const createAlert = (data) => api.post('/alerts', data);
export const deleteAlert = (id) => api.delete(`/alerts/${id}`);
export const toggleAlert = (id) => api.patch(`/alerts/${id}/toggle`);

// Scheduler
export const getSchedulerStatus = () => api.get('/scheduler/status');

// Scanner
export const getBistSymbols = () => api.get('/scanner/bist-symbols');
export const runBistEmaScan = (body = {}) => api.post('/scanner/bist-ema', body);

// Admin
export const getAdminUsers = () => api.get('/admin/users');
export const deleteAdminUser = (userId) => api.delete(`/admin/users/${userId}`);
export const toggleUserAdmin = (userId) => api.patch(`/admin/users/${userId}/admin`);
export const adminSwitchUser = (userId) => api.post('/admin/switch-user', { user_id: userId });

// Notifications
export const getNotifications = (unreadOnly = false) => api.get(`/notifications?unread_only=${unreadOnly}`);
export const getUnreadCount = () => api.get('/notifications/unread-count');
export const markNotificationRead = (id, isRead = true) => api.patch(`/notifications/${id}/read`, { is_read: isRead });
export const markAllNotificationsRead = () => api.patch('/notifications/read-all');
export const deleteNotification = (id) => api.delete(`/notifications/${id}`);

export default api;
