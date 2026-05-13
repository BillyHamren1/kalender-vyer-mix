// projectTeamStickiness.ts (frontend twin)
//
// Mirrors supabase/functions/_shared/team-assignment/projectTeamStickiness.ts.
// Read-only — never mutates calendar_events. Used by AddRiggDayDialog (and
// future day-creators) so that new rig/event/rigDown rows for a booking
// always inherit the team the booking already has.

import { supabase } from '@/integrations/supabase/client';

const TEAM_IDS = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5'] as const;
export type StickinessTeamId = typeof TEAM_IDS[number];

function isTeamId(value: unknown): value is StickinessTeamId {
  return typeof value === 'string' && (TEAM_IDS as readonly string[]).includes(value);
}

export const STICKINESS_TEAM_IDS = TEAM_IDS;

export interface StickyExistingRow {
  id: string;
  resource_id: string;
}

/**
 * Returns the booking's already-established team (most-frequent across all
 * its calendar_events rows on team-1..5; ties broken by lowest team number),
 * or null if the booking has no team rows yet.
 */
export const getStickyTeamForBooking = async (
  bookingId: string,
  organizationId: string,
): Promise<StickinessTeamId | null> => {
  if (!bookingId || !organizationId) return null;
  const { data, error } = await supabase
    .from('calendar_events')
    .select('resource_id')
    .eq('booking_id', bookingId)
    .eq('organization_id', organizationId)
    .in('resource_id', TEAM_IDS as unknown as string[])
    .neq('event_type', 'activity');
  if (error || !data || data.length === 0) return null;

  const counts = new Map<StickinessTeamId, number>();
  for (const row of data) {
    if (!isTeamId(row.resource_id)) continue;
    counts.set(row.resource_id, (counts.get(row.resource_id) ?? 0) + 1);
  }
  let bestTeam: StickinessTeamId | null = null;
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
 * Looks up an active calendar_events row that already exists for
 * (booking, event_type, source_date, organization). Used to detect "this day
 * is already planned" before inserting/upserting — so the existing
 * resource_id is never silently overwritten.
 */
export const findExistingDayRow = async (
  bookingId: string,
  organizationId: string,
  eventType: string,
  sourceDate: string,
): Promise<StickyExistingRow | null> => {
  if (!bookingId || !organizationId || !eventType || !sourceDate) return null;
  const { data, error } = await supabase
    .from('calendar_events')
    .select('id, resource_id')
    .eq('booking_id', bookingId)
    .eq('organization_id', organizationId)
    .eq('event_type', eventType)
    .eq('source_date', sourceDate)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0] as StickyExistingRow;
};
