/**
 * Ren helper för att filtrera och deduplicera projekt-rader innan de blir
 * geofences på GPS-satellitkartan.
 *
 * Regler:
 *  - Cancelled-rader kastas helt (kollar BÅDE `status` OCH `planning_status` —
 *    cancelled kan ligga på vilken som helst).
 *  - Soft-deleted (`deleted_at`) kastas.
 *  - Saknar koordinater → kastas.
 *  - Dedup på närliggande punkter (~25 m): behåll den giltiga, prioritera den
 *    med explicit `address_radius_meters` satt, annars senast skapad.
 */
import { haversineMeters } from '@/lib/staff/movementDetection';

export interface RawProjectRow {
  id: string;
  name: string | null;
  delivery_latitude: number | string | null;
  delivery_longitude: number | string | null;
  address_radius_meters: number | string | null;
  status?: string | null;
  planning_status?: string | null;
  deleted_at?: string | null;
  created_at?: string | null;
  booking_id?: string | null;
}

export interface RawLargeProjectRow {
  id: string;
  name: string | null;
  address_latitude: number | string | null;
  address_longitude: number | string | null;
  address_radius_meters: number | string | null;
  deleted_at?: string | null;
  created_at?: string | null;
}

export interface ProjectGeofence {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

const CANCELLED = new Set(['cancelled', 'avbokat', 'avbokad', 'canceled']);

function isCancelled(row: RawProjectRow): boolean {
  const s = String(row.status ?? '').toLowerCase();
  const p = String(row.planning_status ?? '').toLowerCase();
  return CANCELLED.has(s) || CANCELLED.has(p);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Två punkter inom ~25 m räknas som samma plats (samma adress, ev. olika
 * GPS-noise eller olika tidpunkter på samma kund).
 */
const SAME_PLACE_M = 25;

function pickBetter(a: ProjectGeofence & { _radiusExplicit: boolean; _created: number },
                    b: ProjectGeofence & { _radiusExplicit: boolean; _created: number }): typeof a {
  // Explicit radius vinner alltid.
  if (a._radiusExplicit !== b._radiusExplicit) return a._radiusExplicit ? a : b;
  // Annars senast skapad.
  return a._created >= b._created ? a : b;
}

export function filterProjectGeofences(
  projects: RawProjectRow[],
  largeProjects: RawLargeProjectRow[] = [],
): ProjectGeofence[] {
  type Internal = ProjectGeofence & { _radiusExplicit: boolean; _created: number };
  const kept: Internal[] = [];

  for (const p of projects) {
    if (p.deleted_at) continue;
    if (isCancelled(p)) continue;
    const lat = num(p.delivery_latitude);
    const lng = num(p.delivery_longitude);
    if (lat === null || lng === null) continue;
    const explicit = p.address_radius_meters !== null && p.address_radius_meters !== undefined && p.address_radius_meters !== '';
    const radius = num(p.address_radius_meters) ?? 150;
    kept.push({
      id: `project:${p.id}`,
      name: p.name || 'Projekt',
      lat,
      lng,
      radiusMeters: radius > 0 ? radius : 150,
      _radiusExplicit: explicit,
      _created: p.created_at ? new Date(p.created_at).getTime() : 0,
    });
  }

  for (const lp of largeProjects) {
    if (lp.deleted_at) continue;
    const lat = num(lp.address_latitude);
    const lng = num(lp.address_longitude);
    if (lat === null || lng === null) continue;
    const explicit = lp.address_radius_meters !== null && lp.address_radius_meters !== undefined && lp.address_radius_meters !== '';
    const radius = num(lp.address_radius_meters) ?? 200;
    kept.push({
      id: `large:${lp.id}`,
      name: lp.name || 'Stort projekt',
      lat,
      lng,
      radiusMeters: radius > 0 ? radius : 200,
      _radiusExplicit: explicit,
      _created: lp.created_at ? new Date(lp.created_at).getTime() : 0,
    });
  }

  // Dedup på position.
  const finalList: Internal[] = [];
  for (const candidate of kept) {
    const dupIdx = finalList.findIndex(
      (existing) =>
        haversineMeters(
          { lat: existing.lat, lng: existing.lng },
          { lat: candidate.lat, lng: candidate.lng },
        ) <= SAME_PLACE_M,
    );
    if (dupIdx === -1) {
      finalList.push(candidate);
    } else {
      finalList[dupIdx] = pickBetter(finalList[dupIdx], candidate);
    }
  }

  return finalList.map(({ _radiusExplicit, _created, ...rest }) => rest);
}
