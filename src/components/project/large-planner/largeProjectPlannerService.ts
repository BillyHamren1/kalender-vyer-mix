/**
 * largeProjectPlannerService
 * --------------------------------------------------------------------------
 * Service för intern bokningsplanering inne i stora projekt.
 *
 * HÅRDA REGLER:
 *  - Skriver ENDAST till `large_project_booking_plan_items`.
 *  - LÄSER read-only:
 *      • bookings, large_project_bookings, large_projects
 *      • calendar_events (för att veta vilket team som har projektets fas/dag)
 *      • staff_assignments (för att veta vilka personer som är i teamet den dagen)
 *      • staff_members (namn/färg)
 *  - Får ALDRIG skriva till calendar_events / staff_assignments /
 *    booking_staff_assignments / large_project_team_assignments.
 */
import { supabase } from '@/integrations/supabase/client';
import type {
  CreatePlannerItemInput,
  LargeProjectBookingPlanItem,
  LargeProjectPlannerBooking,
  LargeProjectPlannerContext,
  LargeProjectPlannerDay,
  LargeProjectPlannerStaffMember,
  LargeProjectPlannerTeam,
  SplitBookingInput,
  UpdatePlannerItemInput,
} from './largeProjectPlannerTypes';

const PLAN_TABLE = 'large_project_booking_plan_items';
// Tabellen är ny — Supabase-typerna är inte regenererade ännu.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const planTable = () => (supabase.from as any)(PLAN_TABLE);

// ── Reads ──────────────────────────────────────────────────────────────────

/**
 * Hämta projektets bokningar. Primärkälla: large_project_bookings.
 * Fallback: bookings.large_project_id (för stora projekt som inte syncats
 * till kopplingstabellen ännu).
 */
async function fetchProjectBookings(
  largeProjectId: string,
): Promise<LargeProjectPlannerBooking[]> {
  // Steg 1: bookingIds via large_project_bookings
  const { data: lpbRows, error: lpbErr } = await supabase
    .from('large_project_bookings')
    .select('booking_id')
    .eq('large_project_id', largeProjectId);
  if (lpbErr) throw lpbErr;
  const bookingIdsFromJoin = (lpbRows ?? [])
    .map((r) => (r as { booking_id: string | null }).booking_id)
    .filter((id): id is string => !!id);

  const cols =
    'id, booking_number, client, large_project_id, rigdaydate, eventdate, rigdowndate, ' +
    'rig_start_time, rig_end_time, event_start_time, event_end_time, ' +
    'rigdown_start_time, rigdown_end_time, deliveryaddress, delivery_city, ' +
    'contact_name, contact_phone, contact_email, internalnotes';

  type RawBooking = {
    id: string;
    booking_number?: string | null;
    client?: string | null;
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
    delivery_city?: string | null;
    contact_name?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    internalnotes?: string | null;
  };

  const normalizePlannerTime = (value?: string | null): string | null => {
    if (!value) return null;
    if (value.includes('T')) {
      const timePart = value.split('T')[1]?.replace('Z', '').slice(0, 8) ?? '';
      if (timePart) return timePart.length === 5 ? `${timePart}:00` : timePart;
    }
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length === 5) return `${trimmed}:00`;
    return trimmed.slice(0, 8);
  };

  const normalizePlannerDate = (value?: string | null): string | null => {
    if (!value) return null;
    return value.includes('T') ? value.slice(0, 10) : value.slice(0, 10);
  };

  const uniqueSortedDates = (values: Array<string | null | undefined>): string[] =>
    Array.from(new Set(values.filter((value): value is string => !!value))).sort((a, b) =>
      a.localeCompare(b),
    );

  let rows: RawBooking[] = [];
  if (bookingIdsFromJoin.length > 0) {
    const { data, error } = await supabase
      .from('bookings')
      .select(cols)
      .in('id', bookingIdsFromJoin);
    if (error) throw error;
    rows = (data ?? []) as unknown as RawBooking[];
  } else {
    // Fallback: hämta via bookings.large_project_id
    const { data, error } = await supabase
      .from('bookings')
      .select(cols)
      .eq('large_project_id', largeProjectId);
    if (error) throw error;
    rows = (data ?? []) as unknown as RawBooking[];
  }

  const bookingIds = rows.map((row) => row.id);
  const phaseDatesByBooking = new Map<
    string,
    { rig: Set<string>; event: Set<string>; rigDown: Set<string> }
  >();

  if (bookingIds.length > 0) {
    const { data: eventRows, error: eventError } = await supabase
      .from('calendar_events')
      .select('booking_id, event_type, start_time')
      .in('booking_id', bookingIds)
      .in('event_type', ['rig', 'event', 'rigDown']);

    if (eventError) throw eventError;

    (eventRows ?? []).forEach((row) => {
      const bookingId = (row as { booking_id?: string | null }).booking_id ?? null;
      const eventType = (row as { event_type?: string | null }).event_type ?? null;
      const startTime = (row as { start_time?: string | null }).start_time ?? null;
      const date = normalizePlannerDate(startTime);
      if (!bookingId || !eventType || !date) return;
      const current =
        phaseDatesByBooking.get(bookingId) ??
        { rig: new Set<string>(), event: new Set<string>(), rigDown: new Set<string>() };
      if (eventType === 'rig') current.rig.add(date);
      if (eventType === 'event') current.event.add(date);
      if (eventType === 'rigDown') current.rigDown.add(date);
      phaseDatesByBooking.set(bookingId, current);
    });
  }

  return rows.map((b) => {
    const phaseDates =
      phaseDatesByBooking.get(b.id) ??
      { rig: new Set<string>(), event: new Set<string>(), rigDown: new Set<string>() };

    return {
      id: b.id,
      booking_number: b.booking_number ?? null,
      client: b.client ?? null,
      display_name: b.client || b.booking_number || 'Bokning',
      rigdaydate: normalizePlannerDate(b.rigdaydate),
      eventdate: normalizePlannerDate(b.eventdate),
      rigdowndate: normalizePlannerDate(b.rigdowndate),
      rig_start_time: normalizePlannerTime(b.rig_start_time),
      rig_end_time: normalizePlannerTime(b.rig_end_time),
      event_start_time: normalizePlannerTime(b.event_start_time),
      event_end_time: normalizePlannerTime(b.event_end_time),
      rigdown_start_time: normalizePlannerTime(b.rigdown_start_time),
      rigdown_end_time: normalizePlannerTime(b.rigdown_end_time),
      deliveryaddress: b.deliveryaddress ?? null,
      delivery_city: b.delivery_city ?? null,
      contact_name: b.contact_name ?? null,
      contact_phone: b.contact_phone ?? null,
      contact_email: b.contact_email ?? null,
      internalnotes: b.internalnotes ?? null,
      rig_dates: uniqueSortedDates([...phaseDates.rig, normalizePlannerDate(b.rigdaydate)]),
      event_dates: uniqueSortedDates([...phaseDates.event, normalizePlannerDate(b.eventdate)]),
      rigdown_dates: uniqueSortedDates([
        ...phaseDates.rigDown,
        normalizePlannerDate(b.rigdowndate),
      ]),
    };
  });
}

/**
 * Bygger en dedupad sorterad lista av datum för projektet:
 *  - bokningarnas rig/event/rigdown-datum
 *  - befintliga plan_items.plan_date
 *
 * Faser tilldelas i prioritetsordning event > rig > rigDown om datumet
 * matchar flera bokningar (samma som personalkalenderns visning).
 */
export function buildProjectDays(
  bookings: LargeProjectPlannerBooking[],
  items: LargeProjectBookingPlanItem[],
): LargeProjectPlannerDay[] {
  const dateSet = new Set<string>();
  const phaseByDate = new Map<string, 'rig' | 'event' | 'rigDown'>();
  const tag = (date: string | null, phase: 'rig' | 'event' | 'rigDown') => {
    if (!date) return;
    dateSet.add(date);
    // event > rig > rigDown — sätt bara om svagare/saknad
    const cur = phaseByDate.get(date);
    if (!cur) {
      phaseByDate.set(date, phase);
    } else if (cur === 'rigDown' && phase !== 'rigDown') {
      phaseByDate.set(date, phase);
    } else if (cur === 'rig' && phase === 'event') {
      phaseByDate.set(date, phase);
    }
  };
  bookings.forEach((b) => {
    tag(b.rigdaydate, 'rig');
    tag(b.eventdate, 'event');
    tag(b.rigdowndate, 'rigDown');
  });

  const itemsByDate = new Map<string, LargeProjectBookingPlanItem[]>();
  items.forEach((it) => {
    dateSet.add(it.plan_date);
    const list = itemsByDate.get(it.plan_date) ?? [];
    list.push(it);
    itemsByDate.set(it.plan_date, list);
  });

  return Array.from(dateSet)
    .sort((a, b) => a.localeCompare(b))
    .map((date) => ({
      date,
      phase: phaseByDate.get(date) ?? null,
      items: (itemsByDate.get(date) ?? []).slice().sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return (a.start_time ?? '').localeCompare(b.start_time ?? '');
      }),
    }));
}

/**
 * Bygg staffByDay från calendar_events × staff_assignments. Pure helper —
 * isoleras för enhetstest.
 *
 * @param events  calendar_events rows för projektets bokningar (rig/event/rigDown)
 * @param assignments  staff_assignments rows
 * @param staffMembers Karta från staff_id → namn/färg
 */
export function buildStaffByDay(
  events: Array<{
    booking_id: string | null;
    event_type: string | null;
    source_date: string | null;
    resource_id: string | null;
  }>,
  assignments: Array<{
    staff_id: string | null;
    team_id: string | null;
    assignment_date: string | null;
  }>,
  staffMembers: Array<{ id: string; name: string; color: string | null }>,
): Record<string, LargeProjectPlannerStaffMember[]> {
  // (date, team_id) som projektet "äger"
  const teamsByDate = new Map<string, Set<string>>();
  events.forEach((ev) => {
    const date = ev.source_date;
    const team = ev.resource_id;
    const phase = ev.event_type;
    if (!date || !team) return;
    if (phase !== 'rig' && phase !== 'event' && phase !== 'rigDown') return;
    const set = teamsByDate.get(date) ?? new Set<string>();
    set.add(team);
    teamsByDate.set(date, set);
  });

  // (date, team) → Set<staff_id>
  const staffByDateTeam = new Map<string, Set<string>>();
  assignments.forEach((a) => {
    if (!a.staff_id || !a.team_id || !a.assignment_date) return;
    const key = `${a.assignment_date}|${a.team_id}`;
    const set = staffByDateTeam.get(key) ?? new Set<string>();
    set.add(a.staff_id);
    staffByDateTeam.set(key, set);
  });

  const memberById = new Map<string, { id: string; name: string; color: string | null }>();
  staffMembers.forEach((m) => memberById.set(m.id, m));

  const result: Record<string, LargeProjectPlannerStaffMember[]> = {};
  teamsByDate.forEach((teams, date) => {
    const seen = new Set<string>();
    const list: LargeProjectPlannerStaffMember[] = [];
    teams.forEach((teamId) => {
      const staffSet = staffByDateTeam.get(`${date}|${teamId}`);
      if (!staffSet) return;
      staffSet.forEach((sid) => {
        if (seen.has(sid)) return;
        const m = memberById.get(sid);
        if (!m) return;
        seen.add(sid);
        list.push({ id: m.id, name: m.name, color: m.color, assignedDates: [date] });
      });
    });
    list.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
    result[date] = list;
  });
  return result;
}

/**
 * Bygger team-kolumner per dag — projektkalenderns kolumner.
 * Speglar personalkalenderns ordning (team-1 före team-2 osv).
 */
export function buildTeamsByDay(
  events: Array<{
    booking_id: string | null;
    event_type: string | null;
    source_date: string | null;
    resource_id: string | null;
  }>,
  assignments: Array<{
    staff_id: string | null;
    team_id: string | null;
    assignment_date: string | null;
  }>,
  staffMembers: Array<{ id: string; name: string; color: string | null }>,
): Record<string, LargeProjectPlannerTeam[]> {
  // (date) → Set<team_id> som projektet "äger"
  const teamsByDate = new Map<string, Set<string>>();
  events.forEach((ev) => {
    const date = ev.source_date;
    const team = ev.resource_id;
    const phase = ev.event_type;
    if (!date || !team) return;
    if (phase !== 'rig' && phase !== 'event' && phase !== 'rigDown') return;
    const set = teamsByDate.get(date) ?? new Set<string>();
    set.add(team);
    teamsByDate.set(date, set);
  });

  // (date|team) → Set<staff_id>
  const staffByDateTeam = new Map<string, Set<string>>();
  assignments.forEach((a) => {
    if (!a.staff_id || !a.team_id || !a.assignment_date) return;
    const key = `${a.assignment_date}|${a.team_id}`;
    const set = staffByDateTeam.get(key) ?? new Set<string>();
    set.add(a.staff_id);
    staffByDateTeam.set(key, set);
  });

  const memberById = new Map<string, { id: string; name: string; color: string | null }>();
  staffMembers.forEach((m) => memberById.set(m.id, m));

  const teamOrder = (teamId: string): number => {
    const m = /^team-(\d+)$/.exec(teamId);
    return m ? parseInt(m[1], 10) : 9999;
  };
  const teamTitle = (teamId: string): string => {
    const m = /^team-(\d+)$/.exec(teamId);
    return m ? `Team ${m[1]}` : teamId;
  };

  const result: Record<string, LargeProjectPlannerTeam[]> = {};
  teamsByDate.forEach((teams, date) => {
    const list: LargeProjectPlannerTeam[] = Array.from(teams)
      .sort((a, b) => teamOrder(a) - teamOrder(b) || a.localeCompare(b))
      .map((teamId) => {
        const staffSet = staffByDateTeam.get(`${date}|${teamId}`) ?? new Set<string>();
        const staff = Array.from(staffSet)
          .map((sid) => memberById.get(sid))
          .filter((m): m is { id: string; name: string; color: string | null } => !!m)
          .sort((a, b) => a.name.localeCompare(b.name, 'sv'));
        return {
          teamId,
          teamTitle: teamTitle(teamId),
          order: teamOrder(teamId),
          staff,
        };
      });
    result[date] = list;
  });
  return result;
}

/**
 * Hämta personal per dag på det stora projektet (read-only).
 *
 * KÄLLA: large_project_team_assignments (LPTA) — INTE calendar_events.
 * Detta följer memory `large-project-team-source-of-truth-v1`: team på
 * projektnivå styrs ENDAST av LPTA, syskonbokningarnas
 * calendar_events.resource_id ignoreras helt.
 *
 * För varje (project, assignment_date, team_id) i LPTA hämtas teamets
 * personal via staff_assignments(team_id, assignment_date) +
 * staff_members(id → name/color).
 */
async function fetchProjectStaffPerDay(
  largeProjectId: string,
): Promise<{
  staffByDay: Record<string, LargeProjectPlannerStaffMember[]>;
  teamsByDay: Record<string, LargeProjectPlannerTeam[]>;
  allStaff: LargeProjectPlannerStaffMember[];
}> {
  const { data: lptaRaw, error: lptaErr } = await supabase
    .from('large_project_team_assignments')
    .select('assignment_date, team_id, phase')
    .eq('large_project_id', largeProjectId);
  if (lptaErr) throw lptaErr;

  type LptaRow = {
    assignment_date: string | null;
    team_id: string | null;
    phase: string | null;
  };
  const lptaRows = (lptaRaw ?? []) as unknown as LptaRow[];

  if (lptaRows.length === 0) {
    return { staffByDay: {}, teamsByDay: {}, allStaff: [] };
  }

  const dateTeamPairs = new Set<string>();
  const teamIds = new Set<string>();
  const dates = new Set<string>();
  lptaRows.forEach((r) => {
    if (!r.assignment_date || !r.team_id) return;
    dateTeamPairs.add(`${r.assignment_date}|${r.team_id}`);
    teamIds.add(r.team_id);
    dates.add(r.assignment_date);
  });

  if (dateTeamPairs.size === 0) {
    return { staffByDay: {}, teamsByDay: {}, allStaff: [] };
  }

  const { data: assignments, error: aErr } = await supabase
    .from('staff_assignments')
    .select('staff_id, team_id, assignment_date')
    .in('team_id', Array.from(teamIds))
    .in('assignment_date', Array.from(dates));
  if (aErr) throw aErr;

  type AssignRow = {
    staff_id: string | null;
    team_id: string | null;
    assignment_date: string | null;
  };
  const assignRows = (assignments ?? []) as unknown as AssignRow[];

  const relevantStaffIds = Array.from(
    new Set(
      assignRows
        .filter(
          (a) =>
            a.team_id &&
            a.assignment_date &&
            dateTeamPairs.has(`${a.assignment_date}|${a.team_id}`),
        )
        .map((a) => a.staff_id)
        .filter((id): id is string => !!id),
    ),
  );

  let memberList: Array<{ id: string; name: string; color: string | null }> = [];
  if (relevantStaffIds.length > 0) {
    const { data: members, error: mErr } = await supabase
      .from('staff_members')
      .select('id, name, color')
      .in('id', relevantStaffIds);
    if (mErr) throw mErr;
    type MemberRow = { id: string; name: string; color?: string | null };
    const memberRows = (members ?? []) as unknown as MemberRow[];
    memberList = memberRows.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color ?? null,
    }));
  }

  const teamsByDay = buildTeamsByDayFromLpta(lptaRows, assignRows, memberList);
  const staffByDay = buildStaffByDayFromLpta(lptaRows, assignRows, memberList);

  // Bygg en de-dupad union för "all staff" + samla assignedDates per person
  const datesByStaff = new Map<string, Set<string>>();
  Object.entries(staffByDay).forEach(([date, list]) => {
    list.forEach((s) => {
      const set = datesByStaff.get(s.id) ?? new Set<string>();
      set.add(date);
      datesByStaff.set(s.id, set);
    });
  });

  const allStaff: LargeProjectPlannerStaffMember[] = memberList
    .filter((m) => datesByStaff.has(m.id))
    .map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      assignedDates: Array.from(datesByStaff.get(m.id) ?? new Set<string>()).sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'));

  return { staffByDay, teamsByDay, allStaff };
}

/**
 * Pure helper: bygg teamsByDay från LPTA-rader + staff_assignments-rader.
 * Exporterad för testbarhet.
 */
export function buildTeamsByDayFromLpta(
  lptaRows: Array<{
    assignment_date: string | null;
    team_id: string | null;
  }>,
  assignments: Array<{
    staff_id: string | null;
    team_id: string | null;
    assignment_date: string | null;
  }>,
  staffMembers: Array<{ id: string; name: string; color: string | null }>,
): Record<string, LargeProjectPlannerTeam[]> {
  const teamsByDate = new Map<string, Set<string>>();
  lptaRows.forEach((r) => {
    if (!r.assignment_date || !r.team_id) return;
    const set = teamsByDate.get(r.assignment_date) ?? new Set<string>();
    set.add(r.team_id);
    teamsByDate.set(r.assignment_date, set);
  });

  const staffByDateTeam = new Map<string, Set<string>>();
  assignments.forEach((a) => {
    if (!a.staff_id || !a.team_id || !a.assignment_date) return;
    const key = `${a.assignment_date}|${a.team_id}`;
    const set = staffByDateTeam.get(key) ?? new Set<string>();
    set.add(a.staff_id);
    staffByDateTeam.set(key, set);
  });

  const memberById = new Map<string, { id: string; name: string; color: string | null }>();
  staffMembers.forEach((m) => memberById.set(m.id, m));

  const teamOrder = (teamId: string): number => {
    const m = /^team-(\d+)$/.exec(teamId);
    return m ? parseInt(m[1], 10) : 9999;
  };
  const teamTitle = (teamId: string): string => {
    const m = /^team-(\d+)$/.exec(teamId);
    return m ? `Team ${m[1]}` : teamId;
  };

  const result: Record<string, LargeProjectPlannerTeam[]> = {};
  teamsByDate.forEach((teams, date) => {
    const list: LargeProjectPlannerTeam[] = Array.from(teams)
      .sort((a, b) => teamOrder(a) - teamOrder(b) || a.localeCompare(b))
      .map((teamId) => {
        const staffSet = staffByDateTeam.get(`${date}|${teamId}`) ?? new Set<string>();
        const staff = Array.from(staffSet)
          .map((sid) => memberById.get(sid))
          .filter((m): m is { id: string; name: string; color: string | null } => !!m)
          .sort((a, b) => a.name.localeCompare(b.name, 'sv'));
        return {
          teamId,
          teamTitle: teamTitle(teamId),
          order: teamOrder(teamId),
          staff,
        };
      });
    result[date] = list;
  });
  return result;
}

/**
 * Pure helper: bygg staffByDay (union per dag, oavsett team) från LPTA-rader.
 * Exporterad för testbarhet.
 */
export function buildStaffByDayFromLpta(
  lptaRows: Array<{
    assignment_date: string | null;
    team_id: string | null;
  }>,
  assignments: Array<{
    staff_id: string | null;
    team_id: string | null;
    assignment_date: string | null;
  }>,
  staffMembers: Array<{ id: string; name: string; color: string | null }>,
): Record<string, LargeProjectPlannerStaffMember[]> {
  const dateTeamPairs = new Set<string>();
  lptaRows.forEach((r) => {
    if (!r.assignment_date || !r.team_id) return;
    dateTeamPairs.add(`${r.assignment_date}|${r.team_id}`);
  });

  const memberById = new Map<string, { id: string; name: string; color: string | null }>();
  staffMembers.forEach((m) => memberById.set(m.id, m));

  const staffByDate = new Map<string, Set<string>>();
  assignments.forEach((a) => {
    if (!a.staff_id || !a.team_id || !a.assignment_date) return;
    if (!dateTeamPairs.has(`${a.assignment_date}|${a.team_id}`)) return;
    const set = staffByDate.get(a.assignment_date) ?? new Set<string>();
    set.add(a.staff_id);
    staffByDate.set(a.assignment_date, set);
  });

  const result: Record<string, LargeProjectPlannerStaffMember[]> = {};
  staffByDate.forEach((staffIds, date) => {
    const list: LargeProjectPlannerStaffMember[] = Array.from(staffIds)
      .map((sid) => memberById.get(sid))
      .filter((m): m is { id: string; name: string; color: string | null } => !!m)
      .map((m) => ({ id: m.id, name: m.name, color: m.color, assignedDates: [date] }))
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'));
    result[date] = list;
  });
  return result;
}


export async function fetchLargeProjectPlannerItems(
  largeProjectId: string,
): Promise<LargeProjectBookingPlanItem[]> {
  const { data, error } = await planTable()
    .select('*')
    .eq('large_project_id', largeProjectId)
    .order('plan_date', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as LargeProjectBookingPlanItem[];
}

export async function fetchLargeProjectPlannerContext(
  largeProjectId: string,
): Promise<LargeProjectPlannerContext> {
  const [bookings, items] = await Promise.all([
    fetchProjectBookings(largeProjectId),
    fetchLargeProjectPlannerItems(largeProjectId),
  ]);
  const { staffByDay, teamsByDay, allStaff } = await fetchProjectStaffPerDay(
    largeProjectId,
  );
  return {
    projectId: largeProjectId,
    bookings,
    staff: allStaff,
    items,
    days: buildProjectDays(bookings, items),
    staffByDay,
    teamsByDay,
  };
}

// ── Writes (endast plan-tabellen) ──────────────────────────────────────────

export async function createLargeProjectPlannerItem(
  input: CreatePlannerItemInput,
): Promise<LargeProjectBookingPlanItem> {
  const payload = {
    large_project_id: input.large_project_id,
    title: input.title,
    plan_date: input.plan_date,
    item_type: input.item_type ?? 'task',
    source: input.source ?? 'manual',
    status: input.status ?? 'planned',
    booking_id: input.booking_id ?? null,
    parent_item_id: input.parent_item_id ?? null,
    description: input.description ?? null,
    phase: input.phase ?? null,
    start_time: input.start_time ?? null,
    end_time: input.end_time ?? null,
    assigned_staff_id: input.assigned_staff_id ?? null,
    assigned_team_id: input.assigned_team_id ?? null,
    source_booking_phase: input.source_booking_phase ?? null,
    sort_order: input.sort_order ?? 0,
    notes: input.notes ?? null,
    metadata: input.metadata ?? {},
    booking_product_id: input.booking_product_id ?? null,
  };
  const { data, error } = await planTable().insert(payload).select('*').single();
  if (error) throw error;
  return data as LargeProjectBookingPlanItem;
}

export async function updateLargeProjectPlannerItem(
  id: string,
  updates: UpdatePlannerItemInput,
): Promise<LargeProjectBookingPlanItem> {
  const { data, error } = await planTable()
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as LargeProjectBookingPlanItem;
}

export async function deleteLargeProjectPlannerItem(id: string): Promise<void> {
  const { error } = await planTable().delete().eq('id', id);
  if (error) throw error;
}

/**
 * Dela upp en bokning i flera planner-tasks. Skapar EN parent-rad
 * (item_type='split') och en task per part. Skriver ALDRIG till bookings.
 */
export async function splitBookingIntoPlannerTasks(
  input: SplitBookingInput,
): Promise<LargeProjectBookingPlanItem[]> {
  if (!input.parts.length) return [];

  const firstDate = input.parts[0].plan_date;
  const parent = await createLargeProjectPlannerItem({
    large_project_id: input.large_project_id,
    booking_id: input.booking_id,
    title: 'Uppdelad bokning',
    plan_date: firstDate,
    item_type: 'split',
    source: 'split',
  });

  const rows = input.parts.map((p, idx) => ({
    large_project_id: input.large_project_id,
    booking_id: input.booking_id,
    parent_item_id: parent.id,
    title: p.title,
    plan_date: p.plan_date,
    item_type: 'task' as const,
    source: 'split' as const,
    status: 'planned' as const,
    phase: p.phase ?? null,
    start_time: p.start_time ?? null,
    end_time: p.end_time ?? null,
    assigned_staff_id: p.assigned_staff_id ?? null,
    assigned_team_id: p.assigned_team_id ?? null,
    notes: p.notes ?? null,
    sort_order: idx,
    metadata: {},
  }));

  const { data, error } = await planTable().insert(rows).select('*');
  if (error) throw error;
  return [parent, ...((data ?? []) as LargeProjectBookingPlanItem[])];
}

export interface SeedPlannerItemsResult {
  created: LargeProjectBookingPlanItem[];
  createdCount: number;
  skippedCount: number;
  errors: string[];
}

/**
 * Skapa planner-items (EN per bokning) som speglar projektets bokningar.
 * Idempotent: hoppar över bokningar som redan har minst ett booking-source-item.
 * Skriver ENDAST till `large_project_booking_plan_items`.
 */
export async function createPlannerItemsFromProjectBookings(
  largeProjectId: string,
): Promise<SeedPlannerItemsResult> {
  const errors: string[] = [];
  let bookings: LargeProjectPlannerBooking[] = [];
  let existing: LargeProjectBookingPlanItem[] = [];
  try {
    [bookings, existing] = await Promise.all([
      fetchProjectBookings(largeProjectId),
      fetchLargeProjectPlannerItems(largeProjectId),
    ]);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }

  const existingBookingIds = new Set(
    existing
      .filter((i) => i.source === 'booking' && i.booking_id)
      .map((i) => i.booking_id as string),
  );

  const projectFallbackDate = bookings
    .map((b) => b.rigdaydate ?? b.eventdate ?? b.rigdowndate)
    .find((d): d is string => !!d) ?? null;

  const rows: CreatePlannerItemInput[] = [];
  let skippedCount = 0;

  bookings.forEach((b) => {
    if (existingBookingIds.has(b.id)) {
      skippedCount += 1;
      return;
    }
    const planDate =
      b.rigdaydate ?? b.eventdate ?? b.rigdowndate ?? projectFallbackDate;
    if (!planDate) {
      errors.push(`${b.display_name}: saknar datum`);
      return;
    }
    const startTime =
      b.rig_start_time ?? b.event_start_time ?? b.rigdown_start_time ?? null;
    const endTime =
      b.rig_end_time ?? b.event_end_time ?? b.rigdown_end_time ?? null;
    const titleParts = [b.booking_number, b.client].filter(Boolean) as string[];
    const title = titleParts.length ? titleParts.join(' – ') : b.display_name;

    rows.push({
      large_project_id: largeProjectId,
      booking_id: b.id,
      title,
      plan_date: planDate,
      item_type: 'booking',
      source: 'booking',
      status: 'unplanned',
      start_time: startTime,
      end_time: endTime,
      assigned_staff_id: null,
      assigned_team_id: null,
    });
  });

  if (rows.length === 0) {
    return { created: [], createdCount: 0, skippedCount, errors };
  }

  const { data, error } = await planTable().insert(rows).select('*');
  if (error) {
    errors.push(error.message);
    return { created: [], createdCount: 0, skippedCount, errors };
  }
  const created = (data ?? []) as LargeProjectBookingPlanItem[];
  return { created, createdCount: created.length, skippedCount, errors };
}

// Re-export legacy alias för bakåtkompat-test (gamla __buildPlannerDays).
export { buildProjectDays as __buildPlannerDays };
