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
 * Returns the REQUIRED teams only (Team 1–4 + Lager/transport). Team 5–10
 * och egna team kan slås på per dag via TeamVisibilityControl-knappen i
 * dagens header. Att visa alla 10 + Lager som default trängde undan
 * Lager-kolumnen och toggle-knappen i veckovyn (11 kolumner per dag fick
 * inte plats) — se chat 2026-05-18.
 *
 * `resources`-argumentet behålls i signaturen för bakåtkompatibilitet men
 * påverkar inte längre defaults; det filtrerar bara bort team-11 om någon
 * skulle råka skicka in det.
 */
export const computeDefaultVisibleTeams = (
  _resources?: Pick<Resource, 'id'>[] | null | undefined,
): string[] => {
  return [...REQUIRED_TEAM_IDS];
};
