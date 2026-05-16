import type { Resource } from '@/components/Calendar/ResourceData';

/**
 * Always-visible team columns in the planning calendar. The user cannot
 * hide these via the team visibility popover.
 *
 * NOTE: `team-11` (the old "Live" column) is intentionally NOT required
 * — it has been deprecated, see useTeamResources.tsx.
 */
export const REQUIRED_TEAM_IDS: readonly string[] = [
  'team-1',
  'team-2',
  'team-3',
  'team-4',
  'transport',
];

export const isRequiredTeam = (teamId: string): boolean =>
  REQUIRED_TEAM_IDS.includes(teamId);

/**
 * Default set of visible team columns for a planning day.
 *
 * Includes EVERY team column that currently exists in `resources` (Team 1–10
 * and any custom teams), plus the Lager (`transport`) column. This is
 * deliberate: previously the default was a hardcoded subset
 * (`team-1..4 + transport + team-11`) which silently hid Team 5–10 even
 * when they had planned jobs — see plan 2026-05-16.
 *
 * The deprecated `team-11` ("Live") column is filtered out.
 */
export const computeDefaultVisibleTeams = (
  resources: Pick<Resource, 'id'>[] | null | undefined,
): string[] => {
  const ids = new Set<string>(REQUIRED_TEAM_IDS);
  for (const r of resources ?? []) {
    if (!r?.id) continue;
    if (r.id === 'team-11') continue;
    ids.add(r.id);
  }
  return Array.from(ids);
};
