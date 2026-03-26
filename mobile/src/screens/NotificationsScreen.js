import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, getUnreadCount } from '../services/api';
import { formatDate, formatRelativeTime } from '../utils/format';
import { useTheme } from '../contexts/ThemeContext';
import Toast from 'react-native-toast-message';

function notifType(n) {
  return n.type || n.notification_type || 'default';
}

function typeIcon(t) {
  switch (t) {
    case 'price_alert':
    case 'price_up':
      return { name: 'trending-up', colorKey: 'green' };
    case 'price_alert_down':
    case 'price_down':
      return { name: 'trending-down', colorKey: 'red' };
    case 'alert':
    case 'warning':
      return { name: 'alert-circle', colorKey: 'accent' };
    case 'system':
      return { name: 'info', colorKey: 'blue' };
    default:
      return { name: 'bell', colorKey: 'accent' };
  }
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const colorFor = (key) => {
    if (key === 'green') return colors.green;
    if (key === 'red') return colors.red;
    if (key === 'blue') return '#3B82F6';
    return colors.accent;
  };

  const load = useCallback(async () => {
    try {
      const [notifRes, countRes] = await Promise.all([getNotifications(), getUnreadCount()]);
      setNotifications(Array.isArray(notifRes.data) ? notifRes.data : []);
      setUnreadCount(countRes.data?.unread_count ?? 0);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.detail || 'Yüklenemedi' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handleMarkRead = async (id, read) => {
    try {
      await markNotificationRead(id, read);
      load();
    } catch {
      Toast.show({ type: 'error', text1: 'Güncellenemedi' });
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      Toast.show({ type: 'success', text1: 'Tümü okundu' });
      load();
    } catch {
      Toast.show({ type: 'error', text1: 'İşlem başarısız' });
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteNotification(id);
      load();
    } catch {
      Toast.show({ type: 'error', text1: 'Silinemedi' });
    }
  };

  const renderItem = ({ item: n }) => {
    const t = notifType(n);
    const ic = typeIcon(t);
    const iconColor = colorFor(ic.colorKey);
    const unread = !n.is_read;

    return (
      <View
        style={{
          marginHorizontal: 16,
          marginBottom: 10,
          padding: 14,
          borderRadius: 14,
          backgroundColor: unread ? colors.surface : colors.surfaceAlt,
          borderWidth: 1,
          borderColor: unread ? colors.accent : colors.border,
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          {unread ? (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginRight: 10, marginTop: 6 }} />
          ) : (
            <View style={{ width: 8, marginRight: 10 }} />
          )}
          <Feather name={ic.name} size={20} color={iconColor} style={{ marginRight: 12, marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <Text
                style={{
                  flex: 1,
                  fontSize: 15,
                  fontWeight: unread ? '800' : '600',
                  color: unread ? colors.textPri : colors.textSec,
                }}
                numberOfLines={2}
              >
                {n.title}
              </Text>
              <Text style={{ fontSize: 10, color: colors.textTer }}>{formatRelativeTime(n.created_at)}</Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.textSec, marginTop: 6, lineHeight: 18 }}>{n.message}</Text>
            <Text style={{ fontSize: 10, color: colors.textTer, marginTop: 6 }}>{formatDate(n.created_at)}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 12 }}>
              {unread ? (
                <TouchableOpacity
                  onPress={() => handleMarkRead(n.id, true)}
                  style={{ flexDirection: 'row', alignItems: 'center' }}
                >
                  <Feather name="check" size={14} color={colors.accent} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.accent, marginLeft: 6 }}>Okundu</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => handleMarkRead(n.id, false)}
                  style={{ flexDirection: 'row', alignItems: 'center' }}
                >
                  <Feather name="circle" size={14} color={colors.textSec} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSec, marginLeft: 6 }}>Okunmadı</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => handleDelete(n.id)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Feather name="trash-2" size={14} color={colors.red} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.red, marginLeft: 6 }}>Sil</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        renderItem={renderItem}
        ListHeaderComponent={
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPri }}>Bildirimler</Text>
              <Text style={{ fontSize: 12, color: colors.textSec, marginTop: 4 }}>
                {unreadCount > 0 ? `${unreadCount} okunmamış` : 'Hepsi güncel'}
              </Text>
            </View>
            {unreadCount > 0 ? (
              <TouchableOpacity
                onPress={handleMarkAllRead}
                style={{
                  backgroundColor: colors.accent,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 10,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#0B0E11' }}>Tümünü Okundu Yap</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
            <Feather name="bell-off" size={48} color={colors.textTer} />
            <Text style={{ fontSize: 15, color: colors.textSec, marginTop: 14, textAlign: 'center' }}>Bildirim yok</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </View>
  );
}
