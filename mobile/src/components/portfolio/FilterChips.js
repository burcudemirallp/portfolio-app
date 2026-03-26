import { ScrollView, Text, TouchableOpacity } from 'react-native';

export default function FilterChips({ tags, selectedTag, onSelect }) {
  const chips = [
    { label: 'Tümü', value: '' },
    ...tags.map(t => ({ label: t, value: t })),
    { label: 'Kârda', value: '__profit__', color: '#22c55e' },
    { label: 'Zararda', value: '__loss__', color: '#ef4444' },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
    >
      {chips.map((chip) => {
        const isActive = selectedTag === chip.value;
        return (
          <TouchableOpacity
            key={chip.value}
            onPress={() => onSelect(isActive ? '' : chip.value)}
            style={{ marginRight: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: isActive ? '#2563eb' : undefined, borderColor: isActive ? '#2563eb' : '#e5e7eb' }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '500',
                color: isActive ? '#fff' : (chip.color || '#374151'),
              }}
            >
              {chip.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
