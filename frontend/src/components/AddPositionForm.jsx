import { useState, useMemo, useCallback } from 'react';
import { X, Plus, TrendingUp, ArrowRight } from 'lucide-react';
import { createTransaction } from '../services/api';
import { useToast } from './Toast';
import { useLanguage } from '../contexts/LanguageContext';

export default function AddPositionForm({ transaction, instrument, currentPrice, allTransactions = [], fxRates = {}, onClose, onSuccess }) {
  const { showSuccess, showError } = useToast();
  const { t, locale } = useLanguage();

  const fmt = useCallback((v) =>
    v == null ? '—' : new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v),
  [locale]);

  const fmtCurrency = useCallback((v) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'TRY', minimumFractionDigits: 2 }).format(v || 0),
  [locale]);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState('0');
  const [loading, setLoading] = useState(false);

  const existingPosition = useMemo(() => {
    const buys = allTransactions.filter(
      tx => tx.instrument_id === transaction.instrument_id && tx.type === 'buy' && !tx.is_sold
    );
    let totalQty = 0;
    let totalCost = 0;
    for (const tx of buys) {
      const txCurrency = (tx.currency || 'TRY').toUpperCase();
      const fxRate = txCurrency === 'USD' ? (fxRates.USDTRY || 1) : txCurrency === 'EUR' ? (fxRates.EURTRY || 1) : 1;
      totalQty += tx.quantity;
      totalCost += (tx.quantity * tx.price + (tx.fees || 0)) * fxRate;
    }
    const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
    return { totalQty, totalCost, avgCost, txCount: buys.length };
  }, [allTransactions, transaction.instrument_id, fxRates]);

  const newAvg = useMemo(() => {
    const newQty = parseFloat(quantity) || 0;
    const newPrice = parseFloat(price) || 0;
    const newFees = parseFloat(fees) || 0;
    if (newQty <= 0 || newPrice <= 0) return null;

    const txCurrency = (transaction.currency || 'TRY').toUpperCase();
    const fxRate = txCurrency === 'USD' ? (fxRates.USDTRY || 1) : txCurrency === 'EUR' ? (fxRates.EURTRY || 1) : 1;
    const newCostTRY = (newQty * newPrice + newFees) * fxRate;

    const combinedQty = existingPosition.totalQty + newQty;
    const combinedCost = existingPosition.totalCost + newCostTRY;
    const combinedAvg = combinedQty > 0 ? combinedCost / combinedQty : 0;

    return {
      addedQty: newQty,
      addedCost: newCostTRY,
      combinedQty,
      combinedCost,
      combinedAvg,
      avgChange: combinedAvg - existingPosition.avgCost,
      avgChangePct: existingPosition.avgCost > 0 ? ((combinedAvg - existingPosition.avgCost) / existingPosition.avgCost * 100) : 0,
    };
  }, [quantity, price, fees, existingPosition, transaction.currency, fxRates]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createTransaction({
        account_id: transaction.account_id,
        instrument_id: transaction.instrument_id,
        type: 'buy',
        quantity: parseFloat(quantity),
        price: parseFloat(price),
        fees: parseFloat(fees),
        currency: transaction.currency || 'TRY',
        horizon: transaction.horizon || 'long',
        primary_tag: transaction.primary_tag || '',
        secondary_tags: transaction.secondary_tags || '',
      });
      showSuccess(t('addPosition.toast.success', { symbol: instrument?.symbol || '?', quantity }));
      onSuccess?.();
      onClose();
    } catch (err) {
      showError(err.response?.data?.detail || t('addPosition.error'));
    } finally {
      setLoading(false);
    }
  };

  const symbol = instrument?.symbol || '?';
  const currency = (transaction.currency || 'TRY').toUpperCase();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bnc-surface border border-bnc-border rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-bnc-surface border-b border-bnc-border px-5 py-3 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-bnc-textPri flex items-center gap-2">
            <Plus className="w-5 h-5 text-bnc-accent" />
            {symbol} — {t('addPosition.title')}
          </h2>
          <button onClick={onClose} className="text-bnc-textTer hover:text-bnc-textPri">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mevcut Pozisyon Özeti */}
          <div className="bg-bnc-surfaceAlt border border-bnc-border rounded-lg p-4">
            <p className="text-xs font-medium text-bnc-textTer mb-2">{t('addPosition.currentPosition')}</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] text-bnc-textTer">{t('addPosition.quantity')}</p>
                <p className="text-sm font-semibold text-bnc-textPri">{fmt(existingPosition.totalQty)}</p>
              </div>
              <div>
                <p className="text-[11px] text-bnc-textTer">{t('addPosition.avgCost')}</p>
                <p className="text-sm font-semibold text-bnc-textPri">{fmtCurrency(existingPosition.avgCost)}</p>
              </div>
              <div>
                <p className="text-[11px] text-bnc-textTer">{t('addPosition.currentPrice')}</p>
                <p className="text-sm font-semibold text-bnc-accent">{fmtCurrency(currentPrice)}</p>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-bnc-border grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-bnc-textTer">{t('addPosition.totalCost')}</p>
                <p className="text-sm font-medium text-bnc-textSec">{fmtCurrency(existingPosition.totalCost)}</p>
              </div>
              <div>
                <p className="text-[11px] text-bnc-textTer">{t('addPosition.totalValue')}</p>
                <p className="text-sm font-medium text-bnc-textSec">{fmtCurrency(existingPosition.totalQty * (currentPrice || 0))}</p>
              </div>
            </div>
          </div>

          {/* Ek Alım Formu */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-bnc-textSec mb-1">{t('addPosition.quantity')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full bnc-input"
                  placeholder="0.00"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-bnc-textSec mb-1">
                  {t('addPosition.price')} <span className="text-bnc-textTer">({currency})</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full bnc-input"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-bnc-textSec mb-1">
                {t('addPosition.fees')} <span className="text-bnc-textTer">({currency})</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                className="w-full bnc-input"
              />
            </div>

            {/* Yeni Ortalama Önizleme */}
            {newAvg && (
              <div className="bg-bnc-bg border border-bnc-accent/30 rounded-lg p-4 space-y-2">
                <p className="text-xs font-medium text-bnc-accent mb-2 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  {t('addPosition.afterBuy')}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[11px] text-bnc-textTer">{t('addPosition.newQuantity')}</p>
                    <p className="text-sm font-semibold text-bnc-textPri">{fmt(newAvg.combinedQty)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-bnc-textTer">{t('addPosition.newAverage')}</p>
                    <p className="text-sm font-semibold text-bnc-textPri">{fmtCurrency(newAvg.combinedAvg)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-bnc-textTer">{t('addPosition.avgChange')}</p>
                    <p className={`text-sm font-semibold ${newAvg.avgChange >= 0 ? 'text-bnc-red' : 'text-bnc-green'}`}>
                      {newAvg.avgChange >= 0 ? '+' : ''}{fmtCurrency(newAvg.avgChange)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-bnc-border text-xs text-bnc-textTer">
                  <span>{fmtCurrency(existingPosition.avgCost)}</span>
                  <ArrowRight className="w-3 h-3" />
                  <span className="font-medium text-bnc-textPri">{fmtCurrency(newAvg.combinedAvg)}</span>
                  <span className={`ml-auto ${newAvg.avgChangePct >= 0 ? 'text-bnc-red' : 'text-bnc-green'}`}>
                    ({newAvg.avgChangePct >= 0 ? '+' : ''}{newAvg.avgChangePct.toFixed(2)}%)
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 bnc-btn-secondary">
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={loading} className="flex-1 bnc-btn-primary disabled:opacity-50">
                {loading ? t('common.adding') : t('addPosition.submit')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
