import { View, Text, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';

export default function ScreenHeader({ title, rightActions }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { darkMode } = useTheme();
  const iconColor = darkMode ? '#e5e7eb' : '#111827';

  const openDrawer = () => {
    // Traverse up to find the drawer navigator
    let nav = navigation;
    while (nav) {
      if (nav.openDrawer) {
        nav.openDrawer();
        return;
      }
      nav = nav.getParent?.();
    }
  };

  return (
    <View
      className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
      style={{ paddingTop: insets.top }}
    >
      <View className="flex-row items-center justify-between px-4 h-12">
        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={openDrawer} hitSlop={12} className="w-8 h-8 items-center justify-center">
            <Feather name="menu" size={22} color={iconColor} />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-gray-900 dark:text-white">{title}</Text>
        </View>
        {rightActions && (
          <View className="flex-row items-center gap-1">
            {rightActions}
          </View>
        )}
      </View>
    </View>
  );
}
