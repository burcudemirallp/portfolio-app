import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, TrendingUp, TrendingDown, ArrowRight, Wallet, Search, Check } from 'lucide-react';
import { createSaleRecord, getInstruments, createTransaction } from '../services/api';
import { useToast } from './Toast';
import { useLanguage } from '../contexts/LanguageContext';

const CASH_TYPES = ['nakit', 'cash', 'fon', 'fund', 'para fonu', 'ppf', 'money market'];

export default function SellForm({ transaction, instrument, currentPrice, accounts = [], onClose, onSuccess }) {
  const { showSuccess, showError } = useToast();
  const { t, locale } = useLanguage();

  const fmt = useCallback((v) =>
    v == null ? '—' : new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v),
  [locale]);
  const [sellPrice, setSellPrice] = useState(currentPrice || '');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [profitLoss, setProfitLoss] = useState(null);

  const [step, setStep] = useState('sell');
  const [saleResult, setSaleResult] = useState(null);
  const [allInstruments, setAllInstruments] = useState([]);
  const [cashSearch, setCashSearch] = useState('');
  const [selectedCash, setSelectedCash] = useState(null);
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    if (sellPrice) {
      const buyTotal = transaction.quantity * transaction.price + (transaction.fees || 0);
      const sellTotal = transaction.quantity * parseFloat(sellPrice);
      const pl = sellTotal - buyTotal;
      const plPct = (pl / buyTotal) * 100;
      setProfitLoss({ amount: pl, percentage: plPct, isProfit: pl >= 0 });
    } else {
      setProfitLoss(null);
    }
  }, [sellPrice, transaction]);

  useEffect(() => {
    if (currentPrice) setSellPrice(currentPrice);
  }, [currentPrice]);

  useEffect(() => {
    getInstruments().then(r => setAllInstruments(r.data || [])).catch(() => {});
  }, []);

  const cashInstruments = useMemo(() => {
    const q = cashSearch.toLowerCase();
    return allInstruments.filter(i => {
      const isCash = CASH_TYPES.some(t =>
        (i.asset_type || '').toLowerCase().includes(t) ||
        (i.symbol || '').toLowerCase().includes(t)
      );
      if (!isCash) return false;
      if (q) return (i.symbol || '').toLowerCase().includes(q);
      return true;
    });
  }, [allInstruments, cashSearch]);

  const sellValue = useMemo(() => {
    if (!sellPrice) return 0;
    return transaction.quantity * parseFloat(sellPrice);
  }, [sellPrice, transaction.quantity]);

  const accountName = useMemo(() => {
    const acc = accounts.find(a => a.id === transaction.account_id);
    return acc?.name || t('sell.account.fallback', { id: String(transaction.account_id) });
  }, [accounts, transaction.account_id, t]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createSaleRecord({
        buy_transaction_id: transaction.id,
        sell_price: parseFloat(sellPrice),
        sell_quantity: transaction.quantity,
        sell_currency: transaction.currency,
        notes: notes || null,
        reason: null,
      });
      setSaleResult({ sellValue, currency: transaction.currency });
      setStep('cash');
    } catch (error) {
      showError(t('sell.error.saleFailed', { detail: String(error.response?.data?.detail || error.message) }));
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!selectedCash || !saleResult) return;
    setTransferring(true);
    try {
      const cashCurrency = selectedCash.currency || transaction.currency || 'TRY';
      const cashPrice = selectedCash.last_price_try || 1;
      const quantity = saleResult.sellValue / cashPrice;
      await createTransaction({
        account_id: transaction.account_id,
        instrument_id: selectedCash.id,
        type: 'buy',
        quantity: parseFloat(quantity.toFixed(6)),
        price: cashPrice,
        fees: 0,
        currency: cashCurrency,
        horizon: 'short',
        is_cash_flow: 0,
        primary_tag: 'Nakit',
        timestamp: new Date().toISOString(),
      });
      showSuccess(`${fmt(saleResult.sellValue)} ₺ → ${selectedCash.symbol} (${accountName})`);
      onSuccess();
      onClose();
    } catch (error) {
      showError(t('sell.error.transferFailed', { detail: String(error.response?.data?.detail || error.message) }));
    } finally {
      setTransferring(false);
    }
  };

  const handleSkip = () => {
    showSuccess('Satış kaydı oluşturuldu!');
    onSuccess();
    onClose();
  };

  if (!instrument) return null;

  const cost = transaction.quantity * transaction.price + (transaction.fees || 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bnc-surface border border-bnc-border rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-bnc-surface border-b border-bnc-border px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 className="text-lg font-semibold text-bnc-textPri">
              {step === 'sell' ? t('sell.title.sell') : t('sell.title.cash')}
            </h2>
            {step === 'sell' && (
              <p className="text-xs text-bnc-textTer mt-0.5">{t('sell.subtitle', { symbol: instrument.symbol, quantity: String(transaction.quantity) })}</p>
            )}
          </div>
          <button onClick={step === 'sell' ? onClose : handleSkip}
            className="text-bnc-textTer hover:text-bnc-textPri transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── STEP 1: SELL ── */}
        {step === 'sell' && (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">

            {/* Position summary */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: t('sell.summary.buyPrice'), value: `${transaction.price.toFixed(2)} ${transaction.currency}` },
                { label: t('sell.summary.quantity'), value: transaction.quantity },
                { label: t('sell.summary.cost'), value: `${fmt(cost)} ${transaction.currency}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-bnc-bg rounded-lg px-3 py-2.5 text-center">
                  <p className="text-[10px] text-bnc-textTer mb-0.5">{label}</p>
                  <p className="text-xs font-semibold text-bnc-textPri">{value}</p>
                </div>
              ))}
            </div>

            {/* Sell price */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-bnc-textSec">{t('sell.label.sellPrice')}</label>
                {currentPrice > 0 && (
                  <button type="button" onClick={() => setSellPrice(currentPrice)}
                    className="text-[11px] text-bnc-accent hover:text-bnc-accentHover transition-colors">
                    {t('sell.button.useCurrentPrice', { price: fmt(currentPrice) })}
                  </button>
                )}
              </div>
              <input type="number" step="0.01" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)}
                required className="w-full bnc-input text-lg font-semibold py-3" placeholder="0.00" autoFocus />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-bnc-textSec mb-1.5">{t('sell.label.notes')}</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="w-full bnc-input resize-none text-sm" placeholder={t('sell.placeholder.notes')} />
            </div>

            {/* P/L preview */}
            {profitLoss && (
              <div className={`rounded-lg p-4 flex items-center justify-between ${
                profitLoss.isProfit ? 'bg-bnc-green/8 border border-bnc-green/20' : 'bg-bnc-red/8 border border-bnc-red/20'
              }`}>
                <div className="flex items-center gap-2.5">
                  {profitLoss.isProfit
                    ? <TrendingUp className="w-5 h-5 text-bnc-green" />
                    : <TrendingDown className="w-5 h-5 text-bnc-red" />}
                  <div>
                    <p className="text-[11px] text-bnc-textTer">{profitLoss.isProfit ? t('sell.estimatedProfit') : t('sell.estimatedLoss')}</p>
                    <p className={`text-xs font-semibold ${profitLoss.isProfit ? 'text-bnc-green' : 'text-bnc-red'}`}>
                      {profitLoss.isProfit ? '+' : ''}{profitLoss.percentage.toFixed(2)}%
                    </p>
                  </div>
                </div>
                <p className={`text-xl font-bold ${profitLoss.isProfit ? 'text-bnc-green' : 'text-bnc-red'}`}>
                  {profitLoss.isProfit ? '+' : ''}{fmt(profitLoss.amount)} {transaction.currency}
                </p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="bnc-btn-secondary flex-1 py-2.5">
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={loading || !sellPrice}
                className="flex-1 py-2.5 bg-bnc-red text-white font-semibold rounded-lg text-sm hover:bg-bnc-red/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {loading ? t('common.saving') : t('sell.button.sellAndExit')}
              </button>
            </div>
          </form>
        )}

        {/* ── STEP 2: CASH TRANSFER ── */}
        {step === 'cash' && saleResult && (
          <div className="p-6 space-y-5">

            {/* Success banner */}
            <div className="flex items-center gap-3 bg-bnc-green/8 border border-bnc-green/20 rounded-lg p-4">
              <div className="w-8 h-8 rounded-full bg-bnc-green/20 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 text-bnc-green" />
              </div>
              <div>
                <p className="text-sm font-semibold text-bnc-green">{t('sell.cash.banner')}</p>
                <p className="text-xs text-bnc-textTer mt-0.5">
                  {instrument.symbol} · {fmt(saleResult.sellValue)} {saleResult.currency}
                </p>
              </div>
            </div>

            {/* Prompt */}
            <div className="flex items-center gap-2.5">
              <Wallet className="w-4 h-4 text-bnc-accent shrink-0" />
              <div>
                <p className="text-sm text-bnc-textSec">{t('sell.cash.prompt')}</p>
                <p className="text-[11px] text-bnc-textTer mt-0.5">
                  {t('sell.cash.accountLabel')} <span className="font-medium text-bnc-textPri">{accountName}</span>
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-bnc-textTer" />
              <input value={cashSearch} onChange={e => setCashSearch(e.target.value)}
                placeholder={t('sell.cash.searchPlaceholder')}
                className="w-full bnc-input pl-10 py-2.5 text-sm" />
            </div>

            {/* Instrument list */}
            <div className="rounded-lg border border-bnc-border overflow-hidden">
              <div className="max-h-52 overflow-y-auto divide-y divide-bnc-border">
                {cashInstruments.length === 0 ? (
                  <div className="py-8 text-center">
                    <Wallet className="w-6 h-6 mx-auto text-bnc-textTer/30 mb-2" />
                    <p className="text-xs text-bnc-textTer">{t('sell.cash.empty')}</p>
                    <p className="text-[10px] text-bnc-textTer/60 mt-1">{t('sell.cash.emptyHint')}</p>
                  </div>
                ) : cashInstruments.map(ci => {
                  const active = selectedCash?.id === ci.id;
                  return (
                    <button key={ci.id} onClick={() => setSelectedCash(active ? null : ci)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${
                        active ? 'bg-bnc-accent/8' : 'hover:bg-bnc-surfaceAlt/50'
                      }`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                        active ? 'bg-bnc-accent text-bnc-bg' : 'bg-bnc-surfaceAlt text-bnc-textTer'
                      }`}>
                        {ci.symbol.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-bnc-textPri">{ci.symbol}</p>
                        <p className="text-[10px] text-bnc-textTer">{ci.asset_type} · {ci.market}</p>
                      </div>
                      {ci.last_price_try != null && (
                        <span className="text-xs text-bnc-textSec font-medium shrink-0">{fmt(ci.last_price_try)} ₺</span>
                      )}
                      {active && (
                        <div className="w-5 h-5 rounded-full bg-bnc-accent flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 text-bnc-bg" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Transfer preview */}
            {selectedCash && (
              <div className="bg-bnc-bg rounded-lg p-4 flex items-center gap-4">
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-bnc-textTer mb-0.5">{t('sell.cash.saleAmount')}</p>
                  <p className="text-sm font-bold text-bnc-textPri">{fmt(saleResult.sellValue)} ₺</p>
                </div>
                <ArrowRight className="w-4 h-4 text-bnc-accent shrink-0" />
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-bnc-textTer mb-0.5">{selectedCash.symbol}</p>
                  <p className="text-sm font-bold text-bnc-accent">
                    {t('sell.cash.units', { count: (saleResult.sellValue / (selectedCash.last_price_try || 1)).toFixed(4) })}
                  </p>
                  <p className="text-[10px] text-bnc-textTer mt-0.5">{accountName}</p>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-1">
              <button onClick={handleSkip} className="bnc-btn-secondary flex-1 py-2.5">
                {t('sell.button.skip')}
              </button>
              <button onClick={handleTransfer} disabled={!selectedCash || transferring}
                className="flex-1 py-2.5 bg-bnc-accent text-bnc-bg font-semibold rounded-lg text-sm hover:bg-bnc-accentHover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {transferring ? t('sell.button.transferring') : t('sell.button.transfer')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
