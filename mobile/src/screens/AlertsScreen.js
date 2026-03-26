import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getAlerts, getInstruments, createAlert, deleteAlert, toggleAlert } from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import { useTheme } from '../contexts/ThemeContext';
import ConfirmDialog from '../components/ConfirmDialog';
import Toast from 'react-native-toast-message';

export default function AlertsScreen() {
  const { colors } = useTheme();
  const [alerts, setAlerts] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('active');
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [form, setForm] = useState({ instrument_id: '', alert_type: 'above', target_value: '', notes: '' });

  const instrById = useMemo(() => Object.fromEntries(instruments.map((i) => [i.id, i])), [instruments]);

  const load = useCallback(async () => {
    try {
      const [alertsRes, instrRes] = await Promise.all([getAlerts(), getInstruments()]);
      setAlerts(Array.isArray(alertsRes.data) ? alertsRes.data : []);
      setInstruments(Array.isArray(instrRes.data) ? instrRes.data : []);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Yüklenemedi' });
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

  const activeAlerts = useMemo(() => alerts.filter((a) => !a.is_triggered), [alerts]);
  const triggeredAlerts = useMemo(() => alerts.filter((a) => a.is_triggered), [alerts]);

  const listData = tab === 'active' ? activeAlerts : triggeredAlerts;

  const handleCreate = async () => {
    if (!form.instrument_id || !form.target_value) {
      Toast.show({ type: 'error', text1: 'Enstrüman ve hedef değer zorunlu' });
      return;
    }
    setSubmitting(true);
    try {
      await createAlert({
        instrument_id: Number(form.instrument_id),
        alert_type: form.alert_type,
        target_value: parseFloat(String(form.target_value).replace(',', '.')),
        notes: form.notes || undefined,
      });
      Toast.show({ type: 'success', text1: 'Alarm oluşturuldu' });
      setForm({ instrument_id: '', alert_type: 'above', target_value: '', notes: '' });
      load();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Oluşturulamadı' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteAlert(deleteId);
      Toast.show({ type: 'success', text1: 'Silindi' });
      load();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Silinemedi' });
    }
    setDeleteId(null);
  };

  const selectedInstr = form.instrument_id ? instrById[Number(form.instrument_id)] : null;

  const renderAlert = ({ item: alert }) => {
    const sym = alert.instrument_symbol || instrById[alert.instrument_id]?.symbol || `#${alert.instrument_id}`;
    const nm = alert.instrument_name || instrById[alert.instrument_id]?.name;
    const isTrig = !!alert.is_triggered;
    const above = alert.alert_type === 'above';

    return (
      <View
        style={{
          marginHorizontal: 16,
          marginBottom: 10,
          padding: 14,
          borderRadius: 14,
          backgroundColor: isTrig ? colors.surfaceAlt : colors.surface,
          borderWidth: 1,
          borderColor: isTrig ? colors.accent : colors.border,
          opacity: isTrig ? 0.95 : 1,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: colors.bg,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 10,
            }}
          >
            <Feather name={above ? 'trending-up' : 'trending-down'} size={18} color={above ? colors.green : colors.red} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPri }}>{sym}</Text>
            {nm ? (
              <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 2 }} numberOfLines={1}>
                {nm}
              </Text>
            ) : null}
            <Text style={{ fontSize: 13, color: colors.textSec, marginTop: 6 }}>
              {above ? 'Üstüne çıkınca' : 'Altına düşünce'} · {formatCurrency(alert.target_value, 'TRY')}
            </Text>
            {alert.notes ? (
              <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 6 }} numberOfLines={2}>
                {alert.notes}
              </Text>
            ) : null}
            {alert.created_at ? (
              <Text style={{ fontSize: 10, color: colors.textTer, marginTop: 4 }}>{formatDate(alert.created_at)}</Text>
            ) : null}
          </View>
          {!isTrig ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Switch
                value={alert.is_active}
                onValueChange={() => toggleAlert(alert.id).then(load).catch(() => {})}
                trackColor={{ false: colors.surfaceAlt, true: colors.accent }}
                thumbColor="#fff"
              />
              <TouchableOpacity onPress={() => setDeleteId(alert.id)} style={{ marginTop: 8 }}>
                <Feather name="trash-2" size={18} color={colors.red} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setDeleteId(alert.id)} style={{ padding: 4 }}>
              <Feather name="trash-2" size={18} color={colors.red} />
            </TouchableOpacity>
          )}
        </View>
        {isTrig ? (
          <View
            style={{
              marginTop: 10,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 8,
              backgroundColor: colors.bg,
              alignSelf: 'flex-start',
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent }}>Tetiklendi</Text>
          </View>
        ) : null}
      </View>
    );
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPri,
    backgroundColor: colors.surfaceAlt,
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
      <FlatList
        data={listData}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        renderItem={renderAlert}
        ListHeaderComponent={
          <View style={{ padding: 16, paddingBottom: 8 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPri, marginBottom: 12 }}>Alarmlar</Text>

            <View style={{ flexDirection: 'row', marginBottom: 14, gap: 8 }}>
              {[
                { key: 'active', label: 'Aktif' },
                { key: 'triggered', label: 'Tetiklenen' },
              ].map((t) => {
                const on = tab === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => setTab(t.key)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: on ? colors.accent : colors.surfaceAlt,
                      borderWidth: 1,
                      borderColor: on ? colors.accent : colors.border,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '800', color: on ? '#0B0E11' : colors.textPri }}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPri, marginBottom: 8 }}>Yeni alarm</Text>

            <TouchableOpacity
              onPress={() => setPickerOpen(true)}
              style={{
                ...inputStyle,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <Text style={{ color: selectedInstr ? colors.textPri : colors.textTer, fontSize: 15 }}>
                {selectedInstr ? `${selectedInstr.symbol} — ${selectedInstr.name}` : 'Enstrüman seç…'}
              </Text>
              <Feather name="chevron-down" size={18} color={colors.textSec} />
            </TouchableOpacity>

            <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 6 }}>Tür</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {[
                { key: 'above', label: 'Üstüne' },
                { key: 'below', label: 'Altına' },
              ].map((o) => {
                const on = form.alert_type === o.key;
                return (
                  <TouchableOpacity
                    key={o.key}
                    onPress={() => setForm((f) => ({ ...f, alert_type: o.key }))}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: on ? colors.accent : colors.surfaceAlt,
                      borderWidth: 1,
                      borderColor: on ? colors.accent : colors.border,
                    }}
                  >
                    <Text style={{ fontWeight: '700', color: on ? '#0B0E11' : colors.textPri }}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 6 }}>Hedef fiyat</Text>
            <TextInput
              value={form.target_value}
              onChangeText={(v) => setForm((f) => ({ ...f, target_value: v }))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textTer}
              style={{ ...inputStyle, marginBottom: 10 }}
            />

            <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 6 }}>Not</Text>
            <TextInput
              value={form.notes}
              onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
              placeholder="Opsiyonel"
              placeholderTextColor={colors.textTer}
              style={{ ...inputStyle, marginBottom: 12, minHeight: 72, textAlignVertical: 'top' }}
              multiline
            />

            <TouchableOpacity
              onPress={handleCreate}
              disabled={submitting}
              style={{
                backgroundColor: colors.accent,
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: 'center',
                opacity: submitting ? 0.5 : 1,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#0B0E11' }}>{submitting ? 'Kaydediliyor…' : 'Oluştur'}</Text>
            </TouchableOpacity>

            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPri, marginTop: 20, marginBottom: 8 }}>
              {tab === 'active' ? 'Aktif alarmlar' : 'Tetiklenen alarmlar'}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 24 }}>
            <Feather name="bell-off" size={40} color={colors.textTer} />
            <Text style={{ color: colors.textSec, marginTop: 10, textAlign: 'center' }}>
              {tab === 'active' ? 'Aktif alarm yok' : 'Tetiklenen alarm yok'}
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 32 }}
      />

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}
            activeOpacity={1}
            onPress={() => setPickerOpen(false)}
          />
          <View style={{ maxHeight: '70%', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.textPri }}>Enstrüman</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Feather name="x" size={22} color={colors.textSec} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={instruments}
              keyExtractor={(i) => String(i.id)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    setForm((f) => ({ ...f, instrument_id: String(item.id) }));
                    setPickerOpen(false);
                  }}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPri }}>{item.symbol}</Text>
                  <Text style={{ fontSize: 12, color: colors.textTer, marginTop: 2 }}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmDialog
        visible={!!deleteId}
        title="Alarmı sil"
        message="Bu alarmı silmek istediğinize emin misiniz?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        destructive
      />
    </View>
  );
}
