/**
 * Canonical staff calendar derivation.
 *
 * Visibility for a staff member's calendar day is driven by ASSIGNMENTS and
 * PROJECT DATE ARRAYS, not by the moment-to-moment presence of a row in
 * `calendar_events`. `calendar_events` is used purely for ENRICHMENT
 * (real start/end times, team/resource id, address, etc.) when available.
 *
 * Identity for a derived row:
 *   - normal booking : staff_id|booking_id|source_date|phase
 *   - large project  : staff_id|large_project_id|source_date|phase
 *
 * This file is shared in spirit with the `staff-management` edge function —
 * keep the logic in lockstep when changing it.
 */

export type Phase = 'rig' | 'event' | 'rigDown';

export interface DerivedStaffEvent {
  id: string;
  staffId: string;
  staffName: string;
  bookingId?: string;
  largeProjectId?: string;
  largeProjectName?: string;
  client: string;
  title: string;
  phase: Phase;
  date: string;          // yyyy-MM-dd
  start: string;         // ISO
  end: string;           // ISO
  teamId?: string;
  deliveryAddress?: string;
  bookingNumber?: string;
  consolidatedBookingIds: string[];
  isLargeProject: boolean;
  enrichedFromCalendar: boolean;
}

export interface BookingLite {
  id: string;
  client?: string | null;
  booking_number?: string | null;
  large_project_id?: string | null;
  rigdaydate?: string | null;
  eventdate?: string | null;
  rigdowndate?: string | null;
  rig_start_time?: string | null;
  rig_end_time?: string | null;
  event_start_time?: string | null;
  event_end_time?: string | null;
  rigdown_start_time?: string | null;
  rigdown_end_time?: string | null;
  deliveryaddress?: string | null;
}

export interface LargeProjectLite {
  id: string;
  name?: string | null;
  address?: string | null;
  start_date?: string[] | null;
  event_date?: string[] | null;
  end_date?: string[] | null;
}

export interface CalendarEventLite {
  id: string;
  booking_id: string | null;
  start_time: string;
  end_time: string;
  event_type: string | null;
  resource_id: string | null;
  booking_number?: string | null;
  delivery_address?: string | null;
  source_date?: string | null;
}

export interface BookingAssignmentLite {
  staff_id: string;
  booking_id: string;
  team_id: string;
  assignment_date: string;
}

export interface LargeProjectStaffLite {
  staff_id: string;
  large_project_id: string;
}

export interface DeriveInput {
  staffIds: string[];
  startDate: string; // yyyy-MM-dd
  endDate: string;   // yyyy-MM-dd
  staffNames: Map<string, string>;
  bookingAssignments: BookingAssignmentLite[];
  largeProjectStaff: LargeProjectStaffLite[];
  bookings: Map<string, BookingLite>;
  largeProjects: Map<string, LargeProjectLite>;
  largeProjectBookings: Array<{ large_project_id: string; booking_id: string }>;
  calendarEvents: CalendarEventLite[];
}

const PHASE_FROM_TYPE: Record<string, Phase | null> = {
  rig: 'rig',
  event: 'event',
  rigDown: 'rigDown',
  rigdown: 'rigDown',
};

const DEFAULT_HOURS: Record<Phase, [string, string]> = {
  rig: ['08:00:00', '12:00:00'],
  event: ['08:00:00', '17:00:00'],
  rigDown: ['08:00:00', '12:00:00'],
};

const PHASE_LABEL: Record<Phase, string> = {
  rig: 'rig',
  event: 'event',
  rigDown: 'rigDown',
};

const inRange = (date: string, start: string, end: string) =>
  date >= start && date <= end;

const buildTimes = (
  date: string,
  phase: Phase,
  startTime?: string | null,
  endTime?: string | null
): { start: string; end: string } => {
  const [defStart, defEnd] = DEFAULT_HOURS[phase];
  const s = (startTime && /^\d{2}:\d{2}/.test(startTime)) ? `${startTime}${startTime.length === 5 ? ':00' : ''}` : defStart;
  const e = (endTime && /^\d{2}:\d{2}/.test(endTime)) ? `${endTime}${endTime.length === 5 ? ':00' : ''}` : defEnd;
  return {
    start: `${date}T${s}`,
    end: `${date}T${e}`,
  };
};

/**
 * Build a set of phase/date pairs that the BOOKING itself owns.
 * Used to expand a single staff assignment row (per date) into one entry
 * per phase that actually falls on that date.
 */
const phasesForBookingDate = (booking: BookingLite, date: string): Phase[] => {
  const phases: Phase[] = [];
  if (booking.rigdaydate === date) phases.push('rig');
  if (booking.rigdowndate === date) phases.push('rigDown');
  // NOTE: event-dagen visas INTE i personalkalendern — bara rig/rigDown.
  // Om datumet bara matchar booking.eventdate (eller inget), faller raden bort.
  return phases;
};

export const deriveStaffEvents = (input: DeriveInput): DerivedStaffEvent[] => {
  const {
    staffIds,
    startDate,
    endDate,
    staffNames,
    bookingAssignments,
    largeProjectStaff,
    bookings,
    largeProjects,
    largeProjectBookings,
    calendarEvents,
  } = input;

  if (staffIds.length === 0) return [];
  const staffSet = new Set(staffIds);

  // Index calendar events by booking_id for cheap enrichment lookups.
  const ceByBooking = new Map<string, CalendarEventLite[]>();
  for (const ce of calendarEvents) {
    if (!ce.booking_id) continue;
    const arr = ceByBooking.get(ce.booking_id) || [];
    arr.push(ce);
    ceByBooking.set(ce.booking_id, arr);
  }

  // Map booking → large project (so normal-booking assignments inside a
  // large project can be redirected to the consolidated project row).
  const bookingToLP = new Map<string, string>();
  const bookingsByLP = new Map<string, string[]>();
  for (const row of largeProjectBookings) {
    bookingToLP.set(row.booking_id, row.large_project_id);
    const arr = bookingsByLP.get(row.large_project_id) || [];
    arr.push(row.booking_id);
    bookingsByLP.set(row.large_project_id, arr);
  }

  const out = new Map<string, DerivedStaffEvent>();

  const findEnrichingCE = (
    bookingId: string,
    phase: Phase,
    date: string
  ): CalendarEventLite | undefined => {
    const list = ceByBooking.get(bookingId) || [];
    return list.find(ce => {
      const p = PHASE_FROM_TYPE[ce.event_type || ''];
      const d = ce.source_date || ce.start_time?.split('T')[0] || '';
      return p === phase && d === date;
    });
  };

  const upsertNormal = (
    staffId: string,
    booking: BookingLite,
    phase: Phase,
    date: string,
    teamId: string | undefined,
    enrichingCE?: CalendarEventLite
  ) => {
    // GUARD: bookings that belong to a large project must NEVER produce a
    // standalone staff-calendar event. Master = large_project_bookings,
    // fallback = bookings.large_project_id. See product rule.
    const lpGuardId = bookingToLP.get(booking.id) || booking.large_project_id;
    if (lpGuardId) {
      if (typeof console !== 'undefined' && (import.meta as any)?.env?.DEV) {
        const projectName = largeProjects.get(lpGuardId)?.name || null;
        console.info('[large-project-booking-event-suppressed]', {
          source: 'deriveStaffEvents.upsertNormal',
          booking_id: booking.id,
          booking_number: booking.booking_number || null,
          largeProjectId: lpGuardId,
          largeProjectName: projectName,
          phase,
          date,
          reason: 'booking belongs to large project and must not create standalone staff calendar event',
        });
      }
      return;
    }

    const staffName = staffNames.get(staffId) || `Staff ${staffId}`;
    const client = booking.client || 'Bokning';
    const key = `${staffId}|${booking.id}|${date}|${phase}`;
    if (out.has(key)) return;

    let times: { start: string; end: string };
    let resourceId = teamId;
    let deliveryAddress = booking.deliveryaddress || undefined;
    let bookingNumber = booking.booking_number || undefined;
    let enriched = false;

    if (enrichingCE) {
      times = { start: enrichingCE.start_time, end: enrichingCE.end_time };
      resourceId = enrichingCE.resource_id || resourceId;
      deliveryAddress = enrichingCE.delivery_address || deliveryAddress;
      bookingNumber = enrichingCE.booking_number || bookingNumber;
      enriched = true;
    } else {
      const startKey = phase === 'rig' ? booking.rig_start_time
        : phase === 'event' ? booking.event_start_time
        : booking.rigdown_start_time;
      const endKey = phase === 'rig' ? booking.rig_end_time
        : phase === 'event' ? booking.event_end_time
        : booking.rigdown_end_time;
      times = buildTimes(date, phase, startKey, endKey);
    }

    out.set(key, {
      id: `staff-${staffId}-booking-${booking.id}-${phase}-${date}`,
      staffId,
      staffName,
      bookingId: booking.id,
      client,
      title: `${client} - ${PHASE_LABEL[phase]}`,
      phase,
      date,
      start: times.start,
      end: times.end,
      teamId: resourceId,
      deliveryAddress,
      bookingNumber,
      consolidatedBookingIds: [booking.id],
      isLargeProject: false,
      enrichedFromCalendar: enriched,
    });
  };

  const upsertLargeProject = (
    staffId: string,
    project: LargeProjectLite,
    phase: Phase,
    date: string,
    teamId: string | undefined,
    bookingHint?: string,
    enrichingCE?: CalendarEventLite
  ) => {
    const staffName = staffNames.get(staffId) || `Staff ${staffId}`;
    const projectName = project.name || 'Stort projekt';
    // Grouping key includes teamId so the same project on different teams
    // produces separate tiles — but NEVER includes booking_id (project-neutral).
    const teamKey = teamId || 'no-team';
    const key = `${staffId}|lp-${project.id}|${date}|${phase}|${teamKey}`;

    let times: { start: string; end: string };
    let resourceId = teamId;
    let deliveryAddress = project.address || undefined;
    let enriched = false;

    if (enrichingCE) {
      times = { start: enrichingCE.start_time, end: enrichingCE.end_time };
      resourceId = enrichingCE.resource_id || resourceId;
      deliveryAddress = enrichingCE.delivery_address || deliveryAddress;
      enriched = true;
    } else {
      times = buildTimes(date, phase, null, null);
    }

    const existing = out.get(key);
    if (!existing) {
      out.set(key, {
        id: `staff-${staffId}-large-${project.id}-${phase}-${date}-${teamKey}`,
        staffId,
        staffName,
        // Project-neutral: no sub-booking identity on top-level fields.
        bookingId: undefined,
        largeProjectId: project.id,
        largeProjectName: projectName,
        client: projectName,
        title: `${projectName} - ${PHASE_LABEL[phase]}`,
        phase,
        date,
        start: times.start,
        end: times.end,
        teamId: resourceId,
        deliveryAddress,
        bookingNumber: undefined,
        consolidatedBookingIds: bookingHint ? [bookingHint] : [],
        isLargeProject: true,
        enrichedFromCalendar: enriched,
      });
      return;
    }

    if (!existing.enrichedFromCalendar && enriched) {
      existing.start = times.start;
      existing.end = times.end;
      existing.teamId = resourceId || existing.teamId;
      existing.deliveryAddress = deliveryAddress || existing.deliveryAddress;
      existing.enrichedFromCalendar = true;
    } else {
      if (times.start < existing.start) existing.start = times.start;
      if (times.end > existing.end) existing.end = times.end;
    }
    if (bookingHint && !existing.consolidatedBookingIds.includes(bookingHint)) {
      existing.consolidatedBookingIds.push(bookingHint);
      // Do NOT promote bookingId/bookingNumber to top-level — LP tiles stay
      // booking-neutral. Sub-bookings are metadata only.
    }
  };

  // ── 1) Normal/large-project rows from booking_staff_assignments ───────
  for (const a of bookingAssignments) {
    if (!staffSet.has(a.staff_id)) continue;
    if (!inRange(a.assignment_date, startDate, endDate)) continue;
    const booking = bookings.get(a.booking_id);
    if (!booking) continue;

    // Master order: large_project_bookings membership wins over bookings.large_project_id (fallback only)
    const lpId = bookingToLP.get(booking.id) || booking.large_project_id;

    if (lpId) {
      const project = largeProjects.get(lpId);
      if (!project) continue;
      const phases = phasesForBookingDate(booking, a.assignment_date);
      for (const phase of phases) {
        const ce = findEnrichingCE(booking.id, phase, a.assignment_date);
        upsertLargeProject(a.staff_id, project, phase, a.assignment_date, a.team_id, booking.id, ce);
      }
      continue;
    }

    const phases = phasesForBookingDate(booking, a.assignment_date);
    for (const phase of phases) {
      const ce = findEnrichingCE(booking.id, phase, a.assignment_date);
      upsertNormal(a.staff_id, booking, phase, a.assignment_date, a.team_id, ce);
    }
  }

  // ── 2) Project-wide visibility from large_project_staff ───────────────
  for (const lps of largeProjectStaff) {
    if (!staffSet.has(lps.staff_id)) continue;
    const project = largeProjects.get(lps.large_project_id);
    if (!project) continue;

    const phaseDates: Array<{ date: string; phase: Phase }> = [
      ...((project.start_date || []).map(d => ({ date: d, phase: 'rig' as Phase }))),
      // event_date utelämnas medvetet — event-dagen visas inte i personalkalendern.
      ...((project.end_date || []).map(d => ({ date: d, phase: 'rigDown' as Phase }))),
    ].filter(p => p.date && inRange(p.date, startDate, endDate));

    const linkedBookingIds = bookingsByLP.get(lps.large_project_id) || [];
    const firstBooking = linkedBookingIds[0];

    for (const { date, phase } of phaseDates) {
      // Prefer a calendar_event from any linked booking for enrichment
      let enrichingCE: CalendarEventLite | undefined;
      let bookingHint: string | undefined = firstBooking;
      for (const bid of linkedBookingIds) {
        const ce = findEnrichingCE(bid, phase, date);
        if (ce) { enrichingCE = ce; bookingHint = bid; break; }
      }
      upsertLargeProject(lps.staff_id, project, phase, date, undefined, bookingHint, enrichingCE);
    }
  }

  return Array.from(out.values()).sort((a, b) => a.start.localeCompare(b.start));
};
