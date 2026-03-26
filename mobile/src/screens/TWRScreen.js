import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Dimensions,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Line as SvgLine,
  Rect as SvgRect,
  Text as SvgText,
  Circle,
} from 'react-native-svg';
import Toast from 'react-native-toast-message';

import { useTheme } from '../contexts/ThemeContext';
import {
  getPortfolioTWR,
  getCashFlows,
  createCashFlow,
  deleteCashFlow,
} from '../services/api';
import { formatCurrency, formatDate, formatPercent, formatShortDate } from '../utils/format';
import ConfirmDialog from '../components/ConfirmDialog';

const SW = Dimensions.get('window').width;

function toDisplayPercent(v) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  return Math.abs(n) <= 1 ? n * 100 : n;
}

function compactCurrency(val) {
  if (val == null) return '—';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function computeXLabelIndices(pointCount, innerPlotWidth) {
  if (pointCount <= 0) return [];
  if (pointCount === 1) return [0];
  const MIN_PX = 36;
  let m = Math.min(5, Math.max(2, Math.floor(innerPlotWidth / MIN_PX) + 1));
  m = Math.min(m, pointCount);
  const raw = [];
  for (let j = 0; j < m; j++) {
    raw.push(Math.round((j / Math.max(m - 1, 1)) * (pointCount - 1)));
  }
  const uniq = [...new Set(raw)].sort((a, b) => a - b);
  const xAt = (i) => (i / (pointCount - 1)) * innerPlotWidth;
  const out = [uniq[0]];
  for (let k = 1; k < uniq.length; k++) {
    const idx = uniq[k];
    if (xAt(idx) - xAt(out[out.length - 1]) >= MIN_PX - 0.5) {
      out.push(idx);
    } else if (idx === pointCount - 1) {
      if (out[out.length - 1] !== pointCount - 1) {
        if (xAt(pointCount - 1) - xAt(out[out.length - 1]) < MIN_PX && out.length > 1) {
          out.pop();
        }
        out.push(pointCount - 1);
      }
    }
  }
  if (!out.includes(pointCount - 1)) {
    while (out.length > 1 && xAt(pointCount - 1) - xAt(out[out.length - 1]) < MIN_PX) {
      out.pop();
    }
    out.push(pointCount - 1);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/* ─── Interactive Line Chart ─── */
function InteractiveLineChart({ points, width, height, colors, lineColor, gradientId, yFormat, valueFormat }) {
  const [selected, setSelected] = useState(null);

  const chart = useMemo(() => {
    if (!points?.length || points.length < 2) return null;
    const pad = { t: 16, r: 12, b: 34, l: 44 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const ys = points.map((p) => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys, minY + 1e-9);
    const yRange = maxY - minY || 1;
    const n = points.length;
    const xAt = (i) => pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yAt = (v) => pad.t + innerH - ((v - minY) / yRange) * innerH;
    const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.y)}`).join(' ');
    const lastX = xAt(n - 1);
    const firstX = xAt(0);
    const baseY = pad.t + innerH;
    const areaD = `${lineD} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
    const labelIdx = computeXLabelIndices(n, innerW);
    const yTicks = 3;
    const yLabels = [];
    for (let t = 0; t <= yTicks; t++) {
      const v = minY + (t / yTicks) * yRange;
      yLabels.push({ v, y: yAt(v) });
    }
    return { pad, innerW, innerH, lineD, areaD, xAt, yAt, labelIdx, yLabels, minY, maxY, baseY };
  }, [points, width, height]);

  const handleTouch = useCallback((evt) => {
    if (!chart || !points?.length) return;
    const x = evt.nativeEvent.locationX;
    let closest = 0;
    let minDist = Infinity;
    points.forEach((_, i) => {
      const d = Math.abs(chart.xAt(i) - x);
      if (d < minDist) { minDist = d; closest = i; }
    });
    setSelected(closest);
  }, [chart, points]);

  if (!chart) return null;
  const { pad, innerW, innerH, lineD, areaD, xAt, yAt, labelIdx, yLabels } = chart;
  const lc = lineColor || colors.accent;
  const gId = gradientId || 'lineGrad';

  return (
    <View>
      {selected != null && points[selected] && (
        <View style={{
          flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
          marginBottom: 6, gap: 12,
        }}>
          <Text style={{ fontSize: 10, color: colors.textTer }}>{points[selected].label}</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: lc }}>
            {valueFormat ? valueFormat(points[selected].y) : points[selected].y.toFixed(2)}
          </Text>
        </View>
      )}
      <Svg width={width} height={height}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={() => setTimeout(() => setSelected(null), 2000)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
      >
        <Defs>
          <LinearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lc} stopOpacity={0.3} />
            <Stop offset="1" stopColor={lc} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>
        {yLabels.map((row, i) => (
          <SvgLine key={`gy-${i}`} x1={pad.l} y1={row.y} x2={width - pad.r} y2={row.y}
            stroke={colors.border} strokeWidth={1} strokeDasharray="4 4" />
        ))}
        {yLabels.map((row, i) => (
          <SvgText key={`yl-${i}`} x={pad.l - 4} y={row.y + 3} fontSize={8} fill={colors.textTer} textAnchor="end">
            {yFormat ? yFormat(row.v) : row.v.toFixed(1)}
          </SvgText>
        ))}
        <Path d={areaD} fill={`url(#${gId})`} />
        <Path d={lineD} fill="none" stroke={lc} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <SvgLine x1={pad.l} y1={pad.t + innerH} x2={width - pad.r} y2={pad.t + innerH} stroke={colors.border} strokeWidth={1} />
        {labelIdx.map((idx) => (
          <SvgText key={`xl-${idx}`} x={xAt(idx)} y={height - 6} fontSize={9} fill={colors.textTer} textAnchor="middle">
            {points[idx].label}
          </SvgText>
        ))}
        {selected != null && points[selected] && (
          <>
            <SvgLine x1={xAt(selected)} y1={pad.t} x2={xAt(selected)} y2={pad.t + innerH}
              stroke={lc} strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
            <Circle cx={xAt(selected)} cy={yAt(points[selected].y)} r={5} fill={lc} stroke={colors.bg} strokeWidth={2} />
          </>
        )}
      </Svg>
    </View>
  );
}

/* ─── Interactive Bar Chart ─── */
function InteractiveBarChart({ data, width, height, colors }) {
  const [selected, setSelected] = useState(null);

  const chart = useMemo(() => {
    if (!data?.length) return null;
    const slice = data.slice(-12);
    const pad = { t: 14, r: 8, b: 34, l: 40 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const vals = slice.map((d) => d.value);
    const maxV = Math.max(...vals, 0);
    const minV = Math.min(...vals, 0);
    const range = maxV - minV || 1;
    const zeroY = pad.t + innerH - ((0 - minV) / range) * innerH;
    const n = slice.length;
    const gap = 4;
    const barW = Math.max((innerW - gap * (n - 1)) / n, 6);
    const labelIdx = computeXLabelIndices(n, innerW);
    return { pad, innerW, innerH, slice, vals, maxV, minV, range, zeroY, barW, gap, n, labelIdx };
  }, [data, width, height]);

  const handleTouch = useCallback((evt) => {
    if (!chart) return;
    const x = evt.nativeEvent.locationX;
    const { pad, barW, gap, n } = chart;
    const idx = Math.min(n - 1, Math.max(0, Math.floor((x - pad.l) / (barW + gap))));
    setSelected(idx);
  }, [chart]);

  if (!chart) return null;
  const { pad, innerH, slice, vals, range, zeroY, barW, gap, n, labelIdx } = chart;

  return (
    <View>
      {selected != null && slice[selected] && (
        <View style={{
          flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
          marginBottom: 6, gap: 12,
        }}>
          <Text style={{ fontSize: 10, color: colors.textTer }}>{slice[selected].label}</Text>
          <Text style={{
            fontSize: 13, fontWeight: '700',
            color: slice[selected].value >= 0 ? colors.green : colors.red,
          }}>
            {slice[selected].value >= 0 ? '+' : ''}{slice[selected].value.toFixed(2)}%
          </Text>
        </View>
      )}
      <Svg width={width} height={height}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={() => setTimeout(() => setSelected(null), 2000)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
      >
        <SvgLine x1={pad.l} y1={zeroY} x2={width - pad.r} y2={zeroY} stroke={colors.textTer} strokeWidth={1} opacity={0.4} />
        {vals.map((v, i) => {
          const x = pad.l + i * (barW + gap);
          const h = Math.max((Math.abs(v) / range) * innerH, v === 0 ? 1 : 2);
          const y = v >= 0 ? zeroY - h : zeroY;
          const fill = v >= 0 ? colors.green : colors.red;
          const isSelected = selected === i;
          return (
            <SvgRect key={`b-${i}`} x={x} y={y} width={barW} height={h} rx={3}
              fill={fill} opacity={isSelected ? 1 : 0.7}
              stroke={isSelected ? colors.textPri : 'none'} strokeWidth={isSelected ? 1 : 0} />
          );
        })}
        {labelIdx.map((idx) => {
          const cx = pad.l + idx * (barW + gap) + barW / 2;
          return (
            <SvgText key={`xb-${idx}`} x={cx} y={height - 8} fontSize={9} fill={colors.textTer} textAnchor="middle">
              {slice[idx].label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const TWR_INFO_BODY = [
  'Zaman ağırlıklı getiri (TWR), portföye belirli dönemlerde eklenen veya çekilen nakit akışlarının etkisini ayırarak, yalnızca yatırım kararlarınızın getirisini ölçer.',
  'Her dönem için dönem başı ve sonu değerleri ile dönem içi nakit akışları kullanılır; dönem getirileri zincirlenerek kümülatif TWR elde edilir.',
  'Yıllıklandırılmış TWR, toplam gün sayısına göre bileşik oran varsayımıyla hesaplanır ve farklı sürelerdeki portföyleri kıyaslamaya yardımcı olur.',
  'TWR, para yatırma/çekme zamanlamasından arındırılmış performans göstergesidir; mutlak para kazancı ile her zaman örtüşmeyebilir.',
];

function CashFlowRow({ cf, colors, onDelete, rowRef }) {
  const isInflow =
    cf.flow_type === 'inflow' ||
    cf.flow_type === 'deposit' ||
    ((cf.flow_type == null || cf.flow_type === '') && Number(cf.amount) >= 0);
  const amt = Number(cf.amount) || 0;
  const displayAmt = Math.abs(amt);
  const cur = cf.currency || 'TRY';

  const right = () => (
    <View style={{ justifyContent: 'center', paddingLeft: 8 }}>
      <TouchableOpacity
        onPress={() => onDelete(cf.id)}
        style={{
          backgroundColor: colors.red,
          justifyContent: 'center', alignItems: 'center',
          width: 72, height: '88%', maxHeight: 56, borderRadius: 12,
        }}
      >
        <Feather name="trash-2" size={20} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 4 }}>Sil</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Swipeable ref={rowRef} renderRightActions={right} overshootRight={false}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.surface, borderRadius: 12,
        borderWidth: 1, borderColor: colors.border,
        paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
      }}>
        <View style={{
          width: 32, height: 32, borderRadius: 16, marginRight: 12,
          backgroundColor: isInflow ? colors.green + '20' : colors.red + '20',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Feather name={isInflow ? 'arrow-down-left' : 'arrow-up-right'} size={16}
            color={isInflow ? colors.green : colors.red} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: isInflow ? colors.green : colors.red }}>
            {isInflow ? '+' : '-'}{formatCurrency(displayAmt, cur)}
          </Text>
          <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 2 }}>
            {formatDate(cf.flow_date || cf.date)}
            {cf.note ? ` · ${cf.note}` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={() => onDelete(cf.id)} hitSlop={10} style={{ padding: 6 }}>
          <Feather name="trash-2" size={16} color={colors.textTer} />
        </TouchableOpacity>
      </View>
    </Swipeable>
  );
}

export default function TWRScreen() {
  const { colors } = useTheme();
  const [twrData, setTwrData] = useState(null);
  const [cashFlows, setCashFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedPeriod, setExpandedPeriod] = useState(null);
  const [periodsOpen, setPeriodsOpen] = useState(false);
  const [cfForm, setCfForm] = useState({
    amount: '', note: '', flow_date: '', currency: 'TRY', flow_type: 'inflow',
  });
  const swipeRefs = useRef({});

  const chartW = SW - 48;
  const chartH = 190;

  const load = useCallback(async () => {
    try {
      const [twrRes, cfRes] = await Promise.all([getPortfolioTWR(), getCashFlows()]);
      setTwrData(twrRes?.data ?? null);
      setCashFlows(Array.isArray(cfRes?.data) ? cfRes.data : []);
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Veriler yüklenemedi' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const sortedPeriods = useMemo(() => {
    if (!twrData?.periods?.length) return [];
    return [...twrData.periods].sort((a, b) => new Date(a.to_date) - new Date(b.to_date));
  }, [twrData]);

  const annualPct = useMemo(() => toDisplayPercent(twrData?.twr_annualized), [twrData]);
  const totalPct = useMemo(() => toDisplayPercent(twrData?.twr), [twrData]);

  const stats = useMemo(() => {
    if (!sortedPeriods.length) return null;
    const returns = sortedPeriods.filter(p => p.beginning_value > 0).map(p => p.period_return);
    if (!returns.length) return null;
    const positive = returns.filter(r => r > 0);
    const negative = returns.filter(r => r < 0);
    const avg = returns.reduce((s, r) => s + r, 0) / returns.length;
    const best = Math.max(...returns);
    const worst = Math.min(...returns);
    const bestP = sortedPeriods.find(p => p.period_return === best);
    const worstP = sortedPeriods.find(p => p.period_return === worst);
    let peak = 1.0, maxDD = 0, cum = 1.0;
    for (const p of sortedPeriods) {
      cum *= (1 + p.period_return / 100);
      if (cum > peak) peak = cum;
      const dd = (peak - cum) / peak * 100;
      if (dd > maxDD) maxDD = dd;
    }
    return {
      totalPeriods: returns.length,
      positivePeriods: positive.length,
      negativePeriods: negative.length,
      winRate: (positive.length / returns.length * 100),
      avgReturn: avg,
      bestReturn: best,
      worstReturn: worst,
      bestDate: bestP ? formatShortDate(bestP.to_date) : '—',
      worstDate: worstP ? formatShortDate(worstP.to_date) : '—',
      maxDrawdown: maxDD,
    };
  }, [sortedPeriods]);

  const cumulativePoints = useMemo(() => {
    if (!sortedPeriods.length) return [];
    let cum = 1.0;
    return sortedPeriods.map((p) => {
      cum *= (1 + p.period_return / 100);
      return { label: formatShortDate(p.to_date), y: (cum - 1) * 100 };
    });
  }, [sortedPeriods]);

  const barData = useMemo(() => {
    if (!sortedPeriods.length) return [];
    return sortedPeriods.map((p) => ({
      label: formatShortDate(p.to_date), value: p.period_return,
    }));
  }, [sortedPeriods]);

  const valuePoints = useMemo(() => {
    if (!sortedPeriods.length) return [];
    const pts = [];
    const first = sortedPeriods[0];
    pts.push({ label: formatShortDate(first.from_date), y: first.beginning_value || 0 });
    sortedPeriods.forEach((p) => {
      pts.push({ label: formatShortDate(p.to_date), y: p.ending_value || 0 });
    });
    return pts;
  }, [sortedPeriods]);

  const openDeleteConfirm = useCallback((id) => {
    Object.values(swipeRefs.current).forEach((r) => r?.close?.());
    setDeleteId(id);
  }, []);

  const handleDeleteCF = async () => {
    if (deleteId == null) return;
    try {
      await deleteCashFlow(deleteId);
      Toast.show({ type: 'success', text1: 'Nakit akışı silindi' });
      load();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Silinemedi' });
    } finally {
      setDeleteId(null);
    }
  };

  const submitCashFlow = async () => {
    const raw = cfForm.amount.replace(',', '.').trim();
    const amt = parseFloat(raw);
    if (!raw || !Number.isFinite(amt) || amt === 0) {
      Toast.show({ type: 'error', text1: 'Geçerli bir tutar girin' });
      return;
    }
    const flow_date = cfForm.flow_date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(flow_date)) {
      Toast.show({ type: 'error', text1: 'Tarih YYYY-MM-DD formatında olmalı' });
      return;
    }
    const flow_type = cfForm.flow_type === 'outflow' ? 'outflow' : 'inflow';
    const signed = flow_type === 'inflow' ? Math.abs(amt) : -Math.abs(amt);
    setSubmitting(true);
    try {
      await createCashFlow({ flow_date, amount: signed, currency: cfForm.currency, flow_type, note: cfForm.note.trim() || null });
      Toast.show({ type: 'success', text1: 'Nakit akışı eklendi' });
      setSheetOpen(false);
      setCfForm({ amount: '', note: '', flow_date: '', currency: 'TRY', flow_type: 'inflow' });
      load();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Eklenemedi' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const netCash = (twrData?.total_cash_inflow ?? 0) - (twrData?.total_cash_outflow ?? 0);
  const firstVal = twrData?.first_snapshot_value ?? 0;
  const lastVal = twrData?.last_snapshot_value ?? 0;
  const valProgress = firstVal > 0 ? Math.min(1, Math.max(0.05, lastVal / (firstVal + lastVal))) : 0.5;

  const cardStyle = {
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        keyboardShouldPersistTaps="handled"
      >
        {!twrData ? (
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <Feather name="activity" size={48} color={colors.textTer} />
            <Text style={{ color: colors.textSec, marginTop: 16, textAlign: 'center', paddingHorizontal: 24 }}>
              TWR verisi bulunamadı. Performans için portföy snapshot'ları oluşturun.
            </Text>
          </View>
        ) : (
          <>
            {/* ═══ Hero Card ═══ */}
            <View style={{ ...cardStyle, padding: 20, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: colors.textTer, marginBottom: 4 }}>Yıllıklandırılmış TWR</Text>
                  <Text style={{
                    fontSize: 32, fontWeight: '800', letterSpacing: -0.5,
                    color: (annualPct ?? 0) >= 0 ? colors.green : colors.red,
                  }}>
                    {annualPct == null ? '—' : `${annualPct >= 0 ? '+' : ''}${annualPct.toFixed(2)}%`}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setInfoOpen(true)} hitSlop={12}
                  style={{
                    width: 34, height: 34, borderRadius: 17,
                    backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
                  }}>
                  <Feather name="info" size={16} color={colors.accent} />
                </TouchableOpacity>
              </View>

              {/* 4-stat grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, gap: 8 }}>
                {[
                  { label: 'Toplam Getiri', value: totalPct != null ? `${totalPct >= 0 ? '+' : ''}${totalPct.toFixed(2)}%` : '—', color: (totalPct ?? 0) >= 0 ? colors.green : colors.red },
                  { label: 'Ölçüm Süresi', value: `${twrData.total_days ?? 0} gün`, sub: `${twrData.snapshot_count ?? 0} snapshot` },
                  { label: 'Net Nakit Akışı', value: `${netCash >= 0 ? '+' : ''}${compactCurrency(netCash)} ₺`, color: netCash >= 0 ? colors.green : colors.red },
                  { label: 'Güncel Değer', value: formatCurrency(twrData.last_snapshot_value ?? 0), color: colors.accent },
                ].map((s) => (
                  <View key={s.label} style={{
                    flex: 1, minWidth: '45%', backgroundColor: colors.surfaceAlt,
                    borderRadius: 10, padding: 10,
                  }}>
                    <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '500', marginBottom: 3 }}>{s.label}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: s.color || colors.textPri }} numberOfLines={1} adjustsFontSizeToFit>
                      {s.value}
                    </Text>
                    {s.sub ? <Text style={{ fontSize: 9, color: colors.textTer, marginTop: 2 }}>{s.sub}</Text> : null}
                  </View>
                ))}
              </View>
            </View>

            {/* ═══ Value Range ═══ */}
            <View style={{ ...cardStyle, padding: 16, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                <View>
                  <Text style={{ fontSize: 9, color: colors.textTer }}>İlk Snapshot</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPri, marginTop: 2 }}>
                    {formatCurrency(firstVal)}
                  </Text>
                  <Text style={{ fontSize: 9, color: colors.textTer, marginTop: 1 }}>
                    {twrData.first_snapshot_date ? formatDate(twrData.first_snapshot_date) : '—'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 9, color: colors.textTer }}>Son Snapshot</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPri, marginTop: 2 }}>
                    {formatCurrency(lastVal)}
                  </Text>
                  <Text style={{ fontSize: 9, color: colors.textTer, marginTop: 1 }}>
                    {twrData.last_snapshot_date ? formatDate(twrData.last_snapshot_date) : '—'}
                  </Text>
                </View>
              </View>
              <View style={{ height: 6, backgroundColor: colors.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
                <View style={{
                  height: 6, borderRadius: 3, width: `${valProgress * 100}%`,
                  backgroundColor: (totalPct ?? 0) >= 0 ? colors.green : colors.red,
                }} />
              </View>
              <Text style={{ fontSize: 10, color: colors.textTer, textAlign: 'center', marginTop: 6 }}>
                {(totalPct ?? 0) >= 0 ? '+' : ''}{(totalPct ?? 0).toFixed(2)}% getiri
              </Text>
            </View>

            {/* ═══ Statistics ═══ */}
            {stats && (
              <View style={{ ...cardStyle, padding: 14, marginBottom: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPri, marginBottom: 10 }}>İstatistikler</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    { label: 'Kazanan', value: `${stats.positivePeriods}/${stats.totalPeriods}`, sub: `%${stats.winRate.toFixed(0)}`, color: colors.green },
                    { label: 'Kaybeden', value: `${stats.negativePeriods}/${stats.totalPeriods}`, sub: `%${(100 - stats.winRate).toFixed(0)}`, color: colors.red },
                    { label: 'Ort. Getiri', value: `${stats.avgReturn >= 0 ? '+' : ''}${stats.avgReturn.toFixed(2)}%`, color: stats.avgReturn >= 0 ? colors.green : colors.red },
                    { label: 'En İyi', value: `+${stats.bestReturn.toFixed(2)}%`, sub: stats.bestDate, color: colors.green },
                    { label: 'En Kötü', value: `${stats.worstReturn.toFixed(2)}%`, sub: stats.worstDate, color: colors.red },
                    { label: 'Maks. Düşüş', value: `-${stats.maxDrawdown.toFixed(2)}%`, color: colors.red },
                  ].map((s) => (
                    <View key={s.label} style={{
                      flex: 1, minWidth: '30%', backgroundColor: s.color + '12',
                      borderRadius: 10, padding: 10, borderWidth: 1, borderColor: s.color + '30',
                    }}>
                      <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '500' }}>{s.label}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: s.color, marginTop: 3 }}>{s.value}</Text>
                      {s.sub ? <Text style={{ fontSize: 9, color: colors.textTer, marginTop: 2 }}>{s.sub}</Text> : null}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ═══ Charts ═══ */}
            {sortedPeriods.length > 1 && (
              <>
                {/* Cumulative TWR */}
                <View style={{ ...cardStyle, paddingVertical: 14, paddingHorizontal: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPri, marginBottom: 8, paddingHorizontal: 8 }}>
                    Kümülatif TWR
                  </Text>
                  <InteractiveLineChart
                    points={cumulativePoints} width={chartW} height={chartH} colors={colors}
                    lineColor={colors.accent} gradientId="cumGrad"
                    yFormat={(v) => `${v.toFixed(0)}%`}
                    valueFormat={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`}
                  />
                </View>

                {/* Period Returns */}
                <View style={{ ...cardStyle, paddingVertical: 14, paddingHorizontal: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPri, marginBottom: 8, paddingHorizontal: 8 }}>
                    Dönemsel Getiriler (son 12)
                  </Text>
                  <InteractiveBarChart data={barData} width={chartW} height={chartH} colors={colors} />
                </View>

                {/* Portfolio Value */}
                <View style={{ ...cardStyle, paddingVertical: 14, paddingHorizontal: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPri, marginBottom: 8, paddingHorizontal: 8 }}>
                    Portföy Değeri
                  </Text>
                  <InteractiveLineChart
                    points={valuePoints} width={chartW} height={chartH} colors={colors}
                    lineColor="#8B5CF6" gradientId="valGrad"
                    yFormat={(v) => compactCurrency(v)}
                    valueFormat={(v) => formatCurrency(v)}
                  />
                </View>
              </>
            )}

            {/* ═══ Period Details ═══ */}
            {sortedPeriods.length > 0 && (
              <View style={{ ...cardStyle, marginBottom: 12 }}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => setPeriodsOpen(o => !o)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: periodsOpen ? 1 : 0, borderBottomColor: colors.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPri }}>Dönem Detayları</Text>
                    <Text style={{ fontSize: 10, color: colors.textTer, marginTop: 2 }}>
                      {sortedPeriods.length} dönem · Her snapshot aralığındaki getiri
                    </Text>
                  </View>
                  <Feather name={periodsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textTer} />
                </TouchableOpacity>
                {periodsOpen && [...sortedPeriods].reverse().map((p, idx) => {
                  const id = `${p.from_date}-${p.to_date}`;
                  const expanded = expandedPeriod === id;
                  const ret = p.period_return ?? 0;
                  const pos = ret >= 0;

                  return (
                    <TouchableOpacity key={id} activeOpacity={0.7}
                      onPress={() => setExpandedPeriod(expanded ? null : id)}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 10,
                        borderBottomWidth: idx < sortedPeriods.length - 1 ? 1 : 0,
                        borderBottomColor: colors.border,
                        backgroundColor: expanded ? colors.surfaceAlt : 'transparent',
                      }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPri }}>
                            {formatShortDate(p.from_date)} → {formatShortDate(p.to_date)}
                          </Text>
                          <Text style={{ fontSize: 10, color: colors.textTer, marginTop: 1 }}>
                            {p.days} gün
                            {(p.cash_flow ?? 0) !== 0 ? ` · Nakit: ${p.cash_flow > 0 ? '+' : ''}${compactCurrency(p.cash_flow)} ₺` : ''}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: pos ? colors.green : colors.red, marginRight: 8 }}>
                          {pos ? '+' : ''}{ret.toFixed(2)}%
                        </Text>
                        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textTer} />
                      </View>

                      {expanded && (
                        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                            <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 8, padding: 8 }}>
                              <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '500', marginBottom: 3 }}>Başlangıç Değeri</Text>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPri }}>
                                {formatCurrency(p.beginning_value)}
                              </Text>
                            </View>
                            <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 8, padding: 8 }}>
                              <Text style={{ fontSize: 9, color: colors.textTer, fontWeight: '500', marginBottom: 3 }}>Bitiş Değeri</Text>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPri }}>
                                {formatCurrency(p.ending_value)}
                              </Text>
                            </View>
                          </View>
                          {[
                            { label: 'Nakit Akışı', value: (p.cash_flow ?? 0) !== 0 ? `${p.cash_flow > 0 ? '+' : ''}${formatCurrency(p.cash_flow)}` : '—', color: (p.cash_flow ?? 0) > 0 ? colors.green : (p.cash_flow ?? 0) < 0 ? colors.red : colors.textTer },
                            { label: 'Dönem Getirisi', value: `${pos ? '+' : ''}${ret.toFixed(2)}%`, color: pos ? colors.green : colors.red },
                            { label: 'Değer Farkı', value: `${(p.ending_value - p.beginning_value) >= 0 ? '+' : ''}${formatCurrency(p.ending_value - p.beginning_value)}`, color: (p.ending_value - p.beginning_value) >= 0 ? colors.green : colors.red },
                          ].map((row) => (
                            <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                              <Text style={{ fontSize: 11, color: colors.textTer }}>{row.label}</Text>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: row.color }}>{row.value}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}}
              </View>
            )}
          </>
        )}

        {/* ═══ Cash Flows ═══ */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 8, marginBottom: 10,
        }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPri }}>Nakit Akışları</Text>
          <TouchableOpacity onPress={() => setSheetOpen(true)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
            }}>
            <Feather name="plus" size={14} color="#0B0E11" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#0B0E11' }}>Ekle</Text>
          </TouchableOpacity>
        </View>

        {cashFlows.length === 0 ? (
          <Text style={{ color: colors.textSec, textAlign: 'center', paddingVertical: 16, fontSize: 13 }}>
            Kayıtlı nakit akışı yok
          </Text>
        ) : (
          cashFlows.map((cf) => (
            <CashFlowRow key={cf.id} cf={cf} colors={colors} onDelete={openDeleteConfirm}
              rowRef={(r) => { if (r) swipeRefs.current[cf.id] = r; }} />
          ))
        )}
      </ScrollView>

      {/* ═══ TWR Info Modal ═══ */}
      <Modal visible={infoOpen} transparent animationType="fade" onRequestClose={() => setInfoOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 20 }}
          onPress={() => setInfoOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()}
            style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 22, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPri }}>TWR nasıl hesaplanır?</Text>
              <TouchableOpacity onPress={() => setInfoOpen(false)} hitSlop={10}>
                <Feather name="x" size={22} color={colors.textSec} />
              </TouchableOpacity>
            </View>
            {TWR_INFO_BODY.map((para, i) => (
              <Text key={i} style={{ fontSize: 14, color: colors.textSec, lineHeight: 22, marginBottom: 12 }}>{para}</Text>
            ))}
            <TouchableOpacity onPress={() => setInfoOpen(false)}
              style={{ marginTop: 8, backgroundColor: colors.surfaceAlt, paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPri }}>Tamam</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ Cash Flow Bottom Sheet ═══ */}
      <Modal visible={sheetOpen} animationType="slide" transparent onRequestClose={() => setSheetOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={() => setSheetOpen(false)} />
          <View style={{
            backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            paddingBottom: Platform.OS === 'ios' ? 28 : 16,
            borderTopWidth: 1, borderColor: colors.border, maxHeight: '88%',
          }}>
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt }} />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPri }}>Yeni Nakit Akışı</Text>
                <TouchableOpacity onPress={() => setSheetOpen(false)} hitSlop={12}>
                  <Feather name="x" size={22} color={colors.textSec} />
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Tür</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                {[{ key: 'inflow', label: 'Giriş', icon: 'arrow-down-left' }, { key: 'outflow', label: 'Çıkış', icon: 'arrow-up-right' }].map((opt) => {
                  const active = cfForm.flow_type === opt.key;
                  return (
                    <TouchableOpacity key={opt.key}
                      onPress={() => setCfForm((f) => ({ ...f, flow_type: opt.key }))}
                      style={{
                        flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                        flexDirection: 'row', justifyContent: 'center', gap: 6,
                        backgroundColor: active ? colors.accent : colors.surfaceAlt,
                        borderWidth: 1, borderColor: active ? colors.accent : colors.border,
                      }}>
                      <Feather name={opt.icon} size={14} color={active ? '#0B0E11' : colors.textSec} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: active ? '#0B0E11' : colors.textSec }}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Tutar</Text>
              <TextInput value={cfForm.amount} onChangeText={(v) => setCfForm((f) => ({ ...f, amount: v }))}
                keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textTer}
                style={{
                  borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                  paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
                  color: colors.textPri, backgroundColor: colors.surfaceAlt, marginBottom: 16,
                }} />

              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Para birimi</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {['TRY', 'USD', 'EUR'].map((c) => {
                  const active = cfForm.currency === c;
                  return (
                    <TouchableOpacity key={c}
                      onPress={() => setCfForm((f) => ({ ...f, currency: c }))}
                      style={{
                        paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
                        backgroundColor: active ? colors.accent + '22' : colors.surfaceAlt,
                        borderWidth: 1, borderColor: active ? colors.accent : colors.border,
                      }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? colors.accent : colors.textSec }}>{c}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Tarih (YYYY-MM-DD)</Text>
              <TextInput value={cfForm.flow_date} onChangeText={(v) => setCfForm((f) => ({ ...f, flow_date: v }))}
                placeholder="2025-03-26" placeholderTextColor={colors.textTer} autoCapitalize="none"
                style={{
                  borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                  paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
                  color: colors.textPri, backgroundColor: colors.surfaceAlt, marginBottom: 16,
                }} />

              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Not</Text>
              <TextInput value={cfForm.note} onChangeText={(v) => setCfForm((f) => ({ ...f, note: v }))}
                placeholder="Opsiyonel açıklama" placeholderTextColor={colors.textTer} multiline
                style={{
                  borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                  paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
                  color: colors.textPri, backgroundColor: colors.surfaceAlt,
                  minHeight: 72, textAlignVertical: 'top', marginBottom: 20,
                }} />

              <TouchableOpacity onPress={submitCashFlow} disabled={submitting}
                style={{
                  backgroundColor: colors.accent, paddingVertical: 16,
                  borderRadius: 14, alignItems: 'center', opacity: submitting ? 0.55 : 1,
                }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#0B0E11' }}>
                  {submitting ? 'Kaydediliyor…' : 'Kaydet'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmDialog
        visible={deleteId != null}
        title="Nakit akışını sil"
        message="Bu kaydı kalıcı olarak silmek istediğinize emin misiniz?"
        onConfirm={handleDeleteCF}
        onCancel={() => setDeleteId(null)}
        destructive
        confirmText="Sil"
      />
    </View>
  );
}
