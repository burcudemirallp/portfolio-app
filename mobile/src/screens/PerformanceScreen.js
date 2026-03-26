import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Dimensions, RefreshControl, Modal, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Path, Line as SvgLine, Text as SvgText, Circle, G } from 'react-native-svg';
import { getPortfolioSnapshots, compareSnapshots } from '../services/api';
import { formatCurrency, formatDate, formatPercent } from '../utils/format';
import { useTheme } from '../contexts/ThemeContext';
import Toast from 'react-native-toast-message';

const SW = Dimensions.get('window').width;
const MONTH_NAMES = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const DAY_NAMES = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];

function compactCurrency(val) {
  if (val == null) return '—';
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return val.toFixed(0);
}

function buildSmoothPath(points) {
  if (!points?.length) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/* ─────────── Calendar Component ─────────── */

function SnapshotCalendar({ snapshots, selectedId, onSelect, colors, title, onClose }) {
  const snapshotDates = useMemo(() => {
    const map = {};
    snapshots.forEach(s => {
      const d = new Date(s.snapshot_date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      map[key] = s;
    });
    return map;
  }, [snapshots]);

  const selectedSnap = snapshots.find(s => String(s.id) === selectedId);
  const initDate = selectedSnap ? new Date(selectedSnap.snapshot_date) : new Date();
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const cellSize = Math.floor((SW - 80) / 7);

  return (
    <Modal visible animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 16 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPri }}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}
              style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="x" size={14} color={colors.textSec} />
            </TouchableOpacity>
          </View>

          {/* Month nav */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }}>
            <TouchableOpacity onPress={prevMonth} hitSlop={12} style={{ padding: 6 }}>
              <Feather name="chevron-left" size={20} color={colors.textSec} />
            </TouchableOpacity>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPri }}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} hitSlop={12} style={{ padding: 6 }}>
              <Feather name="chevron-right" size={20} color={colors.textSec} />
            </TouchableOpacity>
          </View>

          {/* Day names */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 4 }}>
            {DAY_NAMES.map(d => (
              <View key={d} style={{ width: cellSize, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: colors.textTer, fontWeight: '600' }}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Days grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingBottom: 12 }}>
            {calendarDays.map((day, idx) => {
              if (day == null) return <View key={`e-${idx}`} style={{ width: cellSize, height: cellSize }} />;
              const key = `${viewYear}-${viewMonth}-${day}`;
              const snap = snapshotDates[key];
              const hasSnap = !!snap;
              const isSelected = hasSnap && String(snap.id) === selectedId;
              const isToday = (() => {
                const t = new Date();
                return day === t.getDate() && viewMonth === t.getMonth() && viewYear === t.getFullYear();
              })();

              return (
                <TouchableOpacity
                  key={`d-${day}`}
                  disabled={!hasSnap}
                  onPress={() => { if (hasSnap) { onSelect(String(snap.id)); onClose(); } }}
                  style={{
                    width: cellSize, height: cellSize,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <View style={{
                    width: 34, height: 34, borderRadius: 17,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isSelected ? colors.accent : 'transparent',
                    borderWidth: isToday && !isSelected ? 1 : 0,
                    borderColor: colors.accent,
                  }}>
                    <Text style={{
                      fontSize: 13,
                      fontWeight: isSelected ? '700' : hasSnap ? '600' : '400',
                      color: isSelected ? '#0B0E11' : hasSnap ? colors.accent : colors.textTer,
                    }}>
                      {day}
                    </Text>
                  </View>
                  {hasSnap && !isSelected && (
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent, marginTop: 1 }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ─────────── Performance Chart ─────────── */

function PerformanceChart({ comparison, snapshots, snap1Id, snap2Id, colors }) {
  const chartW = SW - 48;
  const chartH = 180;
  const pad = { top: 20, right: 12, bottom: 28, left: 56 };
  const plotW = chartW - pad.left - pad.right;
  const plotH = chartH - pad.top - pad.bottom;

  const snap1 = snapshots.find(s => String(s.id) === snap1Id);
  const snap2 = snapshots.find(s => String(s.id) === snap2Id);
  if (!snap1 || !snap2 || !comparison) return null;

  const s1Val = comparison.snapshot1?.total_value ?? 0;
  const s2Val = comparison.snapshot2?.total_value ?? 0;
  const s1Cost = comparison.snapshot1?.total_cost ?? 0;
  const s2Cost = comparison.snapshot2?.total_cost ?? 0;

  const allVals = [s1Val, s2Val, s1Cost, s2Cost].filter(v => v > 0);
  if (allVals.length === 0) return null;
  const minV = Math.min(...allVals) * 0.95;
  const maxV = Math.max(...allVals) * 1.05;
  const range = maxV - minV || 1;

  const toY = (v) => pad.top + plotH * (1 - (v - minV) / range);

  const valPoints = [
    { x: pad.left, y: toY(s1Val) },
    { x: pad.left + plotW, y: toY(s2Val) },
  ];
  const costPoints = [
    { x: pad.left, y: toY(s1Cost) },
    { x: pad.left + plotW, y: toY(s2Cost) },
  ];

  const yTickCount = 4;
  const yTicks = [];
  for (let i = 0; i <= yTickCount; i++) {
    const val = minV + (range * i) / yTickCount;
    yTicks.push({ val, y: pad.top + plotH * (1 - i / yTickCount) });
  }

  const d1 = snap1.snapshot_date ? new Date(snap1.snapshot_date) : null;
  const d2 = snap2.snapshot_date ? new Date(snap2.snapshot_date) : null;
  const fmtD = (d) => d ? `${d.getDate()}/${d.getMonth() + 1}` : '';

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPri }}>Performans Grafiği</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 10, height: 3, borderRadius: 1.5, backgroundColor: colors.accent }} />
            <Text style={{ fontSize: 9, color: colors.textTer }}>Portföy Değeri</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 10, height: 3, borderRadius: 1.5, backgroundColor: colors.green, opacity: 0.6 }} />
            <Text style={{ fontSize: 9, color: colors.textTer }}>Toplam Yatırım</Text>
          </View>
        </View>
      </View>
      <Svg width={chartW} height={chartH}>
        {yTicks.map((t, i) => (
          <G key={`yt-${i}`}>
            <SvgLine x1={pad.left} y1={t.y} x2={chartW - pad.right} y2={t.y} stroke={colors.border} strokeWidth={0.5} strokeDasharray="4,4" />
            <SvgText x={pad.left - 6} y={t.y + 3} fontSize={9} fill={colors.textTer} textAnchor="end">
              {compactCurrency(t.val)}
            </SvgText>
          </G>
        ))}
        <SvgText x={pad.left} y={chartH - 4} fontSize={9} fill={colors.textTer} textAnchor="start">{fmtD(d1)}</SvgText>
        <SvgText x={pad.left + plotW} y={chartH - 4} fontSize={9} fill={colors.textTer} textAnchor="end">{fmtD(d2)}</SvgText>

        {/* Cost line (dashed) */}
        <SvgLine x1={costPoints[0].x} y1={costPoints[0].y} x2={costPoints[1].x} y2={costPoints[1].y}
          stroke={colors.green} strokeWidth={2} strokeDasharray="6,4" opacity={0.6} />
        <Circle cx={costPoints[0].x} cy={costPoints[0].y} r={3} fill={colors.green} opacity={0.6} />
        <Circle cx={costPoints[1].x} cy={costPoints[1].y} r={3} fill={colors.green} opacity={0.6} />

        {/* Value line */}
        <SvgLine x1={valPoints[0].x} y1={valPoints[0].y} x2={valPoints[1].x} y2={valPoints[1].y}
          stroke={colors.accent} strokeWidth={2.5} />
        <Circle cx={valPoints[0].x} cy={valPoints[0].y} r={4} fill={colors.accent} />
        <Circle cx={valPoints[1].x} cy={valPoints[1].y} r={4} fill={colors.accent} />
      </Svg>
    </View>
  );
}

/* ─────────── Main Screen ─────────── */

export default function PerformanceScreen() {
  const { colors } = useTheme();
  const [snapshots, setSnapshots] = useState([]);
  const [snap1, setSnap1] = useState('');
  const [snap2, setSnap2] = useState('');
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [calendarFor, setCalendarFor] = useState(null);
  const [tableSortKey, setTableSortKey] = useState('value_change_pct');
  const [tableSortDir, setTableSortDir] = useState('desc');
  const [expandedInstId, setExpandedInstId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await getPortfolioSnapshots(50);
      const snaps = Array.isArray(res?.data) ? res.data : [];
      setSnapshots(snaps);
      if (snaps.length >= 2 && !snap1) {
        setSnap1(String(snaps[0].id));
        setSnap2(String(snaps[snaps.length - 1].id));
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

  const snap1Obj = snapshots.find(s => String(s.id) === snap1);
  const snap2Obj = snapshots.find(s => String(s.id) === snap2);

  const startVal = comparison?.snapshot1?.total_value ?? 0;
  const endVal = comparison?.snapshot2?.total_value ?? 0;
  const startCost = comparison?.snapshot1?.total_cost ?? 0;
  const endCost = comparison?.snapshot2?.total_cost ?? 0;
  const valChange = comparison?.portfolio_change?.value_change ?? (endVal - startVal);
  const pctChange = comparison?.portfolio_change?.value_change_pct ?? 0;
  const changePositive = valChange >= 0;

  const { instruments, newInstruments, soldInstruments } = useMemo(() => {
    if (!comparison?.instruments) return { instruments: [], newInstruments: [], soldInstruments: [] };
    const existing = [];
    const added = [];
    const removed = [];
    for (const inst of comparison.instruments) {
      if (inst.status === 'new') added.push(inst);
      else if (inst.status === 'sold') removed.push(inst);
      else existing.push(inst);
    }
    existing.sort((a, b) => {
      let av, bv;
      switch (tableSortKey) {
        case 'symbol': av = (a.symbol || '').toLowerCase(); bv = (b.symbol || '').toLowerCase();
          return tableSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'price_change_pct': av = a.price_change_pct ?? 0; bv = b.price_change_pct ?? 0; break;
        case 'value_change_pct': av = a.value_change_pct ?? 0; bv = b.value_change_pct ?? 0; break;
        case 'current_value': av = (a.current_value ?? 0) - (a.previous_value ?? 0); bv = (b.current_value ?? 0) - (b.previous_value ?? 0); break;
        case 'quantity_change': av = (a.current_quantity ?? 0) - (a.previous_quantity ?? 0); bv = (b.current_quantity ?? 0) - (b.previous_quantity ?? 0); break;
        default: av = Math.abs((a.current_value ?? 0) - (a.previous_value ?? 0)); bv = Math.abs((b.current_value ?? 0) - (b.previous_value ?? 0)); break;
      }
      return tableSortDir === 'asc' ? av - bv : bv - av;
    });
    added.sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0));
    removed.sort((a, b) => (b.previous_value ?? 0) - (a.previous_value ?? 0));
    return { instruments: existing, newInstruments: added, soldInstruments: removed };
  }, [comparison, tableSortKey, tableSortDir]);

  const toggleSort = (key) => {
    if (tableSortKey === key) setTableSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setTableSortKey(key); setTableSortDir('desc'); }
  };

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
          <View style={{ alignItems: 'center', paddingVertical: 64 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Feather name="bar-chart-2" size={32} color={colors.textTer} />
            </View>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPri, marginBottom: 6 }}>Snapshot Gerekli</Text>
            <Text style={{ fontSize: 13, color: colors.textSec, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 }}>
              Performans analizi için en az 2 snapshot gerekli.{'\n'}Mevcut: {snapshots.length}
            </Text>
          </View>
        ) : (
          <>
            {/* ─── Date Selectors ─── */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPri, marginBottom: 12 }}>Karşılaştır</Text>

              {/* Calendar-style pickers */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <TouchableOpacity onPress={() => setCalendarFor('start')} activeOpacity={0.7}
                  style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
                  <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '600', letterSpacing: 0.3, marginBottom: 4 }}>BAŞLANGIÇ</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPri, flex: 1 }} numberOfLines={1}>
                      {snap1Obj ? formatDate(snap1Obj.snapshot_date) : 'Seç'}
                    </Text>
                    <Feather name="calendar" size={14} color={colors.accent} />
                  </View>
                </TouchableOpacity>
                <View style={{ justifyContent: 'center' }}>
                  <Feather name="arrow-right" size={14} color={colors.textTer} />
                </View>
                <TouchableOpacity onPress={() => setCalendarFor('end')} activeOpacity={0.7}
                  style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
                  <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '600', letterSpacing: 0.3, marginBottom: 4 }}>BİTİŞ</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPri, flex: 1 }} numberOfLines={1}>
                      {snap2Obj ? formatDate(snap2Obj.snapshot_date) : 'Seç'}
                    </Text>
                    <Feather name="calendar" size={14} color={colors.accent} />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Quick presets */}
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { label: 'Tümü', icon: 'maximize-2', action: () => { setSnap1(String(snapshots[0].id)); setSnap2(String(snapshots[snapshots.length - 1].id)); } },
                  ...(snapshots.length >= 2 ? [{ label: 'Son 2', icon: 'git-commit', action: () => { const n = snapshots.length; setSnap1(String(snapshots[n - 2].id)); setSnap2(String(snapshots[n - 1].id)); } }] : []),
                  ...(snapshots.length >= 7 ? [{ label: 'Son 7G', icon: 'calendar', action: () => { const n = snapshots.length; setSnap1(String(snapshots[Math.max(0, n - 7)].id)); setSnap2(String(snapshots[n - 1].id)); } }] : []),
                  ...(snapshots.length >= 30 ? [{ label: 'Son 30G', icon: 'calendar', action: () => { const n = snapshots.length; setSnap1(String(snapshots[Math.max(0, n - 30)].id)); setSnap2(String(snapshots[n - 1].id)); } }] : []),
                ].map((preset) => (
                  <TouchableOpacity key={preset.label} onPress={preset.action}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                      backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
                    }}>
                    <Feather name={preset.icon} size={10} color={colors.textTer} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSec }}>{preset.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {comparing && <ActivityIndicator size="large" color={colors.accent} style={{ marginVertical: 24 }} />}

            {comparison && !comparing && (
              <>
                {/* ─── Hero Summary ─── */}
                <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                    <View style={{
                      width: 38, height: 38, borderRadius: 12,
                      backgroundColor: changePositive ? 'rgba(14,203,129,0.1)' : 'rgba(246,70,93,0.1)',
                      alignItems: 'center', justifyContent: 'center', marginRight: 12,
                    }}>
                      <Feather name={changePositive ? 'trending-up' : 'trending-down'} size={18} color={changePositive ? colors.green : colors.red} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 10, color: colors.textTer, fontWeight: '500', marginBottom: 2 }}>PORTFÖY DEĞİŞİMİ</Text>
                      <Text style={{ fontSize: 22, fontWeight: '800', color: changePositive ? colors.green : colors.red }} numberOfLines={1} adjustsFontSizeToFit>
                        {changePositive ? '+' : ''}{formatCurrency(valChange)}
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: changePositive ? 'rgba(14,203,129,0.1)' : 'rgba(246,70,93,0.1)',
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                    }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: changePositive ? colors.green : colors.red }}>
                        {changePositive ? '+' : ''}{pctChange.toFixed(2)}%
                      </Text>
                    </View>
                  </View>

                  {/* 4-stat grid */}
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Başlangıç Değeri', value: formatCurrency(startVal), sub: snap1Obj ? formatDate(snap1Obj.snapshot_date) : '' },
                      { label: 'Güncel Değer', value: formatCurrency(endVal), sub: snap2Obj ? formatDate(snap2Obj.snapshot_date) : '' },
                      { label: 'Toplam Yatırım', value: formatCurrency(endCost) },
                      { label: 'Değer Değişimi', value: `${changePositive ? '+' : ''}${formatCurrency(valChange)}`, color: changePositive ? colors.green : colors.red },
                    ].map((stat) => (
                      <View key={stat.label} style={{
                        flex: 1, minWidth: '45%',
                        backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 10,
                      }}>
                        <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '500', marginBottom: 3 }}>{stat.label}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: stat.color || colors.textPri }} numberOfLines={1} adjustsFontSizeToFit>
                          {stat.value}
                        </Text>
                        {stat.sub ? <Text style={{ fontSize: 9, color: colors.textTer, marginTop: 2 }}>{stat.sub}</Text> : null}
                      </View>
                    ))}
                  </View>
                </View>

                {/* ─── Performance Chart ─── */}
                <PerformanceChart comparison={comparison} snapshots={snapshots} snap1Id={snap1} snap2Id={snap2} colors={colors} />

                {/* ─── Top Movers ─── */}
                {instruments.length > 0 && (() => {
                  const arrow = (key) => tableSortKey === key ? (tableSortDir === 'asc' ? ' ↑' : ' ↓') : '';
                  const pctColor = (v) => (v ?? 0) >= 0 ? colors.green : colors.red;
                  const pctFmt = (v) => `${(v ?? 0) >= 0 ? '+' : ''}${(v ?? 0).toFixed(2)}%`;
                  const sortChips = [
                    { key: 'value_change_pct', label: 'Değer %' },
                    { key: 'price_change_pct', label: 'Fiyat %' },
                    { key: 'current_value', label: 'Değer' },
                    { key: 'symbol', label: 'A-Z' },
                    { key: 'quantity_change', label: 'Miktar' },
                  ];
                  const detailRow = (label, val, opts = {}) => (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 }}>
                      <Text style={{ fontSize: 11, color: colors.textTer }}>{label}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: opts.color || colors.textPri }}>{val}</Text>
                    </View>
                  );

                  return (
                    <View style={{ backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                      <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPri }}>Enstrüman Bazlı Performans</Text>
                          <Text style={{ fontSize: 10, color: colors.textTer }}>{instruments.length} enstrüman</Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            {sortChips.map(c => {
                              const active = tableSortKey === c.key;
                              return (
                                <TouchableOpacity key={c.key} onPress={() => toggleSort(c.key)}
                                  style={{
                                    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                                    backgroundColor: active ? colors.accent + '22' : colors.surfaceAlt,
                                    borderWidth: 1, borderColor: active ? colors.accent : colors.border,
                                  }}>
                                  <Text style={{ fontSize: 10, fontWeight: '600', color: active ? colors.accent : colors.textSec }}>
                                    {c.label}{arrow(c.key)}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </ScrollView>
                      </View>

                      {instruments.map((inst, idx) => {
                        const id = inst.instrument_id ?? idx;
                        const expanded = expandedInstId === id;
                        const vPct = inst.value_change_pct ?? 0;
                        const pPct = inst.price_change_pct ?? 0;
                        const qtyChange = (inst.current_quantity ?? 0) - (inst.previous_quantity ?? 0);

                        return (
                          <TouchableOpacity key={id} activeOpacity={0.7}
                            onPress={() => setExpandedInstId(expanded ? null : id)}
                            style={{
                              paddingHorizontal: 14, paddingVertical: 10,
                              borderBottomWidth: idx < instruments.length - 1 ? 1 : 0,
                              borderBottomColor: colors.border,
                              backgroundColor: expanded ? (colors.surfaceAlt || 'rgba(255,255,255,0.03)') : 'transparent',
                            }}>
                            {/* Compact row */}
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPri }}>{inst.symbol}</Text>
                                {inst.name ? <Text style={{ fontSize: 10, color: colors.textTer, marginTop: 1 }} numberOfLines={1}>{inst.name}</Text> : null}
                              </View>
                              <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: pctColor(vPct) }}>
                                  {((inst.current_value ?? 0) - (inst.previous_value ?? 0)) >= 0 ? '+' : ''}{formatCurrency((inst.current_value ?? 0) - (inst.previous_value ?? 0))}
                                </Text>
                                <Text style={{ fontSize: 10, color: pctColor(pPct), marginTop: 1 }}>
                                  {pctFmt(pPct)}
                                </Text>
                              </View>
                              <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textTer} />
                            </View>

                            {/* Expanded details */}
                            {expanded && (
                              <View style={{
                                marginTop: 10, paddingTop: 10,
                                borderTopWidth: 1, borderTopColor: colors.border,
                              }}>
                                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                                  <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 8, padding: 8 }}>
                                    <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '500', marginBottom: 3 }}>Fiyat</Text>
                                    <Text style={{ fontSize: 11, color: colors.textSec }}>
                                      {formatCurrency(inst.previous_price)} → {formatCurrency(inst.current_price)}
                                    </Text>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: pctColor(pPct), marginTop: 2 }}>
                                      {pctFmt(pPct)}
                                    </Text>
                                  </View>
                                  <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 8, padding: 8 }}>
                                    <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '500', marginBottom: 3 }}>Değer</Text>
                                    <Text style={{ fontSize: 11, color: colors.textSec }}>
                                      {formatCurrency(inst.previous_value)} → {formatCurrency(inst.current_value)}
                                    </Text>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: pctColor(vPct), marginTop: 2 }}>
                                      {pctFmt(vPct)}
                                    </Text>
                                  </View>
                                </View>
                                {(() => {
                                  const valDiff = (inst.current_value ?? 0) - (inst.previous_value ?? 0);
                                  return detailRow('Değer Değişimi', `${valDiff >= 0 ? '+' : ''}${formatCurrency(valDiff)}`, { color: valDiff >= 0 ? colors.green : colors.red });
                                })()}
                                {detailRow('Miktar Değişimi', `${qtyChange > 0 ? '+' : ''}${qtyChange.toFixed(2)}`, { color: qtyChange > 0 ? colors.green : qtyChange < 0 ? colors.red : colors.textTer })}
                                {(() => {
                                  const plChange = inst.profit_loss_change ?? 0;
                                  return detailRow('K/Z Değişimi', `${plChange >= 0 ? '+' : ''}${formatCurrency(plChange)}`, { color: plChange >= 0 ? colors.green : colors.red });
                                })()}
                                {detailRow('Önceki Miktar → Güncel', `${(inst.previous_quantity ?? 0).toFixed(2)} → ${(inst.current_quantity ?? 0).toFixed(2)}`)}
                                {inst.current_avg_cost != null && detailRow('Ort. Maliyet', formatCurrency(inst.current_avg_cost))}
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })()}

                {/* New instruments */}
                {newInstruments.length > 0 && (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green }} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPri, flex: 1 }}>Portföye Eklenen</Text>
                      <Text style={{ fontSize: 10, color: colors.textTer }}>{newInstruments.length} enstrüman</Text>
                    </View>
                    {newInstruments.map((inst, idx) => (
                      <View key={inst.instrument_id ?? idx}
                        style={{
                          flexDirection: 'row', alignItems: 'center',
                          paddingHorizontal: 14, paddingVertical: 10,
                          borderBottomWidth: idx < newInstruments.length - 1 ? 1 : 0,
                          borderBottomColor: colors.border,
                        }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPri }}>{inst.symbol}</Text>
                          {inst.name ? <Text style={{ fontSize: 10, color: colors.textTer, marginTop: 1 }} numberOfLines={1}>{inst.name}</Text> : null}
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPri }}>{formatCurrency(inst.current_value)}</Text>
                          <Text style={{ fontSize: 10, color: colors.textTer, marginTop: 1 }}>{(inst.current_quantity ?? 0).toFixed(2)} adet</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Sold instruments */}
                {soldInstruments.length > 0 && (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.red }} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPri, flex: 1 }}>Portföyden Çıkan</Text>
                      <Text style={{ fontSize: 10, color: colors.textTer }}>{soldInstruments.length} enstrüman</Text>
                    </View>
                    {soldInstruments.map((inst, idx) => (
                      <View key={inst.instrument_id ?? idx}
                        style={{
                          flexDirection: 'row', alignItems: 'center',
                          paddingHorizontal: 14, paddingVertical: 10,
                          borderBottomWidth: idx < soldInstruments.length - 1 ? 1 : 0,
                          borderBottomColor: colors.border,
                        }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPri }}>{inst.symbol}</Text>
                          {inst.name ? <Text style={{ fontSize: 10, color: colors.textTer, marginTop: 1 }} numberOfLines={1}>{inst.name}</Text> : null}
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSec }}>{formatCurrency(inst.previous_value)}</Text>
                          <Text style={{ fontSize: 10, color: colors.textTer, marginTop: 1 }}>{(inst.previous_quantity ?? 0).toFixed(2)} adet</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Calendar modal */}
      {calendarFor && (
        <SnapshotCalendar
          snapshots={snapshots}
          selectedId={calendarFor === 'start' ? snap1 : snap2}
          onSelect={calendarFor === 'start' ? setSnap1 : setSnap2}
          colors={colors}
          title={calendarFor === 'start' ? 'Başlangıç Tarihi' : 'Bitiş Tarihi'}
          onClose={() => setCalendarFor(null)}
        />
      )}
    </View>
  );
}
