import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, isSameMonth, format } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { ScheduledShift } from '@/services/mobileApiService';
import { useLanguage } from '@/i18n/LanguageContext';
import { useShiftsByDate } from '@/hooks/useBookingsByDate';

interface Props {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  shifts: ScheduledShift[];
}

const MobileMonthView = ({ selectedDate, onSelectDate, shifts }: Props) => {
  const { locale } = useLanguage();
  const dfLocale = locale === 'en' ? enUS : sv;
  const grouped = useShiftsByDate(shifts);

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const today = new Date();
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    format(addDays(gridStart, i), 'EEEEE', { locale: dfLocale })
  );

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-7 gap-1">
        {weekdayLabels.map((l, i) => (
          <div key={i} className="text-center text-[10px] font-semibold uppercase text-muted-foreground py-1">
            {l}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(d => {
          const inMonth = isSameMonth(d, selectedDate);
          const isSelected = isSameDay(d, selectedDate);
          const isToday = isSameDay(d, today);
          const count = grouped.getCountForDate(d);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onSelectDate(d)}
              className={cn(
                'aspect-square rounded-lg flex flex-col items-center justify-center transition-all active:scale-95 relative',
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : inMonth
                    ? 'bg-muted/30 text-foreground hover:bg-muted'
                    : 'bg-transparent text-muted-foreground/40'
              )}
            >
              <span
                className={cn(
                  'text-sm font-semibold',
                  isToday && !isSelected && 'text-primary'
                )}
              >
                {format(d, 'd')}
              </span>
              {count > 0 && (
                <span
                  className={cn(
                    'absolute bottom-1 w-1 h-1 rounded-full',
                    isSelected ? 'bg-primary-foreground' : 'bg-primary'
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MobileMonthView;
