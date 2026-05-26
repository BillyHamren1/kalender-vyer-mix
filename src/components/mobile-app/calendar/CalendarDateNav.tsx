import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, addMonths, startOfWeek, endOfWeek, isSameMonth, isSameDay, getISOWeek } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { useLanguage } from '@/i18n/LanguageContext';
import type { CalendarViewMode } from './CalendarViewToggle';

interface Props {
  viewMode: CalendarViewMode;
  selectedDate: Date;
  onChange: (d: Date) => void;
}

const CalendarDateNav = ({ viewMode, selectedDate, onChange }: Props) => {
  const { locale, t } = useLanguage();
  const dfLocale = locale === 'en' ? enUS : sv;

  const goPrev = () => {
    if (viewMode === 'day') onChange(addDays(selectedDate, -1));
    else if (viewMode === 'week') onChange(addDays(selectedDate, -7));
    else onChange(addMonths(selectedDate, -1));
  };
  const goNext = () => {
    if (viewMode === 'day') onChange(addDays(selectedDate, 1));
    else if (viewMode === 'week') onChange(addDays(selectedDate, 7));
    else onChange(addMonths(selectedDate, 1));
  };

  const label = (() => {
    if (viewMode === 'day') {
      return format(selectedDate, 'EEE d MMM', { locale: dfLocale });
    }
    if (viewMode === 'week') {
      const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const end = endOfWeek(selectedDate, { weekStartsOn: 1 });
      const wk = getISOWeek(selectedDate);
      const sameMonth = isSameMonth(start, end);
      const range = sameMonth
        ? `${format(start, 'd', { locale: dfLocale })}–${format(end, 'd MMM', { locale: dfLocale })}`
        : `${format(start, 'd MMM', { locale: dfLocale })}–${format(end, 'd MMM', { locale: dfLocale })}`;
      return `${t('calendar.weekShort')}${wk} · ${range}`;
    }
    return format(selectedDate, 'LLLL yyyy', { locale: dfLocale });
  })();

  const isToday = isSameDay(selectedDate, new Date());

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={goPrev}
        aria-label={t('calendar.prev')}
        className="w-9 h-9 rounded-full bg-primary-soft/60 ring-1 ring-primary/10 flex items-center justify-center active:scale-95 transition-all"
      >
        <ChevronLeft className="w-4 h-4 text-primary" />
      </button>
      <div className="flex-1 text-center text-sm font-semibold text-foreground capitalize tracking-tight">
        {label}
      </div>
      <button
        type="button"
        onClick={goNext}
        aria-label={t('calendar.next')}
        className="w-9 h-9 rounded-full bg-primary-soft/60 ring-1 ring-primary/10 flex items-center justify-center active:scale-95 transition-all"
      >
        <ChevronRight className="w-4 h-4 text-primary" />
      </button>
      {!isToday && (
        <button
          type="button"
          onClick={() => onChange(new Date())}
          className="ml-1 px-3 h-9 rounded-full bg-primary text-primary-foreground text-[11px] font-bold tracking-wide shadow-[0_2px_0_hsl(var(--primary-dark))] active:translate-y-px active:shadow-none transition-all"
        >
          {t('calendar.today')}
        </button>
      )}
    </div>
  );
};

export default CalendarDateNav;
