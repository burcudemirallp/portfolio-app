import { useState, useEffect, useMemo, useCallback } from 'react';
import { Trash2, Search, X, ChevronDown, ChevronUp, Download } from 'lucide-react';
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { getSaleRecords, deleteSaleRecord } from '../services/api';
import { useToast } from './Toast';
import { useLanguage } from '../contexts/LanguageContext';

const TT_STYLE = { backgroundColor: '#1E2329', border: '1px solid #2B3139', borderRadius: '8px', color: '#EAECEF', fontSize: '12px' };

const holdDays = (s) => {
  if (!s.buy_date || !s.sale_date) return null;
  return Math.floor((new Date(s.sale_date) - new Date(s.buy_date)) / 86400000);
};

export default function SalesHistoryPage() {
  const { t, locale } = useLanguage();
  const { showSuccess, showError } = useToast();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all');
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('all');
  const [salesSort, setSalesSort] = useState({ field: 'sale_date', order: 'desc' });
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [chartOpen, setChartOpen] = useState(false);

  const fmt = (v) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const fmtDate = (d) => new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });

  const PERIODS = useMemo(() => [
    { id: 'all', label: t('sales.periods.all') },
    { id: 'month', label: t('sales.periods.thisMonth') },
    { id: '3m', label: t('sales.periods.3m') },
    { id: '6m', label: t('sales.periods.6m') },
    { id: 'year', label: t('sales.periods.thisYear') },
  ], [t]);

  const RESULT_FILTERS = useMemo(() => [
    { id: 'all', label: t('sales.filter.all') },
    { id: 'profit', label: t('sales.filter.profit'), cls: 'text-bnc-green' },
    { id: 'loss', label: t('sales.filter.loss'), cls: 'text-bnc-red' },
  ], [t]);

  const loadSales = useCallback(async () => {
    try {
      const r = await getSaleRecords();
      setSales(r.data || []);
    } catch {
      showError(t('sales.error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [showError, t]);

  useEffect(() => { loadSales(); }, [loadSales]);

  const handleDelete = async (id) => {
    if (!confirm(t('sales.confirm.delete'))) return;
    try {
      await deleteSaleRecord(id);
      loadSales();
      showSuccess(t('sales.toast.deleted'));
    } catch { showError(t('sales.error.deleteFailed')); }
  };

  const dateRange = useMemo(() => {
    if (period === 'all') return { from: null, to: null };
    const now = new Date();
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    let from;
    if (period === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (period === '3m') { from = new Date(now); from.setMonth(from.getMonth() - 3); }
    else if (period === '6m') { from = new Date(now); from.setMonth(from.getMonth() - 6); }
    else if (period === 'year') from = new Date(now.getFullYear(), 0, 1);
    return { from, to };
  }, [period]);

  const filtered = useMemo(() => {
    let list = Array.isArray(sales) ? [...sales] : [];
    const { from, to } = dateRange;
    if (from) list = list.filter(s => new Date(s.sale_date) >= from);
    if (to) list = list.filter(s => new Date(s.sale_date) <= to);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        (s.instrument_symbol || '').toLowerCase().includes(q) ||
        (s.notes || '').toLowerCase().includes(q)
      );
    }
    if (resultFilter === 'profit') list = list.filter(s => s.profit_loss_try >= 0);
    else if (resultFilter === 'loss') list = list.filter(s => s.profit_loss_try < 0);
    return list;
  }, [sales, dateRange, search, resultFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const { field, order } = salesSort;
    list.sort((a, b) => {
      let va, vb;
      if (field === 'sale_date' || field === 'buy_date') {
        va = new Date(a[field] || 0).getTime(); vb = new Date(b[field] || 0).getTime();
      } else if (field === 'holding_days') {
        va = holdDays(a) ?? 0; vb = holdDays(b) ?? 0;
      } else { va = a[field] ?? 0; vb = b[field] ?? 0; }
      return order === 'asc' ? va - vb : vb - va;
    });
    return list;
  }, [filtered, salesSort]);

  const stats = useMemo(() => {
    const profit = filtered.reduce((s, x) => s + (x.profit_loss_try > 0 ? x.profit_loss_try : 0), 0);
    const loss = filtered.reduce((s, x) => s + (x.profit_loss_try < 0 ? Math.abs(x.profit_loss_try) : 0), 0);
    const cost = filtered.reduce((s, x) => s + (x.buy_cost_try || (x.buy_price || 0) * (x.buy_quantity || 0) || 0), 0);
    const net = profit - loss;
    return { profit, loss, net, pct: cost > 0 ? (net / cost) * 100 : 0, count: filtered.length };
  }, [filtered]);

  const grouped = useMemo(() => {
    const m = {};
    filtered.forEach(s => {
      const sym = s.instrument_symbol || '?';
      if (!m[sym]) m[sym] = { sym, count: 0, pl: 0, vol: 0, returns: [] };
      m[sym].count++;
      m[sym].pl += s.profit_loss_try;
      m[sym].vol += s.sell_value_try || 0;
      if (s.profit_loss_percentage != null) m[sym].returns.push(s.profit_loss_percentage);
    });
    return Object.values(m)
      .map(g => ({ ...g, avg: g.returns.length ? g.returns.reduce((a, r) => a + r, 0) / g.returns.length : 0 }))
      .sort((a, b) => b.pl - a.pl);
  }, [filtered]);

  const monthlyData = useMemo(() => {
    const m = {};
    filtered.forEach(s => {
      const d = new Date(s.sale_date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!m[k]) m[k] = { month: k, profit: 0, loss: 0 };
      if (s.profit_loss_try >= 0) m[k].profit += s.profit_loss_try;
      else m[k].loss += Math.abs(s.profit_loss_try);
    });
    return Object.values(m).sort((a, b) => a.month.localeCompare(b.month));
  }, [filtered]);

  const toggleSort = (field) => setSalesSort(p => ({
    field, order: p.field === field && p.order === 'desc' ? 'asc' : 'desc',
  }));

  const exportCSV = () => {
    const h = t('sales.csv.headers');
    const rows = sorted.map(s => [
      fmtDate(s.sale_date), s.instrument_symbol || '', fmtDate(s.buy_date),
      holdDays(s) ?? '', s.buy_price, s.sell_price, s.sell_quantity,
      s.sell_value_try || 0, s.profit_loss_try || 0, s.profit_loss_percentage || 0, s.notes || '',
    ]);
    const esc = v => { const s = String(v); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [h.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sales-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
      <div className="animate-spin rounded-full h-10 w-10 border-2 border-bnc-border border-t-bnc-accent" />
      <p className="text-xs text-bnc-textTer">{t('common.loading')}</p>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-3 text-bnc-textPri">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bnc-card p-3">
          <p className="text-[10px] text-bnc-textTer uppercase tracking-wide">{t('sales.summary.salesCount')}</p>
          <p className="text-lg font-bold text-bnc-accent">{stats.count}</p>
        </div>
        <div className="bnc-card p-3">
          <p className="text-[10px] text-bnc-textTer uppercase tracking-wide">{t('sales.summary.profit')}</p>
          <p className="text-sm font-bold text-bnc-green">{fmt(stats.profit)}</p>
        </div>
        <div className="bnc-card p-3">
          <p className="text-[10px] text-bnc-textTer uppercase tracking-wide">{t('sales.summary.loss')}</p>
          <p className="text-sm font-bold text-bnc-red">{fmt(stats.loss)}</p>
        </div>
        <div className="bnc-card p-3">
          <p className="text-[10px] text-bnc-textTer uppercase tracking-wide">{t('sales.summary.net')}</p>
          <p className={`text-sm font-bold ${stats.net >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
            {stats.net >= 0 ? '+' : ''}{fmt(stats.net)}
            <span className="text-[10px] font-normal ml-1">({stats.net >= 0 ? '+' : ''}{stats.pct.toFixed(1)}%)</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              period === p.id ? 'bg-bnc-accent text-bnc-bg' : 'bg-bnc-surfaceAlt text-bnc-textSec hover:text-bnc-textPri'
            }`}>{p.label}</button>
        ))}
        <div className="h-4 w-px bg-bnc-border mx-1" />
        {RESULT_FILTERS.map(f => (
          <button key={f.id} onClick={() => setResultFilter(f.id)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              resultFilter === f.id ? 'bg-bnc-accent text-bnc-bg' : `bg-bnc-surfaceAlt ${f.cls || 'text-bnc-textSec'} hover:text-bnc-textPri`
            }`}>{f.label}</button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-bnc-textTer" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('sales.search.placeholder')}
            className="bnc-input pl-8 pr-7 py-1.5 text-xs w-40" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-bnc-textTer hover:text-bnc-textPri"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <button onClick={exportCSV} className="p-1.5 rounded-md bg-bnc-surfaceAlt text-bnc-textSec hover:text-bnc-textPri border border-bnc-border" title={t('sales.export.csv')}>
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="bnc-card overflow-hidden">
        <button onClick={() => setChartOpen(!chartOpen)}
          className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-bnc-textSec hover:bg-bnc-surfaceAlt/50">
          <span>{t('sales.chart.title')}</span>
          {chartOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {chartOpen && (
          <div className="px-3 pb-3">
            {monthlyData.length === 0 ? (
              <p className="text-center text-bnc-textTer text-xs py-8">{t('sales.chart.noData')}</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2B3139" opacity={0.5} />
                  <XAxis dataKey="month" stroke="#848E9C" tick={{ fill: '#848E9C', fontSize: 10 }} />
                  <YAxis stroke="#848E9C" tick={{ fill: '#848E9C', fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={TT_STYLE} formatter={v => [fmt(v), '']} />
                  <Bar dataKey="profit" name={t('sales.chart.profit')} stackId="pl" fill="#0ECB81" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="loss" name={t('sales.chart.loss')} stackId="pl" fill="#F6465D" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>

      <div className="bnc-card overflow-hidden">
        <button onClick={() => setSummaryOpen(!summaryOpen)}
          className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-bnc-textSec hover:bg-bnc-surfaceAlt/50">
          <span>{t('sales.instrumentSummary', { count: grouped.length })}</span>
          {summaryOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {summaryOpen && grouped.length > 0 && (
          <div className="divide-y divide-bnc-border">
            {grouped.map(g => (
              <div key={g.sym} className="flex items-center px-3.5 py-2 gap-3 hover:bg-bnc-surfaceAlt/40">
                <span className="text-xs font-semibold text-bnc-textPri w-20 truncate">{g.sym}</span>
                <div className="flex-1" />
                <span className={`text-xs font-bold ${g.pl >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                  {g.pl >= 0 ? '+' : ''}{fmt(g.pl)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bnc-card overflow-hidden">
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-bnc-border">
          <span className="text-xs font-semibold text-bnc-textSec">{t('sales.details', { count: sorted.length })}</span>
        </div>

        {sorted.length === 0 ? (
          <p className="text-center text-bnc-textTer text-xs py-10">
            {sales.length === 0 ? t('sales.empty.noRecords') : t('sales.empty.noMatch')}
          </p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-bnc-surfaceAlt">
                  <tr>
                    <Th field="instrument_symbol" label={t('sales.table.instrument')} sort={salesSort} toggle={toggleSort} left />
                    <Th field="sale_date" label={t('sales.table.sale')} sort={salesSort} toggle={toggleSort} />
                    <Th field="holding_days" label={t('sales.table.duration')} sort={salesSort} toggle={toggleSort} />
                    <th className="px-3 py-2.5 text-right text-bnc-textTer font-medium">{t('sales.table.buy')}</th>
                    <th className="px-3 py-2.5 text-right text-bnc-textTer font-medium">{t('sales.table.sell')}</th>
                    <th className="px-3 py-2.5 text-right text-bnc-textTer font-medium">{t('sales.table.qty')}</th>
                    <Th field="profit_loss_try" label={t('sales.table.pl')} sort={salesSort} toggle={toggleSort} />
                    <th className="px-3 py-2.5 text-bnc-textTer font-medium">{t('sales.table.notes')}</th>
                    <th className="px-3 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bnc-border">
                  {sorted.map(s => {
                    const days = holdDays(s);
                    return (
                      <tr key={s.id} className="hover:bg-bnc-surfaceAlt/40 transition-colors">
                        <td className="px-3 py-2 font-semibold text-bnc-textPri">{s.instrument_symbol}</td>
                        <td className="px-3 py-2 text-right text-bnc-textSec">{fmtDate(s.sale_date)}</td>
                        <td className="px-3 py-2 text-right text-bnc-textTer">{days != null ? t('sales.holdingDays', { days }) : '-'}</td>
                        <td className="px-3 py-2 text-right text-bnc-textSec">{s.buy_price?.toFixed(2)} <span className="text-bnc-textTer">{s.buy_currency}</span></td>
                        <td className="px-3 py-2 text-right text-bnc-textPri font-medium">{s.sell_price?.toFixed(2)} <span className="text-bnc-textTer">{s.sell_currency}</span></td>
                        <td className="px-3 py-2 text-right text-bnc-textSec">{s.sell_quantity?.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`font-semibold ${s.profit_loss_try >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                            {s.profit_loss_try >= 0 ? '+' : ''}{fmt(s.profit_loss_try)}
                          </span>
                          <span className={`block text-[10px] ${s.profit_loss_try >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                            {s.profit_loss_try >= 0 ? '+' : ''}{s.profit_loss_percentage?.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-bnc-textTer max-w-[120px] truncate">{s.notes || '-'}</td>
                        <td className="px-2 py-2">
                          <button onClick={() => handleDelete(s.id)} className="text-bnc-textTer hover:text-bnc-red transition-colors" title={t('common.delete')}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-bnc-border">
              {sorted.map(s => {
                const days = holdDays(s);
                return (
                  <div key={s.id} className="px-3.5 py-2.5 hover:bg-bnc-surfaceAlt/40">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-semibold text-bnc-textPri">{s.instrument_symbol}</span>
                      <span className={`text-xs font-bold ${s.profit_loss_try >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                        {s.profit_loss_try >= 0 ? '+' : ''}{fmt(s.profit_loss_try)}
                        <span className="font-normal ml-1">({s.profit_loss_try >= 0 ? '+' : ''}{s.profit_loss_percentage?.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-[10px] text-bnc-textTer">
                      <span>{fmtDate(s.sale_date)}</span>
                      {days != null && <span>{t('sales.mobile.holdingDays', { days })}</span>}
                      <span>{t('sales.mobile.buy')} {s.buy_price?.toFixed(2)}</span>
                      <span>{t('sales.mobile.sell')} {s.sell_price?.toFixed(2)}</span>
                      <span>x{s.sell_quantity?.toFixed(2)}</span>
                      <button onClick={() => handleDelete(s.id)} className="ml-auto text-bnc-textTer hover:text-bnc-red"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Th({ field, label, sort, toggle, left }) {
  const active = sort.field === field;
  return (
    <th onClick={() => toggle(field)}
      className={`px-3 py-2.5 font-medium text-bnc-textTer cursor-pointer hover:text-bnc-textPri select-none whitespace-nowrap ${left ? 'text-left' : 'text-right'}`}>
      {label}
      {active && (sort.order === 'desc' ? <ChevronDown className="w-3 h-3 inline ml-0.5" /> : <ChevronUp className="w-3 h-3 inline ml-0.5" />)}
    </th>
  );
}
