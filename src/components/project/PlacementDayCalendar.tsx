import React, { useCallback, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { TooltipProvider } from '@/components/ui/tooltip';
import CustomCalendar from '@/components/Calendar/CustomCalendar';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useInternalLagerCalendarEvents } from '@/hooks/useInternalLagerCalendarEvents';
import { useUnifiedStaffOperations } from '@/hooks/useUnifiedStaffOperations';
import './PlacementDayCalendar.css';

interface Props {
  /** ISO yyyy-MM-dd för den/de dag(ar) som ska visas */
  date?: string;
  dates?: string[];
}

const DEFAULT_VISIBLE_TEAM_COUNT = 5;

/**
 * Embeddar den RIKTIGA planeringskalendern (samma som /calendar) i en
 * dialog/sidopanel. Visar endast valda dagar (daysOverride), med:
 *  - lila tema (theme-purple)
 *  - team-kolumner + personalrader (samma som personalkalendern)
 *  - lager-kolumn
 *  - alla events (inte filtrerade på projekt)
 *
 * Read-only: ingen drag/drop, ingen personal-tilldelning.
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

  const anchorDate = targetDates[0];

  const { events, isLoading, isMounted, refreshEvents } = useRealTimeCalendarEvents();
  const { teamResources } = useTeamResources();
  const { internalLagerEvents } = useInternalLagerCalendarEvents(anchorDate, 'weekly');

  // Read-only staffOps — vi använder hooken bara för att visa personalrader.
  // handleStaffDrop kommer inte triggas eftersom vi inte sätter onStaffDrop.
  const staffOps = useUnifiedStaffOperations(anchorDate, 'weekly', 'Montage');

  const mergedEvents = useMemo(() => {
    const filtered = events.filter((e: any) => e.resourceId !== 'transport');
    return [...filtered, ...internalLagerEvents];
  }, [events, internalLagerEvents]);

  // Default visible teams: team-1..team-5 om de finns, annars första fem.
  const defaultVisibleTeams = useMemo(() => {
    const ordered = teamResources
      .filter((r) => r?.id && r.id !== 'team-11')
      .map((r) => r.id);
    const preferred = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5'];
    const picked: string[] = [];
    for (const id of preferred) {
      if (ordered.includes(id) && picked.length < DEFAULT_VISIBLE_TEAM_COUNT) picked.push(id);
    }
    for (const id of ordered) {
      if (picked.length >= DEFAULT_VISIBLE_TEAM_COUNT) break;
      if (!picked.includes(id)) picked.push(id);
    }
    // Lägg alltid till lager-kolumnen sist (transport-resursen renderar Lager).
    if (ordered.includes('transport') && !picked.includes('transport')) picked.push('transport');
    return picked;
  }, [teamResources]);

  const [visibleTeamsByDay, setVisibleTeamsByDay] = useState<{ [key: string]: string[] }>({});
  const getVisibleTeamsForDay = useCallback((d: Date): string[] => {
    const key = format(d, 'yyyy-MM-dd');
    return visibleTeamsByDay[key] ?? defaultVisibleTeams;
  }, [visibleTeamsByDay, defaultVisibleTeams]);

  const handleToggleTeamForDay = useCallback((teamId: string, d: Date) => {
    const key = format(d, 'yyyy-MM-dd');
    setVisibleTeamsByDay((prev) => {
      const current = prev[key] || defaultVisibleTeams;
      if (current.includes(teamId)) {
        return { ...prev, [key]: current.filter((id) => id !== teamId) };
      }
      return { ...prev, [key]: [...current, teamId] };
    });
  }, [defaultVisibleTeams]);

  const isEventReadOnly = useCallback(() => true, []);
  const handleDateSet = useCallback(() => { /* no-op */ }, []);

  return (
    <TooltipProvider>
      <div className="theme-purple placement-day-calendar rounded-lg border border-border/60 bg-card overflow-hidden w-full h-full">
        <CustomCalendar
          events={mergedEvents}
          resources={teamResources}
          isLoading={isLoading}
          isMounted={isMounted}
          currentDate={anchorDate}
          onDateSet={handleDateSet}
          refreshEvents={refreshEvents}
          viewMode="weekly"
          weeklyStaffOperations={staffOps}
          getVisibleTeamsForDay={getVisibleTeamsForDay}
          onToggleTeamForDay={handleToggleTeamForDay}
          allTeams={teamResources}
          daysOverride={targetDates}
          isEventReadOnly={isEventReadOnly}
          timeGridFullWidth
        />
      </div>
    </TooltipProvider>
  );
};

export default PlacementDayCalendar;
