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
  const bookingAssignmentsByBooking = new Map<string, BookingAssignmentRow[]>();
  for (const event of realEvents) {
    if (!event.booking_id) continue;
    const rows = realByBooking.get(event.booking_id) || [];
    rows.push(event);
    realByBooking.set(event.booking_id, rows);
  }
  for (const assignment of bookingAssignments) {
    const rows = bookingAssignmentsByBooking.get(assignment.booking_id) || [];
    rows.push(assignment);
    bookingAssignmentsByBooking.set(assignment.booking_id, rows);
  }

  // Project team overrides: project|phase|date → team_id
  const projectTeamByKey = new Map<string, string>();
  for (const row of largeProjectTeamAssignments) {
    const phase = normalizePhase(row.phase);
    if (!phase) continue;
    projectTeamByKey.set(`${row.large_project_id}|${phase}|${row.assignment_date}`, row.team_id);
  }

  const pickNearestReal = (rows: RealCalendarEventRow[], phase: PlannerPhase, date: string) => {
    const samePhase = rows.filter((row) => normalizePhase(row.event_type) === phase && !!row.resource_id);
    const sameDate = samePhase.find((row) => extractDate(row.source_date || row.start_time) === date);
    if (sameDate) return sameDate;
    if (samePhase.length > 0) {
      return [...samePhase].sort((a, b) => (
        dateDistance(extractDate(a.source_date || a.start_time), date) - dateDistance(extractDate(b.source_date || b.start_time), date)
      ))[0];
    }
    const exactAny = rows.find((row) => extractDate(row.source_date || row.start_time) === date && !!row.resource_id);
    if (exactAny) return exactAny;
    return [...rows]
      .filter((row) => !!row.resource_id)
      .sort((a, b) => (
        dateDistance(extractDate(a.source_date || a.start_time), date) - dateDistance(extractDate(b.source_date || b.start_time), date)
      ))[0];
  };

  const inferBookingTeam = (booking: BookingRow, phase: PlannerPhase, date: string) => {
    const assignment = (bookingAssignmentsByBooking.get(booking.id) || [])
      .filter((row) => row.team_id && row.team_id !== 'project')
      .sort((a, b) => dateDistance(a.assignment_date, date) - dateDistance(b.assignment_date, date))[0];
    if (assignment?.team_id) return assignment.team_id;

    const real = pickNearestReal(realByBooking.get(booking.id) || [], phase, date);
    if (real?.resource_id) return real.resource_id;
    return undefined;
  };

  const inferProjectSynthetic = (projectId: string, phase: PlannerPhase, date: string) => {
    const linkedBookingIds = projectBookingIds.get(projectId) || [];
    const linkedBookings = linkedBookingIds
      .map((id) => bookingsById.get(id))
      .filter((booking): booking is BookingRow => Boolean(booking));

    const exactBooking = linkedBookings.find((booking) => getBookingPhaseDate(booking, phase) === date);
    if (exactBooking) {
      const times = getBookingPhaseTimes(exactBooking, phase);
      return {
        booking: exactBooking,
        resourceId: inferBookingTeam(exactBooking, phase, date),
        start: buildIso(date, times.start, DEFAULT_HOURS[phase][0]),
        end: buildIso(date, times.end, DEFAULT_HOURS[phase][1]),
      };
    }

    const exactReal = linkedBookingIds
      .flatMap((bookingId) => realByBooking.get(bookingId) || [])
      .find((row) => normalizePhase(row.event_type) === phase && extractDate(row.source_date || row.start_time) === date && !!row.resource_id);
    if (exactReal) {
      return {
        booking: exactReal.booking_id ? bookingsById.get(exactReal.booking_id) : undefined,
        resourceId: exactReal.resource_id || undefined,
        start: exactReal.start_time,
        end: exactReal.end_time,
      };
    }

    const nearestReal = linkedBookingIds
      .flatMap((bookingId) => realByBooking.get(bookingId) || [])
      .filter((row) => normalizePhase(row.event_type) === phase && !!row.resource_id)
      .sort((a, b) => (
        dateDistance(extractDate(a.source_date || a.start_time), date) - dateDistance(extractDate(b.source_date || b.start_time), date)
      ))[0];

    if (nearestReal) {
      return {
        booking: nearestReal.booking_id ? bookingsById.get(nearestReal.booking_id) : undefined,
        resourceId: nearestReal.resource_id || undefined,
        start: buildIso(date, nearestReal.start_time, DEFAULT_HOURS[phase][0]),
        end: buildIso(date, nearestReal.end_time, DEFAULT_HOURS[phase][1]),
      };
    }

    return { booking: linkedBookings[0], resourceId: undefined, start: `${date}T${DEFAULT_HOURS[phase][0]}`, end: `${date}T${DEFAULT_HOURS[phase][1]}` };
  };

  const bookingSeen = new Set<string>();
  const projectSeen = new Set<string>();
  // Real rows: emit as-is for non-project bookings.
  // For project-linked bookings we DROP the per-booking real row and instead
  // emit a single project-level row below. This is what the user asked for:
  // "projektets datum/tider" — one event per project day, not one per booking.
  const events: CalendarEvent[] = [];
  for (const row of realEvents) {
    const booking = row.booking_id ? bookingsById.get(row.booking_id) : undefined;
    const projectId = booking?.large_project_id || (row.booking_id ? bookingToProject.get(row.booking_id) : undefined);
    const phase = normalizePhase(row.event_type);
    const sourceDate = extractDate(row.source_date || row.start_time);

    if (projectId && phase && sourceDate) {
      // Skip — project-level event is emitted in the large_projects loop below.
      continue;
    }

    if (booking && phase && sourceDate) {
      bookingSeen.add(`${booking.id}|${phase}|${sourceDate}`);
    }
    events.push(mapRealRowToCalendarEvent(row, booking, undefined));
  }

  for (const booking of bookings) {
    if (!booking.id || (booking.status && booking.status.toUpperCase() === 'OFFER')) continue;
    if (booking.large_project_id) continue;

    const phases: PlannerPhase[] = ['rig', 'rigDown'];
    for (const phase of phases) {
      const date = getBookingPhaseDate(booking, phase);
      if (!date || date < fromDate || date > toDate) continue;
      const key = `${booking.id}|${phase}|${date}`;
      if (bookingSeen.has(key)) continue;

      const times = getBookingPhaseTimes(booking, phase);
      const resourceId = inferBookingTeam(booking, phase, date);
      if (!resourceId) continue;

      events.push({
        id: `synthetic-booking-${booking.id}-${phase}-${date}`,
        title: booking.client || 'Bokning',
        start: buildIso(date, times.start, DEFAULT_HOURS[phase][0]),
        end: buildIso(date, times.end, DEFAULT_HOURS[phase][1]),
        resourceId,
        bookingId: booking.id,
        bookingNumber: booking.booking_number || undefined,
        booking_number: booking.booking_number || undefined,
        eventType: phase,
        delivery_address: booking.deliveryaddress || undefined,
        extendedProps: {
          bookingId: booking.id,
          booking_id: booking.id,
          resourceId,
          deliveryAddress: booking.deliveryaddress || undefined,
          bookingNumber: booking.booking_number || undefined,
          eventType: phase,
          sourceDate: date,
          isSyntheticFallback: true,
          manuallyAssigned: false,
        },
      });
      bookingSeen.add(key);
    }
  }

  for (const project of largeProjects) {
    const dates: Array<{ date: string; phase: PlannerPhase }> = [
      ...((project.start_date || []).map((date) => ({ date, phase: 'rig' as PlannerPhase }))),
      ...((project.end_date || []).map((date) => ({ date, phase: 'rigDown' as PlannerPhase }))),
    ];

    for (const { date, phase } of dates) {
      if (!date || date < fromDate || date > toDate) continue;
      const key = `${project.id}|${phase}|${date}`;
      if (projectSeen.has(key)) continue;

      const inferred = inferProjectSynthetic(project.id, phase, date);
      // Project-level team override wins over inference.
      const overrideTeam = projectTeamByKey.get(key);
      const resourceId = overrideTeam || inferred.resourceId;
      if (!resourceId) continue;

      events.push({
        id: `synthetic-project-${project.id}-${phase}-${date}`,
        title: project.name || inferred.booking?.client || 'Stort projekt',
        start: inferred.start,
        end: inferred.end,
        resourceId,
        bookingId: inferred.booking?.id || undefined,
        bookingNumber: inferred.booking?.booking_number || undefined,
        booking_number: inferred.booking?.booking_number || undefined,
        eventType: phase,
        delivery_address: project.address || inferred.booking?.deliveryaddress || undefined,
        extendedProps: {
          bookingId: inferred.booking?.id || undefined,
          booking_id: inferred.booking?.id || undefined,
          resourceId,
          deliveryAddress: project.address || inferred.booking?.deliveryaddress || undefined,
          bookingNumber: inferred.booking?.booking_number || undefined,
          eventType: phase,
          sourceDate: date,
          largeProjectId: project.id,
          largeProjectName: project.name || undefined,
          isLargeProject: true,
          isSyntheticFallback: !overrideTeam && !!inferred && !inferred.booking,
          phase,
          manuallyAssigned: false,
        },
      });
      projectSeen.add(key);
    }
  }

  return events.sort((a, b) => String(a.start).localeCompare(String(b.start)));
};