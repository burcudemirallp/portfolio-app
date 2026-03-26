import { View } from 'react-native';

export default function ProgressBar({ value = 0, max = 100, color = '#3b82f6', height = 4 }) {
  const pct = max > 0 ? Math.min(Math.max((value / max) * 100, 0), 100) : 0;

  return (
    <View className="rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden" style={{ height }}>
      <View className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </View>
  );
}
