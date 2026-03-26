import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Switch,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { runBistEmaScan } from '../services/api';
import { formatCurrency } from '../utils/format';
import { useTheme } from '../contexts/ThemeContext';
import Toast from 'react-native-toast-message';

const EMA_OPTIONS = [20, 50, 100];

function emaCell(row, p) {
  const key = `ema_${p}`;
  const v = row[key];
  if (v == null) return '—';
  const above = row.close > v;
  return { text: formatCurrency(v), above };
}

export default function ScannerScreen() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [symbolsSource, setSymbolsSource] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [emaPeriods, setEmaPeriods] = useState([20, 50, 100]);
  const [useMyInstruments, setUseMyInstruments] = useState(false);

  const runScan = useCallback(async () => {
    if (emaPeriods.length === 0) {
      Toast.show({ type: 'error', text1: 'En az bir EMA seçin' });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await runBistEmaScan({ ema_periods: emaPeriods, use_my_instruments: useMyInstruments });
      setSymbolsSource(res.data?.source || 'default');
      setResults(res.data);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Tarama başarısız';
      setError(msg);
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [emaPeriods, useMyInstruments]);

  const toggleEma = (period) => {
    setEmaPeriods((prev) =>
      prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period].sort((a, b) => a - b)
    );
  };

  const onRefresh = useCallback(() => {
    if (emaPeriods.length === 0) {
      return;
    }
    setRefreshing(true);
    runScan();
  }, [emaPeriods.length, runScan]);

  const rowCount = results?.results?.length ?? 0;

  const renderRow = ({ item: row, index }) => {
    const isLast = index === rowCount - 1;
    return (
    <View
      style={{
        marginHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        backgroundColor: colors.surface,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: colors.border,
        borderBottomLeftRadius: isLast ? 10 : 0,
        borderBottomRightRadius: isLast ? 10 : 0,
      }}
    >
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.textPri }}>{row.symbol}</Text>
      <Text style={{ width: 88, textAlign: 'right', fontSize: 12, fontWeight: '700', color: colors.textPri }}>
        {formatCurrency(row.close)}
      </Text>
      {emaPeriods.map((p) => {
        const cell = emaCell(row, p);
        if (cell === '—') {
          return (
            <Text key={p} style={{ width: 76, textAlign: 'right', fontSize: 11, color: colors.textTer }}>
              —
            </Text>
          );
        }
        return (
          <View key={p} style={{ width: 76, alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 11, color: colors.textSec }}>{cell.text}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: cell.above ? colors.green : colors.red, marginTop: 2 }}>
              {cell.above ? 'üstünde' : 'altında'}
            </Text>
          </View>
        );
      })}
    </View>
  );
  };

  const headerRow = results?.results?.[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={results?.results || []}
        keyExtractor={(item) => item.symbol}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        renderItem={(props) => renderRow(props)}
        ListHeaderComponent={
          <View style={{ padding: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPri }}>BIST EMA taraması</Text>
            <Text style={{ fontSize: 12, color: colors.textTer, marginTop: 4, marginBottom: 14 }}>
              Seçilen EMA dönemlerinin üzerinde kapanış yapan hisseler listelenir.
            </Text>

            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 14,
                padding: 14,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPri, marginBottom: 10 }}>EMA dönemleri</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                {EMA_OPTIONS.map((p) => {
                  const on = emaPeriods.includes(p);
                  return (
                    <TouchableOpacity
                      key={p}
                      onPress={() => toggleEma(p)}
                      style={{ flexDirection: 'row', alignItems: 'center' }}
                    >
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          borderWidth: 2,
                          borderColor: on ? colors.accent : colors.textTer,
                          backgroundColor: on ? colors.accent : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 8,
                        }}
                      >
                        {on ? <Feather name="check" size={14} color="#0B0E11" /> : null}
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPri }}>EMA {p}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 8,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  marginBottom: 8,
                }}
              >
                <Switch
                  value={useMyInstruments}
                  onValueChange={setUseMyInstruments}
                  trackColor={{ false: colors.surfaceAlt, true: colors.accent }}
                  thumbColor="#fff"
                />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPri }}>Kendi enstrümanlarım</Text>
                  <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 2 }}>Kapalı: BIST 30 / varsayılan liste</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={runScan}
                disabled={loading || emaPeriods.length === 0}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  backgroundColor: colors.accent,
                  paddingVertical: 14,
                  borderRadius: 12,
                  opacity: loading || emaPeriods.length === 0 ? 0.45 : 1,
                }}
              >
                {loading ? <ActivityIndicator size="small" color="#0B0E11" /> : <Feather name="search" size={18} color="#0B0E11" />}
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#0B0E11' }}>{loading ? 'Taranıyor...' : 'Tara'}</Text>
              </TouchableOpacity>
            </View>

            {error ? (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: colors.red,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: colors.red, fontSize: 13 }}>{error}</Text>
              </View>
            ) : null}

            {results ? (
              <Text style={{ fontSize: 12, color: colors.textSec, marginBottom: 8 }}>
                <Text style={{ fontWeight: '800', color: colors.textPri }}>{results.count}</Text> sonuç
                {symbolsSource === 'db' ? ' · Portföy BIST enstrümanları' : ' · BIST 30 / varsayılan'}
              </Text>
            ) : null}

            {headerRow ? (
              <View
                style={{
                  marginHorizontal: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  backgroundColor: colors.surfaceAlt,
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ flex: 1, fontSize: 10, fontWeight: '800', color: colors.textTer }}>SEMBOL</Text>
                <Text style={{ width: 88, textAlign: 'right', fontSize: 10, fontWeight: '800', color: colors.textTer }}>FİYAT</Text>
                {emaPeriods.map((p) => (
                  <Text key={p} style={{ width: 76, textAlign: 'right', fontSize: 10, fontWeight: '800', color: colors.textTer }}>
                    EMA {p}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          results && results.results?.length === 0 ? (
            <View style={{ padding: 32, alignItems: 'center' }}>
              <Feather name="search" size={40} color={colors.textTer} />
              <Text style={{ color: colors.textSec, marginTop: 12, textAlign: 'center' }}>Kriteri sağlayan hisse bulunamadı</Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}
