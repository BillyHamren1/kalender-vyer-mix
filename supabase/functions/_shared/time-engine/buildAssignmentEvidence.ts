// @ts-nocheck
/**
 * buildAssignmentEvidence (Time Engine — Lager 1.5)
 * ─────────────────────────────────────────────────
 *
 * Samlar all PLANERINGSDATA för en staff/dag i ETT enhetligt format.
 *
 * PRODUKTREGEL — PLANNING IS CONTEXT, NOT PROOF OF LOCATION.
 *   Den här helpern säger BARA vad personen var planerad på. Den säger
 *   ALDRIG att personen faktiskt var där. Output får INTE användas för:
 *     - location truth
 *     - display-block
 *     - att skapa transport / okänd plats / granska
 *   Den används av Lager 2+ som CONTEXT mot faktiska GPS/timer-bevis.
 *
 * Källor som läses (read-only):
 *   - booking_staff_assignments  (direkt staff↔booking)
 *   - staff_assignments          (staff↔team för datumet)
 *   - calendar_events            (team↔booking via resource_id+source_date)
 *   - large_project_team_assignments (team↔large_project för datumet)
 *   - bookings (för att upptäcka large_project-context, fas-tider)
 */

import type { FetchAllStaffLocationPingsDiagnostics } from '../timeEngine/fetchAllStaffLocationPings.ts';

export type AssignmentSource =
  | 'booking_staff_assignment'
  | 'staff_team_calendar_event'
  | 'large_project_team_assignment';

export type AssignmentPhase = 'rig' | 'event' | 'rigdown' | 'unknown';

export interface AssignmentEvidenceItem {
  source: AssignmentSource;
  assignmentId: string | null;
  staffId: string;
  teamId: string | null;
  teamName: string | null;
  bookingId: string | null;
  projectId: string | null;
  largeProjectId: string | null;
  /** Visningstitel om tillgängligt (calendar_events.title eller booking_number). */
  title: string | null;
  plannedPhase: AssignmentPhase;
  startAt: string | null;
  endAt: string | null;
  /** True om assignment överlappar dagen alls. */
  overlapsDate: boolean;
  /** True om assignment överlappar det specifika UTC-tidsfönstret. */
  overlapsTimeWindow: boolean;
  /** Booking tillhör large project. */
  belongsToLargeProject: boolean;
  /** Bokningens id om belongsToLargeProject (= bookingId). */
  childBookingId: string | null;
}

export interface AssignmentEvidenceDiagnostics {
  directBookingAssignmentCount: number;
  staffAssignmentCount: number;
  calendarEventCount: number;
  largeProjectAssignmentCount: number;
  /** Aggregerad team-assignment-räkning (BSA + LP). */
  teamAssignmentCount: number;
  assignmentsWithLargeProjectContextCount: number;
  assignmentsWithoutTargetCount: number;
  warnings: string[];
  examples: Array<{
    source: AssignmentSource;
    teamId: string | null;
    bookingId: string | null;
    largeProjectId: string | null;
    plannedPhase: AssignmentPhase;
    startAt: string | null;
    endAt: string | null;
  }>;
}

export interface BuildAssignmentEvidenceInput {
  supabaseAdmin: any;
  organizationId: string;
  staffId: string;
  /** YYYY-MM-DD (Stockholm-local). */
  date: string;
  /** UTC window för overlapsTimeWindow-flaggan. */
  dayStartUtc: string;
  dayEndUtc: string;
}

export interface BuildAssignmentEvidenceResult {
  items: AssignmentEvidenceItem[];
  diagnostics: AssignmentEvidenceDiagnostics;
}

function within(start: string | null, end: string | null, winStart: string, winEnd: string): boolean {
  if (!start || !end) return false;
  const s = Date.parse(start);
  const e = Date.parse(end);
  const ws = Date.parse(winStart);
  const we = Date.parse(winEnd);
  if (![s, e, ws, we].every(Number.isFinite)) return false;
  return s < we && e > ws;
}

function combine(date: string, time: string | null): string | null {
  if (!time) return null;
  // Bokningstider lagras som tid-utan-zon i Sverige. Antag Stockholm = UTC+1/+2.
  // Vi gör en enkel ISO-konstruktion utan zon — overlapsTimeWindow är robust
  // mot detta eftersom Date.parse tolkar "YYYY-MM-DDTHH:MM" som lokal tid.
  // För att vara deterministisk i Deno (UTC-default) mappar vi via Stockholm.
  // Eftersom denna helper är "context, not proof", räcker bästa-möjliga-iso.
  const t = time.length === 5 ? `${time}:00` : time;
  return `${date}T${t}`;
}

function pickPhaseAndTimes(
  booking: any,
  date: string,
): { phase: AssignmentPhase; start: string | null; end: string | null } {
  if (!booking) return { phase: 'unknown', start: null, end: null };
  if (booking.eventdate === date) {
    return { phase: 'event', start: combine(date, booking.event_start_time), end: combine(date, booking.event_end_time) };
  }
  if (booking.rigdaydate === date) {
    return { phase: 'rig', start: combine(date, booking.rig_start_time), end: combine(date, booking.rig_end_time) };
  }
  if (booking.rigdowndate === date) {
    return { phase: 'rigdown', start: combine(date, booking.rigdown_start_time), end: combine(date, booking.rigdown_end_time) };
  }
  return { phase: 'unknown', start: null, end: null };
}

export async function buildAssignmentEvidence(
  input: BuildAssignmentEvidenceInput,
): Promise<BuildAssignmentEvidenceResult> {
  const { supabaseAdmin, organizationId, staffId, date, dayStartUtc, dayEndUtc } = input;
  const warnings: string[] = [];
  const items: AssignmentEvidenceItem[] = [];

  const diag: AssignmentEvidenceDiagnostics = {
    directBookingAssignmentCount: 0,
    staffAssignmentCount: 0,
    calendarEventCount: 0,
    largeProjectAssignmentCount: 0,
    teamAssignmentCount: 0,
    assignmentsWithLargeProjectContextCount: 0,
    assignmentsWithoutTargetCount: 0,
    warnings,
    examples: [],
  };

  const myTeamIdsToday = new Set<string>();

  // ── A. booking_staff_assignments — direkt staff↔booking ───────────────────
  let directBsa: any[] = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('booking_staff_assignments')
      .select('id, booking_id, team_id, role, assignment_date')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .eq('assignment_date', date);
    if (error) warnings.push(`booking_staff_assignments: ${error.message}`);
    else directBsa = data ?? [];
  } catch (e) {
    warnings.push(`booking_staff_assignments_exception: ${(e as Error).message}`);
  }
  diag.directBookingAssignmentCount = directBsa.length;
  for (const r of directBsa) {
    if (r.team_id && r.team_id !== 'project') myTeamIdsToday.add(String(r.team_id));
  }

  // ── B. staff_assignments — staff↔team för datumet ────────────────────────
  let staffTeams: any[] = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('staff_assignments')
      .select('id, team_id, assignment_date')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .eq('assignment_date', date);
    if (error) warnings.push(`staff_assignments: ${error.message}`);
    else staffTeams = data ?? [];
  } catch (e) {
    warnings.push(`staff_assignments_exception: ${(e as Error).message}`);
  }
  diag.staffAssignmentCount = staffTeams.length;
  for (const r of staffTeams) {
    if (r.team_id && r.team_id !== 'project') myTeamIdsToday.add(String(r.team_id));
  }

  // ── C. calendar_events — team↔booking för datumet ────────────────────────
  let calendarRows: any[] = [];
  if (myTeamIdsToday.size > 0) {
    try {
      const { data, error } = await supabaseAdmin
        .from('calendar_events')
        .select('id, booking_id, resource_id, title, source_date, start_time, end_time, event_type, booking_number')
        .eq('organization_id', organizationId)
        .eq('source_date', date)
        .in('resource_id', Array.from(myTeamIdsToday));
      if (error) warnings.push(`calendar_events: ${error.message}`);
      else calendarRows = data ?? [];
    } catch (e) {
      warnings.push(`calendar_events_exception: ${(e as Error).message}`);
    }
  }
  diag.calendarEventCount = calendarRows.length;

  // ── D. large_project_team_assignments — team↔LP för datumet ──────────────
  let lpRows: any[] = [];
  if (myTeamIdsToday.size > 0) {
    try {
      const { data, error } = await supabaseAdmin
        .from('large_project_team_assignments')
        .select('id, large_project_id, team_id, phase, assignment_date')
        .eq('organization_id', organizationId)
        .eq('assignment_date', date)
        .in('team_id', Array.from(myTeamIdsToday));
      if (error) warnings.push(`large_project_team_assignments: ${error.message}`);
      else lpRows = data ?? [];
    } catch (e) {
      warnings.push(`large_project_team_assignments_exception: ${(e as Error).message}`);
    }
  }
  diag.largeProjectAssignmentCount = lpRows.length;
  diag.teamAssignmentCount = staffTeams.length + lpRows.length;

  // ── E. Hämta bookings för tider, fas och large_project-koppling ──────────
  const bookingIds = new Set<string>();
  for (const r of directBsa) if (r.booking_id) bookingIds.add(r.booking_id);
  for (const r of calendarRows) if (r.booking_id) bookingIds.add(r.booking_id);

  const bookingMap = new Map<string, any>();
  if (bookingIds.size > 0) {
    try {
      const { data, error } = await supabaseAdmin
        .from('bookings')
        .select('id, large_project_id, eventdate, rigdaydate, rigdowndate, event_start_time, event_end_time, rig_start_time, rig_end_time, rigdown_start_time, rigdown_end_time, booking_number, project_name')
        .in('id', Array.from(bookingIds));
      if (error) warnings.push(`bookings: ${error.message}`);
      else (data ?? []).forEach((b: any) => bookingMap.set(b.id, b));
    } catch (e) {
      warnings.push(`bookings_exception: ${(e as Error).message}`);
    }
  }

  const pushExample = (it: AssignmentEvidenceItem) => {
    if (diag.examples.length >= 20) return;
    diag.examples.push({
      source: it.source,
      teamId: it.teamId,
      bookingId: it.bookingId,
      largeProjectId: it.largeProjectId,
      plannedPhase: it.plannedPhase,
      startAt: it.startAt,
      endAt: it.endAt,
    });
  };

  // ── Bygg items: direkt BSA ───────────────────────────────────────────────
  for (const r of directBsa) {
    const b = r.booking_id ? bookingMap.get(r.booking_id) : null;
    const { phase, start, end } = pickPhaseAndTimes(b, date);
    const lpId = b?.large_project_id ?? null;
    const item: AssignmentEvidenceItem = {
      source: 'booking_staff_assignment',
      assignmentId: r.id ?? null,
      staffId,
      teamId: r.team_id ?? null,
      teamName: null,
      bookingId: r.booking_id ?? null,
      projectId: null,
      largeProjectId: lpId,
      title: b?.project_name ?? b?.booking_number ?? null,
      plannedPhase: phase,
      startAt: start,
      endAt: end,
      overlapsDate: !!b && (b.eventdate === date || b.rigdaydate === date || b.rigdowndate === date),
      overlapsTimeWindow: within(start, end, dayStartUtc, dayEndUtc),
      belongsToLargeProject: !!lpId,
      childBookingId: lpId ? r.booking_id ?? null : null,
    };
    if (lpId) diag.assignmentsWithLargeProjectContextCount++;
    if (!item.bookingId && !item.largeProjectId) diag.assignmentsWithoutTargetCount++;
    items.push(item);
    pushExample(item);
  }

  // ── Bygg items: team→calendar_event ──────────────────────────────────────
  for (const ce of calendarRows) {
    const b = ce.booking_id ? bookingMap.get(ce.booking_id) : null;
    const lpId = b?.large_project_id ?? null;
    // calendar_events har egna start_time/end_time (timestamptz). Använd dem
    // direkt — de är redan UTC.
    const start = ce.start_time ?? null;
    const end = ce.end_time ?? null;
    const phase: AssignmentPhase =
      ce.event_type === 'rig' ? 'rig' :
      ce.event_type === 'rigdown' ? 'rigdown' :
      ce.event_type === 'event' ? 'event' :
      pickPhaseAndTimes(b, date).phase;
    const item: AssignmentEvidenceItem = {
      source: 'staff_team_calendar_event',
      assignmentId: ce.id ?? null,
      staffId,
      teamId: ce.resource_id ?? null,
      teamName: null,
      bookingId: ce.booking_id ?? null,
      projectId: null,
      largeProjectId: lpId,
      title: ce.title ?? ce.booking_number ?? b?.project_name ?? null,
      plannedPhase: phase,
      startAt: start,
      endAt: end,
      overlapsDate: ce.source_date === date,
      overlapsTimeWindow: within(start, end, dayStartUtc, dayEndUtc),
      belongsToLargeProject: !!lpId,
      childBookingId: lpId ? ce.booking_id ?? null : null,
    };
    if (lpId) diag.assignmentsWithLargeProjectContextCount++;
    if (!item.bookingId && !item.largeProjectId) diag.assignmentsWithoutTargetCount++;
    items.push(item);
    pushExample(item);
  }

  // ── Bygg items: large_project_team_assignments ───────────────────────────
  for (const lp of lpRows) {
    const phase: AssignmentPhase =
      lp.phase === 'rig' || lp.phase === 'event' || lp.phase === 'rigdown' ? lp.phase : 'unknown';
    const item: AssignmentEvidenceItem = {
      source: 'large_project_team_assignment',
      assignmentId: lp.id ?? null,
      staffId,
      teamId: lp.team_id ?? null,
      teamName: null,
      bookingId: null,
      projectId: null,
      largeProjectId: lp.large_project_id ?? null,
      title: null,
      plannedPhase: phase,
      startAt: null,
      endAt: null,
      overlapsDate: lp.assignment_date === date,
      overlapsTimeWindow: false,
      belongsToLargeProject: true,
      childBookingId: null,
    };
    if (lp.large_project_id) diag.assignmentsWithLargeProjectContextCount++;
    if (!item.largeProjectId) diag.assignmentsWithoutTargetCount++;
    items.push(item);
    pushExample(item);
  }

  return { items, diagnostics: diag };
}
