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
  const projectBookingIds = new Map<string, string[]>();
  for (const link of largeProjectBookings) {
    bookingToProject.set(link.booking_id, link.large_project_id);
    const ids = projectBookingIds.get(link.large_project_id) || [];
    ids.push(link.booking_id);
    projectBookingIds.set(link.large_project_id, ids);
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

  // ── Real calendar_events rows are the SOLE source of truth.
  // For project-linked bookings we still emit one row per (project, phase, date)
  // — but only if a real calendar_events row exists for it. No fallback
  // synthesis. If a row is missing → it doesn't appear; reconciler/backfill
  // will create it.
  const projectEmitted = new Set<string>();
  for (const row of realEvents) {
    const booking = row.booking_id ? bookingsById.get(row.booking_id) : undefined;
    const projectId = booking?.large_project_id || (row.booking_id ? bookingToProject.get(row.booking_id) : undefined);
    const phase = normalizePhase(row.event_type);
    const sourceDate = extractDate(row.source_date || row.start_time);

    if (projectId && phase && sourceDate) {
      const key = `${projectId}|${phase}|${sourceDate}`;
      if (projectEmitted.has(key)) continue;
      projectEmitted.add(key);
      const project = projectsById.get(projectId);
      // Project-level team override wins over the row's resource_id
      const overrideTeam = projectTeamByKey.get(key);
      const resourceId = overrideTeam || row.resource_id || '';
      if (!resourceId) continue;
      events.push({
        id: row.id,
        title: project?.name || booking?.client || row.title,
        start: row.start_time,
        end: row.end_time,
        resourceId,
        bookingId: row.booking_id || undefined,
        bookingNumber: row.booking_number || booking?.booking_number || undefined,
        booking_number: row.booking_number || booking?.booking_number || undefined,
        eventType: phase,
        delivery_address: row.delivery_address || project?.address || booking?.deliveryaddress || undefined,
        extendedProps: {
          bookingId: row.booking_id || undefined,
          booking_id: row.booking_id || undefined,
          resourceId,
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
        },
      });
      continue;
    }

    if (!row.resource_id) continue;
    events.push(mapRealRowToCalendarEvent(row, booking, undefined));
  }

  return events.sort((a, b) => String(a.start).localeCompare(String(b.start)));
};