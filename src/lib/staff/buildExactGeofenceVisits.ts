/**
 * buildExactGeofenceVisits — räknar projektblock från råpings + geofences.
 *
 * Regel (förenklad):
 *  - Första pingen inom ett geofence öppnar ett projektblock.
 *  - Alla efterföljande pings — innanför ELLER utanför geofencen —
 *    räknas till samma projektblock så länge personen inte går in i
 *    ett ANNAT projekts geofence.
 *  - Pings inne i ett annat projekts geofence avslutar nuvarande
 *    block och öppnar ett nytt där.
 *  - När dagen tar slut utan återinträde trimmas trailing-pings som
 *    ligger utanför geofencen bort — blocket stängs vid sista pingen
 *    inne i staketet.
 *
 * Kort sagt: pings utanför geo hanteras EXAKT som om de vore innanför.
 * Inga "Utanför geo"-delblock, inga separata sub-rader.
 */
import type { Ping } from '@/lib/staff/movementDetection';
import { haversineMeters } from '@/lib/staff/movementDetection';
import type { GeofenceSite } from '@/lib/staff/geofencesToFeatures';
import type { PlaceVisit } from '@/lib/staff/pingPlaceSegments';

function pointInPolygon(lng: number, lat: number, polygon: GeoJSON.Polygon): boolean {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function containsPing(site: GeofenceSite, ping: Ping): boolean {
  if (site.polygon) return pointInPolygon(ping.lng, ping.lat, site.polygon);
  const radius = Math.max(10, Number(site.radiusMeters) || 200);
  return haversineMeters({ lat: site.lat, lng: site.lng }, { lat: ping.lat, lng: ping.lng }) <= radius;
}

function resolveFence(ping: Ping, sites: GeofenceSite[]): GeofenceSite | null {
  let best: { site: GeofenceSite; score: number } | null = null;
  for (const site of sites) {
    if (!containsPing(site, ping)) continue;
    const rawDistance = haversineMeters({ lat: site.lat, lng: site.lng }, { lat: ping.lat, lng: ping.lng });
    const score = site.polygon ? rawDistance : rawDistance / Math.max(1, Number(site.radiusMeters) || 1);
    if (!best || score < best.score) best = { site, score };
  }
  return best?.site ?? null;
}

interface OpenVisit {
  site: GeofenceSite;
  pings: Ping[];
  /** Index in `pings` of the LAST ping that was inside the fence. */
  lastInsideIdx: number;
}

export function buildExactGeofenceVisits(rawPings: Ping[], sites: GeofenceSite[]): PlaceVisit[] {
  if (!rawPings.length || !sites.length) return [];

  const sorted = [...rawPings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

  const visits: PlaceVisit[] = [];
  let open: OpenVisit | null = null;

  const flush = (opts: { trimTrailingOutside: boolean }) => {
    if (!open) return;
    let pings = open.pings;
    if (opts.trimTrailingOutside && open.lastInsideIdx >= 0) {
      pings = pings.slice(0, open.lastInsideIdx + 1);
    }
    if (pings.length) {
      const start = pings[0].recorded_at;
      const end = pings[pings.length - 1].recorded_at;
      const durationMin = Math.max(
        0,
        Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000),
      );
      visits.push({
        placeKey: `site:${open.site.id}:${start}`,
        knownSite: { id: open.site.id, name: open.site.name },
        centre: { lat: open.site.lat, lng: open.site.lng },
        start,
        end,
        durationMin,
        pingCount: pings.length,
        pings: [...pings],
        subKind: 'inside',
      });
    }
    open = null;
  };

  for (const ping of sorted) {
    const fence = resolveFence(ping, sites);

    if (!open) {
      if (fence) {
        open = { site: fence, pings: [ping], lastInsideIdx: 0 };
      }
      continue;
    }

    if (fence && fence.id !== open.site.id) {
      // Bytt projekt — stäng nuvarande vid sista inside-pingen och öppna nytt.
      flush({ trimTrailingOutside: true });
      open = { site: fence, pings: [ping], lastInsideIdx: 0 };
      continue;
    }

    // Inne i samma fence ELLER utanför alla — räknas till samma block.
    open.pings.push(ping);
    if (fence && fence.id === open.site.id) {
      open.lastInsideIdx = open.pings.length - 1;
    }
  }

  // Slut på dagen utan återinträde — trimma trailing utanför-pings.
  flush({ trimTrailingOutside: true });
  return visits;
}
