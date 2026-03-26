import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Feather } from '@expo/vector-icons';
import {
  getInstruments,
  getAccounts,
  getBrokers,
  getDebugTransactions,
  createTransaction,
  updateTransaction,
  createInstrument,
  createBroker,
  createAccount,
} from '../services/api';
import { getItem } from '../utils/storage';
import { useTheme } from '../contexts/ThemeContext';
import Toast from 'react-native-toast-message';

const HORIZONS = [
  { value: 'trade', label: 'Trade' },
  { value: 'short', label: 'Kısa' },
  { value: 'mid', label: 'Orta' },
  { value: 'long', label: 'Uzun' },
];

const CURRENCIES = ['TRY', 'USD', 'EUR'];
const PRESET_SECONDARY_TAGS = ['Temettü', 'Büyüme', 'Değer', 'Kısa Vade', 'Uzun Vade', 'Spekülatif'];
const DEFAULT_ASSET_TYPES = ['Hisse', 'Fon', 'Kripto', 'Altın', 'Tahvil', 'Döviz', 'Emtia'];
const DEFAULT_MARKETS = ['BIST', 'NYSE', 'NASDAQ', 'Kripto', 'Diğer'];

export function FormSection({ title, colors, rightAction, children }) {
  return (
    <View style={{ marginBottom: 16 }}>
      {title ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSec }}>{title}</Text>
          {rightAction}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function FormSelectorRow({ valueLabel, placeholder, onPress, colors, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={{
        minHeight: 48,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        paddingHorizontal: 14,
        backgroundColor: colors.surfaceAlt,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{ fontSize: 15, color: valueLabel ? colors.textPri : colors.textTer, flex: 1 }}
        numberOfLines={1}
      >
        {valueLabel || placeholder}
      </Text>
      <Feather name="chevron-down" size={20} color={colors.textTer} />
    </TouchableOpacity>
  );
}

function ListPickerModal({ visible, title, data, onSelect, onClose, colors, renderLabel, footer }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingBottom: 24,
            borderWidth: 1,
            borderColor: colors.border,
            maxHeight: '72%',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPri }}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Feather name="x" size={22} color={colors.textSec} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={data}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 400 }}
            ListFooterComponent={footer}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 15, color: colors.textPri }}>{renderLabel(item)}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}
export default function TransactionForm({ visible, editTransaction, onClose, onSaved }) {
  const { colors } = useTheme();
  const [step, setStep] = useState(1);
  const [stepBackTarget, setStepBackTarget] = useState(1);
  const [instruments, setInstruments] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assetTypes, setAssetTypes] = useState(DEFAULT_ASSET_TYPES);
  const [markets, setMarkets] = useState(DEFAULT_MARKETS);
  const [availablePrimaryTags, setAvailablePrimaryTags] = useState([]);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [instrumentPickerOpen, setInstrumentPickerOpen] = useState(false);
  const [formData, setFormData] = useState({
    account_id: '',
    instrument_id: '',
    type: 'buy',
    quantity: '',
    price: '',
    fees: '',
    currency: 'TRY',
    horizon: 'mid',
    primary_tag: '',
    secondary_tags: '',
  });
  const [newInstrument, setNewInstrument] = useState({
    symbol: '',
    name: '',
    asset_type: '',
    market: '',
    currency: 'TRY',
  });
  const [newBroker, setNewBroker] = useState({ name: '' });
  const [newAccount, setNewAccount] = useState({ name: '', broker_id: '', base_currency: 'TRY' });
  const [secondaryTagInput, setSecondaryTagInput] = useState('');
  const isEditMode = !!editTransaction;

  const loadData = useCallback(async () => {
    try {
      const [iRes, aRes, bRes, tRes] = await Promise.all([
        getInstruments(),
        getAccounts(),
        getBrokers(),
        getDebugTransactions(),
      ]);
      setInstruments(iRes.data || []);
      setAccounts(aRes.data || []);
      setBrokers(bRes.data || []);
      const tags = new Set();
      (tRes.data || []).forEach((t) => {
        if (t.primary_tag) tags.add(t.primary_tag);
      });
      setAvailablePrimaryTags([...tags]);
      const savedAT = await getItem('portfolio_asset_types');
      if (savedAT) {
        try {
          setAssetTypes(JSON.parse(savedAT));
        } catch {
          /* ignore */
        }
      }
      const savedM = await getItem('portfolio_markets');
      if (savedM) {
        try {
          setMarkets(JSON.parse(savedM));
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (visible) loadData();
  }, [visible, loadData]);

  useEffect(() => {
    if (visible && editTransaction) {
      setFormData({
        account_id: String(editTransaction.account_id || ''),
        instrument_id: String(editTransaction.instrument_id || ''),
        type: 'buy',
        quantity: String(editTransaction.quantity ?? ''),
        price: String(editTransaction.price ?? ''),
        fees: String(editTransaction.fees ?? ''),
        currency: editTransaction.currency || 'TRY',
        horizon: editTransaction.horizon || 'mid',
        primary_tag: editTransaction.primary_tag || '',
        secondary_tags: editTransaction.secondary_tags || '',
      });
    } else if (visible) {
      setFormData({
        account_id: '',
        instrument_id: '',
        type: 'buy',
        quantity: '',
        price: '',
        fees: '',
        currency: 'TRY',
        horizon: 'mid',
        primary_tag: '',
        secondary_tags: '',
      });
    }
    setStep(1);
    setStepBackTarget(1);
    setSecondaryTagInput('');
  }, [visible, editTransaction]);

  const selectedAccountLabel = accounts.find((a) => String(a.id) === formData.account_id)?.name;
  const selectedInstrument = instruments.find((i) => String(i.id) === formData.instrument_id);
  const selectedInstrumentLabel = selectedInstrument
    ? `${selectedInstrument.symbol} — ${selectedInstrument.name}`
    : '';
  const selectedSecondaryTags = formData.secondary_tags
    ? formData.secondary_tags.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  const toggleSecondaryTag = (tag) => {
    const next = selectedSecondaryTags.includes(tag)
      ? selectedSecondaryTags.filter((t) => t !== tag)
      : [...selectedSecondaryTags, tag];
    setFormData((f) => ({ ...f, secondary_tags: next.join(', ') }));
  };

  const addCustomSecondaryTag = () => {
    const t = secondaryTagInput.trim();
    if (!t || selectedSecondaryTags.includes(t)) return;
    setFormData((f) => ({ ...f, secondary_tags: [...selectedSecondaryTags, t].join(', ') }));
    setSecondaryTagInput('');
  };

  const removeSecondaryTag = (tag) => {
    setFormData((f) => ({
      ...f,
      secondary_tags: selectedSecondaryTags.filter((x) => x !== tag).join(', '),
    }));
  };

  const handleSubmit = async () => {
    if (!formData.instrument_id || !formData.quantity || !formData.price) {
      Toast.show({ type: 'error', text1: 'Enstrüman, miktar ve fiyat zorunlu' });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...formData,
        account_id: formData.account_id ? Number(formData.account_id) : null,
        instrument_id: Number(formData.instrument_id),
        quantity: parseFloat(formData.quantity),
        price: parseFloat(formData.price),
        fees: formData.fees ? parseFloat(formData.fees) : 0,
      };
      if (isEditMode) await updateTransaction(editTransaction.id, payload);
      else await createTransaction(payload);
      Toast.show({ type: 'success', text1: isEditMode ? 'Güncellendi' : 'Oluşturuldu' });
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Hata' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInstrument = async () => {
    if (!newInstrument.symbol || !newInstrument.name) {
      Toast.show({ type: 'error', text1: 'Sembol ve ad zorunlu' });
      return;
    }
    setLoading(true);
    try {
      const res = await createInstrument(newInstrument);
      setInstruments((prev) => [...prev, res.data]);
      setFormData((f) => ({ ...f, instrument_id: String(res.data.id) }));
      Toast.show({ type: 'success', text1: 'Enstrüman eklendi' });
      setStep(1);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Eklenemedi' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBroker = async () => {
    if (!newBroker.name) return;
    setLoading(true);
    try {
      const res = await createBroker(newBroker);
      setBrokers((prev) => [...prev, res.data]);
      setNewAccount((a) => ({ ...a, broker_id: String(res.data.id) }));
      Toast.show({ type: 'success', text1: 'Broker eklendi' });
      setStep(4);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Eklenemedi' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!newAccount.name) return;
    setLoading(true);
    try {
      const res = await createAccount({
        ...newAccount,
        broker_id: newAccount.broker_id ? Number(newAccount.broker_id) : null,
      });
      setAccounts((prev) => [...prev, res.data]);
      setFormData((f) => ({ ...f, account_id: String(res.data.id) }));
      Toast.show({ type: 'success', text1: 'Hesap eklendi' });
      setStep(1);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Eklenemedi' });
    } finally {
      setLoading(false);
    }
  };

  const headerTitle =
    step === 1
      ? isEditMode
        ? 'İşlemi Düzenle'
        : 'Yeni İşlem'
      : step === 2
        ? 'Yeni Enstrüman'
        : step === 3
          ? 'Yeni Broker'
          : 'Yeni Hesap';

  const goBackFromStep = () => {
    if (step === 2 || step === 4) setStep(1);
    else if (step === 3) setStep(stepBackTarget);
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
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: colors.bg }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 52,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            {step > 1 ? (
              <TouchableOpacity onPress={goBackFromStep} style={{ marginRight: 12 }} hitSlop={10}>
                <Feather name="arrow-left" size={22} color={colors.textPri} />
              </TouchableOpacity>
            ) : null}
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPri }}>{headerTitle}</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Feather name="x" size={24} color={colors.textSec} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 && (
            <>
              <FormSection
                title="Hesap"
                colors={colors}
                rightAction={
                  <TouchableOpacity
                    onPress={() => {
                      setStepBackTarget(1);
                      setStep(4);
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.accent }}>{'+ Yeni'}</Text>
                  </TouchableOpacity>
                }
              >
                <FormSelectorRow
                  placeholder="Hesap seçin (opsiyonel)"
                  valueLabel={selectedAccountLabel}
                  onPress={() => setAccountPickerOpen(true)}
                  colors={colors}
                />
              </FormSection>

              <FormSection
                title="Enstrüman *"
                colors={colors}
                rightAction={
                  <TouchableOpacity onPress={() => setStep(2)}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.accent }}>{'+ Yeni'}</Text>
                  </TouchableOpacity>
                }
              >
                <FormSelectorRow
                  placeholder="Enstrüman seçin"
                  valueLabel={selectedInstrumentLabel}
                  onPress={() => setInstrumentPickerOpen(true)}
                  colors={colors}
                />
              </FormSection>

              <FormSection title="Yatırım ufku" colors={colors}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {HORIZONS.map((h) => {
                    const on = formData.horizon === h.value;
                    return (
                      <TouchableOpacity
                        key={h.value}
                        onPress={() => setFormData((f) => ({ ...f, horizon: h.value }))}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 14,
                          borderRadius: 10,
                          backgroundColor: on ? colors.accent : colors.surfaceAlt,
                          borderWidth: 1,
                          borderColor: on ? colors.accent : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: on ? '#0B0E11' : colors.textSec,
                          }}
                        >
                          {h.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </FormSection>

              <FormSection title="Miktar, fiyat, komisyon" colors={colors}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: colors.textTer, marginBottom: 6 }}>{'Miktar *'}</Text>
                    <TextInput
                      value={formData.quantity}
                      onChangeText={(v) => setFormData((f) => ({ ...f, quantity: v }))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textTer}
                      style={inputStyle}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: colors.textTer, marginBottom: 6 }}>{'Fiyat *'}</Text>
                    <TextInput
                      value={formData.price}
                      onChangeText={(v) => setFormData((f) => ({ ...f, price: v }))}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.textTer}
                      style={inputStyle}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: colors.textTer, marginBottom: 6 }}>{'Komisyon'}</Text>
                    <TextInput
                      value={formData.fees}
                      onChangeText={(v) => setFormData((f) => ({ ...f, fees: v }))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textTer}
                      style={inputStyle}
                    />
                  </View>
                </View>
              </FormSection>

              <FormSection title="Para birimi" colors={colors}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {CURRENCIES.map((c) => {
                    const on = formData.currency === c;
                    return (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setFormData((f) => ({ ...f, currency: c }))}
                        style={{
                          flex: 1,
                          paddingVertical: 12,
                          borderRadius: 10,
                          alignItems: 'center',
                          backgroundColor: on ? colors.accent : colors.surfaceAlt,
                          borderWidth: 1,
                          borderColor: on ? colors.accent : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: '700',
                            color: on ? '#0B0E11' : colors.textSec,
                          }}
                        >
                          {c}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </FormSection>

              <FormSection title="Birincil etiket" colors={colors}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {availablePrimaryTags.map((tag) => {
                    const on = formData.primary_tag === tag;
                    return (
                      <TouchableOpacity
                        key={tag}
                        onPress={() =>
                          setFormData((f) => ({
                            ...f,
                            primary_tag: f.primary_tag === tag ? '' : tag,
                          }))
                        }
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 10,
                          backgroundColor: on ? colors.accent : colors.surfaceAlt,
                          borderWidth: 1,
                          borderColor: on ? colors.accent : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: on ? '#0B0E11' : colors.textSec,
                          }}
                        >
                          {tag}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  value={formData.primary_tag}
                  onChangeText={(v) => setFormData((f) => ({ ...f, primary_tag: v }))}
                  placeholder="Özel etiket yazın..."
                  placeholderTextColor={colors.textTer}
                  style={inputStyle}
                />
              </FormSection>

              <FormSection title="İkincil etiketler" colors={colors}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {PRESET_SECONDARY_TAGS.map((tag) => {
                    const on = selectedSecondaryTags.includes(tag);
                    return (
                      <TouchableOpacity
                        key={tag}
                        onPress={() => toggleSecondaryTag(tag)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 10,
                          backgroundColor: on ? colors.accent : colors.surfaceAlt,
                          borderWidth: 1,
                          borderColor: on ? colors.accent : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: on ? '#0B0E11' : colors.textSec,
                          }}
                        >
                          {tag}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {selectedSecondaryTags.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {selectedSecondaryTags.map((tag) => (
                      <View
                        key={tag}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingLeft: 10,
                          paddingVertical: 6,
                          paddingRight: 6,
                          borderRadius: 10,
                          backgroundColor: colors.surfaceAlt,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <Text style={{ fontSize: 12, color: colors.textPri, marginRight: 6 }}>{tag}</Text>
                        <TouchableOpacity onPress={() => removeSecondaryTag(tag)} hitSlop={8}>
                          <Feather name="x" size={16} color={colors.textTer} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TextInput
                    value={secondaryTagInput}
                    onChangeText={setSecondaryTagInput}
                    onSubmitEditing={addCustomSecondaryTag}
                    placeholder="Etiket ekle..."
                    placeholderTextColor={colors.textTer}
                    style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    onPress={addCustomSecondaryTag}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: colors.surfaceAlt,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Feather name="plus" size={22} color={colors.accent} />
                  </TouchableOpacity>
                </View>
              </FormSection>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={loading}
                style={{
                  paddingVertical: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  marginTop: 8,
                  backgroundColor: isEditMode ? colors.green : colors.accent,
                  opacity: loading ? 0.55 : 1,
                }}
              >
                {loading ? (
                  <ActivityIndicator color={isEditMode ? '#fff' : '#0B0E11'} />
                ) : (
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '700',
                      color: isEditMode ? '#fff' : '#0B0E11',
                    }}
                  >
                    {isEditMode ? 'Güncelle' : 'İşlem Ekle'}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
          {step === 2 && (
            <>
              <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 6 }}>{'Sembol *'}</Text>
              <TextInput
                value={newInstrument.symbol}
                onChangeText={(v) => setNewInstrument((f) => ({ ...f, symbol: v }))}
                autoCapitalize="characters"
                style={{ ...inputStyle, marginBottom: 14 }}
              />
              <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 6 }}>{'Ad *'}</Text>
              <TextInput
                value={newInstrument.name}
                onChangeText={(v) => setNewInstrument((f) => ({ ...f, name: v }))}
                style={{ ...inputStyle, marginBottom: 14 }}
              />
              <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 6 }}>{'Varlık türü'}</Text>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  marginBottom: 14,
                  overflow: 'hidden',
                  backgroundColor: colors.surfaceAlt,
                }}
              >
                <Picker
                  selectedValue={newInstrument.asset_type}
                  onValueChange={(v) => setNewInstrument((f) => ({ ...f, asset_type: v }))}
                  dropdownIconColor={colors.textSec}
                  style={{ color: colors.textPri }}
                >
                  <Picker.Item label="Seçiniz..." value="" />
                  {assetTypes.map((at) => (
                    <Picker.Item key={at} label={at} value={at} />
                  ))}
                </Picker>
              </View>
              <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 6 }}>{'Piyasa'}</Text>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  marginBottom: 18,
                  overflow: 'hidden',
                  backgroundColor: colors.surfaceAlt,
                }}
              >
                <Picker
                  selectedValue={newInstrument.market}
                  onValueChange={(v) => setNewInstrument((f) => ({ ...f, market: v }))}
                  dropdownIconColor={colors.textSec}
                  style={{ color: colors.textPri }}
                >
                  <Picker.Item label="Seçiniz..." value="" />
                  {markets.map((m) => (
                    <Picker.Item key={m} label={m} value={m} />
                  ))}
                </Picker>
              </View>
              <TouchableOpacity
                onPress={handleCreateInstrument}
                disabled={loading}
                style={{
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: 'center',
                  backgroundColor: colors.accent,
                  opacity: loading ? 0.55 : 1,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#0B0E11' }}>
                  {loading ? 'Ekleniyor...' : 'Enstrüman ekle'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === 3 && (
            <>
              <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 6 }}>{'Broker adı *'}</Text>
              <TextInput
                value={newBroker.name}
                onChangeText={(v) => setNewBroker((f) => ({ ...f, name: v }))}
                style={{ ...inputStyle, marginBottom: 20 }}
              />
              <TouchableOpacity
                onPress={handleCreateBroker}
                disabled={loading}
                style={{
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: 'center',
                  backgroundColor: colors.accent,
                  opacity: loading ? 0.55 : 1,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#0B0E11' }}>
                  {loading ? 'Ekleniyor...' : 'Broker ekle'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === 4 && (
            <>
              <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 6 }}>{'Hesap adı *'}</Text>
              <TextInput
                value={newAccount.name}
                onChangeText={(v) => setNewAccount((f) => ({ ...f, name: v }))}
                style={{ ...inputStyle, marginBottom: 14 }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSec }}>{'Broker'}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setStepBackTarget(4);
                    setStep(3);
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.accent }}>{'+ Yeni'}</Text>
                </TouchableOpacity>
              </View>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  marginBottom: 14,
                  overflow: 'hidden',
                  backgroundColor: colors.surfaceAlt,
                }}
              >
                <Picker
                  selectedValue={newAccount.broker_id}
                  onValueChange={(v) => setNewAccount((f) => ({ ...f, broker_id: v }))}
                  dropdownIconColor={colors.textSec}
                  style={{ color: colors.textPri }}
                >
                  <Picker.Item label="Seçiniz..." value="" />
                  {brokers.map((b) => (
                    <Picker.Item key={b.id} label={b.name} value={String(b.id)} />
                  ))}
                </Picker>
              </View>
              <Text style={{ fontSize: 12, color: colors.textTer, marginBottom: 8 }}>{'Temel para birimi'}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
                {CURRENCIES.map((c) => {
                  const on = newAccount.base_currency === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setNewAccount((f) => ({ ...f, base_currency: c }))}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 10,
                        alignItems: 'center',
                        backgroundColor: on ? colors.accent : colors.surfaceAlt,
                        borderWidth: 1,
                        borderColor: on ? colors.accent : colors.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '700',
                          color: on ? '#0B0E11' : colors.textSec,
                        }}
                      >
                        {c}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                onPress={handleCreateAccount}
                disabled={loading}
                style={{
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: 'center',
                  backgroundColor: colors.accent,
                  opacity: loading ? 0.55 : 1,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#0B0E11' }}>
                  {loading ? 'Ekleniyor...' : 'Hesap ekle'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        <ListPickerModal
          visible={accountPickerOpen}
          title="Hesap seç"
          data={accounts}
          colors={colors}
          onClose={() => setAccountPickerOpen(false)}
          onSelect={(a) => setFormData((f) => ({ ...f, account_id: String(a.id) }))}
          renderLabel={(a) => a.name}
          footer={
            <TouchableOpacity
              onPress={() => {
                setAccountPickerOpen(false);
                setStepBackTarget(1);
                setStep(4);
              }}
              style={{
                paddingVertical: 16,
                alignItems: 'center',
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.accent }}>{'+ Yeni hesap'}</Text>
            </TouchableOpacity>
          }
        />
        <ListPickerModal
          visible={instrumentPickerOpen}
          title="Enstrüman seç"
          data={instruments}
          colors={colors}
          onClose={() => setInstrumentPickerOpen(false)}
          onSelect={(i) => setFormData((f) => ({ ...f, instrument_id: String(i.id) }))}
          renderLabel={(i) => `${i.symbol} — ${i.name}`}
          footer={
            <TouchableOpacity
              onPress={() => {
                setInstrumentPickerOpen(false);
                setStep(2);
              }}
              style={{
                paddingVertical: 16,
                alignItems: 'center',
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.accent }}>{'+ Yeni enstrüman'}</Text>
            </TouchableOpacity>
          }
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}
