import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Svg, { Path, G, Text as SvgText } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import {
  getDebugTransactions,
  deleteTransaction,
  getInstruments,
  getPortfolioSummary,
  getFxRates,
} from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import { useTheme } from '../contexts/ThemeContext';
import TransactionForm from '../components/TransactionForm';
import SellForm from '../components/SellForm';
import ConfirmDialog from '../components/ConfirmDialog';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';


const PIE_COLORS = ['#F0B90B', '#0ECB81', '#F6465D', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];



const SORT_OPTIONS = [
  { key: 'value_desc', label: 'Değer ↓', icon: 'trending-down' },
  { key: 'value_asc', label: 'Değer ↑', icon: 'trending-up' },
  { key: 'pl_desc', label: 'K/Z ↓', icon: 'arrow-down' },
  { key: 'pl_asc', label: 'K/Z ↑', icon: 'arrow-up' },
  { key: 'name_asc', label: 'A-Z', icon: 'type' },
  { key: 'date_desc', label: 'Yeni', icon: 'clock' },
];

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlicePath(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const large = endAngle - startAngle > 180 ? 1 : 0;
  const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, endAngle);
  const p3 = polarToCartesian(cx, cy, rInner, endAngle);
  const p4 = polarToCartesian(cx, cy, rInner, startAngle);
  return [
    'M', p1.x, p1.y,
    'A', rOuter, rOuter, 0, large, 1, p2.x, p2.y,
    'L', p3.x, p3.y,
    'A', rInner, rInner, 0, large, 0, p4.x, p4.y,
    'Z',
  ].join(' ');
}

function parseSecondaryTags(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

function compactCurrency(val) {
  if (val == null) return '—';
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return val.toFixed(0);
}

function TagDonutSection({ title, expanded, onToggle, colors, slices, size, selectedKey, onSelectSlice, style }) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.42;
  const rInner = size * 0.26;
  const total = slices.reduce((s, x) => s + x.value, 0);

  let angle = 0;
  const paths = slices.map((sl, i) => {
    const frac = total > 0 ? sl.value / total : 0;
    const sweep = frac * 360;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const d = total > 0 && frac > 0 ? donutSlicePath(cx, cy, rOuter, rInner, start, end) : '';
    return { ...sl, d, frac, color: PIE_COLORS[i % PIE_COLORS.length] };
  });

  const activeFilter = selectedKey != null;
  const selectedSlice = activeFilter ? paths.find(p => p.key === selectedKey) : null;

  return (
    <View style={[{ borderRadius: 12, borderWidth: 1, borderColor: expanded ? colors.accent + '30' : colors.border, backgroundColor: colors.surface, overflow: 'hidden' }, style]}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
          <Feather name="pie-chart" size={13} color={expanded ? colors.accent : colors.textTer} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPri }} numberOfLines={1}>{title}</Text>
          {activeFilter && (
            <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: 'rgba(240,185,11,0.15)' }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: colors.accent }} numberOfLines={1}>{selectedKey}</Text>
            </View>
          )}
        </View>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textTer} />
      </TouchableOpacity>
      {expanded && total > 0 && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Svg width={size} height={size}>
              <G>
                {paths.map((p) =>
                  p.d ? (
                    <Path key={p.key} d={p.d} fill={p.color}
                      opacity={activeFilter && selectedKey !== p.key ? 0.25 : 1}
                      onPress={() => onSelectSlice(p.key === selectedKey ? null : p.key)} />
                  ) : null,
                )}
              </G>
              {selectedSlice && (
                <>
                  <SvgText x={cx} y={cy - 5} textAnchor="middle" fontSize={11} fontWeight="700" fill={colors.textPri}>
                    {selectedSlice.label}
                  </SvgText>
                  <SvgText x={cx} y={cy + 10} textAnchor="middle" fontSize={10} fill={colors.textTer}>
                    {compactCurrency(selectedSlice.value)}
                  </SvgText>
                </>
              )}
            </Svg>
            <View style={{ flex: 1, marginLeft: 10, gap: 3 }}>
              {paths.map((p) => (
                <TouchableOpacity key={p.key}
                  onPress={() => onSelectSlice(p.key === selectedKey ? null : p.key)}
                  activeOpacity={0.6}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6,
                    backgroundColor: selectedKey === p.key ? 'rgba(240,185,11,0.12)' : 'transparent',
                  }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color, marginRight: 8 }} />
                  <Text style={{ fontSize: 11, color: colors.textPri, flex: 1 }} numberOfLines={1}>{p.label}</Text>
                  <Text style={{ fontSize: 10, color: colors.textTer, marginLeft: 4 }}>{compactCurrency(p.value)}</Text>
                  <Text style={{ fontSize: 10, color: colors.textTer, marginLeft: 4, width: 32, textAlign: 'right' }}>
                    {(p.frac * 100).toFixed(0)}%
                  </Text>
                </TouchableOpacity>
              ))}
              {activeFilter && (
                <TouchableOpacity onPress={() => onSelectSlice(null)}
                  style={{ alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 8, marginTop: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.accent }}>Tümünü Göster</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

export default function PortfolioScreen() {
  const { colors } = useTheme();

  const [transactions, setTransactions] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [fxRates, setFxRates] = useState({ USDTRY: 1, EURTRY: 1 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterPrimaryTag, setFilterPrimaryTag] = useState(null);
  const [filterSecondaryTag, setFilterSecondaryTag] = useState(null);
  const [openChart, setOpenChart] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [sellingTransaction, setSellingTransaction] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [sortKey, setSortKey] = useState('value_desc');

  const searchTimer = useRef(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchText]);

  const load = useCallback(async () => {
    try {
      const [tRes, iRes, sRes, fxRes] = await Promise.all([
        getDebugTransactions(), getInstruments(), getPortfolioSummary(), getFxRates(),
      ]);
      setTransactions(tRes.data || []);
      setInstruments(iRes.data || []);
      setSummary(sRes?.data ?? null);
      if (fxRes?.data) {
        setFxRates({
          USDTRY: fxRes.data.USDTRY || 1,
          EURTRY: fxRes.data.EURTRY || 1,
        });
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const instrumentMap = useMemo(() => {
    const map = {};
    instruments.forEach((i) => { map[i.id] = i; });
    return map;
  }, [instruments]);

  const activeTransactions = useMemo(
    () => transactions.filter((t) => t.type === 'buy' && !t.is_sold),
    [transactions],
  );

  const getFxRate = useCallback((currency) => {
    if (currency === 'USD') return fxRates.USDTRY || 1;
    if (currency === 'EUR') return fxRates.EURTRY || 1;
    return 1;
  }, [fxRates]);

  const transactionCost = useCallback((t) => {
    const fxRate = getFxRate(t.currency);
    return ((t.quantity || 0) * (t.price || 0) + (t.fees || 0)) * fxRate;
  }, [getFxRate]);

  const transactionMarketValue = useCallback(
    (t) => {
      const instr = instrumentMap[t.instrument_id];
      const priceTry = instr?.last_price_try;
      if (priceTry != null) return (t.quantity || 0) * priceTry;
      const fxRate = getFxRate(t.currency);
      return (t.quantity || 0) * (t.price || 0) * fxRate;
    },
    [instrumentMap, getFxRate],
  );

  const matchesSearch = useCallback(
    (t) => {
      if (!debouncedSearch) return true;
      const q = debouncedSearch.toLowerCase();
      const instr = instrumentMap[t.instrument_id];
      const sym = (instr?.symbol || '').toLowerCase();
      const nm = (instr?.name || '').toLowerCase();
      const pt = (t.primary_tag || '').toLowerCase();
      const sec = parseSecondaryTags(t.secondary_tags).join(' ').toLowerCase();
      return sym.includes(q) || nm.includes(q) || pt.includes(q) || sec.includes(q);
    },
    [debouncedSearch, instrumentMap],
  );

  const matchesSecondaryFilter = useCallback(
    (t) => {
      if (filterSecondaryTag == null) return true;
      const tags = parseSecondaryTags(t.secondary_tags);
      if (filterSecondaryTag === '—') return tags.length === 0;
      return tags.includes(filterSecondaryTag);
    },
    [filterSecondaryTag],
  );

  const matchesPrimaryFilter = useCallback(
    (t) => {
      if (filterPrimaryTag == null) return true;
      if (filterPrimaryTag === '—') return !t.primary_tag;
      return t.primary_tag === filterPrimaryTag;
    },
    [filterPrimaryTag],
  );

  const searchFiltered = useMemo(
    () => activeTransactions.filter((t) => matchesSearch(t)),
    [activeTransactions, matchesSearch],
  );

  const primaryPieSource = useMemo(
    () => searchFiltered.filter((t) => matchesSecondaryFilter(t)),
    [searchFiltered, matchesSecondaryFilter],
  );

  const secondaryPieSource = useMemo(
    () => searchFiltered.filter((t) => matchesPrimaryFilter(t)),
    [searchFiltered, matchesPrimaryFilter],
  );

  const primaryPieSlices = useMemo(() => {
    const by = {};
    primaryPieSource.forEach((t) => {
      const key = t.primary_tag || '—';
      by[key] = (by[key] || 0) + transactionMarketValue(t);
    });
    return Object.entries(by).map(([key, value]) => ({ key, label: key, value })).sort((a, b) => b.value - a.value);
  }, [primaryPieSource, transactionMarketValue]);

  const secondaryPieSlices = useMemo(() => {
    const by = {};
    secondaryPieSource.forEach((t) => {
      const tags = parseSecondaryTags(t.secondary_tags);
      const mv = transactionMarketValue(t);
      if (tags.length === 0) {
        by['—'] = (by['—'] || 0) + mv;
      } else {
        const share = mv / tags.length;
        tags.forEach((tag) => { by[tag] = (by[tag] || 0) + share; });
      }
    });
    return Object.entries(by).map(([key, value]) => ({ key, label: key, value })).sort((a, b) => b.value - a.value);
  }, [secondaryPieSource, transactionMarketValue]);

  const listFiltered = useMemo(
    () => searchFiltered.filter((t) => matchesPrimaryFilter(t) && matchesSecondaryFilter(t)),
    [searchFiltered, matchesPrimaryFilter, matchesSecondaryFilter],
  );

  const sortedList = useMemo(() => {
    const arr = [...listFiltered];
    arr.sort((a, b) => {
      const ia = instrumentMap[a.instrument_id];
      const ib = instrumentMap[b.instrument_id];
      switch (sortKey) {
        case 'value_desc': return transactionMarketValue(b) - transactionMarketValue(a);
        case 'value_asc': return transactionMarketValue(a) - transactionMarketValue(b);
        case 'pl_desc': {
          const plA = transactionMarketValue(a) - transactionCost(a);
          const plB = transactionMarketValue(b) - transactionCost(b);
          return plB - plA;
        }
        case 'pl_asc': {
          const plA2 = transactionMarketValue(a) - transactionCost(a);
          const plB2 = transactionMarketValue(b) - transactionCost(b);
          return plA2 - plB2;
        }
        case 'name_asc': return (ia?.symbol || '').localeCompare(ib?.symbol || '');
        case 'date_desc': return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        default: return 0;
      }
    });
    return arr;
  }, [listFiltered, sortKey, instrumentMap, transactionMarketValue, transactionCost]);

  const hasFilter = !!(debouncedSearch || filterPrimaryTag || filterSecondaryTag);

  const totals = useMemo(() => {
    if (!hasFilter && summary) {
      return {
        totalValue: summary.total_market_value_try ?? 0,
        totalCost: summary.total_cost_basis_try ?? 0,
        totalPL: summary.total_unrealized_pl_try ?? 0,
        plPct: summary.total_unrealized_pl_percentage ?? null,
      };
    }
    let totalValue = 0;
    let totalCost = 0;
    listFiltered.forEach((t) => {
      totalValue += transactionMarketValue(t);
      totalCost += transactionCost(t);
    });
    const totalPL = totalValue - totalCost;
    const plPct = totalCost > 0 ? (totalPL / totalCost) * 100 : null;
    return { totalValue, totalCost, totalPL, plPct };
  }, [hasFilter, summary, listFiltered, transactionCost, transactionMarketValue]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteTransaction(deleteId);
      Toast.show({ type: 'success', text1: 'İşlem silindi' });
      load();
    } catch { /* ignore */ }
    setDeleteId(null);
  };

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const renderTransaction = ({ item: t }) => {
    const instr = instrumentMap[t.instrument_id];
    const cost = transactionCost(t);
    const marketVal = transactionMarketValue(t);
    const pl = marketVal - cost;
    const plPct = cost > 0 ? (pl / cost) * 100 : null;
    const symbol = instr?.symbol || '#';
    const name = instr?.name || '';
    const secTags = parseSecondaryTags(t.secondary_tags);
    const isExpanded = expandedId === t.id;
    const positive = pl >= 0;

    return (
      <TouchableOpacity activeOpacity={0.7} onPress={() => toggleExpand(t.id)}
        style={{ marginHorizontal: 16, marginBottom: 2 }}>
        <View style={{
          backgroundColor: colors.surface,
          borderRadius: isExpanded ? 12 : 0,
          borderBottomWidth: isExpanded ? 0 : 1,
          borderBottomColor: colors.border,
          ...(isExpanded && { borderWidth: 1, borderColor: colors.accent + '40', marginBottom: 8 }),
        }}>
          {/* Compact row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 }}>
            {/* Left: Symbol + tag */}
            <View style={{ flex: 1, marginRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPri }}>{symbol}</Text>
                {t.primary_tag ? (
                  <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: 'rgba(240,185,11,0.12)' }}>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: colors.accent }}>{t.primary_tag}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 1 }} numberOfLines={1}>{name}</Text>
              {secTags.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 3, gap: 3 }}>
                  {secTags.map((tag) => (
                    <View key={tag} style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: colors.surfaceAlt, borderWidth: 0.5, borderColor: colors.border }}>
                      <Text style={{ fontSize: 8, color: colors.textSec }}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Right: Value + P/L */}
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPri }}>{formatCurrency(marketVal)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: positive ? colors.green : colors.red }}>
                  {positive ? '+' : ''}{(plPct ?? 0).toFixed(1)}%
                </Text>
                <Text style={{ fontSize: 10, color: positive ? colors.green : colors.red }}>
                  {positive ? '+' : ''}{compactCurrency(pl)}
                </Text>
              </View>
            </View>

            <Feather name={isExpanded ? 'chevron-up' : 'chevron-right'} size={14} color={colors.textTer} style={{ marginLeft: 6 }} />
          </View>

          {/* Expanded detail */}
          {isExpanded && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                {/* Detail grid */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {[
                    { label: 'Adet', val: String(t.quantity || 0) },
                    { label: 'Alış', val: formatCurrency(t.price) },
                    { label: 'Maliyet', val: formatCurrency(cost) },
                    { label: 'Komisyon', val: t.fees ? formatCurrency(t.fees) : '—' },
                    { label: 'Güncel', val: instr?.last_price_try != null ? formatCurrency(instr.last_price_try) : '—' },
                    { label: 'Para Birimi', val: t.currency || 'TRY' },
                  ].map((d) => (
                    <View key={d.label} style={{ width: '31%', paddingVertical: 4 }}>
                      <Text style={{ fontSize: 9, color: colors.textTer }}>{d.label}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSec, marginTop: 1 }}>{d.val}</Text>
                    </View>
                  ))}
                </View>

                {/* K/Z highlight */}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  marginTop: 8, padding: 8, borderRadius: 8,
                  backgroundColor: positive ? 'rgba(14,203,129,0.08)' : 'rgba(246,70,93,0.08)',
                }}>
                  <Text style={{ fontSize: 11, color: colors.textSec }}>Kar / Zarar</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: positive ? colors.green : colors.red }}>
                    {formatCurrency(pl)} ({(plPct ?? 0).toFixed(2)}%)
                  </Text>
                </View>

                {/* Secondary tags */}
                {secTags.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 4 }}>
                    {secTags.map((tag) => (
                      <View key={tag} style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ fontSize: 9, color: colors.textSec }}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Date */}
                <Text style={{ fontSize: 10, color: colors.textTer, marginTop: 8 }}>
                  {formatDate(t.created_at)}
                </Text>

                {/* Actions */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => { setEditingTransaction(t); setShowForm(true); }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, backgroundColor: 'rgba(240,185,11,0.12)' }}>
                    <Feather name="edit-2" size={13} color={colors.accent} />
                    <Text style={{ fontSize: 11, color: colors.accent, marginLeft: 5, fontWeight: '600' }}>Düzenle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setSellingTransaction(t)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, backgroundColor: 'rgba(14,203,129,0.1)' }}>
                    <Feather name="trending-down" size={13} color={colors.green} />
                    <Text style={{ fontSize: 11, color: colors.green, marginLeft: 5, fontWeight: '600' }}>Sat</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDeleteId(t.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, backgroundColor: 'rgba(246,70,93,0.1)' }}>
                    <Feather name="trash-2" size={13} color={colors.red} />
                    <Text style={{ fontSize: 11, color: colors.red, marginLeft: 5, fontWeight: '600' }}>Sil</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const plPositive = totals.totalPL >= 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={sortedList}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderTransaction}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          <View>
            {/* Search */}
            <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12 }}>
                <Feather name="search" size={16} color={colors.textTer} />
                <TextInput
                  value={searchText} onChangeText={setSearchText}
                  placeholder="Sembol, ad veya etiket ara..."
                  placeholderTextColor={colors.textTer}
                  style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, fontSize: 14, color: colors.textPri }}
                />
                {searchText ? (
                  <TouchableOpacity onPress={() => setSearchText('')} hitSlop={8}>
                    <Feather name="x-circle" size={16} color={colors.textTer} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {/* Summary hero card */}
            <View style={{
              marginHorizontal: 16, marginBottom: 10, borderRadius: 12,
              backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 14,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 10, color: colors.textTer }}>Toplam Değer</Text>
                  <Text style={{ fontSize: 22, fontWeight: '700', color: colors.textPri, marginTop: 2 }}>
                    {formatCurrency(totals.totalValue)}
                  </Text>
                </View>
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                  backgroundColor: plPositive ? 'rgba(14,203,129,0.15)' : 'rgba(246,70,93,0.15)',
                }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: plPositive ? colors.green : colors.red }}>
                    {plPositive ? '+' : ''}{(totals.plPct ?? 0).toFixed(2)}%
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, color: colors.textTer }}>Maliyet</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSec, marginTop: 2 }} numberOfLines={1}>
                    {formatCurrency(totals.totalCost)}
                  </Text>
                </View>
                <View style={{ width: 1, backgroundColor: colors.border }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, color: colors.textTer }}>Gerçekleşmemiş K/Z</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: plPositive ? colors.green : colors.red, marginTop: 2 }} numberOfLines={1}>
                    {formatCurrency(totals.totalPL)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Tag donuts — buttons always side by side, expanded content below */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: openChart ? 0 : 10 }}>
              <TagDonutSection
                title="Birincil" expanded={false}
                onToggle={() => setOpenChart(openChart === 'primary' ? null : 'primary')}
                colors={colors} slices={primaryPieSlices} size={130}
                selectedKey={filterPrimaryTag}
                onSelectSlice={(key) => setFilterPrimaryTag(key)}
                style={{ flex: 1, borderColor: openChart === 'primary' ? colors.accent + '60' : colors.border }}
              />
              <TagDonutSection
                title="İkincil" expanded={false}
                onToggle={() => setOpenChart(openChart === 'secondary' ? null : 'secondary')}
                colors={colors} slices={secondaryPieSlices} size={130}
                selectedKey={filterSecondaryTag}
                onSelectSlice={(key) => setFilterSecondaryTag(key)}
                style={{ flex: 1, borderColor: openChart === 'secondary' ? colors.accent + '60' : colors.border }}
              />
            </View>
            {openChart === 'primary' && primaryPieSlices.length > 0 && (() => {
              const total = primaryPieSlices.reduce((s, x) => s + x.value, 0);
              if (total <= 0) return null;
              const sz = 170;
              const cx = sz / 2; const cy = sz / 2;
              const rO = sz * 0.42; const rI = sz * 0.26;
              let ang = 0;
              const ps = primaryPieSlices.map((sl, i) => {
                const frac = sl.value / total;
                const sw = frac * 360; const st = ang; const en = ang + sw; ang = en;
                const d = frac > 0 ? donutSlicePath(cx, cy, rO, rI, st, en) : '';
                return { ...sl, d, frac, color: PIE_COLORS[i % PIE_COLORS.length] };
              });
              const sel = filterPrimaryTag ? ps.find(p => p.key === filterPrimaryTag) : null;
              return (
                <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 10, padding: 12, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent + '30' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Svg width={sz} height={sz}>
                      <G>{ps.map(p => p.d ? <Path key={p.key} d={p.d} fill={p.color} opacity={filterPrimaryTag && filterPrimaryTag !== p.key ? 0.25 : 1} onPress={() => setFilterPrimaryTag(filterPrimaryTag === p.key ? null : p.key)} /> : null)}</G>
                      {sel && (<><SvgText x={cx} y={cy - 5} textAnchor="middle" fontSize={11} fontWeight="700" fill={colors.textPri}>{sel.label}</SvgText><SvgText x={cx} y={cy + 10} textAnchor="middle" fontSize={10} fill={colors.textTer}>{compactCurrency(sel.value)}</SvgText></>)}
                    </Svg>
                    <View style={{ flex: 1, marginLeft: 10, gap: 3 }}>
                      {ps.map(p => (
                        <TouchableOpacity key={p.key} onPress={() => setFilterPrimaryTag(filterPrimaryTag === p.key ? null : p.key)} activeOpacity={0.6}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6, backgroundColor: filterPrimaryTag === p.key ? 'rgba(240,185,11,0.12)' : 'transparent' }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color, marginRight: 8 }} />
                          <Text style={{ fontSize: 11, color: colors.textPri, flex: 1 }} numberOfLines={1}>{p.label}</Text>
                          <Text style={{ fontSize: 10, color: colors.textTer, marginLeft: 4 }}>{compactCurrency(p.value)}</Text>
                          <Text style={{ fontSize: 10, color: colors.textTer, width: 32, textAlign: 'right' }}>{(p.frac * 100).toFixed(0)}%</Text>
                        </TouchableOpacity>
                      ))}
                      {filterPrimaryTag && (
                        <TouchableOpacity onPress={() => setFilterPrimaryTag(null)} style={{ alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8, marginTop: 2 }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.accent }}>Tümünü Göster</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            })()}
            {openChart === 'secondary' && secondaryPieSlices.length > 0 && (() => {
              const total = secondaryPieSlices.reduce((s, x) => s + x.value, 0);
              if (total <= 0) return null;
              const sz = 170;
              const cx = sz / 2; const cy = sz / 2;
              const rO = sz * 0.42; const rI = sz * 0.26;
              let ang = 0;
              const ps = secondaryPieSlices.map((sl, i) => {
                const frac = sl.value / total;
                const sw = frac * 360; const st = ang; const en = ang + sw; ang = en;
                const d = frac > 0 ? donutSlicePath(cx, cy, rO, rI, st, en) : '';
                return { ...sl, d, frac, color: PIE_COLORS[i % PIE_COLORS.length] };
              });
              const sel = filterSecondaryTag ? ps.find(p => p.key === filterSecondaryTag) : null;
              return (
                <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 10, padding: 12, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent + '30' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Svg width={sz} height={sz}>
                      <G>{ps.map(p => p.d ? <Path key={p.key} d={p.d} fill={p.color} opacity={filterSecondaryTag && filterSecondaryTag !== p.key ? 0.25 : 1} onPress={() => setFilterSecondaryTag(filterSecondaryTag === p.key ? null : p.key)} /> : null)}</G>
                      {sel && (<><SvgText x={cx} y={cy - 5} textAnchor="middle" fontSize={11} fontWeight="700" fill={colors.textPri}>{sel.label}</SvgText><SvgText x={cx} y={cy + 10} textAnchor="middle" fontSize={10} fill={colors.textTer}>{compactCurrency(sel.value)}</SvgText></>)}
                    </Svg>
                    <View style={{ flex: 1, marginLeft: 10, gap: 3 }}>
                      {ps.map(p => (
                        <TouchableOpacity key={p.key} onPress={() => setFilterSecondaryTag(filterSecondaryTag === p.key ? null : p.key)} activeOpacity={0.6}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6, backgroundColor: filterSecondaryTag === p.key ? 'rgba(240,185,11,0.12)' : 'transparent' }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color, marginRight: 8 }} />
                          <Text style={{ fontSize: 11, color: colors.textPri, flex: 1 }} numberOfLines={1}>{p.label}</Text>
                          <Text style={{ fontSize: 10, color: colors.textTer, marginLeft: 4 }}>{compactCurrency(p.value)}</Text>
                          <Text style={{ fontSize: 10, color: colors.textTer, width: 32, textAlign: 'right' }}>{(p.frac * 100).toFixed(0)}%</Text>
                        </TouchableOpacity>
                      ))}
                      {filterSecondaryTag && (
                        <TouchableOpacity onPress={() => setFilterSecondaryTag(null)} style={{ alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8, marginTop: 2 }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.accent }}>Tümünü Göster</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            })()}

            {/* Sort + count bar */}
            <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSec }}>
                  {sortedList.length} pozisyon
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                {SORT_OPTIONS.map((opt) => {
                  const active = sortKey === opt.key;
                  return (
                    <TouchableOpacity key={opt.key} onPress={() => setSortKey(opt.key)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 3,
                        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                        backgroundColor: active ? colors.accent : colors.surfaceAlt,
                      }}>
                      <Feather name={opt.icon} size={10} color={active ? '#181A20' : colors.textTer} />
                      <Text style={{ fontSize: 10, fontWeight: '600', color: active ? '#181A20' : colors.textTer }}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 72, paddingHorizontal: 28 }}>
            <Feather name="briefcase" size={48} color={colors.textTer} />
            <Text style={{ fontSize: 17, fontWeight: '600', color: colors.textPri, marginTop: 16 }}>İşlem bulunamadı</Text>
            <Text style={{ fontSize: 13, color: colors.textSec, textAlign: 'center', marginTop: 8 }}>
              {debouncedSearch || filterPrimaryTag || filterSecondaryTag
                ? 'Filtreleri sıfırlamayı veya aramayı değiştirmeyi deneyin.'
                : 'İşlem ekleyerek başlayın.'}
            </Text>
            {!debouncedSearch && !filterPrimaryTag && !filterSecondaryTag && (
              <TouchableOpacity
                onPress={() => { setEditingTransaction(null); setShowForm(true); }}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 18 }}>
                <Feather name="plus" size={18} color="#0B0E11" />
                <Text style={{ color: '#0B0E11', fontWeight: '700', marginLeft: 8 }}>İşlem Ekle</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* FAB */}
      <TouchableOpacity
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setEditingTransaction(null); setShowForm(true); }}
        activeOpacity={0.85}
        style={{
          position: 'absolute', right: 20, bottom: 28,
          width: 52, height: 52, borderRadius: 26,
          backgroundColor: colors.accent,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 6, elevation: 8,
        }}>
        <Feather name="plus" size={24} color="#0B0E11" />
      </TouchableOpacity>

      <TransactionForm
        visible={showForm} editTransaction={editingTransaction}
        onClose={() => { setShowForm(false); setEditingTransaction(null); }}
        onSaved={() => { setShowForm(false); setEditingTransaction(null); load(); }}
      />
      <SellForm
        visible={!!sellingTransaction} transaction={sellingTransaction}
        instrument={sellingTransaction ? instrumentMap[sellingTransaction.instrument_id] : null}
        onClose={() => setSellingTransaction(null)}
        onSold={() => { setSellingTransaction(null); load(); }}
      />
      <ConfirmDialog
        visible={!!deleteId} title="İşlemi Sil"
        message="Bu işlemi silmek istediğinize emin misiniz?"
        onConfirm={handleDelete} onCancel={() => setDeleteId(null)} destructive
      />
    </View>
  );
}
