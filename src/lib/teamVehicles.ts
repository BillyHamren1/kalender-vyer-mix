/**
 * Pure helpers för team-bilar.
 *
 * Hålls fri från React/Supabase så vi kan dela formattern mellan
 * personalkalendern (desktop) och mobilappen.
 *
 * Format (samma som TimeGrid):
 *  - 0 bilar  →  ""
 *  - 1 bil    →  "Bil: <namn>"
 *  - N bilar  →  "Bil1: <a>, Bil2: <b>, …"
 */

export interface TeamVehicleInfo {
  id: string;
  name: string;
  registration_number: string | null;
}

export function formatTeamVehicleLine(names: string[]): string {
  if (!Array.isArray(names) || names.length === 0) return '';
  if (names.length === 1) return `Bil: ${names[0]}`;
  return names.map((n, i) => `Bil${i + 1}: ${n}`).join(', ');
}

export function vehicleNames(vehicles: TeamVehicleInfo[] | null | undefined): string[] {
  if (!Array.isArray(vehicles)) return [];
  return vehicles
    .filter((v) => v && typeof v.name === 'string' && v.name.trim().length > 0)
    .map((v) => v.name);
}
