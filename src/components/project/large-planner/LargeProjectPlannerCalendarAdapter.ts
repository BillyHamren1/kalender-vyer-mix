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
 *  - resourceId = TEAM-id (team-1 … team-5).
 *  - Projektkalendern har ALLTID fasta kolumner team-1 … team-5 (samma som
 *    personalkalendern). Ingen "Ej tilldelat"-kolumn.
 *  - Items utan assigned_team_id renderas i team-1 som default.
 *
 * Mapping:
 *  - item.id                         → event.id  (prefix "planner-item-")
 *  - item.title                      → event.title
 *  - item.plan_date + start/end_time → event.start / event.end
 *  - item.assigned_team_id           → event.resourceId
 *    (saknas team → DEFAULT_TEAM_ID)
 *  - item.booking_id                 → event.bookingId
 *  - eventType                       → 'internal_task' | 'todo'
 *  - extendedProps                   → planner-metadata (se nedan).
 */
import { type CalendarEvent, type Resource, getEventColor } from '@/components/Calendar/ResourceData';
import type { PlannerItemWithValidity } from './useLargeProjectPlannerItems';
import type { LargeProjectPlannerTeam } from './largeProjectPlannerTypes';

/**
 * Default-team för items utan assigned_team_id.
 * Items hamnar i team-1 tills användaren drar dem till rätt kolumn.
 */
export const DEFAULT_TEAM_ID = 'team-1';

/**
 * Fasta team-kolumner i projektkalendern — identiskt med personalkalendern.
 */
export const FIXED_TEAM_IDS = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5'] as const;
export type FixedTeamId = (typeof FIXED_TEAM_IDS)[number];

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

const teamTitleFor = (teamId: string): string => {
  const m = /^team-(\d+)$/.exec(teamId);
  return m ? `Team ${m[1]}` : teamId;
};

/**
 * Bygger TEAM-kolumner för EN projektdag.
 * Returnerar ALLTID exakt fem fasta kolumner team-1 … team-5 (samma som
 * personalkalendern). Personal-badges per team hämtas separat av
 * weeklyStaffOperations i vyn (från LPTA).
 *
 * Resource.id === teamId är vad TimeGrid använder för column matching,
 * och vad onEventDrop får tillbaka som targetResourceId.
 */
export const buildPlannerResourcesForDay = (
  _teamsForDay: LargeProjectPlannerTeam[],
): Resource[] => {
  return FIXED_TEAM_IDS.map((teamId) => ({
    id: teamId,
    title: teamTitleFor(teamId),
    eventColor: 'hsl(var(--primary))',
  }));
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
 * Item utan assigned_team_id routas till DEFAULT_TEAM_ID (team-1).
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
    // Dölj eventdagar — samma logik som personalkalendern (Staff Calendar No Event Day).
    .filter((it) => !(it.item_type === 'booking' && it.source_booking_phase === 'event'))
    // Lugn kalender: ENDAST faseblock (booking-items) renderas i kalendern.
    // Todos (task/manual/split) lever i Checklista-vyn — annars blir kalendern rörig.
    .filter((it) => it.item_type === 'booking')
    .map((it) => {
      const startTime = normalizeTime(it.start_time, FALLBACK_START);
      const endTime = normalizeTime(it.end_time, FALLBACK_END);
      const start = `${it.plan_date}T${startTime}`;
      const end = `${it.plan_date}T${endTime}`;

      const tone = STATUS_COLOR[it.status] ?? STATUS_COLOR.planned;

      // Team-kolumn = primär dimension. Saknas team → default-team (team-1).
      const assignmentInvalid = false;
      const resourceId = it.assigned_team_id ?? DEFAULT_TEAM_ID;

      const booking = it.booking_id
        ? bookingDisplayById?.get(it.booking_id) ?? null
        : null;

      // Bokningar (item_type='booking') ärver fas-färgen från personal-
      // kalendern: rig=ljusgrön, rigDown=ljusröd. Status-tonen används
      // fortfarande för tasks/manual/split-items.
      const isBookingItem = it.item_type === 'booking';
      const phaseEventType =
        it.source_booking_phase === 'rig'
          ? 'rig'
          : it.source_booking_phase === 'rigDown'
            ? 'rigDown'
            : null;
      const bgColor = isBookingItem && phaseEventType ? getEventColor(phaseEventType) : tone.bg;
      const eventTypeForCard = isBookingItem && phaseEventType ? phaseEventType : (it.item_type === 'task' ? 'todo' : 'internal_task');

      return {
        id: `${PLANNER_EVENT_ID_PREFIX}${it.id}`,
        title: it.title,
        start,
        end,
        resourceId,
        eventType: eventTypeForCard,
        backgroundColor: bgColor,
        borderColor: tone.border,
        bookingId: it.booking_id ?? undefined,
        extendedProps: {
          // Routing-flagg som CustomEvent läser för att välja
          // PlannerEventActionPopover (separat skrivväg) istället för
          // EventActionPopover (calendar_events / bookings).
          kind: 'planner_item',
          isLargeProjectPlannerItem: true,
          isPlannerItem: true,
          plannerItemId: it.id,
          plannerLargeProjectId: largeProjectId,
          plannerBookingId: it.booking_id,
          plannerPhase: it.source_booking_phase ?? null,
          plannerItemType: it.item_type,
          largeProjectId,
          bookingId: it.booking_id,
          assignedStaffId: it.assigned_staff_id,
          assignedTeamId: it.assigned_team_id,
          plannerTimesLocked: it.times_locked === true,
          status: it.status,
          itemType: it.item_type,
          usesFallbackTime: !it.start_time || !it.end_time,
          assignmentInvalid,
          assignmentInvalidReason: null,
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
