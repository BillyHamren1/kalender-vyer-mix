import { Calendar } from 'lucide-react';
import DayTimeline from '@/components/mobile-app/DayTimeline';
import type { ScheduledShift } from '@/services/mobileApiService';
import { useLanguage } from '@/i18n/LanguageContext';
import { useShiftsByDate } from '@/hooks/useBookingsByDate';

interface Props {
  date: Date;
  shifts: ScheduledShift[];
  activeBookingIds: Set<string>;
  onShowWeek?: () => void;
}

const MobileDayView = ({ date, shifts, activeBookingIds, onShowWeek }: Props) => {
  const { t } = useLanguage();
  const grouped = useShiftsByDate(shifts);
  const day = grouped.getForDate(date);

  if (day.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto">
          <Calendar className="w-6 h-6 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-semibold text-foreground/70">{t('calendar.noJobsThisDay')}</p>
        {onShowWeek && (
          <button
            type="button"
            onClick={onShowWeek}
            className="text-xs font-semibold text-primary active:opacity-70"
          >
            {t('calendar.showWeek')}
          </button>
        )}
      </div>
    );
  }

  return (
    <DayTimeline shifts={day} activeBookingIds={activeBookingIds} date={date} />
  );
};

export default MobileDayView;
