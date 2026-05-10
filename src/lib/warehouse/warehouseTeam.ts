/**
 * Warehouse team helpers.
 *
 * Encapsulates all "is this a Lager team_id?" / "what does the user see?"
 * logic so the rest of the app never has to hard-code the legacy technical
 * names (`lager-1`, `lager-2`, `lager-3`, `transport`, `warehouse`).
 *
 * UI rule: always call this concept "Lager" in user-facing text.
 * The technical team_ids stay as-is to keep DB / staff_assignments stable.
 */

/** Default team_id used when we need to pick one Lager column. */
export const DEFAULT_WAREHOUSE_TEAM_ID = 'lager-1' as const;

/** Display name shown in the UI for any warehouse-team row. */
export const WAREHOUSE_DISPLAY_NAME = 'Lager' as const;

/** All technical team_ids that map to "Lager" in the UI. */
const STATIC_WAREHOUSE_TEAM_IDS: ReadonlySet<string> = new Set([
  'transport',
  'warehouse',
]);

/** Returns true if the given team_id should be shown as "Lager" in the UI. */
export function isWarehouseTeam(teamId: string | null | undefined): boolean {
  if (!teamId) return false;
  if (STATIC_WAREHOUSE_TEAM_IDS.has(teamId)) return true;
  return teamId.startsWith('lager-');
}

/**
 * Pick the team_id to use when assigning a staff member to "Lager".
 *
 * If a warehouse_calendar_event already targets a specific lager column
 * (`lager-1`/`lager-2`/...), we mirror staff_assignments onto that exact
 * column so the personal calendar matches the warehouse calendar visually.
 * Otherwise we fall back to the default Lager column.
 */
export function getWarehouseTeamId(eventResourceId?: string | null): string {
  if (eventResourceId && eventResourceId.startsWith('lager-')) {
    return eventResourceId;
  }
  return DEFAULT_WAREHOUSE_TEAM_ID;
}

/** UI label. Always "Lager". Pure helper so call-sites don't string-concat. */
export function getWarehouseDisplayName(): string {
  return WAREHOUSE_DISPLAY_NAME;
}
