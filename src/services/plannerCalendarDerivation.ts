import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { resolveLargeProjectMembershipFromRows } from '@/lib/largeProject/resolveLargeProjectMembership';

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
  times_locked?: boolean | null;
  todo_id?: string | null;
  customer_pickup?: boolean | null;
}

interface BookingRow {
  id: string;
  client: string | null;
  title: string | null;
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
  rig_time_locked?: boolean | null;
  event_time_locked?: boolean | null;
  rigdown_time_locked?: boolean | null;
  status: string | null;
}

interface LargeProjectRow {
  id: string;
  name: string | null;
  project_number?: string | null;
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

const getBookingPhaseLock = (booking: BookingRow | undefined | null, phase: PlannerPhase | null | undefined): boolean => {
  if (!booking || !phase) return false;
  if (phase === 'rig') return booking.rig_time_locked === true;
  if (phase === 'event') return booking.event_time_locked === true;
  if (phase === 'rigDown') return booking.rigdown_time_locked === true;
  return false;
};

const mapRealRowToCalendarEvent = (
  row: RealCalendarEventRow,
  booking?: BookingRow,
  project?: LargeProjectRow,
): CalendarEvent => {
  const bookingTitle = booking?.title?.trim() || null;
  const baseLabel = project?.name || booking?.client || row.title;
  const displayTitle = !project?.name && bookingTitle
    ? `${baseLabel} – ${bookingTitle}`
    : baseLabel;
  const isTodo = row.event_type === 'todo';
  return {
    id: row.id,
    title: displayTitle,
    start: row.start_time,
    end: row.end_time,
    resourceId: row.resource_id || '',
    bookingId: row.booking_id || undefined,
    eventType: isTodo ? 'todo' : (normalizePhase(row.event_type) || undefined),
    delivery_address: row.delivery_address || booking?.deliveryaddress || project?.address || undefined,
    booking_number: isTodo ? undefined : (row.booking_number || booking?.booking_number || undefined),
    bookingNumber: isTodo ? undefined : (row.booking_number || booking?.booking_number || undefined),
    extendedProps: {
      bookingId: row.booking_id || undefined,
      booking_id: row.booking_id || undefined,
      resourceId: row.resource_id || undefined,
      deliveryAddress: row.delivery_address || booking?.deliveryaddress || project?.address || undefined,
      bookingNumber: isTodo ? undefined : (row.booking_number || booking?.booking_number || undefined),
      bookingTitle: bookingTitle || undefined,
      eventType: isTodo ? 'todo' : (normalizePhase(row.event_type) || row.event_type),
      sourceDate: row.source_date || extractDate(row.start_time),
      largeProjectId: booking?.large_project_id || undefined,
      largeProjectName: project?.name || undefined,
      isSyntheticFallback: false,
      manuallyAssigned: false,
      timeLocked: row.times_locked === true || getBookingPhaseLock(booking, normalizePhase(row.event_type) as PlannerPhase | null),
      timesLocked: row.times_locked === true,
      isTodo,
      todoId: row.todo_id || undefined,
    },
  };
};

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

  // Authoritative LP membership: large_project_bookings, with bookings.large_project_id as fallback only.
  const bookingFallbacks = new Map(bookings.map((b) => [b.id, { id: b.id, large_project_id: b.large_project_id }]));
  const bookingToProject = resolveLargeProjectMembershipFromRows(
    bookings.map((b) => b.id),
    largeProjectBookings,
    bookingFallbacks,
  );

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
    bookingNumbers: Set<string>;
    clientNames: Set<string>;
    eventIds: Set<string>;
    earliestStart: string;
    latestEnd: string;
  }>();

  // PERSONAL/PLANNER allowlist: endast rig/event/rigDown är bemanningsbara
  // standardfaser för stora projekt. Lager/transport hör hemma i
  // warehouse_calendar_events och visas aldrig här. Projektaktiviteter
  // (event_type='activity') hör till PROJEKTKALENDERN och får inte heller
  // läcka in i personalkalendern (ingen explicit "staffingRequired"-flagga
  // finns idag i schemat — opt-in saknas).
  let nonProjectSkippedNonStaffable = 0;
  let todoEventsEmitted = 0;
  for (const row of sortedRealEvents) {
    // To-do passthrough: en to-do är en fristående personalkalender-händelse
    // utan projekt/booking-koppling. Den måste ha resource_id (team).
    if (row.event_type === 'todo') {
      if (!row.resource_id) continue;
      const booking = row.booking_id ? bookingsById.get(row.booking_id) : undefined;
      const guardLpId = (row.booking_id ? bookingToProject.get(row.booking_id) : undefined) || booking?.large_project_id;
      if (guardLpId) continue;
      events.push(mapRealRowToCalendarEvent(row, booking, undefined));
      todoEventsEmitted++;
      continue;
    }

    const booking = row.booking_id ? bookingsById.get(row.booking_id) : undefined;
    // Master: large_project_bookings; fallback: bookings.large_project_id
    const projectId = (row.booking_id ? bookingToProject.get(row.booking_id) : undefined) || booking?.large_project_id;
    const phase = normalizePhase(row.event_type);
    const sourceDate = extractDate(row.source_date || row.start_time);

    if (import.meta.env?.DEV) {
      const titleHay = `${row.booking_number || ''} ${(booking as any)?.client || ''}`.toLowerCase();
      if (titleHay.includes('game fair') && !projectId) {
        console.warn('[large-project-split-warning]', {
          booking_id: row.booking_id,
          booking_number: row.booking_number,
          client: (booking as any)?.client,
          reason: 'calendar row was not resolved through large_project_bookings',
        });
      }
    }

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
      const rowBookingNumber = row.booking_number || booking?.booking_number || '';
      const rowClientName = booking?.client || '';
      const rowLocked = row.times_locked === true || getBookingPhaseLock(booking, phase);
      if (!existing) {
        projectGroups.set(key, {
          rep: row,
          bookingIds: new Set(row.booking_id ? [row.booking_id] : []),
          bookingNumbers: new Set(rowBookingNumber ? [rowBookingNumber] : []),
          clientNames: new Set(rowClientName ? [rowClientName] : []),
          eventIds: new Set([row.id]),
          earliestStart: row.start_time,
          latestEnd: row.end_time,
          anyLocked: rowLocked,
        } as any);
      } else {
        if (row.booking_id) existing.bookingIds.add(row.booking_id);
        if (rowBookingNumber) existing.bookingNumbers.add(rowBookingNumber);
        if (rowClientName) existing.clientNames.add(rowClientName);
        existing.eventIds.add(row.id);
        if (row.start_time < existing.earliestStart) existing.earliestStart = row.start_time;
        if (row.end_time > existing.latestEnd) existing.latestEnd = row.end_time;
        if (rowLocked) (existing as any).anyLocked = true;
      }
      continue;
    }

    if (!row.resource_id) continue;
    // Defensiv allowlist för icke-projekt-bokningar: släpp bara igenom
    // kända bemanningsbara faser. Filtrerar bort 'activity' och okända
    // legacy-event_type.
    if (!phase) {
      nonProjectSkippedNonStaffable++;
      continue;
    }
    // GUARD: även om projectId-resolvern missade, dubbelkolla mot master
    // (large_project_bookings) + fallback (bookings.large_project_id).
    // En bokning som tillhör ett large project får ALDRIG renderas som
    // ett vanligt booking-kort i personalkalendern.
    const guardLpId = (row.booking_id ? bookingToProject.get(row.booking_id) : undefined) || booking?.large_project_id;
    if (guardLpId) {
      if (import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.info('[large-project-booking-event-suppressed]', {
          source: 'buildPlannerCalendarEvents.nonProjectFallback',
          booking_id: row.booking_id,
          booking_number: row.booking_number,
          largeProjectId: guardLpId,
          largeProjectName: projectsById.get(guardLpId)?.name || null,
          calendar_event_id: row.id,
          event_type: row.event_type,
          source_date: sourceDate,
          reason: 'booking belongs to large project and must not create standalone staff calendar event',
        });
      }
      continue;
    }
    events.push(mapRealRowToCalendarEvent(row, booking, undefined));
  }

  // Emit one tile per (project, phase, date, team) group.
  for (const [key, group] of projectGroups) {
    const [projectId, phase, sourceDate, resourceId] = key.split('|') as [string, PlannerPhase, string, string];
    const project = projectsById.get(projectId);
    const repBooking = group.rep.booking_id ? bookingsById.get(group.rep.booking_id) : undefined;
    const lptaTeam = projectTeamByKey.get(`${projectId}|${phase}|${sourceDate}`);
    largeProjectEmittedCount++;
    const includedBookingIds = Array.from(group.bookingIds);
    const includedBookingNumbers = Array.from(group.bookingNumbers);
    const includedClientNames = Array.from(group.clientNames);
    events.push({
      id: group.rep.id,
      title: project?.project_number
        ? `${project.project_number} · ${project?.name || 'Stort projekt'}`
        : (project?.name || 'Stort projekt'),
      start: group.earliestStart,
      end: group.latestEnd,
      resourceId,
      // Project-neutral: top-level bookingId/bookingNumber MUST NOT carry a
      // sub-booking identity for large-project tiles. They live in metadata.
      bookingId: undefined,
      bookingNumber: project?.project_number || undefined,
      booking_number: project?.project_number || undefined,
      eventType: phase,
      delivery_address: project?.address || group.rep.delivery_address || repBooking?.deliveryaddress || undefined,
      extendedProps: {
        // Drilldown only — never used for rendering identity on LP tiles.
        bookingId: undefined,
        booking_id: undefined,
        resourceId,
        deliveryAddress: project?.address || group.rep.delivery_address || repBooking?.deliveryaddress || undefined,
        bookingNumber: project?.project_number || undefined,
        eventType: phase,
        sourceDate,
        largeProjectId: projectId,
        largeProjectName: project?.name || undefined,
        largeProjectNumber: project?.project_number || undefined,
        isLargeProject: true,
        isSyntheticFallback: false,
        phase,
        manuallyAssigned: false,
        // Underbokningar exponeras endast som metadata för drilldown/debug.
        // De får inte styra antalet synliga kort eller tile-identitet.
        includedBookingIds,
        includedBookingNumbers,
        includedClientNames,
        totalIncludedBookings: includedBookingIds.length,
        // Backward-compat alias used by drag handler — same set as included.
        consolidatedBookingIds: includedBookingIds,
        consolidatedEventIds: Array.from(group.eventIds),
        lptaTeamId: lptaTeam || undefined,
        timeLocked: (group as any).anyLocked === true,
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
    console.log('non-project rows skipped (non-staffable event_type)', nonProjectSkippedNonStaffable);
    console.log('todo events emitted', todoEventsEmitted);
    console.log('final calendar events emitted', sorted.length);
    console.groupEnd();
    /* eslint-enable no-console */
  }

  return sorted;
};