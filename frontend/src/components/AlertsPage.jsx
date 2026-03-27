import { useState, useEffect } from 'react';
import { Bell, Trash2, TrendingUp, TrendingDown, ToggleLeft, ToggleRight, Check } from 'lucide-react';
import { useToast } from './Toast';
import { getAlerts, createAlert, deleteAlert, toggleAlert, getInstruments } from '../services/api';

const ALERT_TYPE_MAP = {
  above: 'Fiyatı geçerse',
  below: 'Fiyatın altına düşerse',
};

export default function AlertsPage() {
  const { showSuccess, showError } = useToast();
  const [alerts, setAlerts] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    instrument_id: '',
    alert_type: 'above',
    target_value: '',
    notes: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [alertsRes, instRes] = await Promise.all([getAlerts(), getInstruments()]);
      setAlerts(Array.isArray(alertsRes?.data) ? alertsRes.data : []);
      setInstruments(Array.isArray(instRes?.data) ? instRes.data : []);
    } catch (err) {
      if (err.response?.status !== 401) {
        console.error('Error loading alerts:', err);
        showError('Alarmlar yüklenirken hata: ' + (err.response?.data?.detail || err.message));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeAlerts = alerts.filter((a) => !a.is_triggered);
  const triggeredAlerts = alerts.filter((a) => a.is_triggered);

  const getInstrumentName = (id) => {
    const inst = instruments.find((i) => i.id === id);
    return inst ? `${inst.symbol} - ${inst.name}` : `ID: ${id}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const instrumentId = parseInt(form.instrument_id, 10);
    const targetValue = parseFloat(form.target_value);
    if (!instrumentId || isNaN(targetValue) || targetValue <= 0) {
      showError('Lütfen geçerli enstrüman ve hedef fiyat girin.');
      return;
    }
    setSubmitting(true);
    try {
      await createAlert({
        instrument_id: instrumentId,
        alert_type: form.alert_type,
        target_value: targetValue,
        notes: form.notes || undefined,
      });
      showSuccess('Alarm oluşturuldu');
      setForm({ instrument_id: '', alert_type: 'above', target_value: '', notes: '' });
      loadData();
    } catch (err) {
      showError('Alarm oluşturulamadı: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Bu alarmı silmek istediğinizden emin misiniz?')) return;
    try {
      await deleteAlert(id);
      showSuccess('Alarm silindi');
      loadData();
    } catch (err) {
      showError('Alarm silinirken hata: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleToggle = async (id) => {
    try {
      await toggleAlert(id);
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_active: !a.is_active } : a))
      );
      showSuccess('Alarm durumu güncellendi');
    } catch (err) {
      showError('Durum güncellenemedi: ' + (err.response?.data?.detail || err.message));
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('tr-TR');
  };

  const formatPrice = (v) =>
    new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(
      v ?? 0
    );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-bnc-accent mb-4" />
        <p className="text-bnc-textSec">Yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bell className="w-8 h-8 text-bnc-accent" />
        <h1 className="text-2xl font-bold text-bnc-textPri">Fiyat Alarmları</h1>
      </div>

      {/* Create Alert Form */}
      <div className="bnc-card shadow-lg p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-bnc-textPri mb-4">
          Yeni Alarm Oluştur
        </h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-bnc-textSec mb-1">
              Enstrüman
            </label>
            <select
              value={form.instrument_id}
              onChange={(e) => setForm({ ...form, instrument_id: e.target.value })}
              className="w-full bnc-input"
              required
            >
              <option value="">Seçin...</option>
              {instruments.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.symbol} - {inst.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-bnc-textSec mb-1">
              Alarm Türü
            </label>
            <select
              value={form.alert_type}
              onChange={(e) => setForm({ ...form, alert_type: e.target.value })}
              className="w-full bnc-input"
            >
              <option value="above">Fiyatı geçerse</option>
              <option value="below">Fiyatın altına düşerse</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-bnc-textSec mb-1">
              Hedef Değer
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.target_value}
              onChange={(e) => setForm({ ...form, target_value: e.target.value })}
              placeholder="0.00"
              className="w-full bnc-input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-bnc-textSec mb-1">
              Not (opsiyonel)
            </label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Not..."
              className="w-full bnc-input"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="bnc-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Kaydediliyor...' : 'Alarm Oluştur'}
            </button>
          </div>
        </form>
      </div>

      {/* Active Alerts List */}
      <div>
        <h2 className="text-lg font-semibold text-bnc-textPri mb-4">
          Aktif Alarmlar
        </h2>
        {activeAlerts.length === 0 ? (
          <div className="bnc-card p-8 sm:p-12 text-center">
            <Bell className="w-16 h-16 mx-auto text-bnc-textTer mb-4" />
            <p className="text-bnc-textSec text-lg">
              Henüz alarm oluşturmadınız
            </p>
            <p className="text-sm text-bnc-textTer mt-1">
              Yukarıdaki formu kullanarak fiyat alarmı ekleyebilirsiniz.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`bnc-card p-4 transition-colors ${
                  alert.is_active ? '' : 'opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="font-semibold text-bnc-textPri">
                    {getInstrumentName(alert.instrument_id)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      alert.alert_type === 'above'
                        ? 'bg-bnc-green/15 text-bnc-green'
                        : 'bg-bnc-red/15 text-bnc-red'
                    }`}
                  >
                    {alert.alert_type === 'above' ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {ALERT_TYPE_MAP[alert.alert_type] || alert.alert_type}
                  </span>
                </div>
                <p className="text-sm text-bnc-textSec mb-3">
                  Hedef: <strong className="text-bnc-textPri">{formatPrice(alert.target_value)}</strong>
                </p>
                {alert.notes && (
                  <p className="text-xs text-bnc-textTer mb-3 truncate">
                    {alert.notes}
                  </p>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-bnc-border">
                  <button
                    onClick={() => handleToggle(alert.id)}
                    className="flex items-center gap-1 text-sm text-bnc-textSec hover:text-bnc-textPri"
                    title={alert.is_active ? 'Devre dışı bırak' : 'Etkinleştir'}
                  >
                    {alert.is_active ? (
                      <ToggleRight className="w-5 h-5 text-bnc-green" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-bnc-textTer" />
                    )}
                    <span>{alert.is_active ? 'Aktif' : 'Pasif'}</span>
                  </button>
                  <button
                    onClick={() => handleDelete(alert.id)}
                    className="p-2 text-bnc-red hover:bg-bnc-red/10 rounded-lg transition-colors"
                    title="Sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Triggered Alerts Section */}
      {triggeredAlerts.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-bnc-textPri mb-4">
            Tetiklenen Alarmlar
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {triggeredAlerts.map((alert) => (
              <div
                key={alert.id}
                className="bnc-card p-4"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-semibold text-bnc-textPri">
                    {getInstrumentName(alert.instrument_id)}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-bnc-green/15 text-bnc-green">
                    <Check className="w-3 h-3" />
                    Tetiklendi
                  </span>
                </div>
                <p className="text-sm text-bnc-textSec mb-1">
                  Hedef: {formatPrice(alert.target_value)}
                </p>
                <p className="text-sm font-medium text-bnc-textPri">
                  Tetikleme fiyatı:{' '}
                  <span className="text-bnc-accent">
                    {formatPrice(alert.triggered_price)}
                  </span>
                </p>
                <p className="text-xs text-bnc-textTer mt-1">
                  {formatDate(alert.triggered_at)}
                </p>
                <div className="mt-3 pt-2 border-t border-bnc-border">
                  <button
                    onClick={() => handleDelete(alert.id)}
                    className="flex items-center gap-1 text-sm text-bnc-red hover:opacity-80"
                  >
                    <Trash2 className="w-4 h-4" />
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
