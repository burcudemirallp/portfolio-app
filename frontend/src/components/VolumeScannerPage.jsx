import { useState } from 'react';
import { BarChart3, Search, ArrowUpDown, Filter } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { runBistVolumeScan } from '../services/api';

const SIGNAL_CONFIG = {
  strong_buy:    { color: 'bg-bnc-green/15 text-bnc-green', order: 1 },
  buy:           { color: 'bg-bnc-green/10 text-bnc-green', order: 2 },
  accumulation:  { color: 'bg-bnc-accent/15 text-bnc-accent', order: 3 },
  sell_pressure: { color: 'bg-bnc-red/10 text-bnc-red', order: 4 },
  panic_sell:    { color: 'bg-bnc-red/15 text-bnc-red', order: 5 },
};

export default function VolumeScannerPage() {
  const { t, locale } = useLanguage();
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [minRatio, setMinRatio] = useState(1.5);
  const [lookbackDays, setLookbackDays] = useState(5);
  const [sortField, setSortField] = useState('volume_ratio');
  const [sortAsc, setSortAsc] = useState(false);
  const [signalFilter, setSignalFilter] = useState('all');

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await runBistVolumeScan({ min_ratio: minRatio, lookback_days: lookbackDays });
      setResults(res.data);
      setSignalFilter('all');
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const filtered = results?.results
    ? results.results.filter((r) => signalFilter === 'all' || r.signal === signalFilter)
    : [];

  const sorted = [...filtered].sort((a, b) => {
    const va = a[sortField] ?? 0;
    const vb = b[sortField] ?? 0;
    if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortAsc ? va - vb : vb - va;
  });

  // Sinyal bazlı sayılar
  const signalCounts = results?.results
    ? results.results.reduce((acc, r) => { acc[r.signal] = (acc[r.signal] || 0) + 1; return acc; }, {})
    : {};

  const fmtNum = (n) =>
    n != null ? n.toLocaleString(locale, { maximumFractionDigits: 0 }) : '-';

  const fmtPct = (n) => {
    if (n == null) return '-';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(2)}%`;
  };

  const pctColor = (n) => {
    if (n == null || n === 0) return 'text-bnc-textSec';
    return n > 0 ? 'text-bnc-green' : 'text-bnc-red';
  };

  const ratioBarWidth = (ratio) => Math.min((ratio / 10) * 100, 100);

  const daysAgoLabel = (d) => {
    if (d === 0) return t('volumeScanner.today');
    if (d === 1) return t('volumeScanner.yesterday');
    return t('volumeScanner.daysAgo', { n: d });
  };

  const signalLabel = (s) => t(`volumeScanner.signal.${s}`);

  const SortHeader = ({ field, label, align = 'left' }) => (
    <th
      className={`px-3 py-2.5 text-[11px] font-semibold text-bnc-textTer uppercase tracking-wider cursor-pointer hover:text-bnc-textPri select-none ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortField === field && (
          <ArrowUpDown className="w-3 h-3 text-bnc-accent" />
        )}
      </span>
    </th>
  );

  const FilterChip = ({ value, label, count }) => (
    <button
      onClick={() => setSignalFilter(value)}
      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
        signalFilter === value
          ? 'bg-bnc-accent text-bnc-bg'
          : 'bg-bnc-surfaceAlt text-bnc-textSec hover:text-bnc-textPri'
      }`}
    >
      {label}{count != null ? ` (${count})` : ''}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-bnc-accent" />
          <div>
            <h1 className="text-lg font-bold text-bnc-textPri">{t('volumeScanner.title')}</h1>
            <p className="text-xs text-bnc-textTer">{t('volumeScanner.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-bnc-textSec">{t('volumeScanner.minRatio')}</label>
            <input
              type="number" min="1" max="20" step="0.5" value={minRatio}
              onChange={(e) => setMinRatio(parseFloat(e.target.value) || 1.5)}
              className="w-16 px-2 py-1.5 text-xs bg-bnc-surfaceAlt border border-bnc-border rounded-lg text-bnc-textPri focus:outline-none focus:border-bnc-accent"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-bnc-textSec">{t('volumeScanner.lookback')}</label>
            <input
              type="number" min="1" max="20" step="1" value={lookbackDays}
              onChange={(e) => setLookbackDays(parseInt(e.target.value) || 5)}
              className="w-14 px-2 py-1.5 text-xs bg-bnc-surfaceAlt border border-bnc-border rounded-lg text-bnc-textPri focus:outline-none focus:border-bnc-accent"
            />
            <span className="text-xs text-bnc-textTer">{t('volumeScanner.days')}</span>
          </div>
          <button
            onClick={handleScan} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-bnc-accent text-bnc-bg rounded-lg hover:bg-bnc-accentHover disabled:opacity-50 transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            {loading ? t('volumeScanner.scanning') : t('volumeScanner.scan')}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-bnc-red/10 border border-bnc-red/30 rounded-lg text-xs text-bnc-red">{error}</div>
      )}

      {/* Results */}
      {results && (
        <div className="bnc-card overflow-hidden">
          {/* Summary bar + filter chips */}
          <div className="px-4 py-3 border-b border-bnc-border space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-bnc-textSec">
                {results.criteria} &middot; <span className="text-bnc-accent font-semibold">{results.count}</span> {t('volumeScanner.col.symbol').toLowerCase()}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="w-3 h-3 text-bnc-textTer" />
              <FilterChip value="all" label={t('volumeScanner.filter.all')} count={results.count} />
              <FilterChip value="strong_buy" label={t('volumeScanner.signal.strong_buy')} count={signalCounts.strong_buy} />
              <FilterChip value="buy" label={t('volumeScanner.signal.buy')} count={signalCounts.buy} />
              <FilterChip value="accumulation" label={t('volumeScanner.signal.accumulation')} count={signalCounts.accumulation} />
              <FilterChip value="sell_pressure" label={t('volumeScanner.signal.sell_pressure')} count={signalCounts.sell_pressure} />
              <FilterChip value="panic_sell" label={t('volumeScanner.signal.panic_sell')} count={signalCounts.panic_sell} />
            </div>
          </div>

          {sorted.length === 0 ? (
            <div className="py-12 text-center">
              <BarChart3 className="w-8 h-8 mx-auto text-bnc-textTer/40 mb-2" />
              <p className="text-xs text-bnc-textTer">{t('volumeScanner.noResults')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-bnc-surfaceAlt/50">
                  <tr>
                    <SortHeader field="symbol" label={t('volumeScanner.col.symbol')} />
                    <SortHeader field="signal" label={t('volumeScanner.col.signal')} />
                    <SortHeader field="volume_ratio" label={t('volumeScanner.col.volumeRatio')} />
                    <SortHeader field="days_ago" label={t('volumeScanner.col.when')} />
                    <SortHeader field="volume" label={t('volumeScanner.col.volume')} align="right" />
                    <SortHeader field="avg_volume" label={t('volumeScanner.col.avgVolume')} align="right" />
                    <SortHeader field="close" label={t('volumeScanner.col.price')} align="right" />
                    <SortHeader field="change_1d" label={t('volumeScanner.col.change1d')} align="right" />
                    <SortHeader field="change_5d" label={t('volumeScanner.col.change5d')} align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-bnc-border">
                  {sorted.map((row) => {
                    const cfg = SIGNAL_CONFIG[row.signal] || SIGNAL_CONFIG.accumulation;
                    return (
                      <tr key={row.symbol} className="hover:bg-bnc-surfaceAlt/30 transition-colors">
                        <td className="px-3 py-2.5 font-semibold text-bnc-textPri">{row.symbol}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${cfg.color}`}>
                            {signalLabel(row.signal)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-bnc-accent min-w-[40px]">{row.volume_ratio}x</span>
                            <div className="flex-1 h-2 bg-bnc-surfaceAlt rounded-full overflow-hidden max-w-[100px]">
                              <div
                                className="h-full bg-bnc-accent rounded-full transition-all"
                                style={{ width: `${ratioBarWidth(row.volume_ratio)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-bnc-textTer">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            row.days_ago === 0 ? 'bg-bnc-accent/15 text-bnc-accent' : 'bg-bnc-surfaceAlt text-bnc-textTer'
                          }`}>
                            {daysAgoLabel(row.days_ago)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-bnc-textSec tabular-nums">{fmtNum(row.volume)}</td>
                        <td className="px-3 py-2.5 text-right text-bnc-textTer tabular-nums">{fmtNum(row.avg_volume)}</td>
                        <td className="px-3 py-2.5 text-right text-bnc-textPri font-medium tabular-nums">{row.close}</td>
                        <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${pctColor(row.change_1d)}`}>{fmtPct(row.change_1d)}</td>
                        <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${pctColor(row.change_5d)}`}>{fmtPct(row.change_5d)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
