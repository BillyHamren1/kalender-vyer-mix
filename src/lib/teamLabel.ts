/**
 * Centralized team label resolution.
 *
 * Maps internal team_id values (as used in staff_assignments + calendar resources)
 * to human-readable labels shown in UI.
 *
 * Special cases:
 *   - team-11        → "Live"   (deprecated column, see live-column-removed-v1)
 *   - transport      → "Lager"  (pseudo-team for warehouse/transport staff,
 *                                see useTeamResources.transportResource)
 *   - lager-N        → "Lager N"
 *   - team-N         → "Team N"
 *   - anything else  → returned as-is
 */
export function formatTeamLabel(teamId: string | null | undefined): string {
  if (!teamId) return '';
  if (teamId === 'transport') return 'Lager';
  if (teamId === 'warehouse') return 'Lager';
  if (teamId === 'team-11') return 'Live';
  if (teamId.startsWith('team-')) return `Team ${teamId.replace('team-', '')}`;
  if (teamId.startsWith('lager-')) return `Lager ${teamId.replace('lager-', '')}`;
  return teamId;
}
