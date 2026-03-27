import { useState, useEffect, useMemo, useCallback, useTransition, useDeferredValue } from 'react';
import { Trash2, Filter, Edit2, RefreshCw, TrendingUp, TrendingDown, Camera, Download, DollarSign } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { getDebugTransactions, deleteTransaction, getInstruments, getAccounts, getFxRates, createPortfolioSnapshot, getPortfolioSummary } from '../services/api';
import TransactionForm from './TransactionForm';
import SellForm from './SellForm';

const COLORS = ['#F0B90B', '#0ECB81', '#F6465D', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

function TransactionsPage({ onRefreshPrices, refreshing }) {
  const { user } = useAuth();
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
  const [sortBy, setSortBy] = useState({ field: 'timestamp', order: 'desc' }); // 'timestamp', 'quantity', 'pl', 'value'
  const [instruments, setInstruments] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [prices, setPrices] = useState({});
  const [fxRates, setFxRates] = useState({ USDTRY: 1, EURTRY: 1 });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [summary, setSummary] = useState(null);
  const [chartFilter, setChartFilter] = useState(null); // { type: 'asset_type', value: 'Hisse' }
  const [sellingTransaction, setSellingTransaction] = useState(null); // For sell modal
  const [searchInput, setSearchInput] = useState(''); // Separate state for input
  const [isPending, startTransition] = useTransition(); // For non-blocking updates
  
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

  // Listen for price refresh from sidebar
  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener('portfolio-prices-refreshed', handler);
    return () => window.removeEventListener('portfolio-prices-refreshed', handler);
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
    return inst ? `${inst.symbol} - ${inst.name}` : `ID: ${id}`;
  }, [instrumentMap]);

  const formatCurrency = useCallback((value) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(value);
  }, []);

  const formatPercent = useCallback((value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  }, []);

  const formatDate = useCallback((dateString) => {
    return new Date(dateString).toLocaleString('tr-TR');
  }, []);

  const handleCreateSnapshot = useCallback(async () => {
    setCreatingSnapshot(true);
    try {
      const res = await createPortfolioSnapshot();
      showSuccess(`Snapshot oluşturuldu! ${res.data.total_positions} pozisyon kaydedildi`);
    } catch (err) {
      console.error('Error creating snapshot:', err);
      showError('Snapshot oluşturulamadı: ' + (err.response?.data?.detail || err.message));
    } finally {
      setCreatingSnapshot(false);
    }
  }, [formatCurrency, showSuccess, showError]);

  // Get unique primary tags from transactions (memoized)
  const uniqueTags = useMemo(() => 
    [...new Set((transactions || []).map(tx => tx.primary_tag).filter(Boolean))],
    [transactions]
  );

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
      
      // Search filter (expensive - do last)
      if (deferredFilter.search) {
        const inst = instrumentMap.get(tx.instrument_id);
        if (!inst) return false;
        const searchLower = deferredFilter.search.toLowerCase();
        const symbolMatch = inst.symbol?.toLowerCase().includes(searchLower);
        const nameMatch = inst.name?.toLowerCase().includes(searchLower);
        if (!symbolMatch && !nameMatch) return false;
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

  // CSV Export fonksiyonu (sortedTransactions tanımlandıktan sonra)
  const exportToCSV = useCallback(() => {
    // CSV başlıkları
    const headers = [
      'Tarih',
      'Enstrüman',
      'Adet',
      'Alış Fiyatı',
      'Para Birimi',
      'Güncel Fiyat (TRY)',
      'Güncel Değer (TRY)',
      'Toplam Maliyet (TRY)',
      'Kar/Zarar (TRY)',
      'Kar/Zarar (%)',
      'Birincil Tag',
      'İkincil Tag\'ler',
      'Hesap',
      'Broker',
      'Fiyat Güncelleme'
    ];

    // CSV satırları
    const rows = sortedTransactions.map(tx => {
      const inst = instrumentMap.get(tx.instrument_id);
      const account = accounts.find(a => a.id === tx.account_id);
      const priceInfo = prices?.[tx.instrument_id];
      
      const txCurrency = tx.currency?.toUpperCase() || 'TRY';
      const fxRate = txCurrency === 'USD' ? (fxRates.USDTRY || 1) : txCurrency === 'EUR' ? (fxRates.EURTRY || 1) : 1;
      const totalCostTRY = ((tx.quantity || 0) * (tx.price || 0) + (tx.fees || 0)) * fxRate;
      const marketValue = (priceInfo?.current_price_try || 0) * (tx.quantity || 0);
      const unrealizedPL = marketValue - totalCostTRY;
      const unrealizedPLPercentage = totalCostTRY > 0 ? (unrealizedPL / totalCostTRY * 100) : 0;

      return [
        formatDate(tx.timestamp),
        inst ? `${inst.symbol} - ${inst.name}` : `ID: ${tx.instrument_id}`,
        tx.quantity || 0,
        tx.price || 0,
        tx.currency || 'TRY',
        priceInfo?.current_price_try || 0,
        marketValue.toFixed(2),
        totalCostTRY.toFixed(2),
        unrealizedPL.toFixed(2),
        unrealizedPLPercentage.toFixed(2),
        tx.primary_tag || '',
        tx.secondary_tags || '',
        account?.name || '',
        account?.broker_name || '',
        priceInfo?.last_updated ? new Date(priceInfo.last_updated).toLocaleString('tr-TR') : ''
      ];
    });

    // CSV içeriğini oluştur
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Virgül veya tırnak içeren hücreleri tırnak içine al
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
    ].join('\n');

    // BOM ekle (Excel için Türkçe karakter desteği)
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // İndir
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `portfoy-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [sortedTransactions, instrumentMap, accounts, prices, fxRates, formatDate]);

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
    if (!chartFilter && summary) return summary.total_market_value_try || 0;
    return totalMarketValue;
  }, [chartFilter, summary, totalMarketValue]);

  const displayInvested = useMemo(() => {
    if (!chartFilter && summary) return summary.total_cost_basis_try || 0;
    return totalInvestedTRY;
  }, [chartFilter, summary, totalInvestedTRY]);

  const displayPL = useMemo(() => displayMarketValue - displayInvested, [displayMarketValue, displayInvested]);
  const displayPLPct = useMemo(() => displayInvested > 0 ? (displayPL / displayInvested * 100) : 0, [displayPL, displayInvested]);

  // Count active filters (memoized)
  const activeFilterCount = useMemo(() => Object.entries(filter).filter(([key, value]) => {
    if (key === 'instrument' || key === 'tag' || key === 'currency' || key === 'account' || key === 'plStatus') {
      return value !== 'all';
    }
    if (key === 'dateFrom' || key === 'dateTo' || key === 'search') {
      return value !== '';
    }
    return false;
  }).length, [filter]);

  // Primary Tag Chart Data (memoized) - Use chartFilteredTransactions to match stats
  const primaryTagChartData = useMemo(() => {
    if (isStale || !chartFilteredTransactions || chartFilteredTransactions.length === 0) return [];
    
    const tagGroups = {};
    for (const tx of chartFilteredTransactions) {
      const tag = tx.primary_tag || '🚫 Etiketsiz';
      if (!tagGroups[tag]) tagGroups[tag] = 0;
      const txCurrency = tx.currency?.toUpperCase() || 'TRY';
      const fxRate = txCurrency === 'USD' ? (fxRates.USDTRY || 1) : txCurrency === 'EUR' ? (fxRates.EURTRY || 1) : 1;
      tagGroups[tag] += ((tx.quantity || 0) * (tx.price || 0) + (tx.fees || 0)) * fxRate;
    }
    return Object.entries(tagGroups).map(([name, value]) => ({ name, value }));
  }, [chartFilteredTransactions, fxRates, isStale]);

  // Secondary Tag Chart Data (memoized) - Use chartFilteredTransactions to match stats
  const secondaryTagChartData = useMemo(() => {
    if (isStale || !chartFilteredTransactions || chartFilteredTransactions.length === 0) return [];
    
    const secondaryTagGroups = {};
    for (const tx of chartFilteredTransactions) {
      if (!tx.secondary_tags) continue;
      const tags = tx.secondary_tags.split(',').map(t => t.trim()).filter(Boolean);
      for (const tag of tags) {
        if (!secondaryTagGroups[tag]) secondaryTagGroups[tag] = 0;
        const txCurrency = tx.currency?.toUpperCase() || 'TRY';
        const fxRate = txCurrency === 'USD' ? (fxRates.USDTRY || 1) : txCurrency === 'EUR' ? (fxRates.EURTRY || 1) : 1;
        secondaryTagGroups[tag] += ((tx.quantity || 0) * (tx.price || 0) + (tx.fees || 0)) * fxRate;
      }
    }
    return Object.entries(secondaryTagGroups).map(([name, value]) => ({ name, value }));
  }, [chartFilteredTransactions, fxRates, isStale]);

  // Asset Type Chart Data (memoized) - Use chartFilteredTransactions to match stats
  const assetTypeChartData = useMemo(() => {
    if (isStale || !chartFilteredTransactions || chartFilteredTransactions.length === 0) return [];
    
    const assetGroups = {};
    for (const tx of chartFilteredTransactions) {
      const inst = instrumentMap.get(tx.instrument_id);
      if (!inst) continue;
      const assetType = inst.asset_type || '🚫 Bilinmiyor';
      if (!assetGroups[assetType]) assetGroups[assetType] = 0;
      const txCurrency = tx.currency?.toUpperCase() || 'TRY';
      const fxRate = txCurrency === 'USD' ? (fxRates.USDTRY || 1) : txCurrency === 'EUR' ? (fxRates.EURTRY || 1) : 1;
      assetGroups[assetType] += ((tx.quantity || 0) * (tx.price || 0) + (tx.fees || 0)) * fxRate;
    }
    return Object.entries(assetGroups).map(([name, value]) => ({ name, value }));
  }, [chartFilteredTransactions, instrumentMap, fxRates, isStale]);

  return (
    <div className="min-h-screen">
      {/* Header & Action Bar */}
      <div className="bnc-card mb-5">
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-bnc-textPri">Portföy</h2>
          <div className="flex gap-2 flex-wrap items-center">
            <button onClick={() => setShowForm(true)}
              className="bnc-btn-primary flex items-center gap-1.5 text-xs" title="Yeni Alım">
              <span>+</span> Yeni Alım
            </button>
            {onRefreshPrices && (
              <button onClick={() => onRefreshPrices(loadData)} disabled={refreshing}
                className="bnc-btn-secondary flex items-center gap-1.5 text-xs disabled:opacity-50" title="Güncelle">
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Güncelle
              </button>
            )}
            <button onClick={handleCreateSnapshot} disabled={creatingSnapshot}
              className="bnc-btn-secondary flex items-center gap-1.5 text-xs disabled:opacity-50" title="Snapshot Al">
              <Camera className="w-3.5 h-3.5" /> {creatingSnapshot ? '...' : 'Snapshot'}
            </button>
            <button onClick={exportToCSV}
              className="bnc-btn-secondary flex items-center gap-1.5 text-xs" title="CSV indir">
              <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bnc-card p-4">
            <span className="text-xs text-bnc-textTer">Toplam Değer</span>
            <p className="text-xl font-bold text-bnc-textPri mt-1">{formatCurrency(displayMarketValue)}</p>
          </div>
          <div className="bnc-card p-4">
            <span className="text-xs text-bnc-textTer">Toplam Yatırım</span>
            <p className="text-xl font-bold text-bnc-textPri mt-1">{formatCurrency(displayInvested)}</p>
          </div>
          <div className={`bnc-card p-4 ${displayPL >= 0 ? 'border-bnc-green/30' : 'border-bnc-red/30'}`}>
            <span className="text-xs text-bnc-textTer">Kar/Zarar</span>
            <p className={`text-xl font-bold mt-1 ${displayPL >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>{formatCurrency(displayPL)}</p>
            <span className={`text-xs font-semibold ${displayPL >= 0 ? 'text-bnc-green' : 'text-bnc-red'}`}>
              {displayPL >= 0 ? '+' : ''}{displayPLPct.toFixed(2)}%
            </span>
          </div>
          <div className="bnc-card p-4">
            <span className="text-xs text-bnc-textTer">Toplam Alım</span>
            <p className="text-xl font-bold text-bnc-textPri mt-1">{sortedTransactions?.length || 0}</p>
            <span className="text-xs text-bnc-textTer">işlem</span>
          </div>
        </div>

        {/* Charts Dashboard */}
        {isStale ? (
          <div className="bnc-card p-8 mb-5 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bnc-accent mx-auto mb-3"></div>
            <p className="text-bnc-textTer text-sm">Veriler güncelleniyor...</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bnc-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-bnc-textPri">Birincil Tag Dağılımı</h2>
              {chartFilter?.type === 'primary_tag' && (
                <button onClick={() => setChartFilter(null)} className="text-xs text-bnc-accent hover:underline">Temizle ✕</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {(() => {
                const tagGroups = {};
                (chartFilteredTransactions || []).forEach(tx => {
                  const tag = tx.primary_tag || 'Etiketsiz';
                  if (!tagGroups[tag]) tagGroups[tag] = 0;
                  const txCurrency = tx.currency?.toUpperCase() || 'TRY';
                  const fxRate = txCurrency === 'USD' ? (fxRates.USDTRY || 1) : txCurrency === 'EUR' ? (fxRates.EURTRY || 1) : 1;
                  tagGroups[tag] += ((tx.quantity || 0) * (tx.price || 0) + (tx.fees || 0)) * fxRate;
                });
                return Object.entries(tagGroups).map(([name, value], index) => (
                  <button key={name}
                    onClick={() => chartFilter?.type === 'primary_tag' && chartFilter.value === name ? setChartFilter(null) : setChartFilter({ type: 'primary_tag', value: name })}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                      chartFilter?.type === 'primary_tag' && chartFilter.value === name
                        ? 'bg-bnc-accent text-bnc-bg' : 'bg-bnc-surfaceAlt text-bnc-textSec hover:bg-bnc-border'
                    }`}
                    style={{ borderLeft: `3px solid ${COLORS[index % COLORS.length]}` }}>
                    {name} ({formatCurrency(value)})
                  </button>
                ));
              })()}
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
              <h2 className="text-sm font-semibold text-bnc-textPri">İkincil Tag Dağılımı</h2>
              {chartFilter?.type === 'secondary_tag' && (
                <button onClick={() => setChartFilter(null)} className="text-xs text-bnc-accent hover:underline">Temizle ✕</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {secondaryTagChartData.length === 0 ? (
                <span className="text-xs text-bnc-textTer">İkincil tag yok</span>
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
                  data={secondaryTagChartData.length > 0 ? secondaryTagChartData : [{ name: '🚫 İkincil Tag Yok', value: 1 }]}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  onClick={(data) => {
                    if (data && data.name && data.name !== '🚫 İkincil Tag Yok') {
                      if (chartFilter?.type === 'secondary_tag' && chartFilter.value === data.name) {
                        setChartFilter(null);
                      } else {
                        setChartFilter({ type: 'secondary_tag', value: data.name });
                      }
                    }
                  }}
                >
                  {(secondaryTagChartData.length > 0 ? secondaryTagChartData : [{ name: '🚫 İkincil Tag Yok', value: 1 }]).map((entry, index) => (
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
        </div>
        )}

        {/* Filters */}
        <div className="bnc-card overflow-hidden">
          <div className="p-3 border-b border-bnc-border">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-bnc-textTer" />
                <span className="text-xs font-medium text-bnc-textSec">Filtreler</span>
                {activeFilterCount > 0 && (
                  <span className="bg-bnc-accent/15 text-bnc-accent text-[10px] font-semibold px-1.5 py-0.5 rounded">{activeFilterCount}</span>
                )}
              </div>
              <div className="flex-1 min-w-[180px] relative">
                <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Varlık ara..." className="bnc-input w-full text-xs py-2" />
                {isStale && (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-bnc-accent"></div>
                  </div>
                )}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <select value={filter.instrument} onChange={(e) => startTransition(() => setFilter({ ...filter, instrument: e.target.value }))} className="bnc-input text-xs py-2">
                  <option value="all">Tüm Varlıklar</option>
                  {instruments.map(inst => <option key={inst.id} value={inst.id}>{inst.symbol}</option>)}
                </select>
                <select value={filter.plStatus} onChange={(e) => startTransition(() => setFilter({ ...filter, plStatus: e.target.value }))} className="bnc-input text-xs py-2">
                  <option value="all">Tüm Durumlar</option>
                  <option value="profit">Karlı</option>
                  <option value="loss">Zararlı</option>
                  <option value="breakeven">Başabaş</option>
                  <option value="no-price">Fiyat Yok</option>
                </select>
                <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`px-2.5 py-2 rounded-lg text-xs font-medium ${showAdvancedFilters ? 'bg-bnc-accent/15 text-bnc-accent' : 'bg-bnc-surfaceAlt text-bnc-textSec hover:bg-bnc-border'}`}>
                  {showAdvancedFilters ? '▲ Gelişmiş' : '▼ Gelişmiş'}
                </button>
                {activeFilterCount > 0 && (
                  <button onClick={() => { setSearchInput(''); setFilter({ instrument: 'all', tag: 'all', currency: 'all', account: 'all', dateFrom: '', dateTo: '', plStatus: 'all', search: '' }); }}
                    className="px-2.5 py-2 bg-bnc-red/15 text-bnc-red rounded-lg text-xs font-medium hover:bg-bnc-red/25">✕ Temizle</button>
                )}
              </div>
            </div>
          </div>

          {showAdvancedFilters && (
            <div className="p-3 bg-bnc-surfaceAlt/50 border-b border-bnc-border">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-bnc-textTer mb-1">Hesap</label>
                  <select value={filter.account} onChange={(e) => setFilter({ ...filter, account: e.target.value })} className="bnc-input w-full text-xs py-2">
                    <option value="all">Tümü</option>
                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-bnc-textTer mb-1">Etiket</label>
                  <select value={filter.tag} onChange={(e) => setFilter({ ...filter, tag: e.target.value })} className="bnc-input w-full text-xs py-2">
                    <option value="all">Tümü</option>
                    <option value="no-tag">Etiketsiz</option>
                    {uniqueTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-bnc-textTer mb-1">Para Birimi</label>
                  <select value={filter.currency} onChange={(e) => setFilter({ ...filter, currency: e.target.value })} className="bnc-input w-full text-xs py-2">
                    <option value="all">Tümü</option>
                    <option value="TRY">TRY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-bnc-textTer mb-1">Sıralama</label>
                  <select value={`${sortBy.field}-${sortBy.order}`} onChange={(e) => { const [f,o] = e.target.value.split('-'); setSortBy({field:f,order:o}); }} className="bnc-input w-full text-xs py-2">
                    <option value="timestamp-desc">En Yeni</option>
                    <option value="timestamp-asc">En Eski</option>
                    <option value="value-desc">Değer ↓</option>
                    <option value="value-asc">Değer ↑</option>
                    <option value="pl-desc">K/Z ↓</option>
                    <option value="pl-asc">K/Z ↑</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-bnc-textTer mb-1">Başlangıç</label>
                  <input type="date" value={filter.dateFrom} onChange={(e) => setFilter({...filter, dateFrom: e.target.value})} className="bnc-input w-full text-xs py-2" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-bnc-textTer mb-1">Bitiş</label>
                  <input type="date" value={filter.dateTo} onChange={(e) => setFilter({...filter, dateTo: e.target.value})} className="bnc-input w-full text-xs py-2" />
                </div>
              </div>
            </div>
          )}

          {!showAdvancedFilters && (
            <div className="px-3 py-2 border-t border-bnc-border">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-medium text-bnc-textTer mr-1">Hızlı:</span>
                {[
                  { label: 'Karlı', key: 'plStatus', val: 'profit', clr: 'bnc-green' },
                  { label: 'Zararlı', key: 'plStatus', val: 'loss', clr: 'bnc-red' },
                  { label: 'USD', key: 'currency', val: 'USD', clr: 'bnc-accent' },
                  { label: 'TRY', key: 'currency', val: 'TRY', clr: 'bnc-accent' },
                ].map(c => (
                  <button key={c.label} onClick={() => setFilter({...filter, [c.key]: c.val})}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                      filter[c.key] === c.val ? `bg-${c.clr}/15 text-${c.clr}` : 'bg-bnc-surfaceAlt text-bnc-textTer hover:bg-bnc-border'
                    }`}>{c.label}</button>
                ))}
                {uniqueTags.slice(0, 3).map(tag => (
                  <button key={tag} onClick={() => setFilter({...filter, tag})}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${filter.tag === tag ? 'bg-bnc-accent/15 text-bnc-accent' : 'bg-bnc-surfaceAlt text-bnc-textTer hover:bg-bnc-border'}`}>{tag}</button>
                ))}
                {accounts.filter(a => ['MİDAS','OSMANLI','Fiziki'].includes(a.name)).map(acc => (
                  <button key={acc.id} onClick={() => setFilter({...filter, account: acc.id.toString()})}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${filter.account === acc.id.toString() ? 'bg-bnc-accent/15 text-bnc-accent' : 'bg-bnc-surfaceAlt text-bnc-textTer hover:bg-bnc-border'}`}>{acc.name}</button>
                ))}
              </div>
            </div>
          )}

          <div className="px-3 py-1.5 bg-bnc-surfaceAlt/50 text-xs text-bnc-textTer">
            <span className="font-medium text-bnc-textSec">{sortedTransactions?.length || 0}</span> işlem gösteriliyor
            {activeFilterCount > 0 && <span className="ml-1.5">(toplam {transactions.length})</span>}
            {isStale && <span className="ml-1.5">(filtreleniyor...)</span>}
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bnc-card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bnc-accent mx-auto"></div>
              <p className="mt-3 text-bnc-textTer text-sm">Yükleniyor...</p>
            </div>
          ) : (sortedTransactions?.length || 0) === 0 ? (
            <div className="p-8 text-center">
              {transactions.length === 0 ? (
                <>
                  <p className="text-bnc-textTer">Henüz alım kaydı yok</p>
                  <button onClick={() => setShowForm(true)} className="mt-3 bnc-btn-primary">İlk Alımı Ekle</button>
                </>
              ) : (
                <>
                  <p className="text-bnc-textTer">Filtrelere uygun işlem bulunamadı</p>
                  <button onClick={() => { setSearchInput(''); setFilter({ instrument:'all', tag:'all', currency:'all', account:'all', dateFrom:'', dateTo:'', plStatus:'all', search:'' }); }}
                    className="mt-3 bnc-btn-primary">Filtreleri Temizle</button>
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
                      { label: 'Tarih', field: 'timestamp', align: 'left' },
                      { label: 'Varlık', field: null, align: 'left' },
                      { label: 'Adet', field: 'quantity', align: 'right' },
                      { label: 'Alış Fiyatı', field: null, align: 'right' },
                      { label: 'Güncel Fiyat', field: null, align: 'right' },
                      { label: 'K/Z', field: 'pl', align: 'right' },
                      { label: 'Güncel Değer', field: 'value', align: 'right' },
                      { label: 'Birincil', field: null, align: 'left' },
                      { label: 'İkincil', field: null, align: 'left' },
                      { label: 'İşlem', field: null, align: 'center' },
                    ].map(col => (
                      <th key={col.label}
                        className={`px-4 py-2.5 text-${col.align} text-[11px] font-medium text-bnc-textTer uppercase tracking-wider ${col.field ? 'cursor-pointer hover:bg-bnc-surfaceAlt transition-colors' : ''}`}
                        onClick={col.field ? () => setSortBy({ field: col.field, order: sortBy.field === col.field && sortBy.order === 'desc' ? 'asc' : 'desc' }) : undefined}>
                        {col.label} {col.field && sortBy.field === col.field && (sortBy.order === 'desc' ? '▼' : '▲')}
                      </th>
                    ))}
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
                            <button onClick={() => setEditingTransaction(tx)} className="p-1 text-bnc-textTer hover:text-bnc-accent transition-colors" title="Düzenle"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setSellingTransaction(tx)} className="p-1 text-bnc-textTer hover:text-bnc-green transition-colors" title="Sat"><DollarSign className="w-3.5 h-3.5" /></button>
                            <button onClick={async () => {
                              if(confirm(`Silmek istediğinizden emin misiniz?\n${getInstrumentName(tx.instrument_id)}`)) {
                                try { await deleteTransaction(tx.id); loadData(); showSuccess('Silindi'); }
                                catch(e) { showError('Hata: '+(e.response?.data?.detail||e.message)); }
                              }
                            }} className="p-1 text-bnc-textTer hover:text-bnc-red transition-colors" title="Sil"><Trash2 className="w-3.5 h-3.5" /></button>
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
                        <span>Adet: {tx.quantity?.toFixed(2)}</span>
                        <span>Fiyat: {formatCurrency(buyPriceTRY)}</span>
                        {currentPriceTRY && <span>Güncel: {formatCurrency(currentPriceTRY)}</span>}
                      </div>
                      <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-bnc-border">
                        <button onClick={() => setEditingTransaction(tx)} className="p-1.5 text-bnc-textTer hover:text-bnc-accent rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setSellingTransaction(tx)} className="p-1.5 text-bnc-textTer hover:text-bnc-green rounded"><DollarSign className="w-3.5 h-3.5" /></button>
                        <button onClick={async () => {
                          if(confirm(`Silmek istediğinizden emin misiniz?`)) {
                            try { await deleteTransaction(tx.id); loadData(); showSuccess('Silindi'); }
                            catch(e) { showError('Hata: '+(e.response?.data?.detail||e.message)); }
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
          onClose={() => setSellingTransaction(null)}
          onSuccess={() => {
            loadData();
            setSellingTransaction(null);
          }}
        />
      )}
    </div>
  );
}

export default TransactionsPage;
