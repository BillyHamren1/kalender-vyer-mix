import { CalendarEvent } from '@/components/Calendar/ResourceData';

type PlannerPhase = 'rig' | 'event' | 'rigDown';

interface RealCalendarEventRow {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  resource_id: string | null;
  booking_id: string | null;
  event_type: string | null;
  delivery_address: string | null;
  booking_number: string | null;
  source_date: string | null;
}

interface BookingRow {
  id: string;
  client: string | null;
  booking_number: string | null;
  deliveryaddress: string | null;
  large_project_id: string | null;
  rigdaydate: string | null;
  eventdate: string | null;
  rigdowndate: string | null;
  rig_start_time: string | null;
  rig_end_time: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  rigdown_start_time: string | null;
  rigdown_end_time: string | null;
  status: string | null;
}

interface LargeProjectRow {
  id: string;
  name: string | null;
  address: string | null;
  start_date: string[] | null;
  event_date: string[] | null;
  end_date: string[] | null;
}

interface LargeProjectBookingRow {
  large_project_id: string;
  booking_id: string;
}

interface BookingAssignmentRow {
  booking_id: string;
  team_id: string;
  assignment_date: string;
}

interface LargeProjectTeamAssignmentRow {
  large_project_id: string;
  phase: string;
  assignment_date: string;
  team_id: string;
}

interface BuildPlannerCalendarEventsInput {
  realEvents: RealCalendarEventRow[];
  bookings: BookingRow[];
  largeProjects: LargeProjectRow[];
  largeProjectBookings: LargeProjectBookingRow[];
  bookingAssignments: BookingAssignmentRow[];
  largeProjectTeamAssignments?: LargeProjectTeamAssignmentRow[];
  fromDate: string;
  toDate: string;
}

const DEFAULT_HOURS: Record<PlannerPhase, [string, string]> = {
  rig: ['08:00:00', '12:00:00'],
  event: ['08:00:00', '17:00:00'],
  rigDown: ['08:00:00', '12:00:00'],
};

const normalizePhase = (value: string | null | undefined): PlannerPhase | null => {
  if (value === 'rig') return 'rig';
  if (value === 'event') return 'event';
  if (value === 'rigDown' || value === 'rigdown') return 'rigDown';
  return null;
};

const extractDate = (value: string | null | undefined): string => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

const extractClock = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const match = String(value).match(/(\d{2}:\d{2}:\d{2}|\d{2}:\d{2})/);
  if (!match) return null;
  return match[1].length === 5 ? `${match[1]}:00` : match[1];
};

const buildIso = (date: string, value: string | null | undefined, fallback: string) => {
  const clock = extractClock(value) || fallback;
  return `${date}T${clock}`;
};

const dateDistance = (a: string, b: string) => {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const aTs = Date.UTC(ay, (am || 1) - 1, ad || 1);
  const bTs = Date.UTC(by, (bm || 1) - 1, bd || 1);
  return Math.abs(Math.round((aTs - bTs) / 86400000));
};

const getBookingPhaseDate = (booking: BookingRow, phase: PlannerPhase) => {
  if (phase === 'rig') return booking.rigdaydate;
  if (phase === 'event') return booking.eventdate;
  return booking.rigdowndate;
};

const getBookingPhaseTimes = (booking: BookingRow, phase: PlannerPhase) => {
  if (phase === 'rig') return { start: booking.rig_start_time, end: booking.rig_end_time };
  if (phase === 'event') return { start: booking.event_start_time, end: booking.event_end_time };
  return { start: booking.rigdown_start_time, end: booking.rigdown_end_time };
};

const mapRealRowToCalendarEvent = (
  row: RealCalendarEventRow,
  booking?: BookingRow,
  project?: LargeProjectRow,
): CalendarEvent => ({
  id: row.id,
  title: project?.name || booking?.client || row.title,
  start: row.start_time,
  end: row.end_time,
  resourceId: row.resource_id || '',
  bookingId: row.booking_id || undefined,
  eventType: normalizePhase(row.event_type) || undefined,
  delivery_address: row.delivery_address || booking?.deliveryaddress || project?.address || undefined,
  booking_number: row.booking_number || booking?.booking_number || undefined,
  bookingNumber: row.booking_number || booking?.booking_number || undefined,
  extendedProps: {
    bookingId: row.booking_id || undefined,
    booking_id: row.booking_id || undefined,
    resourceId: row.resource_id || undefined,
    deliveryAddress: row.delivery_address || booking?.deliveryaddress || project?.address || undefined,
    bookingNumber: row.booking_number || booking?.booking_number || undefined,
    eventType: normalizePhase(row.event_type) || row.event_type,
    sourceDate: row.source_date || extractDate(row.start_time),
    largeProjectId: booking?.large_project_id || undefined,
    largeProjectName: project?.name || undefined,
    isSyntheticFallback: false,
    manuallyAssigned: false,
  },
});

export const buildPlannerCalendarEvents = ({
  realEvents,
  bookings,
  largeProjects,
  largeProjectBookings,
  bookingAssignments,
  largeProjectTeamAssignments = [],
  fromDate,
  toDate,
}: BuildPlannerCalendarEventsInput): CalendarEvent[] => {
  const bookingsById = new Map(bookings.map((booking) => [booking.id, booking]));
  const projectsById = new Map(largeProjects.map((project) => [project.id, project]));

  const bookingToProject = new Map<string, string>();
  for (const link of largeProjectBookings) {
    bookingToProject.set(link.booking_id, link.large_project_id);
  }

  const realByBooking = new Map<string, RealCalendarEventRow[]>();
  for (const event of realEvents) {
    if (!event.booking_id) continue;
    const rows = realByBooking.get(event.booking_id) || [];
    rows.push(event);
    realByBooking.set(event.booking_id, rows);
  }
  // Suppress unused-var warnings — bookingAssignments kept in API for backward
  // compat with callers (planner derivation no longer uses it).
  void bookingAssignments;

  // Project team overrides: project|phase|date → team_id
  const projectTeamByKey = new Map<string, string>();
  for (const row of largeProjectTeamAssignments) {
    const phase = normalizePhase(row.phase);
    if (!phase) continue;
    projectTeamByKey.set(`${row.large_project_id}|${phase}|${row.assignment_date}`, row.team_id);
  }

  const events: CalendarEvent[] = [];

  // Debug counters (dev-only summary at the end).
  let eventDaysHidden = 0;
  let largeProjectMissingAssignment = 0;
  let largeProjectFallbackRendered = 0;
  let largeProjectEmittedCount = 0;

  // ── Real calendar_events rows are the SOLE source of truth for TIMES.
  //
  // LARGE PROJECTS ARE PLANNED AT THE PROJECT LEVEL — NOT PER SIBLING BOOKING.
  // A large project bundles many sibling bookings, each carrying their own
  // calendar_events row with its own resource_id (inherited from the original
  // booking import). Those per-sibling resource_ids are NOT authoritative for
  // a large project. The single source of truth for the team a project sits
  // in on a given (phase, date) is `large_project_team_assignments`.
  //
  // Rules for project-linked events:
  //  1. Group all sibling rows by (projectId, phase, date) and emit ONE row.
  //  2. The team comes from large_project_team_assignments. Always.
  //  3. If no assignment exists yet → the project is "unplanned" for that
  //     day and we do not emit it into a team column. (Unplanned-staging
  //     surfaces it elsewhere; see useUnplannedProjects.)
  //  4. Choose the sibling row deterministically (lowest booking_number, then
  //     lowest id) just to have a stable id/start/end to render. The chosen
  //     sibling's resource_id is IGNORED.
  const sortedRealEvents = [...realEvents].sort((a, b) => {
    const sa = (a.source_date || a.start_time || '').localeCompare(b.source_date || b.start_time || '');
    if (sa !== 0) return sa;
    const ta = (a.event_type || '').localeCompare(b.event_type || '');
    if (ta !== 0) return ta;
    const bna = (a.booking_number || '').localeCompare(b.booking_number || '');
    if (bna !== 0) return bna;
    return (a.id || '').localeCompare(b.id || '');
  });

  const projectEmitted = new Set<string>();
  for (const row of sortedRealEvents) {
    const booking = row.booking_id ? bookingsById.get(row.booking_id) : undefined;
    const projectId = booking?.large_project_id || (row.booking_id ? bookingToProject.get(row.booking_id) : undefined);
    const phase = normalizePhase(row.event_type);
    const sourceDate = extractDate(row.source_date || row.start_time);

    if (projectId && phase && sourceDate) {
      const key = `${projectId}|${phase}|${sourceDate}`;
      if (projectEmitted.has(key)) continue;
      const project = projectsById.get(projectId);
      // ONLY the project-level assignment may place a large project in a team
      // column. Sibling resource_id is intentionally ignored.
      const assignedResourceId = projectTeamByKey.get(key);

      let resourceId = assignedResourceId;
      let fallbackResourceUsed = false;
      let missingLargeProjectTeamAssignment = false;

      if (!assignedResourceId) {
        // Event-days are intentionally hidden from the planner calendar.
        // Keep that behavior — never emit event_type="event" rows here.
        if (phase === 'event') {
          eventDaysHidden++;
          continue;
        }

        largeProjectMissingAssignment++;

        // For visible planning phases (rig / rigDown), warn loudly and
        // fall back to the sibling row's resource_id so the project does
        // not silently disappear from the calendar.
        // eslint-disable-next-line no-console
        console.warn('[plannerCalendarDerivation] Missing large_project_team_assignments for large project calendar event', {
          largeProjectId: projectId,
          bookingId: row.booking_id,
          phase,
          sourceDate,
          calendarEventId: row.id,
          expectedAssignmentKey: `${projectId}:${phase}:${sourceDate}`,
          message: 'Missing large_project_team_assignments for large project calendar event',
        });

        if (!row.resource_id) continue;
        resourceId = row.resource_id;
        fallbackResourceUsed = true;
        missingLargeProjectTeamAssignment = true;
        largeProjectFallbackRendered++;
      }

      largeProjectEmittedCount++;

      projectEmitted.add(key);
      events.push({
        id: row.id,
        title: project?.name || booking?.client || row.title,
        start: row.start_time,
        end: row.end_time,
        resourceId: resourceId as string,
        bookingId: row.booking_id || undefined,
        bookingNumber: row.booking_number || booking?.booking_number || undefined,
        booking_number: row.booking_number || booking?.booking_number || undefined,
        eventType: phase,
        delivery_address: row.delivery_address || project?.address || booking?.deliveryaddress || undefined,
        extendedProps: {
          bookingId: row.booking_id || undefined,
          booking_id: row.booking_id || undefined,
          resourceId: resourceId as string,
          deliveryAddress: row.delivery_address || project?.address || booking?.deliveryaddress || undefined,
          bookingNumber: row.booking_number || booking?.booking_number || undefined,
          eventType: phase,
          sourceDate,
          largeProjectId: projectId,
          largeProjectName: project?.name || undefined,
          isLargeProject: true,
          isSyntheticFallback: false,
          phase,
          manuallyAssigned: false,
          missingLargeProjectTeamAssignment,
          fallbackResourceUsed,
          originalResourceId: row.resource_id || undefined,
          expectedAssignmentKey: `${projectId}:${phase}:${sourceDate}`,
        },
      });
      continue;
    }

    if (!row.resource_id) continue;
    events.push(mapRealRowToCalendarEvent(row, booking, undefined));
  }

  const sorted = events.sort((a, b) => String(a.start).localeCompare(String(b.start)));

  if (import.meta.env?.DEV) {
    /* eslint-disable no-console */
    console.groupCollapsed('[PlannerCalendar] derivation summary');
    console.log('window', { fromDate, toDate });
    console.log('calendar_events fetched', realEvents.length);
    console.log('bookings', bookings.length);
    console.log('large_projects', largeProjects.length);
    console.log('large_project_team_assignments', largeProjectTeamAssignments.length);
    console.log('event-days hidden (project, no assignment)', eventDaysHidden);
    console.log('large-project rows missing assignment', largeProjectMissingAssignment);
    console.log('large-project rows rendered via fallback', largeProjectFallbackRendered);
    console.log('large-project rows emitted (total)', largeProjectEmittedCount);
    console.log('final calendar events emitted', sorted.length);
    console.groupEnd();
    /* eslint-enable no-console */
  }

  return sorted;
};