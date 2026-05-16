import React, { useCallback, useMemo } from 'react';
import { parseISO } from 'date-fns';
import { TooltipProvider } from '@/components/ui/tooltip';
import CustomCalendar from '@/components/Calendar/CustomCalendar';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useInternalLagerCalendarEvents } from '@/hooks/useInternalLagerCalendarEvents';

interface Props {
  /** ISO yyyy-MM-dd för den dag som ska visas */
  date: string;
}

/**
 * Embeddar den RIKTIGA personalkalendern (CustomCalendar) i day-vy.
 * Read-only — identisk look & data som /personalkalendern, fast för en dag.
 * Inga separata mini-kalendrar.
 */
export const PlacementDayCalendar: React.FC<Props> = ({ date }) => {
  const targetDate = useMemo(() => {
    try { return parseISO(date); } catch { return new Date(); }
  }, [date]);

  const { events, isLoading, isMounted, refreshEvents } = useRealTimeCalendarEvents();
  const { teamResources } = useTeamResources();
  const { internalLagerEvents } = useInternalLagerCalendarEvents(targetDate, 'weekly');

  const mergedEvents = useMemo(() => {
    const filtered = events.filter((e: any) => e.resourceId !== 'transport');
    return [...filtered, ...internalLagerEvents];
  }, [events, internalLagerEvents]);

  const isEventReadOnly = useCallback(() => true, []);
  const handleDateSet = useCallback(() => { /* no-op */ }, []);

  return (
    <TooltipProvider>
      <div className="rounded-lg border border-border/60 bg-card overflow-hidden w-full">
        <CustomCalendar
          events={mergedEvents}
          resources={teamResources}
          isLoading={isLoading}
          isMounted={isMounted}
          currentDate={targetDate}
          daysOverride={[targetDate]}
          onDateSet={handleDateSet}
          refreshEvents={refreshEvents}
          viewMode="weekly"
          isEventReadOnly={isEventReadOnly}
          timeGridFullWidth
        />
      </div>
    </TooltipProvider>
  );
};

export default PlacementDayCalendar;
