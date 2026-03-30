import { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendingUp, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { getPortfolioSnapshots, compareSnapshots } from '../services/api';
import SnapshotCalendar from './SnapshotCalendar';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLanguage } from '../contexts/LanguageContext';

function findClosestSnapshot(snapshots, targetDate) {
  let closest = null;
  let minDiff = Infinity;
  for (const s of snapshots) {
    const diff = Math.abs(new Date(s.snapshot_date) - targetDate);
    if (diff < minDiff) { minDiff = diff; closest = s; }
  }
  return closest;
}

function PerformanceAnalysisPage() {
  const { t, locale } = useLanguage();
  const [snapshots, setSnapshots] = useState([]);
  const [selectedSnapshot1, setSelectedSnapshot1] = useState(null);
  const [selectedSnapshot2, setSelectedSnapshot2] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState('all');
  const [selectedInstrument, setSelectedInstrument] = useState('ALL');
  const [sortField, setSortField] = useState('value_change_pct');
  const [sortDirection, setSortDirection] = useState('desc');

  const fmt = useCallback((v) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(v),
  [locale]);

  const fmtFull = useCallback((v) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'TRY', minimumFractionDigits: 2 }).format(v),
  [locale]);

  const fmtDate = useCallback((d) =>
    new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }),
  [locale]);

  const fmtShort = useCallback((d) =>
    new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
  [locale]);

  const PRESETS = useMemo(() => [
    { key: 'last2', label: t('performance.presets.last2') },
    { key: '1W', label: t('performance.presets.1w'), days: 7 },
    { key: '1M', label: t('performance.presets.1m'), days: 30 },
    { key: '3M', label: t('performance.presets.3m'), days: 90 },
    { key: '1Y', label: '1Y', days: 365 },
    { key: 'all', label: t('performance.presets.all') },
  ], [t]);

  useEffect(() => { loadSnapshots(); }, []);

  const loadSnapshots = async () => {
    try {
      const res = await getPortfolioSnapshots(365);
      const data = res.data || [];
      setSnapshots(data);
      if (data.length >= 2) {
        setSelectedSnapshot1(data[0].id);
        setSelectedSnapshot2(data[data.length - 1].id);
        setActivePreset('all');
      }
    } catch (err) {
      console.error('Error loading snapshots:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSnapshot1 && selectedSnapshot2 && selectedSnapshot1 !== selectedSnapshot2) {
      compareSnapshots(selectedSnapshot1, selectedSnapshot2)
        .then(res => setComparison(res.data))
        .catch(err => console.error('Error comparing:', err));
    }
  }, [selectedSnapshot1, selectedSnapshot2]);

  const applyPreset = useCallback((key) => {
    if (snapshots.length < 2) return;
    const newest = snapshots[snapshots.length - 1];

    if (key === 'last2') {
      setSelectedSnapshot1(snapshots[snapshots.length - 2].id);
      setSelectedSnapshot2(newest.id);
    } else if (key === 'all') {
      setSelectedSnapshot1(snapshots[0].id);
      setSelectedSnapshot2(newest.id);
    } else {
      const preset = PRESETS.find(p => p.key === key);
      if (!preset?.days) return;
      const target = new Date(Date.now() - preset.days * 86400000);
      const closest = findClosestSnapshot(snapshots, target);
      if (closest && closest.id !== newest.id) {
        setSelectedSnapshot1(closest.id);
        setSelectedSnapshot2(newest.id);
      }
    }
    setActivePreset(key);
  }, [snapshots, PRESETS]);

  const handleSelectSnapshot1 = (id) => { setSelectedSnapshot1(id); setActivePreset(null); };
  const handleSelectSnapshot2 = (id) => { setSelectedSnapshot2(id); setActivePreset(null); };

  const handleSort = (field) => {
    if (sortField === field) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('desc'); }
  };

  const { existingInstruments, newInstruments, soldInstruments } = useMemo(() => {
    if (!comparison?.instruments) return { existingInstruments: [], newInstruments: [], soldInstruments: [] };
    const existing = [];
    const added = [];
    const removed = [];
    for (const inst of comparison.instruments) {
      if (inst.status === 'new') added.push(inst);
      else if (inst.status === 'sold') removed.push(inst);
      else existing.push(inst);
    }
    existing.sort((a, b) => {
      let aVal, bVal;
      switch (sortField) {
        case 'symbol': aVal = a.symbol.toLowerCase(); bVal = b.symbol.toLowerCase(); break;
        case 'previous_price': aVal = a.previous_price; bVal = b.previous_price; break;
        case 'current_price': aVal = a.current_price; bVal = b.current_price; break;
        case 'price_change_pct': aVal = a.price_change_pct; bVal = b.price_change_pct; break;
        case 'previous_value': aVal = a.previous_value; bVal = b.previous_value; break;
        case 'current_value': aVal = a.current_value; bVal = b.current_value; break;
        case 'value_change_pct': aVal = a.value_change_pct; bVal = b.value_change_pct; break;
        case 'quantity_change': aVal = a.current_quantity - a.previous_quantity; bVal = b.current_quantity - b.previous_quantity; break;
        default: return 0;
      }
      if (typeof aVal === 'string') return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    added.sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0));
    removed.sort((a, b) => (b.previous_value ?? 0) - (a.previous_value ?? 0));
    return { existingInstruments: existing, newInstruments: added, soldInstruments: removed };
  }, [comparison, sortField, sortDirection]);

  const chartData = useMemo(() => {
    if (!comparison) return [];
    if (selectedInstrument === 'ALL') {
      return [
        { date: fmtShort(comparison.snapshot1.date), value: comparison.snapshot1.total_value, investment: comparison.snapshot1.total_cost },
        { date: fmtShort(comparison.snapshot2.date), value: comparison.snapshot2.total_value, investment: comparison.snapshot2.total_cost },
      ];
    }
    const inst = comparison.instruments.find(i => i.instrument_id === parseInt(selectedInstrument));
    if (!inst) return [];
    return [
      { date: fmtShort(comparison.snapshot1.date), value: inst.previous_value },
      { date: fmtShort(comparison.snapshot2.date), value: inst.current_value },
    ];
  }, [comparison, selectedInstrument, fmtShort]);

  const snap1Info = snapshots.find(s => s.id === selectedSnapshot1);
  const snap2Info = snapshots.find(s => s.id === selectedSnapshot2);

  const SortHeader = ({ field, label, align = 'right' }) => (
    <th onClick={() => handleSort(field)}
      className={`px-3 py-2.5 text-[11px] font-medium text-bnc-textTer uppercase tracking-wider cursor-pointer hover:bg-bnc-surfaceAlt transition-colors ${align === 'left' ? 'text-left' : 'text-right'}`}>
      <div className={`flex items-center gap-1 ${align === 'left' ? '' : 'justify-end'}`}>
        {label}
        {sortField === field
          ? (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
          : <ArrowUpDown className="w-3 h-3 opacity-30" />}
      </div>
    </th>
  );

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bnc-accent" />
      </div>
    );
  }

  if (snapshots.length < 2) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 mx-auto rounded-full bg-bnc-surfaceAlt flex items-center justify-center mb-4">
            <TrendingUp className="w-7 h-7 text-bnc-textTer" />
          </div>
          <h2 className="text-lg font-semibold text-bnc-textPri mb-2">{t('performance.empty.title')}</h2>
          <p className="text-bnc-textTer text-sm">{t('performance.empty.body', { count: String(snapshots.length) })}</p>
        </div>
      </div>
    );
  }

  const change = comparison?.portfolio_change;
  const isPositive = change?.value_change >= 0;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Portfolio Performance Summary */}
      {comparison && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bnc-card p-4">
            <span className="text-[11px] text-bnc-textTer block mb-1">{t('performance.summary.startValue')}</span>
            <p className="text-lg font-bold text-bnc-textPri">{fmt(comparison.snapshot1.total_value)}</p>
            <span className="text-[10px] text-bnc-textTer">{fmtDate(comparison.snapshot1.date)}</span>
          </div>
          <div className="bnc-card p-4">
            <span className="text-[11px] text-bnc-textTer block mb-1">{t('performance.summary.endValue')}</span>
            <p className="text-lg font-bold text-bnc-textPri">{fmt(comparison.snapshot2.total_value)}</p>
            <span className="text-[10px] text-bnc-textTer">{fmtDate(comparison.snapshot2.date)}</span>
          </div>
          <div className="bnc-card p-4">
            <span className="text-[11px] text-bnc-textTer block mb-1">{t('performance.summary.totalInvestment')}</span>
            <p className="text-lg font-bold text-bnc-textPri">{fmt(comparison.snapshot2.total_cost)}</p>
          </div>
          <div className={`bnc-card p-4 ${isPositive ? 'border-bnc-green/30' : 'border-bnc-red/30'}`}>
            <span className="text-[11px] text-bnc-textTer block mb-1">{t('performance.summary.valueChange')}</span>
            <p className={`text-lg font-bold ${isPositive ? 'text-bnc-green' : 'text-bnc-red'}`}>
              {isPositive ? '+' : ''}{change.value_change_pct.toFixed(2)}%
            </p>
            <span className={`text-[10px] font-medium ${isPositive ? 'text-bnc-green' : 'text-bnc-red'}`}>
              {isPositive ? '+' : ''}{fmt(change.value_change)}
            </span>
          </div>
        </div>
      )}

      {/* Date Selection */}
      <div className="bnc-card p-4">
        {/* Presets */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-1 flex-wrap">
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => applyPreset(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activePreset === p.key
                    ? 'bg-bnc-accent text-bnc-bg'
                    : 'bg-bnc-surfaceAlt text-bnc-textTer hover:bg-bnc-border hover:text-bnc-textSec'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Calendars */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-bnc-textSec">{t('performance.dateRange.start')}</span>
              {snap1Info && <span className="text-[11px] text-bnc-accent font-medium">{fmtDate(snap1Info.snapshot_date)}</span>}
            </div>
            <SnapshotCalendar snapshots={snapshots} selectedSnapshot={selectedSnapshot1} onSelectSnapshot={handleSelectSnapshot1} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-bnc-textSec">{t('performance.dateRange.end')}</span>
              {snap2Info && <span className="text-[11px] text-bnc-accent font-medium">{fmtDate(snap2Info.snapshot_date)}</span>}
            </div>
            <SnapshotCalendar snapshots={snapshots} selectedSnapshot={selectedSnapshot2} onSelectSnapshot={handleSelectSnapshot2} />
          </div>
        </div>
      </div>

      {/* Chart */}
      {comparison && (
        <div className="bnc-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-bnc-textPri flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-bnc-accent" />
              {t('performance.chart.title')}
            </h2>
            <select value={selectedInstrument} onChange={(e) => setSelectedInstrument(e.target.value)}
              className="bnc-input text-xs py-1.5 pr-8">
              <option value="ALL">{t('performance.chart.wholePortfolio')}</option>
              {comparison.instruments.map(inst => (
                <option key={inst.instrument_id} value={inst.instrument_id}>{inst.symbol}</option>
              ))}
            </select>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2B3139" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#848E9C' }} axisLine={{ stroke: '#2B3139' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#848E9C' }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : `${v}`} />
              <Tooltip contentStyle={{ backgroundColor: '#1E2329', border: '1px solid #2B3139', borderRadius: '8px', color: '#EAECEF' }}
                formatter={(v, name) => [fmtFull(v), name]} />
              <Legend wrapperStyle={{ color: '#B7BDC6', fontSize: '12px' }} />
              <Line type="monotone" dataKey="value" stroke="#F0B90B" strokeWidth={2.5}
                dot={{ fill: '#F0B90B', r: 5, strokeWidth: 0 }} name={selectedInstrument === 'ALL' ? t('performance.chart.portfolioValue') : t('performance.chart.value')} />
              {selectedInstrument === 'ALL' && (
                <Line type="monotone" dataKey="investment" stroke="#0ECB81" strokeWidth={2} strokeDasharray="5 5"
                  dot={{ fill: '#0ECB81', r: 4 }} name={t('performance.chart.totalInvestment')} />
              )}
            </LineChart>
          </ResponsiveContainer>

          {selectedInstrument !== 'ALL' && (() => {
            const inst = comparison.instruments.find(i => i.instrument_id === parseInt(selectedInstrument));
            if (!inst) return null;
            const qtyChange = inst.current_quantity - inst.previous_quantity;
            return (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: t('performance.instrumentDetail.priceChange'), value: `${inst.price_change_pct >= 0 ? '+' : ''}${inst.price_change_pct.toFixed(2)}%`, sub: `${fmt(inst.previous_price)} → ${fmt(inst.current_price)}`, positive: inst.price_change_pct >= 0 },
                  { label: t('performance.instrumentDetail.valueChange'), value: `${inst.value_change_pct >= 0 ? '+' : ''}${inst.value_change_pct.toFixed(2)}%`, sub: `${fmt(inst.previous_value)} → ${fmt(inst.current_value)}`, positive: inst.value_change_pct >= 0 },
                  { label: t('performance.instrumentDetail.quantityChange'), value: `${qtyChange >= 0 ? '+' : ''}${qtyChange.toFixed(2)}`, sub: `${inst.previous_quantity.toFixed(2)} → ${inst.current_quantity.toFixed(2)}`, positive: qtyChange >= 0 },
                  { label: t('performance.instrumentDetail.avgCost'), value: fmt(inst.current_avg_cost || 0), sub: `${t('performance.instrumentDetail.previous')} ${fmt(inst.previous_avg_cost || 0)}`, positive: null },
                ].map(item => (
                  <div key={item.label} className="bg-bnc-bg rounded-lg p-3 border border-bnc-border">
                    <span className="text-[11px] text-bnc-textTer block mb-1">{item.label}</span>
                    <p className={`text-base font-bold ${item.positive === null ? 'text-bnc-textPri' : item.positive ? 'text-bnc-green' : 'text-bnc-red'}`}>
                      {item.value}
                    </p>
                    <span className="text-[10px] text-bnc-textTer">{item.sub}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Existing Instruments Table */}
      {comparison && existingInstruments.length > 0 && (
        <div className="bnc-card overflow-hidden">
          <div className="px-4 py-3 border-b border-bnc-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-bnc-textPri">{t('performance.table.title')}</h2>
            <span className="text-[11px] text-bnc-textTer">{existingInstruments.length} {t('performance.table.instrumentSuffix')}</span>
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-bnc-surfaceAlt/50">
                  <SortHeader field="symbol" label={t('performance.table.column.instrument')} align="left" />
                  <SortHeader field="previous_price" label={t('performance.table.column.previousPrice')} />
                  <SortHeader field="current_price" label={t('performance.table.column.currentPrice')} />
                  <SortHeader field="price_change_pct" label={t('performance.table.column.pricePct')} />
                  <SortHeader field="previous_value" label={t('performance.table.column.previousValue')} />
                  <SortHeader field="current_value" label={t('performance.table.column.currentValue')} />
                  <SortHeader field="value_change_pct" label={t('performance.table.column.valuePct')} />
                  <SortHeader field="quantity_change" label={t('performance.table.column.quantity')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-bnc-border">
                {existingInstruments.map((inst) => {
                  const qtyChange = inst.current_quantity - inst.previous_quantity;
                  return (
                    <tr key={inst.instrument_id} className="hover:bg-bnc-surfaceAlt/40 transition-colors">
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-medium text-bnc-textPri">{inst.symbol}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-bnc-textSec">{fmt(inst.previous_price)}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-bnc-textPri font-medium">{fmt(inst.current_price)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`inline-flex items-center text-xs font-semibold ${inst.price_change_pct >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                          {inst.price_change_pct >= 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                          {inst.price_change_pct >= 0 ? '+' : ''}{inst.price_change_pct.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-bnc-textSec">{fmt(inst.previous_value)}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-bnc-textPri font-medium">{fmt(inst.current_value)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`inline-flex items-center text-xs font-semibold ${inst.value_change_pct >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                          {inst.value_change_pct >= 0 ? '+' : ''}{inst.value_change_pct.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`text-xs font-medium ${qtyChange > 0 ? 'text-bnc-green' : qtyChange < 0 ? 'text-bnc-red' : 'text-bnc-textTer'}`}>
                          {qtyChange > 0 ? '+' : ''}{qtyChange.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-bnc-textTer block">{inst.previous_quantity.toFixed(2)} → {inst.current_quantity.toFixed(2)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden divide-y divide-bnc-border">
            {existingInstruments.map((inst) => {
              const qtyChange = inst.current_quantity - inst.previous_quantity;
              return (
                <div key={inst.instrument_id} className="p-3 hover:bg-bnc-surfaceAlt/40">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-bnc-textPri">{inst.symbol}</span>
                    <span className={`text-xs font-semibold ${inst.value_change_pct >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                      {inst.value_change_pct >= 0 ? '+' : ''}{inst.value_change_pct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-bnc-textTer">
                    <span>{t('performance.table.mobile.price')} {fmt(inst.previous_price)} → {fmt(inst.current_price)}</span>
                    <span>{t('performance.table.mobile.value')} {fmt(inst.previous_value)} → {fmt(inst.current_value)}</span>
                    {qtyChange !== 0 && <span>{t('performance.table.mobile.quantity')} {qtyChange > 0 ? '+' : ''}{qtyChange.toFixed(2)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New Instruments */}
      {comparison && newInstruments.length > 0 && (
        <div className="bnc-card overflow-hidden">
          <div className="px-4 py-3 border-b border-bnc-border flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-bnc-green" />
            <h2 className="text-sm font-semibold text-bnc-textPri flex-1">{t('performance.sections.added')}</h2>
            <span className="text-[11px] text-bnc-textTer">{newInstruments.length} {t('performance.table.instrumentSuffix')}</span>
          </div>
          <div className="divide-y divide-bnc-border">
            {newInstruments.map((inst) => (
              <div key={inst.instrument_id} className="px-4 py-2.5 flex items-center hover:bg-bnc-surfaceAlt/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-bnc-textPri">{inst.symbol}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-bnc-textPri">{fmt(inst.current_value)}</span>
                  <span className="text-[10px] text-bnc-textTer block">{(inst.current_quantity ?? 0).toFixed(2)} {t('performance.sections.unitsSuffix')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sold Instruments */}
      {comparison && soldInstruments.length > 0 && (
        <div className="bnc-card overflow-hidden">
          <div className="px-4 py-3 border-b border-bnc-border flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-bnc-red" />
            <h2 className="text-sm font-semibold text-bnc-textPri flex-1">{t('performance.sections.removed')}</h2>
            <span className="text-[11px] text-bnc-textTer">{soldInstruments.length} {t('performance.table.instrumentSuffix')}</span>
          </div>
          <div className="divide-y divide-bnc-border">
            {soldInstruments.map((inst) => (
              <div key={inst.instrument_id} className="px-4 py-2.5 flex items-center hover:bg-bnc-surfaceAlt/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-bnc-textPri">{inst.symbol}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-bnc-textSec">{fmt(inst.previous_value)}</span>
                  <span className="text-[10px] text-bnc-textTer block">{(inst.previous_quantity ?? 0).toFixed(2)} {t('performance.sections.unitsSuffix')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PerformanceAnalysisPage;
