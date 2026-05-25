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
 *
 * ⚠️ SEPARATIONSVARNING (se .lovable/large-project-calendar-audit.md)
 * --------------------------------------------------------------------------
 * Denna komponent ÅTERANVÄNDER personalkalenderns write-handlers och
 * skriver därför fortfarande till:
 *   • calendar_events            (via CustomCalendar/useEventDragDrop)
 *   • staff_assignments          (via useUnifiedStaffOperations.handleStaffDrop)
 *   • booking_staff_assignments  (via warehouseAssignmentsSync + RPC)
 *   • large_project_team_assignments (via largeProjectPlannerService)
 *
 * Det är OK för det "normala" project-perspektivet i dag, men för intern
 * bokningsplanering i STORA projekt måste man använda den nya isolerade
 * komponenten:
 *     src/components/project/large-planner/LargeProjectBookingPlannerCalendar.tsx
 *
 * Lägg INTE till nya intern-plan-features här. Bygg dem i den isolerade
 * komponenten istället.
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
import { useProjectTaskCalendarEvents } from '@/hooks/useProjectTaskCalendarEvents';
import type { Resource } from '@/components/Calendar/ResourceData';
import './ProjectCalendarView.css';

interface Props {
  projectId: string | null | undefined;
  bookingId?: string | null;
  isLargeProject?: boolean;
}

const TASK_RESOURCE: Resource = { id: 'team-tasks', title: 'Aktiviteter', eventColor: '#A78BFA' };
// Projektkalendern visar default 5 team + Aktiviteter. Övriga team läggs till
// via "+"-knappen i dagheadern (TeamVisibilityControl). Endast team-tasks är
// "required" så Aktiviteter-kolumnen alltid finns för task-dragg.
const PROJECT_REQUIRED_TEAMS = ['team-tasks'];
const DEFAULT_VISIBLE_TEAM_COUNT = 5;

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

  // Lägg till en fast Aktiviteter-kolumn i resurslistan.
  const teamResourcesWithTasks = useMemo(() => {
    if (teamResources.some((r) => r.id === TASK_RESOURCE.id)) return teamResources;
    return [...teamResources, TASK_RESOURCE];
  }, [teamResources]);

  // Hämta projektets establishment_tasks och mappa till CalendarEvent.
  const {
    events: taskEvents,
    refetch: refetchTasks,
  } = useProjectTaskCalendarEvents({
    bookingId: isLargeProject ? null : bookingId ?? null,
    largeProjectId: isLargeProject ? projectId : null,
    isLargeProject,
  });

  // Anchor-datum = första projektdagen (för staff ops + tom-state).
  const anchorDate = projectDays[0] || new Date();
  // ⚠️ LÄCKAGE: useUnifiedStaffOperations exponerar write-paths mot
  // staff_assignments + booking_staff_assignments. Får INTE användas i den
  // nya isolerade LargeProjectBookingPlannerCalendar — där ska personal
  // bara läsas, aldrig skrivas. Se .lovable/large-project-calendar-audit.md.
  const staffOps = useUnifiedStaffOperations(anchorDate, 'weekly', 'Montage');

  // 4. Filtrera events till projektets bookings + lägg på taskEvents.
  const filteredEvents = useMemo(() => {
    const bookingEvents =
      projectBookingIds.size === 0
        ? []
        : allEvents.filter((e: any) => {
            const bid = e.bookingId || e.booking_id || e.extendedProps?.bookingId;
            return bid && projectBookingIds.has(bid);
          });
    return [...bookingEvents, ...taskEvents];
  }, [allEvents, projectBookingIds, taskEvents]);

  // Aktivitetsdagar — säkerställer att projektkalendern visar dagar där
  // bara aktiviteter finns (inga calendar_events).
  const taskDayKeys = useMemo(() => {
    const set = new Set<string>();
    taskEvents.forEach((e) => {
      const d = (e.start as string).slice(0, 10);
      if (d) set.add(d);
    });
    return set;
  }, [taskEvents]);

  // Slå ihop projektets calendar_event-dagar med aktivitetsdagar (för fall
  // där en aktivitet ligger på en dag utan rig/event/rigDown).
  const effectiveDays = useMemo(() => {
    const phaseKeys = new Set(projectDays.map((d) => format(d, 'yyyy-MM-dd')));
    const merged = new Set<string>([...phaseKeys, ...taskDayKeys]);
    return Array.from(merged).sort().map((s) => parseISO(s));
  }, [projectDays, taskDayKeys]);

  // 5. Synliga team per dag — default = första 5 vanliga team + Aktiviteter.
  // Användaren lägger till fler via "+" i dagheadern (TeamVisibilityControl).
  const defaultVisibleTeams = useMemo(() => {
    const ordered = teamResourcesWithTasks
      .filter((r) => r?.id && r.id !== 'team-11' && r.id !== TASK_RESOURCE.id)
      .map((r) => r.id);
    // Föredra team-1..team-5 om de finns, annars första fem i listan.
    const preferred = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5'];
    const picked: string[] = [];
    for (const id of preferred) {
      if (ordered.includes(id) && picked.length < DEFAULT_VISIBLE_TEAM_COUNT) picked.push(id);
    }
    for (const id of ordered) {
      if (picked.length >= DEFAULT_VISIBLE_TEAM_COUNT) break;
      if (!picked.includes(id)) picked.push(id);
    }
    return [...picked, ...PROJECT_REQUIRED_TEAMS];
  }, [teamResourcesWithTasks]);

  const [visibleTeamsByDay, setVisibleTeamsByDay] = useState<{ [key: string]: string[] }>({});
  const getVisibleTeamsForDay = (date: Date): string[] => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const stored = visibleTeamsByDay[dateKey];
    if (!stored) return defaultVisibleTeams;
    // Användarens val styr. Endast required-listan (team-tasks) tvingas alltid in.
    const merged = new Set<string>(stored.filter((id) => id !== 'team-11'));
    for (const id of PROJECT_REQUIRED_TEAMS) merged.add(id);
    return Array.from(merged);
  };
  const handleToggleTeamForDay = (teamId: string, date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    setVisibleTeamsByDay((prev) => {
      const current = prev[dateKey] || defaultVisibleTeams;
      if (current.includes(teamId)) {
        if (PROJECT_REQUIRED_TEAMS.includes(teamId)) return prev;
        return { ...prev, [dateKey]: current.filter((id) => id !== teamId) };
      }
      return { ...prev, [dateKey]: [...current, teamId] };
    });
  };

  const handleStaffSelectionStub = () => {
    // Personal hanteras i personalkalendern; här är staff read-only display
  };

  const handleRefresh = async () => {
    await Promise.all([refreshEvents(), refetchProject(), refetchTasks()]);
  };

  if (!projectId) return null;

  return (
    <Card className="border-border/60 overflow-hidden rounded-none">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CalIcon className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Projektkalender</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {effectiveDays.length > 0
              ? `${effectiveDays.length} ${effectiveDays.length === 1 ? 'dag' : 'dagar'}`
              : 'Inga planerade dagar'}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        <div className="project-calendar-shell calendar-zoom-out">
          <div style={{ minHeight: '1020px', height: 'calc(100vh - 260px)' }}>
            {effectiveDays.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground italic">
                Projektet saknar planerade dagar
              </div>
            ) : (
              <CustomCalendar
                events={filteredEvents}
                setEvents={setEvents}
                resources={teamResourcesWithTasks}
                isLoading={isLoading}
                isMounted={isMounted}
                currentDate={anchorDate}
                onDateSet={handleDatesSet}
                refreshEvents={handleRefresh}
                // ⚠️ Dessa två props kopplar in personalkalenderns
                // skrivvägar (staff_assignments + calendar_events drag).
                // LargeProjectBookingPlannerCalendar ska ALDRIG skicka in
                // dessa — där ska personal vara read-only och drag använda
                // egna lokala handlers mot den interna plan-storen.
                onStaffDrop={staffOps.handleStaffDrop}
                onOpenStaffSelection={handleStaffSelectionStub}
                viewMode="weekly"
                weeklyStaffOperations={staffOps}
                getVisibleTeamsForDay={getVisibleTeamsForDay}
                onToggleTeamForDay={handleToggleTeamForDay}
                allTeams={teamResourcesWithTasks}
                isEventReadOnly={() => false}
                daysOverride={effectiveDays}
                getDayCardClassName={getDayCardClassName}
                timeGridFullWidth
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProjectCalendarView;
