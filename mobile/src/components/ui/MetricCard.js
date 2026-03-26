import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function MetricCard({ icon, iconColor, iconBg, label, value, valueColor }) {
  return (
    <View className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 flex-1 min-w-0">
      <View className="flex-row items-center gap-2 mb-2">
        <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: iconBg || (iconColor + '18') }}>
          <Feather name={icon} size={18} color={iconColor} />
        </View>
        <Text className="text-sm font-medium text-gray-600 dark:text-gray-400 flex-1" numberOfLines={1}>{label}</Text>
      </View>
      <Text className={`text-value font-bold ${valueColor || 'text-gray-900 dark:text-white'}`} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}
