import { useState, useEffect, useMemo } from 'react';
import { Scale, RefreshCw, Info } from 'lucide-react';
import { getTWRComparison } from '../services/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';

const BENCHMARK_COLORS = {
  'Portföy (TWR)': '#F0B90B',
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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visible, setVisible] = useState({
    'Portföy (TWR)': true,
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
      setError(err.response?.data?.detail || err.message || 'Veri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const chartData = useMemo(() => {
    if (!data) return [];
    const dateMap = {};

    data.portfolio.series.forEach((p) => {
      if (!dateMap[p.date]) dateMap[p.date] = { date: p.date };
      dateMap[p.date]['Portföy (TWR)'] = p.value;
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
      dateLabel: new Date(item.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }),
    }));
  }, [data]);

  const summaryRows = useMemo(() => {
    if (!data) return [];
    const rows = [
      {
        name: 'Portföy (TWR)',
        change: data.portfolio.total_change,
        color: BENCHMARK_COLORS['Portföy (TWR)'],
        isPortfolio: true,
      },
    ];
    Object.entries(data.benchmarks).forEach(([name, bm]) => {
      rows.push({
        name,
        change: bm.total_change ?? null,
        error: bm.error,
        color: BENCHMARK_COLORS[name] || '#848E9C',
      });
    });
    return rows.sort((a, b) => (b.change ?? -999) - (a.change ?? -999));
  }, [data]);

  const toggleVisibility = (name) => {
    setVisible(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-bnc-accent" />
        <p className="text-sm text-bnc-textTer">Benchmark verileri çekiliyor...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-bnc-surface border border-bnc-red/40 rounded-lg p-6 text-center">
          <p className="text-bnc-red font-medium">{error}</p>
          <button onClick={load} className="mt-3 px-4 py-2 bg-bnc-red text-bnc-bg rounded-lg hover:opacity-90 text-sm font-medium">Tekrar Dene</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const portfolioRank = summaryRows.findIndex(r => r.isPortfolio) + 1;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-bnc-textPri flex items-center gap-2">
            <Scale className="w-6 h-6 text-bnc-accent" />
            Benchmark Karşılaştırma
          </h1>
          <p className="text-sm text-bnc-textTer mt-1">
            {formatDate(data.first_date)} — {formatDate(data.last_date)} ({data.total_days} gün)
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="bnc-btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {/* Sıralama Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {summaryRows.map((row, i) => (
          <button
            key={row.name}
            onClick={() => toggleVisibility(row.name)}
            className={`rounded-xl p-3 border-2 text-left transition-all ${
              visible[row.name]
                ? row.isPortfolio
                  ? 'bg-bnc-surfaceAlt border-bnc-accent'
                  : 'bg-bnc-surface border-bnc-border'
                : 'bg-bnc-bg border-bnc-border opacity-50'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
              <span className="text-[10px] text-bnc-textTer font-medium uppercase tracking-wide truncate">
                #{i + 1}
              </span>
            </div>
            <p className="text-xs font-medium text-bnc-textSec truncate">{row.name}</p>
            {row.error ? (
              <p className="text-xs text-bnc-textTer mt-0.5">Veri yok</p>
            ) : (
              <p className={`text-lg font-bold mt-0.5 ${(row.change ?? 0) >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                {(row.change ?? 0) >= 0 ? '+' : ''}{(row.change ?? 0).toFixed(2)}%
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Portföy Sıralaması */}
      <div className={`rounded-xl p-4 border ${
        portfolioRank === 1
          ? 'bg-bnc-green/10 border-bnc-green/40'
          : portfolioRank <= 3
            ? 'bg-bnc-accent/10 border-bnc-accent/40'
            : 'bg-bnc-surfaceAlt border-bnc-border'
      }`}>
        <p className="text-sm font-medium text-bnc-textPri">
          {portfolioRank === 1 && 'Portföyünüz tüm benchmark\'ları geçti!'}
          {portfolioRank === 2 && 'Portföyünüz 2. sırada'}
          {portfolioRank === 3 && 'Portföyünüz 3. sırada'}
          {portfolioRank > 3 && `Portföyünüz ${summaryRows.length} varlık arasında ${portfolioRank}. sırada`}
        </p>
        <p className="text-xs text-bnc-textSec mt-1">
          {data.total_days} günlük dönemde portföy TWR: {data.portfolio.total_change >= 0 ? '+' : ''}{data.portfolio.total_change.toFixed(2)}%
        </p>
      </div>

      {/* Grafik */}
      {chartData.length > 1 && (
        <div className="bnc-card shadow-sm p-4">
          <h2 className="text-base font-semibold text-bnc-textPri mb-4">Kümülatif Getiri Karşılaştırması</h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2B3139" opacity={0.5} />
              <XAxis dataKey="dateLabel" stroke="#848E9C" style={{ fontSize: '11px' }} />
              <YAxis stroke="#848E9C" style={{ fontSize: '11px' }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name) => [`${value >= 0 ? '+' : ''}${value.toFixed(2)}%`, name]}
                labelFormatter={(_, payload) => {
                  const d = payload?.[0]?.payload?.date;
                  return d ? formatDate(d) : '';
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '12px', color: '#EAECEF' }}
                onClick={(e) => toggleVisibility(e.value)}
              />
              <ReferenceLine y={0} stroke="#848E9C" strokeDasharray="3 3" />
              {Object.entries(BENCHMARK_COLORS).map(([name, color]) => (
                visible[name] && (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={color}
                    strokeWidth={name === 'Portföy (TWR)' ? 3 : 1.5}
                    dot={name === 'Portföy (TWR)' ? { fill: color, r: 4 } : false}
                    strokeDasharray={name === 'Portföy (TWR)' ? undefined : '5 3'}
                    connectNulls
                  />
                )
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Detay Tablosu */}
      <div className="bnc-card shadow-sm overflow-hidden">
        <div className="p-4 border-b border-bnc-border">
          <h2 className="text-base font-semibold text-bnc-textPri">Dönem Sonu Karşılaştırma</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-bnc-border">
            <thead className="bg-bnc-surfaceAlt">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-bnc-textSec uppercase tracking-wider">Varlık</th>
                <th className="px-4 py-3 text-right text-[11px] font-medium text-bnc-textSec uppercase tracking-wider">Toplam Getiri</th>
                <th className="px-4 py-3 text-right text-[11px] font-medium text-bnc-textSec uppercase tracking-wider">Sıra</th>
                <th className="px-4 py-3 text-right text-[11px] font-medium text-bnc-textSec uppercase tracking-wider">Portföye Göre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bnc-border">
              {summaryRows.map((row, i) => {
                const diff = row.isPortfolio ? null : (data.portfolio.total_change - (row.change ?? 0));
                return (
                  <tr key={row.name} className={`hover:bg-bnc-surfaceAlt ${row.isPortfolio ? 'bg-bnc-accent/5' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                        <span className={`text-sm ${row.isPortfolio ? 'font-bold text-bnc-accent' : 'font-medium text-bnc-textPri'}`}>
                          {row.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.error ? (
                        <span className="text-xs text-bnc-textTer">Veri yok</span>
                      ) : (
                        <span className={`text-sm font-semibold ${(row.change ?? 0) >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                          {(row.change ?? 0) >= 0 ? '+' : ''}{(row.change ?? 0).toFixed(2)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-medium text-bnc-textSec">
                        #{i + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {diff === null ? (
                        <span className="text-xs text-bnc-textTer">—</span>
                      ) : (
                        <span className={`text-xs font-medium ${diff >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                          {diff >= 0 ? '▲ +' : '▼ '}{diff.toFixed(2)}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bilgi */}
      <div className="bg-bnc-surfaceAlt border border-bnc-border rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-bnc-accent flex-shrink-0 mt-0.5" />
          <div className="text-sm text-bnc-textSec space-y-1">
            <p className="font-medium text-bnc-textPri">Karşılaştırma Nasıl Çalışır?</p>
            <p>Portföy getirisi TWR (Time-Weighted Return) ile hesaplanır. Benchmark'lar aynı tarih aralığında fiyat değişim yüzdesi olarak hesaplanır.</p>
            <p>Kartlara tıklayarak grafikte gösterilecek varlıkları açıp kapatabilirsiniz.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComparisonPage;
