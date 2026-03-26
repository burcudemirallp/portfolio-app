import { View, Text, TouchableOpacity } from 'react-native';

export default function SegmentControl({ options, value, onChange, style }) {
  return (
    <View className="flex-row bg-gray-100 dark:bg-gray-700 rounded-xl p-1" style={style}>
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className={`flex-1 h-11 items-center justify-center rounded-lg ${isActive ? 'bg-white dark:bg-gray-600 shadow-sm' : ''}`}
          >
            <Text className={`text-sm font-medium ${isActive ? 'text-brand dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
