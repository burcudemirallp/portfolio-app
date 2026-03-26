import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList } from 'react-native';
import { Feather } from '@expo/vector-icons';
import BottomSheet from './BottomSheet';

export default function SearchableSelect({ visible, onClose, options, onSelect, title, placeholder = 'Ara...' }) {
  const [search, setSearch] = useState('');

  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const handleSelect = (option) => {
    onSelect(option.value);
    setSearch('');
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={() => { setSearch(''); onClose(); }}>
      {title && <Text className="text-xl font-bold text-gray-900 dark:text-white mb-4">{title}</Text>}
      <View className="flex-row items-center bg-gray-100 dark:bg-gray-700 rounded-xl px-4 h-12 mb-3">
        <Feather name="search" size={18} color="#9ca3af" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          className="flex-1 ml-3 text-base text-gray-900 dark:text-white"
          autoFocus
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Feather name="x" size={18} color="#9ca3af" />
          </TouchableOpacity>
        ) : null}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.value)}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => handleSelect(item)}
            className="h-12 flex-row items-center px-2 border-b border-gray-100 dark:border-gray-700"
          >
            <Text className="text-base text-gray-900 dark:text-white flex-1">{item.label}</Text>
            {item.subtitle && <Text className="text-sm text-gray-500">{item.subtitle}</Text>}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View className="py-8 items-center">
            <Text className="text-base text-gray-500">Sonuç bulunamadı</Text>
          </View>
        }
        style={{ maxHeight: 300 }}
        keyboardShouldPersistTaps="handled"
      />
    </BottomSheet>
  );
}
