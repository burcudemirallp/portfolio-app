import { Modal, View, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function BottomSheet({ visible, onClose, children }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/50">
        <TouchableOpacity className="flex-1" activeOpacity={1} onPress={onClose} />
        <View className="bg-white dark:bg-gray-800 rounded-t-3xl" style={{ paddingBottom: insets.bottom || 16 }}>
          {/* Drag handle */}
          <View className="items-center py-3">
            <View className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          </View>
          <View className="px-6 pb-4">
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
