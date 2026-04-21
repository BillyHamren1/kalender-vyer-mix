import { startOfWeek, addDays, isSameDay, format } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { ScheduledShift } from '@/services/mobileApiService';
import { useLanguage } from '@/i18n/LanguageContext';
import { useShiftsByDate } from '@/hooks/useBookingsByDate';
import MobileDayView from './MobileDayView';

interface Props {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  shifts: ScheduledShift[];
  activeBookingIds: Set<string>;
}

const MobileWeekView = ({ selectedDate, onSelectDate, shifts, activeBookingIds }: Props) => {
  const { locale } = useLanguage();
  const dfLocale = locale === 'en' ? enUS : sv;
  const grouped = useShiftsByDate(shifts);

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-1">
        {days.map(d => {
          const isSelected = isSameDay(d, selectedDate);
          const isToday = isSameDay(d, today);
          const count = grouped.getCountForDate(d);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onSelectDate(d)}
              className={cn(
                'flex flex-col items-center justify-center py-2 rounded-xl transition-all active:scale-95',
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-muted/40 text-foreground hover:bg-muted'
              )}
            >
              <span
                className={cn(
                  'text-[10px] uppercase tracking-wide font-semibold',
                  isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                )}
              >
                {format(d, 'EEEEE', { locale: dfLocale })}
              </span>
              <span
                className={cn(
                  'mt-0.5 text-sm font-bold flex items-center justify-center w-7 h-7 rounded-full',
                  isToday && !isSelected && 'ring-1 ring-primary text-primary'
                )}
              >
                {format(d, 'd')}
              </span>
              <span
                className={cn(
                  'mt-0.5 h-3 text-[10px] font-semibold',
                  isSelected ? 'text-primary-foreground/90' : 'text-muted-foreground'
                )}
              >
                {count > 0 ? count : ''}
              </span>
            </button>
          );
        })}
      </div>
      <MobileDayView
        date={selectedDate}
        shifts={shifts}
        activeBookingIds={activeBookingIds}
      />
    </div>
  );
};

export default MobileWeekView;
