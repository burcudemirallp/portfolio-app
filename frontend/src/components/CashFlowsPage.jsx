import { useState, useEffect, useCallback, useMemo } from 'react';
import { DollarSign, Plus, Pencil, Trash2, X, Check, Search } from 'lucide-react';
import { getCashFlows, createCashFlow, updateCashFlow, deleteCashFlow } from '../services/api';
import { useToast } from './Toast';
import { useLanguage } from '../contexts/LanguageContext';

const getDate = (cf) => cf.flow_date || cf.date;

export default function CashFlowsPage() {
  const { t, locale } = useLanguage();
  const { showSuccess, showError } = useToast();
  const [cashFlows, setCashFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');

  const fmt = (v, cur = 'TRY') =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: cur, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });

  const TYPE_FILTERS = useMemo(() => [
    { key: 'all', label: t('cashFlows.filters.all') },
    { key: 'inflow', label: t('cashFlows.filters.inflow') },
    { key: 'outflow', label: t('cashFlows.filters.outflow') },
  ], [t]);

  const PERIOD_FILTERS = useMemo(() => [
    { key: 'all', label: t('cashFlows.periods.all') },
    { key: '1M', label: t('cashFlows.periods.1m'), days: 30 },
    { key: '3M', label: t('cashFlows.periods.3m'), days: 90 },
    { key: '6M', label: t('cashFlows.periods.6m'), days: 180 },
    { key: '1Y', label: t('cashFlows.periods.1y'), days: 365 },
  ], [t]);

  const load = useCallback(async () => {
    try {
      const res = await getCashFlows();
      setCashFlows(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      if (err.response?.status !== 401) showError(t('cashFlows.error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [showError, t]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!confirm(t('cashFlows.confirm.delete'))) return;
    try {
      await deleteCashFlow(id);
      showSuccess(t('cashFlows.toast.deleted'));
      load();
    } catch (err) {
      showError(err.response?.data?.detail || t('cashFlows.error.deleteFailed'));
    }
  };

  const filtered = useMemo(() => {
    let list = [...cashFlows];

    if (typeFilter !== 'all') {
      list = list.filter(c => c.flow_type === typeFilter);
    }

    if (periodFilter !== 'all') {
      const preset = PERIOD_FILTERS.find(p => p.key === periodFilter);
      if (preset?.days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - preset.days);
        list = list.filter(c => {
          const d = getDate(c);
          return d && new Date(d) >= cutoff;
        });
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      const inflowLabel = t('cashFlows.type.inflow').toLowerCase();
      const outflowLabel = t('cashFlows.type.outflow').toLowerCase();
      list = list.filter(c =>
        (c.note || '').toLowerCase().includes(q) ||
        (c.currency || '').toLowerCase().includes(q) ||
        (c.flow_type === 'inflow' ? inflowLabel : outflowLabel).includes(q)
      );
    }

    return list;
  }, [cashFlows, typeFilter, periodFilter, search, PERIOD_FILTERS, t]);

  const totalInflow = filtered.filter(c => c.flow_type === 'inflow').reduce((s, c) => s + (c.amount_try || c.amount || 0), 0);
  const totalOutflow = filtered.filter(c => c.flow_type === 'outflow').reduce((s, c) => s + (c.amount_try || c.amount || 0), 0);
  const net = totalInflow - totalOutflow;
  const hasFilters = search || typeFilter !== 'all' || periodFilter !== 'all';

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-bnc-border border-t-bnc-accent" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bnc-card p-3.5">
          <span className="text-[11px] text-bnc-textTer block mb-0.5">{t('cashFlows.summary.totalInflow')}</span>
          <p className="text-lg font-bold text-bnc-green">{fmt(totalInflow)}</p>
        </div>
        <div className="bnc-card p-3.5">
          <span className="text-[11px] text-bnc-textTer block mb-0.5">{t('cashFlows.summary.totalOutflow')}</span>
          <p className="text-lg font-bold text-bnc-red">{fmt(totalOutflow)}</p>
        </div>
        <div className={`bnc-card p-3.5 ${net >= 0 ? 'border-bnc-green/30' : 'border-bnc-red/30'}`}>
          <span className="text-[11px] text-bnc-textTer block mb-0.5">{t('cashFlows.summary.netFlow')}</span>
          <p className={`text-lg font-bold ${net >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
            {net >= 0 ? '+' : ''}{fmt(net)}
          </p>
        </div>
        <div className="bnc-card p-3.5">
          <span className="text-[11px] text-bnc-textTer block mb-0.5">{t('cashFlows.summary.records')}</span>
          <p className="text-lg font-bold text-bnc-textPri">{filtered.length}
            {hasFilters && cashFlows.length !== filtered.length && (
              <span className="text-xs font-normal text-bnc-textTer"> / {cashFlows.length}</span>
            )}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bnc-card p-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-bnc-textTer pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('cashFlows.search.placeholder')}
              className="bnc-input w-full pl-8 pr-8 py-1.5 text-xs"
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-bnc-textTer hover:text-bnc-textPri">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Type pills */}
          <div className="flex items-center gap-1">
            {TYPE_FILTERS.map(f => (
              <button key={f.key} onClick={() => setTypeFilter(f.key)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  typeFilter === f.key
                    ? f.key === 'inflow' ? 'bg-bnc-green/20 text-bnc-green' :
                      f.key === 'outflow' ? 'bg-bnc-red/20 text-bnc-red' :
                      'bg-bnc-accent/15 text-bnc-accent'
                    : 'text-bnc-textTer hover:bg-bnc-surfaceAlt'
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Period pills */}
          <div className="flex items-center gap-1">
            {PERIOD_FILTERS.map(f => (
              <button key={f.key} onClick={() => setPeriodFilter(f.key)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  periodFilter === f.key
                    ? 'bg-bnc-accent/15 text-bnc-accent'
                    : 'text-bnc-textTer hover:bg-bnc-surfaceAlt'
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Add button */}
          <button onClick={() => { setEditing(null); setShowForm(true); }}
            className="w-8 h-8 shrink-0 rounded-lg bg-bnc-accent hover:bg-bnc-accentHover text-bnc-bg flex items-center justify-center transition-colors self-center"
            title={t('cashFlows.action.add')}>
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bnc-card overflow-hidden">
        {filtered.length > 0 ? (
          <>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-bnc-surfaceAlt/50">
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">{t('cashFlows.table.date')}</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">{t('cashFlows.table.type')}</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">{t('cashFlows.table.amount')}</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">{t('cashFlows.table.currency')}</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">{t('cashFlows.table.note')}</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">{t('cashFlows.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bnc-border">
                  {filtered.map((cf) => (
                    <tr key={cf.id} className="hover:bg-bnc-surfaceAlt/40 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-bnc-textSec">{getDate(cf) ? fmtDate(getDate(cf)) : '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          cf.flow_type === 'inflow'
                            ? 'bg-bnc-green/15 text-bnc-green'
                            : 'bg-bnc-red/15 text-bnc-red'
                        }`}>
                          {cf.flow_type === 'inflow' ? t('cashFlows.type.inflow') : t('cashFlows.type.outflow')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`text-xs font-semibold ${cf.flow_type === 'inflow' ? 'text-bnc-green' : 'text-bnc-red'}`}>
                          {cf.flow_type === 'inflow' ? '+' : '-'}{fmt(cf.amount, cf.currency || 'TRY')}
                        </span>
                        {cf.currency && cf.currency !== 'TRY' && cf.amount_try && (
                          <span className="text-[10px] text-bnc-textTer block">≈ {fmt(cf.amount_try)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs text-bnc-textSec">{cf.currency || 'TRY'}</td>
                      <td className="px-4 py-2.5 text-xs text-bnc-textSec max-w-[200px] truncate">{cf.note || '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { setEditing(cf); setShowForm(true); }}
                            className="p-1 text-bnc-textTer hover:text-bnc-accent transition-colors" title={t('common.edit')}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(cf.id)}
                            className="p-1 text-bnc-textTer hover:text-bnc-red transition-colors" title={t('common.delete')}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-bnc-border">
              {filtered.map((cf) => (
                <div key={cf.id} className="p-3 hover:bg-bnc-surfaceAlt/40">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        cf.flow_type === 'inflow' ? 'bg-bnc-green/15 text-bnc-green' : 'bg-bnc-red/15 text-bnc-red'
                      }`}>
                        {cf.flow_type === 'inflow' ? t('cashFlows.type.inflow') : t('cashFlows.type.outflow')}
                      </span>
                      <span className="text-[11px] text-bnc-textTer">{getDate(cf) ? fmtDate(getDate(cf)) : '—'}</span>
                    </div>
                    <span className={`text-xs font-semibold ${cf.flow_type === 'inflow' ? 'text-bnc-green' : 'text-bnc-red'}`}>
                      {cf.flow_type === 'inflow' ? '+' : '-'}{fmt(cf.amount, cf.currency || 'TRY')}
                    </span>
                  </div>
                  {cf.note && <p className="text-[11px] text-bnc-textTer mb-1.5">{cf.note}</p>}
                  {cf.currency && cf.currency !== 'TRY' && cf.amount_try && (
                    <p className="text-[10px] text-bnc-textTer mb-1.5">≈ {fmt(cf.amount_try)}</p>
                  )}
                  <div className="flex items-center justify-end gap-1 pt-1.5 border-t border-bnc-border">
                    <button onClick={() => { setEditing(cf); setShowForm(true); }}
                      className="p-1.5 text-bnc-textTer hover:text-bnc-accent rounded"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(cf.id)}
                      className="p-1.5 text-bnc-textTer hover:text-bnc-red rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="p-10 text-center">
            <DollarSign className="w-10 h-10 text-bnc-textTer mx-auto mb-3" />
            {hasFilters ? (
              <>
                <p className="text-sm text-bnc-textSec font-medium">{t('cashFlows.empty.filtered')}</p>
                <button onClick={() => { setSearch(''); setTypeFilter('all'); setPeriodFilter('all'); }}
                  className="mt-3 text-xs text-bnc-accent hover:underline">{t('cashFlows.empty.clearFilters')}</button>
              </>
            ) : (
              <>
                <p className="text-sm text-bnc-textSec font-medium">{t('cashFlows.empty.none')}</p>
                <p className="text-xs text-bnc-textTer mt-1">{t('cashFlows.empty.hint')}</p>
                <button onClick={() => { setEditing(null); setShowForm(true); }}
                  className="mt-4 bnc-btn-primary">{t('cashFlows.empty.addFirst')}</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <CashFlowFormModal
          editing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function CashFlowFormModal({ editing, onClose, onSaved }) {
  const { t } = useLanguage();
  const isEdit = !!editing;
  const [form, setForm] = useState({
    flow_date: editing?.flow_date ? editing.flow_date.slice(0, 16) : editing?.date ? editing.date.slice(0, 16) : new Date().toISOString().slice(0, 16),
    amount: editing?.amount?.toString() || '',
    currency: editing?.currency || 'TRY',
    flow_type: editing?.flow_type || 'inflow',
    note: editing?.note || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) { setError(t('cashFlows.form.amountRequired')); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        flow_date: new Date(form.flow_date).toISOString(),
        amount: parseFloat(form.amount),
        currency: form.currency,
        flow_type: form.flow_type,
        note: form.note || null,
      };
      if (isEdit) await updateCashFlow(editing.id, payload);
      else await createCashFlow(payload);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || t('cashFlows.form.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-bnc-surface border border-bnc-border rounded-xl max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-bnc-border">
          <h3 className="text-base font-bold text-bnc-textPri">
            {isEdit ? t('cashFlows.modal.editTitle') : t('cashFlows.modal.newTitle')}
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-bnc-surfaceAlt text-bnc-textTer transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-bnc-red/10 border border-bnc-red/30 text-bnc-red px-3 py-2 rounded-lg text-xs">{error}</div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => setForm({ ...form, flow_type: 'inflow' })}
              className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                form.flow_type === 'inflow' ? 'bg-bnc-green text-white' : 'bg-bnc-surfaceAlt text-bnc-textSec border border-bnc-border hover:bg-bnc-border'
              }`}>{t('cashFlows.form.cashIn')}</button>
            <button type="button" onClick={() => setForm({ ...form, flow_type: 'outflow' })}
              className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                form.flow_type === 'outflow' ? 'bg-bnc-red text-white' : 'bg-bnc-surfaceAlt text-bnc-textSec border border-bnc-border hover:bg-bnc-border'
              }`}>{t('cashFlows.form.cashOut')}</button>
          </div>

          <div>
            <label className="block text-xs font-medium text-bnc-textSec mb-1.5">{t('cashFlows.form.date')}</label>
            <input type="datetime-local" value={form.flow_date}
              onChange={(e) => setForm({ ...form, flow_date: e.target.value })}
              className="bnc-input w-full" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-bnc-textSec mb-1.5">{t('cashFlows.form.amount')}</label>
              <input type="number" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="40000" className="bnc-input w-full" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-bnc-textSec mb-1.5">{t('cashFlows.form.currency')}</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="bnc-input w-full">
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-bnc-textSec mb-1.5">{t('cashFlows.form.noteOptional')}</label>
            <input type="text" value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={t('cashFlows.form.notePlaceholder')} className="bnc-input w-full" />
          </div>

          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={onClose} className="bnc-btn-secondary flex-1 py-2.5">{t('common.cancel')}</button>
            <button type="submit" disabled={saving}
              className="bnc-btn-primary flex-1 py-2.5 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? t('common.saving') : <><Check className="w-4 h-4" />{isEdit ? t('cashFlows.form.update') : t('common.save')}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
