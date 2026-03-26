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
import { Feather } from '@expo/vector-icons';
import Svg, { Line as SvgLine, Path, Circle, Text as SvgText } from 'react-native-svg';
import { getTWRComparison } from '../services/api';
import { formatPercent } from '../utils/format';
import { useTheme } from '../contexts/ThemeContext';
import Toast from 'react-native-toast-message';

const chartOuterWidth = Dimensions.get('window').width - 48;

const SERIES_PALETTE = ['#F0B90B', '#0ECB81', '#F6465D', '#3B82F6', '#A855F7', '#06B6D4', '#EC4899', '#94A3B8'];

function normalizeComparison(raw) {
  if (!raw) return { error: 'Veri yok' };
  if (raw.error) return { error: raw.error };

  const point = (p) => ({
    date: p.date,
    value: Number(p.cumulative_return ?? p.value ?? 0),
  });

  let portfolioData = [];
  if (Array.isArray(raw.portfolio_series)) {
    portfolioData = raw.portfolio_series.map(point);
  } else if (raw.portfolio?.series) {
    portfolioData = raw.portfolio.series.map(point);
  }

  const benchMap = {};
  if (raw.benchmarks && typeof raw.benchmarks === 'object') {
    Object.entries(raw.benchmarks).forEach(([name, bench]) => {
      if (Array.isArray(bench)) {
        const arr = bench.map(point);
        const last = arr[arr.length - 1];
        benchMap[name] = {
          series: arr,
          error: null,
          total_return: last ? Number(last.value) : 0,
        };
      } else if (bench && typeof bench === 'object') {
        const err = bench.error || null;
        const series = (bench.series || []).map(point);
        benchMap[name] = {
          series,
          error: err,
          total_return: Number(bench.total_return ?? bench.total_change ?? (series.length ? series[series.length - 1].value : 0)),
        };
      }
    });
  }

  const date_range = raw.date_range || {
    start: raw.first_date,
    end: raw.last_date,
  };

  let ranking = raw.ranking;
  if (!Array.isArray(ranking) || !ranking.length) {
    const portTotal =
      raw.portfolio?.total_change ??
      raw.portfolio_total_return ??
      (portfolioData.length ? portfolioData[portfolioData.length - 1].value : 0);
    ranking = [{ name: 'Portföy', total_return: Number(portTotal) }];
    Object.entries(benchMap).forEach(([name, b]) => {
      if (b.error || !b.series?.length) return;
      ranking.push({ name, total_return: Number(b.total_return ?? 0) });
    });
    ranking.sort((a, b) => (b.total_return ?? 0) - (a.total_return ?? 0));
  }

  return { portfolioData, benchMap, date_range, ranking };
}

function collectSortedDates(seriesList) {
  const set = new Set();
  seriesList.forEach((s) => s.data.forEach((p) => set.add(p.date)));
  return [...set].sort();
}

function alignSeriesData(data, sortedDates) {
  const byDate = Object.fromEntries(data.map((p) => [p.date, p.value]));
  let last = null;
  return sortedDates.map((d) => {
    if (byDate[d] != null) last = byDate[d];
    return { date: d, value: last };
  });
}

function MultiLineChart({ series, width, height, visible, colors }) {
  const pad = { top: 14, right: 12, bottom: 28, left: 44 };
  const cW = width - pad.left - pad.right;
  const cH = height - pad.top - pad.bottom;

  const active = series.filter((s) => visible[s.key] !== false && s.aligned.length >= 1);
  const allVals = active.flatMap((s) => s.aligned.map((d) => d.value).filter((v) => v != null));
  if (!active.length || !allVals.length) return null;

  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const padY = (max - min) * 0.08 || 0.5;
  const yMin = min - padY;
  const yMax = max + padY;
  const range = yMax - yMin || 1;

  const xAt = (i, len) => pad.left + (len <= 1 ? cW / 2 : (i / (len - 1)) * cW);
  const yAt = (v) => pad.top + cH - ((v - yMin) / range) * cH;

  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((t) => yAt(yMin + t * range));

  return (
    <Svg width={width} height={height}>
      <SvgLine x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke={colors.border} strokeWidth={1} />
      <SvgLine
        x1={pad.left}
        y1={height - pad.bottom}
        x2={width - pad.right}
        y2={height - pad.bottom}
        stroke={colors.border}
        strokeWidth={1}
      />
      {gridYs.map((gy, idx) => (
        <SvgLine key={idx} x1={pad.left} y1={gy} x2={width - pad.right} y2={gy} stroke={colors.surfaceAlt} strokeWidth={1} />
      ))}
      <SvgText x={2} y={pad.top + 10} fontSize={9} fill={colors.textTer}>
        {formatPercent(yMax)}
      </SvgText>
      <SvgText x={2} y={height - pad.bottom - 4} fontSize={9} fill={colors.textTer}>
        {formatPercent(yMin)}
      </SvgText>
      {active.map((s) => {
        const pts = s.aligned.map((d, i) => ({
          x: xAt(i, s.aligned.length),
          y: yAt(d.value),
        }));
        if (pts.length < 2) return null;
        const dPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        return (
          <Path key={s.key} d={dPath} fill="none" stroke={s.color} strokeWidth={s.key === 'portfolio' ? 2.5 : 1.8} />
        );
      })}
      {active.map((s) => {
        const pts = s.aligned.map((d, i) => ({
          x: xAt(i, s.aligned.length),
          y: yAt(d.value),
        }));
        if (!pts.length) return null;
        return pts.map((p, i) => <Circle key={`${s.key}-pt-${i}`} cx={p.x} cy={p.y} r={2.5} fill={s.color} />);
      })}
    </Svg>
  );
}

export default function ComparisonScreen() {
  const { colors } = useTheme();
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [visible, setVisible] = useState({ portfolio: true });

  const normalized = useMemo(() => (raw ? normalizeComparison(raw) : null), [raw]);

  const load = useCallback(async () => {
    setFetchError(null);
    try {
      const res = await getTWRComparison();
      setRaw(res.data);
      const nextVis = { portfolio: true };
      if (res.data?.benchmarks && typeof res.data.benchmarks === 'object') {
        Object.keys(res.data.benchmarks).forEach((k) => {
          nextVis[k] = true;
        });
      }
      setVisible(nextVis);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Yüklenemedi';
      setFetchError(msg);
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const chartSeries = useMemo(() => {
    if (!normalized || normalized.error) return [];
    const list = [];
    let c = 0;
    const nextColor = () => SERIES_PALETTE[c++ % SERIES_PALETTE.length];

    if (normalized.portfolioData.length) {
      list.push({
        key: 'portfolio',
        label: 'Portföy',
        color: colors.accent,
        data: normalized.portfolioData,
      });
    }
    Object.entries(normalized.benchMap || {}).forEach(([name, b]) => {
      if (b.error || !b.series?.length) return;
      list.push({ key: name, label: name, color: nextColor(), data: b.series });
    });

    const dates = collectSortedDates(list);
    if (!dates.length) return [];
    return list.map((s) => ({
      ...s,
      aligned: alignSeriesData(s.data, dates),
    }));
  }, [normalized, colors.accent]);

  const toggleVisible = (key) => setVisible((v) => ({ ...v, [key]: !v[key] }));

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (fetchError && !raw) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg, padding: 24 }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: colors.red, textAlign: 'center', marginBottom: 12 }}>{fetchError}</Text>
          <TouchableOpacity
            onPress={() => {
              setLoading(true);
              load();
            }}
            style={{ backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }}
          >
            <Text style={{ color: '#0B0E11', fontWeight: '700' }}>Tekrar dene</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (normalized?.error) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
          }}
        >
          <Feather name="alert-circle" size={40} color={colors.textTer} />
          <Text style={{ color: colors.textSec, marginTop: 12, textAlign: 'center' }}>{normalized.error}</Text>
        </View>
      </ScrollView>
    );
  }

  const ranking = normalized?.ranking || [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPri }}>Karşılaştırma</Text>
        <TouchableOpacity onPress={onRefresh} hitSlop={12}>
          <Feather name="refresh-cw" size={20} color={colors.textSec} />
        </TouchableOpacity>
      </View>

      {normalized?.date_range?.start && normalized?.date_range?.end && (
        <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 12 }}>
          {normalized.date_range.start} — {normalized.date_range.end}
        </Text>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, gap: 8 }}>
        {chartSeries.map((s) => {
          const on = visible[s.key] !== false;
          return (
            <TouchableOpacity
              key={s.key}
              onPress={() => toggleVisible(s.key)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 10,
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: on ? s.color : colors.border,
                opacity: on ? 1 : 0.45,
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color, marginRight: 6 }} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textPri }} numberOfLines={1}>
                {s.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {chartSeries.length > 0 && (
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            padding: 12,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPri, marginBottom: 8 }}>Kümülatif getiri</Text>
          <MultiLineChart series={chartSeries} width={chartOuterWidth} height={240} visible={visible} colors={colors} />
        </View>
      )}

      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        }}
      >
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            color: colors.textPri,
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          Sıralama
        </Text>
        {ranking.map((row, i) => {
          const tr = row.total_return ?? 0;
          const col =
            chartSeries.find((s) => s.label === row.name || (row.name === 'Portföy' && s.key === 'portfolio'))?.color ??
            colors.textTer;
          return (
            <View
              key={`${row.name}-${i}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: i < ranking.length - 1 ? 1 : 0,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ width: 28, fontSize: 13, fontWeight: '700', color: colors.textTer }}>{i + 1}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: col, marginRight: 10 }} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPri }}>{row.name}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: tr >= 0 ? colors.green : colors.red }}>{formatPercent(tr)}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
