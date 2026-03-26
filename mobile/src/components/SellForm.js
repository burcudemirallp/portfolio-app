import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { createSaleRecord } from '../services/api';
import { formatCurrency } from '../utils/format';
import { useTheme } from '../contexts/ThemeContext';
import Toast from 'react-native-toast-message';

export default function SellForm({ visible, transaction, instrument, onClose, onSold }) {
  const { colors } = useTheme();
  const [sellPrice, setSellPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const defaultPrice = useMemo(() => {
    if (!transaction) return '';
    const lp = instrument?.last_price_try;
    if (lp != null && !Number.isNaN(Number(lp))) return String(lp);
    return transaction.price != null ? String(transaction.price) : '';
  }, [transaction, instrument]);

  useEffect(() => {
    if (visible && transaction) {
      setSellPrice(defaultPrice);
      setNotes('');
    }
  }, [visible, transaction, defaultPrice]);

  const profitLoss = useMemo(() => {
    if (!transaction || sellPrice === '') return null;
    const sp = parseFloat(sellPrice);
    if (Number.isNaN(sp)) return null;
    const qty = transaction.quantity || 0;
    const buyTotal = qty * (transaction.price || 0) + (transaction.fees || 0);
    const sellTotal = qty * sp;
    const pl = sellTotal - buyTotal;
    const pct = buyTotal > 0 ? (pl / buyTotal) * 100 : 0;
    return { amount: pl, percentage: pct, isProfit: pl >= 0 };
  }, [sellPrice, transaction]);

  const totalCost = transaction
    ? (transaction.quantity || 0) * (transaction.price || 0) + (transaction.fees || 0)
    : 0;

  const handleSubmit = async () => {
    if (!sellPrice) {
      Toast.show({ type: 'error', text1: 'Satış fiyatı zorunlu' });
      return;
    }
    setLoading(true);
    try {
      await createSaleRecord({
        buy_transaction_id: transaction.id,
        sell_price: parseFloat(sellPrice),
        sell_quantity: transaction.quantity,
        sell_currency: transaction.currency || 'TRY',
        notes: notes || null,
      });
      Toast.show({ type: 'success', text1: 'Satış kaydedildi' });
      if (onSold) onSold();
      onClose();
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Satış başarısız' });
    } finally {
      setLoading(false);
    }
  };

  if (!transaction) return null;

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

  const pctDisplay = (profitLoss?.percentage ?? 0).toFixed(2);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '88%',
            borderWidth: 1,
            borderColor: colors.border,
            borderBottomWidth: 0,
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.red }}>{'Satış'}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <Feather name="x" size={24} color={colors.textSec} />
              </TouchableOpacity>
            </View>

            <View
              style={{
                backgroundColor: colors.surfaceAlt,
                borderRadius: 14,
                padding: 14,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPri }}>
                {instrument?.symbol || '—'} {' — '} {instrument?.name || ''}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSec, marginTop: 8 }}>
                {'Alış fiyatı: '}
                {formatCurrency(transaction.price)}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSec, marginTop: 4 }}>
                {'Miktar: '}
                {String(transaction.quantity)}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSec, marginTop: 4 }}>
                {'Toplam maliyet: '}
                {formatCurrency(totalCost)}
              </Text>
            </View>

            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSec, marginBottom: 6 }}>
              {'Satış fiyatı'}
            </Text>
            <TextInput
              value={sellPrice}
              onChangeText={setSellPrice}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textTer}
              style={{ ...inputStyle, marginBottom: 14 }}
            />

            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSec, marginBottom: 6 }}>
              {'Not'}
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Satış notu..."
              placeholderTextColor={colors.textTer}
              style={{ ...inputStyle, minHeight: 88, textAlignVertical: 'top', marginBottom: 16 }}
            />

            {profitLoss ? (
              <View
                style={{
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 18,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: profitLoss.isProfit ? colors.green : colors.red,
                }}
              >
                <Feather
                  name={profitLoss.isProfit ? 'trending-up' : 'trending-down'}
                  size={26}
                  color={profitLoss.isProfit ? colors.green : colors.red}
                  style={{ marginRight: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: '800',
                      color: profitLoss.isProfit ? colors.green : colors.red,
                    }}
                  >
                    {formatCurrency(profitLoss.amount)}
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: profitLoss.isProfit ? colors.green : colors.red,
                      marginTop: 4,
                    }}
                  >
                    {(profitLoss.percentage ?? 0) >= 0 ? '+' : ''}
                    {pctDisplay}%
                  </Text>
                </View>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              style={{
                paddingVertical: 16,
                borderRadius: 12,
                alignItems: 'center',
                backgroundColor: colors.red,
                opacity: loading ? 0.55 : 1,
                marginBottom: 10,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                {loading ? 'Kaydediliyor...' : 'Satışı onayla'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onClose}
              style={{
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: 'center',
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSec }}>{'İptal'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
