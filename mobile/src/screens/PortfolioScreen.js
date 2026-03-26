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
import Svg, { Path, G } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import {
  getDebugTransactions,
  deleteTransaction,
  getInstruments,
  createPortfolioSnapshot,
} from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import { useTheme } from '../contexts/ThemeContext';
import TransactionForm from '../components/TransactionForm';
import SellForm from '../components/SellForm';
import ConfirmDialog from '../components/ConfirmDialog';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';

const PIE_COLORS = ['#F0B90B', '#0ECB81', '#F6465D', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

const HORIZON_LABELS = {
  trade: 'Trade',
  short: 'Kısa',
  mid: 'Orta',
  long: 'Uzun',
};

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
    'M',
    p1.x,
    p1.y,
    'A',
    rOuter,
    rOuter,
    0,
    large,
    1,
    p2.x,
    p2.y,
    'L',
    p3.x,
    p3.y,
    'A',
    rInner,
    rInner,
    0,
    large,
    0,
    p4.x,
    p4.y,
    'Z',
  ].join(' ');
}

function parseSecondaryTags(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function TagDonutSection({
  title,
  expanded,
  onToggle,
  colors,
  slices,
  size,
  selectedKey,
  onSelectSlice,
  emptyHint,
}) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.38;
  const rInner = size * 0.22;
  const total = slices.reduce((s, x) => s + x.value, 0);

  let angle = 0;
  const paths = slices.map((sl, i) => {
    const frac = total > 0 ? sl.value / total : 0;
    const sweep = frac * 360;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const d = total > 0 && frac > 0 ? donutSlicePath(cx, cy, rOuter, rInner, start, end) : '';
    return { ...sl, d, color: PIE_COLORS[i % PIE_COLORS.length] };
  });

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPri }}>{title}</Text>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSec} />
      </TouchableOpacity>
      {expanded ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          {total <= 0 ? (
            <Text style={{ fontSize: 13, color: colors.textTer, textAlign: 'center', paddingVertical: 16 }}>
              {emptyHint}
            </Text>
          ) : (
            <>
              <View style={{ alignItems: 'center' }}>
                <Svg width={size} height={size}>
                  <G>
                    {paths.map((p) =>
                      p.d ? (
                        <Path
                          key={p.key}
                          d={p.d}
                          fill={p.color}
                          opacity={selectedKey != null && selectedKey !== p.key ? 0.35 : 1}
                          onPress={() => onSelectSlice(p.key === selectedKey ? null : p.key)}
                        />
                      ) : null,
                    )}
                  </G>
                </Svg>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 8 }}>
                {paths.map((p) => (
                  <TouchableOpacity
                    key={p.key}
                    onPress={() => onSelectSlice(p.key === selectedKey ? null : p.key)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: colors.surfaceAlt,
                      borderWidth: selectedKey != null && selectedKey === p.key ? 1 : 0,
                      borderColor: colors.accent,
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: p.color,
                        marginRight: 6,
                      }}
                    />
                    <Text style={{ fontSize: 12, color: colors.textSec, maxWidth: 140 }} numberOfLines={1}>
                      {p.label}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textTer, marginLeft: 4 }}>
                      {((p.value / total) * 100).toFixed(0)}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                onPress={() => onSelectSlice(null)}
                style={{
                  marginTop: 12,
                  alignSelf: 'center',
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  backgroundColor: colors.surfaceAlt,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.accent }}>{'Tümü'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

export default function PortfolioScreen() {
  const { colors } = useTheme();

  const [transactions, setTransactions] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterPrimaryTag, setFilterPrimaryTag] = useState(null);
  const [filterSecondaryTag, setFilterSecondaryTag] = useState(null);
  const [primaryChartOpen, setPrimaryChartOpen] = useState(true);
  const [secondaryChartOpen, setSecondaryChartOpen] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [sellingTransaction, setSellingTransaction] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const searchTimer = useRef(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchText]);

  const load = useCallback(async () => {
    try {
      const [tRes, iRes] = await Promise.all([getDebugTransactions(), getInstruments()]);
      setTransactions(tRes.data || []);
      setInstruments(iRes.data || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const instrumentMap = useMemo(() => {
    const map = {};
    instruments.forEach((i) => {
      map[i.id] = i;
    });
    return map;
  }, [instruments]);

  const activeTransactions = useMemo(
    () => transactions.filter((t) => t.type === 'buy' && !t.is_sold),
    [transactions],
  );

  const transactionCost = useCallback((t) => (t.quantity || 0) * (t.price || 0) + (t.fees || 0), []);

  const transactionMarketValue = useCallback(
    (t) => {
      const instr = instrumentMap[t.instrument_id];
      const unit = instr?.last_price_try != null ? instr.last_price_try : t.price || 0;
      return (t.quantity || 0) * unit;
    },
    [instrumentMap],
  );

  const matchesSearch = useCallback(
    (t) => {
      if (!debouncedSearch) return true;
      const q = debouncedSearch.toLowerCase();
      const instr = instrumentMap[t.instrument_id];
      const sym = (instr?.symbol || '').toLowerCase();
      const nm = (instr?.name || '').toLowerCase();
      const pt = (t.primary_tag || '').toLowerCase();
      const sec = parseSecondaryTags(t.secondary_tags)
        .join(' ')
        .toLowerCase();
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
      by[key] = (by[key] || 0) + transactionCost(t);
    });
    return Object.entries(by)
      .map(([key, value]) => ({ key, label: key, value }))
      .sort((a, b) => b.value - a.value);
  }, [primaryPieSource, transactionCost]);

  const secondaryPieSlices = useMemo(() => {
    const by = {};
    secondaryPieSource.forEach((t) => {
      const tags = parseSecondaryTags(t.secondary_tags);
      const c = transactionCost(t);
      if (tags.length === 0) {
        const key = '—';
        by[key] = (by[key] || 0) + c;
      } else {
        const share = c / tags.length;
        tags.forEach((tag) => {
          by[tag] = (by[tag] || 0) + share;
        });
      }
    });
    return Object.entries(by)
      .map(([key, value]) => ({ key, label: key, value }))
      .sort((a, b) => b.value - a.value);
  }, [secondaryPieSource, transactionCost]);

  const listFiltered = useMemo(
    () => searchFiltered.filter((t) => matchesPrimaryFilter(t) && matchesSecondaryFilter(t)),
    [searchFiltered, matchesPrimaryFilter, matchesSecondaryFilter],
  );

  const totals = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;
    listFiltered.forEach((t) => {
      totalValue += transactionMarketValue(t);
      totalCost += transactionCost(t);
    });
    const totalPL = totalValue - totalCost;
    const plPct = totalCost > 0 ? (totalPL / totalCost) * 100 : null;
    return { totalValue, totalCost, totalPL, plPct };
  }, [listFiltered, transactionCost, transactionMarketValue]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteTransaction(deleteId);
      Toast.show({ type: 'success', text1: 'İşlem silindi' });
      load();
    } catch {
      /* ignore */
    }
    setDeleteId(null);
  };

  const handleSnapshot = async () => {
    try {
      await createPortfolioSnapshot();
      Toast.show({ type: 'success', text1: 'Snapshot oluşturuldu' });
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: err.response?.data?.detail || 'Snapshot oluşturulamadı',
      });
    }
  };

  const renderTransaction = ({ item: t }) => {
    const instr = instrumentMap[t.instrument_id];
    const cost = transactionCost(t);
    const marketVal = transactionMarketValue(t);
    const pl = marketVal - cost;
    const plPctRow = cost > 0 ? (pl / cost) * 100 : null;
    const symbol = instr?.symbol || '#';
    const name = instr?.name || '';
    const secTags = parseSecondaryTags(t.secondary_tags);
    const horizonKey = t.horizon;
    const horizonLabel = HORIZON_LABELS[horizonKey] || (t.horizon ? String(t.horizon) : '');

    return (
      <View
        style={{
          borderRadius: 14,
          padding: 14,
          marginHorizontal: 16,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPri }}>{String(symbol)}</Text>
              {t.primary_tag ? (
                <View
                  style={{
                    marginLeft: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                    backgroundColor: colors.surfaceAlt,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '600', color: colors.accent }}>
                    {String(t.primary_tag)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontSize: 12, color: colors.textTer, marginTop: 2 }} numberOfLines={2}>
              {String(name)}
            </Text>
            {secTags.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6 }}>
                {secTags.map((tag) => (
                  <View
                    key={tag}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 6,
                      backgroundColor: colors.surfaceAlt,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 10, color: colors.textSec }}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPri }}>
              {formatCurrency(marketVal)}
            </Text>
            <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 2 }}>
              {String(t.currency || 'TRY')}
            </Text>
          </View>
        </View>

        <Text style={{ fontSize: 11, color: colors.textSec, marginTop: 10 }}>
          {String(t.quantity || 0)}
          {' × '}
          {formatCurrency(t.price)}
          {t.fees ? `  +  ${formatCurrency(t.fees)} kom.` : ''}
        </Text>
        <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 4 }}>
          {'Maliyet: '}
          {formatCurrency(cost)}
          {'  •  K/Z: '}
          <Text style={{ color: pl >= 0 ? colors.green : colors.red, fontWeight: '600' }}>
            {formatCurrency(pl)} ({(plPctRow ?? 0).toFixed(2)}%)
          </Text>
        </Text>
        <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 4 }}>
          {formatDate(t.created_at)}
          {horizonLabel ? `  •  ${horizonLabel}` : ''}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            marginTop: 12,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <TouchableOpacity
            onPress={() => {
              setEditingTransaction(t);
              setShowForm(true);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', padding: 6 }}
            hitSlop={10}
          >
            <Feather name="edit-2" size={16} color={colors.accent} />
            <Text style={{ fontSize: 12, color: colors.accent, marginLeft: 6 }}>{'Düzenle'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSellingTransaction(t)}
            style={{ flexDirection: 'row', alignItems: 'center', padding: 6, marginLeft: 12 }}
            hitSlop={10}
          >
            <Feather name="trending-down" size={16} color={colors.red} />
            <Text style={{ fontSize: 12, color: colors.red, marginLeft: 6 }}>{'Sat'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setDeleteId(t.id)}
            style={{ flexDirection: 'row', alignItems: 'center', padding: 6, marginLeft: 12 }}
            hitSlop={10}
          >
            <Feather name="trash-2" size={16} color={colors.red} />
            <Text style={{ fontSize: 12, color: colors.red, marginLeft: 6 }}>{'Sil'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };


  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={listFiltered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderTransaction}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: 44,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                }}
              >
                <Feather name="search" size={18} color={colors.textTer} />
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Sembol, ad veya etiket ara..."
                  placeholderTextColor={colors.textTer}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    fontSize: 15,
                    color: colors.textPri,
                  }}
                />
                {searchText ? (
                  <TouchableOpacity onPress={() => setSearchText('')} hitSlop={8}>
                    <Feather name="x-circle" size={18} color={colors.textTer} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <TagDonutSection
              title="Birincil etiket — maliyet dağılımı"
              expanded={primaryChartOpen}
              onToggle={() => setPrimaryChartOpen((v) => !v)}
              colors={colors}
              slices={primaryPieSlices}
              size={200}
              selectedKey={filterPrimaryTag}
              onSelectSlice={(key) => {
                if (key === null) setFilterPrimaryTag(null);
                else setFilterPrimaryTag(key);
              }}
              emptyHint="Gösterilecek işlem yok."
            />

            <TagDonutSection
              title="İkincil etiket — maliyet dağılımı"
              expanded={secondaryChartOpen}
              onToggle={() => setSecondaryChartOpen((v) => !v)}
              colors={colors}
              slices={secondaryPieSlices}
              size={200}
              selectedKey={filterSecondaryTag}
              onSelectSlice={(key) => {
                if (key === null) setFilterSecondaryTag(null);
                else setFilterSecondaryTag(key);
              }}
              emptyHint="Gösterilecek işlem yok."
            />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, marginBottom: 12 }}>
              {[
                { label: 'Toplam Değer', value: formatCurrency(totals.totalValue), color: colors.textPri },
                { label: 'Toplam Maliyet', value: formatCurrency(totals.totalCost), color: colors.textSec },
                {
                  label: 'Toplam K/Z',
                  value: formatCurrency(totals.totalPL),
                  color: totals.totalPL >= 0 ? colors.green : colors.red,
                  sub: `${(totals.plPct ?? 0).toFixed(2)}%`,
                },
              ].map((card) => (
                <View
                  key={card.label}
                  style={{
                    flexGrow: 1,
                    minWidth: '30%',
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: 11, color: colors.textTer, marginBottom: 4 }}>{card.label}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: card.color }}>{card.value}</Text>
                  {card.sub ? (
                    <Text style={{ fontSize: 11, color: card.color, marginTop: 2 }}>{card.sub}</Text>
                  ) : null}
                </View>
              ))}
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingBottom: 10,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.textSec }}>
                {String(listFiltered.length)}
                {' pozisyon'}
              </Text>
              <TouchableOpacity onPress={handleSnapshot} hitSlop={8} style={{ padding: 4 }}>
                <Feather name="camera" size={20} color={colors.textTer} />
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 72, paddingHorizontal: 28 }}>
            <Feather name="briefcase" size={48} color={colors.textTer} />
            <Text style={{ fontSize: 17, fontWeight: '600', color: colors.textPri, marginTop: 16 }}>
              {'İşlem bulunamadı'}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSec, textAlign: 'center', marginTop: 8 }}>
              {debouncedSearch || filterPrimaryTag || filterSecondaryTag
                ? 'Filtreleri sıfırlamayı veya aramayı değiştirmeyi deneyin.'
                : 'İşlem ekleyerek başlayın.'}
            </Text>
            {!debouncedSearch && !filterPrimaryTag && !filterSecondaryTag ? (
              <TouchableOpacity
                onPress={() => {
                  setEditingTransaction(null);
                  setShowForm(true);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.accent,
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderRadius: 12,
                  marginTop: 18,
                }}
              >
                <Feather name="plus" size={18} color="#0B0E11" />
                <Text style={{ color: '#0B0E11', fontWeight: '700', marginLeft: 8 }}>{'İşlem Ekle'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setEditingTransaction(null);
          setShowForm(true);
        }}
        activeOpacity={0.85}
        style={{
          position: 'absolute',
          right: 20,
          bottom: 28,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 6,
          elevation: 8,
        }}
      >
        <Feather name="plus" size={26} color="#0B0E11" />
      </TouchableOpacity>

      <TransactionForm
        visible={showForm}
        editTransaction={editingTransaction}
        onClose={() => {
          setShowForm(false);
          setEditingTransaction(null);
        }}
        onSaved={() => {
          setShowForm(false);
          setEditingTransaction(null);
          load();
        }}
      />

      <SellForm
        visible={!!sellingTransaction}
        transaction={sellingTransaction}
        instrument={sellingTransaction ? instrumentMap[sellingTransaction.instrument_id] : null}
        onClose={() => setSellingTransaction(null)}
        onSold={() => {
          setSellingTransaction(null);
          load();
        }}
      />

      <ConfirmDialog
        visible={!!deleteId}
        title="İşlemi Sil"
        message="Bu işlemi silmek istediğinize emin misiniz?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        destructive
      />
    </View>
  );
}
