import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import Svg, { Path, G, Line as SvgLine, Text as SvgText, Circle, Rect } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import {
  getPortfolioSummary,
  getPortfolioSnapshots,
  getFxRates,
  fetchAllPrices,
  createPortfolioSnapshot,
} from '../services/api';
import { formatCurrency, formatDate, formatPercent } from '../utils/format';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import TransactionForm from '../components/TransactionForm';

const PIE_COLORS_REST = ['#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4'];

/** Catmull-Rom style smooth cubic through points (screen coords). */
function buildSmoothLinePath(points) {
  if (!points?.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function buildSparklineAreaPath(linePath, points, bottomY) {
  if (!linePath || !points?.length) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
}

/** Donut slice: angles in radians, CCW from positive x; start at top via caller offsets. */
function donutSlicePath(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const x1 = cx + rOuter * Math.cos(startAngle);
  const y1 = cy + rOuter * Math.sin(startAngle);
  const x2 = cx + rOuter * Math.cos(endAngle);
  const y2 = cy + rOuter * Math.sin(endAngle);
  const x3 = cx + rInner * Math.cos(endAngle);
  const y3 = cy + rInner * Math.sin(endAngle);
  const x4 = cx + rInner * Math.cos(startAngle);
  const y4 = cy + rInner * Math.sin(startAngle);
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4} Z`;
}

export default function DashboardScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const piePalette = useMemo(
    () => [colors.accent, colors.green, colors.red, ...PIE_COLORS_REST],
    [colors.accent, colors.green, colors.red]
  );

  const [summary, setSummary] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [fxRates, setFxRates] = useState({ USDTRY: null, EURTRY: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [gainersTab, setGainersTab] = useState('gainers');
  const [showForm, setShowForm] = useState(false);
  const [dismissedRisks, setDismissedRisks] = useState([]);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [chartPeriod, setChartPeriod] = useState(30);

  const chartWidth = useMemo(() => Math.max(200, Dimensions.get('window').width - 48), []);
  const chartHeight = 180;
  const chartPad = { top: 28, right: 12, bottom: 32, left: 60 };

  const fetchSnapshots = useCallback(async (days) => {
    try {
      const res = await getPortfolioSnapshots(days);
      const raw = res?.data;
      setSnapshots(Array.isArray(raw) ? raw : []);
    } catch (_) {}
  }, []);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [summaryRes, snapshotsRes, fxRes] = await Promise.all([
        getPortfolioSummary(),
        getPortfolioSnapshots(chartPeriod),
        getFxRates(),
      ]);
      setSummary(summaryRes?.data ?? null);
      const raw = snapshotsRes?.data;
      setSnapshots(Array.isArray(raw) ? raw : []);
      if (fxRes?.data) {
        setFxRates({
          USDTRY: fxRes.data.USDTRY ?? null,
          EURTRY: fxRes.data.EURTRY ?? null,
        });
      }
    } catch (err) {
      if (err.response?.status !== 401) {
        setError(err.response?.data?.detail || err.message || 'Yüklenemedi');
      }
    }
  }, [chartPeriod]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchData();
      setLoading(false);
    })();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handlePeriodChange = useCallback((days) => {
    setChartPeriod(days);
    setSelectedPoint(null);
    fetchSnapshots(days);
  }, [fetchSnapshots]);

  const sortedSnapshots = useMemo(() => {
    if (!snapshots.length) return [];
    return [...snapshots].sort((a, b) => {
      const da = a.snapshot_date ? new Date(a.snapshot_date).getTime() : 0;
      const db = b.snapshot_date ? new Date(b.snapshot_date).getTime() : 0;
      return da - db;
    });
  }, [snapshots]);

  const chartData = useMemo(() => {
    const valid = sortedSnapshots.filter(
      (s) => typeof s.total_market_value === 'number' && !Number.isNaN(s.total_market_value)
    );
    if (valid.length < 2) return null;

    const values = valid.map((s) => s.total_market_value);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const range = maxV - minV || 1;
    const plotW = chartWidth - chartPad.left - chartPad.right;
    const plotH = chartHeight - chartPad.top - chartPad.bottom;
    const n = valid.length;

    const points = valid.map((s, i) => {
      const x = chartPad.left + (i / (n - 1)) * plotW;
      const y = chartPad.top + plotH * (1 - (s.total_market_value - minV) / range);
      const date = s.snapshot_date;
      const value = s.total_market_value;
      return { x, y, date, value };
    });

    const linePath = buildSmoothLinePath(points);
    const areaPath = buildSparklineAreaPath(linePath, points, chartPad.top + plotH);

    const yTickCount = 4;
    const yTicks = [];
    for (let i = 0; i <= yTickCount; i++) {
      const val = minV + (range * i) / yTickCount;
      const y = chartPad.top + plotH * (1 - i / yTickCount);
      yTicks.push({ val, y });
    }

    const maxXLabels = Math.min(n, 5);
    const step = Math.max(1, Math.floor((n - 1) / (maxXLabels - 1)));
    const xIndices = [];
    for (let i = 0; i < n; i += step) xIndices.push(i);
    const last = n - 1;
    if (xIndices[xIndices.length - 1] !== last) {
      const prevIdx = xIndices[xIndices.length - 1];
      const minPixelGap = 40;
      const prevX = chartPad.left + (prevIdx / (n - 1)) * plotW;
      const lastX = chartPad.left + plotW;
      if (lastX - prevX >= minPixelGap) {
        xIndices.push(last);
      } else {
        xIndices[xIndices.length - 1] = last;
      }
    }

    return { points, linePath, areaPath, yTicks, xIndices, plotW, plotH };
  }, [sortedSnapshots, chartWidth, chartHeight]);

  const allocationSlices = useMemo(() => {
    const list = summary?.allocation_by_asset_type;
    if (!Array.isArray(list) || !list.length) return [];

    const totalVal = list.reduce((acc, row) => acc + (Number(row.total_value) || 0), 0);
    const totalPct = list.reduce((acc, row) => acc + (Number(row.percentage) || 0), 0);
    const useValue = totalVal > 0;
    const divisor = useValue ? totalVal : (totalPct > 0 ? totalPct : 1);

    let cum = 0;
    return list.map((row, i) => {
      const raw = useValue ? (Number(row.total_value) || 0) : (Number(row.percentage) || 0);
      const frac = raw / divisor;
      const start = cum;
      cum += frac;
      return {
        key: `${row.asset_type ?? i}-${i}`,
        label: row.asset_type ?? '—',
        pct: Number(row.percentage) || (frac * 100),
        value: Number(row.total_value) || 0,
        frac,
        start,
        end: cum,
        color: piePalette[i % piePalette.length],
      };
    });
  }, [summary, piePalette]);

  const piePaths = useMemo(() => {
    const cx = 90;
    const cy = 90;
    const rO = 78;
    const rI = 48;
    if (!allocationSlices.length) return [];

    return allocationSlices.map((s) => {
      const a0 = -Math.PI / 2 + s.start * 2 * Math.PI;
      const a1 = -Math.PI / 2 + s.end * 2 * Math.PI;
      if (a1 - a0 < 0.0001) return { ...s, d: '' };
      return { ...s, d: donutSlicePath(cx, cy, rO, rI, a0, a1) };
    }).filter((x) => x.d);
  }, [allocationSlices]);

  const metadata = summary?.metadata ?? {};
  const usdTry = metadata.usdtry_rate ?? fxRates.USDTRY;
  const eurTry = metadata.eurtry_rate ?? fxRates.EURTRY;
  const risks = summary?.concentration_risks;
  const visibleRisks = Array.isArray(risks)
    ? risks.filter((r) => r?.symbol && !dismissedRisks.includes(r.symbol))
    : [];

  const totalValue = summary?.total_market_value_try;
  const costBasis = summary?.total_cost_basis_try;
  const unrealized = summary?.total_unrealized_pl_try;
  const plPct = summary?.total_unrealized_pl_percentage;
  const posCount = summary?.position_count;
  const plPositive = (unrealized ?? 0) >= 0;

  const topGainers = Array.isArray(summary?.top_gainers) ? summary.top_gainers : [];
  const topLosers = Array.isArray(summary?.top_losers) ? summary.top_losers : [];
  const moversList = gainersTab === 'gainers' ? topGainers : topLosers;

  const handleSnapshot = async () => {
    try {
      await createPortfolioSnapshot();
      Toast.show({ type: 'success', text1: 'Snapshot oluşturuldu' });
      await fetchData();
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: err.response?.data?.detail || 'Snapshot oluşturulamadı',
      });
    }
  };

  const handleRefreshPrices = async () => {
    try {
      await fetchAllPrices();
      Toast.show({ type: 'success', text1: 'Fiyatlar güncellendi' });
      await fetchData();
    } catch {
      Toast.show({ type: 'error', text1: 'Fiyat güncellenemedi' });
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg, padding: 16 }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.red,
            borderRadius: 16,
            padding: 20,
            maxWidth: 360,
          }}
        >
          <Text style={{ color: colors.red, fontWeight: '600', marginBottom: 8 }}>Hata</Text>
          <Text style={{ color: colors.textSec }}>{error}</Text>
          <TouchableOpacity
            onPress={() => {
              setError(null);
              setLoading(true);
              fetchData().finally(() => setLoading(false));
            }}
            style={{
              marginTop: 16,
              backgroundColor: colors.accent,
              paddingVertical: 10,
              borderRadius: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#0B0E11', fontWeight: '600' }}>Tekrar dene</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        <Text style={{ fontSize: 14, color: colors.textSec, marginBottom: 12 }}>
          Merhaba,{' '}
          <Text style={{ fontWeight: '600', color: colors.textPri }}>
            {user?.username ?? 'Kullanıcı'}
          </Text>
        </Text>

        {/* Hero */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            padding: 18,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 16,
          }}
        >
          {/* Top row: value + action icons */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: colors.textTer, marginBottom: 4 }}>Toplam Portföy Değeri</Text>
              <Text style={{ fontSize: 28, fontWeight: '700', color: colors.textPri }}>{formatCurrency(totalValue)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 }}>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                    backgroundColor: plPositive ? 'rgba(14, 203, 129, 0.15)' : 'rgba(246, 70, 93, 0.15)',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: plPositive ? colors.green : colors.red }}>
                    {formatPercent(plPct ?? 0)}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.textTer }}>
                  {posCount != null ? `${posCount} pozisyon` : '—'}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, marginLeft: 12 }}>
              {[
                { icon: 'plus-circle', label: 'İşlem', color: colors.accent, onPress: () => setShowForm(true) },
                { icon: 'camera', label: 'Snapshot', color: colors.textSec, onPress: handleSnapshot },
                { icon: 'refresh-cw', label: 'Fiyatlar', color: colors.textSec, onPress: handleRefreshPrices },
              ].map((act) => (
                <TouchableOpacity
                  key={act.icon}
                  onPress={act.onPress}
                  activeOpacity={0.6}
                  style={{ alignItems: 'center', width: 48 }}
                >
                  <View style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: act.color === colors.accent ? 'rgba(240, 185, 11, 0.15)' : (colors.surfaceAlt || 'rgba(255,255,255,0.05)'),
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Feather name={act.icon} size={17} color={act.color} />
                  </View>
                  <Text style={{ fontSize: 9, color: colors.textTer, marginTop: 3, textAlign: 'center' }}>{act.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Stats row */}
          <View
            style={{
              flexDirection: 'row',
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: 12,
              gap: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, color: colors.textTer }}>Maliyet</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPri, marginTop: 3 }} numberOfLines={1}>
                {formatCurrency(costBasis)}
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: colors.border }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, color: colors.textTer }}>Gerçekleşmemiş K/Z</Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: unrealized == null ? colors.textSec : plPositive ? colors.green : colors.red,
                  marginTop: 3,
                }}
                numberOfLines={1}
              >
                {formatCurrency(unrealized)}
              </Text>
            </View>
          </View>
        </View>

        {/* Portfolio Chart */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            paddingVertical: 14,
            paddingHorizontal: 8,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPri }}>Portföy Değeri</Text>
            <View style={{ flexDirection: 'row', gap: 2 }}>
              {[
                { label: '7G', days: 7 },
                { label: '1A', days: 30 },
                { label: '3A', days: 90 },
                { label: '6A', days: 180 },
                { label: '1Y', days: 365 },
                { label: 'Tümü', days: 9999 },
              ].map((opt) => {
                const active = chartPeriod === opt.days;
                return (
                  <TouchableOpacity
                    key={opt.days}
                    onPress={() => handlePeriodChange(opt.days)}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: active ? colors.accent : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: active ? '#181A20' : colors.textTer }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {chartData ? (
            <View>
              <Svg width={chartWidth} height={chartHeight}>
                {/* Horizontal grid lines + Y labels */}
                {chartData.yTicks.map((tick, i) => (
                  <G key={`yt-${i}`}>
                    <SvgLine x1={chartPad.left} y1={tick.y} x2={chartWidth - chartPad.right} y2={tick.y}
                      stroke={colors.border} strokeWidth={0.5} strokeDasharray="4,4" />
                    <SvgText x={chartPad.left - 6} y={tick.y + 3} fontSize={9} fill={colors.textTer} textAnchor="end" fontWeight="500">
                      {tick.val >= 1000000 ? `${(tick.val / 1000000).toFixed(1)}M` : tick.val >= 1000 ? `${(tick.val / 1000).toFixed(0)}K` : tick.val.toFixed(0)}
                    </SvgText>
                  </G>
                ))}

                {/* X axis labels */}
                {chartData.xIndices.map((idx) => {
                  const p = chartData.points[idx];
                  if (!p) return null;
                  const d = p.date ? new Date(p.date) : null;
                  const label = d ? `${d.getDate()}/${d.getMonth() + 1}` : '';
                  return (
                    <SvgText key={`xl-${idx}`} x={p.x} y={chartHeight - 6} fontSize={9} fill={colors.textTer} textAnchor="middle" fontWeight="500">
                      {label}
                    </SvgText>
                  );
                })}

                {/* Area + Line */}
                <Path d={chartData.areaPath} fill={colors.accent} opacity={0.12} />
                <Path d={chartData.linePath} fill="none" stroke={colors.accent} strokeWidth={2.5} strokeLinecap="round" />

                {/* Data points - show all when few, only selected when many */}
                {chartData.points.length <= 14
                  ? chartData.points.map((p, i) => (
                    <Circle key={`dp-${i}`} cx={p.x} cy={p.y} r={selectedPoint?.date === p.date ? 6 : 3}
                      fill={selectedPoint?.date === p.date ? colors.accent : colors.surface}
                      stroke={colors.accent} strokeWidth={selectedPoint?.date === p.date ? 2.5 : 1.5} />
                  ))
                  : selectedPoint && (() => {
                    const sp = chartData.points.find(pt => pt.date === selectedPoint.date);
                    return sp ? (
                      <Circle cx={sp.x} cy={sp.y} r={6} fill={colors.accent} stroke={colors.accent} strokeWidth={2.5} />
                    ) : null;
                  })()
                }

                {/* Selected point crosshair */}
                {selectedPoint && (() => {
                  const sp = chartData.points.find(p => p.date === selectedPoint.date);
                  if (!sp) return null;
                  return (
                    <SvgLine x1={sp.x} y1={chartPad.top} x2={sp.x} y2={chartPad.top + chartData.plotH}
                      stroke={colors.accent} strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />
                  );
                })()}
              </Svg>

              {/* Touch overlay */}
              <View style={{ position: 'absolute', left: chartPad.left, top: chartPad.top, width: chartData.plotW, height: chartData.plotH }}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(e) => {
                  const touchX = e.nativeEvent.locationX;
                  let closest = chartData.points[0];
                  let minDist = Infinity;
                  for (const p of chartData.points) {
                    const d = Math.abs(p.x - chartPad.left - touchX);
                    if (d < minDist) { minDist = d; closest = p; }
                  }
                  setSelectedPoint(closest);
                }}
                onResponderMove={(e) => {
                  const touchX = e.nativeEvent.locationX;
                  let closest = chartData.points[0];
                  let minDist = Infinity;
                  for (const p of chartData.points) {
                    const d = Math.abs(p.x - chartPad.left - touchX);
                    if (d < minDist) { minDist = d; closest = p; }
                  }
                  setSelectedPoint(closest);
                }}
                onResponderRelease={() => {
                  setTimeout(() => setSelectedPoint(null), 2000);
                }}
              />

              {/* Floating tooltip near selected point */}
              {selectedPoint && (() => {
                const sp = chartData.points.find(pt => pt.date === selectedPoint.date);
                if (!sp) return null;
                const tooltipW = 120;
                const tooltipH = 38;
                const pointAbove = sp.y - tooltipH - 12 >= 0;
                let left = sp.x - tooltipW / 2;
                if (left < 4) left = 4;
                if (left + tooltipW > chartWidth - 4) left = chartWidth - tooltipW - 4;
                const top = pointAbove ? sp.y - tooltipH - 10 : sp.y + 14;
                const d = sp.date ? new Date(sp.date) : null;
                const dateStr = d ? `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}` : '';
                return (
                  <View pointerEvents="none" style={{
                    position: 'absolute', left, top,
                    width: tooltipW, height: tooltipH,
                    backgroundColor: colors.surfaceAlt || '#1E2329',
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 6,
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.accent }}>{formatCurrency(sp.value)}</Text>
                    <Text style={{ fontSize: 9, color: colors.textTer, marginTop: 1 }}>{dateStr}</Text>
                  </View>
                );
              })()}
            </View>
          ) : (
            <View style={{ height: chartHeight, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: colors.textTer, fontSize: 13 }}>Grafik için yeterli veri yok</Text>
            </View>
          )}
        </View>

        {/* Allocation pie */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPri, marginBottom: 12 }}>
            Varlık dağılımı
          </Text>
          {piePaths.length ? (
            <>
              <View style={{ alignItems: 'center' }}>
                <Svg width={180} height={180} viewBox="0 0 180 180">
                  <G>
                    {piePaths.map((slice) => (
                      <Path key={slice.key} d={slice.d} fill={slice.color} stroke={colors.surface} strokeWidth={1} />
                    ))}
                  </G>
                </Svg>
              </View>
              <View style={{ marginTop: 8, gap: 8 }}>
                {allocationSlices.map((row, i) => (
                  <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: row.color ?? piePalette[i % piePalette.length],
                        }}
                      />
                      <Text style={{ color: colors.textPri, fontSize: 13, flex: 1 }} numberOfLines={1}>
                        {row.label}
                      </Text>
                    </View>
                    <Text style={{ color: colors.textSec, fontSize: 13, fontWeight: '600' }}>
                      {typeof row.pct === 'number' ? `${row.pct.toFixed(1)}%` : '—'}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={{ color: colors.textTer, fontSize: 13 }}>Dağılım verisi yok</Text>
          )}
        </View>

        {/* Gainers / Losers */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            padding: 14,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 16,
          }}
        >
          <View style={{ flexDirection: 'row', marginBottom: 12, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 3 }}>
            <TouchableOpacity
              onPress={() => setGainersTab('gainers')}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                alignItems: 'center',
                backgroundColor: gainersTab === 'gainers' ? 'rgba(14, 203, 129, 0.2)' : 'transparent',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.green }}>Kazananlar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setGainersTab('losers')}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                alignItems: 'center',
                backgroundColor: gainersTab === 'losers' ? 'rgba(246, 70, 93, 0.2)' : 'transparent',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.red }}>Kaybedenler</Text>
            </TouchableOpacity>
          </View>
          {moversList.length === 0 ? (
            <Text style={{ color: colors.textTer, fontSize: 13 }}>Liste boş</Text>
          ) : (
            moversList.map((item, idx) => {
              const sym = item.symbol ?? '—';
              const nm = item.name ?? '';
              const pctVal = item.unrealized_pl_percentage ?? item.current_pl_percentage;
              const tv = item.market_value_try ?? item.total_value;
              const pl = item.unrealized_pl_try ?? item.current_pl;
              const pos = pctVal != null && Number(pctVal) >= 0;
              return (
                <View
                  key={`${sym}-${idx}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    borderBottomWidth: idx === moversList.length - 1 ? 0 : 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPri }}>{sym}</Text>
                    {!!nm && <Text style={{ fontSize: 12, color: colors.textTer, marginTop: 2 }} numberOfLines={1}>{nm}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: pos ? colors.green : colors.red }}>
                      {formatPercent(pctVal ?? 0)}
                    </Text>
                    <Text style={{ fontSize: 12, color: pos ? colors.green : colors.red, marginTop: 2 }}>
                      {pl != null ? formatCurrency(pl) : '—'}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 1 }}>{formatCurrency(tv)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Concentration */}
        {visibleRisks.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            {visibleRisks.map((risk) => {
              const w = risk.weight;
              const wStr = typeof w === 'number' && !Number.isNaN(w) ? `${w.toFixed(1)}%` : '—';
              return (
                <View
                  key={risk.symbol}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                    borderWidth: 1,
                    borderColor: 'rgba(245, 158, 11, 0.45)',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginBottom: 8,
                  }}
                >
                  <Feather name="alert-triangle" size={18} color="#F59E0B" />
                  <Text style={{ flex: 1, marginLeft: 10, fontSize: 13, color: '#FCD34D' }}>
                    <Text style={{ fontWeight: '700' }}>{risk.symbol}</Text>
                    {` — ${wStr} konsantrasyon`}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setDismissedRisks((prev) => [...prev, risk.symbol])}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={18} color="#F59E0B" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* FX footer */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            backgroundColor: colors.surface,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 12, color: colors.textSec }}>
            USD/TRY{' '}
            <Text style={{ fontWeight: '700', color: colors.textPri }}>
              {usdTry != null ? Number(usdTry).toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : '—'}
            </Text>
          </Text>
          <Text style={{ fontSize: 12, color: colors.textTer }}>·</Text>
          <Text style={{ fontSize: 12, color: colors.textSec }}>
            EUR/TRY{' '}
            <Text style={{ fontWeight: '700', color: colors.textPri }}>
              {eurTry != null ? Number(eurTry).toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : '—'}
            </Text>
          </Text>
          {metadata.last_price_update_at ? (
            <>
              <Text style={{ fontSize: 12, color: colors.textTer }}>·</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Feather name="clock" size={12} color={colors.textTer} />
                <Text style={{ fontSize: 11, color: colors.textTer }}>{formatDate(metadata.last_price_update_at)}</Text>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      {showForm ? (
        <TransactionForm
          visible={showForm}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            fetchData();
          }}
        />
      ) : null}
    </View>
  );
}
