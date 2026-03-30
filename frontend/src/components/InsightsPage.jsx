import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Lightbulb, AlertTriangle, Target, Plus, Check, Trash2,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import {
  getPortfolioSummary, getModelPortfolio,
  getInsightTodos, createInsightTodo, updateInsightTodo, deleteInsightTodo,
} from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

const pct = (v) => (v != null ? `%${v.toFixed(1)}` : '—');

export default function InsightsPage() {
  const { t, locale } = useLanguage();
  const fmt = useCallback((v) => {
    if (v == null) return '—';
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'TRY' }).format(v);
  }, [locale]);

  const [summary, setSummary] = useState(null);
  const [targets, setTargets] = useState([]);
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoTag, setNewTodoTag] = useState('');

  const loadData = async () => {
    try {
      const [sumRes, tgtRes, todoRes] = await Promise.all([
        getPortfolioSummary(),
        getModelPortfolio(),
        getInsightTodos(),
      ]);
      setSummary(sumRes?.data || null);
      setTargets(Array.isArray(tgtRes?.data) ? tgtRes.data : []);
      setTodos(Array.isArray(todoRes?.data) ? todoRes.data : []);
    } catch (err) {
      console.error('Insights load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const comparison = useMemo(() => {
    if (!summary || !targets.length) return [];
    const allocationMap = {};
    (summary.allocation_by_primary_tag || []).forEach(a => {
      allocationMap[a.asset_type.toLowerCase()] = a;
    });

    return targets.map(tgt => {
      const alloc = allocationMap[tgt.tag_name.toLowerCase()];
      return {
        tag: tgt.tag_name,
        target: tgt.target_percentage,
        current: alloc?.percentage ?? 0,
        currentValue: alloc?.market_value_try ?? 0,
        count: alloc?.count ?? 0,
      };
    });
  }, [summary, targets]);

  const suggestions = useMemo(() => {
    if (!comparison.length || !summary?.total_market_value_try) return [];
    const totalValue = summary.total_market_value_try;
    return comparison
      .filter(c => Math.abs(c.current - c.target) > 2)
      .map(c => {
        const diff = c.target - c.current;
        const amountNeeded = (diff / 100) * totalValue;
        if (diff > 0) {
          return {
            tag: c.tag,
            text: t('insights.suggestions.increase', { tag: c.tag, current: pct(c.current), target: pct(c.target) }),
            detail: t('insights.suggestions.detailMore', { amount: fmt(Math.abs(amountNeeded)) }),
            type: 'increase',
          };
        }
        return {
          tag: c.tag,
          text: t('insights.suggestions.decrease', { tag: c.tag, current: pct(c.current), target: pct(c.target) }),
          detail: t('insights.suggestions.detailLess', { amount: fmt(Math.abs(amountNeeded)) }),
          type: 'decrease',
        };
      });
  }, [comparison, summary, t, fmt]);

  const handleAddTodo = async () => {
    const title = newTodoTitle.trim();
    if (!title) return;
    try {
      const res = await createInsightTodo({ title, tag: newTodoTag || null });
      setTodos(prev => [res.data, ...prev]);
      setNewTodoTitle('');
      setNewTodoTag('');
    } catch (err) {
      console.error('Could not add todo:', err);
    }
  };

  const handleToggleTodo = async (id, currentStatus) => {
    try {
      const res = await updateInsightTodo(id, { is_completed: !currentStatus });
      setTodos(prev => prev.map(todo => todo.id === id ? res.data : todo));
    } catch (err) {
      console.error('Could not update todo:', err);
    }
  };

  const handleDeleteTodo = async (id) => {
    try {
      await deleteInsightTodo(id);
      setTodos(prev => prev.filter(todo => todo.id !== id));
    } catch (err) {
      console.error('Could not delete todo:', err);
    }
  };

  const handleAddSuggestionAsTodo = async (suggestion) => {
    try {
      const res = await createInsightTodo({
        title: suggestion.text,
        description: suggestion.detail,
        tag: suggestion.tag,
      });
      setTodos(prev => [res.data, ...prev]);
    } catch (err) {
      console.error('Could not add suggestion as todo:', err);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bnc-card p-5 animate-pulse">
            <div className="h-3 bg-bnc-surfaceAlt rounded w-1/2 mb-3" />
            <div className="h-7 bg-bnc-surfaceAlt rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  const activeTodos = todos.filter(todo => !todo.is_completed);
  const completedTodos = todos.filter(todo => todo.is_completed);
  const concentrationRisks = summary?.concentration_risks || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-5 h-5 text-bnc-accent" />
        <h1 className="text-lg font-bold text-bnc-textPri">Insights</h1>
      </div>

      {/* Model Portföy Karşılaştırması */}
      <div className="bnc-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5 pb-4">
          <Target className="w-4 h-4 text-bnc-accent" />
          <h2 className="text-sm font-semibold text-bnc-textPri">{t('insights.modelComparison.title')}</h2>
          {summary?.total_market_value_try > 0 && (
            <span className="ml-auto text-[11px] text-bnc-textTer">
              {t('insights.modelComparison.total', { value: fmt(summary.total_market_value_try) })}
            </span>
          )}
        </div>
        {comparison.length > 0 ? (
          <div className="px-5 pb-5 space-y-4">
            {comparison.map(c => {
              const diff = c.current - c.target;
              const maxScale = Math.max(c.current, c.target) * 1.15;
              const greenW = Math.min(c.current, c.target);
              const overflowW = c.current > c.target ? c.current - c.target : 0;
              const greenPct = maxScale > 0 ? (greenW / maxScale) * 100 : 0;
              const overflowPct = maxScale > 0 ? (overflowW / maxScale) * 100 : 0;
              const targetPct = maxScale > 0 ? (c.target / maxScale) * 100 : 0;

              return (
                <div key={c.tag}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-bnc-textPri">{c.tag}</span>
                      {c.currentValue > 0 && (
                        <span className="text-[10px] text-bnc-textTer tabular-nums">{fmt(c.currentValue)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs tabular-nums text-bnc-textPri font-bold">{pct(c.current)}</span>
                      <span className="text-[10px] text-bnc-textTer tabular-nums">/ {pct(c.target)}</span>
                      <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded ${
                        Math.abs(diff) <= 2
                          ? 'bg-bnc-green/15 text-bnc-green'
                          : diff < 0
                            ? 'bg-bnc-red/15 text-bnc-red'
                            : 'bg-bnc-red/15 text-bnc-red'
                      }`}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <div className="relative h-5 bg-bnc-surfaceAlt rounded">
                    {/* Yeşil dolgu: hedefe kadar olan kısım */}
                    <div
                      className="absolute left-0 top-0 h-full rounded-l bg-bnc-green/60"
                      style={{ width: `${greenPct}%`, borderRadius: overflowW > 0 ? '4px 0 0 4px' : '4px' }}
                    />
                    {/* Kırmızı taşma: hedefi aşan kısım */}
                    {overflowW > 0 && (
                      <div
                        className="absolute top-0 h-full bg-bnc-red/60"
                        style={{ left: `${greenPct}%`, width: `${overflowPct}%`, borderRadius: '0 4px 4px 0' }}
                      />
                    )}
                    {/* Hedef çizgisi */}
                    <div
                      className="absolute top-0 h-full flex flex-col items-center"
                      style={{ left: `${targetPct}%` }}
                    >
                      <div className="w-0.5 h-full bg-bnc-textPri" />
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-4 pt-2 text-[10px] text-bnc-textTer">
              <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm bg-bnc-green/60" /> {t('insights.legend.upToTarget')}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm bg-bnc-red/60" /> {t('insights.legend.overTarget')}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-bnc-textPri" /> {t('insights.legend.target')}</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-bnc-textTer px-5 pb-5">{t('insights.modelComparison.empty')}</p>
        )}
      </div>

      {/* Öneriler + Konsantrasyon Riski yan yana */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Otomatik Öneriler */}
        {suggestions.length > 0 && (
          <div className="bnc-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-bnc-accent" />
              <h2 className="text-sm font-semibold text-bnc-textPri">{t('insights.suggestions.title')}</h2>
            </div>
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-bnc-surfaceAlt/50 group">
                  {s.type === 'increase' ? (
                    <TrendingUp className="w-4 h-4 text-bnc-green mt-0.5 shrink-0" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-bnc-red mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-bnc-textPri">{s.text}</p>
                    <p className="text-[11px] text-bnc-textTer mt-0.5">{s.detail}</p>
                  </div>
                  <button
                    onClick={() => handleAddSuggestionAsTodo(s)}
                    className="p-1.5 rounded-lg text-bnc-textTer hover:text-bnc-accent hover:bg-bnc-accent/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    title={t('insights.suggestions.addAsAction')}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Konsantrasyon Riski */}
        {concentrationRisks.length > 0 && (
          <div className="bnc-card p-5 border-bnc-accent/30">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-bnc-accent" />
              <h2 className="text-sm font-semibold text-bnc-accent">{t('insights.concentration.title')}</h2>
            </div>
            <div className="space-y-1.5">
              {concentrationRisks.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${r.level === 'high' ? 'bg-bnc-red' : 'bg-bnc-accent'}`} />
                    <span className="text-bnc-textPri font-medium">{r.symbol}</span>
                    <span className="text-bnc-textTer">{r.type === 'position' ? t('insights.concentration.position') : t('insights.concentration.assetClass')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-bnc-textPri font-medium">%{r.weight.toFixed(1)}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      r.level === 'high' ? 'bg-bnc-red/15 text-bnc-red' : 'bg-bnc-accent/15 text-bnc-accent'
                    }`}>{r.level === 'high' ? t('insights.concentration.high') : t('insights.concentration.watch')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Aksiyon Maddeleri (To-Do) */}
      <div className="bnc-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Check className="w-4 h-4 text-bnc-accent" />
          <h2 className="text-sm font-semibold text-bnc-textPri">{t('insights.todos.title')}</h2>
          {activeTodos.length > 0 && (
            <span className="ml-auto text-[10px] font-semibold text-bnc-accent bg-bnc-accent/15 px-1.5 py-0.5 rounded">
              {t('insights.todos.activeCount', { count: activeTodos.length })}
            </span>
          )}
        </div>

        {/* Yeni todo ekle */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newTodoTitle}
            onChange={e => setNewTodoTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddTodo()}
            placeholder={t('insights.todos.placeholder')}
            className="bnc-input flex-1"
          />
          <select
            value={newTodoTag}
            onChange={e => setNewTodoTag(e.target.value)}
            className="bnc-input w-40 hidden sm:block"
          >
            <option value="">{t('insights.todos.tagOptional')}</option>
            {targets.map(tgt => (
              <option key={tgt.tag_name} value={tgt.tag_name}>{tgt.tag_name}</option>
            ))}
          </select>
          <button
            onClick={handleAddTodo}
            disabled={!newTodoTitle.trim()}
            className="bnc-btn-primary px-3 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Aktif todolar */}
        {activeTodos.length === 0 && completedTodos.length === 0 ? (
          <div className="py-8 text-center">
            <Minus className="w-8 h-8 mx-auto text-bnc-textTer/30 mb-2" />
            <p className="text-xs text-bnc-textTer">{t('insights.todos.empty')}</p>
            <p className="text-[11px] text-bnc-textTer mt-1">{t('insights.todos.emptyHint')}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {activeTodos.map(todo => (
              <div key={todo.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bnc-surfaceAlt/50 group transition-colors">
                <button
                  onClick={() => handleToggleTodo(todo.id, todo.is_completed)}
                  className="w-5 h-5 rounded border-2 border-bnc-border hover:border-bnc-accent flex items-center justify-center shrink-0 transition-colors"
                >
                  {todo.is_completed && <Check className="w-3 h-3 text-bnc-accent" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-bnc-textPri truncate">{todo.title}</p>
                  {todo.description && (
                    <p className="text-[11px] text-bnc-textTer mt-0.5 truncate">{todo.description}</p>
                  )}
                </div>
                {todo.tag && (
                  <span className="text-[10px] font-medium text-bnc-textTer bg-bnc-surfaceAlt px-1.5 py-0.5 rounded shrink-0">
                    {todo.tag}
                  </span>
                )}
                <button
                  onClick={() => handleDeleteTodo(todo.id)}
                  className="p-1 rounded text-bnc-textTer hover:text-bnc-red opacity-0 group-hover:opacity-100 transition-all shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {/* Tamamlanan todolar */}
            {completedTodos.length > 0 && (
              <>
                <div className="pt-3 pb-1">
                  <p className="text-[10px] font-semibold text-bnc-textTer uppercase tracking-wider">
                    {t('insights.todos.completedSection', { count: completedTodos.length })}
                  </p>
                </div>
                {completedTodos.map(todo => (
                  <div key={todo.id} className="flex items-center gap-3 px-3 py-2 rounded-lg opacity-50 hover:opacity-75 group transition-all">
                    <button
                      onClick={() => handleToggleTodo(todo.id, todo.is_completed)}
                      className="w-5 h-5 rounded border-2 border-bnc-green bg-bnc-green/20 flex items-center justify-center shrink-0"
                    >
                      <Check className="w-3 h-3 text-bnc-green" />
                    </button>
                    <p className="text-xs text-bnc-textTer line-through flex-1 truncate">{todo.title}</p>
                    {todo.tag && (
                      <span className="text-[10px] text-bnc-textTer bg-bnc-surfaceAlt px-1.5 py-0.5 rounded shrink-0">
                        {todo.tag}
                      </span>
                    )}
                    <button
                      onClick={() => handleDeleteTodo(todo.id)}
                      className="p-1 rounded text-bnc-textTer hover:text-bnc-red opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
