import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, X, Check, Search, Users,
  Wallet, Package, Camera, RefreshCw, Clock, Target,
} from 'lucide-react';
import {
  getAccounts, createAccount, updateAccount, deleteAccount,
  getInstruments, createInstrument, updateInstrument, deleteInstrument,
  getPortfolioSnapshots, deleteSnapshot,
  getAdminUsers, updateAdminUser, deleteAdminUser, toggleUserAdmin,
  fetchPrice, updateManualPrice,
  getModelPortfolio, updateModelPortfolio,
} from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from './Toast';


const FormRow = ({ children }) => <div className="px-4 py-3 bg-bnc-surfaceAlt/30 border-b border-bnc-border">{children}</div>;

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { language, setLanguage, t, locale } = useLanguage();
  const { showSuccess, showError } = useToast();
  const [tab, setTab] = useState('instruments');
  const [search, setSearch] = useState('');

  const fmt = useCallback((v) => v == null ? '-' : new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v), [locale]);
  const fmtDate = useCallback((d) => d ? new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-', [locale]);

  const tabs = useMemo(() => [
    { id: 'instruments', icon: Package, label: t('settings.tabs.instruments') },
    { id: 'accounts', icon: Wallet, label: t('settings.tabs.accounts') },
    { id: 'snapshots', icon: Camera, label: t('settings.tabs.snapshots') },
    { id: 'model-portfolio', icon: Target, label: t('settings.tabs.modelPortfolio') },
    { id: 'users', icon: Users, label: t('settings.tabs.users') },
  ], [t]);

  const [accounts, setAccounts] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);

  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [manualPriceId, setManualPriceId] = useState(null);
  const [manualPriceVal, setManualPriceVal] = useState('');
  const [modelTargets, setModelTargets] = useState([]);
  const [modelSaving, setModelSaving] = useState(false);

  const load = useCallback(async (section) => {
    setLoading(true);
    try {
      if (section === 'accounts') { const r = await getAccounts(); setAccounts(r.data || []); }
      else if (section === 'instruments') { const r = await getInstruments(); setInstruments(r.data || []); }
      else if (section === 'snapshots') { const r = await getPortfolioSnapshots(200); setSnapshots(r.data || []); }
      else if (section === 'model-portfolio') { const r = await getModelPortfolio(); setModelTargets(r.data || []); }
      else if (section === 'users' && user?.is_admin) { const r = await getAdminUsers(); setUsers(r.data || []); }
    } catch { showError(t('settings.error.loadFailed')); }
    finally { setLoading(false); }
  }, [user?.is_admin, showError, t]);

  useEffect(() => { load(tab); setShowForm(false); setSearch(''); }, [tab, load]);

  const startAdd = (defaults = {}) => { setEditingItem(null); setFormData(defaults); setShowForm(true); };
  const startEdit = (item) => { setEditingItem(item); setFormData({ ...item }); setShowForm(true); };
  const cancelForm = () => { setShowForm(false); setEditingItem(null); setFormData({}); };

  const save = async (section, createFn, updateFn) => {
    try {
      if (editingItem) await updateFn(editingItem.id, formData);
      else await createFn(formData);
      showSuccess(editingItem ? t('settings.toast.updated') : t('settings.toast.created'));
      cancelForm(); load(section);
    } catch (e) { showError(e.response?.data?.detail || t('common.error')); }
  };

  const del = async (section, deleteFn, id, labelKey) => {
    const label = t(labelKey);
    if (!confirm(t('settings.confirmDelete', { label }))) return;
    try { await deleteFn(id); showSuccess(t('settings.toast.deleted')); load(section); }
    catch { showError(t('settings.error.deleteFailed')); }
  };

  const handleRefreshPrice = async (id) => {
    setRefreshingId(id);
    try { await fetchPrice(id); showSuccess(t('settings.toast.priceUpdated')); load('instruments'); }
    catch { showError(t('settings.error.updateFailed')); }
    finally { setRefreshingId(null); }
  };

  const handleManualPrice = async (id) => {
    const price = parseFloat(manualPriceVal);
    if (isNaN(price) || price <= 0) { showError(t('settings.error.invalidPrice')); return; }
    try {
      await updateManualPrice(id, price);
      showSuccess(t('settings.toast.priceUpdated'));
      setManualPriceId(null);
      setManualPriceVal('');
      load('instruments');
    } catch { showError(t('settings.error.updateFailed')); }
  };

  const filteredInstruments = useMemo(() => {
    if (!search) return instruments;
    const q = search.toLowerCase();
    return instruments.filter(i =>
      (i.symbol || '').toLowerCase().includes(q) ||
      (i.asset_type || '').toLowerCase().includes(q) || (i.market || '').toLowerCase().includes(q)
    );
  }, [instruments, search]);

  const filteredAccounts = useMemo(() => {
    if (!search) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(a => (a.name || '').toLowerCase().includes(q));
  }, [accounts, search]);

  const filteredSnapshots = useMemo(() => {
    if (!search) return snapshots;
    const q = search.toLowerCase();
    return snapshots.filter(s => fmtDate(s.snapshot_date).toLowerCase().includes(q));
  }, [snapshots, search, fmtDate]);

  const visibleTabs = tabs.filter(tabItem => tabItem.id !== 'users' || user?.is_admin);

  return (
    <div className="flex gap-4 min-h-[calc(100vh-120px)]">
      {/* Sidebar tabs */}
      <div className="hidden md:flex flex-col w-48 shrink-0">
        <div className="bnc-card overflow-hidden sticky top-4">
          {visibleTabs.map(tabItem => (
            <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
              className={`w-full flex items-center gap-2.5 px-4 py-3 text-xs font-medium transition-colors border-l-2 ${
                tab === tabItem.id
                  ? 'bg-bnc-accent/10 text-bnc-accent border-bnc-accent'
                  : 'text-bnc-textSec hover:bg-bnc-surfaceAlt/50 hover:text-bnc-textPri border-transparent'
              }`}>
              <tabItem.icon className="w-4 h-4" />
              {tabItem.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-bnc-surface border-t border-bnc-border flex">
        {visibleTabs.map(tabItem => (
          <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] ${
              tab === tabItem.id ? 'text-bnc-accent' : 'text-bnc-textTer'
            }`}>
            <tabItem.icon className="w-4 h-4" />
            {tabItem.label.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Language toggle */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs text-bnc-textSec font-medium">{t('settings.language')}</span>
          <div className="flex rounded-lg overflow-hidden border border-bnc-border">
            <button
              type="button"
              onClick={() => setLanguage('tr')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${language === 'tr' ? 'bg-bnc-accent text-bnc-bg' : 'bg-bnc-surfaceAlt text-bnc-textSec hover:bg-bnc-border'}`}
            >
              {t('settings.language.tr')}
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${language === 'en' ? 'bg-bnc-accent text-bnc-bg' : 'bg-bnc-surfaceAlt text-bnc-textSec hover:bg-bnc-border'}`}
            >
              {t('settings.language.en')}
            </button>
          </div>
        </div>

        {/* Header bar */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-bnc-textTer" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('common.search')}
              className="bnc-input pl-8 pr-7 py-1.5 text-xs w-full max-w-xs" />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-bnc-textTer hover:text-bnc-textPri"><X className="w-3.5 h-3.5" /></button>}
          </div>
          {tab !== 'snapshots' && tab !== 'users' && tab !== 'model-portfolio' && (
            <button type="button" onClick={() => startAdd(tab === 'instruments' ? { currency: 'TRY', market: 'BIST', asset_type: 'stock' } : {})}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bnc-accent text-bnc-bg text-xs font-medium hover:bg-bnc-accentHover transition-colors">
              <Plus className="w-3.5 h-3.5" /> {t('common.add')}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-bnc-border border-t-bnc-accent" />
          </div>
        ) : (
          <div className="bnc-card overflow-hidden">

            {/* ===== INSTRUMENTS ===== */}
            {tab === 'instruments' && (<>
              {showForm && (
                <FormRow>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                    <input value={formData.symbol || ''} onChange={e => setFormData(p => ({ ...p, symbol: e.target.value }))} placeholder={t('settings.instruments.column.symbol')} className="bnc-input text-xs py-1.5" />
                    <input value={formData.asset_type || ''} onChange={e => setFormData(p => ({ ...p, asset_type: e.target.value }))} placeholder={t('settings.instruments.column.type')} className="bnc-input text-xs py-1.5" />
                    <input value={formData.market || ''} onChange={e => setFormData(p => ({ ...p, market: e.target.value }))} placeholder={t('settings.instruments.column.market')} className="bnc-input text-xs py-1.5" />
                    <input value={formData.currency || ''} onChange={e => setFormData(p => ({ ...p, currency: e.target.value }))} placeholder={t('txForm.label.currency')} className="bnc-input text-xs py-1.5" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => save('instruments', createInstrument, updateInstrument)} className="px-3 py-1.5 rounded bg-bnc-accent text-bnc-bg text-xs font-medium"><Check className="w-3 h-3 inline mr-1" />{t('common.save')}</button>
                    <button type="button" onClick={cancelForm} className="px-3 py-1.5 rounded bg-bnc-surfaceAlt text-bnc-textSec text-xs border border-bnc-border">{t('common.cancel')}</button>
                  </div>
                </FormRow>
              )}
              {/* Table header */}
              <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px_100px_120px_100px] gap-2 px-4 py-2 bg-bnc-surfaceAlt text-[10px] text-bnc-textTer font-medium uppercase tracking-wide">
                <span>{t('settings.instruments.column.symbol')}</span><span>{t('settings.instruments.column.type')}</span><span>{t('settings.instruments.column.market')}</span><span>{t('settings.instruments.column.unit')}</span><span>{t('settings.instruments.column.lastPrice')}</span><span>{t('settings.instruments.column.lastUpdated')}</span><span className="text-right">{t('settings.instruments.column.actions')}</span>
              </div>
              <div className="divide-y divide-bnc-border max-h-[calc(100vh-240px)] overflow-y-auto">
                {filteredInstruments.length === 0 ? (
                  <p className="text-center text-bnc-textTer text-xs py-10">{t('settings.instruments.empty')}</p>
                ) : filteredInstruments.map(i => (
                  <div key={i.id} className="group">
                    <div className="md:grid grid-cols-[1fr_80px_80px_80px_100px_120px_100px] gap-2 px-4 py-2.5 items-center hover:bg-bnc-surfaceAlt/30 transition-colors">
                      <span className="text-xs font-bold text-bnc-textPri">{i.symbol}</span>
                      <span className="hidden md:block text-[10px] text-bnc-textTer">{i.asset_type}</span>
                      <span className="hidden md:block">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-bnc-surfaceAlt text-bnc-textTer">{i.market}</span>
                      </span>
                      <span className="hidden md:block text-[10px] text-bnc-textTer">{i.currency}</span>
                      <span className="hidden md:block text-xs font-semibold text-bnc-textPri">
                        {i.last_price_try != null ? `${fmt(i.last_price_try)} ₺` : <span className="text-bnc-textTer font-normal">-</span>}
                      </span>
                      <span className="hidden md:flex items-center gap-1 text-[10px] text-bnc-textTer">
                        {i.last_price_updated_at ? (
                          <><Clock className="w-3 h-3" />{new Date(i.last_price_updated_at).toLocaleDateString(locale, { day: '2-digit', month: 'short' })}</>
                        ) : '-'}
                      </span>
                      <div className="hidden md:flex items-center justify-end gap-1">
                        <button type="button" onClick={() => handleRefreshPrice(i.id)} disabled={refreshingId === i.id}
                          className="p-1.5 text-bnc-textTer hover:text-bnc-accent disabled:opacity-40" title={t('settings.instruments.fetchPrice')}>
                          <RefreshCw className={`w-3.5 h-3.5 ${refreshingId === i.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button type="button" onClick={() => { setManualPriceId(manualPriceId === i.id ? null : i.id); setManualPriceVal(''); }}
                          className="p-1.5 text-bnc-textTer hover:text-bnc-accent" title={t('settings.instruments.manualPrice')}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => startEdit(i)} className="p-1.5 text-bnc-textTer hover:text-bnc-accent" title={t('common.edit')}>
                          <Package className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => del('instruments', deleteInstrument, i.id, 'settings.instruments.deleteLabel')} className="p-1.5 text-bnc-textTer hover:text-bnc-red" title={t('common.delete')}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {/* Mobile meta */}
                      <div className="md:hidden flex items-center gap-2 mt-1 text-[10px] text-bnc-textTer">
                        <span>{i.market} · {i.currency} · {i.asset_type}</span>
                        <div className="flex-1" />
                        {i.last_price_try != null && <span className="font-semibold text-bnc-textPri">{fmt(i.last_price_try)} ₺</span>}
                        <button type="button" onClick={() => handleRefreshPrice(i.id)} className="p-1 text-bnc-textTer hover:text-bnc-accent">
                          <RefreshCw className={`w-3 h-3 ${refreshingId === i.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button type="button" onClick={() => del('instruments', deleteInstrument, i.id, 'settings.instruments.deleteLabel')} className="p-1 text-bnc-textTer hover:text-bnc-red"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                    {manualPriceId === i.id && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-bnc-surfaceAlt/20 border-t border-bnc-border">
                        <span className="text-[10px] text-bnc-textTer">{t('settings.instruments.manualPriceLabel')}</span>
                        <input type="number" step="any" value={manualPriceVal} onChange={e => setManualPriceVal(e.target.value)}
                          placeholder={t('settings.instruments.manualPricePlaceholder')} className="bnc-input text-xs py-1 w-32" autoFocus
                          onKeyDown={e => e.key === 'Enter' && handleManualPrice(i.id)} />
                        <button type="button" onClick={() => handleManualPrice(i.id)} className="px-2 py-1 rounded bg-bnc-accent text-bnc-bg text-[10px] font-medium">{t('common.save')}</button>
                        <button type="button" onClick={() => { setManualPriceId(null); setManualPriceVal(''); }} className="text-bnc-textTer hover:text-bnc-textPri"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>)}

            {/* ===== ACCOUNTS ===== */}
            {tab === 'accounts' && (<>
              {showForm && (
                <FormRow>
                  <div className="flex gap-2 mb-2">
                    <input value={formData.name || ''} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder={t('settings.accounts.placeholder.name')} className="bnc-input text-xs py-1.5 flex-1" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => save('accounts', createAccount, updateAccount)} className="px-3 py-1.5 rounded bg-bnc-accent text-bnc-bg text-xs font-medium"><Check className="w-3 h-3 inline mr-1" />{t('common.save')}</button>
                    <button type="button" onClick={cancelForm} className="px-3 py-1.5 rounded bg-bnc-surfaceAlt text-bnc-textSec text-xs border border-bnc-border">{t('common.cancel')}</button>
                  </div>
                </FormRow>
              )}
              <div className="divide-y divide-bnc-border">
                {filteredAccounts.length === 0 ? (
                  <p className="text-center text-bnc-textTer text-xs py-10">{t('settings.accounts.empty')}</p>
                ) : filteredAccounts.map(a => (
                  <div key={a.id} className="flex items-center px-4 py-2.5 hover:bg-bnc-surfaceAlt/30">
                    <p className="text-xs font-semibold text-bnc-textPri flex-1">{a.name}</p>
                    <button type="button" onClick={() => startEdit(a)} className="p-1.5 text-bnc-textTer hover:text-bnc-accent"><Pencil className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => del('accounts', deleteAccount, a.id, 'settings.accounts.deleteLabel')} className="p-1.5 text-bnc-textTer hover:text-bnc-red"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </>)}

            {/* ===== SNAPSHOTS ===== */}
            {tab === 'snapshots' && (
              <div className="divide-y divide-bnc-border max-h-[calc(100vh-240px)] overflow-y-auto">
                <div className="hidden md:grid grid-cols-[1fr_120px_120px_100px_80px_60px_50px] gap-2 px-4 py-2 bg-bnc-surfaceAlt text-[10px] text-bnc-textTer font-medium uppercase tracking-wide">
                  <span>{t('settings.snapshots.column.date')}</span><span className="text-right">{t('settings.snapshots.column.marketValue')}</span><span className="text-right">{t('settings.snapshots.column.cost')}</span><span className="text-right">{t('settings.snapshots.column.plTry')}</span><span className="text-right">{t('settings.snapshots.column.plPct')}</span><span className="text-right">{t('settings.snapshots.column.positions')}</span><span></span>
                </div>
                {filteredSnapshots.length === 0 ? (
                  <p className="text-center text-bnc-textTer text-xs py-10">{t('settings.snapshots.empty')}</p>
                ) : filteredSnapshots.map(s => {
                  const plPct = s.total_profit_loss_pct;
                  const plVal = s.total_profit_loss;
                  const hasData = plPct != null;
                  const isPositive = hasData && plPct >= 0;
                  return (
                    <div key={s.id} className="md:grid grid-cols-[1fr_120px_120px_100px_80px_60px_50px] gap-2 px-4 py-2.5 items-center hover:bg-bnc-surfaceAlt/30">
                      <span className="text-xs font-semibold text-bnc-textPri">{fmtDate(s.snapshot_date)}</span>
                      <span className="hidden md:block text-xs text-right text-bnc-textSec">{fmt(s.total_market_value || 0)} ₺</span>
                      <span className="hidden md:block text-xs text-right text-bnc-textTer">{fmt(s.total_cost_basis || 0)} ₺</span>
                      <span className={`hidden md:block text-xs text-right font-medium ${hasData ? (isPositive ? 'text-bnc-green' : 'text-bnc-red') : 'text-bnc-textTer'}`}>
                        {hasData ? `${isPositive ? '+' : ''}${fmt(plVal)}` : '-'}
                      </span>
                      <span className={`hidden md:block text-xs text-right font-semibold ${hasData ? (isPositive ? 'text-bnc-green' : 'text-bnc-red') : 'text-bnc-textTer'}`}>
                        {hasData ? `${isPositive ? '+' : ''}${plPct.toFixed(2)}%` : '-'}
                      </span>
                      <span className="hidden md:block text-[10px] text-right text-bnc-textTer">{s.position_count ?? '-'}</span>
                      <div className="hidden md:flex justify-end">
                        <button type="button" onClick={() => del('snapshots', deleteSnapshot, s.id, 'settings.snapshots.deleteLabel')} className="p-1.5 text-bnc-textTer hover:text-bnc-red"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      {/* Mobile */}
                      <div className="md:hidden flex items-center gap-2 mt-1 text-[10px] text-bnc-textTer">
                        <span>{t('settings.snapshots.mobile.value')} {fmt(s.total_market_value || 0)} ₺</span>
                        {hasData && <span className={isPositive ? 'text-bnc-green' : 'text-bnc-red'}>{isPositive ? '+' : ''}{plPct.toFixed(2)}%</span>}
                        {hasData && <span className={isPositive ? 'text-bnc-green' : 'text-bnc-red'}>({isPositive ? '+' : ''}{fmt(plVal)} ₺)</span>}
                        <div className="flex-1" />
                        <button type="button" onClick={() => del('snapshots', deleteSnapshot, s.id, 'settings.snapshots.deleteLabel')} className="p-1 text-bnc-textTer hover:text-bnc-red"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ===== MODEL PORTFOLIO ===== */}
            {tab === 'model-portfolio' && (
              <div className="p-4">
                <p className="text-xs text-bnc-textTer mb-4">
                  {t('settings.modelPortfolio.description')}
                </p>
                <div className="space-y-2 mb-4">
                  {modelTargets.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={row.tag_name}
                        onChange={e => setModelTargets(prev => prev.map((item, idx) => idx === i ? { ...item, tag_name: e.target.value } : item))}
                        placeholder={t('settings.modelPortfolio.placeholder.tagName')}
                        className="bnc-input text-xs py-1.5 flex-1"
                      />
                      <div className="relative w-24">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          value={row.target_percentage}
                          onChange={e => setModelTargets(prev => prev.map((item, idx) => idx === i ? { ...item, target_percentage: parseFloat(e.target.value) || 0 } : item))}
                          className="bnc-input text-xs py-1.5 w-full pr-6 text-right"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-bnc-textTer">%</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setModelTargets(prev => prev.filter((_, idx) => idx !== i))}
                        className="p-1.5 text-bnc-textTer hover:text-bnc-red"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setModelTargets(prev => [...prev, { tag_name: '', target_percentage: 0 }])}
                    className="flex items-center gap-1.5 text-xs text-bnc-accent hover:text-bnc-accentHover font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> {t('settings.modelPortfolio.addTarget')}
                  </button>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium ${
                      Math.abs(modelTargets.reduce((s, row) => s + (row.target_percentage || 0), 0) - 100) < 0.1
                        ? 'text-bnc-green' : 'text-bnc-red'
                    }`}>
                      {t('settings.modelPortfolio.totalPercent', { n: modelTargets.reduce((s, row) => s + (row.target_percentage || 0), 0).toFixed(1) })}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const total = modelTargets.reduce((s, row) => s + (row.target_percentage || 0), 0);
                        if (Math.abs(total - 100) > 0.5) {
                          showError(t('settings.modelPortfolio.error.mustBe100', { n: total.toFixed(1) }));
                          return;
                        }
                        const valid = modelTargets.filter(row => row.tag_name.trim());
                        if (valid.length === 0) { showError(t('settings.modelPortfolio.error.atLeastOne')); return; }
                        setModelSaving(true);
                        try {
                          const res = await updateModelPortfolio(valid);
                          setModelTargets(res.data || valid);
                          showSuccess(t('settings.modelPortfolio.saved'));
                        } catch (e) { showError(e.response?.data?.detail || t('settings.modelPortfolio.saveError')); }
                        finally { setModelSaving(false); }
                      }}
                      disabled={modelSaving}
                      className="px-3 py-1.5 rounded bg-bnc-accent text-bnc-bg text-xs font-medium hover:bg-bnc-accentHover disabled:opacity-50 transition-colors"
                    >
                      {modelSaving ? t('common.saving') : t('common.save')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ===== USERS ===== */}
            {tab === 'users' && user?.is_admin && (<>
              {showForm && (
                <FormRow>
                  <p className="text-[10px] text-bnc-textTer mb-2">
                    {editingItem ? t('settings.users.editUserWithEmail', { email: editingItem.email }) : t('settings.users.editTitle')}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                    <input value={formData.email || ''} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                      placeholder={t('auth.register.email')} className="bnc-input text-xs py-1.5" />
                    <input value={formData.username || ''} onChange={e => setFormData(p => ({ ...p, username: e.target.value }))}
                      placeholder={t('settings.users.username')} className="bnc-input text-xs py-1.5" />
                    <input value={formData.password || ''} onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                      placeholder={t('settings.users.newPassword')} type="password" className="bnc-input text-xs py-1.5" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={async () => {
                      if (!editingItem) return;
                      try {
                        const payload = {};
                        if (formData.email && formData.email !== editingItem.email) payload.email = formData.email;
                        if (formData.username && formData.username !== editingItem.username) payload.username = formData.username;
                        if (formData.password) payload.password = formData.password;
                        if (Object.keys(payload).length === 0) { showError(t('settings.modelPortfolio.noChanges')); return; }
                        await updateAdminUser(editingItem.id, payload);
                        showSuccess(t('settings.users.updated'));
                        if (editingItem.id === user?.id) refreshUser();
                        cancelForm();
                        load('users');
                      } catch (e) { showError(e.response?.data?.detail || t('common.error')); }
                    }} className="px-3 py-1.5 rounded bg-bnc-accent text-bnc-bg text-xs font-medium"><Check className="w-3 h-3 inline mr-1" />{t('common.save')}</button>
                    <button type="button" onClick={cancelForm} className="px-3 py-1.5 rounded bg-bnc-surfaceAlt text-bnc-textSec text-xs border border-bnc-border">{t('common.cancel')}</button>
                  </div>
                </FormRow>
              )}
              <div className="divide-y divide-bnc-border">
                {users.length === 0 ? (
                  <p className="text-center text-bnc-textTer text-xs py-10">{t('settings.users.empty')}</p>
                ) : users.map(uRow => (
                  <div key={uRow.id} className="flex items-center px-4 py-2.5 gap-3 hover:bg-bnc-surfaceAlt/30">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-bnc-textPri">{uRow.email}</p>
                      <p className="text-[10px] text-bnc-textTer">@{uRow.username} · ID: {uRow.id} · {fmtDate(uRow.created_at)}</p>
                    </div>
                    <div className="w-12 text-center shrink-0">
                      {uRow.is_admin && <span className="text-[10px] px-1.5 py-0.5 rounded bg-bnc-accent/15 text-bnc-accent font-medium">{t('settings.users.badgeAdmin')}</span>}
                    </div>
                    <button type="button" onClick={() => { toggleUserAdmin(uRow.id).then(() => { showSuccess(t('settings.toast.updated')); load('users'); }).catch(() => showError(t('common.error'))); }}
                      className="w-24 px-2.5 py-1 text-[10px] text-center rounded bg-bnc-surfaceAlt text-bnc-textSec hover:text-bnc-textPri border border-bnc-border shrink-0">
                      {uRow.is_admin ? t('settings.users.revokeAdmin') : t('settings.users.makeAdmin')}
                    </button>
                    <div className="flex items-center gap-0.5 w-14 shrink-0">
                      <button type="button" onClick={() => startEdit(uRow)} className="p-1.5 text-bnc-textTer hover:text-bnc-accent" title={t('common.edit')}><Pencil className="w-3.5 h-3.5" /></button>
                      {uRow.id !== user.id ? (
                        <button type="button" onClick={() => del('users', deleteAdminUser, uRow.id, 'settings.users.deleteLabel')} className="p-1.5 text-bnc-textTer hover:text-bnc-red"><Trash2 className="w-3.5 h-3.5" /></button>
                      ) : <div className="w-7" />}
                    </div>
                  </div>
                ))}
              </div>
            </>)}

          </div>
        )}
      </div>
    </div>
  );
}
