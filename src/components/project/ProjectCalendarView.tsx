/**
 * ProjectCalendarView
 * --------------------------------------------------------------------------
 * Tunn wrapper kring EXAKT samma kalender-rigg som personalkalendern
 * (CustomCalendarPage). Skillnaden är bara:
 *  - lila tema (theme-purple sätts av ProjectLayout)
 *  - events filtreras till projektets bookings
 *  - kalendern visar BARA projektets faktiska dagar (rig/event/rigdown),
 *    sida vid sida, horisontellt scrollbart — via daysOverride-propen.
 *
 * All annan logik (team-kolumner, staff per dag, drag/drop, +-knappen,
 * dag-expansion) ärvs oförändrad från CustomCalendar.
 */
import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as CalIcon, RefreshCw } from 'lucide-react';

import CustomCalendar from '@/components/Calendar/CustomCalendar';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useUnifiedStaffOperations } from '@/hooks/useUnifiedStaffOperations';
import { useProjectCalendarDays } from '@/hooks/useProjectCalendarDays';
import './ProjectCalendarView.css';

interface Props {
  projectId: string | null | undefined;
  bookingId?: string | null;
  isLargeProject?: boolean;
}

const DEFAULT_TEAMS = ['team-1', 'team-2', 'team-3', 'team-4', 'transport'];

const ProjectCalendarView = ({ projectId, bookingId, isLargeProject }: Props) => {
  // 1. Hämta projektets events.
  const { events: projectEvents, refetch: refetchProject } = useProjectCalendarDays({
    projectId,
    bookingId,
    isLargeProject,
  });

  const projectBookingIds = useMemo(
    () => new Set(projectEvents.map((e) => e.booking_id).filter(Boolean) as string[]),
    [projectEvents],
  );

  // 2. Lista över projektets unika dagar (sorterade) + fas per dag.
  // Prioritet om flera fas-typer på samma dag: rig > rigDown > event.
  const { projectDays, phaseByDay } = useMemo(() => {
    const phaseMap = new Map<string, 'rig' | 'event' | 'rigDown'>();
    const prio = { rig: 3, rigDown: 2, event: 1 } as const;
    projectEvents.forEach((e) => {
      if (!e.source_date || !e.event_type) return;
      const current = phaseMap.get(e.source_date);
      if (!current || prio[e.event_type] > prio[current]) {
        phaseMap.set(e.source_date, e.event_type);
      }
    });
    const days = Array.from(phaseMap.keys()).sort().map((s) => parseISO(s));
    return { projectDays: days, phaseByDay: phaseMap };
  }, [projectEvents]);

  const getDayCardClassName = (date: Date): string => {
    const key = format(date, 'yyyy-MM-dd');
    const phase = phaseByDay.get(key);
    return `project-weekly-day-card project-phase-${phase ?? 'none'}`;
  };

  // 3. Samma hooks som personalkalendern.
  const {
    events: allEvents,
    setEvents,
    isLoading,
    isMounted,
    handleDatesSet,
    refreshEvents,
  } = useRealTimeCalendarEvents();

  const { teamResources } = useTeamResources();

  // Anchor-datum = första projektdagen (för staff ops + tom-state).
  const anchorDate = projectDays[0] || new Date();
  const staffOps = useUnifiedStaffOperations(anchorDate, 'weekly', 'Montage');

  // 4. Filtrera events till projektets bookings.
  const filteredEvents = useMemo(() => {
    if (projectBookingIds.size === 0) return [];
    return allEvents.filter((e: any) => {
      const bid = e.bookingId || e.booking_id || e.extendedProps?.bookingId;
      return bid && projectBookingIds.has(bid);
    });
  }, [allEvents, projectBookingIds]);

  // 5. Synliga team per dag — samma default som personalkalendern.
  const [visibleTeamsByDay, setVisibleTeamsByDay] = useState<{ [key: string]: string[] }>({});
  const getVisibleTeamsForDay = (date: Date): string[] => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return visibleTeamsByDay[dateKey] || DEFAULT_TEAMS;
  };
  const handleToggleTeamForDay = (teamId: string, date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    setVisibleTeamsByDay((prev) => {
      const current = prev[dateKey] || DEFAULT_TEAMS;
      if (current.includes(teamId)) {
        if (DEFAULT_TEAMS.includes(teamId)) return prev;
        return { ...prev, [dateKey]: current.filter((id) => id !== teamId) };
      }
      return { ...prev, [dateKey]: [...current, teamId] };
    });
  };

  const handleStaffSelectionStub = () => {
    // Personal hanteras i personalkalendern; här är staff read-only display
  };

  const handleRefresh = async () => {
    await Promise.all([refreshEvents(), refetchProject()]);
  };

  if (!projectId) return null;

  return (
    <Card className="border-border/60 overflow-hidden rounded-none">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CalIcon className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Projektkalender</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {projectDays.length > 0
              ? `${projectDays.length} ${projectDays.length === 1 ? 'dag' : 'dagar'}`
              : 'Inga planerade dagar'}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        <div className="project-calendar-shell">
          <div style={{ minHeight: '1020px', height: 'calc(100vh - 260px)' }}>
            {projectDays.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground italic">
                Projektet saknar planerade dagar
              </div>
            ) : (
              <CustomCalendar
                events={filteredEvents}
                setEvents={setEvents}
                resources={teamResources}
                isLoading={isLoading}
                isMounted={isMounted}
                currentDate={anchorDate}
                onDateSet={handleDatesSet}
                refreshEvents={handleRefresh}
                onStaffDrop={staffOps.handleStaffDrop}
                onOpenStaffSelection={handleStaffSelectionStub}
                viewMode="weekly"
                weeklyStaffOperations={staffOps}
                getVisibleTeamsForDay={getVisibleTeamsForDay}
                onToggleTeamForDay={handleToggleTeamForDay}
                allTeams={teamResources}
                isEventReadOnly={() => false}
                daysOverride={projectDays}
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProjectCalendarView;
