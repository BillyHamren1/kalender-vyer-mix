import { useMemo } from 'react';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Calendar as CalIcon } from 'lucide-react';
import CustomCalendar from '@/components/Calendar/CustomCalendar';
import type { CalendarEvent, Resource } from '@/components/Calendar/ResourceData';
import { fetchTeamResources } from '@/services/teamService';
import { useProjectGanttEvents, type GanttPhase } from '@/hooks/useProjectGanttEvents';
import { useProjectStaffByDay } from '@/hooks/useProjectStaffByDay';
import { convertToISO8601, normalizePlannerEventType } from '@/utils/dateUtils';
import './ProjectCalendarView.css';

interface Props {
  projectId: string | null | undefined;
  bookingId?: string | null;
  isLargeProject?: boolean;
}

interface DayBucket {
  date: string;
  phases: Set<GanttPhase>;
}

const FALLBACK_RESOURCE_COLOR = '#BFDBFE';

const fallbackTeamTitle = (resourceId: string) => {
  if (resourceId === 'transport') return 'Transport';
  if (resourceId.startsWith('team-')) return `Team ${resourceId.replace('team-', '')}`;
  if (resourceId.startsWith('lager-')) return `Lager ${resourceId.replace('lager-', '')}`;
  return resourceId;
};

const getPrimaryPhase = (phases: Set<GanttPhase>): GanttPhase | null => {
  const list = Array.from(phases);
  if (list.includes('event')) return 'event';
  if (list.includes('rig')) return 'rig';
  if (list.includes('rigDown')) return 'rigDown';
  return null;
};

const ProjectCalendarView = ({ projectId, bookingId, isLargeProject }: Props) => {
  const { events, isLoading, refetch } = useProjectGanttEvents({ projectId, bookingId, isLargeProject });
  const { data: teamResources = [] } = useQuery({
    queryKey: ['project-calendar-team-resources'],
    queryFn: fetchTeamResources,
  });

  const { days, phaseByDay } = useMemo(() => {
    const dates = events.map((e) => e.source_date).filter(Boolean).sort();
    if (dates.length === 0) {
      return { days: [] as Date[], phaseByDay: new Map<string, DayBucket>() };
    }

    const start = parseISO(dates[0]);
    const end = parseISO(dates[dates.length - 1]);
    const total = differenceInCalendarDays(end, start) + 1;
    const dayList = Array.from({ length: Math.max(total, 1) }, (_, i) => addDays(start, i));

    const phaseMap = new Map<string, DayBucket>();
    dayList.forEach((day) => {
      const key = format(day, 'yyyy-MM-dd');
      phaseMap.set(key, { date: key, phases: new Set() });
    });

    events.forEach((event) => {
      const bucket = phaseMap.get(event.source_date);
      if (!bucket) return;
      bucket.phases.add(event.event_type);
    });

    return { days: dayList, phaseByDay: phaseMap };
  }, [events]);

  const dateKeys = useMemo(() => days.map((day) => format(day, 'yyyy-MM-dd')), [days]);
  const { getStaffForTeamAndDate } = useProjectStaffByDay(dateKeys);

  const resources = useMemo<Resource[]>(() => {
    const usedIds = Array.from(new Set(events.map((event) => event.resource_id).filter(Boolean))) as string[];
    if (usedIds.length === 0) return [];

    const known = new Map(teamResources.map((resource) => [resource.id, resource]));
    const all = usedIds.map((resourceId) => {
      const existing = known.get(resourceId);
      if (existing) return existing;
      return {
        id: resourceId,
        title: fallbackTeamTitle(resourceId),
        eventColor: FALLBACK_RESOURCE_COLOR,
      } satisfies Resource;
    });

    return all.sort((a, b) => a.title.localeCompare(b.title, 'sv', { numeric: true }));
  }, [events, teamResources]);

  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    return events
      .filter((event) => !!event.resource_id)
      .map((event) => ({
        id: event.id,
        title: event.title || event.booking_number || 'Bokning',
        start: convertToISO8601(event.start_time),
        end: convertToISO8601(event.end_time),
        resourceId: event.resource_id || 'unknown',
        bookingId: event.booking_id,
        bookingNumber: event.booking_number || undefined,
        booking_number: event.booking_number || undefined,
        deliveryAddress: event.delivery_address || undefined,
        eventType: normalizePlannerEventType(event.event_type),
        extendedProps: {
          bookingId: event.booking_id,
          booking_id: event.booking_id,
          bookingNumber: event.booking_number,
          deliveryCity: event.delivery_address,
          delivery_city: event.delivery_address,
          deliveryAddress: event.delivery_address,
          // Hide "Projekt" badge inside the project calendar itself — context is already obvious
          isLargeProject: false,
        },
      }));
  }, [events, isLargeProject]);

  if (!projectId) return null;

  return (
    <Card className="border-border/60 overflow-hidden rounded-none">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CalIcon className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Projektkalender</CardTitle>
          <Badge variant="outline" className="text-[10px]">Synk med personalkalender</Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-muted-foreground text-sm flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Laddar projektkalender…
          </div>
        ) : days.length === 0 ? (
          <div className="p-6 text-muted-foreground text-sm">
            Inga planerade dagar ännu. Lägg in tider i personalkalendern så dyker de upp här.
          </div>
        ) : (
          <div className="project-calendar-shell">
            <div style={{ minHeight: '1020px', height: 'calc(100vh - 260px)' }}>
              <CustomCalendar
                events={calendarEvents}
                resources={resources}
                isLoading={false}
                isMounted={true}
                currentDate={days[0] ?? new Date()}
                onDateSet={() => {}}
                refreshEvents={async () => {
                  await refetch();
                }}
                viewMode="weekly"
                daysOverride={days}
                timeGridFullWidth={true}
                getDayCardClassName={(day) => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const phase = getPrimaryPhase(phaseByDay.get(dateKey)?.phases ?? new Set());
                  return `project-weekly-day-card ${phase ? `project-phase-${phase}` : 'project-phase-none'}`;
                }}
                weeklyStaffOperations={{
                  getStaffForTeamAndDate: (teamId: string, targetDate: Date) =>
                    getStaffForTeamAndDate(teamId, targetDate).map((staff) => ({
                      id: staff.staffId,
                      name: staff.name,
                    })),
                  forceRefresh: () => {
                    void refetch();
                  },
                }}
                isEventReadOnly={() => false}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProjectCalendarView;
