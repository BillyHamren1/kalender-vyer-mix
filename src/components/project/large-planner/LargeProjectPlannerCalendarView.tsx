/**
 * LargeProjectPlannerCalendarView
 * --------------------------------------------------------------------------
 * Visuellt: samma TimeGrid/dagkort/horisontella veckogrid som personalkalendern
 * (CustomCalendar weekly). Premium UI med lila planning-tema.
 *
 * Datalager: STRIKT ISOLERAT.
 *  - Kolumner per dag = projektets TEAM (teamsByDay[date]) + "Ej tilldelat".
 *    Identiskt med personalkalenderns kolumnindelning.
 *  - Teamets personer visas read-only som badges under team-headern
 *    (via TimeGrid weeklyStaffOperations + plannerMode read-only).
 *  - Events = large_project_booking_plan_items via LargeProjectPlannerCalendarAdapter.
 *  - Drag/drop på items går genom updateItem (→ large_project_booking_plan_items).
 *    Sätter assigned_team_id på dropmål. Skriver ALDRIG till staff_assignments.
 *  - Använder ALDRIG:
 *      • CustomCalendar (för att slippa useEventDragDrop + setEvents-vägen)
 *      • useUnifiedStaffOperations / useRealTimeCalendarEvents
 *  - Skriver ALDRIG till calendar_events / staff_assignments /
 *    booking_staff_assignments / large_project_team_assignments / bookings.
 */
import { useCallback, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { Loader2, CalendarOff } from 'lucide-react';

import TimeGrid from '@/components/Calendar/TimeGrid';
import { EditControllerProvider } from '@/contexts/EditControllerContext';
import { ConsolidationMenuDisabledProvider } from '@/contexts/ConsolidationMenuContext';
import { DRAG_DATA_TYPE, type DraggedEventData } from '@/hooks/useEventDragDrop';
import { useTeamVehiclesPrefetch } from '@/hooks/useTeamVehiclesForDay';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';

import {
  buildPlannerResourcesForDay,
  mapPlannerItemsToCalendarEvents,
  plannerItemIdFromEventId,
} from './LargeProjectPlannerCalendarAdapter';
import type { useLargeProjectPlannerItems } from './useLargeProjectPlannerItems';

import '@/components/project/ProjectCalendarView.css';
import './LargeProjectPlannerCalendarView.css';

type PlannerCtx = ReturnType<typeof useLargeProjectPlannerItems>;

interface Props {
  largeProjectId: string;
  ctx: PlannerCtx;
  projectName?: string | null;
  projectNumber?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
}

const PHASE_CLASS: Record<string, string> = {
  rig: 'project-phase-rig',
  event: 'project-phase-event',
  rigDown: 'project-phase-rigDown',
};

const LargeProjectPlannerCalendarView = ({
  largeProjectId,
  ctx,
  projectName,
  projectNumber,
  onEventClick,
}: Props) => {
  const {
    isLoading,
    error,
    bookings,
    days,
    teamsByDay,
    itemsWithAssignmentValidity,
    updateItem,
  } = ctx;

  // Batch-prefetch team-fordon för alla synliga dagar (1 query, 1 realtime-kanal).
  useTeamVehiclesPrefetch(useMemo(() => days.map((d) => d.date), [days]));



  const bookingDisplayById = useMemo(() => {
    const map = new Map<string, { booking_number: string | null; client: string | null }>();
    bookings.forEach((b) =>
      map.set(b.id, { booking_number: b.booking_number, client: b.client }),
    );
    return map;
  }, [bookings]);

  const events = useMemo(
    () =>
      mapPlannerItemsToCalendarEvents(itemsWithAssignmentValidity, {
        largeProjectId,
        projectName,
        projectNumber,
        bookingDisplayById,
      }),
    [
      itemsWithAssignmentValidity,
      largeProjectId,
      projectName,
      projectNumber,
      bookingDisplayById,
    ],
  );

  // Bygg event-index per (date|resourceId) för O(1)-lookup i TimeGrid.
  const eventsByDayResource = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((e) => {
      const date = (e.start as string).slice(0, 10);
      const key = `${date}|${e.resourceId}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    });
    return map;
  }, [events]);

  const getEventsForDayAndResource = useCallback(
    (date: Date, resourceId: string): CalendarEvent[] => {
      const k = `${format(date, 'yyyy-MM-dd')}|${resourceId}`;
      return eventsByDayResource.get(k) ?? [];
    },
    [eventsByDayResource],
  );

  /**
   * Read-only staff-badges per team-kolumn. Speglar personalkalenderns
   * "Team 1 → personer"-rad men SKRIVS aldrig (TimeGrid plannerMode hindrar
   * + och remove).
   */
  const getStaffForTeamAndDate = useCallback(
    (teamId: string, date: Date) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const teamsForDay = teamsByDay[dateStr] ?? [];
      const team = teamsForDay.find((t) => t.teamId === teamId);
      if (!team) return [];
      return team.staff.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color ?? undefined,
      }));
    },
    [teamsByDay],
  );

  const weeklyStaffOperations = useMemo(
    () => ({ getStaffForTeamAndDate }),
    [getStaffForTeamAndDate],
  );

  /**
   * Drop-hantering — kallas av TimeGrid per cell när ett event släpps.
   * Skriver ENDAST till large_project_booking_plan_items via updateItem.
   * Sätter assigned_team_id. Skriver ALDRIG till calendar_events/staff_assignments.
   */
  const handlePlannerEventDrop = useCallback(
    async (e: React.DragEvent, targetDateStr: string, targetResourceId?: string) => {
      if (!targetResourceId) return;
      let payload: DraggedEventData | null = null;
      try {
        const raw = e.dataTransfer.getData(DRAG_DATA_TYPE);
        if (!raw) return;
        payload = JSON.parse(raw) as DraggedEventData;
      } catch {
        return;
      }
      const plannerItemId = plannerItemIdFromEventId(payload.id);
      if (!plannerItemId) return; // inte ett planner-item — ignorera

      const nextTeamId = targetResourceId;

      try {
        await updateItem(plannerItemId, {
          plan_date: targetDateStr,
          assigned_team_id: nextTeamId,
          // Vid byte av team töms specifik person-tilldelning;
          // den kan sättas igen via QuickEdit/ManualDialog inom teamet.
          assigned_staff_id: null,
          status: 'planned',
        });
      } catch (err) {
        toast.error((err as Error).message || 'Kunde inte flytta task.');
      }
    },
    [updateItem],
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Laddar projektplan…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center py-10 text-sm text-destructive">
        {error.message}
      </div>
    );
  }
  if (days.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
        <CalendarOff className="h-6 w-6 text-muted-foreground" />
        Inga projektdagar att planera ännu. Lägg till projektdagar i personalkalendern först.
      </div>
    );
  }

  return (
    <EditControllerProvider>
      <ConsolidationMenuDisabledProvider disabled>
        <div className="project-calendar-shell large-planner-calendar-shell">
          <div className="custom-calendar-container weekly-view">
            <div className="weekly-horizontal-grid project-weekly-horizontal-grid">
              {days.map((day) => {
                const date = parseISO(day.date);
                const dayTeams = teamsByDay[day.date] ?? [];
                const resources = buildPlannerResourcesForDay(dayTeams);
                const phaseCls = day.phase ? PHASE_CLASS[day.phase] ?? '' : 'project-phase-none';
                const isToday = day.date === format(new Date(), 'yyyy-MM-dd');
                const headerLabel = format(date, 'EEE d MMM', { locale: sv });
                return (
                  <div
                    key={day.date}
                    className={`weekly-day-card project-weekly-day-card ${phaseCls} ${isToday ? 'is-today' : ''}`}
                    title={headerLabel}
                  >
                    <TimeGrid
                      day={date}
                      resources={resources}
                      events={events}
                      getEventsForDayAndResource={getEventsForDayAndResource}
                      onEventDrop={handlePlannerEventDrop}
                      onEventClick={onEventClick}
                      weeklyStaffOperations={weeklyStaffOperations}
                      fullWidth
                      plannerMode
                      variant="default"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </ConsolidationMenuDisabledProvider>
    </EditControllerProvider>
  );
};

export default LargeProjectPlannerCalendarView;
