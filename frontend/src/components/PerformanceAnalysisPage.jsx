import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Calendar, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { getPortfolioSnapshots, compareSnapshots, createPortfolioSnapshot } from '../services/api';
import SnapshotCalendar from './SnapshotCalendar';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useToast } from './Toast';

function PerformanceAnalysisPage() {
  const { showSuccess, showError } = useToast();
  const [snapshots, setSnapshots] = useState([]);
  const [selectedSnapshot1, setSelectedSnapshot1] = useState(null);
  const [selectedSnapshot2, setSelectedSnapshot2] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [selectedInstrument, setSelectedInstrument] = useState('ALL');
  const [sortField, setSortField] = useState('value_change_pct');
  const [sortDirection, setSortDirection] = useState('desc');

  useEffect(() => {
    loadSnapshots();
  }, []);

  const handleCreateSnapshot = async () => {
    setCreatingSnapshot(true);
    try {
      const res = await createPortfolioSnapshot();
      showSuccess(`Snapshot oluşturuldu! ${res.data.total_positions} pozisyon kaydedildi`);
      await loadSnapshots();
    } catch (err) {
      showError('Snapshot oluşturulamadı: ' + (err.response?.data?.detail || err.message));
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const loadSnapshots = async () => {
    try {
      const res = await getPortfolioSnapshots(50);
      setSnapshots(res.data);
      if (res.data.length >= 2) {
        setSelectedSnapshot1(res.data[0].id);
        setSelectedSnapshot2(res.data[res.data.length - 1].id);
      }
    } catch (err) {
      console.error('Error loading snapshots:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSnapshot1 && selectedSnapshot2 && selectedSnapshot1 !== selectedSnapshot2) {
      loadComparison();
    }
  }, [selectedSnapshot1, selectedSnapshot2]);

  const loadComparison = async () => {
    try {
      const res = await compareSnapshots(selectedSnapshot1, selectedSnapshot2);
      setComparison(res.data);
    } catch (err) {
      console.error('Error comparing snapshots:', err);
    }
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2 }).format(value);

  const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortedInstruments = () => {
    if (!comparison) return [];
    return [...comparison.instruments].sort((a, b) => {
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
  };

  const prepareChartData = () => {
    if (!comparison) return [];
    if (selectedInstrument === 'ALL') {
      return [
        { date: new Date(comparison.snapshot1.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }), value: comparison.snapshot1.total_value, investment: comparison.snapshot1.total_cost },
        { date: new Date(comparison.snapshot2.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }), value: comparison.snapshot2.total_value, investment: comparison.snapshot2.total_cost },
      ];
    }
    const inst = comparison.instruments.find(i => i.instrument_id === parseInt(selectedInstrument));
    if (!inst) return [];
    return [
      { date: new Date(comparison.snapshot1.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }), value: inst.previous_value },
      { date: new Date(comparison.snapshot2.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }), value: inst.current_value },
    ];
  };

  const SortHeader = ({ field, label, align = 'right' }) => (
    <th
      onClick={() => handleSort(field)}
      className={`px-4 py-3 text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${align === 'left' ? 'text-left' : 'text-right'}`}
    >
      <div className={`flex items-center ${align === 'left' ? '' : 'justify-end'}`}>
        {label}
        {sortField === field
          ? (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />)
          : <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />
        }
      </div>
    </th>
  );

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (snapshots.length < 2) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <Calendar className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Yeterli Snapshot Yok</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">Performans analizi için en az 2 snapshot gerekiyor. (Mevcut: {snapshots.length})</p>
          <button
            onClick={handleCreateSnapshot}
            disabled={creatingSnapshot}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {creatingSnapshot ? 'Oluşturuluyor...' : 'Snapshot Oluştur'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📊 Performans Analizi</h1>
      </div>

      {/* Snapshot Seçimi */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">📅 Karşılaştırılacak Tarihleri Seçin</h2>
        <p className="text-xs text-gray-700 dark:text-gray-300 mb-3">Mavi işaretli günlerde snapshot var. İki tarih seçerek karşılaştırma yapın.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5 flex items-center justify-between">
              <span>📍 Başlangıç</span>
              {selectedSnapshot1 && <span className="text-[10px] text-blue-600 dark:text-blue-400">{formatDate(snapshots.find(s => s.id === selectedSnapshot1)?.snapshot_date)}</span>}
            </h3>
            <SnapshotCalendar snapshots={snapshots} selectedSnapshot={selectedSnapshot1} onSelectSnapshot={setSelectedSnapshot1} />
          </div>
          <div>
            <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5 flex items-center justify-between">
              <span>🎯 Bitiş</span>
              {selectedSnapshot2 && <span className="text-[10px] text-blue-600 dark:text-blue-400">{formatDate(snapshots.find(s => s.id === selectedSnapshot2)?.snapshot_date)}</span>}
            </h3>
            <SnapshotCalendar snapshots={snapshots} selectedSnapshot={selectedSnapshot2} onSelectSnapshot={setSelectedSnapshot2} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { if (snapshots.length >= 2) { setSelectedSnapshot1(snapshots[0].id); setSelectedSnapshot2(snapshots[snapshots.length - 1].id); } }}
            className="px-2.5 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
          >
            ⏮️ En Eski ↔ En Yeni ⏭️
          </button>
          {snapshots.length >= 2 && (
            <button
              onClick={() => { setSelectedSnapshot1(snapshots[snapshots.length - 2].id); setSelectedSnapshot2(snapshots[snapshots.length - 1].id); }}
              className="px-2.5 py-1 text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-800"
            >
              📊 Son İki Snapshot
            </button>
          )}
        </div>
      </div>

      {/* Karşılaştırma Sonuçları */}
      {comparison && (
        <>
          {/* Portföy Özeti */}
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg p-4 mb-4 text-white">
            <h2 className="text-base font-semibold mb-3">📊 Portföy Performansı</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-blue-100 text-xs mb-0.5">Başlangıç Değeri</p>
                <p className="text-2xl font-bold">{formatCurrency(comparison.snapshot1.total_value)}</p>
                <p className="text-blue-100 text-[10px] mt-0.5">{formatDate(comparison.snapshot1.date)}</p>
              </div>
              <div>
                <p className="text-blue-100 text-xs mb-0.5">Güncel Değer</p>
                <p className="text-2xl font-bold">{formatCurrency(comparison.snapshot2.total_value)}</p>
                <p className="text-blue-100 text-[10px] mt-0.5">{formatDate(comparison.snapshot2.date)}</p>
              </div>
              <div>
                <p className="text-blue-100 text-xs mb-0.5">Toplam Yatırım</p>
                <p className="text-2xl font-bold">{formatCurrency(comparison.snapshot2.total_cost)}</p>
              </div>
              <div>
                <p className="text-blue-100 text-xs mb-0.5">Değer Değişimi</p>
                <p className={`text-2xl font-bold ${comparison.portfolio_change.value_change >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {comparison.portfolio_change.value_change >= 0 ? '📈 +' : '📉 '}
                  {comparison.portfolio_change.value_change_pct.toFixed(2)}%
                </p>
                <p className="text-blue-100 text-[10px] mt-0.5">
                  {comparison.portfolio_change.value_change >= 0 ? '+' : ''}{formatCurrency(comparison.portfolio_change.value_change)}
                </p>
              </div>
            </div>
          </div>

          {/* Grafik */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">📈 Performans Grafiği</h2>
              <select
                value={selectedInstrument}
                onChange={(e) => setSelectedInstrument(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="ALL">🏦 Tüm Portföy</option>
                {comparison.instruments.map(inst => (
                  <option key={inst.instrument_id} value={inst.instrument_id}>{inst.symbol} - {inst.name}</option>
                ))}
              </select>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={prepareChartData()} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9CA3AF" style={{ fontSize: '12px' }} />
                <YAxis stroke="#9CA3AF" style={{ fontSize: '11px' }} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M ₺` : v >= 1000 ? `${(v / 1000).toFixed(0)}K ₺` : `${v.toFixed(0)} ₺`} />
                <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px', color: '#F9FAFB' }} formatter={(value, name) => [formatCurrency(value), name]} />
                <Legend />
                <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={3} dot={{ fill: '#3B82F6', r: 6 }} name={selectedInstrument === 'ALL' ? 'Portföy Değeri' : 'Enstrüman Değeri'} />
                {selectedInstrument === 'ALL' && (
                  <Line type="monotone" dataKey="investment" stroke="#10B981" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#10B981', r: 5 }} name="Toplam Yatırım" />
                )}
              </LineChart>
            </ResponsiveContainer>

            {selectedInstrument !== 'ALL' && (() => {
              const inst = comparison.instruments.find(i => i.instrument_id === parseInt(selectedInstrument));
              if (!inst) return null;
              const qtyChange = inst.current_quantity - inst.previous_quantity;
              return (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded border border-blue-200 dark:border-blue-700">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">💰 Fiyat Değişimi</p>
                    <p className={`text-lg font-bold ${inst.price_change_pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {inst.price_change_pct >= 0 ? '+' : ''}{inst.price_change_pct.toFixed(2)}%
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-300">{formatCurrency(inst.previous_price)} → {formatCurrency(inst.current_price)}</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded border border-purple-200 dark:border-purple-700">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">📊 Değer Değişimi</p>
                    <p className={`text-lg font-bold ${inst.value_change_pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {inst.value_change_pct >= 0 ? '+' : ''}{inst.value_change_pct.toFixed(2)}%
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-300">{formatCurrency(inst.previous_value)} → {formatCurrency(inst.current_value)}</p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/30 p-3 rounded border border-green-200 dark:border-green-700">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">📦 Adet Değişimi</p>
                    <p className={`text-lg font-bold ${qtyChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {qtyChange >= 0 ? '+' : ''}{qtyChange.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-300">{inst.previous_quantity.toFixed(2)} → {inst.current_quantity.toFixed(2)}</p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/30 p-3 rounded border border-orange-200 dark:border-orange-700">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">💵 Ort. Maliyet</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(inst.current_avg_cost || 0)}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300">Önceki: {formatCurrency(inst.previous_avg_cost || 0)}</p>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Enstrüman Tablosu */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">📈 Enstrüman Bazlı Performans</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <SortHeader field="symbol" label="Enstrüman" align="left" />
                    <SortHeader field="previous_price" label="Önceki Fiyat" />
                    <SortHeader field="current_price" label="Güncel Fiyat" />
                    <SortHeader field="price_change_pct" label="Fiyat Değişimi" />
                    <SortHeader field="previous_value" label="Önceki Değer" />
                    <SortHeader field="current_value" label="Güncel Değer" />
                    <SortHeader field="value_change_pct" label="Değer Değişimi" />
                    <SortHeader field="quantity_change" label="Miktar Değişimi" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {getSortedInstruments().map((inst) => {
                    const qtyChange = inst.current_quantity - inst.previous_quantity;
                    return (
                      <tr key={inst.instrument_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{inst.symbol}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{inst.name}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-white">{formatCurrency(inst.previous_price)}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-white">{formatCurrency(inst.current_price)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`inline-flex items-center text-sm font-medium ${inst.price_change_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {inst.price_change_pct >= 0 ? <TrendingUp className="w-3.5 h-3.5 mr-1" /> : <TrendingDown className="w-3.5 h-3.5 mr-1" />}
                            {inst.price_change_pct >= 0 ? '+' : ''}{inst.price_change_pct.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-white">{formatCurrency(inst.previous_value)}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-white">{formatCurrency(inst.current_value)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`inline-flex items-center text-sm font-medium ${inst.value_change_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {inst.value_change_pct >= 0 ? <TrendingUp className="w-3.5 h-3.5 mr-1" /> : <TrendingDown className="w-3.5 h-3.5 mr-1" />}
                            {inst.value_change_pct >= 0 ? '+' : ''}{inst.value_change_pct.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          <div className={`font-medium ${qtyChange > 0 ? 'text-green-600' : qtyChange < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                            {qtyChange > 0 ? '+' : ''}{qtyChange.toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500">{inst.previous_quantity.toFixed(2)} → {inst.current_quantity.toFixed(2)}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default PerformanceAnalysisPage;
