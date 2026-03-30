import { useState, useEffect, useMemo, useCallback, useTransition, useDeferredValue } from 'react';
import { Trash2, Edit2, DollarSign, Search, X, PlusCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from './Toast';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { getDebugTransactions, deleteTransaction, getInstruments, getAccounts, getFxRates, getPortfolioSummary } from '../services/api';
import TransactionForm from './TransactionForm';
import SellForm from './SellForm';
import AddPositionForm from './AddPositionForm';

const COLORS = ['#F0B90B', '#0ECB81', '#F6465D', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

function TransactionsPage() {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const { showSuccess, showError } = useToast();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [filter, setFilter] = useState({ 
    instrument: 'all', 
    tag: 'all',
    currency: 'all',
    account: 'all',
    dateFrom: '',
    dateTo: '',
    plStatus: 'all', // 'profit', 'loss', 'breakeven', 'all'
    search: ''
  });
  const [sortBy, setSortBy] = useState({ field: 'value', order: 'desc' });
  const [instruments, setInstruments] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [prices, setPrices] = useState({});
  const [fxRates, setFxRates] = useState({ USDTRY: 1, EURTRY: 1 });
  const [summary, setSummary] = useState(null);
  const [chartFilter, setChartFilter] = useState(null); // { type: 'asset_type', value: 'Hisse' }
  const [sellingTransaction, setSellingTransaction] = useState(null);
  const [addingToTransaction, setAddingToTransaction] = useState(null);
  const [searchInput, setSearchInput] = useState(''); // Separate state for input
  const [, startTransition] = useTransition();
  
  // Use deferred value for expensive computations
  const deferredFilter = useDeferredValue(filter);
  const isStale = filter !== deferredFilter;

  const loadData = useCallback(async () => {
    try {
      const [txRes, instRes, accountsRes, fxRes, summaryRes] = await Promise.all([
        getDebugTransactions(),
        getInstruments(),
        getAccounts(),
        getFxRates(),
        getPortfolioSummary(),
      ]);
      setSummary(summaryRes?.data || null);
      const txList = Array.isArray(txRes?.data) ? txRes.data : [];
      const instList = Array.isArray(instRes?.data) ? instRes.data : [];
      const accList = Array.isArray(accountsRes?.data) ? accountsRes.data : [];
      setTransactions(txList.filter(tx => tx.type !== 'sell' && !tx.is_sold));
      setInstruments(instList);
      setAccounts(accList);

      if (fxRes?.data) {
        setFxRates({
          USDTRY: fxRes.data.USDTRY ?? 1,
          EURTRY: fxRes.data.EURTRY ?? 1
        });
      }

      const priceMap = {};
      instList.forEach(inst => {
        if (inst?.last_price_try != null) {
          priceMap[inst.id] = {
            current_price_try: inst.last_price_try,
            current_price_original: inst.last_price,
            currency: inst.currency,
            last_updated: inst.last_price_updated_at || null,
          };
        }
      });
      setPrices(priceMap);
    } catch (err) {
      // 401 = oturum süresi doldu; interceptor çıkış yapacak, konsola yazma
      if (err.response?.status !== 401) {
        console.error('Error loading transactions:', err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, loadData]);

  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener('portfolio-prices-refreshed', handler);
    window.addEventListener('portfolio-transaction-created', handler);
    return () => {
      window.removeEventListener('portfolio-prices-refreshed', handler);
      window.removeEventListener('portfolio-transaction-created', handler);
    };
  }, [loadData]);

  // Debounce search input with transition
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(() => {
        setFilter(prev => ({ ...prev, search: searchInput }));
      });
    }, 500); // 500ms delay - wait longer before filtering

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Instrument lookup'ı optimize et - Map kullan (O(1) lookup)
  const instrumentMap = useMemo(() => {
    const map = new Map();
    instruments.forEach(inst => {
      map.set(inst.id, inst);
    });
    return map;
  }, [instruments]);

  const getInstrumentName = useCallback((id) => {
    const inst = instrumentMap.get(id);
    return inst ? inst.symbol : `ID: ${id}`;
  }, [instrumentMap]);

  const formatCurrency = useCallback((value) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(value);
  }, [locale]);

  const formatPercent = useCallback((value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  }, []);

  const formatDate = useCallback((dateString) => {
    return new Date(dateString).toLocaleString(locale);
  }, [locale]);

  const sortOptions = useMemo(() => [
    { field: 'value', order: 'desc', label: t('portfolio.sort.valueDesc') },
    { field: 'value', order: 'asc', label: t('portfolio.sort.valueAsc') },
    { field: 'pl', order: 'desc', label: t('portfolio.sort.plDesc') },
    { field: 'pl', order: 'asc', label: t('portfolio.sort.plAsc') },
    { field: 'timestamp', order: 'desc', label: t('portfolio.sort.newest') },
    { field: 'timestamp', order: 'asc', label: t('portfolio.sort.oldest') },
  ], [t]);

  const emptySecondaryPie = useMemo(() => [{ name: t('portfolio.noSecondaryTags'), value: 1 }], [t]);
  const emptyInstrumentPie = useMemo(() => [{ name: t('common.noData'), value: 1 }], [t]);

  // Filtreleme işlemi (memoized, instrumentMap kullanarak optimize edildi)
  // Use deferredFilter instead of filter for expensive operations
  const filteredTransactions = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];
    
    return transactions.filter(tx => {
      // Quick checks first (no object lookups)
      if (deferredFilter.instrument !== 'all' && tx.instrument_id !== parseInt(deferredFilter.instrument)) return false;
      if (deferredFilter.currency !== 'all' && tx.currency?.toUpperCase() !== deferredFilter.currency) return false;
      if (deferredFilter.account !== 'all' && tx.account_id !== parseInt(deferredFilter.account)) return false;
      
      // Tag filter
      if (deferredFilter.tag !== 'all') {
        if (deferredFilter.tag === 'no-tag' && tx.primary_tag) return false;
        if (deferredFilter.tag !== 'no-tag') {
          const hasPrimaryTag = tx.primary_tag === deferredFilter.tag;
          const hasSecondaryTag = tx.secondary_tags && tx.secondary_tags.split(',').map(t => t.trim()).includes(deferredFilter.tag);
          if (!hasPrimaryTag && !hasSecondaryTag) return false;
        }
      }
      
      // Date range filter
      if (deferredFilter.dateFrom) {
        const txDate = new Date(tx.timestamp);
        const fromDate = new Date(deferredFilter.dateFrom);
        if (txDate < fromDate) return false;
      }
      if (deferredFilter.dateTo) {
        const txDate = new Date(tx.timestamp);
        const toDate = new Date(deferredFilter.dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (txDate > toDate) return false;
      }
      
      if (deferredFilter.search) {
        const inst = instrumentMap.get(tx.instrument_id);
        const searchLower = deferredFilter.search.toLowerCase();
        const symbolMatch = inst?.symbol?.toLowerCase().includes(searchLower);
        const primaryTagMatch = tx.primary_tag?.toLowerCase().includes(searchLower);
        const secondaryTagMatch = tx.secondary_tags?.toLowerCase().includes(searchLower);
        if (!symbolMatch && !primaryTagMatch && !secondaryTagMatch) return false;
      }
      
      // P/L Status filter (most expensive - do last)
      if (deferredFilter.plStatus !== 'all') {
        const priceInfo = prices[tx.instrument_id];
        if (!priceInfo) return deferredFilter.plStatus === 'no-price';
        
        const txCurrency = tx.currency?.toUpperCase() || 'TRY';
        const fxRate = txCurrency === 'USD' ? fxRates.USDTRY : txCurrency === 'EUR' ? fxRates.EURTRY : 1;
        const buyPriceTRY = tx.price * fxRate;
        const currentPriceTRY = priceInfo.current_price_try;
        
        if (!currentPriceTRY) return deferredFilter.plStatus === 'no-price';
        
        const plPercentage = ((currentPriceTRY - buyPriceTRY) / buyPriceTRY * 100);
        
        if (deferredFilter.plStatus === 'profit' && plPercentage <= 0) return false;
        if (deferredFilter.plStatus === 'loss' && plPercentage >= 0) return false;
        if (deferredFilter.plStatus === 'breakeven' && Math.abs(plPercentage) > 0.5) return false;
      }
      
      return true;
    });
  }, [transactions, deferredFilter, instrumentMap, prices, fxRates]);

  // Chart filter uygula (memoized, instrumentMap kullanarak optimize edildi)
  const chartFilteredTransactions = useMemo(() => {
    if (!chartFilter) return filteredTransactions;
    
    return (filteredTransactions || []).filter(tx => {
      const inst = instrumentMap.get(tx.instrument_id);
      if (!inst) return false;
      
      if (chartFilter.type === 'asset_type') {
        return inst.asset_type === chartFilter.value;
      }
      if (chartFilter.type === 'primary_tag') {
        return tx.primary_tag === chartFilter.value;
      }
      if (chartFilter.type === 'secondary_tag') {
        const secondaryTags = tx.secondary_tags ? tx.secondary_tags.split(',').map(t => t.trim()) : [];
        return secondaryTags.includes(chartFilter.value);
      }
      
      return true;
    });
  }, [filteredTransactions, chartFilter, instrumentMap]);

  // Sort transactions (memoized) - limit to improve performance
  const sortedTransactions = useMemo(() => {
    if (!chartFilteredTransactions || chartFilteredTransactions.length === 0) return [];
    
    return [...chartFilteredTransactions].sort((a, b) => {
    let aVal, bVal;
    
    switch (sortBy.field) {
      case 'timestamp':
        aVal = new Date(a.timestamp).getTime();
        bVal = new Date(b.timestamp).getTime();
        break;
      case 'quantity':
        aVal = a.quantity;
        bVal = b.quantity;
        break;
      case 'value':
        // Güncel değere göre sırala (Adet × Güncel Fiyat)
        const aPriceInfoValue = prices[a.instrument_id];
        const bPriceInfoValue = prices[b.instrument_id];
        
        if (!aPriceInfoValue && !bPriceInfoValue) return 0;
        if (!aPriceInfoValue) return 1;
        if (!bPriceInfoValue) return -1;
        
        aVal = (aPriceInfoValue.current_price_try || 0) * a.quantity;
        bVal = (bPriceInfoValue.current_price_try || 0) * b.quantity;
        break;
      case 'pl':
        const aPriceInfo = prices[a.instrument_id];
        const bPriceInfo = prices[b.instrument_id];
        
        if (!aPriceInfo && !bPriceInfo) return 0;
        if (!aPriceInfo) return 1;
        if (!bPriceInfo) return -1;
        
        const aTxCurrency = a.currency?.toUpperCase() || 'TRY';
        const bTxCurrency = b.currency?.toUpperCase() || 'TRY';
        const aFxRate2 = aTxCurrency === 'USD' ? fxRates.USDTRY : aTxCurrency === 'EUR' ? fxRates.EURTRY : 1;
        const bFxRate2 = bTxCurrency === 'USD' ? fxRates.USDTRY : bTxCurrency === 'EUR' ? fxRates.EURTRY : 1;
        
        const aBuyPriceTRY = a.price * aFxRate2;
        const bBuyPriceTRY = b.price * bFxRate2;
        const aCurrentPriceTRY = aPriceInfo.current_price_try || 0;
        const bCurrentPriceTRY = bPriceInfo.current_price_try || 0;
        
        aVal = aCurrentPriceTRY ? ((aCurrentPriceTRY - aBuyPriceTRY) / aBuyPriceTRY * 100) : -999;
        bVal = bCurrentPriceTRY ? ((bCurrentPriceTRY - bBuyPriceTRY) / bBuyPriceTRY * 100) : -999;
        break;
      default:
        return 0;
    }
    
    return sortBy.order === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [chartFilteredTransactions, sortBy, prices, fxRates]);

  // Toplam yatırım (TRY bazında) - memoized (chart filter dahil) - Skip during pending
  const totalInvestedTRY = useMemo(() => {
    if (isStale || !chartFilteredTransactions || chartFilteredTransactions.length === 0) return 0;
    
    let sum = 0;
    for (const tx of chartFilteredTransactions) {
      const txCurrency = tx.currency?.toUpperCase() || 'TRY';
      const fxRate = txCurrency === 'USD' ? (fxRates.USDTRY || 1) : txCurrency === 'EUR' ? (fxRates.EURTRY || 1) : 1;
      const costTRY = ((tx.quantity || 0) * (tx.price || 0) + (tx.fees || 0)) * fxRate;
      sum += costTRY;
    }
    return sum;
  }, [chartFilteredTransactions, fxRates, isStale]);

  // Toplam piyasa değeri (mevcut fiyatlar ile) - chart filter dahil - Skip during pending
  const totalMarketValue = useMemo(() => {
    if (isStale || !chartFilteredTransactions || chartFilteredTransactions.length === 0) return 0;
    
    let sum = 0;
    for (const tx of chartFilteredTransactions) {
      const priceInfo = prices?.[tx.instrument_id];
      if (!priceInfo?.current_price_try) continue;
      const marketValue = (priceInfo.current_price_try || 0) * (tx.quantity || 0);
      sum += marketValue;
    }
    return sum;
  }, [chartFilteredTransactions, prices, isStale]);
  
  // Toplam kar/zarar hesapla (memoized) - chart filter dahil - Skip during pending
  const totalProfitLoss = useMemo(() => {
    if (isStale || !chartFilteredTransactions || chartFilteredTransactions.length === 0) return 0;
    
    let sum = 0;
    for (const tx of chartFilteredTransactions) {
      const priceInfo = prices?.[tx.instrument_id];
      if (!priceInfo?.current_price_try) continue;
      
      const txCurrency = tx.currency?.toUpperCase() || 'TRY';
      const fxRate = txCurrency === 'USD' ? (fxRates.USDTRY || 1) : txCurrency === 'EUR' ? (fxRates.EURTRY || 1) : 1;
      const totalCostTRY = ((tx.quantity || 0) * (tx.price || 0) + (tx.fees || 0)) * fxRate;
      const marketValue = (priceInfo.current_price_try || 0) * (tx.quantity || 0);
      const unrealizedPL = marketValue - totalCostTRY;
      
      sum += unrealizedPL;
    }
    return sum;
  }, [chartFilteredTransactions, prices, fxRates, isStale]);
  
  const totalProfitLossPercentage = useMemo(() => 
    totalInvestedTRY > 0 ? (totalProfitLoss / totalInvestedTRY * 100) : 0,
    [totalInvestedTRY, totalProfitLoss]
  );

  const displayMarketValue = useMemo(() => {
    if (!summary) return 0;
    if (!chartFilter) return summary.total_market_value_try || 0;
    if (chartFilter.type === 'primary_tag') {
      const match = (summary.allocation_by_primary_tag || []).find(
        a => a.asset_type === chartFilter.value
      );
      if (match) return match.market_value_try;
    }
    if (chartFilter.type === 'secondary_tag') {
      const match = (summary.allocation_by_tag || []).find(
        a => a.asset_type === chartFilter.value
      );
      if (match) return match.market_value_try;
    }
    return 0;
  }, [chartFilter, summary]);

  const displayInvested = useMemo(() => {
    if (!summary) return 0;
    if (!chartFilter) return summary.total_cost_basis_try || 0;
    // Filtre aktifken positions üzerinden maliyet hesapla
    if (summary.positions) {
      let filtered = summary.positions;
      if (chartFilter.type === 'primary_tag') {
        filtered = filtered.filter(p => p.primary_tag === chartFilter.value);
      } else if (chartFilter.type === 'secondary_tag') {
        filtered = filtered.filter(p => {
          const tags = p.secondary_tags ? p.secondary_tags.split(',').map(t => t.trim()) : [];
          return tags.includes(chartFilter.value);
        });
      }
      return filtered.reduce((sum, p) => sum + ((p.avg_cost_try || 0) * (p.quantity || 0)), 0);
    }
    return 0;
  }, [chartFilter, summary]);

  const displayPL = useMemo(() => displayMarketValue - displayInvested, [displayMarketValue, displayInvested]);
  const displayPLPct = useMemo(() => displayInvested > 0 ? (displayPL / displayInvested * 100) : 0, [displayPL, displayInvested]);

  // Primary Tag Chart Data - backend summary verisi (tek doğru kaynak)
  const primaryTagChartData = useMemo(() => {
    if (!summary?.allocation_by_primary_tag) return [];
    return summary.allocation_by_primary_tag.map(a => ({
      name: a.asset_type,
      value: a.market_value_try,
    }));
  }, [summary]);

  // Secondary Tag Chart Data - positions verisinden hesapla
  const secondaryTagChartData = useMemo(() => {
    if (!summary?.positions) return [];
    const tagGroups = {};
    for (const pos of summary.positions) {
      if (!pos.secondary_tags || (pos.market_value_try || 0) <= 0) continue;
      const tags = pos.secondary_tags.split(',').map(t => t.trim()).filter(Boolean);
      for (const tag of tags) {
        if (!tagGroups[tag]) tagGroups[tag] = 0;
        tagGroups[tag] += pos.market_value_try;
      }
    }
    return Object.entries(tagGroups).map(([name, value]) => ({ name, value }));
  }, [summary]);

  // Enstrüman Dağılımı - chart filter aktifse filtreli, değilse tüm pozisyonlar
  const instrumentChartData = useMemo(() => {
    if (!summary?.positions) return [];

    let positions = summary.positions;
    if (chartFilter) {
      if (chartFilter.type === 'primary_tag') {
        positions = positions.filter(p => p.primary_tag === chartFilter.value);
      } else if (chartFilter.type === 'secondary_tag') {
        positions = positions.filter(p => {
          const tags = p.secondary_tags ? p.secondary_tags.split(',').map(t => t.trim()) : [];
          return tags.includes(chartFilter.value);
        });
      }
    }

    return positions
      .filter(p => (p.market_value_try || 0) > 0)
      .map(p => ({ name: p.symbol, value: p.market_value_try }))
      .sort((a, b) => b.value - a.value);
  }, [summary, chartFilter]);

  // Asset Type Chart Data (memoized) - Use chartFilteredTransactions to match stats
  const assetTypeChartData = useMemo(() => {
    if (isStale || !chartFilteredTransactions || chartFilteredTransactions.length === 0) return [];
    
    const assetGroups = {};
    for (const tx of chartFilteredTransactions) {
      const inst = instrumentMap.get(tx.instrument_id);
      if (!inst) continue;
      const assetType = inst.asset_type || t('portfolio.unknownAssetType');
      if (!assetGroups[assetType]) assetGroups[assetType] = 0;
      const txCurrency = tx.currency?.toUpperCase() || 'TRY';
      const fxRate = txCurrency === 'USD' ? (fxRates.USDTRY || 1) : txCurrency === 'EUR' ? (fxRates.EURTRY || 1) : 1;
      assetGroups[assetType] += ((tx.quantity || 0) * (tx.price || 0) + (tx.fees || 0)) * fxRate;
    }
    return Object.entries(assetGroups).map(([name, value]) => ({ name, value }));
  }, [chartFilteredTransactions, instrumentMap, fxRates, isStale, t]);

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bnc-card p-4">
            <span className="text-xs text-bnc-textTer">{t('portfolio.totalValue')}</span>
            <p className="text-xl font-bold text-bnc-textPri mt-1">{formatCurrency(displayMarketValue)}</p>
          </div>
          <div className="bnc-card p-4">
            <span className="text-xs text-bnc-textTer">{t('portfolio.totalInvestment')}</span>
            <p className="text-xl font-bold text-bnc-textPri mt-1">{formatCurrency(displayInvested)}</p>
          </div>
          <div className={`bnc-card p-4 ${displayPL >= 0 ? 'border-bnc-green/30' : 'border-bnc-red/30'}`}>
            <span className="text-xs text-bnc-textTer">{t('portfolio.profitLoss')}</span>
            <p className={`text-xl font-bold mt-1 ${displayPL >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>{formatCurrency(displayPL)}</p>
            <span className={`text-xs font-semibold ${displayPL >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
              {displayPL >= 0 ? '+' : ''}{displayPLPct.toFixed(2)}%
            </span>
          </div>
          <div className="bnc-card p-4">
            <span className="text-xs text-bnc-textTer">{t('portfolio.totalBuys')}</span>
            <p className="text-xl font-bold text-bnc-textPri mt-1">{sortedTransactions?.length || 0}</p>
            <span className="text-xs text-bnc-textTer">{t('portfolio.transactionsSuffix')}</span>
          </div>
        </div>

        {/* Charts Dashboard */}
        {isStale ? (
          <div className="bnc-card p-8 mb-5 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bnc-accent mx-auto mb-3"></div>
            <p className="text-bnc-textTer text-sm">{t('portfolio.dataUpdating')}</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bnc-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-bnc-textPri">{t('portfolio.primaryTagDist')}</h2>
              {chartFilter?.type === 'primary_tag' && (
                <button onClick={() => setChartFilter(null)} className="text-xs text-bnc-accent hover:underline">{t('portfolio.clearFilter')}</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {primaryTagChartData.map((entry, index) => (
                <button key={entry.name}
                  onClick={() => chartFilter?.type === 'primary_tag' && chartFilter.value === entry.name ? setChartFilter(null) : setChartFilter({ type: 'primary_tag', value: entry.name })}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    chartFilter?.type === 'primary_tag' && chartFilter.value === entry.name
                      ? 'bg-bnc-accent text-bnc-bg' : 'bg-bnc-surfaceAlt text-bnc-textSec hover:bg-bnc-border'
                  }`}
                  style={{ borderLeft: `3px solid ${COLORS[index % COLORS.length]}` }}>
                  {entry.name} ({formatCurrency(entry.value)})
                </button>
              ))}
            </div>
            
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={primaryTagChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  onClick={(data) => {
                    if (data && data.name) {
                      if (chartFilter?.type === 'primary_tag' && chartFilter.value === data.name) {
                        setChartFilter(null);
                      } else {
                        setChartFilter({ type: 'primary_tag', value: data.name });
                      }
                    }
                  }}
                >
                  {primaryTagChartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={COLORS[index % COLORS.length]}
                      opacity={chartFilter?.type === 'primary_tag' && chartFilter.value !== entry.name ? 0.3 : 1}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1E2329', border: '1px solid #2B3139', borderRadius: '8px', color: '#EAECEF' }} formatter={(value) => formatCurrency(value)} />
                <Legend wrapperStyle={{ color: '#B7BDC6', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bnc-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-bnc-textPri">{t('portfolio.secondaryTagDist')}</h2>
              {chartFilter?.type === 'secondary_tag' && (
                <button onClick={() => setChartFilter(null)} className="text-xs text-bnc-accent hover:underline">{t('portfolio.clearFilter')}</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {secondaryTagChartData.length === 0 ? (
                <span className="text-xs text-bnc-textTer">{t('portfolio.noSecondaryTags')}</span>
              ) : (
                secondaryTagChartData.map(({ name, value }, index) => (
                  <button key={name}
                    onClick={() => chartFilter?.type === 'secondary_tag' && chartFilter.value === name ? setChartFilter(null) : setChartFilter({ type: 'secondary_tag', value: name })}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                      chartFilter?.type === 'secondary_tag' && chartFilter.value === name
                        ? 'bg-bnc-accent text-bnc-bg' : 'bg-bnc-surfaceAlt text-bnc-textSec hover:bg-bnc-border'
                    }`}
                    style={{ borderLeft: `3px solid ${COLORS[index % COLORS.length]}` }}>
                    {name} ({formatCurrency(value)})
                  </button>
                ))
              )}
            </div>
            
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={secondaryTagChartData.length > 0 ? secondaryTagChartData : emptySecondaryPie}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  onClick={(data) => {
                    if (data && data.name && data.name !== emptySecondaryPie[0].name) {
                      if (chartFilter?.type === 'secondary_tag' && chartFilter.value === data.name) {
                        setChartFilter(null);
                      } else {
                        setChartFilter({ type: 'secondary_tag', value: data.name });
                      }
                    }
                  }}
                >
                  {(secondaryTagChartData.length > 0 ? secondaryTagChartData : emptySecondaryPie).map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={COLORS[index % COLORS.length]}
                      opacity={chartFilter?.type === 'secondary_tag' && chartFilter.value !== entry.name ? 0.3 : 1}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1E2329', border: '1px solid #2B3139', borderRadius: '8px', color: '#EAECEF' }} formatter={(value) => formatCurrency(value)} />
                <Legend wrapperStyle={{ color: '#B7BDC6', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bnc-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-bnc-textPri">
                {t('portfolio.instrumentDist')}
                {chartFilter && (
                  <span className="text-bnc-accent font-normal ml-1.5">({chartFilter.value})</span>
                )}
              </h2>
            </div>
            
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={instrumentChartData.length > 0 ? instrumentChartData : emptyInstrumentPie}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => percent > 0.03 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {(instrumentChartData.length > 0 ? instrumentChartData : emptyInstrumentPie).map((entry, index) => (
                    <Cell key={`cell-inst-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1E2329', border: '1px solid #2B3139', borderRadius: '8px', color: '#EAECEF' }} formatter={(value) => formatCurrency(value)} />
                <Legend wrapperStyle={{ color: '#B7BDC6', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        )}

        {/* Search & Sort */}
        <div className="bnc-card p-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-bnc-textTer" />
            <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('portfolio.searchPlaceholder')}
              className="bnc-input w-full text-sm py-2.5 pl-9 pr-9" />
            {searchInput && !isStale && (
              <button onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-bnc-textTer hover:text-bnc-textSec transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {isStale && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-bnc-accent"></div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1 flex-wrap">
              {sortOptions.map(opt => {
                const active = sortBy.field === opt.field && sortBy.order === opt.order;
                return (
                  <button key={`${opt.field}-${opt.order}`}
                    onClick={() => setSortBy({ field: opt.field, order: opt.order })}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                      active
                        ? 'bg-bnc-accent text-bnc-bg'
                        : 'bg-bnc-surfaceAlt text-bnc-textTer hover:bg-bnc-border hover:text-bnc-textSec'
                    }`}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-bnc-textTer whitespace-nowrap">
              <span className="font-medium text-bnc-textSec">{sortedTransactions?.length || 0}</span> {t('portfolio.positionsSuffix')}
            </span>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bnc-card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bnc-accent mx-auto"></div>
              <p className="mt-3 text-bnc-textTer text-sm">{t('common.loading')}</p>
            </div>
          ) : (sortedTransactions?.length || 0) === 0 ? (
            <div className="p-8 text-center">
              {transactions.length === 0 ? (
                <>
                  <p className="text-bnc-textTer">{t('portfolio.emptyNoBuys')}</p>
                  <button onClick={() => setShowForm(true)} className="mt-3 bnc-btn-primary">{t('portfolio.emptyAddFirst')}</button>
                </>
              ) : (
                <>
                  <p className="text-bnc-textTer">{t('portfolio.emptyNoMatch')}</p>
                  <button onClick={() => { setSearchInput(''); setFilter(f => ({ ...f, search: '' })); }}
                    className="mt-3 bnc-btn-primary">{t('portfolio.emptyClearSearch')}</button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                <thead>
                  <tr className="bg-bnc-surfaceAlt/50">
                    {[
                      { label: t('portfolio.table.date'), field: 'timestamp', align: 'left' },
                      { label: t('portfolio.table.asset'), field: null, align: 'left' },
                      { label: t('portfolio.table.quantity'), field: 'quantity', align: 'right' },
                      { label: t('portfolio.table.buyPrice'), field: null, align: 'right' },
                      { label: t('portfolio.table.currentPrice'), field: null, align: 'right' },
                      { label: t('portfolio.table.pl'), field: 'pl', align: 'right' },
                      { label: t('portfolio.table.currentValue'), field: 'value', align: 'right' },
                      { label: t('portfolio.table.primary'), field: null, align: 'left' },
                      { label: t('portfolio.table.secondary'), field: null, align: 'left' },
                      { label: t('portfolio.table.actions'), field: null, align: 'center' },
                    ].map(col => {
                      const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' }[col.align] || 'text-left';
                      return (
                      <th key={col.label}
                        className={`px-4 py-2.5 ${alignClass} text-[11px] font-medium text-bnc-textTer uppercase tracking-wider ${col.field ? 'cursor-pointer hover:bg-bnc-surfaceAlt transition-colors' : ''}`}
                        onClick={col.field ? () => setSortBy({ field: col.field, order: sortBy.field === col.field && sortBy.order === 'desc' ? 'asc' : 'desc' }) : undefined}>
                        {col.label} {col.field && sortBy.field === col.field && (sortBy.order === 'desc' ? '▼' : '▲')}
                      </th>
                    );})}
                  </tr>
                </thead>
                <tbody className="divide-y divide-bnc-border">
                  {(sortedTransactions || []).map((tx) => {
                    const priceInfo = (prices || {})[tx.instrument_id];
                    const txCurrency = tx.currency?.toUpperCase() || 'TRY';
                    const fxRate = txCurrency === 'USD' ? (fxRates.USDTRY || 1) : txCurrency === 'EUR' ? (fxRates.EURTRY || 1) : 1;
                    const buyPriceTRY = (tx.price || 0) * fxRate;
                    const totalCostTRY = ((tx.quantity || 0) * (tx.price || 0) + (tx.fees || 0)) * fxRate;
                    const currentPriceTRY = priceInfo?.current_price_try;
                    const currentValueTRY = currentPriceTRY ? currentPriceTRY * (tx.quantity || 0) : null;
                    const plPercentage = currentPriceTRY ? ((currentPriceTRY - buyPriceTRY) / buyPriceTRY * 100) : null;
                    const unrealizedPL = currentPriceTRY ? (currentPriceTRY * (tx.quantity || 0)) - totalCostTRY : null;
                    const plColor = unrealizedPL >= 0 ? 'text-bnc-green' : 'text-bnc-red';
                    return (
                      <tr key={tx.id} className="hover:bg-bnc-surfaceAlt/40 transition-colors">
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs text-bnc-textSec">{formatDate(tx.timestamp)}</td>
                        <td className="px-4 py-2.5 text-xs text-bnc-textPri font-medium">
                          {getInstrumentName(tx.instrument_id)}
                          {txCurrency !== 'TRY' && <span className="ml-1 text-bnc-textTer">({txCurrency})</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs font-medium text-bnc-textPri">{tx.quantity.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-bnc-textSec">
                          {formatCurrency(buyPriceTRY)}
                          {txCurrency !== 'TRY' && <div className="text-[10px] text-bnc-textTer">{tx.price.toFixed(2)} {txCurrency}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs text-bnc-textSec">
                          {currentPriceTRY ? <>
                            {formatCurrency(currentPriceTRY)}
                            {priceInfo?.current_price_original && priceInfo?.currency !== 'TRY' && <div className="text-[10px] text-bnc-textTer">{priceInfo.current_price_original.toFixed(2)} {priceInfo.currency}</div>}
                          </> : <span className="text-bnc-textTer">-</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {plPercentage !== null ? (
                            <div className={plColor}>
                              <div className="text-xs font-semibold">{formatCurrency(unrealizedPL)}</div>
                              <div className="text-[10px] font-medium">{plPercentage >= 0 ? '+' : ''}{plPercentage.toFixed(2)}%</div>
                            </div>
                          ) : <span className="text-bnc-textTer text-xs">-</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs font-semibold text-bnc-accent">
                          {currentValueTRY ? formatCurrency(currentValueTRY) : <span className="text-bnc-textTer">-</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {tx.primary_tag ? <span className="px-1.5 py-0.5 rounded bg-bnc-accent/15 text-bnc-accent text-[10px] font-medium">{tx.primary_tag}</span> : <span className="text-bnc-textTer">-</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {tx.secondary_tags ? (
                            <div className="flex flex-wrap gap-0.5">
                              {tx.secondary_tags.split(',').map(t=>t.trim()).filter(Boolean).map((t,i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded bg-[#8b5cf6]/15 text-[#8b5cf6] text-[10px] font-medium">{t}</span>
                              ))}
                            </div>
                          ) : <span className="text-bnc-textTer">-</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setAddingToTransaction(tx)} className="p-1 text-bnc-textTer hover:text-bnc-accent transition-colors" title={t('portfolio.action.addPosition')}><PlusCircle className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingTransaction(tx)} className="p-1 text-bnc-textTer hover:text-bnc-accent transition-colors" title={t('portfolio.action.edit')}><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setSellingTransaction(tx)} className="p-1 text-bnc-textTer hover:text-bnc-green transition-colors" title={t('portfolio.action.sell')}><DollarSign className="w-3.5 h-3.5" /></button>
                            <button onClick={async () => {
                              if(confirm(`${t('portfolio.confirm.delete')}\n${getInstrumentName(tx.instrument_id)}`)) {
                                try { await deleteTransaction(tx.id); loadData(); showSuccess(t('portfolio.toast.deleted')); }
                                catch(e) { showError(t('portfolio.toast.error', { detail: e.response?.data?.detail||e.message })); }
                              }
                            }} className="p-1 text-bnc-textTer hover:text-bnc-red transition-colors" title={t('portfolio.action.delete')}><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

              <div className="sm:hidden divide-y divide-bnc-border">
                {(sortedTransactions || []).map((tx) => {
                  const priceInfo = prices?.[tx.instrument_id];
                  const txCurrency = tx.currency?.toUpperCase() || 'TRY';
                  const fxRate = txCurrency === 'USD' ? (fxRates.USDTRY || 1) : txCurrency === 'EUR' ? (fxRates.EURTRY || 1) : 1;
                  const buyPriceTRY = (tx.price || 0) * fxRate;
                  const totalCostTRY = ((tx.quantity || 0) * (tx.price || 0) + (tx.fees || 0)) * fxRate;
                  const currentPriceTRY = priceInfo?.current_price_try;
                  const unrealizedPL = currentPriceTRY ? (currentPriceTRY * (tx.quantity || 0)) - totalCostTRY : null;
                  const plPercentage = currentPriceTRY ? ((currentPriceTRY - buyPriceTRY) / buyPriceTRY * 100) : null;
                  return (
                    <div key={tx.id} className="p-3 hover:bg-bnc-surfaceAlt/40">
                      <div className="flex justify-between items-start gap-2 mb-1.5">
                        <span className="font-medium text-bnc-textPri text-xs">{getInstrumentName(tx.instrument_id)}</span>
                        {plPercentage !== null && (
                          <span className={`text-xs font-semibold ${unrealizedPL >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
                            {formatCurrency(unrealizedPL)} ({plPercentage >= 0 ? '+':''}{plPercentage.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-bnc-textTer">
                        <span>{t('portfolio.mobile.quantity')} {tx.quantity?.toFixed(2)}</span>
                        <span>{t('portfolio.mobile.price')} {formatCurrency(buyPriceTRY)}</span>
                        {currentPriceTRY && <span>{t('portfolio.mobile.current')} {formatCurrency(currentPriceTRY)}</span>}
                      </div>
                      <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-bnc-border">
                        <button onClick={() => setAddingToTransaction(tx)} className="p-1.5 text-bnc-textTer hover:text-bnc-accent rounded" title={t('portfolio.action.addPosition')}><PlusCircle className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingTransaction(tx)} className="p-1.5 text-bnc-textTer hover:text-bnc-accent rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setSellingTransaction(tx)} className="p-1.5 text-bnc-textTer hover:text-bnc-green rounded"><DollarSign className="w-3.5 h-3.5" /></button>
                        <button onClick={async () => {
                          if(confirm(t('portfolio.confirm.delete'))) {
                            try { await deleteTransaction(tx.id); loadData(); showSuccess(t('portfolio.toast.deleted')); }
                            catch(e) { showError(t('portfolio.toast.error', { detail: String(e.response?.data?.detail || e.message) })); }
                          }
                        }} className="p-1.5 text-bnc-textTer hover:text-bnc-red rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Transaction Form Modal */}
      {showForm && (
        <TransactionForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            loadData();
            setShowForm(false);
          }}
        />
      )}

      {editingTransaction && (
        <TransactionForm
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSuccess={() => {
            loadData();
            setEditingTransaction(null);
          }}
        />
      )}

      {/* Sell Form Modal */}
      {sellingTransaction && (
        <SellForm
          transaction={sellingTransaction}
          instrument={instrumentMap.get(sellingTransaction.instrument_id)}
          currentPrice={prices[sellingTransaction.instrument_id]?.current_price_try || 0}
          accounts={accounts}
          onClose={() => setSellingTransaction(null)}
          onSuccess={() => {
            loadData();
            setSellingTransaction(null);
          }}
        />
      )}

      {/* Add Position Form Modal */}
      {addingToTransaction && (
        <AddPositionForm
          transaction={addingToTransaction}
          instrument={instrumentMap.get(addingToTransaction.instrument_id)}
          currentPrice={prices[addingToTransaction.instrument_id]?.current_price_try || 0}
          allTransactions={transactions}
          fxRates={fxRates}
          onClose={() => setAddingToTransaction(null)}
          onSuccess={() => {
            loadData();
            setAddingToTransaction(null);
          }}
        />
      )}
    </div>
  );
}

export default TransactionsPage;
