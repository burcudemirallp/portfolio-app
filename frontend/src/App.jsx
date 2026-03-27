import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useToast } from './components/Toast';
import { getPortfolioSummary, fetchAllPrices } from './services/api';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import TransactionsPage from './components/TransactionsPage';
import SettingsPage from './components/SettingsPage';
import PerformanceAnalysisPage from './components/PerformanceAnalysisPage';
import TWRPage from './components/TWRPage';
import ComparisonPage from './components/ComparisonPage';
import SalesHistoryPage from './components/SalesHistoryPage';
import ScannerPage from './components/ScannerPage';
import AlertsPage from './components/AlertsPage';
import NotificationsPage from './components/NotificationsPage';
import DashboardPage from './components/DashboardPage';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';

function App() {
  const { user, loading: authLoading } = useAuth();
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [darkMode, setDarkMode] = useState(true);

  const loadSummary = async () => {
    setLoading(true);
    try {
      setError(null);
      await getPortfolioSummary();
    } catch (err) {
      if (err.response?.status === 401) {
        setError(null);
        return;
      }
      setError(err.message);
      console.error('Error loading summary:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshPrices = async (onComplete) => {
    setRefreshing(true);
    try {
      const response = await fetchAllPrices();
      await loadSummary();

      if (onComplete) {
        await onComplete();
      }
      window.dispatchEvent(new CustomEvent('portfolio-prices-refreshed'));

      const result = response.data;
      let msg = `Fiyatlar güncellendi! ${result.success_count}/${result.total} başarılı (${result.duration_seconds}s)`;
      if (result.failed_count > 0) {
        msg += ` - ${result.failed_count} başarısız`;
      }
      showSuccess(msg);
    } catch (err) {
      console.error('Error refreshing prices:', err);
      showError('Fiyatlar güncellenirken hata oluştu: ' + (err.response?.data?.detail || err.message));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      setError(null);
      loadSummary();
    } else {
      setLoading(false);
    }
  }, [user]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-bnc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-bnc-accent mx-auto"></div>
          <p className="mt-4 text-bnc-textSec">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bnc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-bnc-accent mx-auto"></div>
          <p className="mt-4 text-bnc-textSec">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bnc-bg flex items-center justify-center">
        <div className="bg-bnc-red/10 border border-bnc-red/30 rounded-xl p-6 max-w-md">
          <h2 className="text-bnc-red font-semibold mb-2">Hata</h2>
          <p className="text-bnc-textSec">{error}</p>
          <button onClick={loadSummary} className="mt-4 bnc-btn-primary">Tekrar Dene</button>
        </div>
      </div>
    );
  }

  // Logged in - main layout with routes
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/register" element={<Navigate to="/" replace />} />
      <Route
        path="/"
        element={
          <Layout
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((d) => !d)}
            onRefreshPrices={handleRefreshPrices}
            refreshing={refreshing}
            onLoadSummary={loadSummary}
          />
        }
      >
        <Route index element={<DashboardPage />} />
        <Route
          path="portfolio"
          element={
            <TransactionsPage
              onRefreshPrices={handleRefreshPrices}
              refreshing={refreshing}
            />
          }
        />
        <Route path="performance" element={<PerformanceAnalysisPage />} />
        <Route path="twr" element={<TWRPage />} />
        <Route path="comparison" element={<ComparisonPage />} />
        <Route path="sales" element={<SalesHistoryPage />} />
        <Route path="scanner" element={<ScannerPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
