import { View, Text, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

import DashboardScreen from '../screens/DashboardScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import PerformanceScreen from '../screens/PerformanceScreen';
import TWRScreen from '../screens/TWRScreen';

const Tab = createBottomTabNavigator();

function HamburgerButton({ navigation, color }) {
  return (
    <TouchableOpacity
      onPress={() => {
        let nav = navigation;
        while (nav) {
          if (nav.openDrawer) { nav.openDrawer(); return; }
          nav = nav.getParent?.();
        }
      }}
      hitSlop={12}
      style={{ marginLeft: 16 }}
    >
      <Feather name="menu" size={22} color={color} />
    </TouchableOpacity>
  );
}

export default function MainTabs() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ navigation }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: colors.surface, shadowColor: 'transparent', elevation: 0 },
        headerTintColor: colors.textPri,
        headerTitleStyle: { fontSize: 17, fontWeight: '700' },
        headerLeft: () => <HamburgerButton navigation={navigation} color={colors.textPri} />,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 56,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTer,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen}
        options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Feather name="grid" size={size} color={color} /> }} />
      <Tab.Screen name="Portfolio" component={PortfolioScreen}
        options={{ title: 'Portföy', tabBarIcon: ({ color, size }) => <Feather name="briefcase" size={size} color={color} /> }} />
      <Tab.Screen name="Performance" component={PerformanceScreen}
        options={{ title: 'Performans', tabBarIcon: ({ color, size }) => <Feather name="trending-up" size={size} color={color} /> }} />
      <Tab.Screen name="TWR" component={TWRScreen}
        options={{ title: 'TWR', tabBarIcon: ({ color, size }) => <Feather name="activity" size={size} color={color} /> }} />
    </Tab.Navigator>
  );
}
