import { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendingUp, Calendar, DollarSign, BarChart3, ChevronUp, ChevronDown, Info } from 'lucide-react';
import { getPortfolioTWR } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from 'recharts';

const TOOLTIP_STYLE = { backgroundColor: '#1E2329', border: '1px solid #2B3139', borderRadius: '8px', color: '#EAECEF' };

function TWRPage() {
  const { t, locale } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartPeriod, setChartPeriod] = useState('ALL');
  const [periodsOpen, setPeriodsOpen] = useState(false);
  const [expandedPeriod, setExpandedPeriod] = useState(null);
  const [detailPeriod, setDetailPeriod] = useState('ALL');

  const CHART_PERIODS = useMemo(() => [
    { key: '7D', label: t('twr.periods.7d'), days: 7 },
    { key: '1M', label: t('twr.periods.1m'), days: 30 },
    { key: '3M', label: t('twr.periods.3m'), days: 90 },
    { key: '1Y', label: '1Y', days: 365 },
    { key: 'ALL', label: t('twr.periods.all'), days: Infinity },
  ], [t]);

  useEffect(() => { loadTWR(); }, []);

  const loadTWR = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPortfolioTWR();
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || t('twr.error.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = useCallback((v) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v), [locale]);

  const formatDate = useCallback((iso) =>
    new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }), [locale]);

  const formatDateShort = useCallback((iso) =>
    new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short' }), [locale]);

  const filteredPeriods = useMemo(() => {
    if (!data?.periods?.length) return [];
    if (chartPeriod === 'ALL') return data.periods;
    const preset = CHART_PERIODS.find(p => p.key === chartPeriod);
    if (!preset) return data.periods;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - preset.days);
    return data.periods.filter(p => new Date(p.to_date) >= cutoff);
  }, [data, chartPeriod]);

  const cumulativeChartData = useMemo(() => {
    if (!filteredPeriods.length) return [];
    let cum = 1.0;
    return filteredPeriods.map((p) => {
      cum *= (1 + p.period_return / 100);
      return {
        date: formatDateShort(p.to_date),
        fullDate: formatDate(p.to_date),
        cumulative: parseFloat(((cum - 1) * 100).toFixed(2)),
        period: parseFloat(p.period_return.toFixed(2)),
        value: p.ending_value,
      };
    });
  }, [filteredPeriods]);

  const periodBarData = useMemo(() => {
    if (!filteredPeriods.length) return [];
    return filteredPeriods.map((p) => ({
      date: formatDateShort(p.to_date),
      fullDate: formatDate(p.to_date),
      return: parseFloat(p.period_return.toFixed(2)),
      cashFlow: p.cash_flow,
    }));
  }, [filteredPeriods]);

  const valueAreaData = useMemo(() => {
    if (!filteredPeriods.length) return [];
    const items = [];
    items.push({
      date: formatDateShort(filteredPeriods[0].from_date),
      fullDate: formatDate(filteredPeriods[0].from_date),
      value: filteredPeriods[0].beginning_value,
    });
    filteredPeriods.forEach((p) => {
      items.push({
        date: formatDateShort(p.to_date),
        fullDate: formatDate(p.to_date),
        value: p.ending_value,
      });
    });
    return items;
  }, [filteredPeriods]);

  const periodTWR = useMemo(() => {
    if (!filteredPeriods.length) return 0;
    let cum = 1.0;
    filteredPeriods.forEach(p => { cum *= (1 + p.period_return / 100); });
    return (cum - 1) * 100;
  }, [filteredPeriods]);

  const reversedPeriods = useMemo(() => {
    if (!data?.periods) return [];
    let list = [...data.periods];
    if (detailPeriod !== 'ALL') {
      const preset = CHART_PERIODS.find(p => p.key === detailPeriod);
      if (preset?.days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - preset.days);
        list = list.filter(p => new Date(p.to_date) >= cutoff);
      }
    }
    return list.sort((a, b) => new Date(b.to_date) - new Date(a.to_date));
  }, [data, detailPeriod]);

  const PeriodPills = () => (
    <div className="flex items-center gap-1">
      {CHART_PERIODS.map(p => (
        <button key={p.key} onClick={() => setChartPeriod(p.key)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
            chartPeriod === p.key
              ? 'bg-bnc-accent/15 text-bnc-accent'
              : 'text-bnc-textTer hover:bg-bnc-surfaceAlt'
          }`}>
          {p.label}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-bnc-border border-t-bnc-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bnc-card p-5 text-center border-bnc-red/40">
          <p className="text-bnc-red font-medium text-sm">{error}</p>
          <button onClick={loadTWR} className="mt-3 bnc-btn-primary text-sm">{t('common.retry')}</button>
        </div>
      </div>
    );
  }

  if (data?.message) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bnc-card p-5 text-center border-bnc-accent/30">
          <Info className="w-9 h-9 text-bnc-accent mx-auto mb-2" />
          <p className="text-bnc-textPri font-medium text-sm">{data.message}</p>
          <p className="text-xs text-bnc-textSec mt-1">{t('twr.empty.hint')}</p>
        </div>
      </div>
    );
  }

  const netCash = (data.total_cash_inflow || 0) - (data.total_cash_outflow || 0);

  return (
    <div className="max-w-7xl mx-auto space-y-4 text-bnc-textPri">
      {/* Ana Kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bnc-card p-3.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <TrendingUp className="w-3.5 h-3.5 text-bnc-accent" />
            <p className="text-[11px] text-bnc-textSec">{t('twr.cards.totalReturn')}</p>
          </div>
          <p className={`text-xl font-bold ${data.twr >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
            {data.twr >= 0 ? '+' : ''}{data.twr.toFixed(2)}%
          </p>
        </div>

        <div className="bnc-card p-3.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <BarChart3 className="w-3.5 h-3.5 text-bnc-textTer" />
            <p className="text-[11px] text-bnc-textSec">{t('twr.cards.annualReturn')}</p>
          </div>
          <p className={`text-xl font-bold ${data.twr_annualized >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
            {data.twr_annualized >= 0 ? '+' : ''}{data.twr_annualized.toFixed(2)}%
          </p>
        </div>

        <div className="bnc-card p-3.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Calendar className="w-3.5 h-3.5 text-bnc-textTer" />
            <p className="text-[11px] text-bnc-textSec">{t('twr.cards.measurementPeriod')}</p>
          </div>
          <p className="text-xl font-bold text-bnc-textPri">{data.total_days} {t('twr.cards.daysSuffix')}</p>
          <p className="text-[10px] text-bnc-textTer">{data.snapshot_count} {t('twr.cards.snapshotsSuffix')}</p>
        </div>

        <div className="bnc-card p-3.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <DollarSign className="w-3.5 h-3.5 text-bnc-green" />
            <p className="text-[11px] text-bnc-textSec">{t('twr.cards.netCashFlow')}</p>
          </div>
          {data.cash_flow_count === 0 ? (
            <>
              <p className="text-xl font-bold text-bnc-textPri">—</p>
              <p className="text-[10px] text-bnc-textTer">{t('twr.cards.noRecords')}</p>
            </>
          ) : (
            <>
              <p className={`text-xl font-bold ${netCash >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                {formatCurrency(netCash)}
              </p>
              <p className="text-[10px] text-bnc-textTer">
                {t('twr.cards.inflowPrefix')} {formatCurrency(data.total_cash_inflow)}{(data.total_cash_outflow || 0) > 0 ? ` ${t('twr.cards.outflowSeparator')} ${formatCurrency(data.total_cash_outflow)}` : ''}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Portföy Değer Aralığı */}
      <div className="bnc-card p-3.5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-bnc-textSec">{t('twr.range.firstSnapshot')}</p>
            <p className="text-base font-semibold text-bnc-textPri">{formatCurrency(data.first_snapshot_value)}</p>
            <p className="text-[10px] text-bnc-textTer">{data.first_snapshot_date ? formatDate(data.first_snapshot_date) : '-'}</p>
          </div>
          <div className="flex-1 mx-4 min-w-0">
            <div className="h-1.5 bg-bnc-surfaceAlt rounded-full relative overflow-hidden">
              <div
                className={`h-full rounded-full ${data.twr >= 0 ? 'bg-gradient-to-r from-bnc-accent to-bnc-green' : 'bg-gradient-to-r from-bnc-red to-bnc-accent'}`}
                style={{ width: `${Math.min(100, Math.max(5, 50 + data.twr))}%` }}
              />
            </div>
            <p className="text-center text-[11px] text-bnc-textSec mt-1">{data.twr >= 0 ? '+' : ''}{data.twr.toFixed(2)}% {t('twr.range.returnSuffix')}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-bnc-textSec">{t('twr.range.lastSnapshot')}</p>
            <p className="text-base font-semibold text-bnc-textPri">{formatCurrency(data.last_snapshot_value)}</p>
            <p className="text-[10px] text-bnc-textTer">{data.last_snapshot_date ? formatDate(data.last_snapshot_date) : '-'}</p>
          </div>
        </div>
      </div>

      {/* Period Pills + Seçili dönem TWR özet */}
      {data.periods?.length > 1 && (
        <div className="bnc-card p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <PeriodPills />
          {chartPeriod !== 'ALL' && filteredPeriods.length > 0 && (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-bnc-textTer">{filteredPeriods.length} {t('twr.filtered.periodsSuffix')}</span>
              <span className={`font-bold ${periodTWR >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                {periodTWR >= 0 ? '+' : ''}{periodTWR.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Kümülatif TWR Grafiği */}
      {cumulativeChartData.length > 1 && (
        <div className="bnc-card p-3.5">
          <h2 className="text-sm font-semibold text-bnc-textPri mb-3">{t('twr.charts.cumulative')}</h2>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={cumulativeChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="twrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F0B90B" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#F0B90B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2B3139" opacity={0.5} />
              <XAxis dataKey="date" stroke="#848E9C" style={{ fontSize: '11px' }} />
              <YAxis stroke="#848E9C" style={{ fontSize: '11px' }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ ...TOOLTIP_STYLE, fontSize: '12px' }}
                formatter={(value, name) => [
                  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`,
                  name === 'cumulative' ? t('twr.tooltip.cumulativeTWR') : t('twr.tooltip.periodReturn')
                ]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
              />
              <ReferenceLine y={0} stroke="#848E9C" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="cumulative" stroke="#F0B90B" strokeWidth={2} fill="url(#twrGrad)" name="cumulative" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Dönemsel Getiri Bar Grafiği */}
      {periodBarData.length > 1 && (
        <div className="bnc-card p-3.5">
          <h2 className="text-sm font-semibold text-bnc-textPri mb-3">{t('twr.charts.periodReturn')}</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={periodBarData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2B3139" opacity={0.5} />
              <XAxis dataKey="date" stroke="#848E9C" style={{ fontSize: '11px' }} />
              <YAxis stroke="#848E9C" style={{ fontSize: '11px' }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ ...TOOLTIP_STYLE, fontSize: '12px' }}
                formatter={(value, name) => {
                  if (name === 'return') return [`${value >= 0 ? '+' : ''}${value.toFixed(2)}%`, t('twr.tooltip.periodReturn')];
                  if (name === 'cashFlow') return [formatCurrency(value), t('twr.tooltip.cashFlow')];
                  return [value, name];
                }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
              />
              <ReferenceLine y={0} stroke="#848E9C" strokeDasharray="3 3" />
              <Bar dataKey="return" name="return" radius={[4, 4, 0, 0]}>
                {periodBarData.map((entry, i) => (
                  <Cell key={i} fill={entry.return >= 0 ? '#0ECB81' : '#F6465D'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Portföy Değeri Area Grafiği */}
      {valueAreaData.length > 1 && (
        <div className="bnc-card p-3.5">
          <h2 className="text-sm font-semibold text-bnc-textPri mb-3">{t('twr.charts.portfolioValue')}</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={valueAreaData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2B3139" opacity={0.5} />
              <XAxis dataKey="date" stroke="#848E9C" style={{ fontSize: '11px' }} />
              <YAxis stroke="#848E9C" style={{ fontSize: '11px' }} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`} />
              <Tooltip
                contentStyle={{ ...TOOLTIP_STYLE, fontSize: '12px' }}
                formatter={(value) => [formatCurrency(value), t('twr.tooltip.portfolioValue')]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
              />
              <Line type="monotone" dataKey="value" stroke="#F0B90B" strokeWidth={2} dot={{ fill: '#F0B90B', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Dönem Detayları — Collapsible */}
      {data?.periods?.length > 0 && (
        <div className="bnc-card overflow-hidden p-0">
          <button
            onClick={() => setPeriodsOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-bnc-surfaceAlt/30 transition-colors"
          >
            <div className="text-left">
              <h2 className="text-sm font-semibold text-bnc-textPri">{t('twr.periodDetails.title')}</h2>
              <p className="text-[11px] text-bnc-textTer mt-0.5">{reversedPeriods.length} {t('twr.filtered.periodsSuffix')}</p>
            </div>
            {periodsOpen
              ? <ChevronUp className="w-4 h-4 text-bnc-textTer shrink-0" />
              : <ChevronDown className="w-4 h-4 text-bnc-textTer shrink-0" />
            }
          </button>

          {periodsOpen && (
            <div className="border-t border-bnc-border">
              {/* Detail period filter */}
              <div className="px-4 py-2.5 border-b border-bnc-border flex items-center gap-1 overflow-x-auto">
                {CHART_PERIODS.map(p => (
                  <button key={p.key} onClick={() => { setDetailPeriod(p.key); setExpandedPeriod(null); }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      detailPeriod === p.key
                        ? 'bg-bnc-accent/15 text-bnc-accent'
                        : 'text-bnc-textTer hover:bg-bnc-surfaceAlt'
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>

              {reversedPeriods.length === 0 ? (
                <div className="p-6 text-center text-xs text-bnc-textTer">{t('twr.periodDetails.noPeriodsInRange')}</div>
              ) : (
              <div className="divide-y divide-bnc-border max-h-[480px] overflow-y-auto">
              {reversedPeriods.map((p) => {
                const id = `${p.from_date}-${p.to_date}`;
                const isExpanded = expandedPeriod === id;
                const ret = p.period_return ?? 0;
                const pos = ret >= 0;
                const diff = p.ending_value - p.beginning_value;

                return (
                  <div key={id}>
                    <button
                      onClick={() => setExpandedPeriod(isExpanded ? null : id)}
                      className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${isExpanded ? 'bg-bnc-surfaceAlt/50' : 'hover:bg-bnc-surfaceAlt/30'}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-bnc-textPri">
                          {formatDateShort(p.from_date)} → {formatDateShort(p.to_date)}
                        </p>
                        <p className="text-[10px] text-bnc-textTer mt-0.5">
                          {p.days} {t('twr.cards.daysSuffix')}
                          {(p.cash_flow ?? 0) !== 0 && (
                            <span className={p.cash_flow > 0 ? 'text-bnc-accent' : 'text-bnc-red'}>
                              {' '}· {t('twr.periodDetails.cashPrefix')} {p.cash_flow > 0 ? '+' : ''}{formatCurrency(p.cash_flow)}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className={`text-sm font-bold mr-2 ${pos ? 'text-bnc-green' : 'text-bnc-red'}`}>
                        {pos ? '+' : ''}{ret.toFixed(2)}%
                      </span>
                      {isExpanded
                        ? <ChevronUp className="w-3.5 h-3.5 text-bnc-textTer shrink-0" />
                        : <ChevronDown className="w-3.5 h-3.5 text-bnc-textTer shrink-0" />
                      }
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-3 bg-bnc-surfaceAlt/30">
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div className="bg-bnc-bg rounded-lg p-2.5">
                            <p className="text-[9px] text-bnc-textTer font-medium mb-1">{t('twr.periodDetails.beginningValue')}</p>
                            <p className="text-xs font-semibold text-bnc-textPri">{formatCurrency(p.beginning_value)}</p>
                          </div>
                          <div className="bg-bnc-bg rounded-lg p-2.5">
                            <p className="text-[9px] text-bnc-textTer font-medium mb-1">{t('twr.periodDetails.endingValue')}</p>
                            <p className="text-xs font-semibold text-bnc-textPri">{formatCurrency(p.ending_value)}</p>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between py-1">
                            <span className="text-[11px] text-bnc-textTer">{t('twr.periodDetails.cashFlowRow')}</span>
                            <span className={`text-[11px] font-semibold ${(p.cash_flow ?? 0) > 0 ? 'text-bnc-accent' : (p.cash_flow ?? 0) < 0 ? 'text-bnc-red' : 'text-bnc-textTer'}`}>
                              {(p.cash_flow ?? 0) !== 0 ? `${p.cash_flow > 0 ? '+' : ''}${formatCurrency(p.cash_flow)}` : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between py-1">
                            <span className="text-[11px] text-bnc-textTer">{t('twr.periodDetails.periodReturn')}</span>
                            <span className={`text-[11px] font-semibold ${pos ? 'text-bnc-green' : 'text-bnc-red'}`}>
                              {pos ? '+' : ''}{ret.toFixed(2)}%
                            </span>
                          </div>
                          <div className="flex justify-between py-1">
                            <span className="text-[11px] text-bnc-textTer">{t('twr.periodDetails.valueDifference')}</span>
                            <span className={`text-[11px] font-semibold ${diff >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                              {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TWRPage;
