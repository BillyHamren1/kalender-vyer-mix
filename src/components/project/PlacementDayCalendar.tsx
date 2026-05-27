import React, { useCallback, useMemo } from 'react';
import { parseISO } from 'date-fns';
import { TooltipProvider } from '@/components/ui/tooltip';
import CustomCalendar from '@/components/Calendar/CustomCalendar';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useInternalLagerCalendarEvents } from '@/hooks/useInternalLagerCalendarEvents';
import './PlacementDayCalendar.css';

interface Props {
  /** ISO yyyy-MM-dd för den/de dag(ar) som ska visas */
  date?: string;
  dates?: string[];
}

/**
 * Embeddar den RIKTIGA personalkalendern (CustomCalendar) i day-vy.
 * Read-only — identisk look & data som /personalkalendern, fast för valda dagar.
 */
export const PlacementDayCalendar: React.FC<Props> = ({ date, dates }) => {
  const targetDates = useMemo(() => {
    const all = (dates && dates.length > 0 ? dates : date ? [date] : [])
      .filter((iso, i, arr) => arr.indexOf(iso) === i)
      .sort();
    const parsed = all
      .map((iso) => {
        try { return parseISO(iso); } catch { return null; }
      })
      .filter((d): d is Date => !!d && !isNaN(d.getTime()));
    return parsed.length > 0 ? parsed : [new Date()];
  }, [date, dates]);

  const currentDate = targetDates[0];

  const { events, isLoading, isMounted, refreshEvents } = useRealTimeCalendarEvents();
  const { teamResources } = useTeamResources();
  const { internalLagerEvents } = useInternalLagerCalendarEvents(currentDate, 'weekly');

  const mergedEvents = useMemo(() => {
    const filtered = events.filter((e: any) => e.resourceId !== 'transport');
    return [...filtered, ...internalLagerEvents];
  }, [events, internalLagerEvents]);

  const isEventReadOnly = useCallback(() => true, []);
  const handleDateSet = useCallback(() => { /* no-op */ }, []);

  return (
    <TooltipProvider>
      <div className="placement-day-calendar rounded-lg border border-border/60 bg-card overflow-hidden w-full h-full">
        <CustomCalendar
          events={mergedEvents}
          resources={teamResources}
          isLoading={isLoading}
          isMounted={isMounted}
          currentDate={currentDate}
          onDateSet={handleDateSet}
          refreshEvents={refreshEvents}
          viewMode="weekly"
          isEventReadOnly={isEventReadOnly}
          timeGridFullWidth={false}
        />
      </div>
    </TooltipProvider>
  );
};

export default PlacementDayCalendar;
