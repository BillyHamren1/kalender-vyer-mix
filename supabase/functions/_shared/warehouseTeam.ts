/**
 * Deno mirror of `src/lib/warehouse/warehouseTeam.ts`.
 *
 * Single source of truth for "is this team_id a Lager column?" so all edge
 * functions (mobile-app-api, sync jobs, debug endpoints) classify Lager
 * placements identically and never hard-code legacy ids like `transport`,
 * `warehouse` or `lager-1`.
 *
 * UI rule (frontend): always render this concept as "Lager".
 */

export const DEFAULT_WAREHOUSE_TEAM_ID = 'lager-1' as const;
export const WAREHOUSE_DISPLAY_NAME = 'Lager' as const;

const STATIC_WAREHOUSE_TEAM_IDS: ReadonlySet<string> = new Set([
  'transport',
  'warehouse',
]);

export function isWarehouseTeam(teamId: string | null | undefined): boolean {
  if (!teamId) return false;
  if (STATIC_WAREHOUSE_TEAM_IDS.has(teamId)) return true;
  return teamId.startsWith('lager-');
}
