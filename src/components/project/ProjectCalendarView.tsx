/**
 * ProjectCalendarView
 * --------------------------------------------------------------------------
 * Tunn wrapper kring EXAKT samma kalender-rigg som personalkalendern
 * (CustomCalendarPage). Skillnaden är bara:
 *  - lila tema (theme-purple sätts av ProjectLayout)
 *  - events filtreras till projektets bookings (medium-projekt eller stor-projekt)
 *  - navigationen visar BARA projektets faktiska dagar (rig/event/rigdown)
 *
 * All annan logik (team-kolumner, staff per dag, drag/drop, +-knappen,
 * dag-expansion) ärvs oförändrad från CustomCalendar via samma hooks.
 */
import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as CalIcon, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

import CustomCalendar from '@/components/Calendar/CustomCalendar';
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
  // 1. Hämta projektets events.
  const { events: projectEvents, refetch: refetchProject } = useProjectGanttEvents({
    projectId,
    bookingId,
    isLargeProject,
  });

  const projectBookingIds = useMemo(
    () => new Set(projectEvents.map((e) => e.booking_id).filter(Boolean) as string[]),
    [projectEvents],
  );

  // 2. Lista över projektets unika dagar (sorterade), härlett från events.
  const projectDays = useMemo<Date[]>(() => {
    const set = new Set<string>();
    projectEvents.forEach((e) => {
      if (e.source_date) set.add(e.source_date);
    });
    return Array.from(set).sort().map((s) => parseISO(s));
  }, [projectEvents]);

  // 3. Vald dag = första projektdagen som default.
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  useEffect(() => {
    if (!selectedDate && projectDays.length > 0) {
      setSelectedDate(projectDays[0]);
    }
  }, [projectDays, selectedDate]);

  // 4. Samma hooks som personalkalendern.
  const {
    events: allEvents,
    setEvents,
    isLoading,
    isMounted,
    handleDatesSet,
    refreshEvents,
  } = useRealTimeCalendarEvents();

  const { teamResources } = useTeamResources();
  const staffOps = useUnifiedStaffOperations(selectedDate || new Date(), 'daily', 'Montage');

  // 5. Filtrera events: bara de som tillhör projektets bookings.
  const filteredEvents = useMemo(() => {
    if (projectBookingIds.size === 0) return [];
    return allEvents.filter((e: any) => {
      const bid = e.bookingId || e.booking_id || e.extendedProps?.bookingId;
      return bid && projectBookingIds.has(bid);
    });
  }, [allEvents, projectBookingIds]);

  // 6. Synliga team per dag — samma default som personalkalendern.
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

  // Etikett per projektdag (Rigg dag N / Event dag N / Demontering dag N)
  const dayLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    const phaseDays: Record<'rig' | 'event' | 'rigDown', string[]> = {
      rig: [],
      event: [],
      rigDown: [],
    };
    projectEvents.forEach((e) => {
      if (!e.source_date) return;
      const phase = (e as any).phase as 'rig' | 'event' | 'rigDown' | undefined;
      if (phase && !phaseDays[phase].includes(e.source_date)) {
        phaseDays[phase].push(e.source_date);
      }
    });
    (['rig', 'event', 'rigDown'] as const).forEach((p) => {
      phaseDays[p].sort();
      const phaseLabel = p === 'rig' ? 'Rigg' : p === 'event' ? 'Event' : 'Demontering';
      phaseDays[p].forEach((d, idx) => {
        labels[d] = phaseDays[p].length > 1 ? `${phaseLabel} dag ${idx + 1}` : phaseLabel;
      });
    });
    return labels;
  }, [projectEvents]);

  if (!projectId) return null;

  const selectedKey = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const selectedIdx = selectedDate
    ? projectDays.findIndex((d) => format(d, 'yyyy-MM-dd') === selectedKey)
    : -1;
  const goPrev = () => {
    if (selectedIdx > 0) setSelectedDate(projectDays[selectedIdx - 1]);
  };
  const goNext = () => {
    if (selectedIdx >= 0 && selectedIdx < projectDays.length - 1) {
      setSelectedDate(projectDays[selectedIdx + 1]);
    }
  };

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
        {/* Projekt-dag navigation: bara de dagar som tillhör projektet */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-border/40">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={goPrev}
            disabled={selectedIdx <= 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
            {projectDays.length === 0 && (
              <span className="text-xs text-muted-foreground italic px-2">
                Projektet saknar planerade dagar
              </span>
            )}
            {projectDays.map((d) => {
              const key = format(d, 'yyyy-MM-dd');
              const isActive = key === selectedKey;
              const label = dayLabels[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  className={cn(
                    'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                    isActive
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-card text-foreground border-border/50 hover:bg-accent hover:border-border',
                  )}
                >
                  <div className="flex flex-col items-start leading-tight">
                    <span className="capitalize">
                      {format(d, 'EEE d MMM', { locale: sv })}
                    </span>
                    {label && (
                      <span className={cn(
                        'text-[10px] font-normal',
                        isActive ? 'opacity-90' : 'text-muted-foreground',
                      )}>
                        {label}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={goNext}
            disabled={selectedIdx < 0 || selectedIdx >= projectDays.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="project-calendar-shell">
          <div style={{ minHeight: '1020px', height: 'calc(100vh - 320px)' }}>
            {selectedDate && (
              <CustomCalendar
                events={filteredEvents}
                setEvents={setEvents}
                resources={teamResources}
                isLoading={isLoading}
                isMounted={isMounted}
                currentDate={selectedDate}
                onDateSet={handleDatesSet}
                refreshEvents={handleRefresh}
                onStaffDrop={staffOps.handleStaffDrop}
                onOpenStaffSelection={handleStaffSelectionStub}
                viewMode="day"
                weeklyStaffOperations={staffOps}
                getVisibleTeamsForDay={getVisibleTeamsForDay}
                onToggleTeamForDay={handleToggleTeamForDay}
                allTeams={teamResources}
                isEventReadOnly={() => false}
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProjectCalendarView;
