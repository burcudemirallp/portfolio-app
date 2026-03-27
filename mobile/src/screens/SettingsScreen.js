import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  RefreshControl, Modal, KeyboardAvoidingView, Platform, FlatList, Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  getBrokers, createBroker, updateBroker, deleteBroker,
  getAccounts, createAccount, updateAccount, deleteAccount,
  getInstruments, createInstrument, updateInstrument, deleteInstrument,
  updateManualPrice, getPortfolioSnapshots, deleteSnapshot, deleteAllSnapshots,
  getAdminUsers, deleteAdminUser, toggleUserAdmin, adminSwitchUser,
} from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ConfirmDialog from '../components/ConfirmDialog';
import Toast from 'react-native-toast-message';

const ASSET_TYPES = ['Hisse', 'Fon', 'Kripto', 'Altın', 'Tahvil', 'Döviz', 'Emtia'];
const MARKETS = ['BIST', 'NYSE', 'NASDAQ', 'Kripto', 'Diğer'];

function BottomSheet({ visible, onClose, title, children, colors }) {
  if (!visible) return null;
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
        <View style={{
          backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          paddingBottom: Platform.OS === 'ios' ? 28 : 16,
          borderTopWidth: 1, borderColor: colors.border, maxHeight: '85%',
        }}>
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPri }}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Feather name="x" size={22} color={colors.textSec} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EmptyState({ icon, message, colors }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36 }}>
      <Feather name={icon} size={40} color={colors.textTer} />
      <Text style={{ color: colors.textSec, marginTop: 12, fontSize: 13, textAlign: 'center' }}>{message}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { user, switchToUser } = useAuth();

  const [activeTab, setActiveTab] = useState('brokers');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [brokers, setBrokers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);

  const [sheetType, setSheetType] = useState(null);
  const [newBroker, setNewBroker] = useState('');
  const [newAccount, setNewAccount] = useState({ name: '', broker_id: '', base_currency: 'TRY' });
  const [newInstrument, setNewInstrument] = useState({ symbol: '', name: '', asset_type: 'Hisse', market: 'BIST', currency: 'TRY' });
  const [instrSearch, setInstrSearch] = useState('');
  const [manualPrices, setManualPrices] = useState({});
  const [expandedInstr, setExpandedInstr] = useState(null);

  const [brokerPicker, setBrokerPicker] = useState(false);
  const [assetPicker, setAssetPicker] = useState(false);
  const [marketPicker, setMarketPicker] = useState(false);

  const [editBroker, setEditBroker] = useState(null);
  const [editAccount, setEditAccount] = useState(null);
  const [editInstrument, setEditInstrument] = useState(null);
  const [editName, setEditName] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const input = {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15,
    color: colors.textPri, backgroundColor: colors.surfaceAlt,
  };

  const TABS = [
    { key: 'brokers', label: 'Broker', icon: 'briefcase', count: brokers.length },
    { key: 'accounts', label: 'Hesap', icon: 'credit-card', count: accounts.length },
    { key: 'instruments', label: 'Enstrüman', icon: 'bar-chart-2', count: instruments.length },
    { key: 'snapshots', label: 'Snapshot', icon: 'camera', count: snapshots.length },
    ...(user?.is_admin ? [{ key: 'users', label: 'Kullanıcı', icon: 'users', count: adminUsers.length }] : []),
  ];

  const loadAll = useCallback(async () => {
    try {
      const [bRes, aRes, iRes, sRes] = await Promise.all([
        getBrokers(), getAccounts(), getInstruments(), getPortfolioSnapshots(100),
      ]);
      setBrokers(Array.isArray(bRes.data) ? bRes.data : []);
      setAccounts(Array.isArray(aRes.data) ? aRes.data : []);
      setInstruments(Array.isArray(iRes.data) ? iRes.data : []);
      setSnapshots(Array.isArray(sRes.data) ? sRes.data : []);
      if (user?.is_admin) {
        try { const uRes = await getAdminUsers(); setAdminUsers(Array.isArray(uRes.data) ? uRes.data : []); } catch {}
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Yüklenemedi' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.is_admin]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = useCallback(() => { setRefreshing(true); loadAll(); }, [loadAll]);

  const closeSheet = () => setSheetType(null);

  /* ─── CRUD handlers ─── */
  const handleCreateBroker = async () => {
    if (!newBroker.trim()) return;
    setSubmitting(true);
    try {
      await createBroker({ name: newBroker.trim() });
      setNewBroker('');
      closeSheet();
      Toast.show({ type: 'success', text1: 'Broker eklendi' });
      loadAll();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Eklenemedi' });
    } finally { setSubmitting(false); }
  };

  const handleSaveBrokerEdit = async () => {
    if (!editBroker || !editName.trim()) return;
    setSubmitting(true);
    try {
      await updateBroker(editBroker.id, { name: editName.trim() });
      setEditBroker(null);
      Toast.show({ type: 'success', text1: 'Güncellendi' });
      loadAll();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Hata' });
    } finally { setSubmitting(false); }
  };

  const handleCreateAccount = async () => {
    if (!newAccount.name.trim()) return;
    setSubmitting(true);
    try {
      await createAccount({
        name: newAccount.name.trim(),
        broker_id: newAccount.broker_id ? Number(newAccount.broker_id) : null,
        base_currency: newAccount.base_currency,
      });
      setNewAccount({ name: '', broker_id: '', base_currency: 'TRY' });
      closeSheet();
      Toast.show({ type: 'success', text1: 'Hesap eklendi' });
      loadAll();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Eklenemedi' });
    } finally { setSubmitting(false); }
  };

  const handleSaveAccountEdit = async () => {
    if (!editAccount || !editName.trim()) return;
    setSubmitting(true);
    try {
      await updateAccount(editAccount.id, {
        name: editName.trim(),
        broker_id: editAccount.broker_id != null && editAccount.broker_id !== '' ? Number(editAccount.broker_id) : null,
        base_currency: editAccount.base_currency,
      });
      setEditAccount(null);
      Toast.show({ type: 'success', text1: 'Güncellendi' });
      loadAll();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Hata' });
    } finally { setSubmitting(false); }
  };

  const handleCreateInstrument = async () => {
    if (!newInstrument.symbol.trim() || !newInstrument.name.trim()) {
      Toast.show({ type: 'error', text1: 'Sembol ve ad zorunlu' });
      return;
    }
    setSubmitting(true);
    try {
      await createInstrument({
        symbol: newInstrument.symbol.trim().toUpperCase(),
        name: newInstrument.name.trim(),
        asset_type: newInstrument.asset_type,
        market: newInstrument.market,
        currency: newInstrument.currency,
      });
      setNewInstrument({ symbol: '', name: '', asset_type: 'Hisse', market: 'BIST', currency: 'TRY' });
      closeSheet();
      Toast.show({ type: 'success', text1: 'Enstrüman eklendi' });
      loadAll();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Eklenemedi' });
    } finally { setSubmitting(false); }
  };

  const handleSaveInstrumentEdit = async () => {
    if (!editInstrument) return;
    setSubmitting(true);
    try {
      await updateInstrument(editInstrument.id, {
        symbol: editInstrument.symbol.trim().toUpperCase(),
        name: editInstrument.name.trim(),
        asset_type: editInstrument.asset_type,
        market: editInstrument.market,
        currency: editInstrument.currency,
      });
      setEditInstrument(null);
      Toast.show({ type: 'success', text1: 'Güncellendi' });
      loadAll();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Hata' });
    } finally { setSubmitting(false); }
  };

  const handleManualPrice = async (instrumentId) => {
    const raw = manualPrices[instrumentId];
    const val = parseFloat(String(raw ?? '').replace(',', '.'));
    if (Number.isNaN(val)) { Toast.show({ type: 'error', text1: 'Geçerli fiyat girin' }); return; }
    try {
      await updateManualPrice(instrumentId, val);
      Toast.show({ type: 'success', text1: 'Fiyat güncellendi' });
      loadAll();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Güncellenemedi' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'broker') await deleteBroker(deleteTarget.id);
      else if (deleteTarget.type === 'account') await deleteAccount(deleteTarget.id);
      else if (deleteTarget.type === 'instrument') await deleteInstrument(deleteTarget.id);
      else if (deleteTarget.type === 'snapshot') await deleteSnapshot(deleteTarget.id);
      else if (deleteTarget.type === 'user') await deleteAdminUser(deleteTarget.id);
      Toast.show({ type: 'success', text1: 'Silindi' });
      loadAll();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Silinemedi' });
    }
    setDeleteTarget(null);
  };

  const handleDeleteAllSnapshots = async () => {
    try {
      await deleteAllSnapshots();
      Toast.show({ type: 'success', text1: 'Tüm snapshotlar silindi' });
      loadAll();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Silinemedi' });
    }
    setConfirmDeleteAll(false);
  };

  const handleToggleAdmin = async (userId) => {
    try { await toggleUserAdmin(userId); Toast.show({ type: 'success', text1: 'Güncellendi' }); loadAll(); }
    catch { Toast.show({ type: 'error', text1: 'İşlem başarısız' }); }
  };

  const handleSwitchUser = async (userId) => {
    if (userId === user?.id) return;
    try {
      const res = await adminSwitchUser(userId);
      await switchToUser(res.data.access_token, res.data.user);
      Toast.show({ type: 'success', text1: 'Kullanıcıya geçildi' });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Geçilemedi' });
    }
  };

  const filteredInstruments = instruments.filter((i) => {
    const q = instrSearch.trim().toLowerCase();
    if (!q) return true;
    return (i.symbol?.toLowerCase().includes(q)) || (i.name?.toLowerCase().includes(q)) ||
      (i.asset_type?.toLowerCase().includes(q)) || (i.market?.toLowerCase().includes(q));
  });

  const currencyChips = (value, onChange) => (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {['TRY', 'USD', 'EUR'].map((c) => {
        const on = value === c;
        return (
          <TouchableOpacity key={c} onPress={() => onChange(c)}
            style={{
              paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
              backgroundColor: on ? colors.accent + '22' : colors.surfaceAlt,
              borderWidth: 1, borderColor: on ? colors.accent : colors.border,
            }}>
            <Text style={{ fontWeight: '700', fontSize: 13, color: on ? colors.accent : colors.textSec }}>{c}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const cardStyle = {
    backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, marginBottom: 8,
  };

  const submitBtn = (label, onPress) => (
    <TouchableOpacity onPress={onPress} disabled={submitting}
      style={{
        backgroundColor: colors.accent, paddingVertical: 14,
        borderRadius: 12, alignItems: 'center', marginTop: 16, opacity: submitting ? 0.5 : 1,
      }}>
      <Text style={{ fontWeight: '800', fontSize: 15, color: '#0B0E11' }}>{submitting ? 'Kaydediliyor…' : label}</Text>
    </TouchableOpacity>
  );

  const sectionHeader = (title, count, onAdd) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPri }}>{title}</Text>
        <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textTer }}>{count}</Text>
        </View>
      </View>
      {onAdd && (
        <TouchableOpacity onPress={onAdd}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
          }}>
          <Feather name="plus" size={14} color="#0B0E11" />
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0B0E11' }}>Ekle</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  /* ─── Render tab content ─── */
  const renderBody = () => {
    if (activeTab === 'brokers') {
      return (
        <View>
          {sectionHeader('Brokerlar', brokers.length, () => setSheetType('broker'))}
          {brokers.length === 0 ? (
            <EmptyState icon="briefcase" message="Henüz broker eklenmemiş" colors={colors} />
          ) : brokers.map((b) => (
            <View key={b.id} style={{ ...cardStyle, flexDirection: 'row', alignItems: 'center', padding: 14 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent + '18',
                alignItems: 'center', justifyContent: 'center', marginRight: 12,
              }}>
                <Feather name="briefcase" size={16} color={colors.accent} />
              </View>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPri }}>{b.name}</Text>
              <TouchableOpacity onPress={() => { setEditBroker(b); setEditName(b.name); }} style={{ padding: 6 }}>
                <Feather name="edit-2" size={16} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setDeleteTarget({ type: 'broker', id: b.id })} style={{ padding: 6, marginLeft: 4 }}>
                <Feather name="trash-2" size={16} color={colors.red} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      );
    }

    if (activeTab === 'accounts') {
      return (
        <View>
          {sectionHeader('Hesaplar', accounts.length, () => setSheetType('account'))}
          {accounts.length === 0 ? (
            <EmptyState icon="credit-card" message="Henüz hesap eklenmemiş" colors={colors} />
          ) : accounts.map((a) => {
            const broker = brokers.find((b) => b.id === a.broker_id);
            return (
              <View key={a.id} style={{ ...cardStyle, flexDirection: 'row', alignItems: 'center', padding: 14 }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 18, backgroundColor: colors.green + '18',
                  alignItems: 'center', justifyContent: 'center', marginRight: 12,
                }}>
                  <Feather name="credit-card" size={16} color={colors.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPri }}>{a.name}</Text>
                  <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 2 }}>
                    {broker?.name || 'Broker yok'} · {a.base_currency}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => { setEditAccount({ ...a }); setEditName(a.name); }} style={{ padding: 6 }}>
                  <Feather name="edit-2" size={16} color={colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDeleteTarget({ type: 'account', id: a.id })} style={{ padding: 6, marginLeft: 4 }}>
                  <Feather name="trash-2" size={16} color={colors.red} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      );
    }

    if (activeTab === 'instruments') {
      return (
        <View>
          {sectionHeader('Enstrümanlar', instruments.length, () => setSheetType('instrument'))}
          <TextInput value={instrSearch} onChangeText={setInstrSearch}
            placeholder="Ara: sembol, ad, tür, piyasa" placeholderTextColor={colors.textTer}
            style={{ ...input, marginBottom: 12 }} />
          {filteredInstruments.length === 0 ? (
            <EmptyState icon="bar-chart-2" message={instrSearch ? 'Sonuç bulunamadı' : 'Henüz enstrüman eklenmemiş'} colors={colors} />
          ) : filteredInstruments.map((i) => {
            const expanded = expandedInstr === i.id;
            return (
              <TouchableOpacity key={i.id} activeOpacity={0.7}
                onPress={() => setExpandedInstr(expanded ? null : i.id)}
                style={{ ...cardStyle, padding: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 18, marginRight: 12,
                    backgroundColor: i.currency === 'USD' ? '#3B82F6' + '18' : i.currency === 'EUR' ? '#8B5CF6' + '18' : colors.accent + '18',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: i.currency === 'USD' ? '#3B82F6' : i.currency === 'EUR' ? '#8B5CF6' : colors.accent }}>
                      {i.symbol?.slice(0, 2)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPri }}>{i.symbol}</Text>
                    <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 1 }} numberOfLines={1}>{i.name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', marginRight: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, fontWeight: '600', color: colors.textTer }}>{i.asset_type}</Text>
                      </View>
                      <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, fontWeight: '600', color: colors.textTer }}>{i.market}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 10, color: colors.textTer, marginTop: 2 }}>{i.currency}</Text>
                  </View>
                  <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textTer} />
                </View>

                {expanded && (
                  <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <TextInput value={manualPrices[i.id] ?? ''} keyboardType="decimal-pad"
                        onChangeText={(v) => setManualPrices((p) => ({ ...p, [i.id]: v }))}
                        placeholder="Manuel fiyat" placeholderTextColor={colors.textTer}
                        style={{ ...input, flex: 1, marginBottom: 0, fontSize: 14 }} />
                      <TouchableOpacity onPress={() => handleManualPrice(i.id)}
                        style={{
                          backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                        }}>
                        <Text style={{ fontWeight: '700', fontSize: 12, color: '#0B0E11' }}>Güncelle</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity onPress={() => setEditInstrument({ ...i })}
                        style={{
                          flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                          paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surfaceAlt,
                        }}>
                        <Feather name="edit-2" size={14} color={colors.accent} />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.accent }}>Düzenle</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setDeleteTarget({ type: 'instrument', id: i.id })}
                        style={{
                          flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                          paddingVertical: 10, borderRadius: 10, backgroundColor: colors.red + '12',
                        }}>
                        <Feather name="trash-2" size={14} color={colors.red} />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.red }}>Sil</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    if (activeTab === 'snapshots') {
      const firstDate = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
      const lastDate = snapshots.length > 0 ? snapshots[0] : null;
      return (
        <View>
          {sectionHeader('Snapshotlar', snapshots.length)}

          {snapshots.length > 0 && (
            <View style={{ ...cardStyle, padding: 14, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                <View>
                  <Text style={{ fontSize: 9, color: colors.textTer }}>İlk</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPri, marginTop: 2 }}>
                    {firstDate ? formatDate(firstDate.snapshot_date) : '—'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 9, color: colors.textTer }}>Son</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPri, marginTop: 2 }}>
                    {lastDate ? formatDate(lastDate.snapshot_date) : '—'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setConfirmDeleteAll(true)}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  paddingVertical: 10, borderRadius: 10, backgroundColor: colors.red + '12',
                }}>
                <Feather name="trash-2" size={14} color={colors.red} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.red }}>Tümünü Sil</Text>
              </TouchableOpacity>
            </View>
          )}

          {snapshots.length === 0 ? (
            <EmptyState icon="camera" message="Henüz snapshot oluşturulmamış" colors={colors} />
          ) : snapshots.map((s) => (
            <View key={s.id} style={{ ...cardStyle, flexDirection: 'row', alignItems: 'center', padding: 14 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 18, backgroundColor: '#8B5CF6' + '18',
                alignItems: 'center', justifyContent: 'center', marginRight: 12,
              }}>
                <Feather name="camera" size={16} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPri }}>{formatDate(s.snapshot_date)}</Text>
                <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 2 }}>
                  {formatCurrency(s.total_market_value, 'TRY')}
                  {s.position_count != null ? ` · ${s.position_count} pozisyon` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDeleteTarget({ type: 'snapshot', id: s.id })} style={{ padding: 6 }}>
                <Feather name="trash-2" size={16} color={colors.red} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      );
    }

    if (activeTab === 'users' && user?.is_admin) {
      return (
        <View>
          {sectionHeader('Kullanıcılar', adminUsers.length)}
          {adminUsers.length === 0 ? (
            <EmptyState icon="users" message="Kullanıcı bulunamadı" colors={colors} />
          ) : adminUsers.map((u) => (
            <View key={u.id} style={{ ...cardStyle, padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 18, marginRight: 12,
                  backgroundColor: u.is_admin ? colors.accent + '18' : colors.surfaceAlt,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Feather name={u.is_admin ? 'shield' : 'user'} size={16}
                    color={u.is_admin ? colors.accent : colors.textTer} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPri }}>
                    {u.username || u.email}
                    {u.id === user?.id ? ' (sen)' : ''}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 2 }}>
                    {u.email}{u.is_admin ? ' · Admin' : ''}
                  </Text>
                </View>
              </View>
              {u.id !== user?.id && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity onPress={() => handleToggleAdmin(u.id)}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      paddingVertical: 9, borderRadius: 10, backgroundColor: colors.surfaceAlt,
                    }}>
                    <Feather name={u.is_admin ? 'shield-off' : 'shield'} size={14} color={colors.accent} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.accent }}>
                      {u.is_admin ? 'Admin Kaldır' : 'Admin Yap'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleSwitchUser(u.id)}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      paddingVertical: 9, borderRadius: 10, backgroundColor: colors.green + '12',
                    }}>
                    <Feather name="log-in" size={14} color={colors.green} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.green }}>Geçiş Yap</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDeleteTarget({ type: 'user', id: u.id })}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.red + '12',
                    }}>
                    <Feather name="trash-2" size={14} color={colors.red} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </View>
      );
    }

    return null;
  };

  if (loading && !refreshing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ padding: 16 }}>
          {/* Tab grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {TABS.map((t) => {
              const on = activeTab === t.key;
              return (
                <TouchableOpacity key={t.key} onPress={() => setActiveTab(t.key)}
                  style={{
                    flex: 1, minWidth: '30%', alignItems: 'center', paddingVertical: 12, borderRadius: 12,
                    backgroundColor: on ? colors.accent + '18' : colors.surface,
                    borderWidth: 1, borderColor: on ? colors.accent : colors.border,
                  }}>
                  <View style={{
                    width: 32, height: 32, borderRadius: 16, marginBottom: 6,
                    backgroundColor: on ? colors.accent : colors.surfaceAlt,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Feather name={t.icon} size={15} color={on ? '#0B0E11' : colors.textTer} />
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: on ? colors.accent : colors.textPri }}>{t.label}</Text>
                  {t.count > 0 && (
                    <Text style={{ fontSize: 10, color: on ? colors.accent : colors.textTer, marginTop: 2 }}>{t.count}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {renderBody()}
        </View>
      </ScrollView>

      {/* ═══ Create Bottom Sheets ═══ */}
      <BottomSheet visible={sheetType === 'broker'} onClose={closeSheet} title="Yeni Broker" colors={colors}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Broker adı</Text>
        <TextInput value={newBroker} onChangeText={setNewBroker} placeholder="Örn: Garanti Yatırım"
          placeholderTextColor={colors.textTer} style={input} />
        {submitBtn('Oluştur', handleCreateBroker)}
      </BottomSheet>

      <BottomSheet visible={sheetType === 'account'} onClose={closeSheet} title="Yeni Hesap" colors={colors}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Hesap adı</Text>
        <TextInput value={newAccount.name} onChangeText={(v) => setNewAccount((s) => ({ ...s, name: v }))}
          placeholder="Örn: Bireysel Hesap" placeholderTextColor={colors.textTer} style={{ ...input, marginBottom: 14 }} />

        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Broker</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity onPress={() => setNewAccount((s) => ({ ...s, broker_id: '' }))}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                backgroundColor: !newAccount.broker_id ? colors.accent + '22' : colors.surfaceAlt,
                borderWidth: 1, borderColor: !newAccount.broker_id ? colors.accent : colors.border,
              }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: !newAccount.broker_id ? colors.accent : colors.textSec }}>Yok</Text>
            </TouchableOpacity>
            {brokers.map((b) => {
              const on = String(newAccount.broker_id) === String(b.id);
              return (
                <TouchableOpacity key={b.id} onPress={() => setNewAccount((s) => ({ ...s, broker_id: String(b.id) }))}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: on ? colors.accent + '22' : colors.surfaceAlt,
                    borderWidth: 1, borderColor: on ? colors.accent : colors.border,
                  }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: on ? colors.accent : colors.textSec }}>{b.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Para birimi</Text>
        {currencyChips(newAccount.base_currency, (c) => setNewAccount((s) => ({ ...s, base_currency: c })))}
        {submitBtn('Oluştur', handleCreateAccount)}
      </BottomSheet>

      <BottomSheet visible={sheetType === 'instrument'} onClose={closeSheet} title="Yeni Enstrüman" colors={colors}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Sembol</Text>
        <TextInput value={newInstrument.symbol}
          onChangeText={(v) => setNewInstrument((s) => ({ ...s, symbol: v }))}
          placeholder="Örn: THYAO" autoCapitalize="characters" placeholderTextColor={colors.textTer}
          style={{ ...input, marginBottom: 14 }} />

        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Ad</Text>
        <TextInput value={newInstrument.name}
          onChangeText={(v) => setNewInstrument((s) => ({ ...s, name: v }))}
          placeholder="Örn: Türk Hava Yolları" placeholderTextColor={colors.textTer}
          style={{ ...input, marginBottom: 14 }} />

        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Varlık türü</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {ASSET_TYPES.map((t) => {
              const on = newInstrument.asset_type === t;
              return (
                <TouchableOpacity key={t} onPress={() => setNewInstrument((s) => ({ ...s, asset_type: t }))}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: on ? colors.accent + '22' : colors.surfaceAlt,
                    borderWidth: 1, borderColor: on ? colors.accent : colors.border,
                  }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: on ? colors.accent : colors.textSec }}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Piyasa</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {MARKETS.map((m) => {
              const on = newInstrument.market === m;
              return (
                <TouchableOpacity key={m} onPress={() => setNewInstrument((s) => ({ ...s, market: m }))}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: on ? colors.accent + '22' : colors.surfaceAlt,
                    borderWidth: 1, borderColor: on ? colors.accent : colors.border,
                  }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: on ? colors.accent : colors.textSec }}>{m}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Para birimi</Text>
        {currencyChips(newInstrument.currency, (c) => setNewInstrument((s) => ({ ...s, currency: c })))}
        {submitBtn('Oluştur', handleCreateInstrument)}
      </BottomSheet>

      {/* ═══ Edit Modals ═══ */}
      <Modal visible={!!editBroker} transparent animationType="fade" onRequestClose={() => setEditBroker(null)}>
        <Pressable style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.55)' }}
          onPress={() => setEditBroker(null)}>
          <Pressable onPress={(e) => e.stopPropagation()}
            style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPri, marginBottom: 14 }}>Broker Düzenle</Text>
            <TextInput value={editName} onChangeText={setEditName} style={{ ...input, marginBottom: 16 }} placeholderTextColor={colors.textTer} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setEditBroker(null)}
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center' }}>
                <Text style={{ color: colors.textSec, fontWeight: '600' }}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveBrokerEdit}
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center' }}>
                <Text style={{ color: '#0B0E11', fontWeight: '700' }}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!editAccount} transparent animationType="fade" onRequestClose={() => setEditAccount(null)}>
        <Pressable style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.55)' }}
          onPress={() => setEditAccount(null)}>
          <Pressable onPress={(e) => e.stopPropagation()}
            style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPri, marginBottom: 14 }}>Hesap Düzenle</Text>
            <TextInput value={editName} onChangeText={setEditName} style={{ ...input, marginBottom: 14 }} placeholderTextColor={colors.textTer} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Broker</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity onPress={() => setEditAccount((s) => ({ ...s, broker_id: null }))}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: !editAccount?.broker_id ? colors.accent + '22' : colors.surfaceAlt,
                    borderWidth: 1, borderColor: !editAccount?.broker_id ? colors.accent : colors.border,
                  }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: !editAccount?.broker_id ? colors.accent : colors.textSec }}>Yok</Text>
                </TouchableOpacity>
                {brokers.map((b) => {
                  const on = editAccount?.broker_id === b.id;
                  return (
                    <TouchableOpacity key={b.id} onPress={() => setEditAccount((s) => ({ ...s, broker_id: b.id }))}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                        backgroundColor: on ? colors.accent + '22' : colors.surfaceAlt,
                        borderWidth: 1, borderColor: on ? colors.accent : colors.border,
                      }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: on ? colors.accent : colors.textSec }}>{b.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 8 }}>Para birimi</Text>
            {editAccount ? currencyChips(editAccount.base_currency, (c) => setEditAccount((s) => ({ ...s, base_currency: c }))) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setEditAccount(null)}
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center' }}>
                <Text style={{ color: colors.textSec, fontWeight: '600' }}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveAccountEdit}
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center' }}>
                <Text style={{ color: '#0B0E11', fontWeight: '700' }}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!editInstrument} transparent animationType="fade" onRequestClose={() => setEditInstrument(null)}>
        <Pressable style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.55)' }}
          onPress={() => setEditInstrument(null)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <ScrollView style={{ maxHeight: '80%' }}>
              <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPri, marginBottom: 14 }}>Enstrüman Düzenle</Text>
                {editInstrument && (
                  <>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 6 }}>Sembol</Text>
                    <TextInput value={editInstrument.symbol}
                      onChangeText={(v) => setEditInstrument((s) => ({ ...s, symbol: v }))}
                      autoCapitalize="characters" placeholderTextColor={colors.textTer}
                      style={{ ...input, marginBottom: 12 }} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 6 }}>Ad</Text>
                    <TextInput value={editInstrument.name}
                      onChangeText={(v) => setEditInstrument((s) => ({ ...s, name: v }))}
                      placeholderTextColor={colors.textTer}
                      style={{ ...input, marginBottom: 12 }} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 6 }}>Varlık türü</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {ASSET_TYPES.map((t) => {
                          const on = editInstrument.asset_type === t;
                          return (
                            <TouchableOpacity key={t} onPress={() => setEditInstrument((s) => ({ ...s, asset_type: t }))}
                              style={{
                                paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                                backgroundColor: on ? colors.accent + '22' : colors.surfaceAlt,
                                borderWidth: 1, borderColor: on ? colors.accent : colors.border,
                              }}>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: on ? colors.accent : colors.textSec }}>{t}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 6 }}>Piyasa</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {MARKETS.map((m) => {
                          const on = editInstrument.market === m;
                          return (
                            <TouchableOpacity key={m} onPress={() => setEditInstrument((s) => ({ ...s, market: m }))}
                              style={{
                                paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                                backgroundColor: on ? colors.accent + '22' : colors.surfaceAlt,
                                borderWidth: 1, borderColor: on ? colors.accent : colors.border,
                              }}>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: on ? colors.accent : colors.textSec }}>{m}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTer, marginBottom: 6 }}>Para birimi</Text>
                    {currencyChips(editInstrument.currency, (c) => setEditInstrument((s) => ({ ...s, currency: c })))}
                  </>
                )}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                  <TouchableOpacity onPress={() => setEditInstrument(null)}
                    style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center' }}>
                    <Text style={{ color: colors.textSec, fontWeight: '600' }}>Vazgeç</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSaveInstrumentEdit}
                    style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center' }}>
                    <Text style={{ color: '#0B0E11', fontWeight: '700' }}>Kaydet</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmDialog visible={!!deleteTarget} title="Sil"
        message="Bu kaydı silmek istediğinize emin misiniz?"
        onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} destructive />

      <ConfirmDialog visible={confirmDeleteAll} title="Tüm snapshotları sil"
        message="Tüm portföy snapshotları kalıcı olarak silinecek. Bu işlem geri alınamaz."
        confirmText="Evet, sil" onConfirm={handleDeleteAllSnapshots}
        onCancel={() => setConfirmDeleteAll(false)} destructive />
    </View>
  );
}
