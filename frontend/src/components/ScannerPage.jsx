import { useState } from 'react';
import { Search } from 'lucide-react';
import { runBistEmaScan } from '../services/api';

export default function ScannerPage() {
  const [loading, setLoading] = useState(false);
  const [symbolsSource, setSymbolsSource] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [emaPeriods, setEmaPeriods] = useState([20, 50, 100]);
  const [useMyInstruments, setUseMyInstruments] = useState(false); // false = Tüm BIST 30

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const runScan = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await runBistEmaScan({
        ema_periods: emaPeriods,
        use_my_instruments: useMyInstruments,
      });
      setSymbolsSource(res.data?.source || 'default');
      setResults(res.data);
    } catch (err) {
      console.error('Scanner error:', err);
      setError(err.response?.data?.detail || err.message || 'Tarama başarısız.');
    } finally {
      setLoading(false);
    }
  };

  const toggleEma = (period) => {
    setEmaPeriods((prev) =>
      prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period].sort((a, b) => a - b)
    );
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-bnc-textPri">
          BIST EMA Taraması
        </h1>
        <p className="text-sm text-bnc-textSec mt-1">
          Fiyatı EMA 20, 50 ve 100 üstünde olan hisseleri listeler
        </p>
      </div>

      <div className="max-w-7xl">
          {/* Kriterler */}
          <div className="bnc-card shadow-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-bnc-textPri mb-4">
              Tarama Kriterleri
            </h2>
            <div className="flex flex-wrap gap-4 items-center mb-4">
              <span className="text-sm text-bnc-textSec">Fiyat şu EMA’ların üstünde olsun:</span>
              {[20, 50, 100].map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emaPeriods.includes(p)}
                    onChange={() => toggleEma(p)}
                    className="rounded border-bnc-border bg-bnc-surfaceAlt text-bnc-accent focus:ring-bnc-accent"
                  />
                  <span className="text-sm font-medium text-bnc-textPri">EMA {p}</span>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={useMyInstruments}
                onChange={(e) => setUseMyInstruments(e.target.checked)}
                className="rounded border-bnc-border bg-bnc-surfaceAlt text-bnc-accent focus:ring-bnc-accent"
              />
              <span className="text-sm text-bnc-textSec">
                Sadece portföyümdeki BIST hisselerini tara (işaretli değilse tüm BIST 30 taranır)
              </span>
            </label>
            <button
              onClick={runScan}
              disabled={loading || emaPeriods.length === 0}
              className="bnc-btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              <Search className={`w-5 h-5 ${loading ? 'animate-pulse' : ''}`} />
              {loading ? 'Taranıyor...' : 'Tarayı Çalıştır'}
            </button>
          </div>

          {error && (
            <div className="bg-bnc-surface border border-bnc-red/40 rounded-lg p-4 mb-6 text-bnc-red">
              {error}
            </div>
          )}

          {results && (
            <>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <p className="text-sm text-bnc-textSec">
                  <strong className="text-bnc-textPri">{results.count}</strong> hisse kriteri sağladı.
                  {symbolsSource === 'db' && ' (Semboller: portföyünüzdeki BIST enstrümanları)'}
                  {symbolsSource === 'default' && ' (Semboller: varsayılan BIST listesi)'}
                </p>
              </div>
              <div className="bnc-card shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-bnc-border">
                    <thead className="bg-bnc-surfaceAlt">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-bnc-textPri uppercase tracking-wider">
                          Sembol
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-semibold text-bnc-textPri uppercase tracking-wider">
                          Fiyat (₺)
                        </th>
                        {results.results?.[0]?.ema_20 != null && (
                          <th className="px-6 py-4 text-right text-xs font-semibold text-bnc-textPri uppercase tracking-wider">
                            EMA 20
                          </th>
                        )}
                        {results.results?.[0]?.ema_50 != null && (
                          <th className="px-6 py-4 text-right text-xs font-semibold text-bnc-textPri uppercase tracking-wider">
                            EMA 50
                          </th>
                        )}
                        {results.results?.[0]?.ema_100 != null && (
                          <th className="px-6 py-4 text-right text-xs font-semibold text-bnc-textPri uppercase tracking-wider">
                            EMA 100
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-bnc-surface divide-y divide-bnc-border">
                      {(results.results || []).map((row) => (
                        <tr key={row.symbol} className="hover:bg-bnc-surfaceAlt transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-bnc-textPri">
                              {row.symbol}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-bnc-textPri">
                            {formatCurrency(row.close)}
                          </td>
                          {row.ema_20 != null && (
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-bnc-textSec">
                              {formatCurrency(row.ema_20)}
                            </td>
                          )}
                          {row.ema_50 != null && (
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-bnc-textSec">
                              {formatCurrency(row.ema_50)}
                            </td>
                          )}
                          {row.ema_100 != null && (
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-bnc-textSec">
                              {formatCurrency(row.ema_100)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {results.results?.length === 0 && (
                  <div className="p-8 text-center text-bnc-textTer">
                    Kriteri sağlayan hisse bulunamadı.
                  </div>
                )}
              </div>
            </>
          )}
      </div>
    </div>
  );
}
