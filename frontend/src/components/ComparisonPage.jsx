import { useState, useEffect, useMemo, useCallback } from 'react';
import { getTWRComparison } from '../services/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useLanguage } from '../contexts/LanguageContext';

/** Stable series key for portfolio line (not locale-dependent). */
const PORTFOLIO_SERIES = 'portfolio';

const BENCHMARK_COLORS = {
  [PORTFOLIO_SERIES]: '#F0B90B',
  'XAU/USD': '#F59E0B',
  'USD/TRY': '#0ECB81',
  'BIST 100': '#F6465D',
  'BIST 30': '#8B5CF6',
  'Gümüş': '#848E9C',
};

const TOOLTIP_STYLE = {
  backgroundColor: '#1E2329',
  border: '1px solid #2B3139',
  borderRadius: '8px',
  color: '#EAECEF',
  fontSize: '12px',
};

function ComparisonPage() {
  const { t, locale } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visible, setVisible] = useState({
    [PORTFOLIO_SERIES]: true,
    'XAU/USD': true,
    'USD/TRY': true,
    'BIST 100': true,
    'BIST 30': true,
    'Gümüş': true,
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getTWRComparison();
      if (res.data.error) {
        setError(res.data.error);
      } else {
        setData(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || t('comparison.error.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const fmtDate = useCallback((d) => new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }), [locale]);

  const seriesDisplayName = useCallback((name) => {
    if (name === PORTFOLIO_SERIES) return t('comparison.series.portfolio');
    if (name === 'Gümüş') return t('comparison.series.silver');
    return name;
  }, [t]);

  const chartData = useMemo(() => {
    if (!data) return [];
    const dateMap = {};
    data.portfolio.series.forEach((p) => {
      if (!dateMap[p.date]) dateMap[p.date] = { date: p.date };
      dateMap[p.date][PORTFOLIO_SERIES] = p.value;
    });
    Object.entries(data.benchmarks).forEach(([name, bm]) => {
      if (bm.series) {
        bm.series.forEach((p) => {
          if (!dateMap[p.date]) dateMap[p.date] = { date: p.date };
          dateMap[p.date][name] = p.value;
        });
      }
    });
    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date)).map(item => ({
      ...item,
      dateLabel: new Date(item.date).toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
    }));
  }, [data, locale]);

  const summaryRows = useMemo(() => {
    if (!data) return [];
    const rows = [{
      name: PORTFOLIO_SERIES,
      displayName: t('comparison.series.portfolio'),
      change: data.portfolio.total_change,
      color: BENCHMARK_COLORS[PORTFOLIO_SERIES],
      isPortfolio: true,
    }];
    Object.entries(data.benchmarks).forEach(([name, bm]) => {
      rows.push({
        name,
        displayName: name === 'Gümüş' ? t('comparison.series.silver') : name,
        change: bm.total_change ?? null,
        error: bm.error,
        color: BENCHMARK_COLORS[name] || '#848E9C',
      });
    });
    return rows.sort((a, b) => (b.change ?? -999) - (a.change ?? -999));
  }, [data, t]);

  const toggleVisibility = (name) => {
    setVisible(prev => ({ ...prev, [name]: !prev[name] }));
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-bnc-border border-t-bnc-accent" />
        <p className="text-xs text-bnc-textTer">{t('comparison.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto py-8">
        <div className="bnc-card p-5 text-center border-bnc-red/40">
          <p className="text-bnc-red font-medium text-sm">{error}</p>
          <button onClick={load} className="mt-3 bnc-btn-primary text-sm">{t('common.retry')}</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-4 text-bnc-textPri">
      {/* Tarih aralığı */}
      <div className="text-xs text-bnc-textTer">
        {fmtDate(data.first_date)} — {fmtDate(data.last_date)} · {data.total_days} {t('comparison.dateRange.daysSuffix')}
      </div>

      {/* Sıralama Kartları — toggle olarak da çalışır */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
        {summaryRows.map((row, i) => (
          <button
            key={row.name}
            onClick={() => toggleVisibility(row.name)}
            className={`rounded-lg p-2 border text-left transition-all ${
              visible[row.name]
                ? row.isPortfolio
                  ? 'bg-bnc-surfaceAlt border-bnc-accent'
                  : 'bg-bnc-surface border-bnc-border'
                : 'bg-bnc-bg border-bnc-border opacity-40'
            }`}
          >
            <div className="flex items-center gap-1 mb-0.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
              <span className="text-[10px] text-bnc-textTer font-medium">#{i + 1}</span>
            </div>
            <p className="text-[10px] font-medium text-bnc-textSec truncate">{row.displayName}</p>
            {row.error ? (
              <p className="text-[10px] text-bnc-textTer mt-0.5">{t('comparison.ranking.noData')}</p>
            ) : (
              <p className={`text-sm font-bold mt-0.5 ${(row.change ?? 0) >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                {(row.change ?? 0) >= 0 ? '+' : ''}{(row.change ?? 0).toFixed(2)}%
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Grafik */}
      {chartData.length > 1 && (
        <div className="bnc-card p-3.5">
          <h2 className="text-sm font-semibold text-bnc-textPri mb-3">{t('comparison.chart.cumulativeReturn')}</h2>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2B3139" opacity={0.5} />
              <XAxis dataKey="dateLabel" stroke="#848E9C" style={{ fontSize: '11px' }} />
              <YAxis stroke="#848E9C" style={{ fontSize: '11px' }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name) => [`${value >= 0 ? '+' : ''}${value.toFixed(2)}%`, seriesDisplayName(name)]}
                labelFormatter={(_, payload) => {
                  const d = payload?.[0]?.payload?.date;
                  return d ? fmtDate(d) : '';
                }}
              />
              <ReferenceLine y={0} stroke="#848E9C" strokeDasharray="3 3" />
              {Object.entries(BENCHMARK_COLORS).map(([name, color]) => (
                visible[name] && (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={color}
                    strokeWidth={name === PORTFOLIO_SERIES ? 2.5 : 1.5}
                    dot={false}
                    strokeDasharray={name === PORTFOLIO_SERIES ? undefined : '5 3'}
                    connectNulls
                  />
                )
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Sıralama Tablosu */}
      <div className="bnc-card overflow-hidden p-0">
        <div className="px-3.5 py-3 border-b border-bnc-border">
          <h2 className="text-sm font-semibold text-bnc-textPri">{t('comparison.ranking.title')}</h2>
        </div>
        <div className="divide-y divide-bnc-border">
          {summaryRows.map((row, i) => {
            const diff = row.isPortfolio ? null : (data.portfolio.total_change - (row.change ?? 0));
            return (
              <div key={row.name} className={`flex items-center px-3.5 py-2.5 gap-3 ${row.isPortfolio ? 'bg-bnc-accent/5' : 'hover:bg-bnc-surfaceAlt/40'}`}>
                <span className="text-xs font-bold text-bnc-textTer w-5 text-center">{i + 1}</span>
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                <span className={`flex-1 text-xs truncate ${row.isPortfolio ? 'font-bold text-bnc-accent' : 'font-medium text-bnc-textPri'}`}>
                  {row.displayName}
                </span>
                {row.error ? (
                  <span className="text-[10px] text-bnc-textTer">{t('comparison.ranking.noData')}</span>
                ) : (
                  <span className={`text-xs font-bold ${(row.change ?? 0) >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                    {(row.change ?? 0) >= 0 ? '+' : ''}{(row.change ?? 0).toFixed(2)}%
                  </span>
                )}
                {diff !== null && !row.error && (
                  <span className={`text-[10px] font-medium w-16 text-right ${diff >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                    {diff >= 0 ? '▲+' : '▼'}{Math.abs(diff).toFixed(1)}%
                  </span>
                )}
                {diff === null && <span className="w-16" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ComparisonPage;
