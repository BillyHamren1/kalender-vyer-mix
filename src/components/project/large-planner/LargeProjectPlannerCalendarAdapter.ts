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
 *  - resourceId = TEAM-id (team-1 … team-5) eller `unassigned`.
 *  - Items utan assigned_team_id routas till `unassigned`-kolumnen
 *    (visas som "Ej tilldelat") — INTE till team-1. Drag/drop sätter
 *    assigned_team_id; drag tillbaka till `unassigned` sätter null.
 *
 * EVENT-FAS:
 *  Event booking phase is intentionally hidden from the internal large
 *  project planner calendar. Same rule as personalkalendern — bara rig
 *  och rigDown bemannas/planeras här. Constraint:
 *  staff-calendar-no-event-day-v1.
 */
import { type CalendarEvent, type Resource, getEventColor } from '@/components/Calendar/ResourceData';
import type { PlannerItemWithValidity } from './useLargeProjectPlannerItems';
import type { LargeProjectPlannerTeam } from './largeProjectPlannerTypes';

/**
 * Reserverad resource-id för items utan assigned_team_id.
 * Renderas som en separat kolumn "Ej tilldelat" längst till vänster.
 */
export const UNASSIGNED_RESOURCE_ID = 'unassigned';
export const UNASSIGNED_RESOURCE_TITLE = 'Ej tilldelat';

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
 * Bygger kolumner för EN projektdag.
 * Returnerar alltid `unassigned` + team-1 … team-5. `unassigned` placeras
 * först så att otilldelade items syns omedelbart.
 */
export const buildPlannerResourcesForDay = (
  _teamsForDay: LargeProjectPlannerTeam[],
): Resource[] => {
  const unassigned: Resource = {
    id: UNASSIGNED_RESOURCE_ID,
    title: UNASSIGNED_RESOURCE_TITLE,
    eventColor: 'hsl(var(--muted-foreground))',
  };
  return [
    unassigned,
    ...FIXED_TEAM_IDS.map((teamId) => ({
      id: teamId,
      title: teamTitleFor(teamId),
      eventColor: 'hsl(var(--primary))',
    })),
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
 *
 * Filterregler:
 *  - Orderrad-todos (booking_product_id != null) renderas ALDRIG som egna
 *    kalenderblock — de bor i BookingPlannerSheet.
 *  - Event booking phase (item_type='booking' + source_booking_phase='event')
 *    är medvetet dold — se top-of-file kommentar.
 *  - Endast item_type='booking' renderas i kalendern; todos/tasks lever
 *    i Checklista-vyn.
 *
 * Default-routing:
 *  - Items utan assigned_team_id → `UNASSIGNED_RESOURCE_ID` (separat kolumn).
 */
export const mapPlannerItemsToCalendarEvents = (
  items: PlannerItemWithValidity[],
  opts: MapOptions,
): CalendarEvent[] => {
  const { largeProjectId, projectName, projectNumber, bookingDisplayById } = opts;

  // Räkna todos per (booking_id|plan_date) — bara task/manual/split räknas
  // som todos, fasblocken (item_type='booking') är arbetsdagar inte todos.
  const todoStats = new Map<string, { total: number; done: number }>();
  for (const it of items) {
    if (it.item_type === 'booking') continue;
    if (!it.booking_id || !it.plan_date) continue;
    const key = `${it.booking_id}|${it.plan_date}`;
    const cur = todoStats.get(key) ?? { total: 0, done: 0 };
    cur.total += 1;
    if (it.status === 'done') cur.done += 1;
    todoStats.set(key, cur);
  }

  // Dev-counters för diagnostik.
  let cnt_in = 0;
  let cnt_orderrow_filtered = 0;
  let cnt_event_filtered = 0;
  let cnt_non_booking_filtered = 0;
  let cnt_rig = 0;
  let cnt_rigDown = 0;
  let cnt_other_phase = 0;
  let cnt_unassigned = 0;

  const out = items
    .map((it) => {
      cnt_in++;
      if (it.booking_product_id) {
        cnt_orderrow_filtered++;
        return null;
      }
      // Dölj eventdagar — samma regel som personalkalendern.
      if (it.item_type === 'booking' && it.source_booking_phase === 'event') {
        cnt_event_filtered++;
        return null;
      }
      if (it.item_type !== 'booking') {
        cnt_non_booking_filtered++;
        return null;
      }
      return it;
    })
    .filter((it): it is PlannerItemWithValidity => it !== null)
    .map((it) => {
      const startTime = normalizeTime(it.start_time, FALLBACK_START);
      const endTime = normalizeTime(it.end_time, FALLBACK_END);
      const start = `${it.plan_date}T${startTime}`;
      const end = `${it.plan_date}T${endTime}`;

      const tone = STATUS_COLOR[it.status] ?? STATUS_COLOR.planned;

      // Team-kolumn = primär dimension. Saknas team → UNASSIGNED-kolumnen,
      // INTE team-1 (tidigare fel skulle dölja oplanerade items bland riktig
      // bemanning).
      const assignmentInvalid = false;
      const resourceId = it.assigned_team_id ?? UNASSIGNED_RESOURCE_ID;
      if (!it.assigned_team_id) cnt_unassigned++;

      const booking = it.booking_id
        ? bookingDisplayById?.get(it.booking_id) ?? null
        : null;

      // Bokningar (item_type='booking') ärver fas-färgen från personal-
      // kalendern: rig=ljusgrön, rigDown=ljusröd.
      const phaseEventType =
        it.source_booking_phase === 'rig'
          ? 'rig'
          : it.source_booking_phase === 'rigDown'
            ? 'rigDown'
            : null;
      if (phaseEventType === 'rig') cnt_rig++;
      else if (phaseEventType === 'rigDown') cnt_rigDown++;
      else cnt_other_phase++;
      const bgColor = phaseEventType ? getEventColor(phaseEventType) : tone.bg;
      const eventTypeForCard = phaseEventType ?? 'internal_task';

      const phaseLabel =
        it.source_booking_phase === 'rig'
          ? 'Rigg'
          : it.source_booking_phase === 'event'
            ? 'Event'
            : it.source_booking_phase === 'rigDown'
              ? 'Nedmontering'
              : null;

      const todoKey = it.booking_id ? `${it.booking_id}|${it.plan_date}` : null;
      const todoSummary = todoKey ? todoStats.get(todoKey) ?? null : null;

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
          plannerPhaseLabel: phaseLabel,
          plannerPlanDate: it.plan_date,
          plannerItemType: it.item_type,
          plannerTodoTotal: todoSummary?.total ?? 0,
          plannerTodoDone: todoSummary?.done ?? 0,
          plannerUnassigned: !it.assigned_team_id,
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
          bookingNumber: booking?.booking_number ?? projectNumber ?? null,
          sourceBookingNumber: booking?.booking_number ?? null,
          sourceBookingClient: booking?.client ?? null,
        },
      } as CalendarEvent;
    });

  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.info('[LargeProjectPlannerCalendarAdapter] map summary', {
      items_in: cnt_in,
      orderrow_filtered: cnt_orderrow_filtered,
      event_phase_filtered_THIS_IS_INTENTIONAL: cnt_event_filtered,
      todo_or_manual_filtered: cnt_non_booking_filtered,
      rig_emitted: cnt_rig,
      rigDown_emitted: cnt_rigDown,
      other_phase_emitted: cnt_other_phase,
      unassigned_routed: cnt_unassigned,
      final_events_emitted: out.length,
    });
  }

  return out;
};
