import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import DayTimeline from '@/components/mobile-app/DayTimeline';
import type { ScheduledShift } from '@/services/mobileApiService';
import { useLanguage } from '@/i18n/LanguageContext';
import { useShiftsByDate } from '@/hooks/useBookingsByDate';
import { cn } from '@/lib/utils';

interface Props {
  date: Date;
  shifts: ScheduledShift[];
  activeBookingIds: Set<string>;
  onShowWeek?: () => void;
}

const DENSITY_KEY = 'mobile.dayDensity';
type Density = 'compact' | 'detailed';

const MobileDayView = ({ date, shifts, activeBookingIds, onShowWeek }: Props) => {
  const { t } = useLanguage();
  const grouped = useShiftsByDate(shifts);
  const day = grouped.getForDate(date);

  const [density, setDensity] = useState<Density>(() => {
    const stored = localStorage.getItem(DENSITY_KEY);
    return stored === 'detailed' ? 'detailed' : 'compact';
  });
  useEffect(() => { localStorage.setItem(DENSITY_KEY, density); }, [density]);

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
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="inline-flex rounded-full bg-primary-soft/60 ring-1 ring-primary/10 p-0.5 text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setDensity('compact')}
            className={cn(
              'px-3 py-1 rounded-full transition-all',
              density === 'compact'
                ? 'bg-card text-primary shadow-[0_1px_3px_hsl(184_60%_22%/0.15)]'
                : 'text-muted-foreground',
            )}
          >
            Hel dag
          </button>
          <button
            type="button"
            onClick={() => setDensity('detailed')}
            className={cn(
              'px-3 py-1 rounded-full transition-all',
              density === 'detailed'
                ? 'bg-card text-primary shadow-[0_1px_3px_hsl(184_60%_22%/0.15)]'
                : 'text-muted-foreground',
            )}
          >
            Detalj
          </button>
        </div>
      </div>
      <DayTimeline shifts={day} activeBookingIds={activeBookingIds} date={date} density={density} />
    </div>
  );
};

export default MobileDayView;
