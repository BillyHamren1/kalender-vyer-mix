/**
 * LargeProjectPlannerCalendarAdapter
 * --------------------------------------------------------------------------
 * REN MAPPNING — large_project_booking_plan_items → CalendarEvent[].
 * Används av den ISOLERADE projektkalendern (LargeProjectPlannerCalendarView)
 * för att rendera planner-items i samma TimeGrid/CustomCalendar-UI som
 * personalkalendern, men UTAN att röra calendar_events.
 *
 * STRIKT:
 *  - Får INTE läsa eller skriva supabase-tabeller.
 *  - Får INTE referera personalkalenderns team-resurser.
 *  - resourceId = staffId (per dag) ELLER UNASSIGNED_RESOURCE_ID.
 *
 * Mapping:
 *  - item.id                         → event.id  (prefix "planner-item-")
 *  - item.title                      → event.title
 *  - item.plan_date + start/end_time → event.start / event.end
 *  - item.assigned_staff_id          → event.resourceId
 *    (om staff saknas eller inte är bemannad den dagen → UNASSIGNED)
 *  - item.booking_id                 → event.bookingId
 *  - eventType                       → 'internal_task' | 'todo'
 *  - extendedProps                   → planner-metadata (se nedan).
 */
import type { CalendarEvent, Resource } from '@/components/Calendar/ResourceData';
import type { PlannerItemWithValidity } from './useLargeProjectPlannerItems';
import type { LargeProjectPlannerStaffMember } from './largeProjectPlannerTypes';

export const UNASSIGNED_RESOURCE_ID = '__unassigned__';
export const UNASSIGNED_TITLE = 'Ej tilldelat';

export const PLANNER_EVENT_ID_PREFIX = 'planner-item-';

const FALLBACK_START = '08:00:00';
const FALLBACK_END = '16:00:00';

const STATUS_COLOR: Record<string, { bg: string; border: string }> = {
  planned: { bg: '#EDE9FE', border: '#8B5CF6' },
  in_progress: { bg: '#DDD6FE', border: '#7C3AED' },
  done: { bg: '#D1FAE5', border: '#10B981' },
  blocked: { bg: '#FEE2E2', border: '#EF4444' },
  unplanned: { bg: '#F5F3FF', border: '#C4B5FD' },
};

const normalizeTime = (t: string | null | undefined, fallback: string): string => {
  const v = (t ?? fallback).slice(0, 8);
  return v.length === 5 ? `${v}:00` : v;
};

export const plannerItemIdFromEventId = (eventId: string): string | null => {
  if (!eventId.startsWith(PLANNER_EVENT_ID_PREFIX)) return null;
  return eventId.slice(PLANNER_EVENT_ID_PREFIX.length);
};

/**
 * Bygger kolumn-resurser för EN projektdag från dagens bemanning.
 * Lägger alltid på en fast "Ej tilldelat"-kolumn sist.
 *
 * Resource.id === staff.id är vad TimeGrid använder för column matching,
 * och vad onEventDrop får tillbaka som targetResourceId.
 */
export const buildPlannerResourcesForDay = (
  staffForDay: LargeProjectPlannerStaffMember[],
): Resource[] => {
  const staffResources: Resource[] = staffForDay.map((s) => ({
    id: s.id,
    title: s.name,
    eventColor: s.color ?? 'hsl(var(--primary))',
  }));
  return [
    ...staffResources,
    { id: UNASSIGNED_RESOURCE_ID, title: UNASSIGNED_TITLE, eventColor: '#C4B5FD' },
  ];
};

interface MapOptions {
  largeProjectId: string;
  projectName?: string | null;
  projectNumber?: string | null;
  /**
   * Mappa booking_id → display info (booking_number, client) för popovern.
   * Frivillig.
   */
  bookingDisplayById?: Map<
    string,
    { booking_number: string | null; client: string | null }
  >;
}

/**
 * Mappar planner-items till CalendarEvent[].
 * Item vars assigned_staff_id INTE är bemannad den dagen routas till
 * UNASSIGNED-kolumnen och flaggas med extendedProps.assignmentInvalid.
 *
 * Orderrad-todos (item_type === 'task' && booking_product_id != null)
 * filtreras BORT — de visas i BookingPlannerSheet vid klick på bokningens
 * block, inte som egna kalenderhändelser.
 */
export const mapPlannerItemsToCalendarEvents = (
  items: PlannerItemWithValidity[],
  opts: MapOptions,
): CalendarEvent[] => {
  const { largeProjectId, projectName, projectNumber, bookingDisplayById } = opts;

  return items
    .filter((it) => !it.booking_product_id)
    .map((it) => {
      const startTime = normalizeTime(it.start_time, FALLBACK_START);
      const endTime = normalizeTime(it.end_time, FALLBACK_END);
      const start = `${it.plan_date}T${startTime}`;
      const end = `${it.plan_date}T${endTime}`;

      const tone = STATUS_COLOR[it.status] ?? STATUS_COLOR.planned;

      const assignmentInvalid =
        !!it.assigned_staff_id && !it.isAssignedStaffAllowed;
      const resourceId =
        it.assigned_staff_id && !assignmentInvalid
          ? it.assigned_staff_id
          : UNASSIGNED_RESOURCE_ID;

      const booking = it.booking_id
        ? bookingDisplayById?.get(it.booking_id) ?? null
        : null;

      return {
        id: `${PLANNER_EVENT_ID_PREFIX}${it.id}`,
        title: it.title,
        start,
        end,
        resourceId,
        eventType: it.item_type === 'task' ? 'todo' : 'internal_task',
        backgroundColor: tone.bg,
        borderColor: tone.border,
        bookingId: it.booking_id ?? undefined,
        extendedProps: {
          isLargeProjectPlannerItem: true,
          plannerItemId: it.id,
          largeProjectId,
          bookingId: it.booking_id,
          assignedStaffId: it.assigned_staff_id,
          status: it.status,
          itemType: it.item_type,
          usesFallbackTime: !it.start_time || !it.end_time,
          assignmentInvalid,
          assignmentInvalidReason: assignmentInvalid ? 'Bemanning saknas' : null,
          client: projectName ? `Projekt: ${projectName}` : 'Internt projekt',
          projectName: projectName ?? null,
          projectNumber: projectNumber ?? null,
          bookingNumber: projectNumber ?? booking?.booking_number ?? null,
          sourceBookingNumber: booking?.booking_number ?? null,
          sourceBookingClient: booking?.client ?? null,
        },
      } as CalendarEvent;
    });
};
