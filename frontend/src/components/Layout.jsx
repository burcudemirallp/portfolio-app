import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Briefcase, TrendingUp, Activity, Scale,
  History, Search, Bell, BellRing, Settings, LogOut, Menu, X,
  RefreshCw, Users, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getAdminUsers, adminSwitchUser } from '../services/api';
import { useToast } from './Toast';
import AIAssistant from './AIAssistant';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/portfolio', icon: Briefcase, label: 'Portföy' },
  { to: '/performance', icon: TrendingUp, label: 'Performans' },
  { to: '/twr', icon: Activity, label: 'TWR' },
  { to: '/comparison', icon: Scale, label: 'Karşılaştırma' },
  { to: '/sales', icon: History, label: 'Satış Geçmişi' },
  { to: '/scanner', icon: Search, label: 'Tarayıcı' },
  { to: '/alerts', icon: Bell, label: 'Alarmlar' },
  { to: '/notifications', icon: BellRing, label: 'Bildirimler' },
  { to: '/settings', icon: Settings, label: 'Ayarlar' },
];

export default function Layout({
  darkMode,
  onToggleDarkMode,
  onRefreshPrices,
  refreshing,
  onLoadSummary,
}) {
  const { user, logout, switchToUser, switchBackToAdmin, isActingAs } = useAuth();
  const { showError, showSuccess } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [switchDropdownOpen, setSwitchDropdownOpen] = useState(false);

  useEffect(() => {
    if (user?.is_admin) {
      getAdminUsers()
        .then((res) => setAdminUsers(Array.isArray(res?.data) ? res.data : []))
        .catch(() => setAdminUsers([]));
    }
  }, [user?.is_admin]);

  const handleSwitchToUser = async (targetUserId) => {
    if (targetUserId === user?.id) return;
    setSwitchDropdownOpen(false);
    try {
      const res = await adminSwitchUser(targetUserId);
      switchToUser(res.data.access_token, res.data.user);
      showSuccess(`${res.data.user?.username || res.data.user?.email} hesabına geçildi`);
    } catch (err) {
      showError(err.response?.data?.detail || 'Hesaba geçilemedi');
    }
  };

  const handleSwitchBackToAdmin = () => {
    setSwitchDropdownOpen(false);
    switchBackToAdmin();
    showSuccess("Admin hesabına dönüldü");
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

  return (
    <div className="min-h-screen bg-bnc-bg flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={closeSidebar} aria-hidden="true" />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-60 bg-bnc-surface border-r border-bnc-border flex flex-col transition-transform duration-200 lg:transition-none ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-bnc-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-bnc-accent flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-bnc-bg" />
            </div>
            <span className="text-sm font-bold text-bnc-textPri tracking-wide">PORTFOLIO</span>
          </div>
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-bnc-surfaceAlt text-bnc-textTer" aria-label="Toggle menu">
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          <ul className="space-y-0.5 px-2">
            {navItems.map(({ to, icon: Icon, label }) => (
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
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-3 border-t border-bnc-border space-y-2">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-bnc-surfaceAlt">
            <div className="w-7 h-7 rounded-full bg-bnc-accent flex items-center justify-center text-bnc-bg text-xs font-bold">
              {(user?.username || user?.email || 'U')[0].toUpperCase()}
            </div>
            <p className="text-xs font-medium text-bnc-textPri truncate flex-1">
              {user?.username || user?.email || 'Kullanıcı'}
            </p>
          </div>

          {(user?.is_admin || isActingAs()) && (
            <div className="relative">
              <button type="button" onClick={() => setSwitchDropdownOpen((v) => !v)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-bnc-surfaceAlt text-bnc-textSec text-xs font-medium hover:bg-bnc-border transition-colors">
                <Users className="w-3.5 h-3.5" />
                Hesaba geç
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${switchDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {switchDropdownOpen && (
                <>
                  <div className="absolute bottom-full left-0 right-0 mb-1 py-1 bg-bnc-surface border border-bnc-border rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                    {isActingAs() && (
                      <button type="button" onClick={handleSwitchBackToAdmin}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-bnc-accent hover:bg-bnc-surfaceAlt">
                        ← Admin'e dön
                      </button>
                    )}
                    {user?.is_admin && adminUsers.filter((u) => u.id !== user?.id).map((u) => (
                      <button key={u.id} type="button" onClick={() => handleSwitchToUser(u.id)}
                        className="w-full px-3 py-2 text-left text-xs text-bnc-textSec hover:bg-bnc-surfaceAlt truncate">
                        {u.username || u.email} {u.is_admin ? '(admin)' : ''}
                      </button>
                    ))}
                    {user?.is_admin && adminUsers.filter((u) => u.id !== user?.id).length === 0 && !isActingAs() && (
                      <p className="px-3 py-2 text-xs text-bnc-textTer">Başka kullanıcı yok</p>
                    )}
                  </div>
                  <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setSwitchDropdownOpen(false)} />
                </>
              )}
            </div>
          )}

          <div className="flex gap-1.5">
            {onRefreshPrices && (
              <button onClick={() => onRefreshPrices(onLoadSummary)} disabled={refreshing}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-bnc-accent text-bnc-bg hover:bg-bnc-accentHover disabled:opacity-50 transition-colors text-xs font-semibold">
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? '...' : 'Güncelle'}
              </button>
            )}
            <button onClick={logout}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-bnc-surfaceAlt text-bnc-textTer hover:bg-bnc-border hover:text-bnc-red transition-colors"
              title="Çıkış yap">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto">
        {isActingAs() && (
          <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-1.5 bg-bnc-accent/10 border-b border-bnc-accent/20 text-bnc-accent text-xs">
            <span className="font-medium flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 flex-shrink-0" />
              {user?.username || user?.email} olarak görüntüleniyorsunuz
            </span>
            <button type="button" onClick={handleSwitchBackToAdmin}
              className="px-2.5 py-1 rounded-md bg-bnc-accent text-bnc-bg font-semibold hover:bg-bnc-accentHover transition-colors text-xs">
              Admin'e dön
            </button>
          </div>
        )}

        <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-bnc-surface border-b border-bnc-border">
          <button onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-bnc-surfaceAlt text-bnc-textTer" aria-label="Open menu">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-bnc-accent flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-bnc-bg" />
            </div>
            <span className="text-sm font-bold text-bnc-textPri">PORTFOLIO</span>
          </div>
        </div>

        <div className="p-4 lg:p-6">
          <Outlet context={{ onRefreshPrices, refreshing, onLoadSummary }} />
        </div>
      </main>

      <AIAssistant />
    </div>
  );
}
