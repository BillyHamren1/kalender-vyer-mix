/**
 * Ren helper för att filtrera och deduplicera projekt-rader innan de blir
 * geofences på GPS-satellitkartan.
 *
 * Regler:
 *  - Cancelled-rader kastas helt (kollar BÅDE `status` OCH `planning_status` —
 *    cancelled kan ligga på vilken som helst).
 *  - Soft-deleted (`deleted_at`) kastas.
 *  - Saknar koordinater → kastas.
 *  - Om `dateStr` är satt: projektet visas ENDAST om dateStr ligger inom
 *    projektets aktiva fönster (rigg → sista nedrigg, inkl. båda ändarna).
 *    Saknar projektet både start och slut → kastas (annars är vi tillbaka
 *    till "alla projekt alla dagar"-buggen).
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
  address_geofence_mode?: string | null;
  address_geofence_polygon?: unknown;
  status?: string | null;
  planning_status?: string | null;
  deleted_at?: string | null;
  created_at?: string | null;
  booking_id?: string | null;
  rigdaydate?: string | null;
  rigdowndate?: string | null;
  eventdate?: string | null;
}

export interface RawLargeProjectRow {
  id: string;
  name: string | null;
  address_latitude: number | string | null;
  address_longitude: number | string | null;
  address_radius_meters: number | string | null;
  address_geofence_mode?: string | null;
  address_geofence_polygon?: unknown;
  deleted_at?: string | null;
  created_at?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  event_date?: string | null;
}

export interface ProjectGeofence {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  /** Om satt: rita polygon istället för cirkel. */
  polygon?: GeoJSON.Polygon;
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

/** Normaliserar 'YYYY-MM-DD' eller ISO-datum → 'YYYY-MM-DD'. Tomt → null. */
function toDayStr(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v);
  // Plocka första 10 tecken om det ser ut som datum/ISO.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Returnerar true om `dateStr` ligger inom [start, end] (inkl.).
 * `starts`/`ends` är prioriterade kandidatlistor — första non-null vinner.
 * Saknas både start och end → false (vi vill inte ha "alltid synlig"-rader).
 */
function isDateInWindow(
  dateStr: string,
  starts: Array<string | null | undefined>,
  ends: Array<string | null | undefined>,
): boolean {
  let start: string | null = null;
  for (const s of starts) {
    const d = toDayStr(s);
    if (d) { start = d; break; }
  }
  let end: string | null = null;
  for (const e of ends) {
    const d = toDayStr(e);
    if (d) { end = d; break; }
  }
  if (!start && !end) return false;
  // Fallback: om bara ena änden saknas, använd den andra för båda.
  if (!start && end) start = end;
  if (!end && start) end = start;
  return dateStr >= (start as string) && dateStr <= (end as string);
}

/**
 * Två punkter inom ~25 m räknas som samma plats (samma adress, ev. olika
 * GPS-noise eller olika tidpunkter på samma kund).
 */
const SAME_PLACE_M = 25;

function pickBetter(a: ProjectGeofence & { _radiusExplicit: boolean; _created: number },
                    b: ProjectGeofence & { _radiusExplicit: boolean; _created: number }): typeof a {
  if (a._radiusExplicit !== b._radiusExplicit) return a._radiusExplicit ? a : b;
  return a._created >= b._created ? a : b;
}

function pickPolygon(raw: unknown): GeoJSON.Polygon | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as any;
  if (p.type !== 'Polygon' || !Array.isArray(p.coordinates) || !Array.isArray(p.coordinates[0]) || p.coordinates[0].length < 4) {
    return undefined;
  }
  return p as GeoJSON.Polygon;
}

export function filterProjectGeofences(
  projects: RawProjectRow[],
  largeProjects: RawLargeProjectRow[] = [],
  dateStr?: string,
): ProjectGeofence[] {
  type Internal = ProjectGeofence & { _radiusExplicit: boolean; _created: number };
  const kept: Internal[] = [];

  for (const p of projects) {
    if (p.deleted_at) continue;
    if (isCancelled(p)) continue;
    const lat = num(p.delivery_latitude);
    const lng = num(p.delivery_longitude);
    if (lat === null || lng === null) continue;
    if (dateStr && !isDateInWindow(
      dateStr,
      [p.rigdaydate, p.eventdate],
      [p.rigdowndate, p.eventdate],
    )) continue;
    const explicit = p.address_radius_meters !== null && p.address_radius_meters !== undefined && p.address_radius_meters !== '';
    const radius = num(p.address_radius_meters) ?? 150;
    const usePolygon = String(p.address_geofence_mode ?? '').toLowerCase() === 'polygon';
    const polygon = usePolygon ? pickPolygon(p.address_geofence_polygon) : undefined;
    kept.push({
      id: `project:${p.id}`,
      name: p.name || 'Projekt',
      lat,
      lng,
      radiusMeters: radius > 0 ? radius : 150,
      polygon,
      _radiusExplicit: explicit,
      _created: p.created_at ? new Date(p.created_at).getTime() : 0,
    });
  }

  for (const lp of largeProjects) {
    if (lp.deleted_at) continue;
    const lat = num(lp.address_latitude);
    const lng = num(lp.address_longitude);
    if (lat === null || lng === null) continue;
    if (dateStr && !isDateInWindow(
      dateStr,
      [lp.start_date, lp.event_date],
      [lp.end_date, lp.event_date],
    )) continue;
    const explicit = lp.address_radius_meters !== null && lp.address_radius_meters !== undefined && lp.address_radius_meters !== '';
    const radius = num(lp.address_radius_meters) ?? 200;
    const usePolygon = String(lp.address_geofence_mode ?? '').toLowerCase() === 'polygon';
    const polygon = usePolygon ? pickPolygon(lp.address_geofence_polygon) : undefined;
    kept.push({
      id: `large:${lp.id}`,
      name: lp.name || 'Stort projekt',
      lat,
      lng,
      radiusMeters: radius > 0 ? radius : 200,
      polygon,
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

