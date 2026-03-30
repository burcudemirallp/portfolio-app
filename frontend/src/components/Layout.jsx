import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Briefcase, TrendingUp, Activity, Scale,
  History, Settings, LogOut, Menu, X,
  RefreshCw, ChevronDown, Plus, Camera, Download, DollarSign,
  Bell, Check, CheckCheck, Trash2, Lightbulb,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  getAdminUsers, adminSwitchUser, getFxRates, getPortfolioSummary,
  createPortfolioSnapshot, getDebugTransactions, getInstruments, getAccounts,
  getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead, deleteNotification,
} from '../services/api';
import { useToast } from './Toast';

import TransactionForm from './TransactionForm';
import ProductTour, { shouldRunTour } from './ProductTour';

const navItems = [
  { to: '/', icon: LayoutDashboard, labelKey: 'layout.nav.dashboard' },
  { to: '/portfolio', icon: Briefcase, labelKey: 'layout.nav.portfolio' },
  { to: '/performance', icon: TrendingUp, labelKey: 'layout.nav.performance' },
  { to: '/twr', icon: Activity, labelKey: 'layout.nav.twr' },
  { to: '/comparison', icon: Scale, labelKey: 'layout.nav.comparison' },
  { to: '/sales', icon: History, labelKey: 'layout.nav.sales' },
  { to: '/cash-flows', icon: DollarSign, labelKey: 'layout.nav.cashFlows' },
  { to: '/insights', icon: Lightbulb, labelKey: 'layout.nav.insights' },
  { to: '/settings', icon: Settings, labelKey: 'layout.nav.settings' },
];

export default function Layout({
  darkMode,
  onToggleDarkMode,
  onRefreshPrices,
  refreshing,
  onLoadSummary,
}) {
  const { user, logout, switchToUser } = useAuth();
  const { showError, showSuccess } = useToast();
  const { t, locale } = useLanguage();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [fxRates, setFxRates] = useState({ USDTRY: null, EURTRY: null });
  const [lastUpdate, setLastUpdate] = useState(null);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);
  const notifRef = useRef(null);
  const [runTour, setRunTour] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (shouldRunTour()) setRunTour(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const loadMarketInfo = () => {
    getFxRates().then(r => {
      if (r?.data) setFxRates({ USDTRY: r.data.USDTRY ?? null, EURTRY: r.data.EURTRY ?? null });
    }).catch(() => {});
    getPortfolioSummary().then(r => {
      const ts = r?.data?.metadata?.last_price_update_at;
      if (ts) setLastUpdate(ts);
    }).catch(() => {});
  };

  useEffect(() => {
    loadMarketInfo();
    const handler = () => loadMarketInfo();
    window.addEventListener('portfolio-prices-refreshed', handler);
    return () => window.removeEventListener('portfolio-prices-refreshed', handler);
  }, []);

  const notifFailCountRef = useRef(0);
  const loadNotifications = () => {
    Promise.all([
      getNotifications().then(r => setNotifications(Array.isArray(r?.data) ? r.data : [])),
      getUnreadCount().then(r => setUnreadCount(r?.data?.unread_count ?? 0)),
    ]).then(() => { notifFailCountRef.current = 0; })
      .catch(() => { notifFailCountRef.current = Math.min(notifFailCountRef.current + 1, 5); });
  };

  useEffect(() => {
    loadNotifications();
    const id = setInterval(() => {
      loadNotifications();
    }, 15000 * Math.pow(2, notifFailCountRef.current));
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (user?.is_admin) {
      getAdminUsers()
        .then((res) => setAdminUsers(Array.isArray(res?.data) ? res.data : []))
        .catch(() => setAdminUsers([]));
    }
  }, [user?.is_admin]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setAccountOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    if (accountOpen || notifOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [accountOpen, notifOpen]);

  const handleSwitchToUser = async (targetUserId) => {
    if (targetUserId === user?.id) return;
    setAccountOpen(false);
    try {
      const res = await adminSwitchUser(targetUserId);
      switchToUser(res.data.access_token, res.data.user);
      showSuccess(t('layout.admin.switchSuccess', { name: res.data.user?.username || res.data.user?.email }));
    } catch (err) {
      showError(err.response?.data?.detail || t('layout.admin.switchError'));
    }
  };


  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id, true);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) { console.error('Bildirim okundu yapılamadı', e); }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (e) { console.error('Bildirimler okundu yapılamadı', e); }
  };

  const handleDeleteNotif = async (id) => {
    try {
      const n = notifications.find(x => x.id === id);
      await deleteNotification(id);
      setNotifications(prev => prev.filter(x => x.id !== id));
      if (n && !n.is_read) setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) { console.error('Bildirim silinemedi', e); }
  };

  const handleCreateSnapshot = async () => {
    setCreatingSnapshot(true);
    try {
      const res = await createPortfolioSnapshot();
      showSuccess(t('layout.snapshot.success', { count: res.data.total_positions }));
    } catch (err) {
      showError(t('layout.snapshot.error', { detail: err.response?.data?.detail || err.message }));
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const [txRes, instRes, accRes, fxRes] = await Promise.all([
        getDebugTransactions(), getInstruments(), getAccounts(), getFxRates(),
      ]);
      const txList = (Array.isArray(txRes?.data) ? txRes.data : []).filter(tx => tx.type !== 'sell' && !tx.is_sold);
      const instList = Array.isArray(instRes?.data) ? instRes.data : [];
      const accList = Array.isArray(accRes?.data) ? accRes.data : [];
      const rates = { USDTRY: fxRes?.data?.USDTRY ?? 1, EURTRY: fxRes?.data?.EURTRY ?? 1 };
      const instMap = new Map(instList.map(i => [i.id, i]));

      const headers = [t('layout.csv.headers.date'),t('layout.csv.headers.instrument'),t('layout.csv.headers.quantity'),t('layout.csv.headers.buyPrice'),t('layout.csv.headers.currency'),t('layout.csv.headers.currentPriceTry'),t('layout.csv.headers.currentValueTry'),t('layout.csv.headers.totalCostTry'),t('layout.csv.headers.plTry'),t('layout.csv.headers.plPct'),t('layout.csv.headers.account')];
      const rows = txList.map(tx => {
        const inst = instMap.get(tx.instrument_id);
        const acc = accList.find(a => a.id === tx.account_id);
        const cur = tx.currency?.toUpperCase() || 'TRY';
        const fx = cur === 'USD' ? rates.USDTRY : cur === 'EUR' ? rates.EURTRY : 1;
        const costTRY = ((tx.quantity || 0) * (tx.price || 0) + (tx.fees || 0)) * fx;
        const priceTRY = inst?.last_price_try || 0;
        const mktVal = priceTRY * (tx.quantity || 0);
        const pl = mktVal - costTRY;
        const plPct = costTRY > 0 ? (pl / costTRY * 100) : 0;
        return [
          new Date(tx.timestamp).toLocaleString(locale),
          inst ? inst.symbol : `ID: ${tx.instrument_id}`,
          tx.quantity || 0, tx.price || 0, tx.currency || 'TRY',
          priceTRY.toFixed(2), mktVal.toFixed(2), costTRY.toFixed(2),
          pl.toFixed(2), plPct.toFixed(2), acc?.name || '',
        ];
      });

      const csv = [headers.join(','), ...rows.map(r => r.map(c => {
        const s = String(c);
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','))].join('\n');

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${t('layout.csv.filenamePrefix')}-${new Date().toISOString().split('T')[0]}.csv`;
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showSuccess(t('layout.csv.success'));
    } catch (err) {
      showError(t('layout.csv.error', { detail: err.response?.data?.detail || err.message }));
    }
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const closeSidebar = () => setSidebarOpen(false);
  const displayName = user?.username || user?.email || t('layout.user.fallback');
  const initial = displayName[0].toUpperCase();
  const canSwitch = user?.is_admin;

  return (
    <div className="min-h-screen bg-bnc-bg flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={closeSidebar} aria-hidden="true" />
      )}

      {/* Sidebar - navigation only */}
      <aside data-tour="sidebar" className={`fixed lg:static inset-y-0 left-0 z-50 w-56 bg-bnc-surface border-r border-bnc-border flex flex-col transition-transform duration-200 lg:transition-none ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-bnc-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-bnc-accent flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-bnc-bg" />
            </div>
            <span className="text-sm font-bold text-bnc-textPri tracking-wide">{t('layout.brand')}</span>
          </div>
          <button onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-bnc-surfaceAlt text-bnc-textTer" aria-label={t('common.close')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          <ul className="space-y-0.5 px-2">
            {navItems.map(({ to, icon: Icon, labelKey }) => (
              <li key={to}>
                <NavLink to={to} end={to === '/'} onClick={closeSidebar}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                      isActive
                        ? 'bg-bnc-accent/15 text-bnc-accent'
                        : 'text-bnc-textSec hover:bg-bnc-surfaceAlt hover:text-bnc-textPri'
                    }`
                  }>
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                  {t(labelKey)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col overflow-auto">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-2.5 bg-bnc-surface border-b border-bnc-border">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-bnc-surfaceAlt text-bnc-textTer" aria-label="Open menu">
              <Menu className="w-5 h-5" />
            </button>
            <div className="lg:hidden flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-bnc-accent flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-bnc-bg" />
              </div>
              <span className="text-sm font-bold text-bnc-textPri">{t('layout.brand')}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Market info */}
            <div className="hidden md:flex items-center gap-3 text-[11px]">
              {fxRates.USDTRY != null && (
                <span className="text-bnc-textTer">USD/TRY <span className="text-bnc-accent font-semibold">{fxRates.USDTRY.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span></span>
              )}
              {fxRates.EURTRY != null && (
                <span className="text-bnc-textTer">EUR/TRY <span className="text-bnc-accent font-semibold">{fxRates.EURTRY.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span></span>
              )}
              {lastUpdate && (
                <span className="text-bnc-textTer">
                  {new Date(lastUpdate).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}{' '}
                  {new Date(lastUpdate).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            <div className="hidden md:block w-px h-5 bg-bnc-border" />

            {/* Action buttons */}
            <button data-tour="new-transaction" onClick={() => setShowTransactionForm(true)}
              className="p-1.5 sm:p-2 rounded-lg bg-bnc-accent text-bnc-bg hover:bg-bnc-accentHover transition-colors"
              title={t('layout.action.newPurchase')}>
              <Plus className="w-4 h-4" />
            </button>
            <div data-tour="snapshot-csv" className="flex items-center gap-1 sm:gap-2">
              <button onClick={handleCreateSnapshot} disabled={creatingSnapshot}
                className="p-1.5 sm:p-2 rounded-lg bg-bnc-surfaceAlt text-bnc-textSec hover:bg-bnc-border disabled:opacity-50 transition-colors"
                title={t('layout.action.snapshot')}>
                <Camera className={`w-4 h-4 ${creatingSnapshot ? 'animate-pulse' : ''}`} />
              </button>
              <button onClick={handleExportCSV}
                className="hidden sm:block p-2 rounded-lg bg-bnc-surfaceAlt text-bnc-textSec hover:bg-bnc-border transition-colors"
                title={t('layout.action.downloadCsv')}>
                <Download className="w-4 h-4" />
              </button>
            </div>

            <div className="hidden sm:block w-px h-5 bg-bnc-border" />

            {/* Refresh prices */}
            {onRefreshPrices && (
              <button data-tour="refresh-prices" onClick={() => onRefreshPrices(onLoadSummary)} disabled={refreshing}
                className="p-1.5 sm:p-2 rounded-lg bg-bnc-accent/10 text-bnc-accent hover:bg-bnc-accent/20 disabled:opacity-50 transition-colors"
                title={t('layout.action.refreshPrices')}>
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            )}

            {/* Notification bell */}
            <div data-tour="notifications" className="relative" ref={notifRef}>
              <button onClick={() => { setNotifOpen(v => !v); if (!notifOpen) loadNotifications(); }}
                className="relative p-1.5 sm:p-2 rounded-lg bg-bnc-surfaceAlt text-bnc-textSec hover:bg-bnc-border transition-colors"
                title={t('layout.notifications.title')} aria-label={t('layout.notifications.title')}>
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-bnc-red text-white text-[9px] font-bold px-1">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-80 sm:w-96 bg-bnc-surface border border-bnc-border rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-bnc-border">
                    <h3 className="text-sm font-semibold text-bnc-textPri">{t('layout.notifications.title')}</h3>
                    {unreadCount > 0 && (
                      <button onClick={handleMarkAllRead}
                        className="text-[10px] text-bnc-accent hover:text-bnc-accentHover font-medium flex items-center gap-1">
                        <CheckCheck className="w-3 h-3" /> {t('layout.notifications.markAllRead')}
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-bnc-border">
                    {notifications.length === 0 ? (
                      <div className="py-10 text-center">
                        <Bell className="w-8 h-8 mx-auto text-bnc-textTer/40 mb-2" />
                        <p className="text-xs text-bnc-textTer">{t('layout.notifications.empty')}</p>
                      </div>
                    ) : notifications.map(n => (
                      <div key={n.id} className={`px-4 py-3 hover:bg-bnc-surfaceAlt/40 transition-colors group ${!n.is_read ? 'bg-bnc-accent/5' : ''}`}>
                        <div className="flex items-start gap-2.5">
                          <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${!n.is_read ? 'bg-bnc-accent' : 'bg-transparent'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-bnc-textPri">{n.title}</p>
                            <p className="text-[11px] text-bnc-textSec mt-0.5 whitespace-pre-line leading-relaxed">{n.message}</p>
                            <p className="text-[10px] text-bnc-textTer mt-1">
                              {new Date(n.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}{' '}
                              {new Date(n.created_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!n.is_read && (
                              <button onClick={() => handleMarkRead(n.id)}
                                className="p-1 rounded text-bnc-textTer hover:text-bnc-accent" title={t('layout.notifications.markRead')} aria-label={t('layout.notifications.markRead')}>
                                <Check className="w-3 h-3" />
                              </button>
                            )}
                            <button onClick={() => handleDeleteNotif(n.id)}
                              className="p-1 rounded text-bnc-textTer hover:text-bnc-red" title={t('layout.notifications.delete')} aria-label={t('layout.notifications.delete')}>
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Account dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setAccountOpen(v => !v)}
                className="flex items-center gap-1.5 sm:gap-2 px-1.5 sm:px-2 py-1.5 rounded-lg hover:bg-bnc-surfaceAlt transition-colors">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold bg-bnc-surfaceAlt text-bnc-textPri">
                  {initial}
                </div>
                <p className="hidden sm:block text-xs font-medium text-bnc-textPri leading-tight">{displayName}</p>
                <ChevronDown className={`w-3.5 h-3.5 text-bnc-textTer transition-transform ${accountOpen ? 'rotate-180' : ''}`} />
              </button>

              {accountOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-56 bg-bnc-surface border border-bnc-border rounded-xl shadow-2xl overflow-hidden z-50">
                  {/* Current user header */}
                  <div className="px-3.5 py-3 border-b border-bnc-border">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold bg-bnc-surfaceAlt text-bnc-textPri">
                        {initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-bnc-textPri truncate">{displayName}</p>
                        <p className="text-[11px] text-bnc-textTer truncate">{user?.email}</p>
                      </div>
                    </div>
                  </div>

                  {/* Switch accounts */}
                  {canSwitch && (
                    <div className="py-1 border-b border-bnc-border">
                      <p className="px-3.5 py-1.5 text-[10px] font-semibold text-bnc-textTer uppercase tracking-wider">{t('layout.admin.switchSection')}</p>
                      {user?.is_admin && adminUsers.filter(u => u.id !== user?.id).map(u => (
                        <button key={u.id} onClick={() => handleSwitchToUser(u.id)}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-bnc-textSec hover:bg-bnc-surfaceAlt transition-colors group">
                          <div className="w-5 h-5 rounded-full bg-bnc-border flex items-center justify-center text-[10px] font-bold text-bnc-textTer">
                            {(u.username || u.email || 'U')[0].toUpperCase()}
                          </div>
                          <span className="flex-1 text-left truncate group-hover:text-bnc-textPri">{u.username || u.email}</span>
                          {u.is_admin && <span className="text-[10px] text-bnc-textTer">{t('layout.admin.role')}</span>}
                        </button>
                      ))}
                      {user?.is_admin && adminUsers.filter(u => u.id !== user?.id).length === 0 && (
                        <p className="px-3.5 py-2 text-xs text-bnc-textTer">{t('layout.admin.noOtherUsers')}</p>
                      )}
                    </div>
                  )}

                  {/* Logout */}
                  <div className="py-1">
                    <button onClick={() => { setAccountOpen(false); logout(); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-bnc-red hover:bg-bnc-red/10 transition-colors font-medium">
                      <LogOut className="w-3.5 h-3.5" />
                      {t('layout.logout')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 p-4 lg:p-6">
          <Outlet context={{ onRefreshPrices, refreshing, onLoadSummary }} />
        </div>
      </main>

      {showTransactionForm && (
        <TransactionForm
          onClose={() => setShowTransactionForm(false)}
          onSuccess={() => {
            setShowTransactionForm(false);
            window.dispatchEvent(new CustomEvent('portfolio-transaction-created'));
          }}
        />
      )}

      <ProductTour run={runTour} onFinish={() => setRunTour(false)} />
    </div>
  );
}
