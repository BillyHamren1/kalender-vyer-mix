/**
 * LargeProjectPlannerCalendarView
 * --------------------------------------------------------------------------
 * Visuellt: samma TimeGrid/dagkort/horisontella veckogrid som personalkalendern
 * (CustomCalendar weekly). Premium UI med lila planning-tema.
 *
 * Datalager: STRIKT ISOLERAT.
 *  - Resources per dag = bemannade personer (staffByDay[date]) + "Ej tilldelat".
 *  - Events = large_project_booking_plan_items via LargeProjectPlannerCalendarAdapter.
 *  - Drag/drop på items går genom updateItem (→ large_project_booking_plan_items).
 *  - Använder ALDRIG:
 *      • CustomCalendar (för att slippa useEventDragDrop + setEvents-vägen)
 *      • useUnifiedStaffOperations / useRealTimeCalendarEvents
 *      • personalkalenderns team-resurser
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
import { DRAG_DATA_TYPE, type DraggedEventData } from '@/hooks/useEventDragDrop';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';
import {
  PLANNER_EVENT_ID_PREFIX,
  UNASSIGNED_RESOURCE_ID,
  buildPlannerResourcesForDay,
  mapPlannerItemsToCalendarEvents,
  plannerItemIdFromEventId,
} from './LargeProjectPlannerCalendarAdapter';
import type { useLargeProjectPlannerItems } from './useLargeProjectPlannerItems';

import '@/components/project/ProjectCalendarView.css';

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
    staffByDay,
    itemsWithAssignmentValidity,
    isStaffAllowedForDate,
    updateItem,
  } = ctx;

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
   * Drop-hantering — kallas av TimeGrid per cell när ett event släpps.
   * Skriver ENDAST till large_project_booking_plan_items via updateItem.
   * Skriver ALDRIG till calendar_events/staff_assignments/etc.
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

      // Validera bemanning den nya dagen.
      let nextStaffId: string | null = null;
      if (targetResourceId === UNASSIGNED_RESOURCE_ID) {
        nextStaffId = null;
      } else {
        if (!isStaffAllowedForDate(targetResourceId, targetDateStr)) {
          toast.error(
            'Personen är inte bemannad på stora projektet den här dagen. Tilldela personen via personalkalendern först.',
          );
          return;
        }
        nextStaffId = targetResourceId;
      }

      try {
        await updateItem(plannerItemId, {
          plan_date: targetDateStr,
          assigned_staff_id: nextStaffId,
          assigned_team_id: null,
          status: nextStaffId ? 'planned' : undefined,
        });
      } catch (err) {
        toast.error((err as Error).message || 'Kunde inte flytta task.');
      }
    },
    [isStaffAllowedForDate, updateItem],
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
      <div className="project-calendar-shell">
        <div className="custom-calendar-container weekly-view">
          <div className="weekly-horizontal-grid project-weekly-horizontal-grid">
            {days.map((day) => {
              const date = parseISO(day.date);
              const dayStaff = staffByDay[day.date] ?? [];
              const resources = buildPlannerResourcesForDay(dayStaff);
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
    </EditControllerProvider>
  );
};

export default LargeProjectPlannerCalendarView;
