import { TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export default function FAB({ icon = 'plus', onPress, style }) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress?.();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      className="absolute w-14 h-14 rounded-full bg-blue-600 items-center justify-center shadow-lg"
      style={[{ right: 20, bottom: 24, elevation: 6 }, style]}
    >
      <Feather name={icon} size={24} color="#fff" />
    </TouchableOpacity>
  );
}
