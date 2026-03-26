import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, Platform } from 'react-native';
import { createDrawerNavigator, DrawerContentScrollView } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { fetchAllPrices, getAdminUsers, adminSwitchUser } from '../services/api';
import useUnreadCount from '../hooks/useUnreadCount';
import Toast from 'react-native-toast-message';

import MainTabs from './MainTabs';
import ComparisonScreen from '../screens/ComparisonScreen';
import SalesScreen from '../screens/SalesScreen';
import ScannerScreen from '../screens/ScannerScreen';
import AlertsScreen from '../screens/AlertsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Drawer = createDrawerNavigator();
const Stack = createStackNavigator();

const MENU_ITEMS = [
  { name: 'Notifications', label: 'Bildirimler', icon: 'bell' },
  { name: 'Comparison', label: 'Karşılaştırma', icon: 'bar-chart' },
  { name: 'Sales', label: 'Satış Geçmişi', icon: 'log-out' },
  { name: 'Scanner', label: 'Tarayıcı', icon: 'search' },
  { name: 'Alerts', label: 'Alarmlar', icon: 'alert-circle' },
  { name: 'Settings', label: 'Ayarlar', icon: 'settings' },
];

function MainStack() {
  const { colors } = useTheme();
  const headerOpts = {
    headerStyle: { backgroundColor: colors.surface, shadowColor: 'transparent', elevation: 0 },
    headerTintColor: colors.textPri,
    headerTitleStyle: { fontSize: 17, fontWeight: '700' },
  };

  return (
    <Stack.Navigator screenOptions={headerOpts}>
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Bildirimler' }} />
      <Stack.Screen name="Comparison" component={ComparisonScreen} options={{ title: 'Karşılaştırma' }} />
      <Stack.Screen name="Sales" component={SalesScreen} options={{ title: 'Satış Geçmişi' }} />
      <Stack.Screen name="Scanner" component={ScannerScreen} options={{ title: 'Tarayıcı' }} />
      <Stack.Screen name="Alerts" component={AlertsScreen} options={{ title: 'Alarmlar' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Ayarlar' }} />
    </Stack.Navigator>
  );
}

function CustomDrawerContent({ navigation }) {
  const { user, logout, switchToUser, switchBackToAdmin, isActingAs } = useAuth();
  const { darkMode, toggleDarkMode, colors } = useTheme();
  const unread = useUnreadCount();
  const [refreshing, setRefreshing] = useState(false);
  const [actingAs, setActingAs] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);

  useEffect(() => { (async () => setActingAs(await isActingAs()))(); }, [user]);
  useEffect(() => {
    if (user?.is_admin) getAdminUsers().then(r => setAdminUsers(Array.isArray(r?.data) ? r.data : [])).catch(() => {});
  }, [user?.is_admin]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await fetchAllPrices(); Toast.show({ type: 'success', text1: 'Fiyatlar güncellendi' }); }
    catch { Toast.show({ type: 'error', text1: 'Fiyat güncellenemedi' }); }
    finally { setRefreshing(false); }
  };

  const handleSwitch = async (id) => {
    if (id === user?.id) return;
    try {
      const res = await adminSwitchUser(id);
      await switchToUser(res.data.access_token, res.data.user);
      Toast.show({ type: 'success', text1: `${res.data.user?.username} hesabına geçildi` });
    } catch (err) { Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Geçilemedi' }); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* Logo */}
      <View style={{ paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#0B0E11' }}>P</Text>
          </View>
          <View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPri }}>Portfolio Tracker</Text>
            <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 1 }}>Yatırım takip</Text>
          </View>
        </View>
      </View>

      {/* Menu items */}
      <ScrollView style={{ flex: 1, paddingTop: 8 }}>
        {MENU_ITEMS.map(item => (
          <TouchableOpacity key={item.name}
            onPress={() => navigation.navigate('MainStack', { screen: item.name })}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 }}>
            <Feather name={item.icon} size={18} color={colors.textSec} />
            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPri, marginLeft: 14, flex: 1 }}>{item.label}</Text>
            {item.name === 'Notifications' && unread > 0 && (
              <View style={{ backgroundColor: colors.red, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Bottom section */}
      <View style={{ paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
        {/* User info */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#0B0E11' }}>{(user?.username || 'U')[0].toUpperCase()}</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPri, flex: 1 }} numberOfLines={1}>{user?.username || user?.email || 'Kullanıcı'}</Text>
        </View>

        {actingAs && (
          <TouchableOpacity onPress={async () => { await switchBackToAdmin(); Toast.show({ type: 'success', text1: "Admin'e dönüldü" }); }}
            style={{ backgroundColor: 'rgba(240,185,11,0.1)', borderRadius: 10, paddingVertical: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.accent, textAlign: 'center' }}>
              {user?.username} olarak görüntüleniyor • Admin'e dön
            </Text>
          </TouchableOpacity>
        )}

        {user?.is_admin && adminUsers.filter(u => u.id !== user?.id).length > 0 && (
          <TouchableOpacity onPress={() => {
            const others = adminUsers.filter(u => u.id !== user?.id);
            Alert.alert('Hesaba Geç', '', [
              ...others.map(u => ({ text: u.username || u.email, onPress: () => handleSwitch(u.id) })),
              { text: 'Vazgeç', style: 'cancel' },
            ]);
          }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingVertical: 8, marginBottom: 8 }}>
            <Feather name="users" size={14} color={colors.textSec} />
            <Text style={{ fontSize: 12, fontWeight: '500', color: colors.textSec }}>Hesaba geç</Text>
          </TouchableOpacity>
        )}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={toggleDarkMode}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surfaceAlt }}>
            <Feather name={darkMode ? 'sun' : 'moon'} size={16} color={colors.textSec} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleRefresh} disabled={refreshing}
            style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.accent, opacity: refreshing ? 0.5 : 1 }}>
            <Feather name="refresh-cw" size={14} color="#0B0E11" />
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#0B0E11' }}>{refreshing ? '...' : 'Fiyat Güncelle'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout}
            style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="log-out" size={16} color={colors.red} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function AppDrawer() {
  const { colors } = useTheme();

  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: { backgroundColor: colors.surface, width: 280 },
      }}
    >
      <Drawer.Screen name="MainStack" component={MainStack} />
    </Drawer.Navigator>
  );
}
