import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Trash2,
  DollarSign,
  Download,
  Calendar,
  Filter,
  BarChart3,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { getSaleRecords, deleteSaleRecord } from '../services/api';
import { useToast } from './Toast';

const PERIOD_OPTIONS = [
  { id: 'all', label: 'Tümü' },
  { id: 'month', label: 'Bu Ay' },
  { id: '3m', label: 'Son 3 Ay' },
  { id: '6m', label: 'Son 6 Ay' },
  { id: 'year', label: 'Bu Yıl' },
];

const PIE_COLORS = ['#F0B90B', '#0ECB81', '#F59E0B', '#F6465D', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#848E9C'];

const TOOLTIP_STYLE = {
  backgroundColor: '#1E2329',
  border: '1px solid #2B3139',
  borderRadius: '8px',
  color: '#EAECEF',
};

export default function SalesHistoryPage() {
  const { showSuccess, showError } = useToast();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [summarySort, setSummarySort] = useState({ field: 'profit_loss_try', order: 'desc' });
  const [salesSort, setSalesSort] = useState({ field: 'sale_date', order: 'desc' });

  useEffect(() => {
    loadSales();
  }, []);

  const loadSales = async () => {
    try {
      const response = await getSaleRecords();
      setSales(response.data || []);
    } catch (error) {
      console.error('Error loading sales:', error);
      showError('Satış kayıtları yüklenemedi: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (saleId) => {
    if (!confirm('Bu satış kaydını silmek istediğinizden emin misiniz?')) return;
    try {
      await deleteSaleRecord(saleId);
      loadSales();
      showSuccess('Satış kaydı silindi');
    } catch (error) {
      console.error('Error deleting sale:', error);
      showError('Satış kaydı silinemedi: ' + (error.response?.data?.detail || error.message));
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const dateRangeFilter = useMemo(() => {
    if (period === 'all') return { from: null, to: null };
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let from = null;
    const to = new Date(today);
    to.setHours(23, 59, 59, 999);

    if (period === 'month') {
      from = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (period === '3m') {
      from = new Date(today);
      from.setMonth(from.getMonth() - 3);
    } else if (period === '6m') {
      from = new Date(today);
      from.setMonth(from.getMonth() - 6);
    } else if (period === 'year') {
      from = new Date(today.getFullYear(), 0, 1);
    }
    return { from, to };
  }, [period]);

  const filteredSales = useMemo(() => {
    let list = Array.isArray(sales) ? [...sales] : [];
    const { from: periodFrom, to: periodTo } = dateRangeFilter;

    if (periodFrom) {
      const fromTime = periodFrom.getTime();
      list = list.filter((s) => new Date(s.sale_date).getTime() >= fromTime);
    }
    if (periodTo) {
      const toTime = periodTo.getTime();
      list = list.filter((s) => new Date(s.sale_date).getTime() <= toTime);
    }

    if (dateFrom) {
      const customFrom = new Date(dateFrom).getTime();
      list = list.filter((s) => new Date(s.sale_date).getTime() >= customFrom);
    }
    if (dateTo) {
      const customTo = new Date(dateTo);
      customTo.setHours(23, 59, 59, 999);
      list = list.filter((s) => new Date(s.sale_date).getTime() <= customTo.getTime());
    }

    return list;
  }, [sales, dateRangeFilter, dateFrom, dateTo, period]);

  // Summary stats from filtered sales
  const totalProfit = useMemo(
    () => filteredSales.reduce((sum, s) => sum + (s.profit_loss_try > 0 ? s.profit_loss_try : 0), 0),
    [filteredSales]
  );
  const totalLoss = useMemo(
    () => filteredSales.reduce((sum, s) => sum + (s.profit_loss_try < 0 ? Math.abs(s.profit_loss_try) : 0), 0),
    [filteredSales]
  );
  const netProfit = totalProfit - totalLoss;
  const totalCost = useMemo(
    () => filteredSales.reduce((sum, s) => sum + (s.buy_cost_try || s.buy_price * s.buy_quantity || 0), 0),
    [filteredSales]
  );
  const netProfitPercent = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;

  // Monthly P&L for bar chart
  const monthlyChartData = useMemo(() => {
    const byMonth = {};
    filteredSales.forEach((s) => {
      const d = new Date(s.sale_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = { month: key, profit: 0, loss: 0 };
      if (s.profit_loss_try >= 0) byMonth[key].profit += s.profit_loss_try;
      else byMonth[key].loss += Math.abs(s.profit_loss_try);
    });
    return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredSales]);

  // Instrument P&L for pie chart (top 8 + Diğer)
  const instrumentPieData = useMemo(() => {
    const byInst = {};
    filteredSales.forEach((s) => {
      const sym = s.instrument_symbol || 'Bilinmiyor';
      byInst[sym] = (byInst[sym] || 0) + s.profit_loss_try;
    });
    const arr = Object.entries(byInst)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const top = arr.slice(0, 8);
    const rest = arr.slice(8);
    if (rest.length > 0) {
      const otherValue = rest.reduce((sum, x) => sum + x.value, 0);
      top.push({ name: 'Diğer', value: otherValue });
    }
    return top;
  }, [filteredSales]);

  // Grouped summary by instrument
  const groupedSummary = useMemo(() => {
    const byInst = {};
    filteredSales.forEach((s) => {
      const sym = s.instrument_symbol || 'Bilinmiyor';
      if (!byInst[sym]) {
        byInst[sym] = {
          instrument_symbol: sym,
          count: 0,
          profit_loss_try: 0,
          total_volume: 0,
          returns: [],
        };
      }
      byInst[sym].count += 1;
      byInst[sym].profit_loss_try += s.profit_loss_try;
      byInst[sym].total_volume += s.sell_value_try || 0;
      if (s.profit_loss_percentage != null) byInst[sym].returns.push(s.profit_loss_percentage);
    });
    return Object.values(byInst).map((g) => ({
      ...g,
      avgReturn: g.returns.length ? g.returns.reduce((a, r) => a + r, 0) / g.returns.length : 0,
    }));
  }, [filteredSales]);

  const sortedSummary = useMemo(() => {
    const list = [...groupedSummary];
    const { field, order } = summarySort;
    list.sort((a, b) => {
      let va = a[field];
      let vb = b[field];
      if (typeof va === 'string') va = va?.toLowerCase?.() || '';
      if (typeof vb === 'string') vb = vb?.toLowerCase?.() || '';
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return order === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [groupedSummary, summarySort]);

  const sortedSales = useMemo(() => {
    const list = [...filteredSales];
    const { field, order } = salesSort;
    list.sort((a, b) => {
      let va, vb;
      if (field === 'sale_date' || field === 'buy_date') {
        va = new Date(a[field] || 0).getTime();
        vb = new Date(b[field] || 0).getTime();
      } else if (field === 'holding_days') {
        va = (a.buy_date && a.sale_date)
          ? Math.floor((new Date(a.sale_date) - new Date(a.buy_date)) / (24 * 60 * 60 * 1000))
          : 0;
        vb = (b.buy_date && b.sale_date)
          ? Math.floor((new Date(b.sale_date) - new Date(b.buy_date)) / (24 * 60 * 60 * 1000))
          : 0;
      } else {
        va = a[field] ?? 0;
        vb = b[field] ?? 0;
      }
      const cmp = va - vb;
      return order === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filteredSales, salesSort]);

  const toggleSummarySort = (field) => {
    setSummarySort((prev) => ({
      field,
      order: prev.field === field && prev.order === 'desc' ? 'asc' : 'desc',
    }));
  };

  const toggleSalesSort = (field) => {
    setSalesSort((prev) => ({
      field,
      order: prev.field === field && prev.order === 'desc' ? 'asc' : 'desc',
    }));
  };

  const getHoldingDays = (sale) => {
    if (!sale.buy_date || !sale.sale_date) return '-';
    const days = Math.floor(
      (new Date(sale.sale_date) - new Date(sale.buy_date)) / (24 * 60 * 60 * 1000)
    );
    return `${days} gün`;
  };

  const exportToCSV = () => {
    const headers = [
      'Satış Tarihi',
      'Enstrüman',
      'Alış Tarihi',
      'Tutma Süresi (gün)',
      'Alış Fiyatı',
      'Satış Fiyatı',
      'Miktar',
      'Satış Değeri (TRY)',
      'Kar/Zarar (TRY)',
      'Kar/Zarar (%)',
      'Not',
    ];
    const rows = sortedSales.map((s) => [
      formatDate(s.sale_date),
      s.instrument_symbol || '',
      formatDate(s.buy_date),
      getHoldingDays(s).replace(' gün', ''),
      s.buy_price,
      s.sell_price,
      s.sell_quantity,
      s.sell_value_try || 0,
      s.profit_loss_try || 0,
      s.profit_loss_percentage || 0,
      s.notes || '',
    ]);
    const escape = (val) => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n'))
        return `"${str.replace(/"/g, '""')}"`;
      return str;
    };
    const csv = [headers.join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `gerceklesen-kar-zarar-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-bnc-textPri">
          Gerçekleşen Kar/Zarar Raporu
        </h1>
        <p className="text-sm text-bnc-textSec mt-1">
          Satış geçmişi ve realize edilmiş kar/zarar analizi
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bnc-card shadow-lg mb-6 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-bnc-textSec" />
            <span className="text-sm font-medium text-bnc-textPri">Tarih Aralığı</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setPeriod(opt.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  period === opt.id
                    ? 'bg-bnc-accent text-bnc-bg'
                    : 'bnc-btn-secondary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="w-4 h-4 text-bnc-textTer" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bnc-input"
              placeholder="Başlangıç"
            />
            <span className="text-bnc-textTer">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bnc-input"
              placeholder="Bitiş"
            />
          </div>
          <button
            onClick={exportToCSV}
            className="ml-auto flex items-center gap-2 bg-bnc-surfaceAlt text-bnc-textSec px-3 py-2 rounded-lg hover:bg-bnc-border transition-colors border border-bnc-border text-sm"
            title="CSV İndir"
          >
            <Download className="w-4 h-4" />
            <span>CSV İndir</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-600 to-bnc-accent rounded-xl shadow-lg p-4 text-bnc-bg">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-bnc-textPri opacity-10"></div>
          <div className="relative">
            <p className="text-xs opacity-90 mb-1">Toplam Satış</p>
            <p className="text-2xl font-bold">{filteredSales.length}</p>
          </div>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-700 to-bnc-green rounded-xl shadow-lg p-4 text-bnc-bg">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-bnc-textPri opacity-10"></div>
          <div className="relative">
            <p className="text-xs opacity-90 mb-1">Toplam Kar</p>
            <p className="text-lg font-bold">{formatCurrency(totalProfit)}</p>
          </div>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-rose-700 to-bnc-red rounded-xl shadow-lg p-4 text-bnc-textPri">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-bnc-textPri opacity-10"></div>
          <div className="relative">
            <p className="text-xs opacity-90 mb-1">Toplam Zarar</p>
            <p className="text-lg font-bold">{formatCurrency(totalLoss)}</p>
          </div>
        </div>
        <div
          className={`relative overflow-hidden rounded-xl shadow-lg p-4 text-bnc-bg ${
            netProfit >= 0
              ? 'bg-gradient-to-br from-emerald-700 to-bnc-green'
              : 'bg-gradient-to-br from-rose-700 to-bnc-red'
          }`}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-bnc-textPri opacity-10"></div>
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-xs opacity-90 mb-1">Net Kar/Zarar</p>
              <p className="text-lg font-bold">{formatCurrency(netProfit)}</p>
              <p className="text-xs opacity-90">{netProfit >= 0 ? '+' : ''}{netProfitPercent.toFixed(2)}%</p>
            </div>
            {netProfit >= 0 ? (
              <TrendingUp className="w-8 h-8 opacity-50" />
            ) : (
              <TrendingDown className="w-8 h-8 opacity-50" />
            )}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bnc-card shadow-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-bnc-textSec" />
            <h2 className="text-lg font-semibold text-bnc-textPri">Aylık Kar/Zarar</h2>
          </div>
          {monthlyChartData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-bnc-textTer">
              Bu aralıkta veri yok
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2B3139" opacity={0.5} />
                <XAxis dataKey="month" stroke="#848E9C" tick={{ fill: '#848E9C', fontSize: 12 }} />
                <YAxis stroke="#848E9C" tick={{ fill: '#848E9C', fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: '#B7BDC6' }}
                  formatter={(value) => [formatCurrency(value), '']}
                  labelFormatter={(label) => label}
                />
                <Legend wrapperStyle={{ color: '#EAECEF' }} />
                <Bar dataKey="profit" name="Kar" stackId="pl" fill="#0ECB81" radius={[0, 0, 0, 0]} />
                <Bar dataKey="loss" name="Zarar" stackId="pl" fill="#F6465D" radius={[0, 0, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bnc-card shadow-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-bnc-textSec" />
            <h2 className="text-lg font-semibold text-bnc-textPri">Enstrüman Bazlı Kar/Zarar</h2>
          </div>
          {instrumentPieData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-bnc-textTer">
              Bu aralıkta veri yok
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={instrumentPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {instrumentPieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => formatCurrency(value)}
                />
                <Legend wrapperStyle={{ color: '#EAECEF' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Grouped Summary Table */}
      <div className="bnc-card shadow-lg overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-bnc-border">
          <h2 className="text-lg font-semibold text-bnc-textPri">Enstrüman Özeti</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-bnc-accent mx-auto"></div>
            <p className="mt-4 text-bnc-textSec">Yükleniyor...</p>
          </div>
        ) : sortedSummary.length === 0 ? (
          <div className="p-8 text-center text-bnc-textTer">Bu aralıkta satış bulunamadı</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-bnc-border">
              <thead className="bg-bnc-surfaceAlt">
                <tr>
                  <th
                    className="px-6 py-4 text-left text-xs font-semibold text-bnc-textPri uppercase tracking-wider cursor-pointer hover:bg-bnc-border"
                    onClick={() => toggleSummarySort('instrument_symbol')}
                  >
                    Enstrüman {summarySort.field === 'instrument_symbol' && (summarySort.order === 'desc' ? '▼' : '▲')}
                  </th>
                  <th
                    className="px-6 py-4 text-right text-xs font-semibold text-bnc-textPri uppercase tracking-wider cursor-pointer hover:bg-bnc-border"
                    onClick={() => toggleSummarySort('count')}
                  >
                    Satış Sayısı {summarySort.field === 'count' && (summarySort.order === 'desc' ? '▼' : '▲')}
                  </th>
                  <th
                    className="px-6 py-4 text-right text-xs font-semibold text-bnc-textPri uppercase tracking-wider cursor-pointer hover:bg-bnc-border"
                    onClick={() => toggleSummarySort('profit_loss_try')}
                  >
                    Toplam Kar/Zarar (₺) {summarySort.field === 'profit_loss_try' && (summarySort.order === 'desc' ? '▼' : '▲')}
                  </th>
                  <th
                    className="px-6 py-4 text-right text-xs font-semibold text-bnc-textPri uppercase tracking-wider cursor-pointer hover:bg-bnc-border"
                    onClick={() => toggleSummarySort('avgReturn')}
                  >
                    Ortalama Getiri (%) {summarySort.field === 'avgReturn' && (summarySort.order === 'desc' ? '▼' : '▲')}
                  </th>
                  <th
                    className="px-6 py-4 text-right text-xs font-semibold text-bnc-textPri uppercase tracking-wider cursor-pointer hover:bg-bnc-border"
                    onClick={() => toggleSummarySort('total_volume')}
                  >
                    Toplam Hacim (₺) {summarySort.field === 'total_volume' && (summarySort.order === 'desc' ? '▼' : '▲')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-bnc-surface divide-y divide-bnc-border">
                {sortedSummary.map((row) => (
                  <tr key={row.instrument_symbol} className="hover:bg-bnc-surfaceAlt">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-bnc-textPri">
                      {row.instrument_symbol}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-bnc-textSec">
                      {row.count}
                    </td>
                    <td
                      className={`px-6 py-4 whitespace-nowrap text-right text-sm font-semibold ${
                        row.profit_loss_try >= 0 ? 'text-bnc-green' : 'text-bnc-red'
                      }`}
                    >
                      {row.profit_loss_try >= 0 ? '+' : ''}{formatCurrency(row.profit_loss_try)}
                    </td>
                    <td
                      className={`px-6 py-4 whitespace-nowrap text-right text-sm ${
                        row.avgReturn >= 0 ? 'text-bnc-green' : 'text-bnc-red'
                      }`}
                    >
                      {row.avgReturn >= 0 ? '+' : ''}{row.avgReturn.toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-bnc-textSec">
                      {formatCurrency(row.total_volume)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sales Table */}
      <div className="bnc-card shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-bnc-border">
          <h2 className="text-lg font-semibold text-bnc-textPri">Satış Detayları</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-bnc-accent mx-auto"></div>
            <p className="mt-4 text-bnc-textSec">Yükleniyor...</p>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="p-8 text-center">
            <DollarSign className="w-16 h-16 text-bnc-textTer mx-auto mb-4" />
            <p className="text-bnc-textSec">
              {sales.length === 0 ? 'Henüz satış kaydı yok' : 'Bu filtreye uygun satış bulunamadı'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop: Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full divide-y divide-bnc-border">
                <thead className="bg-bnc-surfaceAlt">
                    <tr>
                    <th
                      className="px-6 py-4 text-left text-xs font-semibold text-bnc-textPri uppercase tracking-wider cursor-pointer hover:bg-bnc-border"
                      onClick={() => toggleSalesSort('instrument_symbol')}
                    >
                      Enstrüman {salesSort.field === 'instrument_symbol' && (salesSort.order === 'desc' ? '▼' : '▲')}
                    </th>
                    <th
                      className="px-6 py-4 text-left text-xs font-semibold text-bnc-textPri uppercase tracking-wider cursor-pointer hover:bg-bnc-border"
                      onClick={() => toggleSalesSort('sale_date')}
                    >
                      Satış Tarihi {salesSort.field === 'sale_date' && (salesSort.order === 'desc' ? '▼' : '▲')}
                    </th>
                    <th
                      className="px-6 py-4 text-center text-xs font-semibold text-bnc-textPri uppercase tracking-wider cursor-pointer hover:bg-bnc-border"
                      onClick={() => toggleSalesSort('holding_days')}
                    >
                      Tutma Süresi {salesSort.field === 'holding_days' && (salesSort.order === 'desc' ? '▼' : '▲')}
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-bnc-textPri uppercase tracking-wider">
                      Alış
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-bnc-textPri uppercase tracking-wider">
                      Satış
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-bnc-textPri uppercase tracking-wider">
                      Miktar
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-bnc-textPri uppercase tracking-wider">
                      Kar/Zarar
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-bnc-textPri uppercase tracking-wider">
                      Not
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-bnc-textPri uppercase tracking-wider">
                      İşlem
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-bnc-surface divide-y divide-bnc-border">
                    {sortedSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-bnc-surfaceAlt transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-bnc-textPri">
                        {sale.instrument_symbol}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-bnc-textSec">
                        {formatDate(sale.sale_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-bnc-textSec">
                        {getHoldingDays(sale)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-bnc-textPri">
                          {sale.buy_price?.toFixed(2)} {sale.buy_currency}
                        </div>
                        <div className="text-xs text-bnc-textSec">{formatDate(sale.buy_date)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-bnc-textPri">
                          {sale.sell_price?.toFixed(2)} {sale.sell_currency}
                        </div>
                        <div className="text-xs text-bnc-textSec">{formatCurrency(sale.sell_value_try)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-bnc-textPri">
                        {sale.sell_quantity?.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div
                          className={`flex items-center justify-end gap-1 ${
                            sale.profit_loss_try >= 0 ? 'text-bnc-green' : 'text-bnc-red'
                          }`}
                        >
                          {sale.profit_loss_try >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          <div>
                            <div className="text-sm font-semibold">
                              {sale.profit_loss_try >= 0 ? '+' : ''}{formatCurrency(sale.profit_loss_try)}
                            </div>
                            <div className="text-xs">
                              {sale.profit_loss_try >= 0 ? '+' : ''}{sale.profit_loss_percentage?.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-bnc-textSec max-w-xs truncate">
                        {sale.notes || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleDelete(sale.id)}
                          className="text-bnc-red hover:opacity-80"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: Card view */}
            <div className="sm:hidden divide-y divide-bnc-border">
              {sortedSales.map((sale) => (
                <div
                  key={sale.id}
                  className="p-4 bg-bnc-surface hover:bg-bnc-surfaceAlt"
                >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <span className="font-semibold text-bnc-textPri text-sm">
                      {sale.instrument_symbol}
                    </span>
                    <span
                      className={
                        sale.profit_loss_try >= 0
                          ? 'text-bnc-green'
                          : 'text-bnc-red'
                      }
                    >
                      {sale.profit_loss_try >= 0 ? '+' : ''}{formatCurrency(sale.profit_loss_try)} (
                      {sale.profit_loss_try >= 0 ? '+' : ''}{sale.profit_loss_percentage?.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-bnc-textSec mb-2">
                    <span>Tutma: {getHoldingDays(sale)}</span>
                    <span>Adet: {sale.sell_quantity?.toFixed(2)}</span>
                    <span>Alış: {sale.buy_price?.toFixed(2)} {sale.buy_currency}</span>
                    <span>Satış: {sale.sell_price?.toFixed(2)} {sale.sell_currency}</span>
                  </div>
                  <div className="text-xs text-bnc-textTer">
                    {formatDate(sale.sale_date)}
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-bnc-border">
                    <button
                      onClick={() => handleDelete(sale.id)}
                      className="p-2 text-bnc-red hover:bg-bnc-red/10 rounded-lg"
                      title="Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
