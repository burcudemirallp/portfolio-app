import { View, Text, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import BottomSheet from '../ui/BottomSheet';
import { useTheme } from '../../contexts/ThemeContext';

const sortOptions = [
  { key: 'name', label: 'Ada Göre', icon: 'type' },
  { key: 'value', label: 'Değere Göre', icon: 'dollar-sign' },
  { key: 'pl', label: 'K/Z Tutarına Göre', icon: 'trending-up' },
  { key: 'pl_pct', label: 'K/Z Yüzdesine Göre', icon: 'percent' },
  { key: 'weight', label: 'Ağırlığa Göre', icon: 'pie-chart' },
];

export default function SortSheet({ visible, onClose, sortKey, onSort }) {
  const { darkMode } = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="text-lg font-bold text-gray-900 dark:text-white" style={{ marginBottom: 16 }}>{'Sıralama'}</Text>
      {sortOptions.map((opt) => {
        const isActive = sortKey === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            onPress={() => { onSort(opt.key); onClose(); }}
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 12, paddingVertical: 14,
              borderRadius: 12, marginBottom: 4,
              backgroundColor: isActive ? (darkMode ? 'rgba(37,99,235,0.1)' : '#eff6ff') : 'transparent',
            }}
          >
            <Feather name={opt.icon} size={18} color={isActive ? '#2563eb' : (darkMode ? '#9ca3af' : '#6b7280')} />
            <Text
              style={{
                flex: 1, marginLeft: 12,
                fontSize: 15, fontWeight: '500',
                color: isActive ? '#2563eb' : (darkMode ? '#fff' : '#111827'),
              }}
            >
              {opt.label}
            </Text>
            {isActive ? <Feather name="check" size={18} color="#2563eb" /> : null}
          </TouchableOpacity>
        );
      })}
    </BottomSheet>
  );
}
