import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export default function ConfirmDialog({ visible, title, message, onConfirm, onCancel, confirmText = 'Evet', cancelText = 'Vazgeç', destructive = false }) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 24 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 24, width: '100%', maxWidth: 340 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPri, marginBottom: 8 }}>{title}</Text>
          <Text style={{ fontSize: 14, color: colors.textSec, lineHeight: 20, marginBottom: 24 }}>{message}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={onCancel}
              style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSec }}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onConfirm}
              style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: destructive ? colors.red : colors.accent, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: destructive ? '#fff' : '#0B0E11' }}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
