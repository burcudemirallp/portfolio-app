import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, Calendar, Activity, DollarSign, BarChart3, Info, ArrowUpDown, ArrowUp, ArrowDown, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { getPortfolioTWR, getCashFlows, createCashFlow, updateCashFlow, deleteCashFlow } from '../services/api';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from 'recharts';

const TOOLTIP_STYLE = { backgroundColor: '#1E2329', border: '1px solid #2B3139', borderRadius: '8px', color: '#EAECEF' };

function TWRPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortField, setSortField] = useState('to_date');
  const [sortDir, setSortDir] = useState('desc');
  const [showCashFlowForm, setShowCashFlowForm] = useState(false);
  const [editingCF, setEditingCF] = useState(null);

  useEffect(() => { loadTWR(); }, []);

  const loadTWR = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPortfolioTWR();
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'TWR yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (v, currency = 'TRY') =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });

  const formatDateShort = (iso) =>
    new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });

  const cumulativeChartData = useMemo(() => {
    if (!data?.periods?.length) return [];
    let cum = 1.0;
    return data.periods.map((p) => {
      cum *= (1 + p.period_return / 100);
      return {
        date: formatDateShort(p.to_date),
        fullDate: formatDate(p.to_date),
        cumulative: parseFloat(((cum - 1) * 100).toFixed(2)),
        period: parseFloat(p.period_return.toFixed(2)),
        value: p.ending_value,
      };
    });
  }, [data]);

  const periodBarData = useMemo(() => {
    if (!data?.periods?.length) return [];
    return data.periods.map((p) => ({
      date: formatDateShort(p.to_date),
      fullDate: formatDate(p.to_date),
      return: parseFloat(p.period_return.toFixed(2)),
      cashFlow: p.cash_flow,
    }));
  }, [data]);

  const valueAreaData = useMemo(() => {
    if (!data?.periods?.length) return [];
    const items = [];
    if (data.periods.length > 0) {
      items.push({
        date: formatDateShort(data.periods[0].from_date),
        fullDate: formatDate(data.periods[0].from_date),
        value: data.periods[0].beginning_value,
      });
    }
    data.periods.forEach((p) => {
      items.push({
        date: formatDateShort(p.to_date),
        fullDate: formatDate(p.to_date),
        value: p.ending_value,
      });
    });
    return items;
  }, [data]);

  const stats = useMemo(() => {
    if (!data?.periods?.length) return null;
    const returns = data.periods.filter(p => p.beginning_value > 0).map(p => p.period_return);
    if (!returns.length) return null;
    const positive = returns.filter(r => r > 0);
    const negative = returns.filter(r => r < 0);
    const avg = returns.reduce((s, r) => s + r, 0) / returns.length;
    const best = Math.max(...returns);
    const worst = Math.min(...returns);
    const bestPeriod = data.periods.find(p => p.period_return === best);
    const worstPeriod = data.periods.find(p => p.period_return === worst);
    const variance = returns.reduce((s, r) => s + Math.pow(r - avg, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    return {
      totalPeriods: returns.length,
      positivePeriods: positive.length,
      negativePeriods: negative.length,
      winRate: (positive.length / returns.length * 100),
      avgReturn: avg,
      bestReturn: best,
      worstReturn: worst,
      bestPeriodDate: bestPeriod ? formatDate(bestPeriod.to_date) : '-',
      worstPeriodDate: worstPeriod ? formatDate(worstPeriod.to_date) : '-',
      stdDev,
      maxDrawdown: calculateMaxDrawdown(data.periods),
    };
  }, [data]);

  function calculateMaxDrawdown(periods) {
    let peak = 1.0;
    let maxDD = 0;
    let cum = 1.0;
    for (const p of periods) {
      cum *= (1 + p.period_return / 100);
      if (cum > peak) peak = cum;
      const dd = (peak - cum) / peak * 100;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedPeriods = useMemo(() => {
    if (!data?.periods) return [];
    return [...data.periods].sort((a, b) => {
      let aVal, bVal;
      switch (sortField) {
        case 'from_date': aVal = a.from_date; bVal = b.from_date; break;
        case 'to_date': aVal = a.to_date; bVal = b.to_date; break;
        case 'beginning_value': aVal = a.beginning_value; bVal = b.beginning_value; break;
        case 'ending_value': aVal = a.ending_value; bVal = b.ending_value; break;
        case 'cash_flow': aVal = a.cash_flow; bVal = b.cash_flow; break;
        case 'period_return': aVal = a.period_return; bVal = b.period_return; break;
        case 'days': aVal = a.days; bVal = b.days; break;
        default: return 0;
      }
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [data, sortField, sortDir]);

  const handleDeleteCF = async (id) => {
    if (!confirm('Bu nakit akışı kaydını silmek istediğinize emin misiniz?')) return;
    try {
      await deleteCashFlow(id);
      loadTWR();
    } catch { /* ignore */ }
  };

  const SortHeader = ({ field, label, align = 'right' }) => (
    <th
      onClick={() => handleSort(field)}
      className={`px-3 py-2 text-[11px] font-medium text-bnc-textTer uppercase tracking-wider cursor-pointer hover:bg-bnc-surfaceAlt ${align === 'left' ? 'text-left' : 'text-right'}`}
    >
      <div className={`flex items-center gap-1 ${align === 'left' ? '' : 'justify-end'}`}>
        {label}
        {sortField === field
          ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
          : <ArrowUpDown className="w-3 h-3 opacity-30" />
        }
      </div>
    </th>
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
          <button onClick={loadTWR} className="mt-3 bnc-btn-primary text-sm">
            Tekrar Dene
          </button>
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
          <p className="text-xs text-bnc-textSec mt-1">Portföyünüze snapshot ekledikçe TWR hesaplanmaya başlayacak.</p>
          <div className="mt-5">
            <CashFlowSection cashFlows={[]} onAdd={() => setShowCashFlowForm(true)} onEdit={setEditingCF} onDelete={handleDeleteCF} formatCurrency={formatCurrency} formatDate={formatDate} />
          </div>
        </div>
        {(showCashFlowForm || editingCF) && (
          <CashFlowFormModal
            editing={editingCF}
            onClose={() => { setShowCashFlowForm(false); setEditingCF(null); }}
            onSaved={() => { setShowCashFlowForm(false); setEditingCF(null); loadTWR(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4 text-bnc-textPri">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-bnc-textPri flex items-center gap-2">
            <Activity className="w-5 h-5 text-bnc-accent shrink-0" />
            TWR — Zaman Ağırlıklı Getiri
          </h1>
          <p className="text-xs text-bnc-textSec mt-0.5">
            Modified Dietz yöntemi. Nakit akışları aşağıdan manuel yönetilir.
          </p>
        </div>
      </div>

      {/* Ana Kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bnc-card p-3.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <TrendingUp className="w-3.5 h-3.5 text-bnc-accent" />
            <p className="text-[11px] text-bnc-textSec">Toplam Getiri</p>
          </div>
          <p className={`text-xl font-bold ${data.twr >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
            {data.twr >= 0 ? '+' : ''}{data.twr.toFixed(2)}%
          </p>
        </div>

        <div className="bnc-card p-3.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <BarChart3 className="w-3.5 h-3.5 text-bnc-textTer" />
            <p className="text-[11px] text-bnc-textSec">Yıllık Getiri</p>
          </div>
          <p className={`text-xl font-bold ${data.twr_annualized >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
            {data.twr_annualized >= 0 ? '+' : ''}{data.twr_annualized.toFixed(2)}%
          </p>
        </div>

        <div className="bnc-card p-3.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Calendar className="w-3.5 h-3.5 text-bnc-textTer" />
            <p className="text-[11px] text-bnc-textSec">Ölçüm Süresi</p>
          </div>
          <p className="text-xl font-bold text-bnc-textPri">{data.total_days} gün</p>
          <p className="text-[10px] text-bnc-textTer">{data.snapshot_count} snapshot</p>
        </div>

        <div className="bnc-card p-3.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <DollarSign className="w-3.5 h-3.5 text-bnc-green" />
            <p className="text-[11px] text-bnc-textSec">Net Nakit Akışı</p>
          </div>
          {data.cash_flow_count === 0 ? (
            <>
              <p className="text-xl font-bold text-bnc-textPri">—</p>
              <p className="text-[10px] text-bnc-textTer">Henüz kayıt yok</p>
            </>
          ) : (
            <>
              <p className={`text-xl font-bold ${(data.total_cash_inflow - (data.total_cash_outflow || 0)) >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                {formatCurrency(data.total_cash_inflow - (data.total_cash_outflow || 0))}
              </p>
              <p className="text-[10px] text-bnc-textTer">
                Giriş: {formatCurrency(data.total_cash_inflow)}{(data.total_cash_outflow || 0) > 0 ? ` · Çıkış: ${formatCurrency(data.total_cash_outflow)}` : ''}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Portföy Değer Aralığı */}
      <div className="bnc-card p-3.5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-bnc-textSec">İlk Snapshot</p>
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
            <p className="text-center text-[11px] text-bnc-textSec mt-1">{data.twr >= 0 ? '+' : ''}{data.twr.toFixed(2)}% getiri</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-bnc-textSec">Son Snapshot</p>
            <p className="text-base font-semibold text-bnc-textPri">{formatCurrency(data.last_snapshot_value)}</p>
            <p className="text-[10px] text-bnc-textTer">{data.last_snapshot_date ? formatDate(data.last_snapshot_date) : '-'}</p>
          </div>
        </div>
      </div>

      {/* İstatistikler */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          <StatCard label="Kazanan Dönem" value={`${stats.positivePeriods} / ${stats.totalPeriods}`} sub={`%${stats.winRate.toFixed(0)} başarı`} color="green" />
          <StatCard label="Kaybeden Dönem" value={`${stats.negativePeriods} / ${stats.totalPeriods}`} sub={`%${(100 - stats.winRate).toFixed(0)}`} color="red" />
          <StatCard label="Ort. Dönem Getiri" value={`${stats.avgReturn >= 0 ? '+' : ''}${stats.avgReturn.toFixed(2)}%`} color={stats.avgReturn >= 0 ? 'green' : 'red'} />
          <StatCard label="En İyi Dönem" value={`+${stats.bestReturn.toFixed(2)}%`} sub={stats.bestPeriodDate} color="green" />
          <StatCard label="En Kötü Dönem" value={`${stats.worstReturn.toFixed(2)}%`} sub={stats.worstPeriodDate} color="red" />
          <StatCard label="Maks. Düşüş" value={`-${stats.maxDrawdown.toFixed(2)}%`} sub="Max Drawdown" color="red" />
        </div>
      )}

      {/* Kümülatif TWR Grafiği */}
      {cumulativeChartData.length > 1 && (
        <div className="bnc-card p-3.5">
          <h2 className="text-sm font-semibold text-bnc-textPri mb-3">Kümülatif TWR</h2>
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
                  name === 'cumulative' ? 'Kümülatif TWR' : 'Dönem Getiri'
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
          <h2 className="text-sm font-semibold text-bnc-textPri mb-3">Dönemsel Getiri</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={periodBarData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2B3139" opacity={0.5} />
              <XAxis dataKey="date" stroke="#848E9C" style={{ fontSize: '11px' }} />
              <YAxis stroke="#848E9C" style={{ fontSize: '11px' }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ ...TOOLTIP_STYLE, fontSize: '12px' }}
                formatter={(value, name) => {
                  if (name === 'return') return [`${value >= 0 ? '+' : ''}${value.toFixed(2)}%`, 'Dönem Getiri'];
                  if (name === 'cashFlow') return [formatCurrency(value), 'Nakit Akışı'];
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
          <h2 className="text-sm font-semibold text-bnc-textPri mb-3">Portföy Değeri</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={valueAreaData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2B3139" opacity={0.5} />
              <XAxis dataKey="date" stroke="#848E9C" style={{ fontSize: '11px' }} />
              <YAxis stroke="#848E9C" style={{ fontSize: '11px' }} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`} />
              <Tooltip
                contentStyle={{ ...TOOLTIP_STYLE, fontSize: '12px' }}
                formatter={(value) => [formatCurrency(value), 'Portföy Değeri']}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
              />
              <Line type="monotone" dataKey="value" stroke="#F0B90B" strokeWidth={2} dot={{ fill: '#F0B90B', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Dönem Detay Tablosu */}
      <div className="bnc-card overflow-hidden p-0">
        <div className="px-3.5 py-3 border-b border-bnc-border">
          <h2 className="text-sm font-semibold text-bnc-textPri">Dönem Detayları</h2>
          <p className="text-[11px] text-bnc-textSec mt-0.5">Her snapshot aralığındaki getiri ve nakit akışları</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-bnc-border">
            <thead className="bg-bnc-surfaceAlt">
              <tr>
                <SortHeader field="from_date" label="Başlangıç" align="left" />
                <SortHeader field="to_date" label="Bitiş" align="left" />
                <SortHeader field="days" label="Gün" />
                <SortHeader field="beginning_value" label="Baş. Değer" />
                <SortHeader field="ending_value" label="Bit. Değer" />
                <SortHeader field="cash_flow" label="Nakit Akışı" />
                <SortHeader field="period_return" label="Getiri" />
              </tr>
            </thead>
            <tbody className="divide-y divide-bnc-border">
              {sortedPeriods.map((p, i) => (
                <tr key={i} className="hover:bg-bnc-surfaceAlt/40">
                  <td className="px-3 py-2 text-xs text-bnc-textSec">{formatDate(p.from_date)}</td>
                  <td className="px-3 py-2 text-xs text-bnc-textSec">{formatDate(p.to_date)}</td>
                  <td className="px-3 py-2 text-xs text-right text-bnc-textSec">{p.days}</td>
                  <td className="px-3 py-2 text-xs text-right text-bnc-textSec">{formatCurrency(p.beginning_value)}</td>
                  <td className="px-3 py-2 text-xs text-right text-bnc-textSec">{formatCurrency(p.ending_value)}</td>
                  <td className="px-3 py-2 text-xs text-right">
                    {p.cash_flow !== 0 ? (
                      <span className={p.cash_flow > 0 ? 'text-bnc-accent font-medium' : 'text-bnc-red font-medium'}>
                        {p.cash_flow > 0 ? '+' : ''}{formatCurrency(p.cash_flow)}
                      </span>
                    ) : (
                      <span className="text-bnc-textTer">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-right">
                    <span className={`font-semibold ${p.period_return >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                      {p.period_return >= 0 ? '+' : ''}{p.period_return.toFixed(2)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Nakit Akışları */}
      <CashFlowSection
        cashFlows={data.cash_flows || []}
        totalInflow={data.total_cash_inflow}
        totalOutflow={data.total_cash_outflow || 0}
        onAdd={() => setShowCashFlowForm(true)}
        onEdit={setEditingCF}
        onDelete={handleDeleteCF}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
      />

      {/* Modal */}
      {(showCashFlowForm || editingCF) && (
        <CashFlowFormModal
          editing={editingCF}
          onClose={() => { setShowCashFlowForm(false); setEditingCF(null); }}
          onSaved={() => { setShowCashFlowForm(false); setEditingCF(null); loadTWR(); }}
        />
      )}

      {/* Açıklama */}
      <div className="bnc-card p-3.5 border-bnc-border">
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-bnc-accent shrink-0 mt-0.5" />
          <div className="text-xs text-bnc-textSec space-y-1">
            <p className="font-medium text-bnc-textPri">TWR Nasıl Hesaplanır?</p>
            <p>TWR (Time-Weighted Return), portföy yöneticisinin performansını dışarıdan gelen para akışlarından bağımsız ölçer.</p>
            <p>Nakit akışları aşağıdaki tablodan <span className="text-bnc-textPri font-medium">manuel</span> olarak yönetilir. Transaction&apos;lardan tamamen bağımsızdır — transaction silseniz/düzenleseniz bile TWR etkilenmez.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───── Nakit Akışları Bölümü ───── */
function CashFlowSection({ cashFlows, totalInflow, totalOutflow, onAdd, onEdit, onDelete, formatCurrency, formatDate }) {
  const net = (totalInflow || 0) - (totalOutflow || 0);
  return (
    <div className="bnc-card overflow-hidden p-0">
      <div className="px-3.5 py-3 border-b border-bnc-border">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-bnc-textPri flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-bnc-green shrink-0" />
              Nakit Akışları
            </h2>
            <p className="text-[11px] text-bnc-textSec mt-0.5">
              Portföye dışarıdan giren/çıkan para. Transaction&apos;lardan bağımsız — burayı düzenlemek sadece TWR&apos;yı etkiler.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(totalInflow > 0 || totalOutflow > 0) && (
              <div className="flex items-center gap-3">
                {totalInflow > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] text-bnc-textTer">Giriş</p>
                    <p className="text-sm font-bold text-bnc-green">
                      +{formatCurrency(totalInflow)}
                    </p>
                  </div>
                )}
                {totalOutflow > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] text-bnc-textTer">Çıkış</p>
                    <p className="text-sm font-bold text-bnc-red">
                      -{formatCurrency(totalOutflow)}
                    </p>
                  </div>
                )}
                <div className="text-right border-l border-bnc-border pl-3">
                  <p className="text-[10px] text-bnc-textTer">Net</p>
                  <p className={`text-sm font-bold ${net >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                    {net >= 0 ? '+' : ''}{formatCurrency(net)}
                  </p>
                </div>
              </div>
            )}
            <button
              onClick={onAdd}
              className="bnc-btn-primary flex items-center gap-1.5 text-sm"
            >
              <Plus className="w-4 h-4" />
              Ekle
            </button>
          </div>
        </div>
      </div>

      {cashFlows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-bnc-border">
            <thead className="bg-bnc-surfaceAlt">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">Tarih</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">Tür</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">Tutar</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">Para Birimi</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">Not</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bnc-border">
              {cashFlows.map((cf) => (
                <tr key={cf.id} className="hover:bg-bnc-surfaceAlt/40">
                  <td className="px-3 py-2 text-xs text-bnc-textSec">
                    {cf.date ? formatDate(cf.date) : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-right">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                      cf.flow_type === 'inflow'
                        ? 'bg-bnc-surfaceAlt border-bnc-border text-bnc-green'
                        : 'bg-bnc-surfaceAlt border-bnc-border text-bnc-red'
                    }`}>
                      {cf.flow_type === 'inflow' ? 'Giriş' : 'Çıkış'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-right font-semibold">
                    <span className={cf.flow_type === 'inflow' ? 'text-bnc-green' : 'text-bnc-red'}>
                      {cf.flow_type === 'inflow' ? '+' : '-'}{formatCurrency(cf.amount, cf.currency || 'TRY')}
                    </span>
                    {cf.currency && cf.currency !== 'TRY' && cf.amount_try && (
                      <div className="text-[10px] text-bnc-textTer">
                        ≈ {formatCurrency(cf.amount_try)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-right text-bnc-textSec">{cf.currency || 'TRY'}</td>
                  <td className="px-3 py-2 text-xs text-bnc-textSec max-w-[200px] truncate">{cf.note || '—'}</td>
                  <td className="px-3 py-2 text-xs text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(cf)}
                        className="p-1 text-bnc-textTer hover:text-bnc-accent rounded"
                        title="Düzenle"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(cf.id)}
                        className="p-1 text-bnc-textTer hover:text-bnc-red rounded"
                        title="Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-6 text-center">
          <DollarSign className="w-9 h-9 text-bnc-textTer mx-auto mb-2" />
          <p className="text-xs text-bnc-textSec font-medium">Henüz nakit akışı yok</p>
          <p className="text-[11px] text-bnc-textTer mt-0.5">
            Portföye dışarıdan para girdiyse &quot;Ekle&quot; butonuyla kaydedin.
          </p>
        </div>
      )}
    </div>
  );
}

/* ───── Nakit Akışı Ekleme/Düzenleme Modal ───── */
function CashFlowFormModal({ editing, onClose, onSaved }) {
  const isEdit = !!editing;
  const [form, setForm] = useState({
    flow_date: editing?.date ? editing.date.slice(0, 16) : new Date().toISOString().slice(0, 16),
    amount: editing?.amount?.toString() || '',
    currency: editing?.currency || 'TRY',
    flow_type: editing?.flow_type || 'inflow',
    note: editing?.note || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError('Tutar giriniz');
      return;
    }
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
      if (isEdit) {
        await updateCashFlow(editing.id, payload);
      } else {
        await createCashFlow(payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || 'Hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-bnc-surface border border-bnc-border rounded-xl max-w-md w-full shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-bnc-border">
          <h3 className="text-base font-semibold text-bnc-textPri">
            {isEdit ? 'Nakit Akışını Düzenle' : 'Yeni Nakit Akışı'}
          </h3>
          <button type="button" onClick={onClose} className="text-bnc-textTer hover:text-bnc-textPri">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {error && (
            <div className="bg-bnc-surfaceAlt border border-bnc-red/40 text-bnc-red px-3 py-2 rounded-lg text-xs">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, flow_type: 'inflow' })}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                form.flow_type === 'inflow'
                  ? 'bg-bnc-green text-bnc-bg'
                  : 'bg-bnc-surfaceAlt text-bnc-textSec border border-bnc-border hover:bg-bnc-border'
              }`}
            >
              Para Girişi
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, flow_type: 'outflow' })}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                form.flow_type === 'outflow'
                  ? 'bg-bnc-red text-bnc-bg'
                  : 'bg-bnc-surfaceAlt text-bnc-textSec border border-bnc-border hover:bg-bnc-border'
              }`}
            >
              Para Çıkışı
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-bnc-textSec mb-1">Tarih</label>
            <input
              type="datetime-local"
              value={form.flow_date}
              onChange={(e) => setForm({ ...form, flow_date: e.target.value })}
              className="bnc-input w-full"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-bnc-textSec mb-1">Tutar</label>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="40000"
                className="bnc-input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-bnc-textSec mb-1">Para Birimi</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="bnc-input w-full"
              >
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-bnc-textSec mb-1">Not</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Ocak maaşı, kira geliri, vb."
              className="bnc-input w-full"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bnc-btn-secondary"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bnc-btn-primary disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? 'Kaydediliyor...' : (
                <>
                  <Check className="w-4 h-4" />
                  {isEdit ? 'Güncelle' : 'Kaydet'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  const valueClass =
    color === 'green' ? 'text-bnc-green' :
    color === 'red' ? 'text-bnc-red' :
    'text-bnc-accent';
  return (
    <div className="rounded-xl border border-bnc-border bg-bnc-surface p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-bnc-textTer mb-0.5">{label}</p>
      <p className={`text-base font-bold ${valueClass}`}>{value}</p>
      {sub && <p className="text-[10px] text-bnc-textTer mt-0.5">{sub}</p>}
    </div>
  );
}

export default TWRPage;
