import { useState, useEffect } from 'react';
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, getUnreadCount } from '../services/api';
import { Bell, BellOff, Trash2, Check, TrendingUp, TrendingDown, Info } from 'lucide-react';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const [notifRes, countRes] = await Promise.all([
        getNotifications(),
        getUnreadCount()
      ]);
      setNotifications(notifRes.data);
      setUnreadCount(countRes.data.unread_count || 0);
    } catch (error) {
      console.error('Bildirimler yüklenirken hata:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id, isRead) => {
    try {
      await markNotificationRead(id, !isRead);
      loadNotifications();
    } catch (error) {
      console.error('Bildirim güncellenirken hata:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      loadNotifications();
    } catch (error) {
      console.error('Hata:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteNotification(id);
      loadNotifications();
    } catch (error) {
      console.error('Silme hatası:', error);
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'price_alert':
        return <TrendingUp className="w-5 h-5 text-bnc-green" />;
      case 'price_alert_down':
        return <TrendingDown className="w-5 h-5 text-bnc-red" />;
      case 'system':
        return <Info className="w-5 h-5 text-bnc-accent" />;
      default:
        return <Bell className="w-5 h-5 text-bnc-accent" />;
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes} dk önce`;
    if (hours < 24) return `${hours} saat önce`;
    if (days < 7) return `${days} gün önce`;
    return date.toLocaleDateString('tr-TR');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-bnc-accent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bnc-textPri">Bildirimler</h1>
          <p className="text-bnc-textSec">
            {unreadCount > 0 ? `${unreadCount} okunmamış bildirim` : 'Tüm bildirimler okundu'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="bnc-btn-primary flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Tümünü Okundu İşaretle
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-12">
          <BellOff className="w-16 h-16 text-bnc-textTer mx-auto mb-4" />
          <p className="text-bnc-textTer">Henüz bildiriminiz yok</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={`p-4 rounded-lg border transition-all ${
                notif.is_read
                  ? 'bg-bnc-surface border-bnc-border'
                  : 'bg-bnc-surfaceAlt border-bnc-accent/50 shadow-sm'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-1">
                  {getIcon(notif.notification_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className={`font-semibold ${notif.is_read ? 'text-bnc-textSec' : 'text-bnc-textPri'}`}>
                      {notif.title}
                    </h3>
                    <span className="text-xs text-bnc-textTer whitespace-nowrap">
                      {formatDate(notif.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-bnc-textSec">
                    {notif.message}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    {!notif.is_read && (
                      <button
                        onClick={() => handleMarkRead(notif.id, notif.is_read)}
                        className="flex items-center gap-1 text-xs text-bnc-accent hover:text-bnc-accentHover"
                      >
                        <Check className="w-3 h-3" /> Okundu
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(notif.id)}
                      className="flex items-center gap-1 text-xs text-bnc-red hover:opacity-80"
                    >
                      <Trash2 className="w-3 h-3" /> Sil
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
