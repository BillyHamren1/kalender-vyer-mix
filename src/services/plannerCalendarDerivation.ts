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
  // LARGE PROJECTS ARE PLANNED PER (PROJECT, PHASE, DATE, TEAM).
  // Each rig/rigDown calendar_events row is a first-class planning unit.
  // A large project may appear in MULTIPLE teams the same day — one tile
  // per team. We consolidate sibling bookings that share the SAME team into
  // a single tile so the planner shows "Swedish game fair · team-1" as one
  // chip even if 20 sub-bookings live there. But team-2 the same day shows
  // as a SEPARATE tile.
  //
  // The team comes directly from `calendar_events.resource_id`.
  // `large_project_team_assignments` (LPTA) is no longer authoritative for
  // placement here — it is used by other systems (mobile staff visibility,
  // booking_staff_assignments derivation). Drag-and-drop in the planner
  // mutates `calendar_events.resource_id` on the underlying group.
  const sortedRealEvents = [...realEvents].sort((a, b) => {
    const sa = (a.source_date || a.start_time || '').localeCompare(b.source_date || b.start_time || '');
    if (sa !== 0) return sa;
    const ta = (a.event_type || '').localeCompare(b.event_type || '');
    if (ta !== 0) return ta;
    const ra = (a.resource_id || '').localeCompare(b.resource_id || '');
    if (ra !== 0) return ra;
    const bna = (a.booking_number || '').localeCompare(b.booking_number || '');
    if (bna !== 0) return bna;
    return (a.id || '').localeCompare(b.id || '');
  });

  // Group key: (projectId, phase, date, team). One tile per group.
  const projectGroups = new Map<string, {
    rep: RealCalendarEventRow;
    bookingIds: Set<string>;
    eventIds: Set<string>;
    earliestStart: string;
    latestEnd: string;
  }>();

  for (const row of sortedRealEvents) {
    const booking = row.booking_id ? bookingsById.get(row.booking_id) : undefined;
    const projectId = booking?.large_project_id || (row.booking_id ? bookingToProject.get(row.booking_id) : undefined);
    const phase = normalizePhase(row.event_type);
    const sourceDate = extractDate(row.source_date || row.start_time);

    if (projectId && phase && sourceDate) {
      // Hide the event-day phase from the planner (legacy rule).
      if (phase === 'event') { eventDaysHidden++; continue; }
      // Project-linked rows REQUIRE a resource_id to be placed in a team
      // column. If missing, skip silently (sync should backfill it).
      if (!row.resource_id) {
        largeProjectMissingAssignment++;
        continue;
      }

      const key = `${projectId}|${phase}|${sourceDate}|${row.resource_id}`;
      const existing = projectGroups.get(key);
      if (!existing) {
        projectGroups.set(key, {
          rep: row,
          bookingIds: new Set(row.booking_id ? [row.booking_id] : []),
          eventIds: new Set([row.id]),
          earliestStart: row.start_time,
          latestEnd: row.end_time,
        });
      } else {
        if (row.booking_id) existing.bookingIds.add(row.booking_id);
        existing.eventIds.add(row.id);
        if (row.start_time < existing.earliestStart) existing.earliestStart = row.start_time;
        if (row.end_time > existing.latestEnd) existing.latestEnd = row.end_time;
      }
      continue;
    }

    if (!row.resource_id) continue;
    events.push(mapRealRowToCalendarEvent(row, booking, undefined));
  }

  // Emit one tile per (project, phase, date, team) group.
  for (const [key, group] of projectGroups) {
    const [projectId, phase, sourceDate, resourceId] = key.split('|') as [string, PlannerPhase, string, string];
    const project = projectsById.get(projectId);
    const repBooking = group.rep.booking_id ? bookingsById.get(group.rep.booking_id) : undefined;
    const lptaTeam = projectTeamByKey.get(`${projectId}|${phase}|${sourceDate}`);
    largeProjectEmittedCount++;
    events.push({
      id: group.rep.id,
      title: project?.name || repBooking?.client || group.rep.title,
      start: group.earliestStart,
      end: group.latestEnd,
      resourceId,
      bookingId: group.rep.booking_id || undefined,
      bookingNumber: group.rep.booking_number || repBooking?.booking_number || undefined,
      booking_number: group.rep.booking_number || repBooking?.booking_number || undefined,
      eventType: phase,
      delivery_address: group.rep.delivery_address || project?.address || repBooking?.deliveryaddress || undefined,
      extendedProps: {
        bookingId: group.rep.booking_id || undefined,
        booking_id: group.rep.booking_id || undefined,
        resourceId,
        deliveryAddress: group.rep.delivery_address || project?.address || repBooking?.deliveryaddress || undefined,
        bookingNumber: group.rep.booking_number || repBooking?.booking_number || undefined,
        eventType: phase,
        sourceDate,
        largeProjectId: projectId,
        largeProjectName: project?.name || undefined,
        isLargeProject: true,
        isSyntheticFallback: false,
        phase,
        manuallyAssigned: false,
        // All bookings + calendar_events ids that belong to this team-tile.
        // Drag handler uses this to mutate the whole group atomically.
        consolidatedBookingIds: Array.from(group.bookingIds),
        consolidatedEventIds: Array.from(group.eventIds),
        lptaTeamId: lptaTeam || undefined,
      },
    });
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