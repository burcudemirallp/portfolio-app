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
      className={`px-4 py-2.5 text-xs font-medium text-bnc-textSec uppercase tracking-wider cursor-pointer hover:bg-bnc-surfaceAlt ${align === 'left' ? 'text-left' : 'text-right'}`}
    >
      <div className={`flex items-center ${align === 'left' ? '' : 'justify-end'}`}>
        {label}
        {sortField === field
          ? (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-bnc-accent" /> : <ArrowDown className="w-3 h-3 ml-1 text-bnc-accent" />)
          : <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 text-bnc-textTer" />
        }
      </div>
    </th>
  );

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-bnc-bg">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-bnc-border border-t-bnc-accent" />
      </div>
    );
  }

  if (snapshots.length < 2) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 bg-bnc-bg min-h-[60vh]">
        <div className="bnc-card p-6 text-center">
          <Calendar className="w-12 h-12 mx-auto text-bnc-textTer mb-3" />
          <h2 className="text-lg font-semibold text-bnc-textPri mb-1.5">Yeterli snapshot yok</h2>
          <p className="text-sm text-bnc-textSec mb-4">Performans analizi için en az 2 snapshot gerekiyor. (Mevcut: {snapshots.length})</p>
          <button
            onClick={handleCreateSnapshot}
            disabled={creatingSnapshot}
            className="bnc-btn-primary disabled:opacity-50 disabled:pointer-events-none"
          >
            {creatingSnapshot ? 'Oluşturuluyor...' : 'Snapshot oluştur'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 bg-bnc-bg">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-bnc-textPri tracking-tight">Performans analizi</h1>
      </div>

      <div className="bnc-card p-4 mb-4">
        <h2 className="text-sm font-semibold text-bnc-textPri mb-1">Karşılaştırılacak tarihler</h2>
        <p className="text-xs text-bnc-textSec mb-3">Vurgulu günlerde snapshot vardır. İki tarih seçerek karşılaştırın.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <h3 className="text-xs font-medium text-bnc-textSec mb-1.5 flex items-center justify-between">
              <span>Başlangıç</span>
              {selectedSnapshot1 && <span className="text-[10px] text-bnc-accent">{formatDate(snapshots.find(s => s.id === selectedSnapshot1)?.snapshot_date)}</span>}
            </h3>
            <SnapshotCalendar snapshots={snapshots} selectedSnapshot={selectedSnapshot1} onSelectSnapshot={setSelectedSnapshot1} />
          </div>
          <div>
            <h3 className="text-xs font-medium text-bnc-textSec mb-1.5 flex items-center justify-between">
              <span>Bitiş</span>
              {selectedSnapshot2 && <span className="text-[10px] text-bnc-accent">{formatDate(snapshots.find(s => s.id === selectedSnapshot2)?.snapshot_date)}</span>}
            </h3>
            <SnapshotCalendar snapshots={snapshots} selectedSnapshot={selectedSnapshot2} onSelectSnapshot={setSelectedSnapshot2} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { if (snapshots.length >= 2) { setSelectedSnapshot1(snapshots[0].id); setSelectedSnapshot2(snapshots[snapshots.length - 1].id); } }}
            className="bnc-btn-secondary px-2.5 py-1 text-xs"
          >
            En eski — en yeni
          </button>
          {snapshots.length >= 2 && (
            <button
              onClick={() => { setSelectedSnapshot1(snapshots[snapshots.length - 2].id); setSelectedSnapshot2(snapshots[snapshots.length - 1].id); }}
              className="px-2.5 py-1 text-xs bg-bnc-surfaceAlt border border-bnc-border rounded-lg text-bnc-green font-medium hover:bg-bnc-border"
            >
              Son iki snapshot
            </button>
          )}
        </div>
      </div>

      {comparison && (
        <>
          <div className="bnc-card p-4 mb-4 border-t-2 border-t-bnc-accent">
            <h2 className="text-sm font-semibold text-bnc-textPri mb-3">Portföy özeti</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <p className="text-bnc-textSec text-xs mb-0.5">Başlangıç değeri</p>
                <p className="text-xl font-bold text-bnc-textPri">{formatCurrency(comparison.snapshot1.total_value)}</p>
                <p className="text-bnc-textTer text-[10px] mt-0.5">{formatDate(comparison.snapshot1.date)}</p>
              </div>
              <div>
                <p className="text-bnc-textSec text-xs mb-0.5">Güncel değer</p>
                <p className="text-xl font-bold text-bnc-textPri">{formatCurrency(comparison.snapshot2.total_value)}</p>
                <p className="text-bnc-textTer text-[10px] mt-0.5">{formatDate(comparison.snapshot2.date)}</p>
              </div>
              <div>
                <p className="text-bnc-textSec text-xs mb-0.5">Toplam yatırım</p>
                <p className="text-xl font-bold text-bnc-textPri">{formatCurrency(comparison.snapshot2.total_cost)}</p>
              </div>
              <div>
                <p className="text-bnc-textSec text-xs mb-0.5">Değer değişimi</p>
                <p className={`text-xl font-bold ${comparison.portfolio_change.value_change >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                  {comparison.portfolio_change.value_change >= 0 ? '+' : ''}
                  {comparison.portfolio_change.value_change_pct.toFixed(2)}%
                </p>
                <p className="text-bnc-textTer text-[10px] mt-0.5">
                  {comparison.portfolio_change.value_change >= 0 ? '+' : ''}{formatCurrency(comparison.portfolio_change.value_change)}
                </p>
              </div>
            </div>
          </div>

          <div className="bnc-card p-4 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-bnc-textPri">Performans grafiği</h2>
              <select
                value={selectedInstrument}
                onChange={(e) => setSelectedInstrument(e.target.value)}
                className="bnc-input min-w-[180px]"
              >
                <option value="ALL">Tüm portföy</option>
                {comparison.instruments.map(inst => (
                  <option key={inst.instrument_id} value={inst.instrument_id}>{inst.symbol} - {inst.name}</option>
                ))}
              </select>
            </div>

            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={prepareChartData()} margin={{ top: 5, right: 24, left: 8, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2B3139" />
                <XAxis dataKey="date" stroke="#848E9C" style={{ fontSize: '11px' }} />
                <YAxis stroke="#848E9C" style={{ fontSize: '10px' }} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M ₺` : v >= 1000 ? `${(v / 1000).toFixed(0)}K ₺` : `${v.toFixed(0)} ₺`} />
                <Tooltip contentStyle={{ backgroundColor: '#1E2329', border: '1px solid #2B3139', borderRadius: '8px', color: '#EAECEF' }} formatter={(value, name) => [formatCurrency(value), name]} />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#B7BDC6' }} />
                <Line type="monotone" dataKey="value" stroke="#F0B90B" strokeWidth={2} dot={{ fill: '#F0B90B', r: 4 }} name={selectedInstrument === 'ALL' ? 'Portföy değeri' : 'Enstrüman değeri'} />
                {selectedInstrument === 'ALL' && (
                  <Line type="monotone" dataKey="investment" stroke="#0ECB81" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#0ECB81', r: 3 }} name="Toplam yatırım" />
                )}
              </LineChart>
            </ResponsiveContainer>

            {selectedInstrument !== 'ALL' && (() => {
              const inst = comparison.instruments.find(i => i.instrument_id === parseInt(selectedInstrument));
              if (!inst) return null;
              const qtyChange = inst.current_quantity - inst.previous_quantity;
              return (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div className="bg-bnc-surfaceAlt border border-bnc-border rounded-lg p-2.5">
                    <p className="text-xs font-medium text-bnc-textSec mb-1">Fiyat değişimi</p>
                    <p className={`text-base font-bold ${inst.price_change_pct >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                      {inst.price_change_pct >= 0 ? '+' : ''}{inst.price_change_pct.toFixed(2)}%
                    </p>
                    <p className="text-xs text-bnc-textTer">{formatCurrency(inst.previous_price)} → {formatCurrency(inst.current_price)}</p>
                  </div>
                  <div className="bg-bnc-surfaceAlt border border-bnc-border rounded-lg p-2.5">
                    <p className="text-xs font-medium text-bnc-textSec mb-1">Değer değişimi</p>
                    <p className={`text-base font-bold ${inst.value_change_pct >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                      {inst.value_change_pct >= 0 ? '+' : ''}{inst.value_change_pct.toFixed(2)}%
                    </p>
                    <p className="text-xs text-bnc-textTer">{formatCurrency(inst.previous_value)} → {formatCurrency(inst.current_value)}</p>
                  </div>
                  <div className="bg-bnc-surfaceAlt border border-bnc-border rounded-lg p-2.5">
                    <p className="text-xs font-medium text-bnc-textSec mb-1">Adet değişimi</p>
                    <p className={`text-base font-bold ${qtyChange >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                      {qtyChange >= 0 ? '+' : ''}{qtyChange.toFixed(2)}
                    </p>
                    <p className="text-xs text-bnc-textTer">{inst.previous_quantity.toFixed(2)} → {inst.current_quantity.toFixed(2)}</p>
                  </div>
                  <div className="bg-bnc-surfaceAlt border border-bnc-border rounded-lg p-2.5">
                    <p className="text-xs font-medium text-bnc-textSec mb-1">Ort. maliyet</p>
                    <p className="text-base font-bold text-bnc-textPri">{formatCurrency(inst.current_avg_cost || 0)}</p>
                    <p className="text-xs text-bnc-textTer">Önceki: {formatCurrency(inst.previous_avg_cost || 0)}</p>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="bnc-card overflow-hidden p-0">
            <div className="px-4 py-3 border-b border-bnc-border">
              <h2 className="text-sm font-semibold text-bnc-textPri">Enstrüman bazlı performans</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-bnc-border">
                <thead className="bg-bnc-surfaceAlt">
                  <tr>
                    <SortHeader field="symbol" label="Enstrüman" align="left" />
                    <SortHeader field="previous_price" label="Önceki fiyat" />
                    <SortHeader field="current_price" label="Güncel fiyat" />
                    <SortHeader field="price_change_pct" label="Fiyat değişimi" />
                    <SortHeader field="previous_value" label="Önceki değer" />
                    <SortHeader field="current_value" label="Güncel değer" />
                    <SortHeader field="value_change_pct" label="Değer değişimi" />
                    <SortHeader field="quantity_change" label="Miktar değişimi" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-bnc-border bg-bnc-surface">
                  {getSortedInstruments().map((inst) => {
                    const qtyChange = inst.current_quantity - inst.previous_quantity;
                    return (
                      <tr key={inst.instrument_id} className="hover:bg-bnc-surfaceAlt/80">
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="text-sm font-medium text-bnc-textPri">{inst.symbol}</div>
                          <div className="text-xs text-bnc-textTer">{inst.name}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm text-bnc-textPri">{formatCurrency(inst.previous_price)}</td>
                        <td className="px-4 py-2.5 text-right text-sm text-bnc-textPri">{formatCurrency(inst.current_price)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`inline-flex items-center text-sm font-medium ${inst.price_change_pct >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                            {inst.price_change_pct >= 0 ? <TrendingUp className="w-3.5 h-3.5 mr-1" /> : <TrendingDown className="w-3.5 h-3.5 mr-1" />}
                            {inst.price_change_pct >= 0 ? '+' : ''}{inst.price_change_pct.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm text-bnc-textPri">{formatCurrency(inst.previous_value)}</td>
                        <td className="px-4 py-2.5 text-right text-sm text-bnc-textPri">{formatCurrency(inst.current_value)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`inline-flex items-center text-sm font-medium ${inst.value_change_pct >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                            {inst.value_change_pct >= 0 ? <TrendingUp className="w-3.5 h-3.5 mr-1" /> : <TrendingDown className="w-3.5 h-3.5 mr-1" />}
                            {inst.value_change_pct >= 0 ? '+' : ''}{inst.value_change_pct.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm">
                          <div className={`font-medium ${qtyChange > 0 ? 'text-bnc-green' : qtyChange < 0 ? 'text-bnc-red' : 'text-bnc-textTer'}`}>
                            {qtyChange > 0 ? '+' : ''}{qtyChange.toFixed(2)}
                          </div>
                          <div className="text-xs text-bnc-textTer">{inst.previous_quantity.toFixed(2)} → {inst.current_quantity.toFixed(2)}</div>
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
