import { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, ChartPie, BarChart3,
  Wallet, AlertTriangle,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { getPortfolioSummary, getPortfolioSnapshots, getFxRates } from '../services/api';

const fmt = (v) => {
  if (v == null) return '—';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(v);
};

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('tr-TR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const COLORS = ['#F0B90B', '#0ECB81', '#F6465D', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

function Skeleton() {
  return (
    <div className="bnc-card p-5 animate-pulse">
      <div className="h-3 bg-bnc-surfaceAlt rounded w-1/2 mb-3" />
      <div className="h-7 bg-bnc-surfaceAlt rounded w-3/4" />
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [fxRates, setFxRates] = useState({ USDTRY: null, EURTRY: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [gainersLosersTab, setGainersLosersTab] = useState('gainers');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [sRes, snRes, fxRes] = await Promise.all([
          getPortfolioSummary(), getPortfolioSnapshots(30), getFxRates(),
        ]);
        setSummary(sRes.data);
        setSnapshots(Array.isArray(snRes?.data) ? snRes.data : []);
        if (fxRes?.data) setFxRates({ USDTRY: fxRes.data.USDTRY ?? null, EURTRY: fxRes.data.EURTRY ?? null });
      } catch (err) {
        if (err.response?.status !== 401) setError(err.response?.data?.detail || err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="bnc-card p-6 max-w-md text-center border-bnc-red/30">
          <h2 className="text-bnc-red font-semibold mb-2">Hata</h2>
          <p className="text-bnc-textSec text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bnc-card p-5 h-80 animate-pulse"><div className="h-3 bg-bnc-surfaceAlt rounded w-1/3 mb-3" /><div className="h-full bg-bnc-surfaceAlt rounded" /></div>
          <div className="bnc-card p-5 h-80 animate-pulse"><div className="h-3 bg-bnc-surfaceAlt rounded w-1/3 mb-3" /><div className="h-full bg-bnc-surfaceAlt rounded" /></div>
        </div>
      </div>
    );
  }

  const isEmpty = !summary || summary.position_count === 0;
  const meta = summary?.metadata ?? {};
  const usdTry = meta.usdtry_rate ?? fxRates.USDTRY;
  const eurTry = meta.eurtry_rate ?? fxRates.EURTRY;

  if (isEmpty) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center max-w-md">
          <Wallet className="w-14 h-14 mx-auto text-bnc-textTer mb-4" />
          <h2 className="text-lg font-semibold text-bnc-textPri mb-2">Henüz Portföy Verisi Yok</h2>
          <p className="text-bnc-textTer text-sm">İşlem ekleyerek portföyünüzü oluşturmaya başlayın.</p>
        </div>
      </div>
    );
  }

  const lineData = [...snapshots].reverse().map(s => ({
    date: new Date(s.snapshot_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }),
    value: s.total_market_value ?? 0,
  }));

  const pieData = summary.allocation_by_asset_type?.map(a => ({ name: a.asset_type, value: a.market_value_try ?? 0 })) ?? [];
  const plVal = summary.total_unrealized_pl_try ?? 0;
  const plPct = summary.total_unrealized_pl_percentage ?? 0;
  const plPositive = plVal >= 0;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bnc-card p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <DollarSign className="w-4 h-4 text-bnc-green" />
            <span className="text-xs font-medium text-bnc-textTer">Toplam Değer</span>
          </div>
          <p className="text-xl font-bold text-bnc-textPri">{fmt(summary.total_market_value_try)}</p>
        </div>

        <div className="bnc-card p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart3 className="w-4 h-4 text-bnc-accent" />
            <span className="text-xs font-medium text-bnc-textTer">Toplam Maliyet</span>
          </div>
          <p className="text-xl font-bold text-bnc-textPri">{fmt(summary.total_cost_basis_try)}</p>
        </div>

        <div className={`bnc-card p-4 ${plPositive ? 'border-bnc-green/30' : 'border-bnc-red/30'}`}>
          <div className="flex items-center gap-1.5 mb-2">
            {plPositive ? <TrendingUp className="w-4 h-4 text-bnc-green" /> : <TrendingDown className="w-4 h-4 text-bnc-red" />}
            <span className="text-xs font-medium text-bnc-textTer">Kar/Zarar</span>
          </div>
          <p className={`text-xl font-bold ${plPositive ? 'text-bnc-green' : 'text-bnc-red'}`}>
            {fmt(plVal)}
          </p>
          <span className={`text-xs font-semibold ${plPositive ? 'text-bnc-green' : 'text-bnc-red'}`}>
            {plPositive ? '+' : ''}{plPct.toFixed(2)}%
          </span>
        </div>

        <div className="bnc-card p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Wallet className="w-4 h-4 text-[#8b5cf6]" />
            <span className="text-xs font-medium text-bnc-textTer">Pozisyon Sayısı</span>
          </div>
          <p className="text-xl font-bold text-bnc-textPri">{summary.position_count ?? 0}</p>
        </div>
      </div>

      {/* Concentration Risks */}
      {summary.concentration_risks?.length > 0 && (
        <div className="bnc-card p-4 border-bnc-accent/30">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-bnc-accent" />
            <span className="text-sm font-semibold text-bnc-accent">Konsantrasyon Riski</span>
          </div>
          <div className="space-y-1.5">
            {summary.concentration_risks.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${r.level === 'high' ? 'bg-bnc-red' : 'bg-bnc-accent'}`} />
                  <span className="text-bnc-textPri font-medium">{r.symbol}</span>
                  <span className="text-bnc-textTer">{r.type === 'position' ? '(pozisyon)' : '(varlık sınıfı)'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-bnc-textPri font-medium">%{r.weight.toFixed(1)}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    r.level === 'high' ? 'bg-bnc-red/15 text-bnc-red' : 'bg-bnc-accent/15 text-bnc-accent'
                  }`}>{r.level === 'high' ? 'Yüksek' : 'Dikkat'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bnc-card p-5">
          <h2 className="text-sm font-semibold text-bnc-textPri mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-bnc-accent" />
            Portföy Değeri
          </h2>
          {lineData.length >= 2 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={lineData} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2B3139" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#848E9C' }} axisLine={{ stroke: '#2B3139' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#848E9C' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : `${v}`} />
                <Tooltip contentStyle={{ backgroundColor: '#1E2329', border: '1px solid #2B3139', borderRadius: '8px', color: '#EAECEF' }}
                  formatter={v => [fmt(v), 'Değer']} labelFormatter={l => `Tarih: ${l}`} />
                <Line type="monotone" dataKey="value" stroke="#F0B90B" strokeWidth={2}
                  dot={{ fill: '#F0B90B', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: '#F0B90B' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-bnc-textTer bg-bnc-surfaceAlt rounded-lg text-sm">
              Grafik için snapshot oluşturun
            </div>
          )}
        </div>

        <div className="bnc-card p-5">
          <h2 className="text-sm font-semibold text-bnc-textPri mb-4 flex items-center gap-2">
            <ChartPie className="w-4 h-4 text-[#8b5cf6]" />
            Varlık Dağılımı
          </h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2}
                  dataKey="value" nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: '#848E9C' }}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1E2329', border: '1px solid #2B3139', borderRadius: '8px', color: '#EAECEF' }}
                  formatter={v => fmt(v)} />
                <Legend wrapperStyle={{ color: '#B7BDC6', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-bnc-textTer bg-bnc-surfaceAlt rounded-lg text-sm">
              Dağılım verisi yok
            </div>
          )}
        </div>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Positions */}
        <div className="bnc-card overflow-hidden">
          <h2 className="text-sm font-semibold text-bnc-textPri px-4 py-3 border-b border-bnc-border">En Yüksek Pozisyonlar</h2>
          <table className="w-full">
            <thead>
              <tr className="bg-bnc-surfaceAlt/50">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">Sembol</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">Değer</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">Miktar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bnc-border">
              {(summary.top_positions ?? []).map(pos => (
                <tr key={pos.instrument_id} className="hover:bg-bnc-surfaceAlt/40 transition-colors">
                  <td className="px-4 py-2.5 text-sm font-medium text-bnc-textPri">{pos.symbol}</td>
                  <td className="px-4 py-2.5 text-sm text-right text-bnc-textPri">{fmt(pos.market_value_try)}</td>
                  <td className="px-4 py-2.5 text-sm text-right text-bnc-textSec">{pos.quantity?.toFixed(2) ?? '—'}</td>
                </tr>
              ))}
              {!summary.top_positions?.length && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-bnc-textTer text-sm">Pozisyon yok</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Gainers / Losers */}
        <div className="bnc-card overflow-hidden">
          <div className="px-4 py-3 border-b border-bnc-border flex gap-2">
            <button onClick={() => setGainersLosersTab('gainers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                gainersLosersTab === 'gainers' ? 'bg-bnc-green/15 text-bnc-green' : 'text-bnc-textTer hover:bg-bnc-surfaceAlt'
              }`}>Kazananlar</button>
            <button onClick={() => setGainersLosersTab('losers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                gainersLosersTab === 'losers' ? 'bg-bnc-red/15 text-bnc-red' : 'text-bnc-textTer hover:bg-bnc-surfaceAlt'
              }`}>Kaybedenler</button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-bnc-surfaceAlt/50">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">Sembol</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">K/Z</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium text-bnc-textTer uppercase tracking-wider">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bnc-border">
              {((gainersLosersTab === 'gainers' ? summary.top_gainers : summary.top_losers) ?? []).map(pos => {
                const positive = (pos.unrealized_pl_try ?? 0) >= 0;
                const clr = positive ? 'text-bnc-green' : 'text-bnc-red';
                return (
                  <tr key={pos.instrument_id} className="hover:bg-bnc-surfaceAlt/40 transition-colors">
                    <td className="px-4 py-2.5 text-sm font-medium text-bnc-textPri">{pos.symbol}</td>
                    <td className={`px-4 py-2.5 text-sm text-right font-medium ${clr}`}>{fmt(pos.unrealized_pl_try)}</td>
                    <td className={`px-4 py-2.5 text-sm text-right font-medium ${clr}`}>
                      {positive ? '+' : ''}{(pos.unrealized_pl_percentage ?? 0).toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
              {!((gainersLosersTab === 'gainers' ? summary.top_gainers : summary.top_losers) ?? []).length && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-bnc-textTer text-sm">Veri yok</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Metadata */}
      <div className="bnc-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
          <span className="text-bnc-textTer">Son güncelleme: <span className="text-bnc-textSec font-medium">{fmtDate(meta.last_price_update_at)}</span></span>
          <span className="text-bnc-textTer">USD/TRY: <span className="text-bnc-accent font-medium">{usdTry?.toLocaleString('tr-TR') ?? '—'}</span></span>
          <span className="text-bnc-textTer">EUR/TRY: <span className="text-bnc-accent font-medium">{eurTry?.toLocaleString('tr-TR') ?? '—'}</span></span>
          {(meta.data_warnings ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <AlertTriangle className="w-3.5 h-3.5 text-bnc-accent" />
              {meta.data_warnings.map((w, i) => (
                <span key={i} className="inline-flex px-1.5 py-0.5 text-[10px] font-medium bg-bnc-accent/15 text-bnc-accent rounded">{w}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
