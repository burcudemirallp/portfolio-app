import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Radar, Play, RefreshCw, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp,
  Zap, AlertTriangle, Eye, Info, X, Shield, Target,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie,
} from 'recharts';
import {
  getFundTrackerStatus, getFundTrackerScores, getFundTrackerSignals,
  getFundTrackerPortfolio, getFundTrackerChanges, getFundTrackerFunds,
  getFundTrackerPriceHistory, runFundTrackerPipeline,
  refreshFundTrackerPrices, refreshFundTrackerSignals,
} from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from './Toast';

// ── Helpers ────────────────────────────────────────────────

function parseFullDetails(details) {
  if (!details) return {};
  const result = {};

  const comp = details.match(/Fon:(\d+)\s+Teknik:(\d+)\s+Likidite:(\d+)/);
  if (comp) {
    result.fund = parseInt(comp[1]);
    result.tech = parseInt(comp[2]);
    result.liquidity = parseInt(comp[3]);
  }

  const action = details.match(/Aksiyon:([A-ZÇĞİÖŞÜ_]+)/);
  if (action) result.action = action[1];

  const stop = details.match(/Stop:([\d.]+)\(-%([\d.]+)\)/);
  if (stop) {
    result.stopLevel = parseFloat(stop[1]);
    result.stopPct = parseFloat(stop[2]);
  }

  const entry = details.match(/Giriş:(KIRILIM|RETEST)/);
  if (entry) result.entryModel = entry[1];

  return result;
}

function getScoreLabel(score, t) {
  if (score >= 85) return { label: t('fundTracker.score.strongSignal'), color: 'text-emerald-400' };
  if (score >= 75) return { label: t('fundTracker.score.buyRadar'), color: 'text-emerald-400' };
  if (score >= 60) return { label: t('fundTracker.score.watchlist'), color: 'text-yellow-400' };
  if (score >= 40) return { label: t('fundTracker.score.neutral'), color: 'text-orange-400' };
  return { label: t('fundTracker.score.caution'), color: 'text-red-500' };
}

function getScoreColor(score) {
  if (score >= 75) return '#0ECB81';
  if (score >= 60) return '#FFCA28';
  if (score >= 40) return '#FF9800';
  return '#F6465D';
}

const ACTION_STYLES = {
  'YENİ_GİRİŞ': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', icon: ArrowUpRight },
  'ARTIŞ':      { bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/20', icon: TrendingUp },
  'TUTMA':      { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20', icon: null },
  'AZALIŞ':     { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/20', icon: TrendingDown },
  'ÇIKIŞ':      { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', icon: ArrowDownRight },
};

function getSignalSentiment(signalType) {
  const negative = ['FON_ÇIKIŞ', 'FON_AZALIŞ', 'RSI_AŞIRI_ALIM', 'MACD_AŞAĞI', 'ÖLÜM_KESİŞİMİ'];
  return negative.includes(signalType) ? 'negative' : 'positive';
}

const PIE_COLORS = [
  '#F0B90B', '#0ECB81', '#F6465D', '#1E88E5', '#AB47BC',
  '#FF7043', '#26A69A', '#FFCA28', '#78909C', '#EF5350',
  '#66BB6A', '#42A5F5', '#FFA726', '#8D6E63', '#EC407A',
];

// ── Sub-components ─────────────────────────────────────────

function ScoreRing({ score, size = 44 }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.round(score) / 100) * circ;
  const color = getScoreColor(score);
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2B3139" strokeWidth={3} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        fill={color} fontSize={size < 40 ? 10 : 13} fontWeight="bold">
        {Math.round(score)}
      </text>
    </svg>
  );
}

function ComponentBar({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-bnc-textTer w-7 text-right shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-bnc-surfaceAlt rounded-full overflow-hidden min-w-[60px]">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-semibold w-6 text-right" style={{ color }}>{value}</span>
    </div>
  );
}

function ActionBadge({ action, t, size = 'sm' }) {
  const style = ACTION_STYLES[action] || ACTION_STYLES['TUTMA'];
  const Icon = style.icon;
  const label = t(`fundTracker.action.${action}`) || action;
  const sizeClass = size === 'lg'
    ? 'px-2.5 py-1 text-xs'
    : 'px-1.5 py-0.5 text-[10px]';

  return (
    <span className={`inline-flex items-center gap-1 rounded-md font-semibold border ${style.bg} ${style.text} ${style.border} ${sizeClass}`}>
      {Icon && <Icon className={size === 'lg' ? 'w-3.5 h-3.5' : 'w-3 h-3'} />}
      {label}
    </span>
  );
}

function FundMoveCard({ change, score, t, onClick }) {
  const style = ACTION_STYLES[change.change_type] || ACTION_STYLES['TUTMA'];
  const isPositive = ['YENİ_GİRİŞ', 'ARTIŞ'].includes(change.change_type);
  const isNegative = ['ÇIKIŞ', 'AZALIŞ'].includes(change.change_type);

  let weightText = '';
  if (change.change_type === 'YENİ_GİRİŞ') {
    weightText = `%${(change.new_weight || 0).toFixed(2)}`;
  } else if (change.change_type === 'ÇIKIŞ') {
    weightText = `%${(change.old_weight || 0).toFixed(2)}`;
  } else {
    const oldW = change.old_weight || 0;
    const newW = change.new_weight || 0;
    weightText = `%${oldW.toFixed(1)} → %${newW.toFixed(1)}`;
  }

  const borderColor = isPositive ? 'border-l-emerald-500/60' : isNegative ? 'border-l-red-500/60' : 'border-l-bnc-border';

  return (
    <div onClick={() => onClick(change.ticker)}
      className={`bnc-card p-3 border-l-[3px] ${borderColor} hover:bg-bnc-surfaceAlt/40 cursor-pointer transition-all`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-bold text-sm text-bnc-textPri">{change.ticker}</span>
        {score != null && <ScoreRing score={score} size={32} />}
      </div>
      <ActionBadge action={change.change_type} t={t} />
      <p className="text-[11px] text-bnc-textTer mt-1.5">{weightText}</p>
    </div>
  );
}

function StockRow({ item, parsed, change, t, onClick, rank }) {
  const { label: scoreLabel, color: scoreColor } = getScoreLabel(item.score, t);
  const action = parsed.action || change?.change_type || 'TUTMA';
  const fundWeight = change?.new_weight || change?.old_weight;

  return (
    <div onClick={() => onClick(item.ticker)}
      className="flex items-start gap-3 px-4 py-3 hover:bg-bnc-surfaceAlt/40 cursor-pointer transition-colors border-b border-bnc-border/40 last:border-0">

      {/* Score ring */}
      <div className="shrink-0 flex flex-col items-center">
        <ScoreRing score={item.score} size={44} />
        <span className={`text-[9px] font-semibold mt-0.5 ${scoreColor}`}>{scoreLabel}</span>
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Ticker + Action + Entry Model */}
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span className="font-bold text-sm text-bnc-textPri">{item.ticker}</span>
          <ActionBadge action={action} t={t} />
          {parsed.entryModel && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-bnc-accent/20 text-bnc-accent rounded border border-bnc-accent/30">
              {t(`fundTracker.entry.${parsed.entryModel}`) || parsed.entryModel}
            </span>
          )}
        </div>

        {/* Row 2: Component bars */}
        <div className="grid grid-cols-3 gap-x-3 gap-y-0.5">
          <ComponentBar label={t('fundTracker.component.fund')} value={parsed.fund || 0} color={parsed.fund >= 60 ? '#0ECB81' : parsed.fund >= 30 ? '#FFCA28' : '#F6465D'} />
          <ComponentBar label={t('fundTracker.component.tech')} value={parsed.tech || 0} color={parsed.tech >= 60 ? '#0ECB81' : parsed.tech >= 30 ? '#FFCA28' : '#F6465D'} />
          <ComponentBar label={t('fundTracker.component.liquidity')} value={parsed.liquidity || 0} color={parsed.liquidity >= 60 ? '#0ECB81' : parsed.liquidity >= 30 ? '#FFCA28' : '#F6465D'} />
        </div>

        {/* Row 3: Stop + Weight */}
        <div className="flex items-center gap-4 mt-1.5 text-[10px] text-bnc-textTer">
          {parsed.stopLevel && (
            <span className="flex items-center gap-1">
              <Shield className="w-3 h-3 text-bnc-textTer" />
              {t('fundTracker.table.stop')}: <span className="text-bnc-textSec font-medium">{parsed.stopLevel.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-red-400/80">-%{parsed.stopPct.toFixed(1)}</span>
            </span>
          )}
          {fundWeight != null && fundWeight > 0 && (
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3 text-bnc-textTer" />
              {t('fundTracker.table.weight')}: <span className="text-bnc-accent font-medium">%{fundWeight.toFixed(2)}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, iconColor, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bnc-card overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-bnc-surfaceAlt/30 transition-colors">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <span className="text-sm font-semibold text-bnc-textPri">{title}</span>
          {count != null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-bnc-surfaceAlt text-bnc-textTer">{count}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-bnc-textTer" /> : <ChevronDown className="w-4 h-4 text-bnc-textTer" />}
      </button>
      {open && <div className="border-t border-bnc-border">{children}</div>}
    </div>
  );
}

function StockDetailPanel({ ticker, tickerSignals, priceHistory, portfolio, t, onClose }) {
  if (!ticker) return null;
  const holding = portfolio?.holdings?.find(h => h.ticker === ticker);

  return (
    <>
      <div className="lg:hidden fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed lg:sticky top-0 right-0 lg:top-auto lg:right-auto w-full sm:w-96 lg:w-80 h-full lg:h-auto max-h-screen lg:max-h-[calc(100vh-2rem)] overflow-y-auto bg-bnc-surface border-l lg:border border-bnc-border lg:rounded-xl z-50 lg:z-auto flex-shrink-0">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-bnc-textPri">{ticker}</h3>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-bnc-surfaceAlt text-bnc-textTer hover:text-bnc-textPri transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {holding && (
            <div className="flex items-center gap-2 text-xs text-bnc-textSec bg-bnc-surfaceAlt/50 rounded-lg px-3 py-2">
              <Eye className="w-3.5 h-3.5 text-bnc-accent" />
              {t('fundTracker.portfolio.fundWeight')}: <span className="font-semibold text-bnc-accent">%{holding.weight.toFixed(2)}</span>
            </div>
          )}

          {priceHistory.length > 0 && (
            <div>
              <p className="text-[10px] text-bnc-textTer uppercase mb-1.5 tracking-wider">{t('fundTracker.detail.priceChart')}</p>
              <ResponsiveContainer width="100%" height={130}>
                <LineChart data={priceHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2B3139" />
                  <XAxis dataKey="date" tick={false} stroke="#2B3139" />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: '#848E9C', fontSize: 9 }} width={40} stroke="#2B3139" />
                  <Tooltip
                    contentStyle={{ background: '#1E2329', border: '1px solid #2B3139', borderRadius: '6px', fontSize: '10px' }}
                    itemStyle={{ color: '#EAECEF' }} labelStyle={{ color: '#848E9C' }}
                  />
                  <Line type="monotone" dataKey="close" stroke="#F0B90B" strokeWidth={1.5} dot={false} name={t('fundTracker.detail.close')} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {priceHistory.length > 0 && (
            <div>
              <p className="text-[10px] text-bnc-textTer uppercase mb-1.5 tracking-wider">{t('fundTracker.detail.volume')}</p>
              <ResponsiveContainer width="100%" height={60}>
                <BarChart data={priceHistory}>
                  <Bar dataKey="volume" radius={[2, 2, 0, 0]}>
                    {priceHistory.map((entry, i) => (
                      <Cell key={i} fill={entry.close >= (priceHistory[i - 1]?.close || entry.close) ? '#0ECB8166' : '#F6465D66'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div>
            <p className="text-[10px] text-bnc-textTer uppercase mb-2 tracking-wider">{t('fundTracker.detail.signals')}</p>
            {tickerSignals.length === 0 ? (
              <p className="text-xs text-bnc-textTer">{t('fundTracker.detail.noSignals')}</p>
            ) : (
              <div className="space-y-2">
                {tickerSignals.map((sig, i) => {
                  const sentiment = getSignalSentiment(sig.signal_type);
                  const isPositive = sentiment === 'positive';
                  return (
                    <div key={i} className="flex items-start gap-2.5 text-[11px]">
                      <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isPositive ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                        {isPositive
                          ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                          : <TrendingDown className="w-3 h-3 text-red-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className={`font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                          {t(`fundTracker.signal.${sig.signal_type}`) || sig.signal_type}
                        </p>
                        <p className="text-bnc-textTer leading-snug">{sig.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────

export default function FundTrackerPage() {
  const { t } = useLanguage();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const [status, setStatus] = useState(null);
  const [scores, setScores] = useState([]);
  const [signals, setSignals] = useState([]);
  const [funds, setFunds] = useState([]);
  const [selectedFund, setSelectedFund] = useState('TLY');
  const [portfolio, setPortfolio] = useState(null);
  const [changes, setChanges] = useState([]);

  const [selectedTicker, setSelectedTicker] = useState(null);
  const [tickerSignals, setTickerSignals] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const [statusRes, scoresRes, signalsRes, fundsRes, changesRes] = await Promise.all([
        getFundTrackerStatus(),
        getFundTrackerScores().catch(() => ({ data: [] })),
        getFundTrackerSignals(null, 50).catch(() => ({ data: [] })),
        getFundTrackerFunds().catch(() => ({ data: [] })),
        getFundTrackerChanges(null, 50).catch(() => ({ data: [] })),
      ]);
      setStatus(statusRes?.data || null);
      setScores(Array.isArray(scoresRes?.data) ? scoresRes.data : []);
      setSignals(Array.isArray(signalsRes?.data) ? signalsRes.data : []);
      setFunds(Array.isArray(fundsRes?.data) ? fundsRes.data : []);
      setChanges(Array.isArray(changesRes?.data) ? changesRes.data : []);
    } catch (err) {
      console.error('Fund tracker load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (selectedFund) {
      getFundTrackerPortfolio(selectedFund)
        .then(res => setPortfolio(res?.data || null))
        .catch(() => setPortfolio(null));
    }
  }, [selectedFund]);

  useEffect(() => {
    if (selectedTicker) {
      Promise.all([
        getFundTrackerSignals(selectedTicker, 20).then(r => setTickerSignals(Array.isArray(r?.data) ? r.data : [])),
        getFundTrackerPriceHistory(selectedTicker, 60).then(r => setPriceHistory(Array.isArray(r?.data) ? r.data : [])),
      ]).catch(() => {});
    }
  }, [selectedTicker]);

  // Parse details for each score
  const parsedScores = useMemo(() => {
    return scores.map(s => ({
      ...s,
      parsed: parseFullDetails(s.details),
    }));
  }, [scores]);

  // Build change lookup
  const changeMap = useMemo(() => {
    const map = {};
    changes.forEach(c => { map[c.ticker] = c; });
    return map;
  }, [changes]);

  // Notable changes (not TUTMA)
  const notableChanges = useMemo(() => {
    return changes.filter(c => c.change_type !== 'TUTMA')
      .sort((a, b) => {
        const order = { 'YENİ_GİRİŞ': 0, 'ARTIŞ': 1, 'AZALIŞ': 2, 'ÇIKIŞ': 3 };
        return (order[a.change_type] ?? 4) - (order[b.change_type] ?? 4);
      });
  }, [changes]);

  // Score lookup for changes
  const scoreLookup = useMemo(() => {
    const map = {};
    scores.forEach(s => { map[s.ticker] = s.score; });
    return map;
  }, [scores]);

  const newEntryCount = useMemo(() => changes.filter(c => c.change_type === 'YENİ_GİRİŞ').length, [changes]);
  const exitCount = useMemo(() => changes.filter(c => c.change_type === 'ÇIKIŞ').length, [changes]);

  const handleRunPipeline = async () => {
    setRunning(true);
    try {
      await runFundTrackerPipeline();
      showSuccess(t('fundTracker.pipelineStarted'));
      setTimeout(() => loadData(), 15000);
    } catch (err) {
      showError(err.response?.data?.detail || err.message);
    } finally {
      setRunning(false);
    }
  };

  const handleRefreshPrices = async () => {
    try {
      await refreshFundTrackerPrices();
      showSuccess(t('fundTracker.pricesStarted'));
      setTimeout(() => loadData(), 10000);
    } catch (err) { showError(err.message); }
  };

  const handleRefreshSignals = async () => {
    try {
      await refreshFundTrackerSignals();
      showSuccess(t('fundTracker.signalsStarted'));
      setTimeout(() => loadData(), 5000);
    } catch (err) { showError(err.message); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bnc-accent" />
      </div>
    );
  }

  if (scores.length === 0 && signals.length === 0) {
    return (
      <div className="space-y-5">
        <HeroHeader t={t} status={status} running={running}
          onRun={handleRunPipeline} onRefreshPrices={handleRefreshPrices} onRefreshSignals={handleRefreshSignals} />
        <div className="bnc-card p-10 text-center">
          <Radar className="w-12 h-12 mx-auto text-bnc-textTer/30 mb-4" />
          <h2 className="text-base font-semibold text-bnc-textPri mb-1">{t('fundTracker.empty.title')}</h2>
          <p className="text-sm text-bnc-textTer">{t('fundTracker.empty.desc')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-5">
      <div className="flex-1 min-w-0 space-y-5">

        {/* A. Header */}
        <HeroHeader t={t} status={status} running={running}
          onRun={handleRunPipeline} onRefreshPrices={handleRefreshPrices} onRefreshSignals={handleRefreshSignals} />

        {/* B. Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon={ArrowUpRight} iconColor="text-emerald-400" borderColor="border-l-emerald-500/50"
            label={t('fundTracker.summary.newEntries')} value={newEntryCount} sub={t('fundTracker.summary.stocks')} />
          <SummaryCard icon={ArrowDownRight} iconColor="text-red-400" borderColor="border-l-red-500/50"
            label={t('fundTracker.summary.exits')} value={exitCount} sub={t('fundTracker.summary.stocks')} />
          <SummaryCard icon={Radar} iconColor="text-bnc-accent" borderColor="border-l-bnc-accent/50"
            label={t('fundTracker.summary.tracked')} value={scores.length} sub={t('fundTracker.summary.stocks')} />
          <SummaryCard icon={RefreshCw} iconColor="text-bnc-textTer" borderColor="border-l-bnc-border"
            label={t('fundTracker.lastUpdate')} value={status?.last_score_date || '—'} isText />
        </div>

        {/* C. Fund Moves */}
        {notableChanges.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-bnc-accent" />
              <div>
                <h2 className="text-sm font-bold text-bnc-textPri">{t('fundTracker.sections.fundMoves')}</h2>
                <p className="text-[11px] text-bnc-textTer">{t('fundTracker.sections.fundMovesSub')}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
              {notableChanges.map(c => (
                <FundMoveCard key={c.ticker} change={c} score={scoreLookup[c.ticker]} t={t} onClick={setSelectedTicker} />
              ))}
            </div>
          </section>
        )}

        {/* D. All Stocks - unified ranked list */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-bnc-textSec" />
            <div>
              <h2 className="text-sm font-bold text-bnc-textPri">{t('fundTracker.sections.allStocks')}</h2>
              <p className="text-[11px] text-bnc-textTer">{t('fundTracker.sections.allStocksSub')}</p>
            </div>
          </div>
          <div className="bnc-card overflow-hidden">
            {parsedScores.map((s, i) => (
              <StockRow
                key={s.ticker}
                item={s}
                parsed={s.parsed}
                change={changeMap[s.ticker]}
                t={t}
                onClick={setSelectedTicker}
                rank={i + 1}
              />
            ))}
          </div>
        </section>

        {/* E. Portfolio (collapsible) */}
        <CollapsibleSection title={t('fundTracker.sections.portfolio')} icon={Eye} iconColor="text-bnc-accent"
          count={portfolio?.holdings?.length}>
          <div className="p-4">
            {funds.length > 0 && (
              <div className="flex items-center gap-2 mb-4">
                {funds.map(f => (
                  <button key={f.fund_code} onClick={() => setSelectedFund(f.fund_code)}
                    className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                      selectedFund === f.fund_code
                        ? 'bg-bnc-accent text-bnc-bg'
                        : 'bg-bnc-surfaceAlt text-bnc-textSec hover:bg-bnc-border'
                    }`}>
                    {f.fund_code}
                    <span className="ml-1.5 text-[10px] opacity-70">{f.stock_count} {t('fundTracker.portfolio.stocks')}</span>
                  </button>
                ))}
              </div>
            )}
            {portfolio?.holdings && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-bnc-border">
                        <th className="text-left px-3 py-2 text-bnc-textTer font-medium">{t('fundTracker.portfolio.stocks')}</th>
                        <th className="text-right px-3 py-2 text-bnc-textTer font-medium">{t('fundTracker.portfolio.weight')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bnc-border/50">
                      {portfolio.holdings.map(h => (
                        <tr key={h.ticker} onClick={() => setSelectedTicker(h.ticker)}
                          className="hover:bg-bnc-surfaceAlt/50 cursor-pointer transition-colors">
                          <td className="px-3 py-2 font-semibold text-bnc-textPri">{h.ticker}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-bnc-surfaceAlt rounded-full overflow-hidden">
                                <div className="h-full bg-bnc-accent rounded-full" style={{ width: `${Math.min(h.weight * 4, 100)}%` }} />
                              </div>
                              <span className="text-bnc-accent font-medium w-12 text-right">%{h.weight.toFixed(1)}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={portfolio.holdings.filter(h => h.weight >= 1)} dataKey="weight" nameKey="ticker"
                        cx="50%" cy="50%" outerRadius={95} innerRadius={45} paddingAngle={2}
                        label={({ ticker, weight }) => `${ticker} ${weight.toFixed(1)}%`} labelLine={false}>
                        {portfolio.holdings.filter(h => h.weight >= 1).map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#1E2329', border: '1px solid #2B3139', borderRadius: '8px', fontSize: '11px' }}
                        itemStyle={{ color: '#EAECEF' }}
                        formatter={(val) => `%${val.toFixed(2)}`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* F. How it works (collapsible) */}
        <CollapsibleSection title={t('fundTracker.sections.howItWorks')} icon={Info} iconColor="text-blue-400">
          <div className="p-4 space-y-3 text-xs text-bnc-textSec">
            {['step1', 'step2', 'step3', 'step4', 'step5'].map((step, i) => (
              <div key={step} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-bnc-surfaceAlt flex items-center justify-center text-[10px] font-bold text-bnc-textTer shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p>{t(`fundTracker.howItWorks.${step}`)}</p>
              </div>
            ))}
            <div className="mt-3 p-3 bg-bnc-surfaceAlt/50 rounded-lg">
              <p className="text-bnc-textPri font-medium mb-1">{t('fundTracker.howItWorks.scoreExplain')}</p>
              <p className="text-[10px] text-bnc-textTer italic">{t('fundTracker.howItWorks.disclaimer')}</p>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      {/* G. Stock detail panel */}
      {selectedTicker && (
        <StockDetailPanel
          ticker={selectedTicker}
          tickerSignals={tickerSignals}
          priceHistory={priceHistory}
          portfolio={portfolio}
          t={t}
          onClose={() => setSelectedTicker(null)}
        />
      )}
    </div>
  );
}

// ── Small section components ───────────────────────────────

function HeroHeader({ t, status, running, onRun, onRefreshPrices, onRefreshSignals }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-bold text-bnc-textPri flex items-center gap-2">
          <Radar className="w-5 h-5 text-bnc-accent" />
          {t('fundTracker.title')}
        </h1>
        <p className="text-xs text-bnc-textSec mt-1 max-w-xl leading-relaxed">
          {t('fundTracker.heroDesc')}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onRefreshPrices}
          className="px-3 py-1.5 text-xs rounded-lg bg-bnc-surfaceAlt text-bnc-textSec hover:bg-bnc-border transition-colors">
          <RefreshCw className="w-3.5 h-3.5 inline mr-1" />
          {t('fundTracker.refreshPrices')}
        </button>
        <button onClick={onRefreshSignals}
          className="px-3 py-1.5 text-xs rounded-lg bg-bnc-surfaceAlt text-bnc-textSec hover:bg-bnc-border transition-colors">
          <Zap className="w-3.5 h-3.5 inline mr-1" />
          {t('fundTracker.refreshSignals')}
        </button>
        <button onClick={onRun} disabled={running}
          className="px-3 py-1.5 text-xs rounded-lg bg-bnc-accent text-bnc-bg font-semibold hover:bg-bnc-accentHover disabled:opacity-50 transition-colors">
          <Play className={`w-3.5 h-3.5 inline mr-1 ${running ? 'animate-spin' : ''}`} />
          {t('fundTracker.runPipeline')}
        </button>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, iconColor, borderColor, label, value, sub, isText }) {
  return (
    <div className={`bnc-card p-3 border-l-[3px] ${borderColor}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        <p className="text-[10px] text-bnc-textTer uppercase tracking-wider">{label}</p>
      </div>
      {isText ? (
        <p className="text-sm font-semibold text-bnc-textPri">{value}</p>
      ) : (
        <div className="flex items-baseline gap-1.5">
          <p className="text-xl font-bold text-bnc-textPri">{value}</p>
          {sub && <span className="text-[10px] text-bnc-textTer">{sub}</span>}
        </div>
      )}
    </div>
  );
}
