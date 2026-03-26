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

/** API returns TWR as decimal (e.g. 0.0839); treat |v|≤1 as fraction of 1 */
function toDisplayPercent(v) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  return Math.abs(n) <= 1 ? n * 100 : n;
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

function CumulativeTWRLineChart({ periods, width, height, colors }) {
  const chart = useMemo(() => {
    if (!periods?.length) return null;
    const pad = { t: 14, r: 10, b: 32, l: 40 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const pts = periods.map((p) => ({
      date: p.end_date,
      y: toDisplayPercent(p.cumulative_return) ?? 0,
    }));
    const ys = pts.map((p) => p.y);
    const minY = Math.min(0, ...ys);
    const maxY = Math.max(0, ...ys, minY + 1e-6);
    const yRange = maxY - minY || 1;
    const n = pts.length;
    const xAt = (i) => pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yAt = (v) => pad.t + innerH - ((v - minY) / yRange) * innerH;
    const lineD = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.y)}`)
      .join(' ');
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
    return { pad, innerW, innerH, lineD, areaD, pts, xAt, yAt, labelIdx, minY, maxY, yLabels };
  }, [periods, width, height]);

  if (!chart) return null;

  const { pad, innerH, lineD, areaD, pts, xAt, labelIdx, yLabels, minY, maxY } = chart;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="twrFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accent} stopOpacity={0.35} />
          <Stop offset="1" stopColor={colors.accent} stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
      {yLabels.map((row, i) => (
        <SvgLine
          key={`gy-${i}`}
          x1={pad.l}
          y1={row.y}
          x2={width - pad.r}
          y2={row.y}
          stroke={colors.border}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      ))}
      <Path d={areaD} fill="url(#twrFill)" />
      <Path d={lineD} fill="none" stroke={colors.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <SvgLine x1={pad.l} y1={pad.t + innerH} x2={width - pad.r} y2={pad.t + innerH} stroke={colors.border} strokeWidth={1} />
      {labelIdx.map((idx) => (
        <SvgText
          key={`xl-${idx}`}
          x={xAt(idx)}
          y={height - 6}
          fontSize={10}
          fill={colors.textTer}
          textAnchor="middle"
        >
          {formatShortDate(pts[idx].date)}
        </SvgText>
      ))}
      <SvgText x={4} y={pad.t + 8} fontSize={9} fill={colors.textTer}>
        {`${maxY.toFixed(0)}%`}
      </SvgText>
      <SvgText x={4} y={pad.t + innerH} fontSize={9} fill={colors.textTer}>
        {`${minY.toFixed(0)}%`}
      </SvgText>
    </Svg>
  );
}

function PeriodReturnBarChart({ periods, width, height, colors }) {
  const chart = useMemo(() => {
    const slice = (periods || []).slice(-12);
    if (!slice.length) return null;
    const pad = { t: 12, r: 8, b: 34, l: 36 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const vals = slice.map((p) => toDisplayPercent(p.period_return) ?? 0);
    const maxV = Math.max(...vals, 0);
    const minV = Math.min(...vals, 0);
    const range = maxV - minV || 1;
    const zeroY = pad.t + innerH - ((0 - minV) / range) * innerH;
    const n = slice.length;
    const gap = 4;
    const barW = Math.max((innerW - gap * (n - 1)) / n, 6);
    const labelIdx = computeXLabelIndices(n, innerW);
    return { pad, innerW, innerH, slice, vals, maxV, minV, range, zeroY, barW, gap, n, labelIdx };
  }, [periods, width, height]);

  if (!chart) return null;

  const { pad, innerW, innerH, slice, vals, maxV, minV, range, zeroY, barW, gap, n, labelIdx } = chart;

  return (
    <Svg width={width} height={height}>
      <SvgLine x1={pad.l} y1={zeroY} x2={width - pad.r} y2={zeroY} stroke={colors.textTer} strokeWidth={1} opacity={0.6} />
      {vals.map((v, i) => {
        const x = pad.l + i * (barW + gap);
        const h = Math.max((Math.abs(v) / range) * innerH, v === 0 ? 1 : 2);
        const y = v >= 0 ? zeroY - h : zeroY;
        const fill = v >= 0 ? colors.green : colors.red;
        return <SvgRect key={`b-${i}`} x={x} y={y} width={barW} height={h} rx={3} fill={fill} opacity={0.9} />;
      })}
      {labelIdx.map((idx) => {
        const cx = pad.l + idx * (barW + gap) + barW / 2;
        return (
          <SvgText key={`xb-${idx}`} x={cx} y={height - 8} fontSize={10} fill={colors.textTer} textAnchor="middle">
            {formatShortDate(slice[idx].end_date)}
          </SvgText>
        );
      })}
      <SvgText x={2} y={pad.t + 10} fontSize={9} fill={colors.textTer}>
        {`${maxV.toFixed(0)}%`}
      </SvgText>
      <SvgText x={2} y={pad.t + innerH} fontSize={9} fill={colors.textTer}>
        {`${minV.toFixed(0)}%`}
      </SvgText>
    </Svg>
  );
}

function PortfolioValueLineChart({ periods, width, height, colors }) {
  const chart = useMemo(() => {
    if (!periods?.length) return null;
    const ordered = [...periods].sort(
      (a, b) => new Date(a.start_date) - new Date(b.start_date)
    );
    const points = [];
    const first = ordered[0];
    points.push({ t: first.start_date, v: Number(first.start_value) || 0 });
    ordered.forEach((p) => {
      const endV = Number(p.end_value) || 0;
      const last = points[points.length - 1];
      if (last && last.t === p.end_date && last.v === endV) return;
      points.push({ t: p.end_date, v: endV });
    });
    if (points.length < 2) return null;

    const pad = { t: 14, r: 10, b: 32, l: 44 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const vs = points.map((p) => p.v);
    const minV = Math.min(...vs);
    const maxV = Math.max(...vs, minV + 1e-9);
    const vRange = maxV - minV || 1;
    const n = points.length;
    const xAt = (i) => pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yAt = (v) => pad.t + innerH - ((v - minV) / vRange) * innerH;
    const lineD = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.v)}`)
      .join(' ');
    const labelIdx = computeXLabelIndices(n, innerW);
    return { pad, innerW, innerH, lineD, points, xAt, yAt, labelIdx, minV, maxV };
  }, [periods, width, height]);

  if (!chart) return null;

  const { pad, lineD, points, xAt, labelIdx, minV, maxV, innerH } = chart;

  return (
    <Svg width={width} height={height}>
      <Path d={lineD} fill="none" stroke={colors.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <SvgLine
        x1={pad.l}
        y1={pad.t + innerH}
        x2={width - pad.r}
        y2={pad.t + innerH}
        stroke={colors.border}
        strokeWidth={1}
      />
      {labelIdx.map((idx) => (
        <SvgText
          key={`xv-${idx}`}
          x={xAt(idx)}
          y={height - 6}
          fontSize={10}
          fill={colors.textTer}
          textAnchor="middle"
        >
          {formatShortDate(points[idx].t)}
        </SvgText>
      ))}
      <SvgText x={2} y={pad.t + 8} fontSize={8} fill={colors.textTer}>
        {maxV >= 1e6 ? `${(maxV / 1e6).toFixed(1)}M` : maxV >= 1e3 ? `${(maxV / 1e3).toFixed(0)}K` : maxV.toFixed(0)}
      </SvgText>
      <SvgText x={2} y={pad.t + innerH} fontSize={8} fill={colors.textTer}>
        {minV >= 1e6 ? `${(minV / 1e6).toFixed(1)}M` : minV >= 1e3 ? `${(minV / 1e3).toFixed(0)}K` : minV.toFixed(0)}
      </SvgText>
    </Svg>
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
          justifyContent: 'center',
          alignItems: 'center',
          width: 72,
          height: '88%',
          maxHeight: 56,
          borderRadius: 12,
        }}
      >
        <Feather name="trash-2" size={20} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 4 }}>Sil</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Swipeable ref={rowRef} renderRightActions={right} overshootRight={false}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: 14,
          paddingHorizontal: 16,
          marginBottom: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 17,
              fontWeight: '700',
              color: isInflow ? colors.green : colors.red,
            }}
          >
            {isInflow ? '+' : '-'}
            {formatCurrency(displayAmt, cur)}
          </Text>
          <Text style={{ fontSize: 12, color: colors.textTer, marginTop: 4 }}>
            {formatDate(cf.flow_date || cf.date)}
          </Text>
          {cf.note ? (
            <Text style={{ fontSize: 13, color: colors.textSec, marginTop: 6 }} numberOfLines={2}>
              {cf.note}
            </Text>
          ) : null}
        </View>
        <Feather name="chevron-left" size={18} color={colors.textTer} style={{ marginRight: 6 }} />
        <TouchableOpacity onPress={() => onDelete(cf.id)} hitSlop={10} style={{ padding: 6 }}>
          <Feather name="trash-2" size={18} color={colors.textTer} />
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
  const [cfForm, setCfForm] = useState({
    amount: '',
    note: '',
    flow_date: '',
    currency: 'TRY',
    flow_type: 'inflow',
  });
  const swipeRefs = useRef({});

  const chartW = SW - 48;
  const chartH = 180;

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

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const sortedPeriods = useMemo(() => {
    if (!twrData?.periods?.length) return [];
    return [...twrData.periods].sort(
      (a, b) => new Date(a.end_date) - new Date(b.end_date)
    );
  }, [twrData]);

  const annualPct = useMemo(
    () => toDisplayPercent(twrData?.twr_annualized),
    [twrData]
  );
  const cumulativePct = useMemo(
    () => toDisplayPercent(twrData?.twr ?? twrData?.cumulative_twr),
    [twrData]
  );

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
      Toast.show({
        type: 'error',
        text1: err.response?.data?.detail || 'Silinemedi',
      });
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
      await createCashFlow({
        flow_date,
        amount: signed,
        currency: cfForm.currency,
        flow_type,
        note: cfForm.note.trim() || null,
      });
      Toast.show({ type: 'success', text1: 'Nakit akışı eklendi' });
      setSheetOpen(false);
      setCfForm({
        amount: '',
        note: '',
        flow_date: '',
        currency: 'TRY',
        flow_type: 'inflow',
      });
      load();
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: err.response?.data?.detail || 'Eklenemedi',
      });
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textTer, marginBottom: 12, letterSpacing: 0.3 }}>
          ZAMAN AĞIRLIKLI GETİRİ
        </Text>

        {!twrData ? (
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <Feather name="activity" size={48} color={colors.textTer} />
            <Text style={{ color: colors.textSec, marginTop: 16, textAlign: 'center', paddingHorizontal: 24 }}>
              TWR verisi bulunamadı. Performans için portföy snapshot&apos;ları oluşturun.
            </Text>
          </View>
        ) : (
          <>
            {/* Hero */}
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 20,
                marginBottom: 16,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 6 }}>Yıllıklandırılmış TWR</Text>
                  <Text
                    style={{
                      fontSize: 36,
                      fontWeight: '800',
                      color: (annualPct ?? 0) >= 0 ? colors.green : colors.red,
                      letterSpacing: -0.5,
                    }}
                  >
                    {annualPct == null ? '—' : formatPercent(annualPct)} yıllık
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setInfoOpen(true)}
                  hitSlop={12}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: colors.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="info" size={18} color={colors.accent} />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 20, gap: 12 }}>
                <View style={{ minWidth: '45%', flexGrow: 1 }}>
                  <Text style={{ fontSize: 11, color: colors.textTer }}>Kümülatif TWR</Text>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '700',
                      color: colors.textPri,
                      marginTop: 4,
                    }}
                  >
                    {cumulativePct == null ? '—' : formatPercent(cumulativePct)}
                  </Text>
                </View>
                <View style={{ minWidth: '45%', flexGrow: 1 }}>
                  <Text style={{ fontSize: 11, color: colors.textTer }}>Gün / Snapshot</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPri, marginTop: 4 }}>
                    {twrData.total_days ?? '—'} gün · {twrData.snapshot_count ?? '—'} adet
                  </Text>
                </View>
                <View style={{ width: '100%' }}>
                  <Text style={{ fontSize: 11, color: colors.textTer }}>Güncel değer</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.accent, marginTop: 4 }}>
                    {formatCurrency(twrData.current_value, 'TRY')}
                  </Text>
                </View>
              </View>
              {twrData.message ? (
                <Text style={{ fontSize: 12, color: colors.textSec, marginTop: 14 }}>{twrData.message}</Text>
              ) : null}
            </View>

            {sortedPeriods.length > 0 ? (
              <>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPri, marginBottom: 10 }}>
                  Kümülatif TWR (dönem sonları)
                </Text>
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingVertical: 12,
                    paddingHorizontal: 8,
                    marginBottom: 20,
                    alignItems: 'center',
                  }}
                >
                  <CumulativeTWRLineChart periods={sortedPeriods} width={chartW} height={chartH} colors={colors} />
                </View>

                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPri, marginBottom: 10 }}>
                  Dönem getirileri (son 12)
                </Text>
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingVertical: 12,
                    paddingHorizontal: 8,
                    marginBottom: 20,
                    alignItems: 'center',
                  }}
                >
                  <PeriodReturnBarChart periods={sortedPeriods} width={chartW} height={chartH} colors={colors} />
                </View>

                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPri, marginBottom: 10 }}>
                  Portföy değeri
                </Text>
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingVertical: 12,
                    paddingHorizontal: 8,
                    marginBottom: 8,
                    alignItems: 'center',
                  }}
                >
                  <PortfolioValueLineChart periods={sortedPeriods} width={chartW} height={chartH} colors={colors} />
                </View>
              </>
            ) : null}
          </>
        )}

        {/* Cash flows */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 24,
            marginBottom: 12,
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPri }}>Nakit Akışları</Text>
          <TouchableOpacity
            onPress={() => setSheetOpen(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: colors.accent,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
            }}
          >
            <Feather name="plus" size={16} color="#0B0E11" />
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#0B0E11' }}>Ekle</Text>
          </TouchableOpacity>
        </View>

        {cashFlows.length === 0 ? (
          <Text style={{ color: colors.textSec, textAlign: 'center', paddingVertical: 16 }}>Kayıtlı nakit akışı yok</Text>
        ) : (
          cashFlows.map((cf) => (
            <CashFlowRow
              key={cf.id}
              cf={cf}
              colors={colors}
              onDelete={openDeleteConfirm}
              rowRef={(r) => {
                if (r) swipeRefs.current[cf.id] = r;
              }}
            />
          ))
        )}
      </ScrollView>

      {/* TWR info modal */}
      <Modal visible={infoOpen} transparent animationType="fade" onRequestClose={() => setInfoOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 20 }}
          onPress={() => setInfoOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 20,
              padding: 22,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPri }}>TWR nasıl hesaplanır?</Text>
              <TouchableOpacity onPress={() => setInfoOpen(false)} hitSlop={10}>
                <Feather name="x" size={22} color={colors.textSec} />
              </TouchableOpacity>
            </View>
            {TWR_INFO_BODY.map((para, i) => (
              <Text key={i} style={{ fontSize: 14, color: colors.textSec, lineHeight: 22, marginBottom: 12 }}>
                {para}
              </Text>
            ))}
            <TouchableOpacity
              onPress={() => setInfoOpen(false)}
              style={{
                marginTop: 8,
                backgroundColor: colors.surfaceAlt,
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPri }}>Tamam</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Bottom sheet — new cash flow */}
      <Modal visible={sheetOpen} animationType="slide" transparent onRequestClose={() => setSheetOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={() => setSheetOpen(false)} />
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: Platform.OS === 'ios' ? 28 : 16,
              borderTopWidth: 1,
              borderColor: colors.border,
              maxHeight: '88%',
            }}
          >
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt }} />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPri }}>Yeni Nakit Akışı</Text>
                <TouchableOpacity onPress={() => setSheetOpen(false)} hitSlop={12}>
                  <Feather name="x" size={22} color={colors.textSec} />
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Tür</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                {[
                  { key: 'inflow', label: 'Giriş' },
                  { key: 'outflow', label: 'Çıkış' },
                ].map((opt) => {
                  const active = cfForm.flow_type === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => setCfForm((f) => ({ ...f, flow_type: opt.key }))}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: 'center',
                        backgroundColor: active ? colors.accent : colors.surfaceAlt,
                        borderWidth: 1,
                        borderColor: active ? colors.accent : colors.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '700',
                          color: active ? '#0B0E11' : colors.textSec,
                        }}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Tutar</Text>
              <TextInput
                value={cfForm.amount}
                onChangeText={(v) => setCfForm((f) => ({ ...f, amount: v }))}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textTer}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 16,
                  color: colors.textPri,
                  backgroundColor: colors.surfaceAlt,
                  marginBottom: 16,
                }}
              />

              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Para birimi</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {['TRY', 'USD', 'EUR'].map((c) => {
                  const active = cfForm.currency === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setCfForm((f) => ({ ...f, currency: c }))}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 20,
                        backgroundColor: active ? 'rgba(240,185,11,0.2)' : colors.surfaceAlt,
                        borderWidth: 1,
                        borderColor: active ? colors.accent : colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? colors.accent : colors.textSec }}>{c}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Tarih (YYYY-MM-DD)</Text>
              <TextInput
                value={cfForm.flow_date}
                onChangeText={(v) => setCfForm((f) => ({ ...f, flow_date: v }))}
                placeholder="2025-03-26"
                placeholderTextColor={colors.textTer}
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: colors.textPri,
                  backgroundColor: colors.surfaceAlt,
                  marginBottom: 16,
                }}
              />

              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Not</Text>
              <TextInput
                value={cfForm.note}
                onChangeText={(v) => setCfForm((f) => ({ ...f, note: v }))}
                placeholder="Opsiyonel açıklama"
                placeholderTextColor={colors.textTer}
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: colors.textPri,
                  backgroundColor: colors.surfaceAlt,
                  minHeight: 72,
                  textAlignVertical: 'top',
                  marginBottom: 20,
                }}
              />

              <TouchableOpacity
                onPress={submitCashFlow}
                disabled={submitting}
                style={{
                  backgroundColor: colors.accent,
                  paddingVertical: 16,
                  borderRadius: 14,
                  alignItems: 'center',
                  opacity: submitting ? 0.55 : 1,
                }}
              >
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
