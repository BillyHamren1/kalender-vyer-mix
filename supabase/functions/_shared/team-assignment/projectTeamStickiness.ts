// projectTeamStickiness.ts
//
// Single source of truth for the "project team stickiness" rule:
//
//   En bokning är "team-sticky": om bokning X redan har minst en
//   calendar_events-rad på något team-1..5, så ska NYA rig/event/rigDown-dagar
//   för X återanvända samma team. Round-robin/earliest-slot används BARA när
//   bokningen är helt ny i kalendern.
//
//   För stora projekt gäller stickiness per (largeProjectId, phase, date)
//   enligt LP-konsolideringsmodellen — alla syskon-bokningar ärver
//   representantens team.
//
// Helper läser bara — ändrar aldrig data. Andra bokningars resource_id rörs
// aldrig av denna helper.

const TEAM_IDS = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5'] as const;
type TeamId = typeof TEAM_IDS[number];

function isTeamId(value: unknown): value is TeamId {
  return typeof value === 'string' && (TEAM_IDS as readonly string[]).includes(value);
}

/**
 * Returns the team this booking already lives on (if any), looking only at
 * existing calendar_events rows. Picks the most-frequent team across all of
 * the booking's rig/event/rigDown rows; ties broken by lowest team number.
 *
 * `excludeEventIds` is useful when the caller is in the middle of an UPSERT
 * cycle and has just created/updated rows that should not be considered
 * "existing context" for the next decision.
 */
export const getStickyTeamForBooking = async (
  supabase: any,
  bookingId: string,
  organizationId: string,
  excludeEventIds: string[] = [],
): Promise<TeamId | null> => {
  if (!bookingId || !organizationId) return null;

  let query = supabase
    .from('calendar_events')
    .select('id, resource_id')
    .eq('booking_id', bookingId)
    .eq('organization_id', organizationId)
    .in('resource_id', TEAM_IDS as unknown as string[])
    .neq('event_type', 'activity');

  if (excludeEventIds.length > 0) {
    query = query.not('id', 'in', `(${excludeEventIds.map((id) => `"${id}"`).join(',')})`);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[stickiness] getStickyTeamForBooking failed', error);
    return null;
  }
  if (!data || data.length === 0) return null;

  const counts = new Map<TeamId, number>();
  for (const row of data) {
    if (!isTeamId(row.resource_id)) continue;
    counts.set(row.resource_id, (counts.get(row.resource_id) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  let bestTeam: TeamId | null = null;
  let bestCount = -1;
  for (const team of TEAM_IDS) {
    const c = counts.get(team) ?? 0;
    if (c > bestCount) {
      bestCount = c;
      bestTeam = team;
    }
  }
  return bestTeam;
};

/**
 * For large projects: stickiness is anchored to the LP representative row for
 * (phase, date). If any sibling booking already has a row for that phase+date
 * on a team-1..5, return that team. Otherwise fall back to the LP's most
 * common team across all phases/dates.
 */
export const getStickyTeamForLargeProject = async (
  supabase: any,
  largeProjectId: string,
  organizationId: string,
  phase: string,
  date: string,
): Promise<TeamId | null> => {
  if (!largeProjectId || !organizationId) return null;

  // 1) Hitta alla syskon-bokningar.
  const [{ data: lpbRows }, { data: bRows }] = await Promise.all([
    supabase
      .from('large_project_bookings')
      .select('booking_id')
      .eq('large_project_id', largeProjectId),
    supabase
      .from('bookings')
      .select('id')
      .eq('large_project_id', largeProjectId),
  ]);
  const siblingIds = Array.from(new Set([
    ...((lpbRows ?? []).map((r: any) => r.booking_id).filter(Boolean)),
    ...((bRows ?? []).map((r: any) => r.id).filter(Boolean)),
  ]));
  if (siblingIds.length === 0) return null;

  // 2) Exakt match på (phase, date) för någon syskonrad.
  const { data: exactRows } = await supabase
    .from('calendar_events')
    .select('resource_id')
    .in('booking_id', siblingIds)
    .eq('organization_id', organizationId)
    .eq('event_type', phase)
    .eq('source_date', date)
    .in('resource_id', TEAM_IDS as unknown as string[]);

  for (const team of TEAM_IDS) {
    if ((exactRows ?? []).some((r: any) => r.resource_id === team)) return team;
  }

  // 3) Fallback: vanligaste team över alla syskonbokningars rader.
  const { data: anyRows } = await supabase
    .from('calendar_events')
    .select('resource_id')
    .in('booking_id', siblingIds)
    .eq('organization_id', organizationId)
    .in('resource_id', TEAM_IDS as unknown as string[])
    .neq('event_type', 'activity');

  if (!anyRows || anyRows.length === 0) return null;
  const counts = new Map<TeamId, number>();
  for (const r of anyRows) {
    if (!isTeamId(r.resource_id)) continue;
    counts.set(r.resource_id, (counts.get(r.resource_id) ?? 0) + 1);
  }
  let bestTeam: TeamId | null = null;
  let bestCount = -1;
  for (const team of TEAM_IDS) {
    const c = counts.get(team) ?? 0;
    if (c > bestCount) {
      bestCount = c;
      bestTeam = team;
    }
  }
  return bestTeam;
};

export const STICKINESS_TEAM_IDS = TEAM_IDS;
export type StickinessTeamId = TeamId;
