export const formatCurrency = (value, currency = 'TRY') => {
  if (value == null) return '\u2014';
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${Number(value).toFixed(2)} ${currency === 'TRY' ? '\u20BA' : currency}`;
  }
};

export const formatDate = (dateString) => {
  if (!dateString) return '\u2014';
  try {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
};

export const formatShortDate = (dateString) => {
  if (!dateString) return '\u2014';
  try {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return dateString;
  }
};

export const formatPercent = (value) => {
  if (value == null) return '\u2014';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${Number(value).toFixed(2)}%`;
};

export const formatRelativeTime = (dateStr) => {
  if (!dateStr) return '';
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

export const formatCompactNumber = (v) => {
  if (v == null) return '\u2014';
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M \u20BA`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K \u20BA`;
  return `${v} \u20BA`;
};
