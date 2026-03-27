import { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { createSaleRecord } from '../services/api';
import { useToast } from './Toast';

export default function SellForm({ transaction, instrument, currentPrice, onClose, onSuccess }) {
  const { showSuccess, showError } = useToast();
  const [sellPrice, setSellPrice] = useState(currentPrice || '');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [profitLoss, setProfitLoss] = useState(null);

  // Kar/zarar hesapla
  useEffect(() => {
    if (sellPrice) {
      const buyTotal = transaction.quantity * transaction.price + (transaction.fees || 0);
      const sellTotal = transaction.quantity * parseFloat(sellPrice);
      const pl = sellTotal - buyTotal;
      const plPct = (pl / buyTotal) * 100;
      
      setProfitLoss({
        amount: pl,
        percentage: plPct,
        isProfit: pl >= 0
      });
    } else {
      setProfitLoss(null);
    }
  }, [sellPrice, transaction]);

  useEffect(() => {
    if (currentPrice) setSellPrice(currentPrice);
  }, [currentPrice]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await createSaleRecord({
        buy_transaction_id: transaction.id,
        sell_price: parseFloat(sellPrice),
        sell_quantity: transaction.quantity, // Tamamını sat
        sell_currency: transaction.currency,
        notes: notes || null,
        reason: null
      });

      showSuccess('Satış kaydı oluşturuldu ve pozisyon portföyden çıkarıldı!');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error creating sale record:', error);
      showError('Satış kaydı oluşturulamadı: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  if (!instrument) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bnc-surface border border-bnc-border rounded-lg shadow-xl max-w-lg w-full">
        {/* Header */}
        <div className="bg-bnc-red text-bnc-bg px-6 py-4 flex justify-between items-center rounded-t-lg">
          <h2 className="text-xl font-semibold">
            Portföyden Çıkar
          </h2>
          <button
            onClick={onClose}
            className="text-bnc-bg hover:opacity-80"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Enstrüman Bilgisi */}
          <div className="bg-bnc-surfaceAlt border border-bnc-border rounded-lg p-4">
            <h3 className="font-semibold text-bnc-textPri text-lg mb-3">
              {instrument?.symbol} - {instrument?.name}
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-bnc-textSec">Alış Fiyatı:</span>
                <span className="font-semibold text-bnc-textPri">
                  {transaction.price.toFixed(2)} {transaction.currency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-bnc-textSec">Miktar:</span>
                <span className="font-semibold text-bnc-textPri">
                  {transaction.quantity}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-bnc-textSec">Alış Tarihi:</span>
                <span className="font-semibold text-bnc-textPri">
                  {new Date(transaction.timestamp).toLocaleDateString('tr-TR')}
                </span>
              </div>
              <div className="flex justify-between border-t border-bnc-border pt-2 mt-2">
                <span className="text-bnc-textSec">Toplam Maliyet:</span>
                <span className="font-bold text-bnc-textPri">
                  {(transaction.quantity * transaction.price + (transaction.fees || 0)).toFixed(2)} {transaction.currency}
                </span>
              </div>
            </div>
          </div>

          {/* Satış Fiyatı */}
          <div>
            <label className="block text-sm font-medium text-bnc-textSec mb-2">
              Satış Fiyatı * <span className="text-xs text-bnc-textTer">(Güncel: {currentPrice || 'N/A'})</span>
            </label>
            <input
              type="number"
              step="0.01"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              required
              className="w-full px-4 py-3 text-lg bnc-input focus:border-bnc-red"
              placeholder="0.00"
            />
          </div>

          {/* Notlar */}
          <div>
            <label className="block text-sm font-medium text-bnc-textSec mb-2">
              Not (Opsiyonel)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bnc-input focus:border-bnc-red"
              placeholder="Satış nedeni, notlar..."
            />
          </div>

          {/* Kar/Zarar Özeti */}
          {profitLoss && (
            <div className={`border-2 rounded-lg p-4 ${
              profitLoss.isProfit 
                ? 'bg-bnc-green/10 border-bnc-green/50' 
                : 'bg-bnc-red/10 border-bnc-red/50'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {profitLoss.isProfit ? (
                    <TrendingUp className="w-6 h-6 text-bnc-green" />
                  ) : (
                    <TrendingDown className="w-6 h-6 text-bnc-red" />
                  )}
                  <span className={`font-semibold ${
                    profitLoss.isProfit 
                      ? 'text-bnc-green' 
                      : 'text-bnc-red'
                  }`}>
                    {profitLoss.isProfit ? 'Kar' : 'Zarar'}:
                  </span>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold ${
                    profitLoss.isProfit 
                      ? 'text-bnc-green' 
                      : 'text-bnc-red'
                  }`}>
                    {profitLoss.isProfit ? '+' : ''}{profitLoss.amount.toFixed(2)} {transaction.currency}
                  </p>
                  <p className={`text-sm font-semibold ${
                    profitLoss.isProfit 
                      ? 'text-bnc-green' 
                      : 'text-bnc-red'
                  }`}>
                    {profitLoss.isProfit ? '+' : ''}{profitLoss.percentage.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-bnc-border text-bnc-textSec rounded-lg hover:bg-bnc-surfaceAlt font-medium"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || !sellPrice}
              className="flex-1 px-4 py-3 bg-bnc-red text-bnc-bg rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {loading ? 'Kaydediliyor...' : 'Onayla ve Çıkar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
