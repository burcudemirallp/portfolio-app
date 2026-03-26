import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getSaleRecords, deleteSaleRecord } from '../services/api';
import { formatCurrency, formatDate, formatPercent } from '../utils/format';
import { useTheme } from '../contexts/ThemeContext';
import ConfirmDialog from '../components/ConfirmDialog';
import Toast from 'react-native-toast-message';

const PERIODS = [
  { key: 'all', label: 'Tümü' },
  { key: 'month', label: 'Bu Ay' },
  { key: '3m', label: '3 Ay' },
  { key: '6m', label: '6 Ay' },
  { key: 'year', label: 'Yıl' },
];

function saleDate(s) {
  return s.sale_date || s.sold_at || s.created_at;
}

function pl(s) {
  return s.profit_loss ?? s.profit_loss_try ?? 0;
}

function plPct(s) {
  return s.profit_loss_pct ?? s.profit_loss_percentage ?? 0;
}

function qty(s) {
  return s.quantity ?? s.sell_quantity ?? s.buy_quantity ?? 0;
}

function cur(s) {
  return s.currency || s.sell_currency || s.buy_currency || 'TRY';
}

export default function SalesScreen() {
  const { colors } = useTheme();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState('all');
  const [deleteId, setDeleteId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await getSaleRecords();
      setSales(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Satışlar yüklenemedi' });
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

  const filteredSales = useMemo(() => {
    if (period === 'all') return sales;
    const now = new Date();
    let from;
    if (period === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (period === '3m') {
      from = new Date(now);
      from.setMonth(from.getMonth() - 3);
    } else if (period === '6m') {
      from = new Date(now);
      from.setMonth(from.getMonth() - 6);
    } else if (period === 'year') from = new Date(now.getFullYear(), 0, 1);
    return sales.filter((s) => new Date(saleDate(s)) >= from);
  }, [sales, period]);

  const stats = useMemo(() => {
    const wins = filteredSales.filter((r) => pl(r) > 0).length;
    const total = filteredSales.length;
    const winRate = total ? (wins / total) * 100 : 0;
    const totalPL = filteredSales.reduce((acc, r) => acc + pl(r), 0);
    const volume = filteredSales.reduce((acc, r) => {
      if (r.sell_value_try != null) return acc + r.sell_value_try;
      const sp = Number(r.sell_price);
      const q = Number(qty(r));
      if (!Number.isNaN(sp) && !Number.isNaN(q)) return acc + sp * q;
      return acc;
    }, 0);
    return { total, winRate, totalPL, volume };
  }, [filteredSales]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteSaleRecord(deleteId);
      Toast.show({ type: 'success', text1: 'Silindi' });
      load();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Silinemedi' });
    }
    setDeleteId(null);
  };

  const chip = (active) => ({
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: active ? colors.accent : colors.surfaceAlt,
    borderWidth: 1,
    borderColor: active ? colors.accent : colors.border,
  });

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={filteredSales}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        renderItem={({ item: sale }) => {
          const p = pl(sale);
          const positive = p >= 0;
          const symbol = sale.instrument_symbol || sale.symbol || `#${sale.instrument_id}`;
          const days = sale.holding_days;
          return (
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 10,
                backgroundColor: colors.surface,
                borderRadius: 14,
                padding: 14,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPri }}>{symbol}</Text>
                  {sale.instrument_name ? (
                    <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 2 }} numberOfLines={1}>
                      {sale.instrument_name}
                    </Text>
                  ) : null}
                  <Text style={{ fontSize: 12, color: colors.textSec, marginTop: 8 }}>
                    Alış {formatCurrency(sale.buy_price, cur(sale))} → Satış {formatCurrency(sale.sell_price, cur(sale))}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 4 }}>
                    {formatDate(sale.buy_date)} → {formatDate(saleDate(sale))}
                    {days != null ? ` · ${days} gün` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: positive ? colors.green : colors.red }}>
                    {formatCurrency(p, cur(sale))}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: positive ? colors.green : colors.red, marginTop: 2 }}>
                    {formatPercent(plPct(sale))}
                  </Text>
                  <TouchableOpacity onPress={() => setDeleteId(sale.id)} style={{ marginTop: 8 }} hitSlop={8}>
                    <Feather name="trash-2" size={16} color={colors.red} />
                  </TouchableOpacity>
                </View>
              </View>
              {sale.notes ? (
                <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 8 }} numberOfLines={2}>
                  {sale.notes}
                </Text>
              ) : null}
            </View>
          );
        }}
        ListHeaderComponent={
          <View style={{ padding: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPri, marginBottom: 12 }}>Satış geçmişi</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {PERIODS.map((p) => {
                const active = period === p.key;
                return (
                  <TouchableOpacity key={p.key} onPress={() => setPeriod(p.key)} style={chip(active)}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#0B0E11' : colors.textPri }}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 11, color: colors.textTer }}>Toplam K/Z</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: stats.totalPL >= 0 ? colors.green : colors.red, marginTop: 4 }}>
                  {formatCurrency(stats.totalPL)}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 11, color: colors.textTer }}>Kazanma oranı</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPri, marginTop: 4 }}>
                  {stats.total ? `${stats.winRate.toFixed(0)}%` : '—'}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 11, color: colors.textTer }}>Hacim (TRY)</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPri, marginTop: 4 }} numberOfLines={1}>
                  {formatCurrency(stats.volume, 'TRY')}
                </Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <Feather name="inbox" size={44} color={colors.textTer} />
            <Text style={{ color: colors.textSec, marginTop: 12 }}>Bu dönemde satış kaydı yok</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 32 }}
      />

      <ConfirmDialog
        visible={!!deleteId}
        title="Satış kaydını sil"
        message="Bu kaydı silmek istediğinize emin misiniz?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        destructive
      />
    </View>
  );
}
