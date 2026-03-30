import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

function SnapshotCalendar({ snapshots, selectedSnapshot, onSelectSnapshot }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const { t, locale } = useLanguage();

  // Snapshot'ları tarihe göre grupla
  const snapshotsByDate = {};
  snapshots.forEach(snap => {
    const date = new Date(snap.snapshot_date);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (!snapshotsByDate[dateKey]) {
      snapshotsByDate[dateKey] = [];
    }
    snapshotsByDate[dateKey].push(snap);
  });

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const monthNames = t('calendar.months');
  const dayNames = t('calendar.weekdays');

  const formatCurrency = (value) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="bg-bnc-surface rounded-lg border border-bnc-border p-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={prevMonth}
          className="p-0.5 hover:bg-bnc-surfaceAlt rounded"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-bnc-textSec" />
        </button>
        <h3 className="text-xs font-semibold text-bnc-textPri">
          {monthNames[month]} {year}
        </h3>
        <button
          onClick={nextMonth}
          className="p-0.5 hover:bg-bnc-surfaceAlt rounded"
        >
          <ChevronRight className="w-3.5 h-3.5 text-bnc-textSec" />
        </button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {dayNames.map(day => (
          <div key={day} className="text-center text-[9px] font-medium text-bnc-textTer py-0.5">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar days */}
      <div className="grid grid-cols-7 gap-0.5">
        {/* Empty cells for days before month starts */}
        {Array.from({ length: startingDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="w-6 h-6" />
        ))}

        {/* Days of the month */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const daySnapshots = snapshotsByDate[dateKey] || [];
          const hasSnapshots = daySnapshots.length > 0;
          const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
          const isSelected = daySnapshots.some(s => s.id === selectedSnapshot);

          return (
            <button
              key={day}
              onClick={() => hasSnapshots && onSelectSnapshot(daySnapshots[0].id)}
              disabled={!hasSnapshots}
              className={`w-6 h-6 text-[10px] font-medium rounded transition-colors ${
                isSelected
                  ? 'bg-bnc-accent text-bnc-bg'
                  : hasSnapshots
                  ? 'bg-bnc-accent/20 text-bnc-accent hover:bg-bnc-accent/30 cursor-pointer'
                  : 'text-bnc-textSec'
              } ${isToday ? 'ring-1 ring-bnc-accent' : ''}`}
              title={hasSnapshots ? t('calendar.tooltip', { count: daySnapshots.length, amount: formatCurrency(daySnapshots[0].total_market_value) }) : ''}
            >
              {day}
              {hasSnapshots && daySnapshots.length > 1 && (
                <div className="text-[7px] leading-none">•</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SnapshotCalendar;
