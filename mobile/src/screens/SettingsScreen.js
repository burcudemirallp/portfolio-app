import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  getBrokers,
  createBroker,
  updateBroker,
  deleteBroker,
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getInstruments,
  createInstrument,
  updateInstrument,
  deleteInstrument,
  updateManualPrice,
  getPortfolioSnapshots,
  deleteSnapshot,
  deleteAllSnapshots,
  getAdminUsers,
  deleteAdminUser,
  toggleUserAdmin,
  adminSwitchUser,
} from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ConfirmDialog from '../components/ConfirmDialog';
import Toast from 'react-native-toast-message';

const TABS = [
  { key: 'brokers', label: 'Brokerlar', icon: 'briefcase' },
  { key: 'accounts', label: 'Hesaplar', icon: 'credit-card' },
  { key: 'instruments', label: 'Enstrümanlar', icon: 'bar-chart-2' },
  { key: 'snapshots', label: 'Snapshotlar', icon: 'camera' },
  { key: 'users', label: 'Kullanıcılar', icon: 'users' },
];

const ASSET_TYPES = ['Hisse', 'Fon', 'Kripto', 'Altın', 'Tahvil', 'Döviz', 'Emtia'];
const MARKETS = ['BIST', 'NYSE', 'NASDAQ', 'Kripto', 'Diğer'];

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

  const [newBroker, setNewBroker] = useState('');
  const [newAccount, setNewAccount] = useState({ name: '', broker_id: '', base_currency: 'TRY' });
  const [newInstrument, setNewInstrument] = useState({
    symbol: '',
    name: '',
    asset_type: 'Hisse',
    market: 'BIST',
    currency: 'TRY',
  });
  const [instrSearch, setInstrSearch] = useState('');
  const [manualPrices, setManualPrices] = useState({});

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

  const visibleTabs = TABS.filter((t) => t.key !== 'users' || user?.is_admin);

  const loadTab = useCallback(async () => {
    try {
      if (activeTab === 'brokers') {
        const r = await getBrokers();
        setBrokers(Array.isArray(r.data) ? r.data : []);
      } else if (activeTab === 'accounts') {
        const [b, a] = await Promise.all([getBrokers(), getAccounts()]);
        setBrokers(Array.isArray(b.data) ? b.data : []);
        setAccounts(Array.isArray(a.data) ? a.data : []);
      } else if (activeTab === 'instruments') {
        const r = await getInstruments();
        setInstruments(Array.isArray(r.data) ? r.data : []);
      } else if (activeTab === 'snapshots') {
        const r = await getPortfolioSnapshots(100);
        setSnapshots(Array.isArray(r.data) ? r.data : []);
      } else if (activeTab === 'users' && user?.is_admin) {
        const r = await getAdminUsers();
        setAdminUsers(Array.isArray(r.data) ? r.data : []);
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Yüklenemedi' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, user?.is_admin]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, aRes, iRes, sRes] = await Promise.all([
        getBrokers(),
        getAccounts(),
        getInstruments(),
        getPortfolioSnapshots(100),
      ]);
      setBrokers(Array.isArray(bRes.data) ? bRes.data : []);
      setAccounts(Array.isArray(aRes.data) ? aRes.data : []);
      setInstruments(Array.isArray(iRes.data) ? iRes.data : []);
      setSnapshots(Array.isArray(sRes.data) ? sRes.data : []);
      if (user?.is_admin) {
        try {
          const uRes = await getAdminUsers();
          setAdminUsers(Array.isArray(uRes.data) ? uRes.data : []);
        } catch {}
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Yüklenemedi' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.is_admin]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTab();
  }, [loadTab]);

  const input = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPri,
    backgroundColor: colors.surfaceAlt,
  };

  const handleCreateBroker = async () => {
    if (!newBroker.trim()) return;
    setSubmitting(true);
    try {
      await createBroker({ name: newBroker.trim() });
      setNewBroker('');
      Toast.show({ type: 'success', text1: 'Broker eklendi' });
      loadTab();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Eklenemedi' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveBrokerEdit = async () => {
    if (!editBroker || !editName.trim()) return;
    setSubmitting(true);
    try {
      await updateBroker(editBroker.id, { name: editName.trim() });
      setEditBroker(null);
      Toast.show({ type: 'success', text1: 'Güncellendi' });
      loadTab();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Hata' });
    } finally {
      setSubmitting(false);
    }
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
      Toast.show({ type: 'success', text1: 'Hesap eklendi' });
      loadTab();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Eklenemedi' });
    } finally {
      setSubmitting(false);
    }
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
      loadTab();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Hata' });
    } finally {
      setSubmitting(false);
    }
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
      Toast.show({ type: 'success', text1: 'Enstrüman eklendi' });
      loadTab();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Eklenemedi' });
    } finally {
      setSubmitting(false);
    }
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
      loadTab();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Hata' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualPrice = async (instrumentId) => {
    const raw = manualPrices[instrumentId];
    const val = parseFloat(String(raw ?? '').replace(',', '.'));
    if (Number.isNaN(val)) {
      Toast.show({ type: 'error', text1: 'Geçerli fiyat girin' });
      return;
    }
    try {
      await updateManualPrice(instrumentId, val);
      Toast.show({ type: 'success', text1: 'Fiyat güncellendi' });
      loadTab();
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
      loadTab();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Silinemedi' });
    }
    setDeleteTarget(null);
  };

  const handleDeleteAllSnapshots = async () => {
    try {
      await deleteAllSnapshots();
      Toast.show({ type: 'success', text1: 'Tüm snapshotlar silindi' });
      loadTab();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Silinemedi' });
    }
    setConfirmDeleteAll(false);
  };

  const handleToggleAdmin = async (userId) => {
    try {
      await toggleUserAdmin(userId);
      Toast.show({ type: 'success', text1: 'Güncellendi' });
      loadTab();
    } catch {
      Toast.show({ type: 'error', text1: 'İşlem başarısız' });
    }
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
    return (
      (i.symbol && i.symbol.toLowerCase().includes(q)) ||
      (i.name && i.name.toLowerCase().includes(q)) ||
      (i.asset_type && i.asset_type.toLowerCase().includes(q)) ||
      (i.market && i.market.toLowerCase().includes(q))
    );
  });

  const currencyChips = (value, onChange) => (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
      {['TRY', 'USD', 'EUR'].map((c) => {
        const on = value === c;
        return (
          <TouchableOpacity
            key={c}
            onPress={() => onChange(c)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: on ? colors.accent : colors.surfaceAlt,
              borderWidth: 1,
              borderColor: on ? colors.accent : colors.border,
            }}
          >
            <Text style={{ fontWeight: '800', color: on ? '#0B0E11' : colors.textPri }}>{c}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderBody = () => {
    if (activeTab === 'brokers') {
      return (
        <View>
          <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 6 }}>Yeni broker</Text>
          <TextInput
            value={newBroker}
            onChangeText={setNewBroker}
            placeholder="Broker adı"
            placeholderTextColor={colors.textTer}
            style={{ ...input, marginBottom: 10 }}
          />
          <TouchableOpacity
            onPress={handleCreateBroker}
            disabled={submitting}
            style={{
              backgroundColor: colors.accent,
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: 'center',
              marginBottom: 20,
              opacity: submitting ? 0.5 : 1,
            }}
          >
            <Text style={{ fontWeight: '800', color: '#0B0E11' }}>Oluştur</Text>
          </TouchableOpacity>
          {brokers.map((b) => (
            <View
              key={b.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 14,
                borderRadius: 12,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPri }}>{b.name}</Text>
              <View style={{ flexDirection: 'row', gap: 14 }}>
                <TouchableOpacity
                  onPress={() => {
                    setEditBroker(b);
                    setEditName(b.name);
                  }}
                >
                  <Feather name="edit-2" size={18} color={colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDeleteTarget({ type: 'broker', id: b.id })}>
                  <Feather name="trash-2" size={18} color={colors.red} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      );
    }

    if (activeTab === 'accounts') {
      const br = brokers.find((x) => String(x.id) === String(newAccount.broker_id));
      return (
        <View>
          <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 6 }}>Yeni hesap</Text>
          <TextInput
            value={newAccount.name}
            onChangeText={(v) => setNewAccount((s) => ({ ...s, name: v }))}
            placeholder="Hesap adı"
            placeholderTextColor={colors.textTer}
            style={{ ...input, marginBottom: 10 }}
          />
          <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 6 }}>Broker</Text>
          <TouchableOpacity onPress={() => setBrokerPicker(true)} style={{ ...input, marginBottom: 10 }}>
            <Text style={{ color: br ? colors.textPri : colors.textTer }}>{br ? br.name : 'Broker seç…'}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 4 }}>Para birimi</Text>
          {currencyChips(newAccount.base_currency, (c) => setNewAccount((s) => ({ ...s, base_currency: c })))}
          <TouchableOpacity
            onPress={handleCreateAccount}
            disabled={submitting}
            style={{
              backgroundColor: colors.accent,
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: 'center',
              marginTop: 14,
              marginBottom: 20,
              opacity: submitting ? 0.5 : 1,
            }}
          >
            <Text style={{ fontWeight: '800', color: '#0B0E11' }}>Oluştur</Text>
          </TouchableOpacity>
          {accounts.map((a) => {
            const broker = brokers.find((b) => b.id === a.broker_id);
            return (
              <View
                key={a.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginBottom: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPri }}>{a.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.textTer, marginTop: 4 }}>
                    {broker?.name || '—'} · {a.base_currency}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setEditAccount({ ...a });
                      setEditName(a.name);
                    }}
                  >
                    <Feather name="edit-2" size={18} color={colors.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDeleteTarget({ type: 'account', id: a.id })}>
                    <Feather name="trash-2" size={18} color={colors.red} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      );
    }

    if (activeTab === 'instruments') {
      return (
        <View>
          <TextInput
            value={instrSearch}
            onChangeText={setInstrSearch}
            placeholder="Ara: sembol, ad, tür, piyasa"
            placeholderTextColor={colors.textTer}
            style={{ ...input, marginBottom: 14 }}
          />
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPri, marginBottom: 8 }}>Yeni enstrüman</Text>
          <TextInput
            value={newInstrument.symbol}
            onChangeText={(v) => setNewInstrument((s) => ({ ...s, symbol: v }))}
            placeholder="Sembol"
            autoCapitalize="characters"
            placeholderTextColor={colors.textTer}
            style={{ ...input, marginBottom: 8 }}
          />
          <TextInput
            value={newInstrument.name}
            onChangeText={(v) => setNewInstrument((s) => ({ ...s, name: v }))}
            placeholder="Ad"
            placeholderTextColor={colors.textTer}
            style={{ ...input, marginBottom: 8 }}
          />
          <TouchableOpacity onPress={() => setAssetPicker(true)} style={{ ...input, marginBottom: 8 }}>
            <Text style={{ color: colors.textPri }}>Varlık türü: {newInstrument.asset_type}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMarketPicker(true)} style={{ ...input, marginBottom: 8 }}>
            <Text style={{ color: colors.textPri }}>Piyasa: {newInstrument.market}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 4 }}>Para birimi</Text>
          {currencyChips(newInstrument.currency, (c) => setNewInstrument((s) => ({ ...s, currency: c })))}
          <TouchableOpacity
            onPress={handleCreateInstrument}
            disabled={submitting}
            style={{
              backgroundColor: colors.accent,
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: 'center',
              marginTop: 14,
              marginBottom: 20,
              opacity: submitting ? 0.5 : 1,
            }}
          >
            <Text style={{ fontWeight: '800', color: '#0B0E11' }}>Oluştur</Text>
          </TouchableOpacity>

          {filteredInstruments.map((i) => (
            <View
              key={i.id}
              style={{
                padding: 14,
                borderRadius: 12,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 10,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPri }}>{i.symbol}</Text>
                  <Text style={{ fontSize: 12, color: colors.textTer, marginTop: 4 }}>{i.name}</Text>
                  <Text style={{ fontSize: 11, color: colors.textSec, marginTop: 6 }}>
                    {i.asset_type} · {i.market} · {i.currency}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    onPress={() =>
                      setEditInstrument({
                        ...i,
                      })
                    }
                  >
                    <Feather name="edit-2" size={18} color={colors.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDeleteTarget({ type: 'instrument', id: i.id })}>
                    <Feather name="trash-2" size={18} color={colors.red} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 }}>
                <TextInput
                  value={manualPrices[i.id] ?? ''}
                  onChangeText={(v) => setManualPrices((p) => ({ ...p, [i.id]: v }))}
                  placeholder="Manuel fiyat"
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textTer}
                  style={{ ...input, flex: 1, marginBottom: 0 }}
                />
                <TouchableOpacity
                  onPress={() => handleManualPrice(i.id)}
                  style={{
                    backgroundColor: colors.surfaceAlt,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ fontWeight: '800', color: colors.accent }}>Kaydet</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      );
    }

    if (activeTab === 'snapshots') {
      return (
        <View>
          {snapshots.length > 0 ? (
            <TouchableOpacity
              onPress={() => setConfirmDeleteAll(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                gap: 8,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.red,
                marginBottom: 16,
              }}
            >
              <Feather name="trash-2" size={16} color={colors.red} />
              <Text style={{ color: colors.red, fontWeight: '800' }}>Tüm snapshotları sil</Text>
            </TouchableOpacity>
          ) : null}
          {snapshots.map((s) => (
            <View
              key={s.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 14,
                borderRadius: 12,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 8,
              }}
            >
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPri }}>{formatDate(s.snapshot_date)}</Text>
                <Text style={{ fontSize: 12, color: colors.textTer, marginTop: 4 }}>
                  {formatCurrency(s.total_market_value, 'TRY')}
                  {s.position_count != null ? ` · ${s.position_count} pozisyon` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDeleteTarget({ type: 'snapshot', id: s.id })}>
                <Feather name="trash-2" size={18} color={colors.red} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      );
    }

    if (activeTab === 'users' && user?.is_admin) {
      return (
        <View>
          {adminUsers.map((u) => (
            <View
              key={u.id}
              style={{
                padding: 14,
                borderRadius: 12,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 10,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textPri }}>{u.username || u.email}</Text>
              <Text style={{ fontSize: 12, color: colors.textTer, marginTop: 4 }}>
                {u.email} {u.is_admin ? '· admin' : ''}
              </Text>
              <View style={{ flexDirection: 'row', marginTop: 12, gap: 16 }}>
                <TouchableOpacity onPress={() => handleToggleAdmin(u.id)}>
                  <Feather name={u.is_admin ? 'shield-off' : 'shield'} size={20} color={colors.accent} />
                </TouchableOpacity>
                {u.id !== user?.id ? (
                  <TouchableOpacity onPress={() => handleSwitchUser(u.id)}>
                    <Feather name="log-in" size={20} color={colors.green} />
                  </TouchableOpacity>
                ) : null}
                {u.id !== user?.id ? (
                  <TouchableOpacity onPress={() => setDeleteTarget({ type: 'user', id: u.id })}>
                    <Feather name="trash-2" size={20} color={colors.red} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      );
    }

    return null;
  };

  const pickerModal = (visible, onClose, title, items, onSelect, labelKey = (x) => x) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} activeOpacity={1} onPress={onClose} />
        <View style={{ maxHeight: '55%', backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.textPri }}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={22} color={colors.textSec} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={items}
            keyExtractor={(x, idx) => (x?.id === '' || x?.id === undefined ? `pick-${idx}` : `pick-${x.id}`)}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                style={{ paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}
              >
                <Text style={{ fontSize: 15, color: colors.textPri }}>{labelKey(item)}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

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
      >
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPri, marginBottom: 12 }}>Ayarlar</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {visibleTabs.map((t) => {
              const on = activeTab === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setActiveTab(t.key)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 12,
                    marginRight: 8,
                    backgroundColor: on ? colors.accent : colors.surfaceAlt,
                    borderWidth: 1,
                    borderColor: on ? colors.accent : colors.border,
                    gap: 6,
                  }}
                >
                  <Feather name={t.icon} size={14} color={on ? '#0B0E11' : colors.textSec} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: on ? '#0B0E11' : colors.textPri }}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {renderBody()}
        </View>
      </ScrollView>

      {pickerModal(brokerPicker, () => setBrokerPicker(false), 'Broker', [{ id: '', name: '— Yok —' }, ...brokers], (item) => {
        setNewAccount((s) => ({ ...s, broker_id: item.id === '' ? '' : String(item.id) }));
      }, (item) => item.name)}

      {pickerModal(assetPicker, () => setAssetPicker(false), 'Varlık türü', ASSET_TYPES.map((x) => ({ id: x, name: x })), (item) => {
        setNewInstrument((s) => ({ ...s, asset_type: item.name }));
        if (editInstrument) setEditInstrument((s) => ({ ...s, asset_type: item.name }));
      }, (item) => item.name)}

      {pickerModal(marketPicker, () => setMarketPicker(false), 'Piyasa', MARKETS.map((x) => ({ id: x, name: x })), (item) => {
        setNewInstrument((s) => ({ ...s, market: item.name }));
        if (editInstrument) setEditInstrument((s) => ({ ...s, market: item.name }));
      }, (item) => item.name)}

      <Modal visible={!!editBroker} transparent animationType="fade" onRequestClose={() => setEditBroker(null)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPri, marginBottom: 12 }}>Broker düzenle</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              style={{ ...input, marginBottom: 16 }}
              placeholderTextColor={colors.textTer}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setEditBroker(null)}
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center' }}
              >
                <Text style={{ color: colors.textSec, fontWeight: '700' }}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveBrokerEdit}
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center' }}
              >
                <Text style={{ color: '#0B0E11', fontWeight: '800' }}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editAccount} transparent animationType="fade" onRequestClose={() => setEditAccount(null)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPri, marginBottom: 12 }}>Hesap düzenle</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              style={{ ...input, marginBottom: 12 }}
              placeholderTextColor={colors.textTer}
            />
            <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 6 }}>Broker</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <TouchableOpacity
                onPress={() => setEditAccount((s) => ({ ...s, broker_id: null }))}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  marginRight: 8,
                  backgroundColor: !editAccount?.broker_id ? colors.accent : colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: !editAccount?.broker_id ? '#0B0E11' : colors.textPri, fontWeight: '700' }}>Yok</Text>
              </TouchableOpacity>
              {brokers.map((b) => {
                const on = editAccount?.broker_id === b.id;
                return (
                  <TouchableOpacity
                    key={b.id}
                    onPress={() => setEditAccount((s) => ({ ...s, broker_id: b.id }))}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                      marginRight: 8,
                      backgroundColor: on ? colors.accent : colors.surfaceAlt,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text style={{ color: on ? '#0B0E11' : colors.textPri, fontWeight: '700' }}>{b.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 4 }}>Para birimi</Text>
            {editAccount
              ? currencyChips(editAccount.base_currency, (c) => setEditAccount((s) => ({ ...s, base_currency: c })))
              : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => setEditAccount(null)}
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center' }}
              >
                <Text style={{ color: colors.textSec, fontWeight: '700' }}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveAccountEdit}
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center' }}
              >
                <Text style={{ color: '#0B0E11', fontWeight: '800' }}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editInstrument} transparent animationType="fade" onRequestClose={() => setEditInstrument(null)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <ScrollView style={{ maxHeight: '80%' }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPri, marginBottom: 12 }}>Enstrüman düzenle</Text>
              {editInstrument ? (
                <>
                  <TextInput
                    value={editInstrument.symbol}
                    onChangeText={(v) => setEditInstrument((s) => ({ ...s, symbol: v }))}
                    style={{ ...input, marginBottom: 8 }}
                    autoCapitalize="characters"
                    placeholderTextColor={colors.textTer}
                  />
                  <TextInput
                    value={editInstrument.name}
                    onChangeText={(v) => setEditInstrument((s) => ({ ...s, name: v }))}
                    style={{ ...input, marginBottom: 8 }}
                    placeholderTextColor={colors.textTer}
                  />
                  <TouchableOpacity onPress={() => setAssetPicker(true)} style={{ ...input, marginBottom: 8 }}>
                    <Text style={{ color: colors.textPri }}>Varlık: {editInstrument.asset_type}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setMarketPicker(true)} style={{ ...input, marginBottom: 8 }}>
                    <Text style={{ color: colors.textPri }}>Piyasa: {editInstrument.market}</Text>
                  </TouchableOpacity>
                  {currencyChips(editInstrument.currency, (c) => setEditInstrument((s) => ({ ...s, currency: c })))}
                </>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  onPress={() => setEditInstrument(null)}
                  style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.textSec, fontWeight: '700' }}>Vazgeç</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveInstrumentEdit}
                  style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center' }}
                >
                  <Text style={{ color: '#0B0E11', fontWeight: '800' }}>Kaydet</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!deleteTarget}
        title="Sil"
        message="Bu kaydı silmek istediğinize emin misiniz?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        destructive
      />

      <ConfirmDialog
        visible={confirmDeleteAll}
        title="Tüm snapshotları sil"
        message="Tüm portföy snapshotları kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?"
        confirmText="Evet, sil"
        onConfirm={handleDeleteAllSnapshots}
        onCancel={() => setConfirmDeleteAll(false)}
        destructive
      />
    </View>
  );
}
