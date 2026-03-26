import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Dimensions, RefreshControl, Modal, FlatList, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Path, Text as SvgText, Line as SvgLine, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { getPortfolioSnapshots, compareSnapshots, createPortfolioSnapshot } from '../services/api';
import { formatCurrency, formatDate, formatPercent } from '../utils/format';
import { useTheme } from '../contexts/ThemeContext';
import Toast from 'react-native-toast-message';

const SW = Dimensions.get('window').width;

/* ─────────── Snapshot Picker Sheet ─────────── */

function SnapshotSheet({ visible, onClose, snapshots, onSelect, selectedId, colors, title }) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '65%', paddingBottom: Platform.OS === 'ios' ? 34 : 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPri }}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="x" size={16} color={colors.textSec} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={snapshots}
            keyExtractor={s => String(s.id)}
            renderItem={({ item }) => {
              const active = String(item.id) === selectedId;
              return (
                <TouchableOpacity
                  onPress={() => { onSelect(String(item.id)); onClose(); }}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: active ? 'rgba(240,185,11,0.06)' : 'transparent' }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: active ? colors.accent : colors.border, marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: active ? colors.accent : colors.textPri, fontWeight: active ? '700' : '500' }}>
                      {formatDate(item.snapshot_date)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.textTer, fontWeight: '500' }}>
                    {formatCurrency(item.total_market_value)}
                  </Text>
                  {active && <Feather name="check" size={16} color={colors.accent} style={{ marginLeft: 8 }} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

/* ─────────── Bar Chart ─────────── */

function InstrumentBars({ instruments, colors, sortKey }) {
  const sorted = useMemo(() => {
    const items = [...instruments];
    items.sort((a, b) => {
      const av = Math.abs(a[sortKey] ?? 0);
      const bv = Math.abs(b[sortKey] ?? 0);
      return bv - av;
    });
    return items.slice(0, 10);
  }, [instruments, sortKey]);

  if (sorted.length === 0) return null;
  const vals = sorted.map(i => i[sortKey] ?? 0);
  const absMax = Math.max(...vals.map(Math.abs), 1);
  const width = SW - 48;
  const labelW = 52;
  const chartW = width - labelW - 50;
  const barH = 24;
  const gap = 6;
  const height = sorted.length * (barH + gap);

  return (
    <Svg width={width} height={height}>
      {sorted.map((item, i) => {
        const v = item[sortKey] ?? 0;
        const isPos = v >= 0;
        const y = i * (barH + gap);
        const barW = Math.max((Math.abs(v) / absMax) * chartW, 3);
        const x = labelW;
        const r = Math.min(4, barH / 2);
        const d = `M${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${y + barH - r} Q${x + barW},${y + barH} ${x + barW - r},${y + barH} L${x + r},${y + barH} Q${x},${y + barH} ${x},${y + barH - r} Z`;
        const fmtV = sortKey === 'price_change_pct' || sortKey === 'value_change_pct'
          ? `${isPos ? '+' : ''}${(v).toFixed(1)}%`
          : `${isPos ? '+' : ''}${(v / 1000).toFixed(v >= 10000 || v <= -10000 ? 0 : 1)}K`;
        return [
          <SvgText key={`l-${i}`} x={labelW - 6} y={y + barH / 2 + 4} fontSize={10} fontWeight="600" fill={colors.textSec} textAnchor="end">
            {item.symbol}
          </SvgText>,
          <Path key={`b-${i}`} d={d} fill={isPos ? colors.green : colors.red} opacity={0.8} />,
          <SvgText key={`v-${i}`} x={x + barW + 6} y={y + barH / 2 + 4} fontSize={9} fontWeight="600" fill={isPos ? colors.green : colors.red}>
            {fmtV}
          </SvgText>,
        ];
      })}
    </Svg>
  );
}

/* ─────────── Sort Chips ─────────── */

const SORT_OPTIONS = [
  { key: 'value_change_try', label: 'Değer Değişimi' },
  { key: 'value_change_pct', label: 'Değer %' },
  { key: 'price_change_pct', label: 'Fiyat %' },
];

/* ─────────── Main Screen ─────────── */

export default function PerformanceScreen() {
  const { colors } = useTheme();
  const [snapshots, setSnapshots] = useState([]);
  const [snap1, setSnap1] = useState('');
  const [snap2, setSnap2] = useState('');
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [sortKey, setSortKey] = useState('value_change_try');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await getPortfolioSnapshots(50);
      const snaps = Array.isArray(res?.data) ? res.data : [];
      setSnapshots(snaps);
      if (snaps.length >= 2 && !snap1) {
        setSnap1(String(snaps[snaps.length - 1].id));
        setSnap2(String(snaps[0].id));
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const compare = useCallback(async () => {
    if (!snap1 || !snap2 || snap1 === snap2) return;
    setComparing(true);
    try {
      const res = await compareSnapshots(snap1, snap2);
      setComparison(res.data);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Karşılaştırma başarısız' });
    } finally { setComparing(false); }
  }, [snap1, snap2]);

  useEffect(() => { compare(); }, [compare]);

  const handleCreateSnapshot = async () => {
    setCreating(true);
    try {
      await createPortfolioSnapshot();
      Toast.show({ type: 'success', text1: 'Snapshot oluşturuldu' });
      load();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Oluşturulamadı' });
    } finally { setCreating(false); }
  };

  const snap1Obj = snapshots.find(s => String(s.id) === snap1);
  const snap2Obj = snapshots.find(s => String(s.id) === snap2);

  const startVal = comparison?.snapshot1?.total_value ?? comparison?.start_value ?? 0;
  const endVal = comparison?.snapshot2?.total_value ?? comparison?.end_value ?? 0;
  const valChange = comparison?.portfolio_change?.value_change ?? comparison?.value_change ?? (endVal - startVal);
  const pctChange = comparison?.portfolio_change?.value_change_pct ?? comparison?.change_percentage ?? 0;
  const changePositive = valChange >= 0;

  const instruments = useMemo(() => {
    if (!comparison?.instruments) return [];
    return [...comparison.instruments].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return Math.abs(bv) - Math.abs(av);
    });
  }, [comparison, sortKey]);

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {snapshots.length < 2 ? (
          /* ─── Empty State ─── */
          <View style={{ alignItems: 'center', paddingVertical: 64 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Feather name="bar-chart-2" size={32} color={colors.textTer} />
            </View>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPri, marginBottom: 6 }}>Snapshot Gerekli</Text>
            <Text style={{ fontSize: 13, color: colors.textSec, textAlign: 'center', lineHeight: 20, marginBottom: 24, paddingHorizontal: 32 }}>
              Performans analizi için en az 2 snapshot gerekli.{'\n'}Mevcut: {snapshots.length}
            </Text>
            <TouchableOpacity onPress={handleCreateSnapshot} disabled={creating}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, opacity: creating ? 0.5 : 1 }}>
              <Feather name="camera" size={16} color="#0B0E11" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#0B0E11' }}>{creating ? 'Oluşturuluyor...' : 'Snapshot Oluştur'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ─── Snapshot Selector ─── */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPri }}>Karşılaştır</Text>
                <TouchableOpacity onPress={handleCreateSnapshot} disabled={creating}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, opacity: creating ? 0.5 : 1 }}>
                  <Feather name="plus" size={12} color="#0B0E11" />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#0B0E11' }}>{creating ? '...' : 'Snapshot'}</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <TouchableOpacity onPress={() => setSheet('start')} activeOpacity={0.7}
                  style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
                  <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '600', letterSpacing: 0.3, marginBottom: 4 }}>BAŞLANGIÇ</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPri, flex: 1 }} numberOfLines={1}>
                      {snap1Obj ? formatDate(snap1Obj.snapshot_date) : 'Seç'}
                    </Text>
                    <Feather name="chevron-down" size={14} color={colors.textTer} />
                  </View>
                </TouchableOpacity>
                <View style={{ justifyContent: 'center' }}>
                  <Feather name="arrow-right" size={14} color={colors.textTer} />
                </View>
                <TouchableOpacity onPress={() => setSheet('end')} activeOpacity={0.7}
                  style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
                  <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '600', letterSpacing: 0.3, marginBottom: 4 }}>BİTİŞ</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPri, flex: 1 }} numberOfLines={1}>
                      {snap2Obj ? formatDate(snap2Obj.snapshot_date) : 'Seç'}
                    </Text>
                    <Feather name="chevron-down" size={14} color={colors.textTer} />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Quick select */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: -2 }}>
                <TouchableOpacity
                  onPress={() => { if (snapshots.length >= 2) { setSnap1(String(snapshots[snapshots.length - 1].id)); setSnap2(String(snapshots[0].id)); } }}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surfaceAlt, marginRight: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: colors.textSec }}>En eski → En yeni</Text>
                </TouchableOpacity>
                {snapshots.length >= 2 && (
                  <TouchableOpacity
                    onPress={() => { setSnap1(String(snapshots[1].id)); setSnap2(String(snapshots[0].id)); }}
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surfaceAlt, marginRight: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '500', color: colors.textSec }}>Son 2 snapshot</Text>
                  </TouchableOpacity>
                )}
                {snapshots.length >= 7 && (
                  <TouchableOpacity
                    onPress={() => { setSnap1(String(snapshots[Math.min(6, snapshots.length - 1)].id)); setSnap2(String(snapshots[0].id)); }}
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surfaceAlt }}>
                    <Text style={{ fontSize: 11, fontWeight: '500', color: colors.textSec }}>Son 7 gün</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>

            {comparing && <ActivityIndicator size="large" color={colors.accent} style={{ marginVertical: 24 }} />}

            {comparison && !comparing && (
              <>
                {/* ─── Hero Summary ─── */}
                <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: changePositive ? 'rgba(14,203,129,0.1)' : 'rgba(246,70,93,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Feather name={changePositive ? 'trending-up' : 'trending-down'} size={20} color={changePositive ? colors.green : colors.red} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 10, color: colors.textTer, fontWeight: '500', marginBottom: 2 }}>PORTFÖY DEĞİŞİMİ</Text>
                      <Text style={{ fontSize: 26, fontWeight: '800', color: changePositive ? colors.green : colors.red }} numberOfLines={1} adjustsFontSizeToFit>
                        {changePositive ? '+' : ''}{formatCurrency(valChange)}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: changePositive ? 'rgba(14,203,129,0.1)' : 'rgba(246,70,93,0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: changePositive ? colors.green : colors.red }}>
                        {changePositive ? '+' : ''}{pctChange.toFixed(2)}%
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 12 }}>
                      <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '500', letterSpacing: 0.3, marginBottom: 4 }}>BAŞLANGIÇ</Text>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPri }} numberOfLines={1} adjustsFontSizeToFit>
                        {formatCurrency(startVal)}
                      </Text>
                      {comparison?.snapshot1?.date && (
                        <Text style={{ fontSize: 9, color: colors.textTer, marginTop: 3 }}>{formatDate(comparison.snapshot1.date)}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 12 }}>
                      <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '500', letterSpacing: 0.3, marginBottom: 4 }}>BİTİŞ</Text>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPri }} numberOfLines={1} adjustsFontSizeToFit>
                        {formatCurrency(endVal)}
                      </Text>
                      {comparison?.snapshot2?.date && (
                        <Text style={{ fontSize: 9, color: colors.textTer, marginTop: 3 }}>{formatDate(comparison.snapshot2.date)}</Text>
                      )}
                    </View>
                  </View>
                </View>

                {/* ─── Chart Card ─── */}
                {instruments.length > 0 && (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, marginBottom: 12 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPri, marginBottom: 4 }}>Enstrüman Bazlı</Text>
                    {/* Sort chips */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, marginHorizontal: -2 }}>
                      {SORT_OPTIONS.map(opt => {
                        const active = sortKey === opt.key;
                        return (
                          <TouchableOpacity key={opt.key} onPress={() => setSortKey(opt.key)}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginRight: 6, backgroundColor: active ? colors.accent : colors.surfaceAlt }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: active ? '#0B0E11' : colors.textSec }}>{opt.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    <InstrumentBars instruments={instruments} colors={colors} sortKey={sortKey} />
                  </View>
                )}

                {/* ─── Instrument Details ─── */}
                {instruments.length > 0 && (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
                    <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPri }}>{instruments.length} Enstrüman</Text>
                    </View>
                    {instruments.map((inst, idx) => {
                      const vPct = inst.value_change_pct ?? 0;
                      const pPct = inst.price_change_pct ?? 0;
                      const vTry = inst.value_change_try ?? 0;
                      const pos = vTry >= 0;
                      const isExpanded = expanded === inst.instrument_id;
                      const qtyChange = (inst.current_quantity ?? 0) - (inst.previous_quantity ?? 0);

                      return (
                        <TouchableOpacity key={inst.instrument_id ?? idx} activeOpacity={0.7} onPress={() => setExpanded(isExpanded ? null : inst.instrument_id)}
                          style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: idx < instruments.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                          {/* Main row */}
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: pos ? 'rgba(14,203,129,0.08)' : 'rgba(246,70,93,0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                              <Feather name={pos ? 'arrow-up-right' : 'arrow-down-right'} size={14} color={pos ? colors.green : colors.red} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPri }}>{inst.symbol}</Text>
                              {inst.name ? <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 1 }} numberOfLines={1}>{inst.name}</Text> : null}
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: pos ? colors.green : colors.red }}>
                                {pos ? '+' : ''}{formatCurrency(vTry)}
                              </Text>
                              <Text style={{ fontSize: 11, color: pos ? colors.green : colors.red, marginTop: 1 }}>
                                {pPct >= 0 ? '+' : ''}{pPct.toFixed(2)}%
                              </Text>
                            </View>
                            <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textTer} style={{ marginLeft: 8 }} />
                          </View>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <View style={{ marginTop: 12, gap: 6 }}>
                              <View style={{ flexDirection: 'row', gap: 6 }}>
                                <View style={{ flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 10 }}>
                                  <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '500', marginBottom: 3 }}>FİYAT DEĞİŞİMİ</Text>
                                  <Text style={{ fontSize: 13, fontWeight: '700', color: pPct >= 0 ? colors.green : colors.red }}>
                                    {pPct >= 0 ? '+' : ''}{pPct.toFixed(2)}%
                                  </Text>
                                  <Text style={{ fontSize: 10, color: colors.textTer, marginTop: 2 }}>
                                    {formatCurrency(inst.previous_price)} → {formatCurrency(inst.current_price)}
                                  </Text>
                                </View>
                                <View style={{ flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 10 }}>
                                  <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '500', marginBottom: 3 }}>DEĞER DEĞİŞİMİ</Text>
                                  <Text style={{ fontSize: 13, fontWeight: '700', color: vPct >= 0 ? colors.green : colors.red }}>
                                    {vPct >= 0 ? '+' : ''}{vPct.toFixed(2)}%
                                  </Text>
                                  <Text style={{ fontSize: 10, color: colors.textTer, marginTop: 2 }}>
                                    {formatCurrency(inst.previous_value)} → {formatCurrency(inst.current_value)}
                                  </Text>
                                </View>
                              </View>
                              <View style={{ flexDirection: 'row', gap: 6 }}>
                                <View style={{ flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 10 }}>
                                  <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '500', marginBottom: 3 }}>ADET DEĞİŞİMİ</Text>
                                  <Text style={{ fontSize: 13, fontWeight: '700', color: qtyChange > 0 ? colors.green : qtyChange < 0 ? colors.red : colors.textPri }}>
                                    {qtyChange > 0 ? '+' : ''}{qtyChange.toFixed(2)}
                                  </Text>
                                  <Text style={{ fontSize: 10, color: colors.textTer, marginTop: 2 }}>
                                    {(inst.previous_quantity ?? 0).toFixed(2)} → {(inst.current_quantity ?? 0).toFixed(2)}
                                  </Text>
                                </View>
                                <View style={{ flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 10 }}>
                                  <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '500', marginBottom: 3 }}>ORT. MALİYET</Text>
                                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPri }}>
                                    {formatCurrency(inst.current_avg_cost ?? 0)}
                                  </Text>
                                  <Text style={{ fontSize: 10, color: colors.textTer, marginTop: 2 }}>
                                    Önceki: {formatCurrency(inst.previous_avg_cost ?? 0)}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Sheets */}
      <SnapshotSheet visible={sheet === 'start'} onClose={() => setSheet(null)} snapshots={snapshots}
        title="Başlangıç Snapshot" onSelect={setSnap1} selectedId={snap1} colors={colors} />
      <SnapshotSheet visible={sheet === 'end'} onClose={() => setSheet(null)} snapshots={snapshots}
        title="Bitiş Snapshot" onSelect={setSnap2} selectedId={snap2} colors={colors} />
    </View>
  );
}
