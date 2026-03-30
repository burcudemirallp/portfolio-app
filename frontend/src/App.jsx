import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useToast } from './components/Toast';
import { getPortfolioSummary, fetchAllPrices } from './services/api';
import { useAuth } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import Layout from './components/Layout';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';

const DashboardPage = lazy(() => import('./components/DashboardPage'));
const TransactionsPage = lazy(() => import('./components/TransactionsPage'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const PerformanceAnalysisPage = lazy(() => import('./components/PerformanceAnalysisPage'));
const TWRPage = lazy(() => import('./components/TWRPage'));
const ComparisonPage = lazy(() => import('./components/ComparisonPage'));
const SalesHistoryPage = lazy(() => import('./components/SalesHistoryPage'));
const CashFlowsPage = lazy(() => import('./components/CashFlowsPage'));
const InsightsPage = lazy(() => import('./components/InsightsPage'));

function App() {
  const { user, loading: authLoading } = useAuth();
  const { showSuccess, showError } = useToast();
  const { t } = useLanguage();
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
      await fetchAllPrices();
      showSuccess(t('common.prices.refreshStarted'));
      if (onComplete) {
        await onComplete();
      }
      window.dispatchEvent(new CustomEvent('portfolio-prices-refreshed'));
    } catch (err) {
      console.error('Error refreshing prices:', err);
      showError(t('common.prices.refreshError', { detail: err.response?.data?.detail || err.message }));
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
          <p className="mt-4 text-bnc-textSec">{t('common.loading')}</p>
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
          <p className="mt-4 text-bnc-textSec">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bnc-bg flex items-center justify-center">
        <div className="bg-bnc-red/10 border border-bnc-red/30 rounded-xl p-6 max-w-md">
          <h2 className="text-bnc-red font-semibold mb-2">{t('common.error')}</h2>
          <p className="text-bnc-textSec">{error}</p>
          <button onClick={loadSummary} className="mt-4 bnc-btn-primary">{t('common.retry')}</button>
        </div>
      </div>
    );
  }

  const suspenseFallback = (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bnc-accent" />
    </div>
  );

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
        <Route index element={<Suspense fallback={suspenseFallback}><DashboardPage /></Suspense>} />
        <Route path="portfolio" element={<Suspense fallback={suspenseFallback}><TransactionsPage /></Suspense>} />
        <Route path="performance" element={<Suspense fallback={suspenseFallback}><PerformanceAnalysisPage /></Suspense>} />
        <Route path="twr" element={<Suspense fallback={suspenseFallback}><TWRPage /></Suspense>} />
        <Route path="comparison" element={<Suspense fallback={suspenseFallback}><ComparisonPage /></Suspense>} />
        <Route path="sales" element={<Suspense fallback={suspenseFallback}><SalesHistoryPage /></Suspense>} />
        <Route path="cash-flows" element={<Suspense fallback={suspenseFallback}><CashFlowsPage /></Suspense>} />
        <Route path="insights" element={<Suspense fallback={suspenseFallback}><InsightsPage /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={suspenseFallback}><SettingsPage /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
