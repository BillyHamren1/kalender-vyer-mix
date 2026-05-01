/**
 * ProjectCalendarView
 * --------------------------------------------------------------------------
 * Tunn wrapper kring EXAKT samma kalender-rigg som personalkalendern
 * (CustomCalendarPage). Skillnaden är bara:
 *  - lila tema (theme-purple sätts av ProjectLayout)
 *  - events filtreras till projektets bookings (medium-projekt eller stor-projekt)
 *
 * All annan logik (team-kolumner, staff per dag, drag/drop, +-knappen,
 * dag-expansion) ärvs oförändrad från CustomCalendar via samma hooks.
 */
import { useEffect, useMemo, useState } from 'react';
import { startOfWeek, startOfMonth, format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as CalIcon, RefreshCw } from 'lucide-react';

import CustomCalendar from '@/components/Calendar/CustomCalendar';
import WeekNavigation from '@/components/Calendar/WeekNavigation';
import WeekTabsNavigation from '@/components/Calendar/WeekTabsNavigation';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useUnifiedStaffOperations } from '@/hooks/useUnifiedStaffOperations';
import { useProjectGanttEvents } from '@/hooks/useProjectGanttEvents';
import './ProjectCalendarView.css';

interface Props {
  projectId: string | null | undefined;
  bookingId?: string | null;
  isLargeProject?: boolean;
}

const DEFAULT_TEAMS = ['team-1', 'team-2', 'team-3', 'team-4', 'transport'];

const ProjectCalendarView = ({ projectId, bookingId, isLargeProject }: Props) => {
  const [viewMode, setViewMode] = useState<'day' | 'weekly' | 'monthly'>('weekly');

  // 1. Hämta projektets events (för att veta vilka booking_ids som tillhör projektet
  //    och vilken vecka vi ska initialt visa).
  const { events: projectEvents, refetch: refetchProject } = useProjectGanttEvents({
    projectId,
    bookingId,
    isLargeProject,
  });

  const projectBookingIds = useMemo(
    () => new Set(projectEvents.map((e) => e.booking_id).filter(Boolean) as string[]),
    [projectEvents],
  );

  // 2. Initial vecka = veckan för projektets första event (annars idag).
  const initialWeekStart = useMemo(() => {
    const dates = projectEvents.map((e) => e.source_date).filter(Boolean).sort();
    const base = dates.length > 0 ? parseISO(dates[0]) : new Date();
    return startOfWeek(base, { weekStartsOn: 1 });
  }, [projectEvents]);

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(initialWeekStart);
  const [monthlyDate, setMonthlyDate] = useState<Date>(startOfMonth(initialWeekStart));

  // Synka vecka när projektet laddats första gången
  const [hasAlignedWeek, setHasAlignedWeek] = useState(false);
  useEffect(() => {
    if (!hasAlignedWeek && projectEvents.length > 0) {
      setCurrentWeekStart(initialWeekStart);
      setMonthlyDate(startOfMonth(initialWeekStart));
      setHasAlignedWeek(true);
    }
  }, [projectEvents.length, initialWeekStart, hasAlignedWeek]);

  // 3. Samma hooks som personalkalendern.
  const {
    events: allEvents,
    setEvents,
    isLoading,
    isMounted,
    currentDate: hookCurrentDate,
    handleDatesSet,
    refreshEvents,
  } = useRealTimeCalendarEvents();

  const { teamResources } = useTeamResources();
  const staffOps = useUnifiedStaffOperations(currentWeekStart, 'weekly', 'Montage');

  // 4. Filtrera events: bara de som tillhör projektets bookings.
  //    Detta är hela skillnaden mot personalkalendern.
  const filteredEvents = useMemo(() => {
    if (projectBookingIds.size === 0) return [];
    return allEvents.filter((e: any) => {
      const bid = e.bookingId || e.booking_id || e.extendedProps?.bookingId;
      return bid && projectBookingIds.has(bid);
    });
  }, [allEvents, projectBookingIds]);

  // 5. Synliga team per dag — samma default som personalkalendern (utan team-11/Live).
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

  const handleWeekSelect = (weekStart: Date) => setCurrentWeekStart(weekStart);
  const handleMonthChange = (date: Date) => {
    setMonthlyDate(startOfMonth(date));
    setCurrentWeekStart(startOfWeek(startOfMonth(date), { weekStartsOn: 1 }));
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
          <Badge variant="outline" className="text-[10px]">Synk med personalkalender</Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        <div className="px-4 pt-2">
          <WeekNavigation
            currentWeekStart={currentWeekStart}
            setCurrentWeekStart={setCurrentWeekStart}
            viewMode={viewMode}
            onViewModeChange={(v) => setViewMode(v as any)}
            currentMonth={monthlyDate}
            onMonthChange={handleMonthChange}
          />
        </div>

        <div className="project-calendar-shell">
          <div style={{ minHeight: '1020px', height: 'calc(100vh - 320px)' }}>
            <CustomCalendar
              events={filteredEvents}
              setEvents={setEvents}
              resources={teamResources}
              isLoading={isLoading}
              isMounted={isMounted}
              currentDate={currentWeekStart}
              onDateSet={handleDatesSet}
              refreshEvents={handleRefresh}
              onStaffDrop={staffOps.handleStaffDrop}
              onOpenStaffSelection={handleStaffSelectionStub}
              viewMode={viewMode}
              weeklyStaffOperations={staffOps}
              getVisibleTeamsForDay={getVisibleTeamsForDay}
              onToggleTeamForDay={handleToggleTeamForDay}
              allTeams={teamResources}
              isEventReadOnly={() => false}
            />
          </div>
          {viewMode !== 'day' && (
            <WeekTabsNavigation
              currentMonth={viewMode === 'monthly' ? monthlyDate : startOfMonth(currentWeekStart)}
              currentWeekStart={currentWeekStart}
              onWeekSelect={handleWeekSelect}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ProjectCalendarView;
